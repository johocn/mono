<template>
  <view class="page">
    <view class="hero">
      <text class="hero-title">{{ t('query.title') }}</text>
      <text class="hero-sub">{{ t('query.subtitle') }}</text>
      <view class="hero-badge">{{ t('query.cardHint') }}</view>
    </view>

    <!-- 我的订单：浏览与预约免登录，查看订单时按需登录 -->
    <view class="card my-card">
      <view class="my-head">
        <text class="my-title">{{ t('query.myTitle') }}</text>
        <text v-if="loggedIn" class="my-badge">{{ t('query.myLoggedIn') }}</text>
      </view>

      <view v-if="!loggedIn" class="my-login">
        <text class="my-login-title">{{ t('query.myLoginTitle') }}</text>
        <text class="my-login-desc">{{ t('query.myLoginDesc') }}</text>
        <button class="submit-btn" @tap="login">{{ t('query.myLoginAction') }}</button>

        <!-- 非微信环境兜底：手机号验证码登录（微信内 SSO 授权打开即可） -->
        <view v-if="smsLoginEnabled" class="sms-login">
          <text class="sms-toggle" @tap="toggleSmsForm">
            {{ smsOpen ? t('query.smsHide') : t('query.smsEntry') }}
          </text>
          <view v-if="smsOpen" class="sms-form">
            <input
              v-model="smsMobile"
              class="field-input"
              type="number"
              maxlength="11"
              :placeholder="t('query.smsMobilePlaceholder')"
              placeholder-class="ph"
            />
            <view class="sms-code-row">
              <input
                v-model="smsCode"
                class="field-input sms-code-input"
                type="number"
                maxlength="6"
                :placeholder="t('query.smsCodePlaceholder')"
                placeholder-class="ph"
              />
              <text class="sms-send" @tap="sendSms">
                {{ smsCountdown > 0 ? `${smsCountdown}s` : t('query.smsSend') }}
              </text>
            </view>
            <button class="submit-btn ghost-btn" :disabled="smsLoading" @tap="submitSmsLogin">
              {{ smsLoading ? t('common.loading') : t('query.smsLogin') }}
            </button>
            <text v-if="smsHint" class="sms-hint">{{ smsHint }}</text>
          </view>
        </view>
      </view>

      <view v-else class="my-body">
        <view class="my-account">
          <text class="my-phone">{{ maskPhone(myUser?.phone) }}</text>
          <text class="my-logout" @tap="logout">{{ t('query.logout') }}</text>
        </view>

        <!-- 我的邀请码入口 -->
        <view class="referral-entry" @tap="goReferral">
          <text class="referral-icon">🎁</text>
          <view class="referral-info">
            <text class="referral-title">{{ t('referral.title') }}</text>
            <text class="referral-sub">邀请满 3 人免费寄存</text>
          </view>
          <text class="referral-arrow">›</text>
        </view>

        <view v-if="ordersLoading" class="my-state">{{ t('query.myLoading') }}</view>
        <view v-else-if="ordersError" class="my-state my-retry" @tap="loadMyOrders">
          {{ t('query.myLoadFailed') }}
        </view>
        <view v-else-if="!myOrders.length" class="my-empty">
          <text class="my-empty-text">{{ t('query.myEmpty') }}</text>
          <view class="my-empty-btn" @tap="goCreate">{{ t('query.myGoCreate') }}</view>
        </view>
        <view v-else class="my-list">
          <view v-for="order in myOrders" :key="order.orderNo" class="order-item" @tap="openOrder(order)">
            <view class="order-top">
              <text class="order-no">{{ order.orderNo }}</text>
              <text class="order-status">{{ statusText(order.status, order.serviceType) }}</text>
            </view>
            <view class="order-meta">
              <text>{{ t(`serviceType.${order.serviceType}`) }}</text>
              <text>{{ t('query.startDate') }} {{ formatDate(order.storageStartDate) }}</text>
              <text>{{ t('query.amount') }} {{ formatMoney(order.amountTotal) }}</text>
            </view>
            <text class="order-more">{{ t('query.viewDetail') }} ›</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 其他方式：已知订单号可免登录直接查询 -->
    <view class="card form-card">
      <text class="form-title">{{ t('query.otherTitle') }}</text>
      <text class="form-sub">{{ t('query.otherHint') }}</text>
      <FormField :label="t('query.phone')" required :error="errors.phone">
        <input
          v-model="phone"
          class="field-input"
          type="number"
          maxlength="11"
          :placeholder="t('query.phonePlaceholder')"
          placeholder-class="ph"
        />
      </FormField>
      <FormField :label="t('query.orderNo')" required :error="errors.orderNo">
        <input
          v-model="orderNo"
          class="field-input"
          :placeholder="t('query.orderNoPlaceholder')"
          placeholder-class="ph"
          maxlength="32"
        />
      </FormField>

      <button class="submit-btn ghost-btn" :disabled="submitting" @tap="submit">
        {{ submitting ? t('common.loading') : t('query.submit') }}
      </button>
    </view>

    <text class="footer-tip">{{ t('query.footerTip') }}</text>

    <view class="helper card">
      <text class="helper-text">{{ t('query.help') }}</text>
      <view class="helper-action" @tap="goCreate">{{ t('index.bannerCta') }}</view>
    </view>

    <view class="page-bottom" />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { t, statusText } from '@/locales/zh-CN'
