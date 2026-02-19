import { join } from 'node:path';
import { homedir } from 'node:os';

const UNIX_SOCKET_PATH_LIMIT = 107;

/**
 * Get the XDG config directory for AIForge.
 * Uses XDG_CONFIG_HOME if set, otherwise defaults to ~/.config/aiforge.
 */
export function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  const base = xdgConfig && xdgConfig.length > 0
    ? xdgConfig
    : join(homedir(), '.config');
  return join(base, 'aiforge');
}

/**
 * Get the path to AIForge's config.json file.
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

/**
 * Get the data directory for AIForge.
 * Priority: AIFORGE_DATA_DIR > XDG_DATA_HOME/aiforge > ~/.local/share/aiforge
 *
 * AIFORGE_DATA_DIR is used as-is (no /aiforge suffix) for backwards compatibility.
 */
export function getDataDir(): string {
  const aiforgeDataDir = process.env.AIFORGE_DATA_DIR;
  if (aiforgeDataDir && aiforgeDataDir.length > 0) {
    return aiforgeDataDir;
  }

  const xdgData = process.env.XDG_DATA_HOME;
  const base = xdgData && xdgData.length > 0
    ? xdgData
    : join(homedir(), '.local', 'share');
  return join(base, 'aiforge');
}

/**
 * Get the directory for Unix domain socket files.
 */
export function getSocketDir(): string {
  return join(getDataDir(), 'sockets');
}

/**
 * Get the socket file path for a specific shell.
 */
export function getSocketPath(shellId: string): string {
  return join(getSocketDir(), `${shellId}.sock`);
}

/**
 * Validate that a socket path does not exceed the Unix domain socket length limit.
 * Throws an error if the path is too long (> 107 bytes).
 */
export function validateSocketPathLength(socketPath: string): void {
  if (socketPath.length > UNIX_SOCKET_PATH_LIMIT) {
    throw new Error(
      'Socket path exceeds the Unix domain socket limit of ' +
      String(UNIX_SOCKET_PATH_LIMIT) + ' bytes ' +
      '(' + String(socketPath.length) + ' bytes): ' + socketPath + '. ' +
      'Try shortening XDG_DATA_HOME or AIFORGE_DATA_DIR.',
    );
  }
}
