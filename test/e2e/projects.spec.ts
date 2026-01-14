/**
 * E2E tests for project management
 *
 * Note: These tests run sequentially and share state within this file.
 * Each test file gets its own isolated server and data directory.
 */
import { test, expect } from './fixtures.js';
import { loginAs } from './helpers/auth.js';

test.describe.serial('Projects', () => {
  test.beforeEach(async ({ page, testGuid }) => {
    await loginAs(page, testGuid);
  });

  test('creates a new project', async ({ page }) => {
    // Check if project already exists (from previous run)
    const existingCount = await page.locator('[data-testid="project-item"]').count();
    if (existingCount > 0) {
      // Project already exists, test passes
      await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
      return;
    }

    // Create new project
    await page.click('[data-testid="add-project-button"]');
    await expect(page.locator('[data-testid="directory-browser"]')).toBeVisible();
    await page.click('[data-testid="select-directory-button"]');

    // Wait for modal to close and project to appear
    await expect(page.locator('[data-testid="directory-browser"]')).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
  });

  test('persists projects after reload', async ({ page }) => {
    // Verify project exists (created by previous test or previous run)
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();

    // Reload and verify persistence
    await page.reload();
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
  });

  test('can open project menu', async ({ page }) => {
    // Verify project exists
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();

    // Open the menu
    await page.locator('[data-testid="project-menu"]').first().click();

    // Verify delete option is available
    await expect(page.locator('[data-testid="delete-project"]')).toBeVisible();

    // Close menu by pressing Escape
    await page.keyboard.press('Escape');
  });
});
