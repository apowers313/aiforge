# Feature Design: Context Sidebar

## Overview
- **User Value**: Provides contextual information and actions for selected items (projects, shells) without leaving the terminal view. Quick access to project URLs, file status, shell notes, and task management improves workflow efficiency.
- **Technical Value**: Establishes a flexible sidebar framework that can be extended for additional context types. Introduces project metadata caching and shell annotation persistence patterns.

## Requirements

### Core Behavior
- Right sidebar slides over terminal when items are selected
- Toggleable pin icon keeps sidebar open when pinned
- When pinned, terminal resizes to fit between left and right sidebars
- When unpinned, sidebar disappears on item deselection

### Project Context (when folder selected in left sidebar)
- Clicking folder arrow: expands/collapses shell list (existing behavior)
- Clicking elsewhere on folder: displays context sidebar
- Segmented control with "URLs" and "Files" tabs

#### URLs Tab
- Auto-detected URLs:
  - **GitHub Page**: If project has git remote at GitHub
  - **GitHub Actions**: If `.github/workflows/` exists (uses GitHub remote URL)
  - **NPM Page**: If `package.json` exists with `name` field
- Custom URLs: User can add name/URL pairs via [+] button
- All URLs open in new browser tab
- Custom URLs persist across browser refreshes

#### Files Tab
- Tree view of project files
- Default: Show only git-modified files (modified, untracked, staged, etc.)
- Toggle to show all files
- Clicking file shows preview in sidebar and adds to left sidebar beneath shells

### Shell Context (when shell selected)
- Segmented control with "TODOs" and "Notes" tabs

#### TODOs Tab
- Checklist with [+] button to add items
- Each item has checkbox + text
- Checked items move to bottom of list
- Persisted across browser refreshes

#### Notes Tab
- Freeform Markdown text editor
- When selected: Shows raw Markdown text
- When deselected: Renders as HTML
- Persisted across browser refreshes

---

## Proposed Solution

### User Interface

#### Layout Integration
```
┌─────────────────────────────────────────────────────────────────┐
│                           Header                                 │
├──────────┬─────────────────────────────────┬────────────────────┤
│          │                                 │  Context Sidebar   │
│  Left    │                                 │  ┌─────────────┐   │
│ Sidebar  │         Terminal                │  │ [Pin Icon]  │   │
│          │                                 │  ├─────────────┤   │
│ Projects │                                 │  │ Segmented   │   │
│  └ Shell │                                 │  │ Control     │   │
│  └ Shell │                                 │  ├─────────────┤   │
│          │                                 │  │ Tab Content │   │
│          │                                 │  │             │   │
│          │                                 │  │             │   │
└──────────┴─────────────────────────────────┴────────────────────┘
```

**Unpinned State**: Sidebar overlays terminal (absolute positioning)
**Pinned State**: Terminal shrinks, sidebar takes fixed width

#### Interaction Flow

1. **Project Selection**:
   - User clicks on project name/icon (not chevron) in left sidebar
   - Context sidebar appears with project context
   - URLs tab shown by default
   - If another project selected, sidebar updates content
   - If same project clicked again, sidebar closes (toggle behavior)

2. **Shell Selection**:
   - User clicks on shell in left sidebar
   - Context sidebar appears with shell context
   - TODOs tab shown by default
   - Terminal attaches to selected shell
   - If same shell clicked, sidebar closes

3. **Pin Behavior**:
   - Click pin icon to toggle pinned state
   - When pinning: Terminal resizes inward
   - When unpinning: If no item selected, sidebar closes; if item selected, stays open but overlays

### Technical Architecture

#### New Components

```
src/client/components/
├── context-sidebar/
│   ├── ContextSidebar.tsx           # Main container, handles visibility/pinning
│   ├── ContextSidebarHeader.tsx     # Pin button, close button, title
│   ├── ProjectContext.tsx           # Project-specific content wrapper
│   ├── ShellContext.tsx             # Shell-specific content wrapper
│   ├── tabs/
│   │   ├── ProjectUrlsTab.tsx       # Auto-detected + custom URLs
│   │   ├── ProjectFilesTab.tsx      # File tree with git status
│   │   ├── ShellTodosTab.tsx        # Checklist component
│   │   └── ShellNotesTab.tsx        # Markdown editor/viewer
│   └── common/
│       ├── SegmentedTabs.tsx        # Reusable segmented control
│       ├── UrlItem.tsx              # Single URL display with link
│       ├── AddUrlModal.tsx          # Modal for adding custom URLs
│       ├── FileTreeItem.tsx         # Single file in tree
│       ├── TodoItem.tsx             # Single todo with checkbox
│       └── MarkdownEditor.tsx       # Editable markdown with preview
```

