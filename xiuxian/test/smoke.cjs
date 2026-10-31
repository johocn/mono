/**
 * 修仙 MVP 冒烟测试（Node）：
 *  A 数据完整性  B 战斗公式/buff  C 寻路  D 对话树
 *  E Player 逻辑（背包/装备/境界/任务/存档）  F Monster AI
 *  G Game 运行时（真实源码 + Laya 桩驱动整章流程：开场→杀狼→任务→Boss→通关→结算）
 */
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const Module = require("module");
const { installLaya, installBrowserStubs } = require("./stubs.cjs");

// —— TypeScript 即时加载 ——
function loadTypescript() {
  try {
    return require("typescript");
  } catch {
    /* fallthrough */
  }
  const candidates = [
    path.join(__dirname, "..", "..", "laya-brawler", "node_modules", "typescript"),
    path.join(__dirname, "..", "..", "tour-game", "node_modules", "typescript"),
  ];
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* next */
    }
  }
  throw new Error("typescript 不可用：请先在项目内 npm install");
}

const ts = loadTypescript();
Module._extensions[".ts"] = function (module, filename) {
  const code = fs.readFileSync(filename, "utf8");
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2018,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(out, filename);
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (/^\.\.?\//.test(request) && !/\.(ts|js|json|node|cjs)$/.test(request)) {
    try {
      return origResolve.call(this, request + ".ts", parent, isMain, options);
    } catch {
      /* fallthrough */
    }
  }
  return origResolve.call(this, request, parent, isMain, options);
};

installLaya();
installBrowserStubs();

// —— 断言工具 ——
let passed = 0;
let failed = 0;
const failures = [];
function ok(cond, name) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.error(`  ✗ ${name}`);
  }
}
function eq(a, b, name) {
  ok(a === b, `${name}（期望 ${b}，实际 ${a}）`);
}
function section(title) {
  console.log(`\n■ ${title}`);
}

// ================= A 数据完整性 =================
section("A. 数据完整性");
const { REALMS, realmIndexOf, realmProgress } = require("../src/data/realms.ts");
const { SKILLS, getSkill, DEFAULT_SKILLS } = require("../src/data/skills.ts");
const { ITEMS, getItem, isEquipment } = require("../src/data/items.ts");
const { MONSTERS, getMonster } = require("../src/data/monsters.ts");
const { STORY, QUESTS, CHAPTER1_START, NPCS } = require("../src/data/story/chapter1.ts");
const { SIDE_STORY } = require("../src/data/sidequests.ts");
const { MAP, isWalkable } = require("../src/data/map.ts");
const { OPEN_MAP } = require("../src/data/town_open.ts");

eq(SKILLS.length, 25, "技能数量为 25（含第二、进阶技能与雷诀）");
eq(new Set(SKILLS.map((s) => s.id)).size, 25, "技能 id 无重复");
ok(getSkill("shui-jian") && getSkill("xuan-shui"), "第二章新技能存在");
ok(DEFAULT_SKILLS.every((id) => getSkill(id)), "默认技能均存在");
ok(SKILLS.every((s) => s.mpCost >= 0 && s.cd > 0 && s.range >= 0), "技能参数合法");
ok(SKILLS.every((s) => ["sword", "law", "universal"].includes(s.branch)), "技能分支合法");

for (const id of Object.keys(MONSTERS)) {
  for (const l of MONSTERS[id].loot) ok(!!ITEMS[l.id], `怪物 ${id} 掉落物 ${l.id} 存在`);
  const st = MONSTERS[id].stones;
  ok(!!st && st.max >= st.min && st.min >= 0, `怪物 ${id} 灵石掉落区间合法`);
}
ok(Object.keys(MONSTERS).includes("yao-lang-wang"), "Boss 存在");
eq(getMonster("yao-lang-wang").boss, true, "妖狼王是 Boss");
ok(Object.values(ITEMS).every((it) => (it.price || 0) > 0), "所有道具均有基准价（可交易）");

for (const [qid, q] of Object.entries(QUESTS)) {
  ok(!!MONSTERS[q.kill], `任务 ${qid} 击杀目标 ${q.kill} 存在`);
  for (const r of q.rewards) {
    if (r.t === "giveItem") ok(!!ITEMS[r.id], `任务 ${qid} 奖励道具 ${r.id} 存在`);
    if (r.t === "learnSkill") ok(!!getSkill(r.id), `任务 ${qid} 奖励技能 ${r.id} 存在`);
  }
}
for (const node of Object.values(STORY)) {
  if (node.next) ok(!!STORY[node.next], `对话 ${node.id} → next ${node.next} 存在`);
  for (const c of node.choices || []) {
    if (c.to) ok(!!STORY[c.to], `对话 ${node.id} → choice ${c.to} 存在`);
    for (const e of c.effects || []) {
      if (e.t === "giveItem") ok(!!ITEMS[e.id], `对话 ${node.id} 奖励道具 ${e.id} 存在`);
      if (e.t === "learnSkill") ok(!!getSkill(e.id), `对话 ${node.id} 奖励技能 ${e.id} 存在`);
    }
  }
  for (const e of node.effects || []) {
    if (e.t === "startQuest" || e.t === "completeQuest") ok(!!QUESTS[e.id], `对话 ${node.id} 任务 ${e.id} 存在`);
  }
}
ok(!!STORY[CHAPTER1_START], "第一章入口存在");
eq(NPCS.length, 15, "NPC 数量为 15（原 9 + 酒馆/药店/客店/任务发布/交付/山门守卫）");
ok(NPCS.every((n) => isWalkable(n.gx, n.gy, OPEN_MAP)), "NPC 均在可走格");
const svcNpcs = NPCS.filter((n) => n.service);
eq(svcNpcs.length, 3, "功能型 NPC 3 位（货郎/铁匠/药店）");
ok(svcNpcs.some((n) => n.service === "shop") && svcNpcs.some((n) => n.service === "forge"), "坊市与炼器 NPC 齐备");
ok(NPCS.filter((n) => !n.service).every((n) => !!STORY[n.dialogue] || !!SIDE_STORY[n.dialogue]), "剧情 NPC 均有对话根节点");
ok(new Set(NPCS.map((n) => `${n.gx},${n.gy}`)).size === NPCS.length, "NPC 点位互不重叠");

eq(MAP.w, 24, "地图宽 24");
eq(MAP.h, 16, "地图高 16");
ok(isWalkable(MAP.playerSpawn.gx, MAP.playerSpawn.gy), "出生点可走");
ok(MAP.wolfZone.length >= 8, "妖兽刷怪区足够大");
ok(isWalkable(MAP.bossSpot.gx, MAP.bossSpot.gy), "Boss 高台可走");

eq(realmIndexOf(0), 0, "0 修为 = 凡人");
eq(realmIndexOf(100), 1, "100 修为 = 炼气一层");
eq(realmIndexOf(1500), 4, "1500 修为 = 筑基期");
eq(realmProgress(50).need, 100, "炼气→下一境需 100");
ok(realmProgress(99999).maxed, "顶级境界 maxed");

// ================= B 战斗公式 / buff =================
section("B. 战斗公式与 buff");
const { calcDamage, addBuff, tickBuffs, shieldValue, consumeShield, hasteMul, isStunned, defBonus } = require("../src/core/Combat.ts");
const { makeRng } = require("../src/core/Rng.ts");

const rngA = makeRng(7);
const rngB = makeRng(7);
const d1 = calcDamage({ atk: 20, def: 0, power: 1, critRate: 0, critMul: 1.5, rng: rngA });
const d2 = calcDamage({ atk: 20, def: 0, power: 1, critRate: 0, critMul: 1.5, rng: rngB });
eq(d1.dmg, d2.dmg, "同种子伤害可复现");
ok(d1.dmg >= 18 && d1.dmg <= 23, `基础伤害在 0.9~1.1 浮动区间（${d1.dmg}）`);
const dDef = calcDamage({ atk: 20, def: 100, power: 1, critRate: 0, critMul: 1.5, rng: makeRng(7) });
ok(dDef.dmg < d1.dmg, "防御降低伤害");
const dCrit = calcDamage({ atk: 20, def: 0, power: 1, critRate: 1, critMul: 2, rng: makeRng(7) });
ok(dCrit.crit && dCrit.dmg > d1.dmg, "必暴击且伤害更高");
ok(calcDamage({ atk: 1, def: 9999, power: 1, critRate: 0, critMul: 1, rng: makeRng(1) }).dmg >= 1, "伤害下限为 1");

const buffs = [];
addBuff(buffs, { kind: "shield", value: 50, t: 5 });
addBuff(buffs, { kind: "haste", value: 2, t: 5 });
addBuff(buffs, { kind: "stun", value: 1, t: 2 });
eq(shieldValue(buffs), 50, "护盾值 50");
const r1 = consumeShield(buffs, 30);
eq(r1.dealt, 0, "护盾吸收 30，气血无损");
eq(r1.absorbed, 30, "吸收量 30");
const r2 = consumeShield(buffs, 15);
eq(r2.dealt, 0, "护盾尚存 20，再吸收 15");
eq(r2.absorbed, 15, "吸收量 15");
const r3 = consumeShield(buffs, 10);
eq(r3.dealt, 5, "护盾破后穿透 5");
eq(r3.absorbed, 5, "剩余护盾 5 全部吸收");
eq(hasteMul(buffs), 2, "加速倍率 2");
ok(isStunned(buffs), "定身中");
tickBuffs(buffs, 3);
ok(!isStunned(buffs), "定身到期解除");
eq(defBonus([]), 0, "无 buff 防御加成为 0");

// ================= C 寻路 =================
section("C. A* 寻路");
const { findPath, gridToScreen, screenToGrid } = require("../src/core/IsoMap.ts");

const rt = screenToGrid(...Object.values(gridToScreen(5, 7)));
ok(Math.abs(rt.gx - 5) < 1e-6 && Math.abs(rt.gy - 7) < 1e-6, "等距投影往返一致");

const pMove = findPath(MAP, 11, 11, 2, 9);
ok(Array.isArray(pMove) && pMove.length > 5, "村中到村长有路");
ok(pMove.every((p) => isWalkable(p.gx, p.gy)), "路径全程可走");
const pWall = findPath(MAP, 11, 11, 3, 3); // 房屋内部
ok(Array.isArray(pWall) && pWall.every((p) => isWalkable(p.gx, p.gy)), "目标不可走时退化到邻点");
const pFar = findPath(MAP, 11, 11, 12, 3);
ok(Array.isArray(pFar) && pFar.length >= 5, "到后山高台有路");

// ================= D 对话树 =================
section("D. 对话树播放");
const { DialogueRunner } = require("../src/core/Dialogue.ts");

{
  const seen = [];
  const host = { applyEffects: (es) => seen.push(...es) };
  const dr = new DialogueRunner(STORY, host);
  dr.open(CHAPTER1_START);
  let guard = 0;
  while (dr.isOpen && guard++ < 50) dr.advance(0);
  ok(!dr.isOpen, "开场旁白可播完并关闭");
}
{
  const seen = [];
  const dr = new DialogueRunner(STORY, { applyEffects: (es) => seen.push(...es), cond: () => true });
  dr.open("cunzhang_root");
  ok(dr.current.choices.length === 4, "村长根节点含 4 个选项（含玄机子世界线涟漪分支）");
  dr.advance(0); // 请教灵根
  eq(dr.current.id, "cunzhang_test", "选择后进入灵根测试节点");
  const kinds = seen.map((e) => e.t);
  ok(kinds.includes("learnSkill") && kinds.includes("giveItem") && kinds.includes("startQuest"), "灵根测试效果齐全");
  dr.advance(0); // 请教修行之法
  eq(dr.current.id, "cunzhang_guide", "进入修行指引");
}

// ================= E Player =================
section("E. Player 逻辑");
const { Player } = require("../src/entities/Player.ts");
const { rootMulOf } = require("../src/data/roots.ts");

{
  const p = new Player({ gx: 11, gy: 11, nickname: "测试修士" });
  eq(p.nickname, "测试修士", "昵称");
  eq(p.hp, p.maxHp, "满血开局");
  eq(p.equipped.filter(Boolean).length, 4, "默认 4 个技能槽");
  ok(p.learned.length >= 4, "默认掌握 4 个技能");

  eq(p.addItem("huixue-dan", 150), 99, "叠加上限 99");
  eq(p.countItem("huixue-dan"), 99, "背包计数 99");
  ok(!p.removeItem("huixue-dan", 100), "超出数量移除失败");
  ok(p.removeItem("huixue-dan", 10), "移除 10 成功");

  p.hp = 50;
  const msg = p.useConsumable("huixue-dan");
  ok(!!msg && p.hp === 120, `回血丹生效（50→${p.hp}，受上限截断）`);

  ok(Math.abs(p.effAtk - 10 * (1 + rootMulOf(p.root).atk)) < 1e-6, "白板攻击含灵根基值");
  p.addItem("qingfeng-jian", 1);
  p.affixes["qingfeng-jian"] = {}; // 清空随机词条，验证无词条基础值（真实词条在 K 段覆盖）
  ok(p.equip("qingfeng-jian"), "穿戴青锋剑");
  ok(Math.abs(p.effAtk - 22 * (1 + rootMulOf(p.root).atk)) < 1e-6, "穿剑后攻击含灵根基值");
  ok(p.unequip("weapon"), "卸下武器");
  ok(Math.abs(p.effAtk - 10 * (1 + rootMulOf(p.root).atk)) < 1e-6, "卸下后攻击回落含灵根基值");
  ok(!p.equip("yaodan"), "材料不可穿戴");

  p.gainExp(120);
  eq(p.realmIndex, 1, "120 修为 → 炼气一层");
  ok(p.maxHp > 120, "突破后血气上限提升");
  const lv = p.gainExp(3000);
  ok(lv, "再获 3000 修为再次突破");
  // 筑基/金丹为天劫境：需渡劫方可生效（修仙灵魂）；强制成功走完天劫链
  while (p.pendingTribulation > 0) p.resolveTribulation(() => 0);
  eq(p.realmName, "金丹期", "渡劫后直达金丹期");

  // 任务链
  p.startQuest("q_wolves");
  eq(p.quests.active.length, 1, "任务已接");
  for (let i = 0; i < 5; i++) p.addKill("bi-jing-lang");
  ok(p.quests.done.includes("q_wolves"), "5 杀后任务完成");
  eq(p.countItem("qingfeng-jian"), 1, "任务奖励青锋剑");
  eq(p.quests.active.length, 0, "完成后人字移除");
  p.addKill("yao-lang-wang"); // 未接 q_boss 不应计数
  ok(!p.quests.done.includes("q_boss"), "未接任务不完成");

  // 存档往返
  p.addItem("huixin-jia", 1);
  p.equip("huixin-jia");
  p.flags["elder_taught"] = true;
  p.applyEffects([{ t: "learnSkill", id: "huoqiu" }, { t: "startQuest", id: "q_boss" }]);
  const snap = JSON.parse(JSON.stringify(p.serialize()));
  const p2 = new Player({ gx: 0, gy: 0 });
  p2.applySave(snap, MAP.playerSpawn);
  eq(p2.exp, p.exp, "存档恢复修为");
  eq(p2.countItem("huixin-jia"), 0, "已穿戴装备不在背包");
  eq(p2.equipment.armor, "huixin-jia", "存档恢复装备");
  eq(p2.effAtk, p.effAtk, "存档恢复攻击力");
  ok(p2.learned.includes("huoqiu"), "存档恢复已学技能");
  ok(p2.quests.active.includes("q_boss"), "存档恢复任务");
  eq(p2.flags["elder_taught"], true, "存档恢复旗帜");
  eq(p2.gx, MAP.playerSpawn.gx + 0.5, "存档恢复后回出生点");

  const bad = JSON.parse(JSON.stringify(snap));
  bad.inv = [["not-exist", 3]];
  bad.equipment = { weapon: "not-exist" };
  bad.learned = ["not-exist"];
  const p3 = new Player({ gx: 0, gy: 0 });
  p3.applySave(bad, MAP.playerSpawn);
  eq(p3.countItem("not-exist"), 0, "非法道具被过滤");
  ok(p3.learned.length >= 4, "非法技能清空后回退默认");
}

// ================= F Monster AI =================
section("F. Monster AI");
{
  const { Monster } = require("../src/entities/Monster.ts");
  const wolf = new Monster(getMonster("bi-jing-lang"), 15, 13, 99, 2);
  eq(wolf.hp, 110, "碧睛妖狼血量");
  const drops = wolf.rollDrops();
  ok(Array.isArray(drops), "掉落返回数组");
  const drops2 = new Monster(getMonster("bi-jing-lang"), 15, 13, 99, 2).rollDrops();
  eq(JSON.stringify(drops), JSON.stringify(drops2), "同种子掉落可复现");

  const dummy = new Player({ gx: 15, gy: 13 });
  // 贴身：应进入前摇并产出 pendingHit
  wolf.gx = 15.8;
  wolf.gy = 13.2;
  let guard = 0;
  while (!wolf.pendingHit && guard++ < 120) wolf.update(1 / 60, dummy);
  ok(!!wolf.pendingHit, "贴身攻击产出 pendingHit");
  eq(wolf.pendingHit.aoe, 0, "普攻单体");

  // 定身：不动不出手
  wolf.addBuff({ kind: "stun", value: 1, t: 5 });
  wolf.update(1 / 60, dummy);
  ok(wolf.path.length === 0, "定身后不行走");

  // 受击死亡
  const r = wolf.takeDamage(9999);
  eq(wolf.alive, false, "致死伤害后死亡");
  eq(r.dealt, 110, "死亡伤害不超过剩余血量");
  ok(wolf.state === "death", "死亡状态");

  // Boss 技能（咆哮 AOE）：清零技能计时，玩家位于咆哮射程内（超出普攻射程）。
  // 现在 AOE 改为「先预警(skillWindup)再结算」，单帧不再立即产生 pendingHit。
  const boss = new Monster(getMonster("yao-lang-wang"), 12, 3, 5, 3);
  boss.gx = 12.5;
  boss.gy = 3.5;
  boss.skillT = 0;
  dummy.gx = 15.5;
  dummy.gy = 3.5;
  boss.update(1 / 60, dummy);
  ok(boss.skillWindup > 0, "Boss 咆哮进入预警(skillWindup>0)");
  ok(!boss.pendingHit, "预警期间尚未结算(pendingHit 仍为空)");
  let g2 = 0;
  while (!boss.pendingHit && g2++ < 120) boss.update(1 / 60, dummy);
  ok(!!boss.pendingHit && boss.pendingHit.aoe > 0, "Boss 咆哮为 AOE(预警结束结算)");
}

// ================= G Game 运行时 =================
section("G. Game 运行时（整章流程）");
const { Game } = require("../src/Game.ts");

