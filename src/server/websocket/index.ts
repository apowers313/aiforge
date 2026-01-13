/**
 * WebSocket module exports
 */
export { HeartbeatManager, type HeartbeatOptions, type HeartbeatWebSocket, type HeartbeatWebSocketServer } from './heartbeat.js';
export { TerminalHandler, type TerminalMessage, type TerminalMessageType, type WebSocketLike } from './handlers/terminal.js';
export { createWebSocketServer, TerminalWebSocketServer, type WebSocketServerOptions, type ExtendedWebSocket } from './WebSocketServer.js';
