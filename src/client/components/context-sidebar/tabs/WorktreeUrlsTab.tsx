/**
 * WorktreeUrlsTab - URLs tab for worktree context sidebar
 */
import { useWorktreeUrls } from '@client/hooks/useWorktrees';
import { UrlsTab } from '../common/UrlsTab';

interface WorktreeUrlsTabProps {
  worktreePath: string;
}

export function WorktreeUrlsTab({ worktreePath }: WorktreeUrlsTabProps): React.ReactElement {
  const { urls, isLoading, isError, addUrl, deleteUrl, isAdding } = useWorktreeUrls(worktreePath);

  return (
    <UrlsTab
      urls={urls}
      isLoading={isLoading}
      isError={isError}
      addUrl={addUrl}
      deleteUrl={deleteUrl}
      isAdding={isAdding}
      customLabel="Custom URLs"
    />
  );
}
