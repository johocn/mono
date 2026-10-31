# P2 计划 · 第二章深化与系统扩展

> 承接 P1（十项全绿：offline / tribulation / alchemy / beast / tower / arena / ascend / events / social / verify）。
> 本文件跟踪 P2 的五个方向，按执行顺序：① 坠魔谷玩法深化 → ② Roguelike 秘境 → ③ NPC 好感多结局 → ④ 移动端适配 → ⑤ 接真实云社交。

状态表（标记 ⬜ / 🔧进行中 / ✅完成）：

| 编号 | 方向 | 主要复用 | 状态 |
|------|------|----------|------|
| ① | 坠魔谷玩法深化（魔物/Boss/掉落） | `zones.ts` ZoneDef、`map.ts`、`Monster`、掉落范式 | ✅ 完成 |
| ② | Roguelike 秘境（地图工厂 + 随机 buff） | `map.ts buildMap`、`core/Rng`、`Combat.Buff` | ✅ 完成 |
| ③ | NPC 好感多结局 | `chapter1` 对话树、`social.ts` affinity、`widgets` | ✅ 完成 |
| ④ | 移动端适配 | `ui/MobileControls`、`core/Input` 触控 | ✅ 完成 |
| ⑤ | 接真实云社交 | `CloudClient`、`server.js`、`social.ts` | 🟡 基础数据就绪（联调待他人） |

---

## 现状基线（制定计划时实测）

- **坠魔谷**：`data/zhuomo.ts` 仅 `ZHUOMO_MAP`（24×13 全开放矩形）+ `ZHUOMO_SPOTS`（7 个刷怪点）。`data/zones.ts` 的 `ZoneDef` 已预留 `bossId` / `wild` / `buff?` 字段，但 zhuomo 区尚未配置 Boss 与专属掉落。怪物掉落为通用 `rollStones` + 概率道具。
- **地图工厂**：所有地图均为手绘 legend 字符串；`data/map.ts` 的 `buildMap(legend, spawn)` 已是"legend→MapDef"的工厂函数，可复用为程序化生成后端。`core/Combat` 已有 `Buff` 类型（zone 级 `buff?` 字段存在，但 **Zone 级 buff 是否落地到玩家属性待核实/扩展**）。
- **移动端**：`ui/MobileControls.ts` 已完成（左下虚拟摇杆 + 右侧 4 技能钮 + 交互 + 自动），`core/Input` 已接 `joyX/joyY/joyActive` + `setJoystick/pressSkillSlot/pressInteract`；`Game` 按 `isTouchDevice()` 控制显隐——基础控制已具备，本项为审计补完。
- **云社交**：`social.ts` 全本地（预设 NPC 好友/邮件、宗门贡献）。`core/CloudClient.ts` 仅有 guest login / save / load / leaderboard，**无 friends/mail 端点**；后端 `server/server.js` 无社交接口。

---

## ① 坠魔谷玩法深化（魔物 / Boss / 掉落）

**目标**：飞升后的高阶副本——专属魔物族、多阶段魔物 Boss、专属掉落（魔核→炼器/突破材料、魔气资源、概率装备）。

**设计**
- `data/monsters.ts` 增"魔物"族（邪修 / 魔兽 / 心魔），供 `zhuomo.wild` 使用。
- `data/zhuomo.ts` 增 `ZHUOMO_BOSS`（多阶段：血量阈值触发狂暴/召唤小怪/AOE）+ 专属掉落表；在 `zones.ts` 的 zhuomo `ZoneDef` 配 `bossId` 与 Boss 房坐标/传送。
- 掉落：为 `MonsterDef` 增 `loot?: { id: string; n: number; chance: number }[]`，魔物/Boss 引用；`addKill` 时按表 `addItem` 落地（沿用 `affixes`/`sets` 掉落范式）。魔核可进炼器/突破材料链。
- Boss 机制接 `Monster.takeDamage`（血阈触发技能），复用现有 `spawnMonster` 召唤；击杀给成就/图鉴 + 镇魔进度。

**复用**：`zones.ts` ZoneDef、`map.ts buildMap`、`Monster` spawn/update、`affixes`/`sets` 掉落范式、已有成就/图鉴。
**验证**：测试段 F（魔物出现、Boss 多阶段触发、掉落表命中、镇魔进度）；`browser-check` 增 `sZhuomo`。
**风险**：Boss 新状态需接 `resolveDeaths`；延续"全开放矩形规避 Monster A* 全局 MAP"的坑。

