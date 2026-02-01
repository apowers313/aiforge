/**
 * SidebarItem - Unified sidebar tree item for projects and worktrees
 *
 * This component ensures feature parity between project and worktree items:
 * - Consistent shell creation with naming convention
 * - Consistent selected state calculation
 * - Consistent context menu handling
 * - Consistent hover and expand/collapse behavior
 *
 * Entity-specific features (icons, badges, children) are configured via the variant prop.
 */
import { useState, useCallback, useMemo, type MouseEvent } from 'react';
import { IconFolder, IconGitBranch } from '@tabler/icons-react';
import type { Project, WorktreeWithStatus, Shell, ShellType } from '@shared/types';
import { useUIStore } from '@client/stores/uiStore';
import { useCreateShell, useActiveShellId } from '@client/hooks/useShells';
import { useDeleteProject } from '@client/hooks/useProjects';
import { useDeleteWorktree, useUpdateWorktreeMetadata } from '@client/hooks/useWorktrees';
import { TreeItem } from '@client/components/common/TreeItem';
import { AddShellActions } from '@client/components/common/AddShellActions';
import { ShellList } from '@client/components/shells/ShellList';
import { WorktreeList, AddWorktreeModal } from '@client/components/worktrees';
import { ProjectContextMenu } from '@client/components/projects/ProjectContextMenu';
import { WorktreeContextMenu } from '@client/components/worktrees/WorktreeContextMenu';
import { useWorktreeAiStatus } from '@client/components/worktrees/useWorktreeAiStatus';
import { useProjectAiStatus, type WorktreeStatusInfo } from '@client/components/shells/ShellItem';
import { getAiStatusColor } from '@client/utils/statusColors';
import { log } from '@client/services/logger';

const sidebarLog = log.project;

// ============================================================================
// Types
// ============================================================================

interface ProjectVariant {
  type: 'project';
  project: Project;
  worktrees: WorktreeWithStatus[];
  shells: Shell[];
}

interface WorktreeVariant {
  type: 'worktree';
  worktree: WorktreeWithStatus;
  projectId: string;
  shells: Shell[];
  done?: boolean;
  showStatus?: boolean;
}

export type SidebarItemVariant = ProjectVariant | WorktreeVariant;

