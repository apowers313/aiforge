/**
 * IPC Protocol for PTY Daemon Communication
 *
 * Messages are JSON objects sent over Unix domain sockets.
 * Each message is newline-delimited (JSON-lines format).
 */

/**
 * Configuration passed to daemon via command line arguments
 */
export interface DaemonConfig {
  shellId: string;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  scrollbackDir: string;
  remoteLoggerUrl?: string;
}

/**
 * Messages sent from the daemon to the server
 */
export type DaemonMessage =
  | { type: 'ready' }                           // Daemon is ready to receive commands
  | { type: 'data'; data: string }              // PTY output data
  | { type: 'exit'; code: number; signal?: number }  // PTY process exited
  | { type: 'error'; message: string }          // Error occurred
  | { type: 'pong' };                           // Heartbeat response

/**
 * Messages sent from the server to the daemon
 */
export type ClientMessage =
  | { type: 'input'; data: string }             // Send input to PTY
  | { type: 'resize'; cols: number; rows: number }  // Resize PTY
  | { type: 'ping' }                            // Heartbeat check
  | { type: 'kill'; signal?: string };          // Terminate PTY

/**
 * Get the socket path for a shell
 */
export function getSocketPath(shellId: string): string {
  return `/tmp/ai-ide-pty-${shellId}.sock`;
}

/**
 * Encode a message for transmission (add newline delimiter)
 */
export function encodeMessage(message: DaemonMessage | ClientMessage): string {
  return JSON.stringify(message) + '\n';
}

/**
 * Decode a message from raw data
 * Returns null if the data is not a complete message
 */
export function decodeMessage(data: string): DaemonMessage | ClientMessage | null {
  try {
    return JSON.parse(data.trim()) as DaemonMessage | ClientMessage;
  } catch {
    return null;
  }
}

/**
 * Parse multiple messages from a buffer (handles partial messages)
 * Returns the parsed messages and any remaining unparsed data
 */
export function parseMessages(buffer: string): {
  messages: (DaemonMessage | ClientMessage)[];
  remaining: string;
} {
  const messages: (DaemonMessage | ClientMessage)[] = [];
  const lines = buffer.split('\n');

  // Last element is either empty (if buffer ended with \n) or partial
  const remaining = lines.pop() ?? '';

  for (const line of lines) {
    if (line.trim()) {
      const message = decodeMessage(line);
      if (message) {
        messages.push(message);
      }
    }
  }

  return { messages, remaining };
}
