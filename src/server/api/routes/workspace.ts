/**
 * Workspace API routes - manages UI state that syncs across devices
 */
import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validation.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/error.js';
import type { WorkspaceStateService } from '../../services/workspace/WorkspaceStateService.js';

// Extend Express Request to include workspace service
declare module 'express-serve-static-core' {
  interface Request {
    workspaceStateService?: WorkspaceStateService;
  }
}

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Request schemas
const UpdateWorkspaceSchema = z.object({
  sidebarCollapsed: z.boolean().optional(),
  sidebarWidth: z.number().min(180).max(600).optional(),
  expandedProjectIds: z.array(z.string()).optional(),
  activeShellId: z.string().nullable().optional(),
  terminalFontSize: z.number().min(8).max(32).optional(),
  terminalTheme: z.string().optional(),
  contextSidebarPinned: z.boolean().optional(),
  contextSidebarWidth: z.number().min(280).max(500).optional(),
});

type UpdateWorkspaceBody = z.infer<typeof UpdateWorkspaceSchema>;

/**
 * Helper to get session token from request
 */
function getSessionToken(req: Request): string {
  const cookies = req.cookies as { session?: string };
  if (!cookies.session) {
    throw ApiError.unauthorized('Session token not found');
  }
  return cookies.session;
}

/**
 * GET /api/workspace
 * Get current workspace state
 */
router.get('/', async (req, res, next) => {
  try {
    if (!req.workspaceStateService) {
      throw ApiError.internal('Workspace service not configured');
    }

    const sessionToken = getSessionToken(req);
    const workspaceState = await req.workspaceStateService.get(sessionToken);
    res.json({ workspaceState });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/workspace
 * Update workspace state (partial updates supported)
 */
router.patch('/', validateBody(UpdateWorkspaceSchema), async (req, res, next) => {
  try {
    if (!req.workspaceStateService) {
      throw ApiError.internal('Workspace service not configured');
    }

    const sessionToken = getSessionToken(req);
    const body = req.body as UpdateWorkspaceBody;

    const updates: Partial<{
      sidebarCollapsed: boolean;
      sidebarWidth: number;
      expandedProjectIds: string[];
      activeShellId: string | null;
      terminalFontSize: number;
      terminalTheme: string;
      contextSidebarPinned: boolean;
      contextSidebarWidth: number;
    }> = {};

    if (body.sidebarCollapsed !== undefined) {
      updates.sidebarCollapsed = body.sidebarCollapsed;
    }
    if (body.sidebarWidth !== undefined) {
      updates.sidebarWidth = body.sidebarWidth;
    }
    if (body.expandedProjectIds !== undefined) {
      updates.expandedProjectIds = body.expandedProjectIds;
    }
    if (body.activeShellId !== undefined) {
      updates.activeShellId = body.activeShellId;
    }
    if (body.terminalFontSize !== undefined) {
      updates.terminalFontSize = body.terminalFontSize;
    }
    if (body.terminalTheme !== undefined) {
      updates.terminalTheme = body.terminalTheme;
    }
    if (body.contextSidebarPinned !== undefined) {
      updates.contextSidebarPinned = body.contextSidebarPinned;
    }
    if (body.contextSidebarWidth !== undefined) {
      updates.contextSidebarWidth = body.contextSidebarWidth;
    }

    const workspaceState = await req.workspaceStateService.update(sessionToken, updates);
    res.json({ workspaceState });
  } catch (err) {
    next(err);
  }
});

/**
 * Middleware to attach workspace state service
 */
export function attachWorkspaceStateService(workspaceStateService: WorkspaceStateService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.workspaceStateService = workspaceStateService;
    next();
  };
}

export { router as workspaceRouter };
