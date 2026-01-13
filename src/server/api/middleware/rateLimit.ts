/**
 * Rate limiting middleware for authentication endpoints
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ApiError } from './error.js';

interface RateLimitOptions {
  windowMs: number;       // Time window in milliseconds
  maxRequests: number;    // Max requests per window
  message?: string;       // Error message when rate limited
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Simple in-memory rate limiter
 * Uses IP address as the key
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later',
  } = options;

  // Store rate limit data per IP
  const store = new Map<string, RateLimitEntry>();

  // Cleanup old entries periodically
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetTime <= now) {
        store.delete(key);
      }
    }
  }, windowMs);

  // Don't prevent process from exiting
  cleanupInterval.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = getClientKey(req);
    const now = Date.now();

    let entry = store.get(key);

    // If no entry or window expired, create new entry
    if (!entry || entry.resetTime <= now) {
      entry = {
        count: 0,
        resetTime: now + windowMs,
      };
      store.set(key, entry);
    }

    // Increment request count
    entry.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetTime / 1000)));

    // Check if over limit
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));

      next(ApiError.tooManyRequests(message));
      return;
    }

    next();
  };
}

/**
 * Get client identifier for rate limiting
 * Uses X-Forwarded-For if behind proxy, otherwise IP
 */
function getClientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const firstIp = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return firstIp?.trim() ?? req.ip ?? 'unknown';
  }
  return req.ip ?? 'unknown';
}

/**
 * Pre-configured rate limiter for login endpoint
 * 10 attempts per 15 minutes
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  message: 'Too many login attempts, please try again later',
});
