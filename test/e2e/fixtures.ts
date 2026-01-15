/**
 * Playwright test fixtures for E2E test isolation
 *
 * Uses servherd to manage test servers with dynamic port allocation.
 * Each test file gets a fresh server state via restart.
 */
import { test as base } from '@playwright/test';
import { execSync } from 'node:child_process';
import { rmSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const TEST_GUID = 'e2e-test-guid';
const DATA_DIR = join(process.cwd(), 'tmp', 'e2e-data');

interface TestFixtures {
  testGuid: string;
}

interface WorkerFixtures {
  serverBaseURL: string;
}

interface ServherdInfo {
  success: boolean;
  data?: {
    port: number;
    status: string;
  };
}

/**
 * Run a command and return stdout
 */
function run(cmd: string): string {
  return execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8' }).trim();
}

/**
 * Get server info from servherd
 */
function getServerInfo(name: string): { port: number; status: string } | null {
  try {
    const output = run(`servherd info ${name} --json`);
    const result = JSON.parse(output) as ServherdInfo;
    // servherd returns { success: true, data: { port, status, ... } }
    if (result.success && result.data) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Wait for server to be ready by polling the health endpoint
 */
async function waitForServer(url: string, timeoutMs = 60000): Promise<void> {
  const start = Date.now();
  let lastError = '';
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${url}/api/auth/status`);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${String(response.status)}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server at ${url} did not become ready within ${String(timeoutMs)}ms. Last error: ${lastError}`);
}

/**
 * Clean and recreate the data directory
 */
function resetDataDirectory(): void {
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
  mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Clean up orphaned PTY daemon sockets and processes.
 * This ensures test isolation by removing any persistent daemons from previous runs.
 */
function cleanupDaemonSockets(): void {
  const tmpDir = '/tmp';
  const socketPattern = /^ai-ide-pty-.*\.sock$/;

  try {
    const files = readdirSync(tmpDir);
    for (const file of files) {
      if (socketPattern.test(file)) {
        const socketPath = join(tmpDir, file);
        try {
          unlinkSync(socketPath);
        } catch {
          // Socket may be in use or already removed
        }
      }
    }
  } catch {
    // /tmp not readable - unlikely but handle gracefully
  }

  // Kill any orphaned daemon processes
  // The daemons are spawned with 'pty-daemon' in the command
  try {
    execSync('pkill -f "pty-daemon" 2>/dev/null || true', { encoding: 'utf-8' });
  } catch {
    // No matching processes or pkill failed
  }
}

/**
 * Extended test with server fixture that provides isolated environment per worker
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Server fixture - manages servherd servers per worker (test file)
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, no-empty-pattern
  serverBaseURL: [async ({}: {}, use): Promise<void> => {
    // Stop servers first to ensure clean state
    try { run('servherd stop e2e-backend'); } catch { /* ignore if not running */ }
    try { run('servherd stop e2e-frontend'); } catch { /* ignore if not running */ }

    // Clean up any orphaned daemon processes and sockets from previous runs
    cleanupDaemonSockets();

    // Reset data directory while servers are stopped
    resetDataDirectory();

    // Start fresh servers
    run('npm run e2e:backend');
    run('npm run e2e:frontend');

    // Give servers a moment to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get the frontend URL from servherd
    const frontendInfo = getServerInfo('e2e-frontend');
    if (!frontendInfo) {
      throw new Error('Failed to get e2e-frontend server info');
    }

    const baseURL = `http://localhost:${String(frontendInfo.port)}`;

    // Wait for servers to be ready
    await waitForServer(baseURL);

    // Provide the baseURL to tests
    await use(baseURL);

    // Cleanup: Stop servers after all tests in this worker complete
    try { run('servherd stop e2e-backend'); } catch { /* ignore if not running */ }
    try { run('servherd stop e2e-frontend'); } catch { /* ignore if not running */ }

    // Clean up any lingering daemon processes
    cleanupDaemonSockets();
  }, { scope: 'worker' }],

  // Override baseURL to use the server's URL
  baseURL: async ({ serverBaseURL }, use) => {
    await use(serverBaseURL);
  },

  // Test GUID constant
  testGuid: TEST_GUID,
});

export { expect } from '@playwright/test';
