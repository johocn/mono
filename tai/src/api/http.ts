import { t } from '@/locales/zh-CN'

/** 开发默认指向本地 Strapi；生产用相对路径，便于同域部署 */
const RAW_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:1337'
).replace(/\/+$/, '')

/** 插件 content-api 路由前缀 */
export const API_PREFIX = '/api/zhao-tire/v1'

export const API_BASE = RAW_BASE

/** 把 Strapi 返回的相对媒体地址补全为可访问地址 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return ''
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }
  if (!RAW_BASE) return url
  return `${RAW_BASE}${url.startsWith('/') ? '' : '/'}${url}`
}

export class ApiError extends Error {
  code: string
  status: number
  details?: any

  constructor(code: string, message: string, status = 0, details?: any) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  method?: HttpMethod
  data?: Record<string, any>
  timeout?: number
  header?: Record<string, string>
}

const errorMessage = (code: string, fallback?: string): string => {
  const localized = t(`errors.${code}`)
  if (localized !== `errors.${code}`) return localized
  return fallback || t('errors.INTERNAL_ERROR')
}

function buildError(body: any, status: number): ApiError {
  const code = typeof body?.code === 'string' && body.code ? body.code : 'INTERNAL_ERROR'
  return new ApiError(
    code,
    errorMessage(code, typeof body?.message === 'string' ? body.message : undefined),
    status,
    body?.details,
  )
}

/** 统一请求：错误体为 { code, message, details? }，默认 15s 超时 */
export function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${RAW_BASE}${API_PREFIX}${path}`
  return new Promise<T>((resolve, reject) => {
    uni.request({
      url,
      method: options.method || 'GET',
      data: options.data,
      timeout: options.timeout ?? 15000,
      header: {
        'Content-Type': 'application/json',
        ...(options.header || {}),
      },
      success: (res: any) => {
        const status = Number(res.statusCode) || 0
        if (status >= 200 && status < 300) {
          resolve(res.data as T)
          return
        }
        reject(buildError(res.data, status))
      },
      fail: (err: any) => {
        const isTimeout = /timeout/i.test(String(err?.errMsg || ''))
        reject(
          new ApiError(
            isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
            errorMessage(isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR'),
            0,
          ),
        )
      },
    })
  })
}

/** 给页面统一展示错误文案 */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return t('common.unknownError')
}
