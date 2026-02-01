/**
 * Tests for statusColors utility functions
 */
import { describe, it, expect } from 'vitest';
import { getAiStatusColor } from '@client/utils/statusColors';

describe('statusColors', () => {
  describe('getAiStatusColor', () => {
    it('returns red color for red status', () => {
      expect(getAiStatusColor('red')).toBe('var(--mantine-color-red-6)');
    });

    it('returns green color for green status', () => {
      expect(getAiStatusColor('green')).toBe('var(--mantine-color-green-6)');
    });

    it('returns blue color for blue status', () => {
      expect(getAiStatusColor('blue')).toBe('var(--mantine-color-blue-6)');
    });

    it('returns null for null status', () => {
      expect(getAiStatusColor(null)).toBeNull();
    });
  });
});
