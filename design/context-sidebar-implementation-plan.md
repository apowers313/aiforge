# Implementation Plan for Context Sidebar

## Overview

This plan implements a collapsible right-side context sidebar that displays contextual information for selected projects (URLs, files) and shells (TODOs, notes). The sidebar supports pin/unpin modes, automatic URL detection, git-aware file trees, and markdown-enabled notes. The implementation follows existing AIForge patterns using Zustand state management, React Query for data fetching, and Mantine UI components.

## Dependencies to Install

```bash
# Required dependencies (install at start of Phase 1)
npm install react-resizable-panels simple-git @uiw/react-md-editor @monaco-editor/react react-photo-view

# Dev dependencies
# (none needed - all packages include TypeScript types)
```

**Note**: `react-markdown`, `dompurify`, and `prism-react-renderer` are no longer needed:
- `@uiw/react-md-editor` handles markdown rendering with built-in sanitization
- `@monaco-editor/react` handles code syntax highlighting
- `react-photo-view` handles image viewing with zoom/pan

## Server API Endpoints Summary

The context sidebar requires the following server endpoints. Note the distinction between **read-only metadata** (computed on-demand) and **persisted application data** (stored in JSON stores).

### Read-Only Metadata Endpoints (computed)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects/:id/metadata` | GET | Git remote info, package.json, workflows detection |
| `/api/projects/:id/files` | GET | File tree with git status indicators |
| `/api/projects/:id/files/:path/preview` | GET | File content preview (first N lines) |

### Persisted Application Data Endpoints (stored)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects/:id/urls` | GET | Get custom URLs for project |
| `/api/projects/:id/urls` | POST | Add custom URL |
| `/api/projects/:id/urls/:urlId` | PUT | Update custom URL |
| `/api/projects/:id/urls/:urlId` | DELETE | Remove custom URL |
| `/api/shells/:id/context` | GET | Get shell TODOs and notes |
| `/api/shells/:id/context` | PATCH | Update shell TODOs and/or notes |

### State Storage Rationale

| Data | Storage | Reason |
|------|---------|--------|
| Shell TODOs | Server API | Application data tied to shell entity |
| Shell Notes | Server API | Application data tied to shell entity |
| Custom URLs | Server API | Application data tied to project entity |
| Sidebar pinned state | WorkspaceState | UI preference (per-browser) |
| Sidebar width | WorkspaceState | UI preference (per-browser) |
| Active tab | WorkspaceState | UI preference (per-browser) |

## Phase Breakdown

---

### Phase 1: Core Sidebar Infrastructure

**Objective**: Establish the foundational sidebar component with open/close and pin/unpin functionality, integrated into the existing layout system.

**Tests to Write First**:

- `test/unit/client/stores/uiStore.test.ts`: Add context sidebar state tests
  ```typescript
  describe('context sidebar state', () => {
    beforeEach(() => {
      useUIStore.getState().reset();
    });

    it('opens context sidebar with project type', () => {
      useUIStore.getState().openContextSidebar('project', 'proj-123');
      const state = useUIStore.getState();
      expect(state.contextSidebarOpen).toBe(true);
      expect(state.selectedContextType).toBe('project');
      expect(state.selectedContextId).toBe('proj-123');
    });

    it('closes context sidebar and clears selection', () => {
      useUIStore.getState().openContextSidebar('shell', 'shell-456');
      useUIStore.getState().closeContextSidebar();
      expect(useUIStore.getState().contextSidebarOpen).toBe(false);
      expect(useUIStore.getState().selectedContextId).toBeNull();
    });

    it('toggles pin state', () => {
      useUIStore.getState().toggleContextSidebarPin();
      expect(useUIStore.getState().contextSidebarPinned).toBe(true);
    });

    it('clamps sidebar width within bounds', () => {
      useUIStore.getState().setContextSidebarWidth(200); // Below min
      expect(useUIStore.getState().contextSidebarWidth).toBe(280);
      useUIStore.getState().setContextSidebarWidth(600); // Above max
      expect(useUIStore.getState().contextSidebarWidth).toBe(500);
    });

    it('sets active tab', () => {
      useUIStore.getState().setContextSidebarTab('files');
      expect(useUIStore.getState().contextSidebarActiveTab).toBe('files');
    });
  });
  ```

- `test/unit/client/components/context-sidebar/ContextSidebar.test.tsx`: Component tests
  ```typescript
  describe('ContextSidebar', () => {
    beforeEach(() => {
      useUIStore.getState().reset();
    });

    it('renders nothing when closed', () => {
      renderWithProviders(<ContextSidebar />);
      expect(screen.queryByTestId('context-sidebar')).not.toBeInTheDocument();
    });

    it('renders sidebar when open', () => {
      useUIStore.getState().openContextSidebar('project', 'proj-1');
      renderWithProviders(<ContextSidebar />);
      expect(screen.getByTestId('context-sidebar')).toBeInTheDocument();
    });

    it('shows pin icon in unpinned state', () => {
      useUIStore.getState().openContextSidebar('project', 'proj-1');
      renderWithProviders(<ContextSidebar />);
      expect(screen.getByTestId('pin-button')).toHaveAttribute('aria-pressed', 'false');
    });

    it('closes when close button clicked', async () => {
      useUIStore.getState().openContextSidebar('project', 'proj-1');
      renderWithProviders(<ContextSidebar />);
      await userEvent.click(screen.getByTestId('close-button'));
      expect(useUIStore.getState().contextSidebarOpen).toBe(false);
    });
  });
  ```

**Implementation**:

1. `src/shared/types/index.ts`: Extend WorkspaceState and add new types
   ```typescript
   // Add to WorkspaceState interface (UI state only - per-browser preferences)
   contextSidebarPinned: boolean;
   contextSidebarWidth: number;

   // Add new interfaces for server-persisted application data
   export interface CustomUrl {
     id: string;
     name: string;
     url: string;
     createdAt: string;
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
   ```

   **Note**: `CustomUrl[]` and `ShellContextData` are NOT stored in WorkspaceState. They are server-persisted via dedicated API endpoints (see Phase 2 and Phase 4).

2. `src/client/stores/uiStore.ts`: Add context sidebar state and actions
   - Add state properties: `contextSidebarOpen`, `contextSidebarPinned`, `contextSidebarWidth`, `contextSidebarActiveTab`, `selectedContextType`, `selectedContextId`
   - Add actions: `openContextSidebar()`, `closeContextSidebar()`, `toggleContextSidebarPin()`, `setContextSidebarWidth()`, `setContextSidebarTab()`
   - Width clamping: min 280px, max 500px, default 320px
   - Update `setWorkspaceState()` to include new fields

3. `src/client/components/context-sidebar/ContextSidebar.tsx`: Main container
   - Conditional rendering based on `contextSidebarOpen`
   - Fixed positioning when unpinned (overlay mode)
   - Flex child when pinned (resize mode)
   - Dark-7 background consistent with left sidebar

4. `src/client/components/context-sidebar/ContextSidebarHeader.tsx`: Header with controls
   - Pin/unpin toggle button with appropriate icons
   - Close button
   - Title showing context type

