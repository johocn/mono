/** 统一登录（h.joho.cn SSO）：浏览与下单无需登录，仅查看订单时按需登录 */
const SSO_ORIGIN = 'https://h.joho.cn'
const SSO_API = 'https://h.joho.cn/api/zhao-sso/v1'
const SSO_APP_CODE = 'default'
const TOKEN_KEY = 'tire_sso_token'
const USER_KEY = 'tire_sso_user'
const OPENID_KEY = 'tire_sso_openid'
const REDIRECT_KEY = 'tire_sso_redirect_uri'

export interface SsoUser {
  phone: string
  nickname?: string
}

export function getSsoToken(): string {
  return String(uni.getStorageSync(TOKEN_KEY) || '')
}

export function getSsoUser(): SsoUser | null {
  const raw = uni.getStorageSync(USER_KEY)
  if (!raw || typeof raw !== 'object') return null
  const phone = String((raw as any).phone || '')
  if (!phone) return null
  return { phone, nickname: String((raw as any).nickname || '') }
}

export function saveSsoToken(token: string): void {
  uni.setStorageSync(TOKEN_KEY, token)
}

export function saveSsoUser(user: SsoUser): void {
  uni.setStorageSync(USER_KEY, user)
}

export function clearSsoSession(): void {
  uni.removeStorageSync(TOKEN_KEY)
  uni.removeStorageSync(USER_KEY)
  uni.removeStorageSync(OPENID_KEY)
}

/** 微信 openid（公众号网页授权登录后由 SSO /user/me 透出；未绑定为空） */
export function getSsoOpenid(): string {
  return String(uni.getStorageSync(OPENID_KEY) || '')
}

export function saveSsoOpenid(openid: string): void {
  if (openid) uni.setStorageSync(OPENID_KEY, openid)
}

/** 登录后拉取 SSO 用户信息，缓存 openid 供微信 JSAPI 下单使用；失败不影响登录 */
function syncSsoProfile(): Promise<void> {
  const token = getSsoToken()
  if (!token) return Promise.resolve()
  return new Promise<void>((resolve) => {
    uni.request({
      url: `${SSO_API}/user/me`,
      method: 'GET',
      header: { Authorization: `Bearer ${token}` },
      timeout: 15000,
      success: (res: any) => {
        const status = Number(res.statusCode) || 0
        if (status >= 200 && status < 300) {
          saveSsoOpenid(String((res.data || {}).openid || ''))
        }
        resolve()
      },
      fail: () => resolve(),
    })
  })
}

export function authHeader(): Record<string, string> {
  const token = getSsoToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** 登录完成后回到当前页面（保留 hash 路由与已有参数） */
function currentPageUrl(): string {
  if (typeof location === 'undefined') return ''
  const hash = String(location.hash || '').split('?')[0]
  return `${location.origin}${location.pathname}${location.search}${hash}`
}

/** 是否在微信内置浏览器（公众号网页授权只在该环境可用） */
export function isWechatBrowser(): boolean {
  return typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent)
}

/** 跳转统一登录；微信内走公众号网页授权（同一 AppID 登录），非微信走 SSO 登录页 */
export function goSsoLogin(): void {
  const returnUrl = currentPageUrl()
  if (isWechatBrowser() && typeof location !== 'undefined') {
    // 记录回跳地址：exchange-token 需要与授权时完全一致的 redirect_uri
    uni.setStorageSync(REDIRECT_KEY, returnUrl)
    const params = new URLSearchParams({
      app_code: SSO_APP_CODE,
      app_type: 'official_account',
      scope: 'snsapi_base',
      redirect_uri: returnUrl,
    })
    location.href = `${SSO_API}/auth/wechat?${params.toString()}`
    return
  }
  const params = [`app_code=${encodeURIComponent(SSO_APP_CODE)}`]
  if (returnUrl) params.push(`return_url=${encodeURIComponent(returnUrl)}`)
  if (typeof location !== 'undefined') {
    location.href = `${SSO_ORIGIN}/#/pages/sso/login?${params.join('&')}`
  }
}

