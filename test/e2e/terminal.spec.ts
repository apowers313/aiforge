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

    // Click on the terminal area to ensure proper focus before typing
    // This is more reliable than just focusing the hidden textarea
    await terminalContainer.locator('.xterm-screen').click();

    // Wait for terminal to be ready for input
    await page.waitForTimeout(500);

    // Type a unique test command - use a simpler marker to reduce chance of dropped keys
    const testMarker = `TEST${String(Date.now())}`;
    // Use pressSequentially for more reliable input in CI environments
    await page.keyboard.type(`echo ${testMarker}\n`, { delay: 50 });

    // Verify the output appears in the terminal (with longer timeout for CI)
    // xterm.js exposes text via ARIA - use getByText within the terminal container
    // Use exact match to get only the output line (not the echo command line)
    await expect(terminalContainer.getByText(testMarker, { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('terminal preserves scrollback after page reload', async ({ page, testGuid }) => {
    // Create a new shell
    await page.locator('[data-testid="add-shell-button"]').first().click();

    const terminalContainer = page.locator('[data-testid="terminal-container"]');
    await expect(terminalContainer).toBeVisible({ timeout: 10000 });
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });

    // Click on terminal to ensure proper focus
    await terminalContainer.locator('.xterm-screen').click();
    await page.waitForTimeout(500);

    const testMarker = `SCROLLBACK${String(Date.now())}`;
    await page.keyboard.type(`echo ${testMarker}\n`, { delay: 50 });

    // Wait for output to appear (use exact match to get output line, not echo command)
    await expect(terminalContainer.getByText(testMarker, { exact: true })).toBeVisible({ timeout: 10000 });

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

    // Click on terminal to ensure proper focus and type a unique marker
    await terminalContainer.locator('.xterm-screen').click();
    await page.waitForTimeout(500);
    const marker1 = `SHELL1${String(Date.now())}`;
    await page.keyboard.type(`echo ${marker1}\n`, { delay: 50 });
    await expect(terminalContainer.getByText(marker1, { exact: true })).toBeVisible({ timeout: 10000 });

    // Create second shell
    await page.locator('[data-testid="add-shell-button"]').first().click();
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });

    // Click on terminal to ensure proper focus and type a unique marker in second shell
    await terminalContainer.locator('.xterm-screen').click();
    await page.waitForTimeout(500);
    const marker2 = `SHELL2${String(Date.now())}`;
    await page.keyboard.type(`echo ${marker2}\n`, { delay: 50 });
    await expect(terminalContainer.getByText(marker2, { exact: true })).toBeVisible({ timeout: 10000 });

    // Expand the project to see shell items in the sidebar
    const chevron = page.locator('[data-testid="project-chevron"]').first();
    await chevron.click();
    await page.waitForTimeout(300);

    // Now rapidly switch between shells
    // Note: Use the LAST two shells since this test creates them (previous tests may have created earlier shells)
    const shellItems = page.locator('[data-testid="shell-item"]');
    await expect(shellItems.first()).toBeVisible({ timeout: 5000 });
    const shellCount = await shellItems.count();
    expect(shellCount).toBeGreaterThanOrEqual(2);

    // Get indices for the two shells we created (the last two in the list)
    const shell1Index = shellCount - 2;
    const shell2Index = shellCount - 1;

    // Perform rapid switching - click each shell multiple times in quick succession
    for (let i = 0; i < 3; i++) {
      await shellItems.nth(shell1Index).click();
      await page.waitForTimeout(100); // Small delay to allow state update
      await shellItems.nth(shell2Index).click();
      await page.waitForTimeout(100);
    }

    // Verify terminal is still functional - should show connected state
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });

    // Switch back to first shell and verify its content is correct
    await shellItems.nth(shell1Index).click();
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 10000 });
    // Scrollback content may take a moment to load after shell switch
    await expect(terminalContainer.getByText(marker1, { exact: true })).toBeVisible({ timeout: 10000 });

    // Switch to second shell and verify its content is correct
    await shellItems.nth(shell2Index).click();
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 10000 });
    await expect(terminalContainer.getByText(marker2, { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('shows appropriate error for deleted shell', async ({ page }) => {
    // Create a new shell
    await page.locator('[data-testid="add-shell-button"]').first().click();

    const terminalContainer = page.locator('[data-testid="terminal-container"]');
    await expect(terminalContainer).toBeVisible({ timeout: 10000 });
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });

    // Get the backend URL for API calls
    const backendUrl = getBackendUrl(page);

    // Get shells via API to find the shell ID (get the most recently created shell)
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
        const shellsData = (await shellsRes.json()) as { shells: { id: string; createdAt: string }[] };
        // Sort by createdAt descending and get the most recent shell
        const sortedShells = shellsData.shells.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        return { shellId: sortedShells[0]?.id, projectId };
      },
      { backendUrl },
    );

    expect(apiResponse).not.toBeNull();
    if (!apiResponse) throw new Error('API response is null');
    const { shellId } = apiResponse;
    expect(shellId).toBeTruthy();
    if (!shellId) throw new Error('shellId is undefined');

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

    // Click on terminal to ensure proper focus and type something
    await terminalContainer.locator('.xterm-screen').click();
    await page.waitForTimeout(500);
    const marker = `RECONNECT${String(Date.now())}`;
    await page.keyboard.type(`echo ${marker}\n`, { delay: 50 });
    await expect(terminalContainer.getByText(marker, { exact: true })).toBeVisible({ timeout: 10000 });

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

    // Click on terminal to ensure proper focus and verify we can still interact
    await terminalContainer.locator('.xterm-screen').click();
    await page.waitForTimeout(500);
    const marker2 = `AFTERRECON${String(Date.now())}`;
    await page.keyboard.type(`echo ${marker2}\n`, { delay: 50 });
    await expect(terminalContainer.getByText(marker2, { exact: true })).toBeVisible({ timeout: 10000 });

    // Verify scrollback is preserved (original marker should still be visible)
    await expect(terminalContainer.getByText(marker, { exact: true })).toBeVisible({ timeout: 5000 });
  });

  test('copies selected terminal text to clipboard on selection', async ({ page, context }) => {
    // Grant clipboard permissions so we can read/write the clipboard in the test
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Clear the clipboard to ensure a clean starting state
    await page.evaluate(() => navigator.clipboard.writeText(''));

    // Create a shell
    await page.locator('[data-testid="add-shell-button"]').first().click();
    const terminalContainer = page.locator('[data-testid="terminal-container"]');
    await expect(terminalContainer).toBeVisible({ timeout: 10000 });
    await expect(terminalContainer.getByText('connected')).toBeVisible({ timeout: 5000 });

    // Focus the terminal and type a unique marker
    const xtermScreen = terminalContainer.locator('.xterm-screen');
    await xtermScreen.click();
    await page.waitForTimeout(500);

    const marker = `COPYTEST${String(Date.now())}`;
    await page.keyboard.type(`echo ${marker}\n`, { delay: 50 });
    await expect(terminalContainer.getByText(marker, { exact: true })).toBeVisible({ timeout: 10000 });

    // Select the output line by triple-clicking on it.
    // xterm exposes text as accessible text nodes; we find the marker's position
    // and triple-click at those coordinates to trigger xterm's line selection.
    const markerLocator = terminalContainer.getByText(marker, { exact: true });
    const markerBox = await markerLocator.boundingBox();
    expect(markerBox).not.toBeNull();
    if (!markerBox) throw new Error('Could not locate marker text');

    await page.mouse.click(
      markerBox.x + markerBox.width / 2,
      markerBox.y + markerBox.height / 2,
      { clickCount: 3 },
    );

    // Wait for onSelectionChange to fire and clipboard write to complete
    await page.waitForTimeout(500);

    // The clipboard should already contain the selected text (Layer 2:
    // copy-on-select via onSelectionChange). No Ctrl+C needed.
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText.trim()).toContain(marker);
  });
});
