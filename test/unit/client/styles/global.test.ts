/**
 * Global CSS regression tests
 *
 * These tests ensure critical CSS rules are present to prevent visual regressions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read the global CSS file
const globalCssPath = resolve(__dirname, '../../../../src/client/styles/global.css');
const globalCss = readFileSync(globalCssPath, 'utf-8');

describe('Global CSS', () => {
  describe('Terminal cursor fix', () => {
    /**
     * Regression test for double cursor issue.
     *
     * xterm.js uses a hidden textarea (.xterm-helper-textarea) to capture keyboard input.
     * Without this CSS rule, the browser's native caret cursor appears alongside
     * xterm's canvas-rendered cursor, resulting in two visible cursors.
     *
     * The fix is to make the browser's native caret transparent so only xterm's
     * cursor is visible.
     *
     * @see src/client/styles/global.css
     */
    it('should hide browser caret in xterm helper textarea to prevent double cursor', () => {
      // Check that the CSS targets the xterm helper textarea
      expect(globalCss).toContain('.xterm-helper-textarea');

      // Check that caret-color is set to transparent
      expect(globalCss).toMatch(/\.xterm-helper-textarea\s*\{[^}]*caret-color:\s*transparent/);
    });

    it('should have the caret-color rule with !important to ensure it overrides other styles', () => {
      // The !important flag ensures this rule takes precedence over any inline styles
      // or other CSS that might set a caret color
      expect(globalCss).toMatch(/caret-color:\s*transparent\s*!important/);
    });
  });
});
