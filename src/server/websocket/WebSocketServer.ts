/**
 * WebSocketServer - WebSocket server for terminal I/O
 */
import { WebSocketServer as WsServer, type WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import { HeartbeatManager, type HeartbeatWebSocketServer } from './heartbeat.js';
import { TerminalHandler, type TerminalMessage } from './handlers/terminal.js';
import type { PtyPool } from '@server/services/pty/PtyPool.js';
import { logger } from '@server/utils/logger.js';

/**
 * Extended WebSocket with isAlive tracking
 */
export interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
}

/**
 * Options for creating a WebSocket server
 */
export interface WebSocketServerOptions {
  server: HttpServer;
  ptyPool: PtyPool;
  path?: string;
  heartbeatInterval?: number;
}

/**
 * Create and configure a WebSocket server for terminal communication
 */
export function createWebSocketServer(options: WebSocketServerOptions): WsServer {
  const {
    server,
    ptyPool,
    path = '/ws/terminal',
    heartbeatInterval = 30000,
  } = options;

  // Create WebSocket server
  const wss = new WsServer({ server, path });

  // Create terminal handler
  const terminalHandler = new TerminalHandler(ptyPool);

  // Create and start heartbeat manager
  const heartbeatManager = new HeartbeatManager(
    wss as unknown as HeartbeatWebSocketServer,
    { interval: heartbeatInterval },
  );
  heartbeatManager.start();

  // Handle new connections
  wss.on('connection', (ws: ExtendedWebSocket) => {
    logger.debug('WebSocket client connected');

    ws.isAlive = true;

    // Handle pong responses
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString('utf8')) as TerminalMessage;
        terminalHandler.handleMessage(ws, message);
      } catch (err) {
        logger.error({ err }, 'Failed to parse WebSocket message');
        ws.send(JSON.stringify({
          type: 'error',
          code: 'INVALID_MESSAGE',
          message: 'Invalid message format',
        }));
      }
    });

    // Handle close
    ws.on('close', () => {
      logger.debug('WebSocket client disconnected');
      terminalHandler.handleDisconnect(ws);
    });

    // Handle errors
    ws.on('error', (err) => {
      logger.error({ err }, 'WebSocket error');
    });
  });

  // Handle server close
  wss.on('close', () => {
    heartbeatManager.stop();
  });

  logger.info({ path }, 'WebSocket server started');

  return wss;
}

/**
 * WebSocket server wrapper for easier integration
 */
export class TerminalWebSocketServer {
  private readonly _wss: WsServer;
  private readonly _heartbeatManager: HeartbeatManager;
  private readonly _terminalHandler: TerminalHandler;

  constructor(options: WebSocketServerOptions) {
    const {
      server,
      ptyPool,
      path = '/ws/terminal',
      heartbeatInterval = 30000,
    } = options;

    // Create WebSocket server
    this._wss = new WsServer({ server, path });

    // Create terminal handler
    this._terminalHandler = new TerminalHandler(ptyPool);

    // Create heartbeat manager
    this._heartbeatManager = new HeartbeatManager(
      this._wss as unknown as HeartbeatWebSocketServer,
      { interval: heartbeatInterval },
    );

    this._setupHandlers();
  }

  private _setupHandlers(): void {
    // Handle new connections
    this._wss.on('connection', (ws: ExtendedWebSocket) => {
      logger.debug('WebSocket client connected');

      ws.isAlive = true;

      // Handle pong responses
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle incoming messages
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString('utf8')) as TerminalMessage;
          this._terminalHandler.handleMessage(ws, message);
        } catch (err) {
          logger.error({ err }, 'Failed to parse WebSocket message');
          ws.send(JSON.stringify({
            type: 'error',
            code: 'INVALID_MESSAGE',
            message: 'Invalid message format',
          }));
        }
      });

      // Handle close
      ws.on('close', () => {
        logger.debug('WebSocket client disconnected');
        this._terminalHandler.handleDisconnect(ws);
      });

      // Handle errors
      ws.on('error', (err) => {
        logger.error({ err }, 'WebSocket error');
      });
    });
  }

  /**
   * Start the heartbeat
   */
  start(): void {
    this._heartbeatManager.start();
    logger.info('WebSocket server heartbeat started');
  }

  /**
   * Stop the heartbeat and close all connections
   */
  stop(): void {
    this._heartbeatManager.stop();
    this._wss.close();
    logger.info('WebSocket server stopped');
  }

  /**
   * Get the underlying WebSocket server
   */
  get wss(): WsServer {
    return this._wss;
  }
}
