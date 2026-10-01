import {
  BOARD_SLOT_AD_H, BOARD_SLOT_AD_MS, BOARD_SLOT_AD_W, BOARD_SLOT_AD_X, BOARD_SLOT_AD_Y,
  BOARD_SLOT_LOG_H, BOARD_SLOT_LOG_KEEP, BOARD_SLOT_LOG_W, BOARD_SLOT_LOG_X, BOARD_SLOT_LOG_Y,
} from '../skin/layout';

/**
 * 棋盘两处三角空位的内容位（可见 DOM 覆盖层，与画布共用 `#mono-fit` 的缩放基准）：
 *   右上 = 广告 / 城市主题插画 / 规则小贴士**轮播**（`kind: 'image'` 走静态图，`kind: 'tip'` 走纯文案）
 *   左下 = 事件战报**滚动条**（`update(callout)` 逐条推进，只保留最近 `BOARD_SLOT_LOG_KEEP` 条）
 *
 * 内容由**静态配置文件**驱动（`public/config/board-slots.json`），改文案 / 换图 / 调时长不必动代码，
 * 也不必走上传目录——图片放静态目录（与皮肤包同源）。
 */

/** 轮播条目：图片或纯文案；`href` 有值时整块可点 */
export interface SlotAd {
  kind: 'image' | 'tip';
  src?: string;
  text?: string;
  href?: string;
  ms?: number;
}

export interface SlotConfig {
  ads: SlotAd[];
}

/** 缺配置 / 坏 JSON 时的内建兜底：三条规则小贴士（保证该位永不空着） */
export const SLOT_DEFAULTS: SlotConfig = {
  ads: [
    { kind: 'tip', text: '掷骰前进 · 落在空地可买下' },
    { kind: 'tip', text: '经过起点领 ￥200' },
    { kind: 'tip', text: '升级到 3 级 · 路过租金 ￥105' },
  ],
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** 解析配置（纯函数）：只认 `ads` 数组里 kind 合法的条目；一条都没有 → 回退内建兜底 */
export function parseSlotConfig(raw: unknown): SlotConfig {
  if (!isObj(raw)) return SLOT_DEFAULTS;
  const list = Array.isArray(raw.ads) ? raw.ads : [];
  const ads: SlotAd[] = [];
  for (const item of list) {
    if (!isObj(item)) continue;
    const kind = item.kind === 'image' ? 'image' : item.kind === 'tip' ? 'tip' : null;
    if (!kind) continue;
    const src = typeof item.src === 'string' ? item.src : undefined;
    const text = typeof item.text === 'string' ? item.text : undefined;
    if (kind === 'image' && !src) continue;
    if (kind === 'tip' && !text) continue;
    ads.push({
      kind, src, text,
      href: typeof item.href === 'string' ? item.href : undefined,
      ms: typeof item.ms === 'number' && item.ms > 0 ? item.ms : undefined,
    });
  }
  return ads.length > 0 ? { ads } : SLOT_DEFAULTS;
}

export interface SlotsHandle {
  /** 推一条战报（与顶部状态条同文案）；重复文案不重复入列 */
  update(callout: string | null): void;
  destroy(): void;
}

const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

/**
 * 挂两块内容位。右上按 `ms` 轮播，左下滚动战报；两层都不吃事件，只有带 `href` 的广告可点。
 */
export function mountSlots(root: HTMLElement, cfg: SlotConfig = SLOT_DEFAULTS): SlotsHandle {
  const layer = document.createElement('div');
  layer.id = 'mono-slots';
  layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:6';

  /* —— 右上：轮播位 —— */
  const ad = document.createElement('div');
  ad.style.cssText =
    `position:absolute;left:${BOARD_SLOT_AD_X}px;top:${BOARD_SLOT_AD_Y}px;` +
    `width:${BOARD_SLOT_AD_W}px;height:${BOARD_SLOT_AD_H}px;box-sizing:border-box;` +
    'border-radius:12px;overflow:hidden;border:1px solid rgba(245,196,81,.32);' +
    'background:rgba(6,10,8,.55);display:flex;align-items:center;justify-content:center;' +
    `color:#e8e4d8;font:600 11px/1.35 ${FONT};text-align:center;padding:0 8px`;
  const adImg = document.createElement('img');
  adImg.alt = '';
  adImg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;display:none';
  const adText = document.createElement('span');
  adText.style.cssText = 'position:relative;text-shadow:0 1px 2px rgba(0,0,0,.6)';
  ad.append(adImg, adText);

  /* —— 左下：事件战报 —— */
  const log = document.createElement('div');
  log.style.cssText =
    `position:absolute;left:${BOARD_SLOT_LOG_X}px;top:${BOARD_SLOT_LOG_Y}px;` +
    `width:${BOARD_SLOT_LOG_W}px;height:${BOARD_SLOT_LOG_H}px;box-sizing:border-box;` +
    'border-radius:10px;border:1px solid rgba(245,196,81,.18);background:rgba(6,10,8,.42);' +
    `padding:5px 7px;overflow:hidden;color:#9fb3a8;font:500 10px/1.45 ${FONT}`;
  const logTitle = document.createElement('div');
  logTitle.textContent = '战报';
  logTitle.style.cssText = 'color:#f5c451;font-weight:700;margin-bottom:1px';
  const logBody = document.createElement('div');
  log.append(logTitle, logBody);

  layer.append(ad, log);
  root.appendChild(layer);

  /* 轮播：单条时长 = 条目自带 ms → 全局 BOARD_SLOT_AD_MS */
  let idx = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const showAd = (): void => {
    const item = cfg.ads[idx % cfg.ads.length];
    if (item.kind === 'image' && item.src) {
      adImg.src = item.src;
      adImg.style.display = 'block';
      adText.textContent = item.text ?? '';
    } else {
      adImg.style.display = 'none';
      adImg.removeAttribute('src');
      adText.textContent = item.text ?? '';
    }
    if (item.href) {
      ad.style.pointerEvents = 'auto';
      ad.style.cursor = 'pointer';
      ad.onclick = () => { window.location.href = item.href as string; };
    } else {
      ad.style.pointerEvents = 'none';
      ad.style.cursor = 'default';
      ad.onclick = null;
    }
    const hold = item.ms ?? BOARD_SLOT_AD_MS;
    idx += 1;
    timer = setTimeout(showAd, hold);
  };
  if (cfg.ads.length > 0) showAd();

  /* 战报：最新在上，超出 KEEP 条自然滚出 */
  const lines: string[] = [];
  let last = '';
  const paintLog = (): void => {
    logBody.textContent = '';
    for (const line of lines) {
      const row = document.createElement('div');
      row.textContent = line;
      row.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      logBody.appendChild(row);
    }
  };

  return {
    update(callout: string | null): void {
      if (!callout || callout === last) return;
      last = callout;
      lines.unshift(callout);
      if (lines.length > BOARD_SLOT_LOG_KEEP) lines.length = BOARD_SLOT_LOG_KEEP;
      paintLog();
    },
    destroy(): void {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      layer.remove();
    },
  };
}