interface SidebarItemProps {
  variant: SidebarItemVariant;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get branch icon color based on worktree status
 */
function getBranchColor(worktree: WorktreeWithStatus, aiStatus: ReturnType<typeof useWorktreeAiStatus>): string {
  if (aiStatus === 'blue') {
    return 'var(--mantine-color-blue-4)';
  }
  if (worktree.isMain) {
    return 'var(--mantine-color-green-4)';
  }
  return 'var(--mantine-color-cyan-4)';
}

// ============================================================================
// Component
// ============================================================================

export function SidebarItem({ variant }: SidebarItemProps): React.ReactElement {
  // === COMMON STATE ===
  const [contextMenu, setContextMenu] = useState({ opened: false, position: { x: 0, y: 0 } });
  const [isHovered, setIsHovered] = useState(false);
  const [modalOpened, setModalOpened] = useState(false);

  // === DERIVED IDENTIFIERS ===
  const entityType = variant.type;
  const entityId = variant.type === 'project' ? variant.project.id : variant.worktree.path;
  const projectId = variant.type === 'project' ? variant.project.id : variant.projectId;
  const shells = variant.shells;
  const worktreePath = variant.type === 'worktree' ? variant.worktree.path : undefined;
  const done = variant.type === 'worktree' ? (variant.done ?? false) : false;
  const showStatus = variant.type === 'worktree' ? (variant.showStatus ?? true) : true;

  // === HOOKS ===
  const createShell = useCreateShell();
  const { setActiveShell } = useActiveShellId();
  const deleteProject = useDeleteProject();
  const deleteWorktree = useDeleteWorktree(projectId);
  const updateWorktreeMetadata = useUpdateWorktreeMetadata(projectId);
  const toggleContextSidebar = useUIStore((state) => state.toggleContextSidebar);

  // Expanded state (uses different store keys per type)
  const isExpanded = useUIStore((state) =>
    variant.type === 'project'
      ? state.expandedProjectIds.includes(variant.project.id)
      : state.expandedWorktreePaths.includes(variant.worktree.path),
  );
  const toggleProjectExpanded = useUIStore((state) => state.toggleProjectExpanded);
  const toggleWorktreeExpanded = useUIStore((state) => state.toggleWorktreeExpanded);

  // Worktree status visibility (project only)
  const worktreeStatusHidden = useUIStore((state) =>
    variant.type === 'project' ? state.worktreeStatusHiddenProjects.includes(variant.project.id) : false,
  );
  const toggleWorktreeStatusVisibility = useUIStore((state) => state.toggleWorktreeStatusVisibility);

  // Selected state - CONSISTENT for both entity types
  const activeShellId = useUIStore((state) => state.activeShellId);
  const selectedContextType = useUIStore((state) => state.selectedContextType);
  const selectedContextId = useUIStore((state) => state.selectedContextId);
  const isSelected = selectedContextType === entityType && selectedContextId === entityId && activeShellId === null;

  // === STATUS CALCULATION ===
  // For worktrees: use worktree-specific hook
  const worktreeAiStatus = useWorktreeAiStatus(
    variant.type === 'worktree' ? shells : [],
    variant.type === 'worktree' ? done : false,
  );

  // For projects: use project-specific hook with worktree aggregation
  const worktreeStatusInfo: WorktreeStatusInfo[] = useMemo(() => {
    if (variant.type !== 'project') return [];
    return variant.worktrees.map((wt) => ({
      path: wt.path,
      done: 'done' in wt ? Boolean(wt.done) : false,
    }));
  }, [variant]);

  const projectAiStatus = useProjectAiStatus(
    variant.type === 'project' ? shells : [],
    worktreeStatusInfo,
  );

  const statusColor = getAiStatusColor(variant.type === 'project' ? projectAiStatus : worktreeAiStatus);

  // === COMMON HANDLERS ===

  /**
   * Create a shell with consistent naming convention
   * Counts existing shells of the same type and increments
   */
  const handleAddShell = useCallback(
    (type: ShellType): void => {
      // Let server generate the name using monotonically increasing counter
      // This prevents duplicate names when shells are deleted and recreated
      sidebarLog.info({ projectId, type, worktreePath }, 'Creating shell');
      createShell.mutate(
        { projectId, type, worktreePath },
        {
          onSuccess: (data) => {
            sidebarLog.info({ shellId: data.shell.id, shellName: data.shell.name }, 'Shell created, setting active');
            setActiveShell(data.shell.id);
          },
        },
      );
    },
    [projectId, worktreePath, createShell, setActiveShell],
  );

  const handleToggle = useCallback((): void => {
    if (variant.type === 'project') {
      sidebarLog.debug({ projectId: variant.project.id, expanded: !isExpanded }, 'Project toggle');
      toggleProjectExpanded(variant.project.id);
    } else {
      toggleWorktreeExpanded(variant.worktree.path);
    }
  }, [variant, isExpanded, toggleProjectExpanded, toggleWorktreeExpanded]);

  const handleClick = useCallback((): void => {
    sidebarLog.debug({ entityType, entityId }, 'Opening context sidebar');
    toggleContextSidebar(entityType, entityId);
  }, [toggleContextSidebar, entityType, entityId]);

  const handleContextMenu = useCallback((e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ opened: true, position: { x: e.clientX, y: e.clientY } });
  }, []);

  const handleCloseContextMenu = useCallback((): void => {
    setContextMenu((prev) => ({ ...prev, opened: false }));
  }, []);

  // === PROJECT-SPECIFIC HANDLERS ===
  const handleDeleteProject = useCallback((): void => {
    if (variant.type !== 'project') return;
    sidebarLog.info({ projectId: variant.project.id, projectName: variant.project.name }, 'Deleting project');
    deleteProject.mutate(variant.project.id);
  }, [variant, deleteProject]);

  const handleAddWorktree = useCallback((): void => {
    if (variant.type !== 'project') return;
    sidebarLog.debug({ projectId: variant.project.id }, 'Opening add worktree modal');
    setModalOpened(true);
  }, [variant]);

  const handleCloseModal = useCallback((): void => {
    setModalOpened(false);
  }, []);

  const handleToggleWorktreeStatus = useCallback((): void => {
    if (variant.type !== 'project') return;
    toggleWorktreeStatusVisibility(variant.project.id);
  }, [variant, toggleWorktreeStatusVisibility]);

  // === WORKTREE-SPECIFIC HANDLERS ===
  const handleRemoveWorktree = useCallback((): void => {
    if (variant.type !== 'worktree') return;
    deleteWorktree.mutate({ worktreePath: variant.worktree.path });
  }, [variant, deleteWorktree]);

  const handleToggleDone = useCallback(
    (newDone: boolean): void => {
      if (variant.type !== 'worktree') return;
      updateWorktreeMetadata.mutate({
        worktreePath: variant.worktree.path,
        done: newDone,
        projectId,
      });
    },
    [variant, updateWorktreeMetadata, projectId],
  );

  // === RENDER CONFIGURATION ===
  const config = useMemo(() => {
    if (variant.type === 'project') {
      // Filter out main worktree - only show secondary worktrees
      const secondaryWorktrees = variant.worktrees.filter((wt) => !wt.isMain);
      const isGitProject = variant.worktrees.length > 0;

      return {
        label: variant.project.name,
        icon: <IconFolder size={14} style={{ color: 'var(--mantine-color-blue-4)' }} />,
        depth: 0,
        badges: null,
        strikethrough: false,
        dimmed: false,
        disabled: false,
        testId: 'project-item',
        chevronTestId: 'project-chevron',
        nameTestId: 'project-name',
        children: (
          <>
            <ShellList shells={shells} projectId={projectId} depth={1} />
            {secondaryWorktrees.length > 0 && (
              <WorktreeList worktrees={secondaryWorktrees} projectId={projectId} showStatus={!worktreeStatusHidden} />
            )}
          </>
        ),
        isGitProject,
      };
    } else {
      return {
        label: variant.worktree.name,
        icon: <IconGitBranch size={14} style={{ color: getBranchColor(variant.worktree, worktreeAiStatus) }} />,
        depth: 1,
        badges: null, // Status is now shown in context menu
        strikethrough: done,
        dimmed: done,
        disabled: done,
        testId: 'worktree-item',
        chevronTestId: 'worktree-chevron',
        nameTestId: 'worktree-name',
        children: <ShellList shells={shells} projectId={projectId} depth={2} />,
        isGitProject: false,
      };
    }
  }, [variant, shells, projectId, worktreeStatusHidden, done, showStatus, worktreeAiStatus]);

  // === RENDER ===
  return (
    <>
      <TreeItem
        label={config.label}
        icon={config.icon}
        depth={config.depth}
        expanded={isExpanded}
        onToggle={handleToggle}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        statusColor={statusColor}
        selected={isSelected}
        hovered={isHovered}
        onHoverChange={setIsHovered}
        strikethrough={config.strikethrough}
        dimmed={config.dimmed}
        badges={config.badges}
        actions={
          <AddShellActions
            onAddAiShell={(): void => { handleAddShell('ai'); }}
            onAddBashShell={(): void => { handleAddShell('bash'); }}
            disabled={config.disabled}
          />
        }
        testId={config.testId}
        chevronTestId={config.chevronTestId}
        nameTestId={config.nameTestId}
      >
        {config.children}
      </TreeItem>

      {/* Context Menus */}
      {variant.type === 'project' ? (
        <ProjectContextMenu
          project={variant.project}
          opened={contextMenu.opened}
          position={contextMenu.position}
          onClose={handleCloseContextMenu}
          onAddAiShell={(): void => { handleAddShell('ai'); }}
          onAddBashShell={(): void => { handleAddShell('bash'); }}
          onAddWorktree={handleAddWorktree}
          onDelete={handleDeleteProject}
          worktreeEnabled={config.isGitProject}
          worktreeStatusHidden={worktreeStatusHidden}
          onToggleWorktreeStatus={handleToggleWorktreeStatus}
        />
      ) : (
        <WorktreeContextMenu
          worktree={variant.worktree}
          opened={contextMenu.opened}
          position={contextMenu.position}
          done={done}
          onClose={handleCloseContextMenu}
          onRemove={handleRemoveWorktree}
          onToggleDone={handleToggleDone}
          onAddAiShell={(): void => { handleAddShell('ai'); }}
          onAddBashShell={(): void => { handleAddShell('bash'); }}
        />
      )}

      {/* Modals (project only) */}
      {variant.type === 'project' && (
        <AddWorktreeModal projectId={projectId} opened={modalOpened} onClose={handleCloseModal} />
      )}
    </>
  );
}
