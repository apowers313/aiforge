/**
 * ProjectUrlsTab - URLs tab for project context sidebar
 */
import { useMemo } from 'react';
import { useProjectMetadata } from '@client/hooks/useProjectMetadata';
import { useProjectUrls } from '@client/hooks/useProjectUrls';
import { UrlsTab } from '../common/UrlsTab';
import type { AutoDetectedUrl } from '../common/UrlItem';

interface ProjectUrlsTabProps {
  projectId: string;
}

export function ProjectUrlsTab({ projectId }: ProjectUrlsTabProps): React.ReactElement {
  const { metadata, isLoading: isLoadingMetadata, isError: isMetadataError } = useProjectMetadata(projectId);
  const { urls, isLoading: isLoadingUrls, isError: isUrlsError, addUrl, updateUrl, deleteUrl, isAdding, isUpdating } = useProjectUrls(projectId);

  // Generate auto-detected URLs from metadata
  const autoDetectedUrls = useMemo((): AutoDetectedUrl[] => {
    if (!metadata) return [];

    const detectedUrls: AutoDetectedUrl[] = [];

    // GitHub URL
    if (metadata.gitRemoteType === 'github' && metadata.gitRemoteUrl) {
      // Convert git URL to web URL
      let webUrl = metadata.gitRemoteUrl;
      if (webUrl.startsWith('git@github.com:')) {
        webUrl = `https://github.com/${webUrl.replace('git@github.com:', '').replace(/\.git$/, '')}`;
      } else if (webUrl.endsWith('.git')) {
        webUrl = webUrl.replace(/\.git$/, '');
      }

      detectedUrls.push({
        id: 'auto-github',
        name: 'GitHub',
        url: webUrl,
        type: 'github',
        isAutoDetected: true,
      });

      // GitHub Actions if workflows exist
      if (metadata.hasGithubWorkflows) {
        detectedUrls.push({
          id: 'auto-github-actions',
          name: 'Actions',
          url: `${webUrl}/actions`,
          type: 'github-actions',
          isAutoDetected: true,
        });
      }
    }

    // NPM URL if package.json exists with a name
    if (metadata.hasPackageJson && metadata.packageName) {
      detectedUrls.push({
        id: 'auto-npm',
        name: 'NPM',
        url: `https://www.npmjs.com/package/${metadata.packageName}`,
        type: 'npm',
        isAutoDetected: true,
      });
    }

    return detectedUrls;
  }, [metadata]);

  return (
    <UrlsTab
      urls={urls}
      isLoading={isLoadingMetadata || isLoadingUrls}
      isError={isMetadataError || isUrlsError}
      addUrl={addUrl}
      updateUrl={updateUrl}
      deleteUrl={deleteUrl}
      isAdding={isAdding}
      isUpdating={isUpdating}
      autoDetectedUrls={autoDetectedUrls}
      customLabel="Custom"
    />
  );
}