/** 从地址栏（search 或 hash 查询串）读取回跳参数 */
function readCallbackParam(key: string): string {
  if (typeof location === 'undefined') return ''
  const fromSearch = new URLSearchParams(location.search).get(key) || ''
  if (fromSearch) return fromSearch
  const hash = String(location.hash || '')
  const fromHashQuery = new URLSearchParams(hash.split('?')[1] || '').get(key) || ''
  if (fromHashQuery) return fromHashQuery
  const loose = hash.match(new RegExp(`[?&]${key}=([^&]+)`))
  return loose ? decodeURIComponent(loose[1]) : ''
}

/** 统一登录回跳时 token 位于 hash 查询串（如 #/pages/order/query?token=xxx） */
export function readSsoCallbackToken(): string {
  return readCallbackParam('token')
}

/** 公众号网页授权回跳时携带的授权码 */
export function readSsoCallbackCode(): string {
  return readCallbackParam('code')
}

/** 统一登录回跳时的错误信息 */
export function readSsoCallbackError(): string {
  return readCallbackParam('error')
}

/** 用授权码换取 SSO token（后端按 app_code 自查 app_secret） */
function exchangeSsoCode(code: string, redirectUri: string): Promise<{ access_token?: string }> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${SSO_API}/auth/exchange-token`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      timeout: 15000,
      data: { code, app_code: SSO_APP_CODE, redirect_uri: redirectUri },
      success: (res: any) => {
        const status = Number(res.statusCode) || 0
        if (status >= 200 && status < 300) {
          resolve((res.data || {}) as { access_token?: string })
          return
        }
        const body = res.data || {}
        reject(new Error(String(body.error_description || body.error || '登录失败')))
      },
      fail: () => reject(new Error('网络异常，请稍后重试')),
    })
  })
}

/**
 * 处理登录回跳：优先取 token 直传回跳，其次用公众号授权码换 token。
 * 返回 true 表示本次加载完成了一次登录。
 */
export async function completeSsoLogin(): Promise<boolean> {
  const token = readSsoCallbackToken()
  if (token) {
    saveSsoToken(token)
    cleanSsoCallbackUrl()
    await syncSsoProfile()
    return true
  }
  const code = readSsoCallbackCode()
  if (!code) {
    const error = readSsoCallbackError()
    if (error) {
      cleanSsoCallbackUrl()
      uni.showToast({ title: error, icon: 'none' })
    }
    return false
  }
  const redirectUri = String(uni.getStorageSync(REDIRECT_KEY) || currentPageUrl())
  try {
    const result = await exchangeSsoCode(code, redirectUri)
    if (!result?.access_token) throw new Error('登录失败')
    saveSsoToken(result.access_token)
    uni.removeStorageSync(REDIRECT_KEY)
    cleanSsoCallbackUrl()
    await syncSsoProfile()
    return true
  } catch (error) {
    cleanSsoCallbackUrl()
    uni.showToast({ title: (error as Error)?.message || '登录失败', icon: 'none' })
    return false
  }
}

/** 取走 token 后清理地址栏，避免刷新时重复回调 */
export function cleanSsoCallbackUrl(): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return
  const search = new URLSearchParams(location.search)
  search.delete('token')
  search.delete('user')
  search.delete('code')
  search.delete('state')
  search.delete('error')
  const searchText = search.toString()

  const hash = String(location.hash || '')
  const [hashPath, hashQuery] = hash.split('?')
  const hashParams = new URLSearchParams(hashQuery || '')
  hashParams.delete('token')
  hashParams.delete('user')
  hashParams.delete('code')
  hashParams.delete('state')
  hashParams.delete('error')
  const hashText = hashParams.toString()
  const cleanPath = hashPath
    .replace(/&token=[^&]*/g, '')
    .replace(/&user=[^&]*/g, '')
    .replace(/&isNew=[^&]*/g, '')
    .replace(/&refresh_token=[^&]*/g, '')
    .replace(/&expires_in=[^&]*/g, '')
    .replace(/&code=[^&]*/g, '')
    .replace(/&state=[^&]*/g, '')
    .replace(/&error=[^&]*/g, '')

  const next = `${location.pathname}${searchText ? `?${searchText}` : ''}${cleanPath}${
    hashText ? `?${hashText}` : ''
  }`
  history.replaceState(history.state, '', next)
}

