/**
 * FilesystemService - Directory browsing functionality
 */
import { readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
}

export interface ValidateResult {
  valid: boolean;
  isDirectory: boolean;
  path: string;
}

export class FilesystemService {
  /**
   * Browse a directory and return its subdirectories (not files)
   */
  async browse(path: string): Promise<BrowseResult> {
    const entries: DirectoryEntry[] = [];

    try {
      const items = await readdir(path, { withFileTypes: true });

      for (const item of items) {
        // Only include directories, not files
        if (item.isDirectory()) {
          // Skip hidden directories (starting with .)
          if (!item.name.startsWith('.')) {
            entries.push({
              name: item.name,
              path: join(path, item.name),
              isDirectory: true,
            });
          }
        }
      }

      // Sort entries alphabetically
      entries.sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('Path does not exist');
      }
      if ((err as NodeJS.ErrnoException).code === 'ENOTDIR') {
        throw new Error('Path is not a directory');
      }
      throw err;
    }

    // Calculate parent path
    const parent = path === '/' ? null : dirname(path);

    return {
      path,
      parent,
      entries,
    };
  }

  /**
   * Validate if a path exists and is a directory
   */
  async validate(path: string): Promise<ValidateResult> {
    try {
      const stats = await stat(path);
      return {
        valid: true,
        isDirectory: stats.isDirectory(),
        path,
      };
    } catch {
      return {
        valid: false,
        isDirectory: false,
        path,
      };
    }
  }

  /**
   * Get the user's home directory path
   */
  getHomeDirectory(): string {
    return homedir();
  }
}
