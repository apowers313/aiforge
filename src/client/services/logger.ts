/**
 * Browser debug logger service using pino
 *
 * Logging is OFF by default. Enable via query strings:
 * - ?debug - Enables debug logging to browser console
 * - ?remote-logger=http://url - Enables debug logging AND sends logs to remote-logger server
 *
 * Example: http://localhost:9000/?debug
 * Example: http://localhost:9000/?remote-logger=http://localhost:9080
 */
import pino, { type Logger } from 'pino';
import { RemoteLogClient } from '@graphty/remote-logger';

/**
 * Debug configuration parsed from query string
 */
export interface DebugConfig {
  /** Whether debug logging is enabled */
  enabled: boolean;
  /** Remote logger URL if specified */
  remoteLoggerUrl: string | null;
}

/**
 * Parse query string for debug configuration
 */
export function parseDebugConfig(): DebugConfig {
  if (typeof window === 'undefined') {
    return { enabled: false, remoteLoggerUrl: null };
  }

  const params = new URLSearchParams(window.location.search);
  const debug = params.has('debug');
  const remoteLoggerUrl = params.get('remote-logger');

  return {
    enabled: debug || remoteLoggerUrl !== null,
    remoteLoggerUrl,
  };
}

// Parse config once at module load
const debugConfig = parseDebugConfig();

// Remote logger client (only created if remote-logger URL is specified)
let remoteLogClient: RemoteLogClient | null = null;

if (debugConfig.remoteLoggerUrl) {
  remoteLogClient = new RemoteLogClient({
    serverUrl: debugConfig.remoteLoggerUrl,
    projectMarker: 'aiforge-browser-debug',
  });
}

/**
 * Map pino numeric levels to remote logger level strings
 */
function pinoLevelToString(level: number): 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' {
  if (level <= 10) return 'TRACE';
  if (level <= 20) return 'DEBUG';
  if (level <= 30) return 'INFO';
  if (level <= 40) return 'WARN';
  if (level <= 50) return 'ERROR';
  return 'FATAL';
}

/**
 * Create the browser logger
 *
 * When disabled, creates a silent logger that does nothing.
 * When enabled, creates a pino logger that:
 * - Outputs to browser console
 * - Optionally transmits to remote-logger server
 */
function createBrowserLogger(): Logger {
  // When disabled, return a silent logger
  if (!debugConfig.enabled) {
    return pino({
      browser: {
        disabled: true,
      },
    });
  }

  // Build transmit config for remote logging
  const transmitConfig = remoteLogClient
    ? {
      transmit: {
        send: (_level: string, logEvent: pino.LogEvent): void => {
          const levelString = pinoLevelToString(logEvent.level.value);
          const messages = logEvent.messages.map((m) =>
            typeof m === 'string' ? m : JSON.stringify(m),
          ).join(' ');

          // Include bindings (child logger context) in the message
          const bindingsStr = logEvent.bindings.length > 0
            ? `[${logEvent.bindings.map((b) => JSON.stringify(b)).join(', ')}] `
            : '';

          remoteLogClient.log(levelString, `${bindingsStr}${messages}`);
        },
      },
    }
    : {};

  return pino({
    level: 'debug',
    browser: {
      asObject: false, // Use native console formatting for better DevTools experience
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      ...transmitConfig,
    },
  });
}

// Create the main logger instance
const logger = createBrowserLogger();

/**
 * Get debug configuration
 */
export function getDebugConfig(): DebugConfig {
  return { ...debugConfig };
}

/**
 * Check if debug logging is enabled
 */
export function isDebugEnabled(): boolean {
  return debugConfig.enabled;
}

/**
 * Check if remote logging is enabled
 */
export function isRemoteLogEnabled(): boolean {
  return debugConfig.remoteLoggerUrl !== null;
}

// Create child loggers for different subsystems
export const log = {
  /** Root logger */
  root: logger,

  /** App startup and initialization */
  startup: logger.child({ module: 'startup' }),

  /** WebSocket connection management */
  websocket: logger.child({ module: 'websocket' }),

  /** REST API calls */
  api: logger.child({ module: 'api' }),

  /** UI state changes (Zustand store) */
  state: logger.child({ module: 'state' }),

  /** Terminal operations */
  terminal: logger.child({ module: 'terminal' }),

  /** Authentication */
  auth: logger.child({ module: 'auth' }),

  /** React Query operations */
  query: logger.child({ module: 'query' }),

  /** UI components and interactions */
  ui: logger.child({ module: 'ui' }),

  /** Project management */
  project: logger.child({ module: 'project' }),

  /** Shell management */
  shell: logger.child({ module: 'shell' }),

  /** Workspace sync */
  workspace: logger.child({ module: 'workspace' }),
};

export default log;
