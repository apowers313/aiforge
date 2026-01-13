/**
 * E2E tests for authentication flows
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.js';

const TEST_GUID = process.env.TEST_GUID ?? process.env.AIFORGE_AUTH_GUID ?? 'test-guid';

test.describe('Authentication', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('shows error for invalid GUID', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="guid-input"]', 'invalid-guid');
    await page.click('[data-testid="login-button"]');

    await expect(page.locator('[data-testid="login-error"]'))
      .toContainText('Invalid');
  });

  test('logs in and redirects to home', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="guid-input"]', TEST_GUID);
    await page.click('[data-testid="login-button"]');

    await expect(page).toHaveURL('/');
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
  });

  test('persists session across page reload', async ({ page }) => {
    await loginAs(page, TEST_GUID);
    await page.reload();

    await expect(page).toHaveURL('/');
  });

  test('logs out and clears session', async ({ page }) => {
    await loginAs(page, TEST_GUID);
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');

    await expect(page).toHaveURL('/login');
    await page.reload();
    await expect(page).toHaveURL('/login');
  });
});
