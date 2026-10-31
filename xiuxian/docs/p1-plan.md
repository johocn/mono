# P1 计划 · 对标主流全面提高

## 目标

在 P0（灵根/战力、宝石洗练、功法、秘境、挂机、战令月卡签到）基础上，补齐与**主流修仙/放置游戏**的核心差距，构建完整的「挂机 → 成长 → 渡劫 → 社交」长线闭环。

所有新增系统沿用既有范式：**数据驱动**（`src/data/*` 改配置即生效）、**纯函数/确定性**（种子随机 `mulberry32`，冒烟可复现）、**存档向后兼容**（v1~v3 旧档缺字段给默认）、**冒烟测试段**（每系统一段，与 A~V 段并列）。

## 对标总览（已有 → 计划）

| 维度 | 主流标配 | 当前状态 | P1 动作 |
|---|---|---|---|
| 离线收益 | 离线挂机收益 | 仅在线挂机 `autoFight` | `p1-offline` |
| 渡劫天劫 | 突破伴随天劫 | 仅经验阈值（`realms.ts` 无天劫） | `p1-tribulation` |
| 炼丹 | 丹药闭环 | 仅炼器 + 装饰「丹房」 | `p1-alchemy` |
| 灵兽 | 战斗伙伴 | 无（搜索 灵兽/pet 0 命中） | `p1-beast` |
| 副本 | 多副本/爬塔 | 仅 1 个秘境 | `p1-tower` |
| 竞技 | 竞技场对战 | 仅 `arena` 贴图 + 排行榜接口 | `p1-arena` |
| 飞升 | 转世/第二世 | 化神封顶 | `p1-ascend` |
| 活动 | 限时运营 | 无 | `p1-events` |
| 社交 | 好友/邮件/宗门战 | 仅声望兑换（`sect.ts` 轻量） | `p1-social` |

> 已达标（无需重做）：连携/天赋/法宝、图鉴/成就/日常/引导、战令月卡签到、秘境、云存档+排行榜、移动端触控、音效/过场/打击感。

## 待办

| id | 内容 | 依赖 | 状态 |
|---|---|---|---|
| p1-offline | 离线收益（时间戳收益 + 封顶 + 月卡/秘境加成 + OfflinePanel） | — | ✅ 完成 |
| p1-tribulation | 渡劫天劫（突破事件 + 风险判定 + 演出 + 存档） | p1-offline | ✅ 完成 |
| p1-alchemy | 炼丹（丹方数据 + 炼制 + 丹药服用 + AlembicPanel） | p0-refine | ✅ 完成 |
| p1-beast | 灵兽（定义 + 获取 + 协战 + 槽位 UI） | p0-auto | ✅ 完成 |
| p1-tower | 镇妖塔爬塔（层数 + 每日重置 + 奖励） | p0-dungeon | ✅ 完成 |
| p1-arena | 竞技场（镜像对手 + 积分 + 排行榜联动） | 排行榜 | ✅ 完成 |
| p1-ascend | 飞升转世（第二世 + 属性继承 + 新境界） | p1-tribulation | ✅ 完成 |
| p1-events | 活动运营（限时活动 + 登录/杀怪翻倍） | 日常范式 | ✅ 完成 |
| p1-social | 社交（本地好友/邮件 + 宗门建设/贡献） | 云接口 | ✅ 完成 |
| p1-verify | 全量验证收尾（typecheck/smoke/server/旧档/README/browser） | 全部 | ✅ 完成 |

## 各系统设计范式

### p1-offline · 离线收益
- **设计**：`Player` 加 `lastSeen:number`；`computeOffline(elapsedSec)` 按「平均挂机效率」（基于当前境界/是否秘境/buff）× 时间折算修为 + 灵石，**封顶 12h**；月卡/秘境 buff 加成系数。上线弹 `OfflinePanel` 展示「离线 X 小时，获得修为/灵石」一键领取。
- **复用**：`gainExp` / `gainStones`、`battlePass.monthCardUntil`、`currentZoneId`；`SaveState` 扩展 `lastSeen` 等可选字段（向后兼容 v1~v3 缺省）。
- **测试段 W**：注入 `lastSeen` 差值，验证收益 = 效率 × 时间（封顶）、月卡加成倍率、存档往返、旧档补默认。
- **注意**：离线收益**不触发战斗/掉落**，纯资源折算，避免破坏确定性；与在线 `autoFight` 互不冲突。

### p1-tribulation · 渡劫天劫
- **设计**：`realms.ts` 给 筑基/金丹/元婴/化神 标 `tribulation:true`；`Player.breakthrough()` 到达这些境界触发天劫事件：限时判定（成功 → 大幅属性加成 + 演出；失败 → 温和惩罚：掉血/延迟，不掉级）。用既有 `Cutscene` 黑边 + `Fx` 雷暴 + `Camera` 震屏。
- **复用**：`Rng`(mulberry32) 判定、`Combat` 伤害、`Actor` buff、`Cutscene`/`Camera` 演出。
- **测试段 X**：注入种子，验证过/败分支确定性、加成写入 `eff*`、存档。
- **注意**：天劫是「修仙灵魂」，演出要足；失败惩罚温和（体验优先）。

