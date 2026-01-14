/**
 * Shells API routes
 */
import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { validateBody, validateParams } from '../middleware/validation.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/error.js';
import type { ShellService } from '../../services/shell/ShellService.js';

// Extend Express Request to include shell service
declare module 'express-serve-static-core' {
  interface Request {
    shellService?: ShellService;
  }
}

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Request schemas
const CreateShellSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(['bash', 'ai']).optional().default('bash'),
});

const UpdateShellSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  done: z.boolean().optional(),
});

const ProjectIdParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
});

const ShellIdParamsSchema = z.object({
  id: z.string().uuid('Invalid shell ID'),
});

type CreateShellBody = z.infer<typeof CreateShellSchema>;
type UpdateShellBody = z.infer<typeof UpdateShellSchema>;
type ProjectIdParams = z.infer<typeof ProjectIdParamsSchema>;
type ShellIdParams = z.infer<typeof ShellIdParamsSchema>;

/**
 * GET /api/projects/:projectId/shells
 * List all shells for a project
 */
router.get('/projects/:projectId/shells', validateParams(ProjectIdParamsSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }

    const { projectId } = req.params as ProjectIdParams;
    const shells = await req.shellService.getByProjectId(projectId);
    res.json({ shells });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/projects/:projectId/shells
 * Create a new shell for a project
 */
router.post('/projects/:projectId/shells', validateParams(ProjectIdParamsSchema), validateBody(CreateShellSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }

    const { projectId } = req.params as ProjectIdParams;
    const { name, type } = req.body as CreateShellBody;
    let shell = await req.shellService.create(projectId, name, type);

    // Auto-start the shell after creation (if PTY pool is configured)
    try {
      shell = await req.shellService.start(shell.id);
    } catch (startErr) {
      // If PTY pool is not configured, just return the created shell without starting
      // The shell will have status 'inactive' until explicitly started
      if (!(startErr instanceof Error && startErr.message === 'PTY pool not configured')) {
        throw startErr;
      }
    }
    res.status(201).json({ shell });
  } catch (err) {
    if (err instanceof Error && err.message === 'Project not found') {
      next(ApiError.notFound(err.message));
      return;
    }
    next(err);
  }
});

/**
 * GET /api/shells/:id
 * Get a shell by ID
 */
router.get('/shells/:id', validateParams(ShellIdParamsSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }

    const { id } = req.params as ShellIdParams;
    const shell = await req.shellService.getById(id);
    if (!shell) {
      throw ApiError.notFound('Shell not found');
    }

    res.json({ shell });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/shells/:id
 * Delete a shell
 */
router.delete('/shells/:id', validateParams(ShellIdParamsSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }

    const { id } = req.params as ShellIdParams;
    const deleted = await req.shellService.delete(id);
    if (!deleted) {
      throw ApiError.notFound('Shell not found');
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/shells/:id
 * Update a shell (rename)
 */
router.patch('/shells/:id', validateParams(ShellIdParamsSchema), validateBody(UpdateShellSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }

    const { id } = req.params as ShellIdParams;
    const { name, done } = req.body as UpdateShellBody;

    // Build updates object with only defined values
    const updates: { name?: string; done?: boolean } = {};
    if (name !== undefined) {
      updates.name = name;
    }
    if (done !== undefined) {
      updates.done = done;
    }

    const shell = await req.shellService.update(id, updates);
    if (!shell) {
      throw ApiError.notFound('Shell not found');
    }

    res.json({ shell });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/shells/:id/start
 * Start a shell (spawn PTY process)
 */
router.post('/shells/:id/start', validateParams(ShellIdParamsSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }

    const { id } = req.params as ShellIdParams;
    const shell = await req.shellService.start(id);
    res.json({ shell });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'Shell not found') {
        next(ApiError.notFound(err.message));
        return;
      }
      if (err.message === 'PTY pool not configured') {
        next(ApiError.internal(err.message));
        return;
      }
    }
    next(err);
  }
});

/**
 * POST /api/shells/:id/stop
 * Stop a shell (kill PTY process)
 */
router.post('/shells/:id/stop', validateParams(ShellIdParamsSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }

    const { id } = req.params as ShellIdParams;
    const shell = await req.shellService.stop(id);
    if (!shell) {
      throw ApiError.notFound('Shell not found');
    }
    res.json({ shell });
  } catch (err) {
    if (err instanceof Error && err.message === 'PTY pool not configured') {
      next(ApiError.internal(err.message));
      return;
    }
    next(err);
  }
});

/**
 * POST /api/shells/:id/restart
 * Restart a shell (stop then start PTY process)
 */
router.post('/shells/:id/restart', validateParams(ShellIdParamsSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }

    const { id } = req.params as ShellIdParams;

    // Stop the shell first (ignore if already stopped)
    await req.shellService.stop(id).catch(() => {
      // Shell might already be stopped, that's OK
    });

    // Start it again
    const shell = await req.shellService.start(id);
    res.json({ shell });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'Shell not found') {
        next(ApiError.notFound(err.message));
        return;
      }
      if (err.message === 'PTY pool not configured') {
        next(ApiError.internal(err.message));
        return;
      }
    }
    next(err);
  }
});

/**
 * Middleware to attach shell service
 */
export function attachShellService(shellService: ShellService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.shellService = shellService;
    next();
  };
}

export { router as shellsRouter };
