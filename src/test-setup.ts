import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Node 22+ 内置实验性 Web Storage（Node 25 起默认开启）：未传 --localstorage-file 时
// 会遮蔽 jsdom 的 localStorage，导致 window.localStorage 不可用（如 clear 为 undefined）。
// 这里统一注入内存版 Storage，保证任何 Node 版本下测试稳定。
const storageUsable = (s: unknown): boolean => {
  try {
    return typeof (s as Storage | undefined)?.getItem === "function";
  } catch {
    return false;
  }
};

const memoryStorage = ((): Storage => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  };
})();

if (typeof window !== "undefined" && !storageUsable(window.localStorage)) {
  Object.defineProperty(window, "localStorage", { value: memoryStorage, configurable: true, writable: true });
}
if (!storageUsable(globalThis.localStorage)) {
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage, configurable: true, writable: true });
}

// Node 22+ 实验性的全局 localStorage 在未传 --localstorage-file 时抛错，
// 且会遮蔽 jsdom 的 window.localStorage。这里用 jsdom 的实现覆盖全局。
const storage = typeof window !== "undefined" ? window.localStorage : undefined;
if (storage) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

// jsdom 未实现 window.matchMedia，ThemeProvider 的 system 主题监听依赖它。
// 这里提供一个最小可用的桩实现，默认返回 light（matches=false）。
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      // 兼容旧版 API
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
