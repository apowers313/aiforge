# Implementation Plan for AIForge

## Overview

AIForge is a web-based IDE for 100% agentic coding that focuses on managing agents rather than files and code. This implementation plan follows a **frontend-first MVP approach**, where each phase delivers a working, testable application that builds incrementally toward the full product.

**Total Phases**: 7 (plus Phase 4.5 for state management migration, Phase 4.75 for cross-device workspace sync)
**Approach**: Start with a fully functional frontend using mock data, then progressively connect real backend services

---

## Phase Breakdown

### Phase 1: Project Scaffolding and Infrastructure

**Objective**: Set up the complete project structure, build tooling, and development environment. Establish the foundation for both frontend and backend development.

**Tests to Write First**:
- `test/unit/server/config/index.test.ts`: Configuration loading
  ```typescript
  describe('ServerConfig', () => {
    it('loads default configuration values', () => {
      const config = loadConfig();
      expect(config.host).toBe('0.0.0.0');
      expect(config.scrollbackLines).toBe(10000);
    });

    it('overrides defaults with environment variables', () => {
      process.env.AIFORGE_PORT = '9042';
      const config = loadConfig();
      expect(config.port).toBe(9042);
    });

    it('selects random port in allowed range', () => {
      const config = loadConfig();
      expect(config.port).toBeGreaterThanOrEqual(9000);
      expect(config.port).toBeLessThanOrEqual(9099);
    });
  });
  ```

- `test/unit/shared/types/validation.test.ts`: Type validation
  ```typescript
  describe('Type Validation', () => {
    it('validates Project schema', () => {
      const valid = ProjectSchema.safeParse({
        id: 'uuid-here',
        name: 'my-project',
        path: '/home/user/project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      expect(valid.success).toBe(true);
    });

    it('rejects invalid Project', () => {
      const invalid = ProjectSchema.safeParse({ name: 'missing-fields' });
      expect(invalid.success).toBe(false);
    });
  });
  ```

**Implementation**:
- `package.json`: All dependencies and npm scripts
- `tsconfig.json`, `tsconfig.client.json`, `tsconfig.server.json`: TypeScript configs
- `vite.config.ts`: Vite configuration for React client
- `vitest.config.ts`: Test configuration
- `eslint.config.mjs`: ESLint flat config
- `.husky/`: Git hooks for linting and commits
- `commitlint.config.js`: Conventional commit enforcement
- `knip.json`: Dead code and unused dependency detection
- `.releaserc`: Semantic release configuration (based on servherd)
  ```json
  {
    "branches": ["master", "main"],
    "plugins": [
      "@semantic-release/commit-analyzer",
      "@semantic-release/release-notes-generator",
      "@semantic-release/changelog",
      ["@semantic-release/npm", {
        "npmPublish": true
      }],
      ["@semantic-release/git", {
        "assets": ["package.json", "package-lock.json", "CHANGELOG.md"],
        "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
      }],
      "@semantic-release/github"
    ]
  }
  ```
- `commitlint.config.js`: Commit message validation (based on servherd)
  ```javascript
  export default {
    parserPreset: "conventional-changelog-conventionalcommits",
    rules: {
      "body-leading-blank": [1, "always"],
      "body-max-line-length": [2, "always", 100],
      "footer-leading-blank": [1, "always"],
      "footer-max-line-length": [2, "always", 100],
      "header-max-length": [2, "always", 100],
      "scope-case": [2, "always", "lower-case"],
      "scope-enum": [
        2,
        "always",
        ["client", "server", "shared", "pty", "api", "auth", "storage", "test", "ci", "docs", "deps"],
      ],
      "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
      "subject-empty": [2, "never"],
      "subject-full-stop": [2, "never", "."],
      "type-case": [2, "always", "lower-case"],
      "type-empty": [2, "never"],
      "type-enum": [
        2,
        "always",
        ["build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "style", "test"],
      ],
    },
  };
  ```
- `.husky/commit-msg`: Commitlint validation hook
  ```bash
  npx --no-install commitlint --edit "$1"
  ```
- `.husky/prepare-commit-msg`: Commitizen hook (optional interactive prompt)
  ```bash
  exec < /dev/tty && npx cz --hook || true
  ```
- `.husky/pre-push`: Lint and test before push
  ```bash
  npm run lint
  npm test
  ```
- `src/server/config/index.ts`: Configuration module with:
  - Load from environment variables (AIFORGE_*)
  - Fall back to `~/.aiforge/config.json` if exists
  - Apply defaults for missing values
  - Random port selection in 9000-9099 range when not specified
  ```typescript
  // Config loading priority: ENV > config.json > defaults
  function loadConfig(): ServerConfig {
    const configFile = loadConfigFile();
    return {
      port: parseInt(process.env.AIFORGE_PORT || '') || configFile?.port || randomPort(),
      host: process.env.AIFORGE_HOST || configFile?.host || '0.0.0.0',
      authGuid: process.env.AIFORGE_AUTH_GUID || configFile?.authGuid || '',
      // ... etc
    };
  }

  function randomPort(): number {
    return 9000 + Math.floor(Math.random() * 100);
  }
  ```
- `src/server/utils/logger.ts`: Pino logger setup
- `src/shared/types/index.ts`: All shared type definitions (Project, Shell, Session, WebSocket messages)
- `src/shared/types/validation.ts`: Zod schemas for all types
- `index.html`: HTML entry point

**Dependencies** (versions based on servherd):
- Build: `vite`, `vitest`, `typescript ^5.x`, `tsx ^4.x`, `concurrently`
- Lint: `eslint ^9.x`, `@eslint/js ^9.x`, `typescript-eslint ^8.x`, `@stylistic/eslint-plugin ^2.x`
- Git Hooks & Commits:
  ```json
  "husky": "^9.1.7",
  "@commitlint/cli": "^20.3.1",
  "@commitlint/config-conventional": "^20.3.1",
  "commitizen": "^4.3.1",
  "cz-conventional-changelog": "^3.3.0",
  "conventional-changelog-conventionalcommits": "^9.1.0"
  ```
- Semantic Release:
  ```json
  "semantic-release": "^25.0.0",
  "@semantic-release/changelog": "^6.0.3",
  "@semantic-release/commit-analyzer": "^13.0.1",
  "@semantic-release/git": "^10.0.1",
  "@semantic-release/github": "^11.0.3",
  "@semantic-release/npm": "^13.1.0",
  "@semantic-release/release-notes-generator": "^14.0.3"
  ```
- Other: `pino`, `zod`, `knip ^5.x`
- **package.json config sections**:
  ```json
  {
    "publishConfig": {
      "access": "public",
      "provenance": true
    },
    "config": {
      "commitizen": {
        "path": "cz-conventional-changelog"
      }
    },
    "scripts": {
      "prepublishOnly": "npm run lint && npm run build && npm run test",
      "commit": "cz",
      "prepare": "husky"
    }
  }
  ```
- Internal: None (first phase)

---

#### What Was Added

- Complete project scaffolding with TypeScript, Vite, and ESLint
- Shared type definitions for Project, Shell, Session, and WebSocket messages
- Zod validation schemas for all data types
- Git hooks for code quality enforcement
- Configuration system with environment variable support

#### How to Test

```bash
# Install dependencies
npm install

# Run linting
npm run lint

# Run unit tests
npm test

# Start development server (will show empty page)
npm run dev:client

# Verify TypeScript compilation
npx tsc --noEmit
```

**Expected Results**:
- All dependencies install without errors
- Lint passes with no warnings
- Tests pass
- Dev server starts on a port in 9000-9099 range
- TypeScript compiles without errors

---

### Phase 2: Frontend MVP with Mock Data

**Objective**: Build a fully functional frontend application using mock data and local state. Users can interact with the complete UI without any backend. This establishes the user experience before connecting real services.

**Tests to Write First**:
- `test/unit/client/stores/projectStore.test.ts`: Project state
  ```typescript
  describe('projectStore', () => {
    beforeEach(() => {
      useProjectStore.getState().reset();
    });

    it('starts with empty projects', () => {
      expect(useProjectStore.getState().projects).toEqual([]);
    });

    it('adds project to store', () => {
      useProjectStore.getState().addProject({
        id: '1',
        name: 'test',
        path: '/tmp/test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      expect(useProjectStore.getState().projects).toHaveLength(1);
    });

    it('removes project from store', () => {
      useProjectStore.getState().addProject({
        id: '1', name: 'test', path: '/tmp',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      useProjectStore.getState().removeProject('1');
      expect(useProjectStore.getState().projects).toHaveLength(0);
    });

    it('tracks selected project', () => {
      useProjectStore.getState().setSelectedProject('proj-1');
      expect(useProjectStore.getState().selectedProjectId).toBe('proj-1');
    });

    it('sorts projects alphabetically', () => {
      useProjectStore.getState().addProject({ id: '1', name: 'zebra', path: '/z', createdAt: '', updatedAt: '' });
      useProjectStore.getState().addProject({ id: '2', name: 'alpha', path: '/a', createdAt: '', updatedAt: '' });
      const sorted = useProjectStore.getState().sortedProjects;
      expect(sorted[0].name).toBe('alpha');
    });
  });
  ```

- `test/unit/client/stores/shellStore.test.ts`: Shell state
  ```typescript
  describe('shellStore', () => {
    beforeEach(() => {
      useShellStore.getState().reset();
    });

    it('adds shell to store', () => {
      useShellStore.getState().addShell({
        id: 'shell-1',
        projectId: 'proj-1',
        name: 'bash-1',
        cwd: '/tmp',
        status: 'inactive',
        pid: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      expect(useShellStore.getState().shells).toHaveLength(1);
    });

    it('filters shells by project', () => {
      useShellStore.getState().addShell({ id: '1', projectId: 'p1', name: 's1', cwd: '/', status: 'inactive', pid: null, createdAt: '', updatedAt: '' });
      useShellStore.getState().addShell({ id: '2', projectId: 'p2', name: 's2', cwd: '/', status: 'inactive', pid: null, createdAt: '', updatedAt: '' });
      const shells = useShellStore.getState().getShellsByProject('p1');
      expect(shells).toHaveLength(1);
      expect(shells[0].id).toBe('1');
    });

    it('updates shell status', () => {
      useShellStore.getState().addShell({ id: '1', projectId: 'p1', name: 's1', cwd: '/', status: 'inactive', pid: null, createdAt: '', updatedAt: '' });
      useShellStore.getState().updateShell('1', { status: 'active', pid: 12345 });
      expect(useShellStore.getState().shells[0].status).toBe('active');
    });

    it('tracks active shell', () => {
      useShellStore.getState().setActiveShell('shell-1');
      expect(useShellStore.getState().activeShellId).toBe('shell-1');
    });
  });
  ```

- `test/unit/client/components/layout/Sidebar.test.tsx`: Sidebar component
  ```typescript
  describe('Sidebar', () => {
    it('renders add project button', () => {
      render(<Sidebar />);
      expect(screen.getByTestId('add-project-button')).toBeInTheDocument();
    });

    it('renders project list', () => {
      useProjectStore.getState().addProject({
        id: '1', name: 'my-project', path: '/tmp',
        createdAt: '', updatedAt: ''
      });
      render(<Sidebar />);
      expect(screen.getByText('my-project')).toBeInTheDocument();
    });

    it('expands project to show shells', async () => {
      useProjectStore.getState().addProject({ id: '1', name: 'proj', path: '/tmp', createdAt: '', updatedAt: '' });
      useShellStore.getState().addShell({ id: 's1', projectId: '1', name: 'bash-1', cwd: '/', status: 'inactive', pid: null, createdAt: '', updatedAt: '' });

      render(<Sidebar />);
      await userEvent.click(screen.getByText('proj'));

      expect(screen.getByText('bash-1')).toBeInTheDocument();
    });
  });
  ```

- `test/unit/client/components/projects/AddProjectModal.test.tsx`: Directory browser
  ```typescript
  describe('AddProjectModal', () => {
    it('renders when opened', () => {
      render(<AddProjectModal opened={true} onClose={vi.fn()} onSelect={vi.fn()} />);
      expect(screen.getByTestId('directory-browser')).toBeInTheDocument();
    });

    it('shows mock directory structure', () => {
      render(<AddProjectModal opened={true} onClose={vi.fn()} onSelect={vi.fn()} />);
      // Mock directories should be visible
      expect(screen.getByTestId('current-path')).toHaveTextContent('/home');
    });

    it('navigates into directory on click', async () => {
      render(<AddProjectModal opened={true} onClose={vi.fn()} onSelect={vi.fn()} />);
      await userEvent.click(screen.getByText('projects'));
      expect(screen.getByTestId('current-path')).toHaveTextContent('/home/projects');
    });

    it('calls onSelect with path when directory selected', async () => {
      const onSelect = vi.fn();
      render(<AddProjectModal opened={true} onClose={vi.fn()} onSelect={onSelect} />);
      await userEvent.click(screen.getByText('projects'));
      await userEvent.click(screen.getByTestId('select-directory-button'));
      expect(onSelect).toHaveBeenCalledWith('/home/projects');
    });
  });
  ```

