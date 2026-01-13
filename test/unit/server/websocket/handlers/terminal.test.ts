/**
 * TerminalHandler unit tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TerminalHandler } from '@server/websocket/handlers/terminal.js';
import { PtyManager } from '@server/services/pty/PtyManager.js';
import { createMockPty, createMockPtyFactory } from '@test/mocks/pty.js';
import { createMockWebSocket, type MockWebSocket } from '@test/mocks/websocket.js';

describe('TerminalHandler', () => {
  let handler: TerminalHandler;
  let ptyManager: PtyManager;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    ptyManager = new PtyManager({ ptyFactory: createMockPtyFactory() });
    handler = new TerminalHandler(ptyManager);
    mockWs = createMockWebSocket();
  });

  afterEach(() => {
    ptyManager.killAll();
  });

  it('handles input message', () => {
    ptyManager.spawn('shell-1', { cwd: '/tmp' });

    handler.handleMessage(mockWs, {
      type: 'input',
      shellId: 'shell-1',
      data: 'ls\r',
    });

    const session = ptyManager.get('shell-1');
    expect(session?.getWriteBuffer()).toContain('ls\r');
  });

  it('handles resize message', () => {
    const mockPty = createMockPty();
    ptyManager = new PtyManager({ ptyFactory: (): typeof mockPty => mockPty });
    handler = new TerminalHandler(ptyManager);

    ptyManager.spawn('shell-1', { cwd: '/tmp' });

    handler.handleMessage(mockWs, {
      type: 'resize',
      shellId: 'shell-1',
      cols: 100,
      rows: 30,
    });

    expect(mockPty.resize).toHaveBeenCalledWith(100, 30);
  });

  it('sends output to WebSocket', () => {
    const mockPty = createMockPty();
    ptyManager = new PtyManager({ ptyFactory: (): typeof mockPty => mockPty });
    handler = new TerminalHandler(ptyManager);

    ptyManager.spawn('shell-1', { cwd: '/tmp' });
    handler.attachClient(mockWs, 'shell-1');

    mockPty.simulateData('output data');

    expect(mockWs.sent).toContainEqual({
      type: 'output',
      shellId: 'shell-1',
      data: 'output data',
    });
  });

  it('sends status updates', async () => {
    const mockPty = createMockPty();
    ptyManager = new PtyManager({ ptyFactory: (): typeof mockPty => mockPty });
    handler = new TerminalHandler(ptyManager);

    ptyManager.spawn('shell-1', { cwd: '/tmp' });
    handler.attachClient(mockWs, 'shell-1');

    mockPty.simulateExit(0);

    await vi.waitFor(() => {
      expect(mockWs.sent).toContainEqual({
        type: 'status',
        shellId: 'shell-1',
        status: 'exited',
        exitCode: 0,
      });
    });
  });

  it('handles attach message', () => {
    const mockPty = createMockPty();
    ptyManager = new PtyManager({ ptyFactory: (): typeof mockPty => mockPty });
    handler = new TerminalHandler(ptyManager);

    ptyManager.spawn('shell-1', { cwd: '/tmp' });

    handler.handleMessage(mockWs, {
      type: 'attach',
      shellId: 'shell-1',
    });

    mockPty.simulateData('test output');

    expect(mockWs.sent).toContainEqual({
      type: 'output',
      shellId: 'shell-1',
      data: 'test output',
    });
  });

  it('handles detach message', () => {
    const mockPty = createMockPty();
    ptyManager = new PtyManager({ ptyFactory: (): typeof mockPty => mockPty });
    handler = new TerminalHandler(ptyManager);

    ptyManager.spawn('shell-1', { cwd: '/tmp' });
    handler.attachClient(mockWs, 'shell-1');

    // Clear previous messages
    mockWs.clearSent();

    handler.handleMessage(mockWs, {
      type: 'detach',
      shellId: 'shell-1',
    });

    mockPty.simulateData('should not receive');

    // Should not receive output after detach
    expect(mockWs.sent).not.toContainEqual(
      expect.objectContaining({ type: 'output' }),
    );
  });

  it('sends error for unknown shell', () => {
    handler.handleMessage(mockWs, {
      type: 'input',
      shellId: 'non-existent',
      data: 'test',
    });

    expect(mockWs.sent).toContainEqual({
      type: 'error',
      code: 'SHELL_NOT_FOUND',
      message: 'Shell non-existent not found',
    });
  });

  it('cleans up client attachments on disconnect', () => {
    const mockPty = createMockPty();
    ptyManager = new PtyManager({ ptyFactory: (): typeof mockPty => mockPty });
    handler = new TerminalHandler(ptyManager);

    ptyManager.spawn('shell-1', { cwd: '/tmp' });
    handler.attachClient(mockWs, 'shell-1');

    // Old WebSocket should receive data before disconnect
    mockPty.simulateData('before disconnect');
    expect(mockWs.sent).toContainEqual({
      type: 'output',
      shellId: 'shell-1',
      data: 'before disconnect',
    });

    // Disconnect old WebSocket
    handler.handleDisconnect(mockWs);
    mockWs.clearSent();

    // Create new WebSocket and attach it
    const newWs = createMockWebSocket();
    handler.attachClient(newWs, 'shell-1');

    mockPty.simulateData('after disconnect');

    // Old WebSocket should NOT receive data after disconnect
    expect(mockWs.sent.filter((m) => (m as Record<string, unknown>).type === 'output')).toHaveLength(0);
    // New WebSocket should receive data
    expect(newWs.sent).toContainEqual({
      type: 'output',
      shellId: 'shell-1',
      data: 'after disconnect',
    });
  });

  it('handles multiple clients attached to same shell', () => {
    const mockPty = createMockPty();
    ptyManager = new PtyManager({ ptyFactory: (): typeof mockPty => mockPty });
    handler = new TerminalHandler(ptyManager);

    ptyManager.spawn('shell-1', { cwd: '/tmp' });

    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();

    handler.attachClient(ws1, 'shell-1');
    handler.attachClient(ws2, 'shell-1');

    mockPty.simulateData('broadcast');

    expect(ws1.sent).toContainEqual({
      type: 'output',
      shellId: 'shell-1',
      data: 'broadcast',
    });
    expect(ws2.sent).toContainEqual({
      type: 'output',
      shellId: 'shell-1',
      data: 'broadcast',
    });
  });

  it('ignores unknown message types', () => {
    // Should not throw
    handler.handleMessage(mockWs, {
      type: 'unknown_type' as string,
      shellId: 'shell-1',
    });

    expect(mockWs.sent).toEqual([]);
  });
});
