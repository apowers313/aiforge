/**
 * Worktrees API routes
 * Phase 5: Worktree-specific endpoints (not project-scoped)
 * Phase 6: Shell-worktree association endpoints
 * Phase 7: Worktree URL endpoints
 */
import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { validateBody, validateParams } from '../middleware/validation.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/error.js';
import type { WorktreeMetadataStore } from '../../storage/stores/WorktreeMetadataStore.js';
import type { WorktreeUrlsStore } from '../../storage/stores/WorktreeUrlsStore.js';
import type { ShellService } from '../../services/shell/ShellService.js';
import type { FileTreeService } from '../../services/filesystem/FileTreeService.js';
import type { WorktreeMetadata, CustomUrl } from '@shared/types/index.js';

// Extend Express Request to include worktree services
declare module 'express-serve-static-core' {
  interface Request {
    worktreeMetadataStore?: WorktreeMetadataStore;
    worktreeUrlsStore?: WorktreeUrlsStore;
    shellService?: ShellService;
    fileTreeService?: FileTreeService;
  }
}

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Request schemas
const WorktreePathParamsSchema = z.object({
  worktreePath: z.string().min(1, 'Worktree path is required'),
});

const UpdateWorktreeMetadataSchema = z.object({
  done: z.boolean({
    required_error: 'done is required',
    invalid_type_error: 'done must be a boolean',
  }),
  projectId: z.string().uuid('Invalid project ID').optional(),
});

// Phase 7: URL schemas
const AddUrlSchema = z.object({
  name: z.string().min(1, 'URL name is required'),
  url: z.string().url('Invalid URL format'),
});

const UrlParamsSchema = z.object({
  worktreePath: z.string().min(1, 'Worktree path is required'),
  urlId: z.string().uuid('Invalid URL ID'),
});

type WorktreePathParams = z.infer<typeof WorktreePathParamsSchema>;
type UpdateWorktreeMetadataBody = z.infer<typeof UpdateWorktreeMetadataSchema>;
type AddUrlBody = z.infer<typeof AddUrlSchema>;
type UrlParams = z.infer<typeof UrlParamsSchema>;

/**
 * PATCH /api/worktrees/:worktreePath
 * Update worktree metadata (done status)
 */
router.patch(
  '/:worktreePath',
  validateParams(WorktreePathParamsSchema),
  validateBody(UpdateWorktreeMetadataSchema),
  async (req, res, next) => {
    try {
      if (!req.worktreeMetadataStore) {
        throw ApiError.internal('Worktree metadata store not configured');
      }

      const { worktreePath: encodedPath } = req.params as WorktreePathParams;
      const { done, projectId } = req.body as UpdateWorktreeMetadataBody;

      // Decode the worktree path
      const worktreePath = decodeURIComponent(encodedPath);

      // Get existing metadata or create new
      let metadata = await req.worktreeMetadataStore.getByWorktreePath(worktreePath);

      if (metadata) {
        // Update existing metadata
        const now = new Date().toISOString();
        metadata = await req.worktreeMetadataStore.update(worktreePath, {
          done,
          updatedAt: now,
        });
      } else {
        // Create new metadata (requires projectId)
        const now = new Date().toISOString();
        const newMetadata: WorktreeMetadata = {
          worktreePath,
          projectId: projectId ?? '',
          done,
          createdAt: now,
          updatedAt: now,
        };
        await req.worktreeMetadataStore.upsert(newMetadata);
        metadata = newMetadata;
      }

      res.json({ success: true, metadata });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/worktrees/:worktreePath/shells
 * Get all shells for a worktree
 * Phase 6: Shell-worktree association
 */
router.get(
  '/:worktreePath/shells',
  validateParams(WorktreePathParamsSchema),
  async (req, res, next) => {
    try {
      if (!req.shellService) {
        throw ApiError.internal('Shell service not configured');
      }

      const { worktreePath: encodedPath } = req.params as WorktreePathParams;
      const worktreePath = decodeURIComponent(encodedPath);

      const shells = await req.shellService.getByWorktreePath(worktreePath);
      res.json({ shells });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// Phase 7: Worktree files endpoint
// ============================================================================

/**
 * GET /api/worktrees/:worktreePath/files
 * Get file tree for a worktree
 */
router.get(
  '/:worktreePath/files',
  validateParams(WorktreePathParamsSchema),
  async (req, res, next) => {
    try {
      if (!req.fileTreeService) {
        throw ApiError.internal('File tree service not configured');
      }

      const { worktreePath: encodedPath } = req.params as WorktreePathParams;
      const worktreePath = decodeURIComponent(encodedPath);

      const gitModifiedOnly = req.query.gitModifiedOnly !== 'false';
      const files = await req.fileTreeService.getFileTree(worktreePath, { gitModifiedOnly });

      res.json({ files, gitModifiedOnly });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// Phase 7: Worktree URL endpoints
// ============================================================================

/**
 * GET /api/worktrees/:worktreePath/urls
 * Get all URLs for a worktree
 */
router.get(
  '/:worktreePath/urls',
  validateParams(WorktreePathParamsSchema),
  async (req, res, next) => {
    try {
      if (!req.worktreeUrlsStore) {
        throw ApiError.internal('Worktree URLs store not configured');
      }

      const { worktreePath: encodedPath } = req.params as WorktreePathParams;
      const worktreePath = decodeURIComponent(encodedPath);

      const urls = await req.worktreeUrlsStore.getByWorktreePath(worktreePath);
      res.json({ urls });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/worktrees/:worktreePath/urls
 * Add a URL to a worktree
 */
router.post(
  '/:worktreePath/urls',
  validateParams(WorktreePathParamsSchema),
  validateBody(AddUrlSchema),
  async (req, res, next) => {
    try {
      if (!req.worktreeUrlsStore) {
        throw ApiError.internal('Worktree URLs store not configured');
      }

      const { worktreePath: encodedPath } = req.params as WorktreePathParams;
      const { name, url } = req.body as AddUrlBody;
      const worktreePath = decodeURIComponent(encodedPath);

      const newUrl: CustomUrl = {
        id: randomUUID(),
        name,
        url,
        createdAt: new Date().toISOString(),
      };

      await req.worktreeUrlsStore.add(worktreePath, newUrl);

      res.status(201).json({ url: newUrl });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/worktrees/:worktreePath/urls/:urlId
 * Delete a URL from a worktree
 */
router.delete(
  '/:worktreePath/urls/:urlId',
  validateParams(UrlParamsSchema),
  async (req, res, next) => {
    try {
      if (!req.worktreeUrlsStore) {
        throw ApiError.internal('Worktree URLs store not configured');
      }

      const { worktreePath: encodedPath, urlId } = req.params as UrlParams;
      const worktreePath = decodeURIComponent(encodedPath);

      const deleted = await req.worktreeUrlsStore.delete(worktreePath, urlId);

      if (!deleted) {
        throw ApiError.notFound('URL not found');
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Middleware to attach worktree metadata store
 */
export function attachWorktreeMetadataStore(store: WorktreeMetadataStore): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.worktreeMetadataStore = store;
    next();
  };
}

/**
 * Middleware to attach worktree URLs store
 * Phase 7: For URL endpoints
 */
export function attachWorktreeUrlsStore(store: WorktreeUrlsStore): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.worktreeUrlsStore = store;
    next();
  };
}

export { router as worktreesRouter };