**已实现（2026-10-22）**：
- `data/monsters.ts` 增 `demon?: boolean` 标记 + 魔物族（`mo-jing-lang` 魔狼 / `xie-xiu` 邪修 / `xin-mo` 心魔）+ 魔尊 `mo-zun`（Boss，带周期 AOE 技能 `魔渊咆哮`、高血量、专属掉落表）。
- `data/items.ts` 增掉落物 `mo-he` 魔核 / `mo-qi` 魔气 / `mo-zun-neidan` 魔尊内丹。
- `data/zones.ts` 的 `zhuomo` 区 `wild` 改挂魔物、`bossId` 改 `mo-zun`；`enterZone` 进入坠魔谷即置 `boss_spawned` 触发魔尊现身。
- `Game.spawnLogic` 为 `zhuomo` 放宽"通关后/无任务"提前 return（保证持续刷怪）；`updateZhuoBossPhases` 按 Boss 血量阈值（≤66% / ≤33%）触发狂暴（baseAtk/baseDef/baseSpeed 提升）+ 召唤魔狼/心魔；`spawnDemonAdd` 在 Boss 附近生成。
- 镇魔进度：`Player.addKill` 对 `demon` 怪物累加 `demonSlain`（存档 `demonSlain`，旧档默认 0）；魔尊伏诛额外给修为/灵石奖励。掉落沿用既有 `Monster.rollDrops`→`addItem` 管线。
- 测试段 `F`（魔物/Boss 定义、区域配置、掉落物注册、掉落可掷算、镇魔进度累加/非魔物不计、存档往返、旧档默认）；`browser-check` 增坠魔谷 E2E（进入→魔尊出现→血阈触发多阶段）。
- 验证：tsc 0 错 / 前端 783/0 / 后端 28/0 / build 整包通过 / browser 语法 OK。

---

## ② Roguelike 秘境（复用地图工厂 + 随机 buff）

**目标**：一个"秘境"入口，每次进入程序化生成 1 张地图（房间/走廊/障碍随机）+ 随机增益/诅咒 buff，逐房清怪，死亡或通关结算，奖励可带走。

**设计**
- 新增 `core/MapFactory.ts`：`genRogueMap(seed, { w, h, rooms, density })` → 生成 legend → 调 `buildMap`。用独立 `rogueRng`（种子^常量）保证确定性（同 seed 同图）。房间矩形挖空 + 走廊连通，保证**全连通、落点可达、不引入内墙**（规避寻路坑）。
- 随机 buff：复用 `core/Combat` 的 `Buff`；每层随机选 1 个（攻+ / 防− 等）进入时挂到玩家。**前置：确认/扩展 Player 的 buff 挂载点**（当前 `Buff` 多为战斗临时，Zone 级 `buff?` 是否进属性待核实）。
- `Game.enterRogue(seed)`：用生成 map 重建 `IsoMap` + 随机刷怪 + 层数计数；死亡回城、保留已获奖励；通关解锁更高层。
- 存档只存"最高层 / 本周种子"，不在档中存整图（防档膨胀）。

**复用**：`map.ts buildMap`（工厂本体）、`core/Rng` 确定性、`Combat.Buff`、`zones.ts` ZoneDef 结构、已有刷怪/掉落。
**验证**：测试段 G（同 seed 一致、异 seed 不同、buff 生效、层推进/死亡结算）。
**风险**：地图工厂须保证连通性 + 避开内墙寻路坑；Player buff 挂载点若缺失需先补一层。

