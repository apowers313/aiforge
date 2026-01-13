# AIForge Design Document

A web-based IDE for 100% agentic coding that focuses on managing agents rather than files and code. The UI provides interaction through prompts to CLI-driven AI tools and shell commands only - no direct code editing.

## Table of Contents

- [Tooling and Scaffolding](#tooling-and-scaffolding)
- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Core Features](#core-features)
- [API Design](#api-design)
- [Authentication](#authentication)
- [Data Storage](#data-storage)
- [Frontend Components](#frontend-components)
- [Configuration](#configuration)
- [Build and Development](#build-and-development)
- [Testing Strategy](#testing-strategy)

---

## Tooling and Scaffolding

The following tools will be used for project scaffolding, based on patterns from `servherd`:

### Build Tools

| Tool | Version | Purpose |
|------|---------|---------|
| **Vite** | ^6.x | Frontend build tool and dev server |
| **TypeScript** | ^5.x | Type-safe JavaScript for both client and server |
| **tsx** | ^4.x | TypeScript execution for development |

### Code Quality

| Tool | Version | Purpose |
|------|---------|---------|
| **ESLint** | ^9.x | Linting with flat config format |
| **@eslint/js** | ^9.x | ESLint JavaScript rules |
| **typescript-eslint** | ^8.x | TypeScript ESLint support |
| **@stylistic/eslint-plugin** | ^2.x | Code formatting rules |

### Testing

| Tool | Version | Purpose |
|------|---------|---------|
| **Vitest** | ^2.x | Unit, integration, and E2E testing |
| **@vitest/coverage-v8** | ^2.x | Code coverage reporting |
| **@testing-library/react** | ^16.x | React component testing |
| **jsdom** | ^25.x | DOM simulation for tests |
| **Playwright** | ^1.x | E2E browser testing |

### Git Hooks and Commits

| Tool | Version | Purpose |
|------|---------|---------|
| **Husky** | ^9.x | Git hooks management |
| **@commitlint/cli** | ^19.x | Commit message validation |
| **@commitlint/config-conventional** | ^19.x | Conventional commit rules |
| **commitizen** | ^4.x | Interactive commit prompts |
| **cz-conventional-changelog** | ^3.x | Conventional changelog adapter |
| **conventional-changelog-conventionalcommits** | ^8.x | Changelog parser |

### Release and CI/CD

| Tool | Version | Purpose |
|------|---------|---------|
| **semantic-release** | ^24.x | Automated versioning and releases |
| **@semantic-release/changelog** | ^6.x | Changelog generation |
| **@semantic-release/commit-analyzer** | ^13.x | Commit analysis for versioning |
| **@semantic-release/git** | ^10.x | Git asset commits |
| **@semantic-release/github** | ^11.x | GitHub release creation |
| **@semantic-release/npm** | ^12.x | NPM publishing |
| **@semantic-release/release-notes-generator** | ^14.x | Release notes generation |
| **GitHub Actions** | N/A | CI/CD pipeline |

### Dead Code Detection

| Tool | Version | Purpose |
|------|---------|---------|
| **Knip** | ^5.x | Unused code and dependency detection |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                          │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │   React +   │  │   xterm.js      │  │   WebSocket         │  │
│  │   Mantine   │  │   Terminal      │  │   Client            │  │
│  └─────────────┘  └─────────────────┘  └─────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP / WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Node.js Server (Backend)                     │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │   Express   │  │   WebSocket     │  │   Authentication    │  │
│  │   REST API  │  │   Server        │  │   Middleware        │  │
│  └─────────────┘  └─────────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  node-pty   │  │   Project       │  │   JSON File         │  │
│  │  Manager    │  │   Manager       │  │   Storage           │  │
│  └─────────────┘  └─────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Operating System (Linux)                    │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │   PTY       │  │   File System   │  │   Processes         │  │
│  │   Sessions  │  │   (Projects)    │  │   (Shells)          │  │
│  └─────────────┘  └─────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Terminal Input**: User types in xterm.js → WebSocket → node-pty → shell process
2. **Terminal Output**: Shell process → node-pty → WebSocket → xterm.js
3. **Project Management**: React UI → REST API → JSON Files → File System
4. **Authentication**: Cookie-based GUID token with long expiration

---

## Technology Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework |
| **Mantine 7** | Component library |
| **@graphty/compact-mantine** | Theme and custom components |
| **xterm.js** | Terminal emulator |
| **xterm-addon-fit** | Terminal auto-sizing |
| **xterm-addon-web-links** | Clickable links in terminal |
| **React Router** | Client-side routing |
| **Zustand** | State management |

### Backend

| Technology | Purpose |
|------------|---------|
| **Node.js 20+** | Runtime environment |
| **Express** | HTTP server and REST API |
| **ws** | WebSocket server |
| **node-pty-prebuilt-multiarch** | PTY management |
| **fs-extra** | Enhanced file system operations |
| **cookie-parser** | Cookie handling |
| **uuid** | GUID generation |
| **pino** | Structured logging |
| **pm2** | Process management (daemon) |

---

## Project Structure

```
aiforge/
├── src/
│   ├── client/                    # Frontend React application
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx          # Main layout with sidebar
│   │   │   │   ├── Sidebar.tsx           # Left sidebar component
│   │   │   │   └── Header.tsx            # Header component
│   │   │   ├── projects/
│   │   │   │   ├── ProjectList.tsx       # List of projects
│   │   │   │   ├── ProjectItem.tsx       # Single project with shells
│   │   │   │   └── AddProjectModal.tsx   # Directory picker modal
│   │   │   ├── shells/
│   │   │   │   ├── ShellList.tsx         # List of shells for a project
│   │   │   │   ├── ShellItem.tsx         # Single shell entry
│   │   │   │   └── AddShellButton.tsx    # Add shell button
│   │   │   ├── terminal/
│   │   │   │   ├── Terminal.tsx          # xterm.js wrapper
│   │   │   │   ├── TerminalCanvas.tsx    # Terminal display area
│   │   │   │   └── TerminalTabs.tsx      # Shell tabs (future)
│   │   │   └── auth/
│   │   │       ├── AuthGuard.tsx         # Route protection
│   │   │       └── LoginForm.tsx         # GUID input form
│   │   ├── hooks/
│   │   │   ├── useProjects.ts            # Project CRUD operations
│   │   │   ├── useShells.ts              # Shell management
│   │   │   ├── useTerminal.ts            # Terminal connection
│   │   │   ├── useAuth.ts                # Authentication state
│   │   │   └── useWebSocket.ts           # WebSocket connection
│   │   ├── stores/
│   │   │   ├── projectStore.ts           # Project state
│   │   │   ├── shellStore.ts             # Shell state
│   │   │   └── authStore.ts              # Auth state
│   │   ├── services/
│   │   │   ├── api.ts                    # REST API client
│   │   │   └── websocket.ts              # WebSocket client
│   │   ├── types/
│   │   │   └── index.ts                  # Shared TypeScript types
│   │   ├── App.tsx                       # Root component
│   │   ├── main.tsx                      # Entry point
│   │   └── index.html                    # HTML template
│   │
│   ├── server/                    # Backend Node.js application
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── index.ts              # Route aggregator
│   │   │   │   ├── projects.ts           # Project endpoints
│   │   │   │   ├── shells.ts             # Shell endpoints
│   │   │   │   ├── auth.ts               # Auth endpoints
│   │   │   │   └── filesystem.ts         # Directory browsing
│   │   │   └── middleware/
│   │   │       ├── auth.ts               # Authentication middleware
│   │   │       ├── error.ts              # Error handling
│   │   │       └── validation.ts         # Request validation
│   │   ├── services/
│   │   │   ├── pty/
│   │   │   │   ├── PtyManager.ts         # PTY session management
│   │   │   │   ├── PtySession.ts         # Individual PTY session
│   │   │   │   └── PtyPool.ts            # Session pooling
│   │   │   ├── project/
│   │   │   │   └── ProjectService.ts     # Project CRUD
│   │   │   ├── shell/
│   │   │   │   └── ShellService.ts       # Shell CRUD
│   │   │   ├── auth/
│   │   │   │   └── AuthService.ts        # Token management
│   │   │   └── filesystem/
│   │   │       └── FilesystemService.ts  # Directory browsing
│   │   ├── websocket/
│   │   │   ├── WebSocketServer.ts        # WS server setup
│   │   │   └── handlers/
│   │   │       ├── terminal.ts           # Terminal I/O handler
│   │   │       └── resize.ts             # Terminal resize handler
│   │   ├── storage/
│   │   │   ├── index.ts                  # Storage initialization
│   │   │   ├── JsonStore.ts              # Generic JSON file store
│   │   │   └── stores/
│   │   │       ├── ProjectStore.ts       # Project data access
│   │   │       ├── ShellStore.ts         # Shell data access
│   │   │       └── SessionStore.ts       # Session data access
│   │   ├── config/
│   │   │   └── index.ts                  # Server configuration
│   │   ├── types/
│   │   │   └── index.ts                  # Server-side types
│   │   ├── utils/
│   │   │   ├── logger.ts                 # Pino logger setup
│   │   │   └── validation.ts             # Zod schemas
│   │   └── index.ts                      # Server entry point
│   │
│   └── shared/                    # Shared code between client/server
│       └── types/
│           └── index.ts                  # Shared type definitions
│
├── test/
│   ├── unit/
│   │   ├── client/                       # Frontend unit tests
│   │   └── server/                       # Backend unit tests
│   ├── integration/
│   │   └── api/                          # API integration tests
│   ├── e2e/
│   │   └── flows/                        # End-to-end tests
│   └── mocks/                            # Shared test mocks
│
├── scripts/
│   └── generate-guid.ts                  # GUID generation utility
│
├── design/
│   └── aiforge-design.md                 # This file
│
├── .github/
│   └── workflows/
│       └── ci.yml                        # CI/CD pipeline
│
├── .husky/
│   ├── commit-msg                        # Commitlint hook
│   ├── prepare-commit-msg                # Commitizen hook
│   └── pre-push                          # Lint and test hook
│
├── dist/                                 # Build output
├── coverage/                             # Test coverage
├── tmp/                                  # Temporary files
│
├── package.json
├── tsconfig.json                         # Base TypeScript config
├── tsconfig.client.json                  # Client TypeScript config
├── tsconfig.server.json                  # Server TypeScript config
├── vite.config.ts                        # Vite configuration
├── vitest.config.ts                      # Unit test config
├── vitest.config.integration.ts          # Integration test config
├── vitest.config.e2e.ts                  # E2E test config
├── eslint.config.mjs                     # ESLint configuration
├── commitlint.config.js                  # Commitlint configuration
├── knip.json                             # Dead code detection
├── .releaserc                            # Semantic release config
└── .gitignore
```

---

## Core Features

### 1. Project Management

Projects are directories on the server filesystem that contain code or AI agent workspaces.

#### Project Model

```typescript
interface Project {
  id: string;           // UUID
  name: string;         // Display name (derived from directory name)
  path: string;         // Absolute filesystem path
  createdAt: Date;
  updatedAt: Date;
}
```

#### Project Operations

| Operation | Description |
|-----------|-------------|
| **List** | Get all projects, sorted alphabetically |
| **Create** | Add a project by selecting a directory |
| **Delete** | Remove project from database (does not delete files) |
| **Rename** | Update display name (path unchanged) |

### 2. Shell Management

Shells are persistent terminal sessions associated with a project.

#### Shell Model

```typescript
interface Shell {
  id: string;           // UUID
  projectId: string;    // Parent project ID
  name: string;         // Display name (e.g., "bash-1", "claude-code")
  cwd: string;          // Current working directory
  pid: number | null;   // Process ID when active
  status: ShellStatus;  // 'active' | 'inactive' | 'error'
  createdAt: Date;
  updatedAt: Date;
}

type ShellStatus = 'active' | 'inactive' | 'error';
```

#### Shell Operations

| Operation | Description |
|-----------|-------------|
| **List** | Get shells for a project |
| **Create** | Spawn new PTY with project directory as cwd |
| **Delete** | Kill PTY process and remove from database |
| **Rename** | Update display name |
| **Restart** | Kill and respawn PTY process |

### 3. Terminal Emulation

The terminal connects the browser to server-side PTY sessions via WebSocket.

#### Terminal Features

- Full terminal emulation via xterm.js
- Auto-resize to fit container
- Clickable URLs
- Copy/paste support
- Scrollback buffer (configurable, default 10,000 lines)
- Session persistence (PTY stays alive when browser disconnects)

#### WebSocket Protocol

```typescript
// Client → Server
interface TerminalInput {
  type: 'input';
  shellId: string;
  data: string;
}

interface TerminalResize {
  type: 'resize';
  shellId: string;
  cols: number;
  rows: number;
}

// Server → Client
interface TerminalOutput {
  type: 'output';
  shellId: string;
  data: string;
}

interface TerminalStatus {
  type: 'status';
  shellId: string;
  status: ShellStatus;
  pid?: number;
}
```

### 4. Directory Browser

A server-side directory browser for selecting project directories.

#### Directory Browser Features

- Start from configurable root (default: user home)
- Navigate up/down directory tree
- Show only directories (no files)
- Filter hidden directories (configurable)
- Validate directory exists and is readable

---

## API Design

### REST Endpoints

#### Authentication

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Validate GUID and set cookie |
| `POST` | `/api/auth/logout` | Clear auth cookie |
| `GET` | `/api/auth/status` | Check authentication status |

#### Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create new project |
| `GET` | `/api/projects/:id` | Get project details |
| `PATCH` | `/api/projects/:id` | Update project |
| `DELETE` | `/api/projects/:id` | Delete project |

#### Shells

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:projectId/shells` | List shells for project |
| `POST` | `/api/projects/:projectId/shells` | Create new shell |
| `GET` | `/api/shells/:id` | Get shell details |
| `PATCH` | `/api/shells/:id` | Update shell |
| `DELETE` | `/api/shells/:id` | Delete shell |
| `POST` | `/api/shells/:id/restart` | Restart shell PTY |

#### Filesystem

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/filesystem/browse` | Browse directory (query: `path`) |
| `GET` | `/api/filesystem/validate` | Validate path exists (query: `path`) |

### WebSocket Endpoints

| Path | Description |
|------|-------------|
| `/ws/terminal` | Terminal I/O multiplexed by shellId |

---

## Authentication

### GUID Token System

Authentication uses a pre-generated GUID that acts as an access key.

#### Setup Process

1. Admin generates GUID using `npm run generate-guid`
2. GUID is stored in server configuration (environment variable or config file)
3. GUID is shared with authorized users out-of-band

#### Login Flow

```
┌─────────┐                    ┌─────────┐
│ Browser │                    │ Server  │
└────┬────┘                    └────┬────┘
     │                              │
     │  1. GET / (no cookie)        │
     │─────────────────────────────>│
     │                              │
     │  2. 401 + Redirect to /login │
     │<─────────────────────────────│
     │                              │
     │  3. POST /api/auth/login     │
     │     { guid: "..." }          │
     │─────────────────────────────>│
     │                              │
     │  4. Validate GUID            │
     │  5. Generate session token   │
     │                              │
     │  6. 200 + Set-Cookie         │
     │     (httpOnly, secure,       │
     │      sameSite, maxAge=30d)   │
     │<─────────────────────────────│
     │                              │
     │  7. Redirect to /            │
     │─────────────────────────────>│
     │                              │
```

#### Cookie Configuration

```typescript
const cookieOptions = {
  httpOnly: true,           // Not accessible via JavaScript
  secure: true,             // HTTPS only (configurable for dev)
  sameSite: 'strict',       // CSRF protection
  maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
  path: '/',
};
```

#### Security Considerations

- GUID should be cryptographically random (UUID v4)
- Support multiple GUIDs for multiple users (future)
- Rate limiting on login attempts
- Session invalidation on server restart (optional)

---

## Data Storage

All application data is stored in JSON files within the `~/.aiforge/` directory.

### Storage Directory Structure

```
~/.aiforge/
├── config.json           # Server configuration (optional override)
├── data/
│   ├── projects.json     # All projects
│   ├── shells.json       # All shells
│   └── sessions.json     # Active sessions
└── logs/                 # Log files (if file logging enabled)
```

### JSON File Schemas

#### projects.json

```typescript
interface ProjectsFile {
  version: 1;
  projects: Project[];
}

// Example:
{
  "version": 1,
  "projects": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "my-app",
      "path": "/home/user/projects/my-app",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

#### shells.json

```typescript
interface ShellsFile {
  version: 1;
  shells: Shell[];
}

// Example:
{
  "version": 1,
  "shells": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "projectId": "550e8400-e29b-41d4-a716-446655440000",
      "name": "bash-1",
      "cwd": "/home/user/projects/my-app",
      "status": "inactive",
      "createdAt": "2024-01-15T10:35:00.000Z",
      "updatedAt": "2024-01-15T10:35:00.000Z"
    }
  ]
}
```

#### sessions.json

```typescript
interface SessionsFile {
  version: 1;
  sessions: Session[];
}

interface Session {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

// Example:
{
  "version": 1,
  "sessions": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "token": "abc123...",
      "createdAt": "2024-01-15T08:00:00.000Z",
      "expiresAt": "2024-02-14T08:00:00.000Z"
    }
  ]
}
```

### JsonStore Class

A generic class for managing JSON file persistence with atomic writes and file locking.

```typescript
interface JsonStoreOptions<T> {
  filePath: string;
  defaultValue: T;
  schema?: ZodSchema<T>;  // Optional validation
}

class JsonStore<T> {
  constructor(options: JsonStoreOptions<T>);

  // Read entire store
  read(): Promise<T>;

  // Write entire store (atomic write with temp file)
  write(data: T): Promise<void>;

  // Update with a function (read-modify-write with lock)
  update(fn: (data: T) => T): Promise<T>;
}
```

### Storage Considerations

- **Atomic Writes**: Write to temp file, then rename to prevent corruption
- **File Locking**: Use `proper-lockfile` or similar for concurrent access safety
- **Initialization**: Create directory and empty files on first run
- **Backup**: Consider periodic backup of data files
- **Cleanup**: Remove expired sessions on startup and periodically

---

## Frontend Components

### Layout Components

#### AppShell

Main application layout using Mantine's AppShell component.

```typescript
interface AppShellProps {
  // Uses Mantine AppShell with:
  // - Fixed left sidebar (250px)
  // - Main content area for terminal
  // - No header (sidebar contains header content)
}
```

#### Sidebar

Left sidebar with project list and controls.

```typescript
interface SidebarProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  onAddProject: () => void;
}
```

### Project Components

#### ProjectList

Alphabetically sorted list of collapsible project entries.

```typescript
interface ProjectListProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (id: string) => void;
}
```

#### ProjectItem

Single project entry with expand/collapse for shells.

```typescript
interface ProjectItemProps {
  project: Project;
  shells: Shell[];
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onAddShell: () => void;
  onDeleteShell: (id: string) => void;
}
```

#### AddProjectModal

Modal dialog for selecting a directory from the server filesystem.

```typescript
interface AddProjectModalProps {
  opened: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}
```

Features:
- Breadcrumb navigation
- Directory list with icons
- "Select This Directory" button
- Keyboard navigation (arrow keys, Enter)

### Terminal Components

#### Terminal

xterm.js wrapper component.

```typescript
interface TerminalProps {
  shellId: string;
  onReady: (terminal: Terminal) => void;
}
```

Features:
- Auto-fit to container on resize
- WebSocket connection management
- Reconnection handling
- Copy/paste via context menu

#### TerminalCanvas

Container for the active terminal display.

```typescript
interface TerminalCanvasProps {
  activeShellId: string | null;
}
```

### Auth Components

#### LoginForm

GUID input form for authentication.

```typescript
interface LoginFormProps {
  onLogin: (guid: string) => Promise<void>;
  error: string | null;
}
```

Features:
- Single text input for GUID
- Paste-friendly (accepts UUID format)
- Loading state during validation
- Error display

---

## Configuration

### Server Configuration

Configuration via environment variables and/or config file (`~/.aiforge/config.json`).

```typescript
interface ServerConfig {
  // Server
  port: number;                    // Default: random 9000-9099
  host: string;                    // Default: '0.0.0.0'

  // Authentication
  authGuid: string;                // Required: access GUID
  cookieSecret: string;            // Required: cookie signing secret
  sessionMaxAge: number;           // Default: 30 days (ms)

  // Data Storage
  dataDir: string;                 // Default: ~/.aiforge/data

  // PTY
  defaultShell: string;            // Default: $SHELL or /bin/bash
  scrollbackLines: number;         // Default: 10000

  // Filesystem
  browseRoot: string;              // Default: $HOME
  showHiddenDirs: boolean;         // Default: false

  // Logging
  logLevel: string;                // Default: 'info'
  logFile: string | null;          // Default: null (stdout only)
}
```

### Environment Variables

```bash
# Server
AIFORGE_PORT=9042
AIFORGE_HOST=0.0.0.0

# Authentication
AIFORGE_AUTH_GUID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AIFORGE_COOKIE_SECRET=your-secret-key

# Data Storage
AIFORGE_DATA_DIR=/path/to/data

# PTY
AIFORGE_DEFAULT_SHELL=/bin/zsh
AIFORGE_SCROLLBACK=10000

# Filesystem
AIFORGE_BROWSE_ROOT=/home/user
AIFORGE_SHOW_HIDDEN=false

# Logging
AIFORGE_LOG_LEVEL=info
AIFORGE_LOG_FILE=/var/log/aiforge.log
```

---

## Build and Development

### NPM Scripts

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:client": "vite",
    "dev:server": "tsx watch src/server/index.ts",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build",
    "build:server": "tsc -p tsconfig.server.json",
    "start": "node dist/server/index.js",
    "lint": "eslint src test",
    "lint:fix": "eslint src test --fix",
    "test": "vitest run",
    "test:unit": "vitest run --config vitest.config.ts",
    "test:integration": "vitest run --config vitest.config.integration.ts",
    "test:e2e": "playwright test",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "generate-guid": "tsx scripts/generate-guid.ts",
    "prepare": "husky",
    "knip": "knip",
    "commit": "cz"
  }
}
```

### Development Workflow

1. **Start Development**
   ```bash
   npm run dev
   ```
   - Starts Vite dev server for frontend (hot reload)
   - Starts tsx watch for backend (auto-restart)

2. **Run Tests**
   ```bash
   npm test              # All tests
   npm run test:unit     # Unit tests only
   npm run test:e2e      # E2E tests only
   npm run test:coverage # With coverage
   ```

3. **Lint Code**
   ```bash
   npm run lint          # Check for issues
   npm run lint:fix      # Auto-fix issues
   ```

4. **Build for Production**
   ```bash
   npm run build         # Build client and server
   npm start             # Start production server
   ```

### CI/CD Pipeline

GitHub Actions workflow with these stages:

1. **Lint** - ESLint checks
2. **Test** - Unit and integration tests (Node 20 and 22)
3. **Coverage** - Coverage report to Coveralls
4. **Release** - Semantic release (master/main only)

### Daemon Management

Using PM2 for production deployment:

```bash
# Start as daemon
pm2 start dist/server/index.js --name aiforge

# View logs
pm2 logs aiforge

# Restart
pm2 restart aiforge

# Stop
pm2 stop aiforge

# Auto-start on boot
pm2 startup
pm2 save
```

---

## Testing Strategy

Testing is critical for production reliability, especially given AIForge's architecture involving real-time WebSocket communication, PTY process management, and filesystem operations. This section outlines a comprehensive testing approach.

### Testing Philosophy

1. **Test Behavior, Not Implementation** - Focus on what the system does, not how it does it
2. **Prefer Integration Over Mocks** - Use real components when practical; mock only at system boundaries
3. **Fast Feedback Loop** - Unit tests run in milliseconds, integration tests in seconds
4. **Production Parity** - Test environment should mirror production as closely as possible
5. **Deterministic Tests** - No flaky tests; use explicit waits and proper async handling

### Test Categories

| Category | Scope | Speed | When to Run |
|----------|-------|-------|-------------|
| **Unit** | Single function/class | < 10ms each | Every save (watch mode) |
| **Integration** | Multiple components | < 1s each | Pre-commit, CI |
| **E2E** | Full system | < 30s each | Pre-push, CI |
| **Live Integration** | Real PTY/processes | < 60s each | CI, manual |

### Project Test Structure

```
test/
├── unit/
│   ├── client/
│   │   ├── components/          # React component tests
│   │   ├── hooks/               # Custom hook tests
│   │   ├── stores/              # Zustand store tests
│   │   └── services/            # API client tests
│   └── server/
│       ├── services/            # Business logic tests
│       ├── api/                 # Route handler tests
│       └── storage/             # JsonStore tests
├── integration/
│   ├── api/                     # REST API tests with real server
│   ├── websocket/               # WebSocket protocol tests
│   └── pty/                     # PTY integration tests
├── e2e/
│   └── flows/                   # Full user journey tests
├── fixtures/                    # Shared test data
│   ├── projects.json
│   ├── shells.json
│   └── sessions.json
├── mocks/                       # Shared mock implementations
│   ├── pty.ts                   # Mock PTY for unit tests
│   ├── websocket.ts             # Mock WebSocket client/server
│   ├── filesystem.ts            # Mock fs operations
│   └── xterm.ts                 # Mock xterm.js Terminal
└── helpers/
    ├── server.ts                # Test server utilities
    ├── client.ts                # Test client utilities
    ├── wait.ts                  # Async wait helpers
    └── cleanup.ts               # Resource cleanup utilities
```

### Unit Testing

Unit tests verify individual functions and classes in isolation.

#### Server Unit Tests

```typescript
// test/unit/server/services/ProjectService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectService } from '@/server/services/project/ProjectService';
import { createMockStore } from '@test/mocks/store';

describe('ProjectService', () => {
  let service: ProjectService;
  let mockStore: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    mockStore = createMockStore();
    service = new ProjectService(mockStore);
  });

  describe('create', () => {
    it('creates a project with valid path', async () => {
      vi.spyOn(fs, 'access').mockResolvedValue(undefined);

      const project = await service.create({ path: '/home/user/myproject' });

      expect(project.name).toBe('myproject');
      expect(project.path).toBe('/home/user/myproject');
      expect(mockStore.update).toHaveBeenCalled();
    });

    it('rejects invalid paths', async () => {
      vi.spyOn(fs, 'access').mockRejectedValue(new Error('ENOENT'));

      await expect(service.create({ path: '/nonexistent' }))
        .rejects.toThrow('Directory does not exist');
    });
  });
});
```

#### Client Unit Tests

```typescript
// test/unit/client/hooks/useProjects.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProjects } from '@/client/hooks/useProjects';
import { createMockApi } from '@test/mocks/api';

describe('useProjects', () => {
  it('fetches projects on mount', async () => {
    const mockApi = createMockApi({
      projects: [{ id: '1', name: 'test', path: '/test' }]
    });

    const { result } = renderHook(() => useProjects(), {
      wrapper: createTestWrapper({ api: mockApi })
    });

    await waitFor(() => {
      expect(result.current.projects).toHaveLength(1);
    });
  });
});
```

### Integration Testing

Integration tests verify multiple components working together with minimal mocking.

#### API Integration Tests

Use a real Express server with an in-memory data store:

```typescript
// test/integration/api/projects.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServer } from '@test/helpers/server';
import { request } from 'supertest';

describe('Projects API', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer({
      dataDir: ':memory:', // In-memory storage
      authGuid: 'test-guid'
    });
  });

  afterAll(async () => {
    await server.close();
  });

  describe('POST /api/projects', () => {
    it('creates a project', async () => {
      const response = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: server.tempDir })
        .expect(201);

      expect(response.body.project.path).toBe(server.tempDir);
    });

    it('requires authentication', async () => {
      await request(server.app)
        .post('/api/projects')
        .send({ path: '/tmp' })
        .expect(401);
    });
  });
});
```

#### WebSocket Integration Tests

Test the WebSocket protocol with real connections:

```typescript
// test/integration/websocket/terminal.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServer } from '@test/helpers/server';
import { WebSocket } from 'ws';
import { waitForMessage, sendMessage } from '@test/helpers/websocket';

describe('Terminal WebSocket', () => {
  let server: TestServer;
  let ws: WebSocket;
  let shellId: string;

  beforeAll(async () => {
    server = await createTestServer();
    shellId = await server.createTestShell();
    ws = await server.connectWebSocket();
  });

  afterAll(async () => {
    ws.close();
    await server.close();
  });

  it('receives output from PTY', async () => {
    // Send input to shell
    sendMessage(ws, {
      type: 'input',
      shellId,
      data: 'echo "hello"\r'
    });

    // Wait for output
    const output = await waitForMessage(ws, {
      type: 'output',
      shellId,
      timeout: 5000
    });

    expect(output.data).toContain('hello');
  });

  it('handles terminal resize', async () => {
    sendMessage(ws, {
      type: 'resize',
      shellId,
      cols: 120,
      rows: 40
    });

    // Verify resize was applied (check via stty)
    sendMessage(ws, {
      type: 'input',
      shellId,
      data: 'stty size\r'
    });

    const output = await waitForMessage(ws, {
      type: 'output',
      shellId,
      timeout: 5000
    });

    expect(output.data).toContain('40 120');
  });
});
```

#### PTY Integration Tests

Test real PTY behavior with actual shell processes:

```typescript
// test/integration/pty/PtyManager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PtyManager } from '@/server/services/pty/PtyManager';
import { waitForOutput } from '@test/helpers/pty';

describe('PtyManager (Live)', () => {
  let manager: PtyManager;

  beforeEach(() => {
    manager = new PtyManager();
  });

  afterEach(async () => {
    await manager.killAll();
  });

  it('spawns a real shell process', async () => {
    const session = await manager.spawn({
      cwd: '/tmp',
      shell: '/bin/bash'
    });

    expect(session.pid).toBeGreaterThan(0);

    // Verify shell is responsive
    session.write('echo $SHELL\r');
    const output = await waitForOutput(session, '/bin/bash', 5000);
    expect(output).toContain('/bin/bash');
  });

  it('survives rapid input', async () => {
    const session = await manager.spawn({ cwd: '/tmp' });

    // Send rapid input
    for (let i = 0; i < 100; i++) {
      session.write(`echo ${i}\r`);
    }

    // Should not crash; wait for last output
    const output = await waitForOutput(session, '99', 10000);
    expect(output).toContain('99');
  });

  it('handles process exit gracefully', async () => {
    const session = await manager.spawn({ cwd: '/tmp' });
    const exitPromise = new Promise(resolve => session.onExit(resolve));

    session.write('exit\r');

    const exitCode = await exitPromise;
    expect(exitCode).toBe(0);
  });
});
```

### E2E Testing

End-to-end tests use Playwright to test the full application from the browser.

#### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false, // Sequential for terminal tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for PTY tests
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:9050',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run start:test',
    url: 'http://localhost:9050',
    reuseExistingServer: !process.env.CI,
    env: {
      AIFORGE_PORT: '9050',
      AIFORGE_AUTH_GUID: 'e2e-test-guid',
      AIFORGE_DATA_DIR: './.test-data',
    },
  },
});
```

#### E2E Test Examples

```typescript
// test/e2e/flows/terminal.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Terminal Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[data-testid="guid-input"]', 'e2e-test-guid');
    await page.click('[data-testid="login-button"]');
    await expect(page).toHaveURL('/');
  });

  test('creates project and shell, types commands', async ({ page }) => {
    // Create project
    await page.click('[data-testid="add-project"]');
    await page.fill('[data-testid="path-input"]', '/tmp/e2e-test');
    await page.click('[data-testid="select-directory"]');

    // Verify project appears
    await expect(page.locator('[data-testid="project-item"]')).toContainText('e2e-test');

    // Create shell
    await page.click('[data-testid="add-shell"]');
    await expect(page.locator('[data-testid="terminal"]')).toBeVisible();

    // Type command and verify output
    const terminal = page.locator('[data-testid="terminal"]');
    await terminal.click();
    await page.keyboard.type('echo "playwright test"');
    await page.keyboard.press('Enter');

    // Wait for output
    await expect(terminal).toContainText('playwright test', { timeout: 10000 });
  });

  test('reconnects WebSocket after disconnect', async ({ page }) => {
    // Create a shell first
    await page.click('[data-testid="add-project"]');
    await page.fill('[data-testid="path-input"]', '/tmp');
    await page.click('[data-testid="select-directory"]');
    await page.click('[data-testid="add-shell"]');

    // Force WebSocket disconnect
    await page.evaluate(() => {
      (window as any).__ws?.close();
    });

    // Wait for reconnection indicator
    await expect(page.locator('[data-testid="connection-status"]'))
      .toHaveAttribute('data-status', 'reconnecting');

    // Should auto-reconnect
    await expect(page.locator('[data-testid="connection-status"]'))
      .toHaveAttribute('data-status', 'connected', { timeout: 10000 });

    // Terminal should still work
    const terminal = page.locator('[data-testid="terminal"]');
    await terminal.click();
    await page.keyboard.type('echo "reconnected"');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('reconnected');
  });
});
```

### Mock Implementations

#### Mock PTY

For unit tests that don't need real processes:

```typescript
// test/mocks/pty.ts
import { EventEmitter } from 'events';

