# 方块（tetris）登录 SSO + 持久化 + 独立积分 · 部署手册

> 给部署人（另一人）执行用。整体照搬消消乐（脑力花园）后端模式，但方块游戏数据完全独立。

## 一、架构与范围
- **后端**：复用现有共享 Nest（game-server）= `d:/zhao/game-server`，新增 `TetrisModule`，路由 `/api/client/v1/tetris/*`，数据表 `tetris_*`（与消消乐 `xiao_*` 完全隔离、互不相通）。
- **SSO**：复用 zhao-sso（`h.joho.cn`），方块专属应用编码 `app_code = game-tetris`。
- **前端**：`d:/zhao/tetris`，子路径 `game.yourbao.cn/tetris/` 静态托管。
- **积分**：方块独立账本（`tetris_player_points` / `tetris_point_logs`），与消消乐互不相通；服务端按类型记账，`refId` 幂等 + 每日上限防刷。
- **持久化**：最高分 / 场次 / 道具背包 / 签到 服务端存储（`tetris_player_profile`），皮肤解锁（`tetris_player_skins`）。**未登录游客态本地可玩**（`localStorage`），不阻断游戏。

## 二、后端（game-server）部署
代码已合入：
- `d:/zhao/game-server/src/modules/tetris/`（实体 / DTO / 三个 service / controller / module）
- `d:/zhao/game-server/src/migrations/0007_tetris.ts`（建 `tetris_*` 表 + 幂等唯一索引）
- `d:/zhao/game-server/src/app.module.ts`（已追加 `TetrisModule`）

执行：
```bash
cd d:/zhao/game-server
npm install          # 若依赖未变可跳过
npm run build
npm run typeorm:run  # 执行 0007 迁移，创建 tetris_* 表
pm2 restart game-server   # 或现有重启方式
```
> 验证：tetris 接口需 Bearer 鉴权，无法直接 curl 校验；建议用前端联调（见第三节）确认。

## 三、前端（tetris）构建
环境变量二选一（优先级：**运行时 `window.__APP_ENV__` > 构建期 `process.env.*` > 内置默认值**）：
- **运行时（推荐，改 `bin/index.html` 里的 `window.__APP_ENV__`，改完无需重新构建）**；
- 或**构建期**：复制 `d:/zhao/tetris/.env.example` 为 `.env` 填值，`build.mjs` 会注入。

关键值：
```
GAME_SERVER_API_URL=https://game.yourbao.cn
SSO_APP_CODE=game-tetris
SITE_URL=https://game.yourbao.cn/tetris/
SSO_LOGIN_URL=https://h.joho.cn/#/pages/sso/login
```

构建：
```bash
cd d:/zhao/tetris
npm install
npm run build     # 产物在 bin/（bundle.js / index.html / wechat-share.js）
```

## 四、nginx / openresty 配置（新增 location /tetris/）
复用现有 `game.yourbao.cn` server，新增静态托管；`/api` 反代到 game-server:3000 已存在，**无需改动**（方块接口同走 `/api`）。
```nginx
location /tetris/ {
    alias /path/to/tetris/bin/;
    try_files $uri $uri/ /tetris/index.html;
    index index.html;
}
```
> 注意：`bin/index.html` 用相对路径 `./bundle.js`，子路径下可正确加载。

## 五、zhao-sso 注册（app_code = game-tetris）
在 `h.joho.cn` 的 SSO 应用管理新增应用（对齐现有 `game-xxl`）：
- **app_code**：`game-tetris`
- **名称**：方块游戏
- **return_url 白名单**：`https://game.yourbao.cn/tetris/` 与 `https://game.yourbao.cn/tetris`（含 / 不含尾部斜杠都要加）
- token 有效期等其余项对齐 `game-xxl`。

## 六、接口清单（`/api/client/v1/tetris/*`，需 Bearer）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET  | `/tetris/points` | 取积分余额 |
| POST | `/tetris/points/earn`  | 获得积分 `{amount,type,refId?}` |
| POST | `/tetris/points/spend` | 消费积分 `{amount,type,refId?}` |
| GET  | `/tetris/progress` | 取完整进度 |
| POST | `/tetris/progress` | 合并进度 `{bestScore,plays,items,signinStreak,lastSignDate}` |
| POST | `/tetris/signin` | 连续签到（服务端算连签 + 发积分 + 奖励道具） |
| GET  | `/tetris/skins` | 我的已解锁皮肤 |
| POST | `/tetris/skins/unlock` | 积分兑换/解锁 `{skinId}` |

认证走 `/api/client/v1/auth/*`，与消消乐共用 `AuthModule`（guest / login / sso-exchange 等）。

## 七、防刷与隔离要点（联调 / 验收关注）
- 积分按 `(player_id, ref_id)` **幂等**：重复上报同一 `refId` 不计第二次（服务层预查 + 库唯一索引双保险）。
- 每日上限：`earn_ad` ≤ 500、`earn_share` ≤ 200（在 `points.service.ts` 的 `DAILY_CAP_BY_TYPE` 可调）。
- 余额变更全部走**事务 + 行锁**，并发不超额；消费不足返回 `积分不足`。
- 皮肤价格**服务端校验**（`skins.service.ts` 的 `BUILTIN_SKINS`：`classic`/`warm` 免费、`retro`/`nostalgia` 各 30），前端无法改价白嫖。
- 数据完全隔离：`tetris_*` 表与 `xiao_*` 无任何关联，积分互不通用。

## 八、降级与回滚
- **未配置 / 未联网**：前端自动游客态本地可玩（`localStorage`），不报错、不弹登录。
- **后端故障**：所有云端调用静默失败，本地继续；恢复后登录自动重新同步。
- **回滚**：前端换回旧 `bin/`；后端执行迁移 `down` 并 revert `TetrisModule`（`app.module.ts` 去掉导入），重启即可。
