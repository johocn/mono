/**
 * 限时活动（运营）：日期驱动的限时活动（双倍修炼 / 登录有礼 / 节日）。
 * 复用 dailies「日期即种子」的思想，但活动有绝对起止窗口；
 * 内置活动默认长窗口（长期有效），测试可注入 now 验证过期。
 */
export type EventType = "double" | "login";

export interface EventDef {
  id: string;
  name: string;
  desc: string;
  type: EventType;
  /** 起止日期 YYYY-MM-DD（含端点） */
  start: string;
  end: string;
  /** double：击杀收益倍率（默认 2） */
  mult?: number;
  /** login：每日登录奖励 */
  reward?: { exp?: number; stones?: number };
}

export const EVENTS: EventDef[] = [
  { id: "ev_double", name: "双倍修炼", desc: "活动期间击杀妖兽获得修为与灵石翻倍", type: "double", start: "2020-01-01", end: "2099-12-31", mult: 2 },
  { id: "ev_login", name: "登录有礼", desc: "每日登录领取灵石与修为（每日一次）", type: "login", start: "2020-01-01", end: "2099-12-31", reward: { stones: 60, exp: 30 } },
  { id: "ev_festival", name: "新春庆典", desc: "节日特供：击杀收益翻倍（限时）", type: "double", start: "2030-02-01", end: "2030-02-15", mult: 2 },
];

function dayStr(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 当前生效的活动（基于给定时间戳，便于测试注入） */
export function activeEvents(now: number): EventDef[] {
  const day = dayStr(now);
  return EVENTS.filter((e) => e.start <= day && day <= e.end);
}

export function getEvent(id: string): EventDef | undefined {
  return EVENTS.find((e) => e.id === id);
}