#### State Management (Zustand Store Extensions)

```typescript
// Additions to UIState in uiStore.ts
interface UIState {
  // Existing...

  // Context Sidebar State
  contextSidebarOpen: boolean;
  contextSidebarPinned: boolean;
  contextSidebarWidth: number;           // 280-500px, default 320
  contextSidebarActiveTab: string;       // 'urls' | 'files' | 'todos' | 'notes'
  selectedContextType: 'project' | 'shell' | null;
  selectedContextId: string | null;      // projectId or shellId

  // Actions
  openContextSidebar: (type: 'project' | 'shell', id: string) => void;
  closeContextSidebar: () => void;
  toggleContextSidebarPin: () => void;
  setContextSidebarWidth: (width: number) => void;
  setContextSidebarTab: (tab: string) => void;
}
```

#### Data Model Extensions

```typescript
// New types in src/shared/types/index.ts

export interface ProjectMetadata {
  gitRemoteUrl: string | null;
  gitRemoteType: 'github' | 'gitlab' | 'bitbucket' | 'other' | null;
  hasPackageJson: boolean;
  packageName: string | null;
  hasGithubWorkflows: boolean;
}

export interface CustomUrl {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

export interface ProjectContextData {
  customUrls: CustomUrl[];
}

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface ShellContextData {
  todos: TodoItem[];
  notes: string;
}

// Extended WorkspaceState
export interface WorkspaceState {
  // Existing fields...

  // Context sidebar state
  contextSidebarPinned: boolean;
  contextSidebarWidth: number;

  // Per-project context data
  projectContextData: Record<string, ProjectContextData>;

  // Per-shell context data
  shellContextData: Record<string, ShellContextData>;
}
```

#### New Backend Endpoints

```typescript
// GET /api/projects/:id/metadata
// Returns project metadata (git info, package.json, workflows)
{
  gitRemoteUrl: string | null,
  gitRemoteType: 'github' | 'gitlab' | 'bitbucket' | 'other' | null,
  hasPackageJson: boolean,
  packageName: string | null,
  hasGithubWorkflows: boolean
}

// GET /api/projects/:id/files
// Returns file tree with git status
{
  files: FileTreeNode[],
  gitModifiedOnly: boolean
}

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  gitStatus: 'modified' | 'untracked' | 'staged' | 'deleted' | 'renamed' | null;
  children?: FileTreeNode[];
}

// GET /api/projects/:id/files/:filePath/preview
// Returns file preview (first N lines, syntax detected)
{
  content: string;
  language: string;
  truncated: boolean;
  totalLines: number;
}
```

#### New Backend Services

```typescript
// src/server/services/project/ProjectMetadataService.ts
import simpleGit from 'simple-git';

class ProjectMetadataService {
  private git: SimpleGit;

  async getMetadata(projectPath: string): Promise<ProjectMetadata> {
    this.git = simpleGit(projectPath);
    // Use this.git.getRemotes(true) for remote URLs
    // Use fs.access() for package.json and .github/workflows checks
  }
  async getGitRemoteUrl(projectPath: string): Promise<string | null>;
  async parseGitRemoteType(url: string): 'github' | 'gitlab' | 'bitbucket' | 'other' | null;
  async getPackageJson(projectPath: string): Promise<{ name: string } | null>;
  async hasGithubWorkflows(projectPath: string): Promise<boolean>;
}

// src/server/services/filesystem/FileTreeService.ts
import simpleGit, { StatusResult } from 'simple-git';

class FileTreeService {
  async getFileTree(projectPath: string, options: { gitModifiedOnly?: boolean }): Promise<FileTreeNode[]> {
    const git = simpleGit(projectPath);
    const status: StatusResult = await git.status();
    // status.modified, status.not_added, status.staged, etc.
  }
  async getGitStatus(projectPath: string): Promise<StatusResult>;
  async getFilePreview(filePath: string, maxLines?: number): Promise<FilePreview>;
}
```

### Integration Points

1. **AppShell.tsx**: Add conditional right sidebar section using `react-resizable-panels`
2. **ProjectItem.tsx**: Modify click handler to distinguish chevron vs name clicks
3. **ShellItem.tsx**: Add context sidebar trigger on click
4. **Terminal.tsx**: Handle width changes when sidebar pinned/unpinned (automatic with resizable panels)
5. **useWorkspaceSync.ts**: Sync new workspace state fields
6. **Layout refactor**: Replace custom `ResizableDivider` with `react-resizable-panels` for both sidebars

### Dependencies

#### Runtime Dependencies (npm install)

