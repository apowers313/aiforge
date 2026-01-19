# Implementation Plan for Git Worktree Integration

## Overview

Integrate git worktree functionality into AIForge, allowing users to manage multiple worktrees per project directly from the interface. This plan is structured **UI-first**, so each phase delivers user-visible, testable functionality.

**Scope**: Core CRUD operations (create, list, delete) with status indicators (modified count, ahead/behind). No merge operations or auto-shell creation.

---

## Complete Feature Inventory

Before diving into phases, here is the complete catalog of features from the design document. Each feature is tracked to ensure nothing is lost.

### Types (src/shared/types/index.ts)
| ID | Feature | Phase |
|----|---------|-------|
| T1 | `Worktree` interface (path, branch, commit, isMain, isLocked) | 2 |
| T2 | `WorktreeWithStatus` interface (name, modifiedCount, ahead, behind) | 2 |
| T3 | `CreateWorktreeRequest` interface (name, baseBranch?) | 3 |
| T4 | `WorktreeUI` interface (done, projectId) | 5 |
| T5 | `WorktreeMetadata` interface (worktreePath, projectId, done, timestamps) | 5 |
| T6 | `ContextType` includes 'worktree' | 7 |
| T7 | `WorktreeStatus` type ('red' \| 'green' \| 'blue' \| null) | 5 |
| T8 | `Shell.worktreePath` field (string \| null) | 6 |

### GitService (src/server/services/git/GitService.ts)
| ID | Feature | Phase |
|----|---------|-------|
| G1 | `isGitRepository()` | 2 |
| G2 | `hasCommits()` | 2 |
| G3 | `getMainBranch()` | 3 |
| G4 | `branchExists(branchName)` | 3 |
| G5 | `createWorktree(path, branch, baseBranch?)` | 3 |
| G6 | `listWorktrees()` | 2 |
| G7 | `removeWorktree(path, force?)` | 4 |
| G8 | `getModifiedFileCount(worktreePath?)` | 5 |
| G9 | `getAheadBehind(targetBranch)` | 5 |
| G10 | `getStatus()` - for FileTreeService | 7 |
| G11 | `getRemotes()` - for ProjectMetadataService | 7 |

### WorktreeService (src/server/services/project/WorktreeService.ts)
| ID | Feature | Phase |
|----|---------|-------|
| W1 | `getWorktrees(projectId)` | 2 |
| W2 | `createWorktree(projectId, name, baseBranch?)` | 3 |
| W3 | `deleteWorktree(projectId, worktreePath, force?)` | 4 |
| W4 | `getMainBranch(projectId)` | 3 |
| W5 | `isGitRepository(projectId)` | 2 |

### WorktreeMetadataStore (src/server/storage/stores/WorktreeMetadataStore.ts)
| ID | Feature | Phase |
|----|---------|-------|
| S1 | `getByWorktreePath(worktreePath)` | 5 |
| S2 | `getByProjectId(projectId)` | 5 |
| S3 | `upsert(metadata)` | 5 |
| S4 | `update(worktreePath, updates)` | 5 |
| S5 | `delete(worktreePath)` | 5 |
| S6 | `deleteByProjectId(projectId)` | 5 |

### API Endpoints
| ID | Endpoint | Phase |
|----|----------|-------|
| A1 | `GET /api/projects/:id/worktrees` | 2 |
| A2 | `POST /api/projects/:id/worktrees` | 3 |
| A3 | `DELETE /api/projects/:id/worktrees/:path` | 4 |
| A4 | `GET /api/projects/:id/worktrees/main` | 3 |
| A5 | `PATCH /api/worktrees/:path` (done status) | 5 |
| A6 | `GET /api/worktrees/:path/urls` | 7 |
| A7 | `POST /api/worktrees/:path/urls` | 7 |
| A8 | `DELETE /api/worktrees/:path/urls/:urlId` | 7 |
| A9 | `GET /api/worktrees/:path/shells` | 6 |
| A10 | Shell creation accepts `worktreePath` | 6 |

### Test Infrastructure
| ID | Feature | Phase |
|----|---------|-------|
| TI1 | `GitTestSandbox` class | 2 |
| TI2 | `createIsolatedTestRepo()` | 2 |
| TI3 | `createIsolatedTestRepoWithCommit()` | 2 |
| TI4 | `createIsolatedTestRepoWithBranches()` | 2 |
| TI5 | `withGitTestSandbox()` | 2 |
| TI6 | `createTestWorktree()` | 3 |
| TI7 | `listTestWorktrees()` | 2 |

### UI Components
| ID | Feature | Phase |
|----|---------|-------|
| C1 | `ProjectContextMenu` (replaces "..." button) | 1 |
| C2 | `WorktreeList` | 2 |
| C3 | `WorktreeItem` (display, expand/collapse) | 2 |
| C4 | `WorktreeItem` quick action buttons (+AI, +Bash) | 6 |
| C5 | `WorktreeContextMenu` | 4 |
| C6 | `AddWorktreeModal` | 3 |
| C7 | `WorktreeContext` | 7 |
| C8 | `WorktreeUrlsTab` | 7 |
| C9 | `WorktreeFilesTab` | 7 |

### React Query Hooks
| ID | Feature | Phase |
|----|---------|-------|
| H1 | `useWorktrees(projectId)` | 2 |
| H2 | `useCreateWorktree()` | 3 |
| H3 | `useDeleteWorktree()` | 4 |
| H4 | `useUpdateWorktreeMetadata()` | 5 |
| H5 | `useMainBranch(projectId)` | 3 |
| H6 | `useShellsByWorktree(worktreePath)` | 6 |

