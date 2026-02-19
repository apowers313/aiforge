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
 * Run a command and return stdout with a timeout
 */
function run(cmd: string, timeoutMs = 120000): string {
  return execSync(cmd, {
    cwd: process.cwd(),
    encoding: 'utf-8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
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
 * Clean up PTY daemon sockets from the test's data directory.
 *
 * With XDG refactoring, sockets live under DATA_DIR/sockets/.
 * Since DATA_DIR is test-specific (tmp/e2e-data), we can safely delete
 * all socket files without risk of affecting dev server or production sockets.
 */
function cleanupDaemonSockets(): void {
  const socketsDir = join(DATA_DIR, 'sockets');
  try {
    const files = readdirSync(socketsDir);
    for (const file of files) {
      if (file.endsWith('.sock')) {
        try {
          unlinkSync(join(socketsDir, file));
        } catch {
          // Socket may have been removed by another process
        }
      }
    }
  } catch {
    // Socket dir doesn't exist yet
  }
}

/**
 * Extended test with server fixture that provides isolated environment per worker
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Server fixture - manages servers per worker (test file)
  // In CI, Playwright's webServer config handles server startup
  // Locally, we use servherd for dynamic port allocation
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, no-empty-pattern
  serverBaseURL: [async ({}: {}, use): Promise<void> => {
    const isCI = process.env.CI === 'true';

    if (isCI) {
      // In CI, Playwright's webServer config starts the servers on fixed ports
      // We just need to clean up the data directory and provide the URL
      resetDataDirectory();
      cleanupDaemonSockets();

      const baseURL = 'http://localhost:9061';
      await waitForServer(baseURL, 120000);
      await use(baseURL);

      // Cleanup daemon sockets
      cleanupDaemonSockets();
    } else {
      // Local development - use servherd for dynamic port allocation
      // Stop servers first to ensure clean state
      try { run('servherd stop e2e-backend'); } catch { /* ignore if not running */ }
      try { run('servherd stop e2e-frontend'); } catch { /* ignore if not running */ }

      // Clean up any stale daemon sockets from previous runs
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

      // Clean up any stale daemon sockets
      cleanupDaemonSockets();
    }
  }, { scope: 'worker' }],

  // Override baseURL to use the server's URL
  baseURL: async ({ serverBaseURL }, use) => {
    await use(serverBaseURL);
  },

  // Test GUID constant
  testGuid: TEST_GUID,
});

export { expect } from '@playwright/test';
