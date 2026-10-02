/** 舞台与安全区（布局常量：不在禁写死规则作用域内） */
export const STAGE_W = 390;
export const STAGE_H = 844;
export const HUD_TOP_H = 30;
export const BOARD_TOP = 34;
/** 中部街市带（play 版式）：棋盘底角到 y=406，故街市带从 406 起、高 102（原 322/268 是为 9×9 方形棋盘留的） */
export const SHOWCASE_Y = 406;
export const SHOWCASE_H = 102;
export const DOCK_Y = 606;
export const BOTTOM_BTN_Y = 738;
export const CARD_W = 66;
export const CARD_H = 88;

/* —— HUD（底部操作坞；值 = 顶/左边缘坐标，非中心） —— */
export const HUD_DOCK_H = 184;
export const HUD_LABEL_H = 24;
export const HUD_LABEL_Y = DOCK_Y + 12;          // 618 = 中心 y
/** 资产条并入 1 条 4 段：4 × 94.5 + 0 间隔 = 378，恰好铺满 6..384（spec §7.2/C5，不新增 id） */
export const HUD_BAR_W = 94.5;
export const HUD_BAR_H = 40;
export const HUD_BAR_Y = DOCK_Y + 26;            // 632 = 顶
export const HUD_BAR_X0 = 6;
export const HUD_BAR_GAP = 0;
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

/* —— AI 回合（spec §5.2）：整行主按钮 + 状态行右侧两枚快捷键 —— */
export const HUD_BTN_AI_X = 31;
export const HUD_BTN_AI_W = 328;
export const HUD_QK_W = 72;
export const HUD_QK_H = 22;
export const HUD_QK_FAST_X = 211;
export const HUD_QK_SKIP_X = 287;
/** M20.2 银行键：底坞右侧三枚快捷键行（135..207 / 211..283 / 287..359，不重叠） */
export const HUD_QK_BANK_X = 135;
/** 快捷键顶边 y；中心 = HUD_LABEL_Y（状态行中心），即右侧 211..359 / 287..359 */
export const HUD_QK_Y = 607;
/** AI 回合把状态行文字左移，给右侧快捷键让位 */
export const HUD_LABEL_SHIFT_X = -90;
/** 性格徽标相对资产条中心的偏移（贴右上角，右缘与资产条右缘齐平） */
export const HUD_PERSONA_DX = 26;
export const HUD_PERSONA_DY = -11;

/* —— M20.2 HUD 债务条（spec §3.8）：底坞状态行已被三枚快捷键占满，故放顶部 HUD 条中段，
   避开分享键 8..86 与静音键 324..384 —— */
export const HUD_DEBT_X = 88;
export const HUD_DEBT_Y = 4;
export const HUD_DEBT_W = 234;
export const HUD_DEBT_H = 22;

/** 默认皮肤几何（= public/skins/default/skin.json 的 geo；供渲染层免写死引用）
 *  v6：棋盘由 9×9 正方形改为 11×7 倾斜长方形 —— `cols+rows` 仍为 18，
 *  故环长 2(cols+rows)-4=32 不变；放大来自 hh 13→18（棋盘高 234→324 = 屏高 38%，过 V7「≥1/3」闸门）。
 *  hw=21.5 ⇒ 外框宽 18×hw=387 ≤ 390（**不再左右出血被裁**：9×9 时 18×24=432，左右各被切 21px）。
 *  ox=195−2×hw 使 (c−r) 的 −6..10 居中于屏幕；oy=64 让顶端地块（index 26，L2 楼 46 高）连同楼顶名牌
 *  恰好落在顶部 HUD（30）之下，同时棋盘底角收到 y=406 与街市带相接。 */
export const DEFAULT_GEO = { hw: 21.5, hh: 18, ox: 152, oy: 64 };

/* —— 楼顶名牌（spec §6.2/§6.3）：纵向被 2×hh=26 / 13 锁死，故胶囊 h=13、字号靠横向吃满格宽 —— */
export const LABEL_ROOF = { fs: 10, fsShort: 11, fsNarrow: 8, padX: 6, h: 13, rx: 6, lift: 5, strokeW: 1.1 };
/** 地面字牌排版（`drawLabels` 第 4 参；原 main.ts 的 LABEL_PARAMS 迁入此处） */
export const LABEL_GROUND = { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 };
export const LABEL_CURRENT_SCALE = 1.25;
export const LABEL_MAX_CHARS = 4;            // >4 字截断加 '…'
/** 名牌横向内缩量：11×7 盘的最左/最右角格楼顶名牌比地砖宽，原名牌中心对齐格心会被舞台左右边缘裁掉，
   故 `drawLabels` 把名牌中心夹到 [w/2+pad, STAGE_W−w/2−pad]，保证整块名牌可读（残影对齐不变） */
