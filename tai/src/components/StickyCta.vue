<template>
  <view class="sticky-wrap">
    <view class="sticky-cta safe-bottom">
      <view class="sc-inner">
        <view v-if="mainText || subtext" class="sc-info">
          <text v-if="subtext" class="sc-sub">{{ subtext }}</text>
          <text v-if="mainText" class="sc-main">{{ mainText }}</text>
        </view>
        <button class="sc-btn" :disabled="disabled" @tap="emit('click')">{{ text }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  text: string
  mainText?: string
  subtext?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'click'): void
}>()
</script>

<style scoped>
.sticky-wrap {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 100%;
  max-width: 750px;
  z-index: 900;
}
.sticky-cta {
  background: rgba(255, 255, 255, 0.96);
  box-shadow: var(--shadow-float);
  border-top: 1rpx solid var(--color-border);
  backdrop-filter: blur(12px);
}
.sc-inner {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 20rpx 28rpx;
}
.sc-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.sc-sub {
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.sc-main {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-primary-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sc-btn {
  flex: none;
  min-width: 280rpx;
  height: 88rpx;
  line-height: 88rpx;
  padding: 0 44rpx;
  margin: 0;
  border-radius: var(--radius-pill);
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-deep));
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
  text-align: center;
  box-shadow: 0 12rpx 26rpx rgba(37, 99, 235, 0.28);
}
.sc-btn[disabled] {
  background: #b7c7e8;
  box-shadow: none;
  color: #fff;
}
</style>