### Status & State
| ID | Feature | Phase |
|----|---------|-------|
| ST1 | `useWorktreeStatus()` hook | 5 |
| ST2 | `useProjectAiStatus()` updated for worktrees | 7 |
| ST3 | `expandedWorktreePaths` in uiStore | 2 |
| ST4 | `toggleWorktreeExpanded()` action | 2 |
| ST5 | `selectedContextType` includes 'worktree' | 7 |

### ProjectItem Changes
| ID | Feature | Phase |
|----|---------|-------|
| P1 | Remove "..." menu button | 1 |
| P2 | Add `onContextMenu` handler | 1 |
| P3 | Render WorktreeList in expandable content | 2 |
| P4 | Update status indicator for worktree aggregation | 7 |

### Shell Updates
| ID | Feature | Phase |
|----|---------|-------|
| SH1 | Shell creation accepts `worktreePath` | 6 |
| SH2 | Shell CWD defaults to worktree path | 6 |
| SH3 | Shells filtered by worktree in UI | 6 |

### Refactoring
| ID | Feature | Phase |
|----|---------|-------|
| R1 | FileTreeService uses GitService | 7 |
| R2 | ProjectMetadataService uses GitService | 7 |

---

## Phase Breakdown

### Phase 1: Context Menu Migration
**Objective**: Replace the "..." button with right-click context menu. User can immediately test this change.
**Duration**: 1 day

**User-Testable Outcome**:
- Right-click any project to see context menu
- All existing actions work (Add AI Shell, Add Bash Shell, Delete Project)
- "Add Worktree..." appears but is disabled (grayed out with "Coming soon" tooltip)

**Tests to Write First**:
- `test/unit/client/components/projects/ProjectContextMenu.test.tsx`
  ```typescript
  describe('ProjectContextMenu', () => {
    it('should render all menu items', () => {
      render(<ProjectContextMenu project={mockProject} opened={true} onClose={vi.fn()} />);

      expect(screen.getByText('Add AI Shell')).toBeInTheDocument();
      expect(screen.getByText('Add Bash Shell')).toBeInTheDocument();
      expect(screen.getByText('Add Worktree...')).toBeInTheDocument();
      expect(screen.getByText('Delete Project')).toBeInTheDocument();
    });

    it('should show "Add Worktree..." as disabled initially', () => {
      render(<ProjectContextMenu project={mockProject} opened={true} onClose={vi.fn()} />);

      const worktreeItem = screen.getByText('Add Worktree...').closest('button');
      expect(worktreeItem).toHaveAttribute('data-disabled', 'true');
    });

    it('should call onAddAiShell when clicked', async () => {
      const onAddAiShell = vi.fn();
      render(
        <ProjectContextMenu
          project={mockProject}
          opened={true}
          onClose={vi.fn()}
          onAddAiShell={onAddAiShell}
        />
      );

      await userEvent.click(screen.getByText('Add AI Shell'));
      expect(onAddAiShell).toHaveBeenCalled();
    });
  });
  ```

- `test/unit/client/components/projects/ProjectItem.test.tsx`: Update existing tests
  ```typescript
  describe('ProjectItem context menu', () => {
    it('should not render "..." menu button', () => {
      render(<ProjectItem project={mockProject} />);

      expect(screen.queryByLabelText('Project menu')).not.toBeInTheDocument();
    });

    it('should open context menu on right-click', async () => {
      render(<ProjectItem project={mockProject} />);

      const projectRow = screen.getByTestId('project-item');
      await userEvent.pointer({ keys: '[MouseRight]', target: projectRow });

      expect(screen.getByText('Add AI Shell')).toBeInTheDocument();
    });
  });
  ```

**Implementation**:
- `src/client/components/projects/ProjectContextMenu.tsx`: New component
  ```typescript
  interface ProjectContextMenuProps {
    project: Project;
    opened: boolean;
    position: { x: number; y: number };
    onClose: () => void;
    onAddAiShell: () => void;
    onAddBashShell: () => void;
    onAddWorktree?: () => void;  // Optional, disabled if not provided
    onDelete: () => void;
    worktreeEnabled?: boolean;   // Default false initially
  }

  export function ProjectContextMenu({ ... }): React.ReactElement;
  ```

- `src/client/components/projects/ProjectItem.tsx`: Updates
  ```typescript
  // Remove: "..." menu button (lines ~188-209)
  // Add: onContextMenu handler
  // Add: state for context menu position and opened state
  // Add: ProjectContextMenu component
  ```

**Dependencies**:
- External: None
- Internal: None (pure UI change)

**Verification**:
1. Run: `npm run dev`
2. Right-click any project in sidebar
3. Verify menu appears with all items
4. Verify "Add Worktree..." is disabled
5. Verify existing actions (Add AI Shell, Delete) still work
6. Run: `npm test -- test/unit/client/components/projects/`

**Features Implemented**: P1, P2, C1

---

### Phase 2: Worktree List Display
**Objective**: Display real worktrees from git repositories. User sees worktrees appear under their projects.
**Duration**: 2 days

**User-Testable Outcome**:
- Expand a project that is a git repo
- See the main worktree listed
- See any existing worktrees (created externally)
- Non-git projects show no worktrees

