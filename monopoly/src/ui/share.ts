/**
 * M8 分享 / 裂变入口（`src/ui/**`，DOM/CSS 层——按 M1–M7 约定：可见像素在画布上才需走注册表 + skin.json，
 * 本层是纯 DOM UI，色值可用 CSS 字面量，不进 `src/render/**` 的「禁写死」gate）。
 *
 * 职责：
 *   1. 写 og:* / twitter:* / description meta（标题/描述/图参数化，图带 `?v=<SHARE_VERSION>` 破微信缓存）；
 *   2. 常驻「分享」CTA（落在 HUD 顶栏留白带左端，不压底坞 / 浮层 / 橱窗 / 棋盘 / `?debug=1` 右上角切换器）；
 *   3. 微信内 + 签名端点可达时接 `wx.config` + `updateAppMessageShareData` / `updateTimelineShareData`；
 *   4. 全链路静默降级：非微信 / 签名失败 / SDK 不可用 → 复制链接兜底，**零未捕获异常**。
 *
 * 「状态 → 文案/URL」的关键部分都是纯函数（`signatureUrl` / `shareImageUrl` / `resultCopy` /
 * `buildShareConfig` / `metaList`），脱离 DOM 与网络即可单测；`bindWechatShare` 依赖注入，便于测降级分支。
 */
import { netWorth, winnerOf, type GameState } from '../core/game';
import {
  SHARE_COPIED, SHARE_COPY_LINK, SHARE_COPY_RESULT, SHARE_CTA_LABEL, SHARE_FALLBACK_HINT,
  SHARE_IMAGE_H, SHARE_IMAGE_PATH, SHARE_IMAGE_W, SHARE_INVITE, SHARE_SHEET_TITLE,
  SHARE_SITE_NAME, SHARE_WECHAT_HINT, SSO_JSSDK_ENDPOINT, WECHAT_SDK_SRC, shareResultText,
} from '../data/share';

/** 分享文案（标题 + 描述）——与「图 / 链接 / 版本」一起构成一张分享卡 */
export interface ShareCopy { title: string; desc: string }

/** 一张分享卡的全部入参（纯数据，无 DOM） */
export interface ShareConfig { title: string; desc: string; image: string; link: string }

/** zhao-sso `POST /v1/auth/jssdk-signature` 的响应体 */
export interface Signature { appId: string; timestamp: string; nonceStr: string; signature: string }

export interface WxConfigOptions {
  debug: boolean; appId: string; timestamp: string; nonceStr: string; signature: string; jsApiList: string[];
}

/** 微信 JS-SDK 对象的最小子集（只声明本项目用到的部分，便于注入 fake） */
export interface WxLike {
  config(o: WxConfigOptions): void;
  ready(cb: () => void): void;
  error(cb: (e: unknown) => void): void;
  updateAppMessageShareData?(o: { title: string; desc: string; link: string; imgUrl: string }): void;
  updateTimelineShareData?(o: { title: string; link: string; imgUrl: string }): void;
}

/** 微信绑定结果：`bound` = 已绑卡；`fallback` = 微信内但签名/SDK 不可用；`skipped` = 非微信环境 */
export type ShareStatus = 'bound' | 'fallback' | 'skipped';

export interface WechatBinding {
  status: ShareStatus;
  /** 状态推进后重推分享卡（终局战绩等）；未绑定时空操作 */
  push(cfg: ShareConfig): void;
}

/** 常驻 CTA 台位（HUD 顶栏留白带；`BOARD_TOP=34` 之上，避开底坞 / 浮层 / 橱窗 / 右上角 debug 切换器） */
export const SHARE_CTA_BOX = { left: 8, top: 5, w: 78, h: 26 };

/* ————————————————— 纯函数（可单测） ————————————————— */

/**
 * 构造签名入参 URL：微信要求签名的是「当前页面 URL，且不含 `#` 及其后内容」。
 * 对 hash 路由 / 带 query 的页面同样成立——只砍 `#` 之后，query 原样保留。
 */
export function signatureUrl(href: string): string {
  return href.split('#')[0];
}

/** 分享缩略图绝对 URL：以页面地址为基准解析（dev / preview / 线上同源自适应）+ `?v=<version>` 破缓存。 */
export function shareImageUrl(pageHref: string, version: string): string {
  try {
    const u = new URL(SHARE_IMAGE_PATH, pageHref);
    u.searchParams.set('v', version);
    return u.href;
  } catch {
    return '';
  }
}

/** 是否微信内置浏览器 */
export function isWechatUA(ua: string): boolean {
  return /micromessenger/i.test(ua);
}

