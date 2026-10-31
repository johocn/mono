# 修仙 · 凡人之路（2.5D RPG MVP）

> **开发定位**：单人独立开发（一人 + AI 工具链）。目标定位为 **AI 辅助国风 indie 品质 + 深度系统养成 + 完整可玩内容量**，靠数据驱动的系统广度/深度与国风美术氛围取胜，不硬拼商业大作 3A 美术精度。完整长期规划见 [`docs/SOLO_DEV_PLAN.md`](docs/SOLO_DEV_PLAN.md)。

对标《神仙道》产品形态的 2.5D 斜视角修仙 RPG：**第一章「落霞镇」 + 第二章「乱星海」**双章节垂直切片——
剧情对话 + 技能战斗 + 背包装备 + 境界突破 + 任务链 + Boss 战 + 坊市炼器 + 声望宗门 + 多区域传送 + 分章云存档/排行榜，全流程可玩通。

技术栈与 `tour-game` / `laya-brawler` 工程范式一致：**LayaAir 3（本地运行时）+ TypeScript + Vite**，
后端为零依赖 **node:http + node:sqlite**（Node 22）。

## 快速开始

```bash
npm install          # 安装 vite / typescript

# 终端 1：游戏（H5，浏览器打开 http://localhost:5180）
npm run dev

# 终端 2：后端（账号/云存档/排行榜，端口 3210）
npm run server

# 测试（无需浏览器，全绿：tsc 0 错 + 前端 1171 + 后端 68）
npm run typecheck    # tsc --noEmit
npm test             # 前端冒烟 + 后端冒烟

# 浏览器 E2E（需先 npm run dev；playwright 复用 ../laya-brawler/node_modules）
node test/browser-check.cjs
```

后端不启动也能玩：云接口失败自动回退 localStorage 本地存档。

## 操作

| 输入 | 行为 |
|---|---|
| 鼠标左键 | 点地面移动 / 点怪物选目标 / 点 NPC 交谈 / 点小地图导航 |
| 靠近货郎 / 铁匠 | 交谈（点击或 `F`）打开**坊市**（买卖） / **炼器台**（强化装备） |
| 靠近宗门执事 | 交谈打开**宗门大殿**（消耗声望兑换装备 / 消耗品 / 传功技能） |
| 码头传送阵 | 走到发光符文环上，弹确认后往返**落霞镇 ↔ 乱星海**（状态跨图保留） |
| `1` `2` `3` `4` | 释放技能栏技能（超射程自动接近） |
| `B` / `K` | 背包 / 技能面板 |
| `N` | 建造面板（放置/拆除建筑，消耗木材/石料） |
| `F` | 与最近 NPC 交谈 |
| `T` / `O` | 天赋树 / 法宝面板 |
| `C` / `A` / `Q` | 图鉴 / 成就 / 日常任务面板 |
| `E` | 切换挂机/自动战斗（锁定最近怪、自动接近并循环施法） |
| `P` | 战令 · 月卡 · 签到面板（每日签到 / 激活月卡 / 逐档领战令奖励） |
| `R` | 渡劫（天劫仪式：突破筑基/金丹/元婴/化神前须渡劫；HUD「⚡渡劫」按钮亦可触发） |
| `L` | 炼丹（打开炼器台「炼丹」标签页，按丹方消耗材料炼制丹药；HUD「⚗炼丹」按钮亦可触发） |
| `V` | 灵兽面板（查看/出战/收回灵兽，捕捉残血妖兽；HUD「🐾灵兽」按钮亦可触发） |
| 🗼 镇妖塔按钮 | 进入镇妖塔爬塔（层数推进 + 每日重置 + 奖励；塔内传送阵可返回落霞镇） |
| 🏟 竞技场按钮 | 进入竞技场：与排行榜镜像对手对战，胜则积分 +、负则积分 -（不低于下限），本地排名实时更新 |
| 🪶 飞升按钮 | 当化神圆满（当前世达顶点且天劫已渡）时出现：飞升转世开启第二世（保留装备/灵兽/修为，+12% 永久继承加成），并解锁坠魔谷 |
| 🎉 活动按钮 | 有进行中限时活动时出现：查看双倍修炼/登录有礼/节日活动；登录有礼每日自动发放，双倍期间击杀收益翻倍 |
| 🤝 社交按钮 | 常驻：好友论道（每日好感+奖励）、NPC 邮件（按境界解锁领奖）、宗门建设（贡献升级修炼堂/战功堂/藏经阁永久加成）、门派大比（每日 PVE 演练得贡献） |
| 移动端 | 左下虚拟摇杆移动 · 右侧 1-4 技能按钮 · 底部「交谈」按钮 · 右下「自动」挂机按钮 · 渡劫/炼丹/灵兽按钮 |
| `空格` | 推进对话（也可直接点击对话框/任意处继续） |
| 右键 / `ESC` | 取消建造放置 / 关闭面板 |
| `G` | **三界舆图**（人界 / 灵界 / 仙界古风卷轴舆图 + 当前所在标记） |
| `Y` | **人物志**（韩立 / 南宫婉 / 银月 / 厉飞雨 立绘与形象设定） |
| `M` | 静音开关 |

