/**
 * E2E tests for project management
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.js';
import { createProject } from './helpers/fixtures.js';

const TEST_GUID = process.env.TEST_GUID ?? process.env.AIFORGE_AUTH_GUID ?? 'test-guid';

test.describe('Projects', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_GUID);
  });

  test('creates a new project', async ({ page }) => {
    await page.click('[data-testid="add-project-button"]');

    // Navigate in directory browser
    await expect(page.locator('[data-testid="directory-browser"]')).toBeVisible();
    await page.click('[data-testid="select-directory-button"]');

    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
  });

  test('renames a project', async ({ page }) => {
    await createProject(page, '/tmp/rename-test');

    await page.click('[data-testid="project-menu"]');
    await page.click('[data-testid="rename-project"]');
    await page.fill('[data-testid="rename-input"]', 'renamed-project');
    await page.click('[data-testid="rename-confirm"]');

    await expect(page.locator('[data-testid="project-item"]'))
      .toContainText('renamed-project');
  });

  test('deletes a project', async ({ page }) => {
    await createProject(page, '/tmp/delete-test');

    await page.click('[data-testid="project-menu"]');
    await page.click('[data-testid="delete-project"]');
    await page.click('[data-testid="confirm-delete"]');

    await expect(page.locator('[data-testid="project-item"]')).toHaveCount(0);
  });

  test('persists projects after reload', async ({ page }) => {
    await createProject(page, '/tmp/persist-test');
    await page.reload();

    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
  });
});