import { isPhone } from '@/utils/phone'
import { ApiError } from '@/api/http'
import { getMyOrders, type MyOrderSummary } from '@/api/my'
import {
  clearSsoSession,
  completeSsoLogin,
  getSsoToken,
  getSsoUser,
  goSsoLogin,
  saveSsoToken,
  saveSsoUser,
  type SsoUser,
} from '@/utils/sso'
import { formatDate, formatMoney } from '@/utils/format'
import { loginBySms, sendLoginSms } from '@/api/sso-auth'
import FormField from '@/components/FormField.vue'

const phone = ref('')
const orderNo = ref('')
const submitting = ref(false)
const errors = reactive<Record<string, string>>({})

const myUser = ref<SsoUser | null>(getSsoUser())
const myOrders = ref<MyOrderSummary[]>([])
const ordersLoading = ref(false)
const ordersError = ref(false)

const loggedIn = computed(() => Boolean(myUser.value?.phone))

onLoad(async () => {
  if (await completeSsoLogin()) {
    loadMyOrders()
    return
  }
  if (getSsoToken()) loadMyOrders()
})

function maskPhone(value?: string): string {
  const text = String(value || '')
  if (text.length < 7) return text || '--'
  return `${text.slice(0, 3)}****${text.slice(-4)}`
}

async function loadMyOrders(): Promise<void> {
  if (!getSsoToken()) {
    myUser.value = null
    return
  }
  ordersLoading.value = true
  ordersError.value = false
  try {
    const result = await getMyOrders()
    myUser.value = { phone: result.phone, nickname: result.nickname || '' }
    saveSsoUser(myUser.value)
    myOrders.value = result.orders || []
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearSsoSession()
      myUser.value = null
      myOrders.value = []
      uni.showToast({ title: t('query.myLoginFailed'), icon: 'none' })
    } else {
      ordersError.value = true
    }
  } finally {
    ordersLoading.value = false
  }
}

function login(): void {
  goSsoLogin()
}

/* ---------- 手机号验证码登录（非微信环境兜底，按环境开关；生产关闭） ---------- */
const smsLoginEnabled = import.meta.env.VITE_ENABLE_SMS_LOGIN === 'true'
const smsOpen = ref(false)
const smsMobile = ref('')
const smsCode = ref('')
const smsLoading = ref(false)
const smsCountdown = ref(0)
const smsHint = ref('')

function toggleSmsForm(): void {
  smsOpen.value = !smsOpen.value
}