> 地图默认 **3 倍缩放**；右上角小地图显示玩家/怪物/建筑点位，**点击小地图可导航前往**。
> 木材、石料在击杀妖兽林怪物时掉落，开场与村长「灵根测试」也会赠送。

## 美术资源：三界舆图 / 人物志

《凡人修仙传》世界观素材已接入（AI 生成，中国仙侠水墨工笔风、可爱治愈向）：

| 资源 | 文件 | 用途 |
| --- | --- | --- |
| 三界舆图 | `public/art/sanjie-map.png` | 舆图面板底图 + 标题界面背景 |
| 韩立 | `public/art/hanli.png` | 玩家头像 / 对话头像 |
| 南宫婉 | `public/art/nangongwan.png` | 落霞镇 NPC · 对话头像 |
| 银月 | `public/art/yinyue.png` | 落霞镇 NPC · 对话头像 |
| 厉飞雨 | `public/art/lifeiyu.png` | 落霞镇 NPC · 对话头像 |

- **`G` 三界舆图**：卷轴式舆图，左侧底图 + 三界分层色带，右侧信息栏显示**当前所在 / 三界说明 / 已至之地 / 地域详情**；
  点击图上金色标签可选中地域查看简介，当前所在位置有金色呼吸脉冲标记。
- **`Y` 人物志**：左侧大立绘卡 + 右侧角色切换，展示每位角色的**外貌 / 服饰配色 / 神态气质 / 标志元素**。
- **落霞镇 NPC**：南宫婉（8,10）、厉飞雨（14,10）、银月（20,10）已入场，头顶带圆形立绘徽章，交谈有专属对话分支。
- 资源通过 `src/core/Assets.ts` 统一登记与异步预加载；贴图未就绪时自动回落占位色块，不会阻塞逻辑。
- 微调入口：标注坐标/文案 → `src/ui/WorldMapPanel.ts` 的 `WORLD_MAP_LABELS`、`REALM_BANDS`、`ZONE_MARKS`；
  角色设定 → `src/data/cast.ts`。

> **已知限制**：立绘为带背景的完整插画（非透明抠图），因此以「画卡 / 头像」形式使用；
> 地图上跑动的小人仍是程序化骨架（`src/core/Rig.ts`，便于走/攻击/受击动画与朝向翻转）。
> 若后续产出透明底抠图版，可在 `Rig` 中加入贴图渲染分支直接替换。

## 玩法闭环（第一章）

1. **开场旁白**：凡人书生途经落霞镇
2. **村长·灵根测试**：习得「剑芒」，接任务「初战妖兽」
3. **传功长老**：剑修/法修分支，全 **24 技能**数据驱动（含进阶 / 玄水功法）
4. **妖兽林**：猎杀 5 只碧睛妖狼 → 自动结算奖励（青锋剑/护心甲/修为）
5. **回报村长**：接「妖狼王之患」，Boss 赤睛在后山高地现身
6. **击杀 Boss**：通关演出 → 结算（用时/斩妖/境界）→ 上传排行榜

**经济循环（贯穿全程）**：击杀妖兽掉**灵石**与**妖丹** → 村口**货郎·周三郎**买卖物什（买入按基准价、卖出 4 折回收）→ **铁匠·石敢当**消耗灵石 + 妖丹**炼器**，把装备强化到 `+9`（攻防每级 +12%，速度暴击 +6%；失败不掉级）。任务与剧情也会发放灵石。

## 玩法闭环（第二章 · 乱星海）

1. **渔村长者**：接「海妖之患」（讨伐海妖）——乱星海新怪：海妖 / 蟹将 / 鲛人，掉灵石与珊瑚 / 珍珠 / 鲛绡等新材料
2. **玄水宗使者**：拜入玄水宗，习得「水剑诀 / 玄水护体」，接「平定礁区」与「覆海之患」
3. **覆海蛟**：星岛高台 Boss，击杀后第二章通关；旁白埋**坠魔谷**钩子（第三章伏笔）
4. **宗门执事**：用声望兑换避水剑 / 鲛鳞甲 / 鲛珠 / 传功「玄水护体」
5. **支线**：「搜救渔民」「鲛人之约」；境界延伸至**元婴 / 化神**，与第二章数值匹配

> 落霞镇码头 ↔ 乱星海渔村双向传送阵，随时往返；背包 / 装备 / 灵石 / 炼器 / 任务 / 建造 / 声望跨图保留。

## 目录结构

