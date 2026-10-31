# 对标主流游戏玩法差距分析（P3 规划参考）

> 目的：以主流修仙 RPG / Roguelike / ARPG 为标杆，盘点本项目（《修仙·凡人之路》）现有玩法，识别差距，给出按优先级的补齐建议。
> 现状基于代码审计（P1 十项 + P2 五项均已落地，typecheck/smoke/build 全绿）。标杆参考：《鬼谷八荒》《一念逍遥》《烟雨江湖》《Hades》《死亡细胞》《暗黑破坏神》《原神》。

## 0. 现状盘点（量化）

| 维度 | 现状（代码事实） |
|---|---|
| 技能 | `src/data/skills.ts`：约 15-20 个，分 `sword`(剑修)/`law`(法修)/`universal` 三系；含 `mpCost/cd/power/射程/AOE` 字段；开局默认掌握剑修 4 技 |
| 装备 | `items.ts`：三槽 `weapon/armor/trinket` + 词缀池 `affixes` + 套装 `sets.ts` + 暴击/速度词条 |
| 战斗 | 实时等距 ARPG；技能 CD+蓝耗+射程+AOE；`Combat.Buff`（atkUp/defUp/haste/hot/shield/slow/stun）；`Actor` 有 `critRate/critMul`（暴击） |
| 区域 | ≥5（落霞镇/洞天/坠魔谷/秘境 rogue/门派等），各含 wild 刷怪与 boss |
| 成长 | 境界体系 + 渡劫 + 突破丹 + 技能学习（详见 P1） |
| 经济 | 灵石 + 宗门贡献 + 战令/月卡/签到（`BattlePassPanel`/`DailyPanel`） |
| 社交 | 好友好感多结局（P2③）+ 云社交档案基础（P2⑤）+ 竞技场 + 排行榜 + 宗门 |
| Roguelike | 秘境：分层 + 随机增益/诅咒 Buff + 房间刷怪 + 出口推进 + 掉落 + 死亡保留收益（P2②） |
| PVE | 镇妖塔（分层爬塔）+ 坠魔谷（Boss 多阶段狂暴/召唤，P2①） |
| 留存/运营 | 日常/成就/图鉴/签到/月卡/战令/离线收益 |
| 叙事 | 主线 ch1/ch2 + NPC 多结局（P2③） |
| 移动端 | 适配（P2④） |

**结论**：底层骨架（战斗/装备/技能/区域/经济/社交/Roguelike/PVE/养成/留存）已齐备且可玩。差距集中在**玩法深度、系统间耦合、多人实时、内容广度、演出精细度**。

---

## 1. 差距矩阵（按玩法支柱）

### 1.1 战斗手感与深度（最高优先级）
- **标杆**：《Hades》顶级手感（冲刺 i-frame、弹反、硬直、击退、处决）；《永劫无间》振刀；《原神》元素反应。
- **现状**：有技能+Buff+暴击，但**缺位移/闪避/格挡/弹反**；无元素/属性克制；无连招/韧性/受身；受击反馈弱。
- **差距**：
  - 缺翻滚/冲刺（i-frame）+ 体力消耗
  - 缺格挡/弹反（parry）/招架 counter
  - 缺属性克制（金木水火土/冰雷）与元素反应
  - 缺连招系统（平A接技能派生）与硬直/击飞/击退
  - 缺韧性（霸体）与受身脱离
- **优先级**：🔴 高（战斗是核心留存点，直接决定手感上限）

### 1.2 技能/功法/流派养成
- **标杆**：《鬼谷八荒》功法搭配 + 逆天改命天赋树 + 多流派；《烟雨江湖》门派武学。
- **现状**：三系技能，但**无功法搭配/无被动天赋树深度/无流派 build**。
- **差距**：
  - `TalentPanel` 已存在但天赋深度/流派联动待补（build 差异化）
  - 缺"功法组合生效"（如剑+雷触发感电）
  - 缺可切换武器形态（《Hades》式）
  - 缺被动技能/心法系统
- **优先级**：🟡 中（增强 build 多样性，但依赖 1.1 战斗骨架）

### 1.3 装备与养成深度
- **标杆**：《暗黑破坏神》词缀随机 + 套装 + 大秘境；《鬼谷八荒》炼器/炼丹养成。
- **现状**：三槽 + 词缀池 + 套装基础（`sets.ts` 已引用）。
- **差距**：
  - 词缀随机化/品质梯度（白绿蓝紫橙）待实测深度
  - 缺强化/精炼/镶嵌/洗练
  - 缺套装特效（2/4 件触发）落地验证
  - 缺roguelike式局内临时装备
