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
/** 快捷键顶边 y；中心 = HUD_LABEL_Y（状态行中心），即右侧 211..359 / 287..359 */
export const HUD_QK_Y = 607;
/** AI 回合把状态行文字左移，给右侧快捷键让位 */
export const HUD_LABEL_SHIFT_X = -90;
/** 性格徽标相对资产条中心的偏移（贴右上角，右缘与资产条右缘齐平） */
export const HUD_PERSONA_DX = 26;
export const HUD_PERSONA_DY = -11;

/** 默认皮肤几何（= public/skins/default/skin.json 的 geo；供渲染层免写死引用） */
export const DEFAULT_GEO = { hw: 24, hh: 13, ox: 195, oy: 104 };

/* —— 楼顶名牌（spec §6.2/§6.3）：纵向被 2×hh=26 / 13 锁死，故胶囊 h=13、字号靠横向吃满格宽 —— */
export const LABEL_ROOF = { fs: 10, fsShort: 11, fsNarrow: 8, padX: 6, h: 13, rx: 6, lift: 5, strokeW: 1.1 };
/** 地面字牌排版（`drawLabels` 第 4 参；原 main.ts 的 LABEL_PARAMS 迁入此处） */
export const LABEL_GROUND = { dy: 0.46, fs: 6.2, padX: 5, padTop: 6.6, h: 9.4, rx: 3.2 };
export const LABEL_CURRENT_SCALE = 1.25;
export const LABEL_MAX_CHARS = 4;            // >4 字截断加 '…'

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

/* —— 停留气泡（spec §6.7）：锚在棋子头顶上方 8px —— */
export const BUBBLE_W = 100;
export const BUBBLE_H = 44;
export const BUBBLE_GAP = 8;

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

/* —— play 版式中部橱窗（spec §6 版式 A「中 = 当前地块橱窗」）——
   棋盘底 ≈ 276，底坞顶 = DOCK_Y(606)，中间条带 ≈ 300..606；橱窗**完整复用** B 版式构图（§3.5）与
   同名注册表元素（showcase.panel/sky/skyline/ground/tree/lamp/shop/sign/lantern/banner/hud）。
   手牌行（PANEL_HAND_Y = 550 .. 602）落在条带下部，而 B 版式的信息条默认在面板内 248..286
   （play 下 = 548..586，正好压住手牌行），故把它整体上移到楼体基座处（248 → 208，即 508..546），
   紧贴手牌行上沿而不重叠；CTA 金按钮在 play 版式下不画（棋盘上已有真实买卖键）。 */
export const PLAY_SHOWCASE_Y = 300;              // 橱窗面板左上角 y（与 B 版式同 x=10）
export const PLAY_HUD_BAR_DY = -40;              // 信息条相对默认位上移（默认 248 → 208，落在手牌行之上）
export const PLAY_SHOP_S = 2.6;                  // 楼体缩放（略收小，让楼顶落在面板之内）

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
/* 移动：逐格跳跃 + 落尘（棋子放大 2.2 倍，原棋盘棋子 0.62 缩放太小于静帧不可辨） */
export const FX_HOP_MS = 320;
export const FX_HOP_ARC = 52;                    // 腾空弧高（px）
export const FX_HOP_S = 2.2;                     // 棋子动效缩放
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
/* 破产/胜利：全屏特效 + 结算展开（火花铺开半径 ≈ 舞台半宽 → 铺满屏） */
export const FX_END_MS = 900;
export const FX_END_COUNT = 16;
export const FX_SPARK_MS = 620;
export const FX_SPARK_ARC = 210;
export const FX_END_S = 2.6;                     // 全屏火花落定缩放

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
export const AI_STEP_MS = 450;                   // 步间停顿（默认）
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