**Tests to Write First**:
- `test/helpers/git-sandbox.test.ts`: Test isolation framework
  ```typescript
  describe('GitTestSandbox', () => {
    it('should create isolated temp directory', async () => {
      const sandbox = new GitTestSandbox();
      await sandbox.setup();

      expect(sandbox.getWorkspacePath()).toMatch(/aiforge-test-/);
      expect(await fs.pathExists(sandbox.getWorkspacePath())).toBe(true);

      await sandbox.cleanup();
    });

    it('should isolate git config', async () => {
      await withGitTestSandbox(async (sandbox) => {
        expect(process.env.GIT_CONFIG_GLOBAL).toBe(sandbox.getGitConfigPath());
      });
    });
  });
  ```

- `test/unit/server/services/git/GitService.test.ts`: Core git operations
  ```typescript
  describe('GitService', () => {
    describe('isGitRepository', () => {
      it('should return true for git repo', async () => {
        await withGitTestSandbox(async (sandbox) => {
          const { path } = await createIsolatedTestRepoWithCommit(sandbox);
          const gitService = new GitService(path);

          expect(await gitService.isGitRepository()).toBe(true);
        });
      });

      it('should return false for non-git directory', async () => {
        await withGitTestSandbox(async (sandbox) => {
          const nonGitPath = join(sandbox.getWorkspacePath(), 'not-a-repo');
          await fs.mkdir(nonGitPath, { recursive: true });
          const gitService = new GitService(nonGitPath);

          expect(await gitService.isGitRepository()).toBe(false);
        });
      });
    });

    describe('listWorktrees', () => {
      it('should list main worktree', async () => {
        await withGitTestSandbox(async (sandbox) => {
          const { path } = await createIsolatedTestRepoWithCommit(sandbox);
          const gitService = new GitService(path);

          const worktrees = await gitService.listWorktrees();

          expect(worktrees).toHaveLength(1);
          expect(worktrees[0].isMain).toBe(true);
        });
      });

      it('should list multiple worktrees', async () => {
        await withGitTestSandbox(async (sandbox) => {
          const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
          const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'feature');
          await git.raw(['worktree', 'add', '-b', 'feature', wtPath]);

          const gitService = new GitService(path);
          const worktrees = await gitService.listWorktrees();

          expect(worktrees).toHaveLength(2);
        });
      });
    });
  });
  ```

- `test/integration/api/worktrees.test.ts`: API tests
  ```typescript
  describe('GET /api/projects/:id/worktrees', () => {
    it('should return worktrees for git project', async () => {
      const projectId = await server.createTestGitProject();

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie);

      expect(response.status).toBe(200);
      expect(response.body.worktrees).toBeInstanceOf(Array);
      expect(response.body.worktrees.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty for non-git project', async () => {
      const projectId = await server.createTestProject();

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie);

      expect(response.status).toBe(200);
      expect(response.body.worktrees).toEqual([]);
    });
  });
  ```

- `test/unit/client/components/worktrees/WorktreeList.test.tsx`
  ```typescript
  describe('WorktreeList', () => {
    it('should render worktree items', () => {
      render(<WorktreeList worktrees={mockWorktrees} projectId="proj-1" />);

      expect(screen.getByText('main')).toBeInTheDocument();
      expect(screen.getByText('feature-1')).toBeInTheDocument();
    });

    it('should sort active worktrees before done', () => {
      const worktrees = [
        { ...mockWorktree, name: 'done-wt', done: true },
        { ...mockWorktree, name: 'active-wt', done: false },
      ];
      render(<WorktreeList worktrees={worktrees} projectId="proj-1" />);

      const items = screen.getAllByTestId('worktree-item');
      expect(items[0]).toHaveTextContent('active-wt');
      expect(items[1]).toHaveTextContent('done-wt');
    });
  });
  ```

**Implementation**:
- `src/shared/types/index.ts`: Add types
  ```typescript
  export interface Worktree {
    path: string;
    branch: string;
    commit: string;
    isMain: boolean;
    isLocked: boolean;
  }

  export interface WorktreeWithStatus extends Worktree {
    name: string;
    modifiedCount: number;
    ahead: number;
    behind: number;
  }
  ```

- `test/helpers/git-sandbox.ts`: Test isolation
- `test/helpers/git-test-utils.ts`: Git test utilities

- `src/server/services/git/GitService.ts`: Core service (partial)
  ```typescript
  export class GitService {
    constructor(private readonly baseDir: string);

    async isGitRepository(): Promise<boolean>;
    async hasCommits(): Promise<boolean>;
    async listWorktrees(): Promise<Worktree[]>;
  }
  ```

- `src/server/services/project/WorktreeService.ts`: Business logic (partial)
  ```typescript
  export class WorktreeService {
    async getWorktrees(projectId: string): Promise<WorktreeWithStatus[]>;
    async isGitRepository(projectId: string): Promise<boolean>;
  }
  ```

- `src/server/api/routes/projects.ts`: Add GET endpoint
- `src/server/index.ts`: Wire WorktreeService

- `src/client/hooks/useWorktrees.ts`: React Query hook
  ```typescript
  export function useWorktrees(projectId: string);
  ```

- `src/client/components/worktrees/WorktreeList.tsx`
- `src/client/components/worktrees/WorktreeItem.tsx` (basic display only)
- `src/client/components/projects/ProjectItem.tsx`: Integrate WorktreeList
- `src/client/stores/uiStore.ts`: Add expandedWorktreePaths

**Dependencies**:
- External: simple-git (existing)
- Internal: Phase 1 context menu

**Verification**:
1. Run: `npm run dev`
2. Add a project that points to a git repository
3. Expand the project
4. Verify worktrees appear (at minimum, the main worktree)
5. Add a project that is NOT a git repo
6. Verify no worktrees section appears
7. Run: `npm test -- test/unit/server/services/git/`
8. Run: `npm test -- test/integration/api/worktrees.test.ts`