| Package | Version | Purpose | Used In |
|---------|---------|---------|---------|
| `react-resizable-panels` | ^2.x | Resizable panel layout for sidebars and terminal | AppShell, ContextSidebar |
| `simple-git` | ^3.x | Git operations (remote URL, status) | ProjectMetadataService, FileTreeService |
| `react-markdown` | ^9.x | Markdown rendering for notes | ShellNotesTab |
| `dompurify` | ^3.x | HTML sanitization for markdown output | ShellNotesTab |
| `prism-react-renderer` | ^2.x | Syntax highlighting for file preview | FilePreview component |

#### Dev Dependencies (npm install -D)

| Package | Version | Purpose |
|---------|---------|---------|
| `@types/dompurify` | ^3.x | TypeScript types for DOMPurify |

#### Optional Dependencies (add if needed)

| Package | Purpose | When to Add |
|---------|---------|-------------|
| `@dnd-kit/core` | Drag-to-reorder todos | If drag reordering requested |
| `react-arborist` | Full-featured file tree | If custom tree becomes complex |
| `@tanstack/react-virtual` | Virtual scrolling | If file tree performance issues arise |

#### Installation Commands

```bash
# Required dependencies
npm install react-resizable-panels simple-git react-markdown dompurify prism-react-renderer

# Dev dependencies
npm install -D @types/dompurify
```

### Implementation Approach

#### Phase 1: Core Sidebar Infrastructure (Foundation)
1. Install `react-resizable-panels` and refactor AppShell layout
2. Add context sidebar state to Zustand store
3. Create `ContextSidebar` component with slide-over behavior
4. Implement pin/unpin functionality (panels handle resize automatically)
5. Extend `WorkspaceState` type and sync hook
6. Update `AppShell` to use `PanelGroup`, `Panel`, `PanelResizeHandle` components

#### Phase 2: Project Context - URLs Tab
1. Create `ProjectMetadataService` backend service
2. Add `/api/projects/:id/metadata` endpoint
3. Implement URL auto-detection logic (git, npm)
4. Create `ProjectUrlsTab` component
5. Implement custom URL add/edit/delete with persistence
6. Create `useProjectMetadata` React Query hook

#### Phase 3: Project Context - Files Tab
1. Create `FileTreeService` backend service using `simple-git`
2. Add `/api/projects/:id/files` endpoint with git status
3. Use `simple-git.status()` for file status detection
4. Create `ProjectFilesTab` with tree view
5. Add file preview endpoint with `prism-react-renderer` for syntax highlighting
6. Implement "show all" toggle

#### Phase 4: Shell Context - TODOs Tab
1. Extend `ShellContextData` in workspace state
2. Create `ShellTodosTab` component
3. Implement add/complete/reorder logic
4. Persist via workspace state sync

#### Phase 5: Shell Context - Notes Tab
1. Create `MarkdownEditor` component with edit/preview modes
2. Create `ShellNotesTab` component
3. Integrate `react-markdown` with `dompurify` for safe HTML rendering
4. Persist via workspace state sync

#### Phase 6: Click Behavior Refinement
1. Modify `ProjectItem` click handling (chevron vs elsewhere)
2. Modify `ShellItem` click handling for context trigger
3. Add file preview display in left sidebar
4. Polish transitions and animations

---

## Acceptance Criteria

### Core Sidebar
- [ ] Context sidebar appears when project name (not chevron) is clicked
- [ ] Context sidebar appears when shell is clicked
- [ ] Pin icon toggles between pinned/unpinned states
- [ ] When pinned, terminal resizes to accommodate sidebar
- [ ] When unpinned, sidebar overlays terminal
- [ ] Sidebar closes when clicking outside (when unpinned)
- [ ] Sidebar persists pin state across page refresh
- [ ] Sidebar width is adjustable via drag handle

### Project URLs Tab
- [ ] GitHub URL auto-detected from git remote
- [ ] GitHub Actions link shown when `.github/workflows/` exists
- [ ] NPM link shown when `package.json` with name exists
- [ ] Custom URLs can be added with name and URL
- [ ] Custom URLs persist across browser refresh
- [ ] All URLs open in new tab when clicked
- [ ] URLs can be edited and deleted

### Project Files Tab
- [ ] File tree displays project structure
- [ ] Git-modified files shown by default
- [ ] "Show all" toggle reveals complete file tree
- [ ] Git status indicators (M, ?, A, D, R) displayed
- [ ] Clicking file shows preview in sidebar
- [ ] File appears in left sidebar when previewed

### Shell TODOs Tab
- [ ] New todos can be added via [+] button
- [ ] Todos have checkbox and text
- [ ] Checking todo moves it to bottom of list
- [ ] Unchecking todo moves it back to top section
- [ ] Todos persist across browser refresh
- [ ] Todos are per-shell (not global)

