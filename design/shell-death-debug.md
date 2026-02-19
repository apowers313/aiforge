# Shell Death Debugging Guide

This document captures the investigation process, hypotheses, and fixes for unexpected shell/daemon death issues. Use this as a reference when shells die unexpectedly.

## Quick Start Checklist

When shells die unexpectedly, run these commands immediately to gather state:

```bash
# 1. Check if any daemons are still running
ps aux | grep pty-daemon | grep -v grep

# 2. List existing socket files (XDG path; falls back to AIFORGE_DATA_DIR if set)
ls -la ~/.local/share/aiforge/sockets/*.sock 2>/dev/null

# 3. Check recent daemon logs (if remote logger is configured)
# Use MCP tool: mcp__remote-logger__logs_get_recent

# 4. Check scrollback files for affected shells
ls -la ~/.local/share/aiforge/scrollback/

# 5. Check servherd for any recent server activity
servherd list
servherd logs e2e-backend 2>/dev/null
servherd logs e2e-frontend 2>/dev/null

# 6. Check system memory (rule out OOM)
free -h

# 7. Check for recent E2E test runs (potential culprit)
ps aux | grep playwright
ls -la tmp/e2e-data/ 2>/dev/null
```

## Architecture Overview

Understanding the PTY daemon architecture is critical for debugging:

```
Browser → WebSocket → Server → PtyDaemonManager → Unix Socket → PTY Daemon Process
                                                                      ↓
                                                               node-pty (shell)
```

Key components:
- **PTY Daemon** (`src/server/services/pty/daemon/pty-daemon.ts`): Detached process that survives server restarts
- **Socket files**: `$AIFORGE_DATA_DIR/sockets/${shellId}.sock` (default: `~/.local/share/aiforge/sockets/`) - communication channel between server and daemon
- **Scrollback**: `$AIFORGE_DATA_DIR/scrollback/${shellId}.scrollback` (default: `~/.local/share/aiforge/scrollback/`) - persistent terminal history
- **PtyDaemonManager**: Server-side manager that spawns/attaches to daemons
- **Central path module** (`src/server/paths.ts`): Single source of truth for all filesystem paths (XDG Base Directory compliant)

## Investigation Process

### Step 1: Determine Timeline

Find when the shells died:

```bash
# Check daemon heartbeat logs (daemons log every 5 minutes)
# Look for the last heartbeat before death
# Use remote logger MCP tool or check scrollback modification times

ls -la ~/.local/share/aiforge/scrollback/ --time-style=full-iso | sort -k6,7
```

### Step 2: Correlate with Events

Look for events that coincide with shell death:

1. **E2E test runs** - Check if E2E tests started around the same time
2. **Server restarts** - Check servherd logs
3. **System events** - Check `dmesg` for OOM killer, etc.

```bash
# Check servherd logs for timing
servherd logs aiforge-dev --lines 100

# Check system logs
dmesg | tail -50
journalctl --since "1 hour ago" | grep -i "oom\|killed"
```

### Step 3: Check for Patterns

If multiple daemons died or became unreachable:
- Did they all die at the **exact same time**? --> External cause (pkill, OOM killer)
- Did their **sockets disappear** but daemons kept running? --> Socket cleanup bug (see Feb 17 incident -- now fixed via XDG socket isolation)
- Did they die at **different times**? --> Individual daemon issues

```bash
# Compare socket file deletion times or scrollback modification times
stat ~/.local/share/aiforge/sockets/*.sock 2>/dev/null

# Check if daemons are alive but without sockets (zombie daemons)
ps aux | grep pty-daemon | grep -v grep
ls ~/.local/share/aiforge/sockets/*.sock 2>/dev/null
# If processes exist but sockets are missing, something deleted the sockets
```

## Hypotheses and How to Rule Them Out

### Hypothesis 1: Out of Memory (OOM)

**Symptoms**: All daemons die simultaneously, system was under memory pressure

**How to check**:
```bash
# Check current memory
free -h

# Check for OOM killer activity
dmesg | grep -i "oom\|killed"
journalctl | grep -i "oom"

# Check if Node processes were killed
journalctl | grep node
```

