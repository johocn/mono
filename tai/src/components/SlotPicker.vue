<template>
  <view class="slot-picker">
    <view class="slot-row">
      <view
        v-for="item in slots"
        :key="item.slot"
        class="slot-item"
        :class="{ on: modelValue === item.slot, disabled: isDisabled(item) }"
        @tap="pick(item)"
      >
        <view class="slot-top">
          <text class="slot-name">{{ t(`slots.${item.slot}`) }}</text>
          <text class="slot-radio">{{ modelValue === item.slot ? '✓' : '' }}</text>
        </view>
        <text class="slot-remain">
          <template v-if="loading">{{ t('slots.loading') }}</template>
          <template v-else-if="loadError">{{ t('slots.loadFailed') }}</template>
          <template v-else-if="item.remaining <= 0">{{ t('slots.full') }}</template>
          <template v-else>{{ t('slots.remaining', { count: item.remaining }) }}</template>
        </text>
      </view>
    </view>
    <text v-if="!date" class="slot-tip">{{ t('create.validPickupDate') }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '@/locales/zh-CN'
import { getSlots, type SlotName, type SlotUsage } from '@/api/site'

const props = defineProps<{
  date?: string
  modelValue?: SlotName | ''
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: SlotName | ''): void
}>()

const loading = ref(false)
const loadError = ref(false)
const result = ref<{ morning?: SlotUsage; afternoon?: SlotUsage }>({})

const slots = computed<Array<{ slot: SlotName; remaining: number }>>(() => [
  { slot: 'morning', remaining: Number(result.value.morning?.remaining ?? 0) },
  { slot: 'afternoon', remaining: Number(result.value.afternoon?.remaining ?? 0) },
])

function isDisabled(item: { slot: SlotName; remaining: number }): boolean {
  if (!props.date || loading.value) return true
  if (loadError.value) return false
  return item.remaining <= 0
}

function pick(item: { slot: SlotName; remaining: number }): void {
  if (isDisabled(item)) return
  emit('update:modelValue', item.slot)
}

async function load(date?: string): Promise<void> {
  result.value = {}
  loadError.value = false
  if (!date) return
  loading.value = true
  try {
    const data = await getSlots(date)
    result.value = { morning: data.morning, afternoon: data.afternoon }
  } catch (error) {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

watch(
  () => props.date,
  (value) => {
    load(value)
  },
  { immediate: true },
)
</script>

<style scoped>
.slot-picker {
  width: 100%;
}
.slot-row {
  display: flex;
  gap: 20rpx;
}
.slot-item {
  flex: 1;
  padding: 20rpx;
  border-radius: var(--radius-sm);
  border: 2rpx solid var(--color-border);
  background: #fff;
  transition: all 0.15s ease;
}
.slot-item.on {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.slot-item.disabled {
  opacity: 0.5;
  background: #f4f5f7;
}
.slot-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.slot-name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-text);
}
.slot-radio {
  width: 32rpx;
  height: 32rpx;
  line-height: 32rpx;
  text-align: center;
  border-radius: 50%;
  border: 2rpx solid var(--color-border);
  font-size: 20rpx;
  color: #fff;
  background: #fff;
}
.slot-item.on .slot-radio {
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.slot-remain {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.slot-item.on .slot-remain {
  color: var(--color-primary-text);
}
.slot-tip {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: var(--color-accent);
}
</style>
