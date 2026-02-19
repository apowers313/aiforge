/**
 * ProjectFilesTab - Display project file tree with git status
 */
import { useState } from 'react';
import { useProjectFiles } from '@client/hooks/useProjectFiles';
import { useUIStore } from '@client/stores/uiStore';
import { FileTree } from '../common/FileTree';
import type { FileTreeNode } from '@shared/types';

interface ProjectFilesTabProps {
  projectId: string;
}

export function ProjectFilesTab({ projectId }: ProjectFilesTabProps): React.ReactElement {
  const [showAllFiles, setShowAllFiles] = useState(false);
  const openFilePreview = useUIStore((state) => state.openFilePreview);
  const previewFilePath = useUIStore((state) => state.previewFilePath);

  const { files, isLoading, isError, error } = useProjectFiles(projectId, !showAllFiles);

  const handleFileClick = (node: FileTreeNode): void => {
    openFilePreview(projectId, node.path);
  };

  return (
    <FileTree
      files={files}
      isLoading={isLoading}
      isError={isError}
      error={error}
      showAllFiles={showAllFiles}
      onToggleShowAll={setShowAllFiles}
      onFileClick={handleFileClick}
      selectedPath={previewFilePath}
    />
  );
}
