# game.joho.cn 首页设计 + 消消乐部署 + 别名入口

**日期**：2026-09-27  
**作者**：brainstorming 流程  
**状态**：已批准 → 待实现

---

## §1 最终决策汇总

| 项 | 决定 | 备注 |
|---|---|---|
| 首页方案 | 方案 A · 古城志（Hero 大图 + 分类卡片网格） | 东方雅致风，琥珀金配色 |
| 首页部署位置 | `/tour/home.html` | 新建单文件 HTML |
| 根路径 `/` | nginx 改为 302 → `/tour/home.html` | 替换现有 `return 302 /tour/` |
| 消消乐 | 部署到 `/tour/xxl.html` | 复用 `xiaoxiaole/bin/` 现有产物 |
| 斗地主 | **本轮跳过** | 首页占位卡片「即将上线」 |
| `/tour/town.html` | 静态 HTML 重定向 → `/tour/index.html` | 2 行 meta refresh |
| `/tour/chees.html` | 静态 HTML 重定向 → `/tour/chess.html` | 2 行 meta refresh |
| 已上线入口不变 | `/tour/` · `tower.html` · `chess.html` · `sanguo.html` · `/jianghu/` · `/jianghu1/` · `/client/` | 全部不动 |

---

## §2 首页 home.html 架构

### 2.1 技术属性

- **纯静态单文件**：HTML + 内联 CSS，**零 JS 依赖**，无外部图片，零美术资源
- **移动端优先**：设计基准 390×844（375×812 + 16px padding），桌面端居中展示
- **无构建步骤**：直接写好即可，无需 esbuild/nuxt/vite
- **体积预估**：约 6–8 KB（HTML + CSS）

### 2.2 区块结构

```
┌─────────────────────────────────────┐
│ Hero 大图区（16:10 渐变 + 🏯 图标）  │
│   标题：古城镇                        │
│   副标题：一座城 · 一段故事 · 一场游戏│
│   3 个 chip：🏯 游览 · ⚔️ 策略 · 📖 江湖│
├─────────────────────────────────────┤
│ 游览体验                              │
│ ┌─────────────────────────────────┐ │
│ │ TOUR 古城镇 · 旅游场景           │ │  featured 卡（grid span 2）
│ │ NPC 对话·砍树搭桥·任务链·存档背包│ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ 策略游戏                              │
│ ┌────────────┬────────────────────┐ │
│ │ 汉字塔防    │ 三国·合成塔防       │ │ 三国 featured（span 2）
│ └────────────┴────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 汉字自走棋                       │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ 江湖叙事                              │
│ ┌────────────┬────────────────────┐ │
│ │ 游吉林市    │ 江湖录·行脚图 A     │ │
│ └────────────┴────────────────────┘ │
├─────────────────────────────────────┤
│ 休闲小游戏（即将上线）                  │
│ ┌────────────┬────────────────────┐ │
│ │ 消消乐      │ 斗地主             │ │
│ └────────────┴────────────────────┘ │
├─────────────────────────────────────┤
│ Footer                               │
└─────────────────────────────────────┘
```

### 2.3 游戏卡片配色表（单源，写死在 home.html 的 CSS 类里）

| 游戏 | 主色 | 辅色 | 文字色 | 缩略图 wordmark |
|---|---|---|---|---|
| 古城镇 TOUR | `#e8d5b7` | `#c9a96e` | `#6b4423` | `TOUR` |
| 汉字塔防 TWR | `#f5deb3` | `#8b4513` | `#2d1810` | `TWR` |
| 汉字自走棋 CHS | `#d4c5a9` | `#6b5b3a` | `#2a2010` | `CHS` |
| 三国合成塔防 SG | `#e8a87c` | `#a83232` | `#2a0808` | `SG` |
| 游吉林市北上 JH1 | `#9ba3b0` | `#3a4553` | `#f8f5f0` | `JH1` |
| 江湖录·行脚图 A JH2 | `#a8d8a8` | `#2d5a2d` | `#1a2d1a` | `JH2` |
| 消消乐 XXL | `#ffc9de` | `#ff80a8` | `#8b1a3a` | `XXL` |
| 斗地主 DDZ（占位）| `#d4efdf` | `#1e8449` | `#0a2d1a` | `DDZ` |

### 2.4 Hero 区块

- 16:10 容器（aspect-ratio: 16/10）
- 背景：`linear-gradient(135deg, #8b5a2b 0%, #d4a574 40%, #6b4423 100%)`
- 右上装饰 emoji：🏯（`position: absolute; top:14px; right:18px; font-size:46px; opacity:.85`）
- 主标题「古城镇」26px/900/letter-spacing 2px
- 副标题「一座城 · 一段故事 · 一场游戏」13px
- 3 个 chip（`background: rgba(255,255,255,.22); backdrop-filter: blur(4px)`）

