/**
 * Authentication API routes
 */
import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validation.js';
import { ApiError } from '../middleware/error.js';
import { checkAuth } from '../middleware/auth.js';
import { loginRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

// Request schemas
const LoginSchema = z.object({
  guid: z.string().min(1, 'GUID is required'),
});

type LoginBody = z.infer<typeof LoginSchema>;

/**
 * POST /api/auth/login
 * Login with GUID
 */
router.post('/login', loginRateLimiter, validateBody(LoginSchema), async (req, res, next) => {
  try {
    const { guid } = req.body as LoginBody;

    if (!req.authService) {
      throw ApiError.internal('Auth service not configured');
    }

    const session = await req.authService.login(guid);

    // Set session cookie
    res.cookie('session', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: new Date(session.expiresAt),
    });

    res.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid GUID') {
      next(ApiError.unauthorized('Invalid GUID'));
      return;
    }
    next(err);
  }
});

/**
 * GET /api/auth/status
 * Check authentication status
 */
router.get('/status', checkAuth, (req, res) => {
  res.json({ authenticated: req.isAuthenticated ?? false });
});

/**
 * POST /api/auth/logout
 * Logout and clear session
 */
router.post('/logout', async (req, res, next) => {
  try {
    const cookies = req.cookies as { session?: string };
    const sessionToken = cookies.session;

    if (sessionToken && req.authService) {
      await req.authService.logout(sessionToken);
    }

    // Clear session cookie
    res.cookie('session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: new Date(0),
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