- **优先级**：🟡 中（已有基础，扩展边际收益高）

### 1.4 世界探索与奇遇
- **标杆**：《鬼谷八荒》大地图探索 + 奇遇 + 隐藏；《烟雨江湖》支线。
- **现状**：多区域 + 采集点 + 奇遇事件 + 隐藏宝箱 + 动态刷怪（P3-5 已落地）；支线任务 + 选择分支（条件选项 + flag 驱动世界状态，P3-7 已落地）；多周目（NG+ 元进度继承，P3-7 已落地）；仍缺隐藏区域/解谜、世界事件级动态叙事。
- **差距**：
  - 奇遇节点/采集/隐藏宝箱已实现（P3-5）；支线任务/选择分支已实现（P3-7）；多周目（NG+ 元进度继承）已实现（P3-7）；仍缺隐藏区域/解谜、世界事件级动态叙事
- **优先级**：🟡 中（内容广度，提升"修仙世界感"）

### 1.5 经济与交易
- **标杆**：MMO 拍卖行/玩家交易/经济循环。
- **现状**：灵石 + 宗门贡献 + 战令；缺玩家间交易。
- **差距**：
  - 缺拍卖行/玩家交易/摆摊
  - 缺材料产出闭环（采集→炼丹/炼器→消耗）
  - 缺经济通胀调控
- **优先级**：🟢 低（单机/弱联机阶段非刚需，云社交联调后考虑）

### 1.6 社交与多人
- **标杆**：《一念逍遥》宗门战 + 实时社交；《鬼谷八荒》结义/道侣。
- **现状**：好友好感多结局 + 云社交档案基础 + 竞技场 + 排行榜 + 宗门。
- **差距**：
  - 🟡 实时多人（同屏/组队/宗门战）—— 仍待联调方（零依赖 node:http 无 WebSocket，P2⑤待办）
  - 🟢 软实时在线道友（轮询 presence 列表）—— 已实现（P3-6）
  - 🟢 邮件往来（`/api/mail` 收发/领取，防重领）—— 已实现（P3-6）
  - 🟢 宗门贡献榜（公开聚合 `sect_contribution`）—— 已实现（P3-6）
  - 缺道侣/结义系统（现有"结缘"仅为结局演出）
  - 缺公会/宗门玩法（建设/战）
- **优先级**：🔴 高（社交是修仙品类核心差异点；数据层✓ + 邮件/榜单/在线✓ 已落地，同屏多人待联调）

### 1.7 Roguelike 深度
- **标杆**：《Hades》房间事件 + 神明祝福 + 叙事碎片；《死亡细胞》地图分支 + 细胞升级。
- **现状**：秘境分层 + Buff/诅咒 + 刷怪 + 掉落（P2②）。
- **差距**：
  - 缺事件房间（祭坛/商人/问号房）
  - 缺遗物/祝福选择（局内 build）
  - 缺局内成长（升级选技能/属性）
  - 缺 BOSS 机制多样性（现仅坠魔谷多阶段）
  - 缺地图分支/种子分享
- **优先级**：🟡 中（已有骨架，补"房间类型+祝福池"收益高）

### 1.8 叙事与多周目
- **标杆**：《鬼谷八荒》多结局 + 选择分支；《烟雨江湖》支线剧情。
- **现状**：主线 ch1/ch2 + NPC 多结局（P2③）。
- **差距**：
  - 缺支线任务/奇遇剧情（已落地：苏砚/玄机子双支线 ✅）
  - 关键选择分支影响世界线（已落地：玄机子相助/举报抉择→村长对话据此变化 ✅）
  - 缺世界事件（动态叙事）
- **优先级**：🟢 低（叙事驱动型，需内容产能）

### 1.9 运营/赛季/活动
- **标杆**：手游赛季 + 限时活动 + 活动副本。
- **现状**：日常/成就/图鉴/签到/月卡/战令/离线收益。
- **差距**：
  - 赛季排行（最小切片已落地：活跃赛季 + 榜单保最优/计排名 ✅）
  - 限时活动副本（最小切片已落地：魔尊/妖兽试炼，限时击败计入赛季榜 ✅）
  - 缺赛季重置（多赛季轮替）
  - 缺活动货币/兑换（pass）
