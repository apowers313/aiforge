/**
 * Filesystem API integration tests
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTestServer, type TestServer } from '../../helpers/server.js';

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface BrowseResponse {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
}

interface ValidateResponse {
  valid: boolean;
  isDirectory: boolean;
  path: string;
}

describe('Filesystem API', () => {
  let server: TestServer;
  let testDir: string;

  beforeAll(async () => {
    server = await createTestServer();
    testDir = join(server.tempDir, 'fs-test');

    // Create test directory structure
    await mkdir(join(testDir, 'subdir'), { recursive: true });
    await writeFile(join(testDir, 'file.txt'), 'content');
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /api/filesystem/browse', () => {
    it('returns directory contents', async () => {
      const response = await request(server.app)
        .get('/api/filesystem/browse')
        .query({ path: testDir })
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as BrowseResponse;
      expect(body.path).toBe(testDir);
      expect(body.entries).toBeInstanceOf(Array);
    });

    it('returns only directories, not files', async () => {
      const response = await request(server.app)
        .get('/api/filesystem/browse')
        .query({ path: testDir })
        .set('Cookie', server.authCookie);

      const body = response.body as BrowseResponse;
      const names = body.entries.map((e) => e.name);
      expect(names).toContain('subdir');
      expect(names).not.toContain('file.txt');
    });

    it('returns parent path for navigation', async () => {
      const response = await request(server.app)
        .get('/api/filesystem/browse')
        .query({ path: join(testDir, 'subdir') })
        .set('Cookie', server.authCookie);

      const body = response.body as BrowseResponse;
      expect(body.parent).toBe(testDir);
    });

    it('requires authentication', async () => {
      await request(server.app)
        .get('/api/filesystem/browse')
        .query({ path: testDir })
        .expect(401);
    });

    it('returns 400 for non-existent path', async () => {
      await request(server.app)
        .get('/api/filesystem/browse')
        .query({ path: '/nonexistent/path/12345' })
        .set('Cookie', server.authCookie)
        .expect(400);
    });
  });

  describe('GET /api/filesystem/validate', () => {
    it('returns valid:true for existing directory', async () => {
      const response = await request(server.app)
        .get('/api/filesystem/validate')
        .query({ path: testDir })
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as ValidateResponse;
      expect(body.valid).toBe(true);
      expect(body.isDirectory).toBe(true);
    });

    it('returns valid:false for non-existent path', async () => {
      const response = await request(server.app)
        .get('/api/filesystem/validate')
        .query({ path: '/nonexistent/path' })
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as ValidateResponse;
      expect(body.valid).toBe(false);
    });

    it('returns isDirectory:false for files', async () => {
      const response = await request(server.app)
        .get('/api/filesystem/validate')
        .query({ path: join(testDir, 'file.txt') })
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as ValidateResponse;
      expect(body.valid).toBe(true);
      expect(body.isDirectory).toBe(false);
    });
  });
});
