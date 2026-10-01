/**
 * 角色台词库唯一真源：取经四众各按其**原著人设**说话，每条例标注《西游记》回目出处。
 *
 * 合规口径（用户拍板）：
 *  - 只收**原著原文**（吴承恩《西游记》成书文本），《西游记》属公有领域，可自由使用；
 *  - **影视改编与网络二创台词一律不收**（例：「大师兄，师父被妖怪抓走了」「师父，这叫做无底船」
 *    皆为影视二创，非原著，已剔除）；
 *  - 每条必须带 `chapterNo` + `chapter`（回目全称），便于逐条回溯源；新增条目须先核验原文再入表。
 *
 * 取词**确定性**（不用 `Math.random`）：同一 seed 恒得同一句，保证录像/回放与 e2e 断言可复现。
 */

/** 角色 ID：与 `board.ts` 的 `PLAYER_NAME` 席位顺序一一对应 */
export type RoleId = 'wukong' | 'bajie' | 'wujing' | 'sanzang';

/** 席位（0..3）→ 角色 ID；席位顺序 = `PLAYER_NAME` 顺序 = 出牌顺序 */
export const ROLE_BY_SEAT: RoleId[] = ['wukong', 'bajie', 'wujing', 'sanzang'];

export interface Line {
  /** 说话人 */
  role: RoleId;
  /** 原著原文（不加标点修饰，保留原字） */
  text: string;
  /** 回目序号 */
  chapterNo: number;
  /** 回目全称 */
  chapter: string;
}

/**
 * 原著台词表（逐条已核验原文）。分组顺序 = 悟空 / 八戒 / 悟净 / 三藏，
 * 便于人读；取词时按 `role` 过滤，不依赖数组顺序。
 */
export const LINES: Line[] = [
  /* ── 孙悟空：桀骜、争胜、护师，开口必带「老孙」── */
  { role: 'wukong', text: '老孙便是！', chapterNo: 4, chapter: '官封弼马心何足 名注齐天意未宁' },
  { role: 'wukong', text: '皇帝轮流做，明年到我家。', chapterNo: 7, chapter: '八卦炉中逃大圣 五行山下定心猿' },
  { role: 'wukong', text: '你忒不济！不济！', chapterNo: 15, chapter: '蛇盘山诸神暗佑 鹰愁涧意马收缰' },
  { role: 'wukong', text: '老孙也捉得怪，降得魔。伏虎擒龙，踢天弄井，都晓得些儿。', chapterNo: 20, chapter: '黄风岭唐僧有难 半山中八戒争先' },
  { role: 'wukong', text: '师父，你坐着，莫怕。等老孙和他耍耍儿来。', chapterNo: 22, chapter: '八戒大战流沙河 木叉奉法收悟净' },
  { role: 'wukong', text: '水里勾当，老孙不大十分熟。', chapterNo: 22, chapter: '八戒大战流沙河 木叉奉法收悟净' },
  { role: 'wukong', text: '莫胡说，为人为彻。', chapterNo: 48, chapter: '魔弄寒风飘大雪 僧思拜佛履层冰' },
  { role: 'wukong', text: '师父放心。我等皈命投诚，怕甚妖怪！', chapterNo: 56, chapter: '神狂诛草寇 道昧放心猿' },
  { role: 'wukong', text: '自古道：山不碍路，路自通山。', chapterNo: 80, chapter: '姹女育阳求配偶 心猿护主识妖邪' },
  { role: 'wukong', text: '师父，你常以思乡为念，全不似个出家人。', chapterNo: 80, chapter: '姹女育阳求配偶 心猿护主识妖邪' },

  /* ── 猪八戒：贪嘴、恋家、憨直，自称「老猪」── */
  { role: 'bajie', text: '若要俊，却也不难。', chapterNo: 18, chapter: '观音院唐僧脱难 高老庄行者降魔' },
  { role: 'bajie', text: '我以相貌为姓，故姓猪，官名叫作猪刚鬣。', chapterNo: 18, chapter: '观音院唐僧脱难 高老庄行者降魔' },
  { role: 'bajie', text: '哥呵，似不得你这喝风阿烟的人。', chapterNo: 20, chapter: '黄风岭唐僧有难 半山中八戒争先' },
  { role: 'bajie', text: '我是个直肠的痴汉。', chapterNo: 20, chapter: '黄风岭唐僧有难 半山中八戒争先' },
  { role: 'bajie', text: '说得是，我老猪也有些饿了，且到人家化些斋吃，有力气，好挑行李。', chapterNo: 20, chapter: '黄风岭唐僧有难 半山中八戒争先' },
  { role: 'bajie', text: '我们丑自丑，却都有用。', chapterNo: 20, chapter: '黄风岭唐僧有难 半山中八戒争先' },
  { role: 'bajie', text: '大王还照旧罢，不要吃坏例子。', chapterNo: 48, chapter: '魔弄寒风飘大雪 僧思拜佛履层冰' },
  { role: 'bajie', text: '我是个销猪！', chapterNo: 54, chapter: '法性西来逢女国 心猿定计脱烟花' },
  { role: 'bajie', text: '天色将晚，自上山行了这一日，肚里饿了，大家走动些，寻个人家化些斋吃。', chapterNo: 56, chapter: '神狂诛草寇 道昧放心猿' },
  { role: 'bajie', text: '放心，放心！这里来相近极乐不远，管取太平无事！', chapterNo: 80, chapter: '姹女育阳求配偶 心猿护主识妖邪' },

  /* ── 沙悟净：原著戏份最少，言语沉稳、只认「跟着大哥走」── */
  { role: 'wujing', text: '我不是那妖魔鬼怪，也不是少姓无名。', chapterNo: 22, chapter: '八戒大战流沙河 木叉奉法收悟净' },
  { role: 'wujing', text: '二哥，你却去照胎泉边照照，看可有双影。', chapterNo: 54, chapter: '法性西来逢女国 心猿定计脱烟花' },
  { role: 'wujing', text: '二哥，你把担子挑一肩儿。', chapterNo: 80, chapter: '姹女育阳求配偶 心猿护主识妖邪' },
  { role: 'wujing', text: '我挑担前走，不曾在心，也不曾听见。', chapterNo: 80, chapter: '姹女育阳求配偶 心猿护主识妖邪' },
  { role: 'wujing', text: '莫胡谈！只管跟着大哥走，只把工夫捱他，终须有个到之之日。', chapterNo: 80, chapter: '姹女育阳求配偶 心猿护主识妖邪' },

  /* ── 唐三藏：持戒、思乡、见妖则惧，正统佛门口吻── */
  { role: 'sanzang', text: '心生，种种魔生；心灭，种种魔灭。', chapterNo: 13, chapter: '陷虎穴金星解厄 双叉岭伯钦留僧' },
  { role: 'sanzang', text: '路中逢庙烧香，遇佛拜佛，遇塔扫塔。', chapterNo: 13, chapter: '陷虎穴金星解厄 双叉岭伯钦留僧' },
  { role: 'sanzang', text: '徒弟，前面高山，有路无路，是必小心！', chapterNo: 80, chapter: '姹女育阳求配偶 心猿护主识妖邪' },
  { role: 'sanzang', text: '不信直中直，须防仁不仁。', chapterNo: 80, chapter: '姹女育阳求配偶 心猿护主识妖邪' },
  { role: 'sanzang', text: '我自天牌传旨意，锦屏风下领关文。观灯十五离东土，才与唐王天地分。', chapterNo: 80, chapter: '姹女育阳求配偶 心猿护主识妖邪' },
  { role: 'sanzang', text: '贫僧乃东土大唐钦差往西天求经者。', chapterNo: 56, chapter: '神狂诛草寇 道昧放心猿' },
  { role: 'sanzang', text: '悟空，前面有山，恐又生妖怪，是必谨防。', chapterNo: 56, chapter: '神狂诛草寇 道昧放心猿' },
  { role: 'sanzang', text: '大王饶命！大王饶命！', chapterNo: 56, chapter: '神狂诛草寇 道昧放心猿' },
];