**Features Implemented**: T1, T2, G1, G2, G6, W1, W5, A1, TI1-TI5, TI7, C2, C3, H1, ST3, ST4, P3

---

### Phase 3: Create Worktree
**Objective**: Enable creating new worktrees. User can create a worktree and see it appear.
**Duration**: 2 days

**User-Testable Outcome**:
- Right-click project → "Add Worktree..." is now enabled
- Modal opens with name input and optional base branch
- Creating worktree shows it in the list
- Worktree directory created in `.worktrees/`

**Tests to Write First**:
- `test/unit/server/services/git/GitService.test.ts`: Add create tests
  ```typescript
  describe('createWorktree', () => {
    it('should create worktree with new branch', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const gitService = new GitService(path);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'new-feature');

        await gitService.createWorktree(wtPath, 'new-feature');

        expect(await fs.pathExists(wtPath)).toBe(true);
        const worktrees = await gitService.listWorktrees();
        expect(worktrees).toHaveLength(2);
      });
    });

    it('should throw for existing branch', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithBranches(sandbox, ['existing']);
        const gitService = new GitService(path);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'existing');

        await expect(gitService.createWorktree(wtPath, 'existing'))
          .rejects.toThrow(/already exists/);
      });
    });
  });

  describe('getMainBranch', () => {
    it('should detect main branch', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const gitService = new GitService(path);

        const mainBranch = await gitService.getMainBranch();
        expect(['main', 'master']).toContain(mainBranch);
      });
    });
  });
  ```