```
xiuxian/
├── index.html / vite.config.ts        # Vite 入口（端口 5180）
├── public/libs/                       # LayaAir 3 本地运行时（laya.core/webgl_2D）
├── engine/                            # vendored LayaAir 类型声明
├── src/
│   ├── main.ts                        # Laya 初始化 + 启动
│   ├── Game.ts                        # 主循环：世界/输入/战斗/剧情/存档编排
│   ├── core/
│   │   ├── IsoMap.ts                  # 2.5D 核心：等距投影/A*/Y-sort/跟随相机
│   │   ├── Rig.ts                     # 程序化角色骨架（占位美术，可换 Spine）
│   │   ├── Combat.ts                  # 伤害公式/buff 纯函数
│   │   ├── Dialogue.ts                # 对话树播放器（纯逻辑）
│   │   ├── Input / Fx / Sfx / Rng / Storage / CloudClient
│   │   ├── Combo.ts                   # 连携时间窗状态机（纯函数，无随机）
│   │   ├── Cutscene.ts                # 过场演出控制器（黑边/标题卡/旁白/跳过）
│   │   └── Tutorial.ts                # 新手引导步骤机（纯逻辑，仅首跑）
│   ├── data/                          # 数据驱动：境界/技能/道具/怪物/地图/剧情/坊市/宗门/区域
│   │   ├── skills.ts(24)/talents.ts/artifacts.ts/achievements.ts/dailies.ts
│   │   ├── shop.ts                    # 商店库存 + 价格 + 炼器曲线（消耗/成功率/加成）
│   │   ├── sect.ts                    # 玄水宗定义 + 声望兑换项
│   │   ├── affixes.ts                 # 装备随机词条池（攻/防/速/暴/吸 5 类）
│   │   ├── sets.ts                    # 套装表（n 件套效果）
│   │   ├── zones.ts                   # 多区域注册表（ZoneDef + 传送点配置）
│   │   └── story/
│   │       ├── chapter1.ts            # 落霞镇：对话树 + 任务链 + NPC 点位（含货郎/铁匠）
│   │       └── chapter2.ts            # 乱星海：地图图例 + 3 主链 NPC + 3 主线 + 2 支线 + 传送点
│   ├── entities/                      # Actor / Player / Monster
│   └── ui/                            # HUD/技能栏/背包/技能/对话/标题/结算/坊市/炼器/宗门/传送
│       ├── TalentPanel / ArtifactPanel / CodexPanel / AchievementsPanel / DailyPanel / MobileControls
├── server/                            # 零依赖后端（.cjs）
│   ├── server.cjs                     # 游客登录/云存档/排行榜（按 chapter 分榜）
│   └── db.cjs                         # node:sqlite 三张表（leaderboard 含 chapter）
└── test/
│   ├── stubs.cjs                      # Laya 桩（Node 中驱动真实源码；Graphics 白名单防 API 漂移）
│   ├── smoke.cjs                      # 数据/公式/寻路/对话/Player/AI/整章流程/坊市炼器/第二章
│   ├── smoke.server.cjs               # 后端 HTTP 全链路（含分章榜单）
│   └── browser-check.cjs              # 真实 Chromium E2E（需 dev server 运行中，含传送往返）
```

## 关键设计