5. **Tab control**: Use Mantine `SegmentedControl` directly (no wrapper needed)
   ```typescript
   import { SegmentedControl } from '@mantine/core';

   <SegmentedControl
     value={activeTab}
     onChange={setActiveTab}
     data={[
       { label: 'URLs', value: 'urls' },
       { label: 'Files', value: 'files' },
     ]}
   />
   ```

6. `src/client/components/layout/AppShell.tsx`: Integrate context sidebar
   - Add context sidebar component to layout
   - Handle terminal width adjustment when pinned
   - Use CSS calc() for responsive sizing

7. `src/client/hooks/useWorkspaceSync.ts`: Ensure new state fields sync
   - Add new WorkspaceState fields to tracked state

**Dependencies**:
- External: `react-resizable-panels` (install first)
- Internal: None (foundation phase)

**Verification**:
1. Run: `npm test -- --grep "context sidebar"`
2. Run: `npm run dev` and click on a project in the left sidebar
3. Expected: Sidebar appears on right side with header and close button
4. Click pin icon: Terminal should resize to make room for sidebar
5. Click close: Sidebar should disappear

---

### Phase 2: Project Context - URLs Tab

**Objective**: Implement automatic URL detection (GitHub, NPM) and custom URL management for projects.

**Tests to Write First**:

- `test/unit/server/services/project/ProjectMetadataService.test.ts`:
  ```typescript
  describe('ProjectMetadataService', () => {
    let service: ProjectMetadataService;
    let mockGit: MockSimpleGit;

    beforeEach(() => {
      service = new ProjectMetadataService();
      mockGit = createMockSimpleGit();
    });

    it('detects GitHub remote URL', async () => {
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'https://github.com/user/repo.git' } }
      ]);
      const metadata = await service.getMetadata('/project', mockGit);
      expect(metadata.gitRemoteUrl).toBe('https://github.com/user/repo.git');
      expect(metadata.gitRemoteType).toBe('github');
    });

    it('detects GitLab remote URL', async () => {
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'git@gitlab.com:user/repo.git' } }
      ]);
      const metadata = await service.getMetadata('/project', mockGit);
      expect(metadata.gitRemoteType).toBe('gitlab');
    });

    it('reads package.json name', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ name: '@scope/pkg' }));
      const metadata = await service.getMetadata('/project', mockGit);
      expect(metadata.hasPackageJson).toBe(true);
      expect(metadata.packageName).toBe('@scope/pkg');
    });

    it('detects GitHub workflows directory', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      const metadata = await service.getMetadata('/project', mockGit);
      expect(metadata.hasGithubWorkflows).toBe(true);
    });
  });
  ```

- `test/integration/api/projectMetadata.test.ts`:
  ```typescript
  describe('GET /api/projects/:id/metadata', () => {
    it('returns 200 with project metadata', async () => {
      const project = await createTestProject();
      const response = await request(server.app)
        .get(`/api/projects/${project.id}/metadata`)
        .set('Cookie', server.authCookie)
        .expect(200);

      expect(response.body).toHaveProperty('gitRemoteUrl');
      expect(response.body).toHaveProperty('hasPackageJson');
    });

    it('returns 404 for non-existent project', async () => {
      await request(server.app)
        .get('/api/projects/nonexistent/metadata')
        .set('Cookie', server.authCookie)
        .expect(404);
    });
  });
  ```

- `test/integration/api/projectUrls.test.ts`: Custom URLs API tests
  ```typescript
  describe('Project Custom URLs API', () => {
    describe('GET /api/projects/:id/urls', () => {
      it('returns empty array for project with no custom URLs', async () => {
        const project = await createTestProject();
        const response = await request(server.app)
          .get(`/api/projects/${project.id}/urls`)
          .set('Cookie', server.authCookie)
          .expect(200);

        expect(response.body.urls).toEqual([]);
      });

      it('returns 404 for non-existent project', async () => {
        await request(server.app)
          .get('/api/projects/nonexistent/urls')
          .set('Cookie', server.authCookie)
          .expect(404);
      });
    });

    describe('POST /api/projects/:id/urls', () => {
      it('creates custom URL and returns it', async () => {
        const project = await createTestProject();
        const response = await request(server.app)
          .post(`/api/projects/${project.id}/urls`)
          .set('Cookie', server.authCookie)
          .send({ name: 'Docs', url: 'https://docs.example.com' })
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(response.body.name).toBe('Docs');
        expect(response.body.url).toBe('https://docs.example.com');
      });

      it('validates URL format', async () => {
        const project = await createTestProject();
        await request(server.app)
          .post(`/api/projects/${project.id}/urls`)
          .set('Cookie', server.authCookie)
          .send({ name: 'Bad', url: 'not-a-url' })
          .expect(400);
      });
    });

    describe('DELETE /api/projects/:id/urls/:urlId', () => {
      it('removes custom URL', async () => {
        const project = await createTestProject();
        const createResponse = await request(server.app)
          .post(`/api/projects/${project.id}/urls`)
          .set('Cookie', server.authCookie)
          .send({ name: 'Docs', url: 'https://docs.example.com' });

        await request(server.app)
          .delete(`/api/projects/${project.id}/urls/${createResponse.body.id}`)
          .set('Cookie', server.authCookie)
          .expect(204);
      });
    });
  });
  ```

- `test/unit/client/components/context-sidebar/tabs/ProjectUrlsTab.test.tsx`:
  ```typescript
  describe('ProjectUrlsTab', () => {
    it('displays auto-detected GitHub URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          gitRemoteUrl: 'https://github.com/user/repo',
          gitRemoteType: 'github',
          hasPackageJson: false,
          hasGithubWorkflows: false
        })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ urls: [] })
      });
      renderWithProviders(<ProjectUrlsTab projectId="proj-1" />);
      await waitFor(() => {
        expect(screen.getByText('GitHub')).toBeInTheDocument();
      });
    });

    it('shows add URL button', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ urls: [] }) });
      renderWithProviders(<ProjectUrlsTab projectId="proj-1" />);
      await waitFor(() => {
        expect(screen.getByTestId('add-url-button')).toBeInTheDocument();
      });
    });

    it('displays custom URLs from server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ urls: [{ id: '1', name: 'Docs', url: 'https://docs.example.com' }] })
      });
      renderWithProviders(<ProjectUrlsTab projectId="proj-1" />);
      await waitFor(() => {
        expect(screen.getByText('Docs')).toBeInTheDocument();
      });
    });
  });
  ```

**Implementation**:

1. `src/server/services/project/ProjectMetadataService.ts`: Backend service
   ```typescript
   export class ProjectMetadataService {
     async getMetadata(projectPath: string): Promise<ProjectMetadata> {
       const git = simpleGit(projectPath);
       const [remotes, packageJson, hasWorkflows] = await Promise.all([
         this.getGitRemotes(git),
         this.readPackageJson(projectPath),
         this.checkGithubWorkflows(projectPath)
       ]);
       return {
         gitRemoteUrl: remotes.origin?.fetch || null,
         gitRemoteType: this.parseRemoteType(remotes.origin?.fetch),
         hasPackageJson: !!packageJson,
         packageName: packageJson?.name || null,
         hasGithubWorkflows: hasWorkflows
       };
     }
   }
   ```