export const LABEL_EDGE_PAD = 3;

/* —— 当前格三重标记（spec §6.3）：地砖金环（`drawLabels` 画在标签层，恒在楼体之上）
   + 名牌描边/放大 + 指示三角 —— */
export const LABEL_CURRENT_RING = '#ffd76a';        // 金环 / 描边 / 三角
export const LABEL_CURRENT_TEXT = '#ffffff';        // 当前格名牌文字色
export const LABEL_STROKE_CUR = 1.8;                // 当前格描边宽（非当前格用 LABEL_ROOF.strokeW）
export const LABEL_TRI_W = 8;                       // 指示三角宽（底边）
export const LABEL_TRI_H = 5;                       // 指示三角高
/** 当前格地砖金环：向外扩张量 / 线宽 / 外层透明度（`dia(hw+out, hh+out)` 为外圈光晕） */
export const LABEL_RING = { in: 1.5, out: 3, inW: 1.6, outW: 3, outA: 0.3 };

/** 楼体屏幕缩放与基线偏移（= `Scene` placement 的 buildingScale / buildingYOffset，同源一份值） */
export const BUILDING_SCALE = 0.72;
export const BUILDING_Y_OFFSET = 1;

/* —— 落地地块卡（spec §7.3）：位于棋盘（底 ≈312）与底坞（顶 606）之间 —— */
export const TILE_CARD_X = 8;
export const TILE_CARD_Y = 508;
export const TILE_CARD_W = 374;
export const TILE_CARD_H = 76;
/** 地块卡上两枚次要键（买地 / 升级）的顶边——视觉与命中区同源一份（spec §12 高风险项） */
export const TILE_CARD_BTN_Y = TILE_CARD_Y + 40;

/* —— 停留气泡（spec §6.7）：锚在棋子头顶上方 8px —— */
export const BUBBLE_W = 100;
export const BUBBLE_H = 44;
export const BUBBLE_GAP = 8;
/** 气泡横向内缩量：11×7 盘最左/最右格心 x≈44.5，半宽 50 会把气泡推出舞台左右边缘被裁，
   故 `bubbleSpecs` 把中心夹到 [w/2+pad, STAGE_W−w/2−pad]（与 `LABEL_EDGE_PAD` 同口径） */
export const BUBBLE_EDGE_PAD = 4;
/* 气泡在 pass 4 内的行号：必须大于 HUD（0..21，末段为 M20.2 债务条）与浮层（0..12）的最大行号，
   否则棋盘下缘的棋子头顶会被底坞 / 浮层盖住（下缘几格正好落在浮层覆盖区） */
export const BUBBLE_DEPTH = 22;
/** 无动效的停留事件（如进监狱）没有 `fx` 结束回调可用，气泡靠这个时长自动收起 */
export const BUBBLE_HOLD_MS = 1100;
/** 前进播报（「谁前进几步」）改成定时器收起：hop 动效仅 FX_HOP_MS(320ms)，
    随 fx 收起等于一闪而过读不完；此处给足停留（略小于 AI_STEP_MS，不拖进下一步） */
export const BUBBLE_MOVE_HOLD_MS = 820;

/* —— M5 浮层（手牌 / 股票盘 / 抽卡翻牌 / 结算面板；元素一律 pass 4 + 定格台位） —— */
/* 手牌行：M19 起 6 槽横排（6×55 + 5×6 = 360 ≤ 390），落在底坞（606）之上 */
export const PANEL_HAND_Y = 550;                 // 顶
export const PANEL_SLOT_W = 55;
export const PANEL_SLOT_H = 52;
export const PANEL_SLOT_GAP = 6;
export const PANEL_SLOT_X0 = 15;                 // (390 − (6×55 + 5×6)) / 2

/* —— M19-D2 选目标：屏幕反查容差 + 预演条 + 取消键 ——
   预演条占手牌行（10+272+6+96 = 384 ≤ 390），与手牌槽同中心线，二选一显示 */