- **2.5D 斜视角 + 3 倍缩放**：菱形瓦片 `(gx-gy)*32, (gx+gy)*16` 等距投影，角色层每帧按 `gx+gy` 排序（Y-sort）实现前后遮挡；整张地图根节点 `scale(3)` 放大，相机/点击拾取/特效文字按 `1/zoom` 反缩放保持屏幕字号；点击拾取 = 逆投影 + A* 寻路（8 向禁贴角）。
- **右上角小地图导航**：俯视缩略网格 + 玩家/怪物/建筑/NPC 点位，点击换算回网格坐标自动寻路前往。
- **数据驱动**：24 技能 / 多道具装备 / 7 怪物（含 2 Boss）/ 8 境界 / 24x16 字符图例地图（落霞镇 / 乱星海）/ 对话树 + 任务链（含第二章），全部在 `src/data` 改配置即生效，新增技能/天赋/法宝/成就/日常不用改运行时代码。
- **主城双图·青玉仙镇（存档预设）+ 云荒原野（开放世界）**：落霞镇换用专属「青玉仙镇」主题（青玉/鎏金/朱栏，与既有 5 套主题明显区分），含贴地对齐围墙、铁匠铺（炉火铁砧）/药店（葫芦药柜）/民居（院墙灯笼）专属剪影与招牌，作为可复用预设（`town_qingyu.ts`）。当前 ch1 默认地图为全新的「云荒原野」开放世界（`town_open.ts`，套用专属 `yunhuang` 暖陶土/苔绿/暮色主题），**无边界围墙**、向四周自然延展；多座民居 + 一间铁匠铺 + 一间药店 + 五座可运作传送阵（乱星海/秘境/坠魔谷/无限回廊/山门）全连通，NPC 分布于功能区与街道，主街脉络动线清晰（A* 全连通）。围墙渲染新增 `drawWall`（底面贴合等距菱形、垂直挤出，与地面平行）。
- **伤害公式**：`atk*power * 100/(100+def)`，0.9~1.1 浮动 + 暴击；种子随机（mulberry32）保证可复现，冒烟测试依赖确定性。
- **占位美术**：角色/场景全部 Graphics 程序化绘制，无外部资产即可运行；后续接 Spine 只需替换 `core/Rig.ts` 实现。
- **战斗手感（纯表现增强）**：命中触发顿帧（hitstop，世界逻辑暂停、仅表现层推进）、镜头震屏（trauma² 衰减）、怪物沿攻击方向被击退（摩擦衰减、撞墙回钳、Boss 按 `MonsterDef.knockResist` 减免）、命中处多方向粒子爆散（暴击更猛）、攻击劈砍刀光残影；所有副作用落在 `Game/Actor/Fx/Camera/Rig` 层，`Combat.calcDamage` 保持无副作用纯函数。
- **成长深度（词条 + 套装）**：装备首次获得时用独立 `affixRng` 滚 1~2 条随机词条（`data/affixes.ts`），按装备 id 玩家级共享、存档兼容、旧档无词条数值不变；`data/sets.ts` 定义 n 件套效果，穿戴达件数后由 `Player.equipStat` 叠加（词条吸血按伤害比例回血）。配装从"纯数值"变为有 build 空间。
- **程序化 BGM 与氛围**：`Sfx` 用帧驱动调度（非 setInterval）四主题（标题/探索/战斗/Boss）和弦进行，按场景自动切换；无 AudioContext 时静默降级；场景加星点/萤火氛围粒子（呼吸闪烁），全程零外部资产。
- **灵石与炼器**：灵石为唯一货币（怪物掉落 + 任务/剧情发放），`data/shop.ts` 统一配置商店库存、买卖价（卖价 = 基准价 × 0.4）与炼器曲线（消耗 `40+30×lv` 灵石 + `1+⌊lv/2⌋` 妖丹，成功率 `0.95-0.08×lv` 下限 25%，失败不掉级）；强化等级记在 `player.forge[装备id]`（同名装备共享），每级攻防 +12%、速度暴击 +6%，效果直接计入 `effAtk/effDef/effSpeed/critRateTotal`。炼器用独立随机源 `forgeRng`，不污染战斗与掉落的确定性。
- **建造系统**：4 种建筑（茅屋/丹房/灵田/石墙）由 `data/buildings.ts` 配置，放置后该格变为阻挡（寻路绕行）、拆除返还 50% 材料；建造记录按 zone 分存并随存档读写（读档自动还原到当前区域地图）。木材/石料来自妖兽掉落与村长赠予。
- **多区域（zone）与传送阵**：`map.ts` 的 `buildMap(legend)` 工厂生成任意 `MapDef`，`isWalkable/inBounds/findPath` 支持传入 map，`IsoMap.rebuild` 切图重绘，`Game.enterZone` 统一重建世界（地面/怪物/NPC/相机边界/小地图）；玩家对象全程唯一，背包/装备/灵石/炼器/任务/建造/声望跨图保留。两图各设发光符文环传送点，踏入弹 `TransferPanel` 确认后往返。
- **声望与宗门**：支线/讨伐产出声望，拜入玄水宗后由宗门执事处消耗声望兑换装备/消耗品/传功（`data/sect.ts` + `SectPanel`）；HUD 显示章节名/宗门/声望。
- **分章存档与排行榜**：存档含 `chapter/unlockedZones/reputation/sect`；后端 `leaderboard` 加 `chapter` 列（ALTER 向后兼容迁移），按 `(user_id, chapter)` 各保留最优，`ResultUI` 按章节分栏展示，两章成绩独立上榜。
- **存档**：`SaveState` 已升级 **v2**（含天赋/法宝/图鉴/成就/日常/引导），向后兼容旧 v1 档（缺省字段给默认值）；云（Bearer token）优先、localStorage 兜底；通关自动上传排行榜（每人每章保留最优成绩）。
- **成长深化（连携 + 天赋 + 法宝）**：`core/Combo.ts` 为无随机时间窗连携状态机（切换技能叠层、受击/超时断裂、HUD 连携读数）；`data/talents.ts` 天赋树 10 节点分剑/法/体三系，境界突破经 `gainExp` 发天赋点，`spendTalent` 并入 `effAtk/effDef/effSpeed/critRateTotal/最大气血`；`data/artifacts.ts` 法宝为「主动技 + 被动属性」新装备槽（`giveArtifact` 获赠、`equipArtifact` 装备即学会主动技），被动并入同一组属性 getter。
- **留存元系统（图鉴/成就/日常/引导）**：图鉴记录怪物(见过/击杀)/物品(获得)/技能(掌握)三态并给首杀修为奖励；成就为数据化纯谓词（`data/achievements.ts` + `achMet`），可领一次性奖励；日常按**日期播种**轮换（`data/dailies.ts` 纯函数、测试可注入时钟），击杀/炼器/任务/赚灵石四类进度自动推进；新手引导复用对话驱动、`core/Tutorial.ts` 标志位步骤机、仅首跑（`tutorialDone`）。
- **表现补全**：`Sfx` 细分打击音效（暴击/格挡/闪避/回血/拾取/炼器成败/连携/成就，静默降级不变）；`core/Cutscene.ts` 章节开场/Boss 出场黑边淡入 + 标题卡 + 旁白、可点击/空格/ESC 跳过、过场期间冻结世界；命中闪白（Actor 叠加层衰减）、暴击数字放大、重击按威力加大顿帧/震屏、低血屏幕红色呼吸晕影。
- **移动端触控**：`Input` 扩展虚拟摇杆向量 + 触控技能/交互按钮（触屏探测 `isTouchDevice`）；`ui/MobileControls.ts` 左下摇杆 + 右侧 4 技能 + 底部「交谈」按钮，仅触屏显示；`Actor.nudge` 直控位移（墙体分轴 clamp）保留 walk 动画；画布随视口缩放、HUD/面板双端自适应，桌面键鼠体验不变。

