/**
 * 内容编辑器（阶段3 可视化工具）：纯前端、零运行时侵入。
 * 读取 data/skills.ts 与 data/monsters.ts 的当前值，可视化调表，导出 diff 形式的
 * override.json（游戏运行时由 loadOverride 合并，无需重编译即可扩/调内容）。
 */
import { SKILLS, type SkillDef } from "../data/skills";
import { MONSTERS, type MonsterDef } from "../data/monsters";

type AnyObj = Record<string, any>;

interface Field {
  key: string; // 支持 "a.b" 嵌套
  label: string;
  type: "num" | "text" | "check" | "select";
  step?: number;
  options?: string[];
}

const ELEMENTS = ["", "metal", "wood", "water", "fire", "earth", "thunder", "ice"];

const SKILL_FIELDS: Field[] = [
  { key: "mpCost", label: "耗蓝", type: "num" },
  { key: "cd", label: "冷却", type: "num", step: 0.5 },
  { key: "power", label: "威力", type: "num", step: 0.1 },
  { key: "range", label: "射程", type: "num", step: 0.5 },
  { key: "aoe", label: "AOE", type: "num", step: 0.1 },
  { key: "castTime", label: "前摇", type: "num", step: 0.05 },
  { key: "projectile", label: "弹道", type: "check" },
  { key: "element", label: "属性", type: "select", options: ELEMENTS },
  { key: "feel.shake", label: "震屏", type: "num", step: 0.02 },
  { key: "feel.hitstop", label: "顿帧", type: "num", step: 0.01 },
  { key: "feel.fxColor", label: "特效色", type: "text" },
  { key: "feel.zoom", label: "推镜", type: "num", step: 0.02 },
  { key: "feel.slowmo", label: "慢动作", type: "num", step: 0.05 },
];

const MONSTER_FIELDS: Field[] = [
  { key: "hp", label: "生命", type: "num" },
  { key: "atk", label: "攻击", type: "num" },
  { key: "def", label: "防御", type: "num" },
  { key: "speed", label: "速度", type: "num", step: 0.1 },
  { key: "aggroRange", label: "仇恨", type: "num" },
  { key: "attackRange", label: "攻距", type: "num" },
  { key: "attackCd", label: "攻速", type: "num", step: 0.2 },
  { key: "exp", label: "经验", type: "num" },
  { key: "size", label: "体型", type: "num", step: 0.1 },
  { key: "color", label: "颜色", type: "text" },
  { key: "boss", label: "Boss", type: "check" },
  { key: "demon", label: "魔物", type: "check" },
  { key: "element", label: "属性", type: "select", options: ELEMENTS },
  { key: "knockResist", label: "抗击退", type: "num", step: 0.1 },
  { key: "poise", label: "韧性", type: "num" },
  { key: "stones.min", label: "灵石↓", type: "num" },
  { key: "stones.max", label: "灵石↑", type: "num" },
];

const clone = (x: any): any => JSON.parse(JSON.stringify(x));

function getPath(o: any, path: string): any {
  if (!path.includes(".")) return o[path];
  const [a, b] = path.split(".");
  return o[a] ? o[a][b] : undefined;
}

function setPath(o: any, path: string, v: any): void {
  if (!path.includes(".")) {
    o[path] = v;
    return;
  }
  const [a, b] = path.split(".");
  if (!o[a]) o[a] = {};
  o[a][b] = v;
}

// 基准快照（用于 diff）
const skillOriginals: Record<string, SkillDef> = {};
for (const s of SKILLS) skillOriginals[s.id] = clone(s);
const monsterOriginals: Record<string, MonsterDef> = {};
for (const id of Object.keys(MONSTERS)) monsterOriginals[id] = clone(MONSTERS[id]);

function fieldHtml(kind: string, id: string, f: Field, val: any): string {
  const name = `${kind}:${id}:${f.key}`;
  let ctrl: string;
  if (f.type === "check") {
    ctrl = `<input type="checkbox" data-name="${name}" ${val ? "checked" : ""}/>`;
  } else if (f.type === "select") {
    const opts = (f.options ?? [])
      .map((o) => `<option value="${o}" ${o === val ? "selected" : ""}>${o || "无"}</option>`)
      .join("");
    ctrl = `<select data-name="${name}">${opts}</select>`;
  } else if (f.type === "num") {
    const v = val === undefined || val === null ? "" : String(val);
    ctrl = `<input type="number" step="${f.step ?? "any"}" data-name="${name}" value="${v}"/>`;
  } else {
    ctrl = `<input type="text" data-name="${name}" value="${val ?? ""}"/>`;
  }
  return `<label class="f"><span>${f.label}</span>${ctrl}</label>`;
}

function renderCards(kind: "skills" | "monsters"): string {
  if (kind === "skills") {
    return SKILLS.map((s) => {
      const fields = SKILL_FIELDS.map((f) => fieldHtml("skill", s.id, f, getPath(s, f.key))).join("");
      return `<div class="card" data-id="${s.id}"><h3>${s.name}<small>${s.id} · ${s.branch}</small></h3><div class="grid">${fields}</div></div>`;
    }).join("");
  }
  return Object.keys(MONSTERS)
    .map((id) => {
      const m = MONSTERS[id];
      const fields = MONSTER_FIELDS.map((f) => fieldHtml("monster", id, f, getPath(m, f.key))).join("");
      return `<div class="card" data-id="${id}"><h3>${m.name}<small>${id}</small></h3><div class="grid">${fields}</div></div>`;
    })
    .join("");
}

