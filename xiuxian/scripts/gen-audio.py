# -*- coding: utf-8 -*-
"""生成游戏音频资产（自生成 CC0，无版权问题；后续可替换为 Freesound/OpenGameArt 的 CC0 素材）。
输出到 public/audio/：
  - sfx_<name>.wav  27 个音效（打击/施法/UI/受击/升级…）
  - bgm_<theme>.wav 4 个国风五声音阶循环 BGM（title/explore/battle/boss）
仅依赖 numpy + 标准库 wave，零额外安装。
"""
import os
import numpy as np
import wave

SR = 44100
OUT = "public/audio"


def write_wav(path, samples):
    samples = np.clip(samples, -1, 1)
    pcm = (samples * 32767).astype("<i2")
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def env(n, a=0.003, decay=0.4):
    out = np.empty(n)
    na = max(1, int(a * SR))
    for i in range(n):
        out[i] = (i / na) if i < na else np.exp(-(i - na) / (n * decay))
    return out


def tone(freq, dur, vol=0.5, harm=(1.0,), a=0.003, detune=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for h, amp in zip(range(1, len(harm) + 1), harm):
        s += amp * np.sin(2 * np.pi * (freq * h + detune) * t)
    s *= env(n, a)
    s *= vol / max(1, len(harm))
    return s


def sweep(f0, f1, dur, vol=0.4, harm=(1.0, 0.4)):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for h, amp in zip(range(1, len(harm) + 1), harm):
        s += amp * np.sin(2 * np.pi * freq(t, f0, f1) * h * t)
    s *= env(n, 0.004)
    s *= vol / len(harm)
    return s


def freq(tlin, f0, f1):
    return f0 + (f1 - f0) * tlin


def noise(dur, vol=0.3, lp=0.0008, decay=6.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.random.randn(n) * vol
    k = max(1, int(lp * SR))
    if k > 1:
        s = np.convolve(s, np.ones(k) / k, mode="same")
    s *= np.exp(-t * decay)
    return s


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        if len(p) < n:
            p = np.pad(p, (0, n - len(p)))
        out += p
    return out


def seq(notes, beat, vol=0.3, harm=(1.0, 0.3, 0.1)):
    out = []
    for f in notes:
        if f == 0:
            out.append(np.zeros(int(beat * SR)))
        else:
            out.append(tone(f, beat * 0.92, vol, harm, a=0.003))
    return np.concatenate(out) if out else np.zeros(1)


def pluck(f, dur, vol=0.32):
    """古筝/琵琶式拨弦：快 attack + 指数衰减 + 泛音"""
    return tone(f, dur, vol, (1.0, 0.4, 0.18, 0.08), a=0.002, detune=0.3)


def bgm(root, bpm, melody, name, bass_vol=0.12, dur_pad=None):
    beat = 60.0 / bpm
    music = seq(melody, beat, vol=0.34, harm=(1.0, 0.35, 0.15))
    pad = tone(root / 2, len(music) / SR, bass_vol, (1.0, 0.3), a=0.01)
    out = mix(music, pad)
    write_wav(os.path.join(OUT, f"bgm_{name}.wav"), out)


# 五声音阶（宫商角徵羽）半音偏移
PENTA = [0, 2, 4, 7, 9]
def pf(root, semi):
    return root * (2 ** (semi / 12.0))


def main():
    os.makedirs(OUT, exist_ok=True)

    # ---- 音效 ----
    write_wav(os.path.join(OUT, "sfx_click.wav"), tone(880, 0.06, 0.4, (1.0, 0.3)))
    write_wav(os.path.join(OUT, "sfx_hit.wav"), mix(noise(0.1, 0.5, 0.0006), tone(160, 0.12, 0.5, (1.0, 0.5), a=0.002)))
    write_wav(os.path.join(OUT, "sfx_crit.wav"), mix(noise(0.12, 0.6, 0.0004), tone(1200, 0.14, 0.4, (1.0, 0.5))))
    write_wav(os.path.join(OUT, "sfx_block.wav"), mix(tone(150, 0.1, 0.5, (1.0, 0.4), a=0.002), noise(0.05, 0.2, 0.0005)))
    write_wav(os.path.join(OUT, "sfx_parry.wav"), mix(tone(1040, 0.12, 0.4, (1.0, 0.5), a=0.001), tone(1560, 0.1, 0.2, (1.0, 0.3))))
    write_wav(os.path.join(OUT, "sfx_miss.wav"), sweep(320, 180, 0.1, 0.3))
    write_wav(os.path.join(OUT, "sfx_heal.wav"), seq([660, 880, 990], 0.12, vol=0.3))
    write_wav(os.path.join(OUT, "sfx_pickup.wav"), sweep(980, 1320, 0.08, 0.35))
    write_wav(os.path.join(OUT, "sfx_cast.wav"), sweep(420, 920, 0.22, 0.4, (1.0, 0.4)))
    write_wav(os.path.join(OUT, "sfx_levelup.wav"), seq([440, 660, 880], 0.14, vol=0.34))
    write_wav(os.path.join(OUT, "sfx_die.wav"), sweep(220, 60, 0.4, 0.5, (1.0, 0.4)))
    write_wav(os.path.join(OUT, "sfx_boss.wav"), mix(tone(90, 0.5, 0.6, (1.0, 0.5, 0.2), a=0.01), noise(0.3, 0.25, 0.002, 3)))
    write_wav(os.path.join(OUT, "sfx_forgeOk.wav"), seq([520, 780], 0.12, vol=0.32))
    write_wav(os.path.join(OUT, "sfx_forgeFail.wav"), sweep(200, 90, 0.22, 0.4, (1.0, 0.4)))
    write_wav(os.path.join(OUT, "sfx_combo.wav"), mix(tone(840, 0.1, 0.4, (1.0, 0.4), a=0.002), tone(1260, 0.08, 0.2)))
    write_wav(os.path.join(OUT, "sfx_achievement.wav"), seq([660, 880, 1046], 0.12, vol=0.34))
    write_wav(os.path.join(OUT, "sfx_brk.wav"), mix(tone(170, 0.12, 0.5, (1.0, 0.4), a=0.002), tone(1200, 0.06, 0.35, (1.0, 0.3), a=0.001)))
    write_wav(os.path.join(OUT, "sfx_exec.wav"), seq([330, 660, 990], 0.16, vol=0.36))
    write_wav(os.path.join(OUT, "sfx_shock.wav"), mix(sweep(1500, 500, 0.08, 0.4), tone(820, 0.07, 0.3, (1.0, 0.4))))
    write_wav(os.path.join(OUT, "sfx_vapor.wav"), mix(sweep(1600, 900, 0.1, 0.32), tone(900, 0.08, 0.22)))
    write_wav(os.path.join(OUT, "sfx_melt.wav"), mix(sweep(1200, 600, 0.12, 0.32), tone(700, 0.1, 0.24, (1.0, 0.3))))
    write_wav(os.path.join(OUT, "sfx_superc.wav"), mix(sweep(1800, 600, 0.08, 0.4), tone(600, 0.12, 0.3, (1.0, 0.4))))
    write_wav(os.path.join(OUT, "sfx_crystal.wav"), seq([880, 1320, 1760], 0.1, vol=0.3))
    write_wav(os.path.join(OUT, "sfx_overload.wav"), mix(tone(110, 0.3, 0.6, (1.0, 0.4), a=0.005), tone(520, 0.12, 0.35, (1.0, 0.4))))
    write_wav(os.path.join(OUT, "sfx_freeze.wav"), mix(tone(2100, 0.1, 0.3, (1.0, 0.3), a=0.001), tone(1500, 0.08, 0.22)))
    write_wav(os.path.join(OUT, "sfx_shatter.wav"), mix(tone(2600, 0.06, 0.4, (1.0, 0.3), a=0.001), tone(900, 0.1, 0.3, (1.0, 0.4))))
    write_wav(os.path.join(OUT, "sfx_phase.wav"), seq([220, 440], 0.18, vol=0.36))

    # ---- BGM：国风五声音阶循环 ----
    # title（明亮，C 宫调）
    r = pf(261.63, 0)
    bgm(r, 84, [pf(r, PENTA[0]), pf(r, PENTA[2]), pf(r, PENTA[3]), pf(r, PENTA[4]),
                pf(r, PENTA[3]), pf(r, PENTA[2]), pf(r, PENTA[1]), 0], "title")
    # explore（舒缓，G 徵调）
    r = pf(196.0, 0)
    bgm(r, 96, [pf(r, PENTA[3]), pf(r, PENTA[4]), pf(r, PENTA[0] + 12), pf(r, PENTA[4]),
                pf(r, PENTA[3]), pf(r, PENTA[1]), pf(r, PENTA[2]), 0], "explore")
    # battle（快，A 羽调）
    r = pf(220.0, 0)
    bgm(r, 132, [pf(r, PENTA[4]), pf(r, PENTA[0] + 12), pf(r, PENTA[2]), pf(r, PENTA[1]),
                 pf(r, PENTA[4]), pf(r, PENTA[0] + 12), pf(r, PENTA[3]), pf(r, PENTA[2])], "battle")
    # boss（低沉，C 小调感）
    r = pf(130.81, 0)
    bgm(r, 112, [pf(r, 0), pf(r, 3), pf(r, 7), pf(r, 6),
                 pf(r, 0), pf(r, 1), pf(r, 7), 0], "boss")

    print("OK 生成音频资产到", OUT)
    print("音效 27 个 + BGM 4 个（title/explore/battle/boss）")


if __name__ == "__main__":
    main()
