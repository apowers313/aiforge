/**
 * PtyManager unit tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PtyManager } from '@server/services/pty/PtyManager.js';
import { createMockPty, createMockPtyFactory } from '@test/mocks/pty.js';
import type { IPtyForkOptions } from '@homebridge/node-pty-prebuilt-multiarch';

describe('PtyManager', () => {
  let manager: PtyManager;

  beforeEach(() => {
    manager = new PtyManager({ ptyFactory: createMockPtyFactory() });
  });

  afterEach(() => {
    manager.killAll();
  });

  it('spawns session and tracks by shellId', () => {
    const session = manager.spawn('shell-1', { cwd: '/tmp' });

    expect(session.id).toBe('shell-1');
    expect(manager.get('shell-1')).toBe(session);
  });

  it('kills session by shellId', () => {
    manager.spawn('shell-1', { cwd: '/tmp' });
    manager.kill('shell-1');

    expect(manager.get('shell-1')).toBeUndefined();
  });

  it('removes session on exit', async () => {
    const mockPty = createMockPty();
    manager = new PtyManager({ ptyFactory: (): typeof mockPty => mockPty });

    manager.spawn('shell-1', { cwd: '/tmp' });
    mockPty.simulateExit(0);

    // Wait for event processing
    await new Promise((r) => setTimeout(r, 10));
    expect(manager.get('shell-1')).toBeUndefined();
  });

  it('kills all sessions on shutdown', () => {
    manager.spawn('shell-1', { cwd: '/tmp' });
    manager.spawn('shell-2', { cwd: '/tmp' });

    manager.killAll();

    expect(manager.count()).toBe(0);
  });

  it('returns count of active sessions', () => {
    expect(manager.count()).toBe(0);

    manager.spawn('shell-1', { cwd: '/tmp' });
    expect(manager.count()).toBe(1);

    manager.spawn('shell-2', { cwd: '/tmp' });
    expect(manager.count()).toBe(2);

    manager.kill('shell-1');
    expect(manager.count()).toBe(1);
  });

  it('lists all sessions', () => {
    manager.spawn('shell-1', { cwd: '/tmp' });
    manager.spawn('shell-2', { cwd: '/home' });

    const sessions = manager.list();
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.id)).toContain('shell-1');
    expect(sessions.map((s) => s.id)).toContain('shell-2');
  });

  it('uses default shell if none specified', () => {
    const factoryCalls: { file: string; args: string[] }[] = [];
    manager = new PtyManager({
      ptyFactory: (file: string, args: string[], options: IPtyForkOptions): ReturnType<typeof createMockPty> => {
        factoryCalls.push({ file, args });
        return createMockPty(options);
      },
    });

    manager.spawn('shell-1', { cwd: '/tmp' });

    expect(factoryCalls).toHaveLength(1);
    expect(factoryCalls[0].file).toMatch(/bash|sh|zsh/);
  });

  it('passes environment to PTY factory', () => {
    let capturedOptions: Record<string, unknown> = {};
    manager = new PtyManager({
      ptyFactory: (_file: string, _args: string[], options: IPtyForkOptions): ReturnType<typeof createMockPty> => {
        capturedOptions = options as Record<string, unknown>;
        return createMockPty(options);
      },
    });

    manager.spawn('shell-1', {
      cwd: '/tmp',
      env: { CUSTOM_VAR: 'test-value' },
    });

    expect(capturedOptions.env).toMatchObject({ CUSTOM_VAR: 'test-value' });
  });

  it('throws error when spawning duplicate shellId', () => {
    manager.spawn('shell-1', { cwd: '/tmp' });

    expect(() => manager.spawn('shell-1', { cwd: '/tmp' }))
      .toThrow('Session shell-1 already exists');
  });

  it('returns undefined when getting non-existent session', () => {
    expect(manager.get('non-existent')).toBeUndefined();
  });

  it('handles kill of non-existent session gracefully', () => {
    // Should not throw
    manager.kill('non-existent');
  });

  it('emits session:spawned event', () => {
    const events: string[] = [];
    manager.on('session:spawned', (session: { id: string }) => {
      events.push(session.id);
    });

    manager.spawn('shell-1', { cwd: '/tmp' });

    expect(events).toContain('shell-1');
  });

  it('emits session:exited event', async () => {
    const mockPty = createMockPty();
    manager = new PtyManager({ ptyFactory: (): typeof mockPty => mockPty });

    const events: { id: string; exitCode: number }[] = [];
    manager.on('session:exited', (id: string, exitCode: number) => {
      events.push({ id, exitCode });
    });

    manager.spawn('shell-1', { cwd: '/tmp' });
    mockPty.simulateExit(42);

    await new Promise((r) => setTimeout(r, 10));

    expect(events).toContainEqual({ id: 'shell-1', exitCode: 42 });
  });

  it('sets cols and rows from options', () => {
    let capturedOptions: Record<string, unknown> = {};
    manager = new PtyManager({
      ptyFactory: (_file: string, _args: string[], options: IPtyForkOptions): ReturnType<typeof createMockPty> => {
        capturedOptions = options as Record<string, unknown>;
        return createMockPty(options);
      },
    });

    manager.spawn('shell-1', {
      cwd: '/tmp',
      cols: 120,
      rows: 40,
    });

    expect(capturedOptions.cols).toBe(120);
    expect(capturedOptions.rows).toBe(40);
  });
});
