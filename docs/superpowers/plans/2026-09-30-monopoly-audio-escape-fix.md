# 大富翁音频异常逃逸修复（真机口径）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修掉 `monopoly` 大富翁 H5 线上「骰子没有点数 / 游戏无法运行 / 人物没有前进 / 没有事件提醒」的同源事故——`tone()` 噪声分支把占位对象赋给 `AudioBufferSourceNode.buffer`，真机必抛 `TypeError`，异常从 `runAction` 逃逸导致状态已落库但画面停帧；同时补上「真实手势 + 真实 `AudioContext`」这条无人覆盖的闸门盲区。

**Architecture:** 三处收口。① **治本**：把 `SrcLike.buffer` 收紧为 `AudioBufferLike | null`，让同类 bug 在 `npx tsc --noEmit` 阶段就不可能通过；② **兜底**：`play()` 整体 `try/catch`，护栏放引擎内部（不放 `runAction`，避免吞掉状态机自身缺陷）；③ **闸门**：删掉比真机宽松的 `AudioContextStub`、改用真实 `AudioContext` + 原型计数探针，并让 e2e 的**首个**动作点击走真实手势以真正触发 `unlock()`。

**Tech Stack:** TypeScript 5.9（strict，`include: ["src","test","tools"]`）· Vitest 2 · Playwright 1.63 · Vite 6 · Web Audio API · Node ESM 闸门脚本（`.mjs`）

**上游 spec（必读）：** `docs/superpowers/specs/2026-09-30-monopoly-audio-escape-fix-design.md`（§4 设计条目 / §5 验收标准 / §7 风险表）

**工作目录约定：** 仓库根 = `d:\zhao`（git 仓库）；工程根 = `d:\zhao\monopoly`。所有 `git add` 只加本计划涉及的明确路径，**禁止 `git add -A`**（仓库根有大量无关 untracked 文件）。

---

## 根因速查（每个 Task 都以此为锚）

`src/ui/audio.ts` 的 `tone()` 噪声音色分支：

```ts
const ch = ctx.createBuffer(1, len, ctx.sampleRate).getChannelData(0);  // 建了 buffer，却把引用丢掉
for (let i = 0; i < ch.length; i += 1) ch[i] = Math.random() * 2 - 1;
const src = ctx.createBufferSource();
src.buffer = { noise: true };   // ← 真机 WebIDL：不是 AudioBuffer → TypeError
```

只有 `VOICES.rattle` 带 `noise: true`（`src/data/audio.ts:42`），而 `DEFAULT_SFX.dice === 'rattle'`（`src/data/audio.ts:55`）——掷骰是每回合第一个动作，故**开局第一次点击必炸**。

逃逸点 `src/main.ts:261`：

```ts
if (sfxOn) audio.play(ctx.kind);   // ← 抛在这里
fxPending = true;
paint();                           // 永远执行不到 → 骰面无点数 / 棋子不动 / 面板不更新
fx.play(ctx, () => { fxPending = false; paint(); });
```

---

### Task 0: 复现（确认病灶仍在线上）

**Files:**
- 已存在（临时复现脚本，验证完成后删除）：`monopoly/local/_tmp-real-probe.mjs`
- 新增（本计划文档）：`docs/superpowers/plans/2026-09-30-monopoly-audio-escape-fix.md`

- [ ] **Step 1: 用真实 Chromium 打线上，抓 `pageerror`**

Run（cwd = `d:\zhao\monopoly`）:

```powershell
node local/_tmp-real-probe.mjs
```

Expected（关键两行必须出现，证明病灶仍在）：

```
pageerror: TypeError: Failed to set the 'buffer' property on 'AudioBufferSourceNode': Failed to convert value to 'AudioBuffer'.
pageerror: Error: [mono] rollDice @phase=rolled
```

同时 `=== B2 点掷骰后 ===` 的快照里应看到「状态已落库、画面没跟上」：

```json
{ "phase": "rolled", "dice": { "d1": 4, "d2": 1, "total": 5 }, "pos": [0, 0, 0, 0] }
```

- [ ] **Step 2: 提交本计划文档**

```powershell
git add docs/superpowers/plans/2026-09-30-monopoly-audio-escape-fix.md
git commit -m "docs(mono): 音频异常逃逸修复实施计划（真机口径）"
```

---

### Task 1: 收紧音频类型 —— 让 bug 在编译期就不可能

**Files:**
- Modify: `monopoly/src/ui/audio.ts:119-149`（类型声明块）、`monopoly/src/ui/audio.ts:179`（`defaultLoadBuffer` 签名）、`monopoly/src/ui/audio.ts:199`（`buffers` 泛型）

> 这一步**故意不修 bug**：改完类型后 `npx tsc --noEmit` 必须报出 `audio.ts` 噪声分支那一行——这就是「编译期不可能再写出这个 bug」的证据。

- [ ] **Step 1: 新增 `AudioBufferLike`，并收紧 `SrcLike.buffer` / `createBuffer` / `decodeAudioData`**

把 `monopoly/src/ui/audio.ts` 第 119–137 行整段替换为：

```ts
export interface NodeLike { connect(n: unknown): void; disconnect?(): void }
export interface GainLike extends NodeLike { gain: ParamLike }
export interface OscLike extends NodeLike { type: string; frequency: ParamLike; start(t?: number): void; stop(t?: number): void }

/**
 * `AudioBuffer` 的最小结构子集（只声明本项目用到的部分）。
 * 真实 `AudioContext.decodeAudioData()` 返回的 `AudioBuffer` 结构上满足它，默认路径无需改动。
 */
export interface AudioBufferLike { getChannelData(channel: number): Float32Array }

/**
 * `AudioBufferSourceNode.buffer` 是 WebIDL 类型化属性：赋非 `AudioBuffer` 必抛 `TypeError`。
 * 2026-09-30 线上事故（骰子无点数 / 棋子不动 / 无事件提醒）就源于此——故把类型收紧到
 * `AudioBufferLike | null`，让「随手塞个占位对象」在 `tsc` 阶段直接失败。
 */
export interface SrcLike extends NodeLike { buffer: AudioBufferLike | null; start(t?: number): void; stop(t?: number): void }

/** Web Audio 的最小子集（只声明本项目用到的部分，便于注入假件） */
export interface AudioCtxLike {
  currentTime: number;
  sampleRate: number;
  state: string;
  destination: unknown;
  resume(): Promise<void> | void;
  close?(): Promise<void> | void;
  createGain(): GainLike;
  createOscillator(): OscLike;
  createBufferSource(): SrcLike;
  createBuffer(channels: number, length: number, rate: number): AudioBufferLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
}
```

