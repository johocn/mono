import { t } from '@/locales/zh-CN'

/** H5 站点根地址（hash 路由），不读取 window 专有字段以外的能力 */
function siteOrigin(): string {
  if (typeof location === 'undefined') return ''
  return `${location.origin}${location.pathname}`
}

export function pageLink(path: string): string {
  return `${siteOrigin()}#${path}`
}

export function detailLink(orderNo: string, phone?: string | null): string {
  const query = phone
    ? `?no=${encodeURIComponent(orderNo)}&phone=${encodeURIComponent(phone)}`
    : `?no=${encodeURIComponent(orderNo)}`
  return pageLink(`/pages/order/detail${query}`)
}

/** 复制文本，失败时弹窗给出可手动复制的全文 */
export function copyText(text: string, successTip?: string): void {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: successTip || t('common.copied'), icon: 'none' }),
    fail: () => {
      uni.showModal({
        title: t('common.copyFailed'),
        content: text,
        showCancel: false,
        confirmText: t('common.close'),
      })
    },
  })
}

/** 保存二维码图片：H5 触发下载；失败或非 H5 时提示长按保存 */
export function saveImageDataUrl(dataUrl: string, filename: string): void {
  try {
    if (typeof document !== 'undefined') {
      const anchor = document.createElement('a')
      anchor.href = dataUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      uni.showToast({ title: t('common.copied'), icon: 'none' })
      return
    }
  } catch (error) {
    // 进入兜底提示
  }
  uni.showModal({
    title: t('common.saveQr'),
    content: t('detail.qrSaveTip'),
    showCancel: false,
    confirmText: t('common.close'),
  })
}
