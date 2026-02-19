/**
 * Test isolation utilities
 * Creates ephemeral temp directories for isolated test environments
 */
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let testDataDir: string | null = null;

/**
 * Create an isolated temp directory for test data
 * Sets AIFORGE_DATA_DIR environment variable
 */
export function setupTestIsolation(): string {
  if (testDataDir && existsSync(testDataDir)) {
    return testDataDir;
  }

  testDataDir = mkdtempSync(join(tmpdir(), 'aiforge-test-'));
  process.env.AIFORGE_DATA_DIR = testDataDir;

  // Create sockets subdirectory for Unix domain socket tests
  mkdirSync(join(testDataDir, 'sockets'), { recursive: true });

  return testDataDir;
}

/**
 * Clean up the isolated test directory
 */
export function teardownTestIsolation(): void {
  if (testDataDir && existsSync(testDataDir)) {
    rmSync(testDataDir, { recursive: true, force: true });
    testDataDir = null;
  }
  delete process.env.AIFORGE_DATA_DIR;
}

/**
 * Get the current test data directory
 */
export function getTestDataDir(): string | null {
  return testDataDir;
}
