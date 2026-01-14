/**
 * TerminalHandler - WebSocket message handler for terminal I/O
 */
import type { PtyPool } from '@server/services/pty/PtyPool.js';
import { logger } from '@server/utils/logger.js';

/**
 * Terminal message types
 */
export type TerminalMessageType = 'input' | 'output' | 'resize' | 'attach' | 'detach' | 'status' | 'error';

/**
 * Base terminal message
 */
export interface TerminalMessage {
  type: TerminalMessageType;
  shellId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  status?: string;
  exitCode?: number;
  code?: string;
  message?: string;
}

/**
 * WebSocket-like interface for sending messages
 */
export interface WebSocketLike {
  send(data: string): void;
}

/**
 * Client attachment info
 */
interface ClientAttachment {
  shellId: string;
  dataCleanup: () => void;
  exitCleanup: () => void;
}

/**
 * TerminalHandler manages WebSocket client connections to PTY sessions
 */
export class TerminalHandler {
  private readonly _ptyPool: PtyPool;
  private readonly _clientAttachments = new Map<WebSocketLike, ClientAttachment[]>();

  constructor(ptyPool: PtyPool) {
    this._ptyPool = ptyPool;
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(ws: WebSocketLike, message: TerminalMessage): void {
    const startTime = Date.now();
    logger.debug({ type: message.type, shellId: message.shellId }, 'Received terminal message');
    logger.info({ type: message.type, shellId: message.shellId, startTime }, '[TERMINAL_SWITCH_SERVER] Received message');
    switch (message.type) {
      case 'input':
        this._handleInput(ws, message);
        break;
      case 'resize':
        this._handleResize(ws, message);
        break;
      case 'attach':
        this._handleAttach(ws, message);
        break;
      case 'detach':
        this._handleDetach(ws, message);
        break;
      default:
        // Ignore unknown message types
        break;
    }
  }

  /**
   * Handle client disconnect - clean up all attachments
   */
  handleDisconnect(ws: WebSocketLike): void {
    const attachments = this._clientAttachments.get(ws);
    if (attachments) {
      for (const attachment of attachments) {
        attachment.dataCleanup();
        attachment.exitCleanup();
      }
      this._clientAttachments.delete(ws);
    }
  }

  /**
   * Attach a client to a shell session
   */
  attachClient(ws: WebSocketLike, shellId: string): void {
    const attachStartTime = Date.now();
    logger.info({ shellId, attachStartTime }, '[TERMINAL_SWITCH_SERVER] attachClient START');
    logger.debug({ shellId }, 'Attaching client to shell');
    const session = this._ptyPool.get(shellId);
    if (!session) {
      logger.warn({ shellId }, 'Shell not found in PTY manager');
      this._sendError(ws, 'SHELL_NOT_FOUND', `Shell ${shellId} not found`);
      return;
    }
    logger.info({ shellId, elapsed: Date.now() - attachStartTime }, '[TERMINAL_SWITCH_SERVER] Found PTY session');

    // Replay scrollback buffer first
    this._replayScrollback(ws, shellId, attachStartTime);

    // Set up data forwarding
    const dataCleanup = session.onData((data: string) => {
      this._sendOutput(ws, shellId, data);
    });

    // Set up exit notification
    const exitCleanup = session.onExit((event: { exitCode: number }) => {
      this._sendStatus(ws, shellId, 'exited', event.exitCode);
    });

    // Track attachment
    const attachments = this._clientAttachments.get(ws) ?? [];
    attachments.push({ shellId, dataCleanup, exitCleanup });
    this._clientAttachments.set(ws, attachments);
  }

  /**
   * Replay scrollback buffer to a client
   */
  private _replayScrollback(ws: WebSocketLike, shellId: string, attachStartTime?: number): void {
    const scrollbackStore = this._ptyPool.scrollbackStore;
    if (!scrollbackStore) {
      logger.info({ shellId, elapsed: attachStartTime ? Date.now() - attachStartTime : 0 }, '[TERMINAL_SWITCH_SERVER] No scrollback store');
      return;
    }

    logger.info({ shellId, elapsed: attachStartTime ? Date.now() - attachStartTime : 0 }, '[TERMINAL_SWITCH_SERVER] Getting scrollback from memory');
    // Get scrollback from memory (already loaded)
    const entries = scrollbackStore.getFromMemory(shellId);
    logger.info({ shellId, entries: entries.length, elapsed: attachStartTime ? Date.now() - attachStartTime : 0 }, '[TERMINAL_SWITCH_SERVER] Got scrollback entries');
    if (entries.length === 0) {
      return;
    }

    logger.debug({ shellId, entries: entries.length }, 'Replaying scrollback');

    // Send only output entries as a single batch
    const outputData = entries
      .filter((e) => e.type === 'output')
      .map((e) => e.data)
      .join('');

    logger.info({ shellId, outputDataLen: outputData.length, elapsed: attachStartTime ? Date.now() - attachStartTime : 0 }, '[TERMINAL_SWITCH_SERVER] Scrollback data prepared');

    if (outputData.length > 0) {
      this._sendOutput(ws, shellId, outputData, true);
      logger.info({ shellId, elapsed: attachStartTime ? Date.now() - attachStartTime : 0 }, '[TERMINAL_SWITCH_SERVER] Scrollback SENT');
    }
  }

  /**
   * Detach a client from a shell session
   */
  detachClient(ws: WebSocketLike, shellId: string): void {
    const attachments = this._clientAttachments.get(ws);
    if (!attachments) return;

    const index = attachments.findIndex((a) => a.shellId === shellId);
    if (index === -1) return;

    const attachment = attachments[index];
    if (attachment) {
      attachment.dataCleanup();
      attachment.exitCleanup();
      attachments.splice(index, 1);
    }
  }

  private _handleInput(ws: WebSocketLike, message: TerminalMessage): void {
    const { shellId, data } = message;
    if (!shellId || data === undefined) return;

    const session = this._ptyPool.get(shellId);
    if (!session) {
      this._sendError(ws, 'SHELL_NOT_FOUND', `Shell ${shellId} not found`);
      return;
    }

    session.write(data);
  }

  private _handleResize(ws: WebSocketLike, message: TerminalMessage): void {
    const { shellId, cols, rows } = message;
    if (!shellId || cols === undefined || rows === undefined) return;

    const session = this._ptyPool.get(shellId);
    if (!session) {
      this._sendError(ws, 'SHELL_NOT_FOUND', `Shell ${shellId} not found`);
      return;
    }

    session.resize(cols, rows);
  }

  private _handleAttach(ws: WebSocketLike, message: TerminalMessage): void {
    const { shellId } = message;
    if (!shellId) return;

    this.attachClient(ws, shellId);
  }

  private _handleDetach(ws: WebSocketLike, message: TerminalMessage): void {
    const { shellId } = message;
    if (!shellId) return;

    this.detachClient(ws, shellId);
  }

  private _sendOutput(ws: WebSocketLike, shellId: string, data: string, isScrollback = false): void {
    ws.send(JSON.stringify({
      type: 'output',
      shellId,
      data,
      isScrollback,
    }));
  }

  private _sendStatus(ws: WebSocketLike, shellId: string, status: string, exitCode: number): void {
    ws.send(JSON.stringify({
      type: 'status',
      shellId,
      status,
      exitCode,
    }));
  }

  private _sendError(ws: WebSocketLike, code: string, message: string): void {
    ws.send(JSON.stringify({
      type: 'error',
      code,
      message,
    }));
  }
}
