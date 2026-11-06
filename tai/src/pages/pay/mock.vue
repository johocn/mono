<template>
  <view class="page">
    <view class="mock-card">
      <text class="mock-tag">{{ t('pay.mockTag') }}</text>
      <text class="mock-title">{{ t('pay.mockTitle') }}</text>
      <view class="mock-amount">
        <text class="mock-cur">¥</text>
        <text class="mock-num">{{ amountText }}</text>
      </view>
      <text class="mock-no">{{ t('pay.mockNo') }} {{ paymentNo }}</text>
      <text class="mock-hint">{{ t('pay.mockHint') }}</text>
      <button class="btn btn-primary mock-btn" :disabled="paying || paid" @tap="confirmPay">
        {{ paid ? t('pay.mockPaid') : paying ? t('pay.mockPaying') : t('pay.mockConfirm') }}
      </button>
      <view class="mock-cancel" @tap="goBack">{{ t('pay.mockCancel') }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { t } from '@/locales/zh-CN'
import { mockPay } from '@/api/pay'
import { errorText } from '@/api/http'
import { fenToYuan } from '@/utils/format'

const paymentNo = ref('')
const amount = ref(0)
const paying = ref(false)
const paid = ref(false)
const amountText = ref('--')

onLoad((options: any) => {
  paymentNo.value = String(options?.paymentNo || '')
  amountText.value = String(options?.amount ? fenToYuan(Number(options.amount)) : '--')
})

async function confirmPay(): Promise<void> {
  if (paying.value || paid.value || !paymentNo.value) return
  paying.value = true
  try {
    await mockPay(paymentNo.value)
    paid.value = true
    uni.showToast({ title: t('pay.mockSuccess'), icon: 'none' })
    setTimeout(() => goBack(), 800)
  } catch (error) {
    uni.showToast({ title: errorText(error), icon: 'none' })
  } finally {
    paying.value = false
  }
}

function goBack(): void {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.redirectTo({ url: '/pages/order/query' })
  }
}
</script>

<style scoped>
.page {
  padding: 40rpx 28rpx;
}
.mock-card {
  padding: 44rpx 36rpx;
  border-radius: 28rpx;
  background: #fff;
  box-shadow: 0 18rpx 40rpx rgba(15, 61, 110, 0.12);
  text-align: center;
}
.mock-tag {
  display: inline-block;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  background: #fff7ed;
  color: #b45309;
  font-size: 20rpx;
  font-weight: 600;
}
.mock-title {
  display: block;
  margin-top: 20rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: #0f172a;
}
.mock-amount {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 6rpx;
  margin-top: 24rpx;
  color: #145c9e;
}
.mock-cur {
  font-size: 30rpx;
  font-weight: 700;
}
.mock-num {
  font-size: 68rpx;
  font-weight: 800;
}
.mock-no {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #64748b;
  word-break: break-all;
}
.mock-hint {
  display: block;
  margin-top: 24rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #64748b;
}
.mock-btn {
  width: 100%;
  margin-top: 32rpx;
  height: 88rpx;
  border-radius: 18rpx;
  background: linear-gradient(120deg, #145c9e, #1d74c4);
  color: #fff;
  font-size: 28rpx;
  font-weight: 700;
}
.mock-cancel {
  margin-top: 24rpx;
  font-size: 24rpx;
  color: #94a3b8;
}
</style>
