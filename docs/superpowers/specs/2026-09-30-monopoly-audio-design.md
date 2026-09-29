# 大富翁 · 音效与音乐 Design

**日期：** 2026-09-30
**范围：** `d:\zhao\monopoly`（仓库根 `d:\zhao`）
**目标一句话：** 给对局补上**音效 + 单段循环 BGM**——默认皮肤零素材（全部 Web Audio 程序化合成），可整包换成音频文件；两套独立开关常驻顶部右侧，音量内置默认。

---

## 1. 背景与动机

现状（评估结论）：

- 核心玩法闭环、AI 对手、新手引导均已上线（`https://game.joho.cn/tour/mono.html`，48 文件 / 394 单测全绿）。
- **整仓 0 处音频引用**（`Audio|sound|Howl|mp3|ogg|音量|音效` 零命中）：掷骰、跳跃、买地、升级、收租、抽卡、股票成交、结算结算——全部是**无声演出**。
- 但「演出时刻」已经枚举得很干净：`src/render/fx.ts` 的 `FxKind = 'dice'|'hop'|'buy'|'upgrade'|'rent'|'card'|'deck'|'stock'|'end'`，且唯一出画口 `runAction(fn, ctxOf, withFx)`（`src/main.ts`）已经把**真人与 AI 的演出统一**在同一个 `fx.play(ctx, cb)` 上。
- 素材可换契约（既有 spec §3.6「可见元素必须可换素材」）已经用 `ProviderKind = 'proc' | 'image' | 'atlas' | 'frames'` 建立了「**默认程序化 → 可整包换素材**」的双轨制，配合「缺失即回退、绝不抛错」的回退链。

**因此本任务的正确做法是照抄既有结构**：音效挂在 `fx.play` 的对偶位置，音源照抄 `proc | file` 双轨制，回退链照抄 `resolveMotion()` 的逐项回落。不新增触发点、不新增演出枚举、不引入音频库。

---

## 2. 非目标（明确不做）

- **不做玩家可调音量**：音量走内置默认（`AUDIO_VOL_SFX / AUDIO_VOL_BGM`），可在 `skin.json` 的 `sound.volume` 覆盖。不做滑块、不做设置面板。
- 不做多段 BGM / 歌单 / 按场景切换 / 交叉淡化 / 淡入淡出编排。
- 不做语音旁白、不做空间音、不做频谱可视化、不做震动反馈。
- **不引入任何音频库**（Howler / Tone.js 等），只用 Web Audio API（+ `decodeAudioData`）。
- 不做 i18n、不做 AI 难度分级、不做联机、不做后端接口。
- 不改经济数值、棋盘数据、`?demo=1` 演示路径的既有行为。
- 不改 `preloadSkinAssets` 的职责（音频文件不走 Pixi `Assets`，见 §4.4）。

---

## 3. 架构：模块边界与数据流

**核心原则（沿用既有分层纪律）：`src/data/` 纯数据；`src/core/` 纯规则无时间概念；时间与副作用只允许出现在 `src/ui/`。**

新增 3 个文件 + 修改 8 个：

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/data/audio.ts` | **纯数据**：cue 表、voice 默认参数表、BGM 和弦进行表、开关文案 | 新增 |
| `src/ui/audio.ts` | **双轨制音频引擎**：`createAudioEngine`（含排程器）+ 纯函数 `sfxFor` / `resolveSound` / prefs 读写 | 新增 |
| `src/render/providers/proc-audio.ts` | 4 个图标 preset（喇叭开/关、音符开/关） | 新增 |
| `src/skin/types.ts` | `SoundProviderKind` / `SoundSpec` / `SoundPack`；`SkinPack` 增 `sound?` | 修改 |
| `src/skin/layout.ts` | `AUDIO_*` 常量（键位、音量、BGM 排程参数） | 修改 |
| `src/ui/Hud.ts` | `HudActionId` 增两枚；`hitAreas` / `hudSpecs` 三角同步 | 修改 |
| `src/main.ts` | 装配引擎、手势解锁、静音键接线、`?audio=` 参数 | 修改 |
| `public/skins/default/skin.json`、`public/skins/photo/skin.json` | 顶层 `sound` 段 + 4 个图标元素 | 修改 |
| `public/registry-ids.json` | 233 → 237 个注册表 id | 修改 |
| `test/data/audio.spec.ts`、`test/ui/audio.spec.ts` | 见 §10 | 新增 |
| `docs/manual-mono.md` | 新增 `### M11 音效与音乐` + 手机截图 | 修改 |
| `local/mono-prod-check.mjs`、`local/mono-e2e-playthrough.mjs` | 音频 gate | 修改 |

