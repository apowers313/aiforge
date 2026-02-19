/**
 * Tests for deterministic project ID generation (UUIDv5)
 */
import { describe, it, expect } from 'vitest';
import { projectIdFromPath, normalizeProjectPath } from '@server/utils/projectId.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('normalizeProjectPath', () => {
  it('resolves to an absolute path', () => {
    const result = normalizeProjectPath('relative/path');
    expect(result).toMatch(/^\//);
  });

  it('strips trailing slashes', () => {
    expect(normalizeProjectPath('/home/user/project/')).toBe('/home/user/project');
    expect(normalizeProjectPath('/home/user/project///')).toBe('/home/user/project');
  });

  it('does not strip the root slash', () => {
    // resolve('/') returns '/' which has no trailing to strip beyond the root
    expect(normalizeProjectPath('/')).toBe('/');
  });
});

describe('projectIdFromPath', () => {
  it('returns the same ID for the same path every time', () => {
    const id1 = projectIdFromPath('/home/user/project');
    const id2 = projectIdFromPath('/home/user/project');
    expect(id1).toBe(id2);
  });

  it('returns different IDs for different paths', () => {
    const id1 = projectIdFromPath('/home/user/project-a');
    const id2 = projectIdFromPath('/home/user/project-b');
    expect(id1).not.toBe(id2);
  });

  it('produces a valid UUIDv5 string', () => {
    const id = projectIdFromPath('/home/user/project');
    expect(id).toMatch(UUID_RE);
  });

  it('normalizes trailing slashes so /foo and /foo/ give the same ID', () => {
    const id1 = projectIdFromPath('/home/user/project');
    const id2 = projectIdFromPath('/home/user/project/');
    expect(id1).toBe(id2);
  });

  it('normalizes relative paths so ./foo and <cwd>/foo give the same ID', () => {
    const abs = process.cwd() + '/some-project';
    const rel = './some-project';
    expect(projectIdFromPath(abs)).toBe(projectIdFromPath(rel));
  });
});
