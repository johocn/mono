"use strict";
const fs = require("node:fs");
const Module = require("module");
const { installLaya, installBrowserStubs } = require("./stubs.cjs");
const ts = require("typescript");
Module._extensions[".ts"] = function (module, filename) {
  const code = fs.readFileSync(filename, "utf8");
  const out = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018, esModuleInterop: true },
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

const { Game } = require("../src/Game.ts");

const game = new Game();
game.start();
game.startNewGame("tmp");
let g = 0;
while (game.dialogue.isOpen && g++ < 50) game.dlgBox.onAdvance(0);
console.log(
  "[intro] zone=%s phase=%s dlg=%s quests=%d flags=%s",
  game.currentZoneId, game.phase, game.dialogue.isOpen, game.player.quests.active.length, JSON.stringify(game.player.flags),
);

game.enterZone("dungeon", { gx: 11, gy: 11 });
console.log("[enter] zone=%s bossFlag=%s spawnT=%s hp=%s", game.currentZoneId, game.player.flags["boss_spawned"], game.spawnT, game.player.hp);

for (let i = 0; i < 6; i++) game.debugStep(1 / 60);
console.log(
  "[6f] monsters=%s transferCd=%s",
  game.monsters.map((m) => `${m.def.id}${m.isBoss ? "(B)" : ""}:${m.alive}`).join("|") || "none",
  game.transferCooldown,
);

game.player.hp = Math.max(1, game.player.maxHp - 30);
for (let i = 0; i < 180; i++) {
  game.debugStep(1 / 60);
}
console.log(
  "[186f] zone=%s hp=%s dlg=%s monsters=%s",
  game.currentZoneId, game.player.hp, game.dialogue.isOpen,
  game.monsters.map((m) => `${m.def.id}${m.isBoss ? "(B)" : ""}:${m.alive}`).join("|") || "none",
);
for (let i = 0; i < 300; i++) {
  if (i % 20 === 0) game.player.hp = game.player.maxHp;
  game.debugStep(1 / 60);
}
console.log(
  "[486f] zone=%s hp=%s dlg=%s monsters=%s",
  game.currentZoneId, game.player.hp, game.dialogue.isOpen,
  game.monsters.map((m) => `${m.def.id}${m.isBoss ? "(B)" : ""}:${m.alive}`).join("|") || "none",
);

game.player.gx = 11.5;
game.player.gy = 14.5;
game.player.stop();
for (let i = 0; i < 70; i++) {
  if (i % 20 === 0) game.player.hp = game.player.maxHp;
  game.debugStep(1 / 60);
}
console.log(
  "[return] zone=%s panel=%s pending=%s pos=%s,%s",
  game.currentZoneId, game.transferPanel.visible,
  game.pendingTransfer ? game.pendingTransfer.to : "null",
  game.player.gx, game.player.gy,
);
game.confirmTransfer();
console.log("[after confirm] zone=%s pos=%s,%s", game.currentZoneId, game.player.gx, game.player.gy);