/** 终局战绩文案（本地玩家 = id 1「你」）；未终局 → null */
export function resultCopy(state: GameState | null | undefined, self = 1): ShareCopy | null {
  if (!state?.over) return null;
  const me = state.players.find((p) => p.id === self) ?? state.players[0];
  if (!me) return null;
  return shareResultText(winnerOf(state) === self, netWorth(state, me));
}

/** 组装分享卡（`over` 为 null → 用常驻邀请文案） */
export function buildShareConfig(pageHref: string, version: string, over: ShareCopy | null): ShareConfig {
  const copy = over ?? SHARE_INVITE;
  const link = signatureUrl(pageHref);
  return { title: copy.title, desc: copy.desc, image: shareImageUrl(pageHref, version), link };
}

export interface MetaTag { attr: 'property' | 'name'; key: string; content: string }

/** og / twitter / description meta 清单（纯数据；`og:image` 为绝对 URL + `?v=`） */
export function metaList(cfg: ShareConfig): MetaTag[] {
  return [
    { attr: 'property', key: 'og:type', content: 'website' },
    { attr: 'property', key: 'og:site_name', content: SHARE_SITE_NAME },
    { attr: 'property', key: 'og:title', content: cfg.title },
    { attr: 'property', key: 'og:description', content: cfg.desc },
    { attr: 'property', key: 'og:image', content: cfg.image },
    { attr: 'property', key: 'og:image:width', content: String(SHARE_IMAGE_W) },
    { attr: 'property', key: 'og:image:height', content: String(SHARE_IMAGE_H) },
    { attr: 'property', key: 'og:url', content: cfg.link },
    { attr: 'name', key: 'twitter:card', content: 'summary_large_image' },
    { attr: 'name', key: 'twitter:title', content: cfg.title },
    { attr: 'name', key: 'twitter:description', content: cfg.desc },
    { attr: 'name', key: 'twitter:image', content: cfg.image },
    { attr: 'name', key: 'description', content: cfg.desc },
  ];
}

/** 把 meta 清单 upsert 进 document.head（不抛错；head 缺失直接忽略） */
export function applyMeta(doc: Document, cfg: ShareConfig): void {
  const head = doc.head;
  if (!head) return;
  for (const t of metaList(cfg)) {
    let el = head.querySelector(`meta[${t.attr}="${t.key}"]`);
    if (!el) {
      el = doc.createElement('meta');
      el.setAttribute(t.attr, t.key);
      head.appendChild(el);
    }
    el.setAttribute('content', t.content);
  }
}

/* ————————————————— 微信 JS-SDK 绑定（依赖注入，便于测降级） ————————————————— */

export interface WechatDeps {
  isWechat: boolean;
  pageUrl: string;
  version: string;
  /** 终局战绩文案（null = 用常驻邀请文案） */
  over?: ShareCopy | null;
  fetchSignature: (url: string) => Promise<Signature | null>;
  loadSdk: () => Promise<WxLike | null>;
  /** 等 `wx.ready` 的上限（ms）；超时按 fallback 收口，避免 promise 悬挂 */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 4000;

function pushCard(wx: WxLike, cfg: ShareConfig): void {
  try {
    wx.updateAppMessageShareData?.({ title: cfg.title, desc: cfg.desc, link: cfg.link, imgUrl: cfg.image });
    wx.updateTimelineShareData?.({ title: cfg.title, link: cfg.link, imgUrl: cfg.image });
  } catch {
    /* 静默降级：老版本 SDK 缺这些 API 时不影响页面 */
  }
}

/**
 * 微信内绑卡：签名 → 加载 SDK → `wx.config` → `wx.ready` 推卡。
 * 任一环节失败（非微信 / 无签名 / SDK 不可用 / config 抛错 / ready 超时）都返回 `fallback`，绝不抛错。
 */
export async function bindWechatShare(deps: WechatDeps): Promise<WechatBinding> {
  let cfg = buildShareConfig(deps.pageUrl, deps.version, deps.over ?? null);
  if (!deps.isWechat) return { status: 'skipped', push: () => {} };

  let wx: WxLike | null = null;
  const push: (c: ShareConfig) => void = (c) => {
    cfg = c;
    if (wx) pushCard(wx, c);
  };

  try {
    const sig = await deps.fetchSignature(signatureUrl(deps.pageUrl));
    if (!sig?.signature || !sig.appId) return { status: 'fallback', push };
    wx = await deps.loadSdk();
    if (!wx || typeof wx.config !== 'function') return { status: 'fallback', push: () => {} };

    const status = await new Promise<ShareStatus>((resolve) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (v: ShareStatus): void => {
        if (done) return;
        done = true;
        if (timer !== null) clearTimeout(timer);
        resolve(v);
      };
      if (deps.timeoutMs !== 0) timer = setTimeout(() => finish('fallback'), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      wx!.ready(() => { pushCard(wx!, cfg); finish('bound'); });
      wx!.error(() => finish('fallback'));
      try {
        wx!.config({
          debug: false,
          appId: sig.appId,
          timestamp: sig.timestamp,
          nonceStr: sig.nonceStr,
          signature: sig.signature,
          jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData'],
        });
      } catch {
        finish('fallback');
      }
    });
    return { status, push: status === 'bound' ? push : () => {} };
  } catch {
    return { status: 'fallback', push: () => {} };
  }
}

/* ————————————————— 运行时装配（真实 fetch / script / navigator） ————————————————— */

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('load wechat sdk fail'));
    document.head.appendChild(s);
  });
}

