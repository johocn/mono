# 大富翁音频异常逃逸修复（真机口径）设计

> 日期：2026-09-30 · 状态：待用户复核 · 上游：`docs/superpowers/specs/2026-09-30-monopoly-audio-design.md`（M11 音效与音乐）

## 1. 事故现象与复现证据

用户报告四个症状，**同源**：

> 骰子没有点数 · 游戏无法运行 · 人物没有前进 · 没有事件提醒

真实 Chromium（390×844 @dpr2）打开线上 `https://game.joho.cn/tour/mono.html?humans=1&tour=0`，点「掷骰」后：

```
pageerror: TypeError: Failed to set the 'buffer' property on 'AudioBufferSourceNode':
            Failed to convert value to 'AudioBuffer'.
pageerror: Error: [mono] rollDice @phase=rolled
```

点击后状态快照（`window.__monoMain.game.state`）：

```json
{ "phase": "rolled", "round": 1, "dice": { "d1": 4, "d2": 1, "total": 5 },
  "pos": [0, 0, 0, 0], "over": false }
```

即：**状态已落库**（`phase` 进入 `rolled`、点数已生成），但 `paint()` 未执行 → 骰面无点数、棋子不动、面板不更新；由于状态已推进而 UI 未跟上，第二次点主按钮直接抛 `rollDice @phase=rolled`，**整局卡死**。

## 2. 根因

`src/ui/audio.ts` 的 `tone()` 噪声音色分支（L232–L242）：

```ts
if (o.noise) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * (o.decayMs / 1000)));
  const ch = ctx.createBuffer(1, len, ctx.sampleRate).getChannelData(0);  // 建了 buffer，却把引用丢掉
  for (let i = 0; i < ch.length; i += 1) ch[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = { noise: true };   // ← 真机：不是 AudioBuffer → TypeError
  ...
}
```

`AudioBufferSourceNode.buffer` 是 WebIDL 类型化属性，赋非 `AudioBuffer` 值**必抛 `TypeError`**。

触发面：`VOICES` 中 `noise: true` 只有 `rattle`（`src/data/audio.ts` L42），而 `DEFAULT_SFX.dice === 'rattle'`（L55）——**掷骰是每回合第一个动作**，故每次开局第一次点击即炸。

逃逸位置在 `src/main.ts` L261：

```ts
if (sfxOn) audio.play(ctx.kind);   // ← 抛在这里
fxPending = true;
paint();                           // 永远执行不到
fx.play(ctx, () => { fxPending = false; paint(); });
```

`audio.play()` 位于 `paint()` 与 `fx.play()` **之前**。异常逃逸 ⇒ 画面停帧 + 状态机与画面失同步 ⇒ 四个症状一次性全中。

## 3. 为什么 433 例单测 + 两个线上闸门全绿却线上坏

关键：**「真实手势解锁」与「真实 `AudioContext`」这条组合，没有任何一条用例走到**。

| 覆盖方 | 真实手势（触发 `pointerdown` → `unlock()`） | 真实 `AudioContext` | 结果 |
|---|---|---|---|
| `test/ui/audio.spec.ts` | 不适用（纯注入装配） | ❌ 假 ctx，`createBufferSource()` 是普通对象，`buffer` 赋值静默成功 | 测不到 |
| `local/mono-prod-check.mjs` | ✅ `locator().click()`（L174） | ❌ `addInitScript(audioStub)` 装了 `AudioContextStub`（L50–L70, L166） | 假件吞掉 `TypeError` |
| `local/mono-e2e-playthrough.mjs` | ❌ 全部是 `page.evaluate(() => el.click())`（L122）——合成 click **不触发 `pointerdown`**，`unlock()` 从未执行，`ctx === null`，`play()` 在 L336 直接早退 | ✅ 未装 stub | 早退，根本走不到发声 |

结论：这不是「测试不够多」，而是**假件比真机宽松** + **合成事件绕过了手势门**，两个盲区叠加。

## 4. 设计

### 4.1 修复点（1 行 + 1 个类型）

`src/ui/audio.ts`：

