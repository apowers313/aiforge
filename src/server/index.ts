/**
 * Server entry point for AIForge
 * Express server with REST API for projects, shells, and authentication
 * WebSocket server for real-time terminal I/O
 */
import { createServer, type Server as HttpServer } from 'node:http';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { getConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { initStorage, type Storage } from './storage/index.js';
import { AuthService } from './services/auth/AuthService.js';
import { ProjectService } from './services/project/ProjectService.js';
import { ShellService } from './services/shell/ShellService.js';
import { FilesystemService } from './services/filesystem/FilesystemService.js';
import { WorkspaceStateService } from './services/workspace/WorkspaceStateService.js';
import { PtyPool } from './services/pty/index.js';
import { attachAuthService } from './api/middleware/auth.js';
import { errorHandler, notFoundHandler } from './api/middleware/error.js';
import { createApiRouter } from './api/routes/index.js';
import { createWebSocketServer } from './websocket/index.js';
import type { ServerConfig } from '../shared/types/index.js';

const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

interface AppResult {
  app: Express;
  server: HttpServer;
  config: ServerConfig;
  storage: Storage;
  ptyPool: PtyPool;
  shellService: ShellService;
}

export async function createApp(): Promise<AppResult> {
  const config = getConfig();

  // Initialize storage
  const storage = await initStorage();

  // Initialize PTY pool for real terminal sessions with scrollback persistence
  const ptyPool = new PtyPool({
    scrollbackStore: storage.scrollback,
  });

  // Initialize services
  const authService = new AuthService({
    authGuid: config.authGuid,
    sessionStore: storage.sessions,
    sessionMaxAge: SESSION_MAX_AGE,
  });

  const projectService = new ProjectService({
    projectStore: storage.projects,
    shellStore: storage.shells,
  });

  const shellService = new ShellService({
    shellStore: storage.shells,
    projectStore: storage.projects,
    ptyPool,
  });

  const filesystemService = new FilesystemService();

  const workspaceStateService = new WorkspaceStateService({
    workspaceStateStore: storage.workspaceStates,
    projectStore: storage.projects,
    shellStore: storage.shells,
  });

  // Create Express app
  const app = express();

  // Middleware
  app.use(cors({
    origin: true,
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  // Attach auth service to all requests
  app.use(attachAuthService(authService));

  // API routes
  app.use('/api', createApiRouter({
    projectService,
    shellService,
    filesystemService,
    workspaceStateService,
  }));

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Create HTTP server for both Express and WebSocket
  const server = createServer(app);

  return { app, server, config, storage, ptyPool, shellService };
}

export async function startServer(): Promise<void> {
  const { server, config, ptyPool, shellService } = await createApp();

  // Create WebSocket server for terminal I/O
  createWebSocketServer({
    server,
    ptyManager: ptyPool.manager,
    path: '/ws/terminal',
  });

  // Cleanup orphaned PTY sessions on startup
  void shellService.cleanupOrphans();

  // Handle graceful shutdown
  const shutdown = (): void => {
    logger.info('Shutting down server...');
    shellService.shutdown();
    server.close(() => {
      logger.info('Server stopped');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(config.port, config.host, () => {
    logger.info({ port: config.port, host: config.host }, 'AIForge server started');
    logger.info({ path: '/ws/terminal' }, 'WebSocket server ready');

    if (!config.authGuid) {
      logger.warn('No auth GUID configured. Run "npm run generate-guid" to create one.');
    }
  });
}

// Start server if running directly
// Note: Using || instead of ?? because we need to check for false, not just null/undefined
const isDirectRun = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts'); // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing
if (isDirectRun) {
  startServer().catch((err: unknown) => {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  });
}
