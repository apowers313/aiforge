/**
 * Tests for Zod validation schemas
 */
import { describe, it, expect } from 'vitest';
import {
  ProjectSchema,
  ShellSchema,
  SessionSchema,
  ShellStatusSchema,
  WebSocketMessageSchema,
  ShellInputPayloadSchema,
  ShellOutputPayloadSchema,
  ShellResizePayloadSchema,
  ShellCreatePayloadSchema,
  ProjectCreatePayloadSchema,
  ServerConfigSchema,
  ErrorPayloadSchema,
} from '../../../../src/shared/types/validation.js';

describe('Type Validation', () => {
  describe('ProjectSchema', () => {
    it('validates valid Project', () => {
      const valid = ProjectSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'my-project',
        path: '/home/user/project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(valid.success).toBe(true);
    });

    it('rejects invalid Project - missing fields', () => {
      const invalid = ProjectSchema.safeParse({ name: 'missing-fields' });
      expect(invalid.success).toBe(false);
    });

    it('rejects invalid Project - invalid uuid', () => {
      const invalid = ProjectSchema.safeParse({
        id: 'not-a-uuid',
        name: 'my-project',
        path: '/home/user/project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(invalid.success).toBe(false);
    });

    it('rejects invalid Project - empty name', () => {
      const invalid = ProjectSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: '',
        path: '/home/user/project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(invalid.success).toBe(false);
    });

    it('rejects invalid Project - invalid date', () => {
      const invalid = ProjectSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'my-project',
        path: '/home/user/project',
        createdAt: 'not-a-date',
        updatedAt: new Date().toISOString(),
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('ShellSchema', () => {
    it('validates valid Shell', () => {
      const valid = ShellSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId: '550e8400-e29b-41d4-a716-446655440001',
        name: 'bash-1',
        cwd: '/home/user',
        status: 'active',
        pid: 12345,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(valid.success).toBe(true);
    });

    it('validates Shell with null pid', () => {
      const valid = ShellSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId: '550e8400-e29b-41d4-a716-446655440001',
        name: 'bash-1',
        cwd: '/home/user',
        status: 'inactive',
        pid: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(valid.success).toBe(true);
    });

    it('rejects invalid Shell - invalid status', () => {
      const invalid = ShellSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId: '550e8400-e29b-41d4-a716-446655440001',
        name: 'bash-1',
        cwd: '/home/user',
        status: 'running',
        pid: 12345,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('ShellStatusSchema', () => {
    it('validates inactive status', () => {
      expect(ShellStatusSchema.safeParse('inactive').success).toBe(true);
    });

    it('validates active status', () => {
      expect(ShellStatusSchema.safeParse('active').success).toBe(true);
    });

    it('validates error status', () => {
      expect(ShellStatusSchema.safeParse('error').success).toBe(true);
    });

    it('rejects invalid status', () => {
      expect(ShellStatusSchema.safeParse('running').success).toBe(false);
    });
  });

  describe('SessionSchema', () => {
    it('validates valid Session', () => {
      const valid = SessionSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        connectedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      });
      expect(valid.success).toBe(true);
    });

    it('validates Session with null userId', () => {
      const valid = SessionSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        userId: null,
        connectedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('WebSocketMessageSchema', () => {
    it('validates valid WebSocket message', () => {
      const valid = WebSocketMessageSchema.safeParse({
        type: 'shell:input',
        payload: { shellId: '123', data: 'ls -la' },
        timestamp: new Date().toISOString(),
      });
      expect(valid.success).toBe(true);
    });

    it('validates WebSocket message with requestId', () => {
      const valid = WebSocketMessageSchema.safeParse({
        type: 'shell:create',
        payload: {},
        timestamp: new Date().toISOString(),
        requestId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(valid.success).toBe(true);
    });

    it('rejects invalid message type', () => {
      const invalid = WebSocketMessageSchema.safeParse({
        type: 'invalid:type',
        payload: {},
        timestamp: new Date().toISOString(),
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('ShellInputPayloadSchema', () => {
    it('validates valid input payload', () => {
      const valid = ShellInputPayloadSchema.safeParse({
        shellId: '550e8400-e29b-41d4-a716-446655440000',
        data: 'ls -la',
      });
      expect(valid.success).toBe(true);
    });

    it('rejects invalid shellId', () => {
      const invalid = ShellInputPayloadSchema.safeParse({
        shellId: 'not-a-uuid',
        data: 'ls -la',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('ShellOutputPayloadSchema', () => {
    it('validates valid output payload', () => {
      const valid = ShellOutputPayloadSchema.safeParse({
        shellId: '550e8400-e29b-41d4-a716-446655440000',
        data: 'file1.txt  file2.txt',
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('ShellResizePayloadSchema', () => {
    it('validates valid resize payload', () => {
      const valid = ShellResizePayloadSchema.safeParse({
        shellId: '550e8400-e29b-41d4-a716-446655440000',
        cols: 80,
        rows: 24,
      });
      expect(valid.success).toBe(true);
    });

    it('rejects negative cols', () => {
      const invalid = ShellResizePayloadSchema.safeParse({
        shellId: '550e8400-e29b-41d4-a716-446655440000',
        cols: -1,
        rows: 24,
      });
      expect(invalid.success).toBe(false);
    });

    it('rejects cols exceeding max', () => {
      const invalid = ShellResizePayloadSchema.safeParse({
        shellId: '550e8400-e29b-41d4-a716-446655440000',
        cols: 1001,
        rows: 24,
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('ShellCreatePayloadSchema', () => {
    it('validates minimal create payload', () => {
      const valid = ShellCreatePayloadSchema.safeParse({
        projectId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(valid.success).toBe(true);
    });

    it('validates create payload with all fields', () => {
      const valid = ShellCreatePayloadSchema.safeParse({
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'custom-shell',
        cwd: '/home/user/project',
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('ProjectCreatePayloadSchema', () => {
    it('validates valid project create payload', () => {
      const valid = ProjectCreatePayloadSchema.safeParse({
        name: 'my-project',
        path: '/home/user/projects/my-project',
      });
      expect(valid.success).toBe(true);
    });

    it('rejects empty name', () => {
      const invalid = ProjectCreatePayloadSchema.safeParse({
        name: '',
        path: '/home/user/project',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('ServerConfigSchema', () => {
    it('validates valid server config', () => {
      const valid = ServerConfigSchema.safeParse({
        port: 9042,
        host: '0.0.0.0',
        authGuid: 'test-guid',
        scrollbackLines: 10000,
        logLevel: 'info',
      });
      expect(valid.success).toBe(true);
    });

    it('rejects port out of range', () => {
      const invalid = ServerConfigSchema.safeParse({
        port: 70000,
        host: '0.0.0.0',
        authGuid: '',
        scrollbackLines: 10000,
        logLevel: 'info',
      });
      expect(invalid.success).toBe(false);
    });

    it('rejects invalid log level', () => {
      const invalid = ServerConfigSchema.safeParse({
        port: 9042,
        host: '0.0.0.0',
        authGuid: '',
        scrollbackLines: 10000,
        logLevel: 'verbose',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('ErrorPayloadSchema', () => {
    it('validates valid error payload', () => {
      const valid = ErrorPayloadSchema.safeParse({
        code: 'SHELL_NOT_FOUND',
        message: 'The requested shell does not exist',
      });
      expect(valid.success).toBe(true);
    });

    it('validates error payload with details', () => {
      const valid = ErrorPayloadSchema.safeParse({
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { field: 'name', issue: 'too short' },
      });
      expect(valid.success).toBe(true);
    });

    it('rejects empty code', () => {
      const invalid = ErrorPayloadSchema.safeParse({
        code: '',
        message: 'Error occurred',
      });
      expect(invalid.success).toBe(false);
    });
  });
});
