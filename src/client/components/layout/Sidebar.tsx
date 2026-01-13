import { useMemo } from 'react';
import { Box, Group, Text, Stack, ActionIcon, Loader } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useProjects } from '@client/hooks/useProjects';
import { useUIStore } from '@client/stores/uiStore';
import { ProjectList } from '@client/components/projects/ProjectList';

export function Sidebar(): React.ReactElement {
  const { data: projects = [], isLoading, isError } = useProjects();
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );
  const openAddProjectModal = useUIStore((state) => state.openAddProjectModal);

  return (
    <Box
      data-testid="sidebar"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--mantine-color-dark-7)',
      }}
    >
      <Box p="md" pb="xs">
        <Group justify="space-between">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            Projects
          </Text>
          <ActionIcon
            variant="subtle"
            size="xs"
            onClick={openAddProjectModal}
            data-testid="add-project-button"
            aria-label="Add project"
          >
            <IconPlus size={14} />
          </ActionIcon>
        </Group>
      </Box>

      <Box style={{ flex: 1, overflow: 'auto' }} p="xs">
        {isLoading ? (
          <Stack align="center" justify="center" style={{ height: 200 }}>
            <Loader size="sm" />
          </Stack>
        ) : isError ? (
          <Stack align="center" justify="center" style={{ height: 200 }}>
            <Text size="sm" c="red" ta="center">
              Failed to load projects
            </Text>
          </Stack>
        ) : sortedProjects.length === 0 ? (
          <Stack align="center" justify="center" style={{ height: 200 }}>
            <Text size="sm" c="dimmed" ta="center">
              No projects yet
            </Text>
            <Text size="xs" c="dimmed" ta="center">
              Click + to add a project
            </Text>
          </Stack>
        ) : (
          <ProjectList projects={sortedProjects} />
        )}
      </Box>
    </Box>
  );
}
