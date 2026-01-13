/**
 * Filesystem API routes
 */
import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validation.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/error.js';
import type { FilesystemService } from '../../services/filesystem/FilesystemService.js';

// Extend Express Request to include filesystem service
declare module 'express-serve-static-core' {
  interface Request {
    filesystemService?: FilesystemService;
  }
}

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Request schemas
const BrowseQuerySchema = z.object({
  path: z.string().min(1, 'Path is required'),
});

const ValidateQuerySchema = z.object({
  path: z.string().min(1, 'Path is required'),
});

type BrowseQuery = z.infer<typeof BrowseQuerySchema>;
type ValidateQuery = z.infer<typeof ValidateQuerySchema>;

/**
 * GET /api/filesystem/browse
 * Browse a directory
 */
router.get('/browse', validateQuery(BrowseQuerySchema), async (req, res, next) => {
  try {
    if (!req.filesystemService) {
      throw ApiError.internal('Filesystem service not configured');
    }

    const { path } = req.query as BrowseQuery;
    const result = await req.filesystemService.browse(path);
    res.json(result);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'Path does not exist' || err.message === 'Path is not a directory') {
        next(ApiError.badRequest(err.message));
        return;
      }
    }
    next(err);
  }
});

/**
 * GET /api/filesystem/home
 * Get the user's home directory path
 */
router.get('/home', (req, res, next) => {
  try {
    if (!req.filesystemService) {
      throw ApiError.internal('Filesystem service not configured');
    }

    const homePath = req.filesystemService.getHomeDirectory();
    res.json({ path: homePath });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/filesystem/validate
 * Validate a path
 */
router.get('/validate', validateQuery(ValidateQuerySchema), async (req, res, next) => {
  try {
    if (!req.filesystemService) {
      throw ApiError.internal('Filesystem service not configured');
    }

    const { path } = req.query as ValidateQuery;
    const result = await req.filesystemService.validate(path);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Middleware to attach filesystem service
 */
export function attachFilesystemService(filesystemService: FilesystemService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.filesystemService = filesystemService;
    next();
  };
}

export { router as filesystemRouter };
