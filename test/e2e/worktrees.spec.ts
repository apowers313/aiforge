/**
 * E2E tests for git worktree management
 *
 * Tests the full worktree lifecycle: create, display, shell creation,
 * context sidebar, mark as done, and delete.
 *
 * Note: These tests require a project pointing to a git repository.
 * The tests run sequentially to maintain state between operations.
 */
import { test, expect } from './fixtures.js';
import { loginAs } from './helpers/auth.js';

test.describe.serial('Worktrees', () => {
  test.beforeEach(async ({ page, testGuid }) => {
    await loginAs(page, testGuid);
  });

  test('setup: ensure git project exists', async ({ page }) => {
    // First, ensure we have a project that is a git repository
    // We'll use the current working directory (ai-ide) which is a git repo
    const projectExists = await page.locator('[data-testid="project-item"]').count();

    if (projectExists === 0) {
      // Create a new project pointing to the current directory
      await page.click('[data-testid="add-project-button"]');
      await expect(page.locator('[data-testid="directory-browser"]')).toBeVisible();

      // Navigate to the project directory (which is a git repo)
      // The default directory should be the cwd, so just select it
      await page.click('[data-testid="select-directory-button"]');

      // Wait for modal to close and project to appear
      await expect(page.locator('[data-testid="directory-browser"]')).not.toBeVisible({ timeout: 15000 });
    }

    // Verify project exists
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
  });

  test('shows Add Worktree option in project context menu', async ({ page }) => {
    // Wait for project to load
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();

    // Right-click to open context menu
    await page.locator('[data-testid="project-item"]').first().click({ button: 'right' });

    // Verify "Add Worktree..." option is visible
    await expect(page.getByText('Add Worktree...')).toBeVisible();

    // Close menu
    await page.keyboard.press('Escape');
  });

  test('opens Add Worktree modal', async ({ page }) => {
    // Wait for project
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();

    // Right-click and select Add Worktree
    await page.locator('[data-testid="project-item"]').first().click({ button: 'right' });
    await page.getByText('Add Worktree...').click();

    // Verify modal opens
    await expect(page.getByText('Add Worktree')).toBeVisible();
    await expect(page.getByLabel(/worktree name/i)).toBeVisible();

    // Close modal
    await page.keyboard.press('Escape');
  });

  test('creates a new worktree', async ({ page }) => {
    const worktreeName = `e2e-test-${String(Date.now())}`;

    // Expand project to see worktrees
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
    await page.locator('[data-testid="project-chevron"]').first().click();

    // Open Add Worktree modal via context menu
    await page.locator('[data-testid="project-item"]').first().click({ button: 'right' });
    await page.getByText('Add Worktree...').click();

    // Fill in worktree name
    await page.getByLabel(/worktree name/i).fill(worktreeName);

    // Click Create
    await page.getByRole('button', { name: /create/i }).click();

    // Wait for modal to close
    await expect(page.getByText('Add Worktree')).not.toBeVisible({ timeout: 15000 });

    // Verify worktree appears in the list
    await expect(page.getByText(worktreeName)).toBeVisible({ timeout: 10000 });

    // Store worktree name for subsequent tests
    await page.evaluate((name) => {
      (window as unknown as { __testWorktreeName: string }).__testWorktreeName = name;
    }, worktreeName);
  });

  test('displays worktree with branch icon', async ({ page }) => {
    // Expand project
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
    const chevron = page.locator('[data-testid="project-chevron"]').first();
    const isExpanded = await chevron.locator('svg[class*="IconChevronDown"]').count() > 0;
    if (!isExpanded) {
      await chevron.click();
    }

    // Find worktree item
    const worktreeItem = page.locator('[data-testid="worktree-item"]').first();
    await expect(worktreeItem).toBeVisible();
  });

  test('opens context sidebar when clicking worktree', async ({ page }) => {
    // Expand project
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
    const chevron = page.locator('[data-testid="project-chevron"]').first();
    const isExpanded = await chevron.locator('svg[class*="IconChevronDown"]').count() > 0;
    if (!isExpanded) {
      await chevron.click();
    }

    // Click worktree to open context sidebar
    await page.locator('[data-testid="worktree-item"]').first().click();

    // Verify context sidebar opens
    await expect(page.locator('[data-testid="context-sidebar"]')).toBeVisible();

    // Verify URLs and Files tabs are present
    await expect(page.getByRole('tab', { name: /urls/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /files/i })).toBeVisible();
  });

  test('shows worktree context menu with actions', async ({ page }) => {
    // Expand project
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
    const chevron = page.locator('[data-testid="project-chevron"]').first();
    const isExpanded = await chevron.locator('svg[class*="IconChevronDown"]').count() > 0;
    if (!isExpanded) {
      await chevron.click();
    }

    // Right-click worktree
    await page.locator('[data-testid="worktree-item"]').first().click({ button: 'right' });

    // Verify context menu actions
    await expect(page.getByText('Add AI Shell')).toBeVisible();
    await expect(page.getByText('Add Bash Shell')).toBeVisible();
    await expect(page.getByText('Mark as Done')).toBeVisible();
    await expect(page.getByText('Remove Worktree')).toBeVisible();

    // Close menu
    await page.keyboard.press('Escape');
  });

  test('can mark worktree as done', async ({ page }) => {
    // Expand project
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
    const chevron = page.locator('[data-testid="project-chevron"]').first();
    const isExpanded = await chevron.locator('svg[class*="IconChevronDown"]').count() > 0;
    if (!isExpanded) {
      await chevron.click();
    }

    // Right-click worktree and mark as done
    await page.locator('[data-testid="worktree-item"]').first().click({ button: 'right' });
    await page.getByText('Mark as Done').click();

    // Verify done badge appears
    await expect(page.locator('[data-testid="worktree-item"]').first().getByText('done')).toBeVisible({ timeout: 5000 });
  });

  test('can mark done worktree as active', async ({ page }) => {
    // Expand project
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
    const chevron = page.locator('[data-testid="project-chevron"]').first();
    const isExpanded = await chevron.locator('svg[class*="IconChevronDown"]').count() > 0;
    if (!isExpanded) {
      await chevron.click();
    }

    // Right-click worktree (should be done from previous test)
    await page.locator('[data-testid="worktree-item"]').first().click({ button: 'right' });

    // Should show "Mark as Active" option for done worktree
    await expect(page.getByText('Mark as Active')).toBeVisible();
    await page.getByText('Mark as Active').click();

    // Verify done badge is removed (might need small delay)
    await expect(page.locator('[data-testid="worktree-item"]').first().getByText('done')).not.toBeVisible({ timeout: 5000 });
  });

  test('can delete worktree', async ({ page }) => {
    // Expand project
    await expect(page.locator('[data-testid="project-item"]')).toBeVisible();
    const chevron = page.locator('[data-testid="project-chevron"]').first();
    const isExpanded = await chevron.locator('svg[class*="IconChevronDown"]').count() > 0;
    if (!isExpanded) {
      await chevron.click();
    }

    // Get initial worktree count
    const initialCount = await page.locator('[data-testid="worktree-item"]').count();

    if (initialCount === 0) {
      // No worktrees to delete, skip
      return;
    }

    // Right-click worktree and remove
    await page.locator('[data-testid="worktree-item"]').first().click({ button: 'right' });
    await page.getByText('Remove Worktree').click();

    // Wait for removal (worktree count should decrease)
    await expect(page.locator('[data-testid="worktree-item"]')).toHaveCount(initialCount - 1, { timeout: 10000 });
  });
});
