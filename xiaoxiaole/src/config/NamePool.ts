/**
 * 共享人名池 — 供「面孔-名字」相关玩法复用（FaceScene 联想 / MemoryScene 翻翻乐）
 *
 * 采用老人熟悉的中文称呼式（老张 / 李阿姨…），比纯姓名更贴近日常社交场景，
 * 也更容易唤起联想记忆。
 */
export const NAME_POOL: string[] = [
  "老张", "李阿姨", "王伯伯", "陈奶奶", "刘爷爷", "赵婶", "孙叔", "周姨",
  "吴嫂", "郑大爷", "冯婶", "杨叔", "何奶奶", "许阿姨", "邓伯伯", "曹爷爷",
  "彭婶", "萧叔", "韩姨", "唐嫂",
];

/**
 * 图词联想对 — 「图像卡 ↔ 标签卡」，构成翻翻乐中的语义联想对。
 * icon 用 emoji，label 为对应中文词；适老取向：选取生活常见、形态辨识度高的事物。
 */
export const ICON_WORD_PAIRS: { icon: string; label: string }[] = [
  { icon: "🌸", label: "桃花" },
  { icon: "🍁", label: "枫叶" },
  { icon: "🍎", label: "苹果" },
  { icon: "🦋", label: "蝴蝶" },
  { icon: "🐦", label: "小鸟" },
  { icon: "☂️", label: "雨伞" },
  { icon: "🫖", label: "茶壶" },
  { icon: "🎋", label: "竹子" },
  { icon: "🍂", label: "落叶" },
  { icon: "🌾", label: "麦穗" },
  { icon: "🏮", label: "灯笼" },
  { icon: "🪷", label: "荷花" },
];
