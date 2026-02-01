/**
 * Test server utilities for integration testing
 */
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { createStorage, type Storage } from '@server/storage/index.js';
import { AuthService } from '@server/services/auth/AuthService.js';
import { ProjectService } from '@server/services/project/ProjectService.js';
import { ProjectMetadataService } from '@server/services/project/ProjectMetadataService.js';
import { ProjectUrlsService } from '@server/services/project/ProjectUrlsService.js';
import { WorktreeService } from '@server/services/project/WorktreeService.js';
import { ShellService } from '@server/services/shell/ShellService.js';
import { ProjectContextService } from '@server/services/project/ProjectContextService.js';
import { FilesystemService } from '@server/services/filesystem/FilesystemService.js';
import { FileTreeService } from '@server/services/filesystem/FileTreeService.js';
import { WorkspaceStateService } from '@server/services/workspace/WorkspaceStateService.js';
import { attachAuthService } from '@server/api/middleware/auth.js';
import { errorHandler, notFoundHandler } from '@server/api/middleware/error.js';
import { createApiRouter } from '@server/api/routes/index.js';

export interface TestServerOptions {
  authGuid?: string;
}

export interface TestServer {
  app: Express;
  tempDir: string;
  authCookie: string;
  storage: Storage;
  authService: AuthService;
  projectService: ProjectService;
  projectMetadataService: ProjectMetadataService;
  projectUrlsService: ProjectUrlsService;
  worktreeService: WorktreeService;
  shellService: ShellService;
  projectContextService: ProjectContextService;
  filesystemService: FilesystemService;
  fileTreeService: FileTreeService;
  workspaceStateService: WorkspaceStateService;
  close: () => Promise<void>;
  createTestProject: () => Promise<string>;
  login: (guid?: string) => Promise<string>;
}

interface ProjectResponse {
  project: {
    id: string;
    name: string;
    path: string;
  };
}

const DEFAULT_AUTH_GUID = 'test-guid';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Create a test server with isolated storage
 */
export async function createTestServer(options: TestServerOptions = {}): Promise<TestServer> {
  const authGuid = options.authGuid ?? DEFAULT_AUTH_GUID;

  // Create temp directory for test data
  const tempDir = await mkdtemp(join(tmpdir(), 'aiforge-test-'));
  const dataDir = join(tempDir, 'data');
  await mkdir(dataDir, { recursive: true });

  // Initialize storage
  const storage = createStorage(dataDir);

  // Initialize services
  const authService = new AuthService({
    authGuid,
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
  });

  const projectContextService = new ProjectContextService({
    projectContextStore: storage.projectContext,
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
    worktreeService,
    shellService,
    projectContextService,
    filesystemService,
    fileTreeService,
    workspaceStateService,
    worktreeMetadataStore: storage.worktreeMetadata,
  }));

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Helper to login and get cookie
  async function login(guid = authGuid): Promise<string> {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ guid });

    const setCookie = response.headers['set-cookie'] as string[] | undefined;
    if (!setCookie || !Array.isArray(setCookie)) {
      throw new Error('Login failed - no cookie set');
    }

    const cookie = setCookie[0];
    if (!cookie) {
      throw new Error('Login failed - empty cookie');
    }

    return cookie.split(';')[0] ?? '';
  }

  // Login and get auth cookie
  const authCookie = await login();

  // Helper to create a test project
  async function createTestProject(): Promise<string> {
    // Create a real directory for the project
    const projectDir = join(tempDir, `test-project-${String(Date.now())}`);
    await mkdir(projectDir, { recursive: true });

    const response = await request(app)
      .post('/api/projects')
      .set('Cookie', authCookie)
      .send({ path: projectDir });

    const body = response.body as ProjectResponse;
    return body.project.id;
  }

  return {
    app,
    tempDir,
    authCookie,
    storage,
    authService,
    projectService,
    projectMetadataService,
    projectUrlsService,
    worktreeService,
    shellService,
    projectContextService,
    filesystemService,
    fileTreeService,
    workspaceStateService,
    login,
    createTestProject,
    close: async (): Promise<void> => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

/**
 * Helper to create test files in a directory
 */
export async function createTestFiles(dir: string, files: Record<string, string>): Promise<void> {
  for (const [name, content] of Object.entries(files)) {
    const filePath = join(dir, name);
    const fileDir = join(filePath, '..');
    await mkdir(fileDir, { recursive: true });
    await writeFile(filePath, content);
  }
}

/**
 * Helper to create test subdirectories
 */
export async function createTestDirs(dir: string, dirs: string[]): Promise<void> {
  for (const subdir of dirs) {
    await mkdir(join(dir, subdir), { recursive: true });
  }
}