- [ ] **Step 2: 同步 `AudioDeps.loadBuffer` 与 `defaultLoadBuffer` 的返回类型**

把第 139–149 行的 `AudioDeps` 中的 `loadBuffer` 一行替换为：

```ts
  /** file 轨装载（默认 `fetch` + `decodeAudioData`；测试注入） */
  loadBuffer?: (src: string, ctx: AudioCtxLike) => Promise<AudioBufferLike | null>;
```

把 `defaultLoadBuffer` 签名改为：

```ts
async function defaultLoadBuffer(src: string, ctx: AudioCtxLike): Promise<AudioBufferLike | null> {
```

（函数体不动：`return await ctx.decodeAudioData(await res.arrayBuffer());` 现在类型正确。）

- [ ] **Step 3: 同步引擎内 `buffers` 的泛型**

把 `createAudioEngine` 内第 199 行改为：

```ts
  const buffers = new Map<string, AudioBufferLike>();
```

- [ ] **Step 4: 跑类型检查，确认它**报出**噪声分支（这就是「失败的测试」）**

Run（cwd = `d:\zhao\monopoly`）:

```powershell
npx tsc --noEmit
```

Expected（**必须报这两条**，否则说明类型没收紧）：

```
src/ui/audio.ts(...): error TS2322: Type '{ noise: true; }' is not assignable to type 'AudioBufferLike | null'.
  Property 'getChannelData' is missing in type '{ noise: true; }' but required in type 'AudioBufferLike'.
test/ui/audio.spec.ts(...): error TS2322: Type '{ ok: true; }' is not assignable to type 'AudioBufferLike | null'.
```

> 第二条来自 `test/ui/audio.spec.ts:224` 的过宽假件 `loadBuffer: async () => ({ ok: true })`——它同时证明「假件比真机宽松」这个盲区已被类型系统抓住。

- [ ] **Step 5: 不要提交**（此步单独提交会让 CI 类型检查红；与 Task 2 合并为一次提交）

---

### Task 2: 修噪声分支 + `play()` 内部护栏（`tsc` 归零）

**Files:**
- Modify: `monopoly/src/ui/audio.ts:232-243`（噪声分支）、`monopoly/src/ui/audio.ts:335-355`（`play`）
- Modify: `monopoly/test/ui/audio.spec.ts:224`（过宽假件——必需，否则 `tsc` 不过）

- [ ] **Step 1: 修噪声分支：保留 `createBuffer` 的返回值**

把 `monopoly/src/ui/audio.ts` 第 232–243 行替换为：

```ts
    if (o.noise) {
      const len = Math.max(1, Math.floor(ctx.sampleRate * (o.decayMs / 1000)));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i += 1) ch[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      /* 必须赋真 buffer（`SrcLike.buffer` 已收紧为 `AudioBufferLike | null`）——
         历史上这里写成 `{ noise: true }`，真机必抛 TypeError 并导致整局卡死 */
      src.buffer = buf;
      src.connect(env);
      src.start(o.at);
      src.stop(o.at + total / 1000);
      live.push({ node: src, endsAt: o.at + total / 1000 });
      return;
    }
```

- [ ] **Step 2: 给 `play()` 包护栏（护栏放引擎内，不放 `main.ts` 的 `runAction`）**

把 `monopoly/src/ui/audio.ts` 第 335–355 行的 `play` 方法替换为：

```ts
    play(kind: SfxKind): void {
      /*
       * 护栏收口在引擎内（spec §4.2）：音频的任何失败都不得把异常抛到调用点。
       * 调用点 `main.ts` 的 `runAction` 里 `audio.play()` 位于 `paint()` 之前，
       * 一旦上抛就会造成「状态已落库、画面停帧」的失同步（2026-09-30 事故）。
       * **不在 `runAction` 加 catch**：那会把状态机自身的真实缺陷一并吞掉。
       */
      try {
        if (!prefs.sfx || !ctx || !sfxGain) return;      // 未解锁 / 音效关 → 直接丢弃（spec §9）
        const spec = table.sfx[kind] ?? { kind: 'proc', voice: sfxFor(kind) };
        const at = ctx.currentTime;
        if (spec.kind === 'file') {
          const buf = buffers.get(spec.src);
          if (buf) {
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const g = ctx.createGain();
            g.gain.value = spec.volume ?? 1;
            src.connect(g);
            g.connect(sfxGain);
            src.start(at);
            live.push({ node: src, endsAt: at + 1 });
            return;
          }
          if (!dead.has(spec.src)) void loadTrack(spec.src);   // 未就绪 → 触发异步装载，本次先用 proc 顶上
        }
        playProc(sfxFor(kind), at);
      } catch { /* 静默：音频失败不影响玩法（页面级异常仍由闸门 errors 断言兜住） */ }
    },
```

- [ ] **Step 3: 修掉测试里的过宽假件（Task 1 Step 4 报出的第 2 条）**

把 `monopoly/test/ui/audio.spec.ts:224` 整行替换为：

```ts
    const e = engineWith({ createCtx: () => f.ctx, storage: fakeStorage(), loadBuffer: async (_src, ctx) => ctx.createBuffer(1, 1, ctx.sampleRate) });
```

- [ ] **Step 4: 跑类型检查，确认归零**

Run（cwd = `d:\zhao\monopoly`）:

```powershell
npx tsc --noEmit
```

Expected: 无任何输出、退出码 0。

