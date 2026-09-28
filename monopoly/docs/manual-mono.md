# 大富翁 · 吉林双阳邻里商业版 操作手册与测试用例

## 1. 启动与调试

| 项 | 值 |
|---|---|
| 本地开发 | `npm run dev` → http://127.0.0.1:52300/mono.html |
| 移动视口预览 | Playwright `viewport=390×844, deviceScaleFactor=2` |
| 构建 | `npm run build` → `release/mono.html` + `release/js/mono.js` |
| 校验 | `npm run check`（lint + lint:skin + test） |

URL 参数：`?skin=<id>`（切皮肤）· `?debug=1`（显示元素 ID/包围盒/depth/provider 回退级别）· `?seed=<n>` · `?speed=<n>`。

## 2. 测试用例

### M1 工程骨架

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M1-1 | 打开 `mono.html?debug=1` | 出现 390×844 画布、底部 debug 面板、无控制台错误 | `mono-m1-01-boot.png` |
| M1-2 | `npm run lint:skin` | `[skin:default] OK` | — |
| M1-3 | 在 `src/render/*.ts` 写一个 `#ff0000` 或 `26` | `npm run lint` 报错 | — |

### M2 等距棋盘

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M2-1 | 打开 `mono.html?debug=1` | 32 个菱形地砖，类型配色正确（core/shop/chance/fate/bonus/jail/stock） | `mono-m2-01-board.png` |
| M2-2 | 观察内环 | 草地/石板路/广场分区正确，中心喷泉可见，8 栋装饰楼压暗 | `mono-m2-02-board-inner.png` |
| M2-3 | 检查 32 个字牌 | 全部汉字店名可读、无一被前排建筑遮挡 | `mono-m2-03-board-labels.png` |
| M2-4 | 观察当前格 | 四枚棋子一排站在格前沿，未盖格名；当前格金框高亮 | `mono-m2-04-board-pawns.png` |

### M3 三级建筑与地块橱窗

| # | 步骤 | 期望 | 截图 |
|---|---|---|---|
| M3-1 | 打开 `mono.html?debug=1&show=0` | 32 格上的等距楼按层级成形：L1 坡顶摊位、L2 两层暖光窗 + 金色店招、L3 玻璃幕墙 + 霓虹 + 招牌塔 + 天线；店招文字随墙面角度旋转（约 −26.57°） | `mono-m3-01-board.png` |
| M3-2 | 打开 `mono.html?debug=1&show=b` | 地块橱窗 B 版式：夜空渐变 + 月亮 + 亮窗天际线 + 石板广场 + 两树两灯 + 温泉馆（出檐 / 竖招牌「温泉」/ 双灯笼「汤」/ 池面蒸汽）+ 顶部药丸 + 底部信息条 | `mono-m3-02-showcase-b.png` |
| M3-3 | 打开 `mono.html?debug=1&show=c` | C 版式三级对照：三张等宽迷你卡同一地平线，L1/L2/L3 体量差一眼可辨；卡下标签 `L1 摊位 · ￥60` / `L2 门店 · ￥180` / `L3 商超楼 · ￥420` 字号一致 | `mono-m3-03-codex-c.png` |
| M3-4 | 右下角版式切换行点「棋盘 / 橱窗 B / 对照 C」 | 只改 URL 的 `show` 参数并重载，画面随之更换 | — |
| M3-5 | 打开 `mono.html?debug=1&skin=photo&show=0` | **零代码换风格**：中心喷泉 / 两棵树 / 四盏灯 / 玩家一棋子变图片素材，其余仍是默认皮肤；控制台执行 `__monoMain.missingAssets.length` 得 `0` | `mono-m3-04-skin-photo-board.png` |
| M3-6 | 打开 `mono.html?debug=1&skin=photo&show=c` | 三张迷你卡变图片素材（`tex/card.png`），卡下标签文字仍由文字通道绘制、字号不变 | `mono-m3-06-skin-photo-codex-c.png` |
| M3-7 | 跑 `node local/mono-shots-m3.mjs` | 6 张 390×844 @dpr2 截图入库，`gate` 全 `true`、`errors` 为空 | 上述全部 |

**v5 对齐结论**：M3-1 / M3-2 / M3-3 三张截图已与 `v5-A.png` / `v5-B.png` / `v5-C.png` 目视对齐。两处**有意偏差**：① 迷你卡天际线高度分档做 `((lx % 3) + 3) % 3` 归一化（v5 负 `px` 会算出负楼高）；② v5 卡外标签是 HTML `div`，本工程改用文字通道画在卡下方、字号不随卡缩放。