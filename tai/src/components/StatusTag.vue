<template>
  <view class="status-tags">
    <view class="status-tag" :class="toneClass">{{ text }}</view>
    <view v-if="outboundStatus === 'pending'" class="status-tag tag--orange">
      {{ t('outboundStatus.pending') }}
    </view>
    <view v-else-if="outboundStatus === 'approved'" class="status-tag tag--green">
      {{ t('outboundStatus.approved') }}
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { statusText, t } from '@/locales/zh-CN'

const props = defineProps<{
  status: string
  serviceType?: string
  outboundStatus?: string
}>()

const text = computed(() => statusText(props.status, props.serviceType))

const toneClass = computed(() => {
  switch (props.status) {
    case 'stored':
      return 'tag--green'
    case 'pending_outbound':
      return 'tag--orange'
    case 'completed':
      return 'tag--muted'
    case 'rejected':
      return 'tag--danger'
    case 'canceled':
      return 'tag--muted'
    case 'accepted':
      return 'tag--blue-soft'
    default:
      return 'tag--blue'
  }
})
</script>

<style scoped>
.status-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  align-items: center;
}
.status-tag {
  display: inline-flex;
  align-items: center;
  height: 44rpx;
  padding: 0 18rpx;
  border-radius: var(--radius-pill);
  font-size: 22rpx;
  font-weight: 600;
}
.tag--blue {
  background: var(--color-primary);
  color: #fff;
}
.tag--blue-soft {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
}
.tag--green {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.tag--orange {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.tag--muted {
  background: #f1f5f9;
  color: var(--color-text-muted);
}
.tag--danger {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
</style>
