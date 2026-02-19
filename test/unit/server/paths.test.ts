import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  getConfigDir,
  getConfigPath,
  getDataDir,
  getSocketDir,
  getSocketPath,
  validateSocketPathLength,
} from '@server/paths.js';

describe('paths', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all relevant env vars before each test
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_DATA_HOME;
    delete process.env.AIFORGE_DATA_DIR;
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('getConfigDir', () => {
    it('uses XDG_CONFIG_HOME when set', () => {
      process.env.XDG_CONFIG_HOME = '/custom/config';
      expect(getConfigDir()).toBe('/custom/config/aiforge');
    });

    it('defaults to ~/.config/aiforge when XDG_CONFIG_HOME is not set', () => {
      delete process.env.XDG_CONFIG_HOME;
      expect(getConfigDir()).toBe(join(homedir(), '.config', 'aiforge'));
    });

    it('ignores empty XDG_CONFIG_HOME', () => {
      process.env.XDG_CONFIG_HOME = '';
      expect(getConfigDir()).toBe(join(homedir(), '.config', 'aiforge'));
    });
  });

  describe('getConfigPath', () => {
    it('returns config.json inside config dir', () => {
      process.env.XDG_CONFIG_HOME = '/custom/config';
      expect(getConfigPath()).toBe('/custom/config/aiforge/config.json');
    });

    it('returns default config path when XDG_CONFIG_HOME is not set', () => {
      delete process.env.XDG_CONFIG_HOME;
      expect(getConfigPath()).toBe(
        join(homedir(), '.config', 'aiforge', 'config.json'),
      );
    });
  });

  describe('getDataDir', () => {
    it('uses AIFORGE_DATA_DIR when set (backwards compat)', () => {
      process.env.AIFORGE_DATA_DIR = '/custom/data';
      expect(getDataDir()).toBe('/custom/data');
    });

    it('uses XDG_DATA_HOME when set and AIFORGE_DATA_DIR is not', () => {
      delete process.env.AIFORGE_DATA_DIR;
      process.env.XDG_DATA_HOME = '/custom/share';
      expect(getDataDir()).toBe('/custom/share/aiforge');
    });

    it('defaults to ~/.local/share/aiforge', () => {
      delete process.env.AIFORGE_DATA_DIR;
      delete process.env.XDG_DATA_HOME;
      expect(getDataDir()).toBe(
        join(homedir(), '.local', 'share', 'aiforge'),
      );
    });

    it('AIFORGE_DATA_DIR takes priority over XDG_DATA_HOME', () => {
      process.env.AIFORGE_DATA_DIR = '/override';
      process.env.XDG_DATA_HOME = '/custom/share';
      expect(getDataDir()).toBe('/override');
    });

    it('ignores empty AIFORGE_DATA_DIR and falls back to XDG', () => {
      process.env.AIFORGE_DATA_DIR = '';
      process.env.XDG_DATA_HOME = '/custom/share';
      expect(getDataDir()).toBe('/custom/share/aiforge');
    });

    it('ignores empty XDG_DATA_HOME and falls back to default', () => {
      delete process.env.AIFORGE_DATA_DIR;
      process.env.XDG_DATA_HOME = '';
      expect(getDataDir()).toBe(
        join(homedir(), '.local', 'share', 'aiforge'),
      );
    });
  });

  describe('getSocketDir', () => {
    it('returns sockets/ subdirectory under data dir', () => {
      process.env.AIFORGE_DATA_DIR = '/custom/data';
      expect(getSocketDir()).toBe('/custom/data/sockets');
    });

    it('returns sockets/ under XDG data dir', () => {
      delete process.env.AIFORGE_DATA_DIR;
      process.env.XDG_DATA_HOME = '/custom/share';
      expect(getSocketDir()).toBe('/custom/share/aiforge/sockets');
    });

    it('returns sockets/ under default data dir', () => {
      delete process.env.AIFORGE_DATA_DIR;
      delete process.env.XDG_DATA_HOME;
      expect(getSocketDir()).toBe(
        join(homedir(), '.local', 'share', 'aiforge', 'sockets'),
      );
    });
  });

  describe('getSocketPath', () => {
    it('returns socket file under sockets dir', () => {
      process.env.AIFORGE_DATA_DIR = '/custom/data';
      expect(getSocketPath('abc-123')).toBe('/custom/data/sockets/abc-123.sock');
    });

    it('does not include ai-ide-pty- prefix', () => {
      process.env.AIFORGE_DATA_DIR = '/custom/data';
      expect(getSocketPath('shell-id')).not.toContain('ai-ide-pty-');
    });

    it('handles UUID-style shell IDs', () => {
      process.env.AIFORGE_DATA_DIR = '/custom/data';
      const shellId = '550e8400-e29b-41d4-a716-446655440000';
      expect(getSocketPath(shellId)).toBe(
        '/custom/data/sockets/' + shellId + '.sock',
      );
    });
  });

  describe('validateSocketPathLength', () => {
    it('passes for paths under 107 bytes', () => {
      expect(() => { validateSocketPathLength('/short/path.sock'); }).not.toThrow();
    });

    it('passes for paths exactly 107 bytes', () => {
      const exactPath = 'x'.repeat(107);
      expect(() => { validateSocketPathLength(exactPath); }).not.toThrow();
    });

    it('throws for paths over 107 bytes', () => {
      const longPath = 'x'.repeat(108);
      expect(() => { validateSocketPathLength(longPath); }).toThrow(
        /socket path.*exceeds/i,
      );
    });

    it('includes the path length in the error message', () => {
      const longPath = 'x'.repeat(120);
      expect(() => { validateSocketPathLength(longPath); }).toThrow('120');
    });

    it('rejects paths generated from very long XDG_DATA_HOME', () => {
      process.env.XDG_DATA_HOME = '/a'.repeat(80);
      const socketPath = getSocketPath('test-uuid');
      expect(socketPath.length).toBeGreaterThan(107);
      expect(() => { validateSocketPathLength(socketPath); }).toThrow();
    });
  });
});
