/**
 * 广告宣传版（M21）· 商城 DOM 层（方案 A 橱窗商城）
 *
 * 纯 DOM 覆盖层（与 ui/setup.ts 同规），挂在 `#mono-ui`（随 fitUi 缩放）：
 *   hero 轮播（96）+ 商圈 Tab（22）+ 双列商品卡网格（可滚）+ 落格联动高亮 + 弹券底部抽屉。
 * 配色只消费 `var(--ad-*)`（tokens.ts 注入）；布局数值只取 `adLayout.ts` 常量。
 * 数据源：`shops.json` 商家素材（已认领）→ 占位商品卡（`plan.demo`，未认领时）。
 * 方案切换 = 换 `AdPlanConfig` 重建本层（`destroy()` 清 DOM + 定时器，无残留）。
 */
import { currentPlayer, type GameState } from '../core/game';
import { TIER_NAME, tierOf, type TileTier } from '../data/board';
import type { ShopConfig, ShopEntry } from '../skin/shop-config';
import { AD_HERO_H, AD_TAB_H, AD_ZONE_H } from './adLayout';
import type { AdPlanConfig, AdTone } from './types';

export interface MallDeps {
  /** 商家图片相对皮肤包目录（`./skins/<skinId>/<src>`） */
  skinId: string;
  gameOf: () => { state: GameState } | null;
  /** 后台 / e2e 的方案切换出口（persist + reload） */
  onSwitch?: (id: string) => void;
}

export interface MallHandle {
  /** 唯一联动口（paint() 调）：落格结算 → 高亮商品卡 + 滚动到位 + 弹券 */
  update(): void;
  /** 浮层展开时整层让位（对齐 `#mono-slots` 的隐藏语义） */
  setHidden(v: boolean): void;
  destroy(): void;
}

/* —— 落格联动（纯函数，便于单测）：结算态才触发；key 防同格重复弹 —— */
export interface LandingPick { key: string; slot: number; entry: ShopEntry | null }
export function pickLanding(
  state: GameState, entryBySlot: ReadonlyMap<number, ShopEntry>,
): LandingPick | null {
  if (state.over || state.phase !== 'settled') return null;
  const p = currentPlayer(state);
  return { key: `${p.id}:${p.pos}:${state.round}`, slot: p.pos, entry: entryBySlot.get(p.pos) ?? null };
}

const COUPON_KEY = 'mono.adCoupons';
let styleDone = false;

function toneBg(tone: AdTone | undefined): string {
  switch (tone) {
    case 'brick': return 'var(--ad-brick)';
    case 'tan': return 'var(--ad-tan)';
    case 'plain': return 'var(--ad-bg-deep)';
    default: return 'var(--ad-gold)';
  }
}

