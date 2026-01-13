/**
 * PtySession - Wrapper around node-pty with event emitter interface
 */
import { EventEmitter } from 'events';
import type { IPty, IDisposable } from '@homebridge/node-pty-prebuilt-multiarch';
import type { ScrollbackStore } from '../../storage/stores/ScrollbackStore.js';

/**
 * Exit event data
 */
export interface PtyExitEvent {
  exitCode: number;
  signal?: number;
}

/**
 * Options for PtySession
 */
export interface PtySessionOptions {
  /** Optional scrollback store for persistence */
  scrollbackStore: ScrollbackStore | undefined;
}

/**
 * PtySession wraps a node-pty instance with a simpler event emitter interface
 * and tracks state for the AIForge shell system
 */
export class PtySession extends EventEmitter {
  private readonly _id: string;
  private readonly _pty: IPty;
  private readonly _cwd: string;
  private readonly _writeBuffer: string[] = [];
  private readonly _dataDisposables: IDisposable[] = [];
  private readonly _exitDisposables: IDisposable[] = [];
  private readonly _scrollbackStore: ScrollbackStore | undefined;

  constructor(id: string, pty: IPty, cwd: string, options?: PtySessionOptions) {
    super();
    this._id = id;
    this._pty = pty;
    this._cwd = cwd;
    this._scrollbackStore = options?.scrollbackStore;

    // Forward PTY events and capture to scrollback
    const dataDisposable = this._pty.onData((data: string) => {
      // Capture output to scrollback store
      if (this._scrollbackStore) {
        this._scrollbackStore.append(this._id, 'output', data);
      }
      this.emit('data', data);
    });
    this._dataDisposables.push(dataDisposable);

    const exitDisposable = this._pty.onExit((event: { exitCode: number; signal?: number }) => {
      this.emit('exit', event);
    });
    this._exitDisposables.push(exitDisposable);
  }

  /**
   * The unique ID for this session
   */
  get id(): string {
    return this._id;
  }

  /**
   * The process ID of the PTY
   */
  get pid(): number {
    return this._pty.pid;
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
    return this._pty.cols;
  }

  /**
   * The number of rows
   */
  get rows(): number {
    return this._pty.rows;
  }

  /**
   * The process name
   */
  get process(): string {
    return this._pty.process;
  }

  /**
   * Write data to the PTY
   */
  write(data: string): void {
    this._writeBuffer.push(data);
    // Capture input to scrollback store
    if (this._scrollbackStore) {
      this._scrollbackStore.append(this._id, 'input', data);
    }
    this._pty.write(data);
  }

  /**
   * Resize the PTY
   */
  resize(cols: number, rows: number): void {
    this._pty.resize(cols, rows);
  }

  /**
   * Kill the PTY process
   */
  kill(signal?: string): void {
    this._pty.kill(signal);
  }

  /**
   * Get the write buffer (for testing)
   */
  getWriteBuffer(): string[] {
    return [...this._writeBuffer];
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
    for (const disposable of this._dataDisposables) {
      disposable.dispose();
    }
    for (const disposable of this._exitDisposables) {
      disposable.dispose();
    }
    this._dataDisposables.length = 0;
    this._exitDisposables.length = 0;
    this.removeAllListeners();
  }
}
