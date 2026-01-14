/**
 * E2E tests for terminal functionality
 *
 * Note: These tests run serially and share state within this file.
 * Each test file gets its own isolated server and data directory.
 */
import { test, expect } from './fixtures.js';
import { loginAs } from './helpers/auth.js';

test.describe.serial('Terminal', () => {
  test.beforeEach(async ({ page, testGuid }) => {
    await loginAs(page, testGuid);

    // Ensure a project exists - if not, create one
    const projectCount = await page.locator('[data-testid="project-item"]').count();
    if (projectCount === 0) {
      await page.click('[data-testid="add-project-button"]');
      await expect(page.locator('[data-testid="directory-browser"]')).toBeVisible();
      await page.click('[data-testid="select-directory-button"]');
      await expect(page.locator('[data-testid="directory-browser"]')).not.toBeVisible({ timeout: 15000 });
    }

    await expect(page.locator('[data-testid="project-item"]').first()).toBeVisible();
  });

  test('creates shell and shows terminal', async ({ page }) => {
    await page.locator('[data-testid="add-shell-button"]').first().click();

    // Wait for terminal container to appear (shell is auto-selected after creation)
    await expect(page.locator('[data-testid="terminal-container"]')).toBeVisible({ timeout: 10000 });
  });

  test('terminal connects and shows active status', async ({ page }) => {
    // Create a new shell (will be auto-selected)
    await page.locator('[data-testid="add-shell-button"]').first().click();

    const terminalContainer = page.locator('[data-testid="terminal-container"]');
    await expect(terminalContainer).toBeVisible({ timeout: 10000 });

    // Verify terminal status indicators within the terminal container
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });
    await expect(terminalContainer.getByText('active')).toBeVisible({ timeout: 5000 });
    await expect(terminalContainer.getByText(/PID:/)).toBeVisible({ timeout: 5000 });
  });
});