function ensureStyle(): void {
  if (styleDone || typeof document === 'undefined') return;
  styleDone = true;
  const st = document.createElement('style');
  st.id = 'mono-ad-style';
  st.textContent = `
#mono-ad { position:absolute; left:0; top:0; width:100%; height:${AD_ZONE_H}px; z-index:6;
  display:flex; flex-direction:column; background:var(--ad-bg); overflow:hidden;
  pointer-events:auto; font-family:inherit; color:var(--ad-text); }
#mono-ad .moad-hero { flex:0 0 ${AD_HERO_H}px; display:flex; overflow-x:auto; scroll-snap-type:x mandatory;
  scrollbar-width:none; }
#mono-ad .moad-hero::-webkit-scrollbar { display:none; }
#mono-ad .moad-hero-item { flex:0 0 100%; scroll-snap-align:start; box-sizing:border-box;
  padding:14px 16px; display:flex; flex-direction:column; justify-content:center; gap:3px;
  background:linear-gradient(120deg, var(--ad-hero-a), var(--ad-hero-b)); color:var(--ad-on-gold); }
#mono-ad .moad-hero-item.t-brick { background:linear-gradient(120deg, var(--ad-hero-b), var(--ad-accent)); color:var(--ad-on-accent); }
#mono-ad .moad-hero-item.t-tan { background:linear-gradient(120deg, var(--ad-tan), var(--ad-brown)); color:var(--ad-card); }
#mono-ad .moad-hero-item.t-plain { background:linear-gradient(120deg, var(--ad-bg-deep), var(--ad-card-edge)); color:var(--ad-text); }
#mono-ad .moad-hero-title { font-size:17px; font-weight:700; }
#mono-ad .moad-hero-sub { font-size:11px; opacity:.85; }
#mono-ad .moad-tabs { flex:0 0 ${AD_TAB_H + 8}px; display:flex; align-items:center; gap:6px;
  padding:4px 8px; background:var(--ad-bg-deep); border-bottom:1px solid var(--ad-card-edge); }
#mono-ad .moad-tab { border:1px solid var(--ad-card-edge); background:var(--ad-card); color:var(--ad-text-dim);
  font:11px/1 inherit; padding:3px 9px; border-radius:9px; cursor:pointer; }
#mono-ad .moad-tab.on { background:var(--ad-gold); border-color:var(--ad-gold); color:var(--ad-on-gold); font-weight:700; }
#mono-ad .moad-grid { flex:1 1 auto; overflow-y:auto; contain:paint; padding:8px; display:grid;
  grid-template-columns:1fr 1fr; grid-auto-rows:max-content; gap:8px; align-content:start; background:var(--ad-bg); }
#mono-ad .moad-card { position:relative; border:1px solid var(--ad-card-edge); border-radius:10px;
  overflow:hidden; background:var(--ad-card); box-shadow:0 1px 3px var(--ad-shadow); cursor:pointer;
  transition:transform .12s ease, box-shadow .12s ease; }
#mono-ad .moad-card.is-hot { border-color:var(--ad-gold); box-shadow:0 0 0 2px var(--ad-gold), 0 2px 6px var(--ad-shadow); }
#mono-ad .moad-thumb { height:64px; display:flex; align-items:center; justify-content:center;
  font-size:22px; font-weight:700; color:var(--ad-on-gold); background:var(--ad-bg-deep); overflow:hidden; }
#mono-ad .moad-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
#mono-ad .moad-card .moad-name { font-size:12px; font-weight:700; padding:5px 7px 1px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#mono-ad .moad-card .moad-sub { font-size:10px; color:var(--ad-text-dim); padding:0 7px 6px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#mono-ad .moad-tag { position:absolute; right:5px; top:5px; font-size:9px; padding:1px 5px;
  border-radius:7px; background:var(--ad-accent); color:var(--ad-on-accent); }
#mono-ad .moad-tag.done { background:var(--ad-tan); }
#mono-ad .moad-coupon { position:absolute; left:8px; right:8px; bottom:8px; z-index:2;
  border-radius:12px; border:1px solid var(--ad-card-edge); background:var(--ad-card);
  box-shadow:0 4px 14px var(--ad-shadow); padding:10px 12px; display:none; align-items:center; gap:8px; }
#mono-ad .moad-coupon.show { display:flex; }
#mono-ad .moad-coupon .moad-coupon-main { flex:1; min-width:0; }
#mono-ad .moad-coupon .moad-coupon-title { font-size:13px; font-weight:700; color:var(--ad-accent); }
#mono-ad .moad-coupon .moad-coupon-sub { font-size:10px; color:var(--ad-text-dim); margin-top:2px; }
#mono-ad .moad-coupon button { border:none; border-radius:9px; padding:7px 13px; font:12px/1 inherit;
  cursor:pointer; background:var(--ad-accent); color:var(--ad-on-accent); font-weight:700; }
#mono-ad .moad-coupon button.ghost { background:var(--ad-bg-deep); color:var(--ad-text-dim); font-weight:400; }
#mono-ad .moad-empty { grid-column:1 / -1; text-align:center; font-size:11px; color:var(--ad-text-dim); padding:18px 0; }
`;
  document.head.appendChild(st);
}

