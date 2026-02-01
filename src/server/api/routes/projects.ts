/**
 * Projects API routes
 */
import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { validateBody, validateParams } from '../middleware/validation.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/error.js';
import type { ProjectService } from '../../services/project/ProjectService.js';
import type { ProjectMetadataService } from '../../services/project/ProjectMetadataService.js';
import type { ProjectUrlsService } from '../../services/project/ProjectUrlsService.js';
import type { ProjectContextService } from '../../services/project/ProjectContextService.js';
import type { WorktreeService } from '../../services/project/WorktreeService.js';
import type { FileTreeService } from '../../services/filesystem/FileTreeService.js';
import { join, normalize, relative } from 'node:path';

// Extend Express Request to include project services
declare module 'express-serve-static-core' {
  interface Request {
    projectService?: ProjectService;
    projectMetadataService?: ProjectMetadataService;
    projectUrlsService?: ProjectUrlsService;
    projectContextService?: ProjectContextService;
    worktreeService?: WorktreeService;
    fileTreeService?: FileTreeService;
  }
}

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Request schemas
const CreateProjectSchema = z.object({
  path: z.string().min(1, 'Path is required'),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

const IdParamsSchema = z.object({
  id: z.string().uuid('Invalid project ID'),
});

const UrlIdParamsSchema = z.object({
  id: z.string().uuid('Invalid project ID'),
  urlId: z.string().uuid('Invalid URL ID'),
});

const CreateUrlSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  url: z.string().url('Invalid URL format'),
});

const UpdateUrlSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url('Invalid URL format').optional(),
});

const FilePathParamsSchema = z.object({
  id: z.string().uuid('Invalid project ID'),
  filePath: z.string().min(1, 'File path is required'),
});

const CreateWorktreeSchema = z.object({
  name: z
    .string()
    .min(1, 'Worktree name is required')
    .max(255)
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/,
      'Invalid branch name: must start with alphanumeric and contain only alphanumeric, dots, underscores, hyphens, and forward slashes',
    ),
  baseBranch: z.string().min(1).max(255).optional(),
});

const WorktreePathParamsSchema = z.object({
  id: z.string().uuid('Invalid project ID'),
  worktreePath: z.string().min(1, 'Worktree path is required'),
});

const TodoIdParamsSchema = z.object({
  id: z.string().uuid('Invalid project ID'),
  todoId: z.string().uuid('Invalid todo ID'),
});

const CreateTodoSchema = z.object({
  text: z.string().min(1, 'TODO text is required').max(500),
});

const UpdateTodoSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  completed: z.boolean().optional(),
});

const UpdateNotesSchema = z.object({
  notes: z.string().max(50000), // Allow empty notes
});

const ReorderTodosSchema = z.object({
  todoIds: z.array(z.string()),
});

type CreateProjectBody = z.infer<typeof CreateProjectSchema>;
type UpdateProjectBody = z.infer<typeof UpdateProjectSchema>;
type IdParams = z.infer<typeof IdParamsSchema>;
type UrlIdParams = z.infer<typeof UrlIdParamsSchema>;
type CreateUrlBody = z.infer<typeof CreateUrlSchema>;
type FilePathParams = z.infer<typeof FilePathParamsSchema>;
type UpdateUrlBody = z.infer<typeof UpdateUrlSchema>;
type CreateWorktreeBody = z.infer<typeof CreateWorktreeSchema>;
type WorktreePathParams = z.infer<typeof WorktreePathParamsSchema>;
type TodoIdParams = z.infer<typeof TodoIdParamsSchema>;
type CreateTodoBody = z.infer<typeof CreateTodoSchema>;
type UpdateTodoBody = z.infer<typeof UpdateTodoSchema>;
type UpdateNotesBody = z.infer<typeof UpdateNotesSchema>;
type ReorderTodosBody = z.infer<typeof ReorderTodosSchema>;

/**
 * GET /api/projects
 * List all projects
 */
router.get('/', async (req, res, next) => {
  try {
    if (!req.projectService) {
      throw ApiError.internal('Project service not configured');
    }

    const projects = await req.projectService.getAll();
    res.json({ projects });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/', validateBody(CreateProjectSchema), async (req, res, next) => {
  try {
    if (!req.projectService) {
      throw ApiError.internal('Project service not configured');
    }

    const { path } = req.body as CreateProjectBody;
    const project = await req.projectService.create(path);
    res.status(201).json({ project });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'Path does not exist' || err.message === 'Path is not a directory') {
        next(ApiError.badRequest(err.message));
        return;
      }
      if (err.message === 'Project already exists for this path') {
        next(ApiError.conflict(err.message));
        return;
      }
    }
    next(err);
  }
});

