<template>
  <view class="photo-grid">
    <view
      v-for="(url, index) in urls"
      :key="`${url}-${index}`"
      class="photo-item"
      :style="itemStyle"
      @tap="preview(index)"
    >
      <image class="photo-img" :src="url" mode="aspectFill" :lazy-load="true" />
    </view>
    <view v-if="!urls.length" class="photo-empty">{{ emptyText || t('common.empty') }}</view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/locales/zh-CN'
import { resolveMediaUrl } from '@/api/http'
import type { MediaFile } from '@/api/site'

const props = withDefaults(
  defineProps<{
    photos?: Array<MediaFile | string> | null
    columns?: number
    emptyText?: string
  }>(),
  { photos: () => [], columns: 3, emptyText: '' },
)

const urls = computed(() =>
  (props.photos || [])
    .map((photo) => (typeof photo === 'string' ? photo : photo?.url))
    .filter((url): url is string => Boolean(url))
    .map((url) => resolveMediaUrl(url)),
)

const itemStyle = computed(() => {
  const columns = Math.max(1, Number(props.columns) || 3)
  return {
    width: `calc((100% - ${(columns - 1) * 8}rpx) / ${columns})`,
  }
})

function preview(index: number): void {
  uni.previewImage({ urls: urls.value, current: urls.value[index] })
}
</script>

<style scoped>
.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}
.photo-item {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #eef2f7;
}
.photo-img {
  width: 100%;
  height: 100%;
  display: block;
}
.photo-empty {
  width: 100%;
  padding: 40rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: var(--color-text-muted);
  background: #f8fafc;
  border-radius: var(--radius-sm);
}
</style>