2. `src/server/services/project/ProjectUrlsService.ts`: Custom URLs storage service
   ```typescript
   export class ProjectUrlsService {
     private store: JsonStore<Record<string, CustomUrl[]>>;

     async getUrls(projectId: string): Promise<CustomUrl[]> {
       const data = await this.store.get();
       return data[projectId] || [];
     }

     async addUrl(projectId: string, name: string, url: string): Promise<CustomUrl> {
       const newUrl: CustomUrl = {
         id: generateId(),
         name,
         url,
         createdAt: new Date().toISOString()
       };
       // Add to store and return
     }

     async deleteUrl(projectId: string, urlId: string): Promise<void> {
       // Remove from store
     }
   }
   ```

3. `src/server/api/routes/projects.ts`: Add metadata and URLs endpoints
   - `GET /api/projects/:id/metadata` - Uses ProjectMetadataService
   - `GET /api/projects/:id/urls` - Returns custom URLs array
   - `POST /api/projects/:id/urls` - Creates custom URL (validates URL format)
   - `PUT /api/projects/:id/urls/:urlId` - Updates custom URL
   - `DELETE /api/projects/:id/urls/:urlId` - Removes custom URL

4. `src/shared/types/index.ts`: Add ProjectMetadata interface
   ```typescript
   export interface ProjectMetadata {
     gitRemoteUrl: string | null;
     gitRemoteType: 'github' | 'gitlab' | 'bitbucket' | 'other' | null;
     hasPackageJson: boolean;
     packageName: string | null;
     hasGithubWorkflows: boolean;
   }
   ```

5. `src/client/hooks/useProjectMetadata.ts`: React Query hook
   - Fetches project metadata with 5-minute stale time
   - Returns loading/error states

6. `src/client/hooks/useProjectUrls.ts`: React Query hook for custom URLs
   ```typescript
   // Queries
   const { data: urls } = useQuery(['projectUrls', projectId], fetchProjectUrls);

   // Mutations
   const addUrl = useMutation(addProjectUrl, { onSuccess: () => queryClient.invalidateQueries(['projectUrls', projectId]) });
   const deleteUrl = useMutation(deleteProjectUrl, { onSuccess: () => queryClient.invalidateQueries(['projectUrls', projectId]) });
   ```

7. `src/client/components/context-sidebar/ProjectContext.tsx`: Project wrapper
   - Renders SegmentedTabs with URLs/Files options
   - Manages active tab state

8. `src/client/components/context-sidebar/tabs/ProjectUrlsTab.tsx`: URLs display
   - Shows auto-detected URLs (GitHub, GitHub Actions, NPM)
   - Displays custom URLs fetched from server via `useProjectUrls`
   - Add button opens modal

9. `src/client/components/context-sidebar/common/UrlItem.tsx`: Single URL row
   - Icon, name, link
   - Edit/delete buttons for custom URLs (calls mutation)
   - Opens in new tab with `rel="noopener noreferrer"`

10. `src/client/components/context-sidebar/common/AddUrlModal.tsx`: Add/edit modal
    - Uses Mantine `Modal` + `TextInput` + `Button`
    - URL validation before save
    - Saves via `useProjectUrls` mutation (server-persisted)
    ```typescript
    import { Modal, TextInput, Button, Stack } from '@mantine/core';

    <Modal opened={opened} onClose={close} title="Add Custom URL">
      <Stack>
        <TextInput label="Name" placeholder="Documentation" {...form.getInputProps('name')} />
        <TextInput label="URL" placeholder="https://..." {...form.getInputProps('url')} />
        <Button onClick={handleSubmit}>Save</Button>
      </Stack>
    </Modal>
    ```

**Dependencies**:
- External: `simple-git` (should be installed in Phase 1)
- Internal: Phase 1 (sidebar infrastructure, workspace state)

**Verification**:
1. Run: `npm test -- --grep "ProjectMetadata\|ProjectUrls"`
2. Run: `npm run dev`
3. Click on a project that has a git remote configured
4. Expected: URLs tab shows detected GitHub link
5. Click [+] button, add a custom URL
6. Refresh page: Custom URL should persist

---

### Phase 3: Project Context - Files Tab

**Objective**: Display project file tree with git status indicators and file preview capability.

**Tests to Write First**:

- `test/unit/server/services/filesystem/FileTreeService.test.ts`:
  ```typescript
  describe('FileTreeService', () => {
    let service: FileTreeService;

    beforeEach(() => {
      service = new FileTreeService();
    });

    it('returns git-modified files only by default', async () => {
      const mockStatus = {
        modified: ['src/index.ts'],
        not_added: ['src/new.ts'],
        staged: [],
        deleted: []
      };
      vi.mocked(simpleGit().status).mockResolvedValue(mockStatus);

      const tree = await service.getFileTree('/project', { gitModifiedOnly: true });
      expect(tree).toHaveLength(2);
      expect(tree[0].gitStatus).toBe('modified');
      expect(tree[1].gitStatus).toBe('untracked');
    });

    it('returns full file tree when gitModifiedOnly is false', async () => {
      const tree = await service.getFileTree('/project', { gitModifiedOnly: false });
      expect(tree.length).toBeGreaterThan(0);
    });

    it('excludes node_modules and .git directories', async () => {
      const tree = await service.getFileTree('/project', { gitModifiedOnly: false });
      const hasNodeModules = tree.some(f => f.path.includes('node_modules'));
      expect(hasNodeModules).toBe(false);
    });
  });
  ```

- `test/integration/api/projectFiles.test.ts`:
  ```typescript
  describe('GET /api/projects/:id/files', () => {
    it('returns file tree with git status', async () => {
      const project = await createTestProject();
      const response = await request(server.app)
        .get(`/api/projects/${project.id}/files`)
        .set('Cookie', server.authCookie)
        .expect(200);

      expect(response.body).toHaveProperty('files');
      expect(Array.isArray(response.body.files)).toBe(true);
    });

    it('respects gitModifiedOnly query param', async () => {
      const project = await createTestProject();
      const response = await request(server.app)
        .get(`/api/projects/${project.id}/files?gitModifiedOnly=false`)
        .set('Cookie', server.authCookie)
        .expect(200);

      expect(response.body.gitModifiedOnly).toBe(false);
    });
  });

  describe('GET /api/projects/:id/files/:path/preview', () => {
    it('returns file content preview', async () => {
      const project = await createTestProject();
      const response = await request(server.app)
        .get(`/api/projects/${project.id}/files/package.json/preview`)
        .set('Cookie', server.authCookie)
        .expect(200);

      expect(response.body).toHaveProperty('content');
      expect(response.body).toHaveProperty('language');
    });

    it('truncates large files', async () => {
      const project = await createTestProject();
      const response = await request(server.app)
        .get(`/api/projects/${project.id}/files/large-file.ts/preview`)
        .set('Cookie', server.authCookie)
        .expect(200);

      expect(response.body.truncated).toBe(true);
    });
  });
  ```

