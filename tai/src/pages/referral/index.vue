<template>
  <view class="page">
    <!-- 未登录 -->
    <view v-if="!loggedIn" class="card login-card">
      <text class="login-title">{{ t('referral.loginRequired') }}</text>
      <button class="submit-btn" @tap="goLogin">{{ t('referral.loginAction') }}</button>
    </view>

    <template v-else>
      <!-- 海报（B 版） -->
      <view v-if="profile" class="poster">
        <view class="poster-head">
          <text class="poster-brand">{{ t('referral.posterBrand') }}</text>
          <text class="poster-badge">{{ t('referral.posterBadge') }}</text>
        </view>
        <text class="poster-title">{{ t('referral.posterTitle') }}</text>
        <text class="poster-sub">{{ t('referral.posterSub') }}</text>

        <view class="poster-qr-card">
          <image class="poster-qr" :src="qrUrl" mode="aspectFit" />
          <view class="poster-code-block">
            <text class="poster-code-label">{{ t('referral.codeLabel') }}</text>
            <text class="poster-code">{{ profile.code }}</text>
            <text class="poster-code-hint">{{ t('referral.posterCodeHint') }}</text>
          </view>
        </view>

        <view class="poster-actions">
          <view class="poster-btn" @tap="copyLink">
            <text class="poster-btn-ico">🔗</text>
            <text>{{ t('referral.copyLink') }}</text>
          </view>
          <view class="poster-btn ghost" @tap="copyCode">
            <text class="poster-btn-ico">📋</text>
            <text>{{ t('referral.copyCode') }}</text>
          </view>
        </view>
      </view>

      <!-- 奖励券 -->
      <view v-if="profile" class="card reward-card">
        <view class="reward-head">
          <text class="card-title inline-title">{{ t('referral.rewardTitle') }}</text>
          <text class="reward-count">{{ t('referral.rewardCount', { count: rewards.length }) }}</text>
        </view>
        <view v-if="rewards.length === 0" class="reward-empty">{{ t('referral.rewardEmpty') }}</view>
        <view v-for="item in rewards" :key="item.rewardNo" class="reward-item" :class="item.status">
          <view class="reward-left">
            <text class="reward-amount">¥{{ fenToYuan(item.amount) }}</text>
            <text class="reward-desc">{{ t('referral.rewardBaseFee') }}</text>
          </view>
          <view class="reward-right">
            <text class="reward-status">{{ rewardStatusLabel(item.status) }}</text>
            <text v-if="item.expiresAt" class="reward-expire">{{ t('referral.rewardExpire', { date: formatDate(item.expiresAt) }) }}</text>
          </view>
        </view>
      </view>

      <!-- 邀请记录（服务端分页） -->
      <view v-if="profile" class="card records-card">
        <view class="reward-head">
          <text class="card-title inline-title">{{ t('referral.recordsTitle') }}</text>
          <text class="reward-count">{{ t('referral.recordsCount', { count: recordTotal }) }}</text>
        </view>
        <view v-if="records.length === 0" class="reward-empty">{{ t('referral.recordsEmpty') }}</view>
        <view v-for="record in records" :key="record.id" class="record-item">
          <view class="record-main">
            <text class="record-phone">{{ record.inviteePhone || '--' }}</text>
            <text class="record-order">{{ record.orderNo }}</text>
          </view>
          <view class="record-side">
            <text class="record-status" :class="record.status">{{ shareStatusLabel(record.status) }}</text>
            <text class="record-time">{{ formatDate(record.boundAt) }}</text>
          </view>
        </view>
        <view v-if="hasMoreRecords" class="load-more" @tap="loadRecords(recordsPage + 1)">
          {{ loadingRecords ? t('common.loading') : t('referral.loadMore') }}
        </view>
      </view>

      <!-- 进度 + 奖励 -->
      <view v-if="profile" class="card progress-card">
        <text class="card-title">{{ t('referral.progressTitle') }}</text>
        <view class="progress-wrap">
          <view class="progress-bar">
            <view
              class="progress-fill"
              :style="{ width: `${progressWidth}%` }"
            />
          </view>
          <view class="progress-labels">
            <text class="progress-done">
              {{ t('referral.progressDone', { count: profile.completedCount || 0 }) }}
            </text>
            <text v-if="profile.progressNextIn > 0" class="progress-next">
              {{
                isNewCycle
                  ? t('referral.progressNextCycle', { count: profile.progressNextIn })
                  : t('referral.progressNext', { count: profile.progressNextIn })
              }}
            </text>
            <text v-else class="progress-next done">{{ t('referral.progressDoneAll') }}</text>
          </view>
        </view>

        <view class="reward-row">
          <view class="reward-item">
            <text class="reward-num available">{{ profile.pendingFreeCount || 0 }}</text>
            <view class="reward-meta">
              <text class="reward-label">{{ t('referral.rewardAvailable') }}</text>
              <text class="reward-hint">{{ t('referral.rewardAvailableHint') }}</text>
            </view>
          </view>
          <view class="reward-divider" />
          <view class="reward-item">
            <text class="reward-num">{{ profile.totalFreeCount || 0 }}</text>
            <view class="reward-meta">
              <text class="reward-label">{{ t('referral.rewardTotal') }}</text>
              <text class="reward-hint">{{ t('referral.rewardUnit') }}</text>
            </view>
          </view>
          <view class="reward-divider" />
          <view class="reward-item">
            <text class="reward-num">{{ profile.usedCount || 0 }}</text>
            <view class="reward-meta">
              <text class="reward-label">{{ t('referral.usedCount') }}</text>
              <text class="reward-hint">{{ t('referral.usedUnit') }}</text>
            </view>
          </view>
        </view>
      </view>
    </template>

    <view class="page-bottom" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { t } from '@/locales/zh-CN'
