/**
 * Tests for server configuration loading
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, resetConfig } from '../../../../src/server/config/index.js';
import * as fs from 'node:fs';

// Mock fs module to prevent reading real config file
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
}));

describe('ServerConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset config cache before each test
    resetConfig();
    // Create a fresh copy of env
    process.env = { ...originalEnv };
    // Clear any AIFORGE_ env vars
    delete process.env.AIFORGE_PORT;
    delete process.env.AIFORGE_HOST;
    delete process.env.AIFORGE_AUTH_GUID;
    delete process.env.AIFORGE_SCROLLBACK_LINES;
    delete process.env.AIFORGE_LOG_LEVEL;
    // Mock fs to not find config file
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    resetConfig();
    vi.clearAllMocks();
  });

  it('loads default configuration values', () => {
    const config = loadConfig();
    expect(config.host).toBe('0.0.0.0');
    expect(config.scrollbackLines).toBe(10000);
    expect(config.logLevel).toBe('info');
    expect(config.authGuid).toBe('');
  });

  it('overrides defaults with environment variables', () => {
    process.env.AIFORGE_PORT = '9042';
    const config = loadConfig();
    expect(config.port).toBe(9042);
  });

  it('selects random port in allowed range', () => {
    const config = loadConfig();
    expect(config.port).toBeGreaterThanOrEqual(9000);
    expect(config.port).toBeLessThanOrEqual(9099);
  });

  it('overrides host with environment variable', () => {
    process.env.AIFORGE_HOST = 'localhost';
    const config = loadConfig();
    expect(config.host).toBe('localhost');
  });

  it('overrides authGuid with environment variable', () => {
    process.env.AIFORGE_AUTH_GUID = 'test-guid-123';
    const config = loadConfig();
    expect(config.authGuid).toBe('test-guid-123');
  });

  it('overrides scrollbackLines with environment variable', () => {
    process.env.AIFORGE_SCROLLBACK_LINES = '5000';
    const config = loadConfig();
    expect(config.scrollbackLines).toBe(5000);
  });

  it('overrides logLevel with environment variable', () => {
    process.env.AIFORGE_LOG_LEVEL = 'debug';
    const config = loadConfig();
    expect(config.logLevel).toBe('debug');
  });

  it('ignores invalid port values', () => {
    process.env.AIFORGE_PORT = 'not-a-number';
    const config = loadConfig();
    // Should use random port since env value is invalid
    expect(config.port).toBeGreaterThanOrEqual(9000);
    expect(config.port).toBeLessThanOrEqual(9099);
  });

  it('ignores invalid logLevel values', () => {
    process.env.AIFORGE_LOG_LEVEL = 'invalid';
    const config = loadConfig();
    expect(config.logLevel).toBe('info'); // default
  });

  it('accepts all valid log levels', () => {
    const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
    for (const level of validLevels) {
      resetConfig();
      process.env.AIFORGE_LOG_LEVEL = level;
      const config = loadConfig();
      expect(config.logLevel).toBe(level);
    }
  });
});
