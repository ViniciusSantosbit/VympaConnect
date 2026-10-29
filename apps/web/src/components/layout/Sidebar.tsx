import { NavLink, Link } from 'react-router';
import { modules } from '@vympa/shared';
import {
  Blocks,
  LayoutDashboard,
  Radar,
  Workflow,
  Wallet,
  Flag,
  Users,
  FileText,
  Sparkles,
  Shield,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
const icons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  prospecting: Radar,
  crm: Workflow,
  finance: Wallet,
  goals: Flag,
  clients: Users,
  contracts: FileText,
  ai: Sparkles,
  admin: Shield,
  settings: Settings,
};

export function Sidebar({
  role,
  collapsed = false,
  onCollapse,
  onNavigate,
}: {
  role: 'OWNER' | 'ADMIN' | null;
  collapsed?: boolean;
  onCollapse?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="sidebar-content">
      <Link
        to="/dashboard"
        className="brand"
        aria-label="VYMPA Connect — Dashboard"
        onClick={onNavigate}
      >
        <span className="brand-mark">
          <Blocks size={25} />
        </span>
        <span className="sidebar-copy">
          VYMPA<small>CONNECT</small>
        </span>
      </Link>
      <div className="workspace-label">
        <span className="sidebar-copy">SEU WORKSPACE</span>
        <span className="workspace-marker">V</span>
      </div>
      <nav aria-label="Navegação principal">
        {modules
          .filter(([path]) => !!icons[path] && (path !== 'admin' || role === 'OWNER'))
          .map(([path, label]) => {
            const Icon = icons[path]!;
            return (
              <NavLink
                key={path}
                to={`/${path}`}
                onClick={onNavigate}
                title={collapsed ? label : undefined}
                aria-label={label}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={19} strokeWidth={1.6} />
                <span className="sidebar-copy">{label}</span>
              </NavLink>
            );
          })}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-security">
          <Shield size={17} />
          <div className="sidebar-copy">
            Workspace privado<small>Sessão protegida por MFA</small>
          </div>
        </div>
        {onCollapse && (
          <Button
            className="collapse-sidebar"
            variant="ghost"
            size="icon"
            onClick={onCollapse}
            aria-label={collapsed ? 'Expandir navegação' : 'Recolher navegação'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </Button>
        )}
      </div>
    </div>
  );
}
