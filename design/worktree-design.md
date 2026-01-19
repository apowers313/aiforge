# Plan: Integrate Git Worktree Functionality from worktree-tool into ai-ide

## Overview

Port the git worktree functionality from `worktree-tool` into `ai-ide` as a first-class feature. This will allow users to manage multiple worktrees per project directly from the ai-ide interface.

## Confirmed Scope

- **Core CRUD only**: Create, list, delete worktrees + basic status (modified count, ahead/behind)
- **No auto-shell**: Worktrees are independent of shells; users create shells manually
- **No merge operations**: Out of scope for initial implementation

## Source Analysis

**worktree-tool's git.ts** (567 lines) uses `simple-git` and provides:
- Core: `createWorktree`, `listWorktrees`, `removeWorktree`
- Status: `getWorktreeStatus`, `hasUncommittedChanges`, `hasUntrackedFiles`, `hasStagedChanges`
- Comparison: `getAheadBehind`, `getAheadBehindBranch`, `hasConflicts`, `hasUnmergedCommits`
- Utilities: `getMainBranch`, `getWorktreeByName`, `branchExists`, `isGitRepository`

**ai-ide already uses simple-git** (^3.30.0) in:
- `FileTreeService.ts` - git status for file tree
- `ProjectMetadataService.ts` - git remotes

## Architecture Decision

Create a **shared GitService** that:
1. Consolidates all git operations (existing + new worktree operations)
2. Can be used by existing services (FileTreeService, ProjectMetadataService)
3. Provides worktree-specific functionality for the new WorktreeService

This avoids duplicating simple-git initialization across services.

---

## Implementation Plan

### Phase 1: Shared Types

**File: `src/shared/types/index.ts`**

Add new types:
```typescript
// Git worktree information (from git worktree list --porcelain)
export interface Worktree {
  path: string;       // Absolute path to worktree
  branch: string;     // Full branch ref (refs/heads/...)
  commit: string;     // HEAD commit hash
  isMain: boolean;    // Is this the main worktree?
  isLocked: boolean;  // Is this worktree locked?
}

// Extended worktree with computed fields for list view
export interface WorktreeWithStatus extends Worktree {
  name: string;           // Extracted from branch (without refs/heads/)
  modifiedCount: number;  // Number of modified/untracked files
  ahead: number;          // Commits ahead of main branch
  behind: number;         // Commits behind main branch
}

// API request types
export interface CreateWorktreeRequest {
  name: string;           // Branch/worktree name
  baseBranch?: string;    // Optional: branch to base off (default: main)
}
```

### Phase 2: Git Service

**File: `src/server/services/git/GitService.ts`** (NEW)

Extract core git operations from worktree-tool (simplified for CRUD scope):

```typescript
export class GitService {
  constructor(baseDir: string)

  // Repository checks
  async isGitRepository(): Promise<boolean>
  async hasCommits(): Promise<boolean>
  async getMainBranch(): Promise<string>

  // Branch operations
  async branchExists(branchName: string): Promise<boolean>

  // Worktree CRUD
  async createWorktree(path: string, branch: string): Promise<void>
  async listWorktrees(): Promise<Worktree[]>
  async removeWorktree(path: string, force?: boolean): Promise<void>

  // Basic status (for list view)
  async getModifiedFileCount(worktreePath: string): Promise<number>
  async getAheadBehind(worktreePath: string, targetBranch: string): Promise<{ahead: number, behind: number}>

  // For existing services (FileTreeService, ProjectMetadataService)
  async getStatus(): Promise<StatusResult>      // simple-git StatusResult
  async getRemotes(): Promise<RemoteWithRefs[]> // simple-git RemoteWithRefs
}
```

**Key adaptations from worktree-tool:**
- Copy `listWorktrees()` with porcelain parsing logic verbatim
- Copy `createWorktree()` with branch exists check
- Copy `removeWorktree()` with force flag
- Copy `getMainBranch()` with fallback logic
- Simplify status to just modified file count (for list view)

### Phase 3: Worktree Service

**File: `src/server/services/project/WorktreeService.ts`** (NEW)

```typescript
export interface WorktreeServiceOptions {
  projectStore: ProjectStore;
}

export class WorktreeService {
  constructor(options: WorktreeServiceOptions)

  // Get all worktrees for a project (includes basic status)
  async getWorktrees(projectId: string): Promise<WorktreeWithStatus[]>

  // Create a new worktree
  async createWorktree(
    projectId: string,
    name: string,
    baseBranch?: string
  ): Promise<Worktree>

  // Delete a worktree
  async deleteWorktree(
    projectId: string,
    worktreePath: string,
    force?: boolean
  ): Promise<boolean>

  // Get main branch name (for UI to show base branch options)
  async getMainBranch(projectId: string): Promise<string>

  // Check if project is a git repository
  async isGitRepository(projectId: string): Promise<boolean>
}
```

**Logic:**
1. Resolve project path from projectId via ProjectStore
2. Create GitService instance for that path
3. Delegate to GitService for git operations
4. Worktrees stored in `.worktrees/` subdirectory (matching worktree-tool convention)
5. `getWorktrees()` enriches basic Worktree with modified count and ahead/behind