import { getMyReferral, getMyRewards, getMyShareRecords, type MyReferralResult, type MyShareRecord, type ReferralRewardItem } from '@/api/my'
import { fenToYuan, formatDate } from '@/utils/format'
import {
  completeSsoLogin,
  getSsoToken,
  getSsoUser,
  goSsoLogin,
  saveSsoUser,
} from '@/utils/sso'
import { pageLink } from '@/utils/share'

const profile = ref<MyReferralResult | null>(null)
const loading = ref(false)
const loadFailed = ref(false)
const rewards = ref<ReferralRewardItem[]>([])
const records = ref<MyShareRecord[]>([])
const recordsPage = ref(1)
const recordTotal = ref(0)
const loadingRecords = ref(false)
const hasMoreRecords = computed(() => records.value.length < recordTotal.value)

function rewardStatusLabel(status: string): string {
  return t(`referral.rewardStatus.${status}`)
}

function shareStatusLabel(status: string): string {
  return t(`referral.shareStatus.${status}`)
}

const loggedIn = computed(() => Boolean(getSsoToken()))

const isNewCycle = computed(() => {
  const count = Number(profile.value?.completedCount || 0)
  const threshold = Number(profile.value?.threshold || 3)
  return count > 0 && threshold > 0 && count % threshold === 0
})

const inviteLink = computed(() => {
  if (!profile.value) return ''
  return pageLink(`/pages/order/create?ref=${profile.value.code}`)
})

