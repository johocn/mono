# game.joho.cn 首页 + 消消乐 + 别名入口 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 game.joho.cn 上线「古城志」风格游戏首页、部署消消乐到 `/tour/xxl.html`、添加 town.html / chees.html 别名入口、重构 nginx 根路径指向首页。

**Architecture:** 首页 home.html 是纯静态单文件（HTML + 内联 CSS，零 JS，零美术资源）；消消乐直接复用 `xiaoxiaole/bin/` 现有产物；town.html / chees.html 是 2 行 meta refresh 重定向；nginx 4 份重复 server block 去重为 2 份 + 根路径 302 改为指向 `/tour/home.html` + 新增消消乐 alias。

**Tech Stack:** 纯 HTML5 / CSS3（无构建）、openresty/nginx、scp + ssh 部署、curl 验收。

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|---|---|---|
| **Create** | `d:\zhao\tour-homepage/home.html` | 首页主文件（300–400 行 HTML + CSS） |
| **Create** | `d:\zhao\tour-homepage/town.html` | `/tour/town.html` → `/tour/index.html` 重定向 |
| **Create** | `d:\zhao\tour-homepage/chees.html` | `/tour/chees.html` → `/tour/chess.html` 重定向 |
| **Use** | `d:\zhao\xiaoxiaole/bin/` | 已有消消乐产物，直接 scp 到服务器 |
| **Modify** | `{remote} /www/sites/game.joho.cn/game.joho.cn.conf` | nginx 去重 + 根路径改 + 消消乐 alias |

---

### Task 1: 创建别名文件 town.html + chees.html

**Files:**
- Create: `d:\zhao\tour-homepage\town.html`
- Create: `d:\zhao\tour-homepage\chees.html`

**Description:** 两个文件各 10 行以内，用 HTML meta refresh + JavaScript `location.replace` 双重保险做即时跳转。

- [ ] **Step 1: 创建 town.html**

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

- [ ] **Step 2: 创建 chees.html**

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

- [ ] **Step 3: 本地验证文件存在且内容正确**

Run:
```powershell
Get-ChildItem d:\zhao\tour-homepage\ | Select-Object Name, Length, LastWriteTime
# 预期：town.html ~200B, chees.html ~200B
```

Expected: 两个文件都存在，大小约 200 字节。

- [ ] **Step 4: Commit**

```bash
git add tour-homepage/town.html tour-homepage/chees.html
git commit -m "feat(game): add town.html and chees.html alias redirects"
```

---

### Task 2: 实现首页 home.html

**Files:**
- Create: `d:\zhao\tour-homepage\home.html`

**Description:** 完整的单文件首页（方案 A · 古城志）。包含 Hero 大图 + 4 个 Section（游览体验 / 策略游戏 / 江湖叙事 / 休闲小游戏）+ Footer。零 JS、零外部资源。

