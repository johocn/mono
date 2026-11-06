import { request } from './http'

export interface PrepayResult {
  paymentNo?: string
  amount?: number
  provider?: string
  mock?: boolean
  payUrl?: string
  orderNo?: string
  paid?: boolean
  openidMasked?: string
  /** 微信 JSAPI 调起参数（provider=wechat 且已配置商户密钥时返回） */
  payParams?: {
    appId: string
    timeStamp: string
    nonceStr: string
    package: string
    signType: 'RSA'
    paySign: string
  }
}

/** POST /pay/prepay — 创建待支付流水并返回收银台地址（mock）或 JSAPI 参数（微信） */
export function prepayOrder(payload: {
  orderNo: string
  channel?: string
  idempotencyKey?: string
  openid?: string
}): Promise<PrepayResult> {
  return request<PrepayResult>('/pay/prepay', {
    method: 'POST',
    data: payload as unknown as Record<string, any>,
  })
}

/** POST /pay/mock-pay — 仅 mock 通道可用的模拟支付确认 */
export function mockPay(paymentNo: string): Promise<{ ok: boolean; paidAmount?: number }> {
  return request<{ ok: boolean; paidAmount?: number }>('/pay/mock-pay', {
    method: 'POST',
    data: { paymentNo },
  })
}
