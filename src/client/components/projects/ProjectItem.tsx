import { useState } from 'react';
import { Box, Group, Text, UnstyledButton, Collapse, ActionIcon } from '@mantine/core';
import { IconFolder, IconChevronRight, IconChevronDown, IconPlus, IconSparkles } from '@tabler/icons-react';
import { ProjectContextMenu } from './ProjectContextMenu';
import type { Project } from '@shared/types';
import { useUIStore } from '@client/stores/uiStore';
import { useDeleteProject } from '@client/hooks/useProjects';
import { useShells, useCreateShell, useActiveShellId } from '@client/hooks/useShells';
import { ShellList } from '@client/components/shells/ShellList';
import { useProjectAiStatus, type ProjectAiStatus } from '@client/components/shells/ShellItem';
import { log } from '@client/services/logger';

const projectLog = log.project;
const shellLog = log.shell;

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
  const toggleContextSidebar = useUIStore((state) => state.toggleContextSidebar);
  const activeShellId = useUIStore((state) => state.activeShellId);
  const selectedContextType = useUIStore((state) => state.selectedContextType);
  const selectedContextId = useUIStore((state) => state.selectedContextId);
  const deleteProjectMutation = useDeleteProject();
  const createShellMutation = useCreateShell();
  const { setActiveShell } = useActiveShellId();
  const { data: shells = [] } = useShells(project.id);
  const projectAiStatus = useProjectAiStatus(shells);
  const statusColor = getProjectStatusColor(projectAiStatus);
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  // Project is highlighted when it's the selected context and no shell is active
  const isSelected = selectedContextType === 'project' && selectedContextId === project.id && activeShellId === null;

  const handleToggle = (e: React.MouseEvent): void => {
    e.stopPropagation();
    projectLog.debug({ projectId: project.id, projectName: project.name, expanded: !isExpanded }, 'Project toggle');
    toggleProjectExpanded(project.id);
  };

  const handleOpenContext = (): void => {
    projectLog.debug({ projectId: project.id, projectName: project.name }, 'Opening project context sidebar');
    toggleContextSidebar('project', project.id);
  };

  const handleDelete = (): void => {
    projectLog.info({ projectId: project.id, projectName: project.name }, 'Deleting project');
    deleteProjectMutation.mutate(project.id);
  };

  const handleAddBashShell = (): void => {
    const bashShellCount = shells.filter((s) => s.type === 'bash').length;
    const shellName = `bash-${String(bashShellCount + 1)}`;

    shellLog.info({ projectId: project.id, shellName, type: 'bash' }, 'Creating bash shell');
    createShellMutation.mutate(
      { projectId: project.id, name: shellName, type: 'bash' },
      {
        onSuccess: (data) => {
          shellLog.info({ shellId: data.shell.id, shellName }, 'Shell created, setting active');
          setActiveShell(data.shell.id);
        },
      },
    );
  };

  const handleAddAiShell = (): void => {
    const aiShellCount = shells.filter((s) => s.type === 'ai').length;
    const shellName = `ai-${String(aiShellCount + 1)}`;

    shellLog.info({ projectId: project.id, shellName, type: 'ai' }, 'Creating AI shell');
    createShellMutation.mutate(
      { projectId: project.id, name: shellName, type: 'ai' },
      {
        onSuccess: (data) => {
          shellLog.info({ shellId: data.shell.id, shellName }, 'AI shell created, setting active');
          setActiveShell(data.shell.id);
        },
      },
    );
  };

  const handleAddShellClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    handleAddBashShell();
  };

  const handleAddAiShellClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    handleAddAiShell();
  };

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuOpened(true);
  };

  const handleCloseContextMenu = (): void => {
    setContextMenuOpened(false);
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
      <Box style={{ flex: 1, minWidth: 0 }} onContextMenu={handleContextMenu}>
        <Group gap={0} wrap="nowrap">
          <Box
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 'var(--mantine-radius-sm)',
              backgroundColor: isSelected ? 'var(--mantine-color-dark-5)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            className="project-item"
            data-testid="project-item"
          >
            {/* Chevron: expands/collapses shell list */}
            <UnstyledButton
              onClick={handleToggle}
              style={{ display: 'flex', alignItems: 'center' }}
              data-testid="project-chevron"
            >
              {isExpanded ? (
                <IconChevronDown size={14} style={{ flexShrink: 0 }} />
              ) : (
                <IconChevronRight size={14} style={{ flexShrink: 0 }} />
              )}
            </UnstyledButton>
            {/* Folder + Name: opens context sidebar */}
            <UnstyledButton
              onClick={handleOpenContext}
              style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}
              data-testid="project-name"
            >
              <IconFolder size={16} style={{ flexShrink: 0, color: 'var(--mantine-color-blue-4)' }} />
              <Text size="sm" truncate style={{ flex: 1 }}>
                {project.name}
              </Text>
            </UnstyledButton>
          </Box>

          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={handleAddAiShellClick}
            aria-label="Add AI shell"
            data-testid="add-ai-shell-button"
          >
            <IconSparkles size={14} style={{ color: 'var(--mantine-color-violet-4)' }} />
          </ActionIcon>

          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={handleAddShellClick}
            aria-label="Add shell"
            data-testid="add-shell-button"
          >
            <IconPlus size={14} />
          </ActionIcon>
        </Group>

        <ProjectContextMenu
          project={project}
          opened={contextMenuOpened}
          position={contextMenuPosition}
          onClose={handleCloseContextMenu}
          onAddAiShell={handleAddAiShell}
          onAddBashShell={handleAddBashShell}
          onDelete={handleDelete}
          worktreeEnabled={false}
        />

        <Collapse in={isExpanded}>
          <Box py="xs" pl={16}>
            <ShellList shells={shells} projectId={project.id} indicatorOffset={gutterWidth + 16} />
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
}