- `test/unit/client/components/context-sidebar/tabs/ProjectFilesTab.test.tsx`:
  ```typescript
  describe('ProjectFilesTab', () => {
    it('displays file tree', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [
            { name: 'index.ts', path: 'src/index.ts', type: 'file', gitStatus: 'modified' }
          ],
          gitModifiedOnly: true
        })
      });
      renderWithProviders(<ProjectFilesTab projectId="proj-1" />);
      await waitFor(() => {
        expect(screen.getByText('index.ts')).toBeInTheDocument();
      });
    });

    it('shows git status indicator', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [{ name: 'file.ts', path: 'file.ts', type: 'file', gitStatus: 'modified' }]
        })
      });
      renderWithProviders(<ProjectFilesTab projectId="proj-1" />);
      await waitFor(() => {
        expect(screen.getByTestId('git-status-modified')).toBeInTheDocument();
      });
    });

    it('toggles between modified-only and all files', async () => {
      renderWithProviders(<ProjectFilesTab projectId="proj-1" />);
      const toggle = screen.getByTestId('show-all-toggle');
      await userEvent.click(toggle);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('gitModifiedOnly=false'),
        expect.any(Object)
      );
    });
  });
  ```

**Implementation**:

1. `src/server/services/filesystem/FileTreeService.ts`: Backend service
   ```typescript
   export class FileTreeService {
     async getFileTree(projectPath: string, options: FileTreeOptions): Promise<FileTreeNode[]> {
       if (options.gitModifiedOnly) {
         return this.getGitModifiedFiles(projectPath);
       }
       return this.getAllFiles(projectPath);
     }

     async getFilePreview(filePath: string, maxLines = 100): Promise<FilePreview> {
       // Read first N lines, detect language from extension
     }
   }
   ```

2. `src/server/api/routes/projects.ts`: Add files endpoints
   - `GET /api/projects/:id/files` - Returns file tree
   - `GET /api/projects/:id/files/:path/preview` - Returns file preview

3. `src/shared/types/index.ts`: Add file tree types
   ```typescript
   export interface FileTreeNode {
     name: string;
     path: string;
     type: 'file' | 'directory';
     gitStatus: 'modified' | 'untracked' | 'staged' | 'deleted' | 'renamed' | null;
     children?: FileTreeNode[];
   }

   export interface FilePreview {
     content: string;
     language: string;
     truncated: boolean;
     totalLines: number;
   }
   ```

4. `src/client/hooks/useProjectFiles.ts`: React Query hook
   - Fetches file tree with gitModifiedOnly option
   - 30-second stale time for git status freshness

5. `src/client/components/context-sidebar/tabs/ProjectFilesTab.tsx`: Files display
   - Uses Mantine `Tree` component with `useTree` hook
   - Toggle switch for "Show all files" vs "Git modified only"
   - Custom `renderNode` function for git status indicators
   - Handles file click to show preview
   ```typescript
   import { Tree, useTree } from '@mantine/core';

   const tree = useTree();

   <Tree
     data={fileTreeData}
     tree={tree}
     levelOffset={23}
     renderNode={({ node, expanded, hasChildren, elementProps }) => (
       <Group gap={5} {...elementProps}>
         {hasChildren ? (
           <IconChevronRight style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />
         ) : null}
         <FileIcon type={node.type} />
         <span>{node.label}</span>
         {node.gitStatus && <GitStatusBadge status={node.gitStatus} />}
       </Group>
     )}
   />
   ```

6. `src/client/components/context-sidebar/common/GitStatusBadge.tsx`: Git status indicator
   - Displays status (M, ?, A, D, R) with appropriate colors
   - Tooltip with full status name

7. `src/client/components/context-sidebar/common/FilePreview.tsx`: File preview panel
   - Detects file type and renders appropriate preview
   - Scrollable content area
   ```typescript
   import Editor from '@monaco-editor/react';
   import { PhotoProvider, PhotoView } from 'react-photo-view';
   import MDEditor from '@uiw/react-md-editor';
   import 'react-photo-view/dist/react-photo-view.css';

   function FilePreview({ file }: { file: FilePreview }) {
     const fileType = detectFileType(file.path);

     switch (fileType) {
       case 'image':
         return (
           <PhotoProvider>
             <PhotoView src={file.url}>
               <img src={file.url} alt={file.name} style={{ cursor: 'zoom-in' }} />
             </PhotoView>
           </PhotoProvider>
         );

       case 'markdown':
         return (
           <MDEditor.Markdown
             source={file.content}
             style={{ padding: 16, background: 'transparent' }}
           />
         );

       case 'code':
       default:
         return (
           <Editor
             height="100%"
             language={file.language}
             value={file.content}
             theme="vs-dark"
             options={{
               readOnly: true,
               minimap: { enabled: false },
               scrollBeyondLastLine: false,
               lineNumbers: 'on',
               folding: true,
             }}
           />
         );
     }
   }
   ```

8. `src/client/utils/fileTypes.ts`: File type detection utility
   ```typescript
   const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'];
   const MARKDOWN_EXTENSIONS = ['md', 'mdx', 'markdown'];

   export function detectFileType(path: string): 'image' | 'markdown' | 'code' {
     const ext = path.split('.').pop()?.toLowerCase();
     if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
     if (MARKDOWN_EXTENSIONS.includes(ext)) return 'markdown';
     return 'code';
   }
   ```

**Dependencies**:
- External: `simple-git`, `@monaco-editor/react`, `react-photo-view`, `@uiw/react-md-editor` (should be installed in Phase 1)
- Internal: Phase 1 (sidebar infrastructure), Phase 2 (project context wrapper)

**Verification**:
1. Run: `npm test -- --grep "FileTree\|ProjectFiles"`
2. Run: `npm run dev`
3. Click on a project with uncommitted changes
4. Expected: Files tab shows modified files with status indicators
5. Toggle "Show all files": Should display full project tree
6. Click a file: Preview should appear with syntax highlighting

---

### Phase 4: Shell Context - TODOs Tab

**Objective**: Implement per-shell checklist with add, complete, and server persistence functionality.

**Tests to Write First**:

- `test/unit/server/services/shell/ShellContextService.test.ts`: Backend service tests
  ```typescript
  describe('ShellContextService', () => {
    let service: ShellContextService;

    beforeEach(() => {
      service = new ShellContextService();
    });

    it('returns empty context for new shell', async () => {
      const context = await service.getContext('new-shell');
      expect(context.todos).toEqual([]);
      expect(context.notes).toBe('');
    });

    it('adds todo to shell', async () => {
      const todo = await service.addTodo('shell-1', 'Test task');
      expect(todo.text).toBe('Test task');
      expect(todo.completed).toBe(false);

      const context = await service.getContext('shell-1');
      expect(context.todos).toHaveLength(1);
    });

    it('toggles todo completion', async () => {
      const todo = await service.addTodo('shell-1', 'Task');
      await service.toggleTodo('shell-1', todo.id);

      const context = await service.getContext('shell-1');
      expect(context.todos[0].completed).toBe(true);
      expect(context.todos[0].completedAt).not.toBeNull();
    });

    it('deletes todo', async () => {
      const todo = await service.addTodo('shell-1', 'Task');
      await service.deleteTodo('shell-1', todo.id);

      const context = await service.getContext('shell-1');
      expect(context.todos).toHaveLength(0);
    });
  });
  ```