async function runtime() {
  const game = new Game();
  game.start();
  eq(game.phase, "title", "初始为标题态");

  game.startNewGame("冒烟修士");
  eq(game.phase, "play", "开局进入游玩态");
  ok(game.dialogue.isOpen, "开场旁白开启");

  // 播完开场旁白
  let guard = 0;
  while (game.dialogue.isOpen && guard++ < 50) game.dlgBox.onAdvance(0);
  ok(!game.dialogue.isOpen, "旁白播完");
  eq(game.player.nickname, "冒烟修士", "昵称落地");

  // 灵根测试（接任务）
  game.dialogue.open("cunzhang_test");
  game.openDialogueBox();
  ok(game.player.quests.active.includes("q_wolves"), "任务 q_wolves 已接");
  ok(game.player.countItem("huixue-dan") >= 3, "获得回血丹");
  game.dlgBox.onAdvance(0); // cunzhang_test → guide? 该节点有 choices
  while (game.dialogue.isOpen && guard++ < 50) game.dlgBox.onAdvance(0);

  // 长老授法（法修分支）
  game.dialogue.open("elder_root");
  game.openDialogueBox();
  game.dlgBox.onAdvance(1); // 法修
  while (game.dialogue.isOpen && guard++ < 50) game.dlgBox.onAdvance(0);
  ok(game.player.learned.includes("huoqiu"), "法修技能已学");

  // 战斗：放一只狼在嘴边，用 1 号技能（剑芒）
  const { Monster } = require("../src/entities/Monster.ts");
  const { getMonster } = require("../src/data/monsters.ts");
  const px = game.player.gx;
  const py = game.player.gy;
  const wolf = new Monster(getMonster("bi-jing-lang"), Math.floor(px), Math.floor(py), 7, 1);
  wolf.gx = px + 1;
  wolf.gy = py;
  game.monsters.push(wolf);
  game.map.addActor(wolf.rig.root);
  game.target = wolf;

  game.useSkill(0);
  ok(!!game.player.casting, "1 号技能进入施法");
  for (let i = 0; i < 40 && game.player.casting; i++) game.debugStep(1 / 60);
  ok(wolf.hp < wolf.maxHp, `技能造成伤害（剩余 ${wolf.hp}）`);

  // 击杀 → 奖励/任务计数
  const expBefore = game.player.exp;
  wolf.takeDamage(9999);
  game.debugStep(1 / 60);
  ok(game.player.exp > expBefore, "击杀获得修为");
  ok(game.player.quests.progress["q_wolves"] >= 1, "任务击杀计数 +1");

  // 任务完成链（补齐剩余 4 杀）
  for (let i = 0; i < 4; i++) game.debugKill("bi-jing-lang");
  ok(game.player.quests.done.includes("q_wolves"), "任务完成");
  ok(game.player.countItem("qingfeng-jian") >= 1, "任务奖励装备");

  // 玩家受伤与复活
  const hpBefore = game.player.hp;
  game.damagePlayer(wolf.alive ? wolf : game.monsters[0] || wolf, 1);
  ok(game.player.hp < hpBefore, "怪物伤害玩家");
  game.player.takeDamage(99999);
  ok(!game.player.alive, "玩家可被击倒");
  game.onPlayerDown();
  ok(game.player.alive && game.player.hp > 0, "回村后复活");

  // 面板路径（背包/技能）刷新不崩，且跟随新玩家
  game.bag.show();
  game.bag.refresh();
  game.bag.switchTab("equip");
  game.bag.refresh();
  game.bag.hide();
  ok(true, "背包面板刷新无异常");
  game.skillPanel.show();
  game.skillPanel.refresh();
  game.skillPanel.hide();
  ok(true, "技能面板刷新无异常");

  // 回报村长后接取 Boss 任务（测试直接等效对话链的 startQuest 效果）
  game.player.startQuest("q_boss");

  // Boss 出场 → 击杀 → 通关链
  game.player.flags["boss_spawned"] = true;
  game.spawnLogic(0.1);
  const boss = game.monsters.find((m) => m.isBoss);
  ok(!!boss, "Boss 已刷新");
  boss.takeDamage(99999);
  // 多步步进：越过登场/受击顿帧(hitstop)后结算死亡（步数不定，直到标记出现）
  for (let i = 0; i < 40 && !game.player.flags["boss_dead_ch1"]; i++) game.debugStep(1 / 60);
  ok(game.player.flags["boss_dead_ch1"], "Boss 击杀标记");
  ok(game.player.quests.done.includes("q_boss"), "Boss 任务完成");
  ok(game.dialogue.isOpen, "通关对话开启");
  guard = 0;
  while (game.dialogue.isOpen && guard++ < 50) game.dlgBox.onAdvance(0);
  ok(game.player.flags["ch1_win"], "通关旗帜");
  for (let i = 0; i < 40 && game.phase !== "result"; i++) game.debugStep(1 / 60);
  await new Promise((r) => setTimeout(r, 80)); // 等云接口失败回退
  eq(game.phase, "result", "进入结算态");
  ok(game.player.exp >= 1500, `通关修为可达筑基（${game.player.exp}）`);

  // 存档
  const saved = JSON.parse(global.localStorage.getItem("xiuxian.save.v1") || "null");
  ok(saved && saved.v === 3 && saved.nickname === "冒烟修士", "本地存档已写入");
  ok(saved.flags.ch1_win, "存档含通关旗帜");

  // 长时间空跑不崩（Y-sort/相机/特效路径）
  for (let i = 0; i < 300; i++) game.debugStep(1 / 60);
  ok(true, "连续 300 帧无异常");
  // 后续 H 段测试在同进程内继续，不在此处结束函数

// ================= H. 缩放 / 小地图 / 建造 =================
section("H. 缩放 / 小地图 / 建造");
(function () {
  const game = new Game();
  game.start();
  eq(game.map.zoom, 3, "地图放大 3 倍");

  // 小地图：坐标换算与命中
  const mm = game.minimap;
  ok(mm.contains(mm.root.x + 10, mm.root.y + 10), "小地图自带命中");
  const g0 = mm.toGrid(mm.root.x + mm.w / 2, mm.root.y + mm.h / 2);
  ok(g0.gx >= 0 && g0.gx < 24 && g0.gy >= 0 && g0.gy < 16, "小地图中心换算在地图范围内");

  // 对话捕获层：开场旁白即开启对话，跑一帧后捕获层应显示
  game.startNewGame("建造测试");
  game.onFrame();
  ok(game.dlgCatcher.visible, "对话开启时捕获层显示");
  let guard = 0;
  while (game.dialogue.isOpen && guard++ < 50) game.dlgBox.onAdvance(0);
  game.onFrame();
  ok(!game.dlgCatcher.visible, "旁白结束后捕获层隐藏");

  // 建造材料来自村长授法（灵根测试节点发放）
  game.dialogue.open("cunzhang_test");
  game.openDialogueBox();
  ok(game.player.countItem("wood") >= 10 && game.player.countItem("stone") >= 6, "村长授法发放建造材料");

  // canPlace：可走且空地可通过；NPC/Boss 点被拒
  const spawn = { gx: Math.floor(game.player.gx), gy: Math.floor(game.player.gy) };
  ok(game.canPlace(spawn.gx, spawn.gy), "空旷可走地可建造");
  ok(!game.canPlace(game.npcs[0].def.gx, game.npcs[0].def.gy), "NPC 点位不可建造");
  ok(!game.canPlace(game.map.map.bossSpot.gx, game.map.map.bossSpot.gy), "Boss 点不可建造");

  // 放置 → 阻挡 → 拆除还原
  const woodBefore = game.player.countItem("wood");
  game.enterBuild("hut");
  game.placeAt(spawn.gx, spawn.gy);
  ok(game.player.built.length === 1, "建筑已记录");
  ok(game.player.countItem("wood") < woodBefore, "建造扣材料");
  const blocked = game.map.map.blocked[spawn.gy][spawn.gx];
  ok(blocked === true, "放置后该格阻挡（寻路绕行）");
  const refundedBefore = game.player.countItem("wood");
  game.enterDemolish();
  game.demolishAt(spawn.gx, spawn.gy);
  ok(game.player.built.length === 0, "拆除后清空");
  ok(game.player.countItem("wood") > refundedBefore, "拆除返还部分材料");
  ok(game.map.map.blocked[spawn.gy][spawn.gx] === false, "拆除后恢复可走");
})();

// ================= I. 灵石 / 坊市 / 炼器 =================
section("I. 灵石 / 坊市 / 炼器");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const {
    SHOP_STOCK, buyPriceOf, sellPriceOf, canSell, shopStockValid,
    FORGE_MAX, forgeCostOf, forgeRateOf, forgeBonusOf, itemLabel,
  } = require("../src/data/shop.ts");

  // —— 价格表 ——
  ok(shopStockValid(), "商店库存均可定价");
  ok(SHOP_STOCK.length >= 8, `商店货物不少于 8 种（${SHOP_STOCK.length}）`);
  for (const id of SHOP_STOCK) {
    ok(sellPriceOf(id) > 0 && sellPriceOf(id) < buyPriceOf(id), `${id} 卖价低于买价`);
  }
  ok(!canSell("no-such-item"), "不存在的物品不可出售");

  // —— 炼器曲线 ——
  ok(forgeCostOf(5).stones > forgeCostOf(0).stones, "炼器灵石消耗随等级递增");
  ok(forgeCostOf(4).yaodan > forgeCostOf(0).yaodan, "妖丹消耗随等级递增");
  ok(forgeRateOf(0) > forgeRateOf(5), "成功率随等级递减");
  ok(forgeRateOf(FORGE_MAX) >= 0.25, "成功率有下限 25%");
  eq(forgeBonusOf("qingfeng-jian", 0).atk, 0, "+0 无加成");
  ok(forgeBonusOf("qingfeng-jian", 1).atk > 0, "+1 提供攻击加成");
  ok(forgeBonusOf("qingfeng-jian", 9).atk > forgeBonusOf("qingfeng-jian", 1).atk * 5, "高等级加成显著");
  eq(itemLabel("qingfeng-jian", 3), "青锋剑 +3", "装备标签含强化等级");

  // —— 货币 ——
  const p = new Player({ gx: 11, gy: 11, nickname: "坊市散修", seed: 7 });
  eq(p.stones, 0, "初始无灵石");
  p.gainStones(120);
  eq(p.stones, 120, "获得灵石");
  ok(!p.spendStones(200), "灵石不足时不可支付");
  ok(p.spendStones(20) && p.stones === 100, "支付灵石");

  // —— 买入 / 卖出 ——
  const price = buyPriceOf("huixue-dan");
  const r1 = p.buyItem("huixue-dan", 2);
  ok(r1.ok && r1.got === 2 && r1.spent === price * 2, "买入扣灵石并入袋");
  eq(p.stones, 100 - price * 2, "买入后余额正确");
  const beforeSell = p.stones;
  const r2 = p.sellItem("huixue-dan", 1);
  ok(r2.ok && r2.gained === sellPriceOf("huixue-dan"), "卖出按 4 折回收");
  eq(p.stones, beforeSell + sellPriceOf("huixue-dan"), "卖出后余额正确");
  p.stones = 0;
  ok(!p.buyItem("zhentie-jian", 1).ok, "灵石不足买不起重剑");
  ok(!p.buyItem("no-such-item", 1).ok, "不存在的货物无法购买");

  // —— 炼器（固定随机源保证确定性）——
  p.addItem("qingfeng-jian", 1);
  p.equip("qingfeng-jian");
  const atk0 = p.effAtk;
  p.stones = 9999;
  p.addItem("yaodan", 60);
  p.forgeRng = () => 0.01; // 必成
  const f1 = p.upgradeForge("qingfeng-jian");
  ok(f1.ok && f1.success, "炼器成功");
  eq(p.forgeLevel("qingfeng-jian"), 1, "强化至 +1");
  ok(p.effAtk > atk0, "强化提升攻击");

  const yaodanBefore = p.countItem("yaodan");
  p.forgeRng = () => 0.99; // 必败
  const f2 = p.upgradeForge("qingfeng-jian");
  ok(f2.ok && !f2.success, "炼器可能失败");
  eq(p.forgeLevel("qingfeng-jian"), 1, "失败不掉级");
  ok(p.countItem("yaodan") < yaodanBefore, "炼器消耗妖丹");

  p.stones = 0;
  ok(!p.upgradeForge("qingfeng-jian").ok, "灵石不足无法炼器");
  p.stones = 99999;
  for (let i = 0; i < 20; i++) {
    p.forgeRng = () => 0.01;
    p.upgradeForge("qingfeng-jian");
  }
  eq(p.forgeLevel("qingfeng-jian"), FORGE_MAX, `强化上限 +${FORGE_MAX}`);
  ok(!p.upgradeForge("qingfeng-jian").ok, "圆满后不可再炼");
  ok(!p.upgradeForge("huixue-dan").ok, "消耗品不可炼器");

  // —— 存档往返 ——
  const saved = p.serialize();
  ok(typeof saved.stones === "number" && typeof saved.forge === "object", "存档含灵石与强化等级");
  const p2 = new Player({ gx: 11, gy: 11, nickname: "读档散修", seed: 7 });
  p2.applySave(saved, MAP.playerSpawn);
  eq(p2.stones, saved.stones, "读档恢复灵石");
  eq(p2.forgeLevel("qingfeng-jian"), FORGE_MAX, "读档恢复强化等级");
  ok(p2.effAtk > 10, "读档后强化加成生效");

  // —— Game：NPC 服务 / 面板 / 掉落 ——
  const game = new Game();
  game.start();
  game.startNewGame("坊市流程");
  let guard = 0;
  while (game.dialogue.isOpen && guard++ < 50) game.dlgBox.onAdvance(0);

  const shopNpc = game.npcs.find((n) => n.def.service === "shop");
  const forgeNpc = game.npcs.find((n) => n.def.service === "forge");
  ok(!!shopNpc && !!forgeNpc, "村中有货郎与铁匠");

  game.player.gx = shopNpc.def.gx + 0.5;
  game.player.gy = shopNpc.def.gy + 0.5;
  game.tryTalk(shopNpc.def);
  ok(game.shopPanel.visible, "与货郎交谈打开坊市");
  game.shopPanel.switchTab("sell");
  game.shopPanel.switchTab("buy");
  game.shopPanel.hide();
  ok(!game.shopPanel.visible, "坊市可关闭");

  game.player.gx = forgeNpc.def.gx + 0.5;
  game.player.gy = forgeNpc.def.gy + 0.5;
  game.tryTalk(forgeNpc.def);
  ok(game.forgePanel.visible, "与铁匠交谈打开炼器台");
  game.forgePanel.refresh();
  game.forgePanel.hide();
  ok(!game.forgePanel.visible, "炼器台可关闭");

  // 面板打开时不响应世界移动（点击落在面板内被拦截）
  game.openShop();
  ok(game.overUI({ x: game.shopPanel.root.x + 100, y: game.shopPanel.root.y + 100 }), "坊市面板拦截世界点击");
  game.shopPanel.hide();

  // 击杀掉落灵石
  const { Monster } = require("../src/entities/Monster.ts");
  const { getMonster } = require("../src/data/monsters.ts");
  const wolf = new Monster(getMonster("bi-jing-lang"), 15, 13, 1234, 2);
  game.monsters.push(wolf);
  game.map.addActor(wolf.rig.root);
  const stonesBefore = game.player.stones;
  wolf.takeDamage(9999);
  game.debugStep(1 / 60);
  ok(game.player.stones > stonesBefore, `击杀掉落灵石（+${game.player.stones - stonesBefore}）`);

  // 剧情效果发放灵石
  const sBefore = game.player.stones;
  game.player.applyEffects([{ t: "giveStones", n: 66 }]);
  eq(game.player.stones, sBefore + 66, "剧情效果发放灵石");

  for (let i = 0; i < 60; i++) game.debugStep(1 / 60);
  ok(true, "坊市/炼器路径连续 60 帧无异常");
})();

// ================= J. 第二章 · 乱星海（zone/数据/声望宗门/分章） =================
section("J. 第二章 · 乱星海");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { ZONES } = require("../src/data/zones.ts");
  const { MAP_CH2, CH2_QUESTS, CH2_STORY, NPCS_CH2 } = require("../src/data/story/chapter2.ts");
  const { SECT_EXCHANGES } = require("../src/data/sect.ts");
  const { SectPanel } = require("../src/ui/SectPanel.ts");
  const { getMonster } = require("../src/data/monsters.ts");
  const { getItem } = require("../src/data/items.ts");

  // —— 第二章数据齐备 ——
  ok(!!ZONES.ch2, "乱星海区域已注册");
  eq(ZONES.ch2.chapter, 2, "乱星海为第二章");
  eq(ZONES.ch2.map.w, 24, "乱星海地图宽 24");
  eq(ZONES.ch2.npcs.filter((n) => !n.service).length, 3, "三位主链 NPC");
  eq(ZONES.ch2.npcs.filter((n) => n.service === "sect").length, 1, "宗门执事在位");
  eq(ZONES.ch2.wild.length, 3, "三种野外怪");
  eq(ZONES.ch2.bossId, "fu-hai-jiao", "乱星海 Boss 为覆海蛟");
  ok(NPCS_CH2.every((n) => isWalkable(n.gx, n.gy, MAP_CH2)), "乱星海 NPC 均在可走格");

  for (const id of ["hai-yao", "xie-jiang", "jiao-ren", "fu-hai-jiao"]) ok(!!getMonster(id), `怪物 ${id} 存在`);
  ok(getMonster("fu-hai-jiao").boss, "覆海蛟是 Boss");
  for (const id of ["hai-yao", "xie-jiang", "jiao-ren", "fu-hai-jiao"]) {
    ok(!!getMonster(id).stones && getMonster(id).stones.max > 0, `怪物 ${id} 有灵石掉落`);
  }
  for (const id of ["shan-hu", "zhen-zhu", "jiao-xiao", "jiao-zhu", "xie-jia", "bi-shui-jian", "jiao-lin-jia"]) {
    ok(!!getItem(id), `道具 ${id} 存在`);
  }
  ok((getItem("bi-shui-jian").atk || 0) >= 20, "避水剑有攻击");
  ok((getItem("jiao-lin-jia").def || 0) >= 15, "鲛鳞甲有防御");
  ok(getSkill("shui-jian").branch === "sword" && getSkill("xuan-shui"), "第二章技能分支合法");
  ok(REALMS.some((r) => r.name.includes("元婴")), "境界表含元婴");

  // 第二章任务链（3 主线 + 2 支线）
  eq(Object.keys(CH2_QUESTS).length, 5, "第二章 5 个任务");
  for (const [qid, q] of Object.entries(CH2_QUESTS)) {
    ok(!!getMonster(q.kill), `任务 ${qid} 击杀对象 ${q.kill} 存在`);
    for (const r of q.rewards) {
      if (r.t === "giveItem") ok(!!getItem(r.id), `任务 ${qid} 奖励 ${r.id} 存在`);
      if (r.t === "learnSkill") ok(!!getSkill(r.id), `任务 ${qid} 奖励技能 ${r.id} 存在`);
    }
  }
  ok(CH2_QUESTS.q_boss2.rewards.some((r) => r.t === "win" && r.chapter === 2), "Boss 任务通关第二章");

  // 对话图引用有效
  for (const [nid, node] of Object.entries(CH2_STORY)) {
    for (const c of node.choices || []) {
      if (c.to) ok(!!CH2_STORY[c.to], `对话 ${nid} → ${c.to} 有效`);
      for (const e of c.effects || []) {
        if (e.t === "startQuest") ok(!!CH2_QUESTS[e.id], `对话 ${nid} 派发任务 ${e.id} 存在`);
        if (e.t === "learnSkill") ok(!!getSkill(e.id), `对话 ${nid} 授技 ${e.id} 存在`);
      }
    }
  }

  // 传送点与落点均可走
  ok(isWalkable(11, 14, MAP), "落霞镇传送点可走");
  ok(isWalkable(11, 12, MAP_CH2), "乱星海落点可走");
  ok(isWalkable(2, 12, MAP_CH2), "乱星海传送点可走");
  ok(isWalkable(11, 13, MAP), "落霞镇回程落点可走");

  // —— zone 切图（Game 运行时）——
  const game = new Game();
  game.start();
  game.startNewGame("乱星海旅人");
  let g = 0;
  while (game.dialogue.isOpen && g++ < 50) game.dlgBox.onAdvance(0);
  eq(game.currentZoneId, "ch1", "初始在第一章");
  const npcIdsCh1 = game.npcs.map((n) => n.def.id);

  game.enterZone("ch2");
  eq(game.currentZoneId, "ch2", "切入乱星海");
  eq(game.currentMap, MAP_CH2, "当前地图切换为乱星海");
  ok(game.npcs.some((n) => n.def.id === "yucun-zhang"), "乱星海主链 NPC 重建");
  ok(!game.npcs.some((n) => n.def.id === "cunzhang"), "落霞镇 NPC 已移除");
  eq(JSON.stringify(game.npcs.map((n) => n.def.id).sort()) !== JSON.stringify(npcIdsCh1.slice().sort()), true, "NPC 集合随区域变化");
  eq(game.player.chapter, 2, "进入乱星海章节置 2");
  ok(game.player.unlockedZones.includes("ch2"), "乱星海已解锁");
  for (let i = 0; i < 30; i++) game.debugStep(1 / 60);
  ok(true, "乱星海 30 帧无异常");

  game.enterZone("ch1");
  eq(game.currentZoneId, "ch1", "返回落霞镇");
  eq(game.currentMap, OPEN_MAP, "地图切回落霞镇");
  ok(game.npcs.some((n) => n.def.id === "cunzhang"), "落霞镇 NPC 重建");
  ok(game.player.kills === 0, "切图保留玩家对象");

  // 宗门面板装配
  ok(!!game.sectPanel, "宗门面板已装配");
  game.openSect();
  ok(game.sectPanel.visible, "可打开宗门大殿");
  game.sectPanel.hide();
  ok(!game.sectPanel.visible, "宗门面板可关闭");

  // —— 声望 / 宗门 / 分章存档 ——
  const p = new Player({ gx: 11, gy: 11, nickname: "宗门散修", seed: 9 });
  eq(p.reputation, 0, "初始无声望");
  eq(p.sect, null, "初始散修");
  p.applyEffects([{ t: "joinSect", id: "xuan-shui-zong" }]);
  eq(p.sect, "xuan-shui-zong", "拜入玄水宗");
  p.gainRep(50);
  eq(p.reputation, 50, "获得声望");
  ok(p.spendRep(30) && p.reputation === 20, "消耗声望");
  ok(!p.spendRep(100), "声望不足不可兑换");

  // 宗门兑换（面板方法）
  let msg = "";
  const sp = new SectPanel(p, (m) => (msg = m));
  const itemEx = SECT_EXCHANGES.find((e) => e.reward.t === "item");
  p.reputation = 100;
  const repBefore = p.reputation;
  sp.exchange(itemEx);
  eq(p.reputation, repBefore - itemEx.cost, "兑换扣除声望");
  ok(p.countItem(itemEx.reward.id) > 0, "兑换得物品");

  const skillEx = SECT_EXCHANGES.find((e) => e.reward.t === "skill");
  p.reputation = 100;
  sp.exchange(skillEx);
  ok(p.learned.includes(skillEx.reward.id), "传功习得技能");
  const repKeep = p.reputation;
  sp.exchange(skillEx);
  eq(p.reputation, repKeep, "已掌握技能不重复扣声望");

  // 分章存档往返
  p.chapter = 2;
  p.unlockedZones = ["ch1", "ch2"];
  const sv = p.serialize();
  eq(sv.chapter, 2, "存档记录章节");
  ok(sv.unlockedZones.includes("ch2"), "存档记录已解锁区域");
  eq(sv.reputation, p.reputation, "存档记录声望");
  eq(sv.sect, "xuan-shui-zong", "存档记录宗门");
  const p2 = new Player({ gx: 11, gy: 11, nickname: "读档散修", seed: 9 });
  p2.applySave(sv, MAP.playerSpawn);
  eq(p2.chapter, 2, "读档恢复章节");
  ok(p2.unlockedZones.includes("ch2"), "读档恢复解锁区域");
  eq(p2.reputation, p.reputation, "读档恢复声望");
  eq(p2.sect, "xuan-shui-zong", "读档恢复宗门");
  // 旧存档兼容（无新字段）
  const p3 = new Player({ gx: 11, gy: 11, nickname: "旧档散修", seed: 9 });
  p3.applySave({ v: 1, nickname: "旧档散修", inv: [], equipment: {}, learned: ["qingshuang"], equipped: [null, null, null, null], quests: { active: [], done: [], progress: {} }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {} }, MAP.playerSpawn);
  eq(p3.chapter, 1, "旧存档默认第一章");
  ok(p3.unlockedZones.includes("ch1"), "旧存档默认解锁落霞镇");
  eq(p3.reputation, 0, "旧存档默认无声望");
  // v2 新字段：旧 v1 档缺省 → 默认值
  eq(p3.talentPoints, 0, "旧存档默认 0 天赋点");
  eq(Object.keys(p3.talents).length, 0, "旧存档默认无天赋");
  eq(p3.artifact, null, "旧存档默认无法宝");
  eq(p3.codex.monstersKilled.length, 0, "旧存档图鉴为空");
  eq(p3.achievements.unlocked.length, 0, "旧存档无成就");
  eq(p3.daily.ids.length, 0, "旧存档无日常");
  eq(p3.tutorialDone, false, "旧存档默认未过引导");
  // v2 往返：含新字段的档 → applySave 还原
  const sv2 = JSON.parse(JSON.stringify(sv));
  sv2.v = 2; sv2.talentPoints = 3; sv2.talents = { "t_atk": 1 };
  sv2.codex = { monstersSeen: ["wolf"], monstersKilled: ["wolf"], itemsGot: [], skillsLearned: [] };
  sv2.achievements = { unlocked: ["first_kill"], claimed: [] };
  sv2.daily = { date: "2026-10-22", ids: ["d_kill"], progress: { d_kill: 2 }, claimed: [] };
  sv2.tutorialDone = true;
  const p4 = new Player({ gx: 11, gy: 11, nickname: "v2档", seed: 9 });
  p4.applySave(sv2, MAP.playerSpawn);
  eq(p4.talentPoints, 3, "v2 读档恢复天赋点");
  eq(p4.talents["t_atk"], 1, "v2 读档恢复天赋");
  ok(p4.codex.monstersKilled.includes("wolf"), "v2 读档恢复图鉴");
  ok(p4.achievements.unlocked.includes("first_kill"), "v2 读档恢复成就");
  eq(p4.daily.progress["d_kill"], 2, "v2 读档恢复日常进度");
  eq(p4.tutorialDone, true, "v2 读档恢复引导标志");
  const svNew = p4.serialize();
  eq(svNew.v, 3, "新存档版本为 3");
  ok("talentPoints" in svNew && "codex" in svNew && "achievements" in svNew && "daily" in svNew && "tutorialDone" in svNew, "新存档含全部 v2 字段");
})();

// ================= K. 手感 · 词条 · 套装 · 氛围 =================
section("K. 手感·词条·套装·氛围");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { rootMulOf } = require("../src/data/roots.ts");
  const { Camera } = require("../src/core/IsoMap.ts");
  const { Sfx } = require("../src/core/Sfx.ts");
  const { AFFIX_POOL } = require("../src/data/affixes.ts");
  const { SETS } = require("../src/data/sets.ts");

  // —— 词条随品质随机化（affixRng 独立，确定性可复现）——
  const { getRarity } = require("../src/data/rarity.ts");
  const pA = new Player({ gx: 11, gy: 11, nickname: "词条", seed: 1 });
  pA.addItem("qingfeng-jian", 1);
  const rA = pA.rarityOf("qingfeng-jian");
  const afA = pA.affixes["qingfeng-jian"];
  ok(afA != null, "装备获得词缀记录");
  ok(Object.keys(afA).length === getRarity(rA).affixes, "词缀数 = 品质对应条数");
  for (const a of AFFIX_POOL) {
    if (afA[a.key] != null) ok(afA[a.key] >= a.min - 1e-9 && afA[a.key] <= a.max + 1e-9, `词条 ${a.name} 数值在范围`);
  }
  // 确定性：同种子同结果（品质 + 词缀均一致）
  const pA2 = new Player({ gx: 11, gy: 11, nickname: "词条2", seed: 1 });
  pA2.addItem("qingfeng-jian", 1);
  ok(JSON.stringify(pA2.affixes["qingfeng-jian"]) === JSON.stringify(afA), "同种子词缀确定可复现");
  pA.equip("qingfeng-jian");
  ok(pA.effAtk > 10, "词条计入 effAtk");

  // —— 套装 n 件套 ——
  const pC = new Player({ gx: 11, gy: 11, nickname: "套装", seed: 2 });
  pC.affixRng = () => 0;
  pC.addItem("bi-shui-jian", 1);
  pC.equip("bi-shui-jian");
  const atk1 = pC.effAtk;
  pC.addItem("jiao-lin-jia", 1);
  pC.equip("jiao-lin-jia");
  // 甲为防具无 atk：增量 = 套装 atk+8（品质缩放不影响套装 effect，common 时甲无词缀）
  ok(Math.abs((pC.effAtk - atk1) - 8 * (1 + rootMulOf(pC.root).atk)) < 1e-6, "玄水套装 2 件 → 额外 atk+8 生效（含灵根）");
  // effDef 含 BASE_DEF(5)：5 + 甲def22 + 套装def6 = 33
  ok(Math.abs(pC.effDef - 33 * (1 + rootMulOf(pC.root).def)) < 1e-6, "玄水套装 2 件 → def+6 生效（含灵根）");
  ok(SETS["xuan-shui"] && SETS["xuan-shui"].pieces[0].need === 2, "套装表配置正确");

  // —— 震屏 trauma（纯表现，可复现衰减）——
  const cam = new Camera();
  cam.addTrauma(0.5);
  eq(cam.trauma, 0.5, "addTrauma 累积到 0.5");
  cam.follow(100, 100, 120, 120, 0.1);
  ok(cam.trauma < 0.5 && cam.trauma >= 0, "follow 后 trauma 衰减");

  // —— BGM 帧驱动（无 AudioContext 静默降级）——
  const sfx = new Sfx();
  sfx.setTheme("battle");
  sfx.tickBgm(0.3);
  sfx.setTheme("title");
  sfx.setTheme("title");
  ok(true, "BGM 调度与重复 setTheme 不崩");

  // —— 顿帧冻结 + 击退位移（Game 运行时）——
  const gH = new Game();
  gH.start();
  gH.startNewGame("手感测试");
  let guard = 0;
  while (gH.dialogue.isOpen && guard++ < 50) gH.dlgBox.onAdvance(0);
  const gx0 = gH.player.gx;
  gH.hitstopT = 0.1;
  gH.debugStep(1 / 60);
  ok(gH.hitstopT < 0.1, "顿帧计时递减");
  eq(gH.player.gx, gx0, "顿帧期间玩家位置冻结");
  gH.hitstopT = 0; // 清除顿帧冻结，验证击退位移
  gH.player.applyKnockback(1, 0, 8);
  const gxA = gH.player.gx;
  gH.debugStep(1 / 60);
  ok(gH.player.gx > gxA, "击退推动玩家位移");
  for (let i = 0; i < 20; i++) gH.debugStep(1 / 60);
  ok(true, "手感链路 20 帧无异常");
})();

