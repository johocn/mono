import { Match3Engine } from "../src/modes/Match3Engine";
import { ALL_LEVELS } from "../src/config/LevelConfig";

const level = ALL_LEVELS.find((l) => l.id === "1-1")!;
let maxCascade = 0;
let games = 0;
let runaway = 0;

for (let g = 0; g < 200; g++) {
  const e = new Match3Engine();
  e.init({ ...level, items: { ...level.items } });
  let steps = 0;
  let guard = 0;
  while (e.getStepsLeft() > 0 && guard < 5000) {
    guard++;
    // 找一个可行交换（复用引擎提示）
    const hint = e.findHint();
    if (!hint) break;
    const res = e.swap(hint.a.row, hint.a.col, hint.b.row, hint.b.col);
    if (res.valid) {
      steps++;
      if (res.steps.length > maxCascade) maxCascade = res.steps.length;
      if (res.steps.length > 40) {
        runaway++;
        if (runaway <= 3) {
          console.error(`RUNWAY level=${level.id} game=${g} swap#${steps} cascade=${res.steps.length} score=${e.getScore()}`);
        }
      }
    }
  }
  games++;
}
console.log(`games=${games} maxCascade=${maxCascade} runaway(>40)=${runaway}`);
