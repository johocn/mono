# P0 计划 · 对标主流「低成本补深度」

> 项目：《修仙·凡人之路》（2.5D 等距修仙 RPG，LayaAir 3 + TypeScript + Vite，后端 node:http + node:sqlite）
> 目标：在不改运行时架构、不引入美术资产的前提下，补齐与主流同类（一念逍遥 / 想不想修真 / 神仙道 H5）在养成深度与留存运营上的差距。
> 工程范式：数据驱动 + 确定性随机 + 纯函数 + 冒烟测试；存档由 v2 升 v3 并完全向后兼容；桌面键鼠与已完成的移动端触控体验不回退。

---

## 一、背景与现状

上一轮已交付：战斗手感（顿帧 / 震屏 / 击退 / 粒子 / 刀光）、成长深度（随机词条 + 套装 + 天赋 + 法宝）、留存元系统（图鉴 / 成就 / 日常 / 引导）、表现层（细分音效 / 过场 / 打击感）、移动端触控（虚拟摇杆 + 技能/交互按钮）。

本轮聚焦 **P0「低成本补深度」** 七项，缩短与主流的差距：

| 维度 | 主流同类 | 本作现状 | P0 补强 |
|---|---|---|---|
| 养成深度 | 灵根、功法多层、宠物、洗练/镶嵌、战力体系 | 境界+词条+套装+天赋+法宝 | 灵根 / 洗练镶嵌 / 功法多套 / 战力评分 |
| 内容量 | 副本/秘境/世界Boss | 2 章主线 | 副本/秘境 |
| 留存运营 | 战令/月卡/签到 | 日常/成就/图鉴 | 战令/月卡/签到 |
| 移动端 | 挂机/自动战斗 | 功能性摇杆 | 挂机/自动战斗 |

---

## 二、核心功能（七项）

1. **灵根系统**：金/木/水/火/土 + 变异（天灵根/异灵根/伪灵根），按 seed 确定性生成；提供属性乘区（攻/防/速/暴）与技能倾向加成。
2. **战力评分**：聚合 `effAtk/effDef/maxHp/effSpeed/critRateTotal` + 境界/装备/天赋/法宝/灵根贡献，给出明确数值锚，HUD 与角色面板展示。
3. **装备洗练 / 宝石镶嵌**：复用独立随机源 `affixRng` 与 `equipStat` 单次遍历范式（零架构改动）；宝石按孔位镶嵌，加成并入 `equipStat`；洗练 = 消耗灵石重滚该装备词条。
4. **功法 / 心法多套切换**：定义可切换流派（各含技能集 + 被动加成），数据驱动；切换影响可用技能与被动。
5. **副本 / 秘境**：复用 `map.ts` 的 `buildMap(MapDef)` 工厂 + 随机 buff，新增 1–2 个秘境 MapDef 与入口，低成本扩内容。
6. **挂机 / 自动战斗**：自动锁定最近怪、接近并循环施法 1-4 槽，移动端刚需，复用现有 AI 与寻路。
7. **战令 / 月卡 / 签到**：复用 `rollDailies` 与谓词范式；周期奖励档按日期/在线天数发放，面板领取。

---

## 三、技术栈

- **前端**：LayaAir 3 + TypeScript + Vite，纯 H5（桌面优先 + 既有移动触控），不新增运行时依赖。
- **后端**：沿用 node:http + node:sqlite；P0 所有新系统均为客户端状态，随现有 `SaveState(v3)` 云存档结构上传，不改后端协议与表结构（`smoke.server` 保持 28 不变）。
- **测试**：`typecheck` 0 错 + 前端 smoke（Node + Laya stubs 驱动真实源码，按项新增段）+ 后端 smoke 28 + Playwright/Chromium E2E 增补断言。

---

## 四、实施策略与关键决策

**策略**：七项分两批串联（先属性/评分这批影响 getter，再内容/运营批），每项独立可验证（typecheck + smoke 段全绿 + 必要 E2E），降低爆炸半径。

**关键决策**：

