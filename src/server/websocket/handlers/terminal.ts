/**
 * TerminalHandler - WebSocket message handler for terminal I/O using new session protocol
 */
import type {
  SessionOpenMessage,
  SessionCloseMessage,
  SessionInputMessage,
  SessionResizeMessage,
  SessionOpenedMessage,
  SessionClosedMessage,
  SessionErrorMessage,
  SessionOutputMessage,
} from '@shared/types/index.js';
import type { ShellSessionManager } from '@server/services/shell/ShellSessionManager.js';
import { SessionError } from '@server/services/shell/SessionError.js';
import { logger } from '@server/utils/logger.js';

/**
 * Terminal message types (new session protocol + legacy support)
 */
export type TerminalMessageType =
  | 'session.open'
  | 'session.close'
  | 'session.input'
  | 'session.resize'
  | 'input'
  | 'resize';

/**
 * Base terminal message
 */
export interface TerminalMessage {
  type: string;
  shellId?: string;
  requestId?: string;
  data?: string;
  cols?: number;
  rows?: number;
}

/**
 * WebSocket-like interface for sending messages
 */
export interface WebSocketLike {
  send(data: string): void;
}

/**
 * Client subscription info
 */
interface ClientSubscription {
  shellId: string;
  dataCleanup: () => void;
  exitCleanup: () => void;
}

/**
 * TerminalHandler manages WebSocket client connections to shell sessions
 * using the new session protocol
 */
export class TerminalHandler {
  private readonly _sessionManager: ShellSessionManager;
  private readonly _clientSubscriptions = new Map<WebSocketLike, ClientSubscription[]>();