export class MockPty extends EventEmitter {
  pid = 12345;
  cols = 80;
  rows = 24;
  private buffer: string[] = [];

  constructor(private options: { responses?: Record<string, string> } = {}) {
    super();
  }

  write(data: string) {
    this.buffer.push(data);

    // Simulate response based on input
    const responses = this.options.responses || {};
    for (const [pattern, response] of Object.entries(responses)) {
      if (data.includes(pattern)) {
        setTimeout(() => this.emit('data', response), 10);
      }
    }
  }

  resize(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
  }

  kill() {
    this.emit('exit', 0, null);
  }

  getBuffer() {
    return this.buffer;
  }
}

export function createMockPtyFactory(options?: { responses?: Record<string, string> }) {
  return {
    spawn: vi.fn(() => new MockPty(options))
  };
}
```

#### Mock WebSocket

For testing WebSocket client logic:

```typescript
// test/mocks/websocket.ts
import { EventEmitter } from 'events';

export class MockWebSocket extends EventEmitter {
  readyState = 1; // OPEN
  sent: any[] = [];

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = 3; // CLOSED
    this.emit('close');
  }

  // Test helpers
  simulateMessage(data: object) {
    this.emit('message', { data: JSON.stringify(data) });
  }

  simulateError(error: Error) {
    this.emit('error', error);
  }
}

