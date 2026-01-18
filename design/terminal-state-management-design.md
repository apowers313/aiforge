# Terminal State Management Design

## Executive Summary

This document proposes a redesign of AIForge's terminal state management system to address reliability issues discovered during debugging. The current architecture has multiple sources of truth that can become inconsistent, leading to terminals that fail to display content after server restarts or browser refreshes.

## Problem Statement

### Symptoms Observed

1. **Empty terminals on shell switching**: When switching to bash-2 or bash-3, terminals displayed nothing even though scrollback data existed on disk
2. **Race conditions**: ATTACH messages arriving before daemon spawn completes result in "shell not found" errors
3. **Inconsistent state after server restart**: Shells marked as "active" in the database but PTY sessions not in memory

### Root Causes

1. **Multiple sources of truth**: State is tracked in 5+ places that can diverge
2. **No reconciliation mechanism**: No way to detect or correct inconsistencies
3. **Optimistic assumptions**: Code assumes if one system says shell is "active", all systems are ready
4. **Fire-and-forget patterns**: Async operations (like startShell) complete without client confirmation

## Current Architecture

### Data Stores

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SERVER SIDE                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │   ShellStore     │    │    PtyPool       │    │ ScrollbackStore  │  │
│  │ (~/.aiforge/     │    │   (in-memory)    │    │ (~/.aiforge/     │  │
│  │  shells.json)    │    │                  │    │  scrollback/)    │  │
│  │                  │    │                  │    │                  │  │
│  │ - id            │    │ - PtySessions    │    │ - Memory buffer  │  │
│  │ - projectId     │    │ - onData hooks   │    │ - JSONL on disk  │  │
│  │ - name          │    │ - onExit hooks   │    │ - 10k lines max  │  │
│  │ - status        │    │                  │    │                  │  │
│  │ - pid           │    │                  │    │                  │  │
│  │ - socketPath    │    │                  │    │                  │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
│           │                       │                       │              │
│           │              ┌────────┴────────┐              │              │
│           │              │                 │              │              │
│           ▼              ▼                 ▼              │              │
│  ┌──────────────────────────────────────────┐            │              │
│  │           PtyDaemonManager               │◄───────────┘              │
│  │                                          │                           │
│  │ - Spawns daemon processes                │                           │
│  │ - Reconnects to existing daemons         │                           │
│  │ - Manages Unix domain sockets            │                           │
│  └──────────────────────────────────────────┘                           │
│                          │                                               │
└──────────────────────────┼───────────────────────────────────────────────┘
                           │
                    WebSocket Connection
                           │
┌──────────────────────────┼───────────────────────────────────────────────┐
│                          ▼                              CLIENT SIDE      │
│  ┌──────────────────────────────────────────┐                           │
│  │           React Query Cache              │                           │
│  │                                          │                           │
│  │ - shells.byProject                       │                           │
│  │ - projects.all                           │                           │
│  └──────────────────────────────────────────┘                           │
│                          │                                               │
│                          ▼                                               │
│  ┌──────────────────────────────────────────┐                           │
│  │           Zustand UI Store               │                           │
│  │                                          │                           │
│  │ - activeShellId                          │                           │
│  │ - terminalFontSize                       │                           │
│  │ - terminalTheme                          │                           │
│  └──────────────────────────────────────────┘                           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Current Data Flow: Attaching to Shell

```
┌─────────┐      ┌─────────────┐      ┌───────────────┐      ┌─────────────┐
│ Browser │      │  Terminal   │      │   useTerminal │      │  WebSocket  │
│  Click  │─────▶│  Component  │─────▶│     Hook      │─────▶│   Server    │
└─────────┘      └─────────────┘      └───────────────┘      └─────────────┘
                        │                     │                      │
                        │                     │                      │
                        ▼                     │                      │
               ┌─────────────────┐           │                      │
               │ startShellMutation │        │                      │
               │ (REST API call) │           │                      │
               └─────────────────┘           │                      │
                        │                     │                      │
                        ▼                     ▼                      ▼
               ┌─────────────────┐   ┌─────────────┐        ┌─────────────┐
               │  ShellService   │   │   ATTACH    │        │  Terminal   │
               │    .start()     │   │   Message   │        │   Handler   │
               └─────────────────┘   └─────────────┘        └─────────────┘
                        │                     │                      │
                        │                     └──────────────────────┤
                        ▼                                            │
               ┌─────────────────┐                                   │
               │ PtyDaemonManager│                                   │
               │   .spawn()      │                                   │
               └─────────────────┘                                   │
                        │                                            │
                        ▼                                            ▼
               ┌─────────────────┐                          ┌─────────────┐
               │    PtyPool      │◄─────────────────────────│ attachClient│
               │    .add()       │                          │    (async)  │
               └─────────────────┘                          └─────────────┘
```