1. **存档一次性升 v3 并兼容**：灵根/宝石孔位/功法/战令/签到都需持久化，集中在 `SaveState` 扩字段 + `applySave` 给默认值，兼容 v1/v2/v3。
2. **纯函数数据层**：`roots/gems/schools/battlepass` 放 `data/`，副作用集中在 `Player/Game/UI`，与既有战斗手感分层一致，保证冒烟可复现。
3. **确定性**：灵根用种子化 `Rng`；随机内容（洗练/宝石/秘境 buff）用独立 `Rng`（延续 `forgeRng/affixRng` 隔离），不污染战斗/掉落序列；战令/日常按日期播种且测试可注入时钟。
4. **数据驱动**：灵根/宝石/功法/战令全部 `src/data` 配置化，运行时不写死。
5. **属性汇聚**：`effAtk/effDef/effSpeed/critRateTotal` 在 `equipStat/talentStat/artifactStat` 之外并入「灵根乘区 + 功法被动 + 宝石加成」，保持 O(装备数) 单次遍历（仿 `equipStat`）。

**性能与可靠性**：`equipStat` 已是 O(装备数) 常量遍历；`fightPower` 仅在面板/存档时计算（非每帧）；挂机目标搜索控制频率（每 0.25s 重算最近怪）；宝石加成并入 `equipStat` 单次循环。冒烟断言前清残留状态（如 `hitstopT`）避免假阴性。

---

## 五、目录结构

```
xiuxian/src/
├── entities/Player.ts            # [MODIFY] 加 root/school/gems 孔位/battlePass 字段；eff* 并入灵根乘区+功法被动+宝石；fightPower 聚合；serialize/applySave v3 兼容 v1/v2/v3。
├── data/roots.ts                 # [NEW] 灵根定义（金木水火土+变异）+ 属性乘区 + 技能倾向 + 种子化生成。
├── data/gems.ts                  # [NEW] 宝石定义（按部位/属性）+ 镶嵌规则。
├── data/schools.ts               # [NEW] 功法流派定义（技能集 + 被动加成）。
├── data/battlepass.ts            # [NEW] 周期奖励档（按日期/在线天数）+ 领取谓词。
├── data/map.ts                   # [MODIFY] 新增 1–2 个秘境 MapDef（复用 buildMap 工厂 + 随机 buff）。
├── core/Combat.ts                # [MODIFY·按需] 灵根/功法被动对伤害/防御的乘区接入（保持 calcDamage 纯函数）。
├── Game.ts                       # [MODIFY] 挂机/自动战斗开关 + 秘境入口/切换 + 战令/签到面板开关 + fightPower 展示钩子。
├── ui/BattlePassPanel.ts         # [NEW] 战令/月卡/签到面板（档位进度 + 领取）。
├── ui/ForgePanel.ts / BagPanel.ts# [MODIFY] 扩洗练按钮与宝石孔位镶嵌/卸下。
├── ui/Hud.ts / SkillBar.ts       # [MODIFY] 显示战力评分；功法切换入口。
├── ui/widgets.ts                 # [MODIFY] 复用/新增控件（属性条/档位卡/孔位槽）。
└── test/
    ├── smoke.cjs                 # [MODIFY] 新增 P0 段（灵根/战力/洗练/功法/副本/挂机/战令）纯函数与钩子断言。
    └── browser-check.cjs         # [MODIFY] 增补新系统/面板断言。
README.md                         # [MODIFY] 目录/关键设计/已知限制/路线更新。
```

---

## 六、关键数据结构

```ts
// 存档 v3（所有 P0 新系统收敛点，必须向后兼容 v1/v2）
export interface SaveState {
  v: 1 | 2 | 3;
  // ……v1/v2 既有字段全部保留……
  // —— v3 新增（applySave 对缺省给默认值）——
  root?: string;                          // 灵根 id
  school?: string;                        // 当前功法流派 id
  gems?: Record<string, string | null>;   // 装备 id → 镶嵌宝石 id（孔位）
  battlePass?: { season: number; claimed: number[]; signinDays: number[] };
}

// 灵根描述符（数据驱动，运行时不写死）
export interface RootDef {
  id: string; name: string; desc: string;
  mul: { atk?: number; def?: number; spd?: number; crit?: number }; // 属性乘区
  skillBias?: Record<string, number>;   // 技能 id → 倾向加成
  mutate?: boolean;                      // 是否为变异灵根
}
```

---

## 七、设计风格

