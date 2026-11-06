import { request } from './http'
import { authHeader, type SsoUser } from '@/utils/sso'

export interface MyOrderSummary {
  orderNo: string
  status: string
  serviceType: 'store' | 'pickup'
  customerName: string
  plateNo?: string
  tireSpec?: string
  storageStartDate: string
  expectedReturnDate: string
  expireAt?: string
  months?: number
  amountTotal: number
  paymentStatus?: string
  createdAt?: string
}

export interface MyOrdersResult extends SsoUser {
  orders: MyOrderSummary[]
}

export interface MyReferralResult extends SsoUser {
  code: string
  phone: string
  nickname: string
  usedCount: number
  completedCount: number
  pendingFreeCount: number
  totalFreeCount: number
  threshold: number
  progress: number
  progressNextIn: number
}

export interface ReferralPreview {
  code: string
  nickname: string
  phoneMasked: string
}

export interface ReferralRewardItem {
  rewardNo: string
  amount: number
  source: string
  status: 'available' | 'reserved' | 'used' | 'expired' | 'void'
  issuedAt?: string | null
  expiresAt?: string | null
  usedOrderNo?: string | null
}

export interface MyRewardsResult {
  rewards: ReferralRewardItem[]
  available: ReferralRewardItem[]
}

export interface MyShareRecord {
  id: number
  inviteePhone: string
  orderNo: string
  status: 'bound' | 'valid' | 'pending_review' | 'invalid' | 'rolled_back'
  boundAt?: string | null
  validAt?: string | null
}

export interface MyShareRecordsResult {
  data: MyShareRecord[]
  pagination: { page: number; pageSize: number; total: number; pageCount: number }
}

/** GET /my/me — 校验统一登录 Token 并返回账号手机号 */
export function getMyProfile(): Promise<SsoUser> {
  return request<SsoUser>('/my/me', { header: authHeader() })
}

/** GET /my/orders — 按登录账号手机号返回寄存订单 */
export function getMyOrders(): Promise<MyOrdersResult> {
  return request<MyOrdersResult>('/my/orders', { header: authHeader() })
}

/** GET /my/referral — 取当前登录人的邀请码与奖励进度 */
export function getMyReferral(): Promise<MyReferralResult> {
  return request<MyReferralResult>('/my/referral', { header: authHeader() })
}

/** GET /my/rewards — 当前登录人的奖励券（含可用/已用/过期） */
export function getMyRewards(): Promise<MyRewardsResult> {
  return request<MyRewardsResult>('/my/rewards', { header: authHeader() })
}

/** GET /my/share-records — 我的邀请明细（服务端分页） */
export function getMyShareRecords(params: {
  page?: number
  pageSize?: number
  status?: string
} = {}): Promise<MyShareRecordsResult> {
  return request<MyShareRecordsResult>('/my/share-records', {
    data: params as unknown as Record<string, any>,
    header: authHeader(),
  })
}

/** GET /referral/:code/preview — 公开预览邀请码归属（创建页填邀请码时实时校验） */
export function previewReferral(code: string): Promise<ReferralPreview> {
  return request<ReferralPreview>(`/referral/${encodeURIComponent(code)}/preview`)
}
