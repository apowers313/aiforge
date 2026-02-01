/**
 * Unified status color utilities for AI shell status indicators
 *
 * Status meanings:
 * - red: Has idle AI shell (waiting for user)
 * - green: Has active AI shell (processing)
 * - blue: Entity is done OR all AI shells are done
 * - null: No AI shells
 */

export type AiStatus = 'red' | 'green' | 'blue' | null;

/**
 * Get CSS color variable for an AI status
 */
export function getAiStatusColor(status: AiStatus): string | null {
  switch (status) {
    case 'red':
      return 'var(--mantine-color-red-6)';
    case 'green':
      return 'var(--mantine-color-green-6)';
    case 'blue':
      return 'var(--mantine-color-blue-6)';
    default:
      return null;
  }
}
