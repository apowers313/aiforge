/**
 * E2E test fixtures and setup helpers
 */
import type { Page } from '@playwright/test';
import { loginAs } from './auth.js';

/**
 * Create a project using the directory browser (selects current/home directory)
 */
export async function createProject(page: Page): Promise<void> {
  await page.click('[data-testid="add-project-button"]');
  await page.waitForSelector('[data-testid="directory-browser"]');
  await page.click('[data-testid="select-directory-button"]');

  // Wait for modal to close (with generous timeout for animation)
  await page.waitForSelector('[data-testid="directory-browser"]', {
    state: 'hidden',
    timeout: 15000,
  });

  // Wait for project to appear in sidebar
  await page.waitForSelector('[data-testid="project-item"]', { timeout: 10000 });
}

/**
 * Setup for tests that need a logged-in user
 */
export async function setupLoggedInUser(page: Page): Promise<void> {
  const guid = process.env.TEST_GUID ?? process.env.AIFORGE_AUTH_GUID;
  if (!guid) {
    throw new Error('TEST_GUID or AIFORGE_AUTH_GUID environment variable is required');
  }
  await loginAs(page, guid);
}

/**
 * Clean up all projects (delete each one)
 * Note: Project deletion doesn't require confirmation
 */
export async function cleanupProjects(page: Page): Promise<void> {
  let count = await page.locator('[data-testid="project-item"]').count();

  while (count > 0) {
    // Click menu on first project and delete
    // Use first() to be explicit and force: true to ensure click works
    await page.locator('[data-testid="project-menu"]').first().click({ force: true });
    await page.locator('[data-testid="delete-project"]').click({ force: true });

    // Wait for deletion animation and React Query cache invalidation
    await page.waitForTimeout(1000);
    count = await page.locator('[data-testid="project-item"]').count();
  }
}

/**
 * Wait for WebSocket connection to be established
 */
export async function waitForConnection(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="connection-status"][data-status="connected"]', {
    timeout: 10000,
  });
}