- `test/integration/api/shellContext.test.ts`: API endpoint tests
  ```typescript
  describe('Shell Context API', () => {
    describe('GET /api/shells/:id/context', () => {
      it('returns shell context with todos and notes', async () => {
        const shell = await createTestShell();
        const response = await request(server.app)
          .get(`/api/shells/${shell.id}/context`)
          .set('Cookie', server.authCookie)
          .expect(200);

        expect(response.body).toHaveProperty('todos');
        expect(response.body).toHaveProperty('notes');
      });

      it('returns 404 for non-existent shell', async () => {
        await request(server.app)
          .get('/api/shells/nonexistent/context')
          .set('Cookie', server.authCookie)
          .expect(404);
      });
    });

    describe('PATCH /api/shells/:id/context', () => {
      it('adds todo to shell', async () => {
        const shell = await createTestShell();
        const response = await request(server.app)
          .patch(`/api/shells/${shell.id}/context`)
          .set('Cookie', server.authCookie)
          .send({ addTodo: { text: 'New task' } })
          .expect(200);

        expect(response.body.todos).toHaveLength(1);
        expect(response.body.todos[0].text).toBe('New task');
      });

      it('toggles todo completion', async () => {
        const shell = await createTestShell();
        // First add a todo
        const addResponse = await request(server.app)
          .patch(`/api/shells/${shell.id}/context`)
          .set('Cookie', server.authCookie)
          .send({ addTodo: { text: 'Task' } });

        // Then toggle it
        const response = await request(server.app)
          .patch(`/api/shells/${shell.id}/context`)
          .set('Cookie', server.authCookie)
          .send({ toggleTodo: { id: addResponse.body.todos[0].id } })
          .expect(200);

        expect(response.body.todos[0].completed).toBe(true);
      });
    });
  });
  ```

- `test/unit/client/components/context-sidebar/tabs/ShellTodosTab.test.tsx`:
  ```typescript
  describe('ShellTodosTab', () => {
    beforeEach(() => {
      mockFetch.mockReset();
    });

    it('displays empty state with add button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ todos: [], notes: '' })
      });
      renderWithProviders(<ShellTodosTab shellId="shell-1" />);
      await waitFor(() => {
        expect(screen.getByTestId('add-todo-button')).toBeInTheDocument();
        expect(screen.getByText(/no todos/i)).toBeInTheDocument();
      });
    });

    it('displays todos from server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          todos: [{ id: '1', text: 'Test task', completed: false }],
          notes: ''
        })
      });
      renderWithProviders(<ShellTodosTab shellId="shell-1" />);
      await waitFor(() => {
        expect(screen.getByText('Test task')).toBeInTheDocument();
      });
    });

    it('calls API when checkbox clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          todos: [{ id: '1', text: 'Test task', completed: false }],
          notes: ''
        })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          todos: [{ id: '1', text: 'Test task', completed: true }],
          notes: ''
        })
      });

      renderWithProviders(<ShellTodosTab shellId="shell-1" />);
      await waitFor(() => screen.getByRole('checkbox'));
      await userEvent.click(screen.getByRole('checkbox'));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/shells/shell-1/context'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('displays completed todos with strikethrough', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          todos: [{ id: '1', text: 'Done task', completed: true }],
          notes: ''
        })
      });
      renderWithProviders(<ShellTodosTab shellId="shell-1" />);
      await waitFor(() => {
        expect(screen.getByText('Done task')).toHaveStyle({ textDecoration: 'line-through' });
      });
    });
  });
  ```

**Implementation**:

1. `src/server/services/shell/ShellContextService.ts`: Backend service for shell context
   ```typescript
   export class ShellContextService {
     private store: JsonStore<Record<string, ShellContextData>>;

     async getContext(shellId: string): Promise<ShellContextData> {
       const data = await this.store.get();
       return data[shellId] || { todos: [], notes: '' };
     }

     async addTodo(shellId: string, text: string): Promise<TodoItem> {
       const todo: TodoItem = {
         id: generateId(),
         text,
         completed: false,
         createdAt: new Date().toISOString(),
         completedAt: null
       };
       // Add to store and return
     }

     async toggleTodo(shellId: string, todoId: string): Promise<void> {
       // Toggle completion status, set completedAt timestamp
     }

     async deleteTodo(shellId: string, todoId: string): Promise<void> {
       // Remove from store
     }

     async updateNotes(shellId: string, notes: string): Promise<void> {
       // Update notes in store
     }
   }
   ```

2. `src/server/api/routes/shells.ts`: Add context endpoint
   - `GET /api/shells/:id/context` - Returns shell context (todos + notes)
   - `PATCH /api/shells/:id/context` - Updates shell context
     - Body can include: `addTodo`, `toggleTodo`, `deleteTodo`, `updateTodoText`, `notes`

3. `src/client/hooks/useShellContext.ts`: React Query hook for shell context
   ```typescript
   export function useShellContext(shellId: string) {
     const queryClient = useQueryClient();

     const { data: context } = useQuery(
       ['shellContext', shellId],
       () => fetchShellContext(shellId),
       { staleTime: 30000 }
     );

     const addTodo = useMutation(
       (text: string) => patchShellContext(shellId, { addTodo: { text } }),
       { onSuccess: () => queryClient.invalidateQueries(['shellContext', shellId]) }
     );

     const toggleTodo = useMutation(
       (todoId: string) => patchShellContext(shellId, { toggleTodo: { id: todoId } }),
       { onSuccess: () => queryClient.invalidateQueries(['shellContext', shellId]) }
     );

     return { context, addTodo, toggleTodo, /* ... */ };
   }
   ```

4. `src/client/components/context-sidebar/ShellContext.tsx`: Shell wrapper
   - Renders SegmentedTabs with TODOs/Notes options
   - Manages active tab state

5. `src/client/components/context-sidebar/tabs/ShellTodosTab.tsx`: TODO list
   - Uses `useShellContext` hook for data and mutations
   - Uses Mantine `List`, `Checkbox`, `TextInput`, `ActionIcon`
   - Displays todos sorted: uncompleted first, completed last (client-side sort)
   - Add button with inline input
   ```typescript
   import { List, Checkbox, TextInput, ActionIcon, Group } from '@mantine/core';
   import { IconTrash } from '@tabler/icons-react';

   <List listStyleType="none">
     {sortedTodos.map((todo) => (
       <List.Item key={todo.id}>
         <Group>
           <Checkbox
             checked={todo.completed}
             onChange={() => toggleTodo.mutate(todo.id)}
             label={todo.text}
             styles={{ label: { textDecoration: todo.completed ? 'line-through' : 'none' } }}
           />
           <ActionIcon variant="subtle" onClick={() => deleteTodo.mutate(todo.id)}>
             <IconTrash size={16} />
           </ActionIcon>
         </Group>
       </List.Item>
     ))}
   </List>
   ```

