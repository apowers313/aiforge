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

const { shellId, cwd, shell, cols, rows, scrollbackDir } = config;
const socketPath = getSocketPath(shellId);

// Track connected clients
const clients = new Set<Socket>();
let pty: IPty | null = null;
let isShuttingDown = false;

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
    await unlink(socketPath);
  } catch {
    // Socket doesn't exist, that's fine
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(code: number): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  // Close all client connections
  for (const client of clients) {
    client.destroy();
  }
  clients.clear();

  // Kill PTY if still running
  if (pty) {
    try {
      pty.kill();
    } catch {
      // PTY might already be dead
    }
    pty = null;
  }

  // Clean up socket
  await cleanupSocket();

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
  clients.add(client);

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
  });

  client.on('error', (err) => {
    console.error('Client error:', err.message);
    clients.delete(client);
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Handle SIGHUP - ignore it so we survive parent death
  process.on('SIGHUP', () => {
    // Intentionally ignore
  });

  // Handle SIGTERM for graceful shutdown
  process.on('SIGTERM', () => {
    void shutdown(0);
  });

  // Handle SIGINT for graceful shutdown
  process.on('SIGINT', () => {
    void shutdown(0);
  });

  // Clean up any stale socket from previous run
  await cleanupSocket();

  // Spawn the PTY
  try {
    pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: process.env as Record<string, string>,
    });
  } catch (err) {
    console.error('Failed to spawn PTY:', err);
    process.exit(1);
  }

  // Forward PTY data to all clients and scrollback
  pty.onData((data: string) => {
    broadcast({ type: 'data', data });
    void writeScrollback('output', data);
  });

  // Handle PTY exit
  pty.onExit((event: { exitCode: number; signal?: number }) => {
    const exitMessage: DaemonMessage = event.signal !== undefined
      ? { type: 'exit', code: event.exitCode, signal: event.signal }
      : { type: 'exit', code: event.exitCode };
    broadcast(exitMessage);
    void shutdown(event.exitCode);
  });

  // Create Unix socket server
  const server = createServer(handleClient);

  server.on('error', (err) => {
    console.error('Socket server error:', err);
    void shutdown(1);
  });

  // Start listening
  server.listen(socketPath, () => {
    // Set socket permissions to owner-only
    void chmod(socketPath, 0o600);

    // Signal that we're ready by writing to stdout
    // The parent process waits for this
    console.log(`PTY daemon ready: ${socketPath}`);
  });
}

// Run main
void main();
