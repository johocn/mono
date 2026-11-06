<template>
  <view class="form-field">
    <view class="ff-head">
      <view class="ff-label-wrap">
        <text class="ff-label">{{ label }}</text>
        <text v-if="required" class="ff-req">*</text>
        <text v-if="optional" class="ff-optional">{{ t('common.optional') }}</text>
      </view>
      <text v-if="hint && !error" class="ff-hint">{{ hint }}</text>
    </view>
    <view class="ff-control">
      <slot />
    </view>
    <text v-if="error" class="ff-error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { t } from '@/locales/zh-CN'

defineProps<{
  label: string
  required?: boolean
  optional?: boolean
  error?: string
  hint?: string
}>()
</script>

<style scoped>
.form-field {
  padding: 22rpx 0;
  border-bottom: 1rpx solid rgba(23, 23, 23, 0.06);
}
.form-field:last-child {
  border-bottom: none;
}
.ff-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 14rpx;
}
.ff-label-wrap {
  display: flex;
  align-items: center;
  gap: 6rpx;
}
.ff-label {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-text);
}
.ff-req {
  color: var(--color-accent);
  font-size: 26rpx;
  line-height: 1;
}
.ff-optional {
  font-size: 20rpx;
  color: var(--color-text-muted);
  background: #f1f5f9;
  border-radius: var(--radius-pill);
  padding: 2rpx 10rpx;
  margin-left: 4rpx;
}
.ff-hint {
  font-size: 22rpx;
  color: var(--color-text-muted);
  text-align: right;
}
.ff-error {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: var(--color-accent);
}
</style>