6. **No separate TodoItem component needed** - Mantine components handle rendering inline

**Dependencies**:
- External: None (uses existing Mantine components)
- Internal: Phase 1 (sidebar infrastructure)

**Verification**:
1. Run: `npm test -- --grep "Todo"`
2. Run: `npm run dev`
3. Click on a shell to open context sidebar
4. Expected: TODOs tab shown with empty state and [+] button
5. Add a todo, check it off: Should move to bottom with strikethrough
6. Refresh page: Todos should persist

---

### Phase 5: Shell Context - Notes Tab

**Objective**: Implement markdown editor with edit/preview modes for per-shell notes with server persistence.

**Tests to Write First**:

- `test/unit/server/services/shell/ShellContextService.test.ts`: Add notes tests (extend from Phase 4)
  ```typescript
  describe('ShellContextService - notes', () => {
    let service: ShellContextService;

    beforeEach(() => {
      service = new ShellContextService();
    });

    it('updates shell notes', async () => {
      await service.updateNotes('shell-1', '# Hello\n\nWorld');
      const context = await service.getContext('shell-1');
      expect(context.notes).toBe('# Hello\n\nWorld');
    });

    it('preserves todos when updating notes', async () => {
      await service.addTodo('shell-1', 'Task');
      await service.updateNotes('shell-1', 'Some notes');

      const context = await service.getContext('shell-1');
      expect(context.todos).toHaveLength(1);
      expect(context.notes).toBe('Some notes');
    });
  });
  ```

- `test/integration/api/shellContext.test.ts`: Add notes API tests (extend from Phase 4)
  ```typescript
  describe('PATCH /api/shells/:id/context - notes', () => {
    it('updates shell notes', async () => {
      const shell = await createTestShell();
      const response = await request(server.app)
        .patch(`/api/shells/${shell.id}/context`)
        .set('Cookie', server.authCookie)
        .send({ notes: '# My Notes\n\nSome content' })
        .expect(200);

      expect(response.body.notes).toBe('# My Notes\n\nSome content');
    });

    it('preserves todos when updating notes', async () => {
      const shell = await createTestShell();
      // First add a todo
      await request(server.app)
        .patch(`/api/shells/${shell.id}/context`)
        .set('Cookie', server.authCookie)
        .send({ addTodo: { text: 'Task' } });

      // Then update notes
      const response = await request(server.app)
        .patch(`/api/shells/${shell.id}/context`)
        .set('Cookie', server.authCookie)
        .send({ notes: 'Some notes' })
        .expect(200);

      expect(response.body.todos).toHaveLength(1);
      expect(response.body.notes).toBe('Some notes');
    });
  });
  ```

- `test/unit/client/components/context-sidebar/tabs/ShellNotesTab.test.tsx`:
  ```typescript
  describe('ShellNotesTab', () => {
    beforeEach(() => {
      mockFetch.mockReset();
    });

    it('shows empty state when no notes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ todos: [], notes: '' })
      });
      renderWithProviders(<ShellNotesTab shellId="shell-1" />);
      await waitFor(() => {
        expect(screen.getByText(/click to add notes/i)).toBeInTheDocument();
      });
    });

    it('enters edit mode on click', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ todos: [], notes: '' })
      });
      renderWithProviders(<ShellNotesTab shellId="shell-1" />);
      await waitFor(() => screen.getByTestId('notes-area'));
      await userEvent.click(screen.getByTestId('notes-area'));
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders markdown when not editing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ todos: [], notes: '# Heading\n\n**Bold text**' })
      });
      renderWithProviders(<ShellNotesTab shellId="shell-1" />);
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Heading');
      });
    });

    it('debounces saves to server during editing', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ todos: [], notes: '' })
      });

      renderWithProviders(<ShellNotesTab shellId="shell-1" />);
      await waitFor(() => screen.getByTestId('notes-area'));
      await userEvent.click(screen.getByTestId('notes-area'));
      await userEvent.type(screen.getByRole('textbox'), 'New note content');

      // API shouldn't be called immediately
      const patchCalls = mockFetch.mock.calls.filter(
        call => call[1]?.method === 'PATCH'
      );
      expect(patchCalls).toHaveLength(0);

      // After debounce delay, API should be called
      await vi.advanceTimersByTimeAsync(500);
      const patchCallsAfter = mockFetch.mock.calls.filter(
        call => call[1]?.method === 'PATCH'
      );
      expect(patchCallsAfter.length).toBeGreaterThan(0);
      vi.useRealTimers();
    });
  });
  ```

- `test/unit/client/components/context-sidebar/common/MarkdownEditor.test.tsx`:
  ```typescript
  describe('MarkdownEditor', () => {
    it('sanitizes dangerous HTML', () => {
      const { container } = render(
        <MarkdownEditor
          value="<script>alert('xss')</script>Safe text"
          editing={false}
        />
      );
      expect(container.querySelector('script')).toBeNull();
      expect(screen.getByText('Safe text')).toBeInTheDocument();
    });

    it('renders code blocks with syntax highlighting', () => {
      render(
        <MarkdownEditor
          value="```javascript\nconst x = 1;\n```"
          editing={false}
        />
      );
      expect(screen.getByText('const')).toBeInTheDocument();
    });
  });
  ```

**Implementation**:

1. `src/client/components/context-sidebar/tabs/ShellNotesTab.tsx`: Notes tab
   - Uses `useShellContext` hook from Phase 4 for data and mutations
   - Uses `@uiw/react-md-editor` for full-featured markdown editing
   - Debounced save to server (500ms)
   ```typescript
   import MDEditor from '@uiw/react-md-editor';
   import { useDebouncedCallback } from '@mantine/hooks';

   const { context, updateNotes } = useShellContext(shellId);
   const [draft, setDraft] = useState(context?.notes || '');

   const debouncedSave = useDebouncedCallback((notes: string) => {
     updateNotes.mutate(notes);
   }, 500);

   const handleChange = (value?: string) => {
     setDraft(value || '');
     debouncedSave(value || '');
   };

   <MDEditor
     value={draft}
     onChange={handleChange}
     preview="edit"  // or "live" for side-by-side
     height={300}
     data-color-mode="dark"
   />
   ```

2. **No separate MarkdownEditor component needed** - `@uiw/react-md-editor` handles:
   - Edit/preview toggle (built-in toolbar)
   - Markdown rendering with sanitization
   - Keyboard shortcuts (Ctrl+B, Ctrl+I, etc.)
   - Dark mode support
   - Code syntax highlighting

**Dependencies**:
- External: `@uiw/react-md-editor` (should be installed in Phase 1)
- Internal: Phase 1 (sidebar infrastructure), Phase 4 (shell context wrapper, useShellContext hook)

**Verification**:
1. Run: `npm test -- --grep "Notes\|MarkdownEditor"`
2. Run: `npm run dev`
3. Click on a shell, switch to Notes tab
4. Click to edit, type markdown content (e.g., `# Header\n\n**bold**`)
5. Click outside: Should render as formatted HTML
6. Refresh page: Notes should persist
7. Open same shell in different browser: Notes should be the same (server-persisted)

