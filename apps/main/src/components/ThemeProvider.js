import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { THEME_COLORS } from '@easywork/shared';
const ThemeContext = createContext({
    mode: 'system',
    setMode: () => { },
    isDark: false,
});
export const useAppTheme = () => useContext(ThemeContext);
export const ThemeProvider = ({ children }) => {
    const [mode, setMode] = useState(() => {
        const saved = localStorage.getItem('theme-mode');
        return saved || 'system';
    });
    const isDark = useMemo(() => {
        if (mode === 'dark')
            return true;
        if (mode === 'light')
            return false;
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }, [mode]);
    useEffect(() => {
        localStorage.setItem('theme-mode', mode);
    }, [mode]);
    const theme = useMemo(() => createTheme({
        palette: {
            mode: isDark ? 'dark' : 'light',
            primary: {
                main: THEME_COLORS.primaryStart,
            },
            secondary: {
                main: THEME_COLORS.secondary,
            },
            background: {
                default: isDark ? THEME_COLORS.backgroundDark : THEME_COLORS.backgroundLight,
                paper: isDark ? THEME_COLORS.surfaceDark : THEME_COLORS.surfaceLight,
            },
            text: {
                primary: isDark ? THEME_COLORS.textDark : THEME_COLORS.textLight,
                secondary: isDark ? THEME_COLORS.textSecondaryDark : THEME_COLORS.textSecondaryLight,
            },
        },
    }), [isDark]);
    return (_jsx(ThemeContext.Provider, { value: { mode, setMode, isDark }, children: _jsxs(MuiThemeProvider, { theme: theme, children: [_jsx(CssBaseline, {}), children] }) }));
};
//# sourceMappingURL=ThemeProvider.js.map