- [ ] **Step 5: 跑相关单测**

Run:

```powershell
npx vitest run test/ui/audio.spec.ts
```

Expected: `Test Files  1 passed (1)`、`Tests  21 passed (21)`。

- [ ] **Step 6: 提交**

```powershell
git add monopoly/src/ui/audio.ts monopoly/test/ui/audio.spec.ts
git commit -m "fix(mono): 修复噪声音色误赋占位对象导致的音频异常逃逸（骰子无点数/棋子不动/无事件提醒）"
```

---

### Task 3: 单测假件对齐真机语义 + 新增 2 条断言

**Files:**
- Modify: `monopoly/test/ui/audio.spec.ts:115-148`（`FakeCtx` 接口与 `fakeCtx()`）
- Modify: `monopoly/test/ui/audio.spec.ts:166-246`（`describe('audio 引擎：解锁与音效')` 内追加 2 例）

> 目标：假件**不得比真机宽松**。真机语义 = `AudioBufferSourceNode.buffer` 只接受本 ctx 产出的 `AudioBuffer`，否则抛 `TypeError`。

- [ ] **Step 1: 把 `fakeCtx()` 改成「setter 校验」版，并记录赋值**

把 `monopoly/test/ui/audio.spec.ts` 第 115–148 行（`interface FakeCtx` 到 `fakeCtx()` 结束）整段替换为：

```ts
interface FakeCtx {
  ctx: AudioCtxLike;
  starts: number[];
  freqs: number[];
  sources: number;
  /** 真正被赋给 `src.buffer` 的值（真机语义下只可能是本 ctx `createBuffer()` / `decodeAudioData()` 的返回值） */
  bufAssigns: unknown[];
}

/** 记录「哪一刻请求播放了哪个频率」，不产生真实声波；`buffer` 走 setter 校验以复刻真机语义 */
function fakeCtx(): FakeCtx {
  const starts: number[] = [];
  const freqs: number[] = [];
  const out: FakeCtx = {
    ctx: null as unknown as AudioCtxLike, starts, freqs, sources: 0, bufAssigns: [],
  };
  const node = () => ({ connect: () => {}, disconnect: () => {} });
  const param = () => ({
    value: 0,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  });
  /** 本 ctx 产出的合法 buffer（真机：只有 `AudioBuffer` 能赋给 `AudioBufferSourceNode.buffer`） */
  const legal = new Set<object>();
  const makeBuffer = (len: number) => {
    const b = { getChannelData: () => new Float32Array(len) };
    legal.add(b);
    return b;
  };
  out.ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running',
    destination: {},
    resume: () => {},
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => {
      const o = { ...node(), type: '', frequency: { value: 0 }, start: (t = 0) => { starts.push(t); freqs.push(o.frequency.value); }, stop: () => {} };
      return o;
    },
    createBufferSource: () => {
      out.sources += 1;
      const src: Record<string, unknown> = { ...node(), start: (t = 0) => { starts.push(t); }, stop: () => {} };
      let buf: unknown = null;
      Object.defineProperty(src, 'buffer', {
        get: () => buf,
        set: (v: unknown) => {
          if (v !== null && !legal.has(v as object)) {
            throw new TypeError("Failed to set the 'buffer' property on 'AudioBufferSourceNode'");
          }
          buf = v;
          out.bufAssigns.push(v);
        },
      });
      return src;
    },
    createBuffer: (_c: number, len: number) => makeBuffer(len),
    decodeAudioData: async () => makeBuffer(1),
  } as unknown as AudioCtxLike;
  return out;
}
```

- [ ] **Step 2: 新增断言一 —— 噪声 cue 不抛且 `src.buffer` 正确**

在 `describe('audio 引擎：解锁与音效（spec §5.3 / §9）', ...)` 内，`it('未解锁 → play 直接丢弃（0 次发声）；unlock 后 → 正常发声', ...)` 之后插入：

```ts
  it('噪声 cue（dice，唯一 noise 音色）不抛错，且 src.buffer 恒等于本 ctx createBuffer() 的返回值', () => {
    const f = fakeCtx();
    const e = engineWith({ createCtx: () => f.ctx, storage: fakeStorage() });
    e.unlock();
    expect(() => e.play('dice')).not.toThrow();
    /* 旧实现在这里赋 `{ noise: true }` → 真机抛 TypeError，本断言会拿到 0 次赋值 */
    expect(f.bufAssigns.length).toBe(1);
  });
```

- [ ] **Step 3: 新增断言二 —— 引擎内部异常不外抛**

紧接上一条之后插入：

```ts
  it('引擎内部异常不外抛（spec §4.2 护栏）：createOscillator 抛错时 play() 仅静默、不影响调用点', () => {
    const f = fakeCtx();
    f.ctx.createOscillator = () => { throw new Error('boom'); };
    const e = engineWith({ createCtx: () => f.ctx, storage: fakeStorage() });
    e.unlock();
    expect(() => e.play('hop')).not.toThrow();   // hop 走振荡器路径 → 命中抛错并内吞
  });
```

- [ ] **Step 4: 跑单测**

Run（cwd = `d:\zhao\monopoly`）:

```powershell
npx vitest run test/ui/audio.spec.ts
```

Expected: `Test Files  1 passed (1)`、`Tests  23 passed (23)`（原 21 + 新增 2）。

- [ ] **Step 5: 反向验证（先别提交）—— 把修复临时回退，确认新断言真的会红**

Run:

```powershell
git stash push -- monopoly/src/ui/audio.ts
npx vitest run test/ui/audio.spec.ts
git stash pop
```

Expected: `src/ui/audio.ts` 回退到旧实现时，`噪声 cue ...` 与 `引擎内部异常不外抛 ...` 两例 **FAIL**（前者 `bufAssigns.length` 为 0，后者 `play()` 抛出 `boom`）。`git stash pop` 后重跑必须回到全绿。若旧实现下仍全绿，说明假件还是太宽松 —— 回 Step 1 检查 setter。

- [ ] **Step 6: 提交**

