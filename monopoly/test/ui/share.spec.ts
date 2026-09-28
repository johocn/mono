import { describe, expect, it, vi } from 'vitest';
import {
  bindWechatShare, buildShareConfig, isWechatUA, metaList, resultCopy, shareImageUrl, signatureUrl,
  type ShareConfig, type Signature, type WxLike,
} from '../../src/ui/share';
import { SHARE_IMAGE_H, SHARE_IMAGE_W, SHARE_INVITE } from '../../src/data/share';
import { autoPlay, createGame } from '../../src/core/game';

const PAGE = 'https://game.joho.cn/tour/mono.html?play=1';
const SIG: Signature = { appId: 'wx-test', timestamp: '1', nonceStr: 'n', signature: 'abc' };

/** 可控的 wx fake：ready/error/config 行为可注入（ready 只在 config 成功后触发，贴近真实 SDK） */
function fakeWx(opts: { neverReady?: boolean; error?: boolean; throwOnConfig?: boolean } = {}): {
  wx: WxLike; app: Array<Record<string, unknown>>; timeline: Array<Record<string, unknown>>;
} {
  const app: Array<Record<string, unknown>> = [];
  const timeline: Array<Record<string, unknown>> = [];
  const readies: Array<() => void> = [];
  const errors: Array<(e: unknown) => void> = [];
  const wx: WxLike = {
    config: () => {
      if (opts.throwOnConfig) throw new Error('config boom');
      if (opts.error) { for (const cb of errors) cb(new Error('sig fail')); return; }
      if (!opts.neverReady) for (const cb of readies) cb();
    },
    ready: (cb) => { readies.push(cb); },
    error: (cb) => { errors.push(cb); },
    updateAppMessageShareData: (o) => { app.push(o as unknown as Record<string, unknown>); },
    updateTimelineShareData: (o) => { timeline.push(o as unknown as Record<string, unknown>); },
  };
  return { wx, app, timeline };
}

describe('M8 share · signatureUrl（微信签名入参）', () => {
  it('砍掉 # 之后（hash 路由 / 锚点）', () => {
    expect(signatureUrl('https://game.joho.cn/tour/mono.html?play=1#/x/y')).toBe(PAGE);
    expect(signatureUrl('https://game.joho.cn/tour/mono.html#top')).toBe('https://game.joho.cn/tour/mono.html');
  });

  it('保留 query（不带 # 的页面原样返回）', () => {
    expect(signatureUrl(PAGE)).toBe(PAGE);
    expect(signatureUrl('https://game.joho.cn/tour/mono.html?a=1&b=2')).toBe('https://game.joho.cn/tour/mono.html?a=1&b=2');
  });

  it('多个 # 只砍第一个之后', () => {
    expect(signatureUrl('https://x/y#a#b')).toBe('https://x/y');
  });
});

describe('M8 share · shareImageUrl（绝对 URL + 版本破缓存）', () => {
  it('以页面地址为基准解析出绝对 URL，并带 ?v=', () => {
    const u = shareImageUrl(PAGE, 'v1');
    expect(u).toBe('https://game.joho.cn/tour/share/share-card.png?v=v1');
  });

  it('dev / preview 同源自适应', () => {
    expect(shareImageUrl('http://127.0.0.1:52300/mono.html', 'v2'))
      .toBe('http://127.0.0.1:52300/share/share-card.png?v=v2');
  });

  it('非法页面地址 → 空串（不抛错）', () => {
    expect(shareImageUrl('', 'v1')).toBe('');
  });
});

describe('M8 share · 微信环境判定', () => {
  it('MicroMessenger 大小写不敏感', () => {
    expect(isWechatUA('Mozilla/5.0 ... MicroMessenger/8.0')).toBe(true);
    expect(isWechatUA('Mozilla/5.0 (iPhone) Safari')).toBe(false);
  });
});

describe('M8 share · 分享卡组装与 meta', () => {
  it('未终局 → 邀请文案；图带 ?v、link 无 #', () => {
    const cfg = buildShareConfig(PAGE, 'v1', null);
    expect(cfg.title).toBe(SHARE_INVITE.title);
    expect(cfg.image).toBe('https://game.joho.cn/tour/share/share-card.png?v=v1');
    expect(cfg.link).toBe(PAGE);
  });

  it('meta 覆盖 og:* / twitter:* 且 og:image = 分享图', () => {
    const cfg: ShareConfig = { title: 'T', desc: 'D', image: 'https://x/i.png?v=9', link: 'https://x/p' };
    const list = metaList(cfg);
    const get = (k: string): string | undefined => list.find((m) => m.key === k)?.content;
    expect(get('og:title')).toBe('T');
    expect(get('og:description')).toBe('D');
    expect(get('og:image')).toBe('https://x/i.png?v=9');
    expect(get('og:url')).toBe('https://x/p');
    expect(get('og:image:width')).toBe(String(SHARE_IMAGE_W));
    expect(get('og:image:height')).toBe(String(SHARE_IMAGE_H));
    expect(get('twitter:card')).toBe('summary_large_image');
    expect(get('twitter:image')).toBe('https://x/i.png?v=9');
  });
});

