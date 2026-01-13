/**
 * Zod validation schemas for AIForge types
 */
import { z } from 'zod';

// ISO 8601 date string validator
const isoDateString = z.string().datetime({ offset: true }).or(z.string().datetime());

// Project schema
export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  path: z.string().min(1),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

export type ValidatedProject = z.infer<typeof ProjectSchema>;

// Shell status schema
export const ShellStatusSchema = z.enum(['inactive', 'active', 'error']);

export type ValidatedShellStatus = z.infer<typeof ShellStatusSchema>;

// Shell schema
export const ShellSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1).max(255),
  cwd: z.string().min(1),
  status: ShellStatusSchema,
  pid: z.number().int().positive().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

export type ValidatedShell = z.infer<typeof ShellSchema>;

// Session schema
export const SessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  connectedAt: isoDateString,
  lastActivityAt: isoDateString,
});

export type ValidatedSession = z.infer<typeof SessionSchema>;

// WebSocket message type schema
export const WebSocketMessageTypeSchema = z.enum([
  'shell:create',
  'shell:destroy',
  'shell:input',
  'shell:output',
  'shell:resize',
  'shell:status',
  'project:create',
  'project:delete',
  'project:update',
  'error',
  'ping',
  'pong',
]);

export type ValidatedWebSocketMessageType = z.infer<typeof WebSocketMessageTypeSchema>;

// Base WebSocket message schema
export const WebSocketMessageSchema = z.object({
  type: WebSocketMessageTypeSchema,
  payload: z.unknown(),
  timestamp: isoDateString,
  requestId: z.string().uuid().optional(),
});

export type ValidatedWebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

// Shell input payload schema
export const ShellInputPayloadSchema = z.object({
  shellId: z.string().uuid(),
  data: z.string(),
});

export type ValidatedShellInputPayload = z.infer<typeof ShellInputPayloadSchema>;

// Shell output payload schema
export const ShellOutputPayloadSchema = z.object({
  shellId: z.string().uuid(),
  data: z.string(),
});

export type ValidatedShellOutputPayload = z.infer<typeof ShellOutputPayloadSchema>;

// Shell resize payload schema
export const ShellResizePayloadSchema = z.object({
  shellId: z.string().uuid(),
  cols: z.number().int().positive().max(1000),
  rows: z.number().int().positive().max(500),
});

export type ValidatedShellResizePayload = z.infer<typeof ShellResizePayloadSchema>;

// Shell status payload schema
export const ShellStatusPayloadSchema = z.object({
  shellId: z.string().uuid(),
  status: ShellStatusSchema,
  pid: z.number().int().positive().nullable(),
});

export type ValidatedShellStatusPayload = z.infer<typeof ShellStatusPayloadSchema>;

// Shell create payload schema
export const ShellCreatePayloadSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  cwd: z.string().min(1).optional(),
});

export type ValidatedShellCreatePayload = z.infer<typeof ShellCreatePayloadSchema>;

// Shell created response payload schema
export const ShellCreatedPayloadSchema = z.object({
  shell: ShellSchema,
});

export type ValidatedShellCreatedPayload = z.infer<typeof ShellCreatedPayloadSchema>;

// Shell destroy payload schema
export const ShellDestroyPayloadSchema = z.object({
  shellId: z.string().uuid(),
});

export type ValidatedShellDestroyPayload = z.infer<typeof ShellDestroyPayloadSchema>;

// Project create payload schema
export const ProjectCreatePayloadSchema = z.object({
  name: z.string().min(1).max(255),
  path: z.string().min(1),
});

export type ValidatedProjectCreatePayload = z.infer<typeof ProjectCreatePayloadSchema>;

// Project created response payload schema
export const ProjectCreatedPayloadSchema = z.object({
  project: ProjectSchema,
});

export type ValidatedProjectCreatedPayload = z.infer<typeof ProjectCreatedPayloadSchema>;

// Project delete payload schema
export const ProjectDeletePayloadSchema = z.object({
  projectId: z.string().uuid(),
});

export type ValidatedProjectDeletePayload = z.infer<typeof ProjectDeletePayloadSchema>;

// Project update payload schema
export const ProjectUpdatePayloadSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
});

export type ValidatedProjectUpdatePayload = z.infer<typeof ProjectUpdatePayloadSchema>;

// Error payload schema
export const ErrorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export type ValidatedErrorPayload = z.infer<typeof ErrorPayloadSchema>;

// Server config schema
export const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535),
  host: z.string().min(1),
  authGuid: z.string(),
  scrollbackLines: z.number().int().positive(),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
});

export type ValidatedServerConfig = z.infer<typeof ServerConfigSchema>;
