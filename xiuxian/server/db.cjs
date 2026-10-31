/**
 * 数据库层：Node 22 内置 node:sqlite（零依赖）。
 * 表：users(游客账号) / saves(云存档，一人一条) / leaderboard(通关榜)。
 */
const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "data");
/** 默认库文件；可用 XIUXIAN_DB 覆盖（测试用独立库，避免与运行中的服务抢文件） */
const DB_FILE = process.env.XIUXIAN_DB
  ? path.resolve(process.env.XIUXIAN_DB)
  : path.join(DATA_DIR, "xiuxian.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  nickname TEXT NOT NULL,
  realm TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_lb_time ON leaderboard(time_ms ASC);
CREATE TABLE IF NOT EXISTS social_profiles (
  user_id INTEGER PRIMARY KEY,
  friends TEXT NOT NULL DEFAULT '{}',
  friend_ending TEXT NOT NULL DEFAULT '{}',
  mails_claimed TEXT NOT NULL DEFAULT '[]',
  sect_contribution INTEGER NOT NULL DEFAULT 0,
  sect_buildings TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS mails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL,
  to_user_id INTEGER NOT NULL,
  from_name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  reward TEXT NOT NULL DEFAULT '{}',
  read INTEGER NOT NULL DEFAULT 0,
  claimed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (to_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_mail_to ON mails(to_user_id, claimed);
CREATE TABLE IF NOT EXISTS presence (
  user_id INTEGER PRIMARY KEY,
  nickname TEXT NOT NULL,
  gx REAL NOT NULL DEFAULT 0,
  gy REAL NOT NULL DEFAULT 0,
  zone TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS season_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  nickname TEXT NOT NULL,
  score INTEGER NOT NULL,
  clear_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (season_id) REFERENCES seasons(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_season_top ON season_scores(season_id, score DESC);
`);

// 种子：默认常驻赛季（开服盛典），保证活动副本 / 赛季排行始终有活跃赛季
try {
  const cnt = db.prepare("SELECT COUNT(*) AS c FROM seasons").get().c;
  if (cnt === 0) {
    const now = Date.now();
    db.prepare("INSERT INTO seasons (id, name, start_at, end_at) VALUES (?, ?, ?, ?)")
      .run(1, "开服盛典", now - 86400000, now + 30 * 86400000);
  }
} catch { /* 已存在则忽略 */ }

// 向后兼容：旧库无 chapter 列时追加（默认 1 = 落霞镇）
try {
  db.exec("ALTER TABLE leaderboard ADD COLUMN chapter INTEGER NOT NULL DEFAULT 1");
} catch {
  /* 列已存在则忽略 */
}

module.exports = { db };
