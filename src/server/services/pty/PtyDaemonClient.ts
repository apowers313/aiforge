/**
 * PtyDaemonClient - Client that connects to a PTY daemon over Unix socket
 *
 * Implements the same interface as PtySession for drop-in replacement.
 */
import { EventEmitter } from 'events';
import { createConnection, type Socket } from 'node:net';
import {
  type DaemonMessage,
  type ClientMessage,
  getSocketPath,
  encodeMessage,
  parseMessages,
} from './daemon/protocol.js';

/**
 * Exit event data
 */
export interface PtyExitEvent {
  exitCode: number;
  signal?: number;
}

/**
 * PtyDaemonClient provides a PTY-like interface over a Unix socket connection
 * to a persistent PTY daemon process.
 */
export class PtyDaemonClient extends EventEmitter {
  private readonly _id: string;
  private readonly _socketPath: string;
  private readonly _cwd: string;
  private _socket: Socket | null = null;
  private _buffer = '';
  private _cols: number;
  private _rows: number;
  private _isConnected = false;
  private _isReady = false;

  constructor(id: string, cwd: string, cols = 80, rows = 24) {
    super();
    this._id = id;
    this._socketPath = getSocketPath(id);
    this._cwd = cwd;
    this._cols = cols;
    this._rows = rows;
  }

  /**
   * Connect to the daemon socket
   * Returns a promise that resolves when the daemon sends 'ready'
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._isConnected) {
        resolve();
        return;
      }

      const socket = createConnection(this._socketPath);
      this._socket = socket;

      const onReady = (): void => {
        this._isReady = true;
        this._isConnected = true;
        resolve();
      };

      const onError = (err: Error): void => {
        if (!this._isConnected) {
          reject(err);
        } else {
          this.emit('error', err);
        }
      };

      socket.on('connect', () => {
        this._isConnected = true;
      });

      socket.on('data', (data: Buffer) => {
        this._buffer += data.toString('utf-8');

        const { messages, remaining } = parseMessages(this._buffer);
        this._buffer = remaining;

        for (const message of messages) {
          this._handleMessage(message as DaemonMessage, onReady);
        }
      });

      socket.on('error', onError);

      socket.on('close', () => {
        this._isConnected = false;
        this._isReady = false;
        this._socket = null;
        // Emit exit if we didn't get an explicit exit message
        // This handles daemon crashes
        this.emit('exit', { exitCode: -1 });
      });

      // Timeout for initial connection
      const timeout = setTimeout(() => {
        if (!this._isReady) {
          socket.destroy();
          reject(new Error('Connection timeout'));
        }
      }, 5000);

      socket.once('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Handle a message from the daemon
   */
  private _handleMessage(message: DaemonMessage, onReady: () => void): void {
    switch (message.type) {
      case 'ready':
        onReady();
        break;

      case 'data':
        this.emit('data', message.data);
        break;

      case 'exit':
        this.emit('exit', { exitCode: message.code, signal: message.signal });
        this._socket?.destroy();
        break;

      case 'error':
        this.emit('error', new Error(message.message));
        break;

      case 'pong':
        this.emit('pong');
        break;
    }
  }

  /**
   * Send a message to the daemon
   */
  private _send(message: ClientMessage): void {
    if (this._socket && this._isConnected) {
      this._socket.write(encodeMessage(message));
    }
  }

  /**
   * The unique ID for this session
   */
  get id(): string {
    return this._id;
  }

  /**
   * The socket path for this session
   */
  get socketPath(): string {
    return this._socketPath;
  }

  /**
   * The current working directory
   */
  get cwd(): string {
    return this._cwd;
  }

  /**
   * The number of columns
   */
  get cols(): number {
    return this._cols;
  }

  /**
   * The number of rows
   */
  get rows(): number {
    return this._rows;
  }

  /**
   * Whether the client is connected to the daemon
   */
  get isConnected(): boolean {
    return this._isConnected && this._isReady;
  }

  /**
   * Write data to the PTY
   */
  write(data: string): void {
    this._send({ type: 'input', data });
    // Emit input event for activity tracking (same as PtySession)
    this.emit('input', data);
  }

  /**
   * Resize the PTY
   */
  resize(cols: number, rows: number): void {
    this._cols = cols;
    this._rows = rows;
    this._send({ type: 'resize', cols, rows });
  }

  /**
   * Kill the PTY process
   */
  kill(signal?: string): void {
    if (signal) {
      this._send({ type: 'kill', signal });
    } else {
      this._send({ type: 'kill' });
    }
  }

  /**
   * Send a ping to check if daemon is alive
   */
  ping(): void {
    this._send({ type: 'ping' });
  }

  /**
   * Subscribe to data events with disposable pattern
   */
  onData(callback: (data: string) => void): () => void {
    const listener = (data: string): void => { callback(data); };
    this.on('data', listener);
    return () => {
      this.off('data', listener);
    };
  }

  /**
   * Subscribe to exit events with disposable pattern
   */
  onExit(callback: (event: PtyExitEvent) => void): () => void {
    const listener = (event: PtyExitEvent): void => { callback(event); };
    this.on('exit', listener);
    return () => {
      this.off('exit', listener);
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this._socket) {
      this._socket.destroy();
      this._socket = null;
    }
    this._isConnected = false;
    this._isReady = false;
    this.removeAllListeners();
  }
}
