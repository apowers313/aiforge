/**
 * AuthService - Authentication logic for AIForge
 */
import { randomUUID } from 'node:crypto';
import type { SessionStore } from '../../storage/stores/SessionStore.js';

export interface AuthServiceOptions {
  authGuid: string;
  sessionStore: SessionStore;
  sessionMaxAge: number; // milliseconds
}

export interface LoginSession {
  token: string;
  expiresAt: string;
}

export class AuthService {
  private readonly authGuid: string;
  private readonly sessionStore: SessionStore;
  private readonly sessionMaxAge: number;

  constructor(options: AuthServiceOptions) {
    this.authGuid = options.authGuid;
    this.sessionStore = options.sessionStore;
    this.sessionMaxAge = options.sessionMaxAge;
  }

  /**
   * Validate if the provided GUID matches the configured auth GUID
   */
  validateGuid(guid: string): boolean {
    return guid === this.authGuid;
  }

  /**
   * Attempt to login with a GUID
   * Returns a session on success, throws on failure
   */
  async login(guid: string): Promise<LoginSession> {
    if (!this.validateGuid(guid)) {
      throw new Error('Invalid GUID');
    }

    const token = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionMaxAge);

    await this.sessionStore.create({
      token,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Validate if a session token is valid
   */
  async validateSession(token: string): Promise<boolean> {
    const session = await this.sessionStore.findByToken(token);

    if (!session) {
      return false;
    }

    // Check if session is expired
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);

    if (now > expiresAt) {
      // Clean up expired session
      await this.sessionStore.delete(token);
      return false;
    }

    return true;
  }

  /**
   * Logout by invalidating the session
   */
  async logout(token: string): Promise<void> {
    await this.sessionStore.delete(token);
  }
}
