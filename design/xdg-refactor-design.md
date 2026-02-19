# XDG Base Directory Refactoring Design

## Background

AIForge currently stores all application data under `~/.aiforge/` and Unix domain sockets
in `/tmp/`. This causes two problems:

1. **E2E test isolation failure**: The E2E backend server's `cleanupOrphanedSockets()` scans
   all of `/tmp` for socket files, deleting production sockets that belong to the dev server.
   This caused the 2026-02-17 shell death incident (see `design/shell-death-debug.md`).

2. **Non-standard paths**: Using `~/.aiforge/` instead of XDG directories goes against the
   XDG Base Directory Specification, which is the standard on Linux for organizing user data.

## XDG Base Directory Specification

The XDG spec defines these directories:

| Variable | Default | Purpose |
|---|---|---|
| `$XDG_CONFIG_HOME` | `~/.config/` | Configuration files |
| `$XDG_DATA_HOME` | `~/.local/share/` | Persistent application data |
| `$XDG_STATE_HOME` | `~/.local/state/` | State data (logs, history) |
| `$XDG_RUNTIME_DIR` | `/run/user/$UID/` | Runtime files (sockets, PIDs) |
| `$XDG_CACHE_HOME` | `~/.cache/` | Cached data |

## Current State

### Config file
- **Location**: `~/.aiforge/config.json`
- **Set by**: `getConfigFilePath()` in `src/server/config/index.ts:24-26`
- **Not configurable** via environment variable
- **Contains**: port, host, authGuid, scrollbackLines, logLevel, httpsCert, httpsKey, remoteLoggerUrl

### Data directory
- **Location**: `~/.aiforge/data/`
- **Set by**: `getDataDir()` in `src/server/storage/index.ts:45-47`
- **Configurable** via `AIFORGE_DATA_DIR` environment variable
- **Contains**: projects.json, shells.json, sessions.json, workspace-states.json,
  project-urls.json, project-context.json, worktree-metadata.json, worktree-urls.json,
  scrollback/ directory

### Unix domain sockets
- **Location**: `/tmp/ai-ide-pty-{shellId}.sock`
- **Set by**: `getSocketPath()` in `src/server/services/pty/daemon/protocol.ts:43-45`
- **Not configurable** -- hardcoded to `/tmp`
- **Callers**: PtyDaemonManager, PtyDaemonClient, pty-daemon.ts, PtyPool

### Orphan socket cleanup
- **Location**: `PtyDaemonManager.findOrphanedSockets()` lines 440-460
- **Behavior**: Scans all of `/tmp` for `ai-ide-pty-*.sock` files, deletes any not in the
  provided valid shell ID set
- **Bug**: This is the direct cause of the E2E isolation failure -- it scans a global
  directory, not an instance-specific one

## Target State

### XDG directory mapping

| Current | Target | XDG Variable |
|---|---|---|
| `~/.aiforge/config.json` | `$XDG_CONFIG_HOME/aiforge/config.json` | `XDG_CONFIG_HOME` (default: `~/.config/`) |
| `~/.aiforge/data/*.json` | `$XDG_DATA_HOME/aiforge/*.json` | `XDG_DATA_HOME` (default: `~/.local/share/`) |
| `~/.aiforge/data/scrollback/` | `$XDG_DATA_HOME/aiforge/scrollback/` | `XDG_DATA_HOME` |
| `/tmp/ai-ide-pty-*.sock` | `$XDG_DATA_HOME/aiforge/sockets/*.sock` | `XDG_DATA_HOME` |

### Socket path: why under data home, not runtime dir

The XDG spec says `$XDG_RUNTIME_DIR` is for runtime files like sockets, but:

- `$XDG_RUNTIME_DIR` has **no default** when unset (the spec says apps must fall back)
- Many systems (including our dev environment) don't set it
- Contents are cleaned on logout, which could interfere with long-running daemons
- Putting sockets under `$XDG_DATA_HOME/aiforge/sockets/` means they naturally inherit the
  data directory override, giving us E2E isolation for free

### Socket path length constraint

Unix domain socket paths are limited to **107 usable bytes** (the kernel struct
`sockaddr_un.sun_path` is 108 bytes including null terminator). If a socket path
exceeds this, `bind()` fails with EINVAL.

Path length analysis for `$XDG_DATA_HOME/aiforge/sockets/{uuid}.sock`:

| Scenario | Path | Length |
|---|---|---|
| Current (`/tmp`) | `/tmp/ai-ide-pty-c2b68ce2-9bbe-4f4a-be39-b5c88b1d0728.sock` | 57 bytes |
| Typical user | `/home/apowers/.local/share/aiforge/sockets/c2b68ce2-9bbe-4f4a-be39-b5c88b1d0728.sock` | 84 bytes |
| Long username (20 chars) | `/home/some-long-username12/.local/share/aiforge/sockets/c2b68ce2-9bbe-4f4a-be39-b5c88b1d0728.sock` | 97 bytes |
| E2E test path | `/home/apowers/Projects/aiforge/tmp/e2e-data/sockets/c2b68ce2-9bbe-4f4a-be39-b5c88b1d0728.sock` | 93 bytes |

