<template>
  <view class="loc-card card">
    <view class="loc-head">
      <view class="loc-head-main">
        <text class="loc-title">{{ t('location.title') }}</text>
        <text class="loc-sub">{{ t('location.subtitle') }}</text>
      </view>
      <text class="loc-badge">{{ t('location.badge') }}</text>
    </view>

    <view class="map-wrap" @tap="onMapTap">
      <view v-if="showCanvas" id="tire-map-canvas" class="map-canvas" />
      <view v-if="mapState !== 'ready'" class="map-fallback">
        <view class="map-grid" />
        <view class="map-pin">
          <view class="pin-dot" />
        </view>
        <text class="map-state">{{ fallbackText }}</text>
        <text class="map-hint">{{ t('location.fallbackHint') }}</text>
      </view>
      <text v-else class="map-tip">{{ t('location.mapHint') }}</text>
    </view>

    <view class="loc-address-row">
      <text class="loc-address-label">{{ t('location.address') }}</text>
      <text class="loc-address">{{ address || t('location.noAddress') }}</text>
    </view>

    <view class="loc-actions">
      <view class="loc-btn primary" @tap.stop="navigate">{{ t('location.navigate') }}</view>
      <view class="loc-btn ghost" @tap.stop="copyAddress">{{ t('location.copyAddress') }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { t } from '@/locales/zh-CN'
import type { SiteConfig } from '@/api/site'
import { getMapKey, hasValidCoords, loadTencentMapSdk, openNavigation } from '@/utils/map'

const props = defineProps<{ config: SiteConfig }>()

const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">' +
  '<path d="M13 0C6.4 0 1 5.4 1 12c0 9 12 22 12 22s12-13 12-22C25 5.4 19.6 0 13 0z" fill="#2563eb"/>' +
  '<circle cx="13" cy="12" r="4.6" fill="#ffffff"/></svg>'

const PIN_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(PIN_SVG)}`

const mapKey = getMapKey()
const mapState = ref<'loading' | 'ready' | 'failed' | 'noKey' | 'noCoords'>('loading')
const hasCoords = computed(() =>
  hasValidCoords({ lat: props.config.warehouseLat, lng: props.config.warehouseLng }),
)
const address = computed(() => String(props.config.warehouseAddress || '').trim())
const showCanvas = computed(() => hasCoords.value && Boolean(mapKey))

const fallbackText = computed(() => {
  if (mapState.value === 'loading') return t('location.sdkLoading')
  if (mapState.value === 'noKey') return t('location.sdkMissing')
  if (mapState.value === 'noCoords') return t('location.noCoords')
  return t('location.sdkFailed')
})

let mapInstance: any = null
let initializing = false

function destroyMap(): void {
  if (mapInstance) {
    try {
      mapInstance.destroy()
    } catch (error) {
      // 销毁失败不影响页面
    }
    mapInstance = null
  }
}

async function initMap(): Promise<void> {
  if (initializing || mapInstance) return
  if (!hasCoords.value) {
    mapState.value = 'noCoords'
    return
  }
  if (!mapKey) {
    mapState.value = 'noKey'
    return
  }

  initializing = true
  mapState.value = 'loading'
  await nextTick()

  const TMap = await loadTencentMapSdk(mapKey)
  if (!TMap) {
    mapState.value = 'failed'
    initializing = false
    return
  }

  const container = document.getElementById('tire-map-canvas')
  if (!container) {
    mapState.value = 'failed'
    initializing = false
    return
  }

  const lat = Number(props.config.warehouseLat)
  const lng = Number(props.config.warehouseLng)
  try {
    mapInstance = new TMap.Map(container, {
      center: new TMap.LatLng(lat, lng),
      zoom: 16,
      pitch: 0,
      viewMode: '2D',
      showControl: false,
    })
    new TMap.MultiMarker({
      map: mapInstance,
      styles: {
        destination: new TMap.MarkerStyle({
          width: 26,
          height: 34,
          anchor: { x: 13, y: 34 },
          src: PIN_ICON,
        }),
      },
      geometries: [{ id: 'tire-location', styleId: 'destination', position: new TMap.LatLng(lat, lng) }],
    })
    mapInstance.on('click', () => navigate())
    mapState.value = 'ready'
  } catch (error) {
    destroyMap()
    mapState.value = 'failed'
  } finally {
    initializing = false
  }
}

function navigate(): void {
  openNavigation({
    lat: props.config.warehouseLat,
    lng: props.config.warehouseLng,
    name: t('location.destination'),
    address: address.value,
    mapUrl: props.config.mapUrl,
  })
}

function onMapTap(): void {
  if (mapState.value !== 'ready') navigate()
}

function copyAddress(): void {
  if (!address.value) {
    uni.showToast({ title: t('location.noAddress'), icon: 'none' })
    return
  }
  uni.setClipboardData({
    data: address.value,
    success: () => uni.showToast({ title: t('location.addressCopied'), icon: 'none' }),
  })
}

watch(
  () => [hasCoords.value, address.value],
  () => initMap(),
  { immediate: true },
)

onBeforeUnmount(destroyMap)
</script>

<style scoped>
.loc-card {
  padding: 26rpx 26rpx 24rpx;
  margin-top: 20rpx;
}
.loc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}
.loc-head-main {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.loc-title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-text);
}
.loc-sub {
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.loc-badge {
  flex: none;
  padding: 6rpx 16rpx;
  border-radius: var(--radius-pill);
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  font-size: 21rpx;
  font-weight: 600;
}
.map-wrap {
  position: relative;
  height: 300rpx;
  margin-top: 18rpx;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #eaf1fb;
}
.map-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.map-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  background: linear-gradient(135deg, #eef5ff 0%, #e2ecfb 100%);
  overflow: hidden;
}
.map-grid {
  position: absolute;
  inset: 0;
  opacity: 0.55;
  background-image: linear-gradient(rgba(37, 99, 235, 0.1) 1rpx, transparent 1rpx),
    linear-gradient(90deg, rgba(37, 99, 235, 0.1) 1rpx, transparent 1rpx);
  background-size: 56rpx 56rpx;
}
.map-pin {
  position: relative;
  z-index: 1;
  width: 34rpx;
  height: 44rpx;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  background: var(--color-primary);
  box-shadow: 0 8rpx 18rpx rgba(37, 99, 235, 0.28);
}
.pin-dot {
  position: absolute;
  top: 8rpx;
  left: 8rpx;
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #fff;
}
.map-state {
  position: relative;
  z-index: 1;
  margin-top: 12rpx;
  font-size: 23rpx;
  font-weight: 600;
  color: var(--color-primary-text);
}
.map-hint {
  position: relative;
  z-index: 1;
  font-size: 20rpx;
  color: var(--color-text-muted);
}
.map-tip {
  position: absolute;
  top: 14rpx;
  right: 16rpx;
  padding: 6rpx 14rpx;
  border-radius: var(--radius-pill);
  background: rgba(23, 23, 23, 0.62);
  color: #fff;
  font-size: 20rpx;
}
.loc-address-row {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  margin-top: 18rpx;
}
.loc-address-label {
  flex: none;
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.loc-address {
  flex: 1;
  font-size: 25rpx;
  color: var(--color-text);
  line-height: 1.5;
}
.loc-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}
.loc-btn {
  flex: 1;
  height: 74rpx;
  line-height: 74rpx;
  text-align: center;
  border-radius: var(--radius-pill);
  font-size: 26rpx;
  font-weight: 600;
}
.loc-btn.primary {
  background: var(--color-primary);
  color: #fff;
  box-shadow: 0 8rpx 20rpx rgba(37, 99, 235, 0.24);
}
.loc-btn.ghost {
  background: #f4f6fa;
  color: var(--color-text-muted);
  border: 1rpx solid var(--color-border-soft);
}
</style>