export function createMockWebSocket() {
  const ws = new MockWebSocket();
  setTimeout(() => ws.emit('open'), 0);
  return ws;
}
```

#### Mock File System

For testing without touching real files:

```typescript
// test/mocks/filesystem.ts
import { vi } from 'vitest';
import { Volume, createFsFromVolume } from 'memfs';

export function createMockFs(initialFiles: Record<string, string> = {}) {
  const vol = Volume.fromJSON(initialFiles);
  return createFsFromVolume(vol);
}

export function mockFsModule(initialFiles: Record<string, string> = {}) {
  const mockFs = createMockFs(initialFiles);

  vi.mock('fs/promises', () => mockFs.promises);
  vi.mock('fs', () => mockFs);

  return mockFs;
}
```

### Test Server Utilities

#### Creating Test Servers

```typescript
// test/helpers/server.ts
import { createServer, Server } from '@/server';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { WebSocket } from 'ws';

export interface TestServer {
  app: Express;
  server: Server;
  port: number;
  tempDir: string;
  authCookie: string;

  close(): Promise<void>;
  createTestProject(path?: string): Promise<string>;
  createTestShell(projectId?: string): Promise<string>;
  connectWebSocket(): Promise<WebSocket>;
}

export async function createTestServer(options: {
  dataDir?: string;
  authGuid?: string;
  port?: number;
} = {}): Promise<TestServer> {
  const tempDir = await mkdtemp(join(tmpdir(), 'aiforge-test-'));
  const port = options.port || (9000 + Math.floor(Math.random() * 99));
  const authGuid = options.authGuid || 'test-guid-' + Date.now();

  const { app, server } = await createServer({
    port,
    dataDir: options.dataDir === ':memory:' ? tempDir : (options.dataDir || tempDir),
    authGuid,
  });

  // Generate auth cookie
  const authCookie = await getAuthCookie(app, authGuid);

  return {
    app,
    server,
    port,
    tempDir,
    authCookie,

    async close() {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(tempDir, { recursive: true, force: true });
    },

    async createTestProject(path = tempDir) {
      const res = await request(app)
        .post('/api/projects')
        .set('Cookie', authCookie)
        .send({ path });
      return res.body.project.id;
    },

    async createTestShell(projectId?: string) {
      const pid = projectId || await this.createTestProject();
      const res = await request(app)
        .post(`/api/projects/${pid}/shells`)
        .set('Cookie', authCookie)
        .send({});
      return res.body.shell.id;
    },

    async connectWebSocket() {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}/ws/terminal`, {
          headers: { Cookie: authCookie }
        });
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
      });
    }
  };
}
```

### Async Test Helpers

```typescript
// test/helpers/wait.ts

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await sleep(interval);
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Wait for WebSocket message matching criteria
 */
export async function waitForMessage(
  ws: WebSocket,
  match: { type?: string; shellId?: string; timeout?: number }
): Promise<any> {
  const { timeout = 5000, ...criteria } = match;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timeout waiting for message: ${JSON.stringify(criteria)}`));
    }, timeout);

    function handler(event: MessageEvent) {
      const data = JSON.parse(event.data);
      const matches = Object.entries(criteria).every(
        ([key, value]) => data[key] === value
      );
      if (matches) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(data);
      }
    }

    ws.on('message', handler);
  });
}