- `test/unit/client/components/terminal/MockTerminal.test.tsx`: Mock terminal
  ```typescript
  describe('MockTerminal', () => {
    it('renders terminal container', () => {
      render(<MockTerminal shellId="shell-1" />);
      expect(screen.getByTestId('terminal-container')).toBeInTheDocument();
    });

    it('displays shell name in header', () => {
      useShellStore.getState().addShell({
        id: 'shell-1', projectId: 'p1', name: 'claude-code',
        cwd: '/project', status: 'active', pid: 1234,
        createdAt: '', updatedAt: ''
      });
      render(<MockTerminal shellId="shell-1" />);
      expect(screen.getByText('claude-code')).toBeInTheDocument();
    });

    it('shows mock prompt', () => {
      render(<MockTerminal shellId="shell-1" />);
      expect(screen.getByTestId('terminal-content')).toHaveTextContent('$');
    });

    it('simulates command input', async () => {
      render(<MockTerminal shellId="shell-1" />);
      const input = screen.getByTestId('terminal-input');
      await userEvent.type(input, 'ls -la{enter}');
      expect(screen.getByTestId('terminal-content')).toHaveTextContent('ls -la');
    });

    it('shows simulated output for known commands', async () => {
      render(<MockTerminal shellId="shell-1" />);
      const input = screen.getByTestId('terminal-input');
      await userEvent.type(input, 'echo hello{enter}');
      expect(screen.getByTestId('terminal-content')).toHaveTextContent('hello');
    });
  });
  ```

**Implementation**:
- `src/client/main.tsx`: Entry point with Mantine provider
- `src/client/App.tsx`: Root component with routing
- `src/client/stores/projectStore.ts`: Zustand project state (local only) *[migrated to TanStack Query in Phase 4.5]*
- `src/client/stores/shellStore.ts`: Zustand shell state (local only) *[migrated to TanStack Query in Phase 4.5]*
- `src/client/stores/uiStore.ts`: UI state (modals, sidebar collapsed, etc.) *[remains in Zustand]*
- `src/client/mocks/filesystem.ts`: Mock directory structure for browsing
- `src/client/mocks/terminal.ts`: Mock terminal responses
- `src/client/components/layout/AppShell.tsx`: Main layout with Mantine AppShell
- `src/client/components/layout/Sidebar.tsx`: Left sidebar with project tree
- `src/client/components/layout/Header.tsx`: App header with logo and actions
- `src/client/components/projects/ProjectList.tsx`: Collapsible project list
- `src/client/components/projects/ProjectItem.tsx`: Single project with shell list
- `src/client/components/projects/AddProjectModal.tsx`: Directory browser modal (mock data)
- `src/client/components/shells/ShellList.tsx`: List of shells for a project
- `src/client/components/shells/ShellItem.tsx`: Single shell entry
- `src/client/components/shells/AddShellButton.tsx`: Button to add new shell
- `src/client/components/terminal/MockTerminal.tsx`: Simulated terminal (no real PTY)
- `src/client/components/terminal/TerminalCanvas.tsx`: Terminal display area
- `src/client/components/common/EmptyState.tsx`: Empty state placeholders
- `src/client/styles/global.css`: Global styles and CSS variables
- `src/client/types/index.ts`: Client-specific types

**Dependencies**:
- External: `react`, `react-dom`, `react-router-dom`, `@mantine/core`, `@mantine/hooks`, `@graphty/compact-mantine`, `@tabler/icons-react`, `zustand` *[`@tanstack/react-query` added in Phase 4.5]*
- Internal: Phase 1 (shared types)

---

#### What Was Added

- Complete React application with Mantine UI
- Project management (add, remove, rename projects)
- Shell management (add, remove shells per project)
- Collapsible sidebar with project/shell tree
- Mock directory browser for selecting project paths
- Mock terminal that simulates basic command responses
- Zustand stores for state management *[server state migrated to TanStack Query in Phase 4.5]*
- Responsive layout with AppShell

#### How to Test

```bash
# Start the frontend development server
npm run dev:client

# Open browser to http://localhost:9000 (or shown port)
```

**Manual Testing Checklist**:

1. **View Empty State**
   - Open the app, see empty sidebar with "No projects yet" message
   - See "Add Project" button prominently displayed

2. **Add a Project**
   - Click "Add Project" button
   - Navigate mock directory browser (click folders to enter, breadcrumb to go back)
   - Click "Select This Directory" to add project
   - Project appears in sidebar

3. **Manage Projects**
   - Click project name to expand/collapse
   - Right-click or click menu icon for context menu (Rename, Delete)
   - Delete a project, confirm it's removed

4. **Add Shells**
   - Expand a project
   - Click "+" button to add a shell
   - Shell appears under project with default name "bash-1"
   - Click shell to select it

5. **Mock Terminal**
   - Select a shell to see terminal panel
   - Type commands like `echo hello`, `ls`, `pwd`
   - See simulated responses
   - Terminal shows mock prompt with current directory

6. **UI Polish**
   - Resize browser window, verify responsive layout
   - Collapse sidebar with toggle button
   - Verify keyboard navigation works (Tab, Enter, Escape)

---

### Phase 3: Backend Storage and REST API

**Objective**: Implement the complete backend with JSON storage and REST API. The frontend still uses mock data, but the API can be tested independently with curl.

**Tests to Write First**:
- `test/unit/server/storage/JsonStore.test.ts`: Core storage
  ```typescript
  describe('JsonStore', () => {
    let tempDir: string;
    let store: JsonStore<{ items: Array<{ id: string }> }>;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'jsonstore-test-'));
      store = new JsonStore({
        filePath: join(tempDir, 'test.json'),
        defaultValue: { version: 1, items: [] }
      });
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('creates file with default value if not exists', async () => {
      const data = await store.read();
      expect(data.items).toEqual([]);
    });

    it('persists data across reads', async () => {
      await store.write({ version: 1, items: [{ id: '1' }] });
      const data = await store.read();
      expect(data.items).toHaveLength(1);
    });

    it('performs atomic writes', async () => {
      // Verify no .tmp files left behind
      await store.write({ version: 1, items: [{ id: '1' }] });
      const files = await readdir(tempDir);
      expect(files).toEqual(['test.json']);
    });

    it('handles concurrent updates with locking', async () => {
      const updates = Array(10).fill(null).map((_, i) =>
        store.update(data => ({
          version: 1,
          items: [...data.items, { id: String(i) }]
        }))
      );
      await Promise.all(updates);
      const data = await store.read();
      expect(data.items).toHaveLength(10);
    });
  });
  ```

- `test/unit/server/services/auth/AuthService.test.ts`: Authentication
  ```typescript
  describe('AuthService', () => {
    let service: AuthService;
    let sessionStore: SessionStore;

    beforeEach(() => {
      sessionStore = createMockSessionStore();
      service = new AuthService({
        authGuid: 'correct-guid',
        sessionStore,
        sessionMaxAge: 30 * 24 * 60 * 60 * 1000
      });
    });

    it('validates correct GUID', () => {
      expect(service.validateGuid('correct-guid')).toBe(true);
    });

    it('rejects incorrect GUID', () => {
      expect(service.validateGuid('wrong-guid')).toBe(false);
    });

    it('creates session on successful login', async () => {
      const session = await service.login('correct-guid');
      expect(session.token).toBeDefined();
      expect(session.expiresAt).toBeDefined();
    });

    it('throws on invalid login', async () => {
      await expect(service.login('wrong')).rejects.toThrow('Invalid GUID');
    });

    it('validates session token', async () => {
      const session = await service.login('correct-guid');
      const valid = await service.validateSession(session.token);
      expect(valid).toBe(true);
    });
  });
  ```

- `test/integration/api/auth.test.ts`: Auth API
  ```typescript
  describe('Auth API', () => {
    let server: TestServer;

    beforeAll(async () => {
      server = await createTestServer({ authGuid: 'test-guid' });
    });

    afterAll(() => server.close());

    describe('POST /api/auth/login', () => {
      it('returns 200 and sets cookie on valid GUID', async () => {
        const response = await request(server.app)
          .post('/api/auth/login')
          .send({ guid: 'test-guid' })
          .expect(200);

        expect(response.headers['set-cookie']).toBeDefined();
        expect(response.headers['set-cookie'][0]).toContain('session=');
      });

      it('returns 401 on invalid GUID', async () => {
        await request(server.app)
          .post('/api/auth/login')
          .send({ guid: 'wrong-guid' })
          .expect(401);
      });

      it('returns 400 on missing GUID', async () => {
        await request(server.app)
          .post('/api/auth/login')
          .send({})
          .expect(400);
      });
    });

    describe('GET /api/auth/status', () => {
      it('returns authenticated:true with valid session', async () => {
        const response = await request(server.app)
          .get('/api/auth/status')
          .set('Cookie', server.authCookie)
          .expect(200);

        expect(response.body.authenticated).toBe(true);
      });

      it('returns authenticated:false without session', async () => {
        const response = await request(server.app)
          .get('/api/auth/status')
          .expect(200);

        expect(response.body.authenticated).toBe(false);
      });
    });

    describe('POST /api/auth/logout', () => {
      it('clears session cookie', async () => {
        const response = await request(server.app)
          .post('/api/auth/logout')
          .set('Cookie', server.authCookie)
          .expect(200);

        expect(response.headers['set-cookie'][0]).toContain('session=;');
      });
    });
  });
  ```

- `test/integration/api/projects.test.ts`: Projects API
  ```typescript
  describe('Projects API', () => {
    let server: TestServer;

    beforeAll(async () => {
      server = await createTestServer();
    });

    afterAll(() => server.close());

    describe('GET /api/projects', () => {
      it('requires authentication', async () => {
        await request(server.app)
          .get('/api/projects')
          .expect(401);
      });

      it('returns empty array initially', async () => {
        const response = await request(server.app)
          .get('/api/projects')
          .set('Cookie', server.authCookie)
          .expect(200);

        expect(response.body.projects).toEqual([]);
      });
    });

    describe('POST /api/projects', () => {
      it('creates project with valid path', async () => {
        const response = await request(server.app)
          .post('/api/projects')
          .set('Cookie', server.authCookie)
          .send({ path: server.tempDir })
          .expect(201);

        expect(response.body.project.path).toBe(server.tempDir);
        expect(response.body.project.name).toBe(basename(server.tempDir));
        expect(response.body.project.id).toMatch(/^[0-9a-f-]{36}$/);
      });

      it('returns 400 for non-existent path', async () => {
        await request(server.app)
          .post('/api/projects')
          .set('Cookie', server.authCookie)
          .send({ path: '/nonexistent/path/12345' })
          .expect(400);
      });

      it('returns 409 for duplicate path', async () => {
        await request(server.app)
          .post('/api/projects')
          .set('Cookie', server.authCookie)
          .send({ path: server.tempDir });

        await request(server.app)
          .post('/api/projects')
          .set('Cookie', server.authCookie)
          .send({ path: server.tempDir })
          .expect(409);
      });
    });

    describe('PATCH /api/projects/:id', () => {
      it('updates project name', async () => {
        const create = await request(server.app)
          .post('/api/projects')
          .set('Cookie', server.authCookie)
          .send({ path: server.tempDir });

        const response = await request(server.app)
          .patch(`/api/projects/${create.body.project.id}`)
          .set('Cookie', server.authCookie)
          .send({ name: 'new-name' })
          .expect(200);

        expect(response.body.project.name).toBe('new-name');
      });
    });

    describe('DELETE /api/projects/:id', () => {
      it('removes project', async () => {
        const create = await request(server.app)
          .post('/api/projects')
          .set('Cookie', server.authCookie)
          .send({ path: server.tempDir });

        await request(server.app)
          .delete(`/api/projects/${create.body.project.id}`)
          .set('Cookie', server.authCookie)
          .expect(204);

        const list = await request(server.app)
          .get('/api/projects')
          .set('Cookie', server.authCookie);

        expect(list.body.projects).toHaveLength(0);
      });
    });
  });
  ```

- `test/integration/api/shells.test.ts`: Shells API
  ```typescript
  describe('Shells API', () => {
    let server: TestServer;
    let projectId: string;

    beforeAll(async () => {
      server = await createTestServer();
      projectId = await server.createTestProject();
    });

    afterAll(() => server.close());

    describe('POST /api/projects/:projectId/shells', () => {
      it('creates shell for project', async () => {
        const response = await request(server.app)
          .post(`/api/projects/${projectId}/shells`)
          .set('Cookie', server.authCookie)
          .send({ name: 'bash-1' })
          .expect(201);

        expect(response.body.shell.projectId).toBe(projectId);
        expect(response.body.shell.name).toBe('bash-1');
        expect(response.body.shell.status).toBe('inactive');
      });

      it('auto-generates shell name if not provided', async () => {
        const response = await request(server.app)
          .post(`/api/projects/${projectId}/shells`)
          .set('Cookie', server.authCookie)
          .send({})
          .expect(201);

        expect(response.body.shell.name).toMatch(/^shell-\d+$/);
      });
    });

    describe('GET /api/projects/:projectId/shells', () => {
      it('returns shells for project', async () => {
        const response = await request(server.app)
          .get(`/api/projects/${projectId}/shells`)
          .set('Cookie', server.authCookie)
          .expect(200);

        expect(response.body.shells).toBeInstanceOf(Array);
      });
    });

    describe('DELETE /api/shells/:id', () => {
      it('removes shell', async () => {
        const create = await request(server.app)
          .post(`/api/projects/${projectId}/shells`)
          .set('Cookie', server.authCookie)
          .send({});

        await request(server.app)
          .delete(`/api/shells/${create.body.shell.id}`)
          .set('Cookie', server.authCookie)
          .expect(204);
      });
    });

    describe('PATCH /api/shells/:id', () => {
      it('renames shell', async () => {
        const create = await request(server.app)
          .post(`/api/projects/${projectId}/shells`)
          .set('Cookie', server.authCookie)
          .send({});

        const response = await request(server.app)
          .patch(`/api/shells/${create.body.shell.id}`)
          .set('Cookie', server.authCookie)
          .send({ name: 'renamed-shell' })
          .expect(200);

        expect(response.body.shell.name).toBe('renamed-shell');
      });
    });

    describe('POST /api/shells/:id/restart', () => {
      it('restarts shell PTY process', async () => {
        const create = await request(server.app)
          .post(`/api/projects/${projectId}/shells`)
          .set('Cookie', server.authCookie)
          .send({});

        const response = await request(server.app)
          .post(`/api/shells/${create.body.shell.id}/restart`)
          .set('Cookie', server.authCookie)
          .expect(200);

        expect(response.body.shell.status).toBe('active');
      });
    });
  });
  ```