- **优先级**：🟢 低（运营期再补；最小骨架已就绪）

### 1.10 演出与表现
- **标杆**：精细特效/镜头/过场演出。
- **现状**：`cutscene` 过场 + 基础特效；`Rig` 角色渲染。
- **差距**：
  - 技能特效层次（弹道/命中/受击）
  - 镜头演出（击杀/BOSS 登场）
  - 角色动画丰富度
- **优先级**：🟢 低（体验加分，非功能缺口）

---

## 2. 优先级路线图（建议 P3 顺序）

| 序 | 方向 | 依据 | 难度 | 依赖 |
|---|---|---|---|---|
| **P3-1** | 战斗手感：闪避✅/五行克制✅/格挡✅/弹反✅/连招✅ | 核心留存，Hades 范式 | 中 | 无 |
| **P3-2** | Roguelike 房间类型✅ + 祝福/遗物池✅ + 局内成长 | 已有秘境骨架，扩展收益高 | 中 | P3-1（战斗） |
| **P3-3** | 天赋/功法 build 深化✅（TalentPanel 联动流派） | 已有面板，增强差异化 | 中 | P3-1 |
| **P3-4** | 装备深度：品质色阶✅ + 词缀随机✅ + 套装特效 + 强化/洗练 | 已有词缀/套装基础 | 中 | 无 |
| **P3-5** | 世界探索：采集✅ + 奇遇✅ + 隐藏宝箱✅ + 动态刷怪✅ | 内容广度 | 高（内容产能） | 无 |
| **P3-6** | 社交实时化：邮件✅ + 宗门榜✅ + 软实时在线道友✅（同屏多人待联调） | 数据层已备（P2⑤） | 高 | 云联调（同屏） |
| **P3-7** | 叙事：支线✅ + 选择分支✅ + 多周目✅ | 内容产能 | 高 | 无 |
| **P3-8** | 运营/赛季/活动副本：赛事季排行✅ + 限时活动副本✅（活动货币/多赛季轮替待补） | 运营期 | 中 | 活动货币/赛季重置 |

**不应该现在做**：拍卖行/玩家交易（经济闭环未验证前易失衡）、赛季（需稳定玩家基数）、高清演出重制（边际收益低）。

---

## 3. 立即可做的"低成本高感知"项（不依赖大重构）
1. **战斗**：加"翻滚闪避"（i-frame + 体力），手感立竿见影；加属性克制表（5 行）。
2. **Roguelike**：秘境加"事件房"（商人/祭坛/问号），复用现有 `STORY` 节点，零新架构。
3. **装备**：词缀随机化 + 品质色阶（白→橙），复用 `affixes`/`sets`。
4. **社交**：云联调后补 `/api/mail` + 宗门贡献榜（标量已预留）。
5. **探索**：野外加采集点（灵草/矿），喂给炼丹/炼器，闭合经济。

> 注：所有"联调类"项（邮件/宗门战/实时多人）依赖 P2⑤ 的云后端联调与人手，按约定交由他人；本项目只需保证客户端数据层与接口就绪（已完成）。

---

## 落地进度（按路线图顺序）

