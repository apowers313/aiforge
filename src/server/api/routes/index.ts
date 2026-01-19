/**
 * API routes aggregator
 */
import { Router } from 'express';
import { authRouter } from './auth.js';
import { healthRouter } from './health.js';
import { projectsRouter, attachProjectService, attachProjectMetadataService, attachProjectUrlsService, attachFileTreeService } from './projects.js';
import { shellsRouter, attachShellService, attachShellContextService } from './shells.js';
import { filesystemRouter, attachFilesystemService } from './filesystem.js';
import { workspaceRouter, attachWorkspaceStateService } from './workspace.js';
import type { ProjectService } from '../../services/project/ProjectService.js';
import type { ProjectMetadataService } from '../../services/project/ProjectMetadataService.js';
import type { ProjectUrlsService } from '../../services/project/ProjectUrlsService.js';
import type { ShellService } from '../../services/shell/ShellService.js';
import type { ShellContextService } from '../../services/shell/ShellContextService.js';
import type { FilesystemService } from '../../services/filesystem/FilesystemService.js';
import type { FileTreeService } from '../../services/filesystem/FileTreeService.js';
import type { WorkspaceStateService } from '../../services/workspace/WorkspaceStateService.js';

export interface RouteServices {
  projectService: ProjectService;
  projectMetadataService: ProjectMetadataService;
  projectUrlsService: ProjectUrlsService;
  shellService: ShellService;
  shellContextService: ShellContextService;
  filesystemService: FilesystemService;
  fileTreeService: FileTreeService;
  workspaceStateService: WorkspaceStateService;
}

export function createApiRouter(services: RouteServices): Router {
  const router = Router();

  // Attach services to all routes
  router.use(attachProjectService(services.projectService));
  router.use(attachProjectMetadataService(services.projectMetadataService));
  router.use(attachProjectUrlsService(services.projectUrlsService));
  router.use(attachShellService(services.shellService));
  router.use(attachShellContextService(services.shellContextService));
  router.use(attachFilesystemService(services.filesystemService));
  router.use(attachFileTreeService(services.fileTreeService));
  router.use(attachWorkspaceStateService(services.workspaceStateService));

  // Mount routes
  router.use('/auth', authRouter);
  router.use('/health', healthRouter);
  router.use('/projects', projectsRouter);
  router.use('/', shellsRouter); // Has /projects/:projectId/shells and /shells/:id routes
  router.use('/filesystem', filesystemRouter);
  router.use('/workspace', workspaceRouter);

  return router;
}

export { authRouter, healthRouter, projectsRouter, shellsRouter, filesystemRouter, workspaceRouter };
export { setWebSocketReady, isWebSocketReady } from './health.js';
