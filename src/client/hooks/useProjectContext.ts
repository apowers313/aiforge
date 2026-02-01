/**
 * React Query hook for managing project context (todos + notes)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@client/services/api';
import type { TodoItem, ProjectContextData } from '@shared/types';

async function fetchProjectContext(projectId: string): Promise<ProjectContextData> {
  return apiClient.get<ProjectContextData>(`/projects/${projectId}/context`);
}

async function addTodo(projectId: string, text: string): Promise<TodoItem> {
  return apiClient.post<TodoItem>(`/projects/${projectId}/todos`, { text });
}

async function updateTodo(
  projectId: string,
  todoId: string,
  data: { text?: string; completed?: boolean },
): Promise<TodoItem> {
  return apiClient.put<TodoItem>(`/projects/${projectId}/todos/${todoId}`, data);
}

async function deleteTodo(projectId: string, todoId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/todos/${todoId}`);
}

async function updateNotes(projectId: string, notes: string): Promise<ProjectContextData> {
  return apiClient.patch<ProjectContextData>(`/projects/${projectId}/notes`, { notes });
}

async function clearCompleted(projectId: string): Promise<{ cleared: number }> {
  return apiClient.post<{ cleared: number }>(`/projects/${projectId}/todos/clear-completed`, {});
}

async function reorderTodos(projectId: string, todoIds: string[]): Promise<ProjectContextData> {
  return apiClient.put<ProjectContextData>(`/projects/${projectId}/todos/reorder`, { todoIds });
}

export interface UseProjectContextResult {
  todos: TodoItem[];
  notes: string;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  addTodo: (text: string) => Promise<void>;
  toggleTodo: (todoId: string) => Promise<void>;
  updateTodoText: (todoId: string, text: string) => Promise<void>;
  deleteTodo: (todoId: string) => Promise<void>;
  updateNotes: (notes: string) => Promise<void>;
  clearCompleted: () => Promise<number>;
  reorderTodos: (todoIds: string[]) => Promise<void>;
  isAdding: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  isUpdatingNotes: boolean;
  isClearing: boolean;
  isReordering: boolean;
}

export function useProjectContext(projectId: string): UseProjectContextResult {
  const queryClient = useQueryClient();
  const queryKey = ['projectContext', projectId];

  const {
    data: context = { todos: [], notes: '' },
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => fetchProjectContext(projectId),
    staleTime: 30 * 1000, // 30 seconds
    enabled: !!projectId,
  });

  const addMutation = useMutation({
    mutationFn: (text: string) => addTodo(projectId, text),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ todoId, data }: { todoId: string; data: { text?: string; completed?: boolean } }) =>
      updateTodo(projectId, todoId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (todoId: string) => deleteTodo(projectId, todoId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const notesMutation = useMutation({
    mutationFn: (notes: string) => updateNotes(projectId, notes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const clearCompletedMutation = useMutation({
    mutationFn: () => clearCompleted(projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (todoIds: string[]) => reorderTodos(projectId, todoIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const addTodoHandler = async (text: string): Promise<void> => {
    await addMutation.mutateAsync(text);
  };

  const toggleTodoHandler = async (todoId: string): Promise<void> => {
    // Find the current todo to get its completion status
    const todo = context.todos.find((t) => t.id === todoId);
    if (!todo) return;

    await updateMutation.mutateAsync({
      todoId,
      data: { completed: !todo.completed },
    });
  };

  const updateTodoTextHandler = async (todoId: string, text: string): Promise<void> => {
    await updateMutation.mutateAsync({
      todoId,
      data: { text },
    });
  };

  const deleteTodoHandler = async (todoId: string): Promise<void> => {
    await deleteMutation.mutateAsync(todoId);
  };

  const updateNotesHandler = async (notes: string): Promise<void> => {
    await notesMutation.mutateAsync(notes);
  };

  const clearCompletedHandler = async (): Promise<number> => {
    const result = await clearCompletedMutation.mutateAsync();
    return result.cleared;
  };

  const reorderTodosHandler = async (todoIds: string[]): Promise<void> => {
    await reorderMutation.mutateAsync(todoIds);
  };

  return {
    todos: context.todos,
    notes: context.notes,
    isLoading,
    isError,
    error,
    addTodo: addTodoHandler,
    toggleTodo: toggleTodoHandler,
    updateTodoText: updateTodoTextHandler,
    deleteTodo: deleteTodoHandler,
    updateNotes: updateNotesHandler,
    clearCompleted: clearCompletedHandler,
    reorderTodos: reorderTodosHandler,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isUpdatingNotes: notesMutation.isPending,
    isClearing: clearCompletedMutation.isPending,
    isReordering: reorderMutation.isPending,
  };
}
