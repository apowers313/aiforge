export interface MockDirectory {
  name: string;
  path: string;
  children?: MockDirectory[];
}

export const mockFilesystem: MockDirectory = {
  name: 'home',
  path: '/home',
  children: [
    {
      name: 'projects',
      path: '/home/projects',
      children: [
        {
          name: 'my-app',
          path: '/home/projects/my-app',
          children: [
            { name: 'src', path: '/home/projects/my-app/src' },
            { name: 'tests', path: '/home/projects/my-app/tests' },
            { name: 'docs', path: '/home/projects/my-app/docs' },
          ],
        },
        {
          name: 'api-server',
          path: '/home/projects/api-server',
          children: [
            { name: 'src', path: '/home/projects/api-server/src' },
            { name: 'config', path: '/home/projects/api-server/config' },
          ],
        },
        {
          name: 'frontend',
          path: '/home/projects/frontend',
          children: [
            { name: 'components', path: '/home/projects/frontend/components' },
            { name: 'pages', path: '/home/projects/frontend/pages' },
            { name: 'styles', path: '/home/projects/frontend/styles' },
          ],
        },
      ],
    },
    {
      name: 'documents',
      path: '/home/documents',
      children: [
        { name: 'notes', path: '/home/documents/notes' },
        { name: 'reports', path: '/home/documents/reports' },
      ],
    },
    {
      name: 'workspace',
      path: '/home/workspace',
      children: [
        { name: 'experiments', path: '/home/workspace/experiments' },
        { name: 'sandbox', path: '/home/workspace/sandbox' },
      ],
    },
  ],
};

export function getDirectoryContents(path: string): MockDirectory[] {
  if (path === '/home') {
    return mockFilesystem.children ?? [];
  }

  const parts = path.split('/').filter(Boolean);
  let current: MockDirectory = mockFilesystem;

  // Start from index 1 to skip 'home' since we start at /home
  for (let i = 1; i < parts.length; i++) {
    if (!current.children) return [];
    const next = current.children.find((d) => d.name === parts[i]);
    if (!next) return [];
    current = next;
  }

  return current.children ?? [];
}

export function getParentPath(path: string): string {
  if (path === '/home') return '/home';
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 1) return '/home';
  return '/' + parts.slice(0, -1).join('/');
}

export function getBreadcrumbs(path: string): { name: string; path: string }[] {
  const parts = path.split('/').filter(Boolean);
  const breadcrumbs: { name: string; path: string }[] = [];

  let currentPath = '';
  for (const part of parts) {
    currentPath += '/' + part;
    breadcrumbs.push({ name: part, path: currentPath });
  }

  return breadcrumbs;
}
