<template>
  <view class="price-summary">
    <view class="ps-row">
      <text class="ps-label">{{ t('create.pricePackage') }}</text>
      <text class="ps-value">{{ formatMoney(amountPackage) }}</text>
    </view>
    <view class="ps-row">
      <text class="ps-label">{{ t('create.priceAddon') }}</text>
      <text class="ps-value">{{ formatMoney(amountAddon) }}</text>
    </view>
    <view v-if="addonItems.length" class="ps-addons">
      <view v-for="item in addonItems" :key="item.code || item.name" class="ps-addon">
        <text class="ps-addon-name">{{ item.name }}</text>
        <text class="ps-addon-price">{{ formatMoney(item.amount) }}</text>
      </view>
    </view>
    <view v-if="discount > 0" class="ps-row ps-discount">
      <text class="ps-label">{{ t('create.priceDiscount') }}</text>
      <text class="ps-value">-{{ formatMoney(discount) }}</text>
    </view>
    <view class="ps-total">
      <text class="ps-total-label">{{ t('create.priceTitle') }}</text>
      <view class="ps-total-value">
        <text class="ps-total-cur">¥</text>
        <text class="ps-total-num">{{ fenToYuan(amountTotal) }}</text>
      </view>
    </view>
    <text v-if="note" class="ps-note">{{ note }}</text>
  </view>
</template>

<script setup lang="ts">
import { t } from '@/locales/zh-CN'
import { fenToYuan, formatMoney } from '@/utils/format'

defineProps<{
  amountPackage: number
  amountAddon: number
  amountTotal: number
  discount?: number
  addonItems?: Array<{ name: string; code?: string; amount: number }>
  note?: string
}>()
</script>

<style scoped>
.price-summary {
  width: 100%;
}
.ps-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 0;
}
.ps-label {
  font-size: 26rpx;
  color: var(--color-text-muted);
}
.ps-value {
  font-size: 26rpx;
  color: var(--color-text);
  font-weight: 500;
}
.ps-discount .ps-value {
  color: #16a34a;
  font-weight: 600;
}
.ps-addons {
  margin: 4rpx 0 8rpx 20rpx;
  padding-left: 18rpx;
  border-left: 2rpx solid var(--color-border-soft);
}
.ps-addon {
  display: flex;
  justify-content: space-between;
  padding: 4rpx 0;
}
.ps-addon-name {
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.ps-addon-price {
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.ps-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18rpx;
  padding-top: 20rpx;
  border-top: 1rpx dashed var(--color-border);
}
.ps-total-label {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-text);
}
.ps-total-value {
  display: flex;
  align-items: baseline;
  color: var(--color-accent);
}
.ps-total-cur {
  font-size: 26rpx;
  font-weight: 700;
  margin-right: 2rpx;
}
.ps-total-num {
  font-size: 52rpx;
  font-weight: 800;
  letter-spacing: -1rpx;
}
.ps-note {
  display: block;
  margin-top: 8rpx;
  font-size: 20rpx;
  color: var(--color-text-muted);
  text-align: right;
}
</style>