**已实现（2026-10-22）**：
- `core/MapFactory.ts`：`genRogueMap(seed, floor)` 用确定性 `rogueRng`（`makeRng(seed ^ 盐 ^ floor*常数)`）生成「房间矩形 + L 形走廊」地图，强制左上 3×3 安全屋（返回阵）并连廊至首房、首房依次连至各房，**保证全连通**；同种子同层完全一致、不同层不同；返回 `RogueFloor{ map, spawn, exit, roomCenters }`，复用 `buildMap` 完成图例→MapDef 转换。
- 随机增益/诅咒：复用战斗 `Buff` 体系（`ROGUE_BUFFS`：atkUp/defUp/haste/hot/shield 为增益，slow 为诅咒），`pickRogueBuff(rng)` 按层选定、`t:9999` 长驻；`ZoneDef.buff` 已在 `enterZone` 通过 `Player.addBuff` 落地到 `effAtk/effDef/effSpeed`（Actor 的 atkBonus/defBonus/hasteMul/slowMul 已支撑），**无需新建挂载点**。
- `zones.ts`：注册 `rogue` 区（占位地图 `genRogueMap(1,1)`、左上返回阵传送至 ch1）；ch1 增加 `(3,9)` 秘境入口传送。
- `Game`：`enterRogue` 按时间+盐生成种子从第 1 层开始；`prepareRogueFloor` 生成地图/随机 buff/重建区域/`spawnRogueWave`（逐房间中心刷怪，数量随层增）/出口紫色标记；`updateRogue` 检测清剿→抵出口推进下一层（更新 `player.rogueBest`）；`onRogueDeath` 保留奖励退回落霞镇；离开秘境清理本层 buff。
- **关键修正**：`Monster.update` 的 A* 原硬用全局 `MAP`（落霞镇），导致内墙寻路错误；改为用 `CURRENT_MAP`（即当前区域地图，已由 `enterZone` 同步），顺带修正 ch2/洞天长期用错地图的潜在 bug。`Actor` 新增 `removeBuffKind` 用于分层/离场清理。
- 测试段 `G`（确定性/连通性/随机增益/掉落属性/buff 落地/rogueBest 存档与旧档默认）；`browser-check` 增秘境 E2E（进入刷怪→清剿推进→死亡返镇）。
- 验证：tsc 0 错 / 前端 794/0 / 后端 28/0 / build 整包通过 / browser 语法 OK。

---

## ③ NPC 好感多结局

**目标**：好感达阈值解锁不同"关系结局"（道侣 / 师徒 / 知己 / 仇敌），触发专属对话/任务/奖励，并影响结局演出。

**设计**
- `data/social.ts` 给每位 `NPC_FRIENDS` 增结局节点：`affinity` 阈值 → `endingId`；`ending` 定义（`title` / `desc` / `dialogueNode` / `reward`）。
- `Player` 存 `friendEnding: Record<id, endingId>`（已达成的结局）；`SocialPanel` 好友页显示关系进度 + 达成徽章。
- 解锁结局时弹对话（复用 `chapter1` 的 `DialogueNode` / `StoryEffect`）+ 发奖励；"仇敌"可关闭交互甚至转敌对 NPC（实战化较重，建议后置为可选增强）。

**复用**：`chapter1` 对话树、`social.ts` 现有 affinity 体系、`widgets` 面板布局。
**验证**：测试段 H（阈值触发结局、重复不重复发奖、存档往返）。
**风险**："仇敌"实战化需 NPC 战斗系统，建议作为二期增强。

**已实现（2026-10-22）**：
- `data/social.ts` 增 `FriendEnding` 接口 + `FRIEND_ENDINGS`（每位 NPC 3 档：初识 minAffinity 0 / 知交 5 / 生死至交 10，共 9 个）+ `SOCIAL_STORY`（9 个 `StoryNode` 结局对话，复用 `chapter1` 的 `StoryNode` 结构与 `StoryEffect`，高好感档含 `giveItem/giveExp/giveStones` 奖励）。`social.ts` 导入 `StoryNode` 类型（无循环，chapter1 不依赖 social）。
- `Player`：`friendEnding: Record<string,string> = {}`（存档 `friendEnding`，旧档默认 `{}`）；`requestFriendEnding(id)` 按当前好感从 `FRIEND_ENDINGS` 选取满足门槛中最高档，落档并返回 `nodeId`；`applyEffects` 已原生处理结局节点的道具/修为/灵石。
- `Game`：`Object.assign(STORY, SOCIAL_STORY)` 将结局节点并入对话树；`SocialPanel` 好友行新增「结缘」按钮（传 `onFriendEnding` 回调）；`openFriendEnding(id)` 调 `requestFriendEnding` 后用 `DialogueRunner.open(nodeId)` + `openDialogueBox()` 弹出结局对话（播放前隐藏社交面板避免叠层；补丁：漏配 `openDialogueBox` 曾致结局对话不弹层，已修复并经真实 Chromium 试玩确认弹层出现）。
- 测试段 `H`（9 节点定义、好感 0/5/10 三档触发对应结局、结局落档、无此好友失败、结局节点效果落地赠青锋剑、存档往返、旧档默认 `{}`）；`browser-check` 增 NPC 多结局轻量断言（满好感→结缘→至交节点弹出）。
- 验证：tsc 0 错 / 前端 815/0 / 后端 28/0 / build 整包通过 / browser 语法 OK。

