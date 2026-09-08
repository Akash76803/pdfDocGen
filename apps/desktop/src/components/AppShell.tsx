import type { ReactNode } from 'react';
import { Database, FileOutput, FileText, LayoutDashboard, Moon, Settings, Sun, WandSparkles } from 'lucide-react';

export type AppRoute = 'dashboard' | 'templates' | 'builder' | 'data' | 'generate' | 'settings';

type Props = {
  children: ReactNode;
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
};

const navItems: Array<{ route: AppRoute; label: string; icon: typeof FileText }> = [
  { route: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { route: 'templates', label: 'Templates', icon: FileText },
  { route: 'builder', label: 'Template Builder', icon: WandSparkles },
  { route: 'data', label: 'Data Sources', icon: Database },
  { route: 'generate', label: 'Generate', icon: FileOutput },
  { route: 'settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children, route, onNavigate, theme, onThemeChange }: Props) {
  return (
    <div className={`app-shell ${route === 'builder' ? 'builder-shell-mode' : ''}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => onNavigate('dashboard')} aria-label="Document Builder dashboard">
          <span className="brand-mark">DB</span>
          <span><strong>Document Builder</strong><small>PDF • DOCX • Data</small></span>
        </button>
        <nav className="nav" aria-label="Primary navigation">
          {navItems.map(({ route: itemRoute, label, icon: Icon }) => (
            <button key={itemRoute} className={route === itemRoute ? 'nav-item active' : 'nav-item'} onClick={() => onNavigate(itemRoute)}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="offline-badge"><span />Local-first workspace</div>
          <button className="theme-button" onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
