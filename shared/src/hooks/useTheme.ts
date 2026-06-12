// shared/src/hooks/useTheme.ts
import { useState, useEffect } from 'react';
import type { ThemeMode } from '../types/common';

/** 获取系统暗色模式偏好 */
function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** 根据 ThemeMode 解析实际是否为暗色 */
export function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return getSystemDark();
}

/** 主题 Hook */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('ew-theme');
    return (saved as ThemeMode) || 'system';
  });

  useEffect(() => {
    localStorage.setItem('ew-theme', mode);
  }, [mode]);

  const isDark = resolveIsDark(mode);

  const toggle = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light'));
  };

  return { mode, setMode, isDark, toggle };
}
