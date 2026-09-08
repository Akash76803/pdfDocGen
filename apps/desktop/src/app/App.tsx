import { useEffect, useMemo, useState } from 'react';
import { AppShell, type AppRoute } from '../components/AppShell.tsx';
import { Dashboard } from '../pages/Dashboard.tsx';
import { Templates } from '../pages/Templates.tsx';
import { TemplateBuilder } from '../pages/TemplateBuilder.tsx';
import { DataSources } from '../pages/DataSources.tsx';
import { Generate } from '../pages/Generate.tsx';
import { Settings } from '../pages/Settings.tsx';

const ROUTE_KEY = 'document-builder.route.v1';
const THEME_KEY = 'document-builder.theme.v1';

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => {
    const saved = window.localStorage.getItem(ROUTE_KEY);
    return isRoute(saved) ? saved : 'dashboard';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(ROUTE_KEY, route);
  }, [route]);

  const page = useMemo(() => {
    switch (route) {
      case 'templates': return <Templates onNavigate={setRoute} />;
      case 'builder': return <TemplateBuilder onNavigate={setRoute} />;
      case 'data': return <DataSources />;
      case 'generate': return <Generate onNavigate={setRoute} />;
      case 'settings': return <Settings theme={theme} onThemeChange={setTheme} />;
      default: return <Dashboard onNavigate={setRoute} />;
    }
  }, [route, theme]);

  return (
    <AppShell route={route} onNavigate={setRoute} theme={theme} onThemeChange={setTheme}>
      {page}
    </AppShell>
  );
}

function isRoute(value: string | null): value is AppRoute {
  return ['dashboard', 'templates', 'builder', 'data', 'generate', 'settings'].includes(value ?? '');
}