```powershell
git add monopoly/test/ui/audio.spec.ts
git commit -m "test(mono): 音频假件对齐真机 buffer 语义，锁定噪声 cue 与内部护栏行为"
```

---

### Task 4: 线上闸门改用真实 `AudioContext`（删掉吞错假件）

**Files:**
- Modify: `monopoly/local/mono-prod-check.mjs:41-71`（`audioStub` → `realAudioProbe`）
- Modify: `monopoly/local/mono-prod-check.mjs:163-242`（音频段 8/8a/8e 的探针与口径）

> 为什么不能继续用 `AudioContextStub`：假件的 `createBufferSource()` 是普通对象，`buffer` 赋值静默成功，**把真机必抛的 `TypeError` 吞掉了**。现在改成「真实 `AudioContext` + 只在调度原型上计数」，探针本身不改变运行语义。

- [ ] **Step 1: 用 `realAudioProbe` 替换 `audioStub`**

把 `monopoly/local/mono-prod-check.mjs` 第 41–71 行（注释 + `const audioStub = () => {...}` 整段）替换为：

```js
/*
 * 「有没有真的发声」探针——**不替换 AudioContext**。
 * 历史教训（2026-09-30 事故）：用 `AudioContextStub` 顶替真机后，假件比真机宽松，
 * 把 `src.buffer = { noise: true }` 这类真机必抛的 TypeError 吞掉了，线上才炸。
 * 现在用**真实 AudioContext**，只在 Web Audio 的调度原型上包一层计数：
 * 统计 `createOscillator()` / `createBufferSource()` 的 `start()` 调用次数。
 * 断言语义与旧桩一致（都是「排了几次音」），但不放宽任何真机行为。
 */
const realAudioProbe = () => {
  window.__audioStarts = 0;
  const wrap = (proto) => {
    if (!proto || typeof proto.start !== 'function') return;
    const start = proto.start;
    proto.start = function (...a) { window.__audioStarts += 1; return start.apply(this, a); };
  };
  wrap(window.AudioBufferSourceNode && window.AudioBufferSourceNode.prototype);
  wrap(window.OscillatorNode && window.OscillatorNode.prototype);
};
```

- [ ] **Step 2: 两处 `addInitScript(audioStub)` 换成 `realAudioProbe`**

第 166 行改为：

```js
await audioPage.addInitScript(realAudioProbe);
```

第 230 行改为：

```js
await mutePage.addInitScript(realAudioProbe);
```

- [ ] **Step 3: `audioLazy` 改走既有探针 `isUnlocked()`**

把第 170–171 行替换为：

```js
facts.audioBefore = await audioPage.evaluate(() => window.__monoMain.audio.isUnlocked());
gate.audioLazy = facts.audioBefore === false;             // boot 不建 ctx（spec §9）
```

- [ ] **Step 4: `audioUnlock` / `audioPlay` 换成真机口径**

把第 176–185 行替换为：

```js
facts.audio = await audioPage.evaluate(() => ({
  unlocked: window.__monoMain.audio.isUnlocked(),
  starts: window.__audioStarts,
  dice: window.__monoMain.game.state.dice ? window.__monoMain.game.state.dice.total : null,
  prefs: window.__monoMain.audio.prefs(),
  icons: window.__monoMain.scene.instancesOf().filter((i) => i.id.startsWith('ui.sound.')).map((i) => i.id),
}));
gate.audioUnlock = facts.audio.unlocked === true;
/* 真机口径（spec §4.3b）：真实点击后要同时满足三件事——
 *   ① 页面零异常（旧版在这里抛 TypeError）；
 *   ② 确实排了音（无桩的真实 AudioContext 上仍计到 start）；
 *   ③ 画面确实推进过（paint() 执行 → 骰子点数落库在 2..12）。 */
gate.audioPlay = errors.length === 0
  && facts.audio.starts > 0
  && Number.isInteger(facts.audio.dice) && facts.audio.dice >= 2 && facts.audio.dice <= 12;
gate.audioPrefsDefault = facts.audio.prefs.sfx === true && facts.audio.prefs.bgm === true;
gate.audioIconsOn = facts.audio.icons.join(',') === 'ui.sound.on';
```

- [ ] **Step 5: `audioForceMute`（`?audio=0`）改走 `isUnlocked()`**

把第 236–241 行替换为：

```js
facts.audioForceMute = await mutePage.evaluate(() => ({
  unlocked: window.__monoMain.audio.isUnlocked(),
  starts: window.__audioStarts,
  prefs: window.__monoMain.audio.prefs(),
}));
gate.audioForceMute = facts.audioForceMute.unlocked === false
  && facts.audioForceMute.starts === 0
  && facts.audioForceMute.prefs.sfx === false && facts.audioForceMute.prefs.bgm === false;
```

- [ ] **Step 6: 确认文件里再无 `audioStub` / `__audioCtxCount`**

Run（用 Grep 工具，不是 grep 命令）:

- pattern: `audioStub|__audioCtxCount`
- path: `d:\zhao\monopoly\local\mono-prod-check.mjs`

Expected: 0 处命中。

- [ ] **Step 7: lint 该脚本（ESLint 覆盖 `src` 与 `tools`，`local` 不在内；用 Node 语法检查兜底）**

Run（cwd = `d:\zhao\monopoly`）:

```powershell
node --check local/mono-prod-check.mjs
```

Expected: 无输出、退出码 0。

---

### Task 5: 线上闸门补真机口径截图段（07 骰面点数 / 08 棋子移动 / 09 事件浮层）

**Files:**
- Modify: `monopoly/local/mono-prod-check.mjs`（在 `/* 7) 无报错 + 汇总 */` 之前插入 8f 段；并更新末尾 `facts.screenshots` 列表）

> spec §5.6 要求 3 张 390×844 @dpr2 截图作为「真机口径修复」证据。放在本闸门里与既有 `mono-prod-05/06` 同源同规。**这一段必须真实手势 + 真实 AudioContext**（否则又是「假件掩盖真机」）。

