/**
 * TreeItem - A compact, reusable tree node component for building hierarchical lists
 *
 * Features:
 * - Compact spacing optimized for dense UIs
 * - Chevron for expand/collapse
 * - Icon slot for folder/branch/etc icons
 * - Status indicator gutter on the left
 * - Action buttons (always visible)
 * - Proper indentation for nested trees
 */
import { type ReactNode, type MouseEvent } from 'react';
import { Box, Group, Text, UnstyledButton, Collapse } from '@mantine/core';
import { IconChevronRight, IconChevronDown } from '@tabler/icons-react';

// Tree item row height for consistent alignment
const ROW_HEIGHT = 24;
// Gutter width for status indicators
const GUTTER_WIDTH = 6;
// Indentation per nesting level
const INDENT_SIZE = 16;
// Icon container width for alignment
const ICON_WIDTH = 16;
// Chevron width
const CHEVRON_WIDTH = 14;

export interface TreeItemProps {
  /** Main label text */
  label: string;
  /** Icon to display (e.g., folder, git branch) */
  icon?: ReactNode;
  /** Whether this item is expanded (shows children) */
  expanded?: boolean;
  /** Called when chevron is clicked */
  onToggle?: () => void;
  /** Called when the label/icon area is clicked */
  onClick?: () => void;
  /** Right-click handler */
  onContextMenu?: (e: MouseEvent) => void;
  /** Nested children (shown when expanded) */
  children?: ReactNode;
  /** Nesting depth level (0 = root) */
  depth?: number;
  /** Status indicator color (shown in left gutter) */
  statusColor?: string | null;
  /** Action buttons (always visible) */
  actions?: ReactNode;
  /** Badges shown after the label */
  badges?: ReactNode;
  /** Whether to show strikethrough on label */
  strikethrough?: boolean;
  /** Reduce opacity (e.g., for "done" items) */
  dimmed?: boolean;
  /** Whether this item is currently selected */
  selected?: boolean;
  /** Whether this item is currently hovered (controlled externally) */
  hovered?: boolean;
  /** Called when hover state changes */
  onHoverChange?: (hovered: boolean) => void;
  /** Test ID for the root element */
  testId?: string;
  /** Test ID for the chevron */
  chevronTestId?: string;
  /** Test ID for the clickable name area */
  nameTestId?: string;
}

export function TreeItem({
  label,
  icon,
  expanded = false,
  onToggle,
  onClick,
  onContextMenu,
  children,
  depth = 0,
  statusColor,
  actions,
  badges,
  strikethrough = false,
  dimmed = false,
  selected = false,
  hovered: _hovered = false,
  onHoverChange,
  testId,
  chevronTestId,
  nameTestId,
}: TreeItemProps): React.ReactElement {
  const hasChildren = !!children || !!onToggle;
  const indent = depth * INDENT_SIZE;

  return (
    <Box
      data-testid={testId}
      onContextMenu={onContextMenu}
      onMouseEnter={(): void => onHoverChange?.(true)}
      onMouseLeave={(): void => onHoverChange?.(false)}
      style={{ opacity: dimmed ? 0.6 : 1 }}
    >
      {/* Main row */}
      <Group
        gap={0}
        wrap="nowrap"
        style={{
          height: ROW_HEIGHT,
        }}
      >
        {/* Status indicator gutter - always at position 0 */}
        <Box
          style={{
            width: GUTTER_WIDTH,
            flexShrink: 0,
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'stretch',
          }}
        >
          {statusColor && (
            <Box
              style={{
                width: 3,
                backgroundColor: statusColor,
                borderRadius: 2,
              }}
              data-testid={testId ? `${testId}-status` : undefined}
            />
          )}
        </Box>

        {/* Chevron - indentation applied here */}
        <Box style={{ width: CHEVRON_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center', marginLeft: indent }}>
          {hasChildren ? (
            <UnstyledButton
              onClick={(e): void => {
                e.stopPropagation();
                onToggle?.();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: CHEVRON_WIDTH,
                height: CHEVRON_WIDTH,
              }}
              data-testid={chevronTestId}
            >
              {expanded ? (
                <IconChevronDown size={12} style={{ opacity: 0.7 }} />
              ) : (
                <IconChevronRight size={12} style={{ opacity: 0.7 }} />
              )}
            </UnstyledButton>
          ) : null}
        </Box>

        {/* Icon + Label (clickable area) */}
        <UnstyledButton
          onClick={onClick}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: '100%',
            paddingLeft: 2,
            paddingRight: 4,
            borderRadius: 4,
            backgroundColor: selected ? 'var(--mantine-color-dark-5)' : 'transparent',
          }}
          data-testid={nameTestId}
        >
          {/* Icon */}
          {icon && (
            <Box style={{ width: ICON_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {icon}
            </Box>
          )}

          {/* Label */}
          <Text
            size="xs"
            truncate
            style={{
              flex: 1,
              lineHeight: `${String(ROW_HEIGHT)}px`,
              textDecoration: strikethrough ? 'line-through' : 'none',
            }}
          >
            {label}
          </Text>
        </UnstyledButton>

        {/* Actions and badges */}
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0, paddingRight: 4 }}>
          {badges}
          {actions}
        </Group>
      </Group>

      {/* Children (nested items) */}
      {children && (
        <Collapse in={expanded}>
          {children}
        </Collapse>
      )}
    </Box>
  );
}

// Export constants for external use
export const TREE_ITEM_HEIGHT = ROW_HEIGHT;
export const TREE_ITEM_GUTTER_WIDTH = GUTTER_WIDTH;
export const TREE_ITEM_INDENT_SIZE = INDENT_SIZE;