export const TILE_PICK_TOL = 30;
export const PANEL_PREVIEW_X = 10;
export const PANEL_PREVIEW_W = 272;
export const PANEL_PREVIEW_H = PANEL_SLOT_H;
export const PANEL_CANCEL_X = 288;
export const PANEL_CANCEL_W = 96;
export const PANEL_PREVIEW_LINE_DY = 12;
export const PANEL_PREVIEW_FS = 12;

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

/* 抽卡翻牌（事件卡 ×2）：卡面 66×88 × 3.2 = 211×282，370×300 的老底板装不下，
   故改用新增注册项 `showcase.panelTall`（370×480），底板从 150 铺到 630（不压底坞资产条 632）。
   自上而下：角标 → 卡面 → 关闭键 → 手牌行（PANEL_HAND_Y 不变，恰好落在面板之内）。 */
export const PANEL_TALL_W = 370;                 // = showcase.panelTall 的 box 宽
export const PANEL_TALL_H = 480;                 // = showcase.panelTall 的 box 高
export const PANEL_DRAW_X = 10;                  // 左上
export const PANEL_DRAW_Y = 150;
export const PANEL_CARD_CX = 195;                // 卡面中心
export const PANEL_CARD_CY = 336;                // 卡面 195.2..476.8
export const PANEL_CARD_S = 3.2;                 // 事件卡 2 倍（66×88 → 211×282）
export const PANEL_BADGE_DRAW_Y = 174;           // 抽卡角标中心（在卡面之上）

/* 结算面板 */
export const PANEL_SETTLE_ROW_H = 40;
export const PANEL_SETTLE_ROW_Y = 340;
export const PANEL_SETTLE_ROW_GAP = 8;

/* —— M20.1 破产拍卖浮层（版式 B · 债务条 + 左卡右档）——
   新增两个可见元素 ui.bid（出价键）/ ui.bidDebt（债务条）的几何与台位；
   地契卡复用既有 ui.tileCard（缩到 PANEL_BID_CARD_S），故不新增卡元素。 */
export const PANEL_BID_CARD_CX = 112;            // 地契卡中心 x（左）
export const PANEL_BID_CARD_CY = 470;            // 地契卡中心 y
export const PANEL_BID_CARD_S = 0.5;             // 地契卡缩放（374×76 → 187×38）
export const PANEL_BID_X = 214;                  // 出价键左缘
export const PANEL_BID_W = 152;                  // 出价键宽
export const PANEL_BID_H = 40;                   // 出价键高
export const PANEL_BID_Y0 = 400;                 // 首枚出价键顶边（三档 + 放弃纵排）
export const PANEL_BID_STEP = 48;                // 出价键纵向步距
export const PANEL_BID_S = 1;                    // 出价键缩放
export const PANEL_DEBT_CX = PANEL_CX;           // 债务条中心 x（= 195）
export const PANEL_DEBT_CY = 350;                // 债务条中心 y
export const PANEL_DEBT_W = 346;                 // 债务条宽
export const PANEL_DEBT_H = 34;                  // 债务条高

/* —— M20.2 银行浮层（版式 C · 左列表右详情；spec §3.8）——
   底板复用 370×300 的 `showcase.panel`（PANEL_X/Y），角标复用 `ui.badge`；
   左列 3 行 `ui.bankRow`（row 变体）、右列详情文本行（同元素 line 变体）+ 两枚 `ui.button.*`；
   右上「关闭」复用 `ui.qk`（72×22）。 */
export const PANEL_BANK_ROW_X = 20;              // 左列行左缘
export const PANEL_BANK_ROW_W = 152;
export const PANEL_BANK_ROW_H = 40;
export const PANEL_BANK_ROW_GAP = 8;
export const PANEL_BANK_ROW_Y0 = 344;            // 首行顶边（三行 344..384 / 392..432 / 440..480）
export const PANEL_BANK_DETAIL_CX = 277;         // 右列中心 x（右列 184..370）
export const PANEL_BANK_LINE_Y0 = 350;           // 详情首行中心 y
export const PANEL_BANK_LINE_DY = 22;            // 详情行距（最多 5 行 → 350..438，落在按钮之上）
export const PANEL_BANK_BTN_W = 98;              // = 注册表 ui.button.primary 宽
export const PANEL_BANK_BTN_X = 228;             // 主键左缘（右列居中：277 − 98/2）→ 228..326
export const PANEL_BANK_BTN_Y = 456;             // 主键顶边
export const PANEL_BANK_BTN2_W = 110;            // = 注册表 ui.button.secondary 宽
export const PANEL_BANK_BTN2_X = 222;            // 次键左缘（277 − 110/2）→ 222..332
export const PANEL_BANK_BTN2_Y = 510;            // 次键顶边
export const PANEL_BANK_BTN_H = 46;              // = 注册表两枚操作键的高（与 HUD 同源）
export const PANEL_BANK_CLOSE_X = 300;           // 右上「关闭」键左缘（复用 72×22 的 ui.qk）
export const PANEL_BANK_CLOSE_Y = 307;           // 关闭键顶边（中心 y 与 PANEL_BADGE_Y 同线）