**数据流（音效与演出同刻，共用唯一出画口）：**

```
真人点击 HUD ─┐
              ├─→ runAction(fn, ctxOf, withFx) ─→ 状态落库 ─→ paint()
AI 决策层 ────┘                                        ├─→ fx.play(ctx.kind)     （既有：演出）
                                                       └─→ audio.play(ctx.kind)  （新增：音效）
```

- `audio.play()` 在 `withFx === false` 时**直接返回**：`skipRest` 快进与 `?nofx` 都不出声。
- `audio.play()` 未解锁（§9）时**直接丢弃**：不排队、不报错、不进 missing。
- BGM 不走这条链——它是独立生命周期（§6），只受自身开关控制。

---

## 4. 音源双轨制

### 4.1 数据模型（`src/skin/types.ts`）

与 `ProviderKind` 完全同构：

```ts
export type SoundProviderKind = 'proc' | 'file';

export interface ProcSoundSpec { kind: 'proc'; voice: SfxVoice | BgmVoice }
export interface FileSoundSpec { kind: 'file'; src: string; volume?: number }
export type SoundSpec = ProcSoundSpec | FileSoundSpec;

export interface SoundPack {
  sfx?: Partial<Record<SfxKind, SoundSpec>>;
  bgm?: SoundSpec;
  volume?: { sfx?: number; bgm?: number };
}

// SkinPack 增：sound?: SoundPack;
```

`SfxVoice` / `BgmVoice` 是 `src/data/audio.ts` 里声明的字符串联合（音色原型 id），不是任意字符串——坏值按「缺省」处理。

### 4.2 `loadSkin` 无需改动

