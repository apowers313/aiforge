/**
 * Server entry point for AIForge
 * Express server with REST API for projects, shells, and authentication
 * WebSocket server for real-time terminal I/O
 */
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { getConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { initStorage, type Storage } from './storage/index.js';
import { AuthService } from './services/auth/AuthService.js';
import { ProjectService } from './services/project/ProjectService.js';
import { ProjectMetadataService } from './services/project/ProjectMetadataService.js';
import { ProjectUrlsService } from './services/project/ProjectUrlsService.js';
import { WorktreeService } from './services/project/WorktreeService.js';
import { ShellService } from './services/shell/ShellService.js';
import { ShellSessionManager } from './services/shell/ShellSessionManager.js';
import { ProjectContextService } from './services/project/ProjectContextService.js';
import { FilesystemService } from './services/filesystem/FilesystemService.js';
import { FileTreeService } from './services/filesystem/FileTreeService.js';
import { WorkspaceStateService } from './services/workspace/WorkspaceStateService.js';
import { PtyPool } from './services/pty/index.js';
import { attachAuthService } from './api/middleware/auth.js';
import { errorHandler, notFoundHandler } from './api/middleware/error.js';
import { createApiRouter, setWebSocketReady } from './api/routes/index.js';
import { createWebSocketServer } from './websocket/index.js';
import type { ServerConfig } from '../shared/types/index.js';

const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

interface AppResult {
  app: Express;
  server: HttpServer | HttpsServer;
  config: ServerConfig;
  storage: Storage;
  ptyPool: PtyPool;
  shellService: ShellService;
  sessionManager: ShellSessionManager;
  isHttps: boolean;
}

export async function createApp(): Promise<AppResult> {
  const config = getConfig();

  // Initialize storage
  const storage = await initStorage();

  // Initialize PTY pool for real terminal sessions with scrollback persistence
  // Enable persistent daemons so shells survive server restarts
  const ptyPoolOptions: import('./services/pty/PtyPool.js').PtyPoolOptions = {
    scrollbackStore: storage.scrollback,
    usePersistentDaemons: true,
  };
  if (config.remoteLoggerUrl) {
    ptyPoolOptions.remoteLoggerUrl = config.remoteLoggerUrl;
  }
  const ptyPool = new PtyPool(ptyPoolOptions);

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

  const projectMetadataService = new ProjectMetadataService();

  const projectUrlsService = new ProjectUrlsService({
    projectUrlsStore: storage.projectUrls,
  });

  const worktreeService = new WorktreeService({
    projectStore: storage.projects,
  });

  const shellService = new ShellService({
    shellStore: storage.shells,
    projectStore: storage.projects,
    ptyPool,
  });

  const projectContextService = new ProjectContextService({
    projectContextStore: storage.projectContext,
  });

  // Initialize ShellSessionManager for terminal session orchestration
  const sessionManager = new ShellSessionManager({
    ptyPool,
    shellStore: storage.shells,
  });

  const filesystemService = new FilesystemService();

  const fileTreeService = new FileTreeService();

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
    projectMetadataService,
    projectUrlsService,
    projectContextService,
    worktreeService,
    shellService,
    filesystemService,
    fileTreeService,
    workspaceStateService,
    worktreeMetadataStore: storage.worktreeMetadata,
    worktreeUrlsStore: storage.worktreeUrls,
  }));

  // Serve static frontend assets in production
  // The client build outputs to dist/client, which is sibling to dist/server
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const clientDistPath = join(__dirname, '..', '..', 'client');

  if (existsSync(clientDistPath)) {
    // Serve static files from the client build directory
    app.use(express.static(clientDistPath));

    // For SPA routing: serve index.html for any non-API, non-WebSocket routes
    // Express 5 requires named parameter or /* pattern instead of bare *
    app.get('/{*splat}', (req, res, next) => {
      // Skip API and WebSocket paths
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        next();
        return;
      }
      const indexPath = join(clientDistPath, 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
        return;
      }
      next();
    });
  }

  // Error handling (must be after static file serving)
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Create HTTP or HTTPS server based on config
  const { httpsCert, httpsKey } = config;
  const isHttps = !!(httpsCert && httpsKey);
  let server: HttpServer | HttpsServer;

  if (httpsCert && httpsKey) {
    const httpsOptions = {
      cert: readFileSync(httpsCert),
      key: readFileSync(httpsKey),
    };
    server = createHttpsServer(httpsOptions, app);
  } else {
    server = createHttpServer(app);
  }

  return { app, server, config, storage, ptyPool, shellService, sessionManager, isHttps };
}

export async function startServer(): Promise<void> {
  const { server, config, shellService, sessionManager, isHttps } = await createApp();

  // Create WebSocket server for terminal I/O
  createWebSocketServer({
    server,
    sessionManager,
    path: '/ws/terminal',
  });

  // Mark WebSocket as ready for health checks
  setWebSocketReady(true);

  // Reconnect to persistent daemon sessions that survived restart
  const reconnected = await shellService.reconnectDaemons();
  if (reconnected > 0) {
    logger.info({ count: reconnected }, 'Reconnected to persistent shell daemons');
  }

  // Start reconciliation loop (30 second interval)
  sessionManager.startReconciliationLoop(30000);

  // Handle graceful shutdown
  const shutdown = (): void => {
    logger.info('Shutting down server...');
    setWebSocketReady(false);
    sessionManager.shutdown();
    shellService.shutdown();
    server.close(() => {
      logger.info('Server stopped');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(config.port, config.host, () => {
    const protocol = isHttps ? 'https' : 'http';
    const wsProtocol = isHttps ? 'wss' : 'ws';
    const url = `${protocol}://${config.host}:${String(config.port)}`;
    logger.info({ port: config.port, host: config.host, protocol, url }, 'AIForge server started');
    logger.info({ path: '/ws/terminal', protocol: wsProtocol }, 'WebSocket server ready');

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
