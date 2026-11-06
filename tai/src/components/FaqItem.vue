<template>
  <view class="faq-item" :class="{ open: expanded }" @tap="expanded = !expanded">
    <view class="faq-head">
      <text class="faq-q">{{ faq.question }}</text>
      <text class="faq-icon">{{ expanded ? '−' : '+' }}</text>
    </view>
    <view v-if="expanded" class="faq-body">
      <rich-text class="faq-a" :nodes="faq.answer || ''" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Faq } from '@/api/site'

defineProps<{
  faq: Faq
}>()

const expanded = ref(false)
</script>

<style scoped>
.faq-item {
  padding: 24rpx 0;
  border-bottom: 1rpx solid rgba(23, 23, 23, 0.06);
}
.faq-item:last-child {
  border-bottom: none;
}
.faq-head {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
}
.faq-q {
  flex: 1;
  font-size: 27rpx;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.55;
}
.faq-icon {
  flex: none;
  width: 40rpx;
  height: 40rpx;
  line-height: 36rpx;
  text-align: center;
  border-radius: 50%;
  font-size: 30rpx;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
.faq-item.open .faq-icon {
  color: var(--color-primary-text);
  background: #c7ddfd;
}
.faq-body {
  margin-top: 14rpx;
  padding: 20rpx;
  border-radius: var(--radius-sm);
  background: #f8fafc;
}
.faq-a {
  font-size: 25rpx;
  color: var(--color-text-muted);
  line-height: 1.7;
}
</style>