All scenarios fit within the 107-byte limit. To keep margin:
- Drop the `ai-ide-pty-` prefix (the `sockets/` subdirectory provides context)
- Keep the `.sock` extension for clarity

If a path exceeds the limit at startup, the application should detect this early and
fail with a clear error message suggesting the user set `XDG_DATA_HOME` to a shorter path.

## Environment Variable Changes

### New behavior

The existing `AIFORGE_DATA_DIR` override will be **replaced** by standard XDG variables:

| Old | New | Notes |
|---|---|---|
| `AIFORGE_DATA_DIR` | `XDG_DATA_HOME` | Standard XDG; AIForge uses `$XDG_DATA_HOME/aiforge/` |
| (none) | `XDG_CONFIG_HOME` | Standard XDG; AIForge uses `$XDG_CONFIG_HOME/aiforge/` |

For backwards compatibility during transition, `AIFORGE_DATA_DIR` can be kept as a
higher-priority override that sets the data directory directly (bypassing the XDG
`/aiforge/` suffix). This allows existing scripts and CI configs to keep working.

Decision: keep `AIFORGE_DATA_DIR` as an override for now, deprecate later.

## New Path Resolution Module

Create `src/server/paths.ts` (or `src/server/config/paths.ts`) as the single source of
truth for all filesystem paths:

```typescript
// src/server/paths.ts

import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Get the XDG config directory for AIForge.
 * Priority: XDG_CONFIG_HOME/aiforge > ~/.config/aiforge
 */
export function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(xdgConfig, 'aiforge');
}

/**
 * Get the config file path.
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

/**
 * Get the XDG data directory for AIForge.
 * Priority: AIFORGE_DATA_DIR > XDG_DATA_HOME/aiforge > ~/.local/share/aiforge
 */
export function getDataDir(): string {
  if (process.env.AIFORGE_DATA_DIR) {
    return process.env.AIFORGE_DATA_DIR;
  }
  const xdgData = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(xdgData, 'aiforge');
}

/**
 * Get the socket directory for PTY daemon sockets.
 * Lives under the data directory for automatic E2E isolation.
 */
export function getSocketDir(): string {
  return join(getDataDir(), 'sockets');
}

/**
 * Get the socket path for a specific shell.
 * Replaces the old getSocketPath() in protocol.ts.
 */
export function getSocketPath(shellId: string): string {
  return join(getSocketDir(), `${shellId}.sock`);
}
```

## Files to Change

### Core path resolution

| File | Change |
|---|---|
| **NEW** `src/server/paths.ts` | Central path resolution module (see above) |
| `src/server/config/index.ts` | `getConfigFilePath()` calls `getConfigPath()` from paths module |
| `src/server/storage/index.ts` | `getDataDir()` calls `getDataDir()` from paths module; remove local implementation |
| `src/server/services/pty/daemon/protocol.ts` | `getSocketPath()` calls paths module; or re-export from paths module |

### Socket directory creation

| File | Change |
|---|---|
| `src/server/storage/index.ts` | `initStorage()` also creates the `sockets/` subdirectory |
| `src/server/services/pty/PtyDaemonManager.ts` | Ensure socket directory exists before spawning daemon |

### Socket path consumers (import change only)

These files import `getSocketPath` from protocol.ts. After refactoring, they import from
the paths module instead (or protocol.ts re-exports it):

| File | Current import |
|---|---|
| `src/server/services/pty/PtyDaemonClient.ts:11` | `import { getSocketPath } from './daemon/protocol.js'` |
| `src/server/services/pty/PtyDaemonManager.ts:14` | `import { getSocketPath } from './daemon/protocol.js'` |
| `src/server/services/pty/daemon/pty-daemon.ts:23` | `import { getSocketPath } from './protocol.js'` |
| `src/server/services/pty/index.ts:9` | `export { getSocketPath } from './daemon/protocol.js'` |

### Orphan socket cleanup (behavior change)

| File | Change |
|---|---|
| `src/server/services/pty/PtyDaemonManager.ts` | `findOrphanedSockets()` scans `getSocketDir()` instead of `/tmp`; matches `*.sock` instead of `ai-ide-pty-*.sock` |

### Scrollback fallback path

| File | Change |
|---|---|
| `src/server/services/pty/PtyDaemonManager.ts:168` | Change fallback from `/tmp/ai-ide-scrollback` to `join(getDataDir(), 'scrollback')` |

### E2E test isolation