- `test/integration/api/filesystem.test.ts`: Filesystem API
  ```typescript
  describe('Filesystem API', () => {
    let server: TestServer;

    beforeAll(async () => {
      server = await createTestServer();
      // Create test directory structure
      await mkdir(join(server.tempDir, 'subdir'));
      await writeFile(join(server.tempDir, 'file.txt'), 'content');
    });

    afterAll(() => server.close());

    describe('GET /api/filesystem/browse', () => {
      it('returns directory contents', async () => {
        const response = await request(server.app)
          .get('/api/filesystem/browse')
          .query({ path: server.tempDir })
          .set('Cookie', server.authCookie)
          .expect(200);

        expect(response.body.path).toBe(server.tempDir);
        expect(response.body.entries).toBeInstanceOf(Array);
      });

      it('returns only directories, not files', async () => {
        const response = await request(server.app)
          .get('/api/filesystem/browse')
          .query({ path: server.tempDir })
          .set('Cookie', server.authCookie);

        const names = response.body.entries.map((e: any) => e.name);
        expect(names).toContain('subdir');
        expect(names).not.toContain('file.txt');
      });

      it('returns parent path for navigation', async () => {
        const response = await request(server.app)
          .get('/api/filesystem/browse')
          .query({ path: join(server.tempDir, 'subdir') })
          .set('Cookie', server.authCookie);

        expect(response.body.parent).toBe(server.tempDir);
      });
    });

    describe('GET /api/filesystem/validate', () => {
      it('returns valid:true for existing directory', async () => {
        const response = await request(server.app)
          .get('/api/filesystem/validate')
          .query({ path: server.tempDir })
          .set('Cookie', server.authCookie)
          .expect(200);

        expect(response.body.valid).toBe(true);
        expect(response.body.isDirectory).toBe(true);
      });

      it('returns valid:false for non-existent path', async () => {
        const response = await request(server.app)
          .get('/api/filesystem/validate')
          .query({ path: '/nonexistent/path' })
          .set('Cookie', server.authCookie)
          .expect(200);

        expect(response.body.valid).toBe(false);
      });
    });
  });
  ```

**Implementation**:
- `src/server/storage/JsonStore.ts`: Generic JSON file store with atomic writes
- `src/server/storage/stores/ProjectStore.ts`: Project data access
- `src/server/storage/stores/ShellStore.ts`: Shell data access
- `src/server/storage/stores/SessionStore.ts`: Session data access
- `src/server/storage/index.ts`: Storage initialization
- `src/server/services/auth/AuthService.ts`: Authentication logic
- `src/server/services/project/ProjectService.ts`: Project business logic
- `src/server/services/shell/ShellService.ts`: Shell business logic
- `src/server/services/filesystem/FilesystemService.ts`: Directory browsing
- `src/server/api/middleware/auth.ts`: Authentication middleware
- `src/server/api/middleware/error.ts`: Error handling middleware
- `src/server/api/middleware/validation.ts`: Request validation
- `src/server/api/routes/auth.ts`: Auth endpoints
- `src/server/api/routes/projects.ts`: Project endpoints
- `src/server/api/routes/shells.ts`: Shell endpoints
- `src/server/api/routes/filesystem.ts`: Filesystem endpoints
- `src/server/api/routes/index.ts`: Route aggregator
- `src/server/index.ts`: Express server setup
- `scripts/generate-guid.ts`: GUID generation utility
- `test/helpers/server.ts`: Test server utilities

**Dependencies**:
- External: `express`, `cookie-parser`, `cors`, `fs-extra`, `proper-lockfile`, `uuid`
- Dev: `supertest`, `@types/express`, `@types/cookie-parser`, `@types/cors`, `@types/supertest`
- Internal: Phase 1 (config, types), Phase 2 (not directly, but same types)

---

#### What Was Added

- JSON file storage with atomic writes and file locking
- Complete REST API for authentication, projects, shells, and filesystem browsing
- Session management with cookie-based authentication
- GUID generation script for admin setup
- All storage persists to `~/.aiforge/data/`
- Full test coverage for all API endpoints

#### How to Test

```bash
# Generate an authentication GUID
npm run generate-guid
# Copy the output GUID

# Run all backend tests
npm run test:integration

# Start the backend server
AIFORGE_AUTH_GUID=<your-guid> npm run dev:server
```

**Test with curl**:

```bash
# Set your GUID and port
GUID="your-guid-here"
PORT=9042  # Check console output for actual port

# Login and save cookie
curl -c cookies.txt -X POST http://localhost:$PORT/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"guid\": \"$GUID\"}"

# Check auth status
curl -b cookies.txt http://localhost:$PORT/api/auth/status

# List projects (should be empty)
curl -b cookies.txt http://localhost:$PORT/api/projects

# Create a project
curl -b cookies.txt -X POST http://localhost:$PORT/api/projects \
  -H "Content-Type: application/json" \
  -d '{"path": "/tmp"}'

# List projects again
curl -b cookies.txt http://localhost:$PORT/api/projects

# Browse filesystem
curl -b cookies.txt "http://localhost:$PORT/api/filesystem/browse?path=/home"

# Create a shell
PROJECT_ID="<id-from-create-response>"
curl -b cookies.txt -X POST http://localhost:$PORT/api/projects/$PROJECT_ID/shells \
  -H "Content-Type: application/json" \
  -d '{"name": "my-shell"}'

# Rename a shell
SHELL_ID="<id-from-shell-create-response>"
curl -b cookies.txt -X PATCH http://localhost:$PORT/api/shells/$SHELL_ID \
  -H "Content-Type: application/json" \
  -d '{"name": "renamed-shell"}'

# Restart a shell
curl -b cookies.txt -X POST http://localhost:$PORT/api/shells/$SHELL_ID/restart

# Logout
curl -b cookies.txt -X POST http://localhost:$PORT/api/auth/logout
```

**Expected Results**:
- All curl commands return appropriate JSON responses
- Data persists in `~/.aiforge/data/*.json`
- Authentication is enforced on all endpoints except login
- Invalid paths return 400, missing resources return 404

---

### Phase 4: Connect Frontend to Backend API

**Objective**: Replace mock data in the frontend with real API calls. Add authentication flow. The app now works end-to-end for project and shell management (terminal still mocked).

**Tests to Write First**:
- `test/unit/client/services/api.test.ts`: API client
  ```typescript
  describe('ApiClient', () => {
    beforeEach(() => {
      fetchMock.resetMocks();
    });

    it('adds credentials to requests', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ projects: [] }));
      await api.getProjects();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('throws ApiError on non-ok response', async () => {
      fetchMock.mockResponseOnce('', { status: 401 });
      await expect(api.getProjects()).rejects.toThrow(ApiError);
    });

    it('parses JSON response', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ projects: [{ id: '1' }] }));
      const result = await api.getProjects();
      expect(result.projects).toHaveLength(1);
    });
  });
  ```

- `test/unit/client/stores/authStore.test.ts`: Auth store with API
  ```typescript
  describe('authStore with API', () => {
    beforeEach(() => {
      useAuthStore.getState().reset();
      fetchMock.resetMocks();
    });

    it('calls login API and sets authenticated', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ success: true }));
      await useAuthStore.getState().login('valid-guid');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('sets error on failed login', async () => {
      fetchMock.mockResponseOnce('', { status: 401 });
      await useAuthStore.getState().login('invalid');
      expect(useAuthStore.getState().error).toBe('Invalid GUID');
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('checks auth status on init', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ authenticated: true }));
      await useAuthStore.getState().checkAuth();
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('calls logout API and clears state', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ success: true }));
      useAuthStore.setState({ isAuthenticated: true });
      await useAuthStore.getState().logout();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });
  ```

- `test/unit/client/hooks/useProjects.test.ts`: Project hook with API
  ```typescript
  describe('useProjects', () => {
    beforeEach(() => {
      useProjectStore.getState().reset();
      fetchMock.resetMocks();
    });

    it('fetches projects on mount', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({
        projects: [{ id: '1', name: 'test', path: '/tmp' }]
      }));

      const { result } = renderHook(() => useProjects());

      await waitFor(() => {
        expect(result.current.projects).toHaveLength(1);
      });
    });

    it('creates project via API', async () => {
      fetchMock.mockResponses(
        [JSON.stringify({ projects: [] }), { status: 200 }],
        [JSON.stringify({ project: { id: '1', name: 'new', path: '/new' } }), { status: 201 }]
      );

      const { result } = renderHook(() => useProjects());
      await result.current.createProject('/new');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/projects'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('handles API errors gracefully', async () => {
      fetchMock.mockRejectOnce(new Error('Network error'));

      const { result } = renderHook(() => useProjects());

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });
    });
  });
  ```

- `test/unit/client/components/auth/LoginPage.test.tsx`: Login page
  ```typescript
  describe('LoginPage', () => {
    beforeEach(() => {
      useAuthStore.getState().reset();
      fetchMock.resetMocks();
    });

    it('renders login form', () => {
      render(<LoginPage />);
      expect(screen.getByTestId('guid-input')).toBeInTheDocument();
      expect(screen.getByTestId('login-button')).toBeInTheDocument();
    });

    it('submits GUID and redirects on success', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ success: true }));
      const navigate = vi.fn();
      vi.mocked(useNavigate).mockReturnValue(navigate);

      render(<LoginPage />);
      await userEvent.type(screen.getByTestId('guid-input'), 'my-guid');
      await userEvent.click(screen.getByTestId('login-button'));

      await waitFor(() => {
        expect(navigate).toHaveBeenCalledWith('/');
      });
    });

    it('shows error message on failed login', async () => {
      fetchMock.mockResponseOnce('', { status: 401 });

      render(<LoginPage />);
      await userEvent.type(screen.getByTestId('guid-input'), 'wrong');
      await userEvent.click(screen.getByTestId('login-button'));

      await waitFor(() => {
        expect(screen.getByTestId('login-error')).toBeVisible();
      });
    });

    it('shows loading state while logging in', async () => {
      fetchMock.mockResponseOnce(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      render(<LoginPage />);
      await userEvent.type(screen.getByTestId('guid-input'), 'guid');
      await userEvent.click(screen.getByTestId('login-button'));

      expect(screen.getByTestId('login-button')).toBeDisabled();
    });
  });
  ```

- `test/unit/client/components/projects/AddProjectModal.test.tsx`: Real directory browser
  ```typescript
  describe('AddProjectModal with API', () => {
    beforeEach(() => {
      fetchMock.resetMocks();
    });

    it('fetches directory listing from API', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({
        path: '/home',
        parent: '/',
        entries: [{ name: 'user', type: 'directory' }]
      }));

      render(<AddProjectModal opened={true} onClose={vi.fn()} onSelect={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('user')).toBeInTheDocument();
      });
    });

    it('navigates directories via API', async () => {
      fetchMock.mockResponses(
        [JSON.stringify({ path: '/home', entries: [{ name: 'user' }] })],
        [JSON.stringify({ path: '/home/user', entries: [{ name: 'projects' }] })]
      );

      render(<AddProjectModal opened={true} onClose={vi.fn()} onSelect={vi.fn()} />);

      await waitFor(() => screen.getByText('user'));
      await userEvent.click(screen.getByText('user'));

      await waitFor(() => {
        expect(screen.getByTestId('current-path')).toHaveTextContent('/home/user');
      });
    });

    it('creates project via API when selected', async () => {
      fetchMock.mockResponses(
        [JSON.stringify({ path: '/home', entries: [] })],
        [JSON.stringify({ project: { id: '1', name: 'home', path: '/home' } })]
      );

      const onSelect = vi.fn();
      render(<AddProjectModal opened={true} onClose={vi.fn()} onSelect={onSelect} />);

      await waitFor(() => screen.getByTestId('select-directory-button'));
      await userEvent.click(screen.getByTestId('select-directory-button'));

      expect(onSelect).toHaveBeenCalled();
    });
  });
  ```

