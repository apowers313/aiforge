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

// Extend Express Request to include project service
declare module 'express-serve-static-core' {
  interface Request {
    projectService?: ProjectService;
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

type CreateProjectBody = z.infer<typeof CreateProjectSchema>;
type UpdateProjectBody = z.infer<typeof UpdateProjectSchema>;
type IdParams = z.infer<typeof IdParamsSchema>;

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
 * Middleware to attach project service
 */
export function attachProjectService(projectService: ProjectService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.projectService = projectService;
    next();
  };
}

export { router as projectsRouter };
