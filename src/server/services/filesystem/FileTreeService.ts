/**
 * FileTreeService - File tree with git status and preview functionality
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { simpleGit } from 'simple-git';
import type { FileTreeNode, FilePreview, GitStatus } from '@shared/types/index.js';

export interface FileTreeOptions {
  gitModifiedOnly?: boolean;
  maxDepth?: number;
}

// Directories to exclude from file tree
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '__pycache__',
  '.pytest_cache',
  'coverage',
  '.nyc_output',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.svn',
  '.hg',
]);

// Map file extensions to Monaco editor language identifiers
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // JavaScript/TypeScript
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',

  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',

  // Data formats
  json: 'json',
  jsonc: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  toml: 'ini',

  // Documentation
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  txt: 'plaintext',

  // Programming languages
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  r: 'r',
  sql: 'sql',

  // Shell
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',

  // Config
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  env: 'ini',
  ini: 'ini',
  conf: 'ini',

  // GraphQL
  graphql: 'graphql',
  gql: 'graphql',
};

export class FileTreeService {
  /**
   * Get file tree for a project directory
   */
  async getFileTree(projectPath: string, options: FileTreeOptions = {}): Promise<FileTreeNode[]> {
    const { gitModifiedOnly = true, maxDepth = 5 } = options;

    if (gitModifiedOnly) {
      return this.getGitModifiedFiles(projectPath);
    }

    return this.getAllFiles(projectPath, maxDepth);
  }

  /**
   * Get only git-modified files, organized into folder structure
   */
  private async getGitModifiedFiles(projectPath: string): Promise<FileTreeNode[]> {
    try {
      const git = simpleGit(projectPath);
      const status = await git.status();

      const flatFiles: FileTreeNode[] = [];

      // Modified files
      for (const filePath of status.modified) {
        flatFiles.push(this.createFileNode(filePath, 'modified'));
      }

      // Untracked (new) files
      for (const filePath of status.not_added) {
        flatFiles.push(this.createFileNode(filePath, 'untracked'));
      }

      // Staged files
      for (const filePath of status.staged) {
        flatFiles.push(this.createFileNode(filePath, 'staged'));
      }

      // Deleted files
      for (const filePath of status.deleted) {
        flatFiles.push(this.createFileNode(filePath, 'deleted'));
      }

      // Renamed files
      for (const renamed of status.renamed) {
        flatFiles.push(this.createFileNode(renamed.to, 'renamed'));
      }

      // Organize flat files into folder structure
      return this.buildFileTree(flatFiles);
    } catch {
      // Not a git repository or other error
      return [];
    }
  }

  /**
   * Build a tree structure from a flat list of file nodes
   */
  private buildFileTree(flatFiles: FileTreeNode[]): FileTreeNode[] {
    // Use a nested map structure to build the tree efficiently
    interface TreeNode {
      node: FileTreeNode | null; // null for intermediate directories we haven't fully created
      children: Map<string, TreeNode>;
    }

    const root: TreeNode = { node: null, children: new Map() };

    for (const file of flatFiles) {
      const parts = file.path.split('/');
      let current = root;
      let currentPath = '';

      // Navigate/create the directory structure
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i] ?? '';
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        let child = current.children.get(part);
        if (!child) {
          // Create directory node
          child = {
            node: {
              name: part,
              path: currentPath,
              type: 'directory',
              gitStatus: null,
              children: [],
            },
            children: new Map(),
          };
          current.children.set(part, child);
        }
        current = child;
      }

      // Add the file to the current directory
      current.children.set(file.name, {
        node: file,
        children: new Map(),
      });
    }

    // Convert the tree structure to FileTreeNode[]
    const convertToArray = (treeNode: TreeNode): FileTreeNode[] => {
      const result: FileTreeNode[] = [];

      for (const child of treeNode.children.values()) {
        if (child.node) {
          if (child.node.type === 'directory') {
            // Recursively convert children
            child.node.children = convertToArray(child);
          }
          result.push(child.node);
        }
      }

      return result;
    };

    return this.sortFileNodes(convertToArray(root));
  }

  /**
   * Recursively sort file nodes: directories first, then files, both alphabetically
   */
  private sortFileNodes(nodes: FileTreeNode[]): FileTreeNode[] {
    // Sort current level
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    // Recursively sort children
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        node.children = this.sortFileNodes(node.children);
      }
    }

    return nodes;
  }

  /**
   * Get all files in a directory tree
   */
  private async getAllFiles(projectPath: string, maxDepth: number): Promise<FileTreeNode[]> {
    const gitStatus = await this.getGitStatusMap(projectPath);
    return this.readDirectory(projectPath, projectPath, gitStatus, maxDepth, 0);
  }

  /**
   * Build a map of file paths to their git status
   */
  private async getGitStatusMap(projectPath: string): Promise<Map<string, GitStatus>> {
    const statusMap = new Map<string, GitStatus>();

    try {
      const git = simpleGit(projectPath);
      const status = await git.status();

      for (const filePath of status.modified) {
        statusMap.set(filePath, 'modified');
      }
      for (const filePath of status.not_added) {
        statusMap.set(filePath, 'untracked');
      }
      for (const filePath of status.staged) {
        statusMap.set(filePath, 'staged');
      }
      for (const filePath of status.deleted) {
        statusMap.set(filePath, 'deleted');
      }
      for (const renamed of status.renamed) {
        statusMap.set(renamed.to, 'renamed');
      }
    } catch {
      // Not a git repository
    }

    return statusMap;
  }

  /**
   * Recursively read a directory
   */
  private async readDirectory(
    basePath: string,
    currentPath: string,
    gitStatus: Map<string, GitStatus>,
    maxDepth: number,
    currentDepth: number,
  ): Promise<FileTreeNode[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    try {
      const entries = await readdir(currentPath, { withFileTypes: true });
      const nodes: FileTreeNode[] = [];

      for (const entry of entries) {
        // Skip excluded directories
        if (EXCLUDED_DIRS.has(entry.name)) {
          continue;
        }

        // Skip hidden files/directories (starting with .)
        if (entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = join(currentPath, entry.name);
        const relativePath = fullPath.replace(`${basePath}/`, '');

        if (entry.isDirectory()) {
          const children = await this.readDirectory(
            basePath,
            fullPath,
            gitStatus,
            maxDepth,
            currentDepth + 1,
          );

          // Only include directories that have children
          if (children.length > 0) {
            nodes.push({
              name: entry.name,
              path: relativePath,
              type: 'directory',
              gitStatus: null,
              children,
            });
          }
        } else {
          nodes.push({
            name: entry.name,
            path: relativePath,
            type: 'file',
            gitStatus: gitStatus.get(relativePath) ?? null,
          });
        }
      }

      // Sort: directories first, then files, both alphabetically
      nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return nodes;
    } catch {
      return [];
    }
  }

  /**
   * Create a file node from a path and status
   */
  private createFileNode(filePath: string, status: GitStatus): FileTreeNode {
    return {
      name: basename(filePath),
      path: filePath,
      type: 'file',
      gitStatus: status,
    };
  }

  /**
   * Get file content preview
   */
  async getFilePreview(filePath: string, maxLines = 10000): Promise<FilePreview> {
    const content = await readFile(filePath, 'utf-8');
    const allLines = content.split('\n');
    const totalLines = content === '' ? 0 : allLines.length;
    const truncated = totalLines > maxLines;

    const previewContent = truncated ? allLines.slice(0, maxLines).join('\n') : content;

    return {
      content: previewContent,
      language: this.detectLanguage(filePath),
      truncated,
      totalLines,
    };
  }

  /**
   * Detect language from file path for Monaco editor
   */
  detectLanguage(filePath: string): string {
    const fileName = basename(filePath).toLowerCase();

    // Special file names
    if (fileName === 'dockerfile') return 'dockerfile';
    if (fileName === 'makefile') return 'makefile';
    if (fileName.startsWith('.env')) return 'ini';

    const ext = extname(filePath).slice(1).toLowerCase();
    return EXTENSION_TO_LANGUAGE[ext] ?? 'plaintext';
  }

  /**
   * Check if a file is a text file (can be previewed)
   */
  async isTextFile(filePath: string): Promise<boolean> {
    try {
      const stats = await stat(filePath);

      // Skip files larger than 3MB
      if (stats.size > 3 * 1024 * 1024) {
        return false;
      }

      // Try to read the file as text
      const buffer = await readFile(filePath);

      // Check for binary content (null bytes in first 8KB)
      const sampleSize = Math.min(buffer.length, 8192);
      for (let i = 0; i < sampleSize; i++) {
        if (buffer[i] === 0) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }
}