**Implementation**:
- `src/client/services/api.ts`: REST API client with error handling
- `src/client/services/errors.ts`: Custom error classes
- `src/client/stores/authStore.ts`: Update with API integration
- `src/client/stores/projectStore.ts`: Update with API integration
- `src/client/stores/shellStore.ts`: Update with API integration
- `src/client/hooks/useAuth.ts`: Authentication hook
- `src/client/hooks/useProjects.ts`: Project operations hook
- `src/client/hooks/useShells.ts`: Shell operations hook
- `src/client/pages/LoginPage.tsx`: Login page
- `src/client/pages/MainPage.tsx`: Main application page
- `src/client/components/auth/AuthGuard.tsx`: Route protection component
- `src/client/components/projects/AddProjectModal.tsx`: Update to use real filesystem API
- `src/client/App.tsx`: Update with auth routing
- `vite.config.ts`: Add proxy for API requests in development

**Dependencies**:
- External: None new
- Internal: Phase 2 (frontend), Phase 3 (backend API)

---

#### What Was Added

- Real authentication flow with login/logout
- API client for all backend endpoints
- Auth-protected routes
- Projects and shells persist to backend
- Real directory browser (browses actual server filesystem)
- Loading and error states throughout UI
- API proxy in Vite for development

#### How to Test

```bash
# Generate GUID if not done already
npm run generate-guid

# Start both frontend and backend
AIFORGE_AUTH_GUID=<your-guid> npm run dev

# Open browser to http://localhost:9000
```

**Manual Testing Checklist**:

1. **Authentication Flow**
   - Open app, should redirect to `/login`
   - Enter invalid GUID, see error message
   - Enter valid GUID, redirect to main app
   - Refresh page, should stay logged in
   - Click logout, redirect to login

2. **Project Management (Persisted)**
   - Add a project using the directory browser
   - Navigate real directories on your system
   - Select a directory, project is created
   - Refresh page, project persists
   - Delete project, refresh, still deleted

3. **Shell Management (Persisted)**
   - Add shells to a project
   - Refresh page, shells persist
   - Rename a shell via context menu
   - Refresh page, renamed shell persists
   - Delete shell, refresh, still deleted

4. **Directory Browser**
   - Opens at configured root (default: home)
   - Shows only directories, not files
   - Can navigate up with breadcrumb
   - Can navigate into subdirectories
   - Hidden directories filtered (if configured)

5. **Error Handling**
   - Stop backend, try to add project, see error
   - Try to add project with non-existent path
   - Check network tab for proper API calls

---

### Phase 4.5: State Management Migration (TanStack Query)

**Objective**: Replace Zustand for server state with TanStack Query to eliminate persistence bugs. Server state (projects, shells, auth) moves to TanStack Query with automatic caching and synchronization. UI state (sidebar collapsed, modals, active selections) stays in Zustand.

**Problem Being Solved**: Multiple persistence bugs occurred because client code could directly manipulate Zustand stores without syncing to the server. TanStack Query makes this impossible by design - all server data comes from queries and all mutations automatically update the cache.

**Architecture After Migration**:
```
┌─────────────────────────────────────────────────────────────┐
│                        React Components                      │
├─────────────────────────────────────────────────────────────┤
│  TanStack Query (Server State)  │  Zustand (UI State)       │
│  - useProjects()                │  - sidebarCollapsed       │
│  - useShells()                  │  - activeShellId          │
│  - useAuth()                    │  - selectedProjectId      │
│  - Automatic caching            │  - modals open/closed     │
│  - Background refetch           │  - layout preferences     │
│  - Optimistic updates           │                           │
├─────────────────────────────────┼───────────────────────────┤
│         API Layer               │     Local Storage         │
│     (src/client/services/api)   │     (optional persist)    │
├─────────────────────────────────┴───────────────────────────┤
│                     Backend Server                           │
│              (Single source of truth)                        │
└─────────────────────────────────────────────────────────────┘
```

**Tests to Write First**:
- `test/unit/client/hooks/useProjects.test.tsx`: TanStack Query projects hook
  ```typescript
  import { renderHook, waitFor } from '@testing-library/react';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { useProjects, useCreateProject, useDeleteProject } from '@client/hooks/useProjects';
  import { api } from '@client/services/api';

  vi.mock('@client/services/api');

  function createWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  describe('useProjects', () => {
    it('fetches projects on mount', async () => {
      vi.mocked(api.getProjects).mockResolvedValue({
        projects: [{ id: '1', name: 'test', path: '/tmp' }],
      });

      const { result } = renderHook(() => useProjects(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
    });

    it('returns loading state initially', () => {
      const { result } = renderHook(() => useProjects(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('useCreateProject', () => {
    it('invalidates projects query on success', async () => {
      vi.mocked(api.createProject).mockResolvedValue({
        project: { id: '2', name: 'new', path: '/new' },
      });

      const { result } = renderHook(() => useCreateProject(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync('/new');

      // Cache should be invalidated, triggering refetch
      expect(api.getProjects).toHaveBeenCalled();
    });
  });
  ```

- `test/unit/client/hooks/useShells.test.tsx`: TanStack Query shells hook
  ```typescript
  describe('useShells', () => {
    it('fetches shells for a project', async () => {
      vi.mocked(api.getShells).mockResolvedValue({
        shells: [{ id: 's1', projectId: 'p1', name: 'bash-1' }],
      });

      const { result } = renderHook(() => useShells('p1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
    });
  });

  describe('useDeleteShell', () => {
    it('removes shell from cache optimistically', async () => {
      // Start with one shell in cache
      const queryClient = new QueryClient();
      queryClient.setQueryData(['shells', 'p1'], [{ id: 's1' }]);

      vi.mocked(api.deleteShell).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteShell(), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      });

      // Mutation should optimistically remove from cache
      result.current.mutate({ shellId: 's1', projectId: 'p1' });

      // Cache updated immediately (optimistic)
      expect(queryClient.getQueryData(['shells', 'p1'])).toHaveLength(0);
    });
  });
  ```

**Implementation**:

1. **Install TanStack Query**:
   ```bash
   npm install @tanstack/react-query @tanstack/react-query-devtools
   ```

2. **Create Query Client Provider** (`src/client/providers/QueryProvider.tsx`):
   ```typescript
   import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
   import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

   const queryClient = new QueryClient({
     defaultOptions: {
       queries: {
         staleTime: 1000 * 60 * 5, // 5 minutes
         retry: 1,
       },
     },
   });

   export function QueryProvider({ children }: { children: React.ReactNode }) {
     return (
       <QueryClientProvider client={queryClient}>
         {children}
         <ReactQueryDevtools initialIsOpen={false} />
       </QueryClientProvider>
     );
   }
   ```

3. **Define Query Keys** (`src/client/hooks/queryKeys.ts`):
   ```typescript
   export const queryKeys = {
     projects: {
       all: ['projects'] as const,
       detail: (id: string) => ['projects', id] as const,
     },
     shells: {
       byProject: (projectId: string) => ['shells', projectId] as const,
       detail: (id: string) => ['shells', 'detail', id] as const,
     },
     auth: {
       status: ['auth', 'status'] as const,
     },
   };
   ```

4. **Migrate Projects Hook** (`src/client/hooks/useProjects.ts`):
   ```typescript
   import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
   import { api } from '@client/services/api';
   import { queryKeys } from './queryKeys';

   export function useProjects() {
     return useQuery({
       queryKey: queryKeys.projects.all,
       queryFn: async () => {
         const result = await api.getProjects();
         return result.projects;
       },
     });
   }

   export function useCreateProject() {
     const queryClient = useQueryClient();

     return useMutation({
       mutationFn: (path: string) => api.createProject(path),
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
       },
     });
   }

   export function useDeleteProject() {
     const queryClient = useQueryClient();

     return useMutation({
       mutationFn: (id: string) => api.deleteProject(id),
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
       },
     });
   }
   ```

5. **Migrate Shells Hook** (`src/client/hooks/useShells.ts`):
   ```typescript
   import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
   import { api } from '@client/services/api';
   import { queryKeys } from './queryKeys';
   import type { Shell } from '@shared/types';

   export function useShells(projectId: string) {
     return useQuery({
       queryKey: queryKeys.shells.byProject(projectId),
       queryFn: async () => {
         const result = await api.getShells(projectId);
         return result.shells;
       },
       enabled: !!projectId,
     });
   }

   export function useCreateShell() {
     const queryClient = useQueryClient();

     return useMutation({
       mutationFn: ({ projectId, name }: { projectId: string; name?: string }) =>
         api.createShell(projectId, name),
       onSuccess: (data) => {
         queryClient.invalidateQueries({
           queryKey: queryKeys.shells.byProject(data.shell.projectId),
         });
       },
     });
   }

   export function useDeleteShell() {
     const queryClient = useQueryClient();

     return useMutation({
       mutationFn: ({ shellId, projectId }: { shellId: string; projectId: string }) =>
         api.deleteShell(shellId).then(() => ({ shellId, projectId })),
       // Optimistic update
       onMutate: async ({ shellId, projectId }) => {
         await queryClient.cancelQueries({ queryKey: queryKeys.shells.byProject(projectId) });

         const previousShells = queryClient.getQueryData<Shell[]>(
           queryKeys.shells.byProject(projectId)
         );

         queryClient.setQueryData<Shell[]>(
           queryKeys.shells.byProject(projectId),
           (old) => old?.filter((s) => s.id !== shellId) ?? []
         );

         return { previousShells, projectId };
       },
       onError: (err, variables, context) => {
         if (context?.previousShells) {
           queryClient.setQueryData(
             queryKeys.shells.byProject(context.projectId),
             context.previousShells
           );
         }
       },
       onSettled: (data, error, variables) => {
         queryClient.invalidateQueries({
           queryKey: queryKeys.shells.byProject(variables.projectId),
         });
       },
     });
   }
   ```

6. **Consolidate UI Store** (`src/client/stores/uiStore.ts`):
   ```typescript
   // Keep only UI state - remove any server state references
   interface UIState {
     sidebarCollapsed: boolean;
     activeShellId: string | null;
     selectedProjectId: string | null;
     addProjectModalOpen: boolean;
     // ... other UI-only state
   }
   ```

7. **Update App Entry Point** (`src/client/App.tsx`):
   ```typescript
   import { QueryProvider } from '@client/providers/QueryProvider';

   export function App() {
     return (
       <QueryProvider>
         <MantineProvider>
           <Router>
             <AppShellLayout />
           </Router>
         </MantineProvider>
       </QueryProvider>
     );
   }
   ```

8. **Update Components to Use New Hooks**:
   - `Sidebar.tsx`: Use `useProjects()` query
   - `ShellList.tsx`: Use `useShells(projectId)` query
   - `ShellItem.tsx`: Use `useDeleteShell()` mutation
   - `AddShellButton.tsx`: Use `useCreateShell()` mutation
   - `ProjectItem.tsx`: Use `useDeleteProject()` mutation

**Migration Steps**:

1. **Setup (Day 1 Morning)**
   - Install dependencies
   - Create QueryProvider
   - Create queryKeys.ts
   - Wrap app with QueryProvider

2. **Migrate Projects (Day 1 Afternoon)**
   - Rewrite useProjects hook with TanStack Query
   - Update Sidebar and ProjectList components
   - Remove projectStore.ts (or keep for selectedProjectId only)
   - Test project CRUD operations

3. **Migrate Shells (Day 2 Morning)**
   - Rewrite useShells hook with TanStack Query
   - Add optimistic updates for delete
   - Update ShellList, ShellItem, AddShellButton
   - Remove shellStore.ts (or keep for activeShellId only)
   - Test shell CRUD operations

4. **Migrate Auth (Day 2 Afternoon)**
   - Create useAuth query hook
   - Update auth flow to use queries
   - Remove authStore.ts
   - Test login/logout persistence

5. **Cleanup (Day 2 End)**
   - Remove unused Zustand stores
   - Consolidate remaining UI state
   - Update all tests
   - Run full test suite

**Files to Create**:
- `src/client/providers/QueryProvider.tsx`
- `src/client/hooks/queryKeys.ts`

**Files to Modify**:
- `src/client/hooks/useProjects.ts` - Rewrite with TanStack Query
- `src/client/hooks/useShells.ts` - Rewrite with TanStack Query
- `src/client/App.tsx` - Add QueryProvider
- `src/client/stores/uiStore.ts` - Consolidate UI state
- `src/client/components/layout/Sidebar.tsx` - Update hook usage
- `src/client/components/shells/ShellItem.tsx` - Update hook usage
- `src/client/components/shells/ShellList.tsx` - Update hook usage
- `src/client/components/shells/AddShellButton.tsx` - Update hook usage
- All component tests - Update to use QueryClientProvider wrapper

**Files to Remove** (after migration):
- `src/client/stores/projectStore.ts` (or consolidate into uiStore)
- `src/client/stores/shellStore.ts` (or consolidate into uiStore)
- `src/client/stores/authStore.ts`

**Dependencies to Add**:
```json
{
  "@tanstack/react-query": "^5.x",
  "@tanstack/react-query-devtools": "^5.x"
}
```

**Verification**:
- All CRUD operations persist across page refresh
- All CRUD operations persist across different browser sessions
- Optimistic updates provide instant UI feedback
- Error states rollback optimistic updates
- React Query DevTools show cache state
- No direct store mutations bypass the API

**Benefits After Migration**:
1. **Impossible to have persistence bugs** - Can't modify server data without going through mutations
2. **Automatic caching** - No manual cache management needed
3. **Background refetching** - Data stays fresh automatically
4. **Optimistic updates** - UI feels instant while persisting in background
5. **Error handling** - Built-in retry, error states, rollback
6. **DevTools** - Easy debugging of cache state
7. **Reduced boilerplate** - No need to track loading/error states manually

