/**
 * 消消乐（岁月神偷：脑力花园）微信内 JS-SDK 分享
 *
 * - 仅微信内生效（UA 检测），其他环境静默跳过
 * - 签名接口：https://api.yourbao.cn/wechat-auth/jssdk-signature?url=<当前页URL>
 * - 自定义右上角转发卡片（发朋友/朋友圈）
 * - 游戏内可调用 window.__setWechatShare({ title, desc, link, imgUrl }) 动态更新
 */
(function () {
    'use strict';

    var ua = navigator.userAgent || '';
    if (!/MicroMessenger/i.test(ua)) return;

    // 分享默认内容
    var share = {
        title: '岁月神偷：脑力花园',
        desc: '消消乐 · 认知训练小游戏，来挑战你的记忆力！',
        link: 'https://game.yourbao.cn/tour/xxl/',
        imgUrl: 'https://game.yourbao.cn/tour/xxl/share.png'
    };

    function loadJweixin(cb) {
        var s = document.createElement('script');
        s.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';
        s.onload = cb;
        s.onerror = function () { /* 静默：非微信或网络异常 */ };
        document.head.appendChild(s);
    }

    function applyShare() {
        if (!window.wx) return;
        window.wx.config({
            debug: false,
            appId: window.__WX_SIGN__.appId,
            timestamp: window.__WX_SIGN__.timestamp,
            nonceStr: window.__WX_SIGN__.nonceStr,
            signature: window.__WX_SIGN__.signature,
            jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData']
        });
        window.wx.ready(function () {
            // 发给朋友（标题+描述+图）
            window.wx.updateAppMessageShareData({
                title: share.title,
                desc: share.desc,
                link: share.link,
                imgUrl: share.imgUrl
            });
            // 朋友圈（仅标题+图）
            window.wx.updateTimelineShareData({
                title: share.title,
                link: share.link,
                imgUrl: share.imgUrl
            });
        });
    }

    function init() {
        // 微信签名校验 URL 不含 hash
        var pageUrl = window.location.href.split('#')[0];
        fetch('https://api.yourbao.cn/wechat-auth/jssdk-signature?url=' + encodeURIComponent(pageUrl))
            .then(function (r) {
                if (!r.ok) throw new Error('sign http ' + r.status);
                return r.json();
            })
            .then(function (sign) {
                if (!sign || !sign.signature) throw new Error('bad sign');
                window.__WX_SIGN__ = sign;
                loadJweixin(applyShare);
            })
            .catch(function () { /* 静默：分享退化为微信默认抓取 */ });
    }

    // 供游戏动态更新分享内容（如「来挑战我第 N 关」）
    window.__setWechatShare = function (patch) {
        for (var k in patch) if (share.hasOwnProperty(k)) share[k] = patch[k];
        if (window.wx) applyShare();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