async function loadWxSdk(): Promise<WxLike | null> {
  const w = window as unknown as { wx?: WxLike };
  if (w.wx && typeof w.wx.config === 'function') return w.wx;
  try {
    await loadScript(WECHAT_SDK_SRC);
  } catch {
    return null;
  }
  return w.wx && typeof w.wx.config === 'function' ? w.wx : null;
}

/** 向 zhao-sso 取签名；网络/非 2xx/JSON 异常一律返回 null（由调用方走降级） */
async function fetchSignature(url: string): Promise<Signature | null> {
  try {
    const res = await fetch(SSO_JSSDK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, appType: 'official_account' }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<Signature>;
    return data?.signature && data.appId ? (data as Signature) : null;
  } catch {
    return null;
  }
}

export interface InitShareOptions {
  pageHref: string;
  version: string;
  /** 覆盖微信环境判定（默认读 navigator.userAgent） */
  isWechat?: boolean;
  getOver?: () => ShareCopy | null;
}

/** 真实环境装配：判定微信 → 绑卡。永不 reject（内部全兜底）。 */
export async function initWechatShare(opts: InitShareOptions): Promise<WechatBinding> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return bindWechatShare({
    isWechat: opts.isWechat ?? isWechatUA(ua),
    pageUrl: opts.pageHref,
    version: opts.version,
    over: opts.getOver?.() ?? null,
    fetchSignature,
    loadSdk: loadWxSdk,
  });
}

/* ————————————————— DOM：常驻 CTA + 分享浮层 ————————————————— */

export interface ShareHandle {
  /** 状态推进后调用：刷新浮层内的战绩文案并按需重推分享卡 */
  update(): void;
  /** 微信绑卡结果到位后注入（用于后续 push 战绩卡） */
  setWechat(binding: WechatBinding): void;
  destroy(): void;
}

const Z_CONTAINER = 11;
const Z_SHEET = 12;

function copyToClipboard(text: string): void {
  try {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      return;
    }
  } catch {
    /* 落下面的兜底 */
  }
  fallbackCopy(text);
}

function fallbackCopy(text: string): void {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  } catch {
    /* 复制不可用时不抛错 */
  }
}

/**
 * 挂「分享」CTA + 浮层。
 * `getOver` 返回终局战绩文案（null = 未终局，浮层只展示邀请文案）。
 */