**Ruled out if**: System has plenty of free memory (e.g., 45GB+ free)

### Hypothesis 2: E2E Tests Destroying Production State

**Symptoms**: Daemons become unreachable when E2E tests run. May not die -- daemons can keep running but with their socket files deleted, making them unreachable. Next time the user opens the shell, the server spawns a new daemon and the user sees "--- shell restarted ---".

**How to check**:
```bash
# Check E2E test fixture code for dangerous commands
grep -r "pkill" test/e2e/

# Check if E2E backend server started around death time
servherd logs e2e-backend | head -20

# Check for "Socket file has disappeared" errors correlating with E2E runs
# Search server logs for heartbeat errors and compare timestamps
grep "Socket file has disappeared" ~/.servherd/pm2/logs/servherd-aiforge-server-dev-out.log | head -20

# Check the E2E server's reconciliation loop for socket cleanup
grep "cleanupOrphanedSockets" src/server/services/pty/PtyDaemonManager.ts
grep "cleanupOrphanedSockets" src/server/services/shell/ShellSessionManager.ts
```

**Root cause identified (2026-02-01)**: E2E fixtures contained `pkill -f "pty-daemon"` which killed ALL daemon processes system-wide, including production shells. (Fixed -- replaced with stale socket detection.)

**Root cause identified (2026-02-17)**: E2E backend server's reconciliation loop calls `cleanupOrphanedSockets()` which deletes ALL socket files not in its own shell store. Since the E2E server uses a separate data directory (`tmp/e2e-data/`), its shell store only contains E2E test shells. Production shell sockets were treated as "orphaned" and deleted. See [The 2026-02-17 Incident](#the-2026-02-17-incident) for full details. **Fixed via XDG socket path migration** -- sockets now live under each server's own data directory, so E2E cleanup can never see production sockets.

### Hypothesis 3: Server Disconnect Not Handled

**Symptoms**: Daemons die when server restarts or disconnects

**How to check**:
```bash
# Daemons should survive server disconnects
# Check if socket file still exists after server restart
ls ~/.local/share/aiforge/sockets/*.sock

# If socket exists but daemon is dead, it's a stale socket
# Try to connect to verify:
node -e "require('net').connect(process.env.HOME + '/.local/share/aiforge/sockets/SHELLID.sock').on('error', e => console.log(e.code))"
# ECONNREFUSED = stale socket (daemon dead)
# Connection succeeds = daemon alive
```

### Hypothesis 4: Daemon Process Crash

**Symptoms**: Individual daemon dies, others survive

**How to check**:
```bash
# Check daemon error logs
# Daemons log to remote logger if configured

# Check for core dumps
ls /var/crash/ 2>/dev/null
```

### Hypothesis 5: Broken Stdout/Stderr Pipe (Server Restart)

**Symptoms**: Daemons die whenever the server restarts (tsx watch, manual restart, etc.). `exitCode: -1` in server logs immediately after `[DAEMON_ATTACH] Successfully connected`. May see rapid repeated restarts if files are being edited quickly.

**How to check**:
```bash
# Look for exitCode: -1 immediately after DAEMON_ATTACH in server logs
servherd logs aiforge-server-dev | grep -A1 "DAEMON_ATTACH"

# Check if daemons have process.stdout error handlers
grep "process.stdout.on" src/server/services/pty/daemon/pty-daemon.ts
# Should find: process.stdout.on('error', ...)

# Check if daemons are spawned with piped stdio
grep "stdio:" src/server/services/pty/PtyDaemonManager.ts
# Will show: stdio: ['ignore', 'pipe', 'pipe']
```

