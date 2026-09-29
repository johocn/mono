/** 新手引导四步（spec §7.2）。矩形由消费方从 hitAreas()/layout 常量填（本文件只放文案与槽位） */
import {
  HUD_BAR_H, HUD_BAR_W, HUD_BAR_X0, HUD_BAR_GAP, HUD_BAR_Y,
  HUD_BTN_BUY_X, HUD_BTN_H, HUD_BTN_PRIMARY_W, HUD_BTN_PRIMARY_X,
  HUD_BTN_SECONDARY_W, HUD_BTN_UPGRADE_X,
  HUD_DICE_DX, HUD_DICE_SIZE, HUD_DICE_X0, HUD_DICE_Y,
  PANEL_HAND_Y, PANEL_SLOT_GAP, PANEL_SLOT_H, PANEL_SLOT_W, PANEL_SLOT_X0, BOTTOM_BTN_Y,
} from '../skin/layout';

export interface Rect { x: number; y: number; w: number; h: number }
export interface TutorialStep {
  testId: string;
  title: string;
  text: string;
  /** 高亮矩形；来源一律是 layout 常量 / hitAreas()，不另造坐标（spec §7.3） */
  rects: Rect[];
}

const DICE: Rect = { x: HUD_DICE_X0, y: HUD_DICE_Y, w: HUD_DICE_DX + HUD_DICE_SIZE, h: HUD_DICE_SIZE };

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    testId: 'roll',
    title: '点这里掷骰',
    text: '再依次点「前进」「结算」',
    rects: [
      { x: HUD_BTN_PRIMARY_X, y: BOTTOM_BTN_Y, w: HUD_BTN_PRIMARY_W, h: HUD_BTN_H },
      DICE,
    ],
  },
  {
    testId: 'earn',
    title: '买地与升级',
    text: '踩到空地可买下，自己的地能升级',
    rects: [
      { x: HUD_BTN_BUY_X, y: BOTTOM_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H },
      { x: HUD_BTN_UPGRADE_X, y: BOTTOM_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H },
    ],
  },
  {
    testId: 'assets',
    title: '资产与手牌',
    text: '这里看现金与领先者；手牌能放炸弹',
    rects: [
      { x: HUD_BAR_X0, y: HUD_BAR_Y, w: HUD_BAR_W, h: HUD_BAR_H },
      { x: PANEL_SLOT_X0, y: PANEL_HAND_Y, w: PANEL_SLOT_W * 5 + PANEL_SLOT_GAP * 4, h: PANEL_SLOT_H },
    ],
  },
  {
    testId: 'ai',
    title: '其余是 AI',
    text: 'AI 会自己走；想快可点加速或跳过',
    rects: [{ x: HUD_BAR_X0 + HUD_BAR_W + HUD_BAR_GAP, y: HUD_BAR_Y, w: HUD_BAR_W, h: HUD_BAR_H }],
  },
];