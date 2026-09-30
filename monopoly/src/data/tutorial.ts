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
  /** 操作方式：说清「这一步该怎么点」（缺陷 1 修复：原引导未说明操作方式） */
  how: string;
  /**
   * 目标动作（HUD 元素的 `data-action`）：`ui/tutorial.ts` 在捕获阶段监听点击，
   * 命中其中任一即「跟手」进入下一步；空数组 = 纯说明步，只能点气泡里的「下一步」。
   * 每步只在「目标元素确实存在」的相位出现，故目标 action 必须与该相位一致。
   */
  actions: string[];
  /** 高亮矩形；来源一律是 layout 常量 / hitAreas()，不另造坐标（spec §7.3） */
  rects: Rect[];
}

const DICE: Rect = { x: HUD_DICE_X0, y: HUD_DICE_Y, w: HUD_DICE_DX + HUD_DICE_SIZE, h: HUD_DICE_SIZE };

/**
 * 四步按「回合相位」排序，保证每步高亮的目标元素在它出现的时刻确实存在：
 * 1) `idle` 相位：底坞主按钮（roll）与骰子常驻 → 第 1 步；目标完成 = 走完一回合（settle，此时已在 settled 相位）。
 * 2) `settled` 相位：买地 / 升级才存在（`buyOffer` / `upgradeOffer`）→ 第 2 步。
 * 3) 资产条常驻、手牌抽屉在引导期被强制展开 → 第 3 步（说明步）。
 * 4) AI 席位资产条常驻 → 第 4 步（说明步；加速 / 跳过仅在 AI 回合出现，故不作高亮目标）。
 */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    testId: 'roll',
    title: '掷骰开局',
    text: '依次点前进、结算',
    how: '点下方金色按钮掷骰；骰子停后再依次点「前进」「结算」，走完这一回合',
    actions: ['settle'],
    rects: [
      { x: HUD_BTN_PRIMARY_X, y: BOTTOM_BTN_Y, w: HUD_BTN_PRIMARY_W, h: HUD_BTN_H },
      DICE,
    ],
  },
  {
    testId: 'earn',
    title: '买地与升级',
    text: '空地买下，自己的地能升级',
    how: '骰子停下后点「买地」把这格买下；若是自己的地，点「升级」加盖楼层',
    actions: ['buy', 'upgrade'],
    rects: [
      { x: HUD_BTN_BUY_X, y: BOTTOM_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H },
      { x: HUD_BTN_UPGRADE_X, y: BOTTOM_BTN_Y, w: HUD_BTN_SECONDARY_W, h: HUD_BTN_H },
    ],
  },
  {
    testId: 'assets',
    title: '资产与手牌',
    text: '看现金与领先者，手牌能放炸弹',
    how: '顶部资产条看各家现金与领先者；下方手牌槽点一下即可打出道具',
    actions: [],
    rects: [
      { x: HUD_BAR_X0, y: HUD_BAR_Y, w: HUD_BAR_W, h: HUD_BAR_H },
      { x: PANEL_SLOT_X0, y: PANEL_HAND_Y, w: PANEL_SLOT_W * 5 + PANEL_SLOT_GAP * 4, h: PANEL_SLOT_H },
    ],
  },
  {
    testId: 'ai',
    title: '其余是AI',
    text: 'AI 自己走，可加速或跳过',
    how: '轮到 AI 时，状态行右侧会出现「加速 ×2」「跳过本次」，点它们可加快节奏',
    actions: [],
    rects: [{ x: HUD_BAR_X0 + HUD_BAR_W + HUD_BAR_GAP, y: HUD_BAR_Y, w: HUD_BAR_W, h: HUD_BAR_H }],
  },
];