<template>
  <view class="home">
    <!-- Banner -->
    <view class="banner" :style="bannerStyle">
      <view class="banner-shade" />
      <view class="banner-inner">
        <view class="brand-row">
          <view class="brand-mark">❄</view>
          <text class="brand-name">{{ t('common.appName') }}</text>
          <text class="brand-tag">{{ t('index.bannerTag') }}</text>
        </view>
        <view class="banner-copy">
          <text class="banner-title">{{ bannerTitle }}</text>
          <text class="banner-sub">{{ bannerSubtitle }}</text>
          <view class="banner-cta" @tap="goCreate">
            <text>{{ t('index.bannerCta') }}</text>
            <text class="banner-arrow">→</text>
          </view>
        </view>
      </view>
    </view>

    <view v-if="loadError" class="load-banner" @tap="load">
      <text>{{ t('index.loadFailedBanner') }}</text>
      <text class="banner-retry">{{ t('common.retry') }}</text>
    </view>

    <view v-if="config.announcement" class="announce card">
      <text class="announce-tag">{{ t('index.announcement') }}</text>
      <text class="announce-text">{{ config.announcement }}</text>
    </view>

    <!-- 服务介绍与仓库条件 -->
    <SectionHeader :title="t('index.introTitle')" :subtitle="t('index.introSubtitle')" />
    <view class="card intro-card">
      <rich-text v-if="config.serviceIntro" class="intro-rich" :nodes="config.serviceIntro" />
      <text v-else class="placeholder">{{ t('index.emptySection') }}</text>

      <view v-if="warehouseLines.length" class="warehouse">
        <text class="warehouse-title">{{ t('index.warehouseTitle') }}</text>
        <view v-for="(line, index) in warehouseLines" :key="index" class="warehouse-line">
          <text class="wh-dot" />
          <text class="wh-text">{{ line }}</text>
        </view>
      </view>
    </view>

    <!-- 套餐价格 -->
    <SectionHeader :title="t('index.packageTitle')" :subtitle="t('index.packageSubtitle')" />
    <view class="card price-card">
      <view class="price-line">
        <text class="price-line-label">{{ t('index.priceOriginalLabel') }}</text>
        <text class="price-line-value muted">{{ t('index.priceOriginalValue') }}</text>
      </view>
      <view class="price-line">
        <text class="price-line-label">{{ t('index.priceMemberLabel') }}</text>
        <text class="price-line-value">{{ t('index.priceMemberValue') }}</text>
      </view>
      <view class="price-line promo">
        <view class="promo-main">
          <text class="price-line-label promo-label">{{ t('index.pricePromoLabel') }}</text>
          <text class="promo-note">{{ t('index.pricePromoNote') }}</text>
        </view>
        <view class="promo-value">
          <text class="promo-price">{{ promoValue }}</text>
          <text class="promo-unit">/ {{ promoMonths }} {{ t('common.month') }}</text>
        </view>
      </view>
      <view class="price-line referral">
        <text class="price-line-label">{{ t('index.priceReferralLabel') }}</text>
        <text class="referral-value">{{ t('index.priceReferralValue') }}</text>
      </view>
    </view>
    <view class="pkg-list">
      <PackageCard
        v-for="pkg in packages"
        :key="pkg.id"
        :pkg="pkg"
        :selected="selectedPackageId === pkg.id"
        @select="selectPackage(pkg)"
      />
      <view v-if="!packages.length" class="card empty-card">
        <text class="placeholder">{{ t('index.emptySection') }}</text>
      </view>
    </view>
    <view v-if="addons.length" class="card addon-card">
      <text class="addon-title">{{ t('index.addonsTitle') }}</text>
      <view v-for="addon in addons" :key="addon.id" class="addon-row">
        <view class="addon-info">
          <text class="addon-name">{{ addon.name }}</text>
          <text v-if="addon.unitText" class="addon-unit">{{ addon.unitText }}</text>
        </view>
        <text class="addon-price">{{ formatMoney(addon.price) }}</text>
      </view>
    </view>

    <!-- 服务范围 + 地图 -->
    <SectionHeader :title="t('index.scopeTitle')" />
    <view class="card scope-card">
      <text v-if="config.serviceAreaText" class="scope-text">{{ config.serviceAreaText }}</text>
      <text v-else class="placeholder">{{ t('index.emptySection') }}</text>
    </view>
    <LocationCard :config="config" />

    <!-- 服务保障 -->
    <SectionHeader :title="t('index.guaranteeTitle')" />
    <view v-if="guarantees.length" class="guarantee-grid">
      <view v-for="(item, index) in guarantees" :key="index" class="guarantee-item card">
        <view class="guarantee-icon">{{ item.icon || '✓' }}</view>
        <text class="guarantee-title">{{ item.title }}</text>
        <text v-if="item.desc" class="guarantee-desc">{{ item.desc }}</text>
      </view>
    </view>
    <view v-else class="card empty-card">
      <text class="placeholder">{{ t('index.guaranteeEmpty') }}</text>
    </view>

    <!-- 实拍相册 -->
    <SectionHeader :title="t('index.galleryTitle')" :subtitle="t('index.gallerySubtitle')" />
    <view v-if="gallery.length" class="gallery-grid">
      <view
        v-for="(item, index) in gallery"
        :key="item.id"
        class="gallery-item"
        @tap="previewGallery(index)"
      >
        <image class="gallery-img" :src="item.url" mode="aspectFill" :lazy-load="true" />
        <text v-if="item.caption" class="gallery-caption">{{ item.caption }}</text>
      </view>
    </view>
    <view v-else class="card empty-card">
      <text class="placeholder">{{ t('index.emptySection') }}</text>
    </view>

    <!-- 用户评价 -->
    <SectionHeader :title="t('index.reviewTitle')" :subtitle="t('index.reviewSubtitle')" />
    <view v-if="reviews.length" class="review-list">
      <view v-for="review in reviews" :key="review.id" class="review-item card">
        <view class="review-head">
          <view class="review-avatar">{{ (review.nickname || '·').slice(0, 1) }}</view>
          <view class="review-meta">
            <text class="review-name">{{ review.nickname || t('common.notSet') }}</text>
            <view class="stars">
              <text v-for="n in 5" :key="n" class="star" :class="{ on: n <= (review.rating || 5) }">★</text>
            </view>
          </view>
        </view>
        <text class="review-content">{{ review.content }}</text>
      </view>
    </view>
    <view v-else class="card empty-card">
      <text class="placeholder">{{ t('index.emptySection') }}</text>
    </view>

    <!-- FAQ -->
    <SectionHeader :title="t('index.faqTitle')" :subtitle="t('index.faqSubtitle')" />
    <view v-if="faqs.length" class="card faq-card">
      <FaqItem v-for="faq in faqs" :key="faq.id" :faq="faq" />
    </view>
    <view v-else class="card empty-card">
      <text class="placeholder">{{ t('index.emptySection') }}</text>
    </view>

    <!-- 客服 -->
    <SectionHeader :title="t('index.contactTitle')" :subtitle="t('index.contactSubtitle')" />
    <view class="card contact-card">
      <view class="contact-main">
        <view class="contact-item" @tap="callService">
          <view class="contact-ico">☎</view>
          <view class="contact-copy">
            <text class="contact-label">{{ t('index.callText') }}</text>
            <text class="contact-value">{{ config.contactPhone || t('common.notSet') }}</text>
          </view>
        </view>
        <view v-if="wechatQr" class="qr-thumb" @tap="previewQr">
          <image class="qr-thumb-img" :src="wechatQr" mode="aspectFill" :lazy-load="true" />
          <text class="qr-thumb-label">{{ t('index.wechatQrText') }}</text>
        </view>
        <view v-else class="contact-empty">
          <text>{{ t('index.contactEmpty') }}</text>
        </view>
      </view>
      <text v-if="wechatQr" class="qr-hint">{{ t('index.qrHint') }}</text>
    </view>

    <view class="card order-entry" @tap="goQuery">
      <view class="order-entry-copy">
        <text class="order-entry-title">{{ t('index.orderEntry') }}</text>
        <text class="order-entry-sub">{{ t('index.orderEntrySub') }}</text>
      </view>
      <text class="order-entry-arrow">›</text>
    </view>

    <view class="footer">
      <text class="footer-text">{{ t('index.footerNote') }}</text>
    </view>

    <view class="cta-spacer" />
    <StickyCta
      :text="t('index.bannerCta')"
      :main-text="stickyMain"
      :subtext="stickySub"
      @click="goCreate"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { t } from '@/locales/zh-CN'