// ================= L. 连携 · 技能扩充 · 新效果 =================
section("L. 连携·技能扩充·新效果");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { Game } = require("../src/Game.ts");
  const { Monster } = require("../src/entities/Monster.ts");
  const { getMonster } = require("../src/data/monsters.ts");
  const { SKILLS, getSkill } = require("../src/data/skills.ts");
  const { comboPush, comboDecay, comboMul, emptyCombo, COMBO_BONUS, COMBO_WINDOW } = require("../src/core/Combo.ts");
  const { atkBonus, slowMul } = require("../src/core/Combat.ts");

  // —— 技能数据齐备 ——
  eq(SKILLS.length, 25, "技能总数 25");
  for (const id of ["jianwu", "xujian", "zhanshen", "hanbing", "yanqi", "huti", "jiuti", "tiebi", "hanyong", "ningshuang"]) {
    ok(!!getSkill(id), `新技能 ${id} 存在`);
  }

  // —— 连携纯函数（无随机，可复现）——
  let cs = emptyCombo();
  cs = comboPush(cs, "a");
  eq(cs.count, 1, "连携起手 1 段");
  eq(comboMul(cs), COMBO_BONUS[0], "1 段倍率为基准");
  cs = comboPush(cs, "b");
  eq(cs.count, 2, "切换技能升至 2 段");
  ok(comboMul(cs) > COMBO_BONUS[0], "2 段有伤害加成");
  cs = comboPush(cs, "b");
  eq(cs.count, 2, "同技能不推进");
  cs = comboPush(cs, "c");
  eq(cs.count, 3, "再切换升至 3 段");
  for (const id of ["d", "e", "f", "g", "h", "i"]) cs = comboPush(cs, id);
  eq(cs.count, COMBO_BONUS.length, "连携封顶");
  cs = comboDecay(cs, COMBO_WINDOW + 0.1);
  eq(cs.count, 0, "超时连携断裂");

  // —— atkBonus / slowMul 纯函数 ——
  eq(atkBonus([]), 0, "无 buff 攻击增益 0");
  eq(atkBonus([{ kind: "atkUp", value: 12, t: 5 }]), 12, "atkUp 取最强");
  eq(slowMul([]), 1, "无减速倍率 1");
  eq(slowMul([{ kind: "slow", value: 0.5, t: 3 }, { kind: "slow", value: 0.7, t: 3 }]), 0.5, "slow 取最强(最小倍率)");

  // —— Player buff 集成 ——
  const pL = new Player({ gx: 11, gy: 11, nickname: "连携修士", seed: 3 });
  const atk0 = pL.effAtk;
  pL.addBuff({ kind: "atkUp", value: 15, t: 8 });
  ok(Math.abs((pL.effAtk - atk0) - 15 * (1 + rootMulOf(pL.root).atk)) < 1e-6, "atkUp buff 提升 effAtk（含灵根）");
  const spd0 = pL.effSpeed;
  pL.addBuff({ kind: "slow", value: 0.5, t: 3 });
  ok(Math.abs(pL.effSpeed - spd0 * 0.5) < 1e-9, "slow buff 减半 effSpeed");

  // —— Game 运行时集成：slow 命中 + 连携推进 ——
  const gL = new Game();
  gL.start();
  gL.startNewGame("连携测试");
  let guard = 0;
  while (gL.dialogue.isOpen && guard++ < 50) gL.dlgBox.onAdvance(0);
  const wolf = new Monster(getMonster("bi-jing-lang"), Math.floor(gL.player.gx) + 1, Math.floor(gL.player.gy), 7, 1);
  wolf.hp = 99999; wolf.maxHp = 99999;
  gL.monsters.push(wolf);
  gL.combo = emptyCombo();
  gL.applySkillDamage(getSkill("xujian"), { gx: wolf.gx, gy: wolf.gy }, wolf);
  ok(wolf.buffs.some((b) => b.kind === "slow"), "虚剑命中施加减速");
  ok(wolf.effSpeed < wolf.baseSpeed, "减速降低怪物有效速度");
  gL.combo = emptyCombo();
  gL.applySkillDamage(getSkill("jianmang"), { gx: wolf.gx, gy: wolf.gy }, wolf);
  eq(gL.combo.count, 1, "起手连携 1 段");
  gL.applySkillDamage(getSkill("yujian"), { gx: wolf.gx, gy: wolf.gy }, wolf);
  eq(gL.combo.count, 2, "切换技能连携升至 2 段");
  gL.applySkillDamage(getSkill("yujian"), { gx: wolf.gx, gy: wolf.gy }, wolf);
  eq(gL.combo.count, 2, "同技能不推进连携");
})();

// ================= M. 天赋 · 法宝 =================
section("M. 天赋·法宝");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { MAP } = require("../src/data/map.ts");
  const { REALMS } = require("../src/data/realms.ts");
  const { getSkill } = require("../src/data/skills.ts");
  const { TALENTS, getTalent, talentNodeUnlocked, TALENT_POINTS_PER_REALM } = require("../src/data/talents.ts");
  const { getArtifact } = require("../src/data/artifacts.ts");

  // —— 天赋数据齐备 ——
  eq(TALENTS.length, 10, "天赋节点 10 个");
  for (const n of TALENTS) {
    ok(!!n.id && n.max > 0 && n.cost > 0, `天赋 ${n.id} 参数合法`);
    if (n.req && n.req.node) ok(!!getTalent(n.req.node), `天赋 ${n.id} 前置节点存在`);
  }
  ok(talentNodeUnlocked(getTalent("sw_jianxin"), {}, 0), "剑心无前置可点");
  ok(!talentNodeUnlocked(getTalent("sw_ruimu"), {}, 0), "锐目前置未满足时锁定");
  ok(talentNodeUnlocked(getTalent("sw_ruimu"), { sw_jianxin: 2 }, 0), "剑心2点后锐目解锁");
  ok(!talentNodeUnlocked(getTalent("sw_poxian"), { sw_jianxin: 5, sw_ruimu: 2 }, 0), "破限一剑境界不足锁定");
  ok(talentNodeUnlocked(getTalent("sw_poxian"), { sw_jianxin: 5, sw_ruimu: 2 }, 4), "境界达标破限一剑解锁");

  // —— 突破发点 + 加点属性 ——
  const pM = new Player({ gx: 11, gy: 11, nickname: "天赋散修", seed: 4 });
  eq(pM.talentPoints, 0, "初始 0 天赋点");
  ok(pM.gainExp(REALMS[1].expNeed), "获得修为触发境界突破");
  eq(pM.talentPoints, TALENT_POINTS_PER_REALM, "突破发放天赋点");
  const atk0 = pM.effAtk;
  ok(pM.spendTalent("sw_jianxin").ok, "剑心加点成功");
  ok(Math.abs((pM.effAtk - atk0) - 3 * (1 + rootMulOf(pM.root).atk)) < 1e-6, "剑心每点 攻击 +3（含灵根）");
  eq(pM.talentPoints, TALENT_POINTS_PER_REALM - 1, "加点扣 1 天赋点");
  pM.talentPoints = 10;
  pM.spendTalent("sw_jianxin"); // 剑心 rank2 → 解锁锐目
  ok(pM.spendTalent("sw_ruimu").ok, "前置满足后锐目可点");
  const hp0 = pM.maxHp;
  ok(pM.spendTalent("bd_duanti").ok, "锻体加点");
  eq(pM.maxHp - hp0, 25, "锻体每点 气血上限 +25");
  pM.talentPoints = 0;
  const rFail = pM.spendTalent("bd_tiegu");
  ok(!rFail.ok && !!rFail.reason, "天赋点不足加点失败");

  // —— 法宝 ——
  ok(!!getArtifact("qinglian-tai"), "青莲台存在");
  ok(!!getSkill(getArtifact("qinglian-tai").skill), "法宝主动技有效");
  const pA = new Player({ gx: 11, gy: 11, nickname: "法宝散修", seed: 6 });
  ok(pA.giveArtifact("qinglian-tai"), "获得青莲台");
  ok(pA.ownedArtifacts.includes("qinglian-tai"), "拥有青莲台");
  eq(pA.artifact, "qinglian-tai", "自动装备首个法宝");
  ok(pA.learned.includes("jianwu"), "装备法宝学会主动技");
  const pB = new Player({ gx: 11, gy: 11, nickname: "无法宝", seed: 6 });
  ok(Math.abs((pA.effAtk - pB.effAtk) - 6 * (1 + rootMulOf(pA.root).atk)) < 1e-6, "青莲台被动 攻击 +6（含灵根）");
  pA.unequipArtifact();
  eq(pA.effAtk, pB.effAtk, "卸下法宝攻击回落");
  // —— 天赋 + 法宝存档往返 ——
  pA.equipArtifact("qinglian-tai");
  pA.talentPoints = 5;
  pA.spendTalent("sw_jianxin");
  pA.spendTalent("sw_jianxin");
  eq(pA.talents["sw_jianxin"], 2, "剑心加点至 2");
  const svM = JSON.parse(JSON.stringify(pA.serialize()));
  const pC = new Player({ gx: 11, gy: 11, seed: 6 });
  pC.applySave(svM, MAP.playerSpawn);
  eq(pC.artifact, "qinglian-tai", "读档恢复已装备法宝");
  ok(pC.ownedArtifacts.includes("qinglian-tai"), "读档恢复拥有法宝");
  eq(pC.talents["sw_jianxin"], 2, "读档恢复天赋");
  eq(pC.effAtk, pA.effAtk, "读档后攻击一致（含法宝+天赋）");
})();

// ================= N. 留存 · 图鉴 · 成就 · 日常 · 引导 =================
section("N. 留存·图鉴·成就·日常·引导");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { ACHIEVEMENTS, achMet, getAchievement } = require("../src/data/achievements.ts");
  const { rollDailies, getDaily, DAILY_COUNT } = require("../src/data/dailies.ts");
  const { Tutorial } = require("../src/core/Tutorial.ts");

  const baseSnap = { kills: 0, realmIndex: 0, forgeMax: 0, codexKill: 0, codexItem: 0, codexSkill: 0, stones: 0, questsDone: 0, artifacts: 0, chapter: 1 };

  // —— 图鉴：击杀/获得/学习/见过 入册 ——
  const pN = new Player({ gx: 11, gy: 11, nickname: "图鉴散修", seed: 8 });
  pN.addKill("bi-jing-lang");
  ok(pN.codex.monstersKilled.includes("bi-jing-lang"), "击杀入怪物图鉴");
  pN.addKill("bi-jing-lang");
  eq(pN.codex.monstersKilled.filter((x) => x === "bi-jing-lang").length, 1, "图鉴击杀去重");
  pN.addItem("qingfeng-jian", 1);
  ok(pN.codex.itemsGot.includes("qingfeng-jian"), "获得入物品图鉴");
  pN.learnSkill("huoqiu");
  ok(pN.codex.skillsLearned.includes("huoqiu"), "学习入技能图鉴");
  pN.noteMonsterSeen("hai-yao");
  ok(pN.codex.monstersSeen.includes("hai-yao"), "见过入怪物图鉴");

  // —— 成就：纯谓词 + 自动解锁 + 领奖 ——
  const fb = getAchievement("first_blood");
  ok(achMet(fb, { ...baseSnap, kills: 1 }), "首杀成就谓词达成");
  ok(!achMet(fb, baseSnap), "0 击杀不达成首杀");
  const pAch = new Player({ gx: 11, gy: 11, nickname: "成就散修", seed: 8 });
  pAch.addKill("bi-jing-lang");
  ok(pAch.achievements.unlocked.includes("first_blood"), "击杀后首杀成就自动解锁");
  ok(pAch.claimAchievement("first_blood").ok, "领取首杀成就");
  ok(pAch.achievements.claimed.includes("first_blood"), "成就标记已领");
  ok(!pAch.claimAchievement("first_blood").ok, "成就不可重复领取");
  ok(!pAch.claimAchievement("slayer_20").ok, "未达成成就不可领");

  // —— 日常：日期播种 + 进度 + 领奖 + 跨天重置 ——
  const d1 = rollDailies("2026-10-22");
  eq(JSON.stringify(d1), JSON.stringify(rollDailies("2026-10-22")), "同日播种稳定");
  eq(d1.length, DAILY_COUNT, "日常数量固定");
  eq(new Set(d1).size, DAILY_COUNT, "日常不重复");
  ok(d1.every((id) => !!getDaily(id)), "日常 id 均有效");
  const pD = new Player({ gx: 11, gy: 11, nickname: "日常散修", seed: 8 });
  pD.refreshDaily("2026-10-22");
  eq(pD.daily.date, "2026-10-22", "刷新记录日期");
  eq(pD.daily.ids.length, DAILY_COUNT, "载入今日日常");
  const idsSnap = [...pD.daily.ids];
  pD.refreshDaily("2026-10-22");
  eq(JSON.stringify(pD.daily.ids), JSON.stringify(idsSnap), "同日刷新幂等");
  pD.daily.ids = ["d_kill6"]; pD.daily.progress = {}; pD.daily.claimed = [];
  pD.bumpDaily("kill", 6);
  eq(pD.daily.progress["d_kill6"], 6, "击杀推进日常到目标");
  ok(pD.claimDaily("d_kill6").ok, "完成后领取日常");
  ok(pD.daily.claimed.includes("d_kill6"), "日常标记已领");
  ok(!pD.claimDaily("d_kill6").ok, "日常不可重复领");
  pD.refreshDaily("2026-10-23");
  eq(pD.daily.claimed.length, 0, "跨天清空领取");
  eq(pD.daily.date, "2026-10-23", "跨天更新日期");

  // —— 引导：标志位步骤机（纯逻辑）——
  let hints = 0;
  let completed = false;
  const tut = new Tutorial(() => hints++, () => { completed = true; });
  tut.start();
  eq(hints, 1, "引导展示首条提示");
  tut.notify("talked");
  eq(hints, 1, "非期待事件不推进");
  tut.notify("moved");
  eq(hints, 2, "移动后进入下一步");
  tut.notify("talked");
  tut.notify("skilled");
  tut.notify("killed");
  ok(completed && tut.done, "四事件后引导完成");
})();

// ================= O. 表现 · 音效 · 过场 · 打击 =================
section("O. 表现·音效·过场·打击");
(function () {
  const { Sfx } = require("../src/core/Sfx.ts");
  const { Cutscene } = require("../src/core/Cutscene.ts");
  const { Player } = require("../src/entities/Player.ts");
  const { Monster } = require("../src/entities/Monster.ts");
  const { getMonster } = require("../src/data/monsters.ts");

  // —— Sfx 全方法不抛错（无 AudioContext 静默降级）——
  const sfx = new Sfx();
  let sfxOk = true;
  try {
    sfx.click(); sfx.hit(); sfx.crit(); sfx.block(); sfx.miss(); sfx.heal();
    sfx.pickup(); sfx.cast(); sfx.levelup(); sfx.die(); sfx.boss();
    sfx.forgeOk(); sfx.forgeFail(); sfx.combo(); sfx.achievement();
  } catch (e) { sfxOk = false; }
  ok(sfxOk, "Sfx 全音效方法可安全调用（静默降级）");

  // —— Cutscene 状态机：入场→推进→结束回调 ——
  const cs = new Cutscene(1280, 720);
  eq(cs.active, false, "初始无过场");
  let done = false;
  cs.play({ title: "第二章 · 乱星海", sub: "测试", lines: ["其一", "其二"] }, () => { done = true; });
  eq(cs.active, true, "play 后激活");
  for (let i = 0; i < 30; i++) cs.update(1 / 60); // 越过 in 阶段（0.4s）
  cs.advance(); // 进入第 2 段
  cs.advance(); // 末段 → out
  for (let i = 0; i < 30; i++) cs.update(1 / 60);
  eq(cs.active, false, "过场结束后失活");
  ok(done, "结束回调触发");

  // —— 跳过路径 ——
  const cs2 = new Cutscene(1280, 720);
  cs2.play({ title: "Boss", lines: ["独占"] });
  cs2.skip();
  for (let i = 0; i < 40; i++) cs2.update(1 / 60);
  eq(cs2.active, false, "skip 后过场结束");

  // —— Actor 命中闪白 ——
  const pa = new Player({ gx: 11, gy: 11, nickname: "闪白", seed: 5 });
  const mon = new Monster(getMonster("bi-jing-lang"), 12, 11, 7, 1);
  mon.takeDamage(10);
  ok(mon.hitFlash > 0, "受击触发闪白计时");
  mon.update(1 / 60, pa);
  ok(mon.flash.alpha > 0, "命中闪白可见");
  for (let i = 0; i < 30; i++) mon.update(1 / 60, pa);
  eq(mon.flash.alpha, 0, "闪白随时间衰减归零");
})();

// ================= P. 移动端触控 =================
section("P. 移动端触控");
(function () {
  const { Input, isTouchDevice } = require("../src/core/Input.ts");
  const { MobileControls } = require("../src/ui/MobileControls.ts");
  const { Player } = require("../src/entities/Player.ts");
  const { Monster } = require("../src/entities/Monster.ts");
  const { getMonster } = require("../src/data/monsters.ts");

  eq(typeof isTouchDevice(), "boolean", "isTouchDevice 返回布尔（Node 下 false）");

  const inp = new Input(1234);
  inp.setJoystick(40, 0, true);
  ok(inp.joyActive && Math.abs(inp.joyX - 1) < 1e-6 && inp.joyY === 0, "摇杆右推归一化为 +1,0");
  inp.setJoystick(0, 0, false);
  ok(!inp.joyActive && inp.joyX === 0, "摇杆释放归零");
  inp.pressSkillSlot(2);
  eq(inp.consumeSkillPress(), 2, "触控技能按下槽位");
  eq(inp.consumeSkillPress(), null, "技能按下消费后清空");
  inp.pressInteract();
  ok(inp.consumeInteract(), "触控交互按下");
  ok(!inp.consumeInteract(), "触控交互消费后清空（每帧可取走，防积压）");
  inp.pressAuto();
  ok(inp.consumeAuto() && !inp.consumeAuto(), "自动开关按下一次消费一次");

  // Actor 摇杆直控位移
  const paP = new Player({ gx: 11, gy: 11, nickname: "摇杆", seed: 7 });
  const monP = new Monster(getMonster("bi-jing-lang"), 12, 11, 7, 1);
  const gx0 = monP.gx;
  monP.nudge(1, 0, 0.1);
  ok(monP.gx > gx0, "摇杆右推使怪物右移");
  ok(monP.directMoving, "摇杆直控标记移动");
  monP.update(1 / 60, paP);
  eq(monP.directMoving, false, "update 后直控标记清除");

  // MobileControls 构造与显隐
  const mc = new MobileControls(inp, paP);
  mc.setVisible(true);
  ok(mc.visible && mc.root.visible, "触控层可见性生效");
  mc.layout(800, 480);
  mc.setPlayer(paP);
  ok(true, "MobileControls 布局/换人 无异常");
  mc.setVisible(false);
  ok(!mc.root.visible, "触控层可隐藏");
})();

// ================= Q. 灵根 · 战力评分 =================
section("Q. 灵根·战力评分");
(function () {
  const { ROOTS, getRoot, rootMulOf, rollRoot } = require("../src/data/roots.ts");
  const { Player } = require("../src/entities/Player.ts");
  const { REALMS } = require("../src/data/realms.ts");

  // —— 数据完整性 ——
  eq(ROOTS.length, 8, "灵根共 8 种（五行+三变异）");
  eq(ROOTS.filter((r) => r.mutate).length, 3, "三种变异灵根");
  ok(!!getRoot("jin") && !getRoot("nope"), "getRoot 查得/查空");
  const m0 = rootMulOf("");
  eq(m0.atk + m0.def + m0.spd + m0.crit, 0, "空灵根乘区全 0");
  ok(rootMulOf("jin").atk > 0 && rootMulOf("jin").def > 0, "金灵根攻防加成");
  eq(rootMulOf("tian").atk, 0.15, "天灵根攻击乘区 0.15");

  // —— 确定性：同 seed 同灵根 ——
  eq(rollRoot(12345), rollRoot(12345), "灵根生成确定性（同种子）");
  const seen = new Set();
  for (let s = 0; s < 200; s++) seen.add(rollRoot(s * 7919 + 1));
  ok(seen.size >= 5, "灵根分布覆盖多类（非单一）");

  // —— 属性乘区精确接入 effAtk ——
  const pF = new Player({ gx: 11, gy: 11, nickname: "战力", seed: 9 });
  const baseAtk = 10 + REALMS[pF.realmIndex].atk; // 无装备/天赋/法宝时为纯基础
  ok(Math.abs(pF.effAtk - baseAtk * (1 + rootMulOf(pF.root).atk)) < 1e-6, "effAtk 含灵根乘区（精确）");
  ok(pF.effAtk > 0 && pF.effDef > 0 && pF.effSpeed > 0, "三维属性正常");

  // —— 战力评分聚合 ——
  ok(pF.fightPower > 0, "战力评分 > 0");
  ok(Number.isInteger(pF.fightPower), "战力为整数");
  const before = pF.fightPower;
  pF.gainExp(100000); // 突破拉高境界
  ok(pF.fightPower > before, "突破后战力提升");

  // —— 存档 v3 + 旧 v2 档兼容 ——
  const pS = new Player({ gx: 11, gy: 11, nickname: "存档", seed: 5 });
  pS.gainExp(500);
  const save = pS.serialize();
  eq(save.v, 3, "存档版本为 v3");
  ok(typeof save.root === "string" && !!getRoot(save.root), "存档记录合法灵根");

  // 旧 v2 档（无 root/school/gems/battlePass）applySave 不崩且补合法灵根
  const oldV2 = { v: 2, nickname: "旧档", exp: 0, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, talentPoints: 0, talents: {}, artifact: null, ownedArtifacts: [], codex: { monstersSeen: [], monstersKilled: [], itemsGot: [], skillsLearned: [] }, achievements: { unlocked: [], claimed: [] }, daily: { date: "", ids: [], progress: {}, claimed: [] }, tutorialDone: false };
  const pOld = new Player({ gx: 11, gy: 11, nickname: "X", seed: 2 });
  let compatOk = true;
  try { pOld.applySave(oldV2, { gx: 11, gy: 11 }); } catch (e) { compatOk = false; }
  ok(compatOk, "v2 旧档 applySave 不抛错");
  ok(!!getRoot(pOld.root), "v2 旧档补出合法灵根");
})();

// ================= R. 宝石 · 洗练 =================
section("R. 宝石·洗练");
(function () {
  const { GEMS, getGem, gemsForSlot, REFINE_COST } = require("../src/data/gems.ts");
  const { rootMulOf } = require("../src/data/roots.ts");
  const { Player } = require("../src/entities/Player.ts");

  // —— 数据完整性 ——
  eq(GEMS.length, 5, "宝石共 5 种");
  ok(!!getGem("gem-atk") && !getGem("nope"), "getGem 查得/查空");
  eq(gemsForSlot("weapon").length, 2, "武器可镶 2 种宝石");
  eq(gemsForSlot("armor").length, 1, "防具可镶 1 种宝石");

  const p = new Player({ gx: 11, gy: 11, nickname: "宝石", seed: 4 });
  p.addItem("qingfeng-jian", 1);
  ok(p.equip("qingfeng-jian"), "装备青锋剑");
  p.addItem("gem-atk", 1);
  p.addItem("gem-def", 1);
  eq(p.countItem("gem-atk"), 1, "宝石计数=1");

  // 部位不符：防御宝石镶武器应失败
  ok(!p.socketGem("qingfeng-jian", "gem-def").ok, "部位不符镶嵌失败");
  // 正确镶嵌（加成并入 equipStat，受灵根乘区）
  const atk0 = p.effAtk;
  const rGem = p.socketGem("qingfeng-jian", "gem-atk");
  ok(rGem.ok, "镶嵌攻击宝石成功");
  ok(Math.abs(p.effAtk - (atk0 + 8 * (1 + rootMulOf(p.root).atk))) < 1e-6, "镶嵌攻击宝石 +8 生效（含灵根）");
  eq(p.gems["qingfeng-jian"], "gem-atk", "宝石记录到装备孔位");
  // 卸下回收
  ok(p.unsocketGem("qingfeng-jian").ok, "卸下宝石成功");
  ok(Math.abs(p.effAtk - atk0) < 1e-6, "卸下后攻击回落");
  eq(p.countItem("gem-atk"), 1, "卸下宝石回背包");

  // 洗练：消耗灵石重滚词条
  p.stones = REFINE_COST + 10;
  ok(p.refine("qingfeng-jian").ok, "洗练成功");
  ok(p.stones < REFINE_COST + 10, "洗练消耗灵石");
  ok(p.affixes["qingfeng-jian"] != null, "洗练后词条重铸");

  // 存档往返含 gems
  p.socketGem("qingfeng-jian", "gem-atk");
  const sv = p.serialize();
  ok(sv.gems && sv.gems["qingfeng-jian"] === "gem-atk", "存档记录镶嵌宝石");
  const p2 = new Player({ gx: 11, gy: 11, seed: 9 });
  p2.applySave(JSON.parse(JSON.stringify(sv)), { gx: 11, gy: 11 });
  eq(p2.gems["qingfeng-jian"], "gem-atk", "读档恢复镶嵌宝石");
})();

