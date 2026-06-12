import React from 'react';
import { Box, IconButton, Avatar } from '@mui/material';
import { LightMode, DarkMode, Brightness7 } from '@mui/icons-material';
import { NAV_ITEMS, SIDEBAR_WIDTH, HEADER_HEIGHT, type NavRoute } from '@easywork/shared';
import Sidebar from '@/components/Sidebar';
import { useAppTheme } from '@/components/ThemeProvider';

interface MainLayoutProps {
  activeRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({ activeRoute, onNavigate }) => {
  const { mode, setMode, isDark } = useAppTheme();

  const currentNav = NAV_ITEMS.find((item) => item.route === activeRoute);

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <Sidebar activeRoute={activeRoute} onNavigate={onNavigate} />

      {/* Main Content Area */}
      <Box
        sx={{
          flex: 1,
          marginLeft: `${SIDEBAR_WIDTH}px`,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: isDark ? '#0d1117' : '#F5F5F5',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            height: HEADER_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
            backgroundColor: isDark ? '#161b22' : '#FFFFFF',
          }}
        >
          {/* Breadcrumb */}
          <Box sx={{ fontSize: 14, color: 'text.secondary' }}>
            首页 / {currentNav?.label || 'Dashboard'}
          </Box>

          {/* Right Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Theme Toggle */}
            <IconButton
              onClick={() => {
                if (mode === 'light') setMode('dark');
                else if (mode === 'dark') setMode('system');
                else setMode('light');
              }}
              size="small"
              title={`当前: ${mode === 'light' ? '浅色' : mode === 'dark' ? '深色' : '跟随系统'}`}
            >
              {mode === 'light' ? (
                <LightMode fontSize="small" />
              ) : mode === 'dark' ? (
                <DarkMode fontSize="small" />
              ) : (
                <Brightness7 fontSize="small" />
              )}
            </IconButton>

            {/* User Avatar */}
            <Avatar
              sx={{
                width: 32,
                height: 32,
                fontSize: 14,
                background: 'linear-gradient(135deg, #5BCFC4, #1E5DA8)',
              }}
            >
              U
            </Avatar>
          </Box>
        </Box>

        {/* Micro App Container */}
        <Box
          id="micro-app-container"
          sx={{
            flex: 1,
            overflow: 'auto',
          }}
        />
      </Box>
    </Box>
  );
};

export default MainLayout;
