/**
 * TerminalHandler - WebSocket message handler for terminal I/O
 */
import type { PtyManager } from '@server/services/pty/PtyManager.js';
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
  private readonly _ptyManager: PtyManager;
  private readonly _clientAttachments = new Map<WebSocketLike, ClientAttachment[]>();

  constructor(ptyManager: PtyManager) {
    this._ptyManager = ptyManager;
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(ws: WebSocketLike, message: TerminalMessage): void {
    logger.debug({ type: message.type, shellId: message.shellId }, 'Received terminal message');
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
    logger.debug({ shellId }, 'Attaching client to shell');
    const session = this._ptyManager.get(shellId);
    if (!session) {
      logger.warn({ shellId }, 'Shell not found in PTY manager');
      this._sendError(ws, 'SHELL_NOT_FOUND', `Shell ${shellId} not found`);
      return;
    }
    logger.debug({ shellId, pid: session.pid }, 'Found PTY session, setting up data forwarding');

    // Replay scrollback buffer first
    this._replayScrollback(ws, shellId);

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
  private _replayScrollback(ws: WebSocketLike, shellId: string): void {
    const scrollbackStore = this._ptyManager.scrollbackStore;
    if (!scrollbackStore) {
      return;
    }

    // Get scrollback from memory (already loaded)
    const entries = scrollbackStore.getFromMemory(shellId);
    if (entries.length === 0) {
      return;
    }

    logger.debug({ shellId, entries: entries.length }, 'Replaying scrollback');

    // Send only output entries as a single batch
    const outputData = entries
      .filter((e) => e.type === 'output')
      .map((e) => e.data)
      .join('');

    if (outputData.length > 0) {
      this._sendOutput(ws, shellId, outputData);
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

    const session = this._ptyManager.get(shellId);
    if (!session) {
      this._sendError(ws, 'SHELL_NOT_FOUND', `Shell ${shellId} not found`);
      return;
    }

    session.write(data);
  }

  private _handleResize(ws: WebSocketLike, message: TerminalMessage): void {
    const { shellId, cols, rows } = message;
    if (!shellId || cols === undefined || rows === undefined) return;

    const session = this._ptyManager.get(shellId);
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

  private _sendOutput(ws: WebSocketLike, shellId: string, data: string): void {
    ws.send(JSON.stringify({
      type: 'output',
      shellId,
      data,
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