### Identified Synchronization Points

| Location | What Can Go Wrong |
|----------|-------------------|
| ShellStore vs PtyPool | Shell "active" in DB but no PTY in memory after restart |
| PtyPool vs Daemon | Daemon died but PTY session still in pool |
| ScrollbackStore memory vs disk | Memory cleared on restart, disk has data |
| React Query vs Server | Cache shows shell active, server hasn't spawned yet |
| WebSocket ATTACH vs startShell | ATTACH arrives before daemon spawn completes |

### Bug That Was Fixed (Reference)

**File**: `src/server/websocket/handlers/terminal.ts`

The `_replayScrollback` method only checked memory, not disk:

```typescript
// BEFORE (broken)
private _replayScrollback(ws: WebSocketLike, shellId: string): void {
  const scrollbackStore = this._ptyPool.scrollbackStore;
  if (!scrollbackStore) return;

  const entries = scrollbackStore.getFromMemory(shellId); // Only memory!
  // If empty, gives up - doesn't check disk
}

// AFTER (fixed)
private async _replayScrollback(ws: WebSocketLike, shellId: string): Promise<void> {
  const scrollbackStore = this._ptyPool.scrollbackStore;
  if (!scrollbackStore) return;

  let entries = scrollbackStore.getFromMemory(shellId);
  if (entries.length === 0) {
    // Memory buffer is empty, try loading from disk (handles server restart case)
    entries = await scrollbackStore.load(shellId);
  }
  // ... send scrollback
}
```

**File**: `src/client/components/terminal/Terminal.tsx`

The component skipped `startShell` if shell was already "active":

```typescript
// BEFORE (broken)
useEffect(() => {
  if (!shell || shell.status === 'active' || hasStartedRef.current) {
    return; // Skipped if already active!
  }
  startShellMutation.mutate(shellId);
}, [shell, shellId, startShellMutation]);

// AFTER (fixed) - Always call start, server handles idempotency
useEffect(() => {
  if (!shell || hasStartedRef.current || startShellMutation.isPending) {
    return;
  }
  // Always start/reconnect - server may have restarted and lost PTY
  hasStartedRef.current = true;
  startShellMutation.mutate(shellId);
}, [shell, shellId, startShellMutation]);
```

## Proposed Architecture

### Design Principles

1. **Single source of truth**: The daemon process IS the shell. Everything else is derived state.
2. **Reconciliation over correctness**: Accept that state can diverge; continuously reconcile.
3. **Atomic session lifecycle**: Opening a session is one atomic operation that either succeeds or fails.
4. **Client state machine**: Clear states with defined transitions, no undefined behavior.

### New Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SERVER SIDE                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     ShellSessionManager                             │ │
│  │  (Single orchestrator for all shell state)                         │ │
│  │                                                                     │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │ │
│  │  │ ShellStore  │  │  PtyPool    │  │ Scrollback  │                │ │
│  │  │ (metadata)  │  │ (sessions)  │  │   Store     │                │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │ │
│  │                                                                     │ │
│  │  Methods:                                                           │ │
│  │  - openSession(shellId): Promise<SessionState>                     │ │
│  │  - closeSession(shellId): Promise<void>                            │ │
│  │  - getSessionState(shellId): SessionState                          │ │
│  │  - reconcile(): Promise<void>  // Periodic health check            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                          │                                               │
│                          │ Events: session.opened, session.closed,       │
│                          │         session.error, session.output         │
│                          ▼                                               │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     TerminalHandler                                 │ │
│  │  (WebSocket protocol only - no business logic)                     │ │
│  │                                                                     │ │
│  │  Client messages:     Server messages:                              │ │
│  │  - session.open       - session.opened (with scrollback)           │ │
│  │  - session.close      - session.closed                             │ │
│  │  - session.input      - session.error                              │ │
│  │  - session.resize     - session.output                             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                           │
                    WebSocket Connection
                           │
