/**
 * Error handling middleware for API routes
 */
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger.js';

/**
 * Custom API error class
 */
export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code ?? 'UNKNOWN_ERROR';
    this.name = 'ApiError';
  }

  static badRequest(message: string, code?: string): ApiError {
    return new ApiError(400, message, code ?? 'BAD_REQUEST');
  }

  static unauthorized(message: string, code?: string): ApiError {
    return new ApiError(401, message, code ?? 'UNAUTHORIZED');
  }

  static notFound(message: string, code?: string): ApiError {
    return new ApiError(404, message, code ?? 'NOT_FOUND');
  }

  static conflict(message: string, code?: string): ApiError {
    return new ApiError(409, message, code ?? 'CONFLICT');
  }

  static internal(message: string, code?: string): ApiError {
    return new ApiError(500, message, code ?? 'INTERNAL_ERROR');
  }

  static tooManyRequests(message: string, code?: string): ApiError {
    return new ApiError(429, message, code ?? 'TOO_MANY_REQUESTS');
  }
}

/**
 * Error handling middleware
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: err.message,
      message: err.message,
      code: err.code,
    });
    return;
  }

  // Log unexpected errors
  logger.error({ err }, 'Unexpected error');

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
  });
}
