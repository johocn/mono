# 发行清单 · itch.io / Steam

> 适用：本工程 `vite` 多页构建（主游戏 `index.html` + 编辑器 `editor.html`），`base: "./"` 已设为相对路径，可子路径托管。
> 一键打包：`npm run release` → 产出 `release/xiuxian-itch.zip`（含最新 `dist/`）。

## 0. 发布前（必做）
- [ ] `git status` 确认以下内容已提交并 push 到 `johocn/mono`（否则 CI 不会跑，且发布的是旧代码）：
  - 新增 `public/audio/`(31) · `public/assets/tiles/`(7) · `public/data/override.json`
  - `src/core/Ambience.ts` · `src/editor/*` · `editor.html`
  - `src/Game.ts`(安全区) · `src/core/Sfx.ts` · `src/data/override.ts` · `vite.config.ts`(base+editor 入口)
- [ ] 内容终校：用 `http://localhost:5180/editor.html` 调表，导出 `override.json` 落 `public/data/`，确认数值平衡。
- [ ] 本地 `npm run build` 通过、`node test/smoke.cjs` 全绿（1177/0）。
- [ ] 资产齐备：`public/libs/laya.ani.js`（骨骼运行时，缺失仅走代码骨骼兜底，不影响运行）。

## 1. 打包
- [ ] `npm run release`（自动 `build` + 压缩）。产物：`release/xiuxian-itch.zip`。
- [ ] 校验 zip 根目录含 `index.html`（非 `dist/index.html` 嵌套），否则 itch 找不到入口。

## 2. 上传 itch.io
- [ ] 新建项目，类型选 **HTML**（或在「Kind of project」选 HTML）。
- [ ] 「Uploads」上传 `xiuxian-itch.zip`；勾选 **This file will be played in the browser**。
- [ ] 视口设置：建议「Fullscreen / 撑满窗口」，移动端勾选「Mobile-friendly」（竖屏提示已在游戏内）。
- [ ] 填 cover / 截图（可用 `test/` 截图或 `sandbox/live2d/shot.png` 占位）、简介、标签（修仙/国风/Roguelike）。
- [ ] 价格：Free 或自定义；`privacy`/`terms` 如需要可补。
- [ ] 发布后自测：桌面 + 手机各开一局，确认音频/瓦片/对话/移动控件（安全区内缩）正常。

## 3. Steam（另行评估，非纯静态包）
- [ ] 纯静态 web 构建需套原生壳：Steam SDK（官方）或 Electron/WebView 封装。
- [ ] 申请 Steamworks 资质、AppID、建项、上传构建、填商店页。
- [ ] 云存档/成就若接入，需实现 Steam API 桥接（超出当前 MVP 范围）。

## 4. 发布后运营（数据层已就绪，待部署）
- [ ] 留存系统已在 `data/`：战令（battlepass）/ 签到（dailyCheckin）/ 社交（social）—— 接真实云后端端点后即可在线运营。
- [ ] 启用 GitHub Actions CI（`npm test` + 浏览器冒烟），保证每次发布前自动回归。
- [ ] 视觉回归基线：本地跑 `node test/visual-regression.cjs` 刷新截图基线（CI 软检查，非阻塞）。

## 已知延后项（不影响发布）
- Live2D 剧情演出 / 运行时 AI 叙事：高风险，留作「表现层深化」专项，待 SDK 资产 + 预算 go/no-go 后评估。
- 当前角色表现由程序化 `Rig`（呼吸/基础动作）兜底，发布即完整可玩。
