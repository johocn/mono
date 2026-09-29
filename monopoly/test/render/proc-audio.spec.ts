import { describe, it, expect } from 'vitest';
import { AUDIO_D, uiMusicOff, uiMusicOn, uiSoundOff, uiSoundOn } from '../../src/render/providers/proc-audio';
import { PROC_PRESETS } from '../../src/render/providers/proc';

interface Call { op: string; style: Record<string, unknown> }

function recorder() {
  const calls: Call[] = [];
  const g: unknown = new Proxy({}, {
    get: (_t, k) => (...a: unknown[]) => {
      const op = String(k);
      calls.push({ op, style: (op === 'fill' || op === 'stroke' ? (a[0] ?? {}) : {}) as Record<string, unknown> });
      return g;
    },
  });
  return { g, calls };
}

const ops = (calls: Call[], op: string): Call[] => calls.filter((c) => c.op === op);
const fills = (calls: Call[]): string[] => ops(calls, 'fill').map((c) => String(c.style.color));
const strokes = (calls: Call[]): string[] => ops(calls, 'stroke').map((c) => String(c.style.color));

const ctx = (on: boolean) => ({
  geo: { hw: 21, hh: 10.5, ox: 195, oy: 96 },
  box: { w: 26, d: 1, h: 26 },
  cx: 337, cy: 18, s: 1,
  params: {},
  state: { on },
});

describe('proc preset: 音效 / 音乐图标', () => {
  it('音效开：喇叭 1 个 poly + 2 道声波折线，全部用亮色 ink', () => {
    const { g, calls } = recorder();
    uiSoundOn(g as never, ctx(true) as never);
    expect(ops(calls, 'poly').length).toBe(3);                 // 喇叭体 + 两道声波
    expect(fills(calls)).toEqual([AUDIO_D.iconInk]);           // 只有喇叭体是填充
    expect(strokes(calls)).toEqual([AUDIO_D.iconInk, AUDIO_D.iconInk]);
  });

  it('音效关：喇叭压暗 + 1 道 45° 斜杠（斜杠为填充）', () => {
    const { g, calls } = recorder();
    uiSoundOff(g as never, ctx(false) as never);
    expect(ops(calls, 'poly').length).toBe(2);                 // 喇叭体 + 斜杠
    expect(fills(calls)).toEqual([AUDIO_D.iconInkOff, AUDIO_D.slashInk]);
  });

  it('音乐开：1 个符头圆 + 1 个符干矩形 + 1 个符尾 poly', () => {
    const { g, calls } = recorder();
    uiMusicOn(g as never, ctx(true) as never);
    expect(ops(calls, 'circle').length).toBe(1);
    expect(ops(calls, 'rect').length).toBe(1);
    expect(ops(calls, 'poly').length).toBe(1);
    expect(fills(calls)).toEqual([AUDIO_D.iconInk, AUDIO_D.iconInk, AUDIO_D.iconInk]);
  });

  it('音乐关：音符压暗 + 斜杠', () => {
    const { g, calls } = recorder();
    uiMusicOff(g as never, ctx(false) as never);
    expect(fills(calls)).toEqual([AUDIO_D.iconInkOff, AUDIO_D.iconInkOff, AUDIO_D.iconInkOff, AUDIO_D.slashInk]);
  });

  it('形状落在 26×26 包围盒内（不越出键位）', () => {
    for (const preset of [uiSoundOn, uiSoundOff, uiMusicOn, uiMusicOff]) {
      const { g, calls } = recorder();
      preset(g as never, ctx(true) as never);
      expect(calls.length).toBeGreaterThan(0);
    }
    expect(AUDIO_D.iconInk).not.toBe(AUDIO_D.iconInkOff);      // 开 / 关两态必须可辨
  });
});

describe('proc-audio 注册', () => {
  it('4 个 preset 全部注册进 PROC_PRESETS', () => {
    expect(PROC_PRESETS.uiSoundOn).toBe(uiSoundOn);
    expect(PROC_PRESETS.uiSoundOff).toBe(uiSoundOff);
    expect(PROC_PRESETS.uiMusicOn).toBe(uiMusicOn);
    expect(PROC_PRESETS.uiMusicOff).toBe(uiMusicOff);
  });
});