**Root cause identified (2026-02-18)**: Daemon's stdout/stderr are pipes to the server. When the server exits, the pipes break. The daemon's next `console.log()` causes EPIPE on `process.stdout`, which becomes an uncaughtException, triggering daemon shutdown. Fixed by adding error handlers on `process.stdout` and `process.stderr` in the daemon. See [The 2026-02-18 Incident](#the-2026-02-18-incident).

**Ruled out if**: Daemon has `process.stdout.on('error', ...)` handler (fix applied) AND server logs show proper `[DAEMON_ATTACH]` without immediate `exitCode: -1`.

### Hypothesis 6: Manual Kill

**Symptoms**: Specific daemons killed, not all

**How to check**:
```bash
# Check bash history
history | grep -i "kill\|pkill"

# Check if any scripts ran that might kill processes
```

## The 2026-02-01 Incident

### Timeline
- All 9 daemon processes died simultaneously at 2026-02-01T13:48:50
- E2E backend server started at 2026-02-01T13:48:51

### Root Cause
The E2E test fixtures in `test/e2e/fixtures.ts` contained:
```typescript
// DANGEROUS - This kills ALL daemons system-wide!
execSync('pkill -f "pty-daemon" 2>/dev/null || true', { encoding: 'utf-8' });
```

This was intended to clean up test daemons but killed production daemons too.

### Fix Applied
Replaced `pkill` with safe stale socket detection:

```typescript
/**
 * Check if a socket is stale (no process listening).
 * Returns true if the socket file exists but no daemon is listening.
 */
async function isSocketStale(socketPath: string): Promise<boolean> {
  const net = await import('node:net');

  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection(socketPath);
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(true); // Timeout = likely stale
    }, 100);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(false); // Connected = daemon is alive, don't delete
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      socket.destroy();
      // ECONNREFUSED or ENOENT means no daemon listening = stale
      resolve(err.code === 'ECONNREFUSED' || err.code === 'ENOENT');
    });
  });
}
```

Key principle: **Only remove socket files where no daemon is listening**. Never use `pkill` or similar commands that affect processes system-wide.

## Expected Log Messages

### Daemon Lifecycle Messages (via Remote Logger)

These messages are logged by the PTY daemon process. Look for the pattern `[PTY_DAEMON:XXXXXXXX]` where `XXXXXXXX` is the first 8 characters of the shellId.

**Startup sequence** (in order):
```
[PTY_DAEMON:abc12345] [INFO] Daemon starting
[PTY_DAEMON:abc12345] [DEBUG] Cleaning up any stale socket from previous run
[PTY_DAEMON:abc12345] [DEBUG] Spawning PTY process
[PTY_DAEMON:abc12345] [INFO] PTY process spawned {ptyPid: 12345}
[PTY_DAEMON:abc12345] [INFO] Socket server listening {socketPath: "~/.local/share/aiforge/sockets/..."}
```

**Heartbeat** (every 5 minutes while alive):
```
[PTY_DAEMON:abc12345] [INFO] [HEARTBEAT] Daemon alive {
  pid: 12345,
  ppid: 1,
  uptime: "2h 30m",
  uptimeMs: 9000000,
  ptyPid: 12346,
  clientCount: 1,
  socketExists: true,
  memoryMB: {rss: 45, heapUsed: 20, heapTotal: 35, external: 2}
}
```

**Client connections**:
```
[PTY_DAEMON:abc12345] [DEBUG] Client connected {clientCount: 1}
[PTY_DAEMON:abc12345] [DEBUG] Client disconnected {clientCount: 0}
```

**Shutdown sequence** (normal termination):
```
[PTY_DAEMON:abc12345] [INFO] Received SIGTERM signal
[PTY_DAEMON:abc12345] [INFO] Starting graceful shutdown {reason: "SIGTERM", ...}
[PTY_DAEMON:abc12345] [DEBUG] All client connections closed
[PTY_DAEMON:abc12345] [DEBUG] Killing PTY process
[PTY_DAEMON:abc12345] [INFO] Removing socket file
[PTY_DAEMON:abc12345] [INFO] Shutdown complete, exiting {exitCode: 0}
```

**Error conditions to watch for**:
```
[PTY_DAEMON:abc12345] [ERROR] [HEARTBEAT] Socket file has disappeared while daemon is running!
[PTY_DAEMON:abc12345] [ERROR] Uncaught exception {error: "...", stack: "..."}
[PTY_DAEMON:abc12345] [ERROR] Unhandled promise rejection {reason: "..."}
[PTY_DAEMON:abc12345] [ERROR] Failed to spawn PTY {error: "..."}
```

### Server-Side Messages (PtyDaemonManager)

These messages appear in server logs (pino format). Look for tags like `[DAEMON_SPAWN]`, `[DAEMON_ATTACH]`, `[DAEMON_KILL]`.

**Spawn process**:
```json
{"level":"debug","shellId":"abc...","msg":"[DAEMON_SPAWN] Starting spawn process"}
{"level":"debug","shellId":"abc...","msg":"[DAEMON_SPAWN] Socket file does not exist"}
{"level":"info","shellId":"abc...","msg":"[DAEMON_SPAWN] No existing socket, spawning new daemon"}
{"level":"debug","shellId":"abc...","pid":12345,"msg":"[DAEMON_SPAWN] Daemon process spawned"}
{"level":"debug","shellId":"abc...","msg":"[DAEMON_SPAWN] Daemon signaled ready"}
{"level":"info","shellId":"abc...","pid":12345,"msg":"[DAEMON_SPAWN] Daemon spawn complete, session active"}
```

**Attach process** (reconnecting to existing daemon):
```json
{"level":"debug","shellId":"abc...","msg":"[DAEMON_ATTACH] Starting attach process"}
{"level":"debug","shellId":"abc...","msg":"[DAEMON_ATTACH] Socket verified, creating client and connecting"}
{"level":"info","shellId":"abc...","msg":"[DAEMON_ATTACH] Successfully connected to daemon"}
```

**Stale socket detection** (important for debugging):
```json
{"level":"warn","shellId":"abc...","msg":"[DAEMON_SPAWN] Socket exists but connection failed (ECONNREFUSED) - daemon is dead, cleaning up stale socket"}
{"level":"debug","shellId":"abc...","msg":"[DAEMON_SPAWN] Removed stale socket file"}
```

**Kill process**:
```json
{"level":"info","shellId":"abc...","msg":"[DAEMON_KILL] Killing session"}
{"level":"debug","shellId":"abc...","msg":"[DAEMON_KILL] Session found in memory, sending kill signal"}
{"level":"debug","shellId":"abc...","msg":"[DAEMON_KILL] Socket file removed"}
```

### Interpreting Missing Logs

| Scenario | What it means |
|----------|---------------|
| No heartbeat for >5 minutes | Daemon died or remote logger disconnected |
| Last log is `SIGTERM` | Normal shutdown (server requested kill) |
| Last log is `SIGKILL` or nothing | Killed externally (pkill, OOM, etc.) |
| `Socket file has disappeared` | Something deleted socket while daemon was alive -- check E2E test timing |
| No shutdown logs after heartbeat | Process killed without graceful shutdown |
| `exitCode: -1` immediately after `DAEMON_ATTACH` | Daemon dying from broken pipe (EPIPE on stdout/stderr) -- see Hypothesis 5 |

### How to Query Logs

```bash
# Using remote logger MCP tools:
# Get recent logs (all levels)
mcp__remote-logger__logs_get_recent count=100

# Search for specific daemon
mcp__remote-logger__logs_search query="PTY_DAEMON:abc12345"

# Get errors only
mcp__remote-logger__logs_get_errors

# Search for heartbeats to find last-alive time
mcp__remote-logger__logs_search query="HEARTBEAT"

# Search for death-related events
mcp__remote-logger__logs_search query="SIGTERM|SIGKILL|shutdown|exiting"
```

## Debugging Tools and Locations

### Log Sources

| Source | Location | What it shows |
|--------|----------|---------------|
| Remote Logger | MCP `logs_get_recent` | Daemon heartbeats, spawn events, errors |
| Scrollback files | `~/.local/share/aiforge/scrollback/` | Last terminal output, modification time |
| Socket files | `~/.local/share/aiforge/sockets/*.sock` | Which daemons should be running |
| Servherd logs | `servherd logs <name>` | Server startup/shutdown events |
| System logs | `dmesg`, `journalctl` | OOM killer, system events |

### Key Files

| File | Purpose |
|------|---------|
| `src/server/paths.ts` | Central path resolution (XDG-compliant): `getSocketPath()`, `getSocketDir()`, etc. |
| `src/server/services/pty/daemon/pty-daemon.ts` | Daemon process code |
| `src/server/services/pty/daemon/protocol.ts` | Re-exports `getSocketPath` from `paths.ts` |
| `src/server/services/pty/PtyDaemonManager.ts` | Server-side daemon management, `cleanupOrphanedSockets()` |
| `src/server/services/shell/ShellSessionManager.ts` | Reconciliation loop that calls `cleanupOrphanedSockets()` |
| `test/e2e/fixtures.ts` | E2E test setup, `cleanupDaemonSockets()` |

### Useful Commands

```bash
# Find all daemon-related processes
ps aux | grep -E "pty-daemon|node.*daemon" | grep -v grep

# Check socket connectivity (default XDG path)
SOCK_DIR="${AIFORGE_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/aiforge}/sockets"
for sock in "$SOCK_DIR"/*.sock; do
  [ -e "$sock" ] || continue
  echo -n "$sock: "
  timeout 1 bash -c "echo '' | nc -U '$sock'" 2>/dev/null && echo "alive" || echo "dead/stale"
done

# Monitor daemon spawns in real-time
# (requires remote logger)
watch -n 1 'curl -s localhost:9080/api/logs | jq ".[] | select(.msg | contains(\"DAEMON\"))"'

# Find orphaned sockets (socket exists but no daemon)
for sock in "$SOCK_DIR"/*.sock; do
  [ -e "$sock" ] || continue
  shellId=$(basename "$sock" .sock)
  if ! ps aux | grep -q "$shellId"; then
    echo "Orphaned: $sock"
  fi
done
```

## The 2026-02-17 Incident

### Symptoms
- Shell "bash-4" (`c2b68ce2`) showed "--- shell restarted 2/18/2026, 7:49:47 AM ---"
- The daemon process was still alive, but its socket file had been deleted
- Multiple daemons affected -- all production sockets deleted simultaneously

### Timeline (Feb 17, all times Pacific)

| Time | Event |
|------|-------|
| 12:58:20 PM | Dev server spawns daemon for `cdd83402` (ai-3) |
| ~12:59:00 PM | E2E fixture worker starts, runs `cleanupDaemonSockets()` |
| 12:59:18 PM | E2E backend instance 1 starts (PID 4126475), shuts down 9s later |
| 12:59:59 PM | `f3402554` daemon detects socket gone (first heartbeat error) |
| 13:04:27 PM | E2E backend instance 3 starts (PID 4133357) with 30s reconciliation loop |
| 13:04:52 PM | Dev server spawns daemon for `c2b68ce2` (bash-4) |
| **~13:04:57 PM** | **E2E reconciliation fires `cleanupOrphanedSockets()` -- deletes all production sockets** |
| 13:05:01 PM | E2E backend instance 3 shuts down |
| 13:08:20 PM | `cdd83402` daemon detects socket gone (2nd heartbeat, 10 min) |
| 13:09:52 PM | `c2b68ce2` (bash-4) daemon detects socket gone (1st heartbeat, 5 min) |
| 10:19:34 PM | tsx detects code change, dev server restarts; crashes on missing `envUtils.js` |
| 10:22:01 PM | Dev server restarts successfully, reconnects to 0 daemons (all sockets gone) |

| Time (Feb 18) | Event |
|------|-------|
| 7:49:47 AM | User opens bash-4, server sees "No existing socket", spawns NEW daemon |
| | User sees "--- shell restarted 2/18/2026, 7:49:47 AM ---" |

### Root Cause

The E2E backend server runs the exact same server code as the dev server, including the reconciliation loop. The reconciliation loop calls `cleanupOrphanedSockets()` in `PtyDaemonManager.ts`:

```typescript
// ShellSessionManager.ts:301-304 (reconciliation loop, runs every 30s)
const validShellIds = shells.map((s) => s.id);  // from THIS server's shell store
await this._ptyPool.daemonManager.cleanupOrphanedSockets(validShellIds);
```

```typescript
// PtyDaemonManager.ts:440-460 (the dangerous function)
async findOrphanedSockets(validShellIds: string[]): Promise<string[]> {
    const orphans: string[] = [];
    const validSet = new Set(validShellIds);
    const tmpFiles = await readdir('/tmp');
    for (const file of tmpFiles) {
        if (file.startsWith('ai-ide-pty-') && file.endsWith('.sock')) {
            const shellId = file.replace('ai-ide-pty-', '').replace('.sock', '');
            if (!validSet.has(shellId)) {
                orphans.push(join('/tmp', file));  // <-- production sockets flagged here
            }
        }
    }
    return orphans;
}

async cleanupOrphanedSockets(validShellIds: string[]): Promise<void> {
    const orphans = await this.findOrphanedSockets(validShellIds);
    await Promise.all(orphans.map(async (socketPath) => {
        await unlink(socketPath);  // <-- blindly deletes, no connectivity check!
    }));
}
```

The problem: `cleanupOrphanedSockets()` determines "orphaned" purely by shell ID membership. It does **not** check whether a daemon is actually listening on the socket. When the E2E backend runs this, `validShellIds` comes from the E2E shell store (`tmp/e2e-data/`), which only contains E2E test shells. Every production socket is treated as "orphaned" and deleted.

This is different from the E2E fixture's `cleanupDaemonSockets()` which at least checks socket connectivity before deleting. The reconciliation loop's `cleanupOrphanedSockets()` skips this check entirely.

### How It Differs from the Feb 1 Incident

Same class of bug (E2E tests destroying production state) but different mechanism:

| | Feb 1 Incident | Feb 17 Incident |
|---|---|---|
| **Mechanism** | `pkill -f "pty-daemon"` | `cleanupOrphanedSockets()` via reconciliation loop |
| **What dies** | Daemon processes killed | Socket files deleted (daemons survive but are unreachable) |
| **User impact** | Immediate shell death | Shell appears dead on next open ("shell restarted") |
| **Location** | `test/e2e/fixtures.ts` | `src/server/services/pty/PtyDaemonManager.ts:465` called from `src/server/services/shell/ShellSessionManager.ts:304` |

### Fix Applied: XDG Socket Path Migration (Phase 3)

**Fixed.** The root cause -- a shared `/tmp` socket namespace -- was eliminated by moving sockets into each server instance's own data directory.

#### What Changed

Before the fix, all AIForge instances (dev, E2E, etc.) stored sockets in a shared flat namespace:
```
/tmp/ai-ide-pty-{shellId}.sock     # ALL instances wrote here
```

After the fix, sockets live under each instance's `AIFORGE_DATA_DIR`:
```
~/.local/share/aiforge/sockets/{shellId}.sock   # Dev server (default XDG path)
/tmp/e2e-data-XXXXX/sockets/{shellId}.sock      # E2E test (isolated temp dir)
```

The key changes:

1. **`src/server/paths.ts`** (new central path module): `getSocketPath(shellId)` now returns `${getDataDir()}/sockets/${shellId}.sock` instead of `/tmp/ai-ide-pty-${shellId}.sock`. The `ai-ide-pty-` prefix is gone.

2. **`src/server/services/pty/daemon/protocol.ts`**: The local `getSocketPath()` was replaced with a re-export from `paths.ts`, so all consumers (PtyDaemonClient, PtyDaemonManager, pty-daemon) get the new paths without changing their imports.

3. **`src/server/services/pty/PtyDaemonManager.ts`**: `findOrphanedSockets()` now scans `getSocketDir()` (the instance's own `sockets/` subdirectory) instead of `/tmp`. It matches `*.sock` files without requiring an `ai-ide-pty-` prefix.

4. **`src/server/index.ts`**: Startup validation calls `validateSocketPathLength()` with a sample UUID to fail fast if the XDG data path would produce socket paths exceeding the 107-byte Unix domain socket limit.

#### Why This Eliminates the Problem

The reconciliation loop in `ShellSessionManager` calls `cleanupOrphanedSockets()`, which calls `findOrphanedSockets()`. Previously this scanned `/tmp` for all `ai-ide-pty-*.sock` files -- a global namespace shared by every AIForge instance on the system. Now it scans only `getSocketDir()`, which resolves to a directory under the current instance's `AIFORGE_DATA_DIR`.

Since E2E tests already set `AIFORGE_DATA_DIR` to an isolated temp directory (e.g., `/tmp/e2e-data-XXXXX`), the E2E server's socket directory is `tmp/e2e-data-XXXXX/sockets/`. When the E2E reconciliation loop runs `cleanupOrphanedSockets()`, it only sees sockets inside that directory -- it physically cannot see or delete production sockets because they live in a completely separate directory tree (`~/.local/share/aiforge/sockets/`).

This is the "Option 1: Namespaced socket paths" approach from the original proposal, implemented via the XDG Base Directory refactoring. It is the most robust fix because:
- No connectivity checks needed -- the directory boundary provides hard isolation
- No special E2E mode flags needed -- isolation is automatic via `AIFORGE_DATA_DIR`
- Multiple dev servers with different data dirs are also isolated from each other
- The fix works even if `cleanupOrphanedSockets()` blindly deletes everything in its socket dir

## The 2026-02-18 Incident

### Symptoms
- Shell `aa20ae92` showed 4 rapid "--- shell restarted ---" messages between 5:39:34 PM and 5:40:40 PM
- Another Claude Code session was editing files (`ProjectService.ts`, `migration.ts`, `index.ts`), triggering `tsx watch` restarts
- Each server restart killed the daemon and spawned a new one, causing the user's shell to reset

### Timeline (Feb 18, all times Pacific)

| Time | Event |
|------|-------|
| 5:39:28 PM | tsx detects change in `ProjectService.ts`, sends SIGTERM to server |
| 5:39:29 PM | Server begins graceful shutdown, calls `disconnectAll()` on daemon clients |
| 5:39:32 PM | tsx force-kills server ("Process hasn't exited. Killing process...") |
| 5:39:32 PM | New server starts, attaches to both daemons -- **immediately** gets `exitCode: -1` for both |
| 5:39:34 PM | Server spawns new daemon for `aa20ae92` -- **first "shell restarted"** |
| 5:39:36 PM | tsx detects another change in `ProjectService.ts`, restarts again |
| 5:39:38 PM | New server attaches to daemon -- immediately gets `exitCode: -1` |
| 5:39:39 PM | Server spawns new daemon -- **second "shell restarted"** |
| 5:39:48 PM | tsx detects change in `migration.ts`, restarts |
| 5:39:53 PM | tsx force-kills server again (5s timeout) |
| 5:39:54 PM | New server attaches -- immediately `exitCode: -1` |
| 5:39:55 PM | New daemon spawned -- **third "shell restarted"** |
| 5:40:14 PM | tsx detects change in `migration.ts`, restarts |
| 5:40:19 PM | tsx force-kills server |
| 5:40:21-37 PM | Three more rapid restarts (`index.ts` changes), no daemons survive |
| 5:40:40 PM | New daemon spawned -- **fourth "shell restarted"** |

### Root Cause

The daemon process is spawned with `stdio: ['ignore', 'pipe', 'pipe']` so the server can read the "PTY daemon ready:" signal from stdout. These stdout/stderr pipes persist for the daemon's entire lifetime, connected back to the server process.

When the server exits (clean shutdown or SIGKILL from `tsx watch`):

1. The OS closes the server's end of the stdout/stderr pipes
2. The daemon's client socket `close` handler fires (the old server disconnected)
3. The handler calls `log('DEBUG', 'Client disconnected', ...)` (`pty-daemon.ts:336`)
4. `log()` calls `console.log()`, which writes to the now-broken stdout pipe
5. The write produces an EPIPE error on `process.stdout`
6. Since there was no `'error'` event handler on `process.stdout`, Node.js promoted this to an **uncaughtException**
7. The `uncaughtException` handler called `shutdown()`, which:
   - Destroyed all client connections **without sending an exit message** (the exit message is only sent on PTY exit, not on daemon shutdown from exceptions)
   - Killed the PTY process
   - Removed the socket file
   - Exited the daemon process
8. The new server either found no socket ("No existing socket, spawning new daemon") or connected just before the daemon died and saw the socket close (`exitCode: -1`)

The `exitCode: -1` is the key diagnostic: it comes from `PtyDaemonClient.ts:101`, emitted when the socket closes **without** the daemon having sent an explicit exit message. This distinguishes it from a normal PTY exit (which sends a proper exit code via the protocol).

### How It Differs from Previous Incidents

| | Feb 1 | Feb 17 | Feb 18 |
|---|---|---|---|
| **Mechanism** | `pkill -f "pty-daemon"` | `cleanupOrphanedSockets()` deletes sockets | Broken stdout pipe causes uncaughtException |
| **Trigger** | E2E test fixture | E2E reconciliation loop | Any `tsx watch` restart (file save) |
| **What dies** | Daemon processes | Socket files (daemons survive but unreachable) | Daemon processes (EPIPE -> uncaughtException -> shutdown) |
| **Frequency** | Only during E2E runs | Only during E2E runs | **Every server restart** -- most common cause |
| **User impact** | Immediate shell death | Shell appears dead on next open | Immediate shell death on any file save during dev |

### Fix Applied: Broken Pipe Error Handlers

Added `process.stdout` and `process.stderr` error handlers in `pty-daemon.ts` to silently ignore EPIPE errors:

```typescript
// In main(), before signal handlers:
process.stdout.on('error', () => { /* ignore EPIPE from broken pipe */ });
process.stderr.on('error', () => { /* ignore EPIPE from broken pipe */ });
```

After startup, the daemon's stdout/stderr pipes serve no useful purpose -- the "PTY daemon ready:" signal has already been read, and all runtime logging goes through the remote logger (HTTP). Broken pipes are harmless and should not crash the daemon.

The existing SIGPIPE signal handler (`process.on('SIGPIPE', ...)`) catches the signal but does NOT prevent the EPIPE error on the stream. Both handlers are needed: SIGPIPE prevents signal-based termination, and the stream error handler prevents the error from becoming an uncaughtException.

### Regression Test

Added to `test/integration/pty/PtyDaemonReconnect.live.test.ts` in the `broken pipe survival` describe block:

1. Spawns a daemon with piped stdout/stderr (same as production)
2. Waits for the "ready" signal
3. Destroys the stdout/stderr pipes (simulating server exit)
4. Waits for the broken pipe to propagate
5. Connects to the daemon socket and verifies it is still alive
6. Sends a command and confirms the daemon responds with output

## Prevention Checklist

When writing code that interacts with daemons:

- [ ] **Never use `pkill` or `killall`** - These affect all matching processes system-wide
- [ ] **Never use process name patterns** - Multiple users/environments may have matching processes
- [ ] **Use socket connectivity checks** - Verify daemon is listening before assuming it's alive
- [ ] **Use specific shell IDs** - Only operate on daemons you explicitly manage
- [ ] **E2E tests must be isolated** - Use separate `AIFORGE_DATA_DIR` values; sockets are automatically namespaced under each data dir
- [ ] **Always use `getSocketPath()` / `getSocketDir()` from `paths.ts`** - Never hardcode socket paths or scan `/tmp` directly
- [ ] **Cleanup functions must scope to their own directory** - `findOrphanedSockets` scans only `getSocketDir()`, never a shared namespace
- [ ] **Daemon stdio must handle broken pipes** - `process.stdout.on('error', ...)` and `process.stderr.on('error', ...)` are required to prevent EPIPE from crashing the daemon when the parent server exits
- [ ] **SIGPIPE alone is not sufficient** - The signal handler prevents signal-based termination, but the stream error handler is also needed to prevent EPIPE from becoming an uncaughtException

## Related Documentation

- PTY Daemon Architecture: See `src/server/services/pty/daemon/`
- E2E Test Isolation: See `test/e2e/fixtures.ts` comments
- Integration Tests: See `test/integration/pty/PtyDaemonReconnect.live.test.ts`
