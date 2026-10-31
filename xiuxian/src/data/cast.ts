/**
 * 人物卡司：把《凡人修仙传》主要角色的形象设定与立绘资源绑定，
 * 供 Rig（玩家/NPC 立绘渲染）、对话头像、图鉴/UI 文案统一取用。
 *
 * 画风：水墨与工笔结合、线条柔和、色彩清雅（月白 / 淡青 / 浅金），可爱治愈。
 */
import { ART } from "../core/Assets";

export interface CastDef {
  id: string;
  /** 显示名 */
  name: string;
  /** 称号 */
  title: string;
  /** 立绘资源路径（public 下） */
  img: string;
  /** 透明底抠图（用于世界层小人渲染，scripts/cutout_art.py 产出） */
  cut: string;
  /** 主色（UI 头像底色、标签描边） */
  color: string;
  /** 外貌 */
  appearance: string;
  /** 服饰配色 */
  palette: string;
  /** 神态气质 */
  manner: string;
  /** 标志元素（法器 / 灵兽 / 发饰） */
  marks: string;
}

export const CAST: Record<string, CastDef> = {
  hanli: {
    id: "hanli",
    name: "赵子龙",
    title: "一身是胆的常山孤勇",
    img: ART.hanli,
    cut: ART.cutHanli,
    color: "#cfd8e3",
    appearance: "英武青年将军，面如冠玉，长眉入鬓，双目炯炯有神，气质沉毅果敢。",
    palette: "白底银鳞甲外罩白袍，盔顶红缨飞扬，腰束金带，护臂藏银，银甲映雪。",
    manner: "忠勇、沉稳、临敌从容；长枪如龙，七进七出而色不变。",
    marks: "手中丈八蛇矛（银枪）寒光凛冽，身侧白气缭绕，战时红缨如火。",
  },
  nangongwan: {
    id: "nangongwan",
    name: "南宫婉",
    title: "清冷温柔的仙子",
    img: ART.nangongwan,
    cut: ART.cutNangongwan,
    color: "#8fb8c9",
    appearance: "乌黑长发垂至腰际，鬓边簪白玉兰与银步摇，杏眼含笑，腮红圆润。",
    palette: "月白为主、淡青为辅的仙门道袍，衣缘绣暗纹云锦，腰束青色绣带银腰扣。",
    manner: "外冷内暖，温婉坚定；笑起来眉眼弯弯，是治愈系仙子的定调。",
    marks: "肩头停一只圆滚滚的小白鹤（信使灵兽），身侧漂浮淡青玉环法器与灵光。",
  },
  yinyue: {
    id: "yinyue",
    name: "银月",
    title: "月华所化的狼族器灵",
    img: ART.yinyue,
    cut: ART.cutYinyue,
    color: "#9aa8c4",
    appearance: "银白长发如月华倾泻，银灰色大眼睛，头顶一对毛茸茸银色狼耳，身后蓬松银尾。",
    palette: "月白渐变银灰的和风广袖裙，衣缘绣银线云月纹，腰束黑色细带银扣。",
    manner: "俏皮、温顺、忠诚；举手投足带着小兽般的软萌，眼神灵动。",
    marks: "身后一轮巨大弯月与符文月轮（器灵本源），脚边卧一只圆滚滚银白小狼。",
  },
  lifeiyu: {
    id: "lifeiyu",
    name: "厉飞雨",
    title: "豪爽洒脱的剑修",
    img: ART.lifeiyu,
    cut: ART.cutLifeiyu,
    color: "#5f7a52",
    appearance: "黑发高束马尾、额前碎发飞扬，粗眉弯眼、咧嘴大笑，脸颊红扑扑。",
    palette: "墨绿 + 赭石色劲装短打，外罩深青半臂，肩覆雕花金饰护肩，腰束玄色革带。",
    manner: "豪爽、义气、爱笑；与韩立的谨慎互补，画面情绪最明亮的一位。",
    marks: "腰悬青锋长剑、金色剑穗，脚边一只圆滚滚的青羽小雀，背景墨竹远山。",
  },
};

/** 按角色 id 取形象设定 */
export function getCast(id: string): CastDef | undefined {
  return CAST[id];
}

/** 按顺序取全部卡司（图鉴/UI 列表用） */
export function allCast(): CastDef[] {
  return Object.keys(CAST).map((k) => CAST[k]);
}
