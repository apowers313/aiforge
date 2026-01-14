/**
 * Health check API routes
 *
 * Provides endpoints for checking server health and connectivity status.
 */
import { Router, type Request, type Response } from 'express';

export const healthRouter = Router();

/**
 * Track whether WebSocket server is ready.
 * This is set by the server startup code after WebSocket is initialized.
 */
let websocketReady = false;

/**
 * Mark WebSocket server as ready.
 * Called by server startup after WebSocket server is created.
 */
export function setWebSocketReady(ready: boolean): void {
  websocketReady = ready;
}

/**
 * Check if WebSocket server is ready (for testing).
 */
export function isWebSocketReady(): boolean {
  return websocketReady;
}

/**
 * GET /api/health
 *
 * Returns server health and connectivity information.
 * Useful for clients to verify the server is reachable and operational.
 */
healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: websocketReady ? 'ok' : 'starting',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      websocket: websocketReady,
      api: true,
    },
  });
});

/**
 * GET /api/health/ping
 *
 * Simple ping endpoint for basic connectivity check.
 * Returns minimal response for low-latency health checks.
 */
healthRouter.get('/ping', (_req: Request, res: Response) => {
  res.send('pong');
});