/** 按角色预分组（模块加载时一次成型，取词 O(1)） */
const POOL: Record<RoleId, Line[]> = (() => {
  const out = { wukong: [], bajie: [], wujing: [], sanzang: [] } as Record<RoleId, Line[]>;
  for (const l of LINES) out[l.role].push(l);
  return out;
})();

/** 某角色的全部台词（分组序 = 表中出现序） */
export function linesOf(role: RoleId): Line[] {
  return POOL[role];
}

/** 席位 → 角色 ID（越界按 0 号处理，避免脏输入炸渲染） */
export function roleOfSeat(seat: number): RoleId {
  const i = Math.abs(Math.trunc(seat)) % ROLE_BY_SEAT.length;
  return ROLE_BY_SEAT[i];
}

/**
 * 确定性取词：同一 `role` + `seed` 恒返回同一句。
 * seed 建议传「回合数 / 格号 / 步数」等状态量，同一局面重放结果一致。
 *
 * `maxLen` 给窄容器（如头顶气泡）用：优先在「字数 ≤ maxLen」的短句里取，
 * 短句池为空时才退回全量池（宁长勿缺）。
 */
export function pickLine(role: RoleId, seed = 0, maxLen = Infinity): Line {
  const all = POOL[role];
  const short = Number.isFinite(maxLen) ? all.filter((l) => l.text.length <= maxLen) : all;
  const pool = short.length > 0 ? short : all;
  const k = Math.abs(Math.trunc(seed)) + ROLE_BY_SEAT.indexOf(role) * 7;
  return pool[k % pool.length];
}

/** 按席位取词（渲染层最常用入口） */
export function pickLineForSeat(seat: number, seed = 0, maxLen = Infinity): Line {
  return pickLine(roleOfSeat(seat), seed, maxLen);
}

/** 气泡引文每行字数（气泡宽 100px 内一行约放得下 11 个 8px 汉字） */
export const QUOTE_LINE_CHARS = 11;

/** 气泡引文总字数上限（= 2 行 × 每行 11 字）：取词时按此为界挑短句，保证两行内排完 */
export const QUOTE_MAX_CHARS = QUOTE_LINE_CHARS * 2;