/* 浮层关闭键（抽卡翻牌用）：卡面放大后移到卡面正下方、水平居中（卡底 476.8 → 键 488..524） */
export const PANEL_CLOSE_W = 140;
export const PANEL_CLOSE_H = 36;
export const PANEL_CLOSE_X = (STAGE_W - PANEL_CLOSE_W) / 2;   // 125
export const PANEL_CLOSE_Y = 488;

/* —— play 版式中部橱窗（spec §6 版式 A「中 = 当前地块橱窗」）——
   棋盘底 ≈ 276，底坞顶 = DOCK_Y(606)，中间条带 ≈ 300..606；橱窗**完整复用** B 版式构图（§3.5）与
   同名注册表元素（showcase.panel/sky/skyline/ground/tree/lamp/shop/sign/lantern/banner/hud）。
   手牌行（PANEL_HAND_Y = 550 .. 602）落在条带下部，而 B 版式的信息条默认在面板内 248..286
   （play 下 = 548..586，正好压住手牌行），故把它整体上移到楼体基座处（248 → 208，即 508..546），
   紧贴手牌行上沿而不重叠；CTA 金按钮在 play 版式下不画（棋盘上已有真实买卖键）。 */
export const PLAY_SHOWCASE_Y = 300;              // 橱窗面板左上角 y（与 B 版式同 x=10）
export const PLAY_HUD_BAR_DY = -40;              // 信息条相对默认位上移（默认 248 → 208，落在手牌行之上）
export const PLAY_SHOP_S = 2.6;                  // 楼体缩放（略收小，让楼顶落在面板之内）

/* —— 棋盘两处三角空位（spec §6 版式 A 补全）——
   11×7 倾斜长方形在 390×844 舞台里天然留出两块三角空白：右上（棋盘右上斜边之外）与左下
   （棋盘左下斜边之外）。留白会让人误以为画面失衡，故各放一个内容位：
     右上 = 广告 / 城市主题插画 / 规则小贴士**轮播**（内容来自 `public/config/board-slots.json`）
     左下 = 事件战报**滚动条**（记录每一步「谁 · 做了什么」）
   两个矩形都是「三角形内接矩形」——右上矩形的下缘、左下矩形的上缘都落在棋盘斜边之内
   （斜边斜率 = hh/hw = 18/21.5），不会再压到棋盘本体。 */
export const BOARD_SLOT_AD_X = 214;
export const BOARD_SLOT_AD_Y = 72;
export const BOARD_SLOT_AD_W = 176;
export const BOARD_SLOT_AD_H = 60;
export const BOARD_SLOT_AD_MS = 5200;            // 单条轮播停留时长（毫秒）
export const BOARD_SLOT_LOG_X = 0;
export const BOARD_SLOT_LOG_Y = 342;
export const BOARD_SLOT_LOG_W = 160;
export const BOARD_SLOT_LOG_H = 64;
export const BOARD_SLOT_LOG_KEEP = 4;            // 战报最多保留条数（超出滚动丢弃）

/* —— M6 动效参数（spec §5.6 全清单）：`src/render/fx.ts` 唯一取值来源 ——
   `fx.ts` 处于「禁写死」gate 作用域内，裸时长/弧高/粒子数一律集中在此（本文件不在 gate 内）。
   任何动效数字必须写成这里的具名常量，再由 fx.ts 引用——否则 lint 拦下。
   尺寸口径：spec §5.6 要求「大富翁-4 级可读性」，故每条动效都在手机 390×844 下放大到可辨识。 */
