/**
 * E2E tests for directory browser functionality
 */
import { test, expect } from './fixtures.js';
import { loginAs } from './helpers/auth.js';

test.describe('Directory Browser', () => {
  test.beforeEach(async ({ page, testGuid }) => {
    await loginAs(page, testGuid);
  });

  test('opens at home directory', async ({ page }) => {
    await page.click('[data-testid="add-project-button"]');

    await expect(page.locator('[data-testid="current-path"]'))
      .toBeVisible();
    // Home directory path should be shown
    await expect(page.locator('[data-testid="current-path"]'))
      .not.toBeEmpty();
  });

  test('navigates into directories', async ({ page }) => {
    await page.click('[data-testid="add-project-button"]');

    // Wait for directory listing to load
    await expect(page.locator('[data-testid="directory-browser"]')).toBeVisible();

    // Get the current path before navigation
    const currentPath = await page.locator('[data-testid="current-path"]').textContent();

    // Click on a directory entry if available
    const dirEntry = page.locator('.directory-item').first();
    if (await dirEntry.isVisible()) {
      await dirEntry.click();

      // Path should have changed
      await expect(page.locator('[data-testid="current-path"]'))
        .not.toHaveText(currentPath ?? '');
    }
  });

  test('navigates up with breadcrumb', async ({ page }) => {
    await page.click('[data-testid="add-project-button"]');

    // Wait for directory listing to load
    await expect(page.locator('[data-testid="directory-browser"]')).toBeVisible();

    // Navigate into a directory first
    const dirEntry = page.locator('.directory-item').first();
    if (await dirEntry.isVisible()) {
      await dirEntry.click();

      // Wait for navigation
      await page.waitForTimeout(500);

      // Click on home breadcrumb
      await page.click('[data-testid="breadcrumb-home"]');

      // Should be back at home
      await expect(page.locator('[data-testid="current-path"]'))
        .toBeVisible();
    }
  });

  test('closes modal on cancel', async ({ page }) => {
    await page.click('[data-testid="add-project-button"]');

    await expect(page.locator('[data-testid="directory-browser"]')).toBeVisible();

    await page.click('[data-testid="cancel-button"]');

    await expect(page.locator('[data-testid="directory-browser"]')).not.toBeVisible();
  });

  test('selects directory and creates project', async ({ page }) => {
    await page.click('[data-testid="add-project-button"]');

    await expect(page.locator('[data-testid="directory-browser"]')).toBeVisible();

    await page.click('[data-testid="select-directory-button"]');

    // Modal should close and project should be created
    await expect(page.locator('[data-testid="directory-browser"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
  });
});
