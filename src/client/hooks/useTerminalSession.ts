/**
 * useTerminalSession - React hook for terminal session management with explicit state machine
 *
 * Replaces useTerminal with a cleaner state machine model using the new session.* protocol.
 */
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useWebSocket } from './useWebSocket.js';
import { useUIStore } from '@client/stores/uiStore';
import { log } from '@client/services/logger';
import {
  generateRequestId,
  isSessionOpenedMessage,
  isSessionErrorMessage,
  isSessionOutputMessage,
  isSessionClosedMessage,
  isShellActivityMessage,
  type Shell,
} from '@shared/types/index.js';

/**
 * Grace period in ms to suppress activity recording after session open or resize.
 * Prevents false positives from terminal redraws triggered by resize/reconnect.
 */
const ACTIVITY_SUPPRESSION_MS = 1500;

const sessionLog = log.terminal;

/**
 * Session state union type
 */
export type SessionState =
  | { status: 'closed' }
  | { status: 'opening'; requestId: string }
  | { status: 'open'; shell: Shell; scrollback: string }
  | { status: 'reconnecting'; attempt: number; maxAttempts: number }
  | { status: 'error'; code: string; message: string; retryable: boolean };

/**
 * Options for useTerminalSession hook
 */
export interface UseTerminalSessionOptions {
  /**
   * Callback when output is received (not scrollback)
   */
  onOutput?: (data: string) => void;

  /**
   * Auto-open session on mount
   * @default true
   */
  autoOpen?: boolean;

  /**
   * Maximum reconnect attempts
   * @default 5
   */
  maxReconnectAttempts?: number;

  /**
   * WebSocket URL (defaults to current host)
   */
  wsUrl?: string;
}

/**
 * Return type for useTerminalSession hook
 */
export interface UseTerminalSessionReturn {
  state: SessionState;
  open: () => void;
  close: () => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  retry: () => void;
}

/**
 * React hook for managing terminal sessions with explicit state machine
 */
