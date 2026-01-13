/**
 * Type-safe query keys for TanStack Query
 */
export const queryKeys = {
  projects: {
    all: ['projects'] as const,
    detail: (id: string) => ['projects', id] as const,
  },
  shells: {
    byProject: (projectId: string) => ['shells', projectId] as const,
    detail: (id: string) => ['shells', 'detail', id] as const,
  },
  auth: {
    status: ['auth', 'status'] as const,
  },
  workspace: {
    state: ['workspace', 'state'] as const,
  },
};
