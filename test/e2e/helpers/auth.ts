/**
 * E2E authentication helpers
 */
import type { Page } from '@playwright/test';

/**
 * Login as a user with the given GUID
 */
export async function loginAs(page: Page, guid: string): Promise<void> {
  await page.goto('/login');
  await page.fill('[data-testid="guid-input"]', guid);
  await page.click('[data-testid="login-button"]');
  // Wait for redirect to home
  await page.waitForURL('/');
}

/**
 * Logout the current user
 */
export async function logout(page: Page): Promise<void> {
  await page.click('[data-testid="user-menu"]');
  await page.click('[data-testid="logout-button"]');
  await page.waitForURL('/login');
}

/**
 * Check if user is logged in by checking for sidebar visibility
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
