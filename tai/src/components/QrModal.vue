<template>
  <view v-if="visible" class="qr-mask" @tap="close">
    <view class="qr-panel" @tap.stop>
      <text class="qr-title">{{ title }}</text>
      <text v-if="subtitle" class="qr-subtitle">{{ subtitle }}</text>

      <view class="qr-box">
        <image v-if="image" class="qr-image" :src="image" mode="aspectFit" />
        <view v-else class="qr-loading">{{ t('common.loading') }}</view>
      </view>

      <view v-if="orderNo" class="qr-order">
        <text class="qr-order-label">{{ t('create.orderNo') }}</text>
        <text class="qr-order-value">{{ orderNo }}</text>
      </view>
      <text v-if="hint" class="qr-hint">{{ hint }}</text>

      <view class="qr-actions">
        <view v-if="showCopy" class="btn btn-outline btn-sm" @tap="emit('copy')">
          {{ t('create.copyOrderNo') }}
        </view>
        <view v-if="showSave" class="btn btn-outline btn-sm" @tap="emit('save', image)">
          {{ t('common.saveQr') }}
        </view>
        <view v-if="showView" class="btn btn-primary btn-sm" @tap="emit('view')">
          {{ t('create.viewOrder') }}
        </view>
      </view>

      <view class="qr-close" @tap="close">{{ t('common.close') }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import QRCode from 'qrcode'
import { t } from '@/locales/zh-CN'

const props = withDefaults(
  defineProps<{
    visible?: boolean
    title: string
    subtitle?: string
    content: string
    orderNo?: string
    hint?: string
    showCopy?: boolean
    showView?: boolean
    showSave?: boolean
  }>(),
  {
    visible: false,
    subtitle: '',
    orderNo: '',
    hint: '',
    showCopy: false,
    showView: false,
    showSave: false,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'copy'): void
  (e: 'view'): void
  (e: 'save', dataUrl: string): void
}>()

const image = ref('')

function close(): void {
  emit('close')
}

async function generate(): Promise<void> {
  if (!props.visible || !props.content) {
    image.value = ''
    return
  }
  try {
    image.value = await QRCode.toDataURL(props.content, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1E3A8A', light: '#FFFFFF' },
    })
  } catch (error) {
    image.value = ''
  }
}

watch(() => [props.visible, props.content], generate, { immediate: true })
</script>

<style scoped>
.qr-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}
.qr-panel {
  width: 100%;
  max-width: 640rpx;
  background: #fff;
  border-radius: 32rpx;
  padding: 44rpx 36rpx 28rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 24rpx 60rpx rgba(15, 23, 42, 0.28);
}
.qr-title {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--color-text);
}
.qr-subtitle {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: var(--color-text-muted);
  text-align: center;
  line-height: 1.5;
}
.qr-box {
  margin-top: 28rpx;
  padding: 20rpx;
  border-radius: var(--radius-card);
  background: #fff;
  border: 2rpx solid var(--color-border-soft);
  width: 380rpx;
  height: 380rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.qr-image {
  width: 340rpx;
  height: 340rpx;
}
.qr-loading {
  font-size: 24rpx;
  color: var(--color-text-muted);
}
.qr-order {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 24rpx;
}
.qr-order-label {
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.qr-order-value {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-primary-text);
  letter-spacing: 1rpx;
}
.qr-hint {
  margin-top: 12rpx;
  font-size: 22rpx;
  color: var(--color-text-muted);
  text-align: center;
}
.qr-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  justify-content: center;
  margin-top: 30rpx;
  width: 100%;
}
.qr-close {
  margin-top: 24rpx;
  padding: 10rpx 30rpx;
  font-size: 24rpx;
  color: var(--color-text-muted);
}
</style>
