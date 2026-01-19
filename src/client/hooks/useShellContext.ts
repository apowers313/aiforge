/**
 * React Query hook for managing shell context (todos + notes)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@client/services/api';
import type { TodoItem, ShellContextData } from '@shared/types';

async function fetchShellContext(shellId: string): Promise<ShellContextData> {
  return apiClient.get<ShellContextData>(`/shells/${shellId}/context`);
}

async function addTodo(shellId: string, text: string): Promise<TodoItem> {
  return apiClient.post<TodoItem>(`/shells/${shellId}/todos`, { text });
}

async function updateTodo(
  shellId: string,
  todoId: string,
  data: { text?: string; completed?: boolean },
): Promise<TodoItem> {
  return apiClient.put<TodoItem>(`/shells/${shellId}/todos/${todoId}`, data);
}

async function deleteTodo(shellId: string, todoId: string): Promise<void> {
  await apiClient.delete(`/shells/${shellId}/todos/${todoId}`);
}

async function updateNotes(shellId: string, notes: string): Promise<ShellContextData> {
  return apiClient.patch<ShellContextData>(`/shells/${shellId}/notes`, { notes });
}

async function clearCompleted(shellId: string): Promise<{ cleared: number }> {
  return apiClient.post<{ cleared: number }>(`/shells/${shellId}/todos/clear-completed`, {});
}

async function reorderTodos(shellId: string, todoIds: string[]): Promise<ShellContextData> {
  return apiClient.put<ShellContextData>(`/shells/${shellId}/todos/reorder`, { todoIds });
}

export interface UseShellContextResult {
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

export function useShellContext(shellId: string): UseShellContextResult {
  const queryClient = useQueryClient();
  const queryKey = ['shellContext', shellId];

  const {
    data: context = { todos: [], notes: '' },
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => fetchShellContext(shellId),
    staleTime: 30 * 1000, // 30 seconds
    enabled: !!shellId,
  });

  const addMutation = useMutation({
    mutationFn: (text: string) => addTodo(shellId, text),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ todoId, data }: { todoId: string; data: { text?: string; completed?: boolean } }) =>
      updateTodo(shellId, todoId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (todoId: string) => deleteTodo(shellId, todoId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const notesMutation = useMutation({
    mutationFn: (notes: string) => updateNotes(shellId, notes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const clearCompletedMutation = useMutation({
    mutationFn: () => clearCompleted(shellId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (todoIds: string[]) => reorderTodos(shellId, todoIds),
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