### Shell Notes Tab
- [ ] Markdown text can be entered when selected
- [ ] Rendered HTML shown when tab loses focus
- [ ] Notes persist across browser refresh
- [ ] Notes are per-shell (not global)
- [ ] Basic markdown formatting works (headers, bold, lists, code)

---

## Technical Considerations

### Performance
- **Impact**: File tree for large projects could be slow
- **Mitigation**:
  - Lazy load file tree (expand on demand)
  - Cache project metadata with React Query (5 min stale time)
  - Limit file preview to first 100 lines
  - Debounce notes save (500ms)

### Security
- **Considerations**:
  - File preview could expose sensitive content
  - Custom URLs could be malicious (phishing)
- **Measures**:
  - File preview respects `.gitignore` patterns
  - Sanitize markdown rendering (no raw HTML)
  - URL validation before storage
  - Add `rel="noopener noreferrer"` to external links

### Compatibility
- **Backward Compatibility**:
  - New `WorkspaceState` fields default to empty/false
  - Existing workspaces upgrade seamlessly
  - Old clients ignore new fields
- **Browser Support**:
  - ResizeObserver required (all modern browsers)
  - CSS Grid for layout (all modern browsers)

### Testing Strategy
- **Unit Tests**:
  - Zustand store state transitions
  - URL detection logic
  - Git status parsing
  - Todo reordering logic
  - Markdown rendering
- **Integration Tests**:
  - Project metadata API endpoint
  - File tree API endpoint
  - Workspace state sync with new fields
- **E2E Tests**:
  - Sidebar open/close/pin flows
  - Add custom URL workflow
  - Todo add/complete workflow
  - Notes edit/preview cycle

---

## Risks and Mitigation

### Risk: Git command execution performance
**Mitigation**: Use `simple-git` library which handles caching internally. Cache results in React Query with 30-second stale time. The library's `status()` method is optimized for performance.

### Risk: Large file trees overwhelming UI
**Mitigation**: Default to git-modified-only view. Add `@tanstack/react-virtual` if performance issues arise. Add depth limit (e.g., 5 levels) for "show all" mode.

### Risk: Markdown injection vulnerabilities
**Mitigation**: Use `dompurify` to sanitize all `react-markdown` output. Configure to strip dangerous tags/attributes. Test with XSS payloads.

### Risk: State sync conflicts between tabs
**Mitigation**: Use optimistic updates with React Query. Implement last-write-wins with timestamps. Show "syncing" indicator during saves.

### Risk: Click event conflicts on ProjectItem
**Mitigation**: Use `stopPropagation()` on chevron click. Clear event handling hierarchy with explicit zones.

---

## Future Enhancements

1. **AI Context Tab**: Show AI shell conversation summary, token usage, suggested next steps
2. **Git Integration**: Stage/unstage files, view diffs, create commits from sidebar (extend `simple-git` usage)
3. **Search Tab**: Full-text search within project files
4. **Environment Tab**: Display/edit environment variables for shells
5. **History Tab**: Show command history for shell with re-run capability
6. **Shared Notes**: Project-level notes visible across all shells
7. **URL Templates**: Auto-generate URLs based on project type (e.g., Storybook, docs site)
8. **File Preview Enhancements**: Line numbers, search within file (syntax highlighting included in v1)
9. **Keyboard Shortcuts**: `Cmd+B` toggle sidebar, `Cmd+1/2/3/4` switch tabs
10. **Context Menu**: Right-click on files for more actions (open in editor, copy path)
11. **Drag-to-Reorder TODOs**: Add `@dnd-kit/core` for drag-and-drop reordering

---

## Implementation Estimate

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Core Sidebar Infrastructure | 2-3 days |
| 2 | Project URLs Tab | 1-2 days |
| 3 | Project Files Tab | 2-3 days |
| 4 | Shell TODOs Tab | 1 day |
| 5 | Shell Notes Tab | 1 day |
| 6 | Click Behavior & Polish | 1 day |
| - | Testing & Bug Fixes | 2-3 days |
| **Total** | | **10-14 days** |

### Suggested Implementation Order
1. **Phase 1** first - establishes foundation all other phases depend on
2. **Phase 4 & 5** can be done in parallel after Phase 1 (shell context is simpler)
3. **Phase 2 & 3** can be done in parallel after Phase 1 (project context is more complex)
4. **Phase 6** last - polish after core functionality works

### Phase Dependencies
- **Phase 1**: Install npm packages first (`react-resizable-panels`)
- **Phase 2**: Requires backend work (`ProjectMetadataService` with `simple-git`)
- **Phase 3**: Requires backend work (`FileTreeService` with `simple-git`) + frontend (`prism-react-renderer`)
- **Phases 4 & 5**: Frontend-only (use existing workspace sync + `react-markdown`/`dompurify`)