- `test/integration/api/worktrees.test.ts`: Add POST tests
  ```typescript
  describe('POST /api/projects/:id/worktrees', () => {
    it('should create worktree', async () => {
      const projectId = await server.createTestGitProject();

      const response = await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: 'feature-new' });

      expect(response.status).toBe(201);
      expect(response.body.worktree.name).toBe('feature-new');
    });

    it('should return 400 for empty name', async () => {
      const projectId = await server.createTestGitProject();

      const response = await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: '' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/projects/:id/worktrees/main', () => {
    it('should return main branch name', async () => {
      const projectId = await server.createTestGitProject();

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/worktrees/main`)
        .set('Cookie', server.authCookie);

      expect(response.status).toBe(200);
      expect(['main', 'master']).toContain(response.body.branch);
    });
  });
  ```

- `test/unit/client/components/worktrees/AddWorktreeModal.test.tsx`
  ```typescript
  describe('AddWorktreeModal', () => {
    it('should submit with worktree name', async () => {
      const onSubmit = vi.fn();
      render(<AddWorktreeModal projectId="proj-1" opened={true} onClose={vi.fn()} />);

      await userEvent.type(screen.getByLabelText(/worktree name/i), 'feature-new');
      await userEvent.click(screen.getByRole('button', { name: /create/i }));

      // Verify mutation was called (via mock)
    });

    it('should disable create when name is empty', () => {
      render(<AddWorktreeModal projectId="proj-1" opened={true} onClose={vi.fn()} />);

      expect(screen.getByRole('button', { name: /create/i })).toBeDisabled();
    });

    it('should show main branch as default base', async () => {
      mockUseMainBranch.mockReturnValue({ data: 'main' });
      render(<AddWorktreeModal projectId="proj-1" opened={true} onClose={vi.fn()} />);

      expect(screen.getByText(/defaults to main/i)).toBeInTheDocument();
    });
  });
  ```

**Implementation**:
- `src/shared/types/index.ts`: Add CreateWorktreeRequest
  ```typescript
  export interface CreateWorktreeRequest {
    name: string;
    baseBranch?: string;
  }
  ```

- `src/server/services/git/GitService.ts`: Add methods
  ```typescript
  async getMainBranch(): Promise<string>;
  async branchExists(branchName: string): Promise<boolean>;
  async createWorktree(path: string, branch: string, baseBranch?: string): Promise<void>;
  ```

- `src/server/services/project/WorktreeService.ts`: Add methods
  ```typescript
  async createWorktree(projectId: string, name: string, baseBranch?: string): Promise<Worktree>;
  async getMainBranch(projectId: string): Promise<string>;
  ```

- `src/server/api/routes/projects.ts`: Add POST and GET /main endpoints

- `src/client/hooks/useWorktrees.ts`: Add hooks
  ```typescript
  export function useCreateWorktree();
  export function useMainBranch(projectId: string);
  ```

- `src/client/components/worktrees/AddWorktreeModal.tsx`
- `src/client/components/projects/ProjectContextMenu.tsx`: Enable "Add Worktree..."
- `test/helpers/git-test-utils.ts`: Add createTestWorktree

**Dependencies**:
- External: None
- Internal: Phase 2 list display

**Verification**:
1. Run: `npm run dev`
2. Right-click a git project → "Add Worktree..." is now enabled
3. Click it, enter name "test-feature", click Create
4. Verify new worktree appears in list
5. Verify `.worktrees/test-feature` directory exists in project
6. Run: `npm test -- test/integration/api/worktrees.test.ts`

**Features Implemented**: T3, G3, G4, G5, W2, W4, A2, A4, TI6, C6, H2, H5

---

### Phase 4: Delete Worktree
**Objective**: Enable deleting worktrees. User can remove worktrees via context menu.
**Duration**: 1 day

**User-Testable Outcome**:
- Right-click a worktree → "Remove Worktree" option
- Confirmation dialog appears
- Worktree is removed from list and filesystem
- Force delete option for dirty worktrees

**Tests to Write First**:
- `test/unit/server/services/git/GitService.test.ts`: Add remove tests
  ```typescript
  describe('removeWorktree', () => {
    it('should remove worktree', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'to-remove');
        await git.raw(['worktree', 'add', '-b', 'to-remove', wtPath]);

        const gitService = new GitService(path);
        await gitService.removeWorktree(wtPath);

        expect(await fs.pathExists(wtPath)).toBe(false);
      });
    });

    it('should force remove dirty worktree', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'dirty');
        await git.raw(['worktree', 'add', '-b', 'dirty', wtPath]);
        await fs.writeFile(join(wtPath, 'uncommitted.txt'), 'dirty');

        const gitService = new GitService(path);
        await gitService.removeWorktree(wtPath, true);

        expect(await fs.pathExists(wtPath)).toBe(false);
      });
    });
  });
  ```

- `test/integration/api/worktrees.test.ts`: Add DELETE tests
  ```typescript
  describe('DELETE /api/projects/:id/worktrees/:path', () => {
    it('should delete worktree', async () => {
      const { projectId, worktreePath } = await server.createTestWorktree();
      const encodedPath = encodeURIComponent(worktreePath);

      const response = await request(server.app)
        .delete(`/api/projects/${projectId}/worktrees/${encodedPath}`)
        .set('Cookie', server.authCookie);

      expect(response.status).toBe(200);
    });

    it('should force delete with query param', async () => {
      const { projectId, worktreePath } = await server.createDirtyWorktree();
      const encodedPath = encodeURIComponent(worktreePath);

      const response = await request(server.app)
        .delete(`/api/projects/${projectId}/worktrees/${encodedPath}`)
        .query({ force: true })
        .set('Cookie', server.authCookie);

      expect(response.status).toBe(200);
    });
  });
  ```

- `test/unit/client/components/worktrees/WorktreeContextMenu.test.tsx`
  ```typescript
  describe('WorktreeContextMenu', () => {
    it('should show Remove Worktree option', () => {
      render(<WorktreeContextMenu worktree={mockWorktree} opened={true} onClose={vi.fn()} />);

      expect(screen.getByText('Remove Worktree')).toBeInTheDocument();
    });

    it('should call onRemove when clicked', async () => {
      const onRemove = vi.fn();
      render(
        <WorktreeContextMenu
          worktree={mockWorktree}
          opened={true}
          onClose={vi.fn()}
          onRemove={onRemove}
        />
      );

      await userEvent.click(screen.getByText('Remove Worktree'));
      expect(onRemove).toHaveBeenCalled();
    });
  });
  ```

**Implementation**:
- `src/server/services/git/GitService.ts`: Add method
  ```typescript
  async removeWorktree(path: string, force?: boolean): Promise<void>;
  ```

- `src/server/services/project/WorktreeService.ts`: Add method
  ```typescript
  async deleteWorktree(projectId: string, worktreePath: string, force?: boolean): Promise<boolean>;
  ```

- `src/server/api/routes/projects.ts`: Add DELETE endpoint

- `src/client/hooks/useWorktrees.ts`: Add hook
  ```typescript
  export function useDeleteWorktree();
  ```

- `src/client/components/worktrees/WorktreeContextMenu.tsx`
- `src/client/components/worktrees/WorktreeItem.tsx`: Add context menu handler

**Dependencies**:
- External: None
- Internal: Phase 3 create

**Verification**:
1. Run: `npm run dev`
2. Create a worktree (from Phase 3)
3. Right-click the worktree → "Remove Worktree"
4. Confirm deletion
5. Verify worktree disappears from list
6. Verify directory is removed
7. Run: `npm test -- test/integration/api/worktrees.test.ts`

**Features Implemented**: G7, W3, A3, C5, H3

---

### Phase 5: Worktree Metadata & Status
**Objective**: Add status indicators and "done" state. User sees visual feedback about worktree state.
**Duration**: 2 days

**User-Testable Outcome**:
- Worktrees show modified file count badge
- Worktrees show ahead/behind badges
- Right-click → "Mark as Done" changes status to blue
- Status persists across page refresh

**Tests to Write First**:
- `test/unit/server/services/git/GitService.test.ts`: Add status tests
  ```typescript
  describe('getModifiedFileCount', () => {
    it('should count modified files', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        await fs.writeFile(join(path, 'modified.txt'), 'content');

        const gitService = new GitService(path);
        const count = await gitService.getModifiedFileCount();

        expect(count).toBe(1);
      });
    });
  });

  describe('getAheadBehind', () => {
    it('should return ahead/behind counts', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        await git.raw(['checkout', '-b', 'feature']);
        await fs.writeFile(join(path, 'new.txt'), 'content');
        await git.add('.');
        await git.commit('feature commit');

        const gitService = new GitService(path);
        const result = await gitService.getAheadBehind('master');

        expect(result.ahead).toBe(1);
        expect(result.behind).toBe(0);
      });
    });
  });
  ```

- `test/unit/server/storage/stores/WorktreeMetadataStore.test.ts`
  ```typescript
  describe('WorktreeMetadataStore', () => {
    it('should store and retrieve metadata', async () => {
      const store = new WorktreeMetadataStore(tempFilePath);
      const metadata = {
        worktreePath: '/path/to/wt',
        projectId: 'proj-1',
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.upsert(metadata);
      const retrieved = await store.getByWorktreePath('/path/to/wt');

      expect(retrieved).toEqual(metadata);
    });

    it('should update done status', async () => {
      const store = new WorktreeMetadataStore(tempFilePath);
      await store.upsert({ worktreePath: '/wt', projectId: 'p', done: false, ... });

      await store.update('/wt', { done: true });
      const retrieved = await store.getByWorktreePath('/wt');

      expect(retrieved?.done).toBe(true);
    });
  });
  ```

- `test/unit/client/hooks/useWorktreeStatus.test.ts`
  ```typescript
  describe('useWorktreeStatus', () => {
    it('should return blue when done', () => {
      const worktree = { ...mockWorktree, done: true };
      const { result } = renderHook(() => useWorktreeStatus(worktree, []));

      expect(result.current).toBe('blue');
    });

    it('should return null when no AI shells', () => {
      const worktree = { ...mockWorktree, done: false };
      const shells = [{ ...mockShell, type: 'bash' }];
      const { result } = renderHook(() => useWorktreeStatus(worktree, shells));

      expect(result.current).toBeNull();
    });
  });
  ```

**Implementation**:
- `src/shared/types/index.ts`: Add types
  ```typescript
  export interface WorktreeUI extends WorktreeWithStatus {
    done: boolean;
    projectId: string;
  }

  export interface WorktreeMetadata {
    worktreePath: string;
    projectId: string;
    done: boolean;
    createdAt: string;
    updatedAt: string;
  }

  export type WorktreeStatus = 'red' | 'green' | 'blue' | null;
  ```

- `src/server/services/git/GitService.ts`: Add methods
  ```typescript
  async getModifiedFileCount(worktreePath?: string): Promise<number>;
  async getAheadBehind(targetBranch: string): Promise<{ ahead: number; behind: number }>;
  ```

- `src/server/storage/stores/WorktreeMetadataStore.ts`: New store
- `src/server/api/routes/worktrees.ts`: New router for PATCH endpoint
- `src/server/services/project/WorktreeService.ts`: Update to merge metadata

- `src/client/hooks/useWorktrees.ts`: Add hook
  ```typescript
  export function useUpdateWorktreeMetadata();
  ```

- `src/client/hooks/useWorktreeStatus.ts`: New hook
- `src/client/components/worktrees/WorktreeItem.tsx`: Add badges and status indicator
- `src/client/components/worktrees/WorktreeContextMenu.tsx`: Add "Mark as Done/Active"

**Dependencies**:
- External: None
- Internal: Phase 4 delete

**Verification**:
1. Run: `npm run dev`
2. Add changes to a worktree (create a file)
3. Verify modified count badge appears
4. Right-click worktree → "Mark as Done"
5. Verify blue status indicator and "Done" badge
6. Refresh page, verify done state persists
7. Run: `npm test -- test/unit/client/hooks/useWorktreeStatus.test.ts`

**Features Implemented**: T4, T5, T7, G8, G9, S1-S6, A5, H4, ST1

---

### Phase 6: Shell-Worktree Association
**Objective**: Shells can be created within worktrees. User can add shells to specific worktrees.
**Duration**: 2 days

**User-Testable Outcome**:
- Quick action buttons on worktree (+AI, +Bash) create shells
- Shells appear under their worktree, not directly under project
- Shell CWD is set to worktree path
- Shells created from worktree context menu work

**Tests to Write First**:
- `test/integration/api/shells.test.ts`: Add worktree association tests
  ```typescript
  describe('Shell-Worktree Association', () => {
    it('should create shell with worktreePath', async () => {
      const { projectId, worktreePath } = await server.createTestWorktree();

      const response = await request(server.app)
        .post(`/api/projects/${projectId}/shells`)
        .set('Cookie', server.authCookie)
        .send({ name: 'ai-1', type: 'ai', worktreePath });

      expect(response.status).toBe(201);
      expect(response.body.shell.worktreePath).toBe(worktreePath);
      expect(response.body.shell.cwd).toBe(worktreePath);
    });

    it('should get shells by worktree', async () => {
      const { projectId, worktreePath } = await server.createTestWorktreeWithShells();
      const encodedPath = encodeURIComponent(worktreePath);

      const response = await request(server.app)
        .get(`/api/worktrees/${encodedPath}/shells`)
        .set('Cookie', server.authCookie);

      expect(response.status).toBe(200);
      expect(response.body.shells.every(s => s.worktreePath === worktreePath)).toBe(true);
    });
  });
  ```

- `test/unit/client/components/worktrees/WorktreeItem.test.tsx`: Add shell tests
  ```typescript
  describe('WorktreeItem shell integration', () => {
    it('should show quick action buttons', () => {
      render(<WorktreeItem worktree={mockWorktree} projectId="proj-1" />);

      expect(screen.getByLabelText('Add AI Shell')).toBeInTheDocument();
      expect(screen.getByLabelText('Add Bash Shell')).toBeInTheDocument();
    });

    it('should display shells under worktree when expanded', async () => {
      mockUseShellsByWorktree.mockReturnValue({ data: mockShells });
      render(<WorktreeItem worktree={mockWorktree} projectId="proj-1" />);

      await userEvent.click(screen.getByLabelText('Expand'));

      expect(screen.getByText('ai-shell-1')).toBeInTheDocument();
    });
  });
  ```

**Implementation**:
- `src/shared/types/index.ts`: Update Shell type
  ```typescript
  export interface Shell {
    // ... existing fields
    worktreePath: string | null;  // NEW: null = direct project shell
  }
  ```

- `src/server/api/routes/shells.ts`: Update create to accept worktreePath
- `src/server/api/routes/worktrees.ts`: Add GET shells endpoint
- `src/server/services/shell/ShellService.ts`: Handle worktreePath

- `src/client/hooks/useWorktrees.ts`: Add hook
  ```typescript
  export function useShellsByWorktree(worktreePath: string);
  ```

- `src/client/hooks/useShells.ts`: Update createShell to accept worktreePath
- `src/client/components/worktrees/WorktreeItem.tsx`: Add quick actions, shell list
- `src/client/components/worktrees/WorktreeContextMenu.tsx`: Shell creation actions

**Dependencies**:
- External: None
- Internal: Phase 5 metadata

**Verification**:
1. Run: `npm run dev`
2. Click +AI button on a worktree
3. Verify shell is created and appears under the worktree
4. Verify shell terminal starts in worktree directory
5. Expand worktree to see shells listed
6. Create shell from worktree context menu
7. Run: `npm test -- test/integration/api/shells.test.ts`

**Features Implemented**: T8, A9, A10, C4, H6, SH1, SH2, SH3

---

### Phase 7: Context Sidebar & Status Aggregation
**Objective**: Complete the feature with context sidebar and project-level status rollup.
**Duration**: 2 days

**User-Testable Outcome**:
- Click worktree name → context sidebar opens with URLs and Files tabs
- Files tab shows file tree rooted at worktree path
- URLs tab allows adding custom URLs per worktree
- Project status indicator aggregates worktree statuses
- Refactored services maintain existing functionality

**Tests to Write First**:
- `test/unit/client/components/context-sidebar/WorktreeContext.test.tsx`
  ```typescript
  describe('WorktreeContext', () => {
    it('should render URLs and Files tabs', () => {
      render(<WorktreeContext worktreePath="/path/to/wt" />);

      expect(screen.getByRole('tab', { name: /urls/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /files/i })).toBeInTheDocument();
    });

    it('should load file tree for worktree path', async () => {
      render(<WorktreeContext worktreePath="/path/to/wt" />);
      await userEvent.click(screen.getByRole('tab', { name: /files/i }));

      expect(mockUseFileTree).toHaveBeenCalledWith('/path/to/wt');
    });
  });
  ```

- `test/unit/client/hooks/useProjectAiStatus.test.ts`: Update for worktrees
  ```typescript
  describe('useProjectAiStatus with worktrees', () => {
    it('should aggregate worktree statuses', () => {
      const directShells = [];
      const worktrees = [
        { ...mockWorktree, done: false },
        { ...mockWorktree, path: '/wt2', done: true },
      ];
      const shellsMap = new Map([
        ['/wt1', [{ ...mockShell, type: 'ai', lastActivityAt: null }]],
      ]);

      const { result } = renderHook(() =>
        useProjectAiStatus(directShells, worktrees, shellsMap, 5000)
      );

      expect(result.current).toBe('red'); // Idle AI shell in wt1
    });
  });
  ```

- `test/integration/api/worktrees.test.ts`: Add URL tests
  ```typescript
  describe('Worktree URLs', () => {
    it('should add URL to worktree', async () => {
      const { worktreePath } = await server.createTestWorktree();
      const encodedPath = encodeURIComponent(worktreePath);

      const response = await request(server.app)
        .post(`/api/worktrees/${encodedPath}/urls`)
        .set('Cookie', server.authCookie)
        .send({ name: 'Docs', url: 'https://example.com' });

      expect(response.status).toBe(201);
    });

    it('should get worktree URLs', async () => {
      // ... setup with URL
      const response = await request(server.app)
        .get(`/api/worktrees/${encodedPath}/urls`)
        .set('Cookie', server.authCookie);

      expect(response.status).toBe(200);
      expect(response.body.urls).toBeInstanceOf(Array);
    });
  });
  ```

- `test/e2e/worktree.spec.ts`: End-to-end tests
  ```typescript
  test.describe('Worktree E2E', () => {
    test('full worktree lifecycle', async ({ page }) => {
      // Create worktree
      await page.locator('[data-project-id]').first().click({ button: 'right' });
      await page.getByText('Add Worktree...').click();
      await page.getByLabel('Worktree name').fill('e2e-test');
      await page.getByRole('button', { name: 'Create' }).click();

      // Verify appears
      await expect(page.getByText('e2e-test')).toBeVisible();

      // Add shell
      await page.getByText('e2e-test').click({ button: 'right' });
      await page.getByText('Add AI Shell').click();

      // Open context sidebar
      await page.getByText('e2e-test').click();
      await expect(page.getByRole('tab', { name: 'URLs' })).toBeVisible();

      // Mark as done
      await page.getByText('e2e-test').click({ button: 'right' });
      await page.getByText('Mark as Done').click();
      await expect(page.getByText('Done')).toBeVisible();

      // Delete
      await page.getByText('e2e-test').click({ button: 'right' });
      await page.getByText('Remove Worktree').click();
      await page.getByRole('button', { name: 'Delete' }).click();
      await expect(page.getByText('e2e-test')).not.toBeVisible();
    });
  });
  ```

**Implementation**:
- `src/shared/types/index.ts`: Update ContextType
  ```typescript
  export type ContextType = 'project' | 'shell' | 'worktree';
  ```

- `src/server/storage/stores/WorktreeUrlsStore.ts`: New store (follows ProjectUrlsStore pattern)
- `src/server/api/routes/worktrees.ts`: Add URL endpoints

- `src/client/components/context-sidebar/WorktreeContext.tsx`
- `src/client/components/context-sidebar/tabs/WorktreeUrlsTab.tsx`
- `src/client/components/context-sidebar/tabs/WorktreeFilesTab.tsx`
- `src/client/components/context-sidebar/ContextSidebar.tsx`: Add worktree routing

- `src/client/stores/uiStore.ts`: Update selectedContextType
- `src/client/components/projects/ProjectItem.tsx`: Update status aggregation

- `src/server/services/git/GitService.ts`: Add methods for existing services
  ```typescript
  async getStatus(): Promise<StatusResult>;
  async getRemotes(): Promise<RemoteWithRefs[]>;
  ```

- `src/server/services/filesystem/FileTreeService.ts`: Refactor to use GitService
- `src/server/services/project/ProjectMetadataService.ts`: Refactor to use GitService

**Dependencies**:
- External: None
- Internal: Phase 6 shell association

**Verification**:
1. Run: `npm run dev`
2. Click worktree name → verify sidebar opens
3. Verify Files tab shows worktree directory contents
4. Add a URL in URLs tab → verify it appears
5. Create AI shell in worktree, let it idle
6. Verify project status indicator turns red
7. Mark worktree as done → verify project status updates
8. Run: `npm test -- test/unit/server/services/filesystem/`
9. Run: `npm test -- test/unit/server/services/project/`
10. Run: `npm run test:e2e -- test/e2e/worktree.spec.ts`

**Features Implemented**: T6, G10, G11, A6, A7, A8, C7, C8, C9, ST2, ST5, P4, R1, R2

---

## Feature Coverage Summary

### All Features Accounted For

| Category | Total | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 | Phase 7 |
|----------|-------|---------|---------|---------|---------|---------|---------|---------|
| Types | 8 | - | 2 | 1 | - | 3 | 1 | 1 |
| GitService | 11 | - | 3 | 3 | 1 | 2 | - | 2 |
| WorktreeService | 5 | - | 2 | 2 | 1 | - | - | - |
| MetadataStore | 6 | - | - | - | - | 6 | - | - |
| API Endpoints | 10 | - | 1 | 2 | 1 | 1 | 2 | 3 |
| Test Infra | 7 | - | 6 | 1 | - | - | - | - |
| UI Components | 9 | 1 | 2 | 1 | 1 | - | 1 | 3 |
| Hooks | 6 | - | 1 | 2 | 1 | 1 | 1 | - |
| Status/State | 5 | - | 2 | - | - | 1 | - | 2 |
| ProjectItem | 4 | 2 | 1 | - | - | - | - | 1 |
| Shell Updates | 3 | - | - | - | - | - | 3 | - |
| Refactoring | 2 | - | - | - | - | - | - | 2 |
| **TOTAL** | **76** | **3** | **20** | **12** | **4** | **14** | **8** | **15** |

### Features by Phase (Detailed)

**Phase 1 (3 features)**: P1, P2, C1
**Phase 2 (20 features)**: T1, T2, G1, G2, G6, W1, W5, A1, TI1-TI5, TI7, C2, C3, H1, ST3, ST4, P3
**Phase 3 (12 features)**: T3, G3, G4, G5, W2, W4, A2, A4, TI6, C6, H2, H5
**Phase 4 (4 features)**: G7, W3, A3, C5, H3
**Phase 5 (14 features)**: T4, T5, T7, G8, G9, S1-S6, A5, H4, ST1
**Phase 6 (8 features)**: T8, A9, A10, C4, H6, SH1, SH2, SH3
**Phase 7 (15 features)**: T6, G10, G11, A6, A7, A8, C7, C8, C9, ST2, ST5, P4, R1, R2

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Context menu not discoverable | Medium | Medium | Add tooltip hint on first use |
| Git operations fail silently | Medium | High | Comprehensive error handling, user-facing messages |
| Worktree path encoding issues | Medium | Medium | Use `encodeURIComponent` consistently, test edge cases |
| External worktree deletion | Medium | Low | Handle gracefully, clean up metadata |
| Status polling performance | Low | Medium | Batch queries, React Query caching |
| Refactoring breaks existing features | Medium | High | Thorough regression testing in Phase 7 |

---

## Testing Strategy Summary

| Phase | Unit Tests | Integration Tests | E2E Tests | User Testing |
|-------|------------|-------------------|-----------|--------------|
| 1 | 5+ (context menu) | - | - | Right-click works |
| 2 | 15+ (git, components) | 3+ (API list) | - | See worktrees |
| 3 | 8+ (create) | 4+ (API create) | - | Create worktree |
| 4 | 4+ (delete) | 3+ (API delete) | - | Delete worktree |
| 5 | 10+ (status, store) | 2+ (metadata) | - | See status, mark done |
| 6 | 6+ (shells) | 3+ (shell API) | - | Create shells in worktree |
| 7 | 8+ (sidebar, hooks) | 4+ (URLs) | 3+ (full flow) | Full feature works |

**Total**: ~56+ unit tests, ~19+ integration tests, ~3+ E2E tests

---

## Implementation Order

```
Phase 1: Context Menu ──────────────────────────────────┐
                                                        │
Phase 2: Worktree List ─────────────────────────────────┤
                                                        │
Phase 3: Create Worktree ───────────────────────────────┤
                                                        │
Phase 4: Delete Worktree ───────────────────────────────┤
                                                        │
Phase 5: Metadata & Status ─────────────────────────────┤
                                                        │
Phase 6: Shell Association ─────────────────────────────┤
                                                        │
Phase 7: Sidebar & Aggregation ─────────────────────────┘
```

Each phase is independently deployable and testable by users.