---

### Phase 4.75: Cross-Device Workspace State Sync

**Objective**: Implement server-side persistence of UI workspace state (sidebar collapsed, expanded projects, active shell) so users can seamlessly continue work when switching devices - similar to VS Code Settings Sync.

**Design Decisions**:
- State is tied to session token (30-day expiration)
- Debounce timing: 500ms to avoid excessive writes
- Multi-tab: last-write-wins strategy
- On load: validate that referenced projects/shells still exist

**State Persisted**:
- `sidebarCollapsed`: boolean
- `expandedProjectIds`: string[]
- `activeShellId`: string | null

**State NOT Persisted** (transient UI state):
- `addProjectModalOpen`
- Other modal states

**Tests to Write First**:
- `test/unit/server/storage/stores/WorkspaceStateStore.test.ts`: Storage layer
  ```typescript
  describe('WorkspaceStateStore', () => {
    it('returns null for non-existent session token', async () => {
      const result = await store.get('nonexistent-token');
      expect(result).toBeNull();
    });

    it('stores and retrieves workspace state by session token', async () => {
      const state = { sidebarCollapsed: true, expandedProjectIds: ['p1'], activeShellId: 'shell-1', updatedAt: '...' };
      await store.set('token', state);
      expect(await store.get('token')).toEqual(state);
    });

    it('cleans up orphaned states when sessions expire', async () => {
      await store.set('valid-token', state);
      await store.set('orphan-token', state);
      await store.cleanupOrphanedStates(['valid-token']);
      expect(await store.get('orphan-token')).toBeNull();
    });
  });
  ```

- `test/unit/server/services/workspace/WorkspaceStateService.test.ts`: Business logic
  ```typescript
  describe('WorkspaceStateService', () => {
    it('returns default state for new session', async () => {
      const state = await service.get('new-session');
      expect(state.sidebarCollapsed).toBe(false);
      expect(state.expandedProjectIds).toEqual([]);
    });

    it('filters out deleted projects from expandedProjectIds', async () => {
      await service.update(token, { expandedProjectIds: ['deleted', 'existing'] });
      const state = await service.get(token);
      expect(state.expandedProjectIds).toEqual(['existing']);
    });

    it('sets activeShellId to null if shell was deleted', async () => {
      await service.update(token, { activeShellId: 'deleted-shell' });
      const state = await service.get(token);
      expect(state.activeShellId).toBeNull();
    });
  });
  ```

- `test/integration/api/workspace.test.ts`: API endpoints
  ```typescript
  describe('Workspace API', () => {
    it('GET /api/workspace returns default state for new session', async () => {
      const response = await request(app).get('/api/workspace').set('Cookie', authCookie);
      expect(response.body.workspaceState.sidebarCollapsed).toBe(false);
    });

    it('PATCH /api/workspace updates partial state', async () => {
      await request(app).patch('/api/workspace').set('Cookie', authCookie)
        .send({ sidebarCollapsed: true });
      const response = await request(app).get('/api/workspace').set('Cookie', authCookie);
      expect(response.body.workspaceState.sidebarCollapsed).toBe(true);
    });

    it('maintains separate state per session', async () => {
      // Session 1 sets sidebar collapsed
      // Session 2 sets sidebar expanded
      // Each session sees their own state
    });
  });
  ```

- `test/unit/client/hooks/useWorkspaceSync.test.ts`: Client sync hook
  ```typescript
  describe('useWorkspaceSync', () => {
    it('fetches and applies workspace state when authenticated', async () => {
      mockWorkspaceState({ sidebarCollapsed: true });
      renderHook(() => useWorkspaceSync());
      await waitFor(() => expect(useUIStore.getState().sidebarCollapsed).toBe(true));
    });

    it('debounces saves when state changes', async () => {
      renderHook(() => useWorkspaceSync());
      act(() => useUIStore.getState().toggleSidebar());
      expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining('PATCH'));
      await advanceTimersByTime(600);
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('PATCH'));
    });

    it('does not save until initial load completes', async () => {
      // Prevents overwriting server state with client defaults
    });
  });
  ```

**Implementation Steps**:

1. **Add WorkspaceState type** (shared)
   - Define interface in `src/shared/types/index.ts`
   - Include: sidebarCollapsed, expandedProjectIds, activeShellId, updatedAt

2. **Create WorkspaceStateStore** (server storage layer)
   - File: `src/server/storage/stores/WorkspaceStateStore.ts`
   - Use JsonStore<T> pattern (keyed by session token)
   - Methods: get, set, delete, cleanupOrphanedStates

3. **Update Storage interface**
   - Add workspaceStates: WorkspaceStateStore to Storage interface
   - Initialize in createStorage() with workspace-states.json

4. **Create WorkspaceStateService** (server business logic)
   - File: `src/server/services/workspace/WorkspaceStateService.ts`
   - Methods: get (with defaults), update (partial), delete
   - Validate: filter deleted projects/shells on read

5. **Create workspace API routes**
   - File: `src/server/api/routes/workspace.ts`
   - GET /api/workspace - returns current state (defaults if none)
   - PATCH /api/workspace - partial update with Zod validation

6. **Wire up server**
   - Add WorkspaceStateService to RouteServices
   - Mount workspace router at /workspace
   - Create and inject service in server entry

7. **Add client API functions**
   - getWorkspaceState() and updateWorkspaceState() in api.ts

8. **Add workspace query key**
   - Add workspace.state key to queryKeys.ts

9. **Create useWorkspaceSync hook**
   - Fetch state on mount (when authenticated)
   - Apply server state to Zustand store
   - Subscribe to Zustand changes, debounce saves
   - Skip saves until initial load completes

10. **Integrate hook in MainPage**
    - Call useWorkspaceSync() at app root level

11. **Update test helpers**
    - Add WorkspaceStateService to test server helper

**Files to Create**:
- `src/server/storage/stores/WorkspaceStateStore.ts`
- `src/server/services/workspace/WorkspaceStateService.ts`
- `src/server/api/routes/workspace.ts`
- `src/client/hooks/useWorkspaceSync.ts`
- `test/unit/server/storage/stores/WorkspaceStateStore.test.ts`
- `test/unit/server/services/workspace/WorkspaceStateService.test.ts`
- `test/unit/client/hooks/useWorkspaceSync.test.ts`
- `test/integration/api/workspace.test.ts`

**Files to Modify**:
- `src/shared/types/index.ts` - Add WorkspaceState interface
- `src/server/storage/index.ts` - Add WorkspaceStateStore to Storage
- `src/server/api/routes/index.ts` - Add workspace router
- `src/server/index.ts` - Create and inject WorkspaceStateService
- `src/client/services/api.ts` - Add workspace API functions
- `src/client/hooks/queryKeys.ts` - Add workspace query key
- `src/client/stores/uiStore.ts` - Add setWorkspaceState action
- `src/client/pages/MainPage.tsx` - Integrate useWorkspaceSync
- `test/helpers/server.ts` - Add WorkspaceStateService

**Verification**:
- Workspace state persists across browser refresh
- Workspace state syncs when opening same session on different device
- Deleted projects/shells are filtered out on load
- Multiple tabs don't cause race conditions (last-write-wins)
- State changes debounce properly (500ms)
- No saves triggered during initial load

**Benefits**:
1. **Cross-device continuity** - Pick up exactly where you left off
2. **Session persistence** - State survives browser restarts
3. **Graceful degradation** - Invalid references cleaned up automatically
4. **Performance** - Debounced saves minimize server load

---

### Phase 5: PTY Management and Real Terminal

**Objective**: Implement real terminal functionality with PTY processes and WebSocket communication. Replace mock terminal with xterm.js connected to real shells.

**Tests to Write First**:
- `test/unit/server/services/pty/PtySession.test.ts`: PTY session
  ```typescript
  describe('PtySession', () => {
    it('wraps PTY with event emitter interface', () => {
      const mockPty = createMockPty();
      const session = new PtySession('shell-1', mockPty, '/tmp');

      expect(session.id).toBe('shell-1');
      expect(session.pid).toBe(12345);
    });

    it('forwards write to PTY', () => {
      const mockPty = createMockPty();
      const session = new PtySession('shell-1', mockPty, '/tmp');

      session.write('ls\r');
      expect(mockPty.write).toHaveBeenCalledWith('ls\r');
    });

    it('emits data events from PTY', async () => {
      const mockPty = createMockPty();
      const session = new PtySession('shell-1', mockPty, '/tmp');

      const dataPromise = new Promise(resolve => session.on('data', resolve));
      mockPty.emit('data', 'output');

      expect(await dataPromise).toBe('output');
    });

    it('handles resize', () => {
      const mockPty = createMockPty();
      const session = new PtySession('shell-1', mockPty, '/tmp');

      session.resize(120, 40);
      expect(mockPty.resize).toHaveBeenCalledWith(120, 40);
    });

    it('emits exit event', async () => {
      const mockPty = createMockPty();
      const session = new PtySession('shell-1', mockPty, '/tmp');

      const exitPromise = new Promise(resolve => session.on('exit', resolve));
      mockPty.emit('exit', { exitCode: 0 });

      expect(await exitPromise).toEqual({ exitCode: 0 });
    });
  });
  ```

- `test/unit/server/services/pty/PtyManager.test.ts`: PTY lifecycle
  ```typescript
  describe('PtyManager', () => {
    let manager: PtyManager;

    beforeEach(() => {
      manager = new PtyManager({ ptyFactory: createMockPtyFactory() });
    });

    afterEach(async () => {
      await manager.killAll();
    });

    it('spawns session and tracks by shellId', async () => {
      const session = await manager.spawn('shell-1', { cwd: '/tmp' });

      expect(session.id).toBe('shell-1');
      expect(manager.get('shell-1')).toBe(session);
    });

    it('kills session by shellId', async () => {
      await manager.spawn('shell-1', { cwd: '/tmp' });
      await manager.kill('shell-1');

      expect(manager.get('shell-1')).toBeUndefined();
    });

    it('removes session on exit', async () => {
      const mockPty = createMockPty();
      manager = new PtyManager({ ptyFactory: () => mockPty });

      await manager.spawn('shell-1', { cwd: '/tmp' });
      mockPty.emit('exit', { exitCode: 0 });

      // Wait for event processing
      await new Promise(r => setTimeout(r, 10));
      expect(manager.get('shell-1')).toBeUndefined();
    });

    it('kills all sessions on shutdown', async () => {
      await manager.spawn('shell-1', { cwd: '/tmp' });
      await manager.spawn('shell-2', { cwd: '/tmp' });

      await manager.killAll();

      expect(manager.count()).toBe(0);
    });
  });
  ```

- `test/unit/server/websocket/handlers/terminal.test.ts`: WebSocket handler
  ```typescript
  describe('TerminalHandler', () => {
    let handler: TerminalHandler;
    let ptyManager: PtyManager;
    let mockWs: MockWebSocket;

    beforeEach(() => {
      ptyManager = new PtyManager({ ptyFactory: createMockPtyFactory() });
      handler = new TerminalHandler(ptyManager);
      mockWs = createMockWebSocket();
    });

    it('handles input message', async () => {
      await ptyManager.spawn('shell-1', { cwd: '/tmp' });

      handler.handleMessage(mockWs, {
        type: 'input',
        shellId: 'shell-1',
        data: 'ls\r'
      });

      const session = ptyManager.get('shell-1');
      expect(session?.getWriteBuffer()).toContain('ls\r');
    });

    it('handles resize message', async () => {
      const mockPty = createMockPty();
      ptyManager = new PtyManager({ ptyFactory: () => mockPty });
      handler = new TerminalHandler(ptyManager);

      await ptyManager.spawn('shell-1', { cwd: '/tmp' });

      handler.handleMessage(mockWs, {
        type: 'resize',
        shellId: 'shell-1',
        cols: 100,
        rows: 30
      });

      expect(mockPty.resize).toHaveBeenCalledWith(100, 30);
    });

    it('sends output to WebSocket', async () => {
      const mockPty = createMockPty();
      ptyManager = new PtyManager({ ptyFactory: () => mockPty });
      handler = new TerminalHandler(ptyManager);

      await ptyManager.spawn('shell-1', { cwd: '/tmp' });
      handler.attachClient(mockWs, 'shell-1');

      mockPty.emit('data', 'output data');

      expect(mockWs.sent).toContainEqual({
        type: 'output',
        shellId: 'shell-1',
        data: 'output data'
      });
    });

    it('sends status updates', async () => {
      const mockPty = createMockPty();
      ptyManager = new PtyManager({ ptyFactory: () => mockPty });
      handler = new TerminalHandler(ptyManager);

      await ptyManager.spawn('shell-1', { cwd: '/tmp' });
      handler.attachClient(mockWs, 'shell-1');

      mockPty.emit('exit', { exitCode: 0 });

      await vi.waitFor(() => {
        expect(mockWs.sent).toContainEqual({
          type: 'status',
          shellId: 'shell-1',
          status: 'exited',
          exitCode: 0
        });
      });
    });
  });
  ```