/**
 * Wait for PTY output containing text
 */
export async function waitForOutput(
  session: PtySession,
  text: string,
  timeout = 5000
): Promise<string> {
  let buffer = '';

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.off('data', handler);
      reject(new Error(`Timeout waiting for "${text}" in output. Got: ${buffer}`));
    }, timeout);

    function handler(data: string) {
      buffer += data;
      if (buffer.includes(text)) {
        clearTimeout(timer);
        session.off('data', handler);
        resolve(buffer);
      }
    }

    session.on('data', handler);
  });
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
```

### CI Testing Configuration

#### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: ['20', '22']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: codecov/codecov-action@v4
        if: matrix.node == '20'

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run test:integration
        env:
          AIFORGE_LOG_LEVEL: error

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run test:e2e
        env:
          AIFORGE_LOG_LEVEL: error
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

  live-pty-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run test:integration -- --grep "Live"
        env:
          AIFORGE_LOG_LEVEL: error
          # Allocate a real PTY in CI
          FORCE_TTY: '1'
```

### Vitest Configurations

#### Unit Tests

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/types.ts']
    },
    alias: {
      '@': resolve(__dirname, './src'),
      '@test': resolve(__dirname, './test')
    }
  }
});
```

#### Integration Tests

```typescript
// vitest.config.integration.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 30000, // Longer timeout for real I/O
    hookTimeout: 30000,
    pool: 'forks', // Isolate tests with real processes
    poolOptions: {
      forks: {
        singleFork: true // Run sequentially for PTY tests
      }
    },
    alias: {
      '@': resolve(__dirname, './src'),
      '@test': resolve(__dirname, './test')
    }
  }
});
```

### Testing Best Practices

#### 1. Test Isolation

```typescript
// Each test should clean up after itself
describe('ShellService', () => {
  let service: ShellService;
  let cleanupFns: Array<() => Promise<void>> = [];

  afterEach(async () => {
    // Run all cleanup functions
    await Promise.all(cleanupFns.map(fn => fn()));
    cleanupFns = [];
  });

  it('spawns a shell', async () => {
    const shell = await service.create({ projectId: '...' });
    cleanupFns.push(() => service.delete(shell.id));

    expect(shell.status).toBe('active');
  });
});
```

#### 2. Explicit Waits Over Sleep

```typescript
// Bad: arbitrary sleep
await sleep(1000);
expect(output).toContain('hello');

