/**
 * Server configuration module
 * Loads configuration from environment variables, config file, and defaults
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ServerConfig } from '../../shared/types/index.js';

interface ConfigFile {
  port?: number;
  host?: string;
  authGuid?: string;
  scrollbackLines?: number;
  logLevel?: ServerConfig['logLevel'];
  httpsCert?: string;
  httpsKey?: string;
}

/**
 * Get the path to the config file
 */
function getConfigFilePath(): string {
  return path.join(os.homedir(), '.aiforge', 'config.json');
}

/**
 * Load configuration from the config file if it exists
 */
function loadConfigFile(): ConfigFile | null {
  const configPath = getConfigFilePath();
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as ConfigFile;
    }
  } catch {
    // Config file doesn't exist or is invalid, use defaults
  }
  return null;
}

/**
 * Generate a random port in the allowed range (9000-9099)
 */
function randomPort(): number {
  return 9000 + Math.floor(Math.random() * 100);
}

/**
 * Parse a port number from string, returning undefined if invalid
 */
function parsePort(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return undefined;
  return parsed;
}

/**
 * Parse a log level from string
 */
function parseLogLevel(value: string | undefined): ServerConfig['logLevel'] | undefined {
  const validLevels: ServerConfig['logLevel'][] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
  if (value && validLevels.includes(value as ServerConfig['logLevel'])) {
    return value as ServerConfig['logLevel'];
  }
  return undefined;
}

/**
 * Load configuration with priority: ENV > config.json > defaults
 */
export function loadConfig(): ServerConfig {
  const configFile = loadConfigFile();

  const envPort = parsePort(process.env.AIFORGE_PORT);
  const envScrollback = parsePort(process.env.AIFORGE_SCROLLBACK_LINES);
  const envLogLevel = parseLogLevel(process.env.AIFORGE_LOG_LEVEL);

  // HTTPS settings (both must be provided for HTTPS mode)
  const httpsCert = process.env.AIFORGE_HTTPS_CERT ?? configFile?.httpsCert;
  const httpsKey = process.env.AIFORGE_HTTPS_KEY ?? configFile?.httpsKey;

  const config: ServerConfig = {
    port: envPort ?? configFile?.port ?? randomPort(),
    host: process.env.AIFORGE_HOST ?? configFile?.host ?? '0.0.0.0',
    authGuid: process.env.AIFORGE_AUTH_GUID ?? configFile?.authGuid ?? '',
    scrollbackLines: envScrollback ?? configFile?.scrollbackLines ?? 10000,
    logLevel: envLogLevel ?? configFile?.logLevel ?? 'info',
  };

  // Only add HTTPS settings if defined (exactOptionalPropertyTypes compatibility)
  if (httpsCert) {
    config.httpsCert = httpsCert;
  }
  if (httpsKey) {
    config.httpsKey = httpsKey;
  }

  return config;
}

/**
 * Get configuration (singleton pattern)
 */
let cachedConfig: ServerConfig | null = null;

export function getConfig(): ServerConfig {
  cachedConfig ??= loadConfig();
  return cachedConfig;
}

/**
 * Reset the cached configuration (useful for testing)
 */
export function resetConfig(): void {
  cachedConfig = null;
}
