/**
 * E2E test fixtures and setup helpers
 */
import type { Page } from '@playwright/test';
import { loginAs } from './auth.js';

/**
 * Create a project at the specified path
 */
export async function createProject(page: Page, _path: string): Promise<void> {
  await page.click('[data-testid="add-project-button"]');
  await page.waitForSelector('[data-testid="directory-browser"]');

  // Type path directly into the path display and navigate
  // The modal shows the current path, we need to navigate to the target
  // For now, we'll select the current directory which is typically the home dir
  await page.click('[data-testid="select-directory-button"]');

  // Wait for project to appear
  await page.waitForSelector('[data-testid="project-item"]');
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
 * Clean up test projects created during E2E tests
 */
export async function cleanupTestProjects(page: Page): Promise<void> {
  // Get all project items
  const projectItems = page.locator('[data-testid="project-item"]');
  const count = await projectItems.count();

  // Delete each project
  for (let i = count - 1; i >= 0; i--) {
    const projectItem = projectItems.nth(i);
    await projectItem.hover();
    await projectItem.locator('[data-testid="project-menu"]').click();
    await page.click('[data-testid="delete-project"]');
    await page.click('[data-testid="confirm-delete"]');
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