- [ ] **Step 1: 插入 8f 截图段**

在 `monopoly/local/mono-prod-check.mjs` 的 `/* 7) 无报错 + 汇总 */` 之前插入：

```js
/* 8f) 真机口径回归截图（spec §5.6）：真实手势 + 真实 AudioContext —— 无桩因果链上取证 */
const fixPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(fixPage);
await fixPage.addInitScript(realAudioProbe);
await fixPage.goto(`${ORIGIN}/mono.html?humans=1&tour=0&seed=20260928`, { waitUntil: 'networkidle' });
await fixPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

const fixPrimary = fixPage.locator('#mono-hud button[data-primary]');

/* 07）真实点击「掷骰」→ 等动效到终帧 → 骰面必须显示出点数 */
await fixPrimary.click();
await fixPage.waitForFunction(() => window.__monoMain?.game?.state?.dice?.total, null, { timeout: 8000 });
await fixPage.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 8000 }).catch(() => {});
await fixPage.screenshot({ path: `${OUT}/mono-prod-07-dice-pips.png` });
facts.fixDice = await fixPage.evaluate(() => ({
  total: window.__monoMain.game.state.dice.total,
  phase: window.__monoMain.game.state.phase,
  unlocked: window.__monoMain.audio.isUnlocked(),
}));
gate.fixDice = facts.fixDice.unlocked === true
  && facts.fixDice.phase === 'rolled'
  && Number.isInteger(facts.fixDice.total)
  && facts.fixDice.total >= 2 && facts.fixDice.total <= 12;

/* 08）真实点击「前进」→ 动效进行中截「棋子移动」帧 */
await fixPrimary.click();
await fixPage.waitForFunction(() => window.__monoMain.fx?.busy?.() === true, null, { timeout: 8000 }).catch(() => {});
await fixPage.screenshot({ path: `${OUT}/mono-prod-08-pawn-move.png` });
facts.fixMove = await fixPage.evaluate(() => ({
  phase: window.__monoMain.game.state.phase,
  pos: window.__monoMain.game.state.players.map((p) => p.pos),
}));
gate.fixMove = facts.fixMove.pos[0] > 0;   // 以「人物确实前进了」为准（不依赖能否抓到中间帧）

/* 09）继续推进（AI 回合走 skipRest）直到落事件格、浮层展开，再截图 */
for (let i = 0; i < 80; i += 1) {
  const st = await fixPage.evaluate(() => {
    const m = window.__monoMain;
    const s = m.game.state;
    return {
      over: s.over,
      isHuman: m.seats[s.current] === null,
      phase: s.phase,
      lastDraw: Boolean(s.lastDraw),
      drawClose: document.querySelector('#mono-panels button[data-action="card:close"]') !== null,
    };
  });
  if (st.over || (st.phase === 'settled' && st.lastDraw)) break;
  if (st.isHuman) {
    const sel = st.drawClose
      ? '#mono-panels button[data-action="card:close"]'
      : '#mono-hud button[data-primary]';
    await fixPage.locator(sel).click({ timeout: 5000 }).catch(() => {});
    await fixPage.waitForTimeout(40);
  } else {
    await fixPage.evaluate(() => window.__monoMain.aiDriver.skipRest());
    await fixPage.waitForTimeout(20);
  }
}
await fixPage.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 8000 }).catch(() => {});
await fixPage.screenshot({ path: `${OUT}/mono-prod-09-event.png` });
facts.fixEvent = await fixPage.evaluate(() => {
  const s = window.__monoMain.game.state;
  return {
    overlayDraw: s.phase === 'settled' && Boolean(s.lastDraw),
    deck: s.lastDraw ? s.lastDraw.deck : null,
    round: s.round,
    panels: document.querySelector('#mono-panels') ? document.querySelector('#mono-panels').children.length : 0,
  };
});
gate.fixEvent = facts.fixEvent.overlayDraw === true;
await fixPage.close();
```

- [ ] **Step 2: 把 3 张新截图登记进 `facts.screenshots`**

把末尾第 246–254 行的 `facts.screenshots` 数组替换为：

```js
facts.screenshots = [
  `${OUT}/mono-prod-00-default.png`,
  `${OUT}/mono-prod-01-board.png`,
  `${OUT}/mono-prod-02-play.png`,
  `${OUT}/mono-prod-03-skin-photo.png`,
  `${OUT}/mono-prod-04-ai-seat.png`,
  `${OUT}/mono-prod-05-audio-on.png`,
  `${OUT}/mono-prod-06-audio-off.png`,
  `${OUT}/mono-prod-07-dice-pips.png`,
  `${OUT}/mono-prod-08-pawn-move.png`,
  `${OUT}/mono-prod-09-event.png`,
];
```

- [ ] **Step 3: 语法检查**

Run（cwd = `d:\zhao\monopoly`）:

```powershell
node --check local/mono-prod-check.mjs
```

Expected: 无输出、退出码 0。

---

### Task 6: e2e 闸门首个动作改真实手势（真正触发 `unlock()`）

**Files:**
- Modify: `monopoly/local/mono-e2e-playthrough.mjs:108-132`（`click` 助手）
- Modify: `monopoly/local/mono-e2e-playthrough.mjs:39`（`facts` 初始化）、`:204-215`（循环内首个点击与探针）、`:246` 附近（gate）

> 盲区根因：合成 `el.click()` **不派发 `pointerdown`**，而 `main.ts:129` 的解锁监听是 `window.addEventListener('pointerdown', ...)` → `unlock()` 从未执行 → `ctx === null` → `play()` 在早退分支直接返回，整条发声链压根没走到。只把**首个**点击改真实，其余保持合成以守住 973 次点击的墙钟预算。

- [ ] **Step 1: 给 `click` 助手加 `real` 分支**

把 `monopoly/local/mono-e2e-playthrough.mjs` 第 108–132 行（`click` 助手整段）替换为：

