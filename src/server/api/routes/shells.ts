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
import type { ShellContextService } from '../../services/shell/ShellContextService.js';

// Extend Express Request to include shell service and shell context service
declare module 'express-serve-static-core' {
  interface Request {
    shellService?: ShellService;
    shellContextService?: ShellContextService;
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

const TodoIdParamsSchema = z.object({
  id: z.string().uuid('Invalid shell ID'),
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

type CreateShellBody = z.infer<typeof CreateShellSchema>;
type UpdateShellBody = z.infer<typeof UpdateShellSchema>;
type ProjectIdParams = z.infer<typeof ProjectIdParamsSchema>;
type ShellIdParams = z.infer<typeof ShellIdParamsSchema>;
type TodoIdParams = z.infer<typeof TodoIdParamsSchema>;
type CreateTodoBody = z.infer<typeof CreateTodoSchema>;
type UpdateTodoBody = z.infer<typeof UpdateTodoSchema>;
type UpdateNotesBody = z.infer<typeof UpdateNotesSchema>;
type ReorderTodosBody = z.infer<typeof ReorderTodosSchema>;

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
    // Create shell in inactive state - client opens via WebSocket session.open
    const shell = await req.shellService.create(projectId, name, type);
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
 * Restart a shell (stops PTY process - client re-opens via WebSocket session.open)
 */
router.post('/shells/:id/restart', validateParams(ShellIdParamsSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }

    const { id } = req.params as ShellIdParams;

    // Stop the shell (client re-opens via WebSocket session.open message)
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

// =============================================================================
// Shell Context Routes (TODOs and Notes)
// =============================================================================

/**
 * GET /api/shells/:id/context
 * Get shell context (todos and notes)
 */
router.get('/shells/:id/context', validateParams(ShellIdParamsSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }
    if (!req.shellContextService) {
      throw ApiError.internal('Shell context service not configured');
    }

    const { id } = req.params as ShellIdParams;

    // Verify shell exists
    const shell = await req.shellService.getById(id);
    if (!shell) {
      throw ApiError.notFound('Shell not found');
    }

    const context = await req.shellContextService.getContext(id);
    res.json(context);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/shells/:id/todos
 * Add a TODO to a shell
 */
router.post('/shells/:id/todos', validateParams(ShellIdParamsSchema), validateBody(CreateTodoSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }
    if (!req.shellContextService) {
      throw ApiError.internal('Shell context service not configured');
    }

    const { id } = req.params as ShellIdParams;
    const { text } = req.body as CreateTodoBody;

    // Verify shell exists
    const shell = await req.shellService.getById(id);
    if (!shell) {
      throw ApiError.notFound('Shell not found');
    }

    const todo = await req.shellContextService.addTodo(id, text);
    res.status(201).json(todo);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/shells/:id/todos/clear-completed
 * Clear all completed TODOs
 * NOTE: Must be before :todoId routes to avoid matching
 */
router.post('/shells/:id/todos/clear-completed', validateParams(ShellIdParamsSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }
    if (!req.shellContextService) {
      throw ApiError.internal('Shell context service not configured');
    }

    const { id } = req.params as ShellIdParams;

    // Verify shell exists
    const shell = await req.shellService.getById(id);
    if (!shell) {
      throw ApiError.notFound('Shell not found');
    }

    const cleared = await req.shellContextService.clearCompleted(id);
    res.json({ cleared });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/shells/:id/todos/reorder
 * Reorder TODOs
 * NOTE: Must be before :todoId routes to avoid matching
 */
router.put('/shells/:id/todos/reorder', validateParams(ShellIdParamsSchema), validateBody(ReorderTodosSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }
    if (!req.shellContextService) {
      throw ApiError.internal('Shell context service not configured');
    }

    const { id } = req.params as ShellIdParams;
    const { todoIds } = req.body as ReorderTodosBody;

    // Verify shell exists
    const shell = await req.shellService.getById(id);
    if (!shell) {
      throw ApiError.notFound('Shell not found');
    }

    await req.shellContextService.reorderTodos(id, todoIds);
    const context = await req.shellContextService.getContext(id);
    res.json(context);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/shells/:id/todos/:todoId
 * Update a TODO
 */
router.put('/shells/:id/todos/:todoId', validateParams(TodoIdParamsSchema), validateBody(UpdateTodoSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }
    if (!req.shellContextService) {
      throw ApiError.internal('Shell context service not configured');
    }

    const { id, todoId } = req.params as TodoIdParams;
    const body = req.body as UpdateTodoBody;

    // Verify shell exists
    const shell = await req.shellService.getById(id);
    if (!shell) {
      throw ApiError.notFound('Shell not found');
    }

    // Build updates object with only defined values (filter out undefined)
    const updates: { text?: string; completed?: boolean } = {};
    if (body.text !== undefined) {
      updates.text = body.text;
    }
    if (body.completed !== undefined) {
      updates.completed = body.completed;
    }

    const todo = await req.shellContextService.updateTodo(id, todoId, updates);
    if (!todo) {
      throw ApiError.notFound('TODO not found');
    }

    res.json(todo);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/shells/:id/todos/:todoId
 * Delete a TODO
 */
router.delete('/shells/:id/todos/:todoId', validateParams(TodoIdParamsSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }
    if (!req.shellContextService) {
      throw ApiError.internal('Shell context service not configured');
    }

    const { id, todoId } = req.params as TodoIdParams;

    // Verify shell exists
    const shell = await req.shellService.getById(id);
    if (!shell) {
      throw ApiError.notFound('Shell not found');
    }

    const deleted = await req.shellContextService.deleteTodo(id, todoId);
    if (!deleted) {
      throw ApiError.notFound('TODO not found');
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/shells/:id/notes
 * Update shell notes
 */
router.patch('/shells/:id/notes', validateParams(ShellIdParamsSchema), validateBody(UpdateNotesSchema), async (req, res, next) => {
  try {
    if (!req.shellService) {
      throw ApiError.internal('Shell service not configured');
    }
    if (!req.shellContextService) {
      throw ApiError.internal('Shell context service not configured');
    }

    const { id } = req.params as ShellIdParams;
    const { notes } = req.body as UpdateNotesBody;

    // Verify shell exists
    const shell = await req.shellService.getById(id);
    if (!shell) {
      throw ApiError.notFound('Shell not found');
    }

    await req.shellContextService.updateNotes(id, notes);
    const context = await req.shellContextService.getContext(id);
    res.json(context);
  } catch (err) {
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

/**
 * Middleware to attach shell context service
 */
export function attachShellContextService(shellContextService: ShellContextService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.shellContextService = shellContextService;
    next();
  };
}

export { router as shellsRouter };