### Phase 4: API Routes

**Option A: Extend `src/server/api/routes/projects.ts`**

Add endpoints:
```
GET    /api/projects/:id/worktrees          - List all worktrees
POST   /api/projects/:id/worktrees          - Create worktree
DELETE /api/projects/:id/worktrees/:path    - Delete worktree (path is URL-encoded)
GET    /api/projects/:id/worktrees/main     - Get main branch name
```

**Request/Response schemas (Zod):**
```typescript
const CreateWorktreeSchema = z.object({
  name: z.string().min(1).max(100),
  baseBranch: z.string().optional(),
});

const DeleteWorktreeParamsSchema = z.object({
  id: z.string().uuid(),
  path: z.string(),  // URL-encoded worktree path
});

const DeleteWorktreeQuerySchema = z.object({
  force: z.coerce.boolean().optional(),
});
```

### Phase 5: Service Wiring

**File: `src/server/index.ts`**

```typescript
// Add WorktreeService initialization
const worktreeService = new WorktreeService({
  projectStore: storage.projects,
});

// Add to router options
createApiRouter({
  // ... existing services
  worktreeService,
});

// Add middleware
app.use(attachWorktreeService(worktreeService));
```

### Phase 6: Test Infrastructure (Port from worktree-tool)

Port the test isolation framework from worktree-tool to enable robust git testing.

**File: `test/helpers/git-sandbox.ts`** (NEW)

Adapted from `worktree-tool/test/helpers/sandbox.ts`:

```typescript
export class GitTestSandbox {
  private tempDir: string | null = null;
  private originalCwd: string;
  private originalEnv: NodeJS.ProcessEnv;
  private cleanupFunctions: (() => Promise<void>)[] = [];

  async setup(): Promise<void>
  async cleanup(): Promise<void>
  getWorkspacePath(): string
  getGitConfigPath(): string
  registerCleanup(fn: () => Promise<void>): void
}
```

**Key isolation features:**
- Creates temp directory: `/tmp/aiforge-test-XXXXXXXX`
- Isolates git config:
  ```typescript
  process.env.GIT_CONFIG_GLOBAL = this.getGitConfigPath();
  process.env.GIT_CONFIG_SYSTEM = "/dev/null";
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  ```
- Isolates environment: `HOME`, `GNUPGHOME`, `SSH_ASKPASS`, `GIT_TERMINAL_PROMPT`
- Configures test git user: `Test User <test@example.com>`
- Auto-cleanup on test completion

**File: `test/helpers/git-test-utils.ts`** (NEW)

Adapted from `worktree-tool/test/helpers/git.ts`:

```typescript
// Core builders - use with GitTestSandbox
export async function createIsolatedTestRepo(
  sandbox: GitTestSandbox,
  name?: string
): Promise<{ path: string; git: SimpleGit }>

export async function createIsolatedTestRepoWithCommit(
  sandbox: GitTestSandbox,
  name?: string
): Promise<{ path: string; git: SimpleGit }>

export async function createIsolatedTestRepoWithBranches(
  sandbox: GitTestSandbox,
  branches: string[],
  name?: string
): Promise<{ path: string; git: SimpleGit }>

// Convenience wrapper (runs setup/cleanup automatically)
export async function withGitTestSandbox<T>(
  fn: (sandbox: GitTestSandbox) => Promise<T>
): Promise<T>

// Worktree test utilities
export async function createTestWorktree(
  git: SimpleGit,
  branchName: string,
  worktreePath: string
): Promise<void>

export async function listTestWorktrees(
  git: SimpleGit
): Promise<Worktree[]>
```

**Port regression tests from worktree-tool:**

| Source File | Target File | Tests |
|-------------|-------------|-------|
| `worktree-tool/test/unit/core/git.test.ts` | `test/unit/server/services/git/GitService.test.ts` | isGitRepository (3), getMainBranch (8), createWorktree (3), listWorktrees (5) |

### Phase 7: Refactor Existing Git Usage

Refactor existing services to use the new `GitService` for consistency and to avoid duplicate simple-git initialization.

**File: `src/server/services/filesystem/FileTreeService.ts`**

Current usage:
```typescript
import { simpleGit } from 'simple-git';
// ...
const git = simpleGit(projectPath);
const status = await git.status();
```

Refactor to:
```typescript
import { GitService } from '../git/GitService.js';
// ...
const gitService = new GitService(projectPath);
const status = await gitService.getStatus();  // Add getStatus() to GitService
```

**Changes needed:**
1. Add `getStatus()` method to GitService (returns `StatusResult` from simple-git)
2. Update `FileTreeService` constructor to optionally accept a `GitService` factory
3. Replace direct `simpleGit()` calls with `GitService` instance

**File: `src/server/services/project/ProjectMetadataService.ts`**

Current usage:
```typescript
import { simpleGit } from 'simple-git';
// ...
const git = simpleGit(projectPath);
const remotes = await git.getRemotes(true);
```

Refactor to:
```typescript
import { GitService } from '../git/GitService.js';
// ...
const gitService = new GitService(projectPath);
const remotes = await gitService.getRemotes();  // Add getRemotes() to GitService
```