### p1-alchemy · 炼丹
- **设计**：`data/alembic.ts`（丹方：材料 + 灵石 + 成功率 + 产出丹药）、`Player.alchemize(id)` 按 `refineRng` 同类随机源判定；丹药进 `items.ts`（突破丹/回血丹/经验丹），服用走 `useItem`。`AlembicPanel`（复用 `ForgePanel` 布局）提供炼制。
- **复用**：`items.ts`、`ForgePanel` 布局、`refine` 的 `refineRng` 范式、`BagPanel` 服用入口。
- **测试段 Y**：丹方消耗/产出确定性、服用生效、存档。
- **注意**：与炼器并列，共用 `ForgePanel` 标签页避免面板膨胀。

### p1-beast · 灵兽
- **设计**：`data/beasts.ts`（灵兽：属性/技能/获取方式）、`Player.beasts:[]` + `activeBeast`；协战 = 灵兽作为独立 `Actor` 自动攻击最近怪（复用 `Monster` AI 或轻量伙伴 AI）；获取：捕捉（对残血怪用道具）/孵化/活动。
- **复用**：`Monster`/`Actor`、`useSkill` 路径、`MobileControls`（可选灵兽技能按钮）。
- **测试段 Z**：获取/协战/加成、存档。
- **注意**：灵兽 AI 复用既有追击/普攻，不新写复杂行为。

### p1-tower · 镇妖塔
- **设计**：`data/tower.ts`（层配置：怪物组合 + 奖励 + 层属性缩放）、每日重置、最高层存档；入口复用 `enterZone` 模式（新 zone `tower`）。
- **复用**：`dungeon.ts` 工厂、`spawnLogic`、奖励范式。
- **测试**：层数推进 + 奖励 + 重置 + 存档。

### p1-arena · 竞技场
- **设计**：基于 `arena` tile + 排行榜。对手 = 用排行榜数据生成的镜像 PVE（属性缩放 AI），胜则积分 + 排名；落点 `ResultUI` 风格结算。
- **复用**：`CloudClient.leaderboard`（已存在）、`Combat`、`ResultUI`。
- **测试**：对战结算 + 积分 + 排名更新（本地 mock）。

### p1-ascend · 飞升转世
- **设计**：化神圆满（当前世达顶点且天劫已渡）后「飞升」，开启第二世：`Player.reincarnate()` 保留装备/灵兽/天赋/法宝/修为(exp)，重置本世天劫进度，并获永久继承加成（`inheritMul` 每转世 +12%）。境界取境改为双世表驱动：`realms.ts` 新增 `ASCEND_REALMS`（炼虚/合体/大乘/渡劫/真仙，阈值与基础属性更高）+ `realmIndexIn`/`MAX_REINCARNATIONS`/`MAX_REALM_LEN`；`Player.realmTable()` 按 `reincarnations` 在 REALMS/ASCEND_REALMS 间切换，`realmIndex`/`currentRealm`/`effAtk`/`effDef`/`applyRealmCaps`/`tribulationChance` 等全部走当前世表，`growthMul=tribMul*inheritMul` 合并天劫与继承加成；`canAscend` 门控（达上限 `MAX_REINCARNATIONS=1` 后不可再飞升）。
- **区域**：`data/zhuomo.ts` 坠魔谷（全开放矩形地图 + 魔物刷点），`zones.ts` 注册 `zhuomo` 区域（含返回传送阵）；落霞镇 (19,8) 新增坠魔谷传送点，但 `Game.openTransfer`/`addPortals` 在 `reincarnations<1` 时拦截（提示需先飞升、不显示传送阵）；飞升成功后 `unlockedZones` 补入 `zhuomo`。
- **演出**：HUD「🪶 飞升」按钮（满足 `canAscend` 时显隐），点击触发 `Game.openAscend` 播放 `Cutscene` 后 `reincarnate` + 解锁坠魔谷 + 特效提示。
- **复用**：既有 `Cutscene`/`Camera`/`Fx`、HUD 按钮范式、`serialize`/`applySave`（旧档 `reincarnations` 默认 0）。
- **测试段 C**：第二世表非空/递增/起点高于第一世顶点；第一世堆满可飞升；转世后 reincarnations=1、境界表切换、继承 +12%、修为继承、达上限不可再飞升、跨世档位单调递增；存档往返与旧档默认。