function claimedIds(): string[] {
  try {
    const raw = localStorage.getItem(COUPON_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : [];
  } catch { return []; }
}

function claimId(id: string): void {
  const list = claimedIds();
  if (!list.includes(id)) list.push(id);
  try { localStorage.setItem(COUPON_KEY, JSON.stringify(list)); } catch { /* 忽略 */ }
}

export function mountMall(
  root: HTMLElement, plan: AdPlanConfig, shops: ShopConfig, deps: MallDeps,
): MallHandle {
  ensureStyle();

  const entryBySlot = new Map<number, ShopEntry>();
  for (const e of shops.entries) entryBySlot.set(e.slot, e);
  const hasMerchants = shops.entries.length > 0;

  const sec = document.createElement('section');
  sec.id = 'mono-ad';
  root.appendChild(sec);

  /* —— hero 轮播 —— */
  const hero = document.createElement('div');
  hero.className = 'moad-hero';
  for (const h of plan.hero) {
    const it = document.createElement('div');
    it.className = `moad-hero-item${h.tone && h.tone !== 'gold' ? ` t-${h.tone}` : ''}`;
    if (h.img) {
      const img = document.createElement('img');
      img.src = h.img;
      img.alt = h.title;
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
      it.style.position = 'relative';
      it.appendChild(img);
    }
    const t = document.createElement('div');
    t.className = 'moad-hero-title';
    t.textContent = h.title;
    const s = document.createElement('div');
    s.className = 'moad-hero-sub';
    s.textContent = h.sub ?? '';
    it.append(t, s);
    hero.appendChild(it);
  }
  sec.appendChild(hero);

  /* —— 商圈 Tab —— */
  const tabs = document.createElement('nav');
  tabs.className = 'moad-tabs';
  sec.appendChild(tabs);

  /* —— 商品卡网格 —— */
  const grid = document.createElement('div');
  grid.className = 'moad-grid';
  sec.appendChild(grid);

  /* —— 弹券抽屉 —— */
  const coupon = document.createElement('div');
  coupon.className = 'moad-coupon';
  const couponMain = document.createElement('div');
  couponMain.className = 'moad-coupon-main';
  const couponTitle = document.createElement('div');
  couponTitle.className = 'moad-coupon-title';
  const couponSub = document.createElement('div');
  couponSub.className = 'moad-coupon-sub';
  couponMain.append(couponTitle, couponSub);
  const btnClaim = document.createElement('button');
  btnClaim.type = 'button';
  btnClaim.textContent = '领取';
  const btnClose = document.createElement('button');
  btnClose.type = 'button';
  btnClose.className = 'ghost';
  btnClose.textContent = '关闭';
  coupon.append(couponMain, btnClaim, btnClose);
  sec.appendChild(coupon);

  let activeTab = plan.tabs[0]?.id ?? 'all';
  let hotSlot: number | null = null;
  let couponEntry: ShopEntry | null = null;
  let heroTimer: ReturnType<typeof setInterval> | null = null;

  const tierOfEntry = (e: ShopEntry): TileTier | null => tierOf(e.slot);
  const visible = (tier: TileTier | null): boolean => {
    const tab = plan.tabs.find((t) => t.id === activeTab);
    if (!tab || tab.tier === null) return true;
    return tier === tab.tier;
  };

  const thumbEl = (src: string | undefined, ch: string, tone: AdTone | undefined): HTMLElement => {
    const th = document.createElement('div');
    th.className = 'moad-thumb';
    if (src) {
      const img = document.createElement('img');
      img.src = `./skins/${deps.skinId}/${src}`;
      img.alt = ch;
      img.onerror = () => { img.remove(); th.style.background = toneBg(tone); th.textContent = ch; };
      th.appendChild(img);
    } else {
      th.style.background = toneBg(tone);
      th.textContent = ch;
    }
    return th;
  };

  const renderTabs = (): void => {
    tabs.textContent = '';
    for (const t of plan.tabs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `moad-tab${t.id === activeTab ? ' on' : ''}`;
      b.textContent = t.label;
      b.onclick = () => { activeTab = t.id; renderTabs(); renderGrid(); };
      tabs.appendChild(b);
    }
  };

  const renderGrid = (): void => {
    grid.textContent = '';
    if (hasMerchants) {
      for (const e of shops.entries) {
        const tier = tierOfEntry(e);
        if (!visible(tier)) continue;
        const card = document.createElement('article');
        card.className = 'moad-card';
        card.dataset.slot = String(e.slot);
        const name = shops.brandAt(e.slot);
        card.appendChild(thumbEl(e.sign?.src ?? e.building?.src ?? undefined, name.slice(0, 1), 'gold'));
        const nm = document.createElement('div');
        nm.className = 'moad-name';
        nm.textContent = name;
        const sub = document.createElement('div');
        sub.className = 'moad-sub';
        sub.textContent = (tier ? TIER_NAME[tier] : '街坊好店') + (e.merchantName ? ` · ${e.merchantName}` : '');
        card.append(nm, sub);
        if (e.couponTemplateId) {
          const tag = document.createElement('span');
          tag.className = `moad-tag${claimedIds().includes(e.couponTemplateId) ? ' done' : ''}`;
          tag.textContent = claimedIds().includes(e.couponTemplateId) ? '已领' : '领券';
          card.appendChild(tag);
        }
        if (e.slot === hotSlot) card.classList.add('is-hot');
        grid.appendChild(card);
      }
    } else {
      for (const d of plan.demo) {
        if (!visible(tierOf(d.slot))) continue;   // 商圈 Tab 过滤对占位卡同样生效
        const card = document.createElement('article');
        card.className = 'moad-card';
        card.dataset.slot = String(d.slot);
        card.appendChild(thumbEl(undefined, d.title.slice(0, 1), d.tone));
        const nm = document.createElement('div');
        nm.className = 'moad-name';
        nm.textContent = d.title;
        const sub = document.createElement('div');
        sub.className = 'moad-sub';
        sub.textContent = [d.sub, d.tag].filter(Boolean).join(' · ');
        card.append(nm, sub);
        if (d.slot === hotSlot) card.classList.add('is-hot');
        grid.appendChild(card);
      }
    }
    if (!grid.children.length) {
      const empty = document.createElement('div');
      empty.className = 'moad-empty';
      empty.textContent = '该商圈暂无商家入驻';
      grid.appendChild(empty);
    }
  };

  const showCoupon = (e: ShopEntry): void => {
    couponEntry = e;
    couponTitle.textContent = `${shops.brandAt(e.slot)} · 商家券`;
    couponSub.textContent = `落格福利${e.validDays ? ` · 领取后 ${e.validDays} 天内到店有效` : ''}（券号 ${e.couponTemplateId ?? '-'}）`;
    coupon.classList.add('show');
  };
  const hideCoupon = (): void => { coupon.classList.remove('show'); couponEntry = null; };
  btnClaim.onclick = () => {
    if (couponEntry?.couponTemplateId) claimId(couponEntry.couponTemplateId);
    hideCoupon();
    renderGrid();
  };
  btnClose.onclick = hideCoupon;

  const highlight = (slot: number): void => {
    hotSlot = slot;
    for (const el of Array.from(grid.querySelectorAll('.moad-card.is-hot'))) el.classList.remove('is-hot');
    const card = grid.querySelector(`.moad-card[data-slot="${slot}"]`);
    if (card) {
      card.classList.add('is-hot');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  let lastKey = '';
  const update = (): void => {
    const g = deps.gameOf();
    if (!g) return;
    const pick = pickLanding(g.state, entryBySlot);
    if (!pick || pick.key === lastKey) return;
    lastKey = pick.key;
    if (pick.entry) {
      highlight(pick.slot);
      if (pick.entry.couponTemplateId && !claimedIds().includes(pick.entry.couponTemplateId)) {
        showCoupon(pick.entry);
      }
    }
  };

  renderTabs();
  renderGrid();

  /* hero 自动轮播（>1 条才开；destroy 清定时器，杜绝残留） */
  if (plan.hero.length > 1) {
    heroTimer = setInterval(() => {
      const max = hero.scrollWidth - hero.clientWidth;
      if (max <= 0) return;
      const next = hero.scrollLeft >= hero.clientWidth * (plan.hero.length - 1) ? 0 : hero.scrollLeft + hero.clientWidth;
      hero.scrollTo({ left: Math.min(next, max), behavior: 'smooth' });
    }, 4000);
  }

  return {
    update,
    setHidden: (v) => { sec.style.display = v ? 'none' : 'flex'; },
    destroy: () => {
      if (heroTimer !== null) { clearInterval(heroTimer); heroTimer = null; }
      sec.remove();
    },
  };
}
