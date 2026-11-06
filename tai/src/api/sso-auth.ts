import { API_BASE, ApiError } from './http'

/** 统一登录（zhao-sso）接口前缀，与轮胎插件的 /api/zhao-tire/v1 不同 */
const SSO_PREFIX = '/api/zhao-sso/v1'
const APP_CODE = 'default'

function post<T = any>(path: string, data: Record<string, any>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: `${API_BASE}${SSO_PREFIX}${path}`,
      method: 'POST',
      data,
      timeout: 15000,
      header: { 'Content-Type': 'application/json' },
      success: (res: any) => {
        const status = Number(res.statusCode) || 0
        if (status >= 200 && status < 300) {
          resolve(res.data as T)
          return
        }
        const body = res.data || {}
        reject(new ApiError(String(body.code || 'SSO_ERROR'), String(body.error || body.message || '请求失败'), status))
      },
      fail: () => reject(new ApiError('NETWORK_ERROR', '网络异常，请稍后重试', 0)),
    })
  })
}

export interface SmsSendResult {
  sent: boolean
  provider?: string
  ttlMinutes?: number
  error?: string
}

export interface SsoLoginResult {
  access_token: string
  refresh_token?: string
  user?: { mobile?: string; nickname?: string; [key: string]: any }
}

/** 发送登录验证码（复用 SSO 既有 /v1/auth/send-sms） */
export function sendLoginSms(mobile: string): Promise<SmsSendResult> {
  return post<SmsSendResult>('/auth/send-sms', { mobile, scene: 'login' })
}

/** 手机号 + 验证码登录 */
export function loginBySms(mobile: string, code: string): Promise<SsoLoginResult> {
  return post<SsoLoginResult>('/auth/login', {
    type: 'sms',
    identifier: mobile,
    code,
    app_code: APP_CODE,
  })
}