### p1-events · 活动运营
- **设计**：`data/events.ts` 定义限时活动（`EventDef`：id/name/desc/type/start/end + 倍率或奖励）；`activeEvents(now)` 按日期窗口（YYYY-MM-DD 含端点，字符串比较）过滤生效活动，测试可注入 `now` 验证过期。内置三类：双倍修炼（长期有效，击杀修为/灵石 ×2）、登录有礼（每日登录自动发灵石+修为，幂等每日一次）、新春庆典（2030-02 限时，验证窗口机制）。
- **玩法接入**：`Player.eventKillMul(now)` 返回所有生效 double 活动倍率之积（默认 1）；`Game.onMonsterDeath` 对击杀修为/灵石按该倍率取整翻倍，飘字同步。`Player.claimLoginEvents(now, day)` 当日首次进入自动发放登录奖励（按 eventClaims[id]===day 幂等），`Game` 在两处 `refreshDaily` 后调用（开局 + 每帧留存刷新）。`Player.activeEventIds/hasActiveEvent` 供 HUD 显隐。
- **UI**：`ui/EventPanel.ts` 复用 widgets 行布局，展示当前生效活动（双倍进度标签 / 登录已领状态）；HUD「🎉 活动」按钮在有生效活动时显隐，`openEvent` 打开面板（纳入 `anyPanelOpen` 与全部面板隐藏块，避免卡输入）。
- **复用**：`dailies.ts` 日期范式（`todayStr`）、`widgets` 面板布局、`serialize`/`applySave`（`eventClaims` 旧档默认 {}）。
- **测试段 D**：生效/过期（节日 2030 未到不生效、到点生效）、倍率=2、登录发放且同日幂等/跨日可领、存档往返、无活动时倍率回落 1。

### p1-social · 社交（单机降级）
- **设计**：`data/social.ts` 定义 `NPC_FRIENDS`（论道好感+分档奖励）、`MAILS`（按境界解锁、含奖励）、`SECT_BUILDINGS`（修炼堂+3%经验/战功堂+5%灵石/藏经阁+2%双资源，每级 `costPerLv*lv` 贡献）、`sectWarRng(day)`（门派大比确定性随机源，日期即种子）。单机降级：好友=预设 NPC、邮件=NPC 信件、云接口（真实好友/邮件）后续接 `CloudClient`。
- **玩法接入**：`Player.interactFriend(id, day)` 每日一次、好感 +1（封顶 `FRIEND_CAP=10`）、奖励按 `floor(affinity/FRIEND_TIER=3)+1` 档放大；`claimMail(id)` 需达 `needRealm` 且未领；`addKill` 每杀 +1 宗门贡献（`addSectContribution`）；`upgradeSectBuilding(id)` 花费递增贡献升级；`sectWar(day)` 确定性 PVE 演练（按 `fightPower` + `sectWarRng` 结算，胜则获贡献+灵石+修为，每日一次）。`gainExp`/`gainStones` 分别乘 `sectExpMul()`/`sectStoneMul()`（由建筑等级驱动，默认 1，不影响既有断言）。
- **UI**：`ui/SocialPanel.ts` 三标签（好友/邮件/宗门），复用 widgets 行布局；HUD「🤝社交」按钮常驻 → `openSocial` 打开（纳入 `anyPanelOpen` 与全部面板隐藏块）。邮件/好友/大比奖励经 `grantSocial` 统一发放。
- **复用**：`sect.ts`（SECT_NAME）、`widgets` 面板布局、`serialize`/`applySave`（`friends`/`mailsClaimed`/`sectContribution`/`sectBuildings`/`sectWarDay` 旧档默认空/0）。
- **测试段 E**：好友论道每日幂等+好感增长+奖励、邮件按境界解锁/不可重复领、击杀累积贡献、建筑升级扣贡献且修炼堂提升经验加成、门派大比每日一次+胜则加贡献、存档往返、旧档默认空。

## 验证口径（与 P0 一致）

- `tsc --noEmit` **0 错** ✅
- `npm test`：前端冒烟（新增 W~Z/A~E 段，745 通过）+ 后端 **28/0** ✅
- `npm run build`（tsc + vite build）整包集成 **通过** ✅
- 旧档 **v1/v2/v3** 兼容（`SaveState` 字段缺省给默认，E 段显式覆盖 v1/v3）✅
- `test/browser-check.cjs` 增补 `sP1` 块（offline/trib/alchemy/beast/tower/arena/ascend/events/social 断言，report-only；真实 E2E 需 `npm run dev` + Chromium 环境）
- `README.md` / `p1-plan.md` 更新 ✅

## 实施建议（分阶段，先核心闭环）

- **阶段 A（对标命脉）**：`p1-offline` → `p1-tribulation` → `p1-alchemy` → `p1-beast`
- **阶段 B（内容深度）**：`p1-tower` → `p1-arena` → `p1-ascend`
- **阶段 C（长线留存）**：`p1-events` → `p1-social`
- 每完成一项跑 `p1-verify`。

## 关键实现提醒（踩坑预防）

- **存档版本**：每次加字段都在 `applySave` 给默认值，旧档（含 v1/v2/v3）必须仍能 `new Game()` + `applySave` 不崩。
- **确定性**：所有随机走既有 `*Rng`（battle/refine/affix/forge/talent/daily），新增天劫/炼丹判定复用 `refineRng` 或新增独立源，不污染战斗随机。
- **地图行宽**：新增 zone 地图（tower）务必行宽严格一致，否则 `buildMap` 抛错（见 P0 dungeon 修复）。
- **面板注册**：新面板按 `schoolPanel` 模式接入 `Game`（字段 + 构造 + `setPlayer` + `anyPanelOpen` + `hide` + 键位），避免遗漏导致卡输入。
