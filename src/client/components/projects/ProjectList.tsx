import { Stack } from '@mantine/core';
import type { Project } from '@shared/types';
import { ProjectItem } from './ProjectItem';

interface ProjectListProps {
  projects: Project[];
}

export function ProjectList({ projects }: ProjectListProps): React.ReactElement {
  return (
    <Stack gap="xs">
      {projects.map((project) => (
        <ProjectItem key={project.id} project={project} />
      ))}
    </Stack>
  );
}
