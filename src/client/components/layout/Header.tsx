import { Group, Title, ActionIcon, Box, Menu } from '@mantine/core';
import { IconMenu2, IconUser, IconLogout } from '@tabler/icons-react';
import { useUIStore } from '@client/stores/uiStore';
import { useLogout } from '@client/hooks/useAuth';

export function Header(): React.ReactElement {
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const logoutMutation = useLogout();

  const handleLogout = (): void => {
    logoutMutation.mutate();
  };

  return (
    <Box
      component="header"
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        borderBottom: '1px solid var(--mantine-color-dark-4)',
        backgroundColor: 'var(--mantine-color-dark-7)',
      }}
    >
      <Group justify="space-between" style={{ width: '100%' }}>
        <Group>
          <ActionIcon
            variant="subtle"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            data-testid="toggle-sidebar-button"
          >
            <IconMenu2 size={20} />
          </ActionIcon>
          <Title order={4} style={{ fontWeight: 600 }}>
            AIForge
          </Title>
        </Group>

        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              aria-label="User menu"
              data-testid="user-menu"
            >
              <IconUser size={20} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconLogout size={14} />}
              onClick={handleLogout}
              data-testid="logout-button"
            >
              Logout
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Box>
  );
}
