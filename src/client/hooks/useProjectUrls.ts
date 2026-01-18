/**
 * React Query hook for managing project custom URLs
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@client/services/api';
import type { CustomUrl } from '@shared/types';

interface UrlsResponse {
  urls: CustomUrl[];
}

async function fetchProjectUrls(projectId: string): Promise<CustomUrl[]> {
  const response = await apiClient.get<UrlsResponse>(`/projects/${projectId}/urls`);
  return response.urls;
}

async function createProjectUrl(
  projectId: string,
  data: { name: string; url: string },
): Promise<CustomUrl> {
  return apiClient.post<CustomUrl>(`/projects/${projectId}/urls`, data);
}

async function updateProjectUrl(
  projectId: string,
  urlId: string,
  data: { name?: string; url?: string },
): Promise<CustomUrl> {
  return apiClient.put<CustomUrl>(`/projects/${projectId}/urls/${urlId}`, data);
}

async function deleteProjectUrl(projectId: string, urlId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/urls/${urlId}`);
}

export interface UseProjectUrlsResult {
  urls: CustomUrl[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  addUrl: (name: string, url: string) => Promise<void>;
  updateUrl: (urlId: string, data: { name?: string; url?: string }) => Promise<void>;
  deleteUrl: (urlId: string) => Promise<void>;
  isAdding: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
}

export function useProjectUrls(projectId: string): UseProjectUrlsResult {
  const queryClient = useQueryClient();
  const queryKey = ['projectUrls', projectId];

  const {
    data: urls = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => fetchProjectUrls(projectId),
    staleTime: 30 * 1000, // 30 seconds
    enabled: !!projectId,
  });

  const addMutation = useMutation({
    mutationFn: (data: { name: string; url: string }) => createProjectUrl(projectId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ urlId, data }: { urlId: string; data: { name?: string; url?: string } }) =>
      updateProjectUrl(projectId, urlId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (urlId: string) => deleteProjectUrl(projectId, urlId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const addUrl = async (name: string, url: string): Promise<void> => {
    await addMutation.mutateAsync({ name, url });
  };

  const updateUrl = async (
    urlId: string,
    data: { name?: string; url?: string },
  ): Promise<void> => {
    await updateMutation.mutateAsync({ urlId, data });
  };

  const deleteUrl = async (urlId: string): Promise<void> => {
    await deleteMutation.mutateAsync(urlId);
  };

  return {
    urls,
    isLoading,
    isError,
    error,
    addUrl,
    updateUrl,
    deleteUrl,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
