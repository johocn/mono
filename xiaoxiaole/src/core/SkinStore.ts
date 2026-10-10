/**
 * SkinStore — 皮肤仓储（本地优先）+ 分享码编解码
 *
 * 设计要点：
 * - **仓储抽象**：`SkinRepository` 接口隔离存储位置，`LocalSkinRepo` 先落地，
 *   后续 `CloudSkinRepo`（game-server）启用时 UI 与业务代码无需改动。
 * - **贴图走 IndexedDB**：贴图 dataURL 体积可达 MB 级，localStorage 易超限；
 *   IndexedDB 不可用时自动降级到 localStorage（带体积保护）。
 * - **分享码安全**：编码带版本前缀，解码先做体积校验再走 `validateSkin` 字段白名单，
 *   防止畸形数据导致渲染异常。含贴图的皮肤编码后会很长，由上限拒绝并给出提示。
 */

import {
  MAX_SHARE_CODE_CHARS,
  validateSkin,
  type SkinConfig,
  type SkinValidation,
} from "./Skin";

/** 皮肤仓储：本地优先，云端实现就绪后替换即可，UI 与业务不感知差异 */
export interface SkinRepository {
  list(): Promise<SkinConfig[]>;
  get(id: string): Promise<SkinConfig | undefined>;
  save(skin: SkinConfig): Promise<void>;
  remove(id: string): Promise<void>;
  /** 模板中心（他人发布的皮肤） */
  listMarket(): Promise<SkinConfig[]>;
  publish?(skin: SkinConfig): Promise<void>;
}

const DB_NAME = "bg_skins";
const DB_STORE = "skins";
const DB_VERSION = 1;
const LS_FALLBACK_KEY = "bg_skins_fallback_v1";
const LS_UNLOCKED_KEY = "bg_skin_unlocked_v1";

// === IndexedDB ===

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB 不可用"));
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("打开皮肤库失败"));
  });
}

function idbRequest<T>(run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        const req = run(tx.objectStore(DB_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("皮肤库读写失败"));
        tx.oncomplete = () => db.close();
      }),
  );
}

// === localStorage 降级 ===

function lsRead(): SkinConfig[] {
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as SkinConfig[]) : [];
  } catch {
    return [];
  }
}

function lsWrite(list: SkinConfig[]): void {
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(list));
  } catch {
    throw new Error("本地存储空间不足，请先删除一些皮肤");
  }
}

// === 本地仓储实现 ===

class LocalSkinRepo implements SkinRepository {
  /** IndexedDB 不可用时置 false，全部走 localStorage 降级 */
  private useIdb = true;

  async list(): Promise<SkinConfig[]> {
    if (this.useIdb) {
      try {
        const all = await idbRequest<SkinConfig[]>((s) => s.getAll() as IDBRequest<SkinConfig[]>);
        return (all ?? []).sort((a, b) => b.createdAt - a.createdAt);
      } catch {
        this.useIdb = false;
      }
    }
    return lsRead().sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<SkinConfig | undefined> {
    if (this.useIdb) {
      try {
        const one = await idbRequest<SkinConfig | undefined>(
          (s) => s.get(id) as IDBRequest<SkinConfig | undefined>,
        );
        return one ?? undefined;
      } catch {
        this.useIdb = false;
      }
    }
    return lsRead().find((s) => s.id === id);
  }

  async save(skin: SkinConfig): Promise<void> {
    if (this.useIdb) {
      try {
        await idbRequest((s) => s.put(skin) as IDBRequest<IDBValidKey>);
        return;
      } catch {
        this.useIdb = false;
      }
    }
    const list = lsRead().filter((s) => s.id !== skin.id);
    list.push(skin);
    lsWrite(list);
  }

  async remove(id: string): Promise<void> {
    if (this.useIdb) {
      try {
        await idbRequest((s) => s.delete(id) as IDBRequest<undefined>);
        return;
      } catch {
        this.useIdb = false;
      }
    }
    lsWrite(lsRead().filter((s) => s.id !== id));
  }

  /** 模板中心：本地模式下暂无他人皮肤，返回空；接入云端后由 CloudSkinRepo 提供 */
  async listMarket(): Promise<SkinConfig[]> {
    return [];
  }
}

export const skinStore: SkinRepository = new LocalSkinRepo();

// === 已解锁皮肤（积分兑换 / 人民币购买 / 分享码导入后写入） ===

export function listUnlocked(): string[] {
  try {
    const raw = localStorage.getItem(LS_UNLOCKED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

export function isUnlocked(id: string): boolean {
  return listUnlocked().includes(id);
}

export function unlockSkin(id: string): void {
  const list = listUnlocked();
  if (list.includes(id)) return;
  list.push(id);
  try {
    localStorage.setItem(LS_UNLOCKED_KEY, JSON.stringify(list));
  } catch {
    /* 存储不可用时仅影响解锁记录持久化，不阻断当前使用 */
  }
}

// === 分享码 ===

const SHARE_PREFIX = "BGS1.";

/** 皮肤 → 分享码（Base64，带版本前缀） */
export function encodeShareCode(skin: SkinConfig): string {
  const json = JSON.stringify(skin);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  // 分块避免 apply 参数溢出
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return SHARE_PREFIX + btoa(bin);
}

/** 分享码 → 皮肤（体积校验 + 字段白名单校验） */
export function decodeShareCode(code: string): SkinValidation {
  const trimmed = (code ?? "").trim();
  if (!trimmed) return { ok: false, error: "分享码为空" };
  if (trimmed.length > MAX_SHARE_CODE_CHARS) {
    return { ok: false, error: "分享码过长，可能已损坏" };
  }
  const body = trimmed.startsWith(SHARE_PREFIX) ? trimmed.slice(SHARE_PREFIX.length) : trimmed;
  try {
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return validateSkin(JSON.parse(json) as unknown);
  } catch {
    return { ok: false, error: "分享码无法解析，请检查是否完整" };
  }
}

/** 皮肤是否含贴图（含贴图时分享码会很长，UI 需提示） */
export function hasImages(skin: SkinConfig): boolean {
  if (skin.bg?.image || skin.board?.image) return true;
  return Object.values(skin.tiles ?? {}).some((t) => !!t?.image);
}
