/**
 * API routes aggregator
 */
import { Router } from 'express';
import { authRouter } from './auth.js';
import { projectsRouter, attachProjectService } from './projects.js';
import { shellsRouter, attachShellService } from './shells.js';
import { filesystemRouter, attachFilesystemService } from './filesystem.js';
import { workspaceRouter, attachWorkspaceStateService } from './workspace.js';
import type { ProjectService } from '../../services/project/ProjectService.js';
import type { ShellService } from '../../services/shell/ShellService.js';
import type { FilesystemService } from '../../services/filesystem/FilesystemService.js';
import type { WorkspaceStateService } from '../../services/workspace/WorkspaceStateService.js';

export interface RouteServices {
  projectService: ProjectService;
  shellService: ShellService;
  filesystemService: FilesystemService;
  workspaceStateService: WorkspaceStateService;
}

export function createApiRouter(services: RouteServices): Router {
  const router = Router();

  // Attach services to all routes
  router.use(attachProjectService(services.projectService));
  router.use(attachShellService(services.shellService));
  router.use(attachFilesystemService(services.filesystemService));
  router.use(attachWorkspaceStateService(services.workspaceStateService));

  // Mount routes
  router.use('/auth', authRouter);
  router.use('/projects', projectsRouter);
  router.use('/', shellsRouter); // Has /projects/:projectId/shells and /shells/:id routes
  router.use('/filesystem', filesystemRouter);
  router.use('/workspace', workspaceRouter);

  return router;
}

export { authRouter, projectsRouter, shellsRouter, filesystemRouter, workspaceRouter };