新增面板（战令/月卡/签到、功法切换、洗练/宝石、战力展示）与既有五大面板风格一致：半透明墨色面板（深靛底 + 玉青/鎏金描边 + 圆角），等距 2.5D 世界不变。

- **战力评分**：以醒目鎏金数字呈现在 HUD 与角色面板顶部，作为玩家核心数值锚。
- **宝石孔位**：玉青描边环形/方形槽，已镶嵌显示宝石色块。
- **洗练按钮**：与炼器按钮并列。
- **战令档位**：进度条 + 三态角标（未解锁灰 / 可领青 / 已领金），与图鉴/成就/日常同构。

所有控件 Graphics 程序化绘制（禁 `drawArc`，用 `drawEllipse`/`drawPoly`），交互带 hover/按下缩放与玉青高亮微动效，文案在 JS 预计算后渲染。

---

## 八、验证门槛（每项独立）

- `npm run typecheck` → 0 错
- `node test/smoke.cjs` → 对应 P0 段全绿（纯函数 + 钩子断言）
- `node test/smoke.server.cjs` → 保持 28/0
- `node test/browser-check.cjs` → 增补新系统/面板断言全 true
- 旧档兼容：v2 旧档 → `applySave` → 新字段有默认值且不崩（冒烟断言）

---

## 九、待办拆分

| id | 内容 | 依赖 | 状态 |
|---|---|---|---|
| p0-root-power | 灵根 + 战力评分（数据、字段、v3 存档、eff* 乘区、HUD 展示） | — | ✅ 完成 |
| p0-refine | 宝石 + 洗练（data/gems、镶嵌并入属性、ForgePanel/BagPanel） | p0-root-power | ✅ 完成 |
| p0-schools | 功法多套切换（data/schools、Player.school、切换 UI） | p0-root-power | ✅ 完成 |
| p0-dungeon | 副本/秘境（map.ts 工厂 + 随机 buff、入口 + 冒烟段） | p0-root-power | ✅ 完成 |
| p0-auto | 挂机/自动战斗（最近怪锁定、循环施法、移动端适配） | p0-root-power | ✅ 完成 |
| p0-battlepass | 战令/月卡/签到（data/battlepass、Player 字段、BattlePassPanel） | p0-root-power | ✅ 完成 |
| p0-verify | 全量验证收尾（typecheck 0 错 / smoke 606 / server 28 / 旧档 / README / browser-check 增补 P0 段） | 全部 | ✅ 完成 |

> 验证结果（2026-10-22）：`tsc --noEmit` 0 错；`npm test` 前端冒烟 **606/0**（含 T 秘境、U 自动战斗、V 战令月卡签到）+ 后端 **28/0**；旧档 v1/v2/v3 兼容已覆盖；`test/browser-check.cjs` 新增 `sP0` 块（秘境/自动战斗/战令面板与逻辑），需 `npm run dev` 后在带 Chromium 环境运行。

## 关键实现说明（踩坑与范式）

- **秘境地图行宽一致性**：`dungeon.ts` 的 `LEGEND_DUNGEON` 原先首行 24、其余 22 宽，导致 `buildMap` 抛错、整条冒烟在 `G` 段崩溃；统一为 24 宽（内部 22 空格）后跑通。
- **秘境刷怪与 hot 回血隔离**：`enterZone("dungeon")` 会强制刷怪（妖狼攻击），直接断言回血会被抵消/反超；测试中以切回 `ch1` + 清空 `quests.active` 隔离刷怪，单独验证 hot buff 回血。
- **自动战斗复用 `useSkill`**：`useSkill` 内部已含选最近目标（`pickTarget`）、超距寻路接近、射程内施法；`updateAutoFight` 仅每 0.25s 周期触发，自愈技能仅在低血时释放，顿帧冻结期间自动暂停。
- **战令/月卡/签到字段向后兼容**：`SaveState.battlePass` 在 v3 仅声明，本次补 `monthCardUntil/monthCardClaimed` 两可选字段并补默认，`applySave` 对缺字段旧档给默认值；活跃天数 = 签到天数，驱动战令档位解锁。
- **战令面板 P 键**：`Key.P`（已补枚举）切换 `BattlePassPanel`；移动端「自动」挂机按钮在 `MobileControls` 右下。