function bind(panel: HTMLElement): void {
  panel
    .querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[data-name],select[data-name]")
    .forEach((inp) => {
      const ev = inp.tagName === "SELECT" || (inp as HTMLInputElement).type === "checkbox" ? "change" : "input";
      inp.addEventListener(ev, () => {
        const parts = (inp.getAttribute("data-name") as string).split(":");
        const [, id, key] = parts;
        const obj = parts[0] === "skill" ? SKILLS.find((s) => s.id === id) : MONSTERS[id];
        let v: any;
        if ((inp as HTMLInputElement).type === "checkbox") v = (inp as HTMLInputElement).checked;
        else if ((inp as HTMLInputElement).type === "number") v = (inp as HTMLInputElement).value === "" ? undefined : Number((inp as HTMLInputElement).value);
        else v = (inp as HTMLSelectElement).value;
        setPath(obj, key, v);
        refresh();
      });
    });
}

function buildOverride(): AnyObj {
  const skills: AnyObj = {};
  for (const s of SKILLS) {
    const o = skillOriginals[s.id];
    const patch: AnyObj = {};
    for (const f of SKILL_FIELDS) {
      const cur = getPath(s, f.key);
      const org = getPath(o, f.key);
      if (cur === undefined) continue; // 不导出清空值（避免运行时被写为 undefined）
      if (JSON.stringify(cur) === JSON.stringify(org)) continue;
      if (f.key.includes(".")) {
        const a = f.key.split(".")[0];
        patch[a] = clone(getPath(s, a)); // 整对象导出，避免覆盖同级子字段
      } else {
        patch[f.key] = cur;
      }
    }
    if (Object.keys(patch).length) skills[s.id] = patch;
  }
  const monsters: AnyObj = {};
  for (const id of Object.keys(MONSTERS)) {
    const m = MONSTERS[id];
    const o = monsterOriginals[id];
    const patch: AnyObj = {};
    for (const f of MONSTER_FIELDS) {
      const cur = getPath(m, f.key);
      const org = getPath(o, f.key);
      if (cur === undefined) continue;
      if (JSON.stringify(cur) === JSON.stringify(org)) continue;
      if (f.key.includes(".")) {
        const a = f.key.split(".")[0];
        patch[a] = clone(getPath(m, a));
      } else {
        patch[f.key] = cur;
      }
    }
    if (Object.keys(patch).length) monsters[id] = patch;
  }
  const out: AnyObj = {};
  if (Object.keys(skills).length) out.skills = skills;
  if (Object.keys(monsters).length) out.monsters = monsters;
  return out;
}

function refresh(): void {
  const ov = buildOverride();
  const nSkills = Object.keys(ov.skills ?? {}).length;
  const nMonsters = Object.keys(ov.monsters ?? {}).length;
  const total = nSkills + nMonsters;
  (document.getElementById("stat") as HTMLElement).textContent = total
    ? `待导出改动：${total}（技能 ${nSkills} / 怪物 ${nMonsters}）`
    : "无改动";
  // 高亮脏卡片
  document.querySelectorAll<HTMLElement>("#panel-skills .card, #panel-monsters .card").forEach((card) => {
    const id = card.getAttribute("data-id") as string;
    const dirty =
      (ov.skills && ov.skills[id]) || (ov.monsters && ov.monsters[id]) ? true : false;
    card.classList.toggle("dirty", !!dirty);
  });
}

function download(name: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function mergeOverride(ov: AnyObj): void {
  if (ov.skills) {
    for (const id of Object.keys(ov.skills)) {
      const s = SKILLS.find((x) => x.id === id);
      if (s) Object.assign(s, ov.skills[id]);
    }
  }
  if (ov.monsters) {
    for (const id of Object.keys(ov.monsters)) {
      const m = MONSTERS[id];
      if (m) Object.assign(m, ov.monsters[id]);
    }
  }
  renderAll();
}

function renderAll(): void {
  const ps = document.getElementById("panel-skills") as HTMLElement;
  const pm = document.getElementById("panel-monsters") as HTMLElement;
  ps.innerHTML = renderCards("skills");
  pm.innerHTML = renderCards("monsters");
  bind(ps);
  bind(pm);
  refresh();
}

function init(): void {
  renderAll();

  document.getElementById("export")!.addEventListener("click", () => {
    const ov = buildOverride();
    if (!Object.keys(ov).length) {
      alert("没有改动可导出。");
      return;
    }
    download("override.json", JSON.stringify(ov, null, 2));
  });

  document.getElementById("copy")!.addEventListener("click", async () => {
    const ov = buildOverride();
    const text = JSON.stringify(ov, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      alert("已复制 override.json 内容到剪贴板。");
    } catch {
      alert("复制失败，请改用「导出」下载文件。");
    }
  });

  document.getElementById("load")!.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        mergeOverride(JSON.parse(String(reader.result)));
      } catch {
        alert("JSON 解析失败。");
      }
    };
    reader.readAsText(file);
  });

  document.getElementById("reset")!.addEventListener("click", () => {
    for (const s of SKILLS) Object.assign(s, clone(skillOriginals[s.id]));
    for (const id of Object.keys(MONSTERS)) Object.assign(MONSTERS[id], clone(monsterOriginals[id]));
    renderAll();
  });

  document.querySelectorAll<HTMLButtonElement>("#tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#tabs button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("panel-" + btn.getAttribute("data-tab"))!.classList.add("active");
    });
  });
}

init();