  constructor(sessionManager: ShellSessionManager) {
    this._sessionManager = sessionManager;
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(ws: WebSocketLike, message: TerminalMessage): void {
    logger.debug({ type: message.type, shellId: message.shellId }, 'Received terminal message');

    switch (message.type) {
      case 'session.open':
        this._handleSessionOpen(ws, message as SessionOpenMessage);
        break;
      case 'session.close':
        this._handleSessionClose(ws, message as SessionCloseMessage);
        break;
      case 'session.input':
        this._handleSessionInput(ws, message as SessionInputMessage);
        break;
      case 'session.resize':
        this._handleSessionResize(ws, message as SessionResizeMessage);
        break;
      // Legacy message support
      case 'input':
        this._handleLegacyInput(ws, message);
        break;
      case 'resize':
        this._handleLegacyResize(ws, message);
        break;
      default:
        // Ignore unknown message types
        break;
    }
  }

  /**
   * Handle client disconnect - clean up all subscriptions
   */
  handleDisconnect(ws: WebSocketLike): void {
    const subscriptions = this._clientSubscriptions.get(ws);
    if (subscriptions) {
      for (const subscription of subscriptions) {
        subscription.dataCleanup();
        subscription.exitCleanup();
      }
      this._clientSubscriptions.delete(ws);
    }
  }

  /**
   * Handle session.open message
   */
  private _handleSessionOpen(ws: WebSocketLike, message: SessionOpenMessage): void {
    const { shellId, requestId } = message;

    void this._sessionManager
      .openSession(shellId)
      .then((result) => {
        // Send session.opened response
        const response: SessionOpenedMessage = {
          type: 'session.opened',
          shellId,
          requestId,
          shell: result.shell,
          scrollback: result.scrollback,
          cols: result.cols,
          rows: result.rows,
        };
        ws.send(JSON.stringify(response));

        // Subscribe to output
        this._subscribeToOutput(ws, shellId);
      })
      .catch((err: unknown) => {
        this._sendSessionError(ws, shellId, requestId, err);
      });
  }

  /**
   * Handle session.close message
   */
  private _handleSessionClose(ws: WebSocketLike, message: SessionCloseMessage): void {
    const { shellId, requestId } = message;

    // Unsubscribe from output first
    this._unsubscribeFromOutput(ws, shellId);

    void this._sessionManager
      .closeSession(shellId)
      .then(() => {
        // Send session.closed response
        const response: SessionClosedMessage = {
          type: 'session.closed',
          shellId,
          reason: 'requested',
          ...(requestId !== undefined && { requestId }),
        };
        ws.send(JSON.stringify(response));
      })
      .catch((err: unknown) => {
        this._sendSessionError(ws, shellId, requestId, err);
      });
  }

  /**
   * Handle session.input message
   */
  private _handleSessionInput(ws: WebSocketLike, message: SessionInputMessage): void {
    const { shellId, data } = message;

    const session = this._sessionManager.getSession(shellId);
    if (!session) {
      this._sendSessionError(ws, shellId, undefined, SessionError.shellNotFound(shellId));
      return;
    }

    session.write(data);
  }

  /**
   * Handle session.resize message
   */
  private _handleSessionResize(ws: WebSocketLike, message: SessionResizeMessage): void {
    const { shellId, cols, rows } = message;

    const session = this._sessionManager.getSession(shellId);
    if (!session) {
      this._sendSessionError(ws, shellId, undefined, SessionError.shellNotFound(shellId));
      return;
    }

    session.resize(cols, rows);
  }

  /**
   * Handle legacy input message (backward compatibility)
   */
  private _handleLegacyInput(ws: WebSocketLike, message: TerminalMessage): void {
    const { shellId, data } = message;
    if (!shellId || data === undefined) return;

    const session = this._sessionManager.getSession(shellId);
    if (!session) {
      this._sendSessionError(ws, shellId, undefined, SessionError.shellNotFound(shellId));
      return;
    }

    session.write(data);
  }

  /**
   * Handle legacy resize message (backward compatibility)
   */
  private _handleLegacyResize(ws: WebSocketLike, message: TerminalMessage): void {
    const { shellId, cols, rows } = message;
    if (!shellId || cols === undefined || rows === undefined) return;

    const session = this._sessionManager.getSession(shellId);
    if (!session) {
      this._sendSessionError(ws, shellId, undefined, SessionError.shellNotFound(shellId));
      return;
    }

    session.resize(cols, rows);
  }

  /**
   * Subscribe client to shell output
   */
  private _subscribeToOutput(ws: WebSocketLike, shellId: string): void {
    const session = this._sessionManager.getSession(shellId);
    if (!session) return;

    // Set up data forwarding
    const dataCleanup = session.onData((data: string) => {
      this._sendOutput(ws, shellId, data);
    });

    // Set up exit notification
    const exitCleanup = session.onExit((_event: { exitCode: number }) => {
      const response: SessionClosedMessage = {
        type: 'session.closed',
        shellId,
        reason: 'daemon_exited',
      };
      ws.send(JSON.stringify(response));
    });

    // Track subscription
    const subscriptions = this._clientSubscriptions.get(ws) ?? [];
    subscriptions.push({ shellId, dataCleanup, exitCleanup });
    this._clientSubscriptions.set(ws, subscriptions);
  }

  /**
   * Unsubscribe client from shell output
   */
  private _unsubscribeFromOutput(ws: WebSocketLike, shellId: string): void {
    const subscriptions = this._clientSubscriptions.get(ws);
    if (!subscriptions) return;

    const index = subscriptions.findIndex((s) => s.shellId === shellId);
    if (index === -1) return;

    const subscription = subscriptions[index];
    if (subscription) {
      subscription.dataCleanup();
      subscription.exitCleanup();
      subscriptions.splice(index, 1);
    }
  }

  /**
   * Send session.output message
   */
  private _sendOutput(ws: WebSocketLike, shellId: string, data: string, isScrollback = false): void {
    const message: SessionOutputMessage = {
      type: 'session.output',
      shellId,
      data,
      isScrollback,
    };
    ws.send(JSON.stringify(message));
  }

  /**
   * Send session.error message
   */
  private _sendSessionError(
    ws: WebSocketLike,
    shellId: string,
    requestId: string | undefined,
    err: unknown,
  ): void {
    let code = 'INTERNAL_ERROR';
    let errMessage = 'Unknown error';
    let retryable = false;

    if (err instanceof SessionError) {
      code = err.code;
      errMessage = err.message;
      retryable = err.retryable;
    } else if (err instanceof Error) {
      errMessage = err.message;
    }

    const response: SessionErrorMessage = {
      type: 'session.error',
      shellId,
      code: code as SessionErrorMessage['code'],
      message: errMessage,
      retryable,
      ...(requestId !== undefined && { requestId }),
    };
    ws.send(JSON.stringify(response));
  }
}