- `test/integration/pty/PtyManager.live.test.ts`: Real PTY tests
  ```typescript
  describe('PtyManager (Live)', () => {
    let manager: PtyManager;

    beforeEach(() => {
      manager = new PtyManager(); // Real PTY
    });

    afterEach(async () => {
      await manager.killAll();
    });

    it('spawns real shell process', async () => {
      const session = await manager.spawn('test', { cwd: '/tmp' });

      expect(session.pid).toBeGreaterThan(0);
    });

    it('executes commands and returns output', async () => {
      const session = await manager.spawn('test', { cwd: '/tmp' });

      let output = '';
      session.on('data', data => { output += data; });

      session.write('echo "live-test-output"\r');

      await waitFor(() => output.includes('live-test-output'), { timeout: 5000 });
    });

    it('handles resize', async () => {
      const session = await manager.spawn('test', { cwd: '/tmp' });

      session.resize(100, 30);

      let output = '';
      session.on('data', data => { output += data; });
      session.write('stty size\r');

      await waitFor(() => output.includes('30 100'), { timeout: 5000 });
    });

    it('handles process exit', async () => {
      const session = await manager.spawn('test', { cwd: '/tmp' });

      const exitPromise = new Promise(resolve => session.on('exit', resolve));
      session.write('exit\r');

      const result = await exitPromise;
      expect(result).toEqual({ exitCode: 0 });
    });
  });
  ```

- `test/integration/websocket/terminal.test.ts`: WebSocket integration
  ```typescript
  describe('Terminal WebSocket', () => {
    let server: TestServer;

    beforeAll(async () => {
      server = await createTestServer();
    });

    afterAll(() => server.close());

    it('connects with valid session', async () => {
      const ws = await server.connectWebSocket();
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('rejects connection without auth', async () => {
      await expect(server.connectWebSocket({ noAuth: true }))
        .rejects.toThrow();
    });

    it('sends and receives terminal data', async () => {
      const projectId = await server.createTestProject();
      const shellId = await server.createTestShell(projectId);

      const ws = await server.connectWebSocket();

      // Attach to shell
      sendMessage(ws, { type: 'attach', shellId });

      // Send input
      sendMessage(ws, { type: 'input', shellId, data: 'echo "ws-test"\r' });

      // Wait for output
      const msg = await waitForMessage(ws, { type: 'output', shellId });
      expect(msg.data).toContain('ws-test');

      ws.close();
    });

    it('multiplexes multiple shells', async () => {
      const projectId = await server.createTestProject();
      const shell1 = await server.createTestShell(projectId);
      const shell2 = await server.createTestShell(projectId);

      const ws = await server.connectWebSocket();

      sendMessage(ws, { type: 'attach', shellId: shell1 });
      sendMessage(ws, { type: 'attach', shellId: shell2 });

      sendMessage(ws, { type: 'input', shellId: shell1, data: 'echo "one"\r' });
      sendMessage(ws, { type: 'input', shellId: shell2, data: 'echo "two"\r' });

      const [msg1, msg2] = await Promise.all([
        waitForMessage(ws, { type: 'output', shellId: shell1, contains: 'one' }),
        waitForMessage(ws, { type: 'output', shellId: shell2, contains: 'two' })
      ]);

      expect(msg1.shellId).toBe(shell1);
      expect(msg2.shellId).toBe(shell2);

      ws.close();
    });
  });
  ```

- `test/unit/server/services/pty/PtyPool.test.ts`: PTY pool and cleanup
  ```typescript
  describe('PtyPool', () => {
    let pool: PtyPool;
    let mockShellStore: ShellStore;

    beforeEach(() => {
      mockShellStore = createMockShellStore();
      pool = new PtyPool({ ptyFactory: createMockPtyFactory() });
    });

    afterEach(async () => {
      await pool.shutdown();
    });

    it('tracks sessions by shell ID', async () => {
      const session = await pool.spawn('shell-1', { cwd: '/tmp' });
      expect(pool.get('shell-1')).toBe(session);
    });

    it('cleans up orphaned sessions on startup', async () => {
      // Shell in database with PID that doesn't exist
      mockShellStore.shells = [{
        id: 'orphan-1',
        pid: 99999, // Non-existent PID
        status: 'active'
      }];

      await pool.cleanupOrphans(mockShellStore);

      expect(mockShellStore.updateShell).toHaveBeenCalledWith(
        'orphan-1',
        { status: 'inactive', pid: null }
      );
    });

    it('gracefully shuts down all sessions', async () => {
      await pool.spawn('shell-1', { cwd: '/tmp' });
      await pool.spawn('shell-2', { cwd: '/tmp' });

      await pool.shutdown();

      expect(pool.count()).toBe(0);
    });

    it('runs periodic cleanup', async () => {
      vi.useFakeTimers();
      const cleanupSpy = vi.spyOn(pool, 'cleanupOrphans');

      pool.startCleanupInterval(60000);
      vi.advanceTimersByTime(60000);

      expect(cleanupSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
  ```

- `test/unit/server/websocket/heartbeat.test.ts`: WebSocket heartbeat
  ```typescript
  describe('WebSocket Heartbeat', () => {
    let wss: WebSocketServer;
    let mockClient: MockWebSocket;

    beforeEach(() => {
      vi.useFakeTimers();
      wss = createTestWebSocketServer();
      mockClient = createMockWebSocket();
      wss.emit('connection', mockClient);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('sends ping at configured interval', () => {
      vi.advanceTimersByTime(30000); // HEARTBEAT_INTERVAL
      expect(mockClient.ping).toHaveBeenCalled();
    });

    it('marks client as alive on pong', () => {
      mockClient.isAlive = false;
      mockClient.emit('pong');
      expect(mockClient.isAlive).toBe(true);
    });

    it('terminates unresponsive clients', () => {
      mockClient.isAlive = false;
      vi.advanceTimersByTime(30000);
      expect(mockClient.terminate).toHaveBeenCalled();
    });

    it('keeps responsive clients connected', () => {
      // First ping
      vi.advanceTimersByTime(30000);
      mockClient.emit('pong');

      // Second ping
      vi.advanceTimersByTime(30000);

      expect(mockClient.terminate).not.toHaveBeenCalled();
    });
  });
  ```

- `test/unit/client/services/websocket.test.ts`: Reconnecting WebSocket
  ```typescript
  describe('ReconnectingWebSocket', () => {
    let rws: ReconnectingWebSocket;

    beforeEach(() => {
      vi.useFakeTimers();
      rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal');
    });

    afterEach(() => {
      rws.close();
      vi.useRealTimers();
    });

    it('connects on initialization', () => {
      rws.connect();
      expect(WebSocket).toHaveBeenCalledWith('ws://localhost:9000/ws/terminal');
    });

    it('reconnects after disconnect with exponential backoff', () => {
      rws.connect();

      // First disconnect - 1s delay
      rws.simulateClose();
      vi.advanceTimersByTime(1000);
      expect(WebSocket).toHaveBeenCalledTimes(2);

      // Second disconnect - 2s delay
      rws.simulateClose();
      vi.advanceTimersByTime(2000);
      expect(WebSocket).toHaveBeenCalledTimes(3);

      // Third disconnect - 4s delay
      rws.simulateClose();
      vi.advanceTimersByTime(4000);
      expect(WebSocket).toHaveBeenCalledTimes(4);
    });

    it('resets attempts after successful connection', () => {
      rws.connect();
      rws.simulateClose();
      vi.advanceTimersByTime(1000);

      // Successful connection
      rws.simulateOpen();
      rws.simulateClose();

      // Should be back to 1s delay
      vi.advanceTimersByTime(1000);
      expect(WebSocket).toHaveBeenCalledTimes(4);
    });

    it('stops reconnecting after max attempts', () => {
      const onMaxRetries = vi.fn();
      rws.onMaxRetriesReached = onMaxRetries;
      rws.connect();

      // Exhaust all retry attempts
      for (let i = 0; i < 10; i++) {
        rws.simulateClose();
        vi.advanceTimersByTime(60000); // Advance past max delay
      }

      rws.simulateClose();
      vi.advanceTimersByTime(60000);

      expect(onMaxRetries).toHaveBeenCalled();
    });

    it('caps delay at maxDelay', () => {
      rws.connect();

      // Many reconnection attempts
      for (let i = 0; i < 20; i++) {
        rws.simulateClose();
        vi.advanceTimersByTime(60000);
      }

      // Delay should be capped at 30000ms
      const lastDelay = rws.getLastReconnectDelay();
      expect(lastDelay).toBeLessThanOrEqual(31000); // 30000 + jitter
    });
  });
  ```

- `test/unit/client/hooks/useTerminal.test.ts`: Terminal hook
  ```typescript
  describe('useTerminal', () => {
    let mockWs: MockWebSocket;

    beforeEach(() => {
      mockWs = createMockWebSocket();
      vi.mocked(useWebSocket).mockReturnValue({
        ws: mockWs,
        status: 'connected',
        send: (data) => mockWs.send(JSON.stringify(data))
      });
    });

    it('attaches to shell on mount', () => {
      renderHook(() => useTerminal('shell-1'));

      expect(mockWs.sent).toContainEqual({
        type: 'attach',
        shellId: 'shell-1'
      });
    });

    it('forwards terminal input to WebSocket', () => {
      const { result } = renderHook(() => useTerminal('shell-1'));

      result.current.write('test input');

      expect(mockWs.sent).toContainEqual({
        type: 'input',
        shellId: 'shell-1',
        data: 'test input'
      });
    });

    it('calls onData with output', async () => {
      const onData = vi.fn();
      renderHook(() => useTerminal('shell-1', { onData }));

      mockWs.simulateMessage({
        type: 'output',
        shellId: 'shell-1',
        data: 'output data'
      });

      expect(onData).toHaveBeenCalledWith('output data');
    });

    it('sends resize events', () => {
      const { result } = renderHook(() => useTerminal('shell-1'));

      result.current.resize(120, 40);

      expect(mockWs.sent).toContainEqual({
        type: 'resize',
        shellId: 'shell-1',
        cols: 120,
        rows: 40
      });
    });
  });
  ```

**Implementation**:
- `src/server/services/pty/PtySession.ts`: PTY session wrapper
- `src/server/services/pty/PtyManager.ts`: PTY lifecycle management
- `src/server/services/pty/PtyPool.ts`: Session pooling and orphan cleanup
  ```typescript
  // PtyPool manages active PTY sessions with cleanup capabilities
  class PtyPool {
    private sessions: Map<string, PtySession> = new Map();

    // Restore sessions from database on startup
    async restoreFromDatabase(shellStore: ShellStore): Promise<void>;

    // Kill orphaned PTYs (PIDs in database but process dead)
    async cleanupOrphans(): Promise<void>;

    // Periodic cleanup task
    startCleanupInterval(intervalMs: number): void;

    // Graceful shutdown - kill all PTYs
    async shutdown(): Promise<void>;
  }
  ```
- `src/server/websocket/WebSocketServer.ts`: WebSocket server setup with heartbeat
  ```typescript
  // WebSocket server with ping/pong heartbeat
  const wss = new WebSocketServer({ server, path: '/ws/terminal' });

  // Heartbeat to detect dead connections
  const HEARTBEAT_INTERVAL = 30000;
  const HEARTBEAT_TIMEOUT = 10000;

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });

  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);
  ```
- `src/server/websocket/handlers/terminal.ts`: Terminal message handler
- `src/server/services/shell/ShellService.ts`: Update to integrate PTY
- `src/server/index.ts`: Add WebSocket server
- `src/client/services/websocket.ts`: WebSocket client with reconnection
  ```typescript
  // Reconnecting WebSocket with exponential backoff
  class ReconnectingWebSocket {
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private baseDelay = 1000;
    private maxDelay = 30000;

    connect(): void {
      this.ws = new WebSocket(this.url);
      this.ws.onclose = () => this.scheduleReconnect();
      this.ws.onerror = () => this.scheduleReconnect();
    }

    private scheduleReconnect(): void {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.onMaxRetriesReached?.();
        return;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        this.baseDelay * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
        this.maxDelay
      );

      this.reconnectAttempts++;
      setTimeout(() => this.connect(), delay);
    }

    // Reset attempts on successful connection
    private onOpen(): void {
      this.reconnectAttempts = 0;
    }
  }
  ```
- `src/client/hooks/useWebSocket.ts`: WebSocket connection hook
- `src/client/hooks/useTerminal.ts`: Terminal connection hook
- `src/client/components/terminal/Terminal.tsx`: xterm.js wrapper
- `src/client/components/terminal/TerminalCanvas.tsx`: Update for real terminal
- `src/client/components/common/ConnectionStatus.tsx`: WebSocket status indicator
- `test/mocks/pty.ts`: Mock PTY for unit tests
- `test/mocks/websocket.ts`: Mock WebSocket
- `test/helpers/websocket.ts`: WebSocket test utilities

**Dependencies**:
- External: `node-pty-prebuilt-multiarch`, `ws`, `xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`
- Dev: `@types/ws`
- Internal: Phase 4 (connected frontend/backend)

---

#### What Was Added

- Real PTY process spawning with node-pty
- WebSocket server for real-time terminal I/O
- xterm.js terminal emulator in browser
- Terminal resize support
- WebSocket reconnection with status indicator
- Multiple shells multiplexed over single WebSocket
- Shell status updates (active/inactive/error)

#### How to Test