---

### Phase 6: Click Behavior & Polish

**Objective**: Refine click handling on sidebar items, add file preview in left sidebar, and polish transitions.

**Tests to Write First**:

- `test/unit/client/components/shells/ShellItem.test.tsx`: Update click tests
  ```typescript
  describe('ShellItem context sidebar integration', () => {
    it('opens context sidebar on click', async () => {
      renderWithProviders(<ShellItem shell={mockShell} />);
      await userEvent.click(screen.getByTestId('shell-item'));
      expect(useUIStore.getState().contextSidebarOpen).toBe(true);
      expect(useUIStore.getState().selectedContextId).toBe(mockShell.id);
    });

    it('closes sidebar on second click (toggle)', async () => {
      useUIStore.getState().openContextSidebar('shell', mockShell.id);
      renderWithProviders(<ShellItem shell={mockShell} />);
      await userEvent.click(screen.getByTestId('shell-item'));
      expect(useUIStore.getState().contextSidebarOpen).toBe(false);
    });
  });
  ```

- `test/unit/client/components/projects/ProjectItem.test.tsx`: Click zone tests
  ```typescript
  describe('ProjectItem click zones', () => {
    it('expands shell list on chevron click', async () => {
      renderWithProviders(<ProjectItem project={mockProject} />);
      await userEvent.click(screen.getByTestId('project-chevron'));
      expect(useUIStore.getState().expandedProjectIds).toContain(mockProject.id);
      expect(useUIStore.getState().contextSidebarOpen).toBe(false);
    });

    it('opens context sidebar on name click', async () => {
      renderWithProviders(<ProjectItem project={mockProject} />);
      await userEvent.click(screen.getByTestId('project-name'));
      expect(useUIStore.getState().contextSidebarOpen).toBe(true);
      expect(useUIStore.getState().selectedContextType).toBe('project');
    });

    it('does not expand when name clicked', async () => {
      renderWithProviders(<ProjectItem project={mockProject} />);
      await userEvent.click(screen.getByTestId('project-name'));
      expect(useUIStore.getState().expandedProjectIds).not.toContain(mockProject.id);
    });
  });
  ```

- `test/e2e/contextSidebar.spec.ts`: End-to-end flow tests
  ```typescript
  test.describe('Context Sidebar', () => {
    test('project context workflow', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-testid="project-name"]');
      await expect(page.locator('[data-testid="context-sidebar"]')).toBeVisible();
      await expect(page.locator('text=URLs')).toBeVisible();

      // Pin sidebar
      await page.click('[data-testid="pin-button"]');
      await expect(page.locator('[data-testid="pin-button"]')).toHaveAttribute('aria-pressed', 'true');

      // Add custom URL
      await page.click('[data-testid="add-url-button"]');
      await page.fill('[data-testid="url-name-input"]', 'Docs');
      await page.fill('[data-testid="url-input"]', 'https://docs.example.com');
      await page.click('[data-testid="save-url-button"]');
      await expect(page.locator('text=Docs')).toBeVisible();
    });

    test('shell context workflow', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-testid="shell-item"]');
      await expect(page.locator('[data-testid="context-sidebar"]')).toBeVisible();
      await expect(page.locator('text=TODOs')).toBeVisible();

      // Add todo
      await page.click('[data-testid="add-todo-button"]');
      await page.fill('[data-testid="todo-input"]', 'Test task');
      await page.click('[data-testid="submit-todo"]');
      await expect(page.locator('text=Test task')).toBeVisible();

      // Switch to notes
      await page.click('text=Notes');
      await page.click('[data-testid="notes-area"]');
      await page.fill('textarea', '# My Notes');
      await page.click('body'); // blur
      await expect(page.locator('h1:has-text("My Notes")')).toBeVisible();
    });

    test('sidebar state persists across refresh', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-testid="project-name"]');
      await page.click('[data-testid="pin-button"]');

      await page.reload();

      await expect(page.locator('[data-testid="context-sidebar"]')).toBeVisible();
      await expect(page.locator('[data-testid="pin-button"]')).toHaveAttribute('aria-pressed', 'true');
    });
  });
  ```

**Implementation**:

1. `src/client/components/projects/ProjectItem.tsx`: Refine click zones
   - Chevron click: toggle expand (existing behavior) with `stopPropagation()`
   - Name/icon click: open context sidebar
   - Same project click: close sidebar (toggle behavior)

2. `src/client/components/shells/ShellItem.tsx`: Add context trigger
   - Click opens context sidebar with shell type
   - Same shell click: close sidebar (toggle)
   - Attaches terminal (existing behavior preserved)

3. `src/client/components/context-sidebar/ContextSidebar.tsx`: Transitions
   - Add CSS transitions for slide-in/out (transform: translateX)
   - Smooth width transitions when pinning
   - Add click-outside-to-close when unpinned

4. `src/client/components/layout/AppShell.tsx`: Layout polish
   - Ensure terminal focus isn't lost when sidebar opens
   - Handle keyboard shortcut for sidebar toggle (optional stretch goal)

5. `src/client/components/sidebar/FilePreviewItem.tsx`: Left sidebar file preview
   - New component to show previewed files below shells
   - Click to re-open file preview in context sidebar
   - Close button to remove from left sidebar

**Dependencies**:
- External: None
- Internal: All previous phases

**Verification**:
1. Run: `npm run test:e2e -- contextSidebar`
2. Run: `npm run dev`
3. Click chevron on project: Only expands shells, no sidebar
4. Click project name: Sidebar opens with URLs tab
5. Click same project: Sidebar closes
6. Click shell: Sidebar opens with TODOs tab, terminal attaches
7. Click outside sidebar (when unpinned): Sidebar closes
8. Pin sidebar, refresh: Sidebar remains open and pinned

---

## Common Utilities Needed

| Utility | Purpose | Used In |
|---------|---------|---------|
| `generateId()` | Create unique IDs for todos and custom URLs | uiStore (already exists) |
| `debounce()` | Debounce notes save and workspace sync | ShellNotesTab, useWorkspaceSync |
| `clamp(value, min, max)` | Clamp sidebar width within bounds | uiStore |
| `parseGitRemoteUrl(url)` | Extract org/repo from git URL | ProjectMetadataService |
| `detectLanguage(filename)` | Map file extension to language | FileTreeService, FilePreview |

---

## External Libraries Assessment

| Task | Library | Size | Rationale |
|------|---------|------|-----------|
| Resizable panels | `react-resizable-panels` | ~10KB | Mature, accessible, handles keyboard navigation |
| Git operations | `simple-git` | ~50KB | Stable API, good TypeScript support, handles edge cases |
| File tree | `@mantine/core` (Tree) | - | Already in deps, consistent styling, `useTree` hook |
| Code preview | `@monaco-editor/react` | ~2-3MB | VS Code editor, 78 languages, full syntax highlighting |
| Image preview | `react-photo-view` | ~20KB | Zoom, pan, lightbox, touch support |
| Markdown editor/preview | `@uiw/react-md-editor` | ~30KB | Full-featured editor + `MDEditor.Markdown` for preview-only |
| Tabs/Modals/Forms | `@mantine/core` | - | Already in deps - SegmentedControl, Modal, TextInput, Checkbox, List |