---

## ④ 移动端适配

**目标**：真机可玩——HUD/面板触屏可点、布局自适应、canvas 缩放、安全区、关闭 hover-only 流程。

**设计（审计 + 补完）**
- 视口/缩放：`index.html` + `Game` 监听 `resize` / `orientation`，canvas DPR 适配；HUD 改用相对锚点避免竖屏错位。
- 面板触控：所有 `.panel` 在触屏下可滚动/点遮罩关闭；按钮命中区 ≥44px；社交/活动/宗门等新增面板确认触控友好。
- 横竖屏：建议锁横屏（修仙 RPG 常规）或做竖屏适配并给提示。
- 输入：确认全部技能槽 + 系统入口（飞升/渡劫等）都有触控入口；低端机降特效（已有 Sfx/BGM 帧驱动降级）。

**复用**：已有 `ui/MobileControls` + `core/Input` 触控状态。
**验证**：`browser-check` 增 `sMobile`（窄视口各面板可开可关）；真机/模拟器手动过一遍。
**风险**：需真机环境（同 `browser-check` 受环境限制时 report-only）。

**已实现（2026-10-22）**：基础控制（虚拟摇杆 + 4 技能钮 + 交互 + 自动）此前已具备，本轮为**审计补完**，聚焦可代码验证、真机体验最直接的缺口：
- **阻塞态禁用控件（P0）**：`MobileControls` 原 `root` 在 `uiRoot` 的 zOrder 高于所有面板（后于 `cutscene` 挂载），左下 360×360 摇杆捕获区会**遮挡面板左下**，且面板/对话打开时摇杆仍驱动"背后移动"。新增 `interactive` 态 + `setInteractive(v)`：`Game.onFrame` 顶部每帧按 `phase==="play" && !dialogue.isOpen && !cutscene.active && !anyPanelOpen()` 同步，false 时隐藏控件并复位摇杆（`setJoystick(0,0,false)`、清 `joyId`）；各输入回调（摇杆/技能/交互/自动）加 `!interactive` 守卫。
- **触控输入积压卫生**：`handleKeys` 原 `consumeInteract/consumeSkillPress/consumeAuto` 仅在 `!blocked` 时消费，导致面板打开时按下会**积压**、关闭那一帧滞后触发。改为**每帧无条件取走、按 blocked 决定是否执行**（丢弃积压）。
- **iOS 默认手势抑制**：`Input.attach` 给 canvas 的 `touchstart/touchmove` 加 `preventDefault({passive:false})` + `gesturestart`，抑制双击缩放/橡皮筋/双指缩放。
- **触控热区**：交互/自动按钮加 88×88 `hitArea`（间距 ~106 不重叠），提升真机命中。
- **附带修复（真实 bug）**：`core/Rig.ts` 头部装饰误用 Laya 不存在的 `drawTriangle`（恒抛 `pageerror`），改 `drawPoly`（三点）；`browser-check` 全局是 `window.__game`，但①~③ 加的中后段误写裸 `g.`（从未真跑而假失败），改为 `goto` 后注入 `window.g` 简写。

**真机/模拟器遗留（需设备）**：安全区（刘海/底部手势条）`env(safe-area-inset-*)` 适配；竖屏锁横屏提示；长列表面板（背包/技能/商店/图鉴）触屏滚动；按钮统一 ≥44px 物理尺寸（受 DPR 影响）；低端机特效分级。这些依赖真机度量，列为后续。
**E2E 已知时序**：`browser-check` 串联中 P1 的 `ascend`（飞升）会播放过场并冻结世界，使紧随其后的①坠魔谷多阶段/②秘境推进 E2E 端到端失败（其核心逻辑已由 node smoke F/G 段覆盖，非功能缺陷）；移动端 E2E 段已前移至飞升前验证，四项（显隐/摇杆驱动/面板禁用/恢复）真跑全 true。

---

## ⑤ 接真实云社交

**目标**：好友（加好友/好感同步）、邮件（云端收发）、宗门（贡献/建筑跨设备同步），离线降级本地。