export function useTerminalSession(
  shellId: string,
  options: UseTerminalSessionOptions = {},
): UseTerminalSessionReturn {
  // Determine WebSocket protocol based on page protocol
  const wsProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const defaultWsUrl = `${wsProtocol}//${typeof window !== 'undefined' ? window.location.host : 'localhost:9000'}/ws/terminal`;

  const {
    onOutput,
    autoOpen = true,
    maxReconnectAttempts = 5,
    wsUrl = defaultWsUrl,
  } = options;

  // State machine state
  const [state, setState] = useState<SessionState>({ status: 'closed' });

  // Track the current shellId to detect changes
  const currentShellIdRef = useRef(shellId);
  const previousShellIdRef = useRef<string | null>(null);

  // Track pending request ID for correlation
  const pendingRequestIdRef = useRef<string | null>(null);

  // Track reconnect attempts
  const reconnectAttemptRef = useRef(0);

  // Track if we've auto-opened to prevent duplicates
  const hasAutoOpenedRef = useRef(false);

  // Track if session is active for cleanup (avoid stale closure in unmount effect)
  const isSessionActiveRef = useRef(false);

  // Track activity suppression window to avoid false positives from resize/reconnect redraws
  const activitySuppressedUntilRef = useRef(0);

  // Store callbacks in refs to avoid effect dependencies
  const onOutputRef = useRef(onOutput);
  useEffect(() => {
    onOutputRef.current = onOutput;
  }, [onOutput]);

  // Get activity recorder from UI store
  const recordShellActivity = useUIStore((state) => state.recordShellActivity);

  // Handle incoming messages
  const handleMessage = useCallback((message: unknown) => {
    // shell.activity broadcasts are handled by useShellActivityTracker at the app level.
    // Skip them here to avoid duplicate processing.
    if (isShellActivityMessage(message)) {
      return;
    }

    // Handle session.opened
    if (isSessionOpenedMessage(message)) {
      if (message.shellId !== currentShellIdRef.current) {
        return;
      }

      // Check if this response matches our pending request
      if (pendingRequestIdRef.current && message.requestId === pendingRequestIdRef.current) {
        sessionLog.info({ shellId: message.shellId }, 'Session opened successfully');
        pendingRequestIdRef.current = null;
        reconnectAttemptRef.current = 0;

        setState({
          status: 'open',
          shell: message.shell,
          scrollback: message.scrollback,
        });
      }
      return;
    }

    // Handle session.error
    if (isSessionErrorMessage(message)) {
      if (message.shellId !== currentShellIdRef.current) {
        return;
      }

      // Check if this response matches our pending request
      if (message.requestId && pendingRequestIdRef.current && message.requestId === pendingRequestIdRef.current) {
        sessionLog.error({ shellId: message.shellId, code: message.code }, 'Session error');
        pendingRequestIdRef.current = null;

        setState({
          status: 'error',
          code: message.code,
          message: message.message,
          retryable: message.retryable,
        });
      }
      return;
    }

    // Handle session.output
    if (isSessionOutputMessage(message)) {
      if (message.shellId !== currentShellIdRef.current) {
        return;
      }

      sessionLog.debug({ bytes: message.data.length, isScrollback: message.isScrollback }, 'Session output received');

      // Only call onOutput for non-scrollback data
      // Scrollback is provided in the session.opened message and stored in state
      if (!message.isScrollback) {
        onOutputRef.current?.(message.data);
        // Only record activity if outside the suppression window
        // (avoids false positive from resize/reconnect-triggered redraws)
        if (Date.now() >= activitySuppressedUntilRef.current) {
          recordShellActivity(message.shellId);
        }
      }
      return;
    }

    // Handle session.closed
    if (isSessionClosedMessage(message)) {
      if (message.shellId !== currentShellIdRef.current) {
        return;
      }

      sessionLog.info({ shellId: message.shellId, reason: message.reason }, 'Session closed');

      if (message.reason === 'requested') {
        setState({ status: 'closed' });
      } else {
        // Unexpected close - could transition to error or reconnecting
        setState({
          status: 'error',
          code: 'CONNECTION_LOST',
          message: `Session closed: ${message.reason}`,
          retryable: true,
        });
      }
      return;
    }
  }, [recordShellActivity]);

  // Handle WebSocket disconnect
  const handleClose = useCallback(() => {
    setState((currentState) => {
      // If we were in the middle of opening, the in-flight request will never
      // complete. Treat it as transient connection loss and enter reconnecting.
      if (currentState.status === 'opening') {
        pendingRequestIdRef.current = null;
        reconnectAttemptRef.current = 1;
        return {
          status: 'reconnecting',
          attempt: 1,
          maxAttempts: maxReconnectAttempts,
        };
      }

      // Only transition to reconnecting if we were in an open state
      if (currentState.status === 'open') {
        reconnectAttemptRef.current = 1;
        return {
          status: 'reconnecting',
          attempt: 1,
          maxAttempts: maxReconnectAttempts,
        };
      }

      // If already reconnecting, increment attempt counter
      if (currentState.status === 'reconnecting') {
        reconnectAttemptRef.current++;
        const newAttempt = reconnectAttemptRef.current;

        if (newAttempt > maxReconnectAttempts) {
          return {
            status: 'error',
            code: 'CONNECTION_LOST',
            message: 'Max reconnect attempts exceeded',
            retryable: true,
          };
        }

        return {
          ...currentState,
          attempt: newAttempt,
        };
      }

      // If we're in a retryable error state, re-enter reconnecting so the
      // auto-reconnect effect can re-attempt session establishment.
      if (currentState.status === 'error' && currentState.retryable) {
        reconnectAttemptRef.current = 1;
        return {
          status: 'reconnecting',
          attempt: 1,
          maxAttempts: maxReconnectAttempts,
        };
      }

      return currentState;
    });
  }, [maxReconnectAttempts]);

  // Handle max retries reached from WebSocket
  const handleMaxRetries = useCallback(() => {
    setState((currentState) => {
      if (currentState.status === 'reconnecting') {
        return {
          status: 'error',
          code: 'CONNECTION_LOST',
          message: 'Unable to reconnect after multiple attempts',
          retryable: true,
        };
      }
      return currentState;
    });
  }, []);

  // Handle WebSocket reconnect (connection restored)
  const handleOpen = useCallback(() => {
    setState((currentState) => {
      // If we were reconnecting and the connection is restored, try to re-open session
      if (currentState.status === 'reconnecting') {
        // The session will be re-opened via the effect that watches ws.isConnected
        return currentState;
      }
      return currentState;
    });
  }, []);

  // Memoize reconnect options
  const reconnectOptions = useMemo(() => ({
    onMaxRetriesReached: handleMaxRetries,
  }), [handleMaxRetries]);

  // WebSocket connection
  const ws = useWebSocket(wsUrl, {
    onMessage: handleMessage,
    onOpen: handleOpen,
    onClose: handleClose,
    reconnectOptions,
    waitForHealth: true,
  });

  // Store ws.send in a ref to avoid effect dependencies
  const wsSendRef = useRef(ws.send);
  useEffect(() => {
    wsSendRef.current = ws.send;
  }, [ws.send]);

  // Open session action
  const open = useCallback(() => {
    if (state.status === 'opening' || state.status === 'open') {
      return;
    }

    const requestId = generateRequestId();
    pendingRequestIdRef.current = requestId;

    sessionLog.info({ shellId: currentShellIdRef.current, requestId }, 'Opening session');

    // Suppress activity recording during the post-open grace period
    // to avoid false positives from scrollback replay and initial resize redraws
    activitySuppressedUntilRef.current = Date.now() + ACTIVITY_SUPPRESSION_MS;

    wsSendRef.current({
      type: 'session.open',
      shellId: currentShellIdRef.current,
      requestId,
    });

    setState({ status: 'opening', requestId });
  }, [state.status]);

  // Close session action
  const close = useCallback(() => {
    if (state.status === 'closed') {
      return;
    }

    sessionLog.info({ shellId: currentShellIdRef.current }, 'Closing session');

    wsSendRef.current({
      type: 'session.close',
      shellId: currentShellIdRef.current,
    });

    // Don't immediately transition - wait for session.closed response
    // But for cleanup purposes, we can optimistically close
  }, [state.status]);

  // Write input action
  const write = useCallback((data: string) => {
    if (state.status !== 'open') {
      sessionLog.warn({ status: state.status }, 'Cannot write: session not open');
      return;
    }

    wsSendRef.current({
      type: 'session.input',
      shellId: currentShellIdRef.current,
      data,
    });

    // Record activity for user input
    recordShellActivity(currentShellIdRef.current);
  }, [state.status, recordShellActivity]);

  // Resize action
  const resize = useCallback((cols: number, rows: number) => {
    if (state.status !== 'open') {
      return;
    }

    // Suppress activity recording during the post-resize grace period
    // to avoid false positives from terminal redraws triggered by SIGWINCH
    activitySuppressedUntilRef.current = Date.now() + ACTIVITY_SUPPRESSION_MS;

    wsSendRef.current({
      type: 'session.resize',
      shellId: currentShellIdRef.current,
      cols,
      rows,
    });
  }, [state.status]);

  // Retry action
  const retry = useCallback(() => {
    if (state.status !== 'error' || !(state as { retryable?: boolean }).retryable) {
      return;
    }

    sessionLog.info({ shellId: currentShellIdRef.current }, 'Retrying session');
    open();
  }, [state, open]);

  // Handle shellId changes
  useEffect(() => {
    if (shellId !== currentShellIdRef.current) {
      sessionLog.debug({ oldShellId: currentShellIdRef.current, newShellId: shellId }, 'Shell ID changed');

      // Store previous shell ID before updating
      previousShellIdRef.current = currentShellIdRef.current;
      currentShellIdRef.current = shellId;

      // Reset state for new shell
      setState({ status: 'closed' });
      pendingRequestIdRef.current = null;
      hasAutoOpenedRef.current = false;
    }
  }, [shellId]);

  // Send close for previous shell when switching
  useEffect(() => {
    if (previousShellIdRef.current && previousShellIdRef.current !== shellId) {
      sessionLog.info({ shellId: previousShellIdRef.current }, 'Closing previous session');
      wsSendRef.current({
        type: 'session.close',
        shellId: previousShellIdRef.current,
      });
      previousShellIdRef.current = null;
    }
  }, [shellId]);

  // Auto-open and reconnect handling
  useEffect(() => {
    if (!ws.isConnected) {
      return;
    }

    // Auto-open on initial connection
    if (autoOpen && state.status === 'closed' && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      open();
      return;
    }

    // Re-open on reconnect
    if (state.status === 'reconnecting') {
      open();
    }
  }, [ws.isConnected, autoOpen, state.status, open]);

  // Track session active status for cleanup (avoid stale closure)
  useEffect(() => {
    isSessionActiveRef.current = state.status === 'open' || state.status === 'opening';
  }, [state.status]);

  // Cleanup on unmount - use ref to avoid stale closure
  useEffect(() => {
    return (): void => {
      if (isSessionActiveRef.current) {
        sessionLog.info({ shellId: currentShellIdRef.current }, 'Closing session on unmount');
        wsSendRef.current({
          type: 'session.close',
          shellId: currentShellIdRef.current,
        });
      }
    };
  }, []);

  return {
    state,
    open,
    close,
    write,
    resize,
    retry,
  };
}
