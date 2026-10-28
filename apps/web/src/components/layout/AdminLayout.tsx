import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Menu } from 'lucide-react';
import { modules } from '@vympa/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AdminLayout() {
  const { session, error } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const title =
    modules.find(([path]) => pathname === `/${path}` || pathname.startsWith(`/${path}/`))?.[1] ??
    'Workspace';
  const role = session?.role ?? null;
  return (
    <div className={`app-shell admin-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      <aside className="sidebar desktop-sidebar">
        <Sidebar role={role} collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} />
      </aside>
      <div className="main-shell">
        <Header
          title={title}
          navigation={
            <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
              <DialogTrigger asChild>
                <Button
                  className="mobile-menu"
                  variant="ghost"
                  size="icon"
                  aria-label="Abrir navegação"
                >
                  <Menu size={21} />
                </Button>
              </DialogTrigger>
              <DialogContent className="admin-drawer">
                <DialogTitle className="sr-only">Navegação do workspace</DialogTitle>
                <DialogDescription className="sr-only">
                  Escolha um módulo do VYMPA Connect.
                </DialogDescription>
                <Sidebar role={role} onNavigate={() => setMobileOpen(false)} />
              </DialogContent>
            </Dialog>
          }
        />
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
            VYMPA Connect<span className="footer-divider">/</span>Workspace interno
          </span>
          <span>{import.meta.env.DEV ? 'Ambiente de desenvolvimento' : 'Acesso privado'}</span>
        </footer>
      </div>
    </div>
  );
}
