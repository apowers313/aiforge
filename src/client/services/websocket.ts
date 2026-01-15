/**
 * ReconnectingWebSocket - WebSocket client with automatic reconnection
 */
import { log } from './logger';

const wsLog = log.websocket;

/**
 * Options for ReconnectingWebSocket
 */
export interface ReconnectingWebSocketOptions {
  /**
   * Maximum number of reconnection attempts
   * @default 10
   */
  maxReconnectAttempts?: number;

  /**
   * Base delay for exponential backoff in milliseconds
   * @default 1000
   */
  baseDelay?: number;

  /**
   * Maximum delay between reconnection attempts in milliseconds
   * @default 30000
   */
  maxDelay?: number;

  /**
   * Callback when connection opens
   */
  onOpen?: () => void;

  /**
   * Callback when connection closes
   */
  onClose?: () => void;

  /**
   * Callback when message is received
   */
  onMessage?: (data: unknown) => void;

  /**
   * Callback when error occurs
   */
  onError?: (event: Event) => void;

  /**
   * Callback when max retries reached
   */
  onMaxRetriesReached?: () => void;
}

/**
 * ReconnectingWebSocket provides automatic reconnection with exponential backoff
 */
export class ReconnectingWebSocket {
  private readonly _url: string;
  private readonly _options: Required<Omit<ReconnectingWebSocketOptions, 'onOpen' | 'onClose' | 'onMessage' | 'onError' | 'onMaxRetriesReached'>> & ReconnectingWebSocketOptions;
  private _ws: WebSocket | null = null;
  private _reconnectAttempts = 0;
  private _lastReconnectDelay = 0;
  private _reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private _messageQueue: unknown[] = [];
  private _closed = false;
  private _connected = false;

  constructor(url: string, options: ReconnectingWebSocketOptions = {}) {
    this._url = url;
    this._options = {
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      baseDelay: options.baseDelay ?? 1000,
      maxDelay: options.maxDelay ?? 30000,
      ...options,
    };
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this._closed) {
      wsLog.debug({ url: this._url }, 'connect() called but already closed, returning');
      return;
    }

    wsLog.info({ url: this._url }, 'Creating new WebSocket connection');
    this._ws = new WebSocket(this._url);
    wsLog.debug({ readyState: this._ws.readyState }, 'WebSocket created');

    this._ws.onopen = (): void => {
      wsLog.info({ url: this._url }, 'WebSocket connection opened');
      this._connected = true;
      this._reconnectAttempts = 0;
      this._lastReconnectDelay = 0;

      // Send queued messages
      const queueLength = this._messageQueue.length;
      if (queueLength > 0) {
        wsLog.debug({ queueLength }, 'Flushing message queue');
      }
      this._flushQueue();

      this._options.onOpen?.();
    };

    this._ws.onclose = (event): void => {
      wsLog.info({ code: event.code, reason: event.reason, wasClean: event.wasClean }, 'WebSocket connection closed');
      this._connected = false;

      this._options.onClose?.();

      // Don't reconnect if explicitly closed or normal close
      if (this._closed || event.code === 1000) {
        wsLog.debug('Not reconnecting (explicitly closed or normal close)');
        return;
      }

      this._scheduleReconnect();
    };

    this._ws.onmessage = (event): void => {
      try {
        const data = JSON.parse(event.data as string) as unknown;
        wsLog.debug({ dataType: typeof data }, 'Message received');
        this._options.onMessage?.(data);
      } catch {
        // Handle non-JSON messages
        wsLog.debug('Non-JSON message received');
        this._options.onMessage?.(event.data);
      }
    };

    this._ws.onerror = (event): void => {
      wsLog.error({ type: event.type }, 'WebSocket error');
      this._options.onError?.(event);
    };
  }

  /**
   * Send a message through the WebSocket
   */
  send(data: unknown): void {
    if (this._connected && this._ws?.readyState === WebSocket.OPEN) {
      wsLog.debug({ dataType: typeof data }, 'Sending message');
      this._ws.send(JSON.stringify(data));
    } else {
      // Queue message for later
      wsLog.debug({ queueLength: this._messageQueue.length + 1 }, 'Queueing message (not connected)');
      this._messageQueue.push(data);
    }
  }

  /**
   * Close the connection and stop reconnecting
   */
  close(): void {
    wsLog.info('Closing WebSocket connection');
    this._closed = true;
    this._cancelReconnect();

    if (this._ws) {
      this._ws.close(1000, 'Client closed');
      this._ws = null;
    }

    this._connected = false;
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Get the last reconnect delay (for testing)
   */
  getLastReconnectDelay(): number {
    return this._lastReconnectDelay;
  }

  /**
   * Schedule a reconnection attempt
   */
  private _scheduleReconnect(): void {
    if (this._closed) {
      wsLog.debug('Reconnect skipped (connection closed)');
      return;
    }

    if (this._reconnectAttempts >= this._options.maxReconnectAttempts) {
      wsLog.warn({ maxAttempts: this._options.maxReconnectAttempts }, 'Max reconnect attempts reached');
      this._options.onMaxRetriesReached?.();
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      this._options.baseDelay * Math.pow(2, this._reconnectAttempts) + Math.random() * 1000,
      this._options.maxDelay,
    );

    this._lastReconnectDelay = delay;
    this._reconnectAttempts++;

    wsLog.info({ attempt: this._reconnectAttempts, delayMs: Math.round(delay) }, 'Scheduling reconnect');

    this._reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Cancel any pending reconnection
   */
  private _cancelReconnect(): void {
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
  }

  /**
   * Flush the message queue
   */
  private _flushQueue(): void {
    while (this._messageQueue.length > 0) {
      const message = this._messageQueue.shift();
      if (message !== undefined) {
        this.send(message);
      }
    }
  }
}