import { getSite, type SiteData, type TirePackage } from '@/api/site'
import { resolveMediaUrl } from '@/api/http'
import { formatMoney } from '@/utils/format'
import { callPhone } from '@/utils/phone'
import SectionHeader from '@/components/SectionHeader.vue'
import PackageCard from '@/components/PackageCard.vue'
import FaqItem from '@/components/FaqItem.vue'
import StickyCta from '@/components/StickyCta.vue'
import LocationCard from '@/components/LocationCard.vue'

const emptySite = (): SiteData => ({
  config: {},
  packages: [],
  addons: [],
  faqs: [],
  reviews: [],
  gallery: [],
})

const site = ref<SiteData>(emptySite())
const loading = ref(true)
const loadError = ref(false)
const selectedPackageId = ref<number | null>(null)

const config = computed(() => site.value.config)
const packages = computed(() => site.value.packages || [])
const addons = computed(() => site.value.addons || [])
const faqs = computed(() => site.value.faqs || [])

const bannerTitle = computed(() => config.value.bannerTitle || t('index.bannerFallbackTitle'))
const bannerSubtitle = computed(() => config.value.bannerSubtitle || t('index.bannerFallbackSubtitle'))

const bannerStyle = computed(() => {
  const url = resolveMediaUrl(config.value.bannerImage?.url)
  return url ? { backgroundImage: `url(${url})` } : {}
})

