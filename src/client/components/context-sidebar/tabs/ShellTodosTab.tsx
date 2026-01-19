/**
 * ShellTodosTab - TODOs management for shell context sidebar
 */
import { useState, useMemo } from 'react';
import {
  Stack,
  Text,
  Checkbox,
  ActionIcon,
  TextInput,
  Group,
  Loader,
  Alert,
  Button,
  Box,
  Menu,
} from '@mantine/core';
import { IconPlus, IconCheck, IconX, IconGripVertical, IconDots, IconTrash } from '@tabler/icons-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useShellContext } from '@client/hooks/useShellContext';
import type { TodoItem } from '@shared/types';

interface ShellTodosTabProps {
  shellId: string;
}

export function ShellTodosTab({ shellId }: ShellTodosTabProps): React.ReactElement {
  const {
    todos,
    isLoading,
    isError,
    error,
    addTodo,
    toggleTodo,
    deleteTodo,
    clearCompleted,
    reorderTodos,
    isAdding,
    isClearing,
  } = useShellContext(shellId);

  const [isAddingTodo, setIsAddingTodo] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Sort todos by order field (server maintains order)
  const sortedTodos = useMemo(() => {
    return [...todos].sort((a, b) => a.order - b.order);
  }, [todos]);

  const completedCount = useMemo(() => {
    return todos.filter((t) => t.completed).length;
  }, [todos]);

  if (isLoading) {
    return (
      <Stack align="center" justify="center" p="lg" data-testid="todos-loading">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          Loading TODOs...
        </Text>
      </Stack>
    );
  }

  if (isError) {
    return (
      <Alert color="red" title="Error">
        {error?.message ?? 'Failed to load TODOs'}
      </Alert>
    );
  }

  const handleAddTodo = async (): Promise<void> => {
    if (!newTodoText.trim()) return;

    try {
      await addTodo(newTodoText.trim());
      setNewTodoText('');
      setIsAddingTodo(false);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleToggleTodo = async (todoId: string): Promise<void> => {
    try {
      await toggleTodo(todoId);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleDeleteTodo = async (todoId: string): Promise<void> => {
    try {
      await deleteTodo(todoId);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleClearCompleted = async (): Promise<void> => {
    try {
      await clearCompleted();
    } catch {
      // Error is handled by the hook
    }
  };

  const handleDragEnd = async (event: DragEndEvent): Promise<void> => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedTodos.findIndex((t) => t.id === active.id);
      const newIndex = sortedTodos.findIndex((t) => t.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(sortedTodos, oldIndex, newIndex);
        const newOrder = reordered.map((t) => t.id);
        try {
          await reorderTodos(newOrder);
        } catch {
          // Error is handled by the hook
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      void handleAddTodo();
    } else if (e.key === 'Escape') {
      setIsAddingTodo(false);
      setNewTodoText('');
    }
  };

  return (
    <Stack gap="sm">
      {/* Add TODO section */}
      {isAddingTodo ? (
        <Group gap="xs">
          <TextInput
            data-testid="todo-input"
            placeholder="What needs to be done?"
            value={newTodoText}
            onChange={(e): void => { setNewTodoText(e.target.value); }}
            onKeyDown={handleKeyDown}
            autoFocus
            flex={1}
            size="sm"
            disabled={isAdding}
          />
          <ActionIcon
            data-testid="submit-todo"
            color="green"
            variant="light"
            onClick={(): void => { void handleAddTodo(); }}
            loading={isAdding}
          >
            <IconCheck size={16} />
          </ActionIcon>
          <ActionIcon
            color="gray"
            variant="subtle"
            onClick={(): void => {
              setIsAddingTodo(false);
              setNewTodoText('');
            }}
          >
            <IconX size={16} />
          </ActionIcon>
        </Group>
      ) : (
        <Button
          data-testid="add-todo-button"
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={(): void => { setIsAddingTodo(true); }}
          size="sm"
        >
          Add TODO
        </Button>
      )}

      {/* TODOs list with drag-and-drop */}
      {sortedTodos.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          No TODOs yet. Add one to get started!
        </Text>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event): void => { void handleDragEnd(event); }}
        >
          <SortableContext items={sortedTodos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <Stack gap="xs">
              {sortedTodos.map((todo) => (
                <SortableTodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={handleToggleTodo}
                  onDelete={handleDeleteTodo}
                />
              ))}
            </Stack>
          </SortableContext>
        </DndContext>
      )}

      {/* Clear finished button */}
      {completedCount > 0 && (
        <Button
          data-testid="clear-finished-button"
          variant="subtle"
          color="gray"
          size="xs"
          onClick={(): void => { void handleClearCompleted(); }}
          loading={isClearing}
        >
          Clear finished ({completedCount})
        </Button>
      )}
    </Stack>
  );
}

interface SortableTodoItemProps {
  todo: TodoItem;
  onToggle: (todoId: string) => Promise<void>;
  onDelete: (todoId: string) => Promise<void>;
}

function SortableTodoItem({ todo, onToggle, onDelete }: SortableTodoItemProps): React.ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggle = (): void => {
    void onToggle(todo.id);
  };

  const handleDelete = async (): Promise<void> => {
    setIsDeleting(true);
    try {
      await onDelete(todo.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Group
      ref={setNodeRef}
      style={{
        ...style,
        padding: '4px 8px',
        borderRadius: '4px',
        backgroundColor: 'var(--mantine-color-dark-6)',
      }}
      data-testid={`todo-item-${todo.id}`}
      gap="xs"
      wrap="nowrap"
    >
      {/* Drag handle */}
      <ActionIcon
        data-testid="drag-handle"
        variant="subtle"
        color="gray"
        size="sm"
        style={{ cursor: 'grab', touchAction: 'none' }}
        {...attributes}
        {...listeners}
      >
        <IconGripVertical size={14} />
      </ActionIcon>

      <Checkbox
        checked={todo.completed}
        onChange={handleToggle}
        styles={{
          label: {
            textDecoration: todo.completed ? 'line-through' : 'none',
            color: todo.completed ? 'var(--mantine-color-dimmed)' : 'inherit',
          },
        }}
        label={
          <Box
            component="span"
            style={{
              textDecoration: todo.completed ? 'line-through' : 'none',
              color: todo.completed ? 'var(--mantine-color-dimmed)' : 'inherit',
            }}
          >
            {todo.text}
          </Box>
        }
        flex={1}
      />

      {/* Menu with delete option */}
      <Menu shadow="md" width={120} position="bottom-end">
        <Menu.Target>
          <ActionIcon
            data-testid="todo-menu-button"
            variant="subtle"
            color="gray"
            size="sm"
          >
            <IconDots size={14} />
          </ActionIcon>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item
            data-testid="delete-todo-menu-item"
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={(): void => { void handleDelete(); }}
            disabled={isDeleting}
          >
            Delete
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
