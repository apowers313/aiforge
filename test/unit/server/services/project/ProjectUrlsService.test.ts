/**
 * Tests for ProjectUrlsService - custom URLs storage per project
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectUrlsService } from '@server/services/project/ProjectUrlsService.js';
import { ProjectUrlsStore } from '@server/storage/stores/ProjectUrlsStore.js';

describe('ProjectUrlsService', () => {
  let service: ProjectUrlsService;
  let store: ProjectUrlsStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'project-urls-test-'));
    store = new ProjectUrlsStore(join(tempDir, 'project-urls.json'));
    service = new ProjectUrlsService({ projectUrlsStore: store });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getUrls', () => {
    it('returns empty array for project with no URLs', async () => {
      const urls = await service.getUrls('project-1');

      expect(urls).toEqual([]);
    });

    it('returns URLs for project with URLs', async () => {
      await service.addUrl('project-1', 'Docs', 'https://docs.example.com');

      const urls = await service.getUrls('project-1');

      expect(urls).toHaveLength(1);
      expect(urls[0]?.name).toBe('Docs');
      expect(urls[0]?.url).toBe('https://docs.example.com');
    });
  });

  describe('addUrl', () => {
    it('creates URL with generated ID', async () => {
      const url = await service.addUrl('project-1', 'Docs', 'https://docs.example.com');

      expect(url.id).toBeDefined();
      expect(url.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(url.name).toBe('Docs');
      expect(url.url).toBe('https://docs.example.com');
      expect(url.createdAt).toBeDefined();
    });

    it('stores URL for the correct project', async () => {
      await service.addUrl('project-1', 'Docs', 'https://docs1.example.com');
      await service.addUrl('project-2', 'API', 'https://api.example.com');

      const urls1 = await service.getUrls('project-1');
      const urls2 = await service.getUrls('project-2');

      expect(urls1).toHaveLength(1);
      expect(urls1[0]?.name).toBe('Docs');
      expect(urls2).toHaveLength(1);
      expect(urls2[0]?.name).toBe('API');
    });

    it('allows multiple URLs per project', async () => {
      await service.addUrl('project-1', 'Docs', 'https://docs.example.com');
      await service.addUrl('project-1', 'API', 'https://api.example.com');
      await service.addUrl('project-1', 'Admin', 'https://admin.example.com');

      const urls = await service.getUrls('project-1');

      expect(urls).toHaveLength(3);
    });
  });

  describe('updateUrl', () => {
    it('updates URL name', async () => {
      const created = await service.addUrl('project-1', 'Docs', 'https://docs.example.com');

      const updated = await service.updateUrl('project-1', created.id, {
        name: 'Documentation',
      });

      expect(updated?.name).toBe('Documentation');
      expect(updated?.url).toBe('https://docs.example.com');
    });

    it('updates URL url', async () => {
      const created = await service.addUrl('project-1', 'Docs', 'https://docs.example.com');

      const updated = await service.updateUrl('project-1', created.id, {
        url: 'https://new-docs.example.com',
      });

      expect(updated?.name).toBe('Docs');
      expect(updated?.url).toBe('https://new-docs.example.com');
    });

    it('updates both name and URL', async () => {
      const created = await service.addUrl('project-1', 'Docs', 'https://docs.example.com');

      const updated = await service.updateUrl('project-1', created.id, {
        name: 'New Name',
        url: 'https://new.example.com',
      });

      expect(updated?.name).toBe('New Name');
      expect(updated?.url).toBe('https://new.example.com');
    });

    it('returns null for non-existent URL', async () => {
      const updated = await service.updateUrl('project-1', 'nonexistent', {
        name: 'New Name',
      });

      expect(updated).toBeNull();
    });

    it('returns null for URL in different project', async () => {
      const created = await service.addUrl('project-1', 'Docs', 'https://docs.example.com');

      const updated = await service.updateUrl('project-2', created.id, {
        name: 'New Name',
      });

      expect(updated).toBeNull();
    });
  });

  describe('deleteUrl', () => {
    it('removes URL from project', async () => {
      const created = await service.addUrl('project-1', 'Docs', 'https://docs.example.com');

      const result = await service.deleteUrl('project-1', created.id);

      expect(result).toBe(true);

      const urls = await service.getUrls('project-1');
      expect(urls).toHaveLength(0);
    });

    it('returns false for non-existent URL', async () => {
      const result = await service.deleteUrl('project-1', 'nonexistent');

      expect(result).toBe(false);
    });

    it('only deletes from correct project', async () => {
      const created = await service.addUrl('project-1', 'Docs', 'https://docs.example.com');

      const result = await service.deleteUrl('project-2', created.id);

      expect(result).toBe(false);

      // URL should still exist in project-1
      const urls = await service.getUrls('project-1');
      expect(urls).toHaveLength(1);
    });
  });

  describe('deleteAllUrls', () => {
    it('removes all URLs for a project', async () => {
      await service.addUrl('project-1', 'Docs', 'https://docs.example.com');
      await service.addUrl('project-1', 'API', 'https://api.example.com');
      await service.addUrl('project-2', 'Other', 'https://other.example.com');

      await service.deleteAllUrls('project-1');

      const urls1 = await service.getUrls('project-1');
      const urls2 = await service.getUrls('project-2');

      expect(urls1).toHaveLength(0);
      expect(urls2).toHaveLength(1);
    });
  });
});
