/**
 * Tests for health API routes
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { healthRouter, setWebSocketReady, isWebSocketReady } from '@server/api/routes/health.js';

interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  services: {
    websocket: boolean;
    api: boolean;
  };
}

describe('health routes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use('/api/health', healthRouter);
    // Reset WebSocket state before each test
    setWebSocketReady(false);
  });

  afterEach(() => {
    // Reset state
    setWebSocketReady(false);
  });

  describe('GET /api/health', () => {
    it('returns starting status when WebSocket is not ready', async () => {
      setWebSocketReady(false);

      const response = await request(app).get('/api/health');
      const body = response.body as HealthResponse;

      expect(response.status).toBe(200);
      expect(body.status).toBe('starting');
      expect(body.services.websocket).toBe(false);
      expect(body.services.api).toBe(true);
    });

    it('returns ok status when WebSocket is ready', async () => {
      setWebSocketReady(true);

      const response = await request(app).get('/api/health');
      const body = response.body as HealthResponse;

      expect(response.status).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.services.websocket).toBe(true);
      expect(body.services.api).toBe(true);
    });

    it('includes timestamp', async () => {
      const response = await request(app).get('/api/health');
      const body = response.body as HealthResponse;

      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('includes uptime', async () => {
      const response = await request(app).get('/api/health');
      const body = response.body as HealthResponse;

      expect(body.uptime).toBeDefined();
      expect(typeof body.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThan(0);
    });
  });

  describe('GET /api/health/ping', () => {
    it('returns pong', async () => {
      const response = await request(app).get('/api/health/ping');

      expect(response.status).toBe(200);
      expect(response.text).toBe('pong');
    });
  });

  describe('setWebSocketReady / isWebSocketReady', () => {
    it('sets and gets WebSocket ready state', () => {
      expect(isWebSocketReady()).toBe(false);

      setWebSocketReady(true);
      expect(isWebSocketReady()).toBe(true);

      setWebSocketReady(false);
      expect(isWebSocketReady()).toBe(false);
    });
  });
});
