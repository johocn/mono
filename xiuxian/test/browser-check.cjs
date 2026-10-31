/**
 * 真实 Chromium 端到端验证：启动 / 开局 / 对话点击推进 / 缩放 / 小地图 / 建造 / 移动 / 施法。
 * 需先 `npm run dev`（dev 服务在 5180）。
 * 所有 page.evaluate 用 safeEval 包一层 .catch，避免单次序列化异常中断整段。
 */
"use strict";
// playwright 解析：CI 环境显式安装本项目 playwright；本地回退兄弟项目 laya-brawler 的副本
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("../../laya-brawler/node_modules/playwright"));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  const safeEval = (fn) => page.evaluate(fn).catch((e) => ({ evalErr: (e && e.message) || String(e) }));

  await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  // 暴露 __game 简写，供中后段 safeEval 直接访问（整会话同一实例）
  await page.evaluate(() => { window.g = window.__game; });

  const s1 = await safeEval(() => ({
    hasGame: !!window.__game,
    phase: window.__game && window.__game.phase,
    actors: window.__game && window.__game.map.actorLayer._children.length,
  }));

  await safeEval(() => { window.__game.startNewGame("浏览器验证"); return 1; });
  await page.waitForTimeout(400);
  const s2 = await safeEval(() => ({
    phase: window.__game.phase,
    dialogueOpen: window.__game.dialogue.isOpen,
    playerHp: window.__game.player.hp,
    zoom: window.__game.map.zoom,
    catcherVisible: window.__game.dlgCatcher.visible,
  }));

  // 关键修复：点击对话弹层任意处应推进对话（真实鼠标事件走 catcher）。
  // 先等打字机结束，再连点两次以覆盖「首点补全文字」的情况。
  await page.waitForTimeout(900); // 等开场旁白打字结束
  const beforeAdvance = await safeEval(() => (window.__game.dialogue.current ? window.__game.dialogue.current.id : "none"));
  await page.mouse.click(640, 610); // catcher 捕获层（弹层外）
  await page.waitForTimeout(250);
  await page.mouse.click(640, 610);
  await page.waitForTimeout(250);
  const afterCatcher = await safeEval(() => (window.__game.dialogue.current ? window.__game.dialogue.current.id : "closed"));
  const s2b = {
    点击推进对话: beforeAdvance !== afterCatcher && afterCatcher !== "closed",
    beforeAdvance,
    afterCatcher,
  };

  // 推进剩余开场旁白 + 接任务（cunzhang_test 效果链）
  await safeEval(() => {
    let g = 0;
    while (window.__game.dialogue.isOpen && g++ < 50) window.__game.dlgBox.onAdvance(0);
    window.__game.dialogue.open("cunzhang_test");
    window.__game.openDialogueBox();
    let h = 0;
    while (window.__game.dialogue.isOpen && h++ < 50) window.__game.dlgBox.onAdvance(0);
    return 1;
  });
  const s3 = await safeEval(() => ({
    quest: window.__game.player.quests.active,
    wood: window.__game.player.countItem("wood"),
  }));

  await page.waitForTimeout(3000);
  const s4 = await safeEval(() => ({
    monsters: window.__game.monsters.length,
    cam: [Math.round(window.__game.cam.x), Math.round(window.__game.cam.y)],
    minimap: !!window.__game.minimap && window.__game.minimap.root.visible,
  }));

  // 点击画布 → 寻路移动：用 pick 的精确反演构造点击坐标，确保命中玩家右侧相邻可走格
  const mv = await safeEval(() => {
    const g = window.__game;
    const gx = Math.floor(g.player.gx), gy = Math.floor(g.player.gy);
    let tx = gx + 1, ty = gy;
    if (g.map.map.blocked[ty][tx]) { tx = gx - 1; if (g.map.map.blocked[ty][tx]) return { skip: true }; }
    const ms = g.map;
    const Z = ms.zoom * (g.cam.zoomMul || 1);
    const rootX = -g.cam.x * ms.zoom - g.player.px * (Z - ms.zoom);
    const rootY = -g.cam.y * ms.zoom - g.player.py * (Z - ms.zoom);
    const c = ms.worldOf(tx, ty); // 菱形瓦片中心（等距）
    const sx = Z * c.x + rootX; // 直接命中所选瓦片中心
    const sy = Z * c.y + rootY;
    return { sx: Math.round(sx), sy: Math.round(sy), tx, ty, px0: g.player.px, py0: g.player.py };
  });
  let s5;
  if (mv.skip) {
    s5 = { skip: true };
  } else {
    const before = await safeEval(() => ({ x: window.__game.player.px, y: window.__game.player.py }));
    await page.mouse.click(mv.sx, mv.sy);
    await page.waitForTimeout(500);
    const after = await safeEval(() => ({ x: window.__game.player.px, y: window.__game.player.py, state: window.__game.player.state }));
    s5 = { moved: Math.hypot(after.x - before.x, after.y - before.y) > 1, d: Math.round(Math.hypot(after.x - before.x, after.y - before.y)), camY: mv.camY, py0: mv.py0 };
  }

  // 建造：进入 hut 放置模式 → 放置一格 → 校验
  const sBuild = await safeEval(() => {
    const g = window.__game;
    g.enterBuild("hut");
    const gx = Math.floor(g.player.gx) + 2;
    const gy = Math.floor(g.player.gy);
    g.placeAt(gx, gy);
    const out = { mode: g.buildMode && g.buildMode.kind, built: g.player.built.length, blocked: g.map.map.blocked[gy][gx] };
    g.cancelBuild();
    return out;
  });

  // 施法：放一只狼在嘴边用 1 号技能
  const s6 = await safeEval(() => {
    const g = window.__game;
    const before = g.player.mp;
    const wolf = g.monsters[0];
    if (!wolf) return { skipped: true };
    wolf.gx = g.player.gx + 1;
    wolf.gy = g.player.gy;
    g.target = wolf;
    g.useSkill(0);
    const casting = !!g.player.casting;
    for (let i = 0; i < 40 && g.player.casting; i++) g.debugStep(1 / 60);
    return { casting, mpUsed: before - g.player.mp, wolfHp: wolf.hp, wolfMax: wolf.maxHp };
  });

  // 坊市：真实派发按钮点击（买入一行 → 扣灵石 / 入袋）
  const sShop = await safeEval(() => {
    const g = window.__game;
    g.player.gainStones(500);
    g.openShop();
    const before = { stones: g.player.stones, huixue: g.player.countItem("huixue-dan") };
    const row = g.shopPanel.listLayer._children[0];
    const btn = row ? row._children[3] : null;
    if (btn) btn.event(Laya.Event.CLICK);
    const after = { stones: g.player.stones, huixue: g.player.countItem("huixue-dan") };
    const visible = g.shopPanel.visible;
    g.shopPanel.hide();
    return { visible, before, after, bought: after.huixue > before.huixue && after.stones < before.stones };
  });

  // 炼器：强化青锋剑（灵石 + 妖丹消耗，等级或灵石必变）
  const sForge = await safeEval(() => {
    const g = window.__game;
    g.player.addItem("qingfeng-jian", 1);
    g.player.equip("qingfeng-jian");
    g.player.addItem("yaodan", 20);
    g.player.stones = 2000;
    g.openForge();
    const before = { stones: g.player.stones, lv: g.player.forgeLevel("qingfeng-jian") };
    const row = g.forgePanel.listLayer._children[0];
    const btn = row ? row._children[3] : null;
    if (btn) btn.event(Laya.Event.CLICK);
    const after = { stones: g.player.stones, lv: g.player.forgeLevel("qingfeng-jian") };
    const visible = g.forgePanel.visible;
    g.forgePanel.hide();
    return { visible, before, after, consumed: after.stones < before.stones };
  });

  // 传送往返：切入乱星海 → 校验地图/NPC/相机重建 → 返回落霞镇
  const sTransfer = await safeEval(() => {
    const g = window.__game;
    const before = { zone: g.currentZoneId, mapW: g.currentMap.w, npcIds: g.npcs.map((n) => n.def.id) };
    g.enterZone("ch2");
    const inCh2 = {
      zone: g.currentZoneId,
      mapW: g.currentMap.w,
      isLuan: g.currentMap === g.currentMap && g.npcs.some((n) => n.def.id === "yucun-zhang"),
      noCunzhang: !g.npcs.some((n) => n.def.id === "cunzhang"),
      chapter: g.player.chapter,
      monstersZone: g.currentMap.wolfZone.length,
    };
    for (let i = 0; i < 20; i++) g.debugStep(1 / 60);
    g.enterZone("ch1");
    const back = {
      zone: g.currentZoneId,
      hasCunzhang: g.npcs.some((n) => n.def.id === "cunzhang"),
      killsKept: g.player.kills,
    };
    return { before, inCh2, back };
  });

  // 手感：击退位移 + 顿帧冻结 + 震屏（真实 Laya 运行时）
  const sFeel = await safeEval(() => {
    const g = window.__game;
    g.player.applyKnockback(1, 0, 8);
    const gx0 = g.player.gx;
    g.debugStep(1 / 60);
    const knocked = g.player.gx > gx0;
    g.hitstopT = 0.1;
    g.debugStep(1 / 60);
    const frozen = g.hitstopT < 0.1;
    g.cam.addTrauma(0.5);
    g.cam.follow(100, 100, 120, 120, 0.1);
    const trauma = g.cam.trauma;
    return { knocked, frozen, traumaOk: trauma >= 0 && trauma < 0.5, burst: typeof g.fx.burst === "function" };
  });

  const sMeta = await safeEval(() => {
    const g = window.__game;
    const out = {};
    try {
      out.panels = ["talentPanel", "artifactPanel", "codexPanel", "achievementsPanel", "dailyPanel", "mobile"].every((p) => !!g[p]);
      g.player.addKill("bi-jing-lang");
      out.codex = g.player.codex.monstersKilled.includes("bi-jing-lang");
      out.ach = g.player.achievements.unlocked.includes("first_blood");
      g.player.refreshDaily("2026-10-22");
      out.daily = g.player.daily.ids.length;
      g.talentPanel.toggle();
      out.talentVisible = g.talentPanel.visible;
      g.talentPanel.toggle();
      g.cutscene.play({ title: "测试", lines: ["甲", "乙"] });
      out.cutsceneActive = g.cutscene.active;
      g.cutscene.skip();
      for (let i = 0; i < 40; i++) g.cutscene.update(1 / 60);
      out.cutsceneEnded = !g.cutscene.active;
    } catch (e) { out.err = String(e); }
    return out;
  });

  // 移动端控件：强制显示 → 摇杆驱动位移 → 面板打开时禁用并隐藏（防遮挡面板与背后输入）
  // 置于 P0/P1（含渡劫/飞升过场）之前，避免世界冻结影响移动端输入链路验证
  await safeEval(() => { g.mobile.setVisible(true); return 1; });
  await page.waitForTimeout(150);
  const mobileShown = await safeEval(() => g.mobile.root.visible === true);
  const joyGx0 = await safeEval(() => g.player.gx);
  await safeEval(() => { g.input.setJoystick(1, 0, true); return 1; });
  await page.waitForTimeout(350);
  const joyGx1 = await safeEval(() => g.player.gx);
  await safeEval(() => { g.input.setJoystick(0, 0, false); return 1; });
  const joyMoved = typeof joyGx0 === "number" && typeof joyGx1 === "number" && joyGx1 > joyGx0;
  await safeEval(() => { g.bag.show(); return 1; });
  await page.waitForTimeout(150);
  const mobileHiddenOnPanel = await safeEval(() => g.mobile.root.visible === false && !g.input.joyActive);
  await safeEval(() => { g.bag.hide(); return 1; });
  await page.waitForTimeout(150);
  const mobileBack = await safeEval(() => g.mobile.root.visible === true);

  // P0 新系统：秘境 / 自动战斗 / 战令月卡签到（真实 Laya 运行时）
  const sP0 = await safeEval(() => {
    const g = window.__game;
    const out = {};
    try {
      g.enterZone("dungeon", { gx: 11, gy: 11 });
      out.dungeonZone = g.currentZoneId === "dungeon";
      out.dungeonBoss = g.player.flags["boss_spawned"] === true;
      out.dungeonBuff = g.player.buffs.some((b) => b.kind === "hot");
      g.enterZone("ch1");
      const m = g.map.map;
      const flat = m.kinds.flat();
      const cnt = (k) => flat.filter((c) => c === k).length;
      out.townZone = g.currentZoneId === "ch1";
      out.townSmith = cnt("smith") === 1;
      out.townShop = cnt("shop") === 1;
      out.townResidence = cnt("residence") >= 6;
      out.townPortal = cnt("portal") >= 5;
      out.townNoWall = cnt("wall") === 0;
      out.townNpcForge = g.npcs.some((n) => n.def.service === "forge");
      out.townNpcShop = g.npcs.some((n) => n.def.id === "yaodian");
      // 等距斜切校验：gridToScreen 同时依赖 gx、gy 两轴（存在斜切）；pick 精确往返该格
      const ms = g.map;
      const p20 = ms.worldOf(2, 0), p25 = ms.worldOf(2, 5), p05 = ms.worldOf(0, 5);
      out.isoSkew = p25.x !== p20.x && p25.y !== p05.y && p20.y !== 0;
      const c = ms.worldOf(2, 5); // 菱形瓦片中心
      const Z = ms.zoom * (g.cam.zoomMul || 1);
      const rootX = -g.cam.x * ms.zoom - g.player.px * (Z - ms.zoom);
      const rootY = -g.cam.y * ms.zoom - g.player.py * (Z - ms.zoom);
      const back = ms.pick(Z * c.x + rootX, Z * c.y + rootY, g.cam, { x: g.player.px, y: g.player.py });
      out.pickRoundTrip = back.gx === 2 && back.gy === 5;
      g.toggleAutoFight();
      out.autoOn = g.autoFight === true;
      g.toggleAutoFight();
      out.autoOff = g.autoFight === false;
      g.battlePassPanel.toggle();
      out.bpVisible = g.battlePassPanel.visible;
      g.battlePassPanel.toggle();
      const before = g.player.stones;
      const r = g.player.signIn("2026-10-p0");
      out.signIn = r.ok && g.player.battlePass.signinDays.length === 1;
      out.claimTier = g.player.claimTier(1).ok;
      out.stonesGain = g.player.stones > before;
    } catch (e) { out.err = String(e); }
    return out;
  });

  // P1 新系统：离线收益（真实 Laya 运行时）
  const sP1 = await safeEval(() => {
    const g = window.__game;
    const out = {};
    try {
      const before = g.player.exp;
      g.player.lastSeen = Date.now() - 3600 * 1000; // 模拟离线 1 小时
      const off = g.player.collectOffline(Date.now());
      out.offline = !!off && off.exp > 0 && off.stones > 0;
      out.gained = g.player.exp > before;
      g.player.lastSeen = 0; // 复位，避免影响后续
      // 天劫：跨筑基阈值后应待渡；强制成功结算后已渡且属性加成
      g.player.gainExp(1600);
      out.pending = g.player.pendingTribulation > 0;
      const capped = g.player.realmIndex;
      const r = g.player.resolveTribulation(() => 0); // 强制成功
      out.tribOk = r.success && g.player.brokenRealms[4] === true;
      out.advanced = g.player.realmIndex > capped;
      g.player.exp = before; // 复位修为，避免影响后续
      g.player.brokenRealms = g.player.brokenRealms.map(() => false);
      g.player.pendingTribulation = 0;
      g.player.tribStacks = 0;
      // 炼丹：给足材料后成功产出突破丹
      g.player.addItem("yaowang-neidan", 2); g.player.addItem("jiao-zhu", 3); g.player.addItem("yaodan", 5); g.player.stones += 100;
      const al = g.player.alchemize("r-tupo", () => 0);
      out.alchemy = !!al.ok && al.success && g.player.countItem("tu-po-dan") > 0;
      // 灵兽：开局赠送青鸾出战，加成生效
      out.beast = g.player.activeBeast === "qingluan" && g.player.beasts.includes("qingluan") && g.player.beastBonus().atk > 0;
      // 镇妖塔：进入刷怪 + 层数=1 + 历史最高字段
      g.enterTower();
      out.tower = g.currentZoneId === "tower" && g.monsters.length > 0 && g.player.towerFloor === 1;
      g.exitTower();
      // 竞技场：开局有对手 + 挑战结算改变积分（复用 calcDamage）
      g.openArena();
      out.arena = !!g.currentArenaOpp && typeof g.player.arenaPoints === "number";
      // 飞升：堆满第一世后可触发转世，进入第二世
      g.player.exp = 1e9;
      g.player.brokenRealms = g.player.brokenRealms.map(() => true);
      const canAsc = g.player.canAscend;
      const beforeLife = g.player.realmName;
      g.player.reincarnate();
      out.ascend = canAsc && g.player.reincarnations === 1 && g.player.realmName !== beforeLife;
      // 限时活动：有生效活动 + 登录自动领取 + 击杀倍率
      out.events = g.player.hasActiveEvent("ev_double", Date.now()) && g.player.eventKillMul(Date.now()) === 2;
      const st = g.player.stones;
      g.player.claimLoginEvents(Date.now(), "2026-10-22");
      out.eventLogin = g.player.stones > st;
      // 社交：好友论道 + 邮件领取 + 宗门升级
      const f0 = g.player.stones;
      out.social = g.player.interactFriend("lin", "2026-10-22").ok && g.player.claimMail("m_welcome").ok;
      g.player.sectContribution = 9999;
      out.socialBuild = g.player.upgradeSectBuilding("xiu-lian-tang").ok && g.player.sectExpMul() > 1;
    } catch (e) { out.err = String(e); }
    return out;
  });

  // 坠魔谷：进入 → 魔尊 Boss 出现 → 血阈触发多阶段（enrage + 召唤）
  await safeEval(() => { try { g.enterZone("zhuomo"); } catch (e) { return "enterErr:" + e; } return 1; });
  await page.waitForTimeout(500);
  const zhuoBoss = await safeEval(() => g.monsters.some((m) => m.isBoss && m.def && m.def.demon === true));
  await safeEval(() => { const b = g.monsters.find((m) => m.isBoss); if (b) b.hp = b.maxHp * 0.5; return 1; });
  await page.waitForTimeout(300);
  const zhuoPhase = await safeEval(() => {
    const b = g.monsters.find((m) => m.isBoss);
    return { atk: b ? b.baseAtk : 0, add: g.monsters.some((m) => m.def && m.def.id === "mo-jing-lang") };
  });

  // 秘境 Roguelike：进入 → 地图生成（怪物出现）→ 清剿后出口推进下一层 → 死亡返镇
  await safeEval(() => { try { g.enterRogue({ gx: 11, gy: 11 }); } catch (e) { return "enterErr:" + e; } return 1; });
  await page.waitForTimeout(500);
  const rogueSpawn = await safeEval(() => g.monsters.length > 0 && g.currentZoneId === "rogue");
  await safeEval(() => { g.monsters.forEach((m) => { m.hp = 0; }); return 1; });
  await page.waitForTimeout(300);
  await safeEval(() => { g.player.gx = g.rogueExit.gx + 0.5; g.player.gy = g.rogueExit.gy + 0.5; return 1; });
  await page.waitForTimeout(300);
  const rogueFloor2 = await safeEval(() => g.rogueFloor);
  await safeEval(() => { g.player.hp = 0; return 1; });
  await page.waitForTimeout(300);
  const rogueDeath = await safeEval(() => g.currentZoneId === "ch1");

  // NPC 好感多结局：设满好感 → 结缘触发至交对话节点
  await safeEval(() => { g.player.friends.lin = { affinity: 10, lastDay: "" }; return 1; });
  const friendEnd = await safeEval(() => {
    const r = g.player.requestFriendEnding("lin");
    if (r.ok && r.nodeId) { g.dialogue.open(r.nodeId); return r.endingId; }
    return "err";
  });
  await page.waitForTimeout(200);
  const friendEndOpen = await safeEval(() => g.dialogue.isOpen);

  // —— 美术资源：三界舆图 + 四位角色立绘（G 舆图 / Y 人物志 / 标题角色卡）——
  const artTex = await safeEval(() => {
    const L = window.Laya;
    const get = (u) => {
      try {
        return !!L.loader.getRes(u);
      } catch (e) {
        return false;
      }
    };
    return {
      map: get("art/sanjie-map.png"),
      hanli: get("art/hanli.png"),
      nangongwan: get("art/nangongwan.png"),
      yinyue: get("art/yinyue.png"),
      lifeiyu: get("art/lifeiyu.png"),
    };
  });

  await safeEval(() => {
    g.openWorldMap();
    return 1;
  });
  await page.waitForTimeout(400);
  const wmOpen = await safeEval(() => ({ visible: g.worldMap.visible, blocked: g.anyPanelOpen() }));

  await safeEval(() => {
    g.openCast();
    return 1;
  });
  await page.waitForTimeout(400);
  const castOpen = await safeEval(() => ({ visible: g.castPanel.visible, wmClosed: !g.worldMap.visible }));

  await safeEval(() => {
    g.castPanel.hide();
    g.worldMap.hide();
    return 1;
  });

  // 立绘贴图渲染：玩家与带抠图的 NPC 的 Rig 是否成功绘入 cutout
  await page.waitForTimeout(800);
  const cutTex = await safeEval(() => {
    const L = window.Laya;
    const get = (u) => {
      try {
        return !!L.loader.getRes(u);
      } catch (e) {
        return false;
      }
    };
    return {
      hanli: get("art/cut/hanli.png"),
      nangongwan: get("art/cut/nangongwan.png"),
      yinyue: get("art/cut/yinyue.png"),
      lifeiyu: get("art/cut/lifeiyu.png"),
    };
  });
  const rigReady = await safeEval(() => ({
    player: !!(g.player.rig && g.player.rig.artReady),
    npcWithCut: g.npcs.filter((n) => n.def && n.def.cut).every((n) => n.rig && n.rig.artReady),
  }));

  // 舆图点击传送：解锁 ch2 后从舆图直接传送
  const teleport = await safeEval(() => {
    g.player.unlockedZones.push("ch2");
    g.worldMap.setProgress(g.currentZoneId, g.player.unlockedZones);
    g.teleportFromMap("ch2");
    const to = g.currentZoneId;
    g.enterZone("ch1");
    return to;
  });

  // —— 手机满屏验证：SCALE_NOBORDER 下画布应铺满视口（无黑边），且 HUD 内缩后技能栏落在可见带内 ——
  const phoneErrors = [];
  let phoneCover = false, phoneHudIn = false;
  try {
    const pctx = await browser.newContext({ viewport: { width: 932, height: 430 }, isMobile: true, deviceScaleFactor: 2, hasTouch: true });
    const ppage = await pctx.newPage();
    ppage.on("pageerror", (e) => phoneErrors.push("pageerror: " + e.message));
    await ppage.goto("http://localhost:5180", { waitUntil: "networkidle" });
    await ppage.waitForTimeout(2500);
    await ppage.evaluate(() => { if (window.__game && window.__game.startNewGame) window.__game.startNewGame("手机满屏"); });
    await ppage.waitForTimeout(800);
    const pr = await ppage.evaluate(() => {
      const g = window.__game;
      const cv = document.querySelector("canvas");
      const r = cv.getBoundingClientRect();
      const iw = window.innerWidth, ih = window.innerHeight;
      const cover = r.width >= iw - 1 && r.height >= ih - 1; // 铺满（cover）→ 无黑边
      const si = g.safeInset;
      const slotY = g.skillBar.slots[0].bg.y;
      const hudIn = slotY <= g.viewH - si.bottom + 1 && slotY >= si.top - 1; // 技能栏在可见带内
      return { cover, hudIn };
    });
    phoneCover = !!pr.cover;
    phoneHudIn = !!pr.hudIn;
    await pctx.close();
  } catch (e) { phoneErrors.push("phone: " + (e && e.message)); }
  console.log(
    JSON.stringify(
      { 手机满屏覆盖: phoneCover, 手机HUD内缩: phoneHudIn, 启动: s1, 开局: s2, 点击推进对话: s2b, 任务链: s3, 帧循环: s4, 点击移动: s5, 建造: sBuild, 施法: s6, 坊市: sShop, 炼器: sForge, 传送往返: sTransfer, 手感: sFeel, 元系统: sMeta, P0: sP0, P1: sP1, 坠魔谷Boss: zhuoBoss, 坠魔谷多阶段: zhuoPhase.atk > 70 && zhuoPhase.add, 秘境进入刷怪: rogueSpawn, 秘境层数推进: rogueFloor2 >= 2, 秘境死亡返镇: rogueDeath, NPC结局档位: friendEnd === "lin_soulmate", NPC结局对话弹出: friendEndOpen, 移动端显隐: mobileShown, 摇杆驱动: joyMoved, 面板禁用控件: mobileHiddenOnPanel, 面板关闭恢复: mobileBack, 美术贴图: artTex, 抠图贴图: cutTex, 立绘渲染: rigReady, 舆图传送: teleport === "ch2", 舆图面板: wmOpen, 人物志面板: castOpen, 错误数: errors.length, errors: errors.slice(0, 8) },
      null,
      2,
    ),
  );
  await browser.close();
  if (errors.length > 0) process.exit(1);
})().catch((e) => {
  console.error("BROWSER_CHECK_FAIL:", e && e.stack ? e.stack : e && e.message);
  process.exit(1);
});
