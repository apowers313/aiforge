import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Paper, Title, Text, TextInput, Button, Stack, Alert, Center, Box } from '@mantine/core';
import { IconAlertCircle, IconKey } from '@tabler/icons-react';
import { useAuthStatus, useLogin } from '@client/hooks/useAuth';

export function LoginPage(): React.ReactElement {
  const [guid, setGuid] = useState('');
  const navigate = useNavigate();

  const { data: authStatus } = useAuthStatus();
  const loginMutation = useLogin();

  const goToHome = useCallback(() => {
    void navigate('/');
  }, [navigate]);

  useEffect(() => {
    if (authStatus?.authenticated) {
      goToHome();
    }
  }, [authStatus?.authenticated, goToHome]);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    loginMutation.mutate(guid);
  };

  return (
    <Center style={{ minHeight: '100vh' }}>
      <Container size="xs">
        <Paper radius="md" p="xl" withBorder>
          <Stack gap="lg">
            <Box ta="center">
              <Title order={1} size="h2">
                AIForge
              </Title>
              <Text c="dimmed" size="sm" mt="xs">
                Enter your access GUID to continue
              </Text>
            </Box>

            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                {loginMutation.isError && (
                  <Alert
                    icon={<IconAlertCircle size={16} />}
                    color="red"
                    title="Login failed"
                    data-testid="login-error"
                  >
                    {loginMutation.error.message}
                  </Alert>
                )}

                <TextInput
                  label="Access GUID"
                  placeholder="Enter your GUID"
                  value={guid}
                  onChange={(e) => { setGuid(e.target.value); }}
                  leftSection={<IconKey size={14} />}
                  leftSectionWidth={36}
                  leftSectionPointerEvents="none"
                  styles={{ input: { paddingLeft: 40 } }}
                  data-testid="guid-input"
                  required
                />

                <Button
                  type="submit"
                  fullWidth
                  loading={loginMutation.isPending}
                  disabled={!guid.trim() || loginMutation.isPending}
                  data-testid="login-button"
                >
                  Login
                </Button>
              </Stack>
            </form>
          </Stack>
        </Paper>
      </Container>
    </Center>
  );
}
