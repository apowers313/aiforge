/**
 * Tests for Pino logger setup
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resetConfig } from '../../../../src/server/config/index.js';

describe('Logger', () => {
  beforeEach(() => {
    // Reset config before tests
    resetConfig();
  });

  it('exports a logger instance', async () => {
    // Dynamic import to get fresh instance
    const { logger } = await import('../../../../src/server/utils/logger.js');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('creates child logger with bindings', async () => {
    const { createChildLogger } = await import('../../../../src/server/utils/logger.js');
    const childLogger = createChildLogger({ component: 'test' });
    expect(childLogger).toBeDefined();
    expect(typeof childLogger.info).toBe('function');
  });
});
