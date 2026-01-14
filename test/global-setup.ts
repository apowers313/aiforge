/**
 * Vitest global setup
 * Runs once before all tests to create isolated test environment
 */
import { setupTestIsolation, teardownTestIsolation } from './test-isolation.js';

export function setup(): void {
  const dataDir = setupTestIsolation();
  console.log(`\n[Test Isolation] Using temp directory: ${dataDir}\n`);
}

export function teardown(): void {
  teardownTestIsolation();
  console.log('\n[Test Isolation] Cleaned up temp directory\n');
}
