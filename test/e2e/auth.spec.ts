/**
 * E2E tests for authentication flows
 */
import { test, expect } from './fixtures.js';
import { loginAs } from './helpers/auth.js';

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

  test('logs in and redirects to home', async ({ page, testGuid }) => {
    await page.goto('/login');
    await page.fill('[data-testid="guid-input"]', testGuid);
    await page.click('[data-testid="login-button"]');

    await expect(page).toHaveURL('/');
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
  });

  test('persists session across page reload', async ({ page, testGuid }) => {
    await loginAs(page, testGuid);
    await page.reload();

    await expect(page).toHaveURL('/');
  });

  test('logs out and clears session', async ({ page, testGuid }) => {
    await loginAs(page, testGuid);
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');

    await expect(page).toHaveURL('/login');
    await page.reload();
    await expect(page).toHaveURL('/login');
  });
});