/**
 * GET /api/projects/:id
 * Get a project by ID
 */
router.get('/:id', validateParams(IdParamsSchema), async (req, res, next) => {
  try {
    if (!req.projectService) {
      throw ApiError.internal('Project service not configured');
    }

    const { id } = req.params as IdParams;
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    res.json({ project });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/projects/:id
 * Update a project
 */
router.patch('/:id', validateParams(IdParamsSchema), validateBody(UpdateProjectSchema), async (req, res, next) => {
  try {
    if (!req.projectService) {
      throw ApiError.internal('Project service not configured');
    }

    const { id } = req.params as IdParams;
    const body = req.body as UpdateProjectBody;
    const updates: { name?: string } = {};
    if (body.name !== undefined) {
      updates.name = body.name;
    }
    const project = await req.projectService.update(id, updates);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    res.json({ project });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
router.delete('/:id', validateParams(IdParamsSchema), async (req, res, next) => {
  try {
    if (!req.projectService) {
      throw ApiError.internal('Project service not configured');
    }

    const { id } = req.params as IdParams;
    const deleted = await req.projectService.delete(id);
    if (!deleted) {
      throw ApiError.notFound('Project not found');
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/projects/:id/metadata
 * Get project metadata (git info, package.json, etc.)
 */
router.get('/:id/metadata', validateParams(IdParamsSchema), async (req, res, next) => {
  try {
    if (!req.projectService || !req.projectMetadataService) {
      throw ApiError.internal('Required services not configured');
    }

    const { id } = req.params as IdParams;
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    const metadata = await req.projectMetadataService.getMetadata(project.path);
    res.json(metadata);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/projects/:id/urls
 * Get custom URLs for a project
 */
router.get('/:id/urls', validateParams(IdParamsSchema), async (req, res, next) => {
  try {
    if (!req.projectService || !req.projectUrlsService) {
      throw ApiError.internal('Required services not configured');
    }

    const { id } = req.params as IdParams;
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    const urls = await req.projectUrlsService.getUrls(id);
    res.json({ urls });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/projects/:id/urls
 * Add a custom URL to a project
 */
router.post('/:id/urls', validateParams(IdParamsSchema), validateBody(CreateUrlSchema), async (req, res, next) => {
  try {
    if (!req.projectService || !req.projectUrlsService) {
      throw ApiError.internal('Required services not configured');
    }

    const { id } = req.params as IdParams;
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    const { name, url } = req.body as CreateUrlBody;
    const customUrl = await req.projectUrlsService.addUrl(id, name, url);
    res.status(201).json(customUrl);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/projects/:id/urls/:urlId
 * Update a custom URL
 */
router.put('/:id/urls/:urlId', validateParams(UrlIdParamsSchema), validateBody(UpdateUrlSchema), async (req, res, next) => {
  try {
    if (!req.projectService || !req.projectUrlsService) {
      throw ApiError.internal('Required services not configured');
    }

    const { id, urlId } = req.params as UrlIdParams;
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    const body = req.body as UpdateUrlBody;
    const updates: { name?: string; url?: string } = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.url !== undefined) updates.url = body.url;

    const updatedUrl = await req.projectUrlsService.updateUrl(id, urlId, updates);
    if (!updatedUrl) {
      throw ApiError.notFound('URL not found');
    }

    res.json(updatedUrl);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/projects/:id/urls/:urlId
 * Delete a custom URL
 */
router.delete('/:id/urls/:urlId', validateParams(UrlIdParamsSchema), async (req, res, next) => {
  try {
    if (!req.projectService || !req.projectUrlsService) {
      throw ApiError.internal('Required services not configured');
    }

    const { id, urlId } = req.params as UrlIdParams;
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    const deleted = await req.projectUrlsService.deleteUrl(id, urlId);
    if (!deleted) {
      throw ApiError.notFound('URL not found');
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/projects/:id/files
 * Get file tree for a project
 */
router.get('/:id/files', validateParams(IdParamsSchema), async (req, res, next) => {
  try {
    if (!req.projectService || !req.fileTreeService) {
      throw ApiError.internal('Required services not configured');
    }

    const { id } = req.params as IdParams;
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    const gitModifiedOnly = req.query.gitModifiedOnly !== 'false';
    const files = await req.fileTreeService.getFileTree(project.path, { gitModifiedOnly });

    res.json({ files, gitModifiedOnly });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/projects/:id/files/:filePath/preview
 * Get file content preview
 */
router.get('/:id/files/:filePath/preview', validateParams(FilePathParamsSchema), async (req, res, next) => {
  try {
    if (!req.projectService || !req.fileTreeService) {
      throw ApiError.internal('Required services not configured');
    }

    const { id, filePath } = req.params as FilePathParams;
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    // Decode the file path (it may be URL-encoded)
    const decodedPath = decodeURIComponent(filePath);

    // Validate the path doesn't escape the project directory (path traversal protection)
    const fullPath = join(project.path, decodedPath);
    const normalizedPath = normalize(fullPath);
    const relativePath = relative(project.path, normalizedPath);

    // Check if the path tries to escape the project directory
    if (relativePath.startsWith('..') || relativePath.startsWith('/')) {
      throw ApiError.badRequest('Invalid file path');
    }

    try {
      const preview = await req.fileTreeService.getFilePreview(normalizedPath);
      res.json(preview);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw ApiError.notFound('File not found');
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/projects/:id/worktrees
 * Get git worktrees for a project
 */
router.get('/:id/worktrees', validateParams(IdParamsSchema), async (req, res, next) => {
  try {
    if (!req.worktreeService) {
      throw ApiError.internal('Worktree service not configured');
    }

    const { id } = req.params as IdParams;
    const worktrees = await req.worktreeService.getWorktrees(id);
    res.json({ worktrees });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/projects/:id/worktrees/main
 * Get the main branch name for a project
 */
router.get('/:id/worktrees/main', validateParams(IdParamsSchema), async (req, res, next) => {
  try {
    if (!req.worktreeService) {
      throw ApiError.internal('Worktree service not configured');
    }

    const { id } = req.params as IdParams;
    const branch = await req.worktreeService.getMainBranch(id);
    res.json({ branch });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/projects/:id/worktrees
 * Create a new worktree for a project
 */
router.post(
  '/:id/worktrees',
  validateParams(IdParamsSchema),
  validateBody(CreateWorktreeSchema),
  async (req, res, next) => {
    try {
      if (!req.worktreeService) {
        throw ApiError.internal('Worktree service not configured');
      }

      const { id } = req.params as IdParams;
      const { name, baseBranch } = req.body as CreateWorktreeBody;

      const worktree = await req.worktreeService.createWorktree(id, name, baseBranch);
      res.status(201).json({ worktree });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('not found')) {
          next(ApiError.notFound(err.message));
          return;
        }
        if (
          err.message.includes('already exists') ||
          err.message.includes('not a git repository') ||
          err.message.includes('does not exist')
        ) {
          next(ApiError.badRequest(err.message));
          return;
        }
      }
      next(err);
    }
  },
);

/**
 * DELETE /api/projects/:id/worktrees/:worktreePath
 * Delete a worktree from a project
 */
router.delete(
  '/:id/worktrees/:worktreePath',
  validateParams(WorktreePathParamsSchema),
  async (req, res, next) => {
    try {
      if (!req.worktreeService || !req.projectService) {
        throw ApiError.internal('Required services not configured');
      }

      const { id, worktreePath: encodedPath } = req.params as WorktreePathParams;

      // Check if project exists
      const project = await req.projectService.getById(id);
      if (!project) {
        throw ApiError.notFound('Project not found');
      }

      // Decode the worktree path
      const worktreePath = decodeURIComponent(encodedPath);

      // Check for force flag in query params
      const force = req.query.force === 'true';

      await req.worktreeService.deleteWorktree(id, worktreePath, force);
      res.json({ success: true });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('not found') || err.message.includes('Project not found')) {
          next(ApiError.notFound(err.message));
          return;
        }
        if (
          err.message.includes('main worktree') ||
          err.message.includes('not a working tree') ||
          err.message.includes('Not a git repository')
        ) {
          next(ApiError.badRequest(err.message));
          return;
        }
      }
      next(err);
    }
  },
);

// =============================================================================
// Project Context Routes (TODOs and Notes)
// =============================================================================

/**
 * GET /api/projects/:id/context
 * Get project context (todos and notes)
 */
router.get('/:id/context', validateParams(IdParamsSchema), async (req, res, next) => {
  try {
    if (!req.projectService) {
      throw ApiError.internal('Project service not configured');
    }
    if (!req.projectContextService) {
      throw ApiError.internal('Project context service not configured');
    }

    const { id } = req.params as IdParams;

    // Verify project exists
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    const context = await req.projectContextService.getContext(id);
    res.json(context);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/projects/:id/todos
 * Add a TODO to a project
 */
router.post('/:id/todos', validateParams(IdParamsSchema), validateBody(CreateTodoSchema), async (req, res, next) => {
  try {
    if (!req.projectService) {
      throw ApiError.internal('Project service not configured');
    }
    if (!req.projectContextService) {
      throw ApiError.internal('Project context service not configured');
    }

    const { id } = req.params as IdParams;
    const { text } = req.body as CreateTodoBody;

    // Verify project exists
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    const todo = await req.projectContextService.addTodo(id, text);
    res.status(201).json(todo);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/projects/:id/todos/clear-completed
 * Clear all completed TODOs
 * NOTE: Must be before :todoId routes to avoid matching
 */
router.post('/:id/todos/clear-completed', validateParams(IdParamsSchema), async (req, res, next) => {
  try {
    if (!req.projectService) {
      throw ApiError.internal('Project service not configured');
    }
    if (!req.projectContextService) {
      throw ApiError.internal('Project context service not configured');
    }

    const { id } = req.params as IdParams;

    // Verify project exists
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    const cleared = await req.projectContextService.clearCompleted(id);
    res.json({ cleared });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/projects/:id/todos/reorder
 * Reorder TODOs
 * NOTE: Must be before :todoId routes to avoid matching
 */
router.put('/:id/todos/reorder', validateParams(IdParamsSchema), validateBody(ReorderTodosSchema), async (req, res, next) => {
  try {
    if (!req.projectService) {
      throw ApiError.internal('Project service not configured');
    }
    if (!req.projectContextService) {
      throw ApiError.internal('Project context service not configured');
    }

    const { id } = req.params as IdParams;
    const { todoIds } = req.body as ReorderTodosBody;

    // Verify project exists
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    await req.projectContextService.reorderTodos(id, todoIds);
    const context = await req.projectContextService.getContext(id);
    res.json(context);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/projects/:id/todos/:todoId
 * Update a TODO
 */
router.put('/:id/todos/:todoId', validateParams(TodoIdParamsSchema), validateBody(UpdateTodoSchema), async (req, res, next) => {
  try {
    if (!req.projectService) {
      throw ApiError.internal('Project service not configured');
    }
    if (!req.projectContextService) {
      throw ApiError.internal('Project context service not configured');
    }

    const { id, todoId } = req.params as TodoIdParams;
    const body = req.body as UpdateTodoBody;

    // Verify project exists
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    // Build updates object with only defined values (filter out undefined)
    const updates: { text?: string; completed?: boolean } = {};
    if (body.text !== undefined) {
      updates.text = body.text;
    }
    if (body.completed !== undefined) {
      updates.completed = body.completed;
    }

    const todo = await req.projectContextService.updateTodo(id, todoId, updates);
    if (!todo) {
      throw ApiError.notFound('TODO not found');
    }

    res.json(todo);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/projects/:id/todos/:todoId
 * Delete a TODO
 */
router.delete('/:id/todos/:todoId', validateParams(TodoIdParamsSchema), async (req, res, next) => {
  try {
    if (!req.projectService) {
      throw ApiError.internal('Project service not configured');
    }
    if (!req.projectContextService) {
      throw ApiError.internal('Project context service not configured');
    }

    const { id, todoId } = req.params as TodoIdParams;

    // Verify project exists
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    const deleted = await req.projectContextService.deleteTodo(id, todoId);
    if (!deleted) {
      throw ApiError.notFound('TODO not found');
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/projects/:id/notes
 * Update project notes
 */
router.patch('/:id/notes', validateParams(IdParamsSchema), validateBody(UpdateNotesSchema), async (req, res, next) => {
  try {
    if (!req.projectService) {
      throw ApiError.internal('Project service not configured');
    }
    if (!req.projectContextService) {
      throw ApiError.internal('Project context service not configured');
    }

    const { id } = req.params as IdParams;
    const { notes } = req.body as UpdateNotesBody;

    // Verify project exists
    const project = await req.projectService.getById(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    await req.projectContextService.updateNotes(id, notes);
    const context = await req.projectContextService.getContext(id);
    res.json(context);
  } catch (err) {
    next(err);
  }
});

/**
 * Middleware to attach project service
 */
export function attachProjectService(projectService: ProjectService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.projectService = projectService;
    next();
  };
}

/**
 * Middleware to attach project metadata service
 */
export function attachProjectMetadataService(projectMetadataService: ProjectMetadataService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.projectMetadataService = projectMetadataService;
    next();
  };
}

/**
 * Middleware to attach project URLs service
 */
export function attachProjectUrlsService(projectUrlsService: ProjectUrlsService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.projectUrlsService = projectUrlsService;
    next();
  };
}

/**
 * Middleware to attach file tree service
 */
export function attachFileTreeService(fileTreeService: FileTreeService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.fileTreeService = fileTreeService;
    next();
  };
}

/**
 * Middleware to attach worktree service
 */
export function attachWorktreeService(worktreeService: WorktreeService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.worktreeService = worktreeService;
    next();
  };
}

/**
 * Middleware to attach project context service
 */
export function attachProjectContextService(projectContextService: ProjectContextService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.projectContextService = projectContextService;
    next();
  };
}

export { router as projectsRouter };
