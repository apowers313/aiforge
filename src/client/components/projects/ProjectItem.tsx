import { Box, Group, Text, UnstyledButton, Collapse, ActionIcon, Menu } from '@mantine/core';
import { IconFolder, IconChevronRight, IconChevronDown, IconDots, IconTrash, IconPlus } from '@tabler/icons-react';
import type { Project } from '@shared/types';
import { useUIStore } from '@client/stores/uiStore';
import { useDeleteProject } from '@client/hooks/useProjects';
import { useShells, useCreateShell, useActiveShellId } from '@client/hooks/useShells';
import { ShellList } from '@client/components/shells/ShellList';

interface ProjectItemProps {
  project: Project;
}

export function ProjectItem({ project }: ProjectItemProps): React.ReactElement {
  const isExpanded = useUIStore((state) => state.expandedProjectIds.includes(project.id));
  const toggleProjectExpanded = useUIStore((state) => state.toggleProjectExpanded);
  const deleteProjectMutation = useDeleteProject();
  const createShellMutation = useCreateShell();
  const { setActiveShell } = useActiveShellId();
  const { data: shells = [] } = useShells(project.id);

  const handleToggle = (): void => {
    toggleProjectExpanded(project.id);
  };

  const handleDelete = (): void => {
    deleteProjectMutation.mutate(project.id);
  };

  const handleAddShell = (e: React.MouseEvent): void => {
    e.stopPropagation();
    const shellNumber = shells.length + 1;
    const shellName = `bash-${String(shellNumber)}`;

    createShellMutation.mutate(
      { projectId: project.id, name: shellName },
      {
        onSuccess: (data) => {
          setActiveShell(data.shell.id);
        },
      },
    );
  };

  return (
    <Box>
      <Group gap={0} wrap="nowrap">
        <UnstyledButton
          onClick={handleToggle}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 'var(--mantine-radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
          className="project-item"
          data-testid="project-item"
        >
          {isExpanded ? (
            <IconChevronDown size={14} style={{ flexShrink: 0 }} />
          ) : (
            <IconChevronRight size={14} style={{ flexShrink: 0 }} />
          )}
          <IconFolder size={16} style={{ flexShrink: 0, color: 'var(--mantine-color-blue-4)' }} />
          <Text size="sm" truncate style={{ flex: 1 }}>
            {project.name}
          </Text>
        </UnstyledButton>

        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={handleAddShell}
          aria-label="Add shell"
          data-testid="add-shell-button"
        >
          <IconPlus size={14} />
        </ActionIcon>

        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={(e) => { e.stopPropagation(); }}
              data-testid="project-menu"
            >
              <IconDots size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={handleDelete}
              data-testid="delete-project"
            >
              Delete Project
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Collapse in={isExpanded}>
        <Box pl="xl" py="xs">
          <ShellList shells={shells} projectId={project.id} />
        </Box>
      </Collapse>
    </Box>
  );
}
