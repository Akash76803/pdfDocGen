import React from 'react';
import { LayoutDashboard, Layers, Play, Settings as SettingsIcon, FileText, Moon, Sun } from 'lucide-react';

export type AppShellProps = {
  children: React.ReactNode;
  activePath?: string;
  onNavigate?: (path: string) => void;
  theme?: 'dark' | 'light';
  onThemeChange?: (theme: 'dark' | 'light') => void;
};

export const AppShell: React.FC<AppShellProps> = ({
  children,
  activePath = 'home',
  onNavigate,
  theme = 'dark',
  onThemeChange
}) => {
  const handleNav = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    }
  };

  const navItems = [
    { path: 'home', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { path: 'templates', label: 'Templates', icon: <Layers size={18} /> },
    { path: 'generate', label: 'Generate', icon: <Play size={18} /> },
    { path: 'settings', label: 'Settings', icon: <SettingsIcon size={18} /> },
  ];

  return (
    <div className="dg-app-shell">
      <nav className="dg-app-nav" aria-label="Main Navigation">
        <div className="dg-app-nav__header">
          <div className="dg-app-nav__logo">
            <FileText size={20} className="dg-text-accent" style={{ color: 'var(--color-accent)' }} />
            <span>Document Generator</span>
          </div>
        </div>
        
        <div className="dg-app-nav__menu">
          {navItems.map((item) => (
            <button
              key={item.path}
              className={`dg-app-nav__item ${activePath === item.path ? 'dg-app-nav__item--active' : ''}`}
              onClick={() => handleNav(item.path)}
              aria-current={activePath === item.path ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="dg-app-nav__footer">
          <button 
            className="dg-icon-button" 
            onClick={() => onThemeChange?.(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </nav>

      <main className="dg-app-main">
        <div className="dg-app-content">
          {children}
        </div>
      </main>
    </div>
  );
};