### ✅ P3-1 战斗手感（翻滚闪避 + 五行属性克制已落地；格挡/弹反/连招待续）
- **翻滚闪避（i-frame + 体力）**：`Player.tryRoll(dx,dy)` 消耗体力（22）获得 `0.34s` 无敌帧（复用 `Actor.invincible`）+ 定向位移（速度 ×2.4，持续 0.26s），冷却 0.55s，体力每秒回复 16；桌面 `Shift` 键 / 移动端新增"翻滚"按钮（`MobileControls.rollBtn`，88×88 热区）触发，方向取摇杆或移动路径/朝向；翻滚期间屏蔽普通移动避免叠加。
- **五行属性克制**：`data/elements.ts`（`ElementKind` 金木水火土 + `ELEMENT_CYCLE` 相克环 + `elementMultiplier`/`elementTag`）；`SkillDef.element` 标注（火球术=火、玄冰缚=水、五雷正法=金、剑芒=金）；`MonsterDef.element` 标注（狼族=木、魔物族=火）；伤害链路 `applySkillDamage` / `damagePlayer` 注入克制倍率（克 ×1.5 / 被克 ×0.7），飘字标记"克/抗"。
- **验证**：typecheck 0 / 前端 smoke 830/0（+8 五行单测）/ 后端 42/0 / build 212.69 kB / 真实 Chromium 试玩（`test/playthrough4.cjs`）：翻滚 `invincible:0.34`、`stamina 100→78`、`rolling:true`；五行倍率单测全过；战斗闭环正常不崩。
- **格挡/弹反/连招（P3-1b 已完成）**：
  - **格挡**：`Player.tryBlock/endBlock`（桌面 Q 键按住 / 移动端格挡钮持续触发），`guardMul=0.5` 减伤 50%；格挡期间站定、暂停体力回复（持续消耗 12/s）、不可施法；`blockCd` 短冷却防秒切刷弹反。
  - **弹反**：举盾 `blockT ≤ 0.18s` 窗口内被命中 → 完全免伤 + 对攻击者 `stun 1s`+击退 + 强反馈（顿帧/震屏/`sfx.parry`/"弹反!" 浮字+爆发），接入唯一伤害入口 `Game.damagePlayer`。
  - **连招（命中连击数）**：`Game.streak` 每次玩家技能命中 +1，受击或超时（2s）归零；每 5 连击触发小范围击退+浮字奖励；Hud 顶部「X 连击」面板（与既有「连携」交替技能倍率并行，叠加 build 深度）。
  - **UI**：`Hud` 左下「御」格挡图标 + 顶部「X 连击」面板；`Sfx.parry`；移动端 `MobileControls.blockBtn`（按住持续）。
  - **验证**：typecheck 0 / 前端 smoke 878/0（+6 P3-1b）/ 后端 42/0 / build 223.48 kB / 真实 Chromium 试玩（`test/playthrough9.cjs`）：按住 Q 格挡图标显示、弹反 dmg=0、格挡减伤精确 ratio=0.5、连击「7 连击」面板可见；仅云接口降级。

### ✅ P3-2 秘境事件房 + 祝福/遗物池 —— 已完成
- **事件房**：`genRogueMap` 在非出生/出口房间随机 1~2 个标记 `shop/altar/question`；`prepareRogueFloor` 画地面标记（金/紫/红）、`spawnRogueWave` 跳过事件房不刷怪、`updateRogue` 检测踩中触发对应 `STORY` 节点（复用对话树 + 已修复弹层）。
- **祝福/遗物池**：`ROGUE_BUFFS`（当层临时增益）与新增 `ROGUE_RELICS`（整局持久增益，用 `Buff.persistent` 区分，死亡清空）；祭坛可选祝福或遗物，问号随机（修为/灵石/遗物/反噬）；`Game.applyEffects` 新增 `openShop/rogueBlessing/rogueRelic/rogueMystery` 四类效果分流。
- **验证**：typecheck 0 / 前端 smoke 844/0（+6 P3-2）/ 后端 42/0 / build 216.38 kB / 真实 Chromium 试玩（`test/playthrough5.cjs`）：事件房生成(events:2)、对话弹层(dlgOpen:true)、祝福(buffs+1 临时)、遗物(buffs+1 持久)、问号不崩；仅云接口降级。

### ✅ P3-4 装备品质色阶 + 词缀随机化 —— 已完成
- **品质色阶**：`data/rarity.ts`（白/绿/蓝/紫/橙，倍率 1.0→2.0 + 词缀数 0→4）；`Player.rarities` 按装备 id 玩家级共享（首次获得时 `rollRarity` 记录，可复现、旧档缺省）；`equipStat` 聚合时对基础数值乘 `statMul`；掉落按来源传 bias（Boss 0.6 / 秘境高层递增 / 普通 0）提升高品质概率。
- **词缀随机化**：`rollAffixes(id, count)` 词缀数由品质决定（凡品 0 → 传说 4），复用既有词条池（攻/防/速/暴/吸）；洗练（refine）按品质重滚词缀。
- **UI 色阶**：`BagPanel` 装备名按品质着色（灰/绿/蓝/紫/橙）+ 追加品质名 + 第二行显示品质加成/词条/套装。
- **验证**：typecheck 0 / 前端 smoke 854/0（+11 P3-4）/ 后端 42/0 / build 217.59 kB / 真实 Chromium 试玩（`test/playthrough6.cjs`）：高 bias 获得装备记录品质、词缀按品质数、裸 atk14→装备后 27.8（=12×1.15 缩放精确）；仅云接口降级。

