/**
 * Request validation middleware
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from './error.js';

/**
 * Validate request body against a Zod schema
 */
export function validateBody<T>(schema: z.ZodSchema<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));

      const firstError = errors[0];
      next(new ApiError(400, `Validation error: ${firstError?.message ?? 'Invalid input'}`, 'VALIDATION_ERROR'));
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Validate request query parameters against a Zod schema
 * Note: Does not modify req.query as it may be read-only in some Express configurations.
 * Route handlers should cast req.query to the expected type after validation.
 */
export function validateQuery<T>(schema: z.ZodSchema<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));

      const firstError = errors[0];
      next(new ApiError(400, `Validation error: ${firstError?.message ?? 'Invalid input'}`, 'VALIDATION_ERROR'));
      return;
    }

    // Don't reassign req.query as it may be read-only
    // Route handlers cast req.query to the schema type
    next();
  };
}

/**
 * Validate request params against a Zod schema
 * Note: Does not modify req.params as it may be read-only in some Express configurations.
 * Route handlers should cast req.params to the expected type after validation.
 */
export function validateParams<T>(schema: z.ZodSchema<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));

      const firstError = errors[0];
      next(new ApiError(400, `Validation error: ${firstError?.message ?? 'Invalid input'}`, 'VALIDATION_ERROR'));
      return;
    }

    // Don't reassign req.params as it may be read-only
    // Route handlers cast req.params to the schema type
    next();
  };
}
