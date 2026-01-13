/**
 * E2E tests for terminal functionality
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.js';
import { createProject } from './helpers/fixtures.js';

const TEST_GUID = process.env.TEST_GUID ?? process.env.AIFORGE_AUTH_GUID ?? 'test-guid';

test.describe('Terminal', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_GUID);
    await createProject(page, '/tmp/terminal-test');
  });

  test('creates shell and shows terminal', async ({ page }) => {
    await page.click('[data-testid="add-shell-button"]');

    await expect(page.locator('[data-testid="terminal-container"]')).toBeVisible();
  });

  test('executes commands', async ({ page }) => {
    await page.click('[data-testid="add-shell-button"]');
    await page.locator('[data-testid="terminal-container"]').click();

    await page.keyboard.type('echo "e2e-test-output"');
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-testid="terminal-container"]'))
      .toContainText('e2e-test-output', { timeout: 10000 });
  });

  test('terminal survives page reload', async ({ page }) => {
    await page.click('[data-testid="add-shell-button"]');
    await page.locator('[data-testid="terminal-container"]').click();

    // Set an environment variable
    await page.keyboard.type('export E2E_VAR=persistent');
    await page.keyboard.press('Enter');

    await page.reload();

    // Reselect the shell
    await page.click('[data-testid="shell-item"]');
    await page.locator('[data-testid="terminal-container"]').click();

    await page.keyboard.type('echo $E2E_VAR');
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-testid="terminal-container"]'))
      .toContainText('persistent', { timeout: 10000 });
  });

  test('handles multiple shells', async ({ page }) => {
    // Create two shells
    await page.click('[data-testid="add-shell-button"]');
    await page.click('[data-testid="add-shell-button"]');

    // Select first shell and set variable
    await page.click('[data-testid="shell-item"]:first-child');
    await page.locator('[data-testid="terminal-container"]').click();
    await page.keyboard.type('export SHELL_NUM=1');
    await page.keyboard.press('Enter');

    // Select second shell and set different variable
    await page.click('[data-testid="shell-item"]:last-child');
    await page.locator('[data-testid="terminal-container"]').click();
    await page.keyboard.type('export SHELL_NUM=2');
    await page.keyboard.press('Enter');

    // Verify shells are independent
    await page.keyboard.type('echo $SHELL_NUM');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="terminal-container"]'))
      .toContainText('2');

    await page.click('[data-testid="shell-item"]:first-child');
    await page.locator('[data-testid="terminal-container"]').click();
    await page.keyboard.type('echo $SHELL_NUM');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="terminal-container"]'))
      .toContainText('1');
  });

  test('shows reconnection status', async ({ page }) => {
    await page.click('[data-testid="add-shell-button"]');

    // Disconnect WebSocket by forcing an offline state
    await page.context().setOffline(true);
    // Wait a moment then restore
    await page.waitForTimeout(500);
    await page.context().setOffline(false);

    await expect(page.locator('[data-testid="connection-status"]'))
      .toHaveAttribute('data-status', 'disconnected');

    // Should auto-reconnect
    await expect(page.locator('[data-testid="connection-status"]'))
      .toHaveAttribute('data-status', 'connected', { timeout: 10000 });
  });
});
