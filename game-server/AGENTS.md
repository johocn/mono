# AGENTS.md — game-server

## 部署（必读）

**任何涉及部署/重启 game-server 的任务，动手前必须先读 [部署协议.md](./部署协议.md)** 并全文遵守。

三秒版：本地构建 → 产物必须含 `sso-exchange` 路由 → tar 不带 `.env*`/`node_modules` → 服务器先备份再替换 → restart 后跑线上探针（`/health`=200、`POST /api/client/v1/auth/sso-exchange`=400）→ 失败立即回退。禁止服务器构建，禁止覆盖 `/opt/game-server/dist`（目标态走 releases+current symlink，入口 `scripts/deploy.mjs`）。
