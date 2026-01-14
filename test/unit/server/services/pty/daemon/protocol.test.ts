/**
 * Tests for PTY daemon IPC protocol
 */
import { describe, it, expect } from 'vitest';
import {
  getSocketPath,
  encodeMessage,
  decodeMessage,
  parseMessages,
  type DaemonMessage,
  type ClientMessage,
} from '@server/services/pty/daemon/protocol.js';

describe('PTY Daemon Protocol', () => {
  describe('getSocketPath', () => {
    it('returns socket path with shell ID', () => {
      const shellId = 'abc-123';
      const path = getSocketPath(shellId);
      expect(path).toBe('/tmp/ai-ide-pty-abc-123.sock');
    });

    it('handles UUID-style shell IDs', () => {
      const shellId = '550e8400-e29b-41d4-a716-446655440000';
      const path = getSocketPath(shellId);
      expect(path).toBe('/tmp/ai-ide-pty-550e8400-e29b-41d4-a716-446655440000.sock');
    });
  });

  describe('encodeMessage', () => {
    it('encodes daemon messages with newline delimiter', () => {
      const message: DaemonMessage = { type: 'ready' };
      const encoded = encodeMessage(message);
      expect(encoded).toBe('{"type":"ready"}\n');
    });

    it('encodes client messages with newline delimiter', () => {
      const message: ClientMessage = { type: 'input', data: 'hello' };
      const encoded = encodeMessage(message);
      expect(encoded).toBe('{"type":"input","data":"hello"}\n');
    });

    it('encodes data message', () => {
      const message: DaemonMessage = { type: 'data', data: 'output text' };
      const encoded = encodeMessage(message);
      expect(encoded).toBe('{"type":"data","data":"output text"}\n');
    });

    it('encodes exit message with signal', () => {
      const message: DaemonMessage = { type: 'exit', code: 0, signal: 15 };
      const encoded = encodeMessage(message);
      expect(encoded).toBe('{"type":"exit","code":0,"signal":15}\n');
    });

    it('encodes resize message', () => {
      const message: ClientMessage = { type: 'resize', cols: 120, rows: 40 };
      const encoded = encodeMessage(message);
      expect(encoded).toBe('{"type":"resize","cols":120,"rows":40}\n');
    });
  });

  describe('decodeMessage', () => {
    it('decodes valid JSON messages', () => {
      const json = '{"type":"ready"}';
      const message = decodeMessage(json);
      expect(message).toEqual({ type: 'ready' });
    });

    it('handles whitespace around message', () => {
      const json = '  {"type":"pong"}  ';
      const message = decodeMessage(json);
      expect(message).toEqual({ type: 'pong' });
    });

    it('returns null for invalid JSON', () => {
      const invalid = 'not json';
      const message = decodeMessage(invalid);
      expect(message).toBeNull();
    });

    it('returns null for empty string', () => {
      const message = decodeMessage('');
      expect(message).toBeNull();
    });

    it('decodes complex messages', () => {
      const json = '{"type":"data","data":"line1\\nline2"}';
      const message = decodeMessage(json);
      expect(message).toEqual({ type: 'data', data: 'line1\nline2' });
    });
  });

  describe('parseMessages', () => {
    it('parses single complete message', () => {
      const buffer = '{"type":"ready"}\n';
      const { messages, remaining } = parseMessages(buffer);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ type: 'ready' });
      expect(remaining).toBe('');
    });

    it('parses multiple complete messages', () => {
      const buffer = '{"type":"ready"}\n{"type":"data","data":"hello"}\n';
      const { messages, remaining } = parseMessages(buffer);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ type: 'ready' });
      expect(messages[1]).toEqual({ type: 'data', data: 'hello' });
      expect(remaining).toBe('');
    });

    it('returns partial message as remaining', () => {
      const buffer = '{"type":"ready"}\n{"type":"da';
      const { messages, remaining } = parseMessages(buffer);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ type: 'ready' });
      expect(remaining).toBe('{"type":"da');
    });

    it('handles empty buffer', () => {
      const { messages, remaining } = parseMessages('');
      expect(messages).toHaveLength(0);
      expect(remaining).toBe('');
    });

    it('handles buffer with only partial message', () => {
      const buffer = '{"type":"rea';
      const { messages, remaining } = parseMessages(buffer);
      expect(messages).toHaveLength(0);
      expect(remaining).toBe('{"type":"rea');
    });

    it('skips empty lines', () => {
      const buffer = '{"type":"ready"}\n\n{"type":"pong"}\n';
      const { messages, remaining } = parseMessages(buffer);
      expect(messages).toHaveLength(2);
      expect(remaining).toBe('');
    });

    it('skips malformed lines', () => {
      const buffer = '{"type":"ready"}\nnot json\n{"type":"pong"}\n';
      const { messages } = parseMessages(buffer);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ type: 'ready' });
      expect(messages[1]).toEqual({ type: 'pong' });
    });
  });
});
