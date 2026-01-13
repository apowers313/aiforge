/**
 * useWebSocket - React hook for WebSocket connections
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { ReconnectingWebSocket, type ReconnectingWebSocketOptions } from '@client/services/websocket.js';

/**
 * WebSocket connection status
 */
export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Options for useWebSocket hook
 */
export interface UseWebSocketOptions {
  /**
   * Auto-connect on mount
   * @default true
   */
  autoConnect?: boolean;

  /**
   * Callback when message is received
   */
  onMessage?: (data: unknown) => void;

  /**
   * Callback when connection opens
   */
  onOpen?: () => void;

  /**
   * Callback when connection closes
   */
  onClose?: () => void;

  /**
   * Callback when error occurs
   */
  onError?: (event: Event) => void;

  /**
   * ReconnectingWebSocket options
   */
  reconnectOptions?: Omit<ReconnectingWebSocketOptions, 'onMessage' | 'onOpen' | 'onClose' | 'onError'>;
}

/**
 * Return type for useWebSocket hook
 */
export interface UseWebSocketReturn {
  status: WebSocketStatus;
  isConnected: boolean;
  send: (data: unknown) => void;
  connect: () => void;
  disconnect: () => void;
}

/**
 * React hook for managing WebSocket connections
 */
export function useWebSocket(url: string, options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    autoConnect = true,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectOptions,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const wsRef = useRef<ReconnectingWebSocket | null>(null);

  // Store callbacks in refs to avoid reconnection on callback changes
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
    onErrorRef.current = onError;
  }, [onMessage, onOpen, onClose, onError]);

  const connect = useCallback(() => {
    if (wsRef.current) {
      return;
    }

    setStatus('connecting');

    wsRef.current = new ReconnectingWebSocket(url, {
      ...reconnectOptions,
      onMessage: (data): void => {
        onMessageRef.current?.(data);
      },
      onOpen: (): void => {
        setStatus('connected');
        onOpenRef.current?.();
      },
      onClose: (): void => {
        setStatus('disconnected');
        onCloseRef.current?.();
      },
      onError: (event): void => {
        setStatus('error');
        onErrorRef.current?.(event);
      },
    });

    wsRef.current.connect();
  }, [url, reconnectOptions]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setStatus('disconnected');
    }
  }, []);

  const send = useCallback((data: unknown) => {
    wsRef.current?.send(data);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return (): void => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [autoConnect, connect]);

  return {
    status,
    isConnected: status === 'connected',
    send,
    connect,
    disconnect,
  };
}
