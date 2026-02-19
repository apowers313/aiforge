/**
 * PtyManager Live Integration Tests
 * These tests spawn real shell processes
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PtyManager } from '@server/services/pty/PtyManager.js';
import { waitFor } from '@test/helpers/websocket.js';

describe('PtyManager (Live)', () => {
  let manager: PtyManager;

  beforeEach(() => {
    manager = new PtyManager(); // Real PTY
  });

  afterEach(() => {
    manager.killAll();
  });

  it('spawns real shell process', () => {
    const session = manager.spawn('test', { cwd: '/tmp' });

    expect(session.pid).toBeGreaterThan(0);
  });

  it('executes commands and returns output', async () => {
    const session = manager.spawn('test', { cwd: '/tmp' });

    let output = '';
    session.on('data', (data: string) => {
      output += data;
    });

    session.write('echo "live-test-output"\r');

    await waitFor(() => output.includes('live-test-output'), { timeout: 5000 });

    expect(output).toContain('live-test-output');
  });

  it('handles resize', async () => {
    const session = manager.spawn('test', { cwd: '/tmp' });

    session.resize(100, 30);

    let output = '';
    session.on('data', (data: string) => {
      output += data;
    });
    session.write('stty size\r');

    await waitFor(() => output.includes('30') && output.includes('100'), { timeout: 5000 });

    // stty size output should contain rows and cols
    expect(output).toMatch(/30.*100|100.*30/);
  });

  it('handles process exit', async () => {
    const session = manager.spawn('test', { cwd: '/tmp' });

    let exitEvent: { exitCode: number } | null = null;
    session.on('exit', (event: { exitCode: number }) => {
      exitEvent = event;
    });

    session.write('exit\r');

    await waitFor(() => exitEvent !== null, { timeout: 5000 });

    expect(exitEvent).toBeDefined();
    expect(exitEvent).not.toBeNull();
    expect((exitEvent as unknown as { exitCode: number }).exitCode).toBe(0);
  });

  it('runs command in specified directory', async () => {
    const session = manager.spawn('test', { cwd: '/tmp' });

    let output = '';
    session.on('data', (data: string) => {
      output += data;
    });

    session.write('pwd\r');

    await waitFor(() => output.includes('/tmp'), { timeout: 5000 });

    expect(output).toContain('/tmp');
  });

  it('handles multiple concurrent sessions', async () => {
    const session1 = manager.spawn('test1', { cwd: '/tmp' });
    const session2 = manager.spawn('test2', { cwd: '/tmp' });

    let output1 = '';
    let output2 = '';

    session1.on('data', (data: string) => {
      output1 += data;
    });
    session2.on('data', (data: string) => {
      output2 += data;
    });

    session1.write('echo "session1"\r');
    session2.write('echo "session2"\r');

    await waitFor(() => output1.includes('session1') && output2.includes('session2'), { timeout: 5000 });

    expect(output1).toContain('session1');
    expect(output2).toContain('session2');
  });

  it('removes session from manager on exit', async () => {
    manager.spawn('test', { cwd: '/tmp' });

    expect(manager.get('test')).toBeDefined();

    const session = manager.get('test');
    if (!session) {
      throw new Error('Session not found');
    }
    session.write('exit\r');

    await waitFor(() => manager.get('test') === undefined, { timeout: 5000 });

    expect(manager.get('test')).toBeUndefined();
  });
});
