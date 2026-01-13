/**
 * Authentication middleware for API routes
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { AuthService } from '../../services/auth/AuthService.js';

// Extend Express Request to include auth service
declare module 'express-serve-static-core' {
  interface Request {
    authService?: AuthService;
    isAuthenticated?: boolean;
  }
}

/**
 * Middleware to attach auth service to request
 */
export function attachAuthService(authService: AuthService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.authService = authService;
    next();
  };
}

/**
 * Middleware to require authentication
 * Checks for session cookie and validates it
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const cookies = req.cookies as { session?: string };
  const sessionToken = cookies.session;

  if (!sessionToken) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!req.authService) {
    res.status(500).json({ error: 'Auth service not configured' });
    return;
  }

  req.authService.validateSession(sessionToken)
    .then((valid) => {
      if (!valid) {
        res.status(401).json({ error: 'Invalid or expired session' });
        return;
      }
      req.isAuthenticated = true;
      next();
    })
    .catch(() => {
      res.status(500).json({ error: 'Authentication error' });
    });
}

/**
 * Middleware to check auth status without requiring it
 * Sets req.isAuthenticated to true or false
 */
export function checkAuth(req: Request, _res: Response, next: NextFunction): void {
  const cookies = req.cookies as { session?: string };
  const sessionToken = cookies.session;

  if (!sessionToken || !req.authService) {
    req.isAuthenticated = false;
    next();
    return;
  }

  req.authService.validateSession(sessionToken)
    .then((valid) => {
      req.isAuthenticated = valid;
      next();
    })
    .catch(() => {
      req.isAuthenticated = false;
      next();
    });
}