describe('M8 share · 终局战绩文案', () => {
  it('未终局 → null', () => {
    const g = createGame({ seed: 1 });
    expect(resultCopy(g.state)).toBeNull();
  });

  it('终局 → 含「净资产 ￥」且区分胜负口吻', () => {
    const g = createGame({ seed: 20260928 });
    autoPlay(g);
    const copy = resultCopy(g.state);
    expect(copy).not.toBeNull();
    expect(copy!.title).toContain('净资产 ￥');
    expect(copy!.title).toMatch(/赢麻了|被街坊/);
    expect(copy!.desc.length).toBeGreaterThan(0);
  });
});

describe('M8 share · bindWechatShare 降级分支', () => {
  it('非微信 → skipped，且不去请求签名', async () => {
    const fetchSignature = vi.fn(async () => SIG);
    const b = await bindWechatShare({
      isWechat: false, pageUrl: PAGE, version: 'v1',
      fetchSignature, loadSdk: async () => fakeWx().wx,
    });
    expect(b.status).toBe('skipped');
    expect(fetchSignature).not.toHaveBeenCalled();
    expect(() => b.push(buildShareConfig(PAGE, 'v1', null))).not.toThrow();
  });

  it('签名返回 null → fallback', async () => {
    const b = await bindWechatShare({
      isWechat: true, pageUrl: PAGE, version: 'v1',
      fetchSignature: async () => null, loadSdk: async () => fakeWx().wx,
    });
    expect(b.status).toBe('fallback');
  });

  it('签名请求抛错 → fallback（不冒泡）', async () => {
    const b = await bindWechatShare({
      isWechat: true, pageUrl: PAGE, version: 'v1',
      fetchSignature: async () => { throw new Error('network'); }, loadSdk: async () => fakeWx().wx,
    });
    expect(b.status).toBe('fallback');
  });

  it('SDK 加载失败（null / 无 config）→ fallback', async () => {
    const a = await bindWechatShare({
      isWechat: true, pageUrl: PAGE, version: 'v1',
      fetchSignature: async () => SIG, loadSdk: async () => null,
    });
    expect(a.status).toBe('fallback');
    const b = await bindWechatShare({
      isWechat: true, pageUrl: PAGE, version: 'v1',
      fetchSignature: async () => SIG,
      loadSdk: async () => ({ ready: () => {}, error: () => {} } as unknown as WxLike),
    });
    expect(b.status).toBe('fallback');
  });

  it('wx.config 抛错 → fallback', async () => {
    const { wx } = fakeWx({ throwOnConfig: true });
    const b = await bindWechatShare({
      isWechat: true, pageUrl: PAGE, version: 'v1',
      fetchSignature: async () => SIG, loadSdk: async () => wx,
    });
    expect(b.status).toBe('fallback');
  });

  it('wx.error → fallback', async () => {
    const { wx } = fakeWx({ error: true });
    const b = await bindWechatShare({
      isWechat: true, pageUrl: PAGE, version: 'v1',
      fetchSignature: async () => SIG, loadSdk: async () => wx,
    });
    expect(b.status).toBe('fallback');
  });

  it('ready 迟迟不来 → 超时 fallback（promise 不悬挂）', async () => {
    const { wx } = fakeWx({ neverReady: true });
    const b = await bindWechatShare({
      isWechat: true, pageUrl: PAGE, version: 'v1',
      fetchSignature: async () => SIG, loadSdk: async () => wx, timeoutMs: 20,
    });
    expect(b.status).toBe('fallback');
  });

  it('happy path → bound，推卡含 ?v= 与去 # 的 link；push 可重推', async () => {
    const { wx, app, timeline } = fakeWx();
    const b = await bindWechatShare({
      isWechat: true, pageUrl: `${PAGE}#/anchor`, version: 'v9',
      fetchSignature: async () => SIG, loadSdk: async () => wx,
    });
    expect(b.status).toBe('bound');
    expect(app).toHaveLength(1);
    expect(app[0].imgUrl).toBe('https://game.joho.cn/tour/share/share-card.png?v=v9');
    expect(app[0].link).toBe(PAGE);
    expect(app[0].title).toBe(SHARE_INVITE.title);
    expect(timeline[0].link).toBe(PAGE);

    b.push({ title: '战绩', desc: 'D', image: 'https://x/i.png?v=v9', link: PAGE });
    expect(app).toHaveLength(2);
    expect(app[1].title).toBe('战绩');
  });
});
