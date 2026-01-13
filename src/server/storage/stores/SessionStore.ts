/**
 * Session storage - manages authentication sessions
 */
import { JsonStore } from '../JsonStore.js';

export interface StoredSession {
  token: string;
  expiresAt: string; // ISO 8601 date string
  createdAt: string; // ISO 8601 date string
}

interface SessionData {
  version: number;
  sessions: StoredSession[];
}

export class SessionStore {
  private store: JsonStore<SessionData>;

  constructor(filePath: string) {
    this.store = new JsonStore<SessionData>({
      filePath,
      defaultValue: { version: 1, sessions: [] },
    });
  }

  async create(session: StoredSession): Promise<void> {
    await this.store.update((data) => ({
      ...data,
      sessions: [...data.sessions, session],
    }));
  }

  async findByToken(token: string): Promise<StoredSession | null> {
    const data = await this.store.read();
    return data.sessions.find((s) => s.token === token) ?? null;
  }

  async delete(token: string): Promise<void> {
    await this.store.update((data) => ({
      ...data,
      sessions: data.sessions.filter((s) => s.token !== token),
    }));
  }

  async deleteExpired(): Promise<void> {
    const now = new Date().toISOString();
    await this.store.update((data) => ({
      ...data,
      sessions: data.sessions.filter((s) => s.expiresAt > now),
    }));
  }
}
