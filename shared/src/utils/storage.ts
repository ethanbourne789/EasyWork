// shared/src/utils/storage.ts

const PREFIX = 'ew-';

/** 读取 localStorage */
export function getStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 写入 localStorage */
export function setStorage<T>(key: string, value: T): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

/** 删除 localStorage */
export function removeStorage(key: string): void {
  localStorage.removeItem(PREFIX + key);
}
