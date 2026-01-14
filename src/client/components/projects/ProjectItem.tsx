import { Box, Group, Text, UnstyledButton, Collapse, ActionIcon, Menu } from '@mantine/core';
import { IconFolder, IconChevronRight, IconChevronDown, IconDots, IconTrash, IconPlus, IconSparkles } from '@tabler/icons-react';
import type { Project } from '@shared/types';
import { useUIStore } from '@client/stores/uiStore';
import { useDeleteProject } from '@client/hooks/useProjects';
import { useShells, useCreateShell, useActiveShellId } from '@client/hooks/useShells';
import { ShellList } from '@client/components/shells/ShellList';
import { useProjectAiStatus, type ProjectAiStatus } from '@client/components/shells/ShellItem';

interface ProjectItemProps {
  project: Project;
}

function getProjectStatusColor(status: ProjectAiStatus): string | null {
  switch (status) {
    case 'red':
      return 'var(--mantine-color-red-6)';
    case 'green':
      return 'var(--mantine-color-green-6)';
    case 'blue':
      return 'var(--mantine-color-blue-6)';
    default:
      return null;
  }
}

export function ProjectItem({ project }: ProjectItemProps): React.ReactElement {
  const isExpanded = useUIStore((state) => state.expandedProjectIds.includes(project.id));
  const toggleProjectExpanded = useUIStore((state) => state.toggleProjectExpanded);
  const deleteProjectMutation = useDeleteProject();
  const createShellMutation = useCreateShell();
  const { setActiveShell } = useActiveShellId();
  const { data: shells = [] } = useShells(project.id);
  const projectAiStatus = useProjectAiStatus(shells);
  const statusColor = getProjectStatusColor(projectAiStatus);

  const handleToggle = (): void => {
    toggleProjectExpanded(project.id);
  };

  const handleDelete = (): void => {
    deleteProjectMutation.mutate(project.id);
  };

  const handleAddShell = (e: React.MouseEvent): void => {
    e.stopPropagation();
    const bashShellCount = shells.filter((s) => s.type === 'bash').length;
    const shellName = `bash-${String(bashShellCount + 1)}`;

    createShellMutation.mutate(
      { projectId: project.id, name: shellName, type: 'bash' },
      {
        onSuccess: (data) => {
          setActiveShell(data.shell.id);
        },
      },
    );
  };

  const handleAddAiShell = (e: React.MouseEvent): void => {
    e.stopPropagation();
    const aiShellCount = shells.filter((s) => s.type === 'ai').length;
    const shellName = `ai-${String(aiShellCount + 1)}`;

    createShellMutation.mutate(
      { projectId: project.id, name: shellName, type: 'ai' },
      {
        onSuccess: (data) => {
          setActiveShell(data.shell.id);
        },
      },
    );
  };

  // Gutter width for status indicators (3px indicator + 4px margin)
  const gutterWidth = 7;

  return (
    <Box style={{ display: 'flex' }}>
      {/* Gutter column for status indicators - fixed width, always present */}
      <Box
        style={{
          width: gutterWidth,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Project status indicator */}
        {statusColor && (
          <Box
            style={{
              width: 3,
              backgroundColor: statusColor,
              borderRadius: 'var(--mantine-radius-xs)',
              minHeight: 36, // Match project row height
              flexShrink: 0,
            }}
            data-testid="project-ai-status-indicator"
          />
        )}
      </Box>

      {/* Content column */}
      <Box style={{ flex: 1, minWidth: 0 }}>
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
            onClick={handleAddAiShell}
            aria-label="Add AI shell"
            data-testid="add-ai-shell-button"
          >
            <IconSparkles size={14} style={{ color: 'var(--mantine-color-violet-4)' }} />
          </ActionIcon>

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
          <Box py="xs" pl={16}>
            <ShellList shells={shells} projectId={project.id} indicatorOffset={gutterWidth + 16} />
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
}