```js
/**
 * 真实交互：默认在命中层派发合成 `click`（快，撑得住近千次点击的墙钟预算）；
 * `real === true` 时改用 Playwright **真实鼠标点击**——只有它会派发 `pointerdown`，
 * 从而触发 `main.ts` 的 `audio.unlock()`（spec §4.3c）。
 * 若元素缺失或 disabled → 直接抛错（即 UI 命中层缺陷），不静默跳过。
 * 只在「状态未变」时重试，杜绝重复触发。
 */
const click = async (sel, sigBefore, real = false) => {
  for (let i = 0; i < 3; i += 1) {
    try {
      if (real) {
        await page.locator(sel).click({ timeout: 5000 });
      } else {
        await page.evaluate((s) => {
          const el = document.querySelector(s);
          if (!el) throw new Error(`命中层缺失 ${s}`);
          if (el.disabled) throw new Error(`命中键被禁用 ${s}`);
          el.click();
        }, sel);
      }
    } catch (e) {
      if (i === 2) throw e;
    }
    await page.waitForTimeout(8);
    const st = await readState();
    if (sig(st) !== sigBefore) return st;
  }
  return readState();
};
```

- [ ] **Step 2: `facts` 初始化加 `audioUnlocked`**

把第 39 行替换为：

```js
const facts = { tally: {}, clicks: 0, shots: {}, audioUnlocked: null };
```

- [ ] **Step 3: 首个动作点击走真实手势，并立即采探针**

把第 207 行替换为：

```js
    const next = await click(sel, before, facts.clicks === 0);   // 首个动作走真实手势 → pointerdown → unlock()
```

把第 212–215 行（`facts.clicks += 1;` 之后的几行）替换为：

```js
    facts.clicks += 1;
    if (facts.clicks === 1) {
      facts.audioUnlocked = await page.evaluate(() => window.__monoMain.audio.isUnlocked());
    }
    facts.tally[action] = (facts.tally[action] ?? 0) + 1;
    s = next;
    facts.minAudioKeys = Math.min(facts.minAudioKeys, s.audioKeys);
```

- [ ] **Step 4: 新增 gate `audio_unlocked`**

在 `gate.audio_keys = facts.minAudioKeys === 2;` 之后插入：

```js
  gate.audio_unlocked = facts.audioUnlocked === true;   // 真实手势确实建起了 AudioContext
```

> `errors` 的显式断言已存在（`finally` 里的 `gate.noErrors = errors.length === 0`），无需重复新增。

- [ ] **Step 5: 语法检查**

Run（cwd = `d:\zhao\monopoly`）:

```powershell
node --check local/mono-e2e-playthrough.mjs
```

Expected: 无输出、退出码 0。

- [ ] **Step 6: 提交（闸门三处 + e2e）**

```powershell
git add monopoly/local/mono-prod-check.mjs monopoly/local/mono-e2e-playthrough.mjs
git commit -m "test(mono): 线上闸门改用真实 AudioContext，e2e 首个动作走真实手势解锁音频"
```

---

### Task 7: 本地全量校验（lint + 单测 + 类型 + 构建 + preview 双闸门）

**Files:** 无改动（纯验证）

- [ ] **Step 1: `npm run check`（lint + lint:skin + test）**

Run（cwd = `d:\zhao\monopoly`）:

```powershell
npm run check
```

Expected:

- `npm run lint` → 0 错
- `npm run lint:skin` → `[skin:default] OK`、`[skin:photo] OK`
- `vitest run` → `Test Files  51 passed (51)`、`Tests  435 passed (435)`（修复前 433 例 + 本任务新增 2 例）

- [ ] **Step 2: 类型检查**

Run:

```powershell
npx tsc --noEmit
```

Expected: 无输出、退出码 0。

- [ ] **Step 3: 本地构建**

Run:

```powershell
npm run build
```

Expected: `check-hardcoded` 通过 + `vite build` 成功，产出 `dist/mono.html` 与 `dist/assets/*`。

- [ ] **Step 4: 起本地 preview（后台常驻，52301）**

Run（后台运行，不要等待结束）:

```powershell
npm run preview
```

Expected: `Local: http://localhost:52301/`。**保持该进程运行**，后续两个闸门与截图都打它。

- [ ] **Step 5: 本地跑线上闸门（含新截图段）**

Run（cwd = `d:\zhao\monopoly`）:

```powershell
$env:MONO_ORIGIN='http://127.0.0.1:52301'; node local/mono-prod-check.mjs; $env:MONO_ORIGIN=$null
```

Expected: JSON 里 `gate` **全 `true`**（含新增 `fixDice` / `fixMove` / `fixEvent`）、`errors: []`、退出码 0；`docs/verify/mono-prod-07-dice-pips.png`、`-08-pawn-move.png`、`-09-event.png` 三张落盘。

> **风险口径（spec §7 第 2 行）：** 若 headless 环境构造不出 `AudioContext`（`unlocked` 恒 `false`），`audioUnlock` / `fixDice` 会失败。**此时必须显式报告，不得静默放宽 gate**，也不得把探针改回桩。

- [ ] **Step 6: 本地跑 e2e 整局闸门**

Run:

```powershell
$env:MONO_ORIGIN='http://127.0.0.1:52301'; node local/mono-e2e-playthrough.mjs; $env:MONO_ORIGIN=$null
```

Expected: `[e2e:play] PASS`、`gate` 全 `true`（含新增 `audio_unlocked`）、`errors: []`、退出码 0，摘要里 `clicks > 0` 且 `tally.roll > 0`。

- [ ] **Step 7: 复跑临时探针做端到端确认**

Run:

```powershell
$env:MONO_ORIGIN='http://127.0.0.1:52301'; node local/_tmp-real-probe.mjs; $env:MONO_ORIGIN=$null
```

Expected: `errors = []`（**两条 `pageerror` 都消失**）；`=== B2 点掷骰后 ===` 快照里 `phase: "rolled"`、`dice.total` 在 2..12；`=== B3 点前进后 ===` 快照里 `pos[0] > 0`（人物真的前进了）。

---

### Task 8: 操作手册新增「M12 真机音频解锁回归」并修正 M11-7 口径