### 2.5 Section 标题样式

- 每行前 4px × 16px 竖条（`background: #c8a670; border-radius: 2px`）
- 标题 16px/800 + 副标题 12px/#9a9590 灰色

### 2.6 卡片样式

- 圆角 16px，卡片内 `game-thumb` 容器 16:9 渐变底 + 4 字母 wordmark（font-size 40px/900/letter-spacing 4px）
- `game-info` padding 12/14/14px
- `game-title` 15px/700，title 内嵌 tag（`background: #fff; color:#b85; border:1px solid #e8dcc8`）和 HOT/NEW badge（`background:#ff6b6b; color:#fff`）
- `game-desc` 12px/#8a8580

---

## §3 消消乐部署

### 3.1 本地已有产物

```
xiaoxiaole/bin/
├── index.html        # 入口
├── bundle.js         # 游戏逻辑（打包）
├── js/               # 各模块源码（api/ config/ core/ modes/ scenes/ ui/）
└── *.js.map          # source maps
```

**本地产物验证命令**：
```powershell
Get-ChildItem -Recurse xiaoxiaole/bin/ -File | Measure-Object Length -Sum
# 预期 ~1–2 MB
```

**本地预览命令**：
```powershell
python -m http.server 8123 --directory xiaoxiaole/bin
# → http://127.0.0.1:8123/
```

### 3.2 部署路径

`/www/sites/game.joho.cn/tour/xxl/`（整个 bin/ 目录 scp 过去）

### 3.3 nginx alias

```nginx
location = /tour/xxl.html {
    alias /www/sites/game.joho.cn/tour/xxl/index.html;
}
# 注意：这条 location 必须写在 location ^~ /tour/ 之前，否则会被 ^~ 吞掉
```

---

## §4 别名重定向（town.html / chees.html）

### 4.1 为什么用静态 HTML 而非 nginx 301

- `/tour/` 的 `location ^~ /tour/` 里有 `try_files $uri $uri/ =404`，想对单个文件加 301 必须在 **更前面** 加精确匹配 location，配置更复杂
- 静态 HTML 文件**即时生效**、**curl 测试直观**、**无需 reload**
- 2 行代码等价于 301，对浏览器和搜索引擎都 OK

### 4.2 town.html 内容（`/www/sites/game.joho.cn/tour/town.html`）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=./index.html">
<title>古城镇</title>
<script>location.replace('./index.html');</script>
</head>
<body></body>
</html>
```

### 4.3 chees.html 内容（`/www/sites/game.joho.cn/tour/chees.html`）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=./chess.html">
<title>汉字自走棋</title>
<script>location.replace('./chess.html');</script>
</head>
<body></body>
</html>
```

---

## §5 nginx 配置修改

### 5.1 现状问题

线上 `game.joho.cn.conf` **有 4 份重复的 server block**（1Panel 多次保存产生），必须先去重。

### 5.2 操作步骤

**Step 1 — 备份**：
```bash
cp game.joho.cn.conf game.joho.cn.conf.bak.20260927
```

**Step 2 — 去重 + 修改根路径**，编辑后应只剩 **2 份 server block**：
- 一份 `listen 80; server_name game.joho.cn;`（HTTP → HTTPS 重定向或直接 serve）
- 一份 `listen 443 ssl http2; server_name game.joho.cn;`（主站点）

两份都要改：
```nginx
# 改前
location = / { return 302 /tour/; }

# 改后
location = / { return 302 /tour/home.html; }
```

**Step 3 — 新增消消乐 alias**（两份 server block 都加，位置要在 `location ^~ /tour/` 之前）：
```nginx
# 消消乐快捷入口（xxl.html → xxl/index.html）
location = /tour/xxl.html {
    alias /www/sites/game.joho.cn/tour/xxl/index.html;
}
```

**Step 4 — 测试 + reload**：
```bash
openresty -t        # 语法测试，必须 OK
openresty -s reload # 平滑 reload
```

### 5.3 修改后的 server block（关键部分）

```nginx
server {
    listen 443 ssl http2;
    server_name game.joho.cn;
    # ... ssl 配置不变 ...

    location ^~ /manual/ { ... }

    # === 新增：消消乐快捷入口 ===
    location = /tour/xxl.html {
        alias /www/sites/game.joho.cn/tour/xxl/index.html;
    }

    # === 修改：根路径指向首页 ===
    location = / {
        return 302 /tour/home.html;
    }

    # 已有：jianghu / jianghu1 / tour / client / assets 全部不动
    location ^~ /tour/ { ... }
    location ^~ /jianghu/ { ... }
    location ^~ /jianghu1/ { ... }
    location ^~ /client/ { ... }
    location ^~ /assets/ { ... }

    location / {
        proxy_pass http://127.0.0.1:3000;
        # ... 其余不变 ...
    }
}

# HTTP server block（80 端口）做同样改动后 return 301 到 https
```