// ================= S. 功法流派 =================
section("S. 功法流派");
(function () {
  const { SCHOOLS, getSchool, DEFAULT_SCHOOL } = require("../src/data/schools.ts");
  const { rootMulOf } = require("../src/data/roots.ts");
  const { Player } = require("../src/entities/Player.ts");

  eq(SCHOOLS.length, 4, "流派共 4 种");
  eq(DEFAULT_SCHOOL, "sanxiu", "默认流派为散修（零被动）");
  ok(!!getSchool("jianxiu") && !getSchool("nope"), "getSchool 查得/查空");

  const p = new Player({ gx: 11, gy: 11, nickname: "流派", seed: 7 });
  eq(p.school, "sanxiu", "初始为散修");
  ok(!p.setSchool("nope").ok, "切换无效流派失败");

  const atkBefore = p.effAtk;
  ok(p.setSchool("jianxiu").ok, "切换剑修成功");
  eq(p.school, "jianxiu", "流派已切换");
  const ratio = (1 + rootMulOf(p.root).atk + 0.08) / (1 + rootMulOf(p.root).atk);
  ok(Math.abs(p.effAtk - atkBefore * ratio) < 1e-6, "剑修被动 +8% 攻击生效");
  eq(p.equipped.join(","), getSchool("jianxiu").skills.slice(0, 4).join(","), "切换后装备流派技能");

  // 存档往返
  const sv = p.serialize();
  eq(sv.school, "jianxiu", "存档记录流派");
  const p2 = new Player({ gx: 11, gy: 11, seed: 9 });
  p2.applySave(JSON.parse(JSON.stringify(sv)), { gx: 11, gy: 11 });
  eq(p2.school, "jianxiu", "读档恢复流派");

  // 旧 v2 档（无 school）applySave 不崩且补默认
  const old2 = { v: 2, nickname: "X", exp: 0, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, talentPoints: 0, talents: {}, artifact: null, ownedArtifacts: [], codex: { monstersSeen: [], monstersKilled: [], itemsGot: [], skillsLearned: [] }, achievements: { unlocked: [], claimed: [] }, daily: { date: "", ids: [], progress: {}, claimed: [] }, tutorialDone: false };
  const px = new Player({ gx: 11, gy: 11, seed: 2 });
  let ok2 = true;
  try { px.applySave(old2, { gx: 11, gy: 11 }); } catch (e) { ok2 = false; }
  ok(ok2, "v2 旧档无 school 不崩");
  eq(px.school, "sanxiu", "v2 旧档补默认流派");
})();

// ================= T. 副本/秘境 =================
section("T. 副本·秘境");
(function () {
  const { DUNGEON_MAP } = require("../src/data/dungeon.ts");
  const { ZONES } = require("../src/data/zones.ts");
  const { Game } = require("../src/Game.ts");

  // —— 数据层：地图与区域注册 ——
  eq(DUNGEON_MAP.w, 24, "秘境地图宽 24（行宽一致）");
  ok(Array.isArray(DUNGEON_MAP.wolfZone) && DUNGEON_MAP.wolfZone.length > 0, "秘境含狼刷新点");
  ok(!!ZONES.dungeon, "秘境区域已注册");
  eq(ZONES.dungeon.buff && ZONES.dungeon.buff.kind, "hot", "秘境灵气为持续回血 buff");
  eq(ZONES.dungeon.bossId, "yao-lang-wang", "秘境镇守 Boss 为妖狼王");
  const tp = ZONES.ch1.transfers.find((t) => t.gx === 4 && t.gy === 4);
  ok(tp && tp.to === "dungeon", "落霞镇 (4,4) 传送点指向秘境");

  // —— 集成：进入秘境验证行为 ——
  const game = new Game();
  game.start();
  game.startNewGame("秘境客");
  let guard = 0;
  while (game.dialogue.isOpen && guard++ < 50) game.dlgBox.onAdvance(0);
  game.enterZone("dungeon", { gx: 11, gy: 11 });
  eq(game.currentZoneId, "dungeon", "已进入秘境");
  ok(game.player.flags["boss_spawned"] === true, "秘境自动镇守 Boss");
  ok(game.player.buffs.some((b) => b.kind === "hot"), "进入即赋予秘境灵气回血 buff");
  ok(Math.abs(game.player.gx - 11.5) < 1e-6 && Math.abs(game.player.gy - 11.5) < 1e-6, "落地于秘境出生点");
  // 秘境灵气回血：临时切出秘境区域以隔离强制刷怪的干扰，单独验证 hot buff 持续回补
  game.currentZoneId = "ch1";
  game.player.quests.active = [];
  game.monsters.length = 0;
  game.player.hp = Math.max(1, game.player.maxHp - 30);
  const hp0 = game.player.hp;
  for (let i = 0; i < 180; i++) game.debugStep(1 / 60);
  ok(game.player.hp > hp0, `秘境灵气持续回血（${hp0}→${game.player.hp}）`);

  // 恢复秘境上下文，继续验证镇守与刷怪
  game.currentZoneId = "dungeon";
  game.monsters.length = 0;
  game.player.gx = 11.5;
  game.player.gy = 11.5;
  game.player.stop();
  for (let i = 0; i < 6; i++) game.debugStep(1 / 60);
  ok(game.monsters.some((m) => m.alive && m.isBoss), "秘境镇守妖狼王现身");
  if (game.cutscene && game.cutscene.active) game.cutscene.skip();
  for (let i = 0; i < 300; i++) {
    if (i % 20 === 0) game.player.hp = game.player.maxHp;
    game.debugStep(1 / 60);
  }
  ok(game.monsters.some((m) => m.alive && !m.isBoss), "秘境无激活任务也刷新妖兽");
  ok(game.player.buffs.some((b) => b.kind === "hot"), "秘境灵气持续存在");

  // —— 回程法阵 → 落霞镇（传送闭环）——
  game.player.gx = 11.5;
  game.player.gy = 14.5;
  game.player.stop();
  for (let i = 0; i < 70; i++) {
    if (i % 20 === 0) game.player.hp = game.player.maxHp;
    game.debugStep(1 / 60);
  }
  ok(game.transferPanel.visible, "踏入回程法阵弹出传送确认");
  game.confirmTransfer();
  eq(game.currentZoneId, "ch1", "返回落霞镇");
  eq(game.currentMap, OPEN_MAP, "地图切回落霞镇");
  ok(Math.abs(game.player.gx - 4.5) < 1e-6 && Math.abs(game.player.gy - 4.5) < 1e-6, "回到镇西古径");
  ok(game.npcs.some((n) => n.def.id === "cunzhang"), "落霞镇 NPC 已重建");

  // —— 镇西古径 → 秘境（正向传送闭环）——
  for (let i = 0; i < 70; i++) {
    if (i % 20 === 0) game.player.hp = game.player.maxHp;
    game.debugStep(1 / 60);
  }
  ok(game.transferPanel.visible, "踏入镇西古径弹出传送确认");
  game.confirmTransfer();
  eq(game.currentZoneId, "dungeon", "再次传送进入秘境");
  ok(game.player.unlockedZones.includes("dungeon"), "秘境已解锁并记录");
})();

// ================= U. 挂机/自动战斗 =================
section("U. 挂机·自动战斗");
(function () {
  const { Game } = require("../src/Game.ts");
  const { Monster } = require("../src/entities/Monster.ts");
  const { getMonster } = require("../src/data/monsters.ts");

  const game = new Game();
  game.start();
  game.startNewGame("挂机修士");
  let g = 0;
  while (game.dialogue.isOpen && g++ < 50) game.dlgBox.onAdvance(0);

  // 玩家身边放一只狼
  const px = game.player.gx, py = game.player.gy;
  const wolf = new Monster(getMonster("bi-jing-lang"), Math.floor(px), Math.floor(py), 7, 1);
  wolf.gx = px + 2; wolf.gy = py;
  game.monsters.push(wolf);
  game.map.addActor(wolf.rig.root);

  game.toggleAutoFight();
  ok(game.autoFight === true, "自动战斗已开启");

  // 自动战斗应自动接近并施法造成伤害
  const hpStart = wolf.hp;
  for (let i = 0; i < 900 && wolf.alive; i++) game.debugStep(1 / 60);
  ok(wolf.hp < hpStart || !wolf.alive, `自动战斗对目标造成伤害（${hpStart}→${wolf.hp}）`);

  game.toggleAutoFight();
  ok(game.autoFight === false, "自动战斗可关闭");
})();

// ================= V. 战令/月卡/签到 =================
section("V. 战令·月卡·签到");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { BattlePassPanel } = require("../src/ui/BattlePassPanel.ts");

  const p = new Player({ gx: 11, gy: 11, seed: 5 });
  // 连续 7 天签到
  let gained = 0;
  for (let d = 1; d <= 7; d++) {
    const day = "2026-10-0" + d; // 01..07
    const r = p.signIn(day);
    ok(r.ok, `第 ${d} 天签到成功`);
    if (r.stones) gained += r.stones;
  }
  eq(p.battlePass.signinDays.length, 7, "累计 7 个签到日");
  ok(p.signIn("2026-10-01").ok === false, "同日重复签到被拒");
  ok(gained > 7 * 50, "第 7 天签到含额外奖励");

  // 战令档位：活跃天数 7，第 1 档可领，第 8 档不可
  ok(p.claimTier(1).ok, "第 1 档领取成功");
  ok(p.battlePass.claimed.includes(1), "第 1 档已记录");
  ok(p.claimTier(1).ok === false, "重复领取被拒");
  ok(p.claimTier(8).ok === false, "活跃天数不足不可领高档");

  // 月卡
  const now = 1700000000000;
  ok(p.activateMonthCard(now).ok, "月卡激活");
  const mc = p.claimMonthCard("2026-10-10", now);
  ok(mc.ok && mc.stones === 120, "月卡当日领取 120 灵石");
  ok(p.claimMonthCard("2026-10-10", now).ok === false, "月卡同日重复领取被拒");
  ok(p.claimMonthCard("2026-10-11", now + 31 * 86400000).ok === false, "月卡过期拒绝");

  // 存档往返
  const sv = p.serialize();
  ok(sv.battlePass && sv.battlePass.signinDays.length === 7, "存档含签到记录");
  const p2 = new Player({ gx: 11, gy: 11, seed: 9 });
  p2.applySave(JSON.parse(JSON.stringify(sv)), { gx: 11, gy: 11 });
  eq(p2.battlePass.signinDays.length, 7, "读档恢复签到记录");
  eq(p2.battlePass.claimed.length, 1, "读档恢复已领档位");

  // 旧 v2 档缺 battlePass 不崩且补默认
  const old2 = { v: 2, nickname: "X", exp: 0, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, talentPoints: 0, talents: {}, artifact: null, ownedArtifacts: [], codex: { monstersSeen: [], monstersKilled: [], itemsGot: [], skillsLearned: [] }, achievements: { unlocked: [], claimed: [] }, daily: { date: "", ids: [], progress: {}, claimed: [] }, tutorialDone: false };
  const pv = new Player({ gx: 11, gy: 11, seed: 3 });
  let okv = true;
  try { pv.applySave(old2, { gx: 11, gy: 11 }); } catch (e) { okv = false; }
  ok(okv, "v2 旧档无 battlePass 不崩");
  eq(pv.battlePass.season, 1, "v2 旧档补默认赛季");
  eq(pv.battlePass.signinDays.length, 0, "v2 旧档补默认签到空");

  // 面板构造与开关
  const panel = new BattlePassPanel(p, () => {}, () => "2026-10-10");
  panel.toggle();
  ok(panel.visible, "战令面板可开启");
  panel.toggle();
  ok(!panel.visible, "战令面板可关闭");
})();

// ================= W. 离线收益 =================
section("W. 离线收益");
(function () {
  const { Player } = require("../src/entities/Player.ts");

  // 离线 1 小时应给正收益
  const p = new Player({ gx: 11, gy: 11, seed: 7 });
  p.lastSeen = Date.now() - 3600 * 1000;
  const before = p.exp;
  const off = p.collectOffline(Date.now());
  ok(off && off.exp > 0 && off.stones > 0, "离线 1 小时获得修为与灵石");
  ok(p.exp > before, "修为已增加");
  ok(Math.abs(off.hours - 1) < 1e-6, "离线时长约 1 小时");

  // 封顶 12h
  const p2 = new Player({ gx: 11, gy: 11, seed: 3 });
  p2.lastSeen = Date.now() - 100 * 3600 * 1000;
  const off2 = p2.collectOffline(Date.now());
  ok(off2 && Math.abs(off2.hours - 12) < 1e-6, "离线收益封顶 12 小时");

  // 月卡加成
  const base = new Player({ gx: 11, gy: 11, seed: 1 });
  base.lastSeen = Date.now() - 3600 * 1000;
  const baseOff = base.collectOffline(Date.now());
  const mc = new Player({ gx: 11, gy: 11, seed: 1 });
  mc.activateMonthCard(Date.now());
  mc.lastSeen = Date.now() - 3600 * 1000;
  const mcOff = mc.collectOffline(Date.now());
  ok(mcOff && baseOff && mcOff.exp > baseOff.exp, "月卡提升离线收益");

  // 旧档缺 lastSeen：不计离线、不崩
  const pv = new Player({ gx: 11, gy: 11, seed: 9 });
  const old = { v: 2, nickname: "X", exp: 0, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, talentPoints: 0, talents: {}, artifact: null, ownedArtifacts: [], codex: { monstersSeen: [], monstersKilled: [], itemsGot: [], skillsLearned: [] }, achievements: { unlocked: [], claimed: [] }, daily: { date: "", ids: [], progress: {}, claimed: [] }, tutorialDone: false };
  let okv = true;
  try { pv.applySave(old, { gx: 11, gy: 11 }); } catch (e) { okv = false; }
  ok(okv, "旧档 applySave 不崩");
  const offOld = pv.collectOffline(Date.now());
  ok(offOld === null, "旧档缺 lastSeen 不计离线收益");

  // 存档往返
  const p3 = new Player({ gx: 11, gy: 11, seed: 5 });
  p3.lastSeen = 1234567890;
  const sv = p3.serialize();
  ok(sv.lastSeen === 1234567890, "存档含 lastSeen");
  const p4 = new Player({ gx: 11, gy: 11, seed: 8 });
  p4.applySave(JSON.parse(JSON.stringify(sv)), { gx: 11, gy: 11 });
  eq(p4.lastSeen, 1234567890, "读档恢复 lastSeen");
})();

// ================= X. 天劫/渡劫 =================
section("X. 天劫·渡劫");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { Game } = require("../src/Game.ts");

  // 1) 新玩家跨筑基阈值：境界封顶、待渡置位
  const p = new Player({ gx: 11, gy: 11, seed: 5 });
  eq(p.realmIndex, 0, "初始为凡人");
  ok(!p.hasPendingTribulation(), "初始无待渡天劫");
  p.gainExp(1600); // 跨过筑基(1500)
  eq(p.pendingTribulation, 4, "待渡境界=筑基(4)");
  eq(p.realmIndex, 3, "未渡前境界封顶在炼气九层(3)");

  // 2) 确定性：rng=0 必成功，rng=0.999 必失败
  const p2 = new Player({ gx: 11, gy: 11, seed: 1 });
  p2.gainExp(1600);
  const beforeAtk = p2.effAtk;
  const sOk = p2.resolveTribulation(() => 0);
  ok(sOk.success && p2.brokenRealms[4] === true, "rng=0 渡劫成功并标记已渡");
  ok(p2.tribStacks === 1, "渡劫成功 tribStacks=1");
  eq(p2.realmIndex, 4, "渡劫后境界=筑基");
  ok(p2.effAtk > beforeAtk, `渡劫永久加成属性（${beforeAtk}→${p2.effAtk}）`);

  const p3 = new Player({ gx: 11, gy: 11, seed: 2 });
  p3.gainExp(1600);
  const hp0 = p3.hp;
  const sFail = p3.resolveTribulation(() => 0.999); // chance<=0.97<0.999 必败
  ok(!sFail.success, "rng=0.999 渡劫失败");
  ok(p3.brokenRealms[4] === false, "失败不标记已渡");
  eq(p3.pendingTribulation, 4, "失败仍可再渡");
  ok(p3.hp < hp0, "失败损失部分气血");

  // 3) 存档往返
  const sv = p2.serialize();
  ok(Array.isArray(sv.brokenRealms) && sv.brokenRealms.includes(4), "存档含已渡境界");
  eq(sv.tribStacks, 1, "存档含 tribStacks");
  const p4 = new Player({ gx: 11, gy: 11, seed: 9 });
  p4.applySave(JSON.parse(JSON.stringify(sv)), { gx: 11, gy: 11 });
  ok(p4.brokenRealms[4] === true && p4.tribStacks === 1, "读档恢复天劫状态");

  // 4) 旧档(v2, 无天劫字段) 在金丹境界不回退
  const old2 = { v: 2, nickname: "老修", exp: 3000, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, talentPoints: 0, talents: {}, artifact: null, ownedArtifacts: [], codex: { monstersSeen: [], monstersKilled: [], itemsGot: [], skillsLearned: [] }, achievements: { unlocked: [], claimed: [] }, daily: { date: "", ids: [], progress: {}, claimed: [] }, tutorialDone: false };
  const pv = new Player({ gx: 11, gy: 11, seed: 3 });
  pv.applySave(old2, { gx: 11, gy: 11 });
  eq(pv.realmIndex, 5, "旧金丹档境界不回退(5)");
  ok(pv.brokenRealms[4] && pv.brokenRealms[5], "旧档按已达境界默认已过劫");

  // 5) Game 层：跨阈值触发天劫演出，强制成功结算
  const g = new Game();
  g.start();
  g.startNewGame("劫修");
  let n = 0; while (g.dialogue.isOpen && n++ < 50) g.dlgBox.onAdvance(0);
  g.player.gainExp(1600);
  g.maybeTribulate();
  ok(g.cutscene.active === true, "跨阈值触发天劫过场");
  const orig = Math.random;
  Math.random = () => 0; // 强制成功
  for (let i = 0; i < 80 && g.cutscene.active; i++) g.cutscene.update(0.5);
  Math.random = orig;
  ok(g.player.brokenRealms[4] === true, "过场结算后筑基已渡");
})();

// ================= Y. 炼丹 =================
section("Y. 炼丹");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { ALEMBIC_RECIPES } = require("../src/data/alembic.ts");

  ok(ALEMBIC_RECIPES.length >= 5, "丹方表非空");
  const pk = ALEMBIC_RECIPES.find((r) => r.id === "r-tupo");
  ok(!!pk && pk.out.id === "tu-po-dan", "突破丹丹方产出 tu-po-dan");

  const p = new Player({ gx: 11, gy: 11, seed: 1 });
  for (const ing of pk.ingredients) p.addItem(ing.id, ing.n);
  p.stones += 100;
  const before = p.countItem("tu-po-dan");
  const rOk = p.alchemize("r-tupo", () => 0); // 强制成功
  ok(rOk.ok && rOk.success && p.countItem("tu-po-dan") === before + pk.out.n, "材料足→炼丹成功产出突破丹");
  ok(p.countItem("yaowang-neidan") === 0, "炼丹消耗妖王内丹");

  const p2 = new Player({ gx: 11, gy: 11, seed: 2 });
  const rNo = p2.alchemize("r-tupo");
  ok(!rNo.ok && /不足/.test(rNo.reason || ""), "材料不足炼丹失败");

  const p3 = new Player({ gx: 11, gy: 11, seed: 3 });
  for (const ing of pk.ingredients) p3.addItem(ing.id, ing.n);
  p3.stones += 100;
  const rFail = p3.alchemize("r-tupo", () => 0.999); // 必败
  ok(rFail.ok && !rFail.success, "高 rng 炼丹失败");
  ok(p3.countItem("yaowang-neidan") === 0, "失败不退妖王内丹(1→0)");
  ok(p3.countItem("yaodan") === 1, "失败退还半数妖丹(2→1)");
  ok(p3.countItem("jiao-zhu") === 1, "失败退还半数鲛珠(3→1)");

  const p4 = new Player({ gx: 11, gy: 11, seed: 4 });
  p4.addItem("tu-po-dan", 1);
  const e0 = p4.exp;
  const msg = p4.useConsumable("tu-po-dan");
  ok(p4.exp > e0 && /修为/.test(msg || ""), "服用突破丹获得修为");

  const old = { v: 2, nickname: "X", exp: 0, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, talentPoints: 0, talents: {}, artifact: null, ownedArtifacts: [], codex: { monstersSeen: [], monstersKilled: [], itemsGot: [], skillsLearned: [] }, achievements: { unlocked: [], claimed: [] }, daily: { date: "", ids: [], progress: {}, claimed: [] }, tutorialDone: false };
  let okv = true;
  try { p4.applySave(old, { gx: 11, gy: 11 }); } catch (e) { okv = false; }
  ok(okv, "旧档 applySave 不崩");
})();

// ================= Z. 灵兽 =================
section("Z. 灵兽");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { Game } = require("../src/Game.ts");
  const { Monster } = require("../src/entities/Monster.ts");
  const { MONSTERS } = require("../src/data/monsters.ts");
  const { getBeast, BEASTS, CAPTURE_MAP } = require("../src/data/beasts.ts");

  ok(BEASTS.length >= 3, "灵兽表非空");
  ok(!!getBeast("qingluan") && CAPTURE_MAP["hui-lang"] === "langhun", "青鸾存在且灰毛狼→狼灵");

  // 1) 捕捉确定性
  const pc = new Player({ gx: 11, gy: 11, seed: 8 });
  const cs = pc.captureBeast("hui-lang", () => 0); // rate 0.5
  ok(cs.ok && cs.beastId === "langhun" && pc.beasts.includes("langhun"), "rng=0 捕捉成功(狼灵)");
  const cf = pc.captureBeast("hai-yao", () => 0.999); // rate 0.35 必败
  ok(!cf.ok, "rng=0.999 捕捉失败");
  const cdup = pc.captureBeast("hui-lang", () => 0);
  ok(!cdup.ok && /已拥有/.test(cdup.reason || ""), "重复捕捉返回已拥有");
  const cbad = pc.captureBeast("fu-hai-jiao", () => 0);
  ok(!cbad.ok && /不可收服/.test(cbad.reason || ""), "不可收服妖兽(覆海蛟)");

  // 2) 出战加成 / 存档往返 / 收回回落
  const pb = new Player({ gx: 11, gy: 11, seed: 7 });
  const a0 = pb.effAtk, d0 = pb.effDef, h0 = pb.maxHp;
  pb.addBeast("qingluan"); pb.setActiveBeast("qingluan");
  ok(pb.effAtk > a0 && pb.effDef > d0 && pb.maxHp > h0, "出战灵兽提升三维");
  const svB = pb.serialize();
  ok(Array.isArray(svB.beasts) && svB.beasts.includes("qingluan"), "存档含灵兽");
  eq(svB.activeBeast, "qingluan", "存档含出战灵兽");
  const pb2 = new Player({ gx: 11, gy: 11, seed: 9 });
  pb2.applySave(JSON.parse(JSON.stringify(svB)), { gx: 11, gy: 11 });
  ok(pb2.beasts.includes("qingluan") && pb2.activeBeast === "qingluan", "读档恢复灵兽");
  pb.setActiveBeast(null);
  ok(pb.effAtk === a0 && pb.effDef === d0 && pb.maxHp === h0, "收回灵兽加成回落");

  // 3) 旧档（无灵兽字段）默认空
  const oldB = { v: 2, nickname: "旧", exp: 0, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, talentPoints: 0, talents: {}, artifact: null, ownedArtifacts: [], codex: { monstersSeen: [], monstersKilled: [], itemsGot: [], skillsLearned: [] }, achievements: { unlocked: [], claimed: [] }, daily: { date: "", ids: [], progress: {}, claimed: [] }, tutorialDone: false };
  const pb3 = new Player({ gx: 11, gy: 11, seed: 10 });
  pb3.applySave(oldB, { gx: 11, gy: 11 });
  ok(Array.isArray(pb3.beasts) && pb3.beasts.length === 0 && pb3.activeBeast === null, "旧档无灵兽字段默认空");

  // 4) Game 层：开局赠送青鸾出战；协战自动开火；捕捉全流程
  const gZ = new Game(); gZ.start(); gZ.startNewGame("兽修");
  let nZ = 0; while (gZ.dialogue.isOpen && nZ++ < 50) gZ.dlgBox.onAdvance(0);
  ok(gZ.player.activeBeast === "qingluan", "开局赠送青鸾并出战");
  ok(gZ.player.beasts.includes("qingluan"), "拥有青鸾");
  const wm = new Monster(MONSTERS["hui-lang"], gZ.player.gx + 1, gZ.player.gy, 4242, 2);
  gZ.monsters.push(wm);
  const hpB = wm.hp;
  gZ.updateBeast(5); // dt > attackCd，触发一次协战
  ok(wm.hp < hpB, `灵兽协战自动开火（${hpB}→${wm.hp}）`);
  gZ.player.addItem("capture-bell", 2);
  wm.hp = 1;
  const before = gZ.player.countItem("capture-bell");
  const origRng = gZ.player.captureRng;
  gZ.player.captureRng = () => 0; // 强制捕捉成功（走真实 captureBeast → addBeast）
  gZ.tryCapture();
  gZ.player.captureRng = origRng;
  ok(gZ.player.beasts.includes("langhun"), "捕捉全流程获得狼灵");
  eq(gZ.player.countItem("capture-bell"), before - 1, "捕捉消耗一枚捕兽铃");
})();

