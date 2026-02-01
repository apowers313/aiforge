/**
 * Tests for SessionError
 */
import { describe, it, expect } from 'vitest';
import { SessionError } from '@server/services/shell/SessionError.js';

describe('SessionError', () => {
  describe('constructor', () => {
    it('creates error with code, message, and retryable flag', () => {
      const error = new SessionError('SHELL_NOT_FOUND', 'Test message', false);

      expect(error.code).toBe('SHELL_NOT_FOUND');
      expect(error.message).toBe('Test message');
      expect(error.retryable).toBe(false);
      expect(error.name).toBe('SessionError');
    });

    it('extends Error', () => {
      const error = new SessionError('INTERNAL_ERROR', 'Test', true);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('shellNotFound', () => {
    it('creates SHELL_NOT_FOUND error', () => {
      const error = SessionError.shellNotFound('shell-123');

      expect(error.code).toBe('SHELL_NOT_FOUND');
      expect(error.message).toContain('shell-123');
      expect(error.message).toContain('not found');
      expect(error.retryable).toBe(false);
    });
  });

  describe('daemonSpawnFailed', () => {
    it('creates DAEMON_SPAWN_FAILED error without reason', () => {
      const error = SessionError.daemonSpawnFailed('shell-123');

      expect(error.code).toBe('DAEMON_SPAWN_FAILED');
      expect(error.message).toContain('shell-123');
      expect(error.message).toContain('Failed to spawn daemon');
      expect(error.retryable).toBe(true);
    });

    it('creates DAEMON_SPAWN_FAILED error with reason', () => {
      const error = SessionError.daemonSpawnFailed('shell-123', 'port in use');

      expect(error.code).toBe('DAEMON_SPAWN_FAILED');
      expect(error.message).toContain('shell-123');
      expect(error.message).toContain('port in use');
      expect(error.retryable).toBe(true);
    });
  });

  describe('connectionLost', () => {
    it('creates CONNECTION_LOST error', () => {
      const error = SessionError.connectionLost('shell-456');

      expect(error.code).toBe('CONNECTION_LOST');
      expect(error.message).toContain('shell-456');
      expect(error.message).toContain('Connection lost');
      expect(error.retryable).toBe(true);
    });
  });

  describe('internal', () => {
    it('creates INTERNAL_ERROR error', () => {
      const error = SessionError.internal('Something went wrong');

      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.message).toBe('Something went wrong');
      expect(error.retryable).toBe(false);
    });
  });
});
