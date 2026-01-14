/**
 * ReconnectingWebSocket - WebSocket client with automatic reconnection
 */

// Debug helper to get elapsed time since terminal switch started
function getElapsed(): string {
  const start = (window as unknown as { __terminalSwitchStart?: number }).__terminalSwitchStart;
  if (!start) return '?.??';
  return (performance.now() - start).toFixed(2);
}

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
      console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - ReconnectingWebSocket.connect() - already closed, returning`);
      return;
    }

    console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - ReconnectingWebSocket: Creating new WebSocket to ${this._url}`);
    this._ws = new WebSocket(this._url);
    console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - ReconnectingWebSocket: WebSocket created, readyState=${this._ws.readyState}`);

    this._ws.onopen = (): void => {
      console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - ReconnectingWebSocket: onopen fired!`);
      this._connected = true;
      this._reconnectAttempts = 0;
      this._lastReconnectDelay = 0;

      // Send queued messages
      this._flushQueue();

      this._options.onOpen?.();
    };

    this._ws.onclose = (event): void => {
      this._connected = false;

      this._options.onClose?.();

      // Don't reconnect if explicitly closed or normal close
      if (this._closed || event.code === 1000) {
        return;
      }

      this._scheduleReconnect();
    };

    this._ws.onmessage = (event): void => {
      try {
        const data = JSON.parse(event.data as string) as unknown;
        this._options.onMessage?.(data);
      } catch {
        // Handle non-JSON messages
        this._options.onMessage?.(event.data);
      }
    };

    this._ws.onerror = (event): void => {
      this._options.onError?.(event);
    };
  }

  /**
   * Send a message through the WebSocket
   */
  send(data: unknown): void {
    if (this._connected && this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    } else {
      // Queue message for later
      this._messageQueue.push(data);
    }
  }

  /**
   * Close the connection and stop reconnecting
   */
  close(): void {
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
      return;
    }

    if (this._reconnectAttempts >= this._options.maxReconnectAttempts) {
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