[skinLoader.ts](file:///d:/zhao/monopoly/src/skin/skinLoader.ts) 是 `{ ...pack, id, elements: pack.elements ?? {}, tokens: pack.tokens ?? {} }` 的展开写法，`sound` **自动透传**。`loadSkin` 只校验 `geo.hw`；`sound` 段的合法性由 §4.3 的纯函数负责。

### 4.3 回退链（逐级回落，坏数据静默降级，绝不抛错）

`resolveSound(pack)` 是**纯函数**，**永不返回 null**，返回一张完整的、可直接消费的表：

| 层 | 命中 | 否则 |
|---|---|---|
| L1 | `sound.sfx[cue]` 为 `file` 且已解码成功 | ↓ |
| L2 | `sound.sfx[cue]` 为 `proc`（该 cue 的合成音色） | ↓ |
| L3 | `DEFAULT_SFX[cue]`（`src/data/audio.ts` 内建默认音色） | —— |
| 音量 | `sound.volume.sfx` / `.bgm` | `AUDIO_VOL_SFX` / `AUDIO_VOL_BGM` |
| BGM | `sound.bgm` 为 `file` 且已解码 | 内建 proc 循环（§6） |

- L1 → L2 的降级发生在**运行期**（文件 404 / `decodeAudioData` reject）：该 cue 被标记为「永久回退」，之后不再重试，并计入 `missingAudio`（与 `preloadSkinAssets` 的 `missing` 同规——**只记录，不抛错**）。
- 坏数据判定（一律按「缺省」处理）：`sound` 非对象；`spec.kind` 不在 `'proc' | 'file'` 内；`file.src` 非字符串；`proc.voice` 不在 `SfxVoice` 枚举内；`volume.*` 非 0–1 的数字。
- 与 `resolveMotion(tokens?)` 的「逐项回落 `FX_*`」完全同规，便于单测直接断言。

### 4.4 音频文件不走 `preloadSkinAssets`

音频是 `HTMLAudioElement` / `decodeAudioData` 的活儿，与 Pixi `Assets` + `Texture` 无关，**不得**塞进 [assets.ts](file:///d:/zhao/monopoly/src/render/assets.ts) 的 `assetPaths()`——否则会把音频当纹理 `Assets.load` 而必然失败。

文件轨装载时机：**手势解锁后异步装载**（`fetch` → `decodeAudioData` → 缓存 `AudioBuffer`），装载完成前该 cue 先用 `proc` 顶上。好处：① 不阻塞首屏（`release/js/mono.js` 现在 498588 B，不应为此加长首屏路径）；② 默认皮肤根本不发起任何网络请求。

---

## 5. 音效清单与触发点

### 5.1 cue 集合 = 既有枚举 + 1

```ts
export type SfxKind = FxKind | 'ui';
```

`FxKind` 的 9 个成员**已经**是全部「演出时刻」，不需要新枚举。额外补 1 个 `ui`，只给**没有 fx 的动作**（`ai:fast` / `ai:skip` / 静音键自身），避免与 `dice` / `buy` 叠音。

### 5.2 cue → 默认音色（`src/data/audio.ts`）

| cue | voice | 听感定位 |
|---|---|---|
| `dice` | `rattle` | 短促噪声抖动（掷骰） |
| `hop` | `hop` | 单音上滑（棋子跳格） |
| `buy` | `thud` | 低频落地（买地） |
| `upgrade` | `blip` | 双音上扬（升级） |
| `rent` | `coin` | 三音上行（收租） |
| `card` | `sweep` | 上行滑音（命运 / 机会） |
| `deck` | `sweep` | 同型降调（手牌抽卡，与 `card` 区分音高） |
| `stock` | `tone` | 单音（股票成交） |
| `end` | `chime` | 三音收束（结算） |
| `ui` | `tick` | 极短点击（无 fx 的 UI 动作） |

每个 voice 的参数（振荡器类型 / 频率 / 起音 / 衰减 / 增益 / 是否噪声）在 `src/data/audio.ts` 集中声明一次——**调音只改这张表，不动逻辑**。

### 5.3 触发点

[main.ts](file:///d:/zhao/monopoly/src/main.ts) 的 `runAction` 内，与 `fx.play(ctx, cb)` 同刻：

```ts
const result = fn();
const ctx = withFx ? ctxOf(result) : null;
if (!ctx) { fxPending = false; paint(); return; }
audio.play(ctx.kind, ctx);      // ← 新增：与 fx 同刻、同判空
fxPending = true;
paint();
fx.play(ctx, () => { fxPending = false; paint(); });
```

- 真人与 AI **天然共用**（AI 正常回合 `dispatch(step)` 的 `withFx` 默认 `true` → 有演出也有音效）。
- `aiDriver.skipRest()` 与 `?nofx` 走 `withFx === false` → **连带静音**：快进不该吵。
- `ctxOfStep` 对 `buy` / `upgrade` 失败返回 `null`（无 fx）→ 无音效，与演出保持一致，不额外加「失败音」。

---

## 6. BGM（单段循环）

### 6.1 默认皮肤 = proc 合成循环

- **4 小节循环，120 BPM**（每小节 2s，整段 8s）。和弦进行 `Am – F – C – G`，表在 `src/data/audio.ts`。
- 每小节两只声部：① **根音低音**——`sine`，起音 20ms / 衰减 `AUDIO_BGM_BASS_MS`；② **三和弦铺底**——`triangle` ×3 音，起音 300ms，增益 ×`AUDIO_BGM_PAD_GAIN`。
- **不做鼓、不做旋律**——这是「氛围底」，不是「配乐作品」。
- 排程用标准 lookahead：`setInterval(AUDIO_BGM_LOOKAHEAD_MS)`，把未来 `AUDIO_BGM_SCHEDULE_AHEAD_S` 内的音符排到 `AudioContext` 时间轴上（不用 `setTimeout` 直接发声，避免抖动）。

### 6.2 生命周期

- 起播：`startGame(plan)` 之后（且已解锁）。
- 停播：`state.over === true` 时 —— 清 `setInterval` + 对在播振荡器 `stop()`。
- 与 `withFx` **无关**，只受自身开关（`audio:bgm`）与 `mono.audio.bgm` 控制。
- 切成 `file` 轨时同样循环播放（`HTMLAudioElement.loop = true`）；解码失败 → 回落 proc 循环。

---

## 7. 静音键 UI 与命中层

### 7.1 键位常量（`src/skin/layout.ts`）

镜像既有的 `SHARE_CTA_BOX = { left: 8, top: 5, w: 78, h: 26 }`（`src/ui/share.ts`）写法，右侧 8px 留边：

```ts
export const AUDIO_KEY_SIZE = 26;
export const AUDIO_SFX_BOX = { left: 324, top: 5 };   // 390 − 8 − 26 − 6 − 26 = 324
export const AUDIO_BGM_BOX = { left: 356, top: 5 };   // 390 − 8 − 26 = 356
```

依据：顶部状态条 `HUD_TOP_H = 30` 只被 DOM 分享键占用左侧 `x 8–86`，**右侧 `x 92–382` 全空**，加两枚 26×26 零冲突。

### 7.2 命中层（`src/ui/Hud.ts`）

- `HudActionId` 增 `'audio:sfx' | 'audio:bgm'`。
- `hitAreas()` 增两枚 **`enabled: true`、无条件常驻**——静音键在 AI 回合、真人回合、结算后都应可点。
- ⚠️ **实现坑（已定位）**：[Hud.ts L178](file:///d:/zhao/monopoly/src/ui/Hud.ts#L178) 是 `if (state.over) return out;`，AI 分支是 [L181-185](file:///d:/zhao/monopoly/src/ui/Hud.ts#L180-L185) 的整段 `return [...]`。两处都要改成「**先推入两枚 audio 命中区，再走各自分支**」，否则静音键会在 AI 回合与结算后消失。
- DOM 只挂透明 `<button data-action>`，可见像素不在这里（§7.3）。

### 7.3 可见像素 = Canvas proc preset（守「可见元素可换素材」硬契约）

`hudSpecs()` 增第 5 参 `audio?: { sfx: boolean; bgm: boolean }`，推入 4 个图标 spec：

| 注册表 id | 状态 | 形状 |
|---|---|---|
| `ui.sound.on` | 音效开 | 喇叭（梯形 `poly` + 矩形颈）+ 两道声波弧 |
| `ui.sound.off` | 音效关 | 喇叭 + 一道 45° 斜杠 |
| `ui.music.on` | 音乐开 | 音符（`circle` 符头 + `rect` 符干 + `poly` 符尾） |
| `ui.music.off` | 音乐关 | 音符 + 一道 45° 斜杠 |

- 原语可用性已核实：[proc-hud.ts](file:///d:/zhao/monopoly/src/render/providers/proc-hud.ts) 用到的 `roundRect / rect / circle / poly / fill / stroke` 即可拼出上述形状；**没有 arc 原语**，声波弧用 5–7 点折线 `poly` 近似；斜杠用 4 点薄四边形 `poly`。
- ⚠️ **第二个实现坑（已定位）**：[Hud.ts L142-154](file:///d:/zhao/monopoly/src/ui/Hud.ts#L142-L154) 的 AI 分支以 `return out` 提前结束。图标 spec **必须在 `if (aiSeat)` 之前推入**，否则 AI 回合图标消失。
- 4 个新 id → `public/registry-ids.json`：**233 → 237**；两个 `skin.json` 的 `elements` 各增 4 条（默认皮肤给 `proc` preset 名，photo 皮肤同样给 `proc`，但允许第三方皮肤换成 `image` / `frames`）。
- 开关态配色走各自 preset 的内建默认色（L4 兜底），不引新的 `tokens` 色；「关闭」态用压暗处理（低饱和 fill / alpha），保证 26×26 下仍可辨。

### 7.4 点击行为

- 点 `audio:sfx`：翻转 `mono.audio.sfx` → 立即 `writePrefs` → `audio.apply()` → `paint()`（重画图标）。
- **取消静音时播一次 `ui` cue**（开启的确认音）；静音时不播（刚静音还响一声是错的）。
- 点 `audio:bgm`：同样翻转；切换即刻生效（开 → 起播循环；关 → 停）。

---

## 8. 音量、持久化、URL 参数

### 8.1 常量清单（全部集中在 `src/skin/layout.ts`）

```ts
/* 静音键键位（§7.1） */
AUDIO_KEY_SIZE = 26;
AUDIO_SFX_BOX = { left: 324, top: 5 };
AUDIO_BGM_BOX = { left: 356, top: 5 };
/* 音量（§8.2，可被 skin.json 的 sound.volume 覆盖） */
AUDIO_VOL_SFX = 0.8;
AUDIO_VOL_BGM = 0.35;
/* BGM 排程（§6.1） */
AUDIO_BGM_BEATS_PER_BAR = 4;
AUDIO_BGM_BARS = 4;
AUDIO_BGM_BASS_MS = 800;              // 低音衰减
AUDIO_BGM_PAD_ATTACK_MS = 300;        // 三和弦起音
AUDIO_BGM_PAD_GAIN = 0.35;            // 铺底相对增益
AUDIO_BGM_LOOKAHEAD_MS = 100;         // 排程器轮询间隔
AUDIO_BGM_SCHEDULE_AHEAD_S = 0.3;     // 提前排程窗口
```

本文件不在 `tools/check-hardcoded.mjs` 的 gate 作用域内（该 gate 只扫 `src/render/`），故裸时长/增益常量**只允许**集中声明在这里——与 `FX_*` 的既有归置一致。

### 8.2 音量与持久化

- **音量**：`AUDIO_VOL_SFX = 0.8`、`AUDIO_VOL_BGM = 0.35`，可被 `skin.json` 的 `sound.volume` 覆盖。
- **持久化**：`localStorage` 键 `mono.audio`，形状 `{ sfx: boolean, bgm: boolean }`，与 `mono.setup`（[setup.ts](file:///d:/zhao/monopoly/src/ui/setup.ts)）/ `mono.tour.done`（[tutorial.ts](file:///d:/zhao/monopoly/src/ui/tutorial.ts)）同规。缺省 = 全开；坏 JSON / 字段非布尔 → 该项按「开」。
- **`?nofx`**：只静音音效，BGM 仍由开关控制（`nofx` 语义是「无演出」，不是「无氛围」）。
- **新增 `?audio=0`**：一键全静音（开关初始为关、且**不创建 `AudioContext`**），供 e2e / 录屏使用。

---

## 9. 自动播放解锁（最大的现实风险）

浏览器 Autoplay Policy 会拦截无手势的音频；iOS Safari 最严（且只允许一个 `AudioContext`）。

- **不在 boot 创建 `AudioContext`**——省资源、避免控制台警告、`?audio=0` 时不建。
- **首次 `pointerdown`（capture，`once`）**：创建（或复用）`AudioContext` → `resume()` → 同一手势内起播 BGM。主流程一定会经过开局面板（[setup.ts](file:///d:/zhao/monopoly/src/ui/setup.ts)）的「开始」点击，天然有解锁点。
- 未解锁期间的 `audio.play()` → **直接丢弃**（不排队、不报错）。因此 `?demo=1` 或 AI 自动开局而用户全程不点屏幕时，表现是「安静但一切正常」。
- iOS：全程复用同一个 `AudioContext` 实例，禁止重复 `new`。

---

## 10. 测试与验收

`vitest` 是 `environment: 'node'`、**无 jsdom**，因此按仓库既有的依赖注入风格拆两层（参照 [share.ts](file:///d:/zhao/monopoly/src/ui/share.ts#L161-L196) 的 `bindWechatShare`）。

### 10.1 纯函数（`test/data/audio.spec.ts` + `test/ui/audio.spec.ts` 的纯函数部分）

- `sfxFor(kind)`：9 个 `FxKind` + `ui` 全覆盖，无遗漏、无 `undefined`。
- `resolveSound(pack)` 回退链：`file` 命中 → 用 file；`file.src` 非法 → proc；cue 缺省 → 内建默认；`pack` 为 `null` → 全内建默认；**任何输入都返回完整表且不抛错**。
- `volume` 解析：缺省 / 非数字 / 越界（>1、<0）→ 回落常量。
- prefs：空存储 → 全开；坏 JSON → 全开；`{ sfx: false }` → `bgm` 仍为开。
- `toggle(prefs, key)`：只翻目标键。
- 合成 voice 参数表：断言每个 voice 的振荡器类型 / 频率 / 包络时长与 `src/data/audio.ts` 声明一致（防止调参时漏改）。

### 10.2 注入式引擎（假 ctx）

`createAudioEngine({ ctx?, decode?, storage?, now? })` 全部依赖注入，断言**语义**「哪一刻请求播放了哪个 cue」，不断言真实声波：

- 掷骰 → 记录到 `dice`；买地失败（无 ctx）→ 无记录。
- `withFx === false` → 无记录。
- 未解锁 → 无记录；`unlock()` 后 → 正常记录。
- 点静音键关掉音效 → 后续 cue 无记录；点回 → 恢复且「开启」那一下有 `ui` cue。
- `file` 解码 reject → 该 cue 永久走 proc，且 `missingAudio` 记 1 条。
- BGM：`start()` 后排程器推进 8s → 拍数 = 4 小节；`over` 后停止。

### 10.3 交付三件套（按仓库惯例，逐项必过）

1. `npm run check`（lint + lint:skin + test）全绿 + `npx tsc --noEmit` 无错 + `[skin:default] OK` / `[skin:photo] OK` + `registry-ids.json: 237 ids`。
2. `node d:\zhao\scripts\deploy-mono.mjs` 七步契约全过（本地构建，服务器只解压）。
3. 线上 `mono-prod-check.mjs` + `mono-e2e-playthrough.mjs` 全 gate `true`，新增音频 gate：注入 stub `AudioContext`，断言「掷骰 → 请求 dice cue」「点 `audio:sfx` → 后续不再请求」「点回 → 恢复」「`audio` 命中区在 AI 回合与 `over` 态仍存在」。
4. **390×844 dpr=2 手机视口截图**（顶部右侧两键的「开/关」两态至少各一张），补进 `docs/manual-mono.md` 新增的 `### M11 音效与音乐`。

---

## 11. 风险与取舍

| # | 风险 | 缓解 |
|---|---|---|
| 1 | 程序化音色的「顺耳」是主观调参，可能要迭代几版 | voice 参数表集中在 `src/data/audio.ts`，调音不动逻辑；单测锁住「表 = 实现」 |
| 2 | 自动播放策略差异（iOS Safari 最严） | 解锁点前置到开局面板「开始」点击；未解锁静默丢弃；`AudioContext` 单实例复用 |
| 3 | `hudSpecs` 的 AI 分支早退会吞掉图标；`hitAreas` 的 `over` 早退会让静音键在结算后消失 | 已在 §7.2 / §7.3 定位到具体行并写死「先推 audio、再走分支」 |
| 4 | photo 皮肤若配 mp3 会加体积 | 默认皮肤零素材；文件轨只在显式配置时异步装载，失败只记 `missingAudio` |
| 5 | proc preset 无 arc 原语，声波弧只能用折线近似 | 26×26 显示尺寸下折线已足够；若观感不足，退化为「单弧 + 两短斜线」 |
| 6 | BGM 与音效共用 `AudioContext` 时音量互相影响 | 音效与 BGM 各自过一个 `GainNode`（`sfxGain` / `bgmGain`），互不耦合 |

**取舍说明**：方案 A（顶部右侧双键）相比「总键 + 面板」牺牲了「玩家可调音量」，换来的是一键静音、零冲突、最小改动量；相比「单键循环三态」保留了「一眼可见当前状态」。这与本项目「HUD 主按钮一律常驻可点」的既有取向一致。

---

## 12. 验收清单

- [ ] `src/skin/types.ts` 有 `SoundProviderKind` / `SoundSpec` / `SoundPack`，`SkinPack.sound?` 存在
- [ ] `resolveSound()` 对 `null` / 坏 JSON / 非法 `kind` / 非法 `voice` / 越界 `volume` 全部返回完整默认表且不抛错
- [ ] 默认皮肤开箱即有 9 种音效 + BGM 循环，**零网络请求**（DevTools Network 无音频请求）
- [ ] `?skin=photo` 后若 `sound` 段配了 `file` → 整包换音源，**零代码改动**；删掉 `file` 的 `src` 指向的文件 → 自动回落 proc，游戏照常
- [ ] 顶部右侧 `x 324–382` 两枚 26×26 图标：真人回合、AI 回合、`over` 结算后**都在**且可点
- [ ] 两枚图标在「开 / 关」两态下均清晰可辨
- [ ] 点静音键立即生效且 `mono.audio` 落库，刷新后仍保持
- [ ] `?nofx` → 音效静音、BGM 仍在；`?audio=0` → 全静音且不创建 `AudioContext`
- [ ] `ai:fast` / `ai:skip` 快进期间**无声**（`withFx=false` 路径）
- [ ] `state.over === true` 后 BGM 停止
- [ ] `npm run check` 全绿、`npx tsc --noEmit` 无错、`registry-ids.json: 237 ids`
- [ ] 线上三项校验 + `mono-prod-check.mjs` + `mono-e2e-playthrough.mjs` 全 gate `true`
- [ ] 390×844 dpr=2 手机截图（开/关两态）已补进操作手册 `M11`