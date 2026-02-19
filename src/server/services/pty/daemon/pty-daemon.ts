#!/usr/bin/env node
/**
 * PTY Daemon - Standalone process that manages a persistent PTY session
 *
 * This script is spawned as a detached child process and survives server restarts.
 * Communication happens over a Unix domain socket.
 *
 * Usage: node pty-daemon.js <config-json>
 *
 * The config JSON should contain: shellId, cwd, shell, cols, rows, scrollbackDir
 */

import { createServer, type Socket } from 'node:net';
import { spawn } from '@homebridge/node-pty-prebuilt-multiarch';
import type { IPty } from '@homebridge/node-pty-prebuilt-multiarch';
import { appendFile, mkdir, unlink, access, constants, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { RemoteLogClient } from '@graphty/remote-logger';
import {
  type DaemonConfig,
  type DaemonMessage,
  type ClientMessage,
  getSocketPath,
  encodeMessage,
  parseMessages,
} from './protocol.js';

// Parse configuration from command line
const configArg = process.argv[2];
if (!configArg) {
  console.error('Usage: pty-daemon <config-json>');
  process.exit(1);
}

let config: DaemonConfig;
try {
  config = JSON.parse(configArg) as DaemonConfig;
} catch {
  console.error('Invalid config JSON');
  process.exit(1);
}

const { shellId, cwd, shell, cols, rows, scrollbackDir, remoteLoggerUrl } = config;
const socketPath = getSocketPath(shellId);

// Track connected clients and server state
const clients = new Set<Socket>();
let pty: IPty | null = null;
let isShuttingDown = false;
let socketServer: ReturnType<typeof createServer> | null = null;

// Track startup time for uptime reporting
const startTime = Date.now();
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

// Initialize remote logger if URL is provided
let remoteLogger: RemoteLogClient | null = null;
if (remoteLoggerUrl) {
  remoteLogger = new RemoteLogClient({
    serverUrl: remoteLoggerUrl,
    projectMarker: 'aiforge',
    sessionPrefix: `pty-daemon-${shellId.slice(0, 8)}`,
    worktreePath: cwd,
  });
}

/**
 * Log helper with timestamp and shellId prefix for debugging
 * Logs to both console (for startup capture) and remote logger (for runtime debugging)
 */
function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [PTY_DAEMON:${shellId.slice(0, 8)}] [${level}]`;
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';

  // Log to console (captured during startup by parent process)
  if (level === 'ERROR') {
    console.error(`${prefix} ${message}${dataStr}`);
  } else {
    console.log(`${prefix} ${message}${dataStr}`);
  }

  // Log to remote logger (visible at runtime)
  if (remoteLogger) {
    const logLevel = level === 'DEBUG' ? 'DEBUG' : level === 'WARN' ? 'WARN' : level === 'ERROR' ? 'ERROR' : 'INFO';
    remoteLogger.log(logLevel, `[PTY_DAEMON:${shellId.slice(0, 8)}] ${message}`, data);
  }
}

/**
 * Format milliseconds as human-readable duration
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${String(days)}d ${String(hours % 24)}h ${String(minutes % 60)}m`;
  if (hours > 0) return `${String(hours)}h ${String(minutes % 60)}m`;
  if (minutes > 0) return `${String(minutes)}m ${String(seconds % 60)}s`;
  return `${String(seconds)}s`;
}

/**
 * Periodic heartbeat - logs daemon health status to remote-logger
 * This creates "last known alive" timestamps to narrow down death windows
 */