**Files:**
- Modify: `monopoly/docs/manual-mono.md:236-249`（M11 节，修正 M11-7 的探针）
- Modify: `monopoly/docs/manual-mono.md:251-264`（最终验收表新增一行）

- [ ] **Step 1: 修正 M11-7（`__audioCtxCount` 已随假件一并删除）**

把 `monopoly/docs/manual-mono.md:245` 整行替换为：

```
| M11-7 | `mono.html?audio=0` | 全程静音，且 `window.__monoMain.audio.isUnlocked() === false`（**不创建** `AudioContext`） | — |
```

- [ ] **Step 2: 在 M11 节之后插入 M12 小节**

在 `monopoly/docs/manual-mono.md` 的 `### 最终验收（对照 spec §11 硬性标准）` 之前插入：

```markdown
### M12 真机音频解锁回归（2026-09-30 事故修复）

> 事故现象（同源四症状）：**骰子没有点数 · 游戏无法运行 · 人物没有前进 · 没有事件提醒**。
> 根因：`src/ui/audio.ts` 的 `tone()` 噪声分支把占位对象 `{ noise: true }` 赋给 `AudioBufferSourceNode.buffer`
> ——真机 WebIDL 类型化属性必抛 `TypeError`。唯一噪声音色 `rattle` 就是默认的掷骰音（`DEFAULT_SFX.dice`），
> 而 `audio.play()` 在 `main.ts` 的 `runAction` 里位于 `paint()` **之前** → 异常逃逸 ⇒
> 状态已落库（`phase='rolled'`、点数已生成）但画面停帧（`pos` 不变、骰面无点数、面板不更新）；
> 第二次点主按钮直接报 `[mono] rollDice @phase=rolled`，整局卡死。
>
> 闸门盲区（为什么 433 例单测 + 两个线上闸门全绿却线上坏）：
>
> | 覆盖方 | 真实手势（`pointerdown` → `unlock()`） | 真实 `AudioContext` | 结果 |
> |---|---|---|---|
> | `test/ui/audio.spec.ts` | 不适用（纯注入装配） | ❌ 假件 `createBufferSource()` 是普通对象，`buffer` 赋值静默成功 | 测不到 |
> | `local/mono-prod-check.mjs` | ✅ `locator().click()` | ❌ `addInitScript` 装了 `AudioContextStub` | 假件吞掉 `TypeError` |
> | `local/mono-e2e-playthrough.mjs` | ❌ 全是合成 `el.click()`（不派发 `pointerdown`） | ✅ 无桩 | `ctx === null` → `play()` 早退 |
>
> 修复三处：① 噪声分支保留 `createBuffer()` 的返回值赋给 `src.buffer`；② `SrcLike.buffer` 收紧为
> `AudioBufferLike | null`（同类 bug 从此在 `npx tsc --noEmit` 阶段即失败）；③ `play()` 整体 `try/catch`
> ——护栏在引擎内部收口，**不在** `runAction` 加 catch（那会吞掉状态机自身缺陷）。

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M12-1 | 手机打开 `mono.html?humans=1&tour=0`，点「掷骰」 | **骰面显示出点数**（2..12）、主按钮转「前进」、全程无 `pageerror` | `mono-prod-07-dice-pips.png` |
| M12-2 | 点「前进」 | **棋子逐格前进**（`pos[0] > 0`）、落格结算正常 | `mono-prod-08-pawn-move.png` |
| M12-3 | 继续推进到命运 / 机会格 | **事件浮层正常展开**（`phase='settled'` 且 `lastDraw` 非空） | `mono-prod-09-event.png` |
| M12-4 | 刷新后重复 M12-1..3 | 不再出现「第二次点主按钮报 `rollDice @phase=rolled`」的卡死 | — |

**新增闸门口径**（`local/mono-prod-check.mjs`）：
- 探针从「替换 `AudioContext` 的假件」改为「真实 `AudioContext` + 在 `AudioBufferSourceNode.prototype` / `OscillatorNode.prototype` 上计数 `start()`」；
- `audioLazy` / `audioUnlock` / `audioForceMute` 改走既有探针 `window.__monoMain.audio.isUnlocked()`；
- `audioPlay` = 页面零 `errors` **且** 真实点击后 `game.state.dice.total ∈ 2..12`（证明 `paint()` 确实执行过）；
- 新增 `fixDice` / `fixMove` / `fixEvent` 三项与 3 张截图。

**新增闸门口径**（`local/mono-e2e-playthrough.mjs`）：首个动作点击改走 Playwright **真实鼠标点击**（其余保持合成以守住墙钟预算），新增 `gate.audio_unlocked`（真实手势确实建起了 `AudioContext`）；`gate.noErrors` 原本已有。
```

- [ ] **Step 3: 最终验收表补一行**

在 `monopoly/docs/manual-mono.md` 的最终验收表末尾（`| 10 | **M11 音效与音乐...` 那一行之后）追加：

```
| 11 | **M12 真机音频解锁回归（本任务新增，超出 spec §11）** | `npm run check` 全绿（51 文件 / 435 例）/ `npx tsc --noEmit` 无错；本地 preview（52301）与线上双闸门全绿且 `errors=[]`，`mono-prod-check.mjs` 全部 gate 为 `true`（音频项改真机口径：`audioLazy`/`audioUnlock`/`audioForceMute` 走 `isUnlocked()`、`audioPlay` 走 `dice.total`；并新增 `fixDice`/`fixMove`/`fixEvent`）、`mono-e2e-playthrough.mjs` 新增 `audio_unlocked`；3 张 390×844 @dpr2 截图（`mono-prod-07-dice-pips` / `-08-pawn-move` / `-09-event`）；根因与闸门盲区详见 M12 节 |
```

- [ ] **Step 4: 提交**

```powershell
git add monopoly/docs/manual-mono.md
git commit -m "docs(mono): 手册新增 M12 真机音频解锁回归，修正 M11-7 探针口径"
```

---

### Task 9: 清理临时文件 → 部署 → 线上双闸门回归

