# Implementation Plan for Terminal State Management Redesign

## Overview

This plan implements a redesigned terminal state management system for AIForge to address reliability issues with multiple sources of truth causing inconsistent state. The new architecture introduces:

1. **ShellSessionManager** - A single orchestrator for all shell state on the server
2. **New WebSocket Protocol** - Atomic `session.*` messages replacing `attach`/`detach` + REST API
3. **Client State Machine** - Clear states with defined transitions in `useTerminalSession` hook
4. **Periodic Reconciliation** - Automatic detection and correction of state inconsistencies

---

## Phase Breakdown

### Phase 1: ShellSessionManager & New Protocol (Server-Side)

**Objective**: Create `ShellSessionManager` and implement the new `session.*` WebSocket protocol, replacing the old `attach`/`detach` handlers.

**Duration**: 3-4 days

#### Tests to Write First

**File**: `test/unit/server/services/shell/ShellSessionManager.test.ts`

```typescript
describe('ShellSessionManager', () => {
  describe('openSession', () => {
    it('returns session state when shell exists and daemon is already running');
    it('spawns new daemon when shell exists but no daemon running');
    it('loads scrollback from disk when memory buffer is empty');
    it('throws SHELL_NOT_FOUND for non-existent shell');
    it('throws DAEMON_SPAWN_FAILED when daemon fails to start');
    it('updates shell status to active on successful open');
  });

  describe('closeSession', () => {
    it('kills daemon and marks shell inactive');
    it('handles already-closed session gracefully');
  });

  describe('getSessionState', () => {
    it('returns open state for active session');
    it('returns closed state for inactive shell');
    it('returns null for non-existent shell');
  });

  describe('reconcile', () => {
    it('marks shell inactive when daemon is dead but status is active');
    it('reconnects to orphaned daemon when session not in pool');
    it('cleans up stale socket files with no corresponding shell');
  });
});
```

**File**: `test/unit/server/websocket/handlers/terminal.test.ts` (rewrite)

```typescript
describe('Session Message Protocol', () => {
  describe('session.open', () => {
    it('returns session.opened with shell, scrollback, and dimensions');
    it('returns session.error for non-existent shell');
    it('returns session.error when daemon spawn fails');
    it('correlates response with requestId');
    it('subscribes client to shell output after successful open');
  });

  describe('session.close', () => {
    it('returns session.closed with reason requested');
    it('unsubscribes client from shell output');
  });

  describe('session.input', () => {
    it('forwards input to PTY when session is open');
    it('returns session.error when session not open');
  });

  describe('session.resize', () => {
    it('resizes PTY when session is open');
  });

  describe('session.output', () => {
    it('broadcasts to all clients with open session for shell');
  });
});
```

**File**: `test/integration/services/ShellSessionManager.test.ts`

```typescript
describe('ShellSessionManager Integration', () => {
  it('full session lifecycle: open, write, close');
  it('survives simulated server restart');
  it('handles concurrent session opens gracefully');
});
```

#### Implementation

**File**: `src/server/services/shell/SessionError.ts` (new)

```typescript
export type SessionErrorCode =
  | 'SHELL_NOT_FOUND'
  | 'DAEMON_SPAWN_FAILED'
  | 'CONNECTION_LOST'
  | 'INTERNAL_ERROR';

export class SessionError extends Error {
  constructor(
    public readonly code: SessionErrorCode,
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'SessionError';
  }
}
```

**File**: `src/server/services/shell/ShellSessionManager.ts` (new)

- `openSession(shellId)` - Atomic operation: get shell, spawn/reconnect daemon, load scrollback
- `closeSession(shellId)` - Kill daemon, update status
- `getSessionState(shellId)` - Current state query
- `reconcile()` - Fix inconsistencies between store/pool/daemons
- `startReconciliationLoop(intervalMs)` / `stopReconciliationLoop()`

**File**: `src/shared/types/index.ts` (modify)

```typescript
// New message types
interface SessionOpenMessage {
  type: 'session.open';
  shellId: string;
  requestId: string;
}

interface SessionOpenedMessage {
  type: 'session.opened';
  shellId: string;
  requestId: string;
  shell: Shell;
  scrollback: string;
  cols: number;
  rows: number;
}

interface SessionErrorMessage {
  type: 'session.error';
  shellId: string;
  requestId?: string;
  code: SessionErrorCode;
  message: string;
  retryable: boolean;
}

// ... SessionCloseMessage, SessionClosedMessage, SessionInputMessage,
//     SessionResizeMessage, SessionOutputMessage
```

**File**: `src/server/websocket/handlers/terminal.ts` (rewrite)

- Remove `attach`/`detach`/`input`/`resize` handlers
- Add `session.open`/`session.close`/`session.input`/`session.resize` handlers
- Delegate to `ShellSessionManager` instead of directly using `PtyPool`

