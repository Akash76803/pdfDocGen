import { useEffect, useState } from 'react';
import { Home } from '../pages/Home.tsx';
import { Templates } from '../pages/Templates.tsx';
import { Generate } from '../pages/Generate.tsx';
import { Settings } from '../pages/Settings.tsx';
import { CardDesigner } from '../pages/CardDesigner.tsx';
import { AppShell } from '../components/shell/AppShell.tsx';

export type AppTheme = 'light' | 'soft' | 'ocean' | 'lavender' | 'forest' | 'dark';
const THEME_KEY = 'dg-theme-preference';
type ShellTheme = 'dark' | 'light';

export default function App() {
  const [currentPage, setCurrentPage] = useState<string>('home');
  const [theme, setTheme] = useState<ShellTheme>(() => {
    const saved = window.localStorage.getItem(THEME_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home onNavigate={setCurrentPage} />;
      case 'templates':
        return <Templates />;
      case 'generate':
        return <Generate onOpenTemplates={() => setCurrentPage('templates')} />;
      case 'settings':
        // Pass original AppTheme type for legacy Settings compatibility if needed
        return <Settings theme={theme as AppTheme} onThemeChange={(t) => setTheme((t === 'light' || t === 'dark') ? t : 'dark')} />;
      default:
        return <Home onNavigate={setCurrentPage} />;
    }
  };

  // CardDesigner runs completely full-screen outside the AppShell
  if (currentPage === 'card-designer') {
    return <CardDesigner onBack={() => setCurrentPage('home')} />;
  }

  // All other generic app pages are wrapped in the layout shell
  return (
    <AppShell
      activePath={currentPage}
      onNavigate={setCurrentPage}
      theme={theme}
      onThemeChange={setTheme}
    >
      {renderPage()}
    </AppShell>
  );
}

export { App };