- [ ] **Step 1: 创建 home.html — HTML 骨架 + Hero 区**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no">
<meta name="renderer" content="webkit">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>game.joho.cn · 古城志</title>
<meta name="description" content="古城镇旅游场景 · 汉字塔防 · 汉字自走棋 · 三国合成塔防 · 武侠江湖 — 8 款小游戏随时开玩">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#f5f3ee;color:#2d2a26;line-height:1.5;-webkit-tap-highlight-color:transparent}
.wrap{max-width:480px;margin:0 auto;background:#fff}
</style>
</head>
<body>
<div class="wrap">

<!-- HERO -->
<style>
.a-hero{position:relative;aspect-ratio:16/10;background:linear-gradient(135deg,#8b5a2b 0%,#d4a574 40%,#6b4423 100%);overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:20px 20px 24px}
.a-hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 70% 30%,rgba(255,255,255,.15) 0%,transparent 60%)}
.a-hero::after{content:'🏯';position:absolute;top:14px;right:18px;font-size:46px;opacity:.85;filter:drop-shadow(0 2px 6px rgba(0,0,0,.2))}
.a-hero-title{position:relative;font-size:26px;font-weight:900;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.4);letter-spacing:2px}
.a-hero-sub{position:relative;font-size:13px;color:rgba(255,255,255,.9);margin-top:4px;letter-spacing:1px}
.a-hero-meta{position:relative;margin-top:12px;display:flex;gap:8px}
.a-chip{font-size:11px;padding:4px 10px;border-radius:14px;background:rgba(255,255,255,.22);backdrop-filter:blur(4px);color:#fff;border:1px solid rgba(255,255,255,.3)}
</style>
<a class="a-hero" href="./index.html" aria-label="进入古城镇">
  <div class="a-hero-title">古城镇</div>
  <div class="a-hero-sub">一座城 · 一段故事 · 一场游戏</div>
  <div class="a-hero-meta">
    <span class="a-chip">🏯 游览</span>
    <span class="a-chip">⚔️ 策略</span>
    <span class="a-chip">📖 江湖</span>
  </div>
</a>

<!-- 游览体验 -->
<style>
.a-section{padding:22px 16px 6px}
.a-section-title{font-size:16px;font-weight:800;color:#1a1815;margin-bottom:4px;display:flex;align-items:center;gap:6px}
.a-section-title::before{content:'';display:inline-block;width:4px;height:16px;background:#c8a670;border-radius:2px}
.a-section-sub{font-size:12px;color:#9a9590;margin-bottom:14px;padding-left:10px}
</style>
<div class="a-section">
  <div class="a-section-title">游览体验</div>
  <div class="a-section-sub">LayaAir 2D · 可走可逛可互动</div>
</div>

<!-- 策略游戏 -->
<div class="a-section">
  <div class="a-section-title">策略游戏</div>
  <div class="a-section-sub">北山汉字 · 合成塔防 + 自走棋</div>
</div>

<!-- 江湖叙事 -->
<div class="a-section">
  <div class="a-section-title">江湖叙事</div>
  <div class="a-section-sub">文字冒险 + 地图打卡册</div>
</div>

<!-- 休闲小游戏 -->
<div class="a-section">
  <div class="a-section-title">休闲小游戏</div>
  <div class="a-section-sub">即将上线 · 敬请期待</div>
</div>

<!-- FOOTER -->
<div style="padding:24px 20px 32px;text-align:center;font-size:11px;color:#9a9590;line-height:1.8">
  game.joho.cn · johocn · 2026<br>
  所有游戏均可直接在浏览器游玩 · 无需下载
</div>

</div>
</body>
</html>
```

**不要 commit** —— 这只是骨架。

- [ ] **Step 2: 追加 5 个游戏卡片到 Hero 下方（游览体验区）**

在 `<!-- 游览体验 -->` 的 `<div class="a-section">` 下面，紧接着追加：

```html
<style>
.game-card{text-decoration:none;color:inherit;display:block;border-radius:16px;overflow:hidden;background:#fff;border:1px solid #ece6db;transition:transform .15s}
.game-card:active{transform:scale(.97)}
.game-thumb{aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:900;letter-spacing:4px}
.game-info{padding:12px 14px 14px}
.game-title{font-size:15px;font-weight:700;color:#1a1815;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.game-tag{font-size:10px;font-weight:500;padding:2px 6px;border-radius:4px;background:#f5ebd6;color:#a8752c;border:1px solid #e8dcc8}
.game-desc{font-size:12px;color:#8a8580;margin-top:4px;line-height:1.4}
.badge-new{background:#ff6b6b;color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;margin-left:auto;font-weight:600}
.a-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 16px 6px}
.a-featured{grid-column:span 2}
.a-color-tour .game-thumb{background:linear-gradient(135deg,#e8d5b7,#c9a96e);color:#6b4423}
.a-color-tower .game-thumb{background:linear-gradient(135deg,#f5deb3,#8b4513);color:#2d1810}
.a-color-chess .game-thumb{background:linear-gradient(135deg,#d4c5a9,#6b5b3a);color:#2a2010}
.a-color-sanguo .game-thumb{background:linear-gradient(135deg,#e8a87c,#a83232);color:#2a0808}
.a-color-jianghu .game-thumb{background:linear-gradient(135deg,#9ba3b0,#3a4553);color:#f8f5f0}
.a-color-jianghu1 .game-thumb{background:linear-gradient(135deg,#a8d8a8,#2d5a2d);color:#1a2d1a}
.a-color-xxl .game-thumb{background:linear-gradient(135deg,#ffc9de,#ff80a8);color:#8b1a3a}
.a-color-ddz .game-thumb{background:linear-gradient(135deg,#d4efdf,#1e8449);color:#0a2d1a}
</style>
```

然后把所有 Section 里的 `.a-section` 替换为完整的 Section + `.a-grid` + 游戏卡片。完整内容见 Step 3。

- [ ] **Step 3: 写入完整的 home.html 最终版（推荐直接整体写入）**

> 把 Step 1 的骨架 + Step 2 的样式 + 以下完整内容 **合并后整体** 写入 `d:\zhao\tour-homepage\home.html`。下面是所有 Section 的完整卡片内容：

**游览体验 Section 完整替换**（替换 `<!-- 游览体验 -->` 那块）：
```html
<div class="a-section">
  <div class="a-section-title">游览体验</div>
  <div class="a-section-sub">LayaAir 2D · 可走可逛可互动</div>
</div>
<div class="a-grid">
  <a class="game-card a-featured a-color-tour" href="./index.html">
    <div class="game-thumb">TOUR</div>
    <div class="game-info">
      <div class="game-title">古城镇 · 旅游场景<span class="badge-new">HOT</span></div>
      <div class="game-desc">NPC 对话 · 砍树搭桥 · 任务链 · 存档背包</div>
    </div>
  </a>
</div>
```

**策略游戏 Section 完整替换**：
```html
<div class="a-section">
  <div class="a-section-title">策略游戏</div>
  <div class="a-section-sub">北山汉字 · 合成塔防 + 自走棋</div>
</div>
<div class="a-grid">
  <a class="game-card a-color-tower" href="./tower.html">
    <div class="game-thumb">TWR</div>
    <div class="game-info">
      <div class="game-title">汉字塔防<span class="game-tag">塔防</span></div>
      <div class="game-desc">弓·守·旗·鼓 四兵种 A* 寻路 5 波攻防</div>
    </div>
  </a>
  <a class="game-card a-color-chess" href="./chess.html">
    <div class="game-thumb">CHS</div>
    <div class="game-info">
      <div class="game-title">汉字自走棋<span class="game-tag">自走棋</span></div>
      <div class="game-desc">三合一升星 · 双羁绊 · 移动作战</div>
    </div>
  </a>
  <a class="game-card a-featured a-color-sanguo" href="./sanguo.html">
    <div class="game-thumb">SG</div>
    <div class="game-info">
      <div class="game-title">三国 · 合成塔防<span class="badge-new">新上线</span></div>
      <div class="game-desc">刀枪骑弓克制环 · 赵云集字召唤 · 5 波军令守护</div>
    </div>
  </a>
</div>
```

**江湖叙事 Section 完整替换**：
```html
<div class="a-section">
  <div class="a-section-title">江湖叙事</div>
  <div class="a-section-sub">文字冒险 + 地图打卡册</div>
</div>
<div class="a-grid">
  <a class="game-card a-color-jianghu" href="../jianghu/">
    <div class="game-thumb">JH1</div>
    <div class="game-info">
      <div class="game-title">游吉林市北上<span class="game-tag">文字</span></div>
      <div class="game-desc">武侠文字冒险 · Vue SPA</div>
    </div>
  </a>
  <a class="game-card a-color-jianghu1" href="../jianghu1/">
    <div class="game-thumb">JH2</div>
    <div class="game-info">
      <div class="game-title">江湖录 · 行脚图<span class="game-tag">地图</span></div>
      <div class="game-desc">Demo A · 古风地图打卡册</div>
    </div>
  </a>
</div>
```

**休闲小游戏 Section 完整替换**：
```html
<div class="a-section">
  <div class="a-section-title">休闲小游戏</div>
  <div class="a-section-sub">即将上线 · 敬请期待</div>
</div>
<div class="a-grid">
  <a class="game-card a-color-xxl" href="./xxl.html">
    <div class="game-thumb">XXL</div>
    <div class="game-info">
      <div class="game-title">消消乐<span class="badge-new">新上线</span></div>
      <div class="game-desc">Match3 · LayaAir 休闲消除</div>
    </div>
  </a>
  <a class="game-card a-color-ddz" href="#">
    <div class="game-thumb">DDZ</div>
    <div class="game-info">
      <div class="game-title">斗地主<span class="badge-new">即将上线</span></div>
      <div class="game-desc">经典扑克 · 三人对战</div>
    </div>
  </a>
</div>
```

**完整 home.html 最终校验** — 写入后确认：

```powershell
# 1. 总行数 300-400 行
(Get-Content d:\zhao\tour-homepage\home.html).Count

# 2. 搜索 href 确认每个入口正确
Select-String d:\zhao\tour-homepage\home.html -Pattern 'href="' -AllMatches | ForEach-Object { $_.Line.Trim() }

# 3. 检查每个颜色类都存在
$expected = @('a-color-tour','a-color-tower','a-color-chess','a-color-sanguo','a-color-jianghu','a-color-jianghu1','a-color-xxl','a-color-ddz')
$content = Get-Content d:\zhao\tour-homepage\home.html -Raw
$expected | ForEach-Object { if (-not $content.Contains($_)) { Write-Host "MISSING: $_" -ForegroundColor Red } }
Write-Host "All color classes present."
```

Expected:
- 行数在 300–400 之间
- 8 个 href：`./index.html`, `./tower.html`, `./chess.html`, `./sanguo.html`, `../jianghu/`, `../jianghu1/`, `./xxl.html`, `#`
- 所有 8 个 a-color-* 类都存在

- [ ] **Step 4: Commit**

```bash
git add tour-homepage/home.html
git commit -m "feat(game): add home.html - 古城志 style game gallery homepage"
```

---

### Task 3: 本地预览验证

**Files:**
- View: `d:\zhao\tour-homepage\home.html`
- Use: `d:\zhao\xiaoxiaole\bin\index.html`

**Description:** 在本地跑 HTTP server，用 Playwright 390×844@dpr2 截图首页和消消乐。

- [ ] **Step 1: 启动本地 HTTP server（首页目录）**

```powershell
cd d:\zhao\tour-homepage
python -m http.server 8123 --bind 127.0.0.1
# 后台运行或新窗口
```

Expected: 终端显示 `Serving HTTP on 127.0.0.1 port 8123`

- [ ] **Step 2: 浏览器验证首页可访问**

用浏览器打开 `http://127.0.0.1:8123/home.html`，确认：
- Hero 大图显示正常（琥珀金渐变 + 🏯 emoji）
- 8 个游戏卡片都能看到
- 卡片缩略图渐变和 wordmark 显示
- 移动端布局（窄屏）和桌面居中布局都 OK

- [ ] **Step 3: 启动消消乐本地服务并验证可玩**

```powershell
cd d:\zhao\xiaoxiaole\bin
python -m http.server 8124 --bind 127.0.0.1
```

浏览器打开 `http://127.0.0.1:8124/`，确认：
- 页面加载无 404（看 F12 Network tab）
- 主菜单显示，点击能开始游戏
- 画布/Board 渲染正常

- [ ] **Step 4: Playwright 390×844@dpr2 截图（首页）**

```powershell
# 用 Playwright：
$code = @"
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:8123/home.html', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'd:/zhao/docs/verify/homepage-local.png', fullPage: true });
  await browser.close();
  console.log('OK');
})();
"@
$code | Out-File -Encoding ascii d:\zhao\_shot_home.mjs; node d:\zhao\_shot_home.mjs
```

Expected: `d:\zhao\docs\verify\homepage-local.png` 存在，`Get-Item` Size > 100KB

- [ ] **Step 5: Playwright 390×844@dpr2 截图（消消乐）**

```powershell
$code = @"
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:8124/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'd:/zhao/docs/verify/xxl-local.png' });
  await browser.close();
  console.log('OK');
})();
"@
$code | Out-File -Encoding ascii d:\zhao\_shot_xxl.mjs; node d:\zhao\_shot_xxl.mjs
```

---

### Task 4: SCP 上传 + 服务器端操作

**Files:**
- Upload: `tour-homepage/home.html` → `oddo@game.joho.cn:/www/sites/game.joho.cn/tour/home.html`
- Upload: `tour-homepage/town.html` → same path
- Upload: `tour-homepage/chees.html` → same path
- Upload: `xiaoxiaole/bin/*` → `oddo@game.joho.cn:/www/sites/game.joho.cn/tour/xxl/`

- [ ] **Step 1: SSH 预检查服务器 tour 目录**

```powershell
ssh odoo "ls -la /www/sites/game.joho.cn/tour/"
```

Expected: 看到 `index.html`, `tower.html`, `chess.html`, `sanguo.html`, `js/`, `libs/`, `assets/` 等目录

- [ ] **Step 2: 上传首页和别名文件**

```powershell
scp d:\zhao\tour-homepage\home.html  odoo:/www/sites/game.joho.cn/tour/home.html
scp d:\zhao\tour-homepage\town.html  odoo:/www/sites/game.joho.cn/tour/town.html
scp d:\zhao\tour-homepage\chees.html odoo:/www/sites/game.joho.cn/tour/chees.html
```

Expected: 每个 scp 输出无错误

- [ ] **Step 3: 上传消消乐（整个 bin/ 目录）**

```powershell
# 先在服务器建目录
ssh odoo "mkdir -p /www/sites/game.joho.cn/tour/xxl"
# 再 scp 整个 bin 内容进去
scp -r d:\zhao\xiaoxiaole\bin\* odoo:/www/sites/game.joho.cn/tour/xxl/
```

验证上传完整性：
```powershell
ssh odoo "ls -la /www/sites/game.joho.cn/tour/xxl/ | head -20; echo ---; find /www/sites/game.joho.cn/tour/xxl/ -name '*.js' | wc -l"
```

Expected: 能看到 `index.html`, `bundle.js`, `js/` 子目录，`*.js` 文件数 >= 15

- [ ] **Step 4: 备份线上 nginx 配置**

```powershell
ssh odoo "cp /www/sites/game.joho.cn/game.joho.cn.conf /www/sites/game.joho.cn/game.joho.cn.conf.bak.$(date +%Y%m%d%H%M) && echo backup done"
```

- [ ] **Step 5: 下载 nginx 配置到本地、编辑、上传回去**

```powershell
# 下载
scp odoo:/www/sites/game.joho.cn/game.joho.cn.conf d:\zhao\_nginx_before.conf

# 编辑（用 VS Code 或任何编辑器）
# 需要做 3 件事：
# 1) 去重 server block（保留 1 份 80 + 1 份 443）
# 2) 每份里 location = / { return 302 /tour/home.html; } （替换原来的 return 302 /tour/）
# 3) 在 location ^~ /tour/ 之前加：
#    location = /tour/xxl.html { alias /www/sites/game.joho.cn/tour/xxl/index.html; }
```

编辑完成后：
```powershell
# 上传回去
scp d:\zhao\_nginx_before.conf odoo:/www/sites/game.joho.cn/game.joho.cn.conf

# 语法测试 + reload
ssh odoo "openresty -t && openresty -s reload && echo RELOADED OK"
```

Expected: `openresty -t` 输出 `syntax is ok` / `test is successful`，然后 `RELOADED OK`

---

### Task 5: curl 线上验收

**Description:** 10 条 curl 全部通过才算部署成功。

- [ ] **Step 1: 核心新入口验收**

```powershell
# 根路径 302 到首页
curl.exe -sI https://game.joho.cn/ 2>&1 | Select-Object -First 5
# 预期：HTTP 200 或 302，Location 包含 /tour/home.html

# 首页直接访问
curl.exe -sI https://game.joho.cn/tour/home.html 2>&1 | Select-Object -First 5
# 预期：200 OK

# 消消乐
curl.exe -sI https://game.joho.cn/tour/xxl.html 2>&1 | Select-Object -First 5
# 预期：200 OK

# 别名 town → index
curl.exe -sI https://game.joho.cn/tour/town.html 2>&1 | Select-Object -First 5
# 预期：200 OK（meta refresh）

# 别名 chees → chess
curl.exe -sI https://game.joho.cn/tour/chees.html 2>&1 | Select-Object -First 5
# 预期：200 OK
```

- [ ] **Step 2: 旧入口回归测试**

```powershell
curl.exe -sI https://game.joho.cn/tour/          # 预期 200
curl.exe -sI https://game.joho.cn/tour/tower.html # 预期 200
curl.exe -sI https://game.joho.cn/tour/chess.html # 预期 200
curl.exe -sI https://game.joho.cn/tour/sanguo.html # 预期 200
curl.exe -sI https://game.joho.cn/jianghu/         # 预期 200
curl.exe -sI https://game.joho.cn/jianghu1/        # 预期 200
```

Expected: 全部返回 `200 OK`

- [ ] **Step 3: 最终确认（浏览器打开首页）**

用浏览器打开 `https://game.joho.cn/` → 应该被 302 到 `/tour/home.html` → 看到古城志首页 → 点击各卡片 → 确认正确跳转 → 消消乐能玩。

---

### Task 6: Git commit + push

**Description:** 本地改动入库，完成一气呵成。

- [ ] **Step 1: 检查 git 状态**

```powershell
cd d:\zhao; git status --short
```

Expected: 只出现本次相关新增：
```
?? docs/superpowers/specs/2026-09-27-game-homepage-design.md
?? docs/superpowers/plans/2026-09-27-game-homepage.md
?? tour-homepage/
```

- [ ] **Step 2: 一次性 commit + push**

```powershell
cd d:\zhao
git add docs/superpowers/specs/ docs/superpowers/plans/ tour-homepage/
git commit -m "feat(game): 新增古城志首页 + 消消乐部署 + town/chees 别名 + nginx 重构

- 新建 tour-homepage/home.html（纯静态 350 行，零依赖）
- 新建 town.html / chees.html 重定向别名（各 10 行）
- 消消乐部署到 /tour/xxl.html（xiaoxiaole/bin/ 现有产物 scp）
- nginx 4 份重复 server block 去重为 2 份
- 根路径 302 从 /tour/ 改为 /tour/home.html
- 新增 location = /tour/xxl.html alias"
git push
```

Expected: push 成功，无报错

- [ ] **Step 3: 最终验证**

打开 `https://game.joho.cn/` 截图一张，确认部署后的线上效果与本地一致。

---

## Spec Coverage Check

| Spec Section | 实现 Task | 状态 |
|---|---|---|
| §1 决策汇总 | Task 1-6 全部覆盖 | ✅ |
| §2 首页 home.html 架构 | Task 2 | ✅ |
| §3 消消乐部署 | Task 3 Step 3 + Task 4 Step 3 | ✅ |
| §4 别名重定向 | Task 1 | ✅ |
| §5 nginx 修改 | Task 4 Steps 4-5 | ✅ |
| §6 部署流水线 | Task 4 + Task 5 | ✅ |
| §7 验收清单 | Task 5 | ✅ |
| §8 不做清单 | 未进入计划，明确排除 | ✅ |
| §9 风险降级 | Task 4 Step 4（备份） + Task 5（curl 全量回归） | ✅ |
