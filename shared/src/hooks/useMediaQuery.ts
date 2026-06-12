// shared/src/hooks/useMediaQuery.ts
import { useState, useEffect } from 'react';

/** 响应式断点 Hook */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** 预设断点 Hooks */
export function useIsMobile() { return useMediaQuery('(max-width: 767px)'); }
export function useIsTablet() { return useMediaQuery('(min-width: 768px) and (max-width: 1023px)'); }
export function useIsDesktop() { return useMediaQuery('(min-width: 1024px)'); }