const warehouseLines = computed(() =>
  String(config.value.warehouseConditions || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean),
)

const guarantees = computed<Array<{ icon?: string; title: string; desc?: string }>>(() => {
  const raw = config.value.guarantees
  if (!Array.isArray(raw)) return []
  return raw
    .map((item: any) => {
      if (typeof item === 'string') return { title: item }
      if (item && typeof item === 'object') {
        return {
          icon: String(item.icon || ''),
          title: String(item.title || item.name || item.text || ''),
          desc: item.desc ? String(item.desc) : undefined,
        }
      }
      return null
    })
    .filter((item): item is { icon?: string; title: string; desc?: string } => Boolean(item?.title))
})

const gallery = computed(() =>
  (site.value.gallery || [])
    .map((item) => ({
      id: item.id,
      url: resolveMediaUrl(item.image?.url),
      caption: item.caption || '',
    }))
    .filter((item) => Boolean(item.url)),
)

const reviews = computed(() => site.value.reviews || [])
const wechatQr = computed(() => resolveMediaUrl(config.value.wechatQr?.url))

const primaryPackage = computed<TirePackage | undefined>(
  () => packages.value.find((pkg) => pkg.storePrice != null) || packages.value[0],
)

const promoValue = computed(() =>
  primaryPackage.value?.storePrice != null ? formatMoney(primaryPackage.value.storePrice) : '--',
)

const promoMonths = computed(() => Number(primaryPackage.value?.baseMonths) || 6)

const stickyMain = computed(() => {
  const pkg = primaryPackage.value
  if (!pkg) return t('index.packageTitle')
  if (pkg.storePrice == null) return pkg.name
  return `${formatMoney(pkg.storePrice)} ${t('index.priceFrom')}`
})

const stickySub = computed(() => {
  const pkg = primaryPackage.value
  if (!pkg?.baseMonths) return t('index.bannerTag')
  return t('package.baseMonths', { count: pkg.baseMonths })
})

onLoad(() => {
  load()
  if (!selectedPackageId.value && packages.value.length) {
    selectedPackageId.value = packages.value[0].id
  }
})

