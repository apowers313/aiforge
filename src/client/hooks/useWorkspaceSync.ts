/**
 * Hook for syncing workspace UI state across devices
 * Loads state from server on mount, saves changes with debounce
 */
import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useUIStore } from '@client/stores/uiStore';
import { api } from '@client/services/api';
import { queryKeys } from './queryKeys';
import { useAuthStatus } from './useAuth';

const DEBOUNCE_MS = 500;

export function useWorkspaceSync(): { isLoaded: boolean } {
  const { data: authStatus } = useAuthStatus();
  const isAuthenticated = authStatus?.authenticated ?? false;

  // Track if initial load has completed
  const hasLoadedRef = useRef(false);
  // Track the last saved state to avoid unnecessary saves
  const lastSavedRef = useRef<string>('');

  // UI store state
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const expandedProjectIds = useUIStore((s) => s.expandedProjectIds);
  const activeShellId = useUIStore((s) => s.activeShellId);
  const terminalFontSize = useUIStore((s) => s.terminalFontSize);
  const terminalTheme = useUIStore((s) => s.terminalTheme);
  const setWorkspaceState = useUIStore((s) => s.setWorkspaceState);

  // Fetch workspace state from server
  const { data: serverState } = useQuery({
    queryKey: queryKeys.workspace.state,
    queryFn: () => api.getWorkspaceState(),
    enabled: isAuthenticated,
    staleTime: Infinity, // Only fetch once per session
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Load server state into Zustand on first successful fetch
  useEffect(() => {
    if (!serverState || hasLoadedRef.current) {
      return;
    }
    hasLoadedRef.current = true;
    const ws = serverState.workspaceState;
    setWorkspaceState({
      sidebarCollapsed: ws.sidebarCollapsed,
      expandedProjectIds: ws.expandedProjectIds,
      activeShellId: ws.activeShellId,
      terminalFontSize: ws.terminalFontSize,
      terminalTheme: ws.terminalTheme,
    });
    // Record what we loaded so we don't immediately save it back
    lastSavedRef.current = JSON.stringify({
      sidebarCollapsed: ws.sidebarCollapsed,
      expandedProjectIds: ws.expandedProjectIds,
      activeShellId: ws.activeShellId,
      terminalFontSize: ws.terminalFontSize,
      terminalTheme: ws.terminalTheme,
    });
  }, [serverState, setWorkspaceState]);

  // Mutation for saving state
  const { mutate: saveState } = useMutation({
    mutationFn: api.updateWorkspaceState,
    // Silent - don't show errors for background saves
  });

  // Debounced save function
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSave = useCallback(() => {
    if (!isAuthenticated || !hasLoadedRef.current) {
      return;
    }

    const currentState = {
      sidebarCollapsed,
      expandedProjectIds,
      activeShellId,
      terminalFontSize,
      terminalTheme,
    };

    const stateStr = JSON.stringify(currentState);

    // Skip if state hasn't changed
    if (stateStr === lastSavedRef.current) {
      return;
    }

    // Clear any pending save
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    // Schedule new save
    debounceRef.current = setTimeout(() => {
      lastSavedRef.current = stateStr;
      saveState(currentState);
    }, DEBOUNCE_MS);
  }, [isAuthenticated, sidebarCollapsed, expandedProjectIds, activeShellId, terminalFontSize, terminalTheme, saveState]);

  // Trigger debounced save when state changes
  useEffect(() => {
    debouncedSave();

    return (): void => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [debouncedSave]);

  return { isLoaded: hasLoadedRef.current };
}
