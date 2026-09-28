type P = Record<string, unknown>;

/**
 * preset 取值器（依赖零的叶模块）：proc.ts / proc-building.ts / proc-props.ts 共用。
 * 单独成文件是为了打断「proc ↔ proc-building/proc-props」的循环导入，
 * 否则测试运行器（Vite SSR）在求值顺序上会拿到未初始化的绑定。
 */
export const num = (p: P, k: string, d: number): number => (typeof p[k] === 'number' ? (p[k] as number) : d);
export const str = (p: P, k: string, d: string): string => (typeof p[k] === 'string' ? (p[k] as string) : d);
export const arr = <T>(p: P, k: string): T[] | null => (Array.isArray(p[k]) ? (p[k] as T[]) : null);

/**
 * L4 内建兜底默认值容器（spec §3.6.4）：把一个 preset 的全部几何/色值默认值集中声明一次。
 * 取值器（num/str/arr/n/c/fb）的实参子树是 `no-visual-number` / `no-hardcoded-color` 唯一豁免的位置。
 */
export function fb<T extends Record<string, unknown>>(d: T): T {
  return d;
}