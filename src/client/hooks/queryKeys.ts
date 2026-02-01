/**
 * Type-safe query keys for TanStack Query
 */
export const queryKeys = {
  projects: {
    all: ['projects'] as const,
    detail: (id: string) => ['projects', id] as const,
    context: (id: string) => ['projectContext', id] as const,
  },
  shells: {
    byProject: (projectId: string) => ['shells', projectId] as const,
    byWorktree: (worktreePath: string) => ['shells', 'worktree', worktreePath] as const,
    detail: (id: string) => ['shells', 'detail', id] as const,
  },
  worktrees: {
    byProject: (projectId: string) => ['worktrees', projectId] as const,
    mainBranch: (projectId: string) => ['worktrees', 'mainBranch', projectId] as const,
    files: (worktreePath: string, gitModifiedOnly: boolean) => ['worktrees', 'files', worktreePath, gitModifiedOnly] as const,
    urls: (worktreePath: string) => ['worktrees', 'urls', worktreePath] as const,
  },
  auth: {
    status: ['auth', 'status'] as const,
  },
  workspace: {
    state: ['workspace', 'state'] as const,
  },
};