export function mountShare(root: HTMLElement, getOver: () => ShareCopy | null, version: string): ShareHandle {
  let over = getOver();

  const layer = document.createElement('div');
  layer.id = 'mono-share';
  layer.style.cssText =
    'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;' +
    `z-index:${Z_CONTAINER};font:13px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`;
  root.appendChild(layer);

  const cta = document.createElement('button');
  cta.dataset.action = 'share';
  cta.type = 'button';
  cta.textContent = SHARE_CTA_LABEL;
  cta.style.cssText =
    `position:absolute;left:${SHARE_CTA_BOX.left}px;top:${SHARE_CTA_BOX.top}px;` +
    `width:${SHARE_CTA_BOX.w}px;height:${SHARE_CTA_BOX.h}px;pointer-events:auto;cursor:pointer;` +
    'border:1px solid #f5c451;border-radius:13px;background:rgba(6,10,8,.72);color:#f5c451;' +
    'font:12px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
  layer.appendChild(cta);

  const sheet = document.createElement('div');
  sheet.id = 'mono-share-sheet';
  sheet.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;top:0;display:none;pointer-events:auto;' +
    `z-index:${Z_SHEET};background:rgba(4,8,6,.55);align-items:flex-end;justify-content:center`;
  layer.appendChild(sheet);

  const card = document.createElement('div');
  card.style.cssText =
    'width:100%;max-width:420px;margin:0 auto;background:#0f1a16;border-top-left-radius:16px;' +
    'border-top-right-radius:16px;padding:18px 18px 26px;color:#d8e4dc;box-shadow:0 -8px 24px rgba(0,0,0,.5)';
  sheet.appendChild(card);

  const closeSheet = (): void => { sheet.style.display = 'none'; };

  const copyBtn = (label: string, kind: 'link' | 'result'): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.action = `share:${kind}`;
    b.textContent = label;
    b.style.cssText =
      'flex:1;padding:10px 12px;border-radius:10px;cursor:pointer;border:0;' +
      'font:13px/1.2 inherit;background:#f5c451;color:#1b1b1b;font-weight:600';
    return b;
  };

  let pushTimer: ReturnType<typeof setTimeout> | null = null;

  const linkText = (): string => {
    const base = `${SHARE_INVITE.title}\n${SHARE_INVITE.desc}\n${signatureUrl(location.href)}`;
    return over ? `${over.title}\n${over.desc}\n${signatureUrl(location.href)}` : base;
  };

  const render = (): void => {
    card.textContent = '';

    const title = document.createElement('div');
    title.textContent = SHARE_SHEET_TITLE;
    title.style.cssText = 'font-size:15px;font-weight:700;color:#f5c451;margin-bottom:10px';
    card.appendChild(title);

    const previewTitle = document.createElement('div');
    const previewDesc = document.createElement('div');
    const shown = over ?? SHARE_INVITE;
    previewTitle.textContent = shown.title;
    previewDesc.textContent = shown.desc;
    previewTitle.style.cssText = 'font-size:13px;font-weight:600;margin-bottom:4px';
    previewDesc.style.cssText = 'font-size:12px;color:#9fb3a9;margin-bottom:12px';
    card.appendChild(previewTitle);
    card.appendChild(previewDesc);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px';
    const copyLink = copyBtn(SHARE_COPY_LINK, 'link');
    copyLink.onclick = () => {
      copyToClipboard(linkText());
      copyLink.textContent = SHARE_COPIED;
      if (pushTimer !== null) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => { copyLink.textContent = SHARE_COPY_LINK; }, 1600);
    };
    row.appendChild(copyLink);

    if (over) {
      const copyResult = copyBtn(SHARE_COPY_RESULT, 'result');
      copyResult.onclick = () => {
        copyToClipboard(`${over!.title}\n${over!.desc}\n${signatureUrl(location.href)}`);
        copyResult.textContent = SHARE_COPIED;
        if (pushTimer !== null) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => { copyResult.textContent = SHARE_COPY_RESULT; }, 1600);
      };
      row.appendChild(copyResult);
    }
    card.appendChild(row);

    const hint = document.createElement('div');
    hint.textContent = wechatStatus === 'bound' ? SHARE_WECHAT_HINT : SHARE_FALLBACK_HINT;
    hint.style.cssText = 'margin-top:12px;font-size:11px;line-height:1.6;color:#7f938a';
    card.appendChild(hint);

    const close = document.createElement('button');
    close.type = 'button';
    close.dataset.action = 'share:close';
    close.textContent = '关闭';
    close.style.cssText =
      'margin-top:12px;width:100%;padding:8px;border-radius:10px;cursor:pointer;' +
      'border:1px solid #2b3b34;background:transparent;color:#9fb3a9;font:12px/1 inherit';
    close.onclick = closeSheet;
    card.appendChild(close);
  };

  cta.onclick = () => {
    over = getOver();
    render();
    sheet.style.display = sheet.style.display === 'flex' ? 'none' : 'flex';
  };
  sheet.onclick = (e): void => { if (e.target === sheet) closeSheet(); };

  let wechatStatus: ShareStatus = 'skipped';
  let binding: WechatBinding | null = null;
  let lastPushKey = '';

  const pushIfChanged = (): void => {
    if (!binding || binding.status !== 'bound') return;
    const cfg = buildShareConfig(location.href, version, over);
    const key = `${cfg.title}|${cfg.desc}|${cfg.link}|${cfg.image}`;
    if (key === lastPushKey) return;
    lastPushKey = key;
    binding.push(cfg);
  };

  return {
    update() {
      const next = getOver();
      if (next?.title !== over?.title) {
        over = next;
        if (sheet.style.display === 'flex') render();
        pushIfChanged();
      }
    },
    setWechat(b) {
      binding = b;
      wechatStatus = b.status;
      if (sheet.style.display === 'flex') render();
      pushIfChanged();
    },
    destroy() { layer.remove(); },
  };
}
