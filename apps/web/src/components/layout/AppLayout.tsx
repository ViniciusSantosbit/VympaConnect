import { NavLink, Outlet } from 'react-router';
import { modules } from '@vympa/shared';
import { Blocks, ChevronRight, Menu, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
export function AppLayout() {
  const { session, logout, error } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      <aside className={open ? 'sidebar is-open' : 'sidebar'} aria-label="Navegação principal">
        <a href="/" className="brand">
          <span className="brand-mark">
            <Blocks size={24} />
          </span>
          <span>
            VYMPA<small>CONNECT</small>
          </span>
        </a>
        <div className="workspace-label">
          WORKSPACE INTERNO <span>01</span>
        </div>
        <nav>
          {modules.map(([path, label], index) => (
            <NavLink
              key={path}
              to={'/' + path}
              onClick={() => setOpen(false)}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              <span className="nav-number">{String(index + 1).padStart(2, '0')}</span>
              {label}
              <ChevronRight size={14} />
            </NavLink>
          ))}
          {session?.role === 'OWNER' && (
            <NavLink to="/admin/users" className="nav-item" onClick={() => setOpen(false)}>
              Administradores <ChevronRight size={14} />
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" /> Acesso privado <small>MFA · {session?.role}</small>
        </div>
      </aside>
      {open && (
        <button
          className="mobile-backdrop"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <Button
              className="mobile-menu"
              variant="ghost"
              size="icon"
              aria-label={open ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </Button>
            <span className="breadcrumb">
              Workspace <ChevronRight size={13} /> Administração
            </span>
          </div>
          <span className="environment">
            <span className="status-dot" />
            {import.meta.env.DEV ? 'DESENVOLVIMENTO' : 'ACESSO PRIVADO'}
          </span>
        </header>
        <main id="main" tabIndex={-1}>
          {error && (
            <p role="alert" className="p-4">
              {error}
            </p>
          )}
          <Outlet />
        </main>
        <footer className="page-footer">
          <span>
            <ShieldAlert size={14} /> Sessão individual · MFA obrigatório
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void logout();
            }}
          >
            Sair
          </Button>
        </footer>
      </div>
    </div>
  );
}