async function sendSms(): Promise<void> {
  if (smsCountdown.value > 0) return
  if (!isPhone(smsMobile.value)) {
    smsHint.value = t('query.smsMobileInvalid')
    return
  }
  smsHint.value = ''
  try {
    const result = await sendLoginSms(smsMobile.value.trim())
    if (!result?.sent) {
      smsHint.value = result?.error || t('query.smsSendFailed')
      return
    }
    smsHint.value = t('query.smsSent')
    smsCountdown.value = 60
    const timer = setInterval(() => {
      smsCountdown.value -= 1
      if (smsCountdown.value <= 0) clearInterval(timer)
    }, 1000)
  } catch (error) {
    smsHint.value = error instanceof Error ? error.message : t('query.smsSendFailed')
  }
}

async function submitSmsLogin(): Promise<void> {
  if (smsLoading.value) return
  if (!isPhone(smsMobile.value)) {
    smsHint.value = t('query.smsMobileInvalid')
    return
  }
  if (!/^\d{4,6}$/.test(smsCode.value.trim())) {
    smsHint.value = t('query.smsCodeInvalid')
    return
  }
  smsLoading.value = true
  smsHint.value = ''
  try {
    const result = await loginBySms(smsMobile.value.trim(), smsCode.value.trim())
    if (!result?.access_token) {
      smsHint.value = t('query.smsLoginFailed')
      return
    }
    saveSsoToken(result.access_token)
    saveSsoUser({ phone: smsMobile.value.trim(), nickname: result.user?.nickname || '' })
    smsOpen.value = false
    await loadMyOrders()
  } catch (error) {
    smsHint.value = error instanceof Error ? error.message : t('query.smsLoginFailed')
  } finally {
    smsLoading.value = false
  }
}

function logout(): void {
  clearSsoSession()
  myUser.value = null
  myOrders.value = []
}

function openOrder(order: MyOrderSummary): void {
  const owner = myUser.value?.phone
  if (!owner) return
  const no = order.orderNo
  uni.navigateTo({
    url: `/pages/order/detail?no=${encodeURIComponent(no)}&phone=${encodeURIComponent(owner)}`,
  })
}

function clearErrors(): void {
  Object.keys(errors).forEach((key) => delete errors[key])
}

function submit(): void {
  if (submitting.value) return
  clearErrors()
  if (!isPhone(phone.value)) {
    errors.phone = t('query.validPhone')
    uni.showToast({ title: errors.phone, icon: 'none' })
    return
  }
  if (!orderNo.value.trim()) {
    errors.orderNo = t('query.validOrderNo')
    uni.showToast({ title: errors.orderNo, icon: 'none' })
    return
  }
  submitting.value = true
  const no = orderNo.value.trim()
  const target = `/pages/order/detail?no=${encodeURIComponent(no)}&phone=${encodeURIComponent(
    phone.value.trim(),
  )}`
  uni.navigateTo({
    url: target,
    fail: () => {
      submitting.value = false
      uni.showToast({ title: t('common.unknownError'), icon: 'none' })
    },
    success: () => {
      submitting.value = false
    },
  })
}

function goCreate(): void {
  uni.navigateTo({ url: '/pages/order/create' })
}

function goReferral(): void {
  uni.navigateTo({ url: '/pages/referral/index' })
}
</script>

<style scoped>
.page {
  padding: 24rpx;
}
.hero {
  padding: 24rpx 12rpx 36rpx;
}
.hero-title {
  display: block;
  font-size: 48rpx;
  font-weight: 800;
  color: var(--color-primary-text);
  letter-spacing: 1rpx;
}
.hero-sub {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  color: var(--color-text-muted);
  line-height: 1.6;
}
.hero-badge {
  display: inline-block;
  margin-top: 18rpx;
  padding: 6rpx 18rpx;
  border-radius: var(--radius-pill);
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  font-size: 22rpx;
}

