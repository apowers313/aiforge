/**
 * Project files API integration tests
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTestServer, type TestServer } from '../../helpers/server.js';
import type { FileTreeNode, FilePreview as FilePreviewType } from '@shared/types/index.js';

interface FilesResponse {
  files: FileTreeNode[];
  gitModifiedOnly: boolean;
}

type FilePreviewResponse = FilePreviewType;

interface ProjectResponse {
  project: {
    id: string;
    name: string;
    path: string;
  };
}

describe('Project Files API', () => {
  let server: TestServer;
  let projectDir: string;
  let projectId: string;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    // Create a unique project directory for each test
    projectDir = join(server.tempDir, `project-${String(Date.now())}`);
    await mkdir(projectDir, { recursive: true });

    // Create the project
    const response = await request(server.app)
      .post('/api/projects')
      .set('Cookie', server.authCookie)
      .send({ path: projectDir });

    const body = response.body as ProjectResponse;
    projectId = body.project.id;
  });

  describe('GET /api/projects/:id/files', () => {
    it('requires authentication', async () => {
      await request(server.app)
        .get(`/api/projects/${projectId}/files`)
        .expect(401);
    });

    it('returns 200 with file tree', async () => {
      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilesResponse;
      expect(body).toHaveProperty('files');
      expect(Array.isArray(body.files)).toBe(true);
    });

    it('returns 404 for non-existent project', async () => {
      await request(server.app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000/files')
        .set('Cookie', server.authCookie)
        .expect(404);
    });

    it('returns gitModifiedOnly true by default', async () => {
      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilesResponse;
      expect(body.gitModifiedOnly).toBe(true);
    });

    it('respects gitModifiedOnly=false query param', async () => {
      // Create some test files first
      await writeFile(join(projectDir, 'test.ts'), 'export const x = 1;');

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files?gitModifiedOnly=false`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilesResponse;
      expect(body.gitModifiedOnly).toBe(false);
    });

    it('returns files with correct structure', async () => {
      // Create test files
      await mkdir(join(projectDir, 'src'), { recursive: true });
      await writeFile(join(projectDir, 'src', 'index.ts'), 'export {};');

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files?gitModifiedOnly=false`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilesResponse;

      // Find the index.ts file (could be nested or flat depending on implementation)
      const hasIndexFile = body.files.some((f) =>
        f.name === 'index.ts' ||
        (f.type === 'directory' && f.name === 'src' && f.children?.some((c) => c.name === 'index.ts')),
      );
      expect(hasIndexFile).toBe(true);
    });

    it('excludes node_modules directory', async () => {
      // Create node_modules with a file
      await mkdir(join(projectDir, 'node_modules', 'test-pkg'), { recursive: true });
      await writeFile(join(projectDir, 'node_modules', 'test-pkg', 'index.js'), '');
      await writeFile(join(projectDir, 'index.ts'), '');

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files?gitModifiedOnly=false`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilesResponse;
      const hasNodeModules = body.files.some((f) => f.name === 'node_modules');
      expect(hasNodeModules).toBe(false);
    });

    it('excludes .git directory', async () => {
      // Create .git with a file
      await mkdir(join(projectDir, '.git', 'objects'), { recursive: true });
      await writeFile(join(projectDir, '.git', 'config'), '');
      await writeFile(join(projectDir, 'index.ts'), '');

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files?gitModifiedOnly=false`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilesResponse;
      const hasGitDir = body.files.some((f) => f.name === '.git');
      expect(hasGitDir).toBe(false);
    });
  });

  describe('GET /api/projects/:id/files/:path/preview', () => {
    it('requires authentication', async () => {
      await writeFile(join(projectDir, 'test.ts'), 'const x = 1;');

      await request(server.app)
        .get(`/api/projects/${projectId}/files/test.ts/preview`)
        .expect(401);
    });

    it('returns file content preview', async () => {
      await writeFile(join(projectDir, 'test.ts'), 'const x = 1;\nconsole.log(x);');

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files/test.ts/preview`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilePreviewResponse;
      expect(body).toHaveProperty('content');
      expect(body).toHaveProperty('language');
      expect(body).toHaveProperty('truncated');
      expect(body).toHaveProperty('totalLines');
      expect(body.content).toContain('const x = 1');
    });

    it('returns 404 for non-existent project', async () => {
      await request(server.app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000/files/test.ts/preview')
        .set('Cookie', server.authCookie)
        .expect(404);
    });

    it('returns 404 for non-existent file', async () => {
      await request(server.app)
        .get(`/api/projects/${projectId}/files/nonexistent.ts/preview`)
        .set('Cookie', server.authCookie)
        .expect(404);
    });

    it('detects TypeScript language', async () => {
      await writeFile(join(projectDir, 'test.ts'), 'const x: number = 1;');

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files/test.ts/preview`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilePreviewResponse;
      expect(body.language).toBe('typescript');
    });

    it('detects JavaScript language', async () => {
      await writeFile(join(projectDir, 'test.js'), 'const x = 1;');

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files/test.js/preview`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilePreviewResponse;
      expect(body.language).toBe('javascript');
    });

    it('detects JSON language', async () => {
      await writeFile(join(projectDir, 'test.json'), '{"key": "value"}');

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files/test.json/preview`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilePreviewResponse;
      expect(body.language).toBe('json');
    });

    it('detects markdown language', async () => {
      await writeFile(join(projectDir, 'test.md'), '# Hello');

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files/test.md/preview`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilePreviewResponse;
      expect(body.language).toBe('markdown');
    });

    it('handles files in subdirectories', async () => {
      await mkdir(join(projectDir, 'src'), { recursive: true });
      await writeFile(join(projectDir, 'src', 'index.ts'), 'export {};');

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files/src%2Findex.ts/preview`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilePreviewResponse;
      expect(body.content).toBe('export {};');
    });

    it('truncates large files', async () => {
      // Create a file with more than 10000 lines (the default maxLines limit)
      const lineCount = 10500;
      const lines = Array.from({ length: lineCount }, (_, i) => `const line${String(i + 1)} = ${String(i + 1)};`).join('\n');
      await writeFile(join(projectDir, 'large.ts'), lines);

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files/large.ts/preview`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilePreviewResponse;
      expect(body.truncated).toBe(true);
      expect(body.totalLines).toBe(lineCount);
      // Content should only have first 10000 lines
      const contentLines = body.content.split('\n');
      expect(contentLines.length).toBe(10000);
    });

    it('reports correct total lines for non-truncated files', async () => {
      await writeFile(join(projectDir, 'small.ts'), 'line1\nline2\nline3');

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/files/small.ts/preview`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as FilePreviewResponse;
      expect(body.truncated).toBe(false);
      expect(body.totalLines).toBe(3);
    });

    it('blocks path traversal attempts', async () => {
      // Try to access a file outside the project directory
      await request(server.app)
        .get(`/api/projects/${projectId}/files/..%2F..%2Fetc%2Fpasswd/preview`)
        .set('Cookie', server.authCookie)
        .expect(400);
    });
  });
});
