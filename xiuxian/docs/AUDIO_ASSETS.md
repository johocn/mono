# 音频资产规范（阶段2 · A）

> 目标：消灭「零资产」硬伤——音效 + 国风 BGM 由 `Sfx.ts` 真实优先播放，缺失时回退程序化合成。

## 资产目录
```
public/audio/
  sfx_<name>.wav   27 个音效（打击/施法/UI/受击/升级…）
  bgm_<theme>.wav  4 个国风五声音阶循环（title / explore / battle / boss）
```

## 生成（自生成 CC0，无版权问题）
```bash
python scripts/gen-audio.py     # 用 numpy 程序化合成，零额外依赖
```
- 音效：噪声爆发 + 谐波 + ADSR 包络（比 WebAudio 实时振荡器更可控）
- BGM：宫商角徵羽五声音阶，古筝拨弦包络 + 低音垫，按主题不同根音/节奏
- 想重新生成或调整音色，改 `scripts/gen-audio.py` 后重跑

## 替换专业素材（Freesound / OpenGameArt，CC0 / CC0-compatible）
1. 去 Freesound（freesound.org）搜关键词：`impact`、`magic cast`、`ui click`、`hurt`、`level up`、`guqin loop`、`erhu` 等，**只选 CC0 或 CC0-compatible**（避开 GPL/NC/ND）
2. 下载后**保持文件名不变**覆盖 `public/audio/sfx_<name>.wav` / `bgm_<theme>.wav` 即可生效（`Sfx.ts` 按文件名加载，无需改代码）
3. 新增音效：在 `gen-audio.py` 的 `names` 名单 + `Sfx.synth` 的 switch 加兜底即可

## 加载机制（`src/core/Sfx.ts`）
- 首次 `ensure()` 触发 `loadAudioAssets()`（fire-and-forget），预加载全部 wav
- `play(name)`：有真实 buffer 则播放文件，否则 `synth()` 程序化兜底——**调用方 `sfx.click()` 等接口完全不变**
- BGM：`tickBgm()` 真实循环文件优先，缺失走原程序化琶音
- 任何环境不支持 AudioContext 时静默降级，绝不影响逻辑
- 静音：`sfx.muted = true`（BGM 实时停止，音效静默）

## 验证
- 类型/逻辑：`npm run typecheck` + `npm test`（1177 断言）已绿
- 听感：浏览器打开 `localhost:5180`，强刷（Ctrl+F5）清纹理缓存；战斗/施法/UI/升级应有真实音效，标题/探索/战斗/BOSS 各有国风 BGM