export const FX_MS_PER_S = 1000;                 // ms → gsap 秒
export const FX_EASE_FALLBACK = 'power2.out';    // skin.json `fx.ease` 缺失时的兜底（非色值，可裸写）
export const FX_NOFX_SPEED = 999;                // `?nofx=1` → 时轴瞬间到终帧
export const FX_LEVELS = 3;                      // 升级「逐层点亮」层数（L1→L2→L3）
export const FX_FRAMES = 300;                    // `?perf=1` 采样帧数

/* 掷骰：旋转弹跳（骰体放大到 HUD 骰面的 2.4 倍，弹跳抬出底坞 → 手机屏上可辨识「翻滚」） */
export const FX_DICE_MS = 560;
export const FX_DICE_SPIN = 360;                 // 旋转总角度（度）
export const FX_DICE_HOP = 46;                   // 弹跳高度（px）
export const FX_DICE_S = 2.4;                    // 骰体动效缩放
/* 移动：逐格跳跃 + 落尘（`FX_HOP_S` 是**绝对台位缩放**，非叠加：静帧 1.6 → 起跳 2.0 = 1.25× 弹跳） */
export const FX_HOP_MS = 320;
export const FX_HOP_ARC = 52;                    // 腾空弧高（px）
export const FX_HOP_S = 2.0;                     // 棋子动效缩放（起跳放大）
export const FX_HOP_KICK_MS = 110;               // 起跳段时长
export const FX_DUST_COUNT = 6;
export const FX_DUST_MS = 320;
export const FX_DUST_ARC = 22;                   // 落尘扇形铺开半宽（px）
export const FX_DUST_S = 3.2;                    // 落尘动效缩放（原 1 倍在静帧下不可辨）
/* 买地：盖章 + 金币飞出 */
export const FX_BUY_MS = 460;
export const FX_STAMP_MS = 220;
export const FX_STAMP_S0 = 3.2;                  // 盖章初始放大（砸下感）
export const FX_STAMP_S = 2.4;                   // 盖章落定缩放（26px → 62px）
export const FX_STAMP_DEG = -14;                 // 盖章初始旋转（度）
export const FX_COIN_COUNT = 8;
export const FX_COIN_FLY_MS = 480;
export const FX_COIN_LIFT = -52;                 // 金币飞出上抛弧高（px）
export const FX_COIN_ARC = 26;                   // 金币扇形铺开半宽（px）
export const FX_COIN_S = 2.2;                    // 金币动效缩放（原 1 倍在手机静帧下太小）
/* 升级：脚手架 → 落成 → 逐层点亮 */
export const FX_UPGRADE_MS = 640;
export const FX_SCAFFOLD_MS = 220;
export const FX_SCAFFOLD_S0 = 0.6;
export const FX_SCAFFOLD_S = 2.2;                // 脚手架落定缩放（30×34 → 66×75）
export const FX_PER_LEVEL_LIT_MS = 180;
export const FX_LIT_S = 2;                       // 逐层点亮火花落定缩放
export const FX_LEVEL_STEP = 26;                 // 逐层点亮的每级纵向间隔（px）
/* 收租：金币飞行 + 数字滚动 */
export const FX_RENT_MS = 520;
export const FX_BURST_MS = 320;                  // 落点火花时长（rent 专用，与 end 的铺开分开）
/* 卡牌：翻面入场 + 高光扫过（卡面放大 2 倍并翻至可读角度，原 8×12 碎片不可辨） */
export const FX_CARD_MS = 480;
export const FX_CARD_S = 2;                      // 卡面动效缩放（66×88 → 132×176）
export const FX_FLIP_MS = 280;
export const FX_FLIP_SCALE_X = 0.08;             // 入场起点：横向收窄到近侧面（近似 3D）
export const FX_SHINE_MS = 260;
export const FX_SHINE_DX = 60;                   // 高光横扫位移（px）
/* 命运/机会：牌堆抽取 + 轻微震动 */
export const FX_DECK_MS = 420;
export const FX_DECK_S = 1.8;                    // 牌背动效缩放（66×88 → 119×158）
export const FX_SHAKE_MS = 200;
export const FX_SHAKE_AMP = 10;
/* 股票：折线抖动 + 红绿脉冲（用缩放/透明度脉冲表达，色由 skin 令牌管） */
export const FX_STOCK_MS = 460;
export const FX_PULSE_MS = 160;
export const FX_PULSE_S = 1.6;
export const FX_SHARD_S = 6;                     // 碎片（股票脉冲）动效缩放（原 2.6 太小，静帧不可辨）
/* —— M19-D3 落格特写（相机第④拍）：推近 → 脉冲环 → 停顿 → 回落点取景 —— */
export const FX_LAND_PUSH_MS = 320;              // 推近段时长（同时是脉冲环单次脉冲时长）
export const FX_LAND_PUNCH_MS = 400;             // 到位后停顿
export const FX_LAND_BACK_MS = 420;              // 回落点取景段时长
export const FX_LAND_MS = FX_LAND_PUSH_MS + FX_LAND_PUNCH_MS + FX_LAND_BACK_MS;   // 整段特写时长
export const FX_LAND_RING_S = 3.4;               // 脉冲环元素基础缩放
export const FX_LAND_PULSE_S = 2.2;              // 脉冲环峰值放大倍率
/* 破产/胜利：全屏特效 + 结算展开（火花铺开半径 ≈ 舞台半宽 → 铺满屏） */
export const FX_END_MS = 900;
export const FX_END_COUNT = 16;
export const FX_SPARK_MS = 620;
export const FX_SPARK_ARC = 210;
export const FX_END_S = 2.6;                     // 全屏火花落定缩放
/* —— M19-D5 破坏表现（旧层级建筑下沉 + 碎屑飞散） ——
   bomb / demolish 命中后的「建筑下沉」用**旧层级**元素 `building.s{slot}.l{oldLv}` 的幽灵副本承载
   （`paint()` 已按新 state 重画，真实棋盘此刻已无该楼）；碎屑另起 `fx.rubble` 扇形铺开。
   不触碰地砖与店招（`building.s{slot}.sign`）。 */