**Not recommended yet**:
- `@dnd-kit/core` - Only add if drag-to-reorder todos becomes a requirement
- `@tanstack/react-virtual` - Only add if file tree performance issues arise (Mantine Tree has no built-in virtualization)

---

## Risk Mitigation

| Risk | Mitigation Strategy |
|------|---------------------|
| Git command slowness | Use React Query with 30-second stale time; simple-git has internal optimizations |
| Large file trees | Default to git-modified-only; add depth limit (5 levels) for "show all"; add `@tanstack/react-virtual` if Mantine Tree performance is insufficient |
| Markdown XSS | Use dompurify to sanitize all react-markdown output; test with XSS payloads |
| Click event conflicts | Use `stopPropagation()` on chevron; explicit `data-testid` zones |
| State sync conflicts | Use optimistic updates with timestamps; last-write-wins |
| Sidebar width persistence | Clamp to valid range on load; default if invalid |
| Terminal resize jank | Use CSS transitions; debounce resize events |

---

## File Summary

### New Files to Create

**Components** (Phase 1-5):
- `src/client/components/context-sidebar/ContextSidebar.tsx`
- `src/client/components/context-sidebar/ContextSidebarHeader.tsx`
- `src/client/components/context-sidebar/ProjectContext.tsx`
- `src/client/components/context-sidebar/ShellContext.tsx`
- `src/client/components/context-sidebar/tabs/ProjectUrlsTab.tsx`
- `src/client/components/context-sidebar/tabs/ProjectFilesTab.tsx`
- `src/client/components/context-sidebar/tabs/ShellTodosTab.tsx`
- `src/client/components/context-sidebar/tabs/ShellNotesTab.tsx`
- `src/client/components/context-sidebar/common/UrlItem.tsx`
- `src/client/components/context-sidebar/common/AddUrlModal.tsx`
- `src/client/components/context-sidebar/common/GitStatusBadge.tsx`
- `src/client/components/context-sidebar/common/FilePreview.tsx`
- `src/client/components/sidebar/FilePreviewItem.tsx`

**Utilities**:
- `src/client/utils/fileTypes.ts` - File type detection (image, markdown, code)

**Removed** (using Mantine/library components instead):
- ~~SegmentedTabs.tsx~~ → Mantine `SegmentedControl`
- ~~TodoItem.tsx~~ → Mantine `Checkbox` + `List`
- ~~MarkdownEditor.tsx~~ → `@uiw/react-md-editor`

**Hooks** (Phase 2-4):
- `src/client/hooks/useProjectMetadata.ts`
- `src/client/hooks/useProjectUrls.ts`
- `src/client/hooks/useProjectFiles.ts`
- `src/client/hooks/useShellContext.ts`

**Services** (Phase 2-4):
- `src/server/services/project/ProjectMetadataService.ts`
- `src/server/services/project/ProjectUrlsService.ts`
- `src/server/services/filesystem/FileTreeService.ts`
- `src/server/services/shell/ShellContextService.ts`

**Tests**:
- `test/unit/client/components/context-sidebar/ContextSidebar.test.tsx`
- `test/unit/client/components/context-sidebar/tabs/ProjectUrlsTab.test.tsx`
- `test/unit/client/components/context-sidebar/tabs/ProjectFilesTab.test.tsx`
- `test/unit/client/components/context-sidebar/tabs/ShellTodosTab.test.tsx`
- `test/unit/client/components/context-sidebar/tabs/ShellNotesTab.test.tsx`
- `test/unit/server/services/project/ProjectMetadataService.test.ts`
- `test/unit/server/services/project/ProjectUrlsService.test.ts`
- `test/unit/server/services/filesystem/FileTreeService.test.ts`
- `test/unit/server/services/shell/ShellContextService.test.ts`
- `test/integration/api/projectMetadata.test.ts`
- `test/integration/api/projectUrls.test.ts`
- `test/integration/api/projectFiles.test.ts`
- `test/integration/api/shellContext.test.ts`
- `test/e2e/contextSidebar.spec.ts`

### Files to Modify

- `src/shared/types/index.ts` - Add new types (Phase 1-2)
- `src/client/stores/uiStore.ts` - Add context sidebar UI state (Phase 1)
- `src/client/hooks/useWorkspaceSync.ts` - Sync new UI state fields (Phase 1)
- `src/client/components/layout/AppShell.tsx` - Add sidebar to layout (Phase 1)
- `src/server/api/routes/projects.ts` - Add metadata, files, and URLs endpoints (Phase 2-3)
- `src/server/api/routes/shells.ts` - Add context endpoint (Phase 4)
- `src/client/components/projects/ProjectItem.tsx` - Click zone handling (Phase 6)
- `src/client/components/shells/ShellItem.tsx` - Context trigger (Phase 6)
- `test/unit/client/stores/uiStore.test.ts` - Add new UI state tests (Phase 1)
- `test/unit/client/components/shells/ShellItem.test.tsx` - Update click tests (Phase 6)
- `test/unit/client/components/projects/ProjectItem.test.tsx` - Add click zone tests (Phase 6)

---

## Acceptance Criteria Checklist

Use this checklist to verify completion:

### Phase 1: Core Infrastructure
- [ ] Sidebar appears when item selected
- [ ] Pin/unpin toggle works
- [ ] Terminal resizes when pinned
- [ ] Sidebar overlays when unpinned
- [ ] Width is draggable within bounds
- [ ] State persists across refresh

### Phase 2: URLs Tab
- [ ] GitHub URL auto-detected
- [ ] GitHub Actions link shown when workflows exist
- [ ] NPM link shown when package.json exists
- [ ] Custom URLs can be added/edited/deleted
- [ ] Custom URLs persist per-project (server-side)
- [ ] Custom URLs visible across different browsers (same project)
- [ ] All URLs open in new tab

### Phase 3: Files Tab
- [ ] Git-modified files shown by default
- [ ] "Show all" toggle works
- [ ] Git status indicators displayed
- [ ] Directories expandable
- [ ] Code files preview with Monaco Editor (syntax highlighting, line numbers)
- [ ] Image files preview with zoom/pan support
- [ ] Markdown files preview rendered as HTML

### Phase 4: TODOs Tab
- [ ] Todos can be added
- [ ] Checkbox toggles completion
- [ ] Completed todos move to bottom
- [ ] Todos persist per-shell (server-side)
- [ ] Todos visible across different browsers (same shell)

### Phase 5: Notes Tab
- [ ] Click enters edit mode
- [ ] Blur renders markdown
- [ ] Basic formatting works
- [ ] Notes persist per-shell (server-side)
- [ ] Notes visible across different browsers (same shell)
- [ ] XSS sanitization working

### Phase 6: Polish
- [ ] Chevron click only expands
- [ ] Name click opens sidebar
- [ ] Toggle behavior on same-item click
- [ ] Smooth transitions
- [ ] E2E tests passing
