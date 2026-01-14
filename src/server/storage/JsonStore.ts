/**
 * Generic JSON file store with atomic writes and file locking
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import * as lockfile from 'proper-lockfile';

export interface JsonStoreOptions<T> {
  filePath: string;
  defaultValue: T;
}

export class JsonStore<T> {
  private readonly filePath: string;
  private readonly defaultValue: T;
  private initPromise: Promise<void> | null = null;

  constructor(options: JsonStoreOptions<T>) {
    this.filePath = options.filePath;
    this.defaultValue = options.defaultValue;
  }

  /**
   * Ensure the file and parent directories exist.
   * Handles external directory deletion by always verifying existence.
   */
  private async ensureFile(): Promise<void> {
    // Quick check - if file exists, we're done
    if (existsSync(this.filePath)) {
      return;
    }

    // If another call is already creating the file, wait for it
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    // Create directory and file
    this.initPromise = (async (): Promise<void> => {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      // Double-check file doesn't exist (another process might have created it)
      if (!existsSync(this.filePath)) {
        await writeFile(this.filePath, JSON.stringify(this.defaultValue, null, 2), 'utf-8');
      }
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Read data from the store
   */
  async read(): Promise<T> {
    await this.ensureFile();

    const content = await readFile(this.filePath, 'utf-8');
    return JSON.parse(content) as T;
  }

  /**
   * Write data to the store with atomic write
   */
  async write(data: T): Promise<void> {
    await this.ensureFile();

    // Write to a temp file first, then rename for atomicity
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');

    // Rename is atomic on most filesystems
    const { rename } = await import('node:fs/promises');
    await rename(tempPath, this.filePath);
  }

  /**
   * Update data with a transformation function, with file locking for concurrency
   */
  async update(updater: (data: T) => T): Promise<T> {
    await this.ensureFile();

    // Acquire lock
    const release = await lockfile.lock(this.filePath, {
      retries: {
        retries: 10,
        factor: 2,
        minTimeout: 50,
        maxTimeout: 1000,
      },
    });

    try {
      const data = await this.read();
      const newData = updater(data);
      await this.write(newData);
      return newData;
    } finally {
      await release();
    }
  }

}
