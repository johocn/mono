import { request } from './http'
import type { MediaFile, SlotName, TireAddon, TirePackage } from './site'

export type CarType = 'sedan' | 'suv' | 'pickup'
export type ServiceType = 'store' | 'pickup'

export type PaymentMethod = 'wechat' | 'store_pay' | 'pickup_pay' | 'deposit' | 'full'

export interface CreateOrderPayload {
  clientToken: string
  customerName: string
  phone: string
  plateNo?: string
  carType: CarType
  tireSpec?: string
  withWheelRim: boolean
  serviceType: ServiceType
  storageStartDate: string
  expectedReturnDate: string
  pickupDate?: string
  pickupSlot?: SlotName
  addonCodes?: string[]
  note?: string
  agreementAccepted: boolean
  referralCode?: string
  useFreeReward?: boolean
  paymentMethod?: PaymentMethod
  openid?: string
  deviceId?: string
}

export interface CreateOrderResult {
  orderNo: string
  amountTotal: number
  status: string
  isFree?: boolean
  freeReason?: string | null
  referralCode?: string | null
  duplicated?: boolean
  paymentMethod?: string
  rewardNo?: string | null
  rewardAmount?: number
}

export interface PackageSnapshot {
  id?: number
  name?: string
  code?: string
  baseMonths?: number
  storePrice?: number
  pickupPrice?: number
  extraMonthPrice?: number
  overdueDayPrice?: number
  durationText?: string
}

export interface OrderAddon extends TireAddon {
  price: number
}

export interface RenewalRecord {
  months: number
  amount: number
  paymentMethod?: string
  paidAt?: string | null
  newExpireAt?: string
  operatorId?: number | null
}

export interface OrderDetail {
  orderNo: string
  status: string
  customerName: string
  phone: string
  plateNo?: string
  carType: CarType
  tireSpec?: string
  withWheelRim?: boolean
  serviceType: ServiceType
  returnMethod?: string | null
  pickupDate?: string | null
  pickupSlot?: SlotName | null
  storageStartDate: string
  expectedReturnDate: string
  expireAt: string
  months: number
  packageSnapshot?: PackageSnapshot
  addons?: OrderAddon[]
  amountPackage: number
  amountAddon: number
  amountTotal: number
  paymentMethod?: string
  paymentStatus?: string
  paidAmount?: number
  outstandingAmount?: number
  canPayOnline?: boolean
  rewardNo?: string | null
  rewardAmount?: number
  redemptionCode?: string | null
  redemptionCodeUsedAt?: string | null
  outboundRequestStatus?: 'none' | 'pending' | 'approved' | 'rejected'
  outboundRequestedAt?: string | null
  outboundNote?: string
  note?: string
  renewals?: RenewalRecord[]
  timeline?: Array<{ at: string; event: string; detail?: string }>
  locationCode?: string
  inboundAt?: string | null
  inboundPhotos?: MediaFile[]
  remainingDays: number
  overdueDays: number
  overdueFeeEstimate: number
  canRenew: boolean
  canRequestOutbound: boolean
  createdAt?: string
}

export interface RenewResult {
  orderNo: string
  months: number
  amount: number
  previousExpireAt: string
  expireAt: string
  /** 续费申请已提交，待门店确认收款后才顺延 */
  pending?: boolean
  expectedExpireAt?: string
  requestedAt?: string
}

export interface OutboundResult {
  orderNo: string
  outboundRequestStatus: string
  outboundRequestedAt: string
}

/** POST /orders — 字段名与插件 controllers/content-api/order.ts 完全对齐 */
export function createOrder(payload: CreateOrderPayload): Promise<CreateOrderResult> {
  return request<CreateOrderResult>('/orders', {
    method: 'POST',
    data: payload as unknown as Record<string, any>,
  })
}

/** GET /orders/:orderNo?phone= */
export function getOrderDetail(orderNo: string, phone: string): Promise<OrderDetail> {
  return request<OrderDetail>(`/orders/${encodeURIComponent(orderNo)}`, {
    data: { phone },
  })
}

/** POST /orders/:orderNo/renew { phone, months } */
export function renewOrder(
  orderNo: string,
  phone: string,
  months: number,
  paymentMethod = 'store_pay',
): Promise<RenewResult> {
  return request<RenewResult>(`/orders/${encodeURIComponent(orderNo)}/renew`, {
    method: 'POST',
    data: { phone, months, paymentMethod },
  })
}

/** POST /orders/:orderNo/outbound { phone, note } */
export function requestOutbound(
  orderNo: string,
  phone: string,
  note?: string,
): Promise<OutboundResult> {
  return request<OutboundResult>(`/orders/${encodeURIComponent(orderNo)}/outbound`, {
    method: 'POST',
    data: { phone, note: note || '' },
  })
}

export type { TirePackage }
