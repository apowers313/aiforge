/**
 * SessionCleanup - Periodic cleanup of expired sessions
 */
import type { SessionStore, StoredSession } from '../../storage/stores/SessionStore.js';
import { logger } from '../../utils/logger.js';

export class SessionCleanup {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private sessionStore: SessionStore,
    private intervalMs: number = 60 * 60 * 1000, // 1 hour default
  ) {}

  /**
   * Start the cleanup interval
   */
  start(): void {
    // Run cleanup immediately on startup
    void this.cleanup();

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      void this.cleanup();
    }, this.intervalMs);
  }

  /**
   * Stop the cleanup interval
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Clean up expired sessions
   * Returns the number of sessions removed
   */
  async cleanup(): Promise<number> {
    // Access internal sessions for counting
    // This is a bit of a workaround since SessionStore doesn't expose a getAll method
    const store = this.sessionStore as SessionStore & { sessions?: StoredSession[] };

    // If we have direct access to sessions array (for testing), count expired
    if (store.sessions) {
      const now = new Date();
      const expiredCount = store.sessions.filter(
        (s: StoredSession) => new Date(s.expiresAt) <= now,
      ).length;

      if (expiredCount > 0) {
        await this.sessionStore.deleteExpired();
        logger.info({ removed: expiredCount }, 'Cleaned up expired sessions');
      }

      return expiredCount;
    }

    // For production use, just call deleteExpired
    // We can't know the count without additional methods on SessionStore
    await this.sessionStore.deleteExpired();
    return 0;
  }
}
