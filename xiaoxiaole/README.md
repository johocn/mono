# 小消乐（适老化三模式治愈系消除游戏）

## 🔐 SSO 统一登录 + 邀请分享（2026-10）

- 线上地址：`https://game.yourbao.cn`（joho.cn 微信安全域名配额用完，启用新域名）
- 强制 SSO：后端已配置时，未登录/游客态自动跳 SSO 统一登录页（h.joho.cn），登录回跳后经
  `POST /api/client/v1/auth/sso-exchange` 换本站会话；本机旧游客进度自动认领到 SSO 用户名下
- 邀请分享：主菜单右上「邀请」按钮复制 `https://game.yourbao.cn/?invite_code=<本人邀请码>`；
  好友打开链接 → invite_code 透传 SSO → SSO 侧幂等绑分销关系
- 配置（`.env` / `scripts/build.mjs`）：`GAME_SERVER_API_URL`、`SSO_LOGIN_URL`、`SSO_APP_CODE`、`SITE_URL`
- SSO 应用注册：app_code=`game-xxl`（h.joho.cn SSO 后台）；SSO 用户表为 `plugin::zhao-sso.sso-user`
  （独立于 Strapi up_users），`/v1/*` 接口使用插件自有 JWT
- E2E 回归：`python tools/e2e_sso.py`（手机视口 390×844 dpr2，测试账号 gametest01），
  截图交付于 `design/e2e-sso/`
- 静默续期：登录/换会话返回 `refreshToken` + `expiresIn`，前端临近过期时凭 `refreshToken` 调
  `POST /api/client/v1/auth/refresh` 换发新 access token（并轮换 refresh token），避免 JWT 7 天过期后反复跳 SSO
- 后端迁移：`game-server/src/migrations/0006_refresh_token.ts`（新增 `auth_accounts.refresh_token_hash` 列 + 唯一索引）


一款面向中老年人的治愈系休闲游戏，包含三大玩法模式，共 24 关（每模式 8 关，分四季章节）：
- **时光整理师**（match3）：经典三消，含道具与自适应难度。
- **听音辨位**（audio）：听觉训练，声音序列复述，锻炼记忆力。
- **诗词连连看**（poetry）：诗句上下句连线配对。

---

## 本地运行

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（watch + 本地预览）
# 或：单次构建 + 静态服务
node scripts/build.mjs        # 构建到 bin/bundle.js
npm run serve                 # 启动 http-server，默认 http://localhost:8080
```

类型检查：`npx tsc --noEmit`

---

## 目录结构

```
src/
  config/
    LevelConfig.ts     # 24 关配置 + 难度梯度 + 7 大类声音映射
    SoundLibrary.ts    # 🔊 7 大类 × 8 种 = 56 种声音体系（数据驱动）
  ui/
    AudioSynth.ts      # 程序合成 / 真实采样播放引擎
  modes/
    AudioMatchScene.ts # 听音辨位玩法（教程 + 序列复述）
    ...
assets/audio/          # （可选）真实声音采样，按 <id> 命名覆盖合成音
```

---

## 🔊 听音辨位 · 真实音频接入说明（重点）

游戏默认用**程序合成音**即可完整运行。若要替换成更真实的录音，无需改任何代码：

1. 将录音文件放到 `assets/audio/` 目录，文件名 = 声音的 `id`，扩展名支持 `.mp3` / `.ogg` / `.wav`。
   例：`assets/audio/sparrow.mp3`、`assets/audio/dog.mp3`、`assets/audio/rain.ogg`……
2. 引擎（`AudioSynth`）在播放前会自动探测该文件，**存在则优先播放真实采样，缺失则回退合成音**。
3. 建议单文件 ≤ 2 秒、采样率 44.1kHz、立体声或单声道均可。

### 56 种声音的 id 一览（按 7 大类）

| 类别 | CATEGORY_LABEL | 8 种 id |
|---|---|---|
| nature 自然界 | 自然界 | `rain` `wind` `thunder` `waves` `fire` `stream` `leaves` `waterfall` |
| animal 动物 | 动物 | `dog` `cat` `cow` `frog` `horse` `sheep` `pig` `rooster` |
| life 生活 | 生活 | `doorbell` `phone` `kettle` `clock` `knock` `camera` `scissors` `zipper` |
| bird 鸟鸣 | 鸟鸣 | `sparrow` `cuckoo` `owl` `robin` `magpie` `woodpecker` `seagull` `nightingale` |
| instrument 乐器 | 乐器 | `bell` `drum` `flute` `guzheng` `piano` `violin` `trumpet` `harmonica` |
| vehicle 交通 | 交通 | `carhorn` `train` `bicycle` `boat` `airplane` `motorcycle` `ambulance` `subway` |
| voice 人声语音 | 人声语音 | `laugh` `applause` `baby` `whistle` `cough` `cheer` `clap` `sigh` |

> 完整定义见 `src/config/SoundLibrary.ts`。每个声音含 `label`（中文名）、`icon`（emoji）、`color`（UI 用色）、`recipe`（合成配方）。

---

## 🎚️ 难度设计（听音辨位）

- **阶梯式候选音数**：每关从所属类别 8 种中随机抽取 `audioPool` 种作为本题素材，数量随关卡递增 `4 → 5 → 6 → 7 → 8`。
  - 2-1 教程固定 3 种（选择范式，分步教学）。
  - 2-2 起全部为「声音序列复述」，`audioPool`：2-2=4、2-3=5、2-4=5(干扰)、2-5=6、2-6=6(干扰)、2-7=7(干扰)、2-8=8(跨类混合)。
- **序列长度自适应**：起始 3，随正确率 `+1`（上限见 `sequenceMax`），下限恒为 3，保障适老化下限。
- **干扰音**：2-4 起逐步引入（`hasInterference` + `obstacles`）。
- **视觉兜底**：`visualFallback` 恒开，听力筛查未通过时提供图标视觉提示。

---

## 关卡配置速查（`LevelConfig.ts`）

每个 `LevelConfig` 字段含义：
- `boardCols/boardRows`：棋盘尺寸（音频关不用）。
- `passTarget`：过关所需正确数 / 序列数 / 配对数。
- `items`：道具数量（hint/reshuffle/reveal/peek/undo/rehear/step/shield）。
- `adaptive`：自适应难度参数（步数、内容增减与下限）。
- 音频专属：`audioParadigm`(choice|sequence)、`tutorial`、`choiceCount`、`questionCount`、`sequenceLength/Max/Gap`、`audioPool`、`visualFallback`。

新增关卡：在 `LevelConfig.ts` 定义 `LEVEL_x_y`，并在 `ALL_LEVELS` 数组末尾登记即可被关卡选择界面发现。