const qrUrl = computed(() => {
  const url = inviteLink.value
  if (!url) return ''
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`
})

const progressWidth = computed(() => {
  if (!profile.value) return 0
  const threshold = profile.value.threshold || 3
  const done = profile.value.completedCount || 0
  return Math.min(100, Math.round((done / threshold) * 100))
})

onLoad(async () => {
  if (await completeSsoLogin()) {
    loadProfile()
    return
  }
  if (loggedIn.value) loadProfile()
})

async function loadProfile(): Promise<void> {
  loading.value = true
  loadFailed.value = false
  try {
    const result = await getMyReferral()
    profile.value = result
    loadRewards()
    loadRecords(1)
    // 同步用户信息
    const current = getSsoUser()
    if (current?.phone !== result.phone) {
      saveSsoUser({ phone: result.phone, nickname: result.nickname })
    }
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

function goLogin(): void {
  goSsoLogin()
}

async function loadRewards(): Promise<void> {
  try {
    const result = await getMyRewards()
    rewards.value = result.rewards || []
  } catch {
    rewards.value = []
  }
}

async function loadRecords(page: number): Promise<void> {
  if (loadingRecords.value) return
  loadingRecords.value = true
  try {
    const result = await getMyShareRecords({ page, pageSize: 10 })
    records.value = page === 1 ? result.data : [...records.value, ...result.data]
    recordTotal.value = result.pagination.total
    recordsPage.value = page
  } catch {
    // 忽略明细加载失败，避免影响主流程
  } finally {
    loadingRecords.value = false
  }
}

function copyCode(): void {
  if (!profile.value) return
  uni.setClipboardData({
    data: profile.value.code,
    success: () => uni.showToast({ title: t('referral.codeCopied'), icon: 'none' }),
    fail: () => uni.showToast({ title: t('common.copyFailed'), icon: 'none' }),
  })
}

function copyLink(): void {
  const url = inviteLink.value
  if (!url) return
  uni.setClipboardData({
    data: url,
    success: () => uni.showToast({ title: t('referral.linkCopied'), icon: 'none' }),
    fail: () => uni.showToast({ title: t('common.copyFailed'), icon: 'none' }),
  })
}
</script>
<style scoped>
.page {
  padding: 24rpx;
}
.login-card {
  padding: 80rpx 40rpx;
  text-align: center;
}
.login-title {
  display: block;
  font-size: 30rpx;
  color: var(--color-text-muted);
  margin-bottom: 40rpx;
}
.submit-btn {
  width: 400rpx;
  height: 88rpx;
  line-height: 88rpx;
  margin: 0 auto;
  border-radius: var(--radius-pill);
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-deep));
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
  box-shadow: 0 12rpx 26rpx rgba(37, 99, 235, 0.24);
}

/* 邀请码大卡片 */
.code-card {
  padding: 48rpx 28rpx;
  background: linear-gradient(135deg, #1e3a5f, #2563eb);
  border-radius: 24rpx;
  text-align: center;
  box-shadow: 0 16rpx 40rpx rgba(37, 99, 235, 0.3);
}
.code-card-label {
  display: block;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 2rpx;
}
.code-display {
  margin: 24rpx 0 32rpx;
  padding: 24rpx;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 16rpx;
  border: 2rpx dashed rgba(255, 255, 255, 0.4);
}
.code-text {
  font-size: 72rpx;
  font-weight: 800;
  letter-spacing: 12rpx;
  color: #fff;
  font-family: "Courier New", monospace;
}
.code-actions {
  display: flex;
  gap: 20rpx;
  justify-content: center;
}
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  padding: 16rpx 32rpx;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 24rpx;
  font-weight: 500;
}
.action-btn.primary {
  background: #fff;
  color: var(--color-primary-text);
}
.action-icon {
  font-size: 28rpx;
}
.action-label {
  font-size: 24rpx;
}

/* 链接 + 二维码 */
.link-card {
  margin-top: 24rpx;
  padding: 28rpx;
}
.card-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-text);
}
.link-row {
  margin-top: 16rpx;
  padding: 18rpx 20rpx;
  border-radius: var(--radius-sm);
  background: #f8fafc;
  border: 1rpx solid var(--color-border);
  word-break: break-all;
}
.link-text {
  font-size: 24rpx;
  color: var(--color-text-muted);
  line-height: 1.6;
}
.qr-block {
  margin-top: 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.qr-img {
  width: 280rpx;
  height: 280rpx;
  padding: 12rpx;
  background: #fff;
  border: 2rpx solid var(--color-border);
  border-radius: 12rpx;
}
.qr-hint {
  font-size: 22rpx;
  color: var(--color-text-muted);
}

/* 进度 + 奖励 */
.progress-card {
  margin-top: 24rpx;
  padding: 28rpx;
}
.progress-wrap {
  margin-top: 20rpx;
}
.progress-bar {
  width: 100%;
  height: 16rpx;
  border-radius: 8rpx;
  background: #e5e7eb;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 8rpx;
  background: linear-gradient(90deg, #22c55e, #16a34a);
  transition: width 0.5s ease;
}
.progress-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 12rpx;
  font-size: 24rpx;
}
.progress-done {
  color: var(--color-text);
  font-weight: 600;
}
.progress-next {
  color: var(--color-text-muted);
}
.progress-next.done {
  color: #22c55e;
  font-weight: 700;
}

.reward-row {
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  margin-top: 36rpx;
  padding: 28rpx 0 8rpx;
  border-top: 1rpx solid var(--color-border);
}
.reward-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}
.reward-num {
  font-size: 52rpx;
  font-weight: 800;
  color: var(--color-text);
  line-height: 1;
}
.reward-num.available {
  color: #22c55e;
}
.reward-meta {
  text-align: center;
}
.reward-label {
  display: block;
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.reward-hint {
  display: block;
  font-size: 20rpx;
  color: var(--color-text-muted);
  margin-top: 2rpx;
}
.reward-divider {
  width: 1rpx;
  background: var(--color-border);
}

.page-bottom {
  height: 60rpx;
}

.poster {
  padding: 34rpx 32rpx 30rpx;
  border-radius: 32rpx;
  background:
    radial-gradient(120% 90% at 12% 0%, rgba(56, 189, 248, 0.35), transparent 62%),
    linear-gradient(150deg, #0b2b4a, #11476e 55%, #0c3654);
  color: #fff;
  box-shadow: 0 20rpx 44rpx rgba(9, 42, 70, 0.28);
}
.poster-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.poster-brand {
  font-size: 22rpx;
  letter-spacing: 3rpx;
  opacity: 0.78;
}
.poster-badge {
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(250, 204, 21, 0.18);
  color: #fde68a;
  font-size: 20rpx;
  font-weight: 600;
}
.poster-title {
  display: block;
  margin-top: 18rpx;
  font-size: 38rpx;
  font-weight: 800;
  line-height: 1.35;
}
.poster-sub {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  line-height: 1.6;
  opacity: 0.8;
}
.poster-qr-card {
  display: flex;
  align-items: center;
  gap: 26rpx;
  margin-top: 26rpx;
  padding: 24rpx;
  border-radius: 22rpx;
  background: #fff;
  color: #0f172a;
}
.poster-qr {
  width: 168rpx;
  height: 168rpx;
  border-radius: 12rpx;
  background: #f1f5f9;
  flex-shrink: 0;
}
.poster-code-block {
  flex: 1;
  min-width: 0;
}
.poster-code-label {
  display: block;
  font-size: 20rpx;
  color: #64748b;
}
.poster-code {
  display: block;
  margin-top: 4rpx;
  font-size: 44rpx;
  font-weight: 800;
  letter-spacing: 6rpx;
  color: #0b2b4a;
}
.poster-code-hint {
  display: block;
  margin-top: 6rpx;
  font-size: 21rpx;
  line-height: 1.5;
  color: #94a3b8;
}
.poster-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 22rpx;
}
.poster-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  height: 76rpx;
  border-radius: 16rpx;
  background: #fff;
  color: #0b2b4a;
  font-size: 25rpx;
  font-weight: 600;
}
.poster-btn.ghost {
  background: rgba(255, 255, 255, 0.14);
  color: #e2f1ff;
  border: 1rpx solid rgba(255, 255, 255, 0.28);
}
.poster-btn-ico {
  font-size: 24rpx;
}
.reward-card,
.records-card {
  padding: 26rpx 26rpx 10rpx;
}
.reward-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.inline-title {
  display: inline;
}
.reward-count {
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.reward-empty {
  padding: 26rpx 0;
  font-size: 23rpx;
  color: var(--color-text-muted);
  text-align: center;
}
.reward-card .reward-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--color-border);
}
.reward-card .reward-item:last-child {
  border-bottom: none;
}
.reward-card .reward-item.used,
.reward-card .reward-item.expired,
.reward-card .reward-item.void {
  opacity: 0.55;
}
.reward-left {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.reward-amount {
  font-size: 34rpx;
  font-weight: 800;
  color: #b45309;
}
.reward-desc {
  font-size: 21rpx;
  color: var(--color-text-muted);
}
.reward-right {
  text-align: right;
}
.reward-status {
  display: block;
  font-size: 23rpx;
  font-weight: 600;
  color: #16a34a;
}
.reward-item.used .reward-status,
.reward-item.expired .reward-status,
.reward-item.void .reward-status {
  color: #94a3b8;
}
.reward-expire {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: var(--color-text-muted);
}
.records-card .record-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--color-border);
}
.record-main {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}
.record-phone {
  font-size: 26rpx;
  font-weight: 600;
}
.record-order {
  font-size: 20rpx;
  color: var(--color-text-muted);
}
.record-side {
  text-align: right;
  flex-shrink: 0;
}
.record-status {
  display: block;
  font-size: 22rpx;
  font-weight: 600;
  color: #16a34a;
}
.record-status.bound {
  color: #2563eb;
}
.record-status.pending_review,
.record-status.invalid,
.record-status.rolled_back {
  color: #94a3b8;
}
.record-time {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: var(--color-text-muted);
}
.load-more {
  padding: 22rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: var(--color-primary-text);
  font-weight: 600;
}
</style>