**File**: `src/server/services/shell/ShellService.ts` (simplify)

- Remove `start()` method (now handled by ShellSessionManager.openSession)
- Keep CRUD operations

**File**: `src/server/api/routes/shells.ts` (modify)

- Remove `/api/shells/:id/start` endpoint

**File**: `src/server/index.ts` (modify)

- Create `ShellSessionManager` instance
- Start reconciliation loop (30 second interval)
- Register shutdown handler

#### Dependencies

- **External**: None
- **Internal**: Existing PtyPool, PtyDaemonManager, ShellStore, ScrollbackStore

#### Verification

1. Run tests:
   ```bash
   npm test -- ShellSessionManager
   npm test -- terminal.test.ts
   ```

2. Manual WebSocket test:
   ```bash
   npm run dev:server
   # Use wscat to send session.open, verify session.opened response
   ```

---

### Phase 2: Client State Machine Hook

**Objective**: Create `useTerminalSession` hook with explicit state machine, replacing `useTerminal`.

**Duration**: 2-3 days

#### Tests to Write First

**File**: `test/unit/client/hooks/useTerminalSession.test.ts`

```typescript
describe('useTerminalSession', () => {
  describe('state transitions', () => {
    it('starts in closed state');
    it('transitions closed → opening → open on successful open');
    it('transitions to error state on session.error');
    it('transitions to reconnecting on WebSocket disconnect');
    it('transitions reconnecting → open on successful reconnect');
    it('transitions reconnecting → error after max attempts');
  });

  describe('actions', () => {
    it('open() sends session.open message with requestId');
    it('write() sends session.input message');
    it('resize() sends session.resize message');
    it('retry() re-opens when in retryable error state');
    it('close() sends session.close and transitions to closed');
  });

  describe('output handling', () => {
    it('calls onOutput callback when session.output received');
    it('provides scrollback in state, not via onOutput');
  });

  describe('stability', () => {
    it('does not send duplicate session.open on re-render');
    it('handles shellId prop changes correctly');
    it('cleans up on unmount');
  });
});
```

#### Implementation

**File**: `src/client/hooks/useTerminalSession.ts` (new)

```typescript
type SessionState =
  | { status: 'closed' }
  | { status: 'opening'; requestId: string }
  | { status: 'open'; shell: Shell; scrollback: string }
  | { status: 'reconnecting'; attempt: number; maxAttempts: number }
  | { status: 'error'; code: string; message: string; retryable: boolean };

interface UseTerminalSessionOptions {
  onOutput?: (data: string) => void;
  autoOpen?: boolean;
  maxReconnectAttempts?: number;
}

export function useTerminalSession(
  shellId: string,
  options?: UseTerminalSessionOptions
): {
  state: SessionState;
  open: () => void;
  close: () => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  retry: () => void;
};
```

#### Dependencies

- **External**: None
- **Internal**: Phase 1 (new WebSocket protocol), existing `useWebSocket`

**Note**: The old `useTerminal.ts` hook is NOT deleted in Phase 2 because `Terminal.tsx` still imports it. Deleting it here would break the build. The old hook will be deleted in Phase 3 when `Terminal.tsx` is rewritten to use `useTerminalSession`.

#### Verification

1. Run tests:
   ```bash
   npm test -- useTerminalSession
   ```

---

### Phase 3: Terminal Component Rewrite

**Objective**: Rewrite Terminal component to use `useTerminalSession` with clear UI states for loading, error, and reconnecting.

**Duration**: 2-3 days

#### Tests to Write First

**File**: `test/unit/client/components/terminal/Terminal.test.tsx` (rewrite)

```typescript
describe('Terminal Component', () => {
  describe('state rendering', () => {
    it('shows loading spinner in opening state');
    it('renders xterm when session is open');
    it('shows error message with retry button for retryable errors');
    it('shows error message without retry for non-retryable errors');
    it('shows reconnecting indicator with attempt count');
  });

  describe('scrollback handling', () => {
    it('writes scrollback to xterm on session open');
    it('clears and rewrites scrollback on reconnect');
  });

  describe('user interaction', () => {
    it('sends input through session.write');
    it('sends resize on terminal dimension change');
  });

  describe('cleanup', () => {
    it('closes session on unmount');
  });
});
```

#### Implementation

**File**: `src/client/components/terminal/Terminal.tsx` (rewrite)

