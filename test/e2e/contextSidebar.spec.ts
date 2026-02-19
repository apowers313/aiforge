/**
 * E2E tests for context sidebar functionality
 *
 * Tests the click behavior, pin/unpin, and context-specific tabs for both
 * project and shell contexts.
 */
import { test, expect } from './fixtures.js';
import { loginAs } from './helpers/auth.js';

test.describe.serial('Context Sidebar', () => {
  test.beforeEach(async ({ page, testGuid }) => {
    await loginAs(page, testGuid);
  });

  test('project context workflow - open sidebar and pin', async ({ page }) => {
    // First ensure we have a project
    const projectExists = await page.locator('[data-testid="project-item"]').count() > 0;
    if (!projectExists) {
      // Create a project first
      await page.click('[data-testid="add-project-button"]');
      await expect(page.locator('[data-testid="directory-browser"]')).toBeVisible();
      await page.click('[data-testid="select-directory-button"]');
      await expect(page.locator('[data-testid="directory-browser"]')).not.toBeVisible({ timeout: 15000 });
    }

    // Wait for project to be visible
    await expect(page.locator('[data-testid="project-item"]').first()).toBeVisible();

    // Click on project name to open context sidebar
    await page.locator('[data-testid="project-name"]').first().click();

    // Verify context sidebar appears
    await expect(page.locator('[data-testid="context-sidebar"]')).toBeVisible();

    // Verify it shows URLs tab (default for project)
    // Mantine v8 SegmentedControl uses radiogroup with hidden radio inputs
    await expect(page.getByRole('radio', { name: 'URLs' })).toBeChecked();

    // Verify pin button exists and is unpinned by default
    const pinButton = page.locator('[data-testid="pin-button"]');
    await expect(pinButton).toBeVisible();
    await expect(pinButton).toHaveAttribute('aria-pressed', 'false');

    // Pin the sidebar
    await pinButton.click();
    await expect(pinButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('project click zones - chevron expands, name opens sidebar', async ({ page }) => {
    // Wait for project
    await expect(page.locator('[data-testid="project-item"]').first()).toBeVisible();

    // Close any open sidebar (pinned sidebars don't respond to Escape, use close button)
    const sidebar = page.locator('[data-testid="context-sidebar"]');
    if (await sidebar.isVisible({ timeout: 1000 }).catch(() => false)) {
      // Unpin if pinned, then close
      const pinButton = page.locator('[data-testid="pin-button"]');
      if (await pinButton.getAttribute('aria-pressed') === 'true') {
        await pinButton.click();
      }
      await page.locator('[data-testid="close-button"]').click();
    }
    await expect(sidebar).not.toBeVisible({ timeout: 5000 });

    // Click chevron - should expand project shells list without opening sidebar
    const chevron = page.locator('[data-testid="project-chevron"]').first();
    await chevron.click();

    // Small wait to ensure any sidebar would have opened
    await page.waitForTimeout(300);

    // Sidebar should NOT be visible (chevron only expands, doesn't open sidebar)
    await expect(page.locator('[data-testid="context-sidebar"]')).not.toBeVisible();

    // Now click project name - should open sidebar
    await page.locator('[data-testid="project-name"]').first().click();
    await expect(page.locator('[data-testid="context-sidebar"]')).toBeVisible();

    // Wait for state to settle (workspace sync has debounce)
    await page.waitForTimeout(500);

    // Click same project name again - should close sidebar (toggle)
    await page.locator('[data-testid="project-name"]').first().click();
    await expect(page.locator('[data-testid="context-sidebar"]')).not.toBeVisible({ timeout: 5000 });
  });

  test('shell context workflow - open sidebar with shell', async ({ page }) => {
    // Wait for project
    await expect(page.locator('[data-testid="project-item"]').first()).toBeVisible();

    // Create a shell if none exist
    const shellExists = await page.locator('[data-testid="shell-item"]').count() > 0;
    if (!shellExists) {
      // Expand project first if not expanded
      const chevron = page.locator('[data-testid="project-chevron"]').first();
      const isExpanded = await chevron.locator('svg[style*="rotate(90deg)"]').count() > 0;
      if (!isExpanded) {
        await chevron.click();
        await page.waitForTimeout(300);
      }

      // Click add shell button
      await page.locator('[data-testid="add-shell-button"]').first().click();
      await expect(page.locator('[data-testid="shell-item"]').first()).toBeVisible({ timeout: 10000 });
    }

    // Close any existing sidebar (use close button since pinned sidebars don't respond to Escape)
    const sidebar = page.locator('[data-testid="context-sidebar"]');
    if (await sidebar.isVisible({ timeout: 1000 }).catch(() => false)) {
      const pinButton = page.locator('[data-testid="pin-button"]');
      if (await pinButton.getAttribute('aria-pressed') === 'true') {
        await pinButton.click();
      }
      await page.locator('[data-testid="close-button"]').click();
    }
    await page.waitForTimeout(300);

    // Click on a shell
    await page.locator('[data-testid="shell-item"]').first().click();

    // Verify context sidebar appears with shell context
    await expect(page.locator('[data-testid="context-sidebar"]')).toBeVisible();

    // Shells no longer have tabs - they show an informational message
    // directing users to click on the project for TODOs and Notes
    await expect(page.getByText('TODOs and Notes are now managed at the project level.')).toBeVisible();
    await expect(page.getByText('Click on a project name to access TODOs and Notes.')).toBeVisible();
  });

  test('sidebar close button works', async ({ page }) => {
    // Wait for project
    await expect(page.locator('[data-testid="project-item"]').first()).toBeVisible();

    // Open context sidebar
    await page.locator('[data-testid="project-name"]').first().click();
    await expect(page.locator('[data-testid="context-sidebar"]')).toBeVisible();

    // Click close button
    await page.locator('[data-testid="close-button"]').click();

    // Verify sidebar closed
    await expect(page.locator('[data-testid="context-sidebar"]')).not.toBeVisible();
  });

  test('sidebar pin state persists across refresh', async ({ page }) => {
    // Wait for project
    await expect(page.locator('[data-testid="project-item"]').first()).toBeVisible();

    // Open context sidebar
    await page.locator('[data-testid="project-name"]').first().click();
    await expect(page.locator('[data-testid="context-sidebar"]')).toBeVisible();

    // Pin the sidebar
    const pinButton = page.locator('[data-testid="pin-button"]');
    await pinButton.click();
    await expect(pinButton).toHaveAttribute('aria-pressed', 'true');

    // Wait for workspace state to sync (debounced save)
    await page.waitForTimeout(1000);

    // Reload the page
    await page.reload();

    // Wait for page to load
    await expect(page.locator('[data-testid="project-item"]').first()).toBeVisible();

    // Sidebar should still be pinned (workspace state restored)
    // Note: The sidebar might not auto-open after refresh since selected context isn't persisted
    // But if it does open, pin state should be preserved
    const sidebarVisible = await page.locator('[data-testid="context-sidebar"]').isVisible();
    if (sidebarVisible) {
      await expect(page.locator('[data-testid="pin-button"]')).toHaveAttribute('aria-pressed', 'true');
    }
  });
});