async function heartbeat(): Promise<void> {
  const mem = process.memoryUsage();
  const uptimeMs = Date.now() - startTime;

  // Check if socket file still exists (could be cleaned by systemd-tmpfiles)
  let socketExists = false;
  try {
    await access(socketPath, constants.F_OK);
    socketExists = true;
  } catch {
    // Socket file is gone
  }

  log('INFO', '[HEARTBEAT] Daemon alive', {
    pid: process.pid,
    ppid: process.ppid,
    uptime: formatUptime(uptimeMs),
    uptimeMs,
    ptyPid: pty?.pid ?? null,
    clientCount: clients.size,
    socketExists,
    memoryMB: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
    },
  });

  // Warn if socket file has disappeared while daemon is still running
  if (!socketExists && !isShuttingDown) {
    log('ERROR', '[HEARTBEAT] Socket file has disappeared while daemon is running!', {
      socketPath,
      pid: process.pid,
      uptimeMs,
    });
  }
}

/**
 * Start periodic heartbeat logging
 */
function startHeartbeat(): void {
  // Log heartbeat every 5 minutes
  const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
  heartbeatInterval = setInterval(() => {
    void heartbeat();
  }, HEARTBEAT_INTERVAL_MS);
  // Don't prevent process exit
  heartbeatInterval.unref();
}

/**
 * Write scrollback entry to disk
 */
async function writeScrollback(type: 'output' | 'input', data: string): Promise<void> {
  try {
    await mkdir(scrollbackDir, { recursive: true });
    const filePath = join(scrollbackDir, `${shellId}.jsonl`);
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      type,
      data,
    });
    await appendFile(filePath, entry + '\n', 'utf-8');
  } catch (err) {
    // Log but don't crash on scrollback errors
    console.error('Scrollback write error:', err);
  }
}

/**
 * Send a message to all connected clients
 */
function broadcast(message: DaemonMessage): void {
  const encoded = encodeMessage(message);
  for (const client of clients) {
    if (!client.destroyed) {
      client.write(encoded);
    }
  }
}

/**
 * Clean up socket file
 */
