import { useState } from 'react';
import { ChevronDown, LogOut, ShieldCheck, Settings } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { RoleBadge } from '@/components/shared/DashboardComponents';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

export function Header({ title, navigation }: { title: string; navigation: ReactNode }) {
  const { session, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  async function exit() {
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  }
  return (
    <header className="topbar">
      <div className="header-location">
        {navigation}
        <span className="header-workspace">
          Workspace<span>/</span>
        </span>
        <span className="header-page-title">{title}</span>
      </div>
      <div className="header-actions">
        <span className="session-protected">
          <ShieldCheck size={14} />
          Acesso seguro
        </span>
        <details
          className="user-menu"
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.currentTarget.open = false;
          }}
        >
          <summary aria-label="Abrir menu de usuário">
            <span className="user-avatar">{session?.email.slice(0, 1).toUpperCase()}</span>
            <span className="user-summary">
              <span className="user-email">{session?.email}</span>
              <RoleBadge role={session?.role ?? null} />
            </span>
            <ChevronDown size={14} />
          </summary>
          <div className="user-menu-content">
            <span className="user-menu-email">{session?.email}</span>
            <RoleBadge role={session?.role ?? null} />
            <Link
              to="/settings"
              onClick={(event) => {
                const details = event.currentTarget.closest('details');
                if (details) details.open = false;
              }}
            >
              <Settings size={16} />
              Configurações
            </Link>
            <Button
              variant="ghost"
              onClick={() => {
                void exit();
              }}
              disabled={busy}
            >
              <LogOut size={16} />
              {busy ? 'Encerrando…' : 'Sair da conta'}
            </Button>
          </div>
        </details>
      </div>
    </header>
  );
}