**Changes needed:**
1. Add `getRemotes()` method to GitService
2. Update `ProjectMetadataService` to use `GitService`

**Updated GitService interface (with methods for existing services):**

```typescript
export class GitService {
  constructor(baseDir: string)

  // Repository checks
  async isGitRepository(): Promise<boolean>
  async hasCommits(): Promise<boolean>
  async getMainBranch(): Promise<string>

  // Branch operations
  async branchExists(branchName: string): Promise<boolean>

  // Worktree CRUD
  async createWorktree(path: string, branch: string): Promise<void>
  async listWorktrees(): Promise<Worktree[]>
  async removeWorktree(path: string, force?: boolean): Promise<void>

  // Basic status (for list view)
  async getModifiedFileCount(worktreePath: string): Promise<number>
  async getAheadBehind(worktreePath: string, targetBranch: string): Promise<{ahead: number, behind: number}>

  // For FileTreeService (existing functionality)
  async getStatus(): Promise<StatusResult>

  // For ProjectMetadataService (existing functionality)
  async getRemotes(): Promise<RemoteWithRefs[]>
}
```

---

## Files to Create/Modify

### New Files - Source
| File | Purpose |
|------|---------|
| `src/server/services/git/GitService.ts` | Shared git operations |
| `src/server/services/project/WorktreeService.ts` | Worktree business logic |

### New Files - Test Infrastructure
| File | Source | Purpose |
|------|--------|---------|
| `test/helpers/git-sandbox.ts` | `worktree-tool/test/helpers/sandbox.ts` | Test isolation framework |
| `test/helpers/git-test-utils.ts` | `worktree-tool/test/helpers/git.ts` | Git test utilities |
| `test/unit/server/services/git/GitService.test.ts` | `worktree-tool/test/unit/core/git.test.ts` | GitService unit tests |
| `test/unit/server/services/project/WorktreeService.test.ts` | - | WorktreeService unit tests |
| `test/integration/api/worktrees.test.ts` | - | API integration tests |

### Modified Files
| File | Changes |
|------|---------|
| `src/shared/types/index.ts` | Add Worktree types |
| `src/server/api/routes/projects.ts` | Add worktree endpoints |
| `src/server/index.ts` | Wire WorktreeService |
| `src/server/services/filesystem/FileTreeService.ts` | Use GitService instead of direct simpleGit |
| `src/server/services/project/ProjectMetadataService.ts` | Use GitService instead of direct simpleGit |

---

## Verification Plan

### Unit Tests (with mocked simple-git)
- `test/unit/server/services/git/GitService.test.ts`
  - `isGitRepository()` - 3 tests (true, false, error)
  - `getMainBranch()` - 8 tests (main, master, trunk, config fallback, empty repo)
  - `createWorktree()` - 3 tests (new branch, existing branch, error)
  - `listWorktrees()` - 5 tests (porcelain parsing, locked, bare, empty)
  - `removeWorktree()` - 2 tests (normal, force)
- `test/unit/server/services/project/WorktreeService.test.ts` - Mock GitService

### Integration Tests (with real git repos via GitTestSandbox)
- `test/integration/api/worktrees.test.ts`
  - List worktrees for git project
  - List worktrees for non-git project (should return empty/error)
  - Create worktree with new branch
  - Create worktree with existing branch
  - Delete worktree
  - Delete worktree with force flag
  - Error handling for invalid project ID

### Test Infrastructure Verification
1. Run `GitTestSandbox` tests to verify isolation works
2. Verify temp directories are created/cleaned up
3. Verify git config isolation (test user, no system config)

### Regression Testing (existing functionality)
After Phase 7 refactor, verify existing features still work:
1. `FileTreeService` - git status still shows modified/staged/untracked files
2. `ProjectMetadataService` - git remote detection still works (GitHub, GitLab, etc.)
3. Run existing tests: `test/unit/server/services/filesystem/` and `test/unit/server/services/project/`

### Manual Testing
1. Create a test project pointing to a git repo
2. List worktrees (should show main worktree)
3. Create a new worktree
4. Verify worktree appears in `.worktrees/` directory
5. Verify status (modified files, ahead/behind)
6. Delete the worktree
7. Verify cleanup

---

## Out of Scope (Future Enhancements)

