import { Navigate, Outlet } from 'react-router';
import { useAuth } from './AuthProvider';
import { BrandLoading } from '@/components/shared/VympaLogo';
export function nextAuthPath(state: string) {
  if (state === 'mfa_enroll' || state === 'mfa_verify') return '/mfa';
  if (state === 'password') return '/recover/update';
  if (state === 'invitation') return '/invitation';
  return '/dashboard';
}
export function ProtectedRoute({ owner = false }: { owner?: boolean }) {
  const { session, loading, error } = useAuth();
  if (loading) return <BrandLoading>Restaurando sessão segura…</BrandLoading>;
  if (!session) return <Navigate to="/login" replace />;
  if (session.state !== 'ready') return <Navigate to={nextAuthPath(session.state)} replace />;
  if (owner && session.role !== 'OWNER') return <Navigate to="/dashboard" replace />;
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <Outlet />
    </>
  );
}