### ✅ P3-3 天赋/功法 build 深化（TalentPanel 联动流派）—— 已完成
- **流派↔天赋共鸣**：`SchoolDef.synergy`（剑修→剑道 / 法修→灵修 / 体修→锻体 / 散修无）；`Player.schoolSynergy` getter + `talentStat` 聚合时对共鸣分支效果 ×`TALENT_SYNERGY_MUL`(1.5)，形成"选流派 + 点对应天赋"的 build 协同（与品质/词条/套装构成完整装备-天赋-流派体系）。
- **UI 标记**：`TalentPanel` 共鸣分支标题标「共鸣 ×1.5」金色高亮；`SchoolPanel` 流派行显示共鸣分支。
- **验证**：typecheck 0 / 前端 smoke 862/0（+8 P3-3）/ 后端 42/0 / build 217.93 kB / 真实 Chromium 试玩（`test/playthrough7.cjs`）：切换剑修(syn=sword)、功法/天赋面板弹层(visible)、剑道天赋 effAtk 20>散修 17；仅云接口降级。

### ✅ P3-5 世界探索·野外采集 + 炼丹经济闭环 —— 已完成
- **野外采集点**：`ZoneDef.gathers`（ch1/dungeon/zhuomo 等），`buildGathers` 吸附到最近可走格保证可踩中；`updateNearGather` 每帧检测 + 冷却再生（CD 默认 30s）；F/触控交互优先采集（复用 `talkNearest` 通道）；`addGatherMarkers` 地面草绿标记 + 名称；Hud 底部「按 F 采集 X×n」提示。
- **采集→炼丹闭环**：新增采集材料 `ling-cao`（灵草）+ 丹方 `r-cao-dan`（灵草×3→回血丹），复用既有 `alchemize`/`ALEMBIC_RECIPES`/`ForgePanel` 炼丹台；采集所得灵草可直接炼丹成回血丹，闭合「野外采→丹房炼」经济（wood/stone/mo-he/mo-qi 等材料同样可经既有建造/炼器/丹方消耗）。
- **验证**：typecheck 0 / 前端 smoke 871/0（+9 P3-5）/ 后端 42/0 / build 220.14 kB / 真实 Chromium 试玩（`test/playthrough8.cjs`）：5 个采集点(灵草×3/木×1/石×1)、同帧定位→检测→采得灵草×2、炼出回血丹；仅云接口降级。

### ✅ P3-5 余下·奇遇事件 / 隐藏宝箱 / 动态刷怪 —— 已完成
- **隐藏宝箱**：`ZoneDef.chests`（ch1/dungeon/zhuomo 共 7 个，含 `hidden` 隐藏宝箱不显示地表标记、需踩中发现）；`buildChests` 过滤已开启（持久化于 `player.flags["chest:zone:gx,gy"]`）+ 不可走坐标吸附；`updateNearChest` 每帧检测 + 冷却再生；F/触控交互优先开箱（复用 `nearGather`/`talkNearest` 通道）；`openChest` 按 `LootDrop` 掉落表掷算发放；`addChestMarkers` 金色箱标记（隐藏箱除外）；Hud 底部「按 F 开启宝箱」提示。
- **奇遇事件**：`data/encounters.ts` 的 `ENCOUNTER_STORY` 节点池（灵狐赠草/老者传道/灵泉疗愈/古修遗蜕/神秘商铺），在 Game 启动并入全局 `STORY`（与 CH2/SOCIAL 同机制）；`worldEvents` 每 60~120s 周期随机触发一段奇遇对话（`dialogue.open` + 效果应用），对话/过场/面板开启时暂停。
- **动态刷怪**：`ZoneDef.dynamicSpawn {interval,maxAlive,pool,aggro}`（各区配置），`dynSpawnTick` 每帧计时，在玩家附近随机可走格按上限补怪（独立于任务刷怪），营造"生机世界"；上限保护避免泛滥。
- **验证**：typecheck 0 / 前端 smoke 892/0（+9 P3-5余）/ 后端 42/0 / build 228.41 kB / 真实 Chromium 试玩（`test/playthrough10.cjs`）：3 宝箱(含隐藏)、同帧定位→开启获回血丹×2+已开标记、奇遇对话开启/关闭、动态刷怪 0→3 补怪；仅云接口降级。