async function cleanupSocket(): Promise<void> {
  try {
    await access(socketPath, constants.F_OK);
    log('INFO', 'Removing socket file', { socketPath });
    await unlink(socketPath);
    log('DEBUG', 'Socket file removed successfully');
  } catch {
    log('DEBUG', 'Socket file did not exist or could not be removed', { socketPath });
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(code: number, reason: string): Promise<void> {
  if (isShuttingDown) {
    log('DEBUG', 'Shutdown already in progress, ignoring duplicate call');
    return;
  }
  isShuttingDown = true;

  // Stop heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  const uptimeMs = Date.now() - startTime;
  log('INFO', 'Starting graceful shutdown', {
    exitCode: code,
    reason,
    clientCount: clients.size,
    uptime: formatUptime(uptimeMs),
    uptimeMs,
    pid: process.pid,
  });

  // IMPORTANT: Close socket server FIRST to prevent new connections during shutdown
  // This fixes a race condition where new clients could connect and receive 'ready'
  // but then immediately see the socket close (causing exitCode: -1 on client side)
  if (socketServer) {
    log('DEBUG', 'Closing socket server to reject new connections');
    socketServer.close();
    socketServer = null;
  }

  // Close all client connections
  for (const client of clients) {
    client.destroy();
  }
  clients.clear();
  log('DEBUG', 'All client connections closed');

  // Kill PTY if still running
  if (pty) {
    try {
      log('DEBUG', 'Killing PTY process');
      pty.kill();
    } catch {
      log('DEBUG', 'PTY was already dead');
    }
    pty = null;
  }

  // Clean up socket
  await cleanupSocket();

  log('INFO', 'Shutdown complete, exiting', { exitCode: code });

  // Flush remote logger to ensure final logs are transmitted
  if (remoteLogger) {
    try {
      await remoteLogger.flush();
      // Small delay to allow the HTTP request to complete
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch {
      // Best effort - don't prevent exit
    }
  }

  process.exit(code);
}

/**
 * Handle client messages
 */
function handleClientMessage(message: ClientMessage): void {
  if (!pty) return;

  switch (message.type) {
    case 'input':
      pty.write(message.data);
      // Fire and forget scrollback write
      void writeScrollback('input', message.data);
      break;

    case 'resize':
      pty.resize(message.cols, message.rows);
      break;

    case 'ping':
      broadcast({ type: 'pong' });
      break;

    case 'kill':
      pty.kill(message.signal);
      break;
  }
}

/**
 * Handle a new client connection
 */
function handleClient(client: Socket): void {
  // Reject connections during shutdown to prevent race conditions
  if (isShuttingDown) {
    log('DEBUG', 'Rejecting connection during shutdown');
    client.destroy();
    return;
  }

  clients.add(client);
  log('DEBUG', 'Client connected', { clientCount: clients.size });

  let buffer = '';

  // Send ready message to new client
  client.write(encodeMessage({ type: 'ready' }));

  client.on('data', (data: Buffer) => {
    buffer += data.toString('utf-8');

    const { messages, remaining } = parseMessages(buffer);
    buffer = remaining;

    for (const message of messages) {
      handleClientMessage(message as ClientMessage);
    }
  });

  client.on('close', () => {
    clients.delete(client);
    log('DEBUG', 'Client disconnected', { clientCount: clients.size });
  });

  client.on('error', (err) => {
    log('WARN', 'Client error', { error: err.message });
    clients.delete(client);
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Enhanced startup diagnostics
  log('INFO', 'Daemon starting', {
    pid: process.pid,
    ppid: process.ppid,
    cwd,
    shell,
    cols,
    rows,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  });

  // --- Broken Pipe Protection ---
  // The daemon's stdout/stderr are pipes back to the parent server process.
  // When the server restarts (tsx watch, SIGTERM, etc.), the pipe read-ends close.
  // Without these handlers, the next console.log/console.error would cause an
  // EPIPE error on process.stdout/stderr, which becomes an uncaughtException,
  // which triggers daemon shutdown -- killing the shell the user was working in.
  // After startup, all runtime logging goes through the remote logger (HTTP),
  // so broken stdout/stderr pipes are harmless and should be silently ignored.
  process.stdout.on('error', () => { /* ignore EPIPE from broken pipe */ });
  process.stderr.on('error', () => { /* ignore EPIPE from broken pipe */ });

  // --- Signal Handlers ---

  // Handle SIGHUP - ignore it so we survive parent death
  process.on('SIGHUP', () => {
    log('DEBUG', 'Received SIGHUP, ignoring (to survive parent death)');
  });

  // Handle SIGTERM for graceful shutdown
  process.on('SIGTERM', () => {
    log('INFO', 'Received SIGTERM signal');
    void shutdown(0, 'SIGTERM received');
  });

  // Handle SIGINT for graceful shutdown
  process.on('SIGINT', () => {
    log('INFO', 'Received SIGINT signal');
    void shutdown(0, 'SIGINT received');
  });

  // Handle SIGQUIT for graceful shutdown (core dump signal)
  process.on('SIGQUIT', () => {
    log('INFO', 'Received SIGQUIT signal');
    void shutdown(0, 'SIGQUIT received');
  });

  // Handle SIGPIPE - broken pipe, can happen when writing to closed socket
  process.on('SIGPIPE', () => {
    log('WARN', 'Received SIGPIPE signal (broken pipe)', { pid: process.pid });
  });

  // Handle SIGUSR1/SIGUSR2 - diagnostic signals, log but don't exit
  process.on('SIGUSR1', () => {
    log('INFO', '[DIAGNOSTIC] Received SIGUSR1', {
      pid: process.pid,
      ppid: process.ppid,
      uptime: formatUptime(Date.now() - startTime),
      clientCount: clients.size,
      ptyPid: pty?.pid ?? null,
    });
    // Trigger an immediate heartbeat for diagnostics
    void heartbeat();
  });

  process.on('SIGUSR2', () => {
    log('INFO', '[DIAGNOSTIC] Received SIGUSR2', {
      pid: process.pid,
      ppid: process.ppid,
      uptime: formatUptime(Date.now() - startTime),
      clientCount: clients.size,
      ptyPid: pty?.pid ?? null,
      memory: process.memoryUsage(),
    });
  });

  // --- Process Event Handlers ---

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    log('ERROR', 'Uncaught exception', { error: err.message, stack: err.stack });
    void shutdown(1, `Uncaught exception: ${err.message}`);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    log('ERROR', 'Unhandled promise rejection', { reason: message });
    void shutdown(1, `Unhandled rejection: ${message}`);
  });

  // Log Node.js warnings (memory pressure, deprecations, etc.)
  process.on('warning', (warning) => {
    log('WARN', 'Node.js warning', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
    });
  });

  // Log when event loop is about to drain (shouldn't happen for long-running daemon)
  process.on('beforeExit', (code) => {
    log('WARN', 'Event loop draining (beforeExit) - daemon should not reach this', {
      exitCode: code,
      pid: process.pid,
      uptime: formatUptime(Date.now() - startTime),
    });
  });

  // Final synchronous log before exit - last chance to record anything
  process.on('exit', (code) => {
    const uptimeMs = Date.now() - startTime;
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [PTY_DAEMON:${shellId.slice(0, 8)}] [INFO]`;
    // Use console directly since remote logger won't work synchronously
    console.log(`${prefix} Process exiting`, JSON.stringify({
      exitCode: code,
      pid: process.pid,
      ppid: process.ppid,
      uptime: formatUptime(uptimeMs),
      uptimeMs,
      wasShuttingDown: isShuttingDown,
    }));
  });

  // Clean up any stale socket from previous run
  log('DEBUG', 'Cleaning up any stale socket from previous run');
  await cleanupSocket();

  // Spawn the PTY
  log('DEBUG', 'Spawning PTY process', { shell, cwd });
  try {
    pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        PATH: (process.env.PATH ?? '').split(':').filter((p) => !p.includes('node_modules/.bin')).join(':'),
      } as Record<string, string>,
    });
    log('INFO', 'PTY process spawned', { ptyPid: pty.pid });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log('ERROR', 'Failed to spawn PTY', { error: errMsg });
    process.exit(1);
  }

  // Forward PTY data to all clients and scrollback
  pty.onData((data: string) => {
    broadcast({ type: 'data', data });
    void writeScrollback('output', data);
  });

  // Handle PTY exit - THIS IS THE KEY EVENT for shell restarts
  pty.onExit((event: { exitCode: number; signal?: number }) => {
    log('INFO', 'PTY process exited', {
      exitCode: event.exitCode,
      signal: event.signal,
      reason: 'Shell process terminated (user exit, crash, or kill)',
    });
    const exitMessage: DaemonMessage = event.signal !== undefined
      ? { type: 'exit', code: event.exitCode, signal: event.signal }
      : { type: 'exit', code: event.exitCode };
    broadcast(exitMessage);
    void shutdown(event.exitCode, `PTY exited with code ${String(event.exitCode)}${event.signal !== undefined ? `, signal ${String(event.signal)}` : ''}`);
  });

  // Create Unix socket server and store reference for graceful shutdown
  socketServer = createServer(handleClient);

  socketServer.on('error', (err) => {
    log('ERROR', 'Socket server error', { error: err.message });
    void shutdown(1, `Socket server error: ${err.message}`);
  });

  // Start listening
  socketServer.listen(socketPath, () => {
    // Set socket permissions to owner-only
    void chmod(socketPath, 0o600);

    log('INFO', 'Socket server listening', { socketPath });
    // Signal that we're ready by writing to stdout
    // The parent process waits for this
    console.log(`PTY daemon ready: ${socketPath}`);

    // Start periodic heartbeat after daemon is fully ready
    startHeartbeat();
  });
}

// Run main
void main();
