/** 舞台与安全区（布局常量：不在禁写死规则作用域内） */
export const STAGE_W = 390;
export const STAGE_H = 844;
export const HUD_TOP_H = 30;
export const BOARD_TOP = 34;
export const SHOWCASE_Y = 322;
export const SHOWCASE_H = 268;
export const DOCK_Y = 606;
export const BOTTOM_BTN_Y = 738;
export const CARD_W = 66;
export const CARD_H = 88;

/* —— HUD（底部操作坞；值 = 顶/左边缘坐标，非中心） —— */
export const HUD_DOCK_H = 184;
export const HUD_LABEL_H = 24;
export const HUD_LABEL_Y = DOCK_Y + 12;          // 618 = 中心 y
export const HUD_BAR_W = 86;
export const HUD_BAR_H = 40;
export const HUD_BAR_Y = DOCK_Y + 26;            // 632 = 顶
export const HUD_BAR_X0 = 6;
export const HUD_BAR_GAP = 11;
export const HUD_DICE_SIZE = 52;
export const HUD_DICE_Y = DOCK_Y + 78;           // 684 = 顶
export const HUD_DICE_X0 = 139;                  // 左
export const HUD_DICE_DX = 60;
export const HUD_BTN_H = 46;
export const HUD_BTN_PRIMARY_W = 98;
export const HUD_BTN_SECONDARY_W = 110;
export const HUD_BTN_PRIMARY_X = 146;            // 左
export const HUD_BTN_BUY_X = 31;                 // 左
export const HUD_BTN_UPGRADE_X = 249;            // 左

/** 默认皮肤几何（= public/skins/default/skin.json 的 geo；供渲染层免写死引用） */
export const DEFAULT_GEO = { hw: 21, hh: 10.5, ox: 195, oy: 96 };

/* —— M5 浮层（手牌 / 股票盘 / 抽卡翻牌 / 结算面板；元素一律 pass 4 + 定格台位） —— */
/* 手牌行：5 槽横排，落在底坞（606）之上 */
export const PANEL_HAND_Y = 550;                 // 顶
export const PANEL_SLOT_W = 68;
export const PANEL_SLOT_H = 52;
export const PANEL_SLOT_GAP = 6;
export const PANEL_SLOT_X0 = 13;                 // (390 − (5×68 + 4×6)) / 2

/* 通用浮层面板：占用橱窗区域（play 模式下该区域为空），避免遮住棋盘与底坞。
   底板复用注册表里 370×300 的 `showcase.panel`（不新增 ID），故 W/H 与之一致 */
export const PANEL_X = 10;                       // 左上
export const PANEL_Y = 300;
export const PANEL_W = 370;
export const PANEL_H = 300;
export const PANEL_CX = PANEL_X + PANEL_W / 2;   // 195

/* 浮层标题角标（中心） */
export const PANEL_BADGE_Y = 318;

/* 股票盘 / 结算面板的行 */
export const PANEL_ROW_X = 24;                   // 左上
export const PANEL_ROW_W = 342;
export const PANEL_ROW_H = 34;
export const PANEL_ROW_GAP = 6;
export const PANEL_STOCK_ROW_Y = 340;            // 首行顶
export const PANEL_CHART_X = 45;                 // 图表左上
export const PANEL_CHART_Y = 502;
export const PANEL_CHART_W = 300;
export const PANEL_CHART_H = 54;
/* 股票盘底部买卖键（作用于首支标的，按钮的 `data-target` 给 code） */
export const PANEL_TRADE_Y = 562;                // 顶
export const PANEL_TRADE_X0 = 30;                // 左
export const PANEL_TRADE_W = 150;
export const PANEL_TRADE_H = 38;
export const PANEL_TRADE_GAP = 30;

/* 抽卡翻牌：复用 B 版式橱窗构图（夜空 + 广场 + 居中卡面） */
export const PANEL_DRAW_X = 10;                  // 左上（与 B 版式橱窗同位）
export const PANEL_DRAW_Y = 322;
export const PANEL_CARD_CX = 195;                // 卡面中心
export const PANEL_CARD_CY = 404;
export const PANEL_CARD_S = 1.6;
export const PANEL_BADGE_DRAW_Y = 500;           // 抽卡角标中心（在卡面之下）

/* 结算面板 */
export const PANEL_SETTLE_ROW_H = 40;
export const PANEL_SETTLE_ROW_Y = 340;
export const PANEL_SETTLE_ROW_GAP = 8;

/* 浮层关闭键（抽卡翻牌用；放面板右上角，避开手牌行） */
export const PANEL_CLOSE_X = 294;                // 左
export const PANEL_CLOSE_Y = 336;                // 顶
export const PANEL_CLOSE_W = 76;
export const PANEL_CLOSE_H = 28;