### ✅ P3-7 叙事·选择分支 + 支线任务 —— 已完成（含多周目 + 内容扩展）
- **选择分支（条件选项 + flag 驱动）**：`StoryChoice.cond`（flag/notFlag/questActive/questDone/levelMin 五类条件）、`StoryEffect.setFlag` 记录选择；`DialogueRunner` 新增 `visibleChoices`（按 `cond` 谓词过滤）且 `advance` 改用可见索引，`DialogueBox` 渲染可见选项保证索引一致；`Game.evalCond` 实现谓词（flag/任务状态/境界）。一条对话线随玩家状态（未接/进行中/已完成）动态显示不同选项。
- **支线任务示范（第一位 NPC）**：新增落霞镇 NPC「云游客·苏砚」（`NPCS` + `SIDE_STORY` 节点池，运行期并入 `STORY`），其委托「遗失的玉佩」（`QUESTS.q_lostjade`）可经**对话交付**（`completeQuest`）或**猎杀完成**（`addKill`），二者统一置 `flags["qdone_<id>"]` 供分支判定，避免双奖励死锁；任务奖励：灵草×5 / 灵石+80 / 修为+150。
- **支线内容扩展（第二位 NPC · 道德抉择）**：新增落霞镇 NPC「游方道人·玄机子」（`dialogue: xuanji_root`），其委托「玄机子的请托」（`QUESTS.q_xuanji_herb`）呈现**互斥双分支**——「相助」（接取→猎杀碧睛妖狼三头→交付，灵草×3/灵石+150/修为+250）与「举报」（举发其私炼禁丹，灵石+80 赏银并置 `xuanji_gone` 离镇）。两分支均经 `setFlag xuanji_engaged` 互斥隐藏，完成后以 `flag/qdone` 分流闲谈，证明选择分支系统可横向铺量到多个 NPC。
- **跨 NPC 世界线涟漪（选择影响世界线）**：玄机子抉择经 `setFlag xuanji_reported` / `qdone_q_xuanji_herb` 沉淀为世界状态，村长（`cunzhang_root`）据此动态露出对应分支——举报后提及"禁丹义举"并赠灵石×30，相助后提及"助道长善缘"。证明单点选择可涟漪至他者对话，初步闭合"关键选择分支影响世界线"差距。
- **多周目（NG+ 元进度继承）**：见下方独立进度块。
- **验证**：typecheck 0 / 前端 smoke **933/0**（+27 P3-7 全量：选择分支 6 + 多周目 6 + 玄机子 9 + 世界线涟漪 6）/ 后端 42/0 / 真实 Chromium 试玩：`playthrough11.cjs`（苏砚支线：初始 3 选项→接取后仅"交付"1 选项→交付灵石 60→140）、`playthrough13.cjs`（玄机子双分支：相助 v1=3→接取 v2=1→仅"交付" v3=1→完成灵石 60→210；举报 v1=3→举发→`xuanji_reported/gone` 置位、灵石 60→140；举报后村长露"禁丹义举"分支、灵石 140→170）；仅云接口降级。
- **多周目（NG+ 元进度继承）**：新增 `core/ngplus.ts`，元进度独立于单局存档（`xiuxian.meta.v1`，含 `ngPlus/daoHen/clears`）；通关（`onChapterWin` 钩子，`ngGranted` 防重入）授予 `grantClear`（周目+1、道痕+50）并持久化；新开局（`startNewGame`）经 `carryover(ngPlus)` 继承**起始修为+300/周目、灵石+150/周目、历练效率×1.1/周目**（`Player.expMulNg` 注入 `gainExp`，随档持久化）。与既有局内转世（`reincarnations`）解耦——NG+ 是跨周目 meta，转世是单局内境界跃迁。
- **验证**：typecheck 0 / 前端 smoke 916/0（+6 P3-7多周目）/ 后端 42/0 / build 231.99 kB / 真实 Chromium 试玩（`test/playthrough12.cjs`）：触发通关→元进度 `{ngPlus:1,daoHen:50,clears:1}` 落盘；开 NG+ 新档→`ngPlus=1`、灵石 60→210(+150)、修为 60→360(+300)；仅云接口降级。

