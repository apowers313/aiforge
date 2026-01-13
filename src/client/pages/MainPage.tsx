import { AppShellLayout } from '@client/components/layout/AppShell';
import { useWorkspaceSync } from '@client/hooks/useWorkspaceSync';

export function MainPage(): React.ReactElement {
  // Sync workspace UI state across devices
  useWorkspaceSync();

  return <AppShellLayout />;
}
