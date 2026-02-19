/**
 * PtyDaemonManager - Manages PTY daemon processes for persistent sessions
 *
 * Unlike PtyManager which spawns PTYs directly, this manager spawns detached
 * daemon processes that survive server restarts.
 */
import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'node:child_process';
import { access, constants, unlink, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PtyDaemonClient } from './PtyDaemonClient.js';
import { type DaemonConfig, getSocketPath } from './daemon/protocol.js';
import type { ScrollbackStore } from '../../storage/stores/ScrollbackStore.js';
import { sanitizePathForShell } from './envUtils.js';
import { getSocketDir, getDataDir } from '../../paths.js';
import { logger } from '../../utils/logger.js';

/**
 * Options for spawning a PTY daemon
 */
export interface DaemonSpawnOptions {
  cwd: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string | undefined>;
  shell?: string;
}

/**
 * Options for creating a PtyDaemonManager
 */
export interface PtyDaemonManagerOptions {
  defaultShell?: string;
  scrollbackStore?: ScrollbackStore;
  remoteLoggerUrl?: string;
}

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * PtyDaemonManager spawns persistent daemon processes for PTY sessions
 */
export class PtyDaemonManager extends EventEmitter {
  private readonly _sessions = new Map<string, PtyDaemonClient>();
  private readonly _defaultShell: string;
  private readonly _scrollbackStore: ScrollbackStore | undefined;
  private readonly _remoteLoggerUrl: string | undefined;

  constructor(options: PtyDaemonManagerOptions = {}) {
    super();
    this._defaultShell = options.defaultShell ?? process.env.SHELL ?? '/bin/bash';
    this._scrollbackStore = options.scrollbackStore;
    this._remoteLoggerUrl = options.remoteLoggerUrl;
  }

  /**
   * Get the path to the daemon script and the command to run it
   * Returns [executable, ...args] - in dev mode uses tsx directly, in prod uses node
   *
   * IMPORTANT: We use tsx directly (not via npx) to avoid creating a complex process tree.
   * Using npx creates: npm → sh → node(tsx) → node(daemon), and only the first level
   * gets detached properly. By using tsx directly, the daemon is the immediate child
   * and properly detaches to survive server restarts.
   */
  private _getDaemonCommand(): [string, string[]] {
    // Check if we're in development mode (TypeScript source exists)
    const tsPath = join(__dirname, 'daemon', 'pty-daemon.ts');
    const jsPath = join(__dirname, 'daemon', 'pty-daemon.js');

    if (existsSync(tsPath)) {
      // Development mode - use tsx directly (find it in node_modules/.bin)
      // This avoids the npx process tree: npx → sh → tsx → node
      const tsxPath = join(__dirname, '..', '..', '..', '..', 'node_modules', '.bin', 'tsx');
      if (existsSync(tsxPath)) {
        return [tsxPath, [tsPath]];
      }
      // Fallback to npx if tsx binary not found (will create process tree but still works)
      return ['npx', ['tsx', tsPath]];
    }

    // Production mode - use node to run compiled JavaScript
    return [process.execPath, [jsPath]];
  }

