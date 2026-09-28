/**
 * 分享 / 裂变（M8）文案与配置的唯一来源。
 *
 * 约定（沿 M1–M7 的既有做法）：页面上出现的**展示文案集中放 `src/data/*`**，
 * 待后续接入 i18n 字典时一处替换（见 `src/data/board.ts` 的同类注释）；渲染层不得写死文案。
 * 本文件不依赖 DOM / 引擎，可被单测直接引用。
 */

/** 分享图版本常量：改图时递增 —— 用于破微信对分享卡（标题/描述/图一体）的长 TTL 缓存 */
export const SHARE_VERSION = 'v1';

/** 分享缩略图（随部署整包发布到 `public/share/`，线上 = `https://game.joho.cn/tour/share/share-card.png`） */
export const SHARE_IMAGE_PATH = 'share/share-card.png';

/** 分享图尺寸（5:4；由 `tools/gen-share-card.mjs` 产出，og:image:width/height 引用同一真源） */
export const SHARE_IMAGE_W = 800;
export const SHARE_IMAGE_H = 640;

/** 站点名（og:site_name） */
export const SHARE_SITE_NAME = '双阳邻里大富翁';

/**
 * 微信 JS-SDK 签名端点（zhao-sso 插件，见 `strapi/plugins/zhao-sso/server/src/routes/api.ts`）。
 * `POST { url, appType }` → `{ appId, timestamp, nonceStr, signature }`；服务端缓存 access_token / jsapi_ticket。
 * 生产机 host：`h.joho.cn`（SSO 主域，`/api/zhao-sso` 反代到 strapi:1337）；CORS 反射 `game.joho.cn` 已实测放行。
 */
export const SSO_JSSDK_ENDPOINT = 'https://h.joho.cn/api/zhao-sso/v1/auth/jssdk-signature';

/** 微信 JS-SDK 官方脚本 */
export const WECHAT_SDK_SRC = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';

/** 常驻分享 CTA（HUD 顶栏留白带左端；不压底坞 / 浮层 / 橱窗 / 棋盘）*/
export const SHARE_CTA_LABEL = '分享';
export const SHARE_SHEET_TITLE = '分享给街坊';

/** 邀请文案（常驻） */
export const SHARE_INVITE = {
  title: '双阳邻里大富翁 · 掷骰逛遍 32 家街坊好店',
  desc: '吉林双阳的邻里商业版大富翁：买地、升级、收租、炒股，一局打完看谁是街坊首富。',
};

/** 降级提示（非微信 / 未配安全域名 / 签名不可用时） */
export const SHARE_FALLBACK_HINT = '复制链接发给微信好友 / 微信群；在微信内打开可自动生成分享卡片。';
export const SHARE_WECHAT_HINT = '点右上角「…」发送给朋友或分享到朋友圈。';
export const SHARE_COPY_LINK = '复制链接';
export const SHARE_COPIED = '已复制';
export const SHARE_COPY_RESULT = '复制战绩';

/** 终局战绩文案（`win` = 本地玩家「你」是否为胜者；`worth` = 净资产） */
export function shareResultText(win: boolean, worth: number): { title: string; desc: string } {
  const money = `￥${Math.round(worth)}`;
  return win
    ? {
      title: `我在双阳邻里大富翁里赢麻了（净资产 ${money}）`,
      desc: `买地收租一路领先，32 家街坊店都在我名下。来一局看你能撑到第几轮？`,
    }
    : {
      title: `我在双阳邻里大富翁里被街坊们收了租（净资产 ${money}）`,
      desc: `一局打完发现好店都被抢光了。你也来试试手气？`,
    };
}
