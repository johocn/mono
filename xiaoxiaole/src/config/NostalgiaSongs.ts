/**
 * NostalgiaSongs — 怀旧金曲曲库（歌词 / 歌名联想回忆玩法数据源）
 *
 * 选用传唱度极高、长辈普遍熟悉的中外经典 / 民谣 / 少儿 / 老歌，
 * 用于怀旧疗法（reminiscence therapy）：由歌词想起歌名、由歌名想起歌词，
 * 锻炼语义记忆、情景记忆、联想记忆与语言流畅度。
 *
 * 仅取最具辨识度的一句歌词作为线索，避免长文本；标题与选项均为短字符串，适老大字号友好。
 */

export interface NostalgiaSong {
  id: string;
  title: string;
  lyric: string;
}

export const NOSTALGIA_SONGS: NostalgiaSong[] = [
  { id: "molihua", title: "茉莉花", lyric: "好一朵美丽的茉莉花" },
  { id: "xiaoyanzi", title: "小燕子", lyric: "小燕子，穿花衣" },
  { id: "shuangjiang", title: "让我们荡起双桨", lyric: "小船儿推开波浪" },
  { id: "liuyanghe", title: "浏阳河", lyric: "浏阳河，弯过了几道弯" },
  { id: "yingshanhong", title: "映山红", lyric: "夜半三更哟，盼天明" },
  { id: "nannanwan", title: "南泥湾", lyric: "花篮的花儿香，听我来唱一唱" },
  { id: "dongfanghong", title: "东方红", lyric: "东方红，太阳升" },
  { id: "gechangzuguo", title: "歌唱祖国", lyric: "五星红旗迎风飘扬" },
  { id: "woniu", title: "蜗牛与黄鹂鸟", lyric: "阿门阿前一棵葡萄树" },
  { id: "caimogu", title: "采蘑菇的小姑娘", lyric: "背着一个大竹筐" },
  { id: "penghuwan", title: "外婆的澎湖湾", lyric: "白浪逐沙滩" },
  { id: "tongnian", title: "童年", lyric: "知了在声声叫着夏天" },
  { id: "xiangjian", title: "乡间的小路", lyric: "暮归的老牛是我同伴" },
  { id: "dushulang", title: "读书郎", lyric: "小嘛小二郎，背着那书包上学堂" },
  { id: "ertongtuan", title: "共产儿童团歌", lyric: "准备好了么？时刻准备着" },
  { id: "honghu", title: "洪湖水浪打浪", lyric: "洪湖水呀浪呀嘛浪打浪啊" },
  { id: "tianya", title: "天涯歌女", lyric: "天涯呀海角，觅呀觅知音" },
  { id: "yehai", title: "夜上海", lyric: "夜上海，夜上海，你是个不夜城" },
  { id: "tiandi", title: "我的祖国", lyric: "一条大河波浪宽" },
  { id: "shandan", title: "山丹丹开花红艳艳", lyric: "山丹丹的那个开花哟，红艳艳" },
  { id: "shisong", title: "十送红军", lyric: "一送里格红军，介支个下了山" },
  { id: "kangding", title: "康定情歌", lyric: "跑马溜溜的山上，一朵溜溜的云" },
  { id: "alishan", title: "阿里山的姑娘", lyric: "高山青，涧水蓝" },
  { id: "wangnin", title: "枉凝眉", lyric: "一个是阆苑仙葩，一个是美玉无瑕" },
  { id: "junggang", title: "军港之夜", lyric: "军港的夜啊，静悄悄" },
  { id: "datab", title: "打靶归来", lyric: "日落西山红霞飞，战士打靶把营归" },
  { id: "tianmi", title: "甜蜜蜜", lyric: "甜蜜蜜，你笑得甜蜜蜜" },
  { id: "yueliang", title: "月亮代表我的心", lyric: "你问我爱你有多深" },
];