## P0 成长扩展（灵根 / 宝石 / 功法 / 秘境 / 挂机 / 战令）

- **灵根 + 战力评分**：`data/roots.ts` 五系灵根（金木水火土，数据驱动带乘区 `eff*` 与相生相克），玩家开局测灵根得 `random/attuned` 取值，决定各项 `effXxx` 乘区，最终属性 = 基础 × 乘区；`Player.fightPower` 按攻防速暴血五维 + 装备/词条/套装/灵根乘区综合评分（Boss 阈值常量化），HUD 常驻显示，存档 v3 兼容（`root` 缺省给默认、旧档补默认）。
- **宝石镶嵌 + 装备洗练**：`data/gems.ts` 攻/防/速/暴/血/灵 6 类宝石（数据驱动，可镶嵌入装备 4 孔），`Player.socketGem/unsocketGem` 并入 `eff*` 乘区；`refine` 用独立 `refineRng` 重投随机词条（消耗灵石、同名装备共享进度），数值经 `Combat`/`Player` 纯函数并入，确定性可复现，`ForgePanel` 提供镶嵌/卸下/洗练交互。
- **功法流派切换**：`data/schools.ts` 多套功法（剑修/法修/散修/玄水功法等），各绑定技能组与被动乘区，`Player.setSchool` 切换装备技能组并叠加被动；`SchoolPanel` 可视化切换，存档 v3 兼容（`school` 缺省散修、旧档补默认）。
- **副本/秘境**：`data/dungeon.ts` 复用 `buildMap` 工厂生成秘境地图（严格行宽一致），`zones.ts` 注册「残破洞天」入口（落霞镇 (4,4) 传送阵进入），踏入即获「秘境灵气」持续回血 buff、自动镇守 Boss（妖狼王）、无论是否有任务都刷怪；buff/随机掉落复用既有 `spawnLogic`。
- **挂机/自动战斗**：`Game.autoFight`（键鼠 `E` / 移动端「自动」按钮切换）每 0.25s 锁定最近怪，超距则复用既有寻路自动接近、在射程内循环施法 1-4 槽；自愈类技能仅在低血时释放，复用 `useSkill` 既有选敌/施法/扣蓝路径，顿帧冻结期间自动暂停。
- **战令 / 月卡 / 签到**：`data/battlepass.ts` 数据驱动 30 档战令（按活跃天数 = 签到天数解锁）、每日签到基础奖励（每 7 天额外）、月卡激活后 30 天每日领灵石；`Player.signIn/claimTier/activateMonthCard/claimMonthCard` 纯方法 + 确定性奖励，`BattlePassPanel` 可视化签到/激活/逐档领取，`SaveState.battlePass` 扩 `monthCardUntil/monthCardClaimed` 字段并向后兼容旧档。

## P1 对标主流（离线收益 / 天劫已落地）

