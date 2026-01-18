# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AIForge is a web-based IDE for 100% agentic coding - managing AI agents through terminals, not files. Users interact via CLI prompts and shell commands; there is no direct code editing in the UI.

**Architecture**: React frontend (Vite) + Express backend + WebSocket for real-time terminal I/O using xterm.js and node-pty.

## Development Commands

```bash
# Development
npm run dev                    # Start both server and client (uses servherd for port management)
npm run dev:server             # Server only with tsx watch
npm run dev:client             # Client only with Vite HMR

# Building
npm run build                  # Build server (tsc)
npm run build:client           # Build client (vite build)

# Code Quality
npm run lint                   # ESLint check
npm run lint:fix               # ESLint auto-fix
npm run typecheck              # TypeScript check without emit
npm run knip                   # Find unused code/dependencies

# Testing - Unit/Integration (Vitest)
npm test                       # Run all tests
npm run test:watch             # Watch mode
npm run test:coverage          # With coverage (80% threshold)
vitest run test/unit/server/config           # Single test file
vitest run -t "should validate port"         # Single test by name

# Testing - E2E (Playwright)
npm run test:e2e               # Run all E2E tests
npm run test:e2e:ui            # Open UI mode
npx playwright test test/e2e/auth            # Single spec file
npx playwright test --headed                 # Show browser
npx playwright test --debug                  # Debug mode

# Utilities
npm run generate-guid          # Create auth GUID for login
```

## Project Structure

```
src/
├── client/           # React frontend (Vite)
│   ├── components/   # Feature-based: auth/, common/, layout/, projects/, shells/, terminal/
│   ├── hooks/        # useTerminal (WebSocket), useProjects, useShells, useAuth, useWebSocket
│   ├── services/     # API client, WebSocket (ReconnectingWebSocket class), Logger
│   ├── stores/       # Zustand state (uiStore)
│   └── pages/        # LoginPage, MainPage
├── server/           # Express backend
│   ├── api/routes/   # /api/projects, /api/shells, /api/auth, /api/fs
│   ├── services/     # pty/ (PtyPool, PtyManager, PtySession, PtyDaemonManager), shell/, project/, auth/, filesystem/
│   ├── websocket/    # WebSocket server + handlers (attach/detach/input/resize)
│   └── storage/      # JSON file stores (JsonStore, ScrollbackStore, ProjectStore, ShellStore)
└── shared/           # Shared types between client/server
    └── types/        # Project, Shell, Session, WebSocketMessage types

test/
├── unit/             # Unit tests mirroring src/ structure
├── integration/      # API, PTY, WebSocket integration tests
├── e2e/              # Playwright end-to-end tests
├── helpers/          # Test utilities
└── mocks/            # Test mocks
```

## Key Architecture Patterns

**Real-time Terminal Communication (WebSocket protocol)**:
- Client → Server: `attach`, `detach`, `input`, `resize` messages (all include shellId)
- Server → Client: `output` (with isScrollback flag), `status`, `error` messages

**Data Models**:
- Project: directory reference (id, name, path, timestamps)
- Shell: terminal session within project (id, projectId, name, status, pid, socketPath)
- ShellStatus: `'inactive' | 'active' | 'error'`

**State Management**:
- Frontend: Zustand stores with shallow equality
- Backend: JSON file-based persistence in `~/.aiforge/data/`

**PTY Management**:
- Daemon mode: shells survive server restarts (uses Unix domain sockets)
- Scrollback persistence: 10k lines default, stored per-shell

## Path Aliases (tsconfig)

```typescript
@shared/*  → src/shared/*
@server/*  → src/server/*
@client/*  → src/client/*
@test/*    → test/*
```

## Environment Variables

```bash
AIFORGE_PORT              # Server port (default: random 9000-9099)
AIFORGE_HOST              # Server host (default: 0.0.0.0)
AIFORGE_AUTH_GUID         # Authentication GUID (empty = no auth)
AIFORGE_SCROLLBACK_LINES  # Terminal scrollback size (default: 10000)
AIFORGE_LOG_LEVEL         # trace/debug/info/warn/error/fatal (default: info)
AIFORGE_DATA_DIR          # Data directory (default: ~/.aiforge)
E2E_TEST                  # Flag for E2E test mode
```

## Code Conventions

- Explicit return types required on all functions (ESLint enforced)
- `_` prefix for unused parameters: `(_err: unknown) => {}`
- Union types for variants: `ShellStatus = 'inactive' | 'active' | 'error'`
- Test isolation: each E2E test gets fresh server via fixtures

## State Storage Guidelines

When designing new features, choose the correct storage layer based on the nature of the data:

### Server Storage (API endpoints + JSON stores)

Use for **application data** that has intrinsic value tied to domain entities:

- Data is tied to a domain entity (project, shell)
- Multiple users/sessions should see the same data
- Data has value beyond the current browser session
- **Examples**: TODOs, notes, custom URLs, bookmarks, tags, shell metadata

**Implementation**: Create API endpoints in `src/server/api/routes/` with corresponding services in `src/server/services/`. Data persists in `~/.aiforge/data/` via JSON stores.

### Zustand + WorkspaceState (Client-side)

Use for **UI state** that controls presentation preferences:

- Data is a UI preference or layout choice
- Different browsers/sessions can reasonably have different values
- Data controls "how" something is displayed, not "what"
- **Examples**: sidebar width, collapsed states, active selections, pinned state, theme, font size

**Implementation**: Add to `UIState` in `src/client/stores/uiStore.ts`. Persists via `useWorkspaceSync` hook to `/api/workspace` endpoint (per-session).

### Decision Checklist

Ask: **"If I open this app in another browser, should I see the same value?"**

| Answer | Storage | Example |
|--------|---------|---------|
| Yes | Server (API + JSON store) | Shell TODOs - they're about the shell, not the browser |
| No | Zustand/WorkspaceState | Sidebar width - each browser can have its own layout |

### Common Patterns

```typescript
// Server-persisted application data (global across sessions)
GET  /api/shells/:id/context     // Get shell TODOs and notes
PATCH /api/shells/:id/context    // Update shell TODOs and/or notes
GET  /api/projects/:id/urls      // Get custom URLs
POST /api/projects/:id/urls      // Add custom URL

// Client-persisted UI state (per-session)
// In uiStore.ts:
contextSidebarPinned: boolean;   // UI preference
contextSidebarWidth: number;     // Layout preference
activeShellId: string | null;    // Current selection
```
