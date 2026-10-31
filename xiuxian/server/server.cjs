/**
 * 修仙 MVP 后端（零依赖）：node:http + node:sqlite。
 * 运行：node --experimental-sqlite server/server.cjs （默认端口 3210）
 *
 * 接口：
 *   POST /api/auth/guest   {nickname}            → {ok, token, userId}
 *   GET  /api/save         (Bearer token)        → {ok, data}
 *   PUT  /api/save         {data}                → {ok}
 *   GET  /api/leaderboard                        → {ok, entries[]}
 *   POST /api/leaderboard  {nickname,realm,timeMs,kills,chapter} → {ok}
 * 说明：游客登录（无需微信）；任何失败返回 {ok:false}，客户端静默回退本地。
 * 排行榜按 (user_id, chapter) 各保留最优成绩；查询返回含 chapter 字段，前端分章展示。
 */
const http = require("node:http");
const crypto = require("node:crypto");
const { db } = require("./db.cjs");

const PORT = Number(process.env.PORT || 3210);

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1e6) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function authUser(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const row = db.prepare("SELECT id, nickname FROM users WHERE token = ?").get(m[1].trim());
  return row || null;
}

const stmts = {
  createUser: db.prepare("INSERT INTO users (nickname, token, created_at) VALUES (?, ?, ?)"),
  upsertSave: db.prepare(
    `INSERT INTO saves (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ),
  getSave: db.prepare("SELECT data, updated_at FROM saves WHERE user_id = ?"),
  insertLb: db.prepare(
    "INSERT INTO leaderboard (user_id, nickname, realm, time_ms, kills, chapter, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ),
  topLb: db.prepare(
    "SELECT nickname, realm, time_ms AS timeMs, kills, chapter, created_at AS createdAt FROM leaderboard ORDER BY chapter ASC, time_ms ASC, kills DESC LIMIT ?",
  ),
  upsertSocial: db.prepare(
    `INSERT INTO social_profiles (user_id, friends, friend_ending, mails_claimed, sect_contribution, sect_buildings, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET friends=excluded.friends, friend_ending=excluded.friend_ending, mails_claimed=excluded.mails_claimed, sect_contribution=excluded.sect_contribution, sect_buildings=excluded.sect_buildings, updated_at=excluded.updated_at`,
  ),
  getSocial: db.prepare("SELECT friends, friend_ending, mails_claimed, sect_contribution, sect_buildings FROM social_profiles WHERE user_id = ?"),
  userIdByName: db.prepare("SELECT id, nickname FROM users WHERE nickname = ?"),
  insertMail: db.prepare(
    "INSERT INTO mails (from_user_id, to_user_id, from_name, title, body, reward, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ),
  inboxMails: db.prepare(
    "SELECT id, from_name, title, body, reward, read, claimed, created_at FROM mails WHERE to_user_id = ? ORDER BY created_at DESC LIMIT 50",
  ),
  getMailById: db.prepare("SELECT id, to_user_id, reward, claimed FROM mails WHERE id = ?"),
  claimMail: db.prepare("UPDATE mails SET claimed = 1, read = 1 WHERE id = ? AND to_user_id = ? AND claimed = 0"),
  topSect: db.prepare(
    "SELECT u.nickname AS nickname, sp.sect_contribution AS contribution FROM social_profiles sp JOIN users u ON u.id = sp.user_id WHERE sp.sect_contribution > 0 ORDER BY sp.sect_contribution DESC LIMIT 20",
  ),
  upsertPresence: db.prepare(
    `INSERT INTO presence (user_id, nickname, gx, gy, zone, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET nickname=excluded.nickname, gx=excluded.gx, gy=excluded.gy, zone=excluded.zone, updated_at=excluded.updated_at`,
  ),
  onlinePresence: db.prepare(
    "SELECT nickname, gx, gy, zone, updated_at AS updatedAt FROM presence WHERE updated_at > ? ORDER BY updated_at DESC LIMIT 30",
  ),
  getActiveSeason: db.prepare(
    "SELECT id, name, start_at AS startAt, end_at AS endAt FROM seasons WHERE end_at >= ? ORDER BY start_at DESC LIMIT 1",
  ),
  insertSeasonScore: db.prepare(
    "INSERT INTO season_scores (season_id, user_id, nickname, score, clear_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ),
  deleteSeasonScore: db.prepare("DELETE FROM season_scores WHERE season_id = ? AND user_id = ?"),
  topSeason: db.prepare(
    "SELECT nickname, score, clear_ms AS clearMs FROM season_scores WHERE season_id = ? ORDER BY score DESC, clear_ms ASC LIMIT 10",
  ),
  userBestSeason: db.prepare("SELECT MAX(score) AS s FROM season_scores WHERE season_id = ? AND user_id = ?"),
  rankSeason: db.prepare("SELECT COUNT(*) AS c FROM season_scores WHERE season_id = ? AND score > ?"),
};

/** 清洗社交档案入参：容错为合法结构，非法整体返回 null */
function sanitizeSocial(body) {
  const p = body && body.profile;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const mails = Array.isArray(p.mailsClaimed) ? p.mailsClaimed.filter((x) => typeof x === "string") : [];
  const contrib = Number(p.sectContribution);
  return {
    friends: obj(p.friends),
    friendEnding: obj(p.friendEnding),
    mailsClaimed: mails,
    sectContribution: isFinite(contrib) && contrib > 0 ? Math.floor(contrib) : 0,
    sectBuildings: obj(p.sectBuildings),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") return send(res, 204, {});

  try {
    // —— 游客登录 ——
    if (req.method === "POST" && path === "/api/auth/guest") {
      const body = await readBody(req);
      const nickname = String(body.nickname || "").trim().slice(0, 16) || "无名散修";
      const token = crypto.randomBytes(24).toString("hex");
      const now = Date.now();
      const info = stmts.createUser.run(nickname, token, now);
      return send(res, 200, { ok: true, token, userId: Number(info.lastInsertRowid) });
    }

    // —— 云存档：读 ——
    if (req.method === "GET" && path === "/api/save") {
      const user = authUser(req);
      if (!user) return send(res, 401, { ok: false, error: "unauthorized" });
      const row = stmts.getSave.get(user.id);
      if (!row) return send(res, 200, { ok: false, error: "no save" });
      let data = null;
      try {
        data = JSON.parse(row.data);
      } catch {
        return send(res, 200, { ok: false, error: "corrupt save" });
      }
      return send(res, 200, { ok: true, data, updatedAt: row.updated_at });
    }

    // —— 云存档：写 ——
    if (req.method === "PUT" && path === "/api/save") {
      const user = authUser(req);
      if (!user) return send(res, 401, { ok: false, error: "unauthorized" });
      const body = await readBody(req);
      if (!body.data || typeof body.data !== "object") {
        return send(res, 400, { ok: false, error: "missing data" });
      }
      stmts.upsertSave.run(user.id, JSON.stringify(body.data), Date.now());
      return send(res, 200, { ok: true });
    }

    // —— 排行榜：查 ——
    if (req.method === "GET" && path === "/api/leaderboard") {
      const rows = stmts.topLb.all(40);
      return send(res, 200, { ok: true, entries: rows });
    }

    // —— 排行榜：提交（每人仅保留最优成绩）——
    if (req.method === "POST" && path === "/api/leaderboard") {
      const user = authUser(req);
      if (!user) return send(res, 401, { ok: false, error: "unauthorized" });
      const body = await readBody(req);
      const timeMs = Math.max(0, Math.floor(Number(body.timeMs) || 0));
      const kills = Math.max(0, Math.floor(Number(body.kills) || 0));
      const realm = String(body.realm || "").slice(0, 12) || "凡人";
      const chapter = Math.max(1, Math.floor(Number(body.chapter) || 1));
      if (timeMs <= 0) return send(res, 400, { ok: false, error: "bad timeMs" });
      // 同用户、同章节取最优（用时更短）入榜
      const best = db
        .prepare("SELECT MIN(time_ms) AS t FROM leaderboard WHERE user_id = ? AND chapter = ?")
        .get(user.id, chapter);
      if (best && best.t != null && best.t <= timeMs) {
        return send(res, 200, { ok: true, skipped: true });
      }
      stmts.insertLb.run(user.id, String(body.nickname || user.nickname).slice(0, 16), realm, timeMs, kills, chapter, Date.now());
      return send(res, 200, { ok: true });
    }

    // —— 社交档案：读（无记录返回默认空档案）——
    if (req.method === "GET" && path === "/api/social") {
      const user = authUser(req);
      if (!user) return send(res, 401, { ok: false, error: "unauthorized" });
      const row = stmts.getSocial.get(user.id);
      if (!row) {
        return send(res, 200, { ok: true, profile: { friends: {}, friendEnding: {}, mailsClaimed: [], sectContribution: 0, sectBuildings: {} } });
      }
      let friends = {};
      let fe = {};
      let mc = [];
      let sb = {};
      try { friends = JSON.parse(row.friends); } catch { /* 保留默认 */ }
      try { fe = JSON.parse(row.friend_ending); } catch { /* 保留默认 */ }
      try { mc = JSON.parse(row.mails_claimed); } catch { /* 保留默认 */ }
      try { sb = JSON.parse(row.sect_buildings); } catch { /* 保留默认 */ }
      return send(res, 200, {
        ok: true,
        profile: {
          friends: friends && typeof friends === "object" ? friends : {},
          friendEnding: fe && typeof fe === "object" ? fe : {},
          mailsClaimed: Array.isArray(mc) ? mc : [],
          sectContribution: row.sect_contribution || 0,
          sectBuildings: sb && typeof sb === "object" ? sb : {},
        },
      });
    }

    // —— 社交档案：写（upsert；业务规则在客户端，服务器结构化存储）——
    if (req.method === "PUT" && path === "/api/social") {
      const user = authUser(req);
      if (!user) return send(res, 401, { ok: false, error: "unauthorized" });
      const body = await readBody(req);
      const p = sanitizeSocial(body);
      if (!p) return send(res, 400, { ok: false, error: "missing profile" });
      stmts.upsertSocial.run(
        user.id,
        JSON.stringify(p.friends),
        JSON.stringify(p.friendEnding),
        JSON.stringify(p.mailsClaimed),
        p.sectContribution,
        JSON.stringify(p.sectBuildings),
        Date.now(),
      );
      return send(res, 200, { ok: true });
    }

    // —— 邮件：发送（按昵称寻址收件人）——
    if (req.method === "POST" && path === "/api/mail/send") {
      const user = authUser(req);
      if (!user) return send(res, 401, { ok: false, error: "unauthorized" });
      const body = await readBody(req);
      const to = String(body.to || "").trim().slice(0, 16);
      const title = String(body.title || "").trim().slice(0, 40) || "（无题）";
      const bbody = String(body.body || "").trim().slice(0, 400);
      if (!to) return send(res, 400, { ok: false, error: "missing to" });
      const target = stmts.userIdByName.get(to);
      if (!target) return send(res, 404, { ok: false, error: "recipient not found" });
      if (target.id === user.id) return send(res, 400, { ok: false, error: "cannot mail self" });
      let reward = {};
      if (body.reward && typeof body.reward === "object") {
        const r = {};
        if (Number(body.reward.exp) > 0) r.exp = Math.min(100000, Math.floor(Number(body.reward.exp)));
        if (Number(body.reward.stones) > 0) r.stones = Math.min(100000, Math.floor(Number(body.reward.stones)));
        if (Array.isArray(body.reward.items)) {
          r.items = body.reward.items
            .slice(0, 5)
            .filter((it) => it && typeof it.id === "string" && Number(it.n) > 0)
            .map((it) => ({ id: String(it.id).slice(0, 24), n: Math.min(999, Math.floor(Number(it.n))) }));
        }
        reward = r;
      }
      stmts.insertMail.run(user.id, target.id, user.nickname, title, bbody, JSON.stringify(reward), Date.now());
      return send(res, 200, { ok: true });
    }

    // —— 邮件：收件箱 ——
    if (req.method === "GET" && path === "/api/mail") {
      const user = authUser(req);
      if (!user) return send(res, 401, { ok: false, error: "unauthorized" });
      const rows = stmts.inboxMails.all(user.id);
      const mails = rows.map((r) => {
        let reward = {};
        try { reward = JSON.parse(r.reward); } catch { /* 保留默认 */ }
        return {
          id: r.id,
          fromName: r.from_name,
          title: r.title,
          body: r.body,
          reward,
          read: !!r.read,
          claimed: !!r.claimed,
          createdAt: r.created_at,
        };
      });
      return send(res, 200, { ok: true, mails });
    }

    // —— 邮件：领取（仅收件人本人、未领取可领；服务端标记防重领）——
    const mClaim = /^\/api\/mail\/(\d+)\/claim$/.exec(path);
    if (req.method === "POST" && mClaim) {
      const user = authUser(req);
      if (!user) return send(res, 401, { ok: false, error: "unauthorized" });
      const id = Number(mClaim[1]);
      const row = stmts.getMailById.get(id);
      if (!row || row.to_user_id !== user.id) return send(res, 404, { ok: false, error: "mail not found" });
      if (row.claimed) return send(res, 400, { ok: false, error: "already claimed" });
      let reward = {};
      try { reward = JSON.parse(row.reward); } catch { /* 保留默认 */ }
      stmts.claimMail.run(id, user.id);
      return send(res, 200, { ok: true, reward });
    }

    // —— 宗门贡献榜（公开聚合 social_profiles.sect_contribution）——
    if (req.method === "GET" && path === "/api/social/leaderboard") {
      const rows = stmts.topSect.all();
      return send(res, 200, { ok: true, entries: rows });
    }

    // —— P3-8 赛季：当前活跃赛季 + 榜单（公开）——
    if (req.method === "GET" && path === "/api/season") {
      const row = stmts.getActiveSeason.get(Date.now());
      if (!row) return send(res, 200, { ok: true, open: false, season: null, top: [] });
      const top = stmts.topSeason.all(row.id);
      return send(res, 200, { ok: true, open: true, season: { id: row.id, name: row.name, startAt: row.startAt, endAt: row.endAt }, top });
    }

    // —— P3-8 赛季：提交活动副本成绩（按 user×season 保最优）——
    if (req.method === "POST" && path === "/api/season/score") {
      const user = authUser(req);
      if (!user) return send(res, 401, { ok: false, error: "unauthorized" });
      const season = stmts.getActiveSeason.get(Date.now());
      if (!season) return send(res, 400, { ok: false, error: "no active season" });
      const body = await readBody(req);
      const score = Math.max(0, Math.floor(Number(body.score) || 0));
      const clearMs = Math.max(0, Math.floor(Number(body.clearMs) || 0));
      if (score <= 0) return send(res, 400, { ok: false, error: "bad score" });
      const best = stmts.userBestSeason.get(season.id, user.id);
      const prevBest = best && best.s > 0 ? best.s : 0;
      if (prevBest >= score) {
        const rank = 1 + (stmts.rankSeason.get(season.id, prevBest).c || 0);
        return send(res, 200, { ok: true, skipped: true, rank });
      }
      stmts.deleteSeasonScore.run(season.id, user.id);
      stmts.insertSeasonScore.run(season.id, user.id, user.nickname, score, clearMs, Date.now());
      const rank = 1 + (stmts.rankSeason.get(season.id, score).c || 0);
      return send(res, 200, { ok: true, rank });
    }

    // —— 软实时在线状态：上报 ——
    if (req.method === "PUT" && path === "/api/presence") {
      const user = authUser(req);
      if (!user) return send(res, 401, { ok: false, error: "unauthorized" });
      const body = await readBody(req);
      const gx = Math.max(0, Number(body.gx) || 0);
      const gy = Math.max(0, Number(body.gy) || 0);
      const zone = String(body.zone || "").slice(0, 16);
      stmts.upsertPresence.run(user.id, user.nickname, gx, gy, zone, Date.now());
      return send(res, 200, { ok: true });
    }

    // —— 软实时在线状态：拉取近 60s 活跃道友 ——
    if (req.method === "GET" && path === "/api/presence") {
      const cutoff = Date.now() - 60000;
      const rows = stmts.onlinePresence.all(cutoff);
      return send(res, 200, { ok: true, players: rows });
    }

    return send(res, 404, { ok: false, error: "not found" });
  } catch (err) {
    return send(res, 500, { ok: false, error: String(err && err.message ? err.message : err) });
  }
});

if (require.main === module) {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[xiuxian-server] listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = { server, PORT };
