/**
 * HeartbeatManager - Manages WebSocket ping/pong heartbeats
 */

/**
 * WebSocket with isAlive tracking
 */
export interface HeartbeatWebSocket {
  isAlive: boolean;
  ping(): void;
  terminate(): void;
  on(event: 'pong' | 'close', listener: () => void): void;
}

/**
 * WebSocket server interface
 */
export interface HeartbeatWebSocketServer {
  clients: Set<HeartbeatWebSocket>;
  on(event: 'connection', listener: (ws: HeartbeatWebSocket) => void): void;
}

/**
 * Heartbeat configuration options
 */
export interface HeartbeatOptions {
  /**
   * Interval between heartbeats in milliseconds
   * @default 30000
   */
  interval?: number;

  /**
   * Timeout after which unresponsive clients are terminated
   * @default 10000
   */
  timeout?: number;
}

/**
 * HeartbeatManager handles WebSocket ping/pong to detect dead connections
 */
export class HeartbeatManager {
  private readonly _wss: HeartbeatWebSocketServer;
  private readonly _interval: number;
  private _heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(wss: HeartbeatWebSocketServer, options: HeartbeatOptions = {}) {
    this._wss = wss;
    this._interval = options.interval ?? 30000;

    // Set up connection handling
    this._wss.on('connection', (ws: HeartbeatWebSocket) => {
      ws.isAlive = true;

      ws.on('pong', () => {
        ws.isAlive = true;
      });
    });
  }

  /**
   * Start the heartbeat interval
   */
  start(): void {
    this.stop();

    this._heartbeatInterval = setInterval(() => {
      this._heartbeat();
    }, this._interval);
  }

  /**
   * Stop the heartbeat interval
   */
  stop(): void {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  /**
   * Perform a heartbeat check on all clients
   */
  private _heartbeat(): void {
    for (const ws of this._wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }

      ws.isAlive = false;
      ws.ping();
    }
  }
}