export const FX_WRECK_MS = 520;                  // 下沉时长
export const FX_WRECK_SINK = 0.7;                // 下沉比例（相对楼高）
export const FX_WRECK_GHOST_S = BUILDING_SCALE;  // 幽灵副本缩放（与棋盘楼体一致，基线对齐）
export const FX_RUBBLE_COUNT = 8;                // 碎屑数量
export const FX_RUBBLE_MS = 480;                 // 碎屑飞散时长
export const FX_RUBBLE_S = 3.4;                  // 碎屑元素缩放
export const FX_RUBBLE_ARC = 26;                 // 碎屑扇形铺开半宽（px）

/* 动效落点兜底（ctx 未给坐标时）：舞台中心 / 底坞骰位 / 橱窗卡面中心 */
export const FX_CENTER_X = STAGE_W / 2;
export const FX_CENTER_Y = STAGE_H / 2;
export const FX_DICE_CX = HUD_DICE_X0 + HUD_DICE_SIZE / 2;
export const FX_DICE_CY = HUD_DICE_Y + HUD_DICE_SIZE / 2;
export const FX_CARD_CX = PANEL_CARD_CX;
export const FX_CARD_CY = PANEL_CARD_CY;

/* —— M6 性能预算（spec §11.5）：门槛与口径 —— */
export const PERF_INTERACTIVE_BUDGET_MS = 3000;  // 首屏可交互（4G）
export const PERF_FRAME_P95_BUDGET_MS = 20;      // 帧间隔 p95（headless 代理）
export const PERF_DRAW_BUDGET = 200;             // 单帧绘制元素数

/* —— AI 驱动器（spec §5.3）—— */
export const AI_STEP_MS = 900;                   // 步间停顿（默认；AI 行走原来 450ms 太快，看不清前进过程）
export const AI_FAST_FACTOR = 2;                 // 「加速 ×2」倍率
export const AI_SKIP_MAX_STEPS = 64;             // skipRest 单次上限（防御性兜底）

/* —— 新手引导（spec §7.3）—— */
export const TUTORIAL_GAP = 12;                  // 气泡与高亮框边距

/* —— M11 音效与音乐（spec §7.1 / §8.1）：静音键键位 + 音量 + BGM 排程参数 ——
   本文件不在 `tools/check-hardcoded.mjs` 的 gate 作用域内（该 gate 只扫 `src/render/`），
   故裸时长 / 增益 / BPM 一律集中声明在这里——与 `FX_*` 的既有归置一致。 */
