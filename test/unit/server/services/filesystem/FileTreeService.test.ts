/**
 * Tests for FileTreeService - file tree and preview functionality
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileTreeService } from '@server/services/filesystem/FileTreeService.js';

// Mock simple-git module
vi.mock('simple-git', () => {
  const mockGit = {
    status: vi.fn(),
  };
  return {
    simpleGit: vi.fn(() => mockGit),
    default: vi.fn(() => mockGit),
  };
});

describe('FileTreeService', () => {
  let service: FileTreeService;
  let tempDir: string;
  let mockGit: { status: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'file-tree-test-'));
    service = new FileTreeService();

    // Get the mock
    const simpleGitModule = await import('simple-git');
    mockGit = (simpleGitModule.simpleGit as ReturnType<typeof vi.fn>)() as {
      status: ReturnType<typeof vi.fn>;
    };
    mockGit.status.mockReset();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('getFileTree', () => {
    it('returns git-modified files only by default', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['src/index.ts'],
        not_added: ['src/new.ts'],
        staged: [],
        deleted: [],
        renamed: [],
      });

      const tree = await service.getFileTree(tempDir, { gitModifiedOnly: true });

      // Files are organized into folder structure
      expect(tree).toHaveLength(1);
      expect(tree[0]?.name).toBe('src');
      expect(tree[0]?.type).toBe('directory');
      expect(tree[0]?.children).toHaveLength(2);
      expect(tree[0]?.children?.some((f) => f.path === 'src/index.ts')).toBe(true);
      expect(tree[0]?.children?.some((f) => f.path === 'src/new.ts')).toBe(true);
    });

    it('sets correct git status for modified files', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['file.ts'],
        not_added: [],
        staged: [],
        deleted: [],
        renamed: [],
      });

      const tree = await service.getFileTree(tempDir, { gitModifiedOnly: true });

      expect(tree[0]?.gitStatus).toBe('modified');
    });

    it('sets correct git status for untracked files', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        not_added: ['newfile.ts'],
        staged: [],
        deleted: [],
        renamed: [],
      });

      const tree = await service.getFileTree(tempDir, { gitModifiedOnly: true });

      expect(tree[0]?.gitStatus).toBe('untracked');
    });

    it('sets correct git status for staged files', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        not_added: [],
        staged: ['staged.ts'],
        deleted: [],
        renamed: [],
      });

      const tree = await service.getFileTree(tempDir, { gitModifiedOnly: true });

      expect(tree[0]?.gitStatus).toBe('staged');
    });

    it('sets correct git status for deleted files', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        not_added: [],
        staged: [],
        deleted: ['deleted.ts'],
        renamed: [],
      });

      const tree = await service.getFileTree(tempDir, { gitModifiedOnly: true });

      expect(tree[0]?.gitStatus).toBe('deleted');
    });

    it('sets correct git status for renamed files', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        not_added: [],
        staged: [],
        deleted: [],
        renamed: [{ from: 'old.ts', to: 'new.ts' }],
      });

      const tree = await service.getFileTree(tempDir, { gitModifiedOnly: true });

      expect(tree[0]?.gitStatus).toBe('renamed');
      expect(tree[0]?.path).toBe('new.ts');
    });

    it('returns full file tree when gitModifiedOnly is false', async () => {
      // Create test files
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await writeFile(join(tempDir, 'src', 'index.ts'), 'export {};');
      await writeFile(join(tempDir, 'package.json'), '{}');

      mockGit.status.mockResolvedValue({
        modified: [],
        not_added: [],
        staged: [],
        deleted: [],
        renamed: [],
      });

      const tree = await service.getFileTree(tempDir, { gitModifiedOnly: false });

      expect(tree.length).toBeGreaterThan(0);
      // Should have files in the tree
      const hasPackageJson = tree.some((f) => f.name === 'package.json');
      const hasSrcDir = tree.some((f) => f.name === 'src' && f.type === 'directory');
      expect(hasPackageJson || hasSrcDir).toBe(true);
    });

    it('excludes node_modules directory', async () => {
      // Create test files
      await mkdir(join(tempDir, 'node_modules', 'some-package'), { recursive: true });
      await writeFile(join(tempDir, 'node_modules', 'some-package', 'index.js'), '');
      await writeFile(join(tempDir, 'index.ts'), '');

      mockGit.status.mockResolvedValue({
        modified: [],
        not_added: [],
        staged: [],
        deleted: [],
        renamed: [],
      });

      const tree = await service.getFileTree(tempDir, { gitModifiedOnly: false });

      const hasNodeModules = tree.some((f) => f.path.includes('node_modules'));
      expect(hasNodeModules).toBe(false);
    });

    it('excludes .git directory', async () => {
      // Create test files
      await mkdir(join(tempDir, '.git', 'objects'), { recursive: true });
      await writeFile(join(tempDir, '.git', 'config'), '');
      await writeFile(join(tempDir, 'index.ts'), '');

      mockGit.status.mockResolvedValue({
        modified: [],
        not_added: [],
        staged: [],
        deleted: [],
        renamed: [],
      });

      const tree = await service.getFileTree(tempDir, { gitModifiedOnly: false });

      const hasGitDir = tree.some((f) => f.path.includes('.git'));
      expect(hasGitDir).toBe(false);
    });

    it('handles git errors gracefully', async () => {
      mockGit.status.mockRejectedValue(new Error('Not a git repository'));

      const tree = await service.getFileTree(tempDir, { gitModifiedOnly: true });

      expect(tree).toEqual([]);
    });

    it('returns empty array when no modified files', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        not_added: [],
        staged: [],
        deleted: [],
        renamed: [],
      });

      const tree = await service.getFileTree(tempDir, { gitModifiedOnly: true });

      expect(tree).toEqual([]);
    });

    it('extracts file name from path', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['src/components/Button.tsx'],
        not_added: [],
        staged: [],
        deleted: [],
        renamed: [],
      });

      const tree = await service.getFileTree(tempDir, { gitModifiedOnly: true });

      // Navigate tree to find the file: src -> components -> Button.tsx
      const srcDir = tree[0];
      expect(srcDir?.name).toBe('src');
      const componentsDir = srcDir?.children?.[0];
      expect(componentsDir?.name).toBe('components');
      const buttonFile = componentsDir?.children?.[0];
      expect(buttonFile?.name).toBe('Button.tsx');
    });

    it('sets type as file for regular files', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['file.ts'],
        not_added: [],
        staged: [],
        deleted: [],
        renamed: [],
      });

      const tree = await service.getFileTree(tempDir, { gitModifiedOnly: true });

      expect(tree[0]?.type).toBe('file');
    });
  });

  describe('getFilePreview', () => {
    it('returns file content preview', async () => {
      const content = 'const x = 1;\nconsole.log(x);';
      await writeFile(join(tempDir, 'test.ts'), content);

      const preview = await service.getFilePreview(join(tempDir, 'test.ts'));

      expect(preview.content).toBe(content);
      expect(preview.totalLines).toBe(2);
      expect(preview.truncated).toBe(false);
    });

    it('detects language from file extension', async () => {
      await writeFile(join(tempDir, 'test.ts'), 'const x = 1;');

      const preview = await service.getFilePreview(join(tempDir, 'test.ts'));

      expect(preview.language).toBe('typescript');
    });

    it('detects JavaScript language', async () => {
      await writeFile(join(tempDir, 'test.js'), 'const x = 1;');

      const preview = await service.getFilePreview(join(tempDir, 'test.js'));

      expect(preview.language).toBe('javascript');
    });

    it('detects JSON language', async () => {
      await writeFile(join(tempDir, 'test.json'), '{}');

      const preview = await service.getFilePreview(join(tempDir, 'test.json'));

      expect(preview.language).toBe('json');
    });

    it('detects markdown language', async () => {
      await writeFile(join(tempDir, 'test.md'), '# Hello');

      const preview = await service.getFilePreview(join(tempDir, 'test.md'));

      expect(preview.language).toBe('markdown');
    });

    it('detects CSS language', async () => {
      await writeFile(join(tempDir, 'test.css'), 'body {}');

      const preview = await service.getFilePreview(join(tempDir, 'test.css'));

      expect(preview.language).toBe('css');
    });

    it('detects HTML language', async () => {
      await writeFile(join(tempDir, 'test.html'), '<html></html>');

      const preview = await service.getFilePreview(join(tempDir, 'test.html'));

      expect(preview.language).toBe('html');
    });

    it('uses plaintext for unknown extensions', async () => {
      await writeFile(join(tempDir, 'test.unknown'), 'content');

      const preview = await service.getFilePreview(join(tempDir, 'test.unknown'));

      expect(preview.language).toBe('plaintext');
    });

    it('truncates large files', async () => {
      // Create a file with more than 100 lines
      const lines = Array.from({ length: 150 }, (_, i) => `line ${String(i + 1)}`).join('\n');
      await writeFile(join(tempDir, 'large.ts'), lines);

      const preview = await service.getFilePreview(join(tempDir, 'large.ts'), 100);

      expect(preview.truncated).toBe(true);
      expect(preview.totalLines).toBe(150);
      // Content should only have first 100 lines
      const contentLines = preview.content.split('\n');
      expect(contentLines.length).toBe(100);
    });

    it('throws error for non-existent file', async () => {
      await expect(service.getFilePreview(join(tempDir, 'nonexistent.ts'))).rejects.toThrow();
    });

    it('handles empty files', async () => {
      await writeFile(join(tempDir, 'empty.ts'), '');

      const preview = await service.getFilePreview(join(tempDir, 'empty.ts'));

      expect(preview.content).toBe('');
      expect(preview.totalLines).toBe(0);
      expect(preview.truncated).toBe(false);
    });
  });

  describe('detectLanguage', () => {
    it('detects TypeScript', () => {
      expect(service.detectLanguage('file.ts')).toBe('typescript');
      expect(service.detectLanguage('file.tsx')).toBe('typescript');
    });

    it('detects JavaScript', () => {
      expect(service.detectLanguage('file.js')).toBe('javascript');
      expect(service.detectLanguage('file.jsx')).toBe('javascript');
      expect(service.detectLanguage('file.mjs')).toBe('javascript');
      expect(service.detectLanguage('file.cjs')).toBe('javascript');
    });

    it('detects Python', () => {
      expect(service.detectLanguage('file.py')).toBe('python');
    });

    it('detects Go', () => {
      expect(service.detectLanguage('file.go')).toBe('go');
    });

    it('detects Rust', () => {
      expect(service.detectLanguage('file.rs')).toBe('rust');
    });

    it('detects YAML', () => {
      expect(service.detectLanguage('file.yml')).toBe('yaml');
      expect(service.detectLanguage('file.yaml')).toBe('yaml');
    });

    it('detects shell scripts', () => {
      expect(service.detectLanguage('file.sh')).toBe('shell');
      expect(service.detectLanguage('file.bash')).toBe('shell');
    });
  });
});
