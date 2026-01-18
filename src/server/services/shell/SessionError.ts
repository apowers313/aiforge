/**
 * SessionError - Error class for shell session operations
 */

export type SessionErrorCode =
  | 'SHELL_NOT_FOUND'
  | 'DAEMON_SPAWN_FAILED'
  | 'CONNECTION_LOST'
  | 'INTERNAL_ERROR';

/**
 * Error class for session-related errors with error codes and retryability
 */
export class SessionError extends Error {
  constructor(
    public readonly code: SessionErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'SessionError';
  }

  /**
   * Create a SHELL_NOT_FOUND error
   */
  static shellNotFound(shellId: string): SessionError {
    return new SessionError('SHELL_NOT_FOUND', `Shell ${shellId} not found`, false);
  }

  /**
   * Create a DAEMON_SPAWN_FAILED error
   */
  static daemonSpawnFailed(shellId: string, reason?: string): SessionError {
    const message = reason
      ? `Failed to spawn daemon for shell ${shellId}: ${reason}`
      : `Failed to spawn daemon for shell ${shellId}`;
    return new SessionError('DAEMON_SPAWN_FAILED', message, true);
  }

  /**
   * Create a CONNECTION_LOST error
   */
  static connectionLost(shellId: string): SessionError {
    return new SessionError('CONNECTION_LOST', `Connection lost to shell ${shellId}`, true);
  }

  /**
   * Create an INTERNAL_ERROR
   */
  static internal(message: string): SessionError {
    return new SessionError('INTERNAL_ERROR', message, false);
  }
}
