/**
 * WorktreeFilesTab - Display worktree file tree with git status
 */
import { useState } from 'react';
import { useWorktreeFiles } from '@client/hooks/useWorktrees';
import { FileTree } from '../common/FileTree';

interface WorktreeFilesTabProps {
  worktreePath: string;
}

export function WorktreeFilesTab({ worktreePath }: WorktreeFilesTabProps): React.ReactElement {
  const [showAllFiles, setShowAllFiles] = useState(false);

  const { files, isLoading, isError, error } = useWorktreeFiles(worktreePath, !showAllFiles);

  return (
    <FileTree
      files={files}
      isLoading={isLoading}
      isError={isError}
      error={error}
      showAllFiles={showAllFiles}
      onToggleShowAll={setShowAllFiles}
    />
  );
}