- **离线收益**：`Player.lastSeen` 时间戳 + `collectOffline` 按「平均挂机效率」折算修为/灵石，封顶 12h、月卡加成；`continueGame` 自动结算并弹 `OfflinePanel`，旧档（无 `lastSeen`）不崩。
- **天劫 / 渡劫**：`realms.ts` 筑基/金丹/元婴/化神标 `tribulation`；`realmIndex` 改为封顶语义（未渡境不生效），`Player.resolveTribulation(rng)` 按战力比定成功率，成功永久 +6% 属性（`tribStacks`）、失败温和掉血可再渡；`Game` 触发黑边过场 + 雷暴（`Cutscene`/`Fx`/`Camera.addTrauma`），HUD「⚡渡劫」按钮 + `R` 键手动触发。旧档按已达境界默认已过劫，战力不回退。
- **炼丹**：`data/alembic.ts` 丹方（复用现有材料：妖丹/珊瑚/珍珠/鲛珠/妖王内丹/鲛绡 → 回血丹/回蓝丹/修为丹/突破丹/元婴丹）；`Player.alchemize` 用独立 `alembicRng` 随境界提升成功率（0.85~0.97），消耗材料、失败退还半数（灵石不退，体验优先），产出丹药经 `useConsumable` 服用生效；`ForgePanel` 以「炼器 / 炼丹」双标签承载，`L` 键 + HUD「⚗炼丹」按钮打开。零新增存档字段（材料消耗体现在背包中，旧档天然兼容）。
- **灵兽**：`data/beasts.ts` 灵兽定义（协战属性/射程/冷却 + 出战被动加成 atk/def/hp + 获取方式）；`Player.beasts/activeBeast` + `beastBonus/addBeast/setActiveBeast/captureBeast`，捕捉用独立 `captureRng`（确定性可注入）；出战灵兽由 `Game.updateBeast` 每隔冷却自动对最近怪开火，复用 `calcDamage`+`Monster.takeDamage`+`resolveDeaths` 死亡发奖管线，独立 `beastRng` 不污染战斗随机；捕捉 = 对残血(≤25%)非 Boss 妖兽用【捕兽铃】；开局赠送「青鸾」+3 捕兽铃；`BeastPanel` 查看/出战/收回 + 捕捉入口，`V` 键 + HUD「🐾灵兽」按钮打开。`beasts/activeBeast` 存入 `SaveState`，旧档默认空（向后兼容）。
- **镇妖塔**：`data/tower.ts`（30 层配置：每层怪物组合 + 属性缩放 scale + 通关奖励 exp/灵石/材料；每 5 层有层主妖狼王）；入口复用 `enterZone` 模式（新 zone `tower`，独立 24 宽地图 + 返回传送阵）；`Player.towerFloor/towerBest/towerDaily` 存档，每日进入重置到第 1 层（历史最高 `towerBest` 永久保留）；清空一层 → 短暂停顿 → 下一层并 `gainExp`/`gainStones`/`addItem` 发奖；塔内死亡则本日进度重置并返回落霞镇。`spawnLogic` 对塔区跳过（塔自管刷怪）。`TowerPanel` 展示进度 + HUD「🗼镇妖塔」按钮打开。
- **竞技场**：`data/arena.ts`（ELO 强度加权 `arenaDelta`/`arenaExpected`，K=28、单场变动夹 5~44；镜像对手 `buildMirrorOpponent` 以玩家当前属性 × 强度倍率 `mirrorMult`（排名差推导 0.7~1.3）生成；离线兜底本地排行榜 `seedArenaBoard` 12 名、积分 700→2700 宽幅、境界随排名递增）；`Player.arenaPoints/arenaWins/arenaLosses/arenaBoard` + `ensureArenaBoard`（首次播种）+ 独立 `arenaRng`（不污染战斗随机）；对战为**镜像 PVE**：`Game.startArenaDuel` 复用 `calcDamage` 逐回合结算（玩家先手、击杀即停），胜则按 ELO 加分、被击败的对手掉分、并尽力 `cloud.submit` 同步排行榜，负则按 ELO 扣分（不低于下限）、击败你的对手涨分（排行榜双向移动）；`arenaNextOpponent` 在玩家当前排名附近 ±2 选对手（强度曲线贴合进度）；`arenaRank` 由本地排行榜实时计算；`ArenaPanel` 展示积分/排名/对手 + 挑战/换对手，`openArena` + HUD「🏟竞技场」按钮。
- **飞升转世**：`realms.ts` 新增 `ASCEND_REALMS`（炼虚/合体/大乘/渡劫/真仙，阈值与基础属性更高）+ `realmIndexIn`/`MAX_REINCARNATIONS`(=1)/`MAX_REALM_LEN`；`Player` 取境改为双世表驱动（`realmTable()` 按 `reincarnations` 切 `REALMS`/`ASCEND_REALMS`，`realmIndex`/`effAtk`/`effDef`/`applyRealmCaps`/`tribulationChance` 等走 `currentRealm()`，`growthMul=tribMul*inheritMul` 合并天劫+继承加成 `inheritMul=1+0.12*reincarnations`）；`canAscend` 门控 + `reincarnate()`（保留装备/灵兽/天赋/法宝/修为，重置本世天劫，+12% 永久继承）；`data/zhuomo.ts` 坠魔谷区域（全开放矩形地图 + 魔物，飞升后由 `openTransfer`/`addPortals` 放行），`unlockedZones` 补入 `zhuomo`；HUD「🪶飞升」按钮（满足 `canAscend` 显隐）→ `Game.openAscend` 播放 `Cutscene` 后结算解锁。存档 `reincarnations` 旧档默认 0。
- **限时活动**：`data/events.ts`（`EventDef`：id/name/desc/type/start/end + 倍率或奖励；`activeEvents(now)` 按日期窗口 YYYY-MM-DD 过滤生效活动，可注入 `now` 验证过期；内置双倍修炼（长期 ×2）、登录有礼（每日自动发灵石+修为，幂等）、新春庆典（2030-02 限时））；`Player.eventKillMul(now)` 返回生效 double 倍率之积（默认 1），`Game.onMonsterDeath` 击杀修为/灵石按倍率取整翻倍、飘字同步；`Player.claimLoginEvents(now, day)` 当日首次进入自动发放（按 `eventClaims[id]===day` 幂等），`Game` 在两次 `refreshDaily` 后调用；`ui/EventPanel.ts` 展示生效活动 + HUD「🎉活动」按钮（`hasActiveEvent` 显隐）→ `openEvent` 打开（纳入 `anyPanelOpen` 与全部面板隐藏块）。存档 `eventClaims` 旧档默认 {}。
- **社交系统（p1-social，单机降级）**：`data/social.ts`（`NPC_FRIENDS` 论道好感+分档奖励、`MAILS` 按境界解锁含奖励、`SECT_BUILDINGS` 修炼堂+3%经验/战功堂+5%灵石/藏经阁+2%双资源、`sectWarRng(day)` 门派大比确定性随机源）；`Player.interactFriend(id,day)` 每日论道好感+1（封顶 10，奖励按档位放大）、`claimMail(id)` 按境界领奖、`addKill` 每杀 +1 宗门贡献、`upgradeSectBuilding(id)` 花贡献升级、`sectWar(day)` 确定性 PVE 演练（胜则贡献+灵石+修为，每日一次）；`gainExp`/`gainStones` 分别乘 `sectExpMul()`/`sectStoneMul()`（建筑驱动，默认 1）；`ui/SocialPanel.ts` 三标签（好友/邮件/宗门）+ HUD「🤝社交」按钮常驻 → `openSocial`（纳入 `anyPanelOpen` 与全部面板隐藏块）。云接口（真实好友/邮件）后续接 `CloudClient`。存档 `friends/mailsClaimed/sectContribution/sectBuildings/sectWarDay` 旧档默认空/0。