```bash
# Start the full application
AIFORGE_AUTH_GUID=<your-guid> npm run dev

# Open browser to http://localhost:9000
```

**Manual Testing Checklist**:

1. **Real Terminal**
   - Create a project and shell
   - Click the shell to open terminal
   - Type `ls -la` and press Enter - see real directory listing
   - Type `pwd` - see actual working directory
   - Type `echo $SHELL` - see your shell

2. **Terminal Features**
   - Run a command with colored output: `ls --color`
   - Test command history with up/down arrows
   - Test tab completion
   - Resize browser window, terminal adjusts
   - Try copy/paste (Ctrl+Shift+C / Ctrl+Shift+V)

3. **Shell Persistence**
   - Start a process: `sleep 60 &`
   - Refresh the page
   - Click the shell again - session is restored
   - Run `jobs` - background process still running

4. **Multiple Shells**
   - Create multiple shells in a project
   - Switch between them
   - Each has independent session
   - Run different commands in each

5. **Connection Status**
   - Look for connection indicator in UI
   - Stop backend server - see "disconnected" status
   - Start backend - see automatic reconnection
   - Terminal resumes working after reconnect

6. **Shell Lifecycle**
   - Type `exit` in terminal
   - Shell status updates to "exited"
   - Can restart shell from UI (context menu → Restart)
   - After restart, terminal is responsive again
   - Run `echo $$` before/after restart - PID changes

---

### Phase 6: E2E Testing and Polish

**Objective**: Add comprehensive E2E tests, polish the UI with proper error handling, loading states, and edge case handling. Ensure production readiness.

**Tests to Write First**:
- `test/e2e/auth.spec.ts`: Authentication E2E
  ```typescript
  test.describe('Authentication', () => {
    test('redirects unauthenticated users to login', async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL('/login');
    });

    test('shows error for invalid GUID', async ({ page }) => {
      await page.goto('/login');
      await page.fill('[data-testid="guid-input"]', 'invalid-guid');
      await page.click('[data-testid="login-button"]');

      await expect(page.locator('[data-testid="login-error"]'))
        .toContainText('Invalid');
    });

    test('logs in and redirects to home', async ({ page }) => {
      await page.goto('/login');
      await page.fill('[data-testid="guid-input"]', process.env.TEST_GUID!);
      await page.click('[data-testid="login-button"]');

      await expect(page).toHaveURL('/');
      await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
    });

    test('persists session across page reload', async ({ page }) => {
      await loginAs(page, process.env.TEST_GUID!);
      await page.reload();

      await expect(page).toHaveURL('/');
    });

    test('logs out and clears session', async ({ page }) => {
      await loginAs(page, process.env.TEST_GUID!);
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');

      await expect(page).toHaveURL('/login');
      await page.reload();
      await expect(page).toHaveURL('/login');
    });
  });
  ```

- `test/e2e/projects.spec.ts`: Project management E2E
  ```typescript
  test.describe('Projects', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, process.env.TEST_GUID!);
    });

    test('creates a new project', async ({ page }) => {
      await page.click('[data-testid="add-project-button"]');

      // Navigate in directory browser
      await expect(page.locator('[data-testid="directory-browser"]')).toBeVisible();
      await page.fill('[data-testid="path-input"]', '/tmp/e2e-test-project');
      await page.click('[data-testid="select-directory-button"]');

      await expect(page.locator('[data-testid="project-item"]'))
        .toContainText('e2e-test-project');
    });

    test('renames a project', async ({ page }) => {
      await createProject(page, '/tmp/rename-test');

      await page.click('[data-testid="project-menu"]');
      await page.click('[data-testid="rename-project"]');
      await page.fill('[data-testid="rename-input"]', 'renamed-project');
      await page.click('[data-testid="rename-confirm"]');

      await expect(page.locator('[data-testid="project-item"]'))
        .toContainText('renamed-project');
    });

    test('deletes a project', async ({ page }) => {
      await createProject(page, '/tmp/delete-test');

      await page.click('[data-testid="project-menu"]');
      await page.click('[data-testid="delete-project"]');
      await page.click('[data-testid="confirm-delete"]');

      await expect(page.locator('[data-testid="project-item"]')).toHaveCount(0);
    });

    test('persists projects after reload', async ({ page }) => {
      await createProject(page, '/tmp/persist-test');
      await page.reload();

      await expect(page.locator('[data-testid="project-item"]'))
        .toContainText('persist-test');
    });
  });
  ```

- `test/e2e/terminal.spec.ts`: Terminal E2E
  ```typescript
  test.describe('Terminal', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, process.env.TEST_GUID!);
      await createProject(page, '/tmp/terminal-test');
    });

    test('creates shell and shows terminal', async ({ page }) => {
      await page.click('[data-testid="add-shell-button"]');

      await expect(page.locator('[data-testid="terminal"]')).toBeVisible();
    });

    test('executes commands', async ({ page }) => {
      await page.click('[data-testid="add-shell-button"]');
      await page.locator('[data-testid="terminal"]').click();

      await page.keyboard.type('echo "e2e-test-output"');
      await page.keyboard.press('Enter');

      await expect(page.locator('[data-testid="terminal"]'))
        .toContainText('e2e-test-output', { timeout: 10000 });
    });

    test('terminal survives page reload', async ({ page }) => {
      await page.click('[data-testid="add-shell-button"]');
      await page.locator('[data-testid="terminal"]').click();

      // Set an environment variable
      await page.keyboard.type('export E2E_VAR=persistent');
      await page.keyboard.press('Enter');

      await page.reload();

      // Reselect the shell
      await page.click('[data-testid="shell-item"]');
      await page.locator('[data-testid="terminal"]').click();

      await page.keyboard.type('echo $E2E_VAR');
      await page.keyboard.press('Enter');

      await expect(page.locator('[data-testid="terminal"]'))
        .toContainText('persistent', { timeout: 10000 });
    });

    test('handles multiple shells', async ({ page }) => {
      // Create two shells
      await page.click('[data-testid="add-shell-button"]');
      await page.click('[data-testid="add-shell-button"]');

      // Select first shell and set variable
      await page.click('[data-testid="shell-item"]:first-child');
      await page.locator('[data-testid="terminal"]').click();
      await page.keyboard.type('export SHELL_NUM=1');
      await page.keyboard.press('Enter');

      // Select second shell and set different variable
      await page.click('[data-testid="shell-item"]:last-child');
      await page.locator('[data-testid="terminal"]').click();
      await page.keyboard.type('export SHELL_NUM=2');
      await page.keyboard.press('Enter');

      // Verify shells are independent
      await page.keyboard.type('echo $SHELL_NUM');
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-testid="terminal"]'))
        .toContainText('2');

      await page.click('[data-testid="shell-item"]:first-child');
      await page.locator('[data-testid="terminal"]').click();
      await page.keyboard.type('echo $SHELL_NUM');
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-testid="terminal"]'))
        .toContainText('1');
    });

    test('shows reconnection status', async ({ page }) => {
      await page.click('[data-testid="add-shell-button"]');

      // Disconnect WebSocket
      await page.evaluate(() => {
        (window as any).__aiforge_ws?.close();
      });

      await expect(page.locator('[data-testid="connection-status"]'))
        .toHaveAttribute('data-status', 'disconnected');

      // Should auto-reconnect
      await expect(page.locator('[data-testid="connection-status"]'))
        .toHaveAttribute('data-status', 'connected', { timeout: 10000 });
    });
  });
  ```

- `test/e2e/directory-browser.spec.ts`: Directory browser E2E
  ```typescript
  test.describe('Directory Browser', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, process.env.TEST_GUID!);
    });

    test('opens at configured root', async ({ page }) => {
      await page.click('[data-testid="add-project-button"]');

      await expect(page.locator('[data-testid="current-path"]'))
        .toContainText('/');
    });

    test('navigates into directories', async ({ page }) => {
      await page.click('[data-testid="add-project-button"]');

      await page.click('[data-testid="dir-entry-tmp"]');

      await expect(page.locator('[data-testid="current-path"]'))
        .toContainText('/tmp');
    });

    test('navigates up with breadcrumb', async ({ page }) => {
      await page.click('[data-testid="add-project-button"]');

      await page.click('[data-testid="dir-entry-tmp"]');
      await page.click('[data-testid="breadcrumb-root"]');

      await expect(page.locator('[data-testid="current-path"]'))
        .toContainText('/');
    });

    test('allows direct path input', async ({ page }) => {
      await page.click('[data-testid="add-project-button"]');

      await page.fill('[data-testid="path-input"]', '/tmp');
      await page.keyboard.press('Enter');

      await expect(page.locator('[data-testid="current-path"]'))
        .toContainText('/tmp');
    });

    test('shows error for invalid path', async ({ page }) => {
      await page.click('[data-testid="add-project-button"]');

      await page.fill('[data-testid="path-input"]', '/nonexistent/path');
      await page.keyboard.press('Enter');

      await expect(page.locator('[data-testid="path-error"]')).toBeVisible();
    });
  });
  ```

- `test/unit/server/services/auth/SessionCleanup.test.ts`: Session expiration cleanup
  ```typescript
  describe('SessionCleanup', () => {
    let cleanup: SessionCleanup;
    let mockSessionStore: SessionStore;

    beforeEach(() => {
      vi.useFakeTimers();
      mockSessionStore = createMockSessionStore();
      cleanup = new SessionCleanup(mockSessionStore, 60000);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('removes expired sessions', async () => {
      const now = new Date();
      mockSessionStore.sessions = [
        { id: '1', token: 'a', expiresAt: new Date(now.getTime() - 1000).toISOString() }, // Expired
        { id: '2', token: 'b', expiresAt: new Date(now.getTime() + 86400000).toISOString() }, // Valid
      ];

      const removed = await cleanup.cleanup();

      expect(removed).toBe(1);
      expect(mockSessionStore.write).toHaveBeenCalledWith([
        expect.objectContaining({ id: '2' })
      ]);
    });

    it('does not write if no sessions expired', async () => {
      const now = new Date();
      mockSessionStore.sessions = [
        { id: '1', token: 'a', expiresAt: new Date(now.getTime() + 86400000).toISOString() },
      ];

      const removed = await cleanup.cleanup();

      expect(removed).toBe(0);
      expect(mockSessionStore.write).not.toHaveBeenCalled();
    });

    it('runs cleanup on startup', () => {
      const cleanupSpy = vi.spyOn(cleanup, 'cleanup');
      cleanup.start();
      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('runs cleanup at configured interval', () => {
      const cleanupSpy = vi.spyOn(cleanup, 'cleanup');
      cleanup.start();

      vi.advanceTimersByTime(60000);
      expect(cleanupSpy).toHaveBeenCalledTimes(2); // startup + interval

      vi.advanceTimersByTime(60000);
      expect(cleanupSpy).toHaveBeenCalledTimes(3);
    });
  });
  ```

- `test/integration/api/rateLimit.test.ts`: Rate limiting tests
  ```typescript
  describe('Rate Limiting', () => {
    let server: TestServer;

    beforeAll(async () => {
      server = await createTestServer();
    });

    afterAll(() => server.close());

    it('allows requests under rate limit', async () => {
      for (let i = 0; i < 5; i++) {
        await request(server.app)
          .post('/api/auth/login')
          .send({ guid: 'wrong-guid' })
          .expect(401);
      }
    });

    it('blocks requests exceeding rate limit', async () => {
      // Exhaust rate limit
      for (let i = 0; i < 10; i++) {
        await request(server.app)
          .post('/api/auth/login')
          .send({ guid: 'wrong-guid' });
      }

      // Next request should be rate limited
      const response = await request(server.app)
        .post('/api/auth/login')
        .send({ guid: 'wrong-guid' });

      expect(response.status).toBe(429);
      expect(response.body.message).toContain('Too many');
    });

    it('resets rate limit after window expires', async () => {
      // This test requires mocking time or using a short window
      // Implementation detail: use a 1-second window for testing
    });
  });
  ```

**Implementation**:
- `playwright.config.ts`: Playwright configuration
- `test/e2e/helpers/auth.ts`: E2E authentication helpers
- `test/e2e/helpers/fixtures.ts`: Test fixtures and setup
- `src/client/components/common/ErrorBoundary.tsx`: React error boundary
- `src/client/components/common/LoadingOverlay.tsx`: Loading states
- `src/client/components/common/ConfirmDialog.tsx`: Confirmation dialogs
- `src/server/api/middleware/rateLimit.ts`: Rate limiting for auth
- `src/server/services/auth/SessionCleanup.ts`: Expired session cleanup
  ```typescript
  // Periodic cleanup of expired sessions
  class SessionCleanup {
    constructor(
      private sessionStore: SessionStore,
      private intervalMs: number = 60 * 60 * 1000 // 1 hour
    ) {}

    start(): void {
      setInterval(() => this.cleanup(), this.intervalMs);
      // Also run on startup
      this.cleanup();
    }

    async cleanup(): Promise<number> {
      const sessions = await this.sessionStore.read();
      const now = new Date();
      const validSessions = sessions.filter(s =>
        new Date(s.expiresAt) > now
      );
      const removed = sessions.length - validSessions.length;
      if (removed > 0) {
        await this.sessionStore.write(validSessions);
        logger.info({ removed }, 'Cleaned up expired sessions');
      }
      return removed;
    }
  }
  ```