  /**
   * Spawn a new PTY daemon and connect to it
   */
  async spawn(shellId: string, options: DaemonSpawnOptions): Promise<PtyDaemonClient> {
    logger.debug({ shellId, cwd: options.cwd }, '[DAEMON_SPAWN] Starting spawn process');

    if (this._sessions.has(shellId)) {
      logger.debug({ shellId }, '[DAEMON_SPAWN] Session already exists in memory, returning existing');
      throw new Error(`Session ${shellId} already exists`);
    }

    const socketPath = getSocketPath(shellId);

    // IMPORTANT: Separate socket existence check from attach operation
    // Previously, both were in the same try/catch, causing attach failures
    // to incorrectly trigger new daemon spawns (which then orphaned existing daemons)
    let socketExists = false;
    try {
      await access(socketPath, constants.F_OK);
      socketExists = true;
      logger.debug({ shellId, socketPath }, '[DAEMON_SPAWN] Socket file exists');
    } catch {
      logger.debug({ shellId, socketPath }, '[DAEMON_SPAWN] Socket file does not exist');
    }

    if (socketExists) {
      // Socket exists - attempt to attach to existing daemon
      logger.info({ shellId }, '[DAEMON_SPAWN] Attempting to attach to existing daemon');
      try {
        const client = await this.attach(shellId, options.cwd);
        logger.info({ shellId }, '[DAEMON_SPAWN] Successfully attached to existing daemon');
        return client;
      } catch (attachErr) {
        // Check if this is a stale socket (ECONNREFUSED means no process is listening)
        const isStaleSocket =
          attachErr instanceof Error &&
          'code' in attachErr &&
          (attachErr as NodeJS.ErrnoException).code === 'ECONNREFUSED';

        if (isStaleSocket) {
          // Stale socket - the daemon is definitely dead, safe to clean up and spawn new
          logger.warn(
            { shellId, socketPath },
            '[DAEMON_SPAWN] Detected stale socket (ECONNREFUSED). Cleaning up and spawning new daemon.',
          );
          try {
            await unlink(socketPath);
            logger.debug({ shellId, socketPath }, '[DAEMON_SPAWN] Removed stale socket file');
          } catch {
            logger.debug({ shellId, socketPath }, '[DAEMON_SPAWN] Could not remove stale socket file');
          }
          // Continue to spawn a new daemon (fall through to code below)
        } else {
          // Other error (timeout, permission, etc.) - could be a slow daemon, don't spawn new one
          const errMsg = attachErr instanceof Error ? attachErr.message : String(attachErr);
          logger.error(
            { shellId, socketPath, error: errMsg },
            '[DAEMON_SPAWN] Failed to attach to existing daemon. Socket exists but connection failed. ' +
              'NOT spawning new daemon to avoid orphaning existing process. ' +
              'This may indicate an unresponsive daemon.',
          );
          throw attachErr;
        }
      }
    }

    // Socket does not exist - safe to spawn a new daemon
    logger.info({ shellId }, '[DAEMON_SPAWN] No existing socket, spawning new daemon');

    // Ensure socket directory exists before spawning daemon
    const socketsDir = getSocketDir();
    if (!existsSync(socketsDir)) {
      await mkdir(socketsDir, { recursive: true });
    }

    const shell = options.shell ?? this._defaultShell;
    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;

    // Build daemon config
    const config: DaemonConfig = {
      shellId,
      cwd: options.cwd,
      shell,
      cols,
      rows,
      scrollbackDir: this._scrollbackStore?.directory ?? join(getDataDir(), 'scrollback'),
    };
    if (this._remoteLoggerUrl) {
      config.remoteLoggerUrl = this._remoteLoggerUrl;
    }

    // Spawn daemon process
    const [executable, baseArgs] = this._getDaemonCommand();

    // Append config JSON to the base args
    const args = [...baseArgs, JSON.stringify(config)];

    logger.debug(
      { shellId, executable, args, cwd: options.cwd, shell },
      '[DAEMON_SPAWN] Spawning daemon process',
    );

    // Use appropriate executable to run the daemon script
    // Build environment for daemon
    // If remote logger uses HTTPS with self-signed cert, we need to disable TLS verification
    const daemonEnv: Record<string, string | undefined> = {
      ...process.env,
      ...options.env,
      PATH: sanitizePathForShell(process.env.PATH),
    };
    if (this._remoteLoggerUrl?.startsWith('https://')) {
      // Allow self-signed certificates for remote logger connection
      daemonEnv.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const child: ChildProcess = spawn(executable, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: daemonEnv,
    });

    const childPid = child.pid;
    logger.debug({ shellId, pid: childPid }, '[DAEMON_SPAWN] Daemon process spawned');

    // Unref so parent can exit without waiting for daemon
    child.unref();

    // Wait for daemon to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        logger.error({ shellId, pid: childPid }, '[DAEMON_SPAWN] Daemon startup timeout after 10s');
        child.kill();
        reject(new Error('Daemon startup timeout'));
      }, 10000);

      let output = '';

      child.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
        if (output.includes('PTY daemon ready:')) {
          clearTimeout(timeout);
          logger.debug({ shellId, pid: childPid }, '[DAEMON_SPAWN] Daemon signaled ready');
          resolve();
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const stderrOutput = data.toString();
        logger.warn({ shellId, pid: childPid, stderr: stderrOutput }, '[DAEMON_SPAWN] Daemon stderr output');
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        logger.error({ shellId, pid: childPid, error: err.message }, '[DAEMON_SPAWN] Daemon process error');
        reject(err);
      });

      child.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== null && code !== 0) {
          logger.error({ shellId, pid: childPid, exitCode: code }, '[DAEMON_SPAWN] Daemon exited with non-zero code');
          reject(new Error(`Daemon exited with code ${String(code)}`));
        }
      });
    });

    // Connect to the daemon
    logger.debug({ shellId }, '[DAEMON_SPAWN] Connecting to newly spawned daemon');
    const client = new PtyDaemonClient(shellId, options.cwd, cols, rows);
    await client.connect();

    // Track the session
    this._sessions.set(shellId, client);
    this._setupClientEvents(client, shellId);

    logger.info({ shellId, pid: childPid }, '[DAEMON_SPAWN] Daemon spawn complete, session active');
    this.emit('session:spawned', client);

    return client;
  }

  /**
   * Attach to an existing daemon
   */
  async attach(shellId: string, cwd: string): Promise<PtyDaemonClient> {
    logger.debug({ shellId, cwd }, '[DAEMON_ATTACH] Starting attach process');

    const existingSession = this._sessions.get(shellId);
    if (existingSession) {
      logger.debug({ shellId }, '[DAEMON_ATTACH] Returning existing session from memory');
      return existingSession;
    }

    const socketPath = getSocketPath(shellId);
    logger.debug({ shellId, socketPath }, '[DAEMON_ATTACH] Checking socket exists');

    // Verify socket exists
    await access(socketPath, constants.F_OK);

    // Create client and connect
    logger.debug({ shellId }, '[DAEMON_ATTACH] Socket verified, creating client and connecting');
    const client = new PtyDaemonClient(shellId, cwd);

    try {
      await client.connect();
      logger.info({ shellId }, '[DAEMON_ATTACH] Successfully connected to daemon');
    } catch (connectErr) {
      const errMsg = connectErr instanceof Error ? connectErr.message : String(connectErr);
      logger.error(
        { shellId, socketPath, error: errMsg },
        '[DAEMON_ATTACH] Failed to connect to daemon socket',
      );
      throw connectErr;
    }

    // Track the session
    this._sessions.set(shellId, client);
    this._setupClientEvents(client, shellId);

    this.emit('session:attached', client);

    return client;
  }

  /**
   * Set up event handlers for a client
   */
  private _setupClientEvents(client: PtyDaemonClient, shellId: string): void {
    // Handle data events - write to scrollback and emit separate input/output events
    // This allows ShellService to distinguish input from output for activity tracking
    client.on('data', (data: string) => {
      // Write to scrollback store for replay
      if (this._scrollbackStore) {
        this._scrollbackStore.append(shellId, 'output', data);
      }
      this.emit('session:output', shellId);
    });
    client.on('input', (data: string) => {
      // Write input to scrollback store
      if (this._scrollbackStore) {
        this._scrollbackStore.append(shellId, 'input', data);
      }
      this.emit('session:input', shellId);
    });

    // Handle exit - this fires when the PTY process inside the daemon exits
    client.on('exit', (event: { exitCode: number }) => {
      logger.info(
        { shellId, exitCode: event.exitCode },
        '[DAEMON_SESSION] Session exited - PTY process terminated',
      );
      this._sessions.delete(shellId);
      client.dispose();
      this.emit('session:exited', shellId, event.exitCode);
    });

    // Handle errors on the client connection
    client.on('error', (err: Error) => {
      logger.error(
        { shellId, error: err.message },
        '[DAEMON_SESSION] Client connection error',
      );
    });
  }

  /**
   * Check if a daemon socket exists for a shell
   */
  async has(shellId: string): Promise<boolean> {
    // Check in-memory first
    if (this._sessions.has(shellId)) {
      return true;
    }

    // Check if socket file exists
    const socketPath = getSocketPath(shellId);
    try {
      await access(socketPath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a session by ID (from memory only)
   */
  get(shellId: string): PtyDaemonClient | undefined {
    return this._sessions.get(shellId);
  }

  /**
   * Kill a session by ID
   */
  async kill(shellId: string): Promise<void> {
    logger.info({ shellId }, '[DAEMON_KILL] Killing session');

    const session = this._sessions.get(shellId);
    if (session) {
      logger.debug({ shellId }, '[DAEMON_KILL] Session found in memory, sending kill signal');
      session.kill();
      session.dispose();
      this._sessions.delete(shellId);
      // Emit session:exited event so clients are notified of the closure
      // The exit event from the daemon won't fire since we disposed the session
      this.emit('session:exited', shellId, 0);
    } else {
      logger.debug({ shellId }, '[DAEMON_KILL] No session in memory');
    }

    // Also remove the socket file if it exists
    const socketPath = getSocketPath(shellId);
    try {
      await unlink(socketPath);
      logger.debug({ shellId, socketPath }, '[DAEMON_KILL] Socket file removed');
    } catch {
      logger.debug({ shellId, socketPath }, '[DAEMON_KILL] Socket file did not exist or could not be removed');
    }
  }

  /**
   * Kill all sessions
   */
  async killAll(): Promise<void> {
    const ids = Array.from(this._sessions.keys());
    await Promise.all(ids.map((id) => this.kill(id)));
  }

  /**
   * Disconnect from all sessions without killing daemons
   * Use this during server shutdown to keep daemons running
   */
  disconnectAll(): void {
    for (const session of this._sessions.values()) {
      session.dispose();
    }
    this._sessions.clear();
  }

  /**
   * Get the count of connected sessions
   */
  count(): number {
    return this._sessions.size;
  }

  /**
   * List all connected sessions
   */
  list(): PtyDaemonClient[] {
    return Array.from(this._sessions.values());
  }

  /**
   * Find orphaned daemon sockets (sockets without database records)
   * Returns socket paths that should be cleaned up
   */
  async findOrphanedSockets(validShellIds: string[]): Promise<string[]> {
    const orphans: string[] = [];
    const validSet = new Set(validShellIds);
    const socketsDir = getSocketDir();

    try {
      const files = await readdir(socketsDir);
      for (const file of files) {
        if (file.endsWith('.sock')) {
          const shellId = file.replace('.sock', '');
          if (!validSet.has(shellId)) {
            orphans.push(join(socketsDir, file));
          }
        }
      }
    } catch {
      // Socket dir doesn't exist or can't be read
    }

    return orphans;
  }

  /**
   * Clean up orphaned sockets
   */
  async cleanupOrphanedSockets(validShellIds: string[]): Promise<void> {
    const orphans = await this.findOrphanedSockets(validShellIds);
    await Promise.all(
      orphans.map(async (socketPath) => {
        try {
          await unlink(socketPath);
        } catch {
          // Ignore errors
        }
      }),
    );
  }

  /**
   * Get the scrollback store (for replay on attach)
   */
  get scrollbackStore(): ScrollbackStore | undefined {
    return this._scrollbackStore;
  }
}
