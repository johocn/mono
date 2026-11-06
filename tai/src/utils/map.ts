/**
 * 地图与导航工具
 * - SDK：腾讯位置服务 JS API GL（key 由构建期 VITE_QQMAP_KEY 注入，复用现有腾讯地图 key）
 * - 导航：优先高德 URI（无需 key），无 key / SDK 失败时仍可打开地图
 */
import { t } from '@/locales/zh-CN'

export interface NavTarget {
  lat?: number | null
  lng?: number | null
  name?: string
  address?: string
  mapUrl?: string
}

const AMAP_NAV_ENDPOINT = 'https://uri.amap.com/navigation'
const AMAP_MARKER_ENDPOINT = 'https://uri.amap.com/marker'
const AMAP_SEARCH_ENDPOINT = 'https://uri.amap.com/search'
const QQMAP_GL_JS = 'https://map.qq.com/api/gljs?v=1.exp&libraries=service'
const NAV_SRC = 'tire-storage'

/** 腾讯 key：构建期注入，未配置则返回空串（走无 SDK 兜底） */
export function getMapKey(): string {
  const env = (import.meta as any).env || {}
  return String(env.VITE_QQMAP_KEY || '').trim()
}

/** 经纬度为有效数值（排除空值与 0,0 占位） */
export function hasValidCoords(target: NavTarget): boolean {
  const lat = Number(target.lat)
  const lng = Number(target.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat === 0 && lng === 0) return false
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function destinationName(target: NavTarget): string {
  return target.name || target.address || t('location.destination')
}

function encode(value: string): string {
  return encodeURIComponent(value)
}

/** 高德导航 URI：无需 key，directly 唤起高德/浏览器 */
export function buildAmapNavigationUrl(target: NavTarget): string | null {
  if (!hasValidCoords(target)) return null
  const name = destinationName(target)
  return (
    `${AMAP_NAV_ENDPOINT}?to=${target.lng},${target.lat},${encode(name)}` +
    `&mode=car&coordinate=gaode&callnative=1&src=${NAV_SRC}`
  )
}

/** 高德标记 URI：仅展示位置，用于兜底查看 */
export function buildAmapMarkerUrl(target: NavTarget): string | null {
  if (!hasValidCoords(target)) return null
  const name = destinationName(target)
  return `${AMAP_MARKER_ENDPOINT}?position=${target.lng},${target.lat}&name=${encode(name)}&src=${NAV_SRC}`
}

/** 仅有地址文本时，用高德搜索兜底（仍无需 key） */
export function buildAmapSearchUrl(address: string): string | null {
  const keyword = String(address || '').trim()
  if (!keyword) return null
  return `${AMAP_SEARCH_ENDPOINT}?keyword=${encode(keyword)}&city=${encode('长春')}&src=${NAV_SRC}`
}

export interface NavigationResult {
  url: string
  kind: 'navigation' | 'marker' | 'custom' | 'search'
}

/** 解析可用导航地址：坐标导航 → 后台地图链接 → 地址搜索 */
export function resolveNavigation(target: NavTarget): NavigationResult | null {
  const nav = buildAmapNavigationUrl(target)
  if (nav) return { url: nav, kind: 'navigation' }

  const custom = String(target.mapUrl || '').trim()
  if (/^https?:\/\//i.test(custom)) return { url: custom, kind: 'custom' }

  const search = buildAmapSearchUrl(target.address || '')
  if (search) return { url: search, kind: 'search' }

  return null
}

/** 在 H5 中打开外部地图链接；失败时复制链接 */
export function openExternalUrl(url: string): void {
  if (!url) return
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    window.location.href = url
    return
  }
  uni.setClipboardData({
    data: url,
    success: () => uni.showToast({ title: t('common.mapLinkCopied'), icon: 'none' }),
  })
}

/** 打开导航，返回实际打开的 URL（便于埋点/验证） */
export function openNavigation(target: NavTarget): string | null {
  const result = resolveNavigation(target)
  if (!result) {
    uni.showToast({ title: t('location.unavailable'), icon: 'none' })
    return null
  }
  openExternalUrl(result.url)
  return result.url
}

declare global {
  interface Window {
    TMap?: any
  }
}

let sdkPromise: Promise<any | null> | null = null

/** 动态加载腾讯地图 GL JS，失败/超时返回 null（调用方走兜底视图） */
export function loadTencentMapSdk(key: string, timeoutMs = 8000): Promise<any | null> {
  if (!key || typeof window === 'undefined') return Promise.resolve(null)
  if (window.TMap) return Promise.resolve(window.TMap)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<any | null>((resolve) => {
    const scriptId = 'tire-map-sdk'
    let settled = false
    const finish = (value: any | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (!value) {
        sdkPromise = null
        const failed = document.getElementById(scriptId)
        if (failed) failed.remove()
      }
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    const ready = () => finish(window.TMap || null)

    const existing = document.getElementById(scriptId) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', ready)
      existing.addEventListener('error', () => finish(null))
      return
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.async = true
    script.src = `${QQMAP_GL_JS}&key=${encode(key)}`
    script.addEventListener('load', ready)
    script.addEventListener('error', () => finish(null))
    document.head.appendChild(script)
  })

  return sdkPromise
}
