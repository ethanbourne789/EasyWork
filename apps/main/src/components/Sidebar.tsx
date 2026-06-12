import React from 'react';
import { Tooltip } from '@mui/material';
import {
  Dashboard,
  ViewKanban,
  CalendarMonth,
  Mail,
  Note,
  ShowChart,
  AccountBalanceWallet,
  DirectionsRun,
  Description,
  Settings,
} from '@mui/icons-material';
import { NAV_ITEMS, SIDEBAR_WIDTH, THEME_COLORS, type NavRoute } from '@easywork/shared';

interface SidebarProps {
  activeRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
}

const iconMap: Record<string, React.ElementType> = {
  Dashboard,
  ViewKanban,
  CalendarMonth,
  Mail,
  Note,
  ShowChart,
  AccountBalanceWallet,
  DirectionsRun,
  Description,
  Settings,
};

const Sidebar: React.FC<SidebarProps> = ({ activeRoute, onNavigate }) => {
  return (
    <div
      style={{
        width: SIDEBAR_WIDTH,
        height: '100vh',
        background: `linear-gradient(180deg, ${THEME_COLORS.sidebarBgStart} 0%, ${THEME_COLORS.sidebarBgMid} 50%, ${THEME_COLORS.sidebarBgEnd} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 0',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 1000,
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 32,
          height: 32,
          background: `linear-gradient(135deg, ${THEME_COLORS.primaryStart}, ${THEME_COLORS.primaryEnd})`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 'bold',
          fontSize: 14,
          marginBottom: 24,
        }}
      >
        EW
      </div>

      {/* Navigation Items */}
      {NAV_ITEMS.map((item) => {
        if (item.divider) {
          return (
            <div
              key="divider"
              style={{
                width: 32,
                height: 1,
                background: 'rgba(255, 255, 255, 0.1)',
                margin: '8px 0',
              }}
            />
          );
        }

        const isActive = item.route === activeRoute;
        const IconComponent = iconMap[item.icon];

        return (
          <Tooltip key={item.route} title={item.label} placement="right" arrow>
            <div
              onClick={() => !isActive && onNavigate(item.route)}
              style={{
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRadius: 8,
                position: 'relative',
                marginBottom: 4,
                backgroundColor: isActive ? 'rgba(91, 207, 196, 0.1)' : 'transparent',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {/* Active Indicator */}
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    left: -12,
                    width: 3,
                    height: 24,
                    background: `linear-gradient(180deg, ${THEME_COLORS.primaryStart}, ${THEME_COLORS.primaryEnd})`,
                    borderRadius: 2,
                  }}
                />
              )}

              {IconComponent && (
                <IconComponent
                  sx={{
                    fontSize: 22,
                    color: isActive ? THEME_COLORS.primaryStart : 'rgba(255, 255, 255, 0.6)',
                  }}
                />
              )}
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

export default Sidebar;