- **Merge operations** (from worktree-tool's merge.ts) - complex, needs careful UX
- **Detailed status** (staged, untracked, conflicts breakdown) - can add later
- **Auto-creating shells in worktrees** - user confirmed: no auto-shell
- **Tmux integration** - not needed, ai-ide has WebSocket terminals
- **Port allocation** - could add later for dev servers per worktree
- **Config file** (`.worktree-config.json`) - ai-ide uses its own storage

---

# Phase 2: UI Implementation

## Overview

**User Value**: Users can manage git worktrees directly from the AIForge interface, seeing all worktrees (both created by AIForge and externally) as first-class entities with the same rich feature set as projects.

**Technical Value**: Worktrees integrate seamlessly with existing project/shell architecture, reusing patterns for status indicators, context sidebar, and activity tracking.

## Requirements Summary

1. **Worktree Discovery**: Display all worktrees found via `git worktree list`, regardless of where they're stored
2. **Worktree Creation**: When creating worktrees via AIForge, store them in `.worktrees/` subdirectory
3. **Context Menu**: Move project "..." button to a right-click context menu
4. **Add Worktree Flow**: Right-click project → "Add worktree..." → prompt for name → create worktree
5. **Worktree Features**: Worktrees have same features as projects:
   - Right sidebar context (URLs, files)
   - Own shells (bash and AI)
   - Status indicators (same red/green/blue system)
6. **Status Rollup**: Worktree status aggregates from its AI shells, then rolls up to project status
7. **Mark as Done**: Worktrees can be marked "done" (similar to AI shells)

---

## Proposed Solution

### Data Model Updates

#### Extended Worktree Type

**File: `src/shared/types/index.ts`**

Extend the existing `WorktreeWithStatus` to include UI-specific fields:

```typescript
// Extended worktree with UI state
export interface WorktreeUI extends WorktreeWithStatus {
  done: boolean;              // Can be marked "done" like AI shells
  projectId: string;          // Parent project reference
}

// Context type extended for worktrees
export type ContextType = 'project' | 'shell' | 'worktree';

// Worktree status for aggregation (matches ProjectAiStatus)
export type WorktreeStatus = 'red' | 'green' | 'blue' | null;
```

#### Worktree Metadata Store

**File: `src/server/storage/stores/WorktreeMetadataStore.ts`** (NEW)

Since worktrees themselves are managed by git, we need a separate store for AIForge-specific metadata:

```typescript
interface WorktreeMetadata {
  worktreePath: string;       // Primary key (matches Worktree.path)
  projectId: string;          // Parent project
  done: boolean;              // UI state
  createdAt: string;          // When first seen/created by AIForge
  updatedAt: string;
}
```

This approach allows:
- External worktrees (created via CLI) to appear automatically
- AIForge-specific state (like `done`) to persist
- Clean separation between git's worktree data and UI state

---

### UI Architecture

#### Component Hierarchy Update

```
MainPage
├─ Sidebar
│  ├─ ProjectList
│  │  ├─ ProjectItem (1..n)
│  │  │  ├─ Status Indicator Gutter (aggregates worktree + shell status)
│  │  │  ├─ ProjectName (click → context sidebar)
│  │  │  ├─ Quick Actions: [+AI] [+Bash]
│  │  │  ├─ RIGHT-CLICK → Context Menu
│  │  │  │  ├─ Add AI Shell
│  │  │  │  ├─ Add Bash Shell
│  │  │  │  ├─ Add Worktree...
│  │  │  │  ├─ ─────────────
│  │  │  │  └─ Delete Project
│  │  │  │
│  │  │  └─ Expandable Content
│  │  │     ├─ WorktreeList (if project has worktrees)
│  │  │     │  └─ WorktreeItem (1..m)
│  │  │     │     ├─ Status Indicator (3px bar)
│  │  │     │     ├─ WorktreeName + Branch Badge
│  │  │     │     ├─ Quick Actions: [+AI] [+Bash]
│  │  │     │     ├─ RIGHT-CLICK → Context Menu
│  │  │     │     │  ├─ Add AI Shell
│  │  │     │     │  ├─ Add Bash Shell
│  │  │     │     │  ├─ Mark as Done/Active
│  │  │     │     │  ├─ ─────────────
│  │  │     │     │  └─ Remove Worktree
│  │  │     │     │
│  │  │     │     └─ Expandable ShellList (worktree's shells)
│  │  │     │        └─ ShellItem (1..k)
│  │  │     │
│  │  │     └─ ShellList (project's direct shells, if any)
│  │  │        └─ ShellItem (1..j)
│  │  │
│  │  └─ AddProjectModal
│  │
│  └─ (Workspace selector, other UI)
│
├─ Terminal Area (Center)
│
└─ ContextSidebar (Right)
   ├─ ProjectContext (type='project')
   │  ├─ ProjectUrlsTab
   │  └─ ProjectFilesTab
   │
   ├─ WorktreeContext (type='worktree')  ← NEW
   │  ├─ WorktreeUrlsTab (custom URLs for worktree)
   │  └─ WorktreeFilesTab (file tree rooted at worktree path)
   │
   └─ ShellContext (type='shell')
      ├─ ShellTodosTab
      └─ ShellNotesTab
```

---

### Component Specifications

#### 1. ProjectItem Changes

**File: `src/client/components/projects/ProjectItem.tsx`**

**Changes:**
1. Remove the "..." menu button (line 188-209)
2. Add `onContextMenu` handler to the project item
3. Move menu items to right-click context menu
4. Add "Add Worktree..." menu item
5. Expand content to include WorktreeList before ShellList

**Context Menu Items:**
```typescript
interface ProjectContextMenuProps {
  project: Project;
  onAddAiShell: () => void;
  onAddBashShell: () => void;
  onAddWorktree: () => void;
  onDelete: () => void;
}

// Menu structure:
// ├─ Add AI Shell        [IconSparkles]
// ├─ Add Bash Shell      [IconPlus]
// ├─ Add Worktree...     [IconGitBranch]
// ├─ ─────────────────
// └─ Delete Project      [IconTrash] (red)
```

**Status Indicator Update:**

The project status indicator now aggregates:
1. Direct AI shells of the project
2. Status of all worktrees (each worktree's status comes from its AI shells)

```typescript
// Hook update
export function useProjectAiStatus(
  shells: Shell[],
  worktrees: WorktreeUI[],
  idleTimeoutMs = 5000
): ProjectAiStatus {
  // Filter to direct AI shells (shells belonging to project, not worktrees)
  const directAiShells = shells.filter(s => s.type === 'ai' && !s.worktreeId);

  // Get worktree statuses
  const worktreeStatuses = worktrees.map(wt => ({
    done: wt.done,
    shellStatus: getWorktreeShellStatus(wt.path, shells)
  }));

  // Aggregate: red > green > blue
  // - If any direct AI shell is idle (red) → red
  // - If any worktree has red status → red
  // - If any direct AI shell is active (green) → green
  // - If any worktree has green status → green
  // - If all are done (blue) → blue
  // - Otherwise → null
}
```

#### 2. WorktreeList Component (NEW)

**File: `src/client/components/worktrees/WorktreeList.tsx`**

```typescript
interface WorktreeListProps {
  worktrees: WorktreeUI[];
  projectId: string;
  indicatorOffset?: number;
}

export function WorktreeList({ worktrees, projectId, indicatorOffset = 7 }: WorktreeListProps): React.ReactElement {
  // Sort: active worktrees first, then by branch name
  const sorted = [...worktrees].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return (
    <Box>
      {sorted.map(worktree => (
        <WorktreeItem
          key={worktree.path}
          worktree={worktree}
          projectId={projectId}
          indicatorOffset={indicatorOffset}
        />
      ))}
    </Box>
  );
}
```

#### 3. WorktreeItem Component (NEW)

**File: `src/client/components/worktrees/WorktreeItem.tsx`**

Visual structure:
```
┌─ Gutter (3px) ─┬─────────────────────────────────────────────┐
│ [status bar]   │ [▶] [GitBranch] feature-name  [main+2] [+AI][+]│
│                │     └─ ShellList (collapsed by default)     │
└────────────────┴─────────────────────────────────────────────┘
```

```typescript
interface WorktreeItemProps {
  worktree: WorktreeUI;
  projectId: string;
  indicatorOffset?: number;
}

export function WorktreeItem({ worktree, projectId, indicatorOffset = 7 }: WorktreeItemProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const [contextMenuOpened, setContextMenuOpened] = useState(false);

  // Fetch shells for this worktree
  const { data: shells = [] } = useShellsByWorktree(worktree.path);

  // Calculate worktree status from its AI shells
  const worktreeStatus = useWorktreeStatus(worktree, shells);
  const statusColor = getStatusColor(worktreeStatus);

  // Badge showing ahead/behind main
  const aheadBehindBadge = worktree.ahead > 0 || worktree.behind > 0
    ? `${worktree.ahead > 0 ? `+${worktree.ahead}` : ''}${worktree.behind > 0 ? `-${worktree.behind}` : ''}`
    : null;

  return (
    <Box onContextMenu={handleContextMenu}>
      {/* Status indicator gutter */}
      {statusColor && (
        <Box className="status-indicator" style={{ backgroundColor: statusColor }} />
      )}

      {/* Worktree row */}
      <Group>
        <UnstyledButton onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
        </UnstyledButton>

        <UnstyledButton onClick={() => toggleContextSidebar('worktree', worktree.path)}>
          <IconGitBranch />
          <Text>{worktree.name}</Text>
          {aheadBehindBadge && <Badge size="xs">{aheadBehindBadge}</Badge>}
          {worktree.done && <Badge color="blue" size="xs">Done</Badge>}
        </UnstyledButton>

        {/* Quick action buttons */}
        <ActionIcon onClick={handleAddAiShell}><IconSparkles /></ActionIcon>
        <ActionIcon onClick={handleAddBashShell}><IconPlus /></ActionIcon>
      </Group>

      {/* Expandable shell list */}
      <Collapse in={isExpanded}>
        <ShellList shells={shells} projectId={projectId} worktreePath={worktree.path} />
      </Collapse>

      {/* Right-click context menu */}
      <Menu opened={contextMenuOpened} onClose={() => setContextMenuOpened(false)}>
        <Menu.Dropdown>
          <Menu.Item icon={<IconSparkles />} onClick={handleAddAiShell}>
            Add AI Shell
          </Menu.Item>
          <Menu.Item icon={<IconPlus />} onClick={handleAddBashShell}>
            Add Bash Shell
          </Menu.Item>
          <Menu.Item
            icon={worktree.done ? <IconPlayerPlay /> : <IconCheck />}
            onClick={handleToggleDone}
          >
            {worktree.done ? 'Mark as Active' : 'Mark as Done'}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" icon={<IconTrash />} onClick={handleRemoveWorktree}>
            Remove Worktree
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Box>
  );
}
```

#### 4. AddWorktreeModal Component (NEW)

**File: `src/client/components/worktrees/AddWorktreeModal.tsx`**

```typescript
interface AddWorktreeModalProps {
  projectId: string;
  opened: boolean;
  onClose: () => void;
}

export function AddWorktreeModal({ projectId, opened, onClose }: AddWorktreeModalProps): React.ReactElement {
  const [worktreeName, setWorktreeName] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const createWorktreeMutation = useCreateWorktree();
  const { data: mainBranch } = useMainBranch(projectId);

  const handleSubmit = (): void => {
    createWorktreeMutation.mutate(
      { projectId, name: worktreeName, baseBranch: baseBranch || undefined },
      { onSuccess: () => { setWorktreeName(''); onClose(); } }
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Add Worktree">
      <Stack>
        <TextInput
          label="Worktree name"
          description="This will be used as the branch name"
          placeholder="feature/my-feature"
          value={worktreeName}
          onChange={(e) => setWorktreeName(e.currentTarget.value)}
          autoFocus
        />
        <TextInput
          label="Base branch (optional)"
          description={`Defaults to ${mainBranch || 'main'}`}
          placeholder={mainBranch || 'main'}
          value={baseBranch}
          onChange={(e) => setBaseBranch(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            loading={createWorktreeMutation.isPending}
            disabled={!worktreeName.trim()}
          >
            Create Worktree
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
```

#### 5. WorktreeContext Component (NEW)

**File: `src/client/components/context-sidebar/WorktreeContext.tsx`**

Mirrors `ProjectContext` but scoped to worktree:

```typescript
interface WorktreeContextProps {
  worktreePath: string;
}

export function WorktreeContext({ worktreePath }: WorktreeContextProps): React.ReactElement {
  const activeTab = useUIStore((state) => state.contextSidebarActiveTab);
  const setActiveTab = useUIStore((state) => state.setContextSidebarActiveTab);

  return (
    <Box>
      <Tabs value={activeTab} onChange={(tab) => setActiveTab(tab as ContextSidebarTab)}>
        <Tabs.List>
          <Tabs.Tab value="urls" leftSection={<IconLink size={14} />}>
            URLs
          </Tabs.Tab>
          <Tabs.Tab value="files" leftSection={<IconFiles size={14} />}>
            Files
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="urls">
          <WorktreeUrlsTab worktreePath={worktreePath} />
        </Tabs.Panel>
        <Tabs.Panel value="files">
          <WorktreeFilesTab worktreePath={worktreePath} />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
```

---

### Status Aggregation Logic

#### Worktree Status Calculation

```typescript
// Hook: useWorktreeStatus
export function useWorktreeStatus(
  worktree: WorktreeUI,
  shells: Shell[],
  idleTimeoutMs = 5000
): WorktreeStatus {
  // If worktree is marked done → blue (regardless of shell activity)
  if (worktree.done) {
    return 'blue';
  }

  // Filter to AI shells for this worktree
  const aiShells = shells.filter(s => s.type === 'ai');

  if (aiShells.length === 0) {
    return null;
  }

  // Same logic as useProjectAiStatus
  // - Any idle AI shell → red
  // - Any active AI shell → green
  // - All done → blue
  // Priority: red > green > blue
}
```

#### Project Status Aggregation (Updated)

```typescript
// Updated hook: useProjectAiStatus
export function useProjectAiStatus(
  directShells: Shell[],           // Shells directly under project (no worktree)
  worktrees: WorktreeUI[],         // All worktrees for project
  worktreeShellsMap: Map<string, Shell[]>,  // Shells per worktree path
  idleTimeoutMs = 5000
): ProjectAiStatus {
  // 1. Calculate status for direct AI shells
  const directAiShells = directShells.filter(s => s.type === 'ai');
  const directStatus = calculateShellGroupStatus(directAiShells, idleTimeoutMs);

  // 2. Calculate status for each worktree
  const worktreeStatuses = worktrees.map(wt => {
    if (wt.done) return 'blue';
    const wtShells = worktreeShellsMap.get(wt.path) || [];
    return calculateShellGroupStatus(wtShells.filter(s => s.type === 'ai'), idleTimeoutMs);
  });

  // 3. Aggregate all statuses
  // Priority: red > green > blue > null
  const allStatuses = [directStatus, ...worktreeStatuses];

  if (allStatuses.includes('red')) return 'red';
  if (allStatuses.includes('green')) return 'green';
  if (allStatuses.some(s => s === 'blue')) return 'blue';
  return null;
}
```

---

### Shell Association with Worktrees

Shells need to be associated with a specific worktree (or directly with the project). Two approaches:

#### Option A: Add `worktreeId` to Shell (Recommended)

**File: `src/shared/types/index.ts`**

```typescript
export interface Shell {
  id: string;
  projectId: string;
  worktreePath: string | null;  // NEW: null = direct project shell
  name: string;
  cwd: string;
  status: ShellStatus;
  type: ShellType;
  pid: number | null;
  socketPath: string | null;
  lastActivityAt: string | null;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}
```

**Benefits:**
- Clear association
- Easy to query shells by worktree
- Shell CWD defaults to worktree path when created

#### Option B: Infer from CWD

Determine shell association by checking if `shell.cwd` is within a worktree path.

**Drawback:** Less explicit, could have edge cases if user changes CWD.

**Recommendation:** Option A (explicit `worktreePath` field on Shell).

---

### API Extensions

#### Worktree Endpoints (from Phase 1)

Already defined in Phase 1:
```
GET    /api/projects/:id/worktrees          - List all worktrees (with status)
POST   /api/projects/:id/worktrees          - Create worktree
DELETE /api/projects/:id/worktrees/:path    - Delete worktree
GET    /api/projects/:id/worktrees/main     - Get main branch name
```

#### New Endpoints for Worktree Metadata

```
PATCH  /api/worktrees/:path                 - Update worktree metadata (done status)
GET    /api/worktrees/:path/urls            - Get worktree URLs
POST   /api/worktrees/:path/urls            - Add worktree URL
DELETE /api/worktrees/:path/urls/:urlId     - Delete worktree URL
```

#### Shell Endpoints Update

```
POST   /api/projects/:projectId/shells
// Request body now accepts optional worktreePath:
{
  "name": "ai-1",
  "type": "ai",
  "worktreePath": "/path/to/worktree"  // Optional
}

GET    /api/worktrees/:path/shells          - Get shells for specific worktree
```

---

### React Query Hooks (NEW)

**File: `src/client/hooks/useWorktrees.ts`**

```typescript
// List worktrees for a project
export function useWorktrees(projectId: string) {
  return useQuery({
    queryKey: ['worktrees', projectId],
    queryFn: () => apiClient.get<WorktreeUI[]>(`/projects/${projectId}/worktrees`),
  });
}

// Create worktree
export function useCreateWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, name, baseBranch }: CreateWorktreeParams) =>
      apiClient.post(`/projects/${projectId}/worktrees`, { name, baseBranch }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['worktrees', projectId] });
    },
  });
}

// Delete worktree
export function useDeleteWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, worktreePath, force }: DeleteWorktreeParams) =>
      apiClient.delete(`/projects/${projectId}/worktrees/${encodeURIComponent(worktreePath)}`, { params: { force } }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['worktrees', projectId] });
    },
  });
}

// Update worktree metadata (done status)
export function useUpdateWorktree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ worktreePath, updates }: UpdateWorktreeParams) =>
      apiClient.patch(`/worktrees/${encodeURIComponent(worktreePath)}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worktrees'] });
    },
  });
}

