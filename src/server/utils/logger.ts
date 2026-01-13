/**
 * Pino logger setup for AIForge server
 */
import pino from 'pino';
import { getConfig } from '../config/index.js';

/**
 * Create and configure the logger instance
 */
function createLogger(): pino.Logger {
  const config = getConfig();

  return pino({
    name: 'aiforge',
    level: config.logLevel,
    transport: {
      target: 'pino/file',
      options: {
        destination: 1, // stdout
      },
    },
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

// Export singleton logger instance
export const logger = createLogger();

/**
 * Create a child logger with additional context
 */
export function createChildLogger(bindings: pino.Bindings): pino.Logger {
  return logger.child(bindings);
}
