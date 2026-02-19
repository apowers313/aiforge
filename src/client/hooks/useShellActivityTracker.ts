/**
 * useShellActivityTracker - App-level hook that maintains a dedicated WebSocket
 * connection to receive shell.activity broadcasts for all shells.
 *
 * This hook lives in AppShellLayout (above the Terminal mount/unmount boundary)
 * so that activity indicators stay accurate even when no terminal is mounted.
 */
import { useCallback } from 'react';
import { useWebSocket } from './useWebSocket.js';
import { useUIStore } from '@client/stores/uiStore';
import { isShellActivityMessage } from '@shared/types/index.js';

export function useShellActivityTracker(): void {
  const wsProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${typeof window !== 'undefined' ? window.location.host : 'localhost:9000'}/ws/terminal`;

  const recordShellActivity = useUIStore((state) => state.recordShellActivity);

  const handleMessage = useCallback((message: unknown): void => {
    if (isShellActivityMessage(message)) {
      recordShellActivity(message.shellId);
    }
    // Ignore all other message types -- this is a passive listener
  }, [recordShellActivity]);

  useWebSocket(wsUrl, {
    onMessage: handleMessage,
    waitForHealth: true,
  });
}
