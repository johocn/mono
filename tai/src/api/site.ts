import { request } from './http'

export interface MediaFile {
  id?: number
  name?: string
  url?: string
  width?: number
  height?: number
  alternativeText?: string
  caption?: string
}

export interface SiteConfig {
  bannerTitle?: string
  bannerSubtitle?: string
  bannerImage?: MediaFile | null
  serviceIntro?: string
  warehouseConditions?: string
  guarantees?: any
  serviceAreaText?: string
  warehouseAddress?: string
  warehouseLat?: number
  warehouseLng?: number
  mapUrl?: string
  contactPhone?: string
  wechatQr?: MediaFile | null
  dailyPickupLimitMorning?: number
  dailyPickupLimitAfternoon?: number
  paymentOnlineEnabled?: boolean
  depositEnabled?: boolean
  depositRatio?: number
  agreementText?: string
  maxStorageDate?: string
  announcement?: string
}

export interface TirePackage {
  id: number
  name: string
  code?: string
  baseMonths?: number
  storePrice?: number
  pickupPrice?: number
  extraMonthPrice?: number
  overdueDayPrice?: number
  durationText?: string
  highlights?: any
  enabled?: boolean
  sort?: number
}

export interface TireAddon {
  id: number
  name: string
  code: string
  price: number
  unitText?: string
  enabled?: boolean
  sort?: number
}

export interface Faq {
  id: number
  question: string
  answer: string
  sort?: number
}

export interface Review {
  id: number
  nickname?: string
  content?: string
  rating?: number
  showOnHome?: boolean
  sort?: number
}

export interface GalleryItem {
  id: number
  image?: MediaFile | null
  caption?: string
  sort?: number
}

export interface SiteData {
  config: SiteConfig
  packages: TirePackage[]
  addons: TireAddon[]
  faqs: Faq[]
  reviews: Review[]
  gallery: GalleryItem[]
}

export type SlotName = 'morning' | 'afternoon'

export interface SlotUsage {
  date: string
  slot: SlotName
  limit: number
  used: number
  remaining: number
}

export interface SlotsResult {
  date: string
  morning: SlotUsage
  afternoon: SlotUsage
}

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

/** GET /site：配置 + 套餐 + 增值项 + FAQ + 评价 + 相册，统一做空值兜底 */
export async function getSite(): Promise<SiteData> {
  const data = await request<any>('/site')
  return {
    config: data?.config && typeof data.config === 'object' ? data.config : {},
    packages: asArray<TirePackage>(data?.packages),
    addons: asArray<TireAddon>(data?.addons),
    faqs: asArray<Faq>(data?.faqs),
    reviews: asArray<Review>(data?.reviews),
    gallery: asArray<GalleryItem>(data?.gallery),
  }
}

const emptyUsage = (date: string, slot: SlotName): SlotUsage => ({
  date,
  slot,
  limit: 0,
  used: 0,
  remaining: 0,
})

/** GET /slots?date=YYYY-MM-DD */
export async function getSlots(date: string): Promise<SlotsResult> {
  const data = await request<any>('/slots', { data: { date } })
  return {
    date: data?.date || date,
    morning: data?.morning || emptyUsage(date, 'morning'),
    afternoon: data?.afternoon || emptyUsage(date, 'afternoon'),
  }
}

export async function getAgreement(): Promise<string> {
  const data = await request<any>('/agreement')
  return typeof data?.agreementText === 'string' ? data.agreementText : ''
}

export async function getFaqs(): Promise<Faq[]> {
  const data = await request<any>('/faqs')
  return asArray<Faq>(data?.faqs)
}
