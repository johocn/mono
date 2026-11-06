import { t } from '@/locales/zh-CN'

export const PHONE_PATTERN = /^1[3-9]\d{9}$/

export function isPhone(value?: string | null): boolean {
  return PHONE_PATTERN.test(String(value || '').trim())
}

/** 展示端脱敏：138****1234 */
export function maskPhone(value?: string | null): string {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.length >= 7) return `${text.slice(0, 3)}****${text.slice(-4)}`
  return text.replace(/./g, '*')
}

/** 拨号容错：失败时复制号码，避免微信内置浏览器无拨号能力 */
export function callPhone(phone?: string | null): void {
  const number = String(phone || '').trim()
  if (!number) {
    uni.showToast({ title: t('common.phoneMissing'), icon: 'none' })
    return
  }
  uni.makePhoneCall({
    phoneNumber: number,
    fail: () => {
      uni.setClipboardData({
        data: number,
        success: () => uni.showToast({ title: t('common.callFailedCopy'), icon: 'none' }),
        fail: () => uni.showToast({ title: t('common.copyFailed'), icon: 'none' }),
      })
    },
  })
}