// ================= A. 镇妖塔 =================
section("A. 镇妖塔");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { Game } = require("../src/Game.ts");
  const { TOWER_FLOORS, MAX_TOWER_FLOOR } = require("../src/data/tower.ts");

  ok(TOWER_FLOORS.length === MAX_TOWER_FLOOR, "塔层数=MAX");
  ok(TOWER_FLOORS[0].monsters.length >= 1 && TOWER_FLOORS[MAX_TOWER_FLOOR - 1].scale > TOWER_FLOORS[0].scale, "塔层属性缩放递增");
  ok(TOWER_FLOORS.every((f) => f.monsters.length > 0 && f.reward.exp > 0 && f.reward.stones > 0), "每层有怪且有奖励");

  // Player 字段 + 存档
  const st = new Player({ gx: 11, gy: 11, seed: 5 }).serialize();
  ok(typeof st.towerFloor === "number" && typeof st.towerBest === "number" && typeof st.towerDaily === "string", "存档含塔进度");
  const pt2 = new Player({ gx: 11, gy: 11, seed: 6 });
  pt2.applySave({ v: 3, nickname: "t", exp: 0, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, talentPoints: 0, talents: {}, artifact: null, ownedArtifacts: [], codex: { monstersSeen: [], monstersKilled: [], itemsGot: [], skillsLearned: [] }, achievements: { unlocked: [], claimed: [] }, daily: { date: "", ids: [], progress: {}, claimed: [] }, tutorialDone: false }, { gx: 11, gy: 11 });
  ok(pt2.towerFloor === 1 && pt2.towerBest === 0 && pt2.towerDaily === "", "旧档缺塔字段给默认");

  // Game 层：进入塔刷怪，清层推进+发奖，每日重置
  const gT = new Game(); gT.start(); gT.startNewGame("塔修");
  let nT = 0; while (gT.dialogue.isOpen && nT++ < 50) gT.dlgBox.onAdvance(0);
  gT.enterTower();
  ok(gT.currentZoneId === "tower", "进入镇妖塔");
  ok(gT.monsters.length > 0, "塔内刷出怪物");
  const f0 = gT.player.towerFloor;
  const expB = gT.player.exp;
  // 清空当前层（直接移除，专测层推进管线）
  for (let i = gT.monsters.length - 1; i >= 0; i--) {
    const m = gT.monsters[i];
    try { gT.map.removeActor(m.rig.root); } catch (e) {}
    gT.monsters.splice(i, 1);
  }
  gT.checkTowerProgress(0.1); // 置 towerNextT=0.8
  gT.checkTowerProgress(1.0); // 归零 → advanceTower
  ok(gT.player.towerFloor === f0 + 1, "清层后层数+1");
  ok(gT.player.exp > expB, "通关获得修为奖励");
  ok(gT.monsters.length > 0, "下一层重新刷怪");

  // 每日重置：跨日后进入回到第 1 层，历史最高保留
  gT.player.towerDaily = "2000-01-01";
  gT.enterTower();
  ok(gT.player.towerFloor === 1, "跨日进入重置到第 1 层");
  ok(gT.player.towerBest >= 2, "历史最高保留");
})();

// ================= B. 竞技场 =================
section("B. 竞技场");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { Game } = require("../src/Game.ts");
  const { buildOpponent, buildMirrorOpponent, seedArenaBoard, arenaDelta, ARENA_BOARD_SIZE, ARENA_MIN_DELTA } = require("../src/data/arena.ts");

  ok(seedArenaBoard().length === ARENA_BOARD_SIZE && ARENA_BOARD_SIZE >= 10, "本地排行榜播种 12 名对手");
  const o1 = buildOpponent(123, 1, "甲", "board");
  const o2 = buildOpponent(123, 1, "甲", "board");
  ok(o1.atk === o2.atk && o1.maxHp === o2.maxHp, "buildOpponent 确定性");
  ok(o1.atk > 0 && o1.def > 0 && o1.maxHp > 0, "对手属性为正");

  // ELO 强度加权：打赢强者加分更多；镜像对手随玩家属性缩放
  const dWeak = arenaDelta(1000, 800, true);
  const dStrong = arenaDelta(1000, 1400, true);
  ok(dStrong > dWeak && dWeak >= ARENA_MIN_DELTA, "ELO：强敌胜场加分更多");
  const m1 = buildMirrorOpponent(1, { atk: 100, def: 50, maxHp: 500 }, 1, 2, "X", "board");
  const m2 = buildMirrorOpponent(1, { atk: 200, def: 100, maxHp: 1000 }, 1, 2, "X", "board");
  ok(m2.atk > m1.atk && m2.maxHp > m1.maxHp, "镜像对手随玩家属性缩放");

  // Player 字段 + 存档
  const pA = new Player({ gx: 11, gy: 11, seed: 11 });
  eq(pA.arenaPoints, 1000, "竞技场初始积分 1000");
  pA.ensureArenaBoard(0);
  ok(pA.arenaBoard.length === ARENA_BOARD_SIZE, "ensureArenaBoard 播种本地排行榜");
  const svA = pA.serialize();
  ok(typeof svA.arenaPoints === "number" && Array.isArray(svA.arenaBoard), "存档含竞技场字段");
  const pA2 = new Player({ gx: 11, gy: 11, seed: 12 });
  pA2.applySave(JSON.parse(JSON.stringify(svA)), { gx: 11, gy: 11 });
  ok(pA2.arenaPoints === 1000 && pA2.arenaBoard.length === ARENA_BOARD_SIZE, "读档恢复竞技场");
  // 旧档（无竞技场字段）默认
  const oldA = { v: 2, nickname: "旧", exp: 0, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, talentPoints: 0, talents: {}, artifact: null, ownedArtifacts: [], codex: { monstersSeen: [], monstersKilled: [], itemsGot: [], skillsLearned: [] }, achievements: { unlocked: [], claimed: [] }, daily: { date: "", ids: [], progress: {}, claimed: [] }, tutorialDone: false };
  const pA3 = new Player({ gx: 11, gy: 11, seed: 13 });
  pA3.applySave(oldA, { gx: 11, gy: 11 });
  ok(pA3.arenaPoints === 1000 && pA3.arenaBoard.length === 0 && pA3.arenaWins === 0, "旧档无竞技场字段默认空");

  // Game 层：开局有对手；弱敌必胜且积分+；强敌必败且积分-（不低于下限）；确定性
  const gA = new Game(); gA.start(); gA.startNewGame("竞技修");
  let nA = 0; while (gA.dialogue.isOpen && nA++ < 50) gA.dlgBox.onAdvance(0);
  gA.openArena();
  ok(!!gA.currentArenaOpp, "开局有竞技场对手");

  const weak = { id: "w", nickname: "弱敌", realmIndex: 0, atk: 1, def: 1, maxHp: 10, source: "board" };
  const strong = { id: "s", nickname: "强敌", realmIndex: 0, atk: 99999, def: 99999, maxHp: 999999, source: "board" };

  gA.currentArenaOpp = weak;
  const rw = gA.startArenaDuel(() => 0.5);
  ok(rw.win && rw.delta > 0 && gA.player.arenaPoints > 1000, `弱敌获胜积分+（${gA.player.arenaPoints}）`);

  const r1 = (gA.currentArenaOpp = weak, gA.startArenaDuel(() => 0.5).rounds);
  const r2 = (gA.currentArenaOpp = weak, gA.startArenaDuel(() => 0.5).rounds);
  ok(r1 === r2, `对战回合数确定性（${r1}）`);

  gA.currentArenaOpp = strong;
  const rs = gA.startArenaDuel(() => 0.5);
  ok(!rs.win && rs.delta < 0 && gA.player.arenaPoints >= 100, `强敌战败积分-（${gA.player.arenaPoints}）`);

  gA.currentArenaOpp = null;
  const rn = gA.startArenaDuel(() => 0.5);
  ok(!rn.win && rn.delta === 0, "无对手时挑战安全返回");

  ok(gA.arenaRank() >= 1, "排名计算为正数");
})();

// ================= C. 飞升转世 =================
section("C. 飞升转世");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { REALMS, ASCEND_REALMS, MAX_REINCARNATIONS } = require("../src/data/realms.ts");

  ok(ASCEND_REALMS.length >= 4, "第二世境界表非空");
  ok(ASCEND_REALMS[0].expNeed > REALMS[REALMS.length - 1].expNeed, "第二世起点高于第一世顶点");
  for (let i = 1; i < ASCEND_REALMS.length; i++) ok(ASCEND_REALMS[i].expNeed > ASCEND_REALMS[i - 1].expNeed, `第二世第 ${i} 境阈值递增`);

  const pC = new Player({ gx: 11, gy: 11, seed: 21 });
  eq(pC.reincarnations, 0, "初始为第一世");
  // 把第一世堆到化神圆满（高修为 + 天劫全破）
  pC.exp = 1e9;
  pC.brokenRealms = pC.brokenRealms.map(() => true);
  ok(pC.realmIndex === REALMS.length - 1, "第一世已达顶点");
  ok(pC.canAscend, "化神圆满可飞升");

  const before = pC.realmName;
  const res = pC.reincarnate();
  ok(res.ok && pC.reincarnations === 1, "飞升成功，进入第二世");
  ok(pC.realmName !== before, "飞升后境界表切换");
  ok(Math.abs(pC.inheritMul - 1.12) < 1e-9, "转世继承加成 +12%");
  ok(pC.exp >= 1e9, "修为(exp)继承保留");
  ok(!pC.canAscend, "已达转世上限，不可再飞升");
  ok(pC.realmTier > REALMS.length - 1, "跨世战力档位单调递增");

  // 存档往返
  const svC = pC.serialize();
  ok(typeof svC.reincarnations === "number" && svC.reincarnations === 1, "存档含转世次数");
  const pC2 = new Player({ gx: 11, gy: 11, seed: 22 });
  pC2.applySave(JSON.parse(JSON.stringify(svC)), { gx: 11, gy: 11 });
  ok(pC2.reincarnations === 1 && pC2.realmName === pC.realmName, "读档恢复第二世境界");

  // 旧档（无转世字段）默认第一世
  const oldC = { v: 2, nickname: "旧", exp: 0, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, talentPoints: 0, talents: {}, artifact: null, ownedArtifacts: [], codex: { monstersSeen: [], monstersKilled: [], itemsGot: [], skillsLearned: [] }, achievements: { unlocked: [], claimed: [] }, daily: { date: "", ids: [], progress: {}, claimed: [] }, tutorialDone: false };
  const pC3 = new Player({ gx: 11, gy: 11, seed: 23 });
  pC3.applySave(oldC, { gx: 11, gy: 11 });
  ok(pC3.reincarnations === 0 && !pC3.canAscend, "旧档无转世字段默认第一世");
})();

// ================= D. 限时活动 =================
section("D. 限时活动");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { activeEvents, EVENTS } = require("../src/data/events.ts");

  const NOW = Date.now();
  ok(activeEvents(NOW).length >= 2, "当前有多个生效活动");
  ok(activeEvents(NOW).some((e) => e.id === "ev_double"), "双倍修炼长期生效");
  // 过期判断：新春庆典(2030-02) 在 2026 不生效
  ok(!activeEvents(NOW).some((e) => e.id === "ev_festival"), "限时节日活动未到时间不生效");
  ok(activeEvents(new Date("2030-02-10").getTime()).some((e) => e.id === "ev_festival"), "到达时间后节日活动生效");
  ok(EVENTS.find((e) => e.id === "ev_double").mult === 2, "双倍倍率为 2");

  const pD = new Player({ gx: 11, gy: 11, seed: 31 });
  ok(pD.hasActiveEvent("ev_double", NOW), "玩家可感知生效活动");
  ok(pD.eventKillMul(NOW) === 2, "击杀收益倍率为 2");

  // 登录活动：当日首次进入自动发放，幂等（每日一次）
  const beforeStones = pD.stones;
  const granted = pD.claimLoginEvents(NOW, "2026-10-22");
  ok(granted.length === 1 && pD.stones > beforeStones, "登录活动发放灵石奖励");
  const afterStones = pD.stones;
  const again = pD.claimLoginEvents(NOW, "2026-10-22");
  ok(again.length === 0 && pD.stones === afterStones, "同日重复领取无效（幂等）");
  // 跨日可再次领取
  const next = pD.claimLoginEvents(NOW, "2026-10-23");
  ok(next.length === 1, "次日可再次领取登录奖励");

  // 存档往返 + 旧档默认
  const svD = pD.serialize();
  ok(typeof svD.eventClaims === "object", "存档含活动领取记录");
  const pD2 = new Player({ gx: 11, gy: 11, seed: 32 });
  pD2.applySave(JSON.parse(JSON.stringify(svD)), { gx: 11, gy: 11 });
  ok(pD2.eventClaims["ev_login"] === "2026-10-23", "读档恢复活动领取记录");

  // 过期后倍率回落为 1：构造一个只靠节日双倍的时间点
  const onlyFestival = new Date("2030-02-10").getTime();
  // 该时点 ev_double 仍长期生效，无法单独验证回落；改测无活动时倍率为 1
  const pD3 = new Player({ gx: 11, gy: 11, seed: 33 });
  // 强制清空生效（通过覆盖 eventClaims 无关，这里直接检验空活动表逻辑）
  ok(pD3.eventKillMul(new Date("1990-01-01").getTime()) === 1, "无活动时击杀倍率为 1");
})();

// ================= E. 社交系统 =================
section("E. 社交系统");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { NPC_FRIENDS, MAILS, SECT_BUILDINGS } = require("../src/data/social.ts");

  const pE = new Player({ gx: 11, gy: 11, seed: 41 });
  ok(NPC_FRIENDS.length >= 3, "有若干本地好友");
  ok(MAILS.length >= 3, "有若干 NPC 邮件");
  ok(SECT_BUILDINGS.length >= 3, "有若干宗门建筑");

  // 论道：每日一次，好感增长，奖励按好感分档放大
  const day = "2026-10-23";
  const s0 = pE.stones;
  const r1 = pE.interactFriend("lin", day);
  ok(r1.ok && pE.friends["lin"].affinity === 1, "论道成功且好感+1");
  ok(pE.stones > s0, "论道发放奖励");
  const r1b = pE.interactFriend("lin", day);
  ok(!r1b.ok, "同日重复论道无效（幂等）");
  const r2 = pE.interactFriend("lin", "2026-10-24");
  ok(r2.ok && pE.friends["lin"].affinity === 2, "次日可再次论道");

  // 邮件：开局可领 welcome；金丹邮件需达境界
  const rm = pE.claimMail("m_welcome");
  ok(rm.ok, "入门邮件可领取");
  ok(pE.claimMail("m_welcome").ok === false, "重复领取被拒");
  ok(pE.claimMail("m_jindan").ok === false, "未达境界邮件不可领");
  pE.exp = 1e9; // 顶满境界
  pE.brokenRealms = pE.brokenRealms.map(() => true); // 已渡全部天劫，境界生效
  ok(pE.claimMail("m_jindan").ok, "达境界后金丹邮件可领");

  // 击杀累积宗门贡献
  const c0 = pE.sectContribution;
  pE.addKill("slime");
  ok(pE.sectContribution > c0, "击杀累积宗门贡献");

  // 宗门建筑升级：花费贡献，未满级可升，贡献不足/满级报错
  const b = SECT_BUILDINGS[0];
  pE.sectContribution = 9999;
  const before = pE.sectBuildingLv(b.id);
  const ru = pE.upgradeSectBuilding(b.id);
  ok(ru.ok && pE.sectBuildingLv(b.id) === before + 1, "宗门建筑升级成功");
  // 贡献被扣除
  const cost = b.costPerLv * (before + 1);
  ok(pE.sectContribution === 9999 - cost, "升级扣除对应贡献");

  // 修炼堂加成影响经验获取（默认 1，升级后 >1）
  const mul0 = pE.sectExpMul();
  pE.upgradeSectBuilding("xiu-lian-tang");
  ok(pE.sectExpMul() > mul0, "修炼堂升级提升经验加成");

  // 门派大比：每日一次，确定性，胜则获贡献
  const w0 = pE.sectContribution;
  const sw = pE.sectWar(day);
  ok(sw.ok, "门派大比可参与");
  ok(pE.sectWar(day).ok === false, "同日重复大比无效");
  if (sw.win) ok(pE.sectContribution > w0, "大比获胜增加贡献");
  const sw2 = pE.sectWar("2026-10-24");
  ok(sw2.ok, "次日可再次大比");

  // 存档往返 + 旧档默认
  const svE = pE.serialize();
  ok(Array.isArray(svE.mailsClaimed) && typeof svE.sectContribution === "number", "存档含社交字段");
  const pE2 = new Player({ gx: 11, gy: 11, seed: 42 });
  pE2.applySave(JSON.parse(JSON.stringify(svE)), { gx: 11, gy: 11 });
  ok(pE2.mailsClaimed.includes("m_welcome") && pE2.sectBuildingLv(b.id) === pE.sectBuildingLv(b.id), "读档恢复社交进度");
  const oldE = { v: 2, nickname: "旧", exp: 0, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, tutorialDone: false };
  const pE3 = new Player({ gx: 11, gy: 11, seed: 43 });
  pE3.applySave(oldE, { gx: 11, gy: 11 });
  ok(pE3.sectContribution === 0 && pE3.mailsClaimed.length === 0, "旧档无社交字段默认空");

  // 旧档版本兼容：v1（最小字段）/ v3（全字段）applySave 不崩且可序列化
  const v1 = { v: 1, nickname: "v1", exp: 100, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null };
  const v3 = { v: 3, nickname: "v3", exp: 500, hp: 200, mp: 100, inv: [["ling-cao", 1]], equipment: { weapon: "bi-shui-jian" }, learned: ["huo-qiu"], equipped: ["huo-qiu", null, null, null], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 10, playMs: 1000, built: [], stones: 50, forge: {}, chapter: 2, unlockedZones: ["ch1", "ch2"], reputation: 5, sect: "xuan-shui", root: "shui", school: "xuan-shui", gems: {}, battlePass: { season: 1, claimed: [], signinDays: [] }, lastSeen: 0, brokenRealms: [], pendingTribulation: 0, tribStacks: 0, beasts: [], activeBeast: null, towerFloor: 1, towerBest: 1, towerDaily: "", arenaPoints: 0, arenaWins: 0, arenaLosses: 0, reincarnations: 0, arenaBoard: [] };
  const pV1 = new Player({ gx: 11, gy: 11, seed: 51 });
  pV1.applySave(v1, { gx: 11, gy: 11 });
  ok(pV1.exp === 100 && pV1.reincarnations === 0, "v1 旧档 applySave 不崩且字段默认");
  const pV3 = new Player({ gx: 11, gy: 11, seed: 52 });
  pV3.applySave(v3, { gx: 11, gy: 11 });
  ok(pV3.exp === 500 && pV3.root === "shui" && pV3.reincarnations === 0, "v3 旧档 applySave 还原字段");
  // 序列化往返不抛错
  const sv1 = pV1.serialize(); const sv3 = pV3.serialize();
  const pV1b = new Player({ gx: 11, gy: 11, seed: 53 }); pV1b.applySave(sv1, { gx: 11, gy: 11 });
  const pV3b = new Player({ gx: 11, gy: 11, seed: 54 }); pV3b.applySave(sv3, { gx: 11, gy: 11 });
  ok(pV1b.exp === 100 && pV3b.exp === 500, "v1/v3 序列化往返一致");
})();

// ================= F. 坠魔谷玩法深化 =================
section("F. 坠魔谷玩法深化");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { Monster } = require("../src/entities/Monster.ts");
  const { getMonster, MONSTERS } = require("../src/data/monsters.ts");
  const { getItem } = require("../src/data/items.ts");
  const { ZONES } = require("../src/data/zones.ts");

  // 魔物族与 Boss 定义
  ok(getMonster("mo-zun").demon === true && getMonster("mo-zun").boss === true, "魔尊为魔物 Boss");
  ok(getMonster("mo-jing-lang").demon === true, "魔狼为魔物");
  ok(getMonster("xie-xiu").demon === true && getMonster("xin-mo").demon === true, "邪修/心魔为魔物");
  ok(getMonster("mo-zun").loot.some((l) => l.id === "mo-zun-neidan"), "魔尊掉落含魔尊内丹");

  // 坠魔谷区域配置
  ok(ZONES.zhuomo.bossId === "mo-zun", "坠魔谷 Boss 为魔尊");
  for (const w of ZONES.zhuomo.wild) ok(getMonster(w.id).demon === true, `坠魔谷野怪 ${w.id} 为魔物`);

  // 掉落物真实存在
  ok(!!getItem("mo-he") && !!getItem("mo-qi") && !!getItem("mo-zun-neidan"), "魔物掉落物已注册");

  // 掉落掷算：每个掉落 id 都能解析
  const boss = new Monster(getMonster("mo-zun"), 0, 0, 123, 1);
  const drops = boss.rollDrops();
  ok(Array.isArray(drops), "Boss 掉落可掷算");
  let allReal = true;
  for (const d of drops) if (!getItem(d.id)) allReal = false;
  ok(allReal, "所有掉落物 id 真实存在");

  // 镇魔进度：击杀魔物累加，非魔物不计
  const pF = new Player({ gx: 11, gy: 11, seed: 51 });
  const before = pF.demonSlain;
  pF.addKill("mo-jing-lang");
  ok(pF.demonSlain === before + 1, "击杀魔物累加镇魔进度");
  pF.addKill("hui-lang");
  ok(pF.demonSlain === before + 1, "非魔物不计入镇魔进度");

  // 存档往返 + 旧档默认
  const svF = pF.serialize();
  ok(typeof svF.demonSlain === "number", "存档含镇魔进度");
  const pF2 = new Player({ gx: 11, gy: 11, seed: 52 });
  pF2.applySave(JSON.parse(JSON.stringify(svF)), { gx: 11, gy: 11 });
  ok(pF2.demonSlain === pF.demonSlain, "读档恢复镇魔进度");
  const oldF = { v: 2, nickname: "旧", exp: 0, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, tutorialDone: false };
  const pF3 = new Player({ gx: 11, gy: 11, seed: 53 });
  pF3.applySave(oldF, { gx: 11, gy: 11 });
  ok(pF3.demonSlain === 0, "旧档无镇魔字段默认 0");
})();

// ================= G. Roguelike 秘境（地图工厂 + 随机增益/诅咒） =================
section("G. Roguelike 秘境");
(function () {
  const { genRogueMap, pickRogueBuff, rogueMonsterPool } = require("../src/core/MapFactory.ts");
  const { makeRng } = require("../src/core/Rng.ts");
  const { Player } = require("../src/entities/Player.ts");

  function bfsReach(blocked, s, g) {
    const h = blocked.length, w = blocked[0].length;
    const seen = Array.from({ length: h }, () => Array(w).fill(false));
    const q = [[s.gx, s.gy]];
    seen[s.gy][s.gx] = true;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === g.gx && y === g.gy) return true;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !blocked[ny][nx] && !seen[ny][nx]) {
          seen[ny][nx] = true; q.push([nx, ny]);
        }
      }
    }
    return false;
  }

  const a = genRogueMap(12345, 1);
  const b = genRogueMap(12345, 1);
  const c = genRogueMap(12345, 2);
  ok(a.map.blocked.length === b.map.blocked.length && a.map.blocked[0].length === b.map.blocked[0].length, "同种子同层地图尺寸一致");
  let same = true;
  for (let y = 0; y < a.map.h; y++) for (let x = 0; x < a.map.w; x++) if (a.map.blocked[y][x] !== b.map.blocked[y][x]) same = false;
  ok(same, "同种子同层地图完全一致（确定性）");
  let diff = false;
  for (let y = 0; y < a.map.h; y++) for (let x = 0; x < a.map.w; x++) if (a.map.blocked[y][x] !== c.map.blocked[y][x]) diff = true;
  ok(diff, "不同层地图不同");
  ok(bfsReach(a.map.blocked, a.spawn, a.exit), "出生点可达出口（全连通）");
  ok(a.roomCenters.length >= 2, "房间数 >= 2（避免出生即出口）");

  const buff = pickRogueBuff(makeRng(7));
  ok(buff && typeof buff.kind === "string" && buff.t === 9999, "随机秘境增益/诅咒有效");
  const pool = rogueMonsterPool(5);
  ok(Array.isArray(pool) && pool.length > 0, "秘境怪物池非空");

  const p = new Player({ gx: 11, gy: 11, seed: 9 });
  const base = p.effAtk;
  p.addBuff({ kind: "atkUp", value: 50, t: 9999 });
  ok(p.effAtk > base, "atkUp buff 提升有效攻击（随机增益落地到属性）");

  p.rogueBest = 7;
  const sv = p.serialize();
  ok(sv.rogueBest === 7, "rogueBest 入档");
  const p2 = new Player({ gx: 11, gy: 11, seed: 10 });
  p2.applySave(JSON.parse(JSON.stringify(sv)), { gx: 11, gy: 11 });
  ok(p2.rogueBest === 7, "rogueBest 读档恢复");
  const old = { v: 2, nickname: "旧", exp: 0, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, tutorialDone: false };
  const p3 = new Player({ gx: 11, gy: 11, seed: 11 });
  p3.applySave(old, { gx: 11, gy: 11 });
  ok(p3.rogueBest === 0, "旧档无 rogueBest 默认 0");
})();

