/**
 * WebSocketServer unit tests
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { EventEmitter } from 'events';
import { createWebSocketServer, TerminalWebSocketServer } from '@server/websocket/WebSocketServer.js';

// Mock ws module
class MockWebSocketServer extends EventEmitter {
  clients = new Set();
  close = vi.fn();
}

interface MockedWebSocketServerConstructor extends Mock {
  mock: {
    results: { value: MockWebSocketServer }[];
  };
}

vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => new MockWebSocketServer()),
}));

// Mock logger
vi.mock('@server/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock heartbeat manager
const mockHeartbeatStart = vi.fn();
const mockHeartbeatStop = vi.fn();

vi.mock('@server/websocket/heartbeat.js', () => ({
  HeartbeatManager: vi.fn().mockImplementation(() => ({
    start: mockHeartbeatStart,
    stop: mockHeartbeatStop,
  })),
}));

// Mock terminal handler
const mockHandleMessage = vi.fn();
const mockHandleDisconnect = vi.fn();

vi.mock('@server/websocket/handlers/terminal.js', () => ({
  TerminalHandler: vi.fn().mockImplementation(() => ({
    handleMessage: mockHandleMessage,
    handleDisconnect: mockHandleDisconnect,
  })),
}));

// Mock HTTP server
class MockHttpServer extends EventEmitter {}

// Mock PtyManager
const mockPtyManager = {
  spawn: vi.fn(),
  get: vi.fn(),
  kill: vi.fn(),
};

describe('createWebSocketServer', () => {
  let mockServer: MockHttpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = new MockHttpServer();
  });

  it('creates WebSocket server with default path', async () => {
    const { WebSocketServer } = await import('ws');

    createWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
    });

    expect(WebSocketServer).toHaveBeenCalledWith({
      server: mockServer,
      path: '/ws/terminal',
    });
  });

  it('creates WebSocket server with custom path', async () => {
    const { WebSocketServer } = await import('ws');

    createWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
      path: '/custom/path',
    });

    expect(WebSocketServer).toHaveBeenCalledWith({
      server: mockServer,
      path: '/custom/path',
    });
  });

  it('starts heartbeat manager', () => {
    createWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
    });

    expect(mockHeartbeatStart).toHaveBeenCalled();
  });

  it('handles client connection', async () => {
    const { WebSocketServer } = await import('ws');
    createWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
    });

    // Get the actual MockWebSocketServer instance
    const mockWss = (WebSocketServer as MockedWebSocketServerConstructor).mock.results[0].value;

    // Create mock client
    const mockClient = new EventEmitter() as EventEmitter & { isAlive: boolean; send: ReturnType<typeof vi.fn> };
    mockClient.send = vi.fn();

    // Simulate connection
    mockWss.emit('connection', mockClient);

    expect(mockClient.isAlive).toBe(true);
  });

  it('handles client message', async () => {
    const { WebSocketServer } = await import('ws');
    createWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
    });

    const mockWss = (WebSocketServer as MockedWebSocketServerConstructor).mock.results[0].value;
    const mockClient = new EventEmitter() as EventEmitter & { isAlive: boolean; send: ReturnType<typeof vi.fn> };
    mockClient.send = vi.fn();

    mockWss.emit('connection', mockClient);

    // Simulate message
    const message = { type: 'input', shellId: 'shell-1', data: 'test' };
    mockClient.emit('message', Buffer.from(JSON.stringify(message)));

    expect(mockHandleMessage).toHaveBeenCalledWith(mockClient, message);
  });

  it('handles invalid JSON message', async () => {
    const { WebSocketServer } = await import('ws');
    createWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
    });

    const mockWss = (WebSocketServer as MockedWebSocketServerConstructor).mock.results[0].value;
    const mockClient = new EventEmitter() as EventEmitter & { isAlive: boolean; send: ReturnType<typeof vi.fn> };
    mockClient.send = vi.fn();

    mockWss.emit('connection', mockClient);

    // Simulate invalid message
    mockClient.emit('message', Buffer.from('not valid json'));

    expect(mockClient.send).toHaveBeenCalledWith(
      expect.stringContaining('INVALID_MESSAGE'),
    );
  });

  it('handles client disconnect', async () => {
    const { WebSocketServer } = await import('ws');
    createWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
    });

    const mockWss = (WebSocketServer as MockedWebSocketServerConstructor).mock.results[0].value;
    const mockClient = new EventEmitter() as EventEmitter & { isAlive: boolean; send: ReturnType<typeof vi.fn> };
    mockClient.send = vi.fn();

    mockWss.emit('connection', mockClient);
    mockClient.emit('close');

    expect(mockHandleDisconnect).toHaveBeenCalledWith(mockClient);
  });

  it('handles client pong', async () => {
    const { WebSocketServer } = await import('ws');
    createWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
    });

    const mockWss = (WebSocketServer as MockedWebSocketServerConstructor).mock.results[0].value;
    const mockClient = new EventEmitter() as EventEmitter & { isAlive: boolean; send: ReturnType<typeof vi.fn> };
    mockClient.send = vi.fn();

    mockWss.emit('connection', mockClient);
    mockClient.isAlive = false;
    mockClient.emit('pong');

    expect(mockClient.isAlive).toBe(true);
  });

  it('handles client error', async () => {
    const { WebSocketServer } = await import('ws');
    const { logger } = await import('@server/utils/logger.js');

    createWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
    });

    const mockWss = (WebSocketServer as MockedWebSocketServerConstructor).mock.results[0].value;
    const mockClient = new EventEmitter() as EventEmitter & { isAlive: boolean; send: ReturnType<typeof vi.fn> };
    mockClient.send = vi.fn();

    mockWss.emit('connection', mockClient);
    mockClient.emit('error', new Error('test error'));

    expect(logger.error).toHaveBeenCalled();
  });

  it('stops heartbeat on server close', async () => {
    const { WebSocketServer } = await import('ws');
    createWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
    });

    const mockWss = (WebSocketServer as MockedWebSocketServerConstructor).mock.results[0].value;
    mockWss.emit('close');

    expect(mockHeartbeatStop).toHaveBeenCalled();
  });
});

describe('TerminalWebSocketServer', () => {
  let mockServer: MockHttpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = new MockHttpServer();
  });

  it('creates instance with options', () => {
    const wsServer = new TerminalWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
    });

    expect(wsServer.wss).toBeDefined();
  });

  it('starts heartbeat', () => {
    const wsServer = new TerminalWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
    });

    wsServer.start();

    expect(mockHeartbeatStart).toHaveBeenCalled();
  });

  it('stops heartbeat and closes server', () => {
    const wsServer = new TerminalWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
    });

    wsServer.stop();

    expect(mockHeartbeatStop).toHaveBeenCalled();
  });

  it('handles connection events', async () => {
    const { WebSocketServer } = await import('ws');

    const wsServer = new TerminalWebSocketServer({
      server: mockServer as unknown as Parameters<typeof createWebSocketServer>[0]['server'],
      ptyManager: mockPtyManager as unknown as Parameters<typeof createWebSocketServer>[0]['ptyManager'],
    });

    // Get the actual MockWebSocketServer instance (from latest call)
    const calls = (WebSocketServer as MockedWebSocketServerConstructor).mock.results;
    const mockWss = calls[calls.length - 1].value;

    const mockClient = new EventEmitter() as EventEmitter & { isAlive: boolean; send: ReturnType<typeof vi.fn> };
    mockClient.send = vi.fn();

    mockWss.emit('connection', mockClient);

    expect(mockClient.isAlive).toBe(true);
    expect(wsServer.wss).toBeDefined();
  });
});
