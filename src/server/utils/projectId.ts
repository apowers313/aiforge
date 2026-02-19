/**
 * Deterministic project ID generation using UUIDv5.
 *
 * Derives a stable UUID from the project's absolute path so that
 * the same directory always maps to the same project ID.
 */
import { v5 as uuidv5 } from 'uuid';
import { resolve } from 'node:path';

/**
 * Fixed namespace UUID for AIForge project IDs.
 * This must never change -- doing so would orphan all existing data.
 */
const AIFORGE_PROJECT_NS = '8c3e4e1a-6b0d-4f9a-b8c2-3d5e7f9a1b2c';

/**
 * Normalize a filesystem path to a canonical form:
 * - Resolve to absolute
 * - Strip trailing slashes
 */
export function normalizeProjectPath(path: string): string {
  const resolved = resolve(path);
  return resolved.length > 1 ? resolved.replace(/\/+$/, '') : resolved;
}

/**
 * Derive a deterministic UUID from a project directory path.
 * Same path always produces the same UUID.
 */
export function projectIdFromPath(path: string): string {
  return uuidv5(normalizeProjectPath(path), AIFORGE_PROJECT_NS);
}