- `.github/workflows/ci.yml`: Full CI pipeline (based on servherd)
  ```yaml
  name: CI

  on:
    push:
      branches: [master, main]
    pull_request:
      branches: [master, main]

  jobs:
    lint:
      name: Lint
      runs-on: ubuntu-latest
      env:
        HUSKY: 0  # Disable git hooks in CI
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 22.x
            cache: 'npm'
        - run: npm ci
        - run: npm run lint

    test:
      name: Test (Node ${{ matrix.node }})
      runs-on: ubuntu-latest
      strategy:
        matrix:
          node: [20, 22]
      env:
        HUSKY: 0
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: ${{ matrix.node }}
            cache: 'npm'
        - run: npm ci
        - run: npm run build
        - run: npm test

    coverage:
      name: Coverage
      runs-on: ubuntu-latest
      env:
        HUSKY: 0
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 22.x
            cache: 'npm'
        - run: npm ci
        - run: npm run build
        - run: npm run test:coverage
        - name: Coveralls
          uses: coverallsapp/github-action@v2
          with:
            github-token: ${{ secrets.GITHUB_TOKEN }}
            path-to-lcov: ./coverage/lcov.info

    e2e:
      name: E2E Tests
      runs-on: ubuntu-latest
      env:
        HUSKY: 0
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 22.x
            cache: 'npm'
        - run: npm ci
        - run: npx playwright install --with-deps chromium
        - run: npm run build
        - run: npm run test:e2e
        - uses: actions/upload-artifact@v4
          if: failure()
          with:
            name: playwright-report
            path: playwright-report/
            retention-days: 7

    release:
      name: Release
      runs-on: ubuntu-latest
      needs: [lint, test, coverage, e2e]
      if: github.ref == 'refs/heads/master' || github.ref == 'refs/heads/main'
      permissions:
        contents: write       # Write to repository
        issues: write         # Update issues
        pull-requests: write  # Update PRs
        id-token: write       # npm trusted publishing (OIDC)
      steps:
        - name: Checkout code
          uses: actions/checkout@v4
          with:
            fetch-depth: 0          # Full history for semantic-release
            persist-credentials: false  # Security with id-token

        - name: Setup Node.js
          uses: actions/setup-node@v4
          with:
            node-version: 22.x

        - name: Upgrade npm for trusted publishing
          run: npm install -g npm@latest

        - name: Install dependencies
          run: npm ci
          env:
            HUSKY: 0

        - name: Build
          run: npm run build

        - name: Run semantic-release
          env:
            GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          run: npx semantic-release
  ```

  **Key CI Configuration Details**:
  - `HUSKY: 0` environment variable disables git hooks during CI (prevents hook failures)
  - `npm install -g npm@latest` upgrades npm for trusted publishing support
  - `fetch-depth: 0` gives semantic-release full git history for version calculation
  - `persist-credentials: false` is required when using `id-token: write` for security
  - `id-token: write` permission enables npm provenance attestation (modern trusted publishing)
  - Release job only runs on master/main branches after all checks pass
- `package.json`: Add coveralls script
  ```json
  {
    "scripts": {
      "test:coverage": "vitest run --coverage",
      "coveralls": "cat ./coverage/lcov.info | coveralls"
    }
  }
  ```
- Add `data-testid` attributes to all interactive components
- Add proper error handling throughout
- Add loading states for all async operations
- Add keyboard shortcuts documentation
- Clean up any console errors/warnings

**Dependencies**:
- External: `@playwright/test`, `express-rate-limit`
- Dev: `coveralls` (for local testing, CI uses GitHub Action)
- Internal: Phase 5 (complete application)

---

#### What Was Added

- Comprehensive E2E test suite with Playwright
- Rate limiting on authentication endpoints
- React error boundaries for graceful error handling
- Loading overlays and skeleton states
- Confirmation dialogs for destructive actions
- CI/CD pipeline with GitHub Actions and Coveralls integration
- Session expiration cleanup (removes expired sessions periodically)
- All components have `data-testid` for testing
- Keyboard accessibility improvements
- Console error/warning cleanup
- Code coverage reporting to Coveralls

#### How to Test

```bash
# Run E2E tests
npm run test:e2e

# Run with UI for debugging
npm run test:e2e -- --ui

# Run specific test file
npm run test:e2e -- test/e2e/terminal.spec.ts

# View test report
npx playwright show-report
```

**Manual Testing Checklist**:

1. **Error Handling**
   - Stop backend, interact with UI - see graceful errors
   - Enter very long project name - see validation
   - Try to delete non-existent project - see error
   - Trigger network error - see retry option

2. **Loading States**
   - Add project - see loading spinner
   - Create shell - see loading state
   - Browse directories - see skeleton loader

3. **Keyboard Navigation**
   - Tab through sidebar items
   - Use Enter to select project/shell
   - Use Escape to close modals
   - Arrow keys in directory browser

4. **Rate Limiting**
   - Try 10 rapid failed logins
   - See rate limit error message
   - Wait and retry successfully

5. **Edge Cases**
   - Create project with special characters in path
   - Handle shell that exits immediately
   - Switch shells rapidly
   - Resize window to very small size

---

### Phase 7: Documentation and Branding

**Objective**: Create comprehensive documentation, design a modern logo, and prepare the project for public release.

**Tests to Write First**:
- No code tests for this phase, but documentation should be reviewed for accuracy

**Implementation**:

#### Documentation Files
- `README.md`: Project overview, features, quick start
  - **Badges** (in order):
    - CI status badge (GitHub Actions)
    - Coveralls.io code coverage badge
    - npm version badge
    - License badge (MIT)
  - Clear value proposition
  - Screenshot/GIF of the application
  - Quick start guide (5 minutes to running)
  - Link to full documentation

  ```markdown
  <!-- Badge examples -->
  ![CI](https://github.com/username/aiforge/actions/workflows/ci.yml/badge.svg)
  [![Coverage Status](https://coveralls.io/repos/github/username/aiforge/badge.svg?branch=main)](https://coveralls.io/github/username/aiforge?branch=main)
  [![npm version](https://badge.fury.io/js/aiforge.svg)](https://badge.fury.io/js/aiforge)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  ```

- `docs/getting-started.md`: Detailed setup guide
  - Prerequisites (Node.js, supported OS)
  - Installation steps
  - First project walkthrough
  - Configuration options

- `docs/configuration.md`: Configuration reference
  - All environment variables
  - Config file options
  - Default values
  - Example configurations

- `docs/architecture.md`: Technical architecture
  - System overview diagram
  - Component descriptions
  - Data flow explanations
  - Technology choices and rationale

- `docs/api.md`: API documentation
  - REST endpoint reference
  - WebSocket protocol
  - Request/response examples
  - Error codes

- `docs/development.md`: Contributing guide
  - Development setup
  - Testing instructions
  - Code style guide
  - PR process

- `docs/deployment.md`: Production deployment
  - PM2 setup
  - Systemd service
  - Docker (future)
  - Nginx reverse proxy
  - SSL/TLS setup

#### Branding Assets

**Logo Design Requirements**:
- Simple, geometric shape - no characters or cartoons
- Inspired by: HTML5 shield, Mocha hexagon, Node.js hexagon, Storybook icon
- Maximum 3 colors with transparent background
- Works at all sizes from 16x16 favicon to large headers
- Single SVG format (PNG/ICO generated from SVG as needed)

**Logo Concept**:
A simple geometric shape (hexagon, shield, or angular form) incorporating:
- An anvil or hammer silhouette (forge concept)
- Or abstract "A" letterform
- Or circuit/spark element (AI + creation)

Color palette options:
- Option A: Deep blue (#1a1a2e) + Electric cyan (#00d9ff) + White
- Option B: Charcoal (#2d2d2d) + Orange flame (#ff6b35) + White
- Option C: Purple (#7c3aed) + Cyan (#06b6d4) + White

**Deliverable**:
- `assets/logo.svg`: Single vector logo with transparent background
- `src/client/components/layout/Logo.tsx`: Logo component (imports SVG)

#### Additional Polish
- `CHANGELOG.md`: Version history (auto-generated)
- `CONTRIBUTING.md`: Contribution guidelines
- `CODE_OF_CONDUCT.md`: Community standards
- `LICENSE`: MIT license
- `.github/ISSUE_TEMPLATE/`: Issue templates
- `.github/PULL_REQUEST_TEMPLATE.md`: PR template
- Update `package.json` with proper metadata
- Add OpenGraph meta tags for social sharing

**Dependencies**:
- External: None (documentation only)
- Internal: All previous phases

---

#### What Was Added

- Professional README with logo and screenshots
- Complete documentation site
- Simple, geometric logo (single SVG)
- GitHub templates for issues and PRs
- Changelog automation
- Contributing guidelines
- MIT license

#### How to Test

```bash
# Preview documentation locally
npm run docs:serve

# Verify logo displays correctly
npm run dev
# Check logo in header, favicon in browser tab
```

**Manual Verification Checklist**:

1. **README**
   - [ ] Logo displays correctly on GitHub (light and dark mode)
   - [ ] All badges render and link correctly:
     - [ ] CI status badge shows passing
     - [ ] Coveralls badge shows coverage percentage
     - [ ] npm version badge shows current version
     - [ ] MIT license badge links to license
   - [ ] Quick start instructions work for new user
   - [ ] All links are valid
   - [ ] Screenshots are current

2. **Documentation**
   - [ ] Getting started guide works end-to-end
   - [ ] Configuration options are complete
   - [ ] API documentation matches implementation
   - [ ] Architecture diagrams are accurate

3. **Logo**
   - [ ] Recognizable at 16x16 (favicon size)
   - [ ] Clean at large sizes (README header)
   - [ ] Uses 3 or fewer colors
   - [ ] Transparent background works on light/dark

4. **GitHub**
   - [ ] Issue templates work
   - [ ] PR template is helpful
   - [ ] License is correct
   - [ ] Package.json metadata complete

---

## Common Utilities Needed

### Shared Between Client and Server
- **Type Definitions** (`src/shared/types/index.ts`): Project, Shell, Session, WebSocket messages
- **Validation Schemas** (`src/shared/types/validation.ts`): Zod schemas for all types

### Server Utilities
- **Logger** (`src/server/utils/logger.ts`): Pino structured logging
- **Errors** (`src/server/utils/errors.ts`): Custom error classes (NotFoundError, ValidationError, AuthError)
- **Validation** (`src/server/utils/validation.ts`): Request validation middleware

### Client Utilities
- **API Client** (`src/client/services/api.ts`): Fetch wrapper with auth and errors
- **WebSocket Client** (`src/client/services/websocket.ts`): Reconnecting WebSocket

### Test Utilities
- **Test Server** (`test/helpers/server.ts`): Isolated test server instances
- **Wait Helpers** (`test/helpers/wait.ts`): Async condition waiting
- **Factories** (`test/fixtures/factories.ts`): Test data factories
- **Mocks**: PTY, WebSocket, xterm.js mocks

---

## External Libraries Assessment

| Task | Library | Reason |
|------|---------|--------|
| Build tool | `vite` | Fast, modern, excellent DX |
| Testing | `vitest` | Vite-native, Jest-compatible |
| E2E testing | `@playwright/test` | Cross-browser, great for terminal testing |
| UI framework | `@mantine/core` | Modern, accessible, TypeScript-first |
| Terminal | `xterm.js` | Industry standard (VS Code uses it) |
| State management | `zustand` + `@tanstack/react-query` | Zustand for UI state, TanStack Query for server state (Phase 4.5) |
| HTTP server | `express` | Industry standard, extensive ecosystem |
| WebSocket | `ws` | Fast, spec-compliant |
| PTY | `node-pty-prebuilt-multiarch` | Cross-platform prebuilt binaries |
| JSON storage | `fs-extra` | Atomic writes, better error handling |
| File locking | `proper-lockfile` | Prevents data corruption |
| UUID | `uuid` | Standard cryptographic UUIDs |
| Validation | `zod` | TypeScript-first validation |
| Logging | `pino` | Fast structured logging |
| Icons | `@tabler/icons-react` | Comprehensive, MIT licensed |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| PTY process leaks | Cleanup on shutdown; track all sessions; periodic orphan cleanup |
| WebSocket disconnects | Exponential backoff reconnect; queue messages; status indicator |
| Data corruption | Atomic writes; file locking; integrity checks |
| Auth bypass | Validate every request/WebSocket message; httpOnly cookies; rate limiting |
| Memory leaks | Limit scrollback; dispose xterm on unmount; monitor in tests |
| Browser compatibility | Target modern browsers; E2E tests on Chrome |
| Large directories | Pagination in browser; reasonable limits |

---

## Implementation Order Summary

| Phase | Focus | Key Deliverables |
|-------|-------|------------------|
| 1 | Scaffolding | Build tools, TypeScript, ESLint, shared types |
| 2 | Frontend MVP | React UI with mock data, full UX |
| 3 | Backend | JSON storage, REST API, authentication |
| 4 | Integration | Connect frontend to backend API |
| 4.5 | State Management | Migrate server state from Zustand to TanStack Query |
| 5 | Terminal | Real PTY, WebSocket, xterm.js |
| 6 | Polish | E2E tests, error handling, production ready |
| 7 | Docs & Branding | Documentation, logo, release preparation |

Each phase delivers a working, testable application that builds incrementally toward the full product.