**Files:**
- Delete: `monopoly/local/_tmp-real-probe.mjs`、`monopoly/docs/verify/_tmp-real-probe.png`
- Deploy: 由 `scripts/deploy-mono.mjs` 负责（本地构建 → scp → 服务器仅解压 + `pm2 restart`；**绝不在服务器构建**）

- [ ] **Step 1: 停掉本地 preview 进程**

用 StopCommand 停掉 Task 7 Step 4 起的 `npm run preview`（端口 52301），避免占端口 / 干扰后续。

- [ ] **Step 2: 部署（本地构建 → scp → 服务器仅解压/重启）**

Run（cwd = `d:\zhao\monopoly`）:

```powershell
node d:\zhao\scripts\deploy-mono.mjs
```

Expected: 七步契约全部成功、三项字节数校验通过、生成一份新备份；结尾给出线上 `ORIGIN`（`https://game.joho.cn/tour`）。

> 若脚本报出「需要补充 / 待处理事项」，**先停下并提醒用户**，处理完再一并收口（推送 + 部署），不留半成品。

- [ ] **Step 3: 线上跑两个闸门（真机口径最终验收）**

Run（cwd = `d:\zhao\monopoly`）:

```powershell
node local/mono-prod-check.mjs
node local/mono-e2e-playthrough.mjs
```

Expected:

- `mono-prod-check.mjs`：`gate` 全 `true`（含 `fixDice` / `fixMove` / `fixEvent`）、`errors: []`、退出码 0；
- `mono-e2e-playthrough.mjs`：`[e2e:play] PASS`、`gate.audio_unlocked === true`、`errors: []`、退出码 0。

- [ ] **Step 4: 线上再跑一次事故复现脚本，直接对比修复前后的症状**

Run（**必须在删文件之前做**；cwd = `d:\zhao\monopoly`）:

```powershell
node local/_tmp-real-probe.mjs
```

Expected: `errors = []`（修复前那两条 `pageerror` 都消失）；`=== B2 点掷骰后 ===` 快照 `phase: "rolled"` 且 `dice.total ∈ 2..12`；`=== B3 点前进后 ===` 快照 `pos[0] > 0`（人物真的前进了）。这四条正是 spec §5.1 / §5.2 的线上硬性标准。

- [ ] **Step 5: 删临时文件**

用 DeleteFile 工具删除 `monopoly/local/_tmp-real-probe.mjs` 与 `monopoly/docs/verify/_tmp-real-probe.png`，然后确认工程内再无残留：

- Grep pattern: `_tmp-real-probe`，path: `d:\zhao\monopoly` → Expected: 0 处命中

- [ ] **Step 6: 提交剩余改动并推送**

```powershell
git status --short
git add monopoly/docs/verify/mono-prod-07-dice-pips.png monopoly/docs/verify/mono-prod-08-pawn-move.png monopoly/docs/verify/mono-prod-09-event.png
git add -u monopoly/local/
git commit -m "chore(mono): 删除事故复现临时脚本，入库 M12 三张真机口径回归截图"
git push origin master
```

Expected: `git status --short` 里不再有本任务相关的未跟踪/未提交文件（仓库根其它无关 untracked 文件应保持原样，**不要** `git add -A`）。

---

## 验收对照（spec §5）

| spec §5 条目 | 本计划落点 |
|---|---|
| 1. 线上点「掷骰」→ `errors` 空、骰面有点数、主按钮转「前进」 | Task 9 Step 3（`fixDice`）+ Task 9 Step 4 |
| 2. 点「前进」→ 棋子移动、落格结算 / 事件浮层正常 | Task 9 Step 3（`fixMove` / `fixEvent`） |
| 3. `npm run check` 全绿、`npx tsc --noEmit` exit 0 | Task 7 Step 1–2 |
| 4. 本地 preview（52301）双闸门全绿（含 `audioUnlocked` 口径） | Task 7 Step 5–6 |
| 5. 部署后线上重跑同一对闸门，全绿、`errors=[]` | Task 9 Step 3 |
| 6. 390×844 @dpr2 手机视口截图 ≥3 张，补进手册 | Task 5 + Task 8 |
| 7. 手册新增「M12 真机音频解锁回归」小节 | Task 8 Step 2–3 |
| §4.2 护栏在引擎内、不在 `runAction` | Task 2 Step 2 |
| §4.1 第 3 项 类型收紧（`SrcLike.buffer` 等 5 处） | Task 1 Step 1–3 |
| §4.4 明确不做（不动 BGM 排程 / file 轨 / `fx` / 音色表 / 音量） | 全计划无相关改动 |

## 风险与对策（spec §7 复核）

| 风险 | 本计划对策 |
|---|---|
| 真实 `AudioContext` 在 headless 可能 `suspended` | 断言只依赖 `isUnlocked()`、`start()` **调用计数**与「零 `pageerror`」，**不依赖实际出声** |
| headless 完全构造不出 `AudioContext` | `defaultCreateCtx()` 已有 `try/catch → null` 回退；若为 `null`，`audioUnlock` / `fixDice` 会红 —— **必须在报告中显式说明，不得静默放宽 gate，也不得把探针改回桩**（Task 7 Step 5 已写明） |
| e2e 首个点击改真实手势后可能被遮挡 | `locator().click({ timeout: 5000 })` + 既有「点击后状态未变即判 UI 缺陷」逻辑 + 3 次重试；仍失败则 `fatal` 上抛（不静默） |
| `play()` 兜底吞掉未来真实音频缺陷 | Task 3 Step 3 用「抛错 ctx」显式锁定「吞掉但游戏继续」；页面级异常仍由 `gate.noErrors` / `gate.audioPlay` 的 `errors` 断言可见 |
| Task 5 的 8f 段在无头环境可能抓不到中间帧 | 截图段不 gate「中间帧」；`waitForFunction` 均带 `.catch(() => {})`，只 gate 文件可见的终态（`fixDice` / `fixMove` / `fixEvent`） |

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-30-monopoly-audio-escape-fix.md`.**