// Good: explicit condition
await waitFor(() => output.includes('hello'), { timeout: 5000 });
```

#### 3. Descriptive Test Names

```typescript
// Bad
it('works', () => { ... });

// Good
it('returns 401 when auth cookie is missing', () => { ... });
it('reconnects WebSocket within 5 seconds after disconnect', () => { ... });
```

#### 4. Test Data Factories

```typescript
// test/fixtures/factories.ts
export function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: randomUUID(),
    name: 'test-project',
    path: '/tmp/test',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

export function createShell(overrides: Partial<Shell> = {}): Shell {
  return {
    id: randomUUID(),
    projectId: randomUUID(),
    name: 'bash-1',
    cwd: '/tmp',
    pid: null,
    status: 'inactive',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}
```

### Coverage Requirements

| Category | Minimum Coverage |
|----------|-----------------|
| **Statements** | 80% |
| **Branches** | 75% |
| **Functions** | 80% |
| **Lines** | 80% |

Critical paths requiring 100% coverage:
- Authentication middleware
- WebSocket message handlers
- PTY spawn/kill logic
- Data store read/write operations

---

## Implementation Notes

### PTY Management

The `node-pty-prebuilt-multiarch` package provides cross-platform PTY support. Key considerations:

- Each shell gets its own PTY instance
- PTY processes survive browser disconnects
- Implement cleanup for orphaned PTYs on server restart
- Handle PTY exit gracefully (update shell status)

### WebSocket Connection

- Single WebSocket connection per client
- Multiplex multiple shells over one connection
- Implement heartbeat/ping for connection health
- Auto-reconnect with exponential backoff

### State Persistence

- Projects and shells persist in JSON files (`~/.aiforge/data/`)
- JSON files use atomic writes (temp file + rename) to prevent corruption
- PTY scrollback is ephemeral (lost on server restart)
- Consider future: save/restore scrollback to filesystem

### Security

- GUID authentication is simple but effective for personal use
- All API routes require authentication except `/api/auth/login`
- WebSocket connections require valid session cookie
- Directory browser restricted to `browseRoot`
- No shell injection via API (paths validated, not executed)

---

## Future Enhancements

The following features are out of scope for initial implementation but noted for future consideration:

1. **Multiple Users** - Support multiple GUIDs with user identification
2. **Shell Tabs** - Multiple shells visible simultaneously in tabs
3. **Session Recording** - Save and replay terminal sessions
4. **Search** - Full-text search across terminal history
5. **Notifications** - Alert when long-running commands complete
6. **Themes** - Multiple terminal color schemes
7. **Split View** - Multiple terminals in split panes
8. **Command Palette** - Quick actions via keyboard shortcut
9. **Mobile Support** - Responsive design for tablets
10. **Collaborative** - Multiple users viewing same terminal (view-only)