/* 我的订单 */
.my-card {
  padding: 28rpx;
}
.my-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.my-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--color-text);
}
.my-badge {
  padding: 4rpx 16rpx;
  border-radius: var(--radius-pill);
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  font-size: 21rpx;
}
.my-login {
  display: flex;
  flex-direction: column;
  padding-top: 20rpx;
}
.my-login-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--color-text);
}
.my-login-desc {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: var(--color-text-muted);
  line-height: 1.6;
}
.sms-login {
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 1rpx dashed var(--color-border);
}
.sms-toggle {
  font-size: 24rpx;
  color: var(--color-primary);
}
.sms-form {
  margin-top: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
.sms-code-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.sms-code-input {
  flex: 1;
}
.sms-send {
  flex-shrink: 0;
  padding: 0 20rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: var(--radius-sm);
  border: 1rpx solid var(--color-primary);
  color: var(--color-primary);
  font-size: 24rpx;
}
.sms-hint {
  font-size: 23rpx;
  color: var(--color-text-muted);
}
.my-account {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18rpx;
  padding: 16rpx 20rpx;
  border-radius: var(--radius-sm);
  background: #f8fafc;
}
.my-phone {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-text);
}
.my-logout {
  font-size: 23rpx;
  color: var(--color-text-muted);
  padding: 6rpx 10rpx;
}
.my-state {
  padding: 26rpx 0 8rpx;
  font-size: 24rpx;
  color: var(--color-text-muted);
  text-align: center;
}
.my-retry {
  color: var(--color-primary);
}
.my-empty {
  padding: 30rpx 0 6rpx;
  text-align: center;
}
.my-empty-text {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-muted);
  line-height: 1.6;
}
.my-empty-btn {
  display: inline-block;
  margin-top: 20rpx;
  padding: 14rpx 34rpx;
  border-radius: var(--radius-pill);
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  font-size: 24rpx;
  font-weight: 600;
}
.my-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 18rpx;
}

.referral-entry {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 16rpx;
  padding: 20rpx;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, #fff7ed, #fef3c7);
  border: 1rpx solid rgba(249, 115, 22, 0.25);
}
.referral-icon {
  font-size: 40rpx;
}
.referral-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.referral-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #9a3412;
}
.referral-sub {
  font-size: 22rpx;
  color: #c2410c;
}
.referral-arrow {
  font-size: 32rpx;
  color: #c2410c;
}
.order-item {
  padding: 22rpx 20rpx;
  border-radius: var(--radius-sm);
  border: 1rpx solid var(--color-border);
  background: #fff;
}
.order-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.order-no {
  font-size: 25rpx;
  font-weight: 700;
  color: var(--color-text);
}
.order-status {
  flex: none;
  padding: 4rpx 14rpx;
  border-radius: var(--radius-pill);
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  font-size: 21rpx;
}
.order-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx 22rpx;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.order-more {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: var(--color-primary);
  text-align: right;
}

/* 其他查询方式 */
.form-card {
  margin-top: 24rpx;
  padding: 12rpx 28rpx 32rpx;
}
.form-title {
  display: block;
  padding: 22rpx 0 6rpx;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-text);
}
.form-sub {
  display: block;
  padding-bottom: 8rpx;
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.field-input {
  width: 100%;
  height: 76rpx;
  padding: 0 20rpx;
  border-radius: var(--radius-sm);
  background: #f8fafc;
  font-size: 27rpx;
  color: var(--color-text);
}
.ph {
  color: #a1a1aa;
  font-size: 26rpx;
}
.submit-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  margin-top: 32rpx;
  border-radius: var(--radius-pill);
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-deep));
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
  box-shadow: 0 12rpx 26rpx rgba(37, 99, 235, 0.24);
}
.submit-btn[disabled] {
  background: #b7c7e8;
  box-shadow: none;
}
.ghost-btn {
  background: #fff;
  color: var(--color-primary-text);
  border: 1rpx solid var(--color-primary);
  box-shadow: none;
}
.footer-tip {
  display: block;
  padding: 24rpx 8rpx;
  font-size: 22rpx;
  color: var(--color-text-muted);
  text-align: center;
  line-height: 1.6;
}
.helper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 28rpx;
  gap: 20rpx;
}
.helper-text {
  flex: 1;
  font-size: 24rpx;
  color: var(--color-text-muted);
}
.helper-action {
  flex: none;
  padding: 12rpx 24rpx;
  border-radius: var(--radius-pill);
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  font-size: 23rpx;
  font-weight: 600;
}
.page-bottom {
  height: 40rpx;
}
</style>