┌──────────────────────────┼───────────────────────────────────────────────┐
│                          ▼                              CLIENT SIDE      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     useTerminalSession Hook                         │ │
│  │                                                                     │ │
│  │  State Machine:                                                     │ │
│  │  ┌─────────┐    ┌──────────┐    ┌────────┐    ┌───────┐           │ │
│  │  │ CLOSED  │───▶│ OPENING  │───▶│  OPEN  │───▶│CLOSING│           │ │
│  │  └─────────┘    └──────────┘    └────────┘    └───────┘           │ │
│  │       ▲              │              │              │               │ │
│  │       │              ▼              ▼              │               │ │
│  │       │         ┌────────┐    ┌──────────┐        │               │ │
│  │       └─────────│ ERROR  │◀───│RECONNECT │◀───────┘               │ │
│  │                 └────────┘    └──────────┘                         │ │
│  │                                                                     │ │
│  │  Returns: { state, scrollback, open(), close(), write(), resize() }│ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### New WebSocket Protocol

#### Client → Server Messages

```typescript
// Request to open a session (replaces both startShell REST + ATTACH WebSocket)
interface SessionOpenMessage {
  type: 'session.open';
  shellId: string;
  requestId: string;  // For correlating response
}

// Request to close a session
interface SessionCloseMessage {
  type: 'session.close';
  shellId: string;
}

// Terminal input
interface SessionInputMessage {
  type: 'session.input';
  shellId: string;
  data: string;
}

// Terminal resize
interface SessionResizeMessage {
  type: 'session.resize';
  shellId: string;
  cols: number;
  rows: number;
}
```

#### Server → Client Messages

```typescript
// Session opened successfully (includes scrollback in single message)
interface SessionOpenedMessage {
  type: 'session.opened';
  shellId: string;
  requestId: string;
  shell: Shell;           // Full shell metadata
  scrollback: string;     // Pre-joined scrollback data
  cols: number;
  rows: number;
}

// Session open failed
interface SessionErrorMessage {
  type: 'session.error';
  shellId: string;
  requestId?: string;
  code: 'SHELL_NOT_FOUND' | 'DAEMON_SPAWN_FAILED' | 'CONNECTION_LOST' | 'INTERNAL_ERROR';
  message: string;
  retryable: boolean;
}

// Session closed (normal or abnormal)
interface SessionClosedMessage {
  type: 'session.closed';
  shellId: string;
  reason: 'requested' | 'exited' | 'error';
  exitCode?: number;
}

// Terminal output
interface SessionOutputMessage {
  type: 'session.output';
  shellId: string;
  data: string;
}
```

### Client State Machine

```typescript
type SessionState =
  | { status: 'closed' }
  | { status: 'opening'; requestId: string }
  | { status: 'open'; shell: Shell; scrollback: string }
  | { status: 'reconnecting'; attempt: number; maxAttempts: number }
  | { status: 'error'; code: string; message: string; retryable: boolean };

interface SessionActions {
  open: () => void;
  close: () => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  retry: () => void;
}
```

### ShellSessionManager Implementation