## 第二章深化（P2，进行中）

- **坠魔谷玩法深化（p2-①，已落地）**：`data/monsters.ts` 增 `demon?: boolean` 标记 + 魔物族（魔狼 `mo-jing-lang` / 邪修 `xie-xiu` / 心魔 `xin-mo`）+ 魔尊 `mo-zun`（Boss，周期 AOE `魔渊咆哮`、专属掉落表 `mo-zun-neidan`/`mo-he`/`mo-qi` 等）；`data/items.ts` 增掉落物 `mo-he` 魔核 / `mo-qi` 魔气 / `mo-zun-neidan` 魔尊内丹；`data/zones.ts` 的 `zhuomo` 区 `wild` 改挂魔物、`bossId` 改 `mo-zun`，`enterZone` 进入即触发魔尊现身。魔尊多阶段由 `Game.updateZhuoBossPhases` 按血量阈值（≤66% / ≤33%）触发狂暴（`baseAtk`/`baseDef`/`baseSpeed` 提升）+ 召唤魔狼/心魔（`spawnDemonAdd`），沿用既有 `Monster.rollDrops`→`addItem` 掉落管线。镇魔进度：`Player.addKill` 对 `demon` 怪物累加 `demonSlain`（存档 `demonSlain`，旧档默认 0），魔尊伏诛额外给修为/灵石。

- **Roguelike 秘境（p2-②，已落地）**：`core/MapFactory.ts` 的 `genRogueMap(seed, floor)` 用确定性 `rogueRng`（`makeRng(seed ^ 盐 ^ floor*常数)`）程序化生成「房间矩形 + L 形走廊」地图，强制左上 3×3 安全屋（返回阵）并以连廊串起各房，**保证全连通、同种子同层完全一致**；返回 `RogueFloor{ map, spawn, exit, roomCenters }` 复用 `buildMap` 完成图例→MapDef 转换。`zones.ts` 注册 `rogue` 区（占位地图 + 左上返回阵传送至落霞镇）、ch1 `(3,9)` 增秘境入口。随机增益/诅咒复用战斗 `Buff` 体系（`ROGUE_BUFFS`：atkUp/defUp/haste/hot/shield 增益、slow 诅咒），`pickRogueBuff(rng)` 按层选定、`enterZone` 经 `Player.addBuff` 落地到 `effAtk/effDef/effSpeed`。`Game` 每进入随机种子从第 1 层起：`prepareRogueFloor` 按层生成地图+随机 buff+`spawnRogueWave`（逐房间中心刷怪，数量随层增）+ 出口紫色标记；`updateRogue` 检测清剿→抵出口推进下一层并更新 `player.rogueBest`（秘境最高层，存档 `rogueBest` 旧档默认 0）；`onRogueDeath` 保留奖励退回落霞镇。`Actor` 新增 `removeBuffKind` 用于分层/离场清理本层 buff。**关键修正**：`Monster.update` 的 A* 由硬用全局 `MAP` 改为 `CURRENT_MAP`（当前区域地图，已由 `enterZone` 同步），既支撑秘境内墙寻路，又修正 ch2/洞天长期用错地图的潜在 bug。