1. `tone()` 噪声分支保留 `createBuffer` 的返回值，赋给 `src.buffer`：

```ts
const buf = ctx.createBuffer(1, len, ctx.sampleRate);
const ch = buf.getChannelData(0);
for (let i = 0; i < ch.length; i += 1) ch[i] = Math.random() * 2 - 1;
const src = ctx.createBufferSource();
src.buffer = buf;
```

2. `AudioCtxLike.createBuffer`（L135）的匿名返回类型提升为具名 `AudioBufferLike`：

```ts
export interface AudioBufferLike { getChannelData(channel: number): Float32Array }
// AudioCtxLike.createBuffer(channels, length, rate): AudioBufferLike
```

3. **把 `buffer` 的类型收紧，让这类 bug 在编译期就不可能发生**（治本，而非只治这一次）：

```ts
export interface SrcLike extends NodeLike { buffer: AudioBufferLike | null; start(t?: number): void; stop(t?: number): void }
// AudioCtxLike.decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>
// AudioDeps.loadBuffer: (src, ctx) => Promise<AudioBufferLike | null>
// 引擎内 buffers: Map<string, AudioBufferLike>
```

收紧后 `src.buffer = { noise: true }` 直接是 **TypeScript 编译错误** —— 本次事故在 `npx tsc --noEmit` 阶段就会被拦下。真实 `decodeAudioData` 返回的 `AudioBuffer` 结构上满足 `AudioBufferLike`（有 `getChannelData`），默认路径无需改动；而 `test/ui/audio.spec.ts` 里 `decodeAudioData() { return Promise.resolve({}) }` 这类过宽假件会**因类型不合法而被强制修正**，与 4.3a「假件不得比真机宽松」同向。

影响面：噪声路径（当前唯一 `rattle`）＋ file 音轨的缓冲类型标注＋单测假件类型。振荡器路径与 BGM 排程逻辑不受影响。

### 4.2 兜底边界：护栏放引擎内部，不放调用点

`play(kind)` 整体包 `try/catch { /* 静默 */ }`。

**为什么不在 `src/main.ts` 的 `runAction` 加 `try/catch`**：`runAction` 的第一个参数 `fn()` 是游戏状态机本身（`rollDice` / `moveCurrent` / `settleCurrent`）。在那里兜底会把状态机的真实缺陷一并吞掉，把「炸得响」降级成「静默错」，反而更难查。音频的所有外部入口（`play` / `unlock` / `startBgm` / `stopBgm` / `toggle`）都在引擎内，护栏在此收口即可，`runAction`「音频与 fx 同刻」的语义保持不变。

`unlock()` / `toggle()` 已有局部 `try/catch`，本次不重复包装，只补 `play()` 这个裸口。

### 4.3 测试与闸门改造（本次重点，不止修一行）

**a) 单测假件复现真机语义** — `test/ui/audio.spec.ts`

- `createBufferSource()` 的假件改为带 setter 校验：`buffer` 只接受**本 ctx `createBuffer()` 返回的那个对象**，否则抛 `TypeError`（用 `Object.defineProperty` 定义 `buffer`）。这样假件不再比真机宽松。
- 新增（至少）两条断言：
  1. 噪声 cue（`dice`）不抛，且 `src.buffer` 恒等于该次 `createBuffer()` 的返回值；
  2. 注入一个「`createOscillator()` 直接抛错」的 ctx，`play()` 仍不抛（验证 4.2 的护栏）。

**b) 线上闸门改用真实 `AudioContext`** — `local/mono-prod-check.mjs`

- 删除 `AudioContextStub`（L50–L70）与两处 `addInitScript(audioStub)`（L166、L230）。
- 原 9 项音频 gate 中，依赖 `window.__audioCtxCount` 的两项改为走既有探针 `window.__monoMain.audio.isUnlocked()`：
  - `audioLazy`：boot 后（未点击）`isUnlocked() === false`；
  - `audioUnlock`：首次真实点击后 `isUnlocked() === true`；
  - `audioForceMute`（`?audio=0`）：点击后仍 `isUnlocked() === false`。