```typescript
class ShellSessionManager {
  private shellStore: ShellStore;
  private ptyPool: PtyPool;
  private scrollbackStore: ScrollbackStore;
  private daemonManager: PtyDaemonManager;

  /**
   * Open a session - atomic operation that:
   * 1. Ensures shell exists in store
   * 2. Spawns or reconnects daemon
   * 3. Adds to PTY pool
   * 4. Loads scrollback
   * 5. Returns complete state or throws
   */
  async openSession(shellId: string): Promise<{
    shell: Shell;
    scrollback: string;
    cols: number;
    rows: number;
  }> {
    // 1. Get shell metadata
    const shell = await this.shellStore.get(shellId);
    if (!shell) {
      throw new SessionError('SHELL_NOT_FOUND', `Shell ${shellId} not found`, false);
    }

    // 2. Spawn or reconnect daemon
    let session = this.ptyPool.get(shellId);
    if (!session) {
      try {
        session = await this.daemonManager.spawnOrReconnect(shellId, {
          cwd: shell.cwd,
          socketPath: shell.socketPath,
        });
        this.ptyPool.add(shellId, session);
      } catch (error) {
        throw new SessionError('DAEMON_SPAWN_FAILED', error.message, true);
      }
    }

    // 3. Load scrollback (memory first, then disk)
    let scrollback = '';
    const entries = this.scrollbackStore.getFromMemory(shellId);
    if (entries.length === 0) {
      const diskEntries = await this.scrollbackStore.load(shellId);
      scrollback = diskEntries.filter(e => e.type === 'output').map(e => e.data).join('');
    } else {
      scrollback = entries.filter(e => e.type === 'output').map(e => e.data).join('');
    }

    // 4. Update shell status
    await this.shellStore.update(shellId, {
      status: 'active',
      pid: session.pid,
    });

    return {
      shell: await this.shellStore.get(shellId)!,
      scrollback,
      cols: session.cols,
      rows: session.rows,
    };
  }

  /**
   * Periodic reconciliation - detect and fix inconsistencies
   */
  async reconcile(): Promise<void> {
    const shells = await this.shellStore.getAll();

    for (const shell of shells) {
      const session = this.ptyPool.get(shell.id);
      const daemonAlive = shell.socketPath && await this.daemonManager.isAlive(shell.socketPath);

      // Shell says active but no session and no daemon
      if (shell.status === 'active' && !session && !daemonAlive) {
        await this.shellStore.update(shell.id, { status: 'inactive' });
      }

      // Session exists but not in pool (shouldn't happen, but recover)
      if (daemonAlive && !session) {
        try {
          const reconnectedSession = await this.daemonManager.reconnect(shell.socketPath!);
          this.ptyPool.add(shell.id, reconnectedSession);
        } catch {
          // Daemon actually dead, mark inactive
          await this.shellStore.update(shell.id, { status: 'inactive' });
        }
      }
    }
  }
}
```

### Simplified Terminal Component

```typescript
function Terminal({ shellId }: { shellId: string }) {
  const session = useTerminalSession(shellId);
  const terminalRef = useRef<XTerm>(null);

  // Single effect handles all state transitions
  useEffect(() => {
    switch (session.state.status) {
      case 'closed':
        session.open();  // Automatically open when mounted
        break;

      case 'opening':
        // Show loading spinner
        break;

      case 'open':
        // Write scrollback once
        if (terminalRef.current && session.state.scrollback) {
          terminalRef.current.write(session.state.scrollback);
        }
        break;

      case 'error':
        if (session.state.retryable) {
          // Show retry button
        } else {
          // Show error message
        }
        break;

      case 'reconnecting':
        // Show reconnecting indicator
        break;
    }
  }, [session.state.status]);

  // Render based on state
  if (session.state.status === 'opening') {
    return <LoadingSpinner />;
  }

  if (session.state.status === 'error') {
    return (
      <ErrorDisplay
        message={session.state.message}
        onRetry={session.state.retryable ? session.retry : undefined}
      />
    );
  }

  return <XTermContainer ref={terminalRef} onData={session.write} />;
}
```

## Migration Plan

### Phase 1: Add ShellSessionManager (Non-Breaking)

**Goal**: Introduce the new orchestration layer without breaking existing code.

**Changes**:
1. Create `src/server/services/shell/ShellSessionManager.ts`
2. Implement `openSession()` that wraps existing logic
3. Add reconciliation loop (runs every 30 seconds)
4. ShellService delegates to ShellSessionManager internally

**Files to create/modify**:
- `src/server/services/shell/ShellSessionManager.ts` (new)
- `src/server/services/shell/ShellService.ts` (modify to use manager)
- `src/server/index.ts` (start reconciliation loop)

**Testing**:
- All existing tests should pass
- Add unit tests for ShellSessionManager
- Add integration test for reconciliation

### Phase 2: New WebSocket Protocol (Parallel Support)

**Goal**: Implement new protocol alongside existing, allowing gradual migration.

**Changes**:
1. Add new message types to TerminalHandler
2. Implement `session.open` → `session.opened` flow
3. Keep old `attach`/`detach` messages working
4. Add protocol version negotiation

**Files to create/modify**:
- `src/server/websocket/handlers/terminal.ts` (add new handlers)
- `src/shared/types/websocket.ts` (new message types)

**Testing**:
- Existing tests continue to pass
- New tests for session.* messages
- Integration test showing both protocols work

### Phase 3: Client State Machine

**Goal**: Replace useTerminal hook with state machine approach.

**Changes**:
1. Create `useTerminalSession` hook with state machine
2. Update Terminal component to use new hook
3. Remove startShellMutation (now handled by session.open)
4. Add automatic reconnection logic

