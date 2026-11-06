<template>
  <view class="pkg-card" :class="{ 'is-selected': selected }" @tap="emit('select')">
    <view v-if="selected" class="pkg-flag">{{ t('package.selected') }}</view>
    <view class="pkg-head">
      <text class="pkg-name">{{ pkg?.name || t('common.notSet') }}</text>
      <text v-if="pkg?.baseMonths" class="pkg-badge">{{ t('package.baseMonths', { count: pkg.baseMonths }) }}</text>
    </view>

    <view class="pkg-prices">
      <view class="price-col">
        <text class="price-label">{{ t('package.storePrice') }}</text>
        <view class="price-value">
          <text v-if="pkg?.storePrice != null" class="price-cur">¥</text>
          <text class="price-num">{{ pkg?.storePrice != null ? fenToYuan(pkg.storePrice) : '--' }}</text>
        </view>
      </view>
    </view>

    <view class="pkg-meta">
      <text v-if="pkg?.extraMonthPrice" class="meta-item">
        {{ t('package.extraMonth', { price: fenToYuan(pkg.extraMonthPrice) }) }}
      </text>
      <text v-if="pkg?.overdueDayPrice" class="meta-item">
        {{ t('package.overdue', { price: fenToYuan(pkg.overdueDayPrice) }) }}
      </text>
      <text v-if="pkg?.durationText" class="meta-item">{{ t('package.duration', { date: pkg.durationText }) }}</text>
    </view>

    <view v-if="highlights.length" class="pkg-toggle" @tap.stop="toggle">
      <text>{{ expanded ? t('package.collapse') : t('package.details') }}</text>
      <text class="chev">{{ expanded ? '−' : '+' }}</text>
    </view>
    <view v-if="expanded && highlights.length" class="pkg-highlights">
      <view v-for="(item, index) in highlights" :key="index" class="hl-item">
        <text class="hl-dot">•</text>
        <text class="hl-text">{{ item }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '@/locales/zh-CN'
import { fenToYuan } from '@/utils/format'
import type { TirePackage } from '@/api/site'

const props = defineProps<{
  pkg?: TirePackage | null
  selected?: boolean
}>()

const emit = defineEmits<{
  (e: 'select'): void
}>()

const expanded = ref(false)

const highlights = computed<string[]>(() => {
  const raw = props.pkg?.highlights
  if (!Array.isArray(raw)) {
    if (typeof raw === 'string' && raw.trim()) return [raw]
    return []
  }
  return raw
    .map((item: any) => {
      if (typeof item === 'string') return item
      if (typeof item === 'object' && item) return String(item.text || item.title || item.label || '')
      return ''
    })
    .filter(Boolean)
})

function toggle() {
  expanded.value = !expanded.value
}
</script>

<style scoped>
.pkg-card {
  position: relative;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 28rpx;
  border: 2rpx solid transparent;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
.pkg-card.is-selected {
  border-color: var(--color-primary);
  background: linear-gradient(180deg, #f5f9ff, #ffffff 60%);
}
.pkg-flag {
  position: absolute;
  right: 0;
  top: 0;
  padding: 8rpx 20rpx 8rpx 26rpx;
  background: var(--color-primary);
  color: #fff;
  font-size: 22rpx;
  border-bottom-left-radius: var(--radius-pill);
}
.pkg-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding-right: 80rpx;
}
.pkg-name {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--color-text);
}
.pkg-badge {
  font-size: 20rpx;
  color: var(--color-primary-text);
  background: var(--color-primary-soft);
  border-radius: var(--radius-pill);
  padding: 4rpx 14rpx;
}
.pkg-prices {
  display: flex;
  align-items: center;
  margin-top: 24rpx;
  padding: 20rpx;
  border-radius: var(--radius-sm);
  background: #f8fafc;
}
.price-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.price-divider {
  width: 1rpx;
  height: 72rpx;
  background: var(--color-border);
}
.price-label {
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.price-value {
  display: flex;
  align-items: baseline;
  margin-top: 4rpx;
  color: var(--color-accent);
}
.price-cur {
  font-size: 24rpx;
  font-weight: 700;
  margin-right: 2rpx;
}
.price-num {
  font-size: 46rpx;
  font-weight: 800;
  letter-spacing: -1rpx;
}
.pkg-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx 24rpx;
  margin-top: 18rpx;
}
.meta-item {
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.pkg-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
  padding-top: 18rpx;
  border-top: 1rpx dashed var(--color-border);
  font-size: 24rpx;
  color: var(--color-primary);
}
.chev {
  font-size: 32rpx;
  line-height: 1;
}
.pkg-highlights {
  margin-top: 12rpx;
}
.hl-item {
  display: flex;
  gap: 10rpx;
  padding: 6rpx 0;
}
.hl-dot {
  color: var(--color-primary);
  font-size: 24rpx;
}
.hl-text {
  flex: 1;
  font-size: 24rpx;
  color: var(--color-text-muted);
  line-height: 1.6;
}
</style>