- **NPC 好感多结局（p2-③，已落地）**：`data/social.ts` 增 `FriendEnding` 接口 + `FRIEND_ENDINGS`（每位可结缘 NPC 3 档：初识 minAffinity 0 / 知交 5 / 生死至交 10，共 9 个）+ `SOCIAL_STORY`（9 个 `StoryNode` 结局对话，复用 `chapter1` 的对话树结构与 `StoryEffect`，高好感档含 `giveItem/giveExp/giveStones` 奖励，如青锋剑/突破丹/灵石）。`Player` 存 `friendEnding: Record<id,endingId>`（存档 `friendEnding`，旧档默认 `{}`），`requestFriendEnding(id)` 按当前好感从 `FRIEND_ENDINGS` 选满足门槛中最高档并落档返回对应对话节点。`Game` 将 `SOCIAL_STORY` 并入对话树（`Object.assign(STORY, SOCIAL_STORY)`），`SocialPanel` 好友行新增「结缘」按钮，`openFriendEnding(id)` 经 `DialogueRunner.open(nodeId)` + `openDialogueBox()` 播放专属结局对话（隐藏社交面板避免叠层）。

- **移动端适配（p2-④，审计补完）**：基础触控（左下虚拟摇杆 + 右侧 4 技能钮 + 交互/自动，仅 `isTouchDevice()` 显隐）此前已具备；本轮补核心缺口——**阻塞态禁用控件**：`MobileControls` 的 `root` zOrder 高于所有面板，摇杆 360×360 捕获区会遮挡面板左下并造成"面板打开时背后移动"；新增 `setInteractive(v)`，`Game.onFrame` 每帧按 `phase==="play" && !dialogue/cutscene && !anyPanelOpen()` 同步，false 时隐藏控件并复位摇杆，各输入回调加 `!interactive` 守卫。**输入积压卫生**：`consumeInteract/consumeSkillPress/consumeAuto` 改为每帧无条件取走、按 blocked 丢弃，消除"关闭面板那帧滞后触发"。**iOS 手势抑制**：canvas `touchstart/touchmove/gesturestart` `preventDefault({passive:false})` 防双击缩放/橡皮筋/双指缩放；交互/自动按钮加 88×88 `hitArea` 提升命中。附带修复 `core/Rig.ts` 误用 Laya 不存在的 `drawTriangle`（恒抛 pageerror）→ `drawPoly`。真机遗留：安全区 inset、竖屏锁横屏提示、长列表面板触屏滚动、统一 ≥44px 物理按钮、低端机特效分级。E2E：`browser-check` 移动端段（显隐/摇杆驱动/面板禁用/恢复）真实 Chromium 全 true。

- **云社交基础数据（p2-⑤，基础数据就绪，联调待他人）**：新增**账号级结构化社交档案通道**，与整包 `save` 并存（业务规则留客户端 `social.ts`，服务器只做结构化存储 + 容错校验 + 鉴权，不复制规则）。`data/social.ts` 定义 `SocialProfile`（friends/friendEnding/mailsClaimed/sectContribution/sectBuildings）+ `defaultSocialProfile()`；`Player.exportSocial()/applySocial()`（云优先逐字段覆盖、容错、`null` 不影响本地）；`server/db.cjs` 新增 `social_profiles` 表（JSON 字段 + `sect_contribution` 标量，预留服务端聚合）；`server.cjs` 增 `GET/PUT /api/social`（Bearer；无记录返回默认空档、非法 profile 400、无 token 401、`sanitizeSocial` 容错）；`CloudClient.getSocial/putSocial`（3s 超时、失败降级 null/false）；`Game` 读档后 `pullCloudSocial()` 覆盖本地、`updatePlay` 每 12s 节流上传。联调方待办：部署指向 base、双设备同步验证、冲突策略升级（当前后写覆盖）、跨玩家邮件收发 `/api/mail`、宗门贡献榜（标量已预留）、save/social 去重、游客 token 升级防伪造。

## 已知限制（MVP 取舍）

- 全程序化美术/音频（零外部资产）：WebAudio 音效 + 程序化 BGM，无 Spine 立绘/过场动画（角色为色块骨架）
- 怪物 AI 为 追击/普攻/Boss 周期 AOE，无群体配合
- 装备 3 槽 + 1 法宝槽；商店固定库存（不刷新/不限量）；天赋/法宝/图鉴/成就/日常/引导已接入但内容为初版
- 过场为黑边+文字演出，无立绘动画；移动端为功能性触控，未做复杂手势
- 后端为游客登录（无微信体系）；SQLite 单文件，未做并发写优化

## 后续路线

当前轮次（战斗/成长深化 + 留存元系统 + 表现补全 + 移动端）已完成：连携/天赋/法宝、图鉴/成就/日常/引导、细分音效/过场/打击感、虚拟摇杆触控。
P0 七大项已闭环：灵根+战力评分、宝石镶嵌+装备洗练、功法流派切换、副本/秘境、挂机/自动战斗、战令/月卡/签到，均有冒烟测试覆盖（T/U/V 段）。
P1：第三章「坠魔谷」+ Roguelike 秘境（复用地图工厂 + 随机 buff）/ NPC 好感与多结局
P2：性能优化（对象池 / 分块加载）/ 移动端体验打磨（手势 / 小屏布局）
P3：微信登录（unionid 云存档）+ 订阅消息 / 多人同屏