**Files to create/modify**:
- `src/client/hooks/useTerminalSession.ts` (new)
- `src/client/components/terminal/Terminal.tsx` (rewrite)
- Remove unused code from `useTerminal.ts`

**Testing**:
- Full E2E test suite must pass
- Add tests for state transitions
- Test reconnection scenarios

### Phase 4: Remove Legacy Code

**Goal**: Clean up old protocol and unused code.

**Changes**:
1. Remove `attach`/`detach` message handlers
2. Remove old startShell REST endpoint (or make it internal)
3. Remove `useTerminal` hook
4. Update all documentation

**Files to modify**:
- `src/server/websocket/handlers/terminal.ts` (remove old handlers)
- `src/server/api/routes/shells.ts` (simplify or remove /start)
- Delete `src/client/hooks/useTerminal.ts`

## Testing Strategy

### Unit Tests

```typescript
describe('ShellSessionManager', () => {
  it('opens session with existing daemon', async () => {
    // Daemon already running, should reconnect
  });

  it('opens session spawning new daemon', async () => {
    // No daemon, should spawn fresh
  });

  it('loads scrollback from disk after restart', async () => {
    // Memory empty, disk has data
  });

  it('reconciles stale active status', async () => {
    // Shell marked active but daemon dead
  });
});

describe('useTerminalSession', () => {
  it('transitions closed -> opening -> open', () => {});
  it('transitions to error on failure', () => {});
  it('auto-retries on retryable errors', () => {});
  it('handles server disconnect with reconnect', () => {});
});
```

### Integration Tests

```typescript
describe('Terminal Session Integration', () => {
  it('survives server restart', async () => {
    // 1. Open terminal, type something
    // 2. Restart server
    // 3. Verify scrollback appears
  });

  it('handles rapid shell switching', async () => {
    // 1. Switch between shells rapidly
    // 2. Verify no race conditions
  });
});
```

### E2E Tests

```typescript
test('terminal shows content after browser refresh', async ({ page }) => {
  // 1. Login, select shell
  // 2. Type command, see output
  // 3. Refresh browser
  // 4. Verify output still visible
});

test('terminal recovers from server restart', async ({ page }) => {
  // 1. Open terminal
  // 2. Restart server process
  // 3. Verify terminal reconnects and shows scrollback
});
```

## Success Criteria

1. **Zero empty terminals**: Switching to any shell always shows content (at minimum, a prompt)
2. **Automatic recovery**: Server restarts recover all sessions without user intervention
3. **Clear error states**: When something fails, user sees actionable error message
4. **No race conditions**: Rapid shell switching works reliably
5. **Testable**: All state transitions covered by unit tests
6. **Observable**: Logs clearly show session lifecycle events

## Appendix: Current File Inventory

### Server Files (Terminal-Related)

| File | Purpose | Lines |
|------|---------|-------|
| `src/server/services/shell/ShellService.ts` | Shell CRUD + start/stop | ~200 |
| `src/server/services/pty/PtyPool.ts` | In-memory session storage | ~100 |
| `src/server/services/pty/PtyManager.ts` | Legacy PTY management | ~150 |
| `src/server/services/pty/PtySession.ts` | Single PTY wrapper | ~100 |
| `src/server/services/pty/PtyDaemonManager.ts` | Daemon spawn/reconnect | ~300 |
| `src/server/storage/ScrollbackStore.ts` | Scrollback persistence | ~200 |
| `src/server/websocket/handlers/terminal.ts` | WebSocket protocol | ~250 |

### Client Files (Terminal-Related)

| File | Purpose | Lines |
|------|---------|-------|
| `src/client/components/terminal/Terminal.tsx` | Main terminal UI | ~470 |
| `src/client/hooks/useTerminal.ts` | WebSocket connection | ~200 |
| `src/client/hooks/useWebSocket.ts` | Reconnecting WebSocket | ~150 |
| `src/client/hooks/useShells.ts` | Shell React Query hooks | ~100 |

### Test Files

| File | Purpose |
|------|---------|
| `test/unit/server/websocket/handlers/terminal.test.ts` | TerminalHandler unit tests |
| `test/unit/client/components/terminal/Terminal.test.tsx` | Terminal component tests |
| `test/unit/client/hooks/useTerminal.test.ts` | useTerminal hook tests |
| `test/integration/pty/` | PTY integration tests |
| `test/e2e/terminal.spec.ts` | E2E terminal tests |
