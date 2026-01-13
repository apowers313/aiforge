/**
 * ScrollbackStore - Persists terminal scrollback to disk for replay and AI analysis
 *
 * Format: JSONL (one JSON object per line)
 * Each entry: { ts: ISO8601, type: 'output'|'input', data: string }
 */
import { mkdir, appendFile, readFile, stat, truncate, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ScrollbackEntry {
  ts: string;        // ISO 8601 timestamp
  type: 'output' | 'input';
  data: string;
}

export interface ScrollbackStoreOptions {
  /** Directory to store scrollback files */
  directory: string;
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Maximum entries to keep in memory for replay (default: 10000) */
  maxMemoryEntries?: number;
}

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_MEMORY_ENTRIES = 10000;

export class ScrollbackStore {
  private readonly _directory: string;
  private readonly _maxFileSize: number;
  private readonly _maxMemoryEntries: number;
  private readonly _buffers = new Map<string, ScrollbackEntry[]>();
  private readonly _writeQueues = new Map<string, Promise<void>>();

  constructor(options: ScrollbackStoreOptions) {
    this._directory = options.directory;
    this._maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    this._maxMemoryEntries = options.maxMemoryEntries ?? DEFAULT_MAX_MEMORY_ENTRIES;
  }

  /**
   * Get the file path for a shell's scrollback
   */
  private _getFilePath(shellId: string): string {
    return join(this._directory, `${shellId}.jsonl`);
  }

  /**
   * Ensure the storage directory exists
   */
  private async _ensureDirectory(): Promise<void> {
    if (!existsSync(this._directory)) {
      await mkdir(this._directory, { recursive: true });
    }
  }

  /**
   * Append an entry to a shell's scrollback (both memory and disk)
   * Note: Disk writes are fire-and-forget for performance; errors are logged but not thrown
   */
  append(shellId: string, type: 'output' | 'input', data: string): void {
    const entry: ScrollbackEntry = {
      ts: new Date().toISOString(),
      type,
      data,
    };

    // Add to memory buffer
    let buffer = this._buffers.get(shellId);
    if (!buffer) {
      buffer = [];
      this._buffers.set(shellId, buffer);
    }
    buffer.push(entry);

    // Trim memory buffer if too large
    if (buffer.length > this._maxMemoryEntries) {
      buffer.splice(0, buffer.length - this._maxMemoryEntries);
    }

    // Queue disk write (serialize writes per shell)
    const currentQueue = this._writeQueues.get(shellId) ?? Promise.resolve();
    const writePromise = currentQueue.then(async () => {
      await this._appendToDisk(shellId, entry);
    });
    this._writeQueues.set(shellId, writePromise);

    // Don't await - fire and forget for performance
    writePromise.catch((err: unknown) => {
      console.error(`Failed to write scrollback for shell ${shellId}:`, err);
    });
  }

  /**
   * Write entry to disk, handling file rotation if needed
   */
  private async _appendToDisk(shellId: string, entry: ScrollbackEntry): Promise<void> {
    await this._ensureDirectory();
    const filePath = this._getFilePath(shellId);

    // Check file size and rotate if needed
    try {
      const stats = await stat(filePath);
      if (stats.size > this._maxFileSize) {
        await this._rotateFile(shellId);
      }
    } catch {
      // File doesn't exist yet, that's fine
    }

    const line = JSON.stringify(entry) + '\n';
    await appendFile(filePath, line, 'utf-8');
  }

  /**
   * Rotate file by keeping only the last half of content
   */
  private async _rotateFile(shellId: string): Promise<void> {
    const filePath = this._getFilePath(shellId);

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      // Keep last half of lines
      const keepFrom = Math.floor(lines.length / 2);
      const newContent = lines.slice(keepFrom).join('\n') + '\n';

      await writeFile(filePath, newContent, 'utf-8');
    } catch {
      // If rotation fails, just truncate the file
      await truncate(filePath, 0);
    }
  }

  /**
   * Load scrollback from disk into memory
   */
  async load(shellId: string): Promise<ScrollbackEntry[]> {
    // Check if already in memory
    const existing = this._buffers.get(shellId);
    if (existing && existing.length > 0) {
      return existing;
    }

    const filePath = this._getFilePath(shellId);

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter((line) => line.length > 0);

      const entries: ScrollbackEntry[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as ScrollbackEntry;
          entries.push(entry);
        } catch {
          // Skip malformed lines
        }
      }

      // Keep only last N entries in memory
      const trimmed = entries.slice(-this._maxMemoryEntries);
      this._buffers.set(shellId, trimmed);

      return trimmed;
    } catch {
      // File doesn't exist or can't be read
      return [];
    }
  }

  /**
   * Get scrollback from memory (without loading from disk)
   */
  getFromMemory(shellId: string): ScrollbackEntry[] {
    return this._buffers.get(shellId) ?? [];
  }

  /**
   * Clear scrollback for a shell (both memory and disk)
   */
  async clear(shellId: string): Promise<void> {
    this._buffers.delete(shellId);

    const filePath = this._getFilePath(shellId);
    try {
      await truncate(filePath, 0);
    } catch {
      // File might not exist
    }
  }

  /**
   * Delete scrollback file for a shell
   */
  async delete(shellId: string): Promise<void> {
    this._buffers.delete(shellId);

    const filePath = this._getFilePath(shellId);
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(filePath);
    } catch {
      // File might not exist
    }
  }

  /**
   * Get combined output text for replay (output entries only)
   */
  async getOutputText(shellId: string): Promise<string> {
    const entries = await this.load(shellId);
    return entries
      .filter((e) => e.type === 'output')
      .map((e) => e.data)
      .join('');
  }

  /**
   * Wait for all pending disk writes to complete
   * Useful for testing and graceful shutdown
   */
  async flush(): Promise<void> {
    const promises = Array.from(this._writeQueues.values());
    await Promise.all(promises);
  }
}