// Get main branch
export function useMainBranch(projectId: string) {
  return useQuery({
    queryKey: ['mainBranch', projectId],
    queryFn: () => apiClient.get<{ branch: string }>(`/projects/${projectId}/worktrees/main`),
    select: (data) => data.branch,
  });
}

// Get shells for a specific worktree
export function useShellsByWorktree(worktreePath: string) {
  return useQuery({
    queryKey: ['shells', 'worktree', worktreePath],
    queryFn: () => apiClient.get<Shell[]>(`/worktrees/${encodeURIComponent(worktreePath)}/shells`),
  });
}
```

---

### UI State Updates

**File: `src/client/stores/uiStore.ts`**

```typescript
interface UIState {
  // Existing fields...

  // NEW: Track expanded worktrees (similar to expandedProjectIds)
  expandedWorktreePaths: string[];

  // NEW: Context type now includes 'worktree'
  selectedContextType: 'project' | 'shell' | 'worktree' | null;

  // Actions
  toggleWorktreeExpanded: (worktreePath: string) => void;
}
```

---

## Implementation Phases (UI)

### Phase 2.1: Data Model Updates
1. Add `worktreePath` field to `Shell` type
2. Create `WorktreeMetadataStore` for persisting `done` status
3. Update shell creation to accept `worktreePath`
4. Add worktree metadata API endpoints

**Files:**
- `src/shared/types/index.ts` - Update Shell type
- `src/server/storage/stores/WorktreeMetadataStore.ts` - NEW
- `src/server/api/routes/worktrees.ts` - NEW (metadata endpoints)
- `src/server/api/routes/shells.ts` - Update create shell

### Phase 2.2: Context Menu Migration
1. Remove "..." menu button from ProjectItem
2. Add `onContextMenu` handler to ProjectItem
3. Create reusable `ProjectContextMenu` component
4. Test right-click behavior

**Files:**
- `src/client/components/projects/ProjectItem.tsx` - Update
- `src/client/components/projects/ProjectContextMenu.tsx` - NEW

### Phase 2.3: WorktreeList and WorktreeItem
1. Create `WorktreeList` component
2. Create `WorktreeItem` component with status indicator
3. Integrate into `ProjectItem` expandable content
4. Add right-click context menu for worktrees

**Files:**
- `src/client/components/worktrees/WorktreeList.tsx` - NEW
- `src/client/components/worktrees/WorktreeItem.tsx` - NEW
- `src/client/components/projects/ProjectItem.tsx` - Update

### Phase 2.4: AddWorktreeModal
1. Create modal component with name input
2. Add optional base branch selector
3. Integrate with `useCreateWorktree` hook
4. Open from ProjectItem context menu

**Files:**
- `src/client/components/worktrees/AddWorktreeModal.tsx` - NEW
- `src/client/hooks/useWorktrees.ts` - NEW

### Phase 2.5: Status Aggregation
1. Create `useWorktreeStatus` hook
2. Update `useProjectAiStatus` to include worktree statuses
3. Update ProjectItem gutter indicator
4. Add worktree activity tracking

**Files:**
- `src/client/components/worktrees/WorktreeItem.tsx` - Add hooks
- `src/client/components/shells/ShellItem.tsx` - Export utility functions
- `src/client/components/projects/ProjectItem.tsx` - Update status hook usage

### Phase 2.6: WorktreeContext Sidebar
1. Create `WorktreeContext` component
2. Create `WorktreeUrlsTab` (similar to ProjectUrlsTab)
3. Create `WorktreeFilesTab` (file tree rooted at worktree path)
4. Update `ContextSidebar` to handle `type='worktree'`

**Files:**
- `src/client/components/context-sidebar/WorktreeContext.tsx` - NEW
- `src/client/components/context-sidebar/tabs/WorktreeUrlsTab.tsx` - NEW
- `src/client/components/context-sidebar/tabs/WorktreeFilesTab.tsx` - NEW
- `src/client/components/context-sidebar/ContextSidebar.tsx` - Update

### Phase 2.7: Shell-Worktree Association
1. Update shell creation UI to pass worktreePath
2. Filter shells by worktree in WorktreeItem
3. Set shell CWD to worktree path by default

**Files:**
- `src/client/hooks/useShells.ts` - Update createShell
- `src/server/services/shell/ShellService.ts` - Handle worktreePath

---

## Acceptance Criteria (UI)

### Context Menu
- [ ] Right-clicking a project opens context menu with: Add AI Shell, Add Bash Shell, Add Worktree..., Delete Project
- [ ] "..." menu button is removed from project row
- [ ] Context menu keyboard accessible (Escape to close)

### Worktree Display
- [ ] All worktrees (created by AIForge or external) appear under their project
- [ ] Worktrees show: branch name, ahead/behind badge, done badge (if applicable)
- [ ] Worktrees are expandable to show their shells
- [ ] Worktree status indicator (3px gutter bar) shows red/green/blue based on AI shell activity

### Worktree Creation
- [ ] "Add Worktree..." opens modal with name input
- [ ] Optional base branch input (defaults to main branch)
- [ ] Worktree created in `.worktrees/` subdirectory
- [ ] New worktree appears in list after creation

### Worktree Actions
- [ ] Right-click worktree: Add AI Shell, Add Bash Shell, Mark as Done/Active, Remove Worktree
- [ ] Quick action buttons for +AI and +Bash visible on hover
- [ ] Clicking worktree name opens context sidebar

### Status Rollup
- [ ] Worktree status aggregates from its AI shells (red > green > blue)
- [ ] Project status aggregates from direct shells + all worktree statuses
- [ ] Marking worktree as "done" sets its status to blue

### Context Sidebar
- [ ] Worktree context sidebar shows URLs and Files tabs
- [ ] Files tab shows file tree rooted at worktree path
- [ ] URLs tab allows adding custom URLs for worktree

### Shell Association
- [ ] Shells created from worktree context have `worktreePath` set
- [ ] Shell CWD defaults to worktree path
- [ ] Shells appear under their worktree (not directly under project)

---

## Technical Considerations (UI)

### Performance
- **Worktree List**: Cache worktree data with React Query (stale-while-revalidate)
- **Status Polling**: Reuse existing 1-second interval for AI activity detection
- **Lazy Loading**: Only fetch worktree details when project is expanded

### Backwards Compatibility
- **Shell Migration**: Existing shells have `worktreePath: null` (direct project shells)
- **API**: All new fields are optional in requests, required fields have defaults

### Testing Strategy
- **Unit Tests**: New hooks (`useWorktrees`, `useWorktreeStatus`)
- **Component Tests**: WorktreeItem, WorktreeList, AddWorktreeModal, context menu
- **Integration Tests**: Worktree CRUD flow, status aggregation
- **E2E Tests**: Full worktree lifecycle (create, add shell, mark done, delete)

---

## Risks and Mitigation (UI)

| Risk | Mitigation |
|------|------------|
| Context menu not discoverable | Add tooltip on first visit, keyboard shortcut hint |
| Status indicator confusion | Add tooltip explaining red/green/blue meaning |
| Worktree path encoding issues | Use `encodeURIComponent` consistently, test edge cases |
| Performance with many worktrees | Virtual scrolling if >20 worktrees (unlikely in practice) |
| External worktree deletion | Handle gracefully - remove from UI, clean up metadata |

---

## Future Enhancements (UI)

- **Worktree quick-switch**: Keyboard shortcut to switch between worktrees
- **Worktree templates**: Pre-configured shell setups for new worktrees
- **Worktree comparison**: Side-by-side diff view between worktrees
- **Drag-and-drop**: Reorder worktrees, move shells between worktrees
- **Worktree archiving**: Hide completed worktrees instead of deleting

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Git operations fail | Wrap in try/catch, return meaningful errors |
| Worktree path conflicts | Validate paths, use consistent `.worktrees/` convention |
| Non-git projects | Check `isGitRepository()` before operations |
| Locked worktrees | Support `force` flag for deletion |