async function load(): Promise<void> {
  loading.value = true
  loadError.value = false
  try {
    const data = await getSite()
    site.value = data
    if (!selectedPackageId.value && data.packages.length) {
      selectedPackageId.value = data.packages[0].id
    }
  } catch (error) {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function selectPackage(pkg: TirePackage): void {
  selectedPackageId.value = pkg.id
}

function goCreate(): void {
  uni.navigateTo({ url: '/pages/order/create' })
}

function goQuery(): void {
  uni.navigateTo({ url: '/pages/order/query' })
}

function previewGallery(index: number): void {
  const urls = gallery.value.map((item) => item.url)
  if (!urls.length) return
  uni.previewImage({ urls, current: urls[index] })
}

function previewQr(): void {
  if (wechatQr.value) uni.previewImage({ urls: [wechatQr.value] })
}

function callService(): void {
  callPhone(config.value.contactPhone)
}
</script>

<style scoped>
.home {
  min-height: 100vh;
  padding-bottom: 40rpx;
}

/* Banner */
.banner {
  position: relative;
  padding-top: calc(var(--status-bar-height, 0px) + 28rpx);
  background-color: #1e3a8a;
  background-size: cover;
  background-position: center;
  overflow: hidden;
}
.banner::before,
.banner::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}
.banner::before {
  width: 320rpx;
  height: 320rpx;
  right: -100rpx;
  top: -80rpx;
}
.banner::after {
  width: 200rpx;
  height: 200rpx;
  left: -60rpx;
  bottom: -40rpx;
  background: rgba(255, 255, 255, 0.08);
}
.banner-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(155deg, rgba(30, 58, 138, 0.96) 0%, rgba(37, 99, 235, 0.9) 55%, rgba(29, 78, 216, 0.88) 100%);
}
.banner-inner {
  position: relative;
  z-index: 2;
  padding: 20rpx 36rpx 56rpx;
}
.brand-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.brand-mark {
  width: 48rpx;
  height: 48rpx;
  line-height: 48rpx;
  text-align: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 26rpx;
}
.brand-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #fff;
  letter-spacing: 1rpx;
}
.brand-tag {
  margin-left: auto;
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.86);
  border: 1rpx solid rgba(255, 255, 255, 0.35);
  border-radius: var(--radius-pill);
  padding: 4rpx 16rpx;
}
.banner-copy {
  margin-top: 72rpx;
  display: flex;
  flex-direction: column;
}
.banner-title {
  font-size: 62rpx;
  font-weight: 800;
  color: #fff;
  line-height: 1.2;
  letter-spacing: 1rpx;
  text-shadow: 0 4rpx 16rpx rgba(15, 23, 42, 0.16);
}
.banner-sub {
  margin-top: 18rpx;
  font-size: 27rpx;
  color: rgba(255, 255, 255, 0.86);
}
.banner-cta {
  margin-top: 40rpx;
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 10rpx;
  height: 84rpx;
  padding: 0 38rpx;
  border-radius: var(--radius-pill);
  background: #fff;
  color: var(--color-primary-text);
  font-size: 28rpx;
  font-weight: 700;
  box-shadow: 0 12rpx 30rpx rgba(15, 23, 42, 0.18);
}
.banner-arrow {
  font-size: 28rpx;
}
.load-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 20rpx 24rpx 0;
  padding: 18rpx 24rpx;
  border-radius: var(--radius-sm);
  background: #fef2f2;
  color: var(--color-accent);
  font-size: 24rpx;
}
.banner-retry {
  font-weight: 600;
}
.announce {
  display: flex;
  gap: 14rpx;
  align-items: flex-start;
  margin: 20rpx 24rpx 0;
  padding: 20rpx 24rpx;
}
.announce-tag {
  flex: none;
  font-size: 20rpx;
  color: #fff;
  background: var(--color-accent);
  border-radius: var(--radius-pill);
  padding: 4rpx 14rpx;
}
.announce-text {
  flex: 1;
  font-size: 23rpx;
  color: var(--color-text-muted);
  line-height: 1.5;
}

/* 通用卡片 */
.card {
  margin: 0 24rpx;
  padding: 28rpx;
}
.intro-card {
  margin-top: 0;
}
.intro-rich,
.empty-rich {
  font-size: 26rpx;
  color: var(--color-text-muted);
  line-height: 1.75;
}
.placeholder {
  display: block;
  padding: 12rpx 0;
  font-size: 24rpx;
  color: var(--color-text-muted);
}
.warehouse {
  margin-top: 24rpx;
  padding-top: 24rpx;
  border-top: 1rpx dashed var(--color-border);
}
.warehouse-title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: var(--color-primary-text);
  margin-bottom: 12rpx;
}
.warehouse-line {
  display: flex;
  gap: 12rpx;
  align-items: flex-start;
  padding: 5rpx 0;
}
.wh-dot {
  width: 10rpx;
  height: 10rpx;
  margin-top: 14rpx;
  border-radius: 50%;
  background: var(--color-primary);
  flex: none;
}
.wh-text {
  flex: 1;
  font-size: 24rpx;
  color: var(--color-text-muted);
  line-height: 1.6;
}

/* 套餐 */
.price-card {
  margin-bottom: 20rpx;
  padding: 8rpx 28rpx;
}
.price-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid rgba(23, 23, 23, 0.05);
}
.price-line:last-child {
  border-bottom: none;
}
.price-line-label {
  font-size: 25rpx;
  color: var(--color-text);
}
.price-line-value {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--color-text);
}
.price-line-value.muted {
  color: var(--color-text-muted);
  font-weight: 500;
  text-decoration: line-through;
}
.promo-main {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.promo-label {
  color: var(--color-accent);
  font-weight: 700;
}
.promo-note {
  font-size: 20rpx;
  color: var(--color-text-muted);
}
.promo-value {
  display: flex;
  align-items: baseline;
  color: var(--color-accent);
}
.promo-price {
  font-size: 44rpx;
  font-weight: 800;
}
.promo-unit {
  margin-left: 4rpx;
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.referral-value {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--color-primary-text);
}
.pkg-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 0 24rpx;
}
.addon-card {
  margin-top: 20rpx;
}
.addon-title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 8rpx;
}
.addon-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14rpx 0;
  border-bottom: 1rpx solid rgba(23, 23, 23, 0.05);
}
.addon-row:last-child {
  border-bottom: none;
}
.addon-info {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.addon-name {
  font-size: 25rpx;
  color: var(--color-text);
}
.addon-unit {
  font-size: 20rpx;
  color: var(--color-text-muted);
}
.addon-price {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--color-accent);
}

