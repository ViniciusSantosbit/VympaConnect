import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type PropsWithChildren,
} from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, authMessage, initializeCsrf, clearCsrf } from './auth-api';

export type SessionView = {
  email: string;
  role: 'OWNER' | 'ADMIN' | null;
  state: 'ready' | 'mfa_enroll' | 'mfa_verify' | 'password' | 'invitation';
  factors: { id: string; name: string }[];
};
type AuthValue = {
  session: SessionView | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const revision = useRef(0);
  const [session, setSession] = useState<SessionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    const requestRevision = ++revision.current;
    try {
      const value = await authApi<SessionView>('/auth/session');
      if (requestRevision !== revision.current) return;
      setSession(value);
      setError('');
    } catch (failure) {
      if (requestRevision !== revision.current) return;
      queryClient.clear();
      setSession(null);
      if (!(axios.isAxiosError(failure) && failure.response?.status === 401))
        setError(authMessage(failure));
      else setError('');
    } finally {
      if (requestRevision === revision.current) setLoading(false);
    }
  }, [queryClient]);
  useEffect(() => {
    let mounted = true;
    initializeCsrf()
      .then(() => {
        if (mounted) return reload();
      })
      .catch((failure: unknown) => {
        if (mounted) {
          setError(authMessage(failure));
          setLoading(false);
        }
      });
    const expired = () => {
      revision.current++;
      queryClient.clear();
      setSession(null);
      setError('Sua sessão expirou. Entre novamente.');
    };
    window.addEventListener('auth:expired', expired);
    return () => {
      mounted = false;
      window.removeEventListener('auth:expired', expired);
    };
  }, [reload, queryClient]);
  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      void reload();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [session, reload]);
  const logout = async () => {
    try {
      const result = await authApi<{ remoteRevocationPending: boolean }>('/auth/logout', 'POST');
      revision.current++;
      clearCsrf();
      queryClient.clear();
      setSession(null);
      setError(
        result.remoteRevocationPending
          ? 'Sessão VYMPA encerrada. A revogação no provedor não pôde ser confirmada.'
          : '',
      );
    } catch (failure) {
      setError(authMessage(failure));
    }
  };
  return (
    <AuthContext.Provider value={{ session, loading, error, reload, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
// O estado representa apenas a resposta do servidor. Nenhum token é persistido no navegador.
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider obrigatório.');
  return context;
}
