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
    // Note: PID is only shown for non-daemon mode shells
  });

  test('terminal accepts input and displays output', async ({ page }) => {
    // Create a new shell
    await page.locator('[data-testid="add-shell-button"]').first().click();

    const terminalContainer = page.locator('[data-testid="terminal-container"]');
    await expect(terminalContainer).toBeVisible({ timeout: 10000 });

    // Wait for terminal to be connected
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });

    // Find the xterm textarea and focus it
    const xtermTextarea = page.locator('.xterm-helper-textarea');
    await xtermTextarea.focus();

    // Type a unique test command
    const testMarker = `E2E_TEST_${String(Date.now())}`;
    await page.keyboard.type(`echo "${testMarker}"\n`, { delay: 50 });

    // Wait a moment for command to execute
    await page.waitForTimeout(500);

    // Verify the output appears in the terminal
    // xterm.js exposes text via ARIA - use getByText within the terminal container
    // Use exact match to get the output line (not the echo command line)
    await expect(terminalContainer.getByText(testMarker, { exact: true })).toBeVisible({ timeout: 5000 });
  });

  test('terminal preserves scrollback after page reload', async ({ page, testGuid }) => {
    // Create a new shell
    await page.locator('[data-testid="add-shell-button"]').first().click();

    const terminalContainer = page.locator('[data-testid="terminal-container"]');
    await expect(terminalContainer).toBeVisible({ timeout: 10000 });
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });

    // Focus terminal and type command
    const xtermTextarea = page.locator('.xterm-helper-textarea');
    await xtermTextarea.focus();

    const testMarker = `SCROLLBACK_TEST_${String(Date.now())}`;
    await page.keyboard.type(`echo "${testMarker}"\n`, { delay: 50 });

    // Wait for output to appear (use exact match to get output line, not echo command)
    await expect(terminalContainer.getByText(testMarker, { exact: true })).toBeVisible({ timeout: 5000 });

    // Reload the page
    await page.reload();

    // Check if we need to re-login (session might be preserved)
    // Wait a moment for the page to settle
    await page.waitForTimeout(500);

    // If redirected to login page, log back in
    if (page.url().includes('/login')) {
      await loginAs(page, testGuid);
    }

    // Wait for project and shells to load
    await expect(page.locator('[data-testid="project-item"]').first()).toBeVisible({ timeout: 10000 });

    // Click on the shell to re-attach
    const shellItem = page.locator('[data-testid="shell-item"]').first();
    if (await shellItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await shellItem.click();
    }

    // Wait for terminal to reconnect
    await expect(terminalContainer).toBeVisible({ timeout: 10000 });
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 10000 });

    // Verify scrollback was preserved (use exact match to get output line)
    await expect(terminalContainer.getByText(testMarker, { exact: true })).toBeVisible({ timeout: 5000 });
  });
});