- `audioPlay` 口径：真实点击发动作后 `errors.length === 0` **且** `game.state.dice.total` 落在 2..12（即 `paint()` 确实执行过）。
- 该页必须用**真实鼠标点击**（`locator().click()`）触发解锁，保持现状即可。

**c) e2e 补一次真实手势** — `local/mono-e2e-playthrough.mjs`

- 把**首个**动作点击从 `page.evaluate(() => el.click())`（L122）改为 `page.locator(sel).click()`，确保 `pointerdown` 发生、`unlock()` 被真正执行；其余点击保持合成以维持 973 次点击的墙钟预算。
- 新增 gate：`facts.errors.length === 0`（已有 `errors` 采集，补显式断言）与 `audioUnlocked === true`。
- 保留既有 `audio_keys` / `ai_audio_keys` 断言。

### 4.4 明确不做（YAGNI）

- 不动 BGM lookahead 排程与 `file` 音轨解码路径（用户选定最小档；当前默认皮肤不走 file 轨）。
- 不重构 `fx` / `runAction`。
- 不改 `src/data/audio.ts` 的音色表与 BGM 和弦进行。
- 不改音效音量、不加新开关。

## 5. 验收标准

1. 真实 Chromium 打开线上 `mono.html?humans=1&tour=0`，点「掷骰」：`errors` 为空，骰面显示出点数、主按钮转「前进」。
2. 点「前进」：棋子逐格移动、落格结算面板/事件浮层正常出现。
3. 本地 `npm run check` 全绿；`npx tsc --noEmit` exit 0。
4. 本地 preview（52301）两个闸门全绿：`mono-prod-check.mjs`、`mono-e2e-playthrough.mjs`（含 `audioUnlocked`）。
5. 部署后线上重跑同一对闸门，全绿、`errors=[]`。
6. **390×844 @dpr2 手机视口截图**（至少 3 张：掷骰后骰面有点数 / 棋子移动中或落格后 / 事件浮层），补进 `docs/manual-mono.md`。
7. 手册新增「M12 真机音频解锁回归」小节，记录本次事故的根因、闸门盲区与新增口径。

## 6. 交付物

| 项 | 路径 |
|---|---|
| 修复 | `src/ui/audio.ts` |
| 单测 | `test/ui/audio.spec.ts` |
| 闸门 | `local/mono-prod-check.mjs`、`local/mono-e2e-playthrough.mjs` |
| 手册 | `docs/manual-mono.md`（新增 M12 + 截图） |
| 证据截图 | `docs/verify/mono-prod-07-dice-pips.png` / `-08-pawn-move.png` / `-09-event.png` |
| 部署 | `node ../scripts/deploy-mono.mjs`（本地构建 → scp → 服务器仅解压） |

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 去掉 `AudioContextStub` 后，headless Chromium 的 `AudioContext` 可能处于 `suspended`（无音频设备） | 断言口径只依赖 `isUnlocked()`（是否已构造）与「无 `pageerror`」，**不依赖实际出声**；`resume()` 失败已在引擎内静默 |
| 真实 `AudioContext` 在 CI/无音频设备环境构造失败 | `defaultCreateCtx()` 已有 `try/catch → null` 回退；若为 `null`，`audioUnlock` gate 会失败——此场景需在报告中显式说明，不得静默放宽 |
| e2e 首个点击改真实手势后，可能因元素被遮挡而点击失败 | 用 `locator().click()` 并保留既有的「点击后状态未变则判 UI 缺陷」逻辑；必要时 `{ force: true }` |
| 兜底 `try/catch` 吞掉未来真实音频缺陷 | 已在单测中用「抛错 ctx」显式锁定「吞掉但游戏继续」的行为；同时 `errors` 闸门保证页面级异常仍然可见 |

## 8. 参考

- 上游 spec：`docs/superpowers/specs/2026-09-30-monopoly-audio-design.md`（M11 音效与音乐）
- 实施计划：`docs/superpowers/plans/2026-09-30-monopoly-audio.md`（Task 1–9）
- 事故复现脚本（临时）：`local/_tmp-real-probe.mjs`（验证完成后删除）
