<template>
  <view class="page">
    <view class="header">
      <text class="header-title">{{ t('faqPage.title') }}</text>
      <text class="header-sub">{{ t('faqPage.subtitle') }}</text>
    </view>

    <view v-if="loading" class="card state-card">
      <text class="state-text">{{ t('common.loading') }}</text>
    </view>
    <view v-else-if="loadError" class="card state-card">
      <text class="state-text">{{ t('faqPage.loadFailed') }}</text>
      <view class="btn btn-ghost btn-sm retry-btn" @tap="load">{{ t('common.retry') }}</view>
    </view>
    <view v-else-if="faqs.length" class="card faq-card">
      <FaqItem v-for="faq in faqs" :key="faq.id" :faq="faq" />
    </view>
    <view v-else class="card state-card">
      <text class="state-text">{{ t('faqPage.empty') }}</text>
    </view>

    <view class="btn btn-ghost share-btn" @tap="share">{{ t('faqPage.share') }}</view>
    <text class="footer-note">{{ t('faqPage.footerNote') }}</text>
    <view class="page-bottom" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { t } from '@/locales/zh-CN'
import { getFaqs, type Faq } from '@/api/site'
import { pageLink, copyText } from '@/utils/share'
import FaqItem from '@/components/FaqItem.vue'

const faqs = ref<Faq[]>([])
const loading = ref(true)
const loadError = ref(false)

onLoad(() => {
  load()
})

async function load(): Promise<void> {
  loading.value = true
  loadError.value = false
  try {
    faqs.value = await getFaqs()
  } catch (error) {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function share(): void {
  copyText(pageLink('/pages/content/faq'), t('common.copiedLink'))
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
.faq-card {
  padding: 4rpx 28rpx;
}
.state-card {
  padding: 40rpx 28rpx;
  text-align: center;
}
.state-text {
  display: block;
  font-size: 26rpx;
  color: var(--color-text-muted);
  line-height: 1.7;
  padding: 10rpx 0;
}
.retry-btn {
  display: inline-flex;
  margin: 20rpx auto 0;
}
.share-btn {
  margin-top: 30rpx;
}
.footer-note {
  display: block;
  padding: 26rpx 8rpx;
  font-size: 22rpx;
  color: #a1a1aa;
  text-align: center;
}
.page-bottom {
  height: 40rpx;
}
</style>
