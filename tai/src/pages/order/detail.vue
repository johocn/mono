<template>
  <view class="page">
    <view v-if="loading" class="state-card card">
      <text class="state-text">{{ t('common.loading') }}</text>
    </view>

    <view v-else-if="loadError" class="state-card card">
      <text class="state-text">{{ t('detail.loadFailed') }}</text>
      <text class="state-sub">{{ loadErrorText }}</text>
      <view class="state-actions">
        <view class="btn btn-ghost btn-sm" @tap="load">{{ t('common.retry') }}</view>
        <view class="btn btn-outline btn-sm" @tap="backQuery">{{ t('detail.backQuery') }}</view>
      </view>
    </view>

    <view v-else-if="!detail" class="state-card card">
      <text class="state-text">{{ t('detail.needParams') }}</text>
      <view class="state-actions">
        <view class="btn btn-primary btn-sm" @tap="backQuery">{{ t('detail.backQuery') }}</view>
      </view>
    </view>

    <template v-else>
      <!-- 状态头 -->
      <view class="status-card card">
        <view class="status-head">
          <StatusTag
            :status="detail.status"
            :service-type="detail.serviceType"
            :outbound-status="detail.outboundRequestStatus"
          />
          <text class="service-chip">{{ t(`serviceType.${detail.serviceType}`) }}</text>
        </view>
        <view class="order-no-row">
          <text class="order-no-label">{{ t('detail.orderNo') }}</text>
          <text class="order-no">{{ detail.orderNo }}</text>
        </view>
        <text class="created-at">{{ t('detail.createdAt') }} {{ formatDateTime(detail.createdAt) }}</text>
      </view>

      <!-- 支付状态（B 版：状态头 + 金额 + 主操作） -->
      <view class="pay-hero">
        <view class="pay-hero-top">
          <text class="pay-hero-label">{{ t('detail.payableNow') }}</text>
          <text class="pay-hero-status" :class="{ paid: detail.paymentStatus === 'paid' }">
            {{ paymentStatusLabel }}
          </text>
        </view>
        <view class="pay-hero-amount">
          <text class="pay-hero-cur">¥</text>
          <text class="pay-hero-num">{{ fenToYuan(outstandingAmount) }}</text>
        </view>
        <view class="pay-hero-meta">
          <text>{{ t('detail.paymentMethod') }} · {{ paymentMethodLabel }}</text>
          <text v-if="detail.paidAmount"> · {{ t('detail.paid') }} {{ formatMoney(detail.paidAmount) }}</text>
        </view>
        <button
          v-if="detail.canPayOnline"
          class="btn btn-primary pay-hero-btn"
          :disabled="paying"
          @tap="payNow"
        >
          {{ paying ? t('detail.paying') : t('detail.payNow') }}
        </button>
        <text v-else class="pay-hero-hint">{{ payHint }}</text>
      </view>

      <!-- 流程条 -->
      <view class="card flow-card">
        <view v-for="(step, index) in flowSteps" :key="step.key" class="flow-item">
          <view class="flow-dot-col">
            <view class="flow-dot" :class="{ done: step.done, current: step.current }" />
            <view v-if="index < flowSteps.length - 1" class="flow-line" :class="{ done: step.done }" />
          </view>
          <view class="flow-text-col">
            <text class="flow-title" :class="{ done: step.done }">{{ t(step.label) }}</text>
            <text v-if="step.time" class="flow-time">{{ formatDateTime(step.time) }}</text>
          </view>
        </view>
      </view>

      <!-- 出库核销码 -->
      <view v-if="detail.redemptionCode" class="redeem-card">
        <view class="redeem-head">
          <text class="redeem-label">{{ t('detail.redeemTitle') }}</text>
          <text class="redeem-state" :class="{ used: detail.redemptionCodeUsedAt }">
            {{ detail.redemptionCodeUsedAt ? t('detail.redeemUsed') : t('detail.redeemActive') }}
          </text>
        </view>
        <text class="redeem-code">{{ detail.redemptionCode }}</text>
        <text class="redeem-hint">{{ t('detail.redeemHint') }}</text>
      </view>

      <!-- 到期 / 超期 -->
      <view class="expire-card" :class="{ urgent: isUrgent, overdue: detail.overdueDays > 0 }">
        <view class="expire-head">
          <text class="expire-title">{{ t('detail.expireTitle') }}</text>
          <text class="expire-date">{{ formatDate(detail.expireAt) }}</text>
        </view>
        <view class="expire-body">
          <text v-if="detail.overdueDays > 0" class="expire-badge">
            {{ t('detail.overdue', { count: detail.overdueDays }) }}
          </text>
          <text v-else class="expire-badge">{{ t('detail.remaining', { count: detail.remainingDays }) }}</text>
          <text v-if="detail.overdueDays > 0" class="expire-extra">
            {{ t('detail.overdueFee', { amount: fenToYuan(detail.overdueFeeEstimate) }) }}
          </text>
          <text v-else-if="isUrgent" class="expire-extra">{{ t('detail.dueSoon') }}</text>
        </view>
        <text v-if="detail.status === 'completed'" class="expire-note">{{ t('detail.completedHint') }}</text>
        <text v-else-if="detail.status === 'rejected'" class="expire-note">{{ t('detail.rejectedHint') }}</text>
        <text v-else-if="detail.status === 'canceled'" class="expire-note">{{ t('detail.canceledHint') }}</text>
      </view>

      <!-- 客户与车辆 -->
      <view class="card info-card">
        <text class="card-title">{{ t('detail.customer') }}</text>
        <view class="info-row">
          <text class="info-label">{{ t('detail.contact') }}</text>
          <text class="info-value">{{ detail.customerName }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">{{ t('detail.phone') }}</text>
          <text class="info-value">{{ maskPhone(detail.phone) }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">{{ t('detail.plateNo') }}</text>
          <text class="info-value">{{ detail.plateNo || '--' }}</text>
        </view>

        <text class="card-title sub-title">{{ t('detail.vehicle') }}</text>
        <view class="info-row">
          <text class="info-label">{{ t('detail.carType') }}</text>
          <text class="info-value">{{ t(`carType.${detail.carType}`) }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">{{ t('detail.tireSpec') }}</text>
          <text class="info-value">{{ detail.tireSpec || '--' }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">{{ t('detail.withWheelRim') }}</text>
          <text class="info-value">{{ detail.withWheelRim ? t('common.yes') : t('common.no') }}</text>
        </view>
      </view>

      <!-- 服务信息 -->
      <view class="card info-card">
        <text class="card-title">{{ t('detail.service') }}</text>
        <view class="info-row">
          <text class="info-label">{{ t('detail.serviceType') }}</text>
          <text class="info-value">{{ t(`serviceType.${detail.serviceType}`) }}</text>
        </view>
        <view v-if="detail.serviceType === 'pickup'" class="info-row">
          <text class="info-label">{{ t('detail.pickupDate') }}</text>
          <text class="info-value">
            {{ formatDate(detail.pickupDate) }}
            <text v-if="detail.pickupSlot"> · {{ t(`slots.${detail.pickupSlot}`) }}</text>
          </text>
        </view>
        <view class="info-row">
          <text class="info-label">{{ t('detail.storageStart') }}</text>
          <text class="info-value">{{ formatDate(detail.storageStartDate) }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">{{ t('detail.expireAt') }}</text>
          <text class="info-value">{{ formatDate(detail.expireAt) }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">{{ t('detail.months') }}</text>
          <text class="info-value">{{ detail.months }} {{ t('common.month') }}</text>
        </view>
      </view>

      <!-- 寄存网点 / 导航 -->
      <LocationCard :config="config" />

      <!-- 费用明细 -->
      <view class="card info-card">
        <text class="card-title">{{ t('detail.feeTitle') }}</text>
        <view class="info-row">
          <text class="info-label">{{ t('detail.packageFee') }}</text>
          <text class="info-value">{{ formatMoney(detail.amountPackage) }}</text>
        </view>
        <view class="info-row">
          <text class="info-label">{{ t('detail.addonFee') }}</text>
          <text class="info-value">{{ formatMoney(detail.amountAddon) }}</text>
        </view>
        <view v-for="addon in detail.addons || []" :key="addon.code || addon.name" class="addon-line">
          <text class="addon-name">{{ addon.name }}</text>
          <text class="addon-price">{{ formatMoney(addon.price) }}</text>
        </view>
        <view class="total-row">
          <text class="total-label">{{ t('detail.total') }}</text>
          <view class="total-value">
            <text class="total-cur">¥</text>
            <text class="total-num">{{ fenToYuan(detail.amountTotal) }}</text>
          </view>
        </view>
        <view class="info-row">
          <text class="info-label">{{ t('detail.paymentStatus') }}</text>
          <text class="info-value">
            {{ paymentStatusLabel }}
            <text v-if="detail.paidAmount"> · {{ t('detail.paid') }} {{ formatMoney(detail.paidAmount) }}</text>
          </text>
        </view>
        <view v-if="detail.rewardAmount" class="info-row">
          <text class="info-label">{{ t('detail.rewardDiscount') }}</text>
          <text class="info-value reward-value">-{{ formatMoney(detail.rewardAmount) }}</text>
        </view>
      </view>

      <!-- 入库档案 -->
      <view class="card info-card">
        <text class="card-title">{{ t('detail.archiveTitle') }}</text>
        <template v-if="detail.inboundAt || detail.locationCode || (detail.inboundPhotos && detail.inboundPhotos.length)">
          <view class="info-row">
            <text class="info-label">{{ t('detail.locationCode') }}</text>
            <text class="info-value strong">{{ detail.locationCode || '--' }}</text>
          </view>
          <view class="info-row">
            <text class="info-label">{{ t('detail.inboundAt') }}</text>
            <text class="info-value">{{ formatDateTime(detail.inboundAt) }}</text>
          </view>
          <view class="photo-block">
            <text class="photo-label">{{ t('detail.photos') }}</text>
            <PhotoGrid :photos="detail.inboundPhotos || []" :empty-text="t('detail.archiveEmpty')" />
          </view>
        </template>
        <view v-else class="archive-empty">
          <text>{{ t('detail.notInbound') }}</text>
        </view>
      </view>

      <!-- 续费 -->
      <view v-if="detail.canRenew" class="card action-card">
        <view class="action-head">
          <text class="card-title inline-title">{{ t('detail.renewTitle') }}</text>
          <text class="action-hint">{{ t('detail.renewHint') }}</text>
        </view>
        <view class="month-row">
          <view
            v-for="month in renewMonthOptions"
            :key="month"
            class="month-chip"
            :class="{ on: renewMonths === month }"
            @tap="renewMonths = month"
          >
            {{ t('detail.renewMonths', { count: month }) }}
          </view>
        </view>
        <view class="renew-preview">
          <view class="renew-amount">
            <text class="renew-amount-label">{{ t('detail.renewAmount', { amount: fenToYuan(renewAmount) }) }}</text>
            <text class="renew-amount-date">{{ t('detail.renewDate') }} {{ formatDate(renewExpire) }}</text>
          </view>
        </view>
        <button class="btn btn-primary action-btn" :disabled="renewing" @tap="submitRenew">
          {{ renewing ? t('detail.renewing') : t('detail.renewSubmit') }}
        </button>
      </view>

      <!-- 出库申请 -->
      <view v-if="detail.canRequestOutbound" class="card action-card">
        <view class="action-head">
          <text class="card-title inline-title">{{ t('detail.outboundTitle') }}</text>
          <text class="action-hint">{{ t('detail.outboundHint') }}</text>
        </view>
        <textarea
          v-model="outboundNote"
          class="outbound-input"
          :placeholder="t('detail.outboundNotePlaceholder')"
          placeholder-class="ph"
          maxlength="200"
          :auto-height="true"
        />
        <button class="btn btn-accent action-btn" :disabled="outboundSubmitting" @tap="submitOutbound">
          {{ outboundSubmitting ? t('detail.outboundSubmitting') : t('detail.outboundSubmit') }}
        </button>
      </view>

      <view v-if="detail.outboundRequestStatus === 'pending'" class="notice-card notice-orange">
        <text class="notice-title">{{ t('detail.outboundPending') }}</text>
        <text v-if="detail.outboundNote" class="notice-text">{{ t('detail.outboundNote') }} {{ detail.outboundNote }}</text>
        <text v-if="detail.outboundRequestedAt" class="notice-text">{{ formatDateTime(detail.outboundRequestedAt) }}</text>
      </view>
      <view v-else-if="detail.outboundRequestStatus === 'approved'" class="notice-card notice-green">
        <text class="notice-title">{{ t('detail.outboundApproved') }}</text>
      </view>

      <!-- 邀请进度 -->
      <view v-if="myReferral" class="card share-card">
        <view class="share-head">
          <text class="card-title inline-title">{{ t('detail.shareProgressTitle') }}</text>
          <text class="share-count">{{ t('detail.shareProgressCount', { count: referralProgress, threshold: 3 }) }}</text>
        </view>
        <view class="share-track">
          <view class="share-fill" :style="{ width: `${(referralProgress / 3) * 100}%` }" />
        </view>
        <text class="share-tip">{{ t('detail.shareProgressTip') }}</text>
        <view class="share-link" @tap="goReferral">{{ t('detail.viewReferral') }} →</view>
      </view>

      <!-- 操作 -->
      <view class="action-bar">
        <view class="action-item" @tap="callService">
          <text class="action-ico">☎</text>
          <text class="action-text">{{ t('detail.contactService') }}</text>
        </view>
        <view class="action-item" @tap="shareOrder">
          <text class="action-ico">↗</text>
          <text class="action-text">{{ t('detail.share') }}</text>
        </view>
        <view class="action-item" @tap="showQr = true">
          <text class="action-ico">▣</text>
          <text class="action-text">{{ t('detail.qr') }}</text>
        </view>
      </view>

      <view class="page-bottom" />
    </template>

    <QrModal
      :visible="showQr"
      :title="t('detail.qrTitle')"
      :content="orderLink"
      :order-no="detail?.orderNo || ''"
      :hint="t('detail.qrHint')"
      :show-save="true"
      @save="saveQr"
      @close="showQr = false"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { t } from '@/locales/zh-CN'
import { getSite, type SiteConfig } from '@/api/site'
import { getOrderDetail, renewOrder, requestOutbound, type OrderDetail } from '@/api/order'
import { getMyReferral, type MyReferralResult } from '@/api/my'
import { prepayOrder, type PrepayResult } from '@/api/pay'
import { getSsoOpenid, isWechatBrowser } from '@/utils/sso'
import { errorText } from '@/api/http'
import { addMonthsToDate, fenToYuan, formatDate, formatDateTime, formatMoney } from '@/utils/format'
import { callPhone, maskPhone } from '@/utils/phone'
import { copyText, detailLink, saveImageDataUrl } from '@/utils/share'
import StatusTag from '@/components/StatusTag.vue'
import PhotoGrid from '@/components/PhotoGrid.vue'
import QrModal from '@/components/QrModal.vue'
import LocationCard from '@/components/LocationCard.vue'

const orderNo = ref('')
const phone = ref('')
const detail = ref<OrderDetail | null>(null)
const config = ref<SiteConfig>({})
const loading = ref(true)
const loadError = ref(false)
const loadErrorText = ref('')

const renewMonthOptions = [1, 3, 6]
const renewMonths = ref(3)
const renewing = ref(false)
const outboundNote = ref('')
const outboundSubmitting = ref(false)
const showQr = ref(false)
const paying = ref(false)
const myReferral = ref<MyReferralResult | null>(null)

const outstandingAmount = computed(() => {
  const d = detail.value
  if (!d) return 0
  if (typeof d.outstandingAmount === 'number') return d.outstandingAmount
  return Math.max(0, Number(d.amountTotal) - Number(d.paidAmount || 0))
})

const payHint = computed(() => {
  const method = detail.value?.paymentMethod
  if (detail.value?.paymentStatus === 'paid') return t('detail.payDoneHint')
  if (method === 'pickup_pay') return t('detail.payHintPickup')
  return t('detail.payHintStore')
})

const referralProgress = computed(() => {
  const referral = myReferral.value
  if (!referral) return 0
  return Number(referral.completedCount) % 3
})

const flowSteps = computed(() => {
  const d = detail.value
  if (!d) return [] as Array<{ key: string; label: string; done: boolean; current: boolean; time?: string }>
  const steps = [
    { key: 'created', label: 'detail.flowCreated', time: d.createdAt, done: true },
    { key: 'inbound', label: 'detail.flowInbound', time: d.inboundAt, done: Boolean(d.inboundAt) },
    {
      key: 'outbound_request',
      label: 'detail.flowOutboundRequest',
      time: d.outboundRequestedAt,
      done: Boolean(d.outboundRequestedAt),
    },
    { key: 'completed', label: 'detail.flowCompleted', time: d.outboundAt, done: d.status === 'completed' },
  ]
  const lastDone = steps.filter((step) => step.done).length - 1
  return steps.map((step, index) => ({
    ...step,
    current: index === lastDone + 1 && step.key !== 'completed',
  }))
})

const isUrgent = computed(() => {
  const days = Number(detail.value?.remainingDays)
  return days > 0 && days <= 7
})

const orderLink = computed(() => (orderNo.value ? detailLink(orderNo.value, phone.value) : ''))

/** 与后端 renew 计费规则一致：优先超月单价，否则按基础价折算 */
const renewUnitPrice = computed(() => {
  const order = detail.value
  if (!order) return 0
  const snapshot = order.packageSnapshot || {}
  const explicit = Number(snapshot.extraMonthPrice) || 0
  if (explicit > 0) return explicit
  const basePrice = Number(
    order.serviceType === 'store' ? snapshot.storePrice : snapshot.pickupPrice,
  ) || 0
  const baseMonths = Number(snapshot.baseMonths) || Number(order.months) || 6
  return Math.round(basePrice / Math.max(1, baseMonths))
})

const renewAmount = computed(() => renewUnitPrice.value * renewMonths.value)
const renewExpire = computed(() => {
  const order = detail.value
  if (!order) return ''
  return addMonthsToDate(order.expireAt, renewMonths.value)
})

function dictLabel(group: 'paymentStatus' | 'paymentMethod', key?: string): string {
  if (!key) return '--'
  const text = t(`${group}.${key}`)
  return text === `${group}.${key}` ? key : text
}

const paymentStatusLabel = computed(() => dictLabel('paymentStatus', detail.value?.paymentStatus))
const paymentMethodLabel = computed(() => dictLabel('paymentMethod', detail.value?.paymentMethod))

onLoad((options: any) => {
  orderNo.value = String(options?.no || '')
  phone.value = String(options?.phone || '')
  loadSite()
  if (orderNo.value && phone.value) {
    load()
  } else {
    loading.value = false
    loadError.value = false
  }
})

async function load(): Promise<void> {
  if (!orderNo.value || !phone.value) {
    loading.value = false
    return
  }
  loading.value = true
  loadError.value = false
  loadErrorText.value = ''
  try {
    detail.value = await getOrderDetail(orderNo.value, phone.value)
    loadReferral()
  } catch (error) {
    detail.value = null
    loadError.value = true
    loadErrorText.value = errorText(error)
  } finally {
    loading.value = false
  }
}

async function loadSite(): Promise<void> {
  try {
    const data = await getSite()
    config.value = data.config || {}
  } catch (error) {
    config.value = {}
  }
}

function backQuery(): void {
  uni.redirectTo({ url: '/pages/order/query' })
}

async function loadReferral(): Promise<void> {
  try {
    myReferral.value = await getMyReferral()
  } catch (error) {
    myReferral.value = null
  }
}

function goReferral(): void {
  uni.navigateTo({ url: '/pages/referral/index' })
}

type WechatBridgeResult = 'ok' | 'cancel' | 'fail' | 'timeout'

/** 微信 JSAPI 调起：等待 WeixinJSBridge 就绪，超时/失败/取消都返回可读状态 */
function invokeWechatPay(payParams: NonNullable<PrepayResult['payParams']>): Promise<WechatBridgeResult> {
  return new Promise((resolve) => {
    const win = window as any
    let settled = false
    let invokeTimer: any = null
    let readyTimer: any = null

    const finish = (result: WechatBridgeResult): void => {
      if (settled) return
      settled = true
      if (invokeTimer) clearTimeout(invokeTimer)
      if (readyTimer) clearTimeout(readyTimer)
      resolve(result)
    }

    const invoke = (): void => {
      const bridge = win.WeixinJSBridge
      if (!bridge || typeof bridge.invoke !== 'function') {
        finish('fail')
        return
      }
      invokeTimer = setTimeout(() => finish('timeout'), 15000)
      try {
        bridge.invoke('getBrandWCPayRequest', payParams, (res: any) => {
          const msg = String(res?.err_msg || '')
          if (/ok$/.test(msg)) finish('ok')
          else if (/cancel$/.test(msg)) finish('cancel')
          else finish('fail')
        })
      } catch (error) {
        finish('fail')
      }
    }

    if (win.WeixinJSBridge) {
      invoke()
      return
    }

    const onReady = (): void => {
      document.removeEventListener('WeixinJSBridgeReady', onReady)
      invoke()
    }
    document.addEventListener('WeixinJSBridgeReady', onReady)
    readyTimer = setTimeout(() => {
      document.removeEventListener('WeixinJSBridgeReady', onReady)
      finish('timeout')
    }, 5000)
  })
}

async function payNow(): Promise<void> {
  if (paying.value || !detail.value) return
  paying.value = true
  try {
    const result = await prepayOrder({
      orderNo: detail.value.orderNo,
      channel: 'wechat',
      openid: getSsoOpenid() || undefined,
    })
    if (result.mock && result.paymentNo) {
      uni.navigateTo({ url: `/pages/pay/mock?paymentNo=${result.paymentNo}` })
      return
    }
    if (!result.payParams) {
      uni.showToast({ title: t('detail.payChannelUnavailable'), icon: 'none' })
      return
    }
    if (!isWechatBrowser()) {
      uni.showToast({ title: t('detail.payWechatOnly'), icon: 'none' })
      return
    }

    const status = await invokeWechatPay(result.payParams)
    if (status === 'ok') {
      uni.showToast({ title: t('detail.paySuccess'), icon: 'success' })
      await load()
      return
    }
    if (status === 'cancel') {
      uni.showToast({ title: t('detail.payCanceled'), icon: 'none' })
      return
    }
    uni.showModal({
      title: t('detail.payFailedTitle'),
      content: status === 'timeout' ? t('detail.payTimeoutRetry') : t('detail.payFailedRetry'),
      confirmText: t('common.retry'),
      cancelText: t('common.cancel'),
      success: (res: any) => {
        if (res.confirm) setTimeout(() => payNow(), 0)
      },
    })
  } catch (error) {
    uni.showToast({ title: errorText(error), icon: 'none' })
  } finally {
    paying.value = false
  }
}

function callService(): void {
  callPhone(config.value.contactPhone)
}

function shareOrder(): void {
  const link = orderLink.value
  if (!link) return
  copyText(link, t('common.copiedLink'))
}

function saveQr(dataUrl: string): void {
  if (!dataUrl) return
  saveImageDataUrl(dataUrl, `tire-order-${orderNo.value || 'qr'}.png`)
}

async function submitRenew(): Promise<void> {
  if (renewing.value || !detail.value) return
  if (!detail.value.canRenew) {
    uni.showToast({ title: t('detail.renewNotAllowed'), icon: 'none' })
    return
  }
  renewing.value = true
  try {
    await renewOrder(detail.value.orderNo, phone.value, renewMonths.value)
    uni.showToast({ title: t('detail.renewSuccess'), icon: 'none' })
    await load()
  } catch (error) {
    uni.showToast({ title: errorText(error), icon: 'none' })
  } finally {
    renewing.value = false
  }
}

async function submitOutbound(): Promise<void> {
  if (outboundSubmitting.value || !detail.value) return
  if (!detail.value.canRequestOutbound) {
    uni.showToast({ title: t('detail.outboundNotAllowed'), icon: 'none' })
    return
  }
  outboundSubmitting.value = true
  try {
    await requestOutbound(detail.value.orderNo, phone.value, outboundNote.value.trim())
    uni.showToast({ title: t('detail.outboundSuccess'), icon: 'none' })
    await load()
  } catch (error) {
    uni.showToast({ title: errorText(error), icon: 'none' })
  } finally {
    outboundSubmitting.value = false
  }
}
</script>

<style scoped>
.page {
  padding: 24rpx;
}
.card {
  padding: 28rpx;
  margin-top: 20rpx;
}
.state-card {
  margin-top: 120rpx;
  padding: 40rpx 28rpx;
  text-align: center;
}
.state-text {
  display: block;
  font-size: 28rpx;
  color: var(--color-text);
  font-weight: 600;
}
.state-sub {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  color: var(--color-text-muted);
}
.state-actions {
  display: flex;
  justify-content: center;
  gap: 20rpx;
  margin-top: 28rpx;
}
.pay-hero {
  margin-top: 20rpx;
  padding: 32rpx;
  border-radius: var(--radius-card);
  background: linear-gradient(140deg, #0f3d6e, #145c9e 55%, #1d74c4);
  color: #fff;
  box-shadow: 0 16rpx 32rpx rgba(15, 61, 110, 0.24);
}
.pay-hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pay-hero-label {
  font-size: 24rpx;
  opacity: 0.78;
}
.pay-hero-status {
  font-size: 24rpx;
  font-weight: 600;
  padding: 6rpx 18rpx;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.16);
}
.pay-hero-status.paid {
  background: rgba(52, 211, 153, 0.22);
  color: #d1fae5;
}
.pay-hero-amount {
  display: flex;
  align-items: baseline;
  gap: 6rpx;
  margin-top: 16rpx;
}
.pay-hero-cur {
  font-size: 32rpx;
  font-weight: 700;
}
.pay-hero-num {
  font-size: 64rpx;
  font-weight: 800;
  letter-spacing: 1rpx;
}
.pay-hero-meta {
  margin-top: 8rpx;
  font-size: 22rpx;
  opacity: 0.8;
}
.pay-hero-btn {
  width: 100%;
  margin-top: 24rpx;
  height: 84rpx;
  background: #fff;
  color: #145c9e;
  font-weight: 700;
}
.pay-hero-hint {
  display: block;
  margin-top: 20rpx;
  font-size: 24rpx;
  line-height: 1.6;
  opacity: 0.86;
}
.flow-card {
  padding: 28rpx 28rpx 16rpx;
}
.flow-item {
  display: flex;
  gap: 18rpx;
}
.flow-dot-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 28rpx;
}
.flow-dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  background: #e2e8f0;
  border: 2rpx solid #cbd5e1;
}
.flow-dot.done {
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.flow-dot.current {
  background: #fff;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 4rpx rgba(37, 99, 235, 0.16);
}
.flow-line {
  flex: 1;
  width: 2rpx;
  min-height: 46rpx;
  background: #e2e8f0;
}
.flow-line.done {
  background: var(--color-primary);
  opacity: 0.55;
}
.flow-text-col {
  flex: 1;
  padding-bottom: 26rpx;
}
.flow-title {
  display: block;
  font-size: 25rpx;
  color: var(--color-text-muted);
}
.flow-title.done {
  color: var(--color-text);
  font-weight: 600;
}
.flow-time {
  display: block;
  margin-top: 4rpx;
  font-size: 21rpx;
  color: var(--color-text-muted);
}
.redeem-card {
  margin-top: 20rpx;
  padding: 28rpx 32rpx;
  border-radius: var(--radius-card);
  background: linear-gradient(135deg, #fff7ed, #fff1e6);
  border: 1rpx dashed rgba(234, 88, 12, 0.4);
}
.redeem-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.redeem-label {
  font-size: 24rpx;
  color: #9a3412;
  font-weight: 600;
}
.redeem-state {
  font-size: 21rpx;
  padding: 4rpx 14rpx;
  border-radius: var(--radius-pill);
  background: rgba(234, 88, 12, 0.12);
  color: #9a3412;
}
.redeem-state.used {
  background: #e5e7eb;
  color: #6b7280;
}
.redeem-code {
  display: block;
  margin-top: 12rpx;
  font-size: 64rpx;
  font-weight: 800;
  letter-spacing: 12rpx;
  color: #9a3412;
  text-align: center;
}
.redeem-hint {
  display: block;
  margin-top: 8rpx;
  text-align: center;
  font-size: 22rpx;
  color: #b45309;
}
.share-card {
  padding: 28rpx;
}
.share-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.share-count {
  font-size: 24rpx;
  color: var(--color-primary-text);
  font-weight: 700;
}
.share-track {
  height: 14rpx;
  margin-top: 18rpx;
  border-radius: var(--radius-pill);
  background: #e2e8f0;
  overflow: hidden;
}
.share-fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, #22c55e, #16a34a);
  transition: width 0.3s ease;
}
.share-tip {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--color-text-muted);
}
.share-link {
  margin-top: 16rpx;
  font-size: 23rpx;
  color: var(--color-primary-text);
  font-weight: 600;
}
.reward-value {
  color: #16a34a;
  font-weight: 600;
}
.status-card {
  margin-top: 0;
  background: linear-gradient(135deg, #f0f7ff, #ffffff 70%);
  border: 1rpx solid var(--color-border-soft);
}
.status-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.service-chip {
  font-size: 22rpx;
  color: var(--color-primary-text);
  background: var(--color-primary-soft);
  border-radius: var(--radius-pill);
  padding: 8rpx 20rpx;
}
.order-no-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 24rpx;
}
.order-no-label {
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.order-no {
  font-size: 34rpx;
  font-weight: 800;
  color: var(--color-primary-text);
  letter-spacing: 1rpx;
}
.created-at {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.expire-card {
  margin-top: 20rpx;
  padding: 28rpx;
  border-radius: var(--radius-card);
  background: linear-gradient(135deg, #eff6ff, #dbeafe);
  border: 1rpx solid rgba(37, 99, 235, 0.18);
}
.expire-card.urgent {
  background: linear-gradient(135deg, #fff7ed, #fdecea);
  border-color: rgba(224, 82, 63, 0.24);
}
.expire-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.expire-title {
  font-size: 24rpx;
  color: var(--color-text-muted);
}
.expire-date {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-primary-text);
}
.expire-card.urgent .expire-date {
  color: var(--color-accent);
}
.expire-body {
  margin-top: 12rpx;
}
.expire-badge {
  display: inline-block;
  padding: 8rpx 22rpx;
  border-radius: var(--radius-pill);
  background: #fff;
  color: var(--color-primary-text);
  font-size: 30rpx;
  font-weight: 800;
}
.expire-card.urgent .expire-badge {
  color: var(--color-accent);
}
.expire-extra {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  color: var(--color-accent);
}
.expire-note {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.info-card {
  padding-bottom: 20rpx;
}
.card-title {
  display: block;
  padding-bottom: 12rpx;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-text);
}
.sub-title {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx dashed var(--color-border);
}
.inline-title {
  padding-bottom: 0;
}
.info-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  padding: 10rpx 0;
}
.info-label {
  flex: none;
  font-size: 24rpx;
  color: var(--color-text-muted);
}
.info-value {
  flex: 1;
  text-align: right;
  font-size: 25rpx;
  color: var(--color-text);
  line-height: 1.5;
  word-break: break-all;
}
.info-value.strong {
  font-weight: 700;
  color: var(--color-primary-text);
}
.addon-line {
  display: flex;
  justify-content: space-between;
  padding: 4rpx 0 4rpx 20rpx;
}
.addon-name,
.addon-price {
  font-size: 21rpx;
  color: var(--color-text-muted);
}
.total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12rpx;
  padding-top: 16rpx;
  border-top: 1rpx dashed var(--color-border);
}
.total-label {
  font-size: 27rpx;
  font-weight: 600;
  color: var(--color-text);
}
.total-value {
  display: flex;
  align-items: baseline;
  color: var(--color-accent);
}
.total-cur {
  font-size: 24rpx;
  font-weight: 700;
}
.total-num {
  font-size: 48rpx;
  font-weight: 800;
}
.payment-row {
  margin-top: 10rpx;
}
.photo-block {
  margin-top: 16rpx;
}
.photo-label {
  display: block;
  margin-bottom: 10rpx;
  font-size: 24rpx;
  color: var(--color-text-muted);
}
.archive-empty {
  padding: 16rpx 20rpx;
  border-radius: var(--radius-sm);
  background: #f8fafc;
  font-size: 23rpx;
  color: var(--color-text-muted);
  line-height: 1.6;
}
.action-card {
  padding: 28rpx;
}
.action-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}
.action-hint {
  font-size: 22rpx;
  color: var(--color-text-muted);
  text-align: right;
}
.month-row {
  display: flex;
  gap: 14rpx;
  margin-top: 20rpx;
}
.month-chip {
  flex: 1;
  height: 68rpx;
  line-height: 68rpx;
  text-align: center;
  border-radius: var(--radius-sm);
  background: #f4f5f7;
  font-size: 24rpx;
  color: var(--color-text-muted);
  border: 2rpx solid transparent;
}
.month-chip.on {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  border-color: var(--color-primary);
  font-weight: 600;
}
.renew-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
  padding: 18rpx 20rpx;
  border-radius: var(--radius-sm);
  background: #fff8f6;
}
.renew-amount {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.renew-amount-label {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--color-accent);
}
.renew-amount-date {
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.action-btn {
  width: 100%;
  margin-top: 24rpx;
  height: 84rpx;
}
.outbound-input {
  width: 100%;
  min-height: 120rpx;
  margin-top: 20rpx;
  padding: 18rpx 20rpx;
  border-radius: var(--radius-sm);
  background: #f8fafc;
  font-size: 25rpx;
  color: var(--color-text);
  line-height: 1.6;
}
.ph {
  color: #a1a1aa;
  font-size: 24rpx;
}
.notice-card {
  margin-top: 20rpx;
  padding: 24rpx 28rpx;
  border-radius: var(--radius-card);
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.notice-orange {
  background: var(--color-accent-soft);
  border: 1rpx solid rgba(224, 82, 63, 0.18);
}
.notice-green {
  background: var(--color-success-soft);
  border: 1rpx solid rgba(21, 128, 61, 0.16);
}
.notice-title {
  font-size: 25rpx;
  font-weight: 700;
  color: var(--color-text);
}
.notice-text {
  font-size: 22rpx;
  color: var(--color-text-muted);
  line-height: 1.5;
}
.action-bar {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
}
.action-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  padding: 20rpx 10rpx;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: var(--shadow-card);
}
.action-ico {
  font-size: 34rpx;
  color: var(--color-primary);
  line-height: 1;
}
.action-text {
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.page-bottom {
  height: 40rpx;
}
</style>
