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

  /**
   * Helper function to get the backend URL from the current page URL
   */
  function getBackendUrl(page: import('@playwright/test').Page): string {
    const pageUrl = new URL(page.url());
    // In E2E tests, the backend runs on a different port than the frontend
    // For CI, backend is on 9061 (see fixtures.ts)
    // For local, we need to check the environment or make an assumption
    const isCI = process.env.CI === 'true';
    if (isCI) {
      return 'http://localhost:9061';
    }
    // For local dev, frontend and backend often share the same port via proxy
    return pageUrl.origin;
  }

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

  test('handles rapid shell switching without race conditions', async ({ page }) => {
    // Create first shell
    await page.locator('[data-testid="add-shell-button"]').first().click();
    const terminalContainer = page.locator('[data-testid="terminal-container"]');
    await expect(terminalContainer).toBeVisible({ timeout: 10000 });
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });

    // Focus terminal and type a unique marker
    const xtermTextarea = page.locator('.xterm-helper-textarea');
    await xtermTextarea.focus();
    const marker1 = `SHELL1_${String(Date.now())}`;
    await page.keyboard.type(`echo "${marker1}"\n`, { delay: 30 });
    await expect(terminalContainer.getByText(marker1, { exact: true })).toBeVisible({ timeout: 5000 });

    // Create second shell
    await page.locator('[data-testid="add-shell-button"]').first().click();
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });

    // Type a unique marker in second shell
    await xtermTextarea.focus();
    const marker2 = `SHELL2_${String(Date.now())}`;
    await page.keyboard.type(`echo "${marker2}"\n`, { delay: 30 });
    await expect(terminalContainer.getByText(marker2, { exact: true })).toBeVisible({ timeout: 5000 });

    // Now rapidly switch between shells
    const shellItems = page.locator('[data-testid="shell-item"]');
    const shellCount = await shellItems.count();
    expect(shellCount).toBeGreaterThanOrEqual(2);

    // Perform rapid switching - click each shell multiple times in quick succession
    for (let i = 0; i < 3; i++) {
      await shellItems.nth(0).click();
      await page.waitForTimeout(100); // Small delay to allow state update
      await shellItems.nth(1).click();
      await page.waitForTimeout(100);
    }

    // Verify terminal is still functional - should show connected state
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });

    // Switch back to first shell and verify its content is correct
    await shellItems.nth(0).click();
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });
    await expect(terminalContainer.getByText(marker1, { exact: true })).toBeVisible({ timeout: 5000 });

    // Switch to second shell and verify its content is correct
    await shellItems.nth(1).click();
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });
    await expect(terminalContainer.getByText(marker2, { exact: true })).toBeVisible({ timeout: 5000 });
  });

  test('shows appropriate error for deleted shell', async ({ page }) => {
    // Create a new shell
    await page.locator('[data-testid="add-shell-button"]').first().click();

    const terminalContainer = page.locator('[data-testid="terminal-container"]');
    await expect(terminalContainer).toBeVisible({ timeout: 10000 });
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });

    // Get the shell ID from the shell item - we'll need to delete it via API
    // First, get the current shell from the URL or an attribute
    const shellItem = page.locator('[data-testid="shell-item"]').first();
    await expect(shellItem).toBeVisible();

    // Get the backend URL for API calls
    const backendUrl = getBackendUrl(page);

    // Get the project ID from the first project's shells
    const projectItem = page.locator('[data-testid="project-item"]').first();
    await projectItem.click();

    // Get shells via API to find the shell ID
    const apiResponse = await page.evaluate(
      async ({ backendUrl }: { backendUrl: string }) => {
        // First get projects
        const projectsRes = await fetch(`${backendUrl}/api/projects`, {
          credentials: 'include',
        });
        const projectsData = (await projectsRes.json()) as { projects: { id: string }[] };
        const projectId = projectsData.projects[0]?.id;

        if (!projectId) return null;

        // Get shells for the project
        const shellsRes = await fetch(`${backendUrl}/api/projects/${projectId}/shells`, {
          credentials: 'include',
        });
        const shellsData = (await shellsRes.json()) as { shells: { id: string }[] };
        return { shellId: shellsData.shells[0]?.id, projectId };
      },
      { backendUrl },
    );

    expect(apiResponse).not.toBeNull();
    if (!apiResponse) throw new Error('API response is null');
    const { shellId } = apiResponse;
    expect(shellId).toBeTruthy();

    // Delete the shell via API while it's connected
    await page.evaluate(
      async ({ backendUrl, shellId }: { backendUrl: string; shellId: string }) => {
        await fetch(`${backendUrl}/api/shells/${shellId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      },
      { backendUrl, shellId },
    );

    // Wait for the error state to appear
    // The session should receive a session.closed or error message
    await expect(page.getByText('Session Error')).toBeVisible({ timeout: 10000 });
  });

  test('reconnects automatically after WebSocket disconnect', async ({ page }) => {
    // Create a shell
    await page.locator('[data-testid="add-shell-button"]').first().click();

    const terminalContainer = page.locator('[data-testid="terminal-container"]');
    await expect(terminalContainer).toBeVisible({ timeout: 10000 });
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });

    // Type something to verify the terminal is working
    const xtermTextarea = page.locator('.xterm-helper-textarea');
    await xtermTextarea.focus();
    const marker = `RECONNECT_TEST_${String(Date.now())}`;
    await page.keyboard.type(`echo "${marker}"\n`, { delay: 30 });
    await expect(terminalContainer.getByText(marker, { exact: true })).toBeVisible({ timeout: 5000 });

    // Simulate WebSocket disconnect by going offline briefly
    // Note: This may not work perfectly with localhost but we try it
    await page.context().setOffline(true);

    // Wait a moment for the disconnect to be detected
    await page.waitForTimeout(1000);

    // The reconnecting overlay should appear (or we may see the terminal briefly disconnect)
    // Since localhost may not fully disconnect, we just go back online
    await page.context().setOffline(false);

    // Wait for reconnection to complete
    await page.waitForTimeout(2000);

    // Verify terminal is connected again
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 15000 });

    // Verify we can still interact with the terminal
    await xtermTextarea.focus();
    const marker2 = `AFTER_RECONNECT_${String(Date.now())}`;
    await page.keyboard.type(`echo "${marker2}"\n`, { delay: 30 });
    await expect(terminalContainer.getByText(marker2, { exact: true })).toBeVisible({ timeout: 5000 });

    // Verify scrollback is preserved (original marker should still be visible)
    await expect(terminalContainer.getByText(marker, { exact: true })).toBeVisible({ timeout: 5000 });
  });
});
