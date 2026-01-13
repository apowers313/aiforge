/**
 * PtySession unit tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PtySession } from '@server/services/pty/PtySession.js';
import { createMockPty, type MockPty } from '@test/mocks/pty.js';

describe('PtySession', () => {
  let mockPty: MockPty;

  beforeEach(() => {
    mockPty = createMockPty({ uid: 12345 });
  });

  it('wraps PTY with event emitter interface', () => {
    const session = new PtySession('shell-1', mockPty, '/tmp');

    expect(session.id).toBe('shell-1');
    expect(session.pid).toBe(12345);
    expect(session.cwd).toBe('/tmp');
  });

  it('forwards write to PTY', () => {
    const session = new PtySession('shell-1', mockPty, '/tmp');

    session.write('ls\r');
    expect(mockPty.write).toHaveBeenCalledWith('ls\r');
  });

  it('emits data events from PTY', async () => {
    const session = new PtySession('shell-1', mockPty, '/tmp');

    const dataPromise = new Promise((resolve) => session.on('data', resolve));
    mockPty.simulateData('output');

    expect(await dataPromise).toBe('output');
  });

  it('handles resize', () => {
    const session = new PtySession('shell-1', mockPty, '/tmp');

    session.resize(120, 40);
    expect(mockPty.resize).toHaveBeenCalledWith(120, 40);
  });

  it('emits exit event', async () => {
    const session = new PtySession('shell-1', mockPty, '/tmp');

    const exitPromise = new Promise((resolve) => session.on('exit', resolve));
    mockPty.simulateExit(0);

    expect(await exitPromise).toEqual({ exitCode: 0, signal: undefined });
  });

  it('emits exit event with signal', async () => {
    const session = new PtySession('shell-1', mockPty, '/tmp');

    const exitPromise = new Promise((resolve) => session.on('exit', resolve));
    mockPty.simulateExit(137, 9);

    expect(await exitPromise).toEqual({ exitCode: 137, signal: 9 });
  });

  it('kills the underlying PTY', () => {
    const session = new PtySession('shell-1', mockPty, '/tmp');

    session.kill();
    expect(mockPty.kill).toHaveBeenCalled();
  });

  it('kills with signal', () => {
    const session = new PtySession('shell-1', mockPty, '/tmp');

    session.kill('SIGKILL');
    expect(mockPty.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('returns cols and rows from PTY', () => {
    mockPty.cols = 100;
    mockPty.rows = 50;
    const session = new PtySession('shell-1', mockPty, '/tmp');

    expect(session.cols).toBe(100);
    expect(session.rows).toBe(50);
  });

  it('tracks write buffer for testing', () => {
    const session = new PtySession('shell-1', mockPty, '/tmp');

    session.write('first');
    session.write('second');

    expect(session.getWriteBuffer()).toEqual(['first', 'second']);
  });

  it('returns process name from PTY', () => {
    const session = new PtySession('shell-1', mockPty, '/tmp');

    expect(session.process).toBe('/bin/bash');
  });

  it('removes data listener on dispose', () => {
    const session = new PtySession('shell-1', mockPty, '/tmp');
    const callback = vi.fn();

    const dispose = session.onData(callback);
    mockPty.simulateData('test1');
    expect(callback).toHaveBeenCalledWith('test1');

    dispose();
    mockPty.simulateData('test2');
    // Should not be called again after dispose
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('removes exit listener on dispose', () => {
    const session = new PtySession('shell-1', mockPty, '/tmp');
    const callback = vi.fn();

    const dispose = session.onExit(callback);
    dispose();

    mockPty.simulateExit(0);
    // Should not be called after dispose
    expect(callback).not.toHaveBeenCalled();
  });
});
