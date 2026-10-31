/**
 * 后端冒烟测试：拉起 server/server.js（子进程，带 --experimental-sqlite），
 * 走通 游客登录 → 云存档读写 → 排行榜提交/查询/去重 → 鉴权与 404。
 */
"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

const PORT = 3299;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
const failures = [];
function ok(cond, name) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(name);
    console.error(`  ✗ ${name}`);
  }
}
function eq(a, b, name) {
  ok(a === b, `${name}（期望 ${b}，实际 ${a}）`);
}

async function waitForServer(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/leaderboard`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function main() {
  // 测试独占：用独立临时库（运行中的 dev 服务可能持锁主库）
  const fs = require("node:fs");
  const testDb = path.join(__dirname, "data", "smoke.db");
  fs.mkdirSync(path.dirname(testDb), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(testDb + suffix, { force: true });
    } catch {
      /* 文件被占用时忽略（内容以最新断言为准的场景由唯一昵称保证） */
    }
  }

  const child = spawn(process.execPath, ["--experimental-sqlite", path.join(__dirname, "..", "server", "server.cjs")], {
    env: { ...process.env, PORT: String(PORT), XIUXIAN_DB: testDb },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  const up = await waitForServer();
  ok(up, "服务器可启动（需要 Node 22 + --experimental-sqlite）");
  if (!up) {
    child.kill();
    console.error(`\n结果：${passed} 通过 / ${failed} 失败`);
    process.exit(1);
  }

  // —— 游客登录 ——
  const loginRes = await fetch(`${BASE}/api/auth/guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: "冒烟修士" }),
  });
  const login = await loginRes.json();
  ok(login.ok === true, "游客登录 ok");
  ok(typeof login.token === "string" && login.token.length >= 16, "返回 token");
  const auth = { Authorization: `Bearer ${login.token}` };

  // —— 云存档写/读 ——
  const saveData = { v: 1, nickname: "冒烟修士", exp: 1605, hp: 100, inv: [["huixue-dan", 3]] };
  const putRes = await fetch(`${BASE}/api/save`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ data: saveData }),
  });
  eq((await putRes.json()).ok, true, "云存档写入");
  const getRes = await fetch(`${BASE}/api/save`, { headers: auth });
  const got = await getRes.json();
  eq(got.ok, true, "云存档读取");
  eq(got.data.exp, 1605, "存档数据一致");

  // 覆盖写
  const put2 = await fetch(`${BASE}/api/save`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { ...saveData, exp: 1700 } }),
  });
  eq((await put2.json()).ok, true, "云存档覆盖写");
  const got2 = await (await fetch(`${BASE}/api/save`, { headers: auth })).json();
  eq(got2.data.exp, 1700, "覆盖后读取最新");

  // —— 排行榜 ——
  const lb0 = await (await fetch(`${BASE}/api/leaderboard`)).json();
  ok(Array.isArray(lb0.entries), "排行榜返回数组");
  const baseCount = lb0.entries.length;

  const post1 = await fetch(`${BASE}/api/leaderboard`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: "冒烟修士", realm: "筑基期", timeMs: 123000, kills: 12 }),
  });
  eq((await post1.json()).ok, true, "排行榜提交");
  const lb1 = await (await fetch(`${BASE}/api/leaderboard`)).json();
  eq(lb1.entries.length, baseCount + 1, "榜上 +1");
  const mine = lb1.entries.find((e) => e.nickname === "冒烟修士");
  ok(!!mine && mine.realm === "筑基期" && mine.kills === 12, "提交内容正确");

  // 更差成绩不入榜
  const post2 = await fetch(`${BASE}/api/leaderboard`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: "冒烟修士", realm: "筑基期", timeMs: 999000, kills: 1 }),
  });
  const post2Body = await post2.json();
  eq(post2Body.ok, true, "更差成绩请求 ok");
  eq(post2Body.skipped, true, "更差成绩被跳过（每人保留最优）");
  const lb2 = await (await fetch(`${BASE}/api/leaderboard`)).json();
  eq(lb2.entries.length, baseCount + 1, "榜数量不变");

  // 更优成绩入榜
  const post3 = await fetch(`${BASE}/api/leaderboard`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: "冒烟修士", realm: "金丹期", timeMs: 99000, kills: 20 }),
  });
  eq((await post3.json()).ok, true, "更优成绩入榜");
  const lb3 = await (await fetch(`${BASE}/api/leaderboard`)).json();
  eq(lb3.entries.length, baseCount + 2, "榜上再 +1");

  // —— 分章榜单：同用户两章各自保留最优 ——
  const lbAfter = (await (await fetch(`${BASE}/api/leaderboard`)).json()).entries;
  const mineCh1 = lbAfter.filter((e) => e.nickname === "冒烟修士" && e.chapter === 1);
  ok(mineCh1.length >= 1 && mineCh1.every((e) => e.chapter === 1), "第一章成绩带 chapter=1");

  const postCh2 = await fetch(`${BASE}/api/leaderboard`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: "冒烟修士", realm: "元婴期", timeMs: 200000, kills: 40, chapter: 2 }),
  });
  eq((await postCh2.json()).ok, true, "第二章成绩提交");
  const lbCh2 = (await (await fetch(`${BASE}/api/leaderboard`)).json()).entries;
  const mineCh2 = lbCh2.filter((e) => e.nickname === "冒烟修士" && e.chapter === 2);
  eq(mineCh2.length, 1, "第二章成绩独立入榜");
  ok(mineCh2[0].realm === "元婴期" && mineCh2[0].kills === 40, "第二章成绩内容正确");
  eq(lbCh2.filter((e) => e.nickname === "冒烟修士" && e.chapter === 1).length, mineCh1.length, "第一章历史成绩不受第二章影响");

  // 第二章更差成绩按 chapter 维度跳过
  const postCh2Worse = await fetch(`${BASE}/api/leaderboard`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: "冒烟修士", realm: "凡人", timeMs: 999999, kills: 1, chapter: 2 }),
  });
  const w2 = await postCh2Worse.json();
  eq(w2.ok, true, "第二章更差请求 ok");
  eq(w2.skipped, true, "第二章更差成绩被跳过");

  // —— 鉴权与异常路径 ——
  const noAuth = await fetch(`${BASE}/api/save`);
  eq(noAuth.status, 401, "无 token 读存档 401");
  const badAuth = await fetch(`${BASE}/api/save`, { headers: { Authorization: "Bearer wrong" } });
  eq(badAuth.status, 401, "假 token 401");
  const notFound = await fetch(`${BASE}/api/nope`);
  eq(notFound.status, 404, "未知路径 404");
  const badBody = await fetch(`${BASE}/api/save`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ data: null }),
  });
  eq(badBody.status, 400, "空 data 400");

  // —— 社交档案（p2-⑤）：默认档 / 写读往返 / 覆盖 / 非法与鉴权 ——
  const social0 = await (await fetch(`${BASE}/api/social`, { headers: auth })).json();
  eq(social0.ok, true, "社交档案默认读取 ok");
  eq(JSON.stringify(social0.profile.friends), "{}", "默认好友为空");
  eq(Array.isArray(social0.profile.mailsClaimed), true, "默认已领邮件为数组");

  const putSocial = await fetch(`${BASE}/api/social`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ profile: { friends: { lin: { affinity: 7, lastDay: "2026-10-22" } }, friendEnding: { lin: "lin_confidant" }, mailsClaimed: ["m_welcome"], sectContribution: 120, sectBuildings: { "xiu-lian-tang": 2 } } }),
  });
  eq((await putSocial.json()).ok, true, "社交档案写入");
  const social1 = await (await fetch(`${BASE}/api/social`, { headers: auth })).json();
  eq(social1.profile.friends.lin.affinity, 7, "好友好感往返一致");
  eq(social1.profile.friendEnding.lin, "lin_confidant", "结局落档往返一致");
  eq(social1.profile.sectContribution, 120, "宗门贡献往返一致");
  eq(social1.profile.sectBuildings["xiu-lian-tang"], 2, "宗门建筑往返一致");
  ok(social1.profile.mailsClaimed.includes("m_welcome"), "已领邮件往返一致");

  const putSocial2 = await fetch(`${BASE}/api/social`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ profile: { friends: {}, friendEnding: {}, mailsClaimed: [], sectContribution: 5, sectBuildings: {} } }),
  });
  eq((await putSocial2.json()).ok, true, "社交档案覆盖写");
  const social2 = await (await fetch(`${BASE}/api/social`, { headers: auth })).json();
  eq(social2.profile.sectContribution, 5, "覆盖后贡献为最新");
  eq(JSON.stringify(social2.profile.friends), "{}", "覆盖后好友为空");

  const badSocial = await fetch(`${BASE}/api/social`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ profile: null }),
  });
  eq(badSocial.status, 400, "空 profile 400");
  const socialNoAuth = await fetch(`${BASE}/api/social`);
  eq(socialNoAuth.status, 401, "无 token 读社交档案 401");

  // ============ P3-6 社交实时化：邮件 / 宗门榜 / 软实时 presence ============
  // 第二个账号（收件人）
  const loginRes2 = await fetch(`${BASE}/api/auth/guest`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: "收信道友" }),
  });
  const login2 = await loginRes2.json();
  ok(login2.ok && typeof login2.token === "string", "第二个账号登录 ok");
  const auth2 = { Authorization: `Bearer ${login2.token}` };

  // 邮件：A 发给 B
  const sendR = await fetch(`${BASE}/api/mail/send`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ to: "收信道友", title: "论道邀约", body: "后山一叙", reward: { exp: 100, stones: 50 } }),
  });
  eq((await sendR.json()).ok, true, "A 向 B 发送邮件");

  // 收件人不存在 / 自寄 应失败
  const sendNoRecv = await fetch(`${BASE}/api/mail/send`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ to: "不存在的散修", title: "x", body: "y" }),
  });
  eq(sendNoRecv.status, 404, "收件人不存在 404");
  const sendSelf = await fetch(`${BASE}/api/mail/send`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ to: "冒烟修士", title: "x", body: "y" }),
  });
  eq(sendSelf.status, 400, "自寄邮件 400");

  // B 收件箱含该信
  const inbox = await (await fetch(`${BASE}/api/mail`, { headers: auth2 })).json();
  eq(inbox.ok, true, "收件箱读取 ok");
  ok(inbox.mails.length >= 1 && inbox.mails[0].fromName === "冒烟修士" && inbox.mails[0].title === "论道邀约", "收件箱含 A 来信");
  const mailId = inbox.mails[0].id;

  // A 不能领 B 的邮件
  const claimByA = await fetch(`${BASE}/api/mail/${mailId}/claim`, { method: "POST", headers: auth });
  eq(claimByA.status, 404, "非收件人领取 404");

  // B 领取 → 返回奖励
  const claimR = await (await fetch(`${BASE}/api/mail/${mailId}/claim`, { method: "POST", headers: auth2 })).json();
  eq(claimR.ok, true, "B 领取邮件 ok");
  ok(claimR.reward && claimR.reward.exp === 100 && claimR.reward.stones === 50, "领取返回奖励正确");

  // 重复领取失败
  const claimAgain = await fetch(`${BASE}/api/mail/${mailId}/claim`, { method: "POST", headers: auth2 });
  eq(claimAgain.status, 400, "重复领取 400");

  // 宗门贡献榜：给 B 设贡献后入榜
  await fetch(`${BASE}/api/social`, {
    method: "PUT", headers: { ...auth2, "Content-Type": "application/json" },
    body: JSON.stringify({ profile: { friends: {}, friendEnding: {}, mailsClaimed: [], sectContribution: 300, sectBuildings: {} } }),
  });
  const lbSect = await (await fetch(`${BASE}/api/social/leaderboard`)).json();
  eq(lbSect.ok, true, "宗门贡献榜读取 ok");
  const top = lbSect.entries.find((e) => e.nickname === "收信道友");
  ok(!!top && top.contribution === 300, "贡献榜含 B 且数值正确");

  // 软实时 presence：A 上报 → 拉取含 A；B 上报 → 含两者
  const presA = await fetch(`${BASE}/api/presence`, {
    method: "PUT", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ gx: 11, gy: 11, zone: "ch1" }),
  });
  eq((await presA.json()).ok, true, "A 上报在线状态");
  const presList1 = await (await fetch(`${BASE}/api/presence`)).json();
  ok(presList1.players.some((p) => p.nickname === "冒烟修士" && p.zone === "ch1"), "在线列表含 A");
  await fetch(`${BASE}/api/presence`, {
    method: "PUT", headers: { ...auth2, "Content-Type": "application/json" },
    body: JSON.stringify({ gx: 5, gy: 5, zone: "ch2" }),
  });
  const presList2 = await (await fetch(`${BASE}/api/presence`)).json();
  ok(presList2.players.length >= 2, "在线列表含两名道友");

  // ============ P3-8 运营/赛季：活跃赛季 + 榜单（保最优/计排名） ============
  const sea0 = await (await fetch(`${BASE}/api/season`)).json();
  eq(sea0.ok, true, "赛季接口可读");
  ok(sea0.open === true && sea0.season && sea0.season.name === "开服盛典", "默认常驻赛季开服盛典进行中");
  eq(Array.isArray(sea0.top), true, "榜单为数组");

  // 甲（冒烟修士）提交 5000
  const subA = await fetch(`${BASE}/api/season/score`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ score: 5000, clearMs: 30000 }),
  });
  eq((await subA.json()).rank, 1, "甲首提交排名 1");

  const seaA = await (await fetch(`${BASE}/api/season`)).json();
  ok(seaA.top.length === 1 && seaA.top[0].nickname === "冒烟修士" && seaA.top[0].score === 5000, "榜单含甲 5000");

  // 乙（收信道友）提交 8000 → 排名 1，甲降至 2
  const subB = await fetch(`${BASE}/api/season/score`, {
    method: "POST", headers: { ...auth2, "Content-Type": "application/json" },
    body: JSON.stringify({ score: 8000, clearMs: 20000 }),
  });
  eq((await subB.json()).rank, 1, "乙更高分排名 1");

  const seaB = await (await fetch(`${BASE}/api/season`)).json();
  ok(seaB.top[0].nickname === "收信道友" && seaB.top[0].score === 8000, "榜单榜首为乙 8000");
  ok(seaB.top[1].nickname === "冒烟修士" && seaB.top[1].score === 5000, "榜单次席为甲 5000");

  // 甲提交更差分数 3000 → 跳过（保最优），排名维持 2
  const subA2 = await fetch(`${BASE}/api/season/score`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ score: 3000, clearMs: 55000 }),
  });
  const rA2 = await subA2.json();
  eq(rA2.skipped, true, "更差分数被跳过（保最优）");
  eq(rA2.rank, 2, "跳过时排名维持 2");

  // 无 token 提交 → 401
  const subNo = await fetch(`${BASE}/api/season/score`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: 100, clearMs: 1 }),
  });
  eq(subNo.status, 401, "无 token 提交赛季成绩 401");

  child.kill();
  // 清理临时库
  const fsClean = require("node:fs");
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fsClean.rmSync(testDb + suffix, { force: true });
    } catch {
      /* ignore */
    }
  }
  console.log(`\n========== 后端结果：${passed} 通过 / ${failed} 失败 ==========`);
  if (failed > 0) {
    console.error("失败项：\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("后端测试崩溃：", e);
  process.exit(1);
});