**设计**
- 后端 `server/server.js` 增 `/api/friends`（GET 列表 / POST 加）、`/api/mail`（GET 收件 / POST 发 / PUT 已读）、`/api/sect`（GET / POST 贡献与建筑）；同 token 鉴权。
- `core/CloudClient.ts` 增对应方法（`friends()` / `addFriend()` / `mails()` / `sendMail()` / `sectState()` / `sectContribute()`），3s 超时失败回退本地（沿用 `req` / 降级范式）。
- `Player` / `SocialPanel`：在线读云端写云端，离线/失败用本地（现有 NPC 逻辑不动）；好友从"预设 NPC"扩展为"云端好友 + 本地 NPC 兜底"。
- 冲突策略：以云端为准 + 本地缓存（最小可用为先）。

**复用**：`CloudClient` 现有 `req` / 超时 / 降级、`save/load` / `leaderboard` 范式、`social.ts` 数据结构。
**验证**：后端 smoke 增社交接口测试；前端测试段 I（在线/离线降级）；需起 `server`。
**风险**：最重——需后端 + 鉴权 + 数据模型；建议置后，先落地最小可用（云端邮件收发即体现"云社交"）。

**已实现（2026-10-22，基础数据层；联网联调交给他人）**：按"先备好基础数据"落地**账号级结构化社交档案通道**，与整包 `save` 并存（save 管进度、social 管社交，二者同源 Player，短期冗余可接受；联调方可后续将 save 去社交字段以消除冗余）。业务规则仍留客户端 `social.ts`（单一事实源），服务器只做**结构化存储 + 容错校验 + 鉴权**，不复制规则。
- `data/social.ts`：`SocialProfile` 接口（`friends/friendEnding/mailsClaimed/sectContribution/sectBuildings`，镜像 Player 社交字段）+ `defaultSocialProfile()` 空档工厂。
- `entities/Player.ts`：`exportSocial()`（导出档案）+ `applySocial(p)`（云优先逐字段覆盖，容错清洗；`null`/非法不影响本地）。
- `server/db.cjs`：新增 `social_profiles` 表（user_id PK，friends/friend_ending/mails_claimed JSON + sect_contribution 标量 + sect_buildings JSON + updated_at；标量便于服务端聚合，预留宗门贡献榜）。
- `server/server.cjs`：`GET /api/social`（Bearer；无记录返回默认空档）+ `PUT /api/social`（Bearer；`sanitizeSocial` 容错清洗后 upsert；非法 profile 400、无 token 401）。
- `core/CloudClient.ts`：`getSocial(token)` / `putSocial(token, profile)`，沿用 3s 超时 + 失败返回 null/false 降级范式。
- `Game.ts`：`continueGame` 读档后 `pullCloudSocial()` 拉取云端档案覆盖本地（远程优先、本地兜底）；`updatePlay` 尾部 `socialSyncT` 每 12s 节流 `putSocial(player.exportSocial())`（小 payload、独立于整包 save、失败静默）。
- 验证：tsc 0 / 前端 822/0（+5 导出/应用/默认档）/ 后端 42/0（+14 社交档案：默认档/写读往返/覆盖/非法 400/无 token 401）/ build 整包通过。

**联调方待办（联网测试）**：① 部署 `server` 到目标云 + 配置 `CloudClient` base 指向；② 真实双设备同步验证（A 设备互动 → B 设备 `pullCloudSocial` 生效）；③ 冲突策略升级（当前"后写覆盖/云优先"，可改版本向量或字段合并）；④ 跨玩家云原生社交扩展（好友邮件收发 `/api/mail`、宗门贡献榜——`sect_contribution` 标量已为此预留）；⑤ `save` 与 `social` 去重（save 去掉社交字段，social 独立高频通道）；⑥ 鉴权从游客 token 升级（防伪造好感/贡献）。

---

## 依赖与排期

- ② 前置"Player buff 挂载点"：若 `Zone.buff` 未落地到属性，先补一层再开工。
- ④ 可与任意项并行（独立，不触碰核心逻辑）。
- ⑤ 单独排期、需后端资源，置后。
- 建议顺序：①（充实现有内容，低风险）→ ②（程序化地图，中风险）→ ③（剧情驱动，低风险）→ ④（审计补完，依赖真机）→ ⑤（后端+联调，最重）。

## 验证口径（与 P1 一致）

- `tsc --noEmit` **0 错**
- `npm test`：前端冒烟（新增 F~I 段）+ 后端（28 → +社交接口）
- `npm run build`（tsc + vite build）整包通过
- 旧档 **v1/v2/v3** 兼容（`SaveState` 字段缺省给默认）
- `test/browser-check.cjs` 增补 `sZhuomo` / `sMobile` 等块（需 `npm run dev` + Chromium 环境；report-only）
- `README.md` / `p2-plan.md` 更新
