<template>
  <view class="section-header">
    <view class="sh-main">
      <view class="sh-bar" />
      <view class="sh-text">
        <text class="sh-title">{{ title }}</text>
        <text v-if="subtitle" class="sh-sub">{{ subtitle }}</text>
      </view>
    </view>
    <view v-if="actionText" class="sh-action" @tap="emit('action')">{{ actionText }} ›</view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  actionText?: string
}>()

const emit = defineEmits<{
  (e: 'action'): void
}>()
</script>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 40rpx 32rpx 20rpx;
}
.sh-main {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 0;
}
.sh-bar {
  width: 8rpx;
  height: 34rpx;
  border-radius: 8rpx;
  background: linear-gradient(180deg, var(--color-primary), #60a5fa);
  flex: none;
}
.sh-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sh-title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.5rpx;
}
.sh-sub {
  margin-top: 4rpx;
  font-size: 24rpx;
  color: var(--color-text-muted);
}
.sh-action {
  font-size: 24rpx;
  color: var(--color-primary);
  flex: none;
  padding-left: 16rpx;
}
</style>
