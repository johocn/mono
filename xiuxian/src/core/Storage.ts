/**
 * 本地存档兜底：云存档不可用时写 localStorage。
 */
const KEY = "xiuxian.save.v1";
const TOKEN_KEY = "xiuxian.token";

export const LocalStorage = {
  write(data: unknown): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* 隐私模式等场景下忽略 */
    }
  },
  read<T = any>(): T | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
  writeToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  },
  readToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
};
