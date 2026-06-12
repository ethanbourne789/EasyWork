import React, { useEffect, useState } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import MainLayout from '@/layouts/MainLayout';
import { registerApps } from '@/micro/registerApps';
import { type NavRoute } from '@easywork/shared';

const App: React.FC = () => {
  const [activeRoute, setActiveRoute] = useState<NavRoute>('dashboard');

  useEffect(() => {
    registerApps();
  }, []);

  const handleNavigate = (route: NavRoute) => {
    setActiveRoute(route);
    // 触发微应用路由切换
    window.history.pushState(null, '', `/app-${route}`);
  };

  return (
    <ThemeProvider>
      <MainLayout activeRoute={activeRoute} onNavigate={handleNavigate} />
    </ThemeProvider>
  );
};

export default App;