export const AUDIO_KEY_SIZE = 26;
/** 音效键左上角（390 − 8 − 26 − 6 − 26 = 324；与 `HUD_TOP_H = 30` 内的分享键 8..86 零冲突） */
export const AUDIO_SFX_BOX = { left: 324, top: 5 };
/** 音乐键左上角（390 − 8 − 26 = 356） */
export const AUDIO_BGM_BOX = { left: 356, top: 5 };

/* 音量（spec §8.2，可被 skin.json 的 sound.volume 覆盖） */
export const AUDIO_VOL_SFX = 0.8;
export const AUDIO_VOL_BGM = 0.35;

/* BGM 排程（spec §6.1：120 BPM → 1 拍 500ms；4 拍/小节 → 2s/小节；4 小节 → 8s 整段） */
export const AUDIO_BGM_BEATS_PER_BAR = 4;
export const AUDIO_BGM_BARS = 4;
export const AUDIO_BGM_BEAT_MS = 500;
export const AUDIO_BGM_BASS_MS = 800;              // 低音衰减
export const AUDIO_BGM_BASS_ATTACK_MS = 20;        // 低音起音
export const AUDIO_BGM_PAD_ATTACK_MS = 300;        // 三和弦起音
export const AUDIO_BGM_PAD_GAIN = 0.35;            // 铺底相对增益
export const AUDIO_BGM_LOOKAHEAD_MS = 100;         // 排程器轮询间隔
export const AUDIO_BGM_SCHEDULE_AHEAD_S = 0.3;     // 提前排程窗口

/* —— 相机取景（spec：2026-10-01-monopoly-camera-framing）——
   `src/render/camera.ts` 处于「禁写死」gate 作用域内，
   故裸倍率 / 时长 / 边距一律集中在此（本文件不在 gate 内）。 */
export const CAM_VIEW_TOP = 34;                   // = BOARD_TOP，顶带 HUD_TOP_H(30) 之下
export const CAM_VIEW_BOTTOM = 606;               // = DOCK_Y，底坞之上
export const CAM_VIEW_CX = STAGE_W / 2;           // 195
export const CAM_VIEW_CY = (CAM_VIEW_TOP + CAM_VIEW_BOTTOM) / 2;   // 320
export const CAM_VIEW_W = STAGE_W;                // 390
export const CAM_VIEW_H = CAM_VIEW_BOTTOM - CAM_VIEW_TOP;          // 572
export const CAM_IDLE_ZOOM = 1;                   // 静止态 = 恒等变换（首屏零回归）
export const CAM_MIN_ZOOM = 1.6;                  // 低于此值判为「退化」，跳过起势段
export const CAM_MAX_ZOOM = 4;                    // 单格取景理论值 4.53，封顶防过近
export const CAM_FOLLOW_ZOOM = 3.6;               // 跟拍段固定倍率（可见 ≈2.5 格宽 × 4.4 格高）
export const CAM_LAND_ZOOM = 3.2;                 // 落格特写推近倍率
export const CAM_TILE_PAD = 1;                    // 取景外扩格数
export const CAM_DEGRADE_EPS = 0.02;              // fit 与 CAM_MIN_ZOOM 的容差（浮点）
export const CAM_LEAD_MS = 380;
export const CAM_PUSH_MS = 420;                   // 退化时「全景 → 跟拍」的过渡
export const CAM_SETTLE_MS = 320;
export const CAM_BACK_MS = 520;
export const CAM_MAX_TOTAL_MS = 1600;             // ①+③+④ 编排开销上限（② 与 fx 共时轴，不可压缩）
export const CAM_AI_SCALE = 0.6;                  // AI 回合取景时长压缩比
export const CAM_FALLBACK_MAX_ZOOM = 3;           // R3 降级档：`?perf=1` 实测帧超预算时把倍率上限降到 3.0
export const CAM_EASE = FX_EASE_FALLBACK;

/* —— 拆层（DOM 空间）：`#mono-world` 走 fitStage()，`#mono-ui` 走 fitUi() —— */
export const UI_BREAK_W = 900;                    // ≥ 此宽度视为桌面：UI 不再跟 min() 一起缩
export const UI_SIDE_W = 220;                     // 桌面常驻侧栏宽度（侧栏空间下限）
export const UI_MIN_HIT = 44;                     // 按钮命中高下限（逻辑布局口径）
export const UI_MIN_FONT = 12;                    // 正文最小字号

/* —— 烘焙（与相机共存）—— */
export const BAKE_DPR_CAP = 2;                    // 仅用于 RenderTexture；主画布 resolution 不动