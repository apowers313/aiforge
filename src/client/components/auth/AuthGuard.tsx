import { Navigate, useLocation } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { useAuthStatus } from '@client/hooks/useAuth';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps): React.ReactElement {
  const location = useLocation();
  const { data: authStatus, isLoading } = useAuthStatus();

  if (isLoading) {
    return (
      <Center style={{ minHeight: '100vh' }} data-testid="auth-loading">
        <Loader size="lg" />
      </Center>
    );
  }

  if (!authStatus?.authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