```typescript
export function Terminal({ shellId }: { shellId: string }): JSX.Element {
  const session = useTerminalSession(shellId, {
    autoOpen: true,
    onOutput: handleOutput,
  });

  switch (session.state.status) {
    case 'opening':
      return <LoadingSpinner message="Connecting..." />;

    case 'error':
      return (
        <ErrorDisplay
          message={session.state.message}
          onRetry={session.state.retryable ? session.retry : undefined}
        />
      );

    case 'reconnecting':
      return (
        <>
          <XTermContainer />
          <ReconnectingOverlay attempt={session.state.attempt} />
        </>
      );

    case 'open':
      return <XTermContainer onData={session.write} />;

    default:
      return null;
  }
}
```

**File**: `src/client/components/terminal/ErrorDisplay.tsx` (new)

**File**: `src/client/components/terminal/ReconnectingOverlay.tsx` (new)

**File**: `src/client/hooks/useTerminal.ts` (delete)

**File**: `test/unit/client/hooks/useTerminal.test.ts` (delete)

#### Dependencies

- **External**: None
- **Internal**: Phase 2 (`useTerminalSession`)

#### Verification

1. Run tests:
   ```bash
   npm test -- Terminal.test.tsx
   ```

2. Run E2E tests:
   ```bash
   npm run test:e2e
   ```

3. Manual testing:
   - Open shell, verify scrollback loads
   - Disconnect network, verify reconnecting UI
   - Open non-existent shell, verify error UI

---

### Phase 4: E2E Verification & Cleanup

**Objective**: Verify full system works end-to-end, fix any issues, remove dead code.

**Duration**: 1-2 days

#### Tests to Write First

**File**: `test/e2e/terminal.spec.ts` (update/expand)

```typescript
test.describe('Terminal', () => {
  test('shows scrollback after page refresh');
  test('recovers from server restart');
  test('handles rapid shell switching without race conditions');
  test('shows appropriate error for deleted shell');
  test('reconnects automatically after network interruption');
});
```

#### Implementation

- Fix any issues found during E2E testing
- Remove dead code:
  - Old message type definitions
  - Unused imports
  - Commented-out code
- Run `npm run knip` to find unused exports

#### Verification

1. Full test suite:
   ```bash
   npm test
   npm run test:e2e
   ```

2. Code quality:
   ```bash
   npm run lint
   npm run typecheck
   npm run knip
   ```

3. Coverage:
   ```bash
   npm run test:coverage
   ```

---

## Common Utilities Needed

### `generateRequestId`
```typescript
// src/shared/utils/requestId.ts
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

### `SessionError` class
See Phase 1 implementation.

### Message type guards
```typescript
// src/shared/types/index.ts
export function isSessionOpenedMessage(msg: unknown): msg is SessionOpenedMessage {
  return typeof msg === 'object' && msg !== null &&
    (msg as any).type === 'session.opened';
}
```

---

## External Libraries Assessment

No new libraries needed. The existing stack (React hooks, Node EventEmitter, existing WebSocket infrastructure) is sufficient.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Reconnection loops | Exponential backoff with max attempts (5), jitter |
| Memory leaks | Cleanup in useEffect return, test rapid mount/unmount |
| Race conditions with concurrent opens | RequestId correlation, server-side mutex on shellId |
| Scrollback duplication | Clear terminal before writing scrollback on reconnect |

---

## Phase Summary

| Phase | Duration | Key Deliverable |
|-------|----------|-----------------|
| 1 | 3-4 days | ShellSessionManager + new WebSocket protocol |
| 2 | 2-3 days | useTerminalSession hook |
| 3 | 2-3 days | Rewritten Terminal component |
| 4 | 1-2 days | E2E verification & cleanup |

**Total estimated duration**: 8-12 days

---

## File Changes Summary

### New Files
| File | Phase |
|------|-------|
| `src/server/services/shell/SessionError.ts` | 1 |
| `src/server/services/shell/ShellSessionManager.ts` | 1 |
| `src/client/hooks/useTerminalSession.ts` | 2 |
| `src/client/components/terminal/ErrorDisplay.tsx` | 3 |
| `src/client/components/terminal/ReconnectingOverlay.tsx` | 3 |

### Rewritten Files
| File | Phase |
|------|-------|
| `src/server/websocket/handlers/terminal.ts` | 1 |
| `src/client/components/terminal/Terminal.tsx` | 3 |
| `test/unit/server/websocket/handlers/terminal.test.ts` | 1 |
| `test/unit/client/components/terminal/Terminal.test.tsx` | 3 |

### Deleted Files
| File | Phase |
|------|-------|
| `src/client/hooks/useTerminal.ts` | 3 |
| `test/unit/client/hooks/useTerminal.test.ts` | 3 |

### Modified Files
| File | Phase | Changes |
|------|-------|---------|
| `src/shared/types/index.ts` | 1 | Add new message types |
| `src/server/services/shell/ShellService.ts` | 1 | Remove start() method |
| `src/server/api/routes/shells.ts` | 1 | Remove /start endpoint |
| `src/server/index.ts` | 1 | Add manager + reconciliation loop |
