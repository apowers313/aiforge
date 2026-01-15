import { Navigate, useLocation } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { useAuthStatus } from '@client/hooks/useAuth';
import { log } from '@client/services/logger';

const authLog = log.auth;

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps): React.ReactElement {
  const location = useLocation();
  const { data: authStatus, isLoading } = useAuthStatus();

  if (isLoading) {
    authLog.debug({ path: location.pathname }, 'AuthGuard: checking authentication');
    return (
      <Center style={{ minHeight: '100vh' }} data-testid="auth-loading">
        <Loader size="lg" />
      </Center>
    );
  }

  if (!authStatus?.authenticated) {
    authLog.info({ path: location.pathname }, 'AuthGuard: not authenticated, redirecting to login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  authLog.debug({ path: location.pathname }, 'AuthGuard: authenticated');
  return <>{children}</>;
}
