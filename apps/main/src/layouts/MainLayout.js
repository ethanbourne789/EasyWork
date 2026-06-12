import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, IconButton, Avatar } from '@mui/material';
import { LightMode, DarkMode, Brightness7 } from '@mui/icons-material';
import { NAV_ITEMS, SIDEBAR_WIDTH, HEADER_HEIGHT } from '@easywork/shared';
import Sidebar from '@/components/Sidebar';
import { useAppTheme } from '@/components/ThemeProvider';
const MainLayout = ({ activeRoute, onNavigate }) => {
    const { mode, setMode, isDark } = useAppTheme();
    const currentNav = NAV_ITEMS.find((item) => item.route === activeRoute);
    return (_jsxs(Box, { sx: { display: 'flex', height: '100vh', overflow: 'hidden' }, children: [_jsx(Sidebar, { activeRoute: activeRoute, onNavigate: onNavigate }), _jsxs(Box, { sx: {
                    flex: 1,
                    marginLeft: `${SIDEBAR_WIDTH}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: isDark ? '#0d1117' : '#F5F5F5',
                }, children: [_jsxs(Box, { sx: {
                            height: HEADER_HEIGHT,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0 24px',
                            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                            backgroundColor: isDark ? '#161b22' : '#FFFFFF',
                        }, children: [_jsxs(Box, { sx: { fontSize: 14, color: 'text.secondary' }, children: ["\u9996\u9875 / ", currentNav?.label || 'Dashboard'] }), _jsxs(Box, { sx: { display: 'flex', alignItems: 'center', gap: 1 }, children: [_jsx(IconButton, { onClick: () => {
                                            if (mode === 'light')
                                                setMode('dark');
                                            else if (mode === 'dark')
                                                setMode('system');
                                            else
                                                setMode('light');
                                        }, size: "small", title: `当前: ${mode === 'light' ? '浅色' : mode === 'dark' ? '深色' : '跟随系统'}`, children: mode === 'light' ? (_jsx(LightMode, { fontSize: "small" })) : mode === 'dark' ? (_jsx(DarkMode, { fontSize: "small" })) : (_jsx(Brightness7, { fontSize: "small" })) }), _jsx(Avatar, { sx: {
                                            width: 32,
                                            height: 32,
                                            fontSize: 14,
                                            background: 'linear-gradient(135deg, #5BCFC4, #1E5DA8)',
                                        }, children: "U" })] })] }), _jsx(Box, { id: "micro-app-container", sx: {
                            flex: 1,
                            overflow: 'auto',
                        } })] })] }));
};
export default MainLayout;
//# sourceMappingURL=MainLayout.js.map