| File | Change |
|---|---|
| `test/e2e/fixtures.ts` | `cleanupDaemonSockets()` scans `DATA_DIR/sockets/` instead of `/tmp`; `resetDataDirectory()` also cleans sockets dir |
| `test/test-isolation.ts` | Set `XDG_DATA_HOME` (or `AIFORGE_DATA_DIR`) instead of just `AIFORGE_DATA_DIR` |
| `playwright.config.ts` | Update env var in webServer command |

### CLI and documentation

| File | Change |
|---|---|
| `bin/aiforge.js` | Update help text for `AIFORGE_DATA_DIR` default path |
| `CLAUDE.md` | Update environment variables section and data directory references |
| `scripts/generate-guid.ts` | Update config file path references |
| `design/shell-death-debug.md` | Update socket path references |

### Tests

| File | Change |
|---|---|
| `test/unit/server/storage/index.test.ts` | Update assertions for new default path (`~/.local/share/aiforge/`) |
| `test/unit/server/config/index.test.ts` | Update assertions for new config path (`~/.config/aiforge/`) |
| `test/unit/server/services/pty/daemon/protocol.test.ts` | Update socket path assertions |
| `test/unit/server/services/pty/PtyDaemonManager.test.ts` | Update socket cleanup assertions |

## Data Migration

### Existing shells cannot be live-migrated

Running PTY daemons have already called `bind()` on their socket path at `/tmp/ai-ide-pty-{id}.sock`.
You cannot move a bound Unix socket -- the daemon process holds the file descriptor. Migration
options:

1. **Kill and restart** (recommended): Kill all current shells, deploy the refactor, let shells
   respawn at the new socket paths. Scrollback data is preserved (stored separately in
   `scrollback/` directory), so terminal history is not lost. Shell state (running processes,
   environment) is lost, which is expected when restarting shells.

2. **Dual-path fallback**: During `attach()`, check the new path first, then fall back to the
   old `/tmp/` path. Existing daemons keep running at old paths; new daemons use new paths.
   Over time, as shells are killed/restarted, all migrate naturally. More complex but zero
   downtime.

Recommendation: **Kill and restart.** There are only a few active shells, and the scrollback
is preserved. The complexity of dual-path fallback isn't worth it for a one-time migration.

### Existing config/data files

The config file at `~/.aiforge/config.json` and data files at `~/.aiforge/data/` need to
be moved to their new XDG locations. Options:

1. **Automatic migration on first startup**: If old paths exist and new paths don't, move
   files automatically and log a message.

2. **Manual migration**: Document the move, let users do it themselves.

3. **Keep old paths as fallback**: Check new paths first, fall back to old paths. This is
   the least disruptive but perpetuates the old layout.

Recommendation: **Automatic migration on first startup.** Add a one-time migration function
that runs during `initStorage()`:

```typescript
async function migrateFromLegacyPaths(): Promise<void> {
  const legacyDataDir = join(homedir(), '.aiforge', 'data');
  const legacyConfigDir = join(homedir(), '.aiforge');
  const newDataDir = getDataDir();
  const newConfigDir = getConfigDir();

  // Migrate data if legacy exists and new doesn't
  if (existsSync(legacyDataDir) && !existsSync(newDataDir)) {
    await rename(legacyDataDir, newDataDir);
    logger.info('Migrated data from ~/.aiforge/data/ to %s', newDataDir);
  }

  // Migrate config if legacy exists and new doesn't
  const legacyConfig = join(legacyConfigDir, 'config.json');
  const newConfig = getConfigPath();
  if (existsSync(legacyConfig) && !existsSync(newConfig)) {
    await mkdir(dirname(newConfig), { recursive: true });
    await rename(legacyConfig, newConfig);
    logger.info('Migrated config from ~/.aiforge/config.json to %s', newConfig);
  }
}
```

## E2E Test Isolation Fix

After this refactor, E2E test isolation "just works":

- E2E sets `AIFORGE_DATA_DIR=./tmp/e2e-data`
- Sockets go to `./tmp/e2e-data/sockets/`
- Dev server sockets go to `~/.local/share/aiforge/sockets/`
- `cleanupOrphanedSockets()` scans `getSocketDir()` (instance-specific), not `/tmp` (global)
- No possibility of cross-instance socket deletion

The `cleanupDaemonSockets()` function in `test/e2e/fixtures.ts` can be simplified to just
clean the test's own socket directory, without needing the `isSocketStale()` connectivity
check (since the directory is guaranteed to only contain test sockets).

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Socket path exceeds 107 bytes | Low (97 bytes worst case) | Validate at startup, fail with clear error |
| NFS home directory (sockets don't work on NFS) | Very low for dev machines | Document; users can set `AIFORGE_DATA_DIR` to a local path |
| Existing `AIFORGE_DATA_DIR` users break | Low | Keep `AIFORGE_DATA_DIR` as highest-priority override |
| Legacy `~/.aiforge/` data left behind | Medium | Auto-migration; could also rmdir legacy dir if empty after migration |