// ================= H. NPC 好感多结局 =================
section("H. NPC 好感多结局");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const { FRIEND_ENDINGS, SOCIAL_STORY, NPC_FRIENDS, defaultSocialProfile } = require("../src/data/social.ts");

  ok(NPC_FRIENDS.length === 3, "存在 3 位可结缘 NPC");
  ok(FRIEND_ENDINGS.length === 9, "共 9 个结局（每位 3 档）");
  for (const e of FRIEND_ENDINGS) ok(!!SOCIAL_STORY[e.nodeId], `结局节点 ${e.nodeId} 已定义`);

  const p = new Player({ gx: 11, gy: 11, seed: 61 });
  // 好感 0 → 初识档
  p.friends["lin"] = { affinity: 0, lastDay: "" };
  let r = p.requestFriendEnding("lin");
  ok(r.ok && r.endingId === "lin_acquaint", "好感 0 触发初识结局");
  ok(r.nodeId === "ending_lin_acquaint", "初识结局对应对话节点");
  // 好感 5 → 知交档
  p.friends["lin"] = { affinity: 5, lastDay: "" };
  r = p.requestFriendEnding("lin");
  ok(r.endingId === "lin_confidant", "好感 5 触发知交结局");
  // 好感满 → 生死至交档
  p.friends["lin"] = { affinity: 10, lastDay: "" };
  r = p.requestFriendEnding("lin");
  ok(r.endingId === "lin_soulmate", "好感满触发生死至交结局");
  ok(p.friendEnding["lin"] === "lin_soulmate", "结局已落档 friendEnding");
  // 无此好友
  ok(p.requestFriendEnding("nope").ok === false, "无此好友返回失败");

  // 结局节点效果落地（赠青锋剑）
  const node = SOCIAL_STORY["ending_lin_soulmate"];
  const before = p.countItem("qingfeng-jian");
  p.applyEffects(node.effects);
  ok(p.countItem("qingfeng-jian") === before + 1, "结局节点效果落地（赠青锋剑）");

  // 存档往返 + 旧档默认
  const sv = p.serialize();
  ok(typeof sv.friendEnding === "object" && sv.friendEnding.lin === "lin_soulmate", "存档含 friendEnding");
  const p2 = new Player({ gx: 11, gy: 11, seed: 62 });
  p2.applySave(JSON.parse(JSON.stringify(sv)), { gx: 11, gy: 11 });
  ok(p2.friendEnding.lin === "lin_soulmate", "读档恢复 friendEnding");
  const old = { v: 2, nickname: "旧", exp: 0, hp: 100, mp: 50, inv: [], equipment: {}, learned: [], equipped: [], quests: { active: [], progress: {}, done: [] }, flags: {}, kills: 0, playMs: 0, built: [], stones: 0, forge: {}, chapter: 1, unlockedZones: ["ch1"], reputation: 0, sect: null, tutorialDone: false };
  const p3 = new Player({ gx: 11, gy: 11, seed: 63 });
  p3.applySave(old, { gx: 11, gy: 11 });
  ok(Object.keys(p3.friendEnding).length === 0, "旧档无 friendEnding 默认 {}");

  // 云社交档案：导出/应用（p2-⑤）
  const sp = p2.exportSocial();
  ok(sp && typeof sp === "object" && sp.friendEnding.lin === "lin_soulmate", "exportSocial 导出含结局");
  ok(Array.isArray(sp.mailsClaimed) && typeof sp.sectContribution === "number", "exportSocial 结构完整");
  const fresh = new Player({ gx: 11, gy: 11, seed: 64 });
  fresh.applySocial(sp);
  ok(fresh.friendEnding.lin === "lin_soulmate", "applySocial 覆盖结局（云优先）");
  fresh.applySocial(null);
  ok(Object.keys(fresh.friendEnding).length === 1, "applySocial(null) 不影响本地");
  const def = defaultSocialProfile();
  ok(def.sectContribution === 0 && JSON.stringify(def.friends) === "{}" && def.mailsClaimed.length === 0, "defaultSocialProfile 为空档");
})();

// ================= I. P3-1 五行属性克制 =================
section("I. P3-1 五行属性克制");
(function () {
  const { elementMultiplier, elementTag } = require("../src/data/elements.ts");
  ok(elementMultiplier("metal", "wood") === 1.5, "金克木增伤 1.5");
  ok(elementMultiplier("water", "fire") === 1.5, "水克火增伤 1.5");
  ok(elementMultiplier("fire", "metal") === 1.5, "火克金增伤 1.5");
  ok(elementMultiplier("wood", "metal") === 0.7, "木被金克减伤 0.7");
  ok(elementMultiplier("fire", "water") === 0.7, "火被水克减伤 0.7");
  ok(elementMultiplier("metal", "metal") === 1, "同属性 1.0");
  ok(elementMultiplier(undefined, "fire") === 1, "无属性 1.0");
  ok(elementTag("metal", "wood") === "克" && elementTag("wood", "metal") === "抗", "克制标记正确");
})();

// ================= J. P3-2 秘境事件房 + 祝福/遗物池 =================
section("J. P3-2 秘境事件房 + 祝福/遗物池");
(function () {
  const { genRogueMap, pickRogueBuff, pickRogueRelic, ROGUE_BUFFS, ROGUE_RELICS } = require("../src/core/MapFactory.ts");
  const { makeRng } = require("../src/core/Rng.ts");
  const f = genRogueMap(12345, 1);
  ok(Array.isArray(f.events), "RogueFloor 含 events");
  ok(f.events.length <= 2, "事件房不超过 2 个");
  ok(f.events.every((e) => ["shop", "altar", "question"].includes(e.kind)), "事件类型合法");
  ok(f.events.every((e) => Number.isFinite(e.gx) && Number.isFinite(e.gy)), "事件坐标合法");
  const b = pickRogueBuff(makeRng(7));
  ok(b && typeof b.value === "number", "pickRogueBuff 返回 buff");
  const r = pickRogueRelic(makeRng(7));
  ok(r.persistent === true, "pickRogueRelic 标记 persistent（整局遗物）");
  ok(ROGUE_BUFFS.length > 0 && ROGUE_RELICS.length > 0, "祝福/遗物池非空");
})();

// ================= K. P3-4 装备品质色阶 + 词缀随机化 =================
section("K. P3-4 装备品质色阶 + 词缀随机化");
(function () {
  const { rollRarity, RARITIES, getRarity } = require("../src/data/rarity.ts");
  const { makeRng } = require("../src/core/Rng.ts");
  const { Player } = require("../src/entities/Player.ts");
  const rng = makeRng(123);
  let common = 0, high = 0;
  for (let i = 0; i < 1000; i++) { const r = rollRarity(rng); if (r === "common") common++; if (r === "epic" || r === "legendary") high++; }
  ok(common > 300, "无 bias 凡品占比最高");
  ok(high < 150, "无 bias 史诗/传说稀少");
  const rng2 = makeRng(123);
  let highBias = 0;
  for (let i = 0; i < 1000; i++) { const rr = rollRarity(rng2, 0.8); if (rr === "epic" || rr === "legendary") highBias++; }
  ok(highBias > high, "bias 提升高品质比例");
  const mul = RARITIES.map((x) => x.statMul), aff = RARITIES.map((x) => x.affixes);
  ok(mul[0] < mul[1] && mul[1] < mul[2] && mul[2] < mul[3] && mul[3] < mul[4], "品质倍率单调递增");
  ok(aff[0] < aff[1] && aff[1] < aff[2] && aff[2] < aff[3] && aff[3] < aff[4], "品质词缀数单调递增");
  const p = new Player({ gx: 11, gy: 11, nickname: "测试", seed: 7 });
  p.addItem("qingfeng-jian", 1, 1.0);
  ok(p.rarities["qingfeng-jian"] != null, "获得装备记录品质");
  ok(p.affixes["qingfeng-jian"] != null, "获得装备记录词缀");
  const ser = p.serialize();
  ok(ser.rarities && ser.rarities["qingfeng-jian"] === p.rarities["qingfeng-jian"], "serialize 含 rarities（旧档兼容）");
  // 同装备重复获得词缀不重滚（按 id 玩家级共享）
  const p2 = new Player({ gx: 11, gy: 11, nickname: "t2", seed: 3 });
  p2.addItem("bi-shui-jian", 1, 0.5);
  const a1 = JSON.stringify(p2.affixes["bi-shui-jian"]);
  p2.addItem("bi-shui-jian", 1, 0);
  ok(JSON.stringify(p2.affixes["bi-shui-jian"]) === a1, "同装备重复获得词缀不重滚");
  // 数值缩放：传说品质基础数值 ×2.0（equipStat 乘 statMul）
  p2.rarities["bi-shui-jian"] = "legendary";
  p2.equip("bi-shui-jian");
  const atkWith = p2.effAtk;
  p2.unequip("weapon");
  const atkNo = p2.effAtk;
  // 差值比例应等于该装备基础×倍率 占 裸 effAtk 的比例（仅验证缩放使属性更高）
  ok(atkWith > atkNo, "穿戴装备提升攻击（含品质缩放）");
})();

// ================= L. P3-3 流派↔天赋共鸣 =================
section("L. P3-3 流派天赋共鸣");
(function () {
  const { getSchoolSynergy, TALENT_SYNERGY_MUL, SCHOOLS } = require("../src/data/schools.ts");
  const { Player } = require("../src/entities/Player.ts");
  ok(getSchoolSynergy("jianxiu") === "sword", "剑修共鸣剑道");
  ok(getSchoolSynergy("faxiu") === "law", "法修共鸣灵修");
  ok(getSchoolSynergy("tixiu") === "body", "体修共鸣锻体");
  ok(getSchoolSynergy("sanxiu") === undefined, "散修无共鸣");
  // 共鸣使对应分支天赋效果放大
  const p = new Player({ gx: 11, gy: 11, nickname: "共鸣", seed: 7 });
  p.setSchool("jianxiu");
  p.talents["sw_jianxin"] = 1; // 剑心通明 每点 atk+3
  const atkSword = p.effAtk;
  const p2 = new Player({ gx: 11, gy: 11, nickname: "散修", seed: 7 });
  p2.setSchool("sanxiu");
  p2.talents["sw_jianxin"] = 1;
  const atkSan = p2.effAtk;
  ok(atkSword > atkSan, "选剑修后剑道天赋贡献更高（共鸣 ×1.5）");
  // 共鸣仅放大对应分支：法修点「灵修」crit 词条(共鸣) vs 点「剑道」crit 词条(非共鸣)，差值=共鸣倍率差（隔离流派被动加性项）
  const c2 = new Player({ gx: 11, gy: 11, nickname: "法修A", seed: 7 });
  c2.setSchool("faxiu"); c2.talents["sw_ruimu"] = 1; // 剑道 crit+2% 非共鸣
  const d2 = new Player({ gx: 11, gy: 11, nickname: "法修B", seed: 7 });
  d2.setSchool("faxiu"); d2.talents["lw_dongcha"] = 1; // 灵修 crit+2% 共鸣 law
  const diff = d2.critRateTotal - c2.critRateTotal;
  ok(Math.abs(diff - 0.01) < 1e-6, "共鸣仅放大对应分支（灵修×1.5），非共鸣分支不受影响");
  ok(TALENT_SYNERGY_MUL === 1.5, "共鸣倍率常量 = 1.5");
  ok(SCHOOLS.length >= 4, "流派数量充足");
})();

// ================= M. P3-5 野外采集→炼丹闭环 =================
section("M. P3-5 野外采集→炼丹闭环");
(function () {
  const { ZONES } = require("../src/data/zones.ts");
  const { ALEMBIC_RECIPES } = require("../src/data/alembic.ts");
  const { Player } = require("../src/entities/Player.ts");
  ok(ZONES.ch1.gathers && ZONES.ch1.gathers.length >= 3, "落霞镇含野外采集点");
  ok(ZONES.ch1.gathers.some((g) => g.mat === "ling-cao"), "落霞镇可采灵草");
  ok(ZONES.dungeon.gathers && ZONES.dungeon.gathers.length > 0, "秘境·残破洞天含采集点");
  ok(ZONES.zhuomo.gathers.some((g) => g.mat === "mo-he"), "坠魔谷可采魔核");
  const r = ALEMBIC_RECIPES.find((x) => x.id === "r-cao-dan");
  ok(r && r.ingredients[0].id === "ling-cao" && r.ingredients[0].n === 3, "灵草丹方：灵草×3");
  ok(r && r.out.id === "huixue-dan", "灵草丹方产出回血丹");
  // 闭环：采集灵草 → 炼丹 → 获得回血丹，材料扣减
  const p = new Player({ gx: 9, gy: 9, nickname: "采药", seed: 7 });
  p.addItem("ling-cao", 3);
  const before = p.countItem("ling-cao");
  const res = p.alchemize("r-cao-dan", () => 0);
  ok(res.ok && res.success, "采得灵草后炼丹成功");
  ok(p.countItem("huixue-dan") >= 1, "炼出回血丹");
  ok(p.countItem("ling-cao") === before - 3, "炼丹消耗灵草×3");
})();

// ================= N. P3-1b 格挡/弹反/连招（Player 层） =================
section("N. P3-1b 格挡/弹反/连招-Player 层");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const p = new Player({ gx: 11, gy: 11, nickname: "盾修", seed: 7 });
  ok(p.guardMul === 0.5, "格挡减伤系数=0.5");
  const okB = p.tryBlock();
  ok(okB && p.blocking && p.blockT === 0, "tryBlock 进入格挡且计时归零");
  const cast = p.startCast(0);
  ok(cast === false, "格挡姿态下不可施法");
  p.endBlock();
  ok(!p.blocking && p.blockCd > 0, "endBlock 解除并进入短冷却");
  const okB2 = p.tryBlock();
  ok(okB2 === false, "格挡冷却中不可再次格挡");
  // 格挡持续：累进计时并消耗体力
  const p2 = new Player({ gx: 11, gy: 11, nickname: "盾修2", seed: 7 });
  p2.tryBlock();
  const stam0 = p2.stamina;
  p2.update(0.5);
  ok(p2.blockT > 0.4 && p2.stamina < stam0, "格挡持续累进计时并消耗体力");
  // 体力耗尽自动解除
  const p3 = new Player({ gx: 11, gy: 11, nickname: "盾修3", seed: 7 });
  p3.tryBlock();
  p3.stamina = 1;
  p3.update(0.5);
  ok(!p3.blocking, "体力耗尽自动解除格挡");
})();

// ================= O. P3-5余 奇遇/宝箱/动态刷怪 =================
section("O. P3-5余 奇遇/宝箱/动态刷怪");
(function () {
  const { ZONES } = require("../src/data/zones.ts");
  const { ENCOUNTER_STORY } = require("../src/data/encounters.ts");
  const { getItem } = require("../src/data/items.ts");
  const { getMonster } = require("../src/data/monsters.ts");
  const ch1 = ZONES.ch1;
  ok(ch1.chests && ch1.chests.length >= 1, "落霞镇含宝箱");
  ok(ch1.chests.some((c) => c.hidden), "存在隐藏宝箱");
  ok(ch1.chests.every((c) => Array.isArray(c.loot) && c.loot.length > 0), "宝箱均有掉落表");
  ok(ch1.chests.every((c) => c.loot.every((l) => !!getItem(l.id))), "宝箱掉落物均为有效物品");
  ok(Array.isArray(ch1.encounters) && ch1.encounters.length >= 3, "落霞镇含奇遇事件池");
  ok(ch1.encounters.every((id) => !!ENCOUNTER_STORY[id]), "奇遇事件节点均已定义");
  ok(ch1.dynamicSpawn && ch1.dynamicSpawn.pool.length > 0 && ch1.dynamicSpawn.maxAlive > 0, "落霞镇含动态刷怪配置");
  ok(ch1.dynamicSpawn.pool.every((id) => !!getMonster(id)), "动态刷怪怪物池均有效");
  for (const z of Object.values(ZONES)) {
    if (z.encounters) ok(z.encounters.every((id) => !!ENCOUNTER_STORY[id]), `zone ${z.id} 奇遇节点有效`);
    if (z.dynamicSpawn) ok(z.dynamicSpawn.pool.every((id) => !!getMonster(id)), `zone ${z.id} 刷怪池有效`);
  }
})();

// ================= P. P3-7 叙事/选择分支 =================
section("P. P3-7 叙事-选择分支");
(function () {
  const { SIDE_STORY } = require("../src/data/sidequests.ts");
  const { QUESTS, NPCS } = require("../src/data/story/chapter1.ts");
  const { DialogueRunner } = require("../src/core/Dialogue.ts");
  const { Player } = require("../src/entities/Player.ts");

  ok(!!SIDE_STORY.linyou_root, "支线根节点 linyou_root 存在");
  ok(SIDE_STORY.linyou_root.choices.length === 5, "根节点含 5 个选项");

  // 复刻 Game.evalCond 的条件判定，验证 StoryChoice.cond 过滤
  const visibleOf = (state, nodeId = "linyou_root") => {
    const host = {
      applyEffects() {},
      cond: (c) => {
        const f = state.flags || {};
        if (c.flag && !f[c.flag]) return false;
        if (c.notFlag && f[c.notFlag]) return false;
        const q = state.quests || { active: [], done: [] };
        if (c.questActive && !q.active.includes(c.questActive)) return false;
        if (c.questDone && !q.done.includes(c.questDone)) return false;
        if (c.levelMin && (state.realmIndex || 0) < c.levelMin) return false;
        return true;
      },
    };
    const r = new DialogueRunner(SIDE_STORY, host);
    r.open(nodeId);
    return r.visibleChoices.map((c) => c.text);
  };

  const init = visibleOf({ flags: {}, quests: { active: [], done: [] } });
  ok(init.length === 3, "初始仅显示 接取/报酬/拒绝 三选项");
  ok(init.some((t) => t.includes("替你寻来")) && init.some((t) => t.includes("恕难从命")), "初始含接取与拒绝选项");

  const accepted = visibleOf({ flags: { linyou_engaged: true }, quests: { active: ["q_lostjade"], done: [] } });
  ok(accepted.length === 1 && accepted[0].includes("物归原主"), "接取后仅显示『交付』分支");

  const done = visibleOf({ flags: { linyou_engaged: true, qdone_q_lostjade: true }, quests: { active: [], done: ["q_lostjade"] } });
  ok(done.length === 1 && done[0].includes("可好"), "完成后仅显示『闲谈』分支");

  ok(!!QUESTS.q_lostjade && QUESTS.q_lostjade.kill === "bi-jing-lang" && QUESTS.q_lostjade.n === 3, "支线任务 q_lostjade 配置正确");
  ok(NPCS.some((n) => n.id === "linyou" && n.dialogue === "linyou_root"), "落霞镇含支线 NPC 云游客·苏砚");

  const p = new Player({ gx: 11, gy: 11, nickname: "试", seed: 3 });
  p.applyEffects([{ t: "setFlag", id: "flagA" }]);
  ok(p.flags.flagA === true, "setFlag 默认置 true");
  p.applyEffects([{ t: "setFlag", id: "flagB", v: false }]);
  ok(p.flags.flagB === false, "setFlag v:false 置 false");

  // 玄机子道德抉择分支（第二位支线 NPC，验证 cond 驱动的互斥/分流）
  ok(!!SIDE_STORY.xuanji_root, "玄机子根节点 xuanji_root 存在");
  ok(SIDE_STORY.xuanji_root.choices.length === 6, "根节点含 6 个选项");
  const xInit = visibleOf({ flags: {}, quests: { active: [], done: [] } }, "xuanji_root");
  ok(xInit.length === 3, "初始仅显示 相助/举报/告辞 三选项");
  ok(xInit.some((t) => t.includes("我愿相助")) && xInit.some((t) => t.includes("换取赏银")) && xInit.some((t) => t.includes("告辞")), "初始含相助/举报/告辞");
  const xAccept = visibleOf({ flags: { xuanji_engaged: true }, quests: { active: ["q_xuanji_herb"], done: [] } }, "xuanji_root");
  ok(xAccept.length === 1 && xAccept[0].includes("交予道长"), "接取后仅显示『交付』分支");
  const xDone = visibleOf({ flags: { xuanji_engaged: true, qdone_q_xuanji_herb: true }, quests: { active: [], done: ["q_xuanji_herb"] } }, "xuanji_root");
  ok(xDone.length === 1 && xDone[0].includes("别来无恙"), "完成任务后仅显示『闲谈』分支");
  const xReport = visibleOf({ flags: { xuanji_engaged: true, xuanji_reported: true }, quests: { active: [], done: [] } }, "xuanji_root");
  ok(xReport.length === 1 && xReport[0].includes("邪修"), "举报后仅显示『举发后续』分支");
  ok(!!QUESTS.q_xuanji_herb && QUESTS.q_xuanji_herb.kill === "bi-jing-lang" && QUESTS.q_xuanji_herb.n === 3, "支线任务 q_xuanji_herb 配置正确");
  ok(NPCS.some((n) => n.id === "xuanji" && n.dialogue === "xuanji_root"), "落霞镇含支线 NPC 游方道人·玄机子");

  // 跨 NPC 世界线涟漪：玄机子抉择影响村长对话（选择分支→世界状态→他者对话）
  ok(!!STORY.cunzhang_root, "村长根节点存在");
  const cVis = (flags) => {
    const h = { applyEffects() {}, cond: (c) => {
      if (c.flag && !flags[c.flag]) return false;
      if (c.notFlag && flags[c.notFlag]) return false;
      return true;
    } };
    const r = new DialogueRunner(STORY, h);
    r.open("cunzhang_root");
    return r.visibleChoices.map((c) => c.text);
  };
  const c0 = cVis({});
  ok(!c0.some((t) => t.includes("私炼禁丹")), "无玄机子flag时村长不提禁丹义举");
  const cR = cVis({ xuanji_reported: true });
  ok(cR.some((t) => t.includes("私炼禁丹")), "举报后村长提及禁丹义举分支");
  const cH = cVis({ qdone_q_xuanji_herb: true });
  ok(cH.some((t) => t.includes("玄机子道长")), "相助后村长提及助道长分支");
})();

// ================= Q. P3-7 多周目（NG+）元进度 =================
section("Q. P3-7 多周目-元进度");
(function () {
  const ng = require("../src/core/ngplus.ts");
  eq(ng.carryover(0).bonusExp, 0, "周目0无修为加成");
  eq(ng.carryover(0).expMul, 1, "周目0效率倍率=1");
  const c2 = ng.carryover(2);
  eq(c2.bonusExp, 600, "周目2修为加成=600");
  eq(c2.bonusStones, 300, "周目2灵石加成=300");
  ok(Math.abs(c2.expMul - 1.2) < 1e-9, "周目2效率倍率=1.2");
  // grantClear 纯函数（不依赖存储）
  const g1 = ng.grantClear({ ngPlus: 0, daoHen: 0, clears: 0 });
  eq(g1.ngPlus, 1, "首次通关周目+1");
  eq(g1.daoHen, 50, "首次通关道痕+50");
  eq(g1.clears, 1, "通关次数=1");
  eq(ng.grantClear(g1).ngPlus, 2, "二次通关周目=2");
  // loadMeta/saveMeta 仅在存在 localStorage 时做往返（避免 node 无存储/旧档干扰）
  if (typeof localStorage !== "undefined") {
    ng.saveMeta({ ngPlus: 3, daoHen: 150, clears: 3 });
    const back = ng.loadMeta();
    eq(back.ngPlus, 3, "元进度存档往返-周目");
    eq(back.daoHen, 150, "元进度存档往返-道痕");
  } else {
    ok(true, "（node 无 localStorage，跳过存档往返）");
  }
  // Player.expMulNg 使修为获取按倍率缩放
  const { Player } = require("../src/entities/Player.ts");
  const p = new Player({ gx: 11, gy: 11, nickname: "试", seed: 1 });
  const b1 = p.exp; p.gainExp(100); const d1 = p.exp - b1;
  p.expMulNg = 2;
  const b2 = p.exp; p.gainExp(100); const d2 = p.exp - b2;
  ok(Math.abs(d2 - d1 * 2) < 1, "expMulNg 使修为获取翻倍");
})();

// ================= R. P3-6 社交实时化（纯逻辑） =================
section("R. P3-6 社交实时化");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const p = new Player({ gx: 11, gy: 11, nickname: "试", seed: 1 });
  // 收件箱缓存与领取标记
  p.syncMailbox([
    { id: 1, fromName: "道友甲", title: "t", body: "b", reward: { exp: 120, stones: 40 }, read: false, claimed: false, createdAt: 1 },
    { id: 2, fromName: "道友乙", title: "t2", body: "b2", reward: { items: [{ id: "huixue-dan", n: 2 }] }, read: true, claimed: true, createdAt: 2 },
  ]);
  eq(p.mailbox.length, 2, "收件箱同步 2 封");
  const before = p.exp;
  p.applyMailReward(p.mailbox[0].reward);
  ok(p.exp - before === 120, "applyMailReward 加修为");
  const beforeStones = p.stones;
  p.applyMailReward({ stones: 40 });
  ok(p.stones - beforeStones === 40, "applyMailReward 加灵石");
  const beforeItem = p.countItem("huixue-dan");
  p.applyMailReward({ items: [{ id: "huixue-dan", n: 2 }] });
  ok(p.countItem("huixue-dan") - beforeItem === 2, "applyMailReward 加物品");
  p.markMailClaimed(1);
  ok(p.mailbox[0].claimed === true, "markMailClaimed 标记已领");
  // 序列化往返
  const s = p.serialize();
  eq(Array.isArray(s.mailbox), true, "serialize 含 mailbox");
  eq(s.mailbox.length, 2, "mailbox 序列化数量正确");
  const p2 = new Player({ gx: 0, gy: 0, nickname: "x", seed: 2 });
  p2.applySave(s, { x: 0, y: 0 });
  eq(p2.mailbox.length, 2, "applySave 恢复 mailbox");
  ok(p2.mailbox[0].claimed === true, "恢复后claimed状态保留");
})();

