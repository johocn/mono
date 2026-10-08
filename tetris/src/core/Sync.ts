/**
 * Sync — 登录后从服务端拉取完整进度/积分/皮肤并合并（跨设备同步）
 * 与 ProgressStore 的增量 push（schedulePush）配合：登录拉全量、关键变更增量回推。
 */

import { progress } from "./ProgressStore";
import { skinManager } from "./SkinManager";
import { tetrisApi } from "./TetrisApi";

/** 登录成功后调用：拉取服务端数据并合并到本地（本地优先 + 服务端权威字段覆盖） */
export async function syncPull(): Promise<void> {
  if (!tetrisApi.available()) return;
  const prof = await tetrisApi.getProgress();
  if (prof.ok && prof.data) progress.applyServerProfile(prof.data);

  const pts = await tetrisApi.getPoints();
  if (pts.ok && pts.data) progress.setPoints(pts.data.balance);

  const skins = await tetrisApi.listSkins();
  if (skins.ok && skins.data) skinManager.applyServerUnlocks(skins.data);
}