/* 服务范围 */
.scope-card {
  margin-top: 0;
}
.scope-text {
  font-size: 26rpx;
  color: var(--color-text-muted);
  line-height: 1.7;
}

/* 保障 */
.guarantee-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  padding: 0 24rpx;
}
.guarantee-item {
  margin: 0;
  width: calc((100% - 16rpx) / 2);
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8rpx;
}
.guarantee-icon {
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  text-align: center;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  font-size: 28rpx;
  font-weight: 700;
}
.guarantee-title {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--color-text);
}
.guarantee-desc {
  font-size: 22rpx;
  color: var(--color-text-muted);
  line-height: 1.5;
}

/* 相册 */
.gallery-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  padding: 0 24rpx;
}
.gallery-item {
  position: relative;
  width: calc((100% - 24rpx) / 3);
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #eef2f7;
}
.gallery-img {
  width: 100%;
  height: 100%;
  display: block;
}
.gallery-caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 8rpx 12rpx;
  font-size: 20rpx;
  color: #fff;
  background: linear-gradient(180deg, transparent, rgba(15, 23, 42, 0.65));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 评价 */
.review-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 0 24rpx;
}
.review-item {
  margin: 0;
  padding: 24rpx;
}
.review-head {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.review-avatar {
  width: 64rpx;
  height: 64rpx;
  line-height: 64rpx;
  text-align: center;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  font-size: 28rpx;
  font-weight: 700;
  flex: none;
}
.review-meta {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.review-name {
  font-size: 25rpx;
  font-weight: 600;
  color: var(--color-text);
}
.stars {
  display: flex;
  gap: 2rpx;
}
.star {
  font-size: 22rpx;
  color: #d4d4d8;
}
.star.on {
  color: #f5a623;
}
.review-content {
  display: block;
  margin-top: 14rpx;
  font-size: 25rpx;
  color: var(--color-text-muted);
  line-height: 1.7;
}

/* FAQ / 客服 */
.faq-card {
  margin-top: 0;
  padding: 4rpx 28rpx;
}
.empty-card {
  margin-top: 0;
}
.contact-card {
  margin-top: 0;
}
.contact-main {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.contact-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx;
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
}
.contact-ico {
  width: 64rpx;
  height: 64rpx;
  line-height: 64rpx;
  text-align: center;
  border-radius: 50%;
  background: #fff;
  color: var(--color-primary);
  font-size: 30rpx;
  flex: none;
}
.contact-copy {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
  min-width: 0;
}
.contact-label {
  font-size: 22rpx;
  color: var(--color-primary-text);
}
.contact-value {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-primary-text);
  letter-spacing: 0.5rpx;
}
.qr-thumb {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  padding: 10rpx;
  border-radius: var(--radius-sm);
  border: 1rpx solid var(--color-border);
}
.qr-thumb-img {
  width: 116rpx;
  height: 116rpx;
  border-radius: 8rpx;
}
.qr-thumb-label {
  font-size: 20rpx;
  color: var(--color-text-muted);
}
.contact-empty {
  flex: 1;
  font-size: 24rpx;
  color: var(--color-text-muted);
  text-align: right;
}
.qr-hint {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
  color: var(--color-text-muted);
  text-align: right;
}
.order-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 24rpx;
  padding: 24rpx 28rpx;
}
.order-entry-copy {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.order-entry-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--color-text);
}
.order-entry-sub {
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.order-entry-arrow {
  font-size: 34rpx;
  color: var(--color-text-muted);
}

.footer {
  padding: 40rpx 24rpx 20rpx;
  text-align: center;
}
.footer-text {
  font-size: 20rpx;
  color: #a1a1aa;
}
.cta-spacer {
  height: calc(150rpx + constant(safe-area-inset-bottom));
  height: calc(150rpx + env(safe-area-inset-bottom));
}
</style>