---

## §6 部署流水线（一气呵成，本地构建 + scp）

```
Phase 1 · 本地准备
  ├─ [新建] docs/superpowers/specs/2026-09-27-game-homepage-design.md  ← 本文件
  ├─ [新建] tour-homepage/home.html        ← 首页
  ├─ [新建] tour-homepage/town.html         ← 别名
  ├─ [新建] tour-homepage/chees.html        ← 别名
  └─ 消消乐 xiaoxiaole/bin/                ← 已有产物，直接打包

Phase 2 · 本地验证
  ├─ python -m http.server 8123 --directory tour-homepage
  ├─ Playwright 390×844@dpr2 打开 http://127.0.0.1:8123/home.html 截图
  └─ 消消乐本地：python -m http.server 8124 --directory xiaoxiaole/bin 验证可玩

Phase 3 · SCP 上传
  scp tour-homepage/*.html          odoo:/www/sites/game.joho.cn/tour/
  scp -r xiaoxiaole/bin/*           odoo:/www/sites/game.joho.cn/tour/xxl/
  scp game.joho.cn.conf.edited      odoo:~/game.joho.cn.conf.new

Phase 4 · 服务器端 SSH odoo
  cp /www/sites/.../game.joho.cn.conf /www/sites/.../game.joho.cn.conf.bak.$(date +%Y%m%d%H%M)
  ~/game.joho.cn.conf.new 覆盖 /www/sites/.../game.joho.cn.conf
  openresty -t && openresty -s reload

Phase 5 · curl 验收
  curl -sI https://game.joho.cn/                  → 302 → /tour/home.html  ✅
  curl -sI https://game.joho.cn/tour/home.html      → 200                   ✅
  curl -sI https://game.joho.cn/tour/xxl.html       → 200                   ✅
  curl -sI https://game.joho.cn/tour/town.html      → 200（302 到 index）   ✅
  curl -sI https://game.joho.cn/tour/chees.html     → 200（302 到 chess）   ✅
  # 旧入口回归：
  curl -sI https://game.joho.cn/tour/               → 200                   ✅
  curl -sI https://game.joho.cn/tour/tower.html     → 200                   ✅
  curl -sI https://game.joho.cn/tour/chess.html     → 200                   ✅
  curl -sI https://game.joho.cn/tour/sanguo.html    → 200                   ✅
  curl -sI https://game.joho.cn/jianghu/            → 200                   ✅
  curl -sI https://game.joho.cn/jianghu1/          → 200                   ✅

Phase 6 · git commit + push
  git add docs/superpowers/specs/ tour-homepage/
  git commit -m "feat(game): 新增首页 home.html、消消乐部署、town/chees 别名、nginx 重构"
  git push
```

---

## §7 验收清单

- [ ] 首页 home.html 本地 Playwright 390×844@dpr2 截图通过
- [ ] 消消乐 xxl.html 本地可玩（点击能开始游戏）
- [ ] town.html → index.html 重定向工作
- [ ] chees.html → chess.html 重定向工作
- [ ] nginx openresty -t 语法通过
- [ ] 根路径 302 → /tour/home.html（HTTP + HTTPS）
- [ ] 10 条 curl 全部 200/302 符合预期
- [ ] 旧入口回归测试通过（tour/ · tower.html · chess.html · sanguo.html · jianghu/ · jianghu1/）
- [ ] git commit & push 完成
- [ ] 手机视口截图补齐到 docs/verify/

---

## §8 不做清单（Out of Scope）

- ❌ 斗地主游戏开发（占位卡片即可，后续再说）
- ❌ 首页 CMS / 后台管理（静态单文件，无需）
- ❌ 首页多语言（固定中文，无需 i18n）
- ❌ 首页多版式（用户只选了方案 A，不需要 B/C 切换）
- ❌ town.html / chees.html 做独立游戏页面（用户只要求别名）
- ❌ 动效 / JS 交互（首页纯静态，卡片无 hover 动画也 OK）
- ❌ nginx 配置的完整重建（只改必要部分，不做大重构）

---

## §9 风险与降级

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| openresty reload 后 site 404 | 低 | 全站不可用 | 备份 .conf，reload 失败立刻回滚 |
| xiaoxiaole/bin/ 缺资源导致 404 | 中 | 消消乐页面不完整 | 本地 `python -m http.server` 先跑一遍看 Network tab |
| 消消乐 bundle.js 依赖相对路径 | 中 | alias 后资源找不到 | scp 整个 bin/ 目录保持相对路径不变 |
| 根路径改动被浏览器/CDN 缓存 | 中 | 用户看到旧 302 | 加 ?v=20260927 参数或等浏览器刷新 |
| tour/ 目录权限问题 | 低 | scp 失败 | ssh 后 chmod/chown |
