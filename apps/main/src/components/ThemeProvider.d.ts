import React from 'react';
type ThemeMode = 'light' | 'dark' | 'system';
interface ThemeContextType {
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
    isDark: boolean;
}
export declare const useAppTheme: () => ThemeContextType;
export declare const ThemeProvider: React.FC<{
    children: React.ReactNode;
}>;
export {};
//# sourceMappingURL=ThemeProvider.d.ts.map