### ✅ P3-6 社交实时化（邮件 / 宗门贡献榜 / 软实时在线道友）—— 本地联机版已落地（同屏多人待联调）
- **跨玩家邮件**：`server/db.cjs` 新增 `mails` 表；`server.cjs` 路由 `/api/mail/send`（按昵称寻址、拒绝自寄/不存在收件人）、`/api/mail`（收件箱）、`/api/mail/:id/claim`（服务端标记防重领、返回奖励）；`CloudClient` 加 `sendMail/getMail/claimMail`；`Player` 加 `mailbox` 缓存 + `syncMailbox/markMailClaimed/applyMailReward` + 序列化；`SocialPanel` 邮件页接入玩家信箱与写信表单。
- **宗门贡献榜**：`/api/social/leaderboard` 公开聚合 `social_profiles.sect_contribution`；`CloudClient.sectLeaderboard`；`SocialPanel` 宗门页展示前 8 名。
- **软实时在线道友**：`presence` 表 + `/api/presence`（PUT 上报 / GET 近 60s 活跃）；`CloudClient.putPresence/presenceList`；`Game` 每 12s 上报自身坐标并拉取在线列表；`SocialPanel` 新增「道友」页签轮询展示。
- **与 P2⑤ 数据层衔接**：邮件/贡献/在线均走既有 `CloudClient` 超时降级通道，无服务时本地不崩、仅功能不可用。
- **验证**：typecheck 0 / 前端 smoke **942/0**（+9 P3-6 纯逻辑）/ 后端 smoke **57/0**（+15 P3-6：邮件收发/领取/防重领、宗门榜聚合、presence 往返）/ build **241.36 kB** / 真实 Chromium 试玩（`test/playthrough14.cjs`，自带游戏后端）：双账号甲/乙 → 甲发乙收（mailId=1）→ 领取返回 exp+100/石+50、二次领取→null（防重领）；UI 邮件页渲染收件箱（mailboxLen=1）；乙写入贡献 300 → 宗门榜含乙；乙上报 presence → 在线道友列表含乙；仅预期负例（不存在收件人 404、重复领取 400）控制台报错，无 pageerror。
- **仍待联调方**：🔴 同屏/组队多人（零依赖 node:http 无 WebSocket，需引入推送通道或联调现有实时服务）。

### ✅ P3-8 运营/赛季（最小切片）—— 赛季排行 + 限时活动副本 已落地
- **赛季榜（server 权威）**：`server/db.cjs` 新增 `seasons`（种子常驻"开服盛典"）+ `season_scores`（按 user×season 保最优）；`server.cjs` 路由 `GET /api/season`（当前活跃赛季 + 前 10 榜单）、`POST /api/season/score`（鉴权、保最优、回传排名）；`CloudClient` 加 `getSeason/submitSeasonScore`；`Player` 加 `seasonBest` 本地镜像 + 序列化。
- **限时活动副本（魔尊/妖兽试炼）**：`EventPanel` 扩展为展示当前赛季信息 + 榜单前 10 + 「进入活动副本」按钮（`EventHooks`）；`Game` 新增 `enterEventDungeon/updateEventDungeon/endEventDungeon`——进入后限时 60s 内击败试炼妖王，通关按速通计 `eventScore` 并自动提交赛季榜、发放灵石/修为奖励，超时/陨落判负；`updatePlay` 每帧驱动计时与胜负判定，提示栏让位倒计时。
- **验证**：typecheck 0 / 前端 smoke **945/0**（+2 P3-8 seasonBest 往返）/ 后端 smoke **68/0**（+11 P3-8：赛季 GET/提交/保最优/排名/鉴权）/ build **245.78 kB** / 真实 Chromium 试玩（`test/playthrough15.cjs`，自带游戏后端）：双账号甲/乙 → 提交成绩 → 乙 8000 居首、甲 5000 次席；甲提交更差 3000 被跳过（保最优、排名维持 2）；进入活动副本击杀试炼妖王 → 得分 8557、赛季排名 #1、灵石 +427、本地 `seasonBest` 更新为 8557；无 pageerror。
- **已知限制 / 后续**：🔸 活动货币与兑换（pass）、多赛季轮替重置 待补。
- **已修复渲染缺陷**：`mo-zun`（魔尊）作为 boss 渲染时触发 Laya `DrawPolyCmd.run` 空指针崩溃（同样砸到坠魔谷的魔尊）。根因：`src/core/Rig.ts` 犄角 `drawPoly` 调用参数顺序错（把 `(points, fillColor, ...)` 当成首参，导致 `points` 实为 `null`）；已改为 `(0, 0, points, fillColor, ...)`。试炼妖王已切回 `mo-zun`（魔尊试炼）。