// ================= S. P3-8 运营/赛季（纯逻辑） =================
section("S. P3-8 运营/赛季");
(function () {
  const { Player } = require("../src/entities/Player.ts");
  const p = new Player({ gx: 11, gy: 11, nickname: "试", seed: 1 });
  p.seasonBest = 7654;
  const s = p.serialize();
  eq(typeof s.seasonBest, "number", "serialize 含 seasonBest");
  eq(s.seasonBest, 7654, "seasonBest 序列化值正确");
  const p2 = new Player({ gx: 0, gy: 0, nickname: "x", seed: 2 });
  p2.applySave(s, { x: 0, y: 0 });
  eq(p2.seasonBest, 7654, "applySave 恢复 seasonBest");
})();

// ================= Q. 演出层：破防/处决/元素反应/Boss阶段屏闪 =================
section("Q. 演出层：破防/处决/元素反应/Boss阶段屏闪");
(function () {
  const { Game } = require("../src/Game.ts");
  const { Monster } = require("../src/entities/Monster.ts");
  const { getMonster } = require("../src/data/monsters.ts");
  const { getSkill } = require("../src/data/skills.ts");

  const game = new Game();
  game.start();
  game.startNewGame("演出测试");
  let guard = 0;
  while (game.dialogue.isOpen && guard++ < 60) game.dlgBox.onAdvance(0);

  const px = Math.floor(game.player.gx);
  const py = Math.floor(game.player.gy);

  // —— 破防：韧性被打空进入硬直 ——
  const m1 = new Monster(getMonster("bi-jing-lang"), px + 2, py, 11, 2);
  m1.maxHp = 100000; m1.hp = 100000; m1.maxPoise = 50; m1.poise = 50;
  game.monsters.push(m1);
  game.map.addActor(m1.rig.root);
  game.player.learnSkill("wanjian");
  const wanjian = getSkill("wanjian");
  const poise0 = m1.poise;
  game.applySkillDamage(wanjian, { gx: m1.gx, gy: m1.gy }, m1);
  ok(m1.poise < poise0, "重击削减韧性");
  let g2 = 0;
  while (!m1.broken && g2++ < 10) game.applySkillDamage(wanjian, { gx: m1.gx, gy: m1.gy }, m1);
  ok(m1.broken, "连续重击触发破防");
  ok(game.timeScale < 1, "破防触发慢动作（timeScale）");
  m1.update(3.2, game.player);
  ok(!m1.broken && m1.poise === m1.maxPoise, "破防结束恢复韧性");

  // —— 处决：破防 + 残血 → 演出并结算 ——
  const m2 = new Monster(getMonster("bi-jing-lang"), px + 3, py, 12, 2);
  game.monsters.push(m2);
  game.map.addActor(m2.rig.root);
  m2.broken = true; m2.brokenT = 3; m2.hp = 5;
  game.applySkillDamage(wanjian, { gx: m2.gx, gy: m2.gy }, m2);
  ok(!m2.alive && !m2.broken, "破防残血被处决（瞬杀且消耗破防）");
  ok(game.timeScale < 1, "处决触发慢动作（timeScale）");

  // —— 元素反应：火 + 雷 = 感电 ——
  const m3 = new Monster(getMonster("bi-jing-lang"), px + 4, py, 13, 2);
  game.monsters.push(m3);
  game.map.addActor(m3.rig.root);
  game.player.learnSkill("huoqiu");
  game.player.learnSkill("leiting");
  const fire = getSkill("huoqiu");
  const thunder = getSkill("leiting");
  game.applySkillDamage(fire, { gx: m3.gx, gy: m3.gy }, m3);
  ok(m3.hasStatus("burn"), "火系技能附着灼烧");
  // 邻近敌人（感电连锁目标，m6 紧邻 m3，m7 紧邻 m6 供多跳验证）
  const m6 = new Monster(getMonster("bi-jing-lang"), px + 4, py + 1, 17, 2);
  game.monsters.push(m6);
  game.map.addActor(m6.rig.root);
  const m7 = new Monster(getMonster("bi-jing-lang"), px + 4, py + 2, 18, 2);
  game.monsters.push(m7);
  game.map.addActor(m7.rig.root);
  const hp6 = m6.hp, hp7 = m7.hp;
  game.applySkillDamage(thunder, { gx: m3.gx, gy: m3.gy }, m3);
  ok(m3.hasStatus("shock"), "雷系击中灼烧目标触发感电");
  ok(m6.hp < hp6 && m6.hasStatus("shock"), "感电连锁：电弧溅射至邻近敌人");
  ok(m7.hp < hp7 && m7.hasStatus("shock"), "感电连锁：电弧依次跳跃至多跳敌人");

  // —— 元素反应：水 + 火/雷 = 蒸发/导电 ——
  const m4 = new Monster(getMonster("bi-jing-lang"), px + 5, py, 15, 2);
  game.monsters.push(m4);
  game.map.addActor(m4.rig.root);
  game.player.learnSkill("shui-jian");
  const water = getSkill("shui-jian");
  game.applySkillDamage(water, { gx: m4.gx, gy: m4.gy }, m4);
  ok(m4.hasStatus("wet"), "水系技能附着湿润");
  const hpV = m4.hp;
  game.applySkillDamage(fire, { gx: m4.gx, gy: m4.gy }, m4);
  ok(!m4.hasStatus("wet") && m4.hasStatus("burn"), "火击湿润目标触发蒸发（转灼烧）");
  ok(m4.hp < hpV, "蒸发造成额外伤害");
  const m5 = new Monster(getMonster("bi-jing-lang"), px + 6, py, 16, 2);
  game.monsters.push(m5);
  game.map.addActor(m5.rig.root);
  game.applySkillDamage(water, { gx: m5.gx, gy: m5.gy }, m5);
  game.applySkillDamage(thunder, { gx: m5.gx, gy: m5.gy }, m5);
  ok(!m5.hasStatus("wet") && m5.hasStatus("shock"), "雷击湿润目标触发导电（转感电）");

  // —— 元素反应：冰 + 火/雷 = 融化/超导 ——
  const m8 = new Monster(getMonster("bi-jing-lang"), px + 7, py, 19, 2);
  game.monsters.push(m8);
  game.map.addActor(m8.rig.root);
  game.player.learnSkill("hanbing");
  const ice = getSkill("hanbing");
  game.applySkillDamage(ice, { gx: m8.gx, gy: m8.gy }, m8);
  ok(m8.hasStatus("chill"), "冰系技能附着冰封（chill）");
  const hpM = m8.hp;
  game.applySkillDamage(fire, { gx: m8.gx, gy: m8.gy }, m8);
  ok(!m8.hasStatus("chill") && m8.hasStatus("burn"), "火击冰封目标触发融化（转灼烧）");
  ok(m8.hp < hpM, "融化造成额外爆发伤害");
  const m9 = new Monster(getMonster("bi-jing-lang"), px + 8, py, 20, 2);
  game.monsters.push(m9);
  game.map.addActor(m9.rig.root);
  game.applySkillDamage(ice, { gx: m9.gx, gy: m9.gy }, m9);
  game.applySkillDamage(thunder, { gx: m9.gx, gy: m9.gy }, m9);
  ok(!m9.hasStatus("chill") && m9.hasStatus("slow"), "雷击冰封目标触发超导（麻痹减速）");

  // —— 反应连锁：灼烧 + 感电 = 超载 ——
  const m10 = new Monster(getMonster("bi-jing-lang"), px + 9, py, 21, 2);
  game.monsters.push(m10);
  game.map.addActor(m10.rig.root);
  const m11 = new Monster(getMonster("bi-jing-lang"), px + 9, py + 1, 22, 2);
  game.monsters.push(m11);
  game.map.addActor(m11.rig.root);
  game.applySkillDamage(fire, { gx: m10.gx, gy: m10.gy }, m10); // 附着灼烧
  const hpO = m10.hp, hp11 = m11.hp;
  game.applySkillDamage(thunder, { gx: m10.gx, gy: m10.gy }, m10); // 感电 + 触发超载
  ok(m10.hasStatus("shock") && !m10.hasStatus("burn"), "灼烧+感电共存触发超载（消耗灼烧）");
  ok(m10.hp < hpO, "超载造成额外爆发伤害");
  ok(m11.hp < hp11 && m11.hasStatus("shock"), "超载径向溅射波及邻近敌人（并施加感电）");

  // —— 元素反应：水 + 冰 = 冻结 ——
  const m12 = new Monster(getMonster("bi-jing-lang"), px + 10, py, 23, 2);
  game.monsters.push(m12);
  game.map.addActor(m12.rig.root);
  game.applySkillDamage(water, { gx: m12.gx, gy: m12.gy }, m12); // 附着湿润
  game.applySkillDamage(ice, { gx: m12.gx, gy: m12.gy }, m12);    // 冰击湿润 → 冻结
  ok(m12.hasStatus("stun") && !m12.hasStatus("wet") && !m12.hasStatus("chill"), "水+冰触发冻结（定身，消耗湿润与冰封）");

  // —— 碎冰：已冻结目标被重击 → 碎裂（+ 连锁邻近冻结目标） ——
  const m13 = new Monster(getMonster("bi-jing-lang"), px + 11, py, 24, 2);
  m13.maxHp = 100000; m13.hp = 100000;
  game.monsters.push(m13);
  game.map.addActor(m13.rig.root);
  // m14 紧邻 m13 但位于 wanjian 范围(2.2) 之外、碎冰连锁半径(3) 之内，仅能被连锁波及
  const m14 = new Monster(getMonster("bi-jing-lang"), px + 11, py + 3, 25, 2);
  m14.maxHp = 100000; m14.hp = 100000;
  game.monsters.push(m14);
  game.map.addActor(m14.rig.root);
  game.applySkillDamage(water, { gx: m13.gx, gy: m13.gy }, m13); // 附着湿润
  game.applySkillDamage(ice, { gx: m13.gx, gy: m13.gy }, m13);    // 冻结
  game.applySkillDamage(water, { gx: m14.gx, gy: m14.gy }, m14); // 附着湿润
  game.applySkillDamage(ice, { gx: m14.gx, gy: m14.gy }, m14);    // 冻结
  ok(m13.hasStatus("frozen") && m14.hasStatus("frozen"), "冻结施加 frozen 标记");
  const hpS = m13.hp;
  game.applySkillDamage(wanjian, { gx: m13.gx, gy: m13.gy }, m13); // 重击 m13 → 碎冰
  ok(m13.hp < hpS, "重击碎冰造成额外伤害");
  ok(!m13.hasStatus("frozen") && !m13.hasStatus("stun"), "碎冰解除冻结与定身");
  ok(!m14.hasStatus("frozen") && !m14.hasStatus("stun"), "碎冰连锁：波及邻近冻结目标");

  // —— 碎冰进阶：冻结 + 火 = 融碎；冻结 + 雷 = 超导碎 ——
  const m17 = new Monster(getMonster("bi-jing-lang"), px + 14, py, 28, 2);
  m17.maxHp = 100000; m17.hp = 100000;
  game.monsters.push(m17);
  game.map.addActor(m17.rig.root);
  game.applySkillDamage(water, { gx: m17.gx, gy: m17.gy }, m17); // 湿润
  game.applySkillDamage(ice, { gx: m17.gx, gy: m17.gy }, m17);    // 冻结
  const hp17 = m17.hp;
  game.applySkillDamage(fire, { gx: m17.gx, gy: m17.gy }, m17);   // 火击冻结 → 融碎
  ok(!m17.hasStatus("frozen") && m17.hp < hp17, "冻结+火触发融碎（解除冻结并额外伤害）");

  const m18 = new Monster(getMonster("bi-jing-lang"), px + 15, py, 29, 2);
  m18.maxHp = 100000; m18.hp = 100000;
  game.monsters.push(m18);
  game.map.addActor(m18.rig.root);
  game.applySkillDamage(water, { gx: m18.gx, gy: m18.gy }, m18); // 湿润
  game.applySkillDamage(ice, { gx: m18.gx, gy: m18.gy }, m18);    // 冻结
  const hp18 = m18.hp;
  game.applySkillDamage(thunder, { gx: m18.gx, gy: m18.gy }, m18); // 雷击冻结 → 超导碎
  ok(!m18.hasStatus("frozen") && m18.hasStatus("slow") && m18.hp < hp18, "冻结+雷触发超导碎（解除冻结、麻痹减速并额外伤害）");

  // —— 护盾结晶：持盾时触发元素反应 → 生成结晶护盾 ——
  game.player.addBuff({ kind: "shield", value: 30, t: 8 });
  const shieldSum = () => game.player.buffs.filter((b) => b.kind === "shield").reduce((s, b) => s + b.value, 0);
  const shBefore = shieldSum();
  const m15 = new Monster(getMonster("bi-jing-lang"), px + 12, py, 26, 2);
  game.monsters.push(m15);
  game.map.addActor(m15.rig.root);
  game.applySkillDamage(fire, { gx: m15.gx, gy: m15.gy }, m15);    // 灼烧
  game.applySkillDamage(thunder, { gx: m15.gx, gy: m15.gy }, m15); // 感电 → 超载 + 结晶
  ok(game.player.shielded && shieldSum() > shBefore, "持盾时元素反应生成结晶护盾（护盾增强）");

  // —— 结晶护盾按元素配色与抗性 ——
  const shBuff = game.player.buffs.find((b) => b.kind === "shield");
  ok(shBuff && shBuff.elems && shBuff.elems.includes("fire"), "结晶护盾记录触发元素（火）");
  ok(game.player.elementAuraColor() === "#ff6a3c", "结晶护盾按元素配色（火=橙）");
  // 抗性：火结晶减免火属性来袭伤害（同种子火怪，rng 一致 → 比较确定）
  game.player.baseDef = 0;
  game.player.blocking = false;
  game.player.buffs.length = 0;
  game.player.hp = game.player.maxHp;
  game.player.addBuff({ kind: "shield", value: 0, t: 8, elems: ["water"] });
  const mF1 = new Monster(getMonster("mo-jing-lang"), px + 20, py, 31, 2); // 火属性怪，种子31
  const hpA = game.player.hp;
  game.damagePlayer(mF1, 1);
  const lossA = hpA - game.player.hp;
  game.player.buffs.length = 0;
  game.player.hp = game.player.maxHp;
  game.player.addBuff({ kind: "shield", value: 0, t: 8, elems: ["fire"] });
  const mF2 = new Monster(getMonster("mo-jing-lang"), px + 21, py, 31, 2); // 同种子 → 同 rng
  const hpB = game.player.hp;
  game.damagePlayer(mF2, 1);
  const lossB = hpB - game.player.hp;
  ok(lossB < lossA, `结晶护盾与来袭元素相同减伤（火结晶抗火：${lossB} < ${lossA}）`);

  // —— 结晶护盾多元素共存与叠层上限（上限 2，超出淘汰最旧） ——
  game.player.buffs.length = 0;
  game.player.addBuff({ kind: "shield", value: 50, t: 8, elems: [] });
  const shC = () => game.player.buffs.find((b) => b.kind === "shield");
  const mk = (gx2, seed) => { const m = new Monster(getMonster("bi-jing-lang"), gx2, py, seed, 2); m.maxHp = 100000; m.hp = 100000; game.monsters.push(m); game.map.addActor(m.rig.root); return m; };
  const mX = mk(px + 22, 33);
  game.applySkillDamage(water, { gx: mX.gx, gy: mX.gy }, mX); // 湿润
  game.applySkillDamage(ice, { gx: mX.gx, gy: mX.gy }, mX);    // 冻结 → 冰结晶
  ok(shC().elems.includes("ice") && shC().elems.length === 1, "首次结晶记录元素（冰）");
  const mY = mk(px + 23, 34);
  game.applySkillDamage(water, { gx: mY.gx, gy: mY.gy }, mY); // 湿润
  game.applySkillDamage(fire, { gx: mY.gx, gy: mY.gy }, mY);   // 蒸发 → 火结晶
  ok(shC().elems.includes("ice") && shC().elems.includes("fire") && shC().elems.length === 2, "多元素共存（冰+火）");
  const mZ = mk(px + 24, 35);
  game.applySkillDamage(water, { gx: mZ.gx, gy: mZ.gy }, mZ); // 湿润
  game.applySkillDamage(thunder, { gx: mZ.gx, gy: mZ.gy }, mZ); // 导电 → 雷结晶（挤出最旧冰）
  ok(shC().elems.includes("fire") && shC().elems.includes("thunder") && !shC().elems.includes("ice") && shC().elems.length === 2, "超出上限挤出最旧元素（冰→雷）");

  // —— 结晶上限可被遗物/境界提升（基础 2 → +1 = 3） ——
  game.player.buffs.length = 0;
  game.player.addBuff({ kind: "shield", value: 50, t: 8, elems: [] });
  game.player.addBuff({ kind: "crystalCap", value: 1, t: 9999 }); // 遗物：结晶·纳元 +1 上限
  const mP = mk(px + 25, 36);
  game.applySkillDamage(water, { gx: mP.gx, gy: mP.gy }, mP); // 湿润
  game.applySkillDamage(ice, { gx: mP.gx, gy: mP.gy }, mP);    // 冻结 → 冰
  const mQ = mk(px + 26, 37);
  game.applySkillDamage(water, { gx: mQ.gx, gy: mQ.gy }, mQ); // 湿润
  game.applySkillDamage(fire, { gx: mQ.gx, gy: mQ.gy }, mQ);   // 蒸发 → 火
  const mR = mk(px + 27, 38);
  game.applySkillDamage(water, { gx: mR.gx, gy: mR.gy }, mR); // 湿润
  game.applySkillDamage(thunder, { gx: mR.gx, gy: mR.gy }, mR); // 导电 → 雷
  ok(shC().elems.includes("ice") && shC().elems.includes("fire") && shC().elems.includes("thunder") && shC().elems.length === 3, "结晶上限+1 后三元素共存（冰+火+雷）");
  ok(game.player.elementAuraColor() === "#e0b3ff", "复合结晶护盾显示复合配色（淡紫）");

  // —— 复合护盾元素共生：冰+火共存 → 周期性"消融"真伤 ——
  game.player.buffs.length = 0;
  game.player.addBuff({ kind: "shield", value: 50, t: 99, elems: ["fire", "ice"] });
  const mSym = new Monster(getMonster("bi-jing-lang"), px + 1, py, 41, 2); // 紧邻玩家（半径内）
  mSym.maxHp = 100000; mSym.hp = 100000;
  game.monsters.push(mSym); game.map.addActor(mSym.rig.root);
  const hpSym0 = mSym.hp;
  for (let i = 0; i < 120; i++) game.tickCrystalSymbiosis(1 / 60); // 模拟 2 秒（周期 1.2s → 约 1 次消融）
  ok(mSym.hp < hpSym0, "冰+火复合护盾周期性触发消融真伤");
  // 单质护盾不触发共生
  game.player.buffs.length = 0;
  game.player.addBuff({ kind: "shield", value: 50, t: 99, elems: ["fire"] });
  const mSym2 = new Monster(getMonster("bi-jing-lang"), px + 1, py, 42, 2);
  mSym2.maxHp = 100000; mSym2.hp = 100000;
  game.monsters.push(mSym2); game.map.addActor(mSym2.rig.root);
  const hpSym2 = mSym2.hp;
  for (let i = 0; i < 120; i++) game.tickCrystalSymbiosis(1 / 60);
  ok(mSym2.hp === hpSym2, "单质护盾不触发元素共生（无周期性真伤）");

  // 雷+水共生 → 周期导电链（真伤 + 范围内施加感电）
  game.player.buffs.length = 0;
  game.player.addBuff({ kind: "shield", value: 50, t: 99, elems: ["thunder", "water"] });
  const mSym3 = new Monster(getMonster("bi-jing-lang"), px + 0.5, py, 43, 2); // 最近 → 作为导电链起点
  mSym3.maxHp = 100000; mSym3.hp = 100000;
  game.monsters.push(mSym3); game.map.addActor(mSym3.rig.root);
  const hpSym3 = mSym3.hp;
  for (let i = 0; i < 120; i++) game.tickCrystalSymbiosis(1 / 60);
  ok(mSym3.hp < hpSym3, "雷+水复合护盾周期性触发导电链真伤");
  ok(mSym3.hasStatus("shock"), "雷+水共生导电链对范围内敌人施加感电");
  // 雷+火共生 → 周期超载（真伤 + 爆发 + 范围环；注：原"感电"已升级为"超载"，感电仍作为基础反应发生）
  game.player.buffs.length = 0;
  game.player.addBuff({ kind: "shield", value: 50, t: 99, elems: ["fire", "thunder"] });
  const mSym4 = new Monster(getMonster("bi-jing-lang"), px + 0.5, py, 44, 2);
  mSym4.maxHp = 100000; mSym4.hp = 100000;
  game.monsters.push(mSym4); game.map.addActor(mSym4.rig.root);
  const hpSym4 = mSym4.hp;
  for (let i = 0; i < 120; i++) game.tickCrystalSymbiosis(1 / 60);
  ok(mSym4.hp < hpSym4, "雷+火复合护盾周期性触发超载真伤");

  // 雷+冰共生 → 周期超导（真伤 + 减速 + 链式感电）
  game.player.buffs.length = 0;
  game.player.addBuff({ kind: "shield", value: 50, t: 99, elems: ["thunder", "ice"] });
  const mSym5 = new Monster(getMonster("bi-jing-lang"), px + 0.5, py, 45, 2);
  mSym5.maxHp = 100000; mSym5.hp = 100000;
  game.monsters.push(mSym5); game.map.addActor(mSym5.rig.root);
  const hpSym5 = mSym5.hp;
  for (let i = 0; i < 120; i++) game.tickCrystalSymbiosis(1 / 60);
  ok(mSym5.hp < hpSym5, "雷+冰复合护盾周期性触发超导真伤");
  ok(mSym5.hasStatus("slow"), "雷+冰共生对范围内敌人施加减速（超导）");
  // 水+冰共生 → 周期冻结（真伤 + 冻结；火+冰已用于"消融"，冻结改用更贴合的水+冰配对）
  game.player.buffs.length = 0;
  game.player.addBuff({ kind: "shield", value: 50, t: 99, elems: ["water", "ice"] });
  const mSym6 = new Monster(getMonster("bi-jing-lang"), px + 0.5, py, 46, 2);
  mSym6.maxHp = 100000; mSym6.hp = 100000;
  game.monsters.push(mSym6); game.map.addActor(mSym6.rig.root);
  const hpSym6 = mSym6.hp;
  for (let i = 0; i < 120; i++) game.tickCrystalSymbiosis(1 / 60);
  ok(mSym6.hp < hpSym6, "水+冰复合护盾周期性触发冻结真伤");
  ok(mSym6.hasStatus("frozen"), "水+冰共生对范围内敌人施加冻结");

  // 火+水共生 → 周期蒸发蒸伤（真伤 + 范围内灼烧 DoT）
  game.player.buffs.length = 0;
  game.player.addBuff({ kind: "shield", value: 50, t: 99, elems: ["fire", "water"] });
  const mSym7 = new Monster(getMonster("bi-jing-lang"), px + 0.5, py, 47, 2);
  mSym7.maxHp = 100000; mSym7.hp = 100000;
  game.monsters.push(mSym7); game.map.addActor(mSym7.rig.root);
  const hpSym7 = mSym7.hp;
  for (let i = 0; i < 120; i++) game.tickCrystalSymbiosis(1 / 60);
  ok(mSym7.hp < hpSym7, "火+水复合护盾周期性触发蒸发蒸伤");
  ok(mSym7.hasStatus("burn"), "火+水共生对范围内敌人施加灼烧（蒸伤）");

  // 火+土共生 → 周期护盾反震（真伤 + 范围内震晕）
  game.player.buffs.length = 0;
  game.player.addBuff({ kind: "shield", value: 50, t: 99, elems: ["fire", "earth"] });
  const mSym8 = new Monster(getMonster("bi-jing-lang"), px + 0.5, py, 48, 2);
  mSym8.maxHp = 100000; mSym8.hp = 100000;
  game.monsters.push(mSym8); game.map.addActor(mSym8.rig.root);
  const hpSym8 = mSym8.hp;
  for (let i = 0; i < 120; i++) game.tickCrystalSymbiosis(1 / 60);
  ok(mSym8.hp < hpSym8, "火+土复合护盾周期性触发反震真伤");
  ok(mSym8.hasStatus("stun"), "火+土共生对范围内敌人施加震晕（反震）");
  // 雷+土共生 → 周期麻痹（真伤 + 范围内电击定身）
  game.player.buffs.length = 0;
  game.player.addBuff({ kind: "shield", value: 50, t: 99, elems: ["thunder", "earth"] });
  const mSym9 = new Monster(getMonster("bi-jing-lang"), px + 0.5, py, 49, 2);
  mSym9.maxHp = 100000; mSym9.hp = 100000;
  game.monsters.push(mSym9); game.map.addActor(mSym9.rig.root);
  const hpSym9 = mSym9.hp;
  for (let i = 0; i < 120; i++) game.tickCrystalSymbiosis(1 / 60);
  ok(mSym9.hp < hpSym9, "雷+土复合护盾周期性触发麻痹真伤");
  ok(mSym9.hasStatus("stun"), "雷+土共生对范围内敌人施加麻痹定身");

  // 水+土共生 → 周期泥沼减速（真伤 + 范围内减速）
  game.player.buffs.length = 0;
  game.player.addBuff({ kind: "shield", value: 50, t: 99, elems: ["water", "earth"] });
  const mSym10 = new Monster(getMonster("bi-jing-lang"), px + 0.5, py, 50, 2);
  mSym10.maxHp = 100000; mSym10.hp = 100000;
  game.monsters.push(mSym10); game.map.addActor(mSym10.rig.root);
  const hpSym10 = mSym10.hp;
  for (let i = 0; i < 120; i++) game.tickCrystalSymbiosis(1 / 60);
  ok(mSym10.hp < hpSym10, "水+土复合护盾周期性触发泥沼真伤");
  ok(mSym10.hasStatus("slow"), "水+土共生对范围内敌人施加减速（泥沼）");
  // 冰+土共生 → 周期冻土（真伤 + 范围内冻结）
  game.player.buffs.length = 0;
  game.player.addBuff({ kind: "shield", value: 50, t: 99, elems: ["ice", "earth"] });
  const mSym11 = new Monster(getMonster("bi-jing-lang"), px + 0.5, py, 51, 2);
  mSym11.maxHp = 100000; mSym11.hp = 100000;
  game.monsters.push(mSym11); game.map.addActor(mSym11.rig.root);
  const hpSym11 = mSym11.hp;
  for (let i = 0; i < 120; i++) game.tickCrystalSymbiosis(1 / 60);
  ok(mSym11.hp < hpSym11, "冰+土复合护盾周期性触发冻土真伤");
  ok(mSym11.hasStatus("frozen") && mSym11.hasStatus("slow"), "冰+土共生对范围内敌人施加冻结+减速（冻土差异化于冻结）");

  // —— R. BOSS 战元素演出集成（反应 + 结晶 + 共生端到端）——
  {
    const { Game } = require("../src/Game.ts");
    const { Monster } = require("../src/entities/Monster.ts");
    const { getMonster } = require("../src/data/monsters.ts");
    const { getSkill } = require("../src/data/skills.ts");
    const g = new Game();
    g.start();
    g.startNewGame("元素师");
    let gd = 0;
    while (g.dialogue.isOpen && gd++ < 50) g.dlgBox.onAdvance(0);
    const bx = g.player.gx, by = g.player.gy;
    const boss = new Monster(getMonster("fu-hai-jiao"), Math.floor(bx), Math.floor(by), 7, 3); // 覆海蛟 hp 1800
    boss.gx = bx + 1; boss.gy = by;
    g.monsters.push(boss); g.map.addActor(boss.rig.root); g.target = boss;
    g.player.addBuff({ kind: "shield", value: 120, t: 10 }); // 玄水护体式开盾（结晶/共生前置）
    ok(g.player.shielded, "BOSS 战：玩家持盾（结晶/共生前置成立）");
    const hp0 = boss.hp;
    // 水附着 → 火击湿润触发蒸发（结晶 fire）
    g.applySkillDamage(getSkill("xuanbing"), { gx: boss.gx, gy: boss.gy }, boss);
    g.applySkillDamage(getSkill("huoqiu"), { gx: boss.gx, gy: boss.gy }, boss);
    // 再水附着 → 冰击湿润触发冻结（结晶 ice）→ 复合护盾（火+冰=消融）
    g.applySkillDamage(getSkill("xuanbing"), { gx: boss.gx, gy: boss.gy }, boss);
    g.applySkillDamage(getSkill("hanbing"), { gx: boss.gx, gy: boss.gy }, boss);
    const sh = g.player.buffs.find((b) => b.kind === "shield");
    ok(boss.hp < hp0, "BOSS 战：元素反应（蒸发+冻结）造成额外伤害");
    ok(sh && sh.elems && sh.elems.includes("fire") && sh.elems.includes("ice") && sh.elems.length >= 2,
      "BOSS 战：复合结晶护盾形成（火+冰，解锁共生·消融）");
    const hpBeforeSym = boss.hp;
    for (let i = 0; i < 150; i++) g.tickCrystalSymbiosis(1 / 60); // 约 2.5s
    ok(boss.hp < hpBeforeSym, "BOSS 战：复合护盾周期性触发共生（消融）真伤");
  }

  // —— 元素光环：不同元素附着显示对应颜色 ——
  const m16 = new Monster(getMonster("bi-jing-lang"), px + 13, py, 27, 2);
  game.monsters.push(m16);
  game.map.addActor(m16.rig.root);
  ok(m16.elementAuraColor() === null, "无元素附着时光环隐藏（null）");
  game.applySkillDamage(water, { gx: m16.gx, gy: m16.gy }, m16); // 湿润
  ok(m16.elementAuraColor() === "#3aa0ff", "湿润 → 蓝色光环");
  game.applySkillDamage(fire, { gx: m16.gx, gy: m16.gy }, m16);  // 蒸发：去湿润转灼烧
  ok(m16.elementAuraColor() === "#ff6a3c", "蒸发后 → 橙色灼烧光环");

  // —— Boss 多阶段屏闪配色 ——
  const boss = new Monster(getMonster("mo-zun"), px + 1, py, 14, 5);
  game.monsters.push(boss);
  game.map.addActor(boss.rig.root);
  boss.hp = Math.round(boss.maxHp * 0.5);
  game.updateZhuoBossPhases();
  ok(game.flashLayer.visible, "Boss 阶段切换触发屏闪");
  ok((game.bossBannerText.text || "").indexOf("狂暴") >= 0, "阶段横幅显示狂暴");

  // —— S. 点击定位换算（CSS→舞台设计坐标 + 世界↔画布反演）——
  {
    const { clientToStage } = require("../src/core/Input.ts");
    const { IsoMap, Camera, gridToScreen, screenToGrid, TILE_W: TWc, TILE_H: THc } = require("../src/core/IsoMap.ts");

    // 舞台 SCALE_SHOWALL：1600x900 显示 1280x720 → 等比 1.25，无黑边
    let p = clientToStage(800, 450, { left: 0, top: 0, width: 1600, height: 900 }, 1280, 720);
    ok(Math.abs(p.x - 640) < 0.01 && Math.abs(p.y - 360) < 0.01, "点击定位：CSS→舞台 等比缩放 1.25 换算正确");
    // 居中黑边：1920x720 → scale=1，左右各 320 黑边
    p = clientToStage(960, 360, { left: 0, top: 0, width: 1920, height: 720 }, 1280, 720);
    ok(Math.abs(p.x - 640) < 0.01 && Math.abs(p.y - 360) < 0.01, "点击定位：CSS→舞台 居中黑边补偿正确");
    // 画布自身偏移（left/top）
    p = clientToStage(110, 60, { left: 10, top: 20, width: 1280, height: 720 }, 1280, 720);
    ok(Math.abs(p.x - 100) < 0.01 && Math.abs(p.y - 40) < 0.01, "点击定位：CSS→舞台 画布偏移扣除正确");

    // 世界 → 画布 → pick 应严格还原网格（root 变换反演，等距投影）
    const im = Object.create(IsoMap.prototype);
    im.zoom = 3;
    const cam = new Camera();
    cam.x = 120; cam.y = 80; cam.zoomMul = 1;
    const tgx = 12, tgy = 7;
    const w0 = gridToScreen(tgx, tgy); // 等距投影：直接返回瓦片菱形中心
    const pivot = { x: 300, y: 200 };
    const Z = im.zoom * cam.zoomMul;
    const rx = -cam.x * im.zoom - pivot.x * (Z - im.zoom);
    const ry = -cam.y * im.zoom - pivot.y * (Z - im.zoom);
    const back = im.pick(Z * w0.x + rx, Z * w0.y + ry, cam, pivot);
    ok(Math.abs(back.gx - tgx) < 1e-6 && Math.abs(back.gy - tgy) < 1e-6, "点击定位：点击瓦片中心→pick 精确还原该格");
    // 等距逆变换：screenToGrid 为 gridToScreen 之逆，直接从中心还原该格
    const naive = screenToGrid(w0.x, w0.y);
    ok(Math.abs(naive.gx - tgx) < 1e-6 && Math.abs(naive.gy - tgy) < 1e-6, "点击定位：等距逆变换下点击瓦片中心精确命中该格");

    // 推拉镜头期间（zoomMul≠1 + 玩家锚点）也必须精确
    cam.zoomMul = 1.4;
    const Z2 = im.zoom * cam.zoomMul;
    const rx2 = -cam.x * im.zoom - pivot.x * (Z2 - im.zoom);
    const ry2 = -cam.y * im.zoom - pivot.y * (Z2 - im.zoom);
    const back2 = im.pick(Z2 * w0.x + rx2, Z2 * w0.y + ry2, cam, pivot);
    ok(Math.abs(back2.gx - tgx) < 1e-6 && Math.abs(back2.gy - tgy) < 1e-6, "点击定位：推拉镜头(zoomMul=1.4)下仍精确反演");
  }

  // —— Y. 俯视投影 · 光标往返 · 全图可达（结界校验）——
  {
    const { gridToScreen, screenToGrid, TILE_W, TILE_H, nearestWalkable } = require("../src/core/IsoMap.ts");
    const { OPEN_MAP } = require("../src/data/town_open.ts");
    const { isWalkable } = require("../src/data/map.ts");

    // 等距菱形瓦片：宽:高 = 2:1
    ok(TILE_W === 2 * TILE_H, "等距：瓦片为 2:1 菱形（TILE_W === 2*TILE_H）");

    // pick 往返：对每个格中心做 pick，应精确还原该格（光标准确）
    let rtOk = true;
    for (let gy = 0; gy < OPEN_MAP.h; gy++) {
      for (let gx = 0; gx < OPEN_MAP.w; gx++) {
        const w = gridToScreen(gx, gy);
        const c = screenToGrid(w.x, w.y);
        if (c.gx !== gx || c.gy !== gy) rtOk = false;
      }
    }
    ok(rtOk, "等距：每格中心 pick 往返精确命中该格（光标准确）");

    // 全图可达：从出生点 BFS，所有可走格均可达（无内部结界）
    const sp = OPEN_MAP.playerSpawn;
    const seen = new Set([sp.gx + "," + sp.gy]);
    const q = [[sp.gx, sp.gy]];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= OPEN_MAP.w || ny >= OPEN_MAP.h) continue;
        if (OPEN_MAP.blocked[ny][nx]) continue;
        const k = nx + "," + ny;
        if (seen.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    let allReach = true;
    for (let gy = 0; gy < OPEN_MAP.h; gy++) for (let gx = 0; gx < OPEN_MAP.w; gx++) {
      if (OPEN_MAP.blocked[gy][gx]) continue;
      if (!seen.has(gx + "," + gy)) allReach = false;
    }
    ok(allReach, "俯视：开放世界全部可走格从出生点 BFS 可达（无内部结界）");

    // 越界/阻挡点击：nearestWalkable 必有吸附结果（角色必有响应）
    const oob = nearestWalkable(OPEN_MAP, -5, -5, 10);
    ok(!!oob && isWalkable(oob.gx, oob.gy, OPEN_MAP), "点击地图外虚空：吸附到最近可走格（角色必有响应）");
    const onTree = nearestWalkable(OPEN_MAP, 6, 3, 10); // (6,3) 为树（阻挡）
    ok(!!onTree && isWalkable(onTree.gx, onTree.gy, OPEN_MAP), "点击树上：吸附到最近可走格");
  }

  // —— T. 建筑形态样式（仙剑风绘制分派）——
  {
    const { BUILDINGS, getBuilding } = require("../src/data/buildings.ts");
    const st = {};
    for (const b of BUILDINGS) st[b.id] = b.style;
    ok(st.hut === "hall" && st["dan-fang"] === "hall", "茅屋/丹房为殿宇形态（飞檐翘角）");
    ok(st["ling-tian"] === "field", "灵田为田垄形态（不套飞檐）");
    ok(st.wall === "wall", "石墙为墙垣形态（不套飞檐）");
    ok(BUILDINGS.every((b) => !!getBuilding(b.id)), "建筑表 id 均可反查");
  }

  // —— U. 采集点可达性（定位修正后能走到采集点格 → 按 F 可采）——
  {
    const { gridToScreen: g2s, TILE_W: TWu, TILE_H: THu } = require("../src/core/IsoMap.ts");
    game.enterZone("ch1");
    const gs = game.activeGathers || [];
    ok(gs.length > 0, "落霞镇存在可采集点");
    const g0 = gs[0];
    const w = g2s(g0.gx, g0.gy);
    const cwx = w.x, cwy = w.y; // 等距投影：gridToScreen 已返回瓦片菱形中心
    const s = game.worldToScreen(cwx, cwy);
    const back = game.map.pick(s.x, s.y, game.cam, { x: game.player.px, y: game.player.py });
    ok(Math.floor(back.gx) === g0.gx && Math.floor(back.gy) === g0.gy,
      "点击采集点标记 → 精确还原该格（否则永远走偏一格，采不到草药）");
  }

  // —— V. 角色点击命中：只有点身体才交互（脚下/头顶空白/身侧均不命中）——
  {
    const { hitSpriteBox } = require("../src/Game.ts");
    const Z = 3, sx = 400, sy = 300; // 某角色脚点屏幕位置
    ok(hitSpriteBox({ x: sx, y: sy - 20 * Z }, sx, sy, Z), "点击身体中部 → 命中（可对话/选目标）");
    ok(hitSpriteBox({ x: sx, y: sy - 50 * Z }, sx, sy, Z), "点击头部 → 命中");
    ok(!hitSpriteBox({ x: sx, y: sy - 70 * Z }, sx, sy, Z), "点击头顶上方空白 → 不命中");
    ok(!hitSpriteBox({ x: sx, y: sy + 10 * Z }, sx, sy, Z), "点击脚下地面 → 不命中");
    ok(!hitSpriteBox({ x: sx + 20 * Z, y: sy - 20 * Z }, sx, sy, Z), "点击身侧空地 → 不命中");
  }

  // —— W. 三界舆图 / 人物志：美术资源接入 ——
  {
    const { ART } = require("../src/core/Assets.ts");
    const { getCast, allCast } = require("../src/data/cast.ts");
    const { WORLD_MAP_LABELS, ZONE_MARKS, REALM_BANDS } = require("../src/ui/WorldMapPanel.ts");
    const { ZONES: ZS } = require("../src/data/zones.ts");

    const urls = Object.keys(ART).map((k) => ART[k]);
    eq(urls.length, 10, "美术资源共 10 项（舆图 1 + 立绘 4 + 透明底抠图 5）");
    ok(urls.every((u) => u.startsWith("art/") && u.endsWith(".png")), "资源路径规范（art/*.png）");
    ok(urls.every((u) => require("../src/core/Assets.ts").artTexture(u) === null),
      "Node 冒烟无 loader → 贴图返回 null 兜底（不阻塞逻辑测试）");
    for (const u of urls) {
      ok(fs.existsSync(path.join(__dirname, "..", "public", u)), `资源文件存在：${u}`);
    }

    eq(allCast().length, 4, "人物卡司 4 位（韩立/南宫婉/银月/厉飞雨）");
    for (const id of ["hanli", "nangongwan", "yinyue", "lifeiyu"]) {
      const c = getCast(id);
      ok(!!c, `卡司存在：${id}`);
      ok(!!c.img && urls.includes(c.img), `${id} 立绘资源已登记`);
      ok(!!c.appearance && !!c.palette && !!c.manner && !!c.marks, `${id} 形象设定四项俱全`);
      ok(/^#[0-9a-f]{6}$/i.test(c.color), `${id} 主色合法：${c.color}`);
    }

    // 三位角色已作为 NPC 进入落霞镇：可走格 + 对话根 + 头像立绘
    for (const id of ["nangongwan", "lifeiyu", "yinyue"]) {
      const n = NPCS.find((x) => x.id === id);
      ok(!!n, `NPC 已注册：${id}`);
      ok(isWalkable(n.gx, n.gy), `${id} 站在可走格`);
      ok(!!STORY[n.dialogue], `${id} 对话根节点存在`);
      ok(!!STORY[n.dialogue].img, `${id} 对话带头像立绘`);
      for (const ch of STORY[n.dialogue].choices || []) {
        ok(!!STORY[ch.to], `${id} 分支目标存在：${ch.to}`);
      }
    }
    // 舆图标注与区域落点齐全
    ok(WORLD_MAP_LABELS.length >= 10, "舆图标注不少于 10 处");
    ok(WORLD_MAP_LABELS.every((l) => l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1), "标注坐标归一化合法");
    for (const z of Object.keys(ZS)) ok(!!ZONE_MARKS[z], `区域在舆图上有落点：${z}`);
    // 三界分层：自上而下仙界 → 灵界 → 人界，区间连续且覆盖 0..1
    eq(REALM_BANDS.length, 3, "舆图分三界");
    ok(REALM_BANDS[0].y0 === 0 && REALM_BANDS[REALM_BANDS.length - 1].y1 === 1, "分层覆盖整幅舆图");
    for (let i = 1; i < REALM_BANDS.length; i++) {
      ok(REALM_BANDS[i].y0 === REALM_BANDS[i - 1].y1, `第 ${i + 1} 层与上一段衔接`);
    }
    // 主要角色 NPC 的立绘与卡司数据同源
    for (const id of ["nangongwan", "lifeiyu", "yinyue"]) {
      const n = NPCS.find((x) => x.id === id);
      ok(!!getCast(id) && n.img === getCast(id).img, `${id} NPC 立绘与卡司数据一致`);
    }
  }
})();

// ================= W. 青玉仙镇（存档预设） =================
section("W. 青玉仙镇（存档预设）");
(function () {
  const { TOWN_MAP_QINGYU, LEGEND_QINGYU } = require("../src/data/town_qingyu.ts");
  const { THEME_ORDER, THEME_LABELS } = require("../src/core/IsoMap.ts");

  const w = TOWN_MAP_QINGYU.w, h = TOWN_MAP_QINGYU.h;
  eq(w, 24, "存档古镇宽 24");
  eq(h, 16, "存档古镇高 16");
  ok(LEGEND_QINGYU.every((r) => r.length === w), "所有行宽一致（buildMap 不抛错）");

  const flat = TOWN_MAP_QINGYU.kinds.flat();
  const count = (k) => flat.filter((c) => c === k).length;
  // —— 边界为一圈贴地对齐围墙（W），无其它围墙 ——
  const perimeter = 2 * w + 2 * h - 4;
  eq(count("wall"), perimeter, `边界围墙完整（共 ${perimeter} 格）`);
  let borderOk = true;
  for (let x = 0; x < w; x++) {
    if (TOWN_MAP_QINGYU.kinds[0][x] !== "wall" || TOWN_MAP_QINGYU.kinds[h - 1][x] !== "wall") borderOk = false;
  }
  for (let y = 0; y < h; y++) {
    if (TOWN_MAP_QINGYU.kinds[y][0] !== "wall" || TOWN_MAP_QINGYU.kinds[y][w - 1] !== "wall") borderOk = false;
  }
  ok(borderOk, "四周均为贴地围墙");

  ok(count("residence") >= 6, `民居 ≥ 6（实际 ${count("residence")}）`);
  eq(count("smith"), 1, "铁匠铺 = 1");
  eq(count("shop"), 1, "药店 = 1");
  eq(count("portal"), 2, "可运作传送阵 = 2");

  const sp = TOWN_MAP_QINGYU.playerSpawn;
  ok(!TOWN_MAP_QINGYU.blocked[sp.gy][sp.gx], "玩家出生点可走");

  // —— 主题：青玉仙镇已登记（作为预设保留）——
  ok(THEME_ORDER.includes("qingyu"), "主题含青玉仙镇（预设）");
  eq(THEME_LABELS["qingyu"], "青玉仙镇·烟火古镇", "青玉仙镇标签正确");
})();

// ================= X. 云荒原野·开放世界（ch1 当前） =================
section("X. 云荒原野·开放世界");
(function () {
  const { OPEN_MAP, LEGEND_OPEN } = require("../src/data/town_open.ts");
  const { NPCS } = require("../src/data/story/chapter1.ts");
  const { ZONES } = require("../src/data/zones.ts");
  const { THEME_ORDER, THEME_LABELS } = require("../src/core/IsoMap.ts");

  const w = OPEN_MAP.w, h = OPEN_MAP.h;
  eq(w, 24, "开放世界宽 24");
  eq(h, 16, "开放世界高 16");
  ok(LEGEND_OPEN.every((r) => r.length === w), "所有行宽一致（buildMap 不抛错）");

  const flat = OPEN_MAP.kinds.flat();
  const count = (k) => flat.filter((c) => c === k).length;
  // —— 开放世界：不含任何围墙 ——
  eq(count("wall"), 0, "开放世界无围墙");
  // —— 功能建筑齐全 ——
  ok(count("residence") >= 6, `民居 ≥ 6（实际 ${count("residence")}）`);
  eq(count("smith"), 1, "铁匠铺 = 1");
  eq(count("shop"), 1, "药店 = 1");
  ok(count("portal") >= 5, `可运作传送阵 ≥ 5（实际 ${count("portal")}）`);

  // —— 玩家出生点可走 ——
  const sp = OPEN_MAP.playerSpawn;
  ok(!OPEN_MAP.blocked[sp.gy][sp.gx], "玩家出生点可走");

  // —— 铁匠铺 / 药店 坐标动态定位，校验 NPC 贴铺 ——
  let fx = -1, fy = -1, yx = -1, yy = -1;
  for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
    if (OPEN_MAP.kinds[gy][gx] === "smith") { fx = gx; fy = gy; }
    if (OPEN_MAP.kinds[gy][gx] === "shop") { yx = gx; yy = gy; }
  }
  ok(fx >= 0 && fy >= 0, "铁匠铺存在");
  ok(yx >= 0 && yy >= 0, "药店存在");
  const smith = NPCS.find((n) => n.service === "forge");
  const herb = NPCS.find((n) => n.id === "yaodian");
  ok(!!smith && !!herb, "铁匠/药师 NPC 存在");
  if (smith && fx >= 0) ok(Math.abs(smith.gx - fx) + Math.abs(smith.gy - fy) === 1, "铁匠立于铁匠铺前");
  if (herb && yx >= 0) ok(Math.abs(herb.gx - yx) + Math.abs(herb.gy - yy) === 1, "药师立于药店前");

  // —— NPC：数量与主线存在，且均站可走格 ——
  ok(NPCS.length >= 15, `NPC ≥ 15（实际 ${NPCS.length}）`);
  const ids = new Set(NPCS.map((n) => n.id));
  ok(ids.has("cunzhang") && ids.has("elder"), "村长/传功长老存在");
  for (const n of NPCS) ok(!OPEN_MAP.blocked[n.gy][n.gx], `NPC ${n.id} 站可走格`);

  // —— 传送闭环：ch1 含通往 ch2/dungeon/zhuomo/rogue 且 spawn 可走 ——
  const tr = ZONES.ch1.transfers;
  ok(tr.some((t) => t.to === "ch2"), "落霞镇含通往乱星海传送阵");
  ok(tr.some((t) => t.to === "dungeon"), "落霞镇含通往秘境传送阵");
  for (const t of tr) ok(!OPEN_MAP.blocked[t.gy][t.gx], `传送阵(${t.gx},${t.gy}) 落点可走`);

  // —— A* 可达：出生点能走到传送阵/铁匠铺前/药店前/村长 ——
  function reachable(sx, sy, tx, ty) {
    if (OPEN_MAP.blocked[sy]?.[sx] || OPEN_MAP.blocked[ty]?.[tx]) return false;
    const seen = new Set([sx + "," + sy]);
    const q = [[sx, sy]];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) return true;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (OPEN_MAP.blocked[ny][nx]) continue;
        const key = nx + "," + ny;
        if (seen.has(key)) continue;
        seen.add(key);
        q.push([nx, ny]);
      }
    }
    return false;
  }
  const cunzhang = NPCS.find((n) => n.id === "cunzhang");
  for (const [label, gx, gy] of [
    ["传送阵(4,4)", 4, 4],
    ["传送阵(11,14)", 11, 14],
    ["传送阵(19,8)", 19, 8],
    ["传送阵(3,9)", 3, 9],
    ["传送阵(1,11)", 1, 11],
    ["铁匠铺前", smith.gx, smith.gy],
    ["药店前", herb.gx, herb.gy],
    ["村长", cunzhang.gx, cunzhang.gy],
  ]) ok(reachable(sp.gx, sp.gy, gx, gy), `A* 从出生点到${label}可达`);

  // —— 主题：云荒原野已登记且为 ch1 默认 ——
  ok(THEME_ORDER.includes("yunhuang"), "主题含云荒原野");
  eq(THEME_LABELS["yunhuang"], "云荒原野·苍茫古镇", "云荒原野标签正确");
  eq(ZONES.ch1.map, OPEN_MAP, "ch1 当前地图为开放世界");
})();

console.log(`\n========== 结果：${passed} 通过 / ${failed} 失败 ==========`);
  if (failed > 0) {
    console.error("失败项：\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

runtime().catch((e) => {
  console.error("运行时测试崩溃：", e);
  process.exit(1);
});
