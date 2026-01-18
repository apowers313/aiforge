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
import type { FileTreeService } from '../../services/filesystem/FileTreeService.js';
import { join, normalize, relative } from 'node:path';

// Extend Express Request to include project services
declare module 'express-serve-static-core' {
  interface Request {
    projectService?: ProjectService;
    projectMetadataService?: ProjectMetadataService;
    projectUrlsService?: ProjectUrlsService;
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

type CreateProjectBody = z.infer<typeof CreateProjectSchema>;
type UpdateProjectBody = z.infer<typeof UpdateProjectSchema>;
type IdParams = z.infer<typeof IdParamsSchema>;
type UrlIdParams = z.infer<typeof UrlIdParamsSchema>;
type CreateUrlBody = z.infer<typeof CreateUrlSchema>;
type FilePathParams = z.infer<typeof FilePathParamsSchema>;
type UpdateUrlBody = z.infer<typeof UpdateUrlSchema>;

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

export { router as projectsRouter };
