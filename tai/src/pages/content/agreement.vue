<template>
  <view class="page">
    <view class="header">
      <text class="header-title">{{ t('agreement.title') }}</text>
      <text class="header-sub">{{ t('agreement.subtitle') }}</text>
    </view>

    <view class="card content-card">
      <view v-if="loading" class="state-text">{{ t('common.loading') }}</view>
      <view v-else-if="loadError" class="state-box">
        <text class="state-text">{{ t('agreement.loadFailed') }}</text>
        <view class="btn btn-ghost btn-sm retry-btn" @tap="load">{{ t('common.retry') }}</view>
      </view>
      <rich-text v-else-if="content" class="rich-text" :nodes="content" />
      <text v-else class="state-text">{{ t('agreement.empty') }}</text>
    </view>

    <text class="footer-note">{{ t('agreement.footerNote') }}</text>
    <view class="page-bottom" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { t } from '@/locales/zh-CN'
import { getAgreement } from '@/api/site'

const content = ref('')
const loading = ref(true)
const loadError = ref(false)

onLoad(() => {
  load()
})

async function load(): Promise<void> {
  loading.value = true
  loadError.value = false
  try {
    content.value = await getAgreement()
  } catch (error) {
    loadError.value = true
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.page {
  padding: 24rpx;
}
.header {
  padding: 8rpx 8rpx 24rpx;
}
.header-title {
  display: block;
  font-size: 44rpx;
  font-weight: 800;
  color: var(--color-primary-text);
}
.header-sub {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: var(--color-text-muted);
}
.content-card {
  padding: 32rpx;
  min-height: 400rpx;
}
.rich-text {
  font-size: 26rpx;
  color: var(--color-text);
  line-height: 1.9;
  word-break: break-word;
}
.state-text {
  display: block;
  padding: 30rpx 0;
  font-size: 26rpx;
  color: var(--color-text-muted);
  text-align: center;
  line-height: 1.7;
}
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
}
.retry-btn {
  display: inline-flex;
  margin: 0;
}
.footer-note {
  display: block;
  padding: 32rpx 8rpx;
  font-size: 22rpx;
  color: #a1a1aa;
  text-align: center;
}
.page-bottom {
  height: 40rpx;
}
</style>
