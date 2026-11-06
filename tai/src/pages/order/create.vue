<template>
  <view class="page">
    <view v-if="siteError" class="error-card">
      <text class="error-title">{{ t('create.siteLoadFailed') }}</text>
      <text class="error-hint">{{ t('create.siteLoadHint') }}</text>
      <view class="btn btn-ghost btn-sm error-retry" @tap="init">{{ t('common.retry') }}</view>
    </view>

    <view v-else class="summary-card card">
      <view class="summary-top">
        <view>
          <text class="summary-label">{{ t('index.packageTitle') }}</text>
          <text class="summary-name">{{ activePackage?.name || t('common.notSet') }}</text>
        </view>
        <view class="summary-price">
          <text class="summary-cur">¥</text>
          <text class="summary-num">{{ fenToYuan(activePackage ? basePrice : 0) }}</text>
        </view>
      </view>
      <text class="summary-hint">{{ dateLimitNotice }}</text>
    </view>

    <!-- 联系人 -->
    <view class="card form-card">
      <text class="card-title">{{ t('create.sectionCustomer') }}</text>
      <FormField :label="t('create.name')" required :error="errors.name">
        <input
          v-model="form.customerName"
          class="field-input"
          :placeholder="t('create.namePlaceholder')"
          placeholder-class="ph"
          maxlength="20"
        />
      </FormField>
      <FormField :label="t('create.phone')" required :error="errors.phone">
        <input
          v-model="form.phone"
          class="field-input"
          type="number"
          :placeholder="t('create.phonePlaceholder')"
          placeholder-class="ph"
          maxlength="11"
        />
      </FormField>
      <FormField :label="t('create.plateNo')" optional>
        <input
          v-model="form.plateNo"
          class="field-input"
          :placeholder="t('create.plateNoPlaceholder')"
          placeholder-class="ph"
          maxlength="12"
        />
      </FormField>

      <!-- 邀请码（可选） -->
      <FormField :label="t('create.referralCode')" :hint="t('create.referralCodeHint')" optional>
        <input
          v-model="form.referralCode"
          class="field-input"
          :class="{ on: referralPreview && !referralError }"
          :placeholder="t('create.referralCodePlaceholder')"
          placeholder-class="ph"
          maxlength="6"
          @blur="onReferralBlur"
          @input="onReferralInput"
        />
        <view v-if="referralPreview" class="referral-hint ok">
          {{ t('create.referralBy', { name: referralPreview.nickname }) }}
        </view>
        <view v-else-if="referralError" class="referral-hint err">{{ referralError }}</view>
      </FormField>

      <!-- 登录用户奖励券 -->
      <view v-if="availableRewards.length > 0" class="free-bar">
        <text class="free-bar-icon">🎁</text>
        <text class="free-bar-text">
          {{ t('create.rewardVoucher', { amount: formatMoney(rewardDiscount || bestReward?.amount || 0) }) }}
        </text>
        <view class="free-switch" @tap="form.useFreeReward = !form.useFreeReward">
          <text class="free-switch-label">{{ form.useFreeReward ? t('create.freeRewardOn') : t('create.freeRewardOff') }}</text>
          <view class="switch" :class="{ on: form.useFreeReward }">
            <view class="switch-knob" />
          </view>
        </view>
      </view>
    </view>

    <!-- 车辆 -->
    <view class="card form-card">
      <text class="card-title">{{ t('create.sectionVehicle') }}</text>
      <FormField :label="t('create.carType')" required>
        <view class="chip-row">
          <view
            v-for="item in carTypes"
            :key="item"
            class="chip"
            :class="{ on: form.carType === item }"
            @tap="form.carType = item"
          >
            {{ t(`carType.${item}`) }}
          </view>
        </view>
      </FormField>

      <FormField :label="t('create.tireSpec')" required :error="errors.tireSpec">
        <picker :range="specOptions" :value="specIndex" @change="onSpecChange">
          <view class="picker-row">
            <text :class="form.tireSpec ? 'picker-value' : 'picker-placeholder'">
              {{ form.tireSpec || t('create.tireSpecPlaceholder') }}
            </text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
        <input
          v-if="customSpec"
          v-model="form.tireSpec"
          class="field-input custom-input"
          :placeholder="t('create.tireSpecCustomPlaceholder')"
          placeholder-class="ph"
          maxlength="20"
        />
      </FormField>

      <FormField :label="t('create.withWheelRim')" :hint="t('create.withWheelRimHint')">
        <view class="switch-row" @tap="form.withWheelRim = !form.withWheelRim">
          <text class="switch-text">
            {{ form.withWheelRim ? t('create.withWheelRimOn') : t('create.withWheelRimOff') }}
          </text>
          <view class="switch" :class="{ on: form.withWheelRim }">
            <view class="switch-knob" />
          </view>
        </view>
      </FormField>
    </view>

    <!-- 服务方式 -->
    <view class="card form-card">
      <text class="card-title">{{ t('create.sectionService') }}</text>
      <view class="service-grid">
        <view
          v-for="item in serviceTypes"
          :key="item"
          class="service-card"
          :class="{ on: form.serviceType === item }"
          @tap="setServiceType(item)"
        >
          <view class="service-head">
            <text class="service-name">{{ t(`serviceType.${item}`) }}</text>
            <text v-if="form.serviceType === item" class="service-check">✓</text>
          </view>
          <view class="service-price">
            <text class="service-cur">¥</text>
            <text class="service-num">{{ fenToYuan(servicePrice(item)) }}</text>
          </view>
        </view>
      </view>

      <FormField :label="t('create.returnMethod')" :hint="t('create.returnOnlyHint')">
        <view class="return-pill">
          <text class="return-check">✓</text>
          <text>{{ t('create.returnPickupDelivery') }}</text>
        </view>
      </FormField>
    </view>

    <!-- 支付方式 -->
    <view class="card form-card">
      <text class="card-title">{{ t('create.sectionPayment') }}</text>
      <view class="pay-seg">
        <view
          v-for="item in paymentOptions"
          :key="item"
          class="pay-seg-item"
          :class="{ on: form.paymentMethod === item }"
          @tap="form.paymentMethod = item"
        >
          <text class="pay-seg-name">{{ t(`paymentMethod.${item}`) }}</text>
          <text class="pay-seg-sub">{{ t(`create.paymentTag.${item}`) }}</text>
        </view>
      </view>
      <view class="pay-detail">
        <text class="pay-detail-title">{{ t(`paymentMethod.${form.paymentMethod}`) }}</text>
        <text class="pay-detail-desc">{{ t(`create.paymentDesc.${form.paymentMethod}`) }}</text>
        <view v-if="form.paymentMethod === 'pickup_pay'" class="pay-warn">
          {{ t('create.pickupPayWarning') }}
        </view>
      </view>
    </view>

    <!-- 寄存时间 -->
    <view class="card form-card">
      <text class="card-title">{{ t('create.sectionSchedule') }}</text>

      <FormField :label="t('create.storageStartDate')" required :error="errors.storageStartDate">
        <picker mode="date" :start="minStartDate" :value="form.storageStartDate" @change="onStartChange">
          <view class="picker-row">
            <text class="picker-value">{{ formatDate(form.storageStartDate) }}</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
      </FormField>

      <FormField
        :label="t('create.expectedReturnDate')"
        required
        :hint="t('create.maxDateHint', { date: maxStorageDate })"
        :error="errors.expectedReturnDate"
      >
        <picker
          mode="date"
          :start="returnMinDate"
          :end="maxStorageDate"
          :value="form.expectedReturnDate"
          @change="onReturnChange"
        >
          <view class="picker-row">
            <text class="picker-value">{{ formatDate(form.expectedReturnDate) }}</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
        <text class="months-hint">{{ t('create.monthsHint', { count: months }) }}</text>
      </FormField>

      <template v-if="form.serviceType === 'pickup'">
        <FormField :label="t('create.pickupDate')" required :error="errors.pickupDate">
          <picker
            mode="date"
            :start="form.storageStartDate || minStartDate"
            :end="maxStorageDate"
            :value="form.pickupDate"
            @change="onPickupDateChange"
          >
            <view class="picker-row">
              <text class="picker-value">{{ formatDate(form.pickupDate) }}</text>
              <text class="picker-arrow">›</text>
            </view>
          </picker>
        </FormField>
        <FormField :label="t('create.pickupSlot')" required :error="errors.pickupSlot">
          <SlotPicker v-model="form.pickupSlot" :date="form.pickupDate" />
        </FormField>
      </template>
    </view>

    <!-- 增值服务 -->
    <view class="card form-card">
      <view class="card-title-row">
        <text class="card-title">{{ t('create.sectionAddons') }}</text>
        <text class="card-title-hint">{{ t('create.addonsHint') }}</text>
      </view>
      <view v-if="addons.length">
        <view
          v-for="addon in addons"
          :key="addon.id"
          class="addon-row"
          @tap="toggleAddon(addon.code)"
        >
          <view class="addon-check" :class="{ on: isAddonSelected(addon.code) }">
            {{ isAddonSelected(addon.code) ? '✓' : '' }}
          </view>
          <view class="addon-info">
            <text class="addon-name">{{ addon.name }}</text>
            <text v-if="addon.unitText" class="addon-unit">{{ addon.unitText }}</text>
          </view>
          <text class="addon-price">{{ formatMoney(addon.price) }}</text>
        </view>
      </view>
      <text v-else class="addon-empty">{{ t('create.addonsEmpty') }}</text>
    </view>

    <!-- 备注 -->
    <view class="card form-card">
      <text class="card-title">{{ t('create.sectionNote') }}</text>
      <textarea
        v-model="form.note"
        class="field-textarea"
        :placeholder="t('create.notePlaceholder')"
        placeholder-class="ph"
        maxlength="200"
        :auto-height="true"
      />
    </view>

    <!-- 费用明细 -->
    <view class="card form-card">
      <text class="card-title">{{ t('create.priceTitle') }}</text>
      <PriceSummary
        :amount-package="amountPackage"
        :amount-addon="amountAddon"
        :amount-total="finalAmountTotal"
        :discount="rewardDiscount"
        :addon-items="selectedAddonItems"
        :note="t('create.priceNote')"
      />
    </view>

    <!-- 协议 -->
    <view class="agreement-block">
      <view class="agree-row">
        <view class="agree-check" :class="{ on: form.agreementAccepted }" @tap="form.agreementAccepted = !form.agreementAccepted">
          {{ form.agreementAccepted ? '✓' : '' }}
        </view>
        <text class="agree-text" @tap="form.agreementAccepted = !form.agreementAccepted">
          {{ t('create.agreementPrefix') }}
        </text>
        <text class="agree-link" @tap="openAgreement">{{ t('create.agreementLink') }}</text>
      </view>
      <text v-if="errors.agreement" class="agree-error">{{ errors.agreement }}</text>
    </view>

    <view class="bottom-spacer" />
    <StickyCta
      :text="submitting ? t('create.submitting') : t('create.submit')"
      :main-text="formatMoney(finalAmountTotal)"
      :subtext="t('create.monthsHint', { count: months })"
      :disabled="submitting || siteLoading"
      @click="submit"
    />

    <!-- 协议弹窗 -->
    <view v-if="agreementVisible" class="modal-mask" @tap="agreementVisible = false">
      <view class="modal-panel agreement-panel" @tap.stop>
        <view class="modal-head">
          <text class="modal-title">{{ t('create.agreementTitle') }}</text>
          <text class="modal-close" @tap="agreementVisible = false">✕</text>
        </view>
        <scroll-view scroll-y class="agreement-scroll">
          <rich-text v-if="agreementText" class="agreement-rich" :nodes="agreementText" />
          <text v-else class="agreement-empty">
            {{ agreementLoading ? t('create.agreementLoading') : t('create.agreementEmpty') }}
          </text>
        </scroll-view>
        <view class="btn btn-primary modal-btn" @tap="confirmAgreement">{{ t('common.confirm') }}</view>
      </view>
    </view>

    <!-- 提交成功：订单号 + 二维码 -->
    <QrModal
      :visible="qrVisible"
      :title="t('create.successTitle')"
      :subtitle="t('create.successSubtitle')"
      :content="successLink"
      :order-no="createdOrder?.orderNo || ''"
      :hint="t('create.qrHint')"
      :show-copy="true"
      :show-view="true"
      @copy="copyOrderNo"
      @view="viewOrder"
      @close="closeSuccess"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { t } from '@/locales/zh-CN'
import { getAgreement, getSite, type SiteData, type TirePackage } from '@/api/site'
import {
  createOrder,
  type CarType,
  type CreateOrderPayload,
  type CreateOrderResult,
  type PaymentMethod,
  type ServiceType,
} from '@/api/order'
import { errorText } from '@/api/http'
import { addMonthsToDate, formatDate, formatMoney, monthsBetween, todayString, fenToYuan, isDateAfter } from '@/utils/format'
import { isPhone } from '@/utils/phone'
import { getSsoUser, getSsoToken } from '@/utils/sso'
import { createClientToken } from '@/utils/uuid'
import { detailLink } from '@/utils/share'
import {
  getMyReferral,
  getMyRewards,
  previewReferral,
  type MyReferralResult,
  type ReferralRewardItem,
} from '@/api/my'
import FormField from '@/components/FormField.vue'
import SlotPicker from '@/components/SlotPicker.vue'
import PriceSummary from '@/components/PriceSummary.vue'
import StickyCta from '@/components/StickyCta.vue'
import QrModal from '@/components/QrModal.vue'
import type { SlotName } from '@/api/site'

const carTypes: CarType[] = ['sedan', 'suv', 'pickup']
// 仅保留到店送存；上门取送不对外提供（履约走线下电话，不设配送环节）
const serviceTypes: ServiceType[] = ['store']
const paymentOptions: PaymentMethod[] = ['wechat', 'store_pay', 'pickup_pay']

const commonSpecs = [
  '195/65R15',
  '205/55R16',
  '205/60R16',
  '215/55R17',
  '215/60R17',
  '225/45R18',
  '225/60R17',
  '235/45R18',
  '235/60R18',
  '245/45R18',
]

const site = ref<SiteData>({ config: {}, packages: [], addons: [], faqs: [], reviews: [], gallery: [] })
const siteLoading = ref(true)
const siteError = ref(false)
const agreementText = ref('')
const agreementLoading = ref(false)
const agreementVisible = ref(false)

const minStartDate = todayString()

const form = reactive({
  customerName: '',
  phone: '',
  plateNo: '',
  carType: 'sedan' as CarType,
  tireSpec: '',
  withWheelRim: false,
  serviceType: 'store' as ServiceType,
  storageStartDate: minStartDate,
  expectedReturnDate: '',
  pickupDate: minStartDate,
  pickupSlot: '' as SlotName | '',
  note: '',
  agreementAccepted: false,
  referralCode: '',
  useFreeReward: false,
  paymentMethod: 'wechat' as PaymentMethod,
})

const errors = reactive<Record<string, string>>({})
const addonCodes = ref<string[]>([])
const customSpec = ref(false)
const submitting = ref(false)
const clientToken = ref(createClientToken())
const createdOrder = ref<CreateOrderResult | null>(null)
const qrVisible = ref(false)

// 推荐/邀请相关
const myReferral = ref<MyReferralResult | null>(null)
const availableRewards = ref<ReferralRewardItem[]>([])
const bestReward = computed<ReferralRewardItem | null>(() => availableRewards.value[0] || null)
const rewardDiscount = computed(() => {
  if (!form.useFreeReward || !bestReward.value) return 0
  const amount = Number(bestReward.value.amount) || 0
  return amount > 0 ? Math.min(amount, amountPackage.value) : amountPackage.value
})
const referralPreview = ref<{ nickname: string; phoneMasked: string } | null>(null)
const referralError = ref('')
let referralPreviewTimer: ReturnType<typeof setTimeout> | null = null
const finalAmountTotal = computed(() => Math.max(0, amountTotal.value - rewardDiscount.value))

const packages = computed(() => site.value.packages || [])
const addons = computed(() => site.value.addons || [])

const maxStorageDate = computed(() => {
  const value = site.value.config?.maxStorageDate
  return typeof value === 'string' && value ? value.slice(0, 10) : '2027-05-01'
})

const activePackage = computed<TirePackage | undefined>(() => {
  const field = form.serviceType === 'store' ? 'storePrice' : 'pickupPrice'
  return packages.value.find((pkg) => (pkg as any)[field] != null) || packages.value[0]
})

const basePrice = computed(() => {
  const pkg = activePackage.value
  if (!pkg) return 0
  return Number(form.serviceType === 'store' ? pkg.storePrice : pkg.pickupPrice) || 0
})

const months = computed(() => {
  if (!form.storageStartDate || !form.expectedReturnDate) return 0
  return monthsBetween(form.storageStartDate, form.expectedReturnDate)
})

const amountPackage = computed(() => {
  const pkg = activePackage.value
  if (!pkg) return 0
  const baseMonths = Number(pkg.baseMonths) || 0
  const extraMonths = Math.max(0, months.value - baseMonths)
  return basePrice.value + extraMonths * (Number(pkg.extraMonthPrice) || 0)
})

const selectedAddonItems = computed(() =>
  addons.value
    .filter((addon) => addonCodes.value.includes(addon.code))
    .map((addon) => ({ code: addon.code, name: addon.name, amount: Number(addon.price) || 0 })),
)

const amountAddon = computed(() => selectedAddonItems.value.reduce((sum, item) => sum + item.amount, 0))
const amountTotal = computed(() => amountPackage.value + amountAddon.value)

const returnMinDate = computed(() => {
  const start = form.storageStartDate || minStartDate
  const [year, month, day] = start.split('-').map(Number)
  const next = new Date(year, month - 1, day + 1)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
})

const dateLimitNotice = computed(() =>
  t('create.dateLimitNotice', { date: maxStorageDate.value }),
)

const specOptions = computed(() => [...commonSpecs, t('create.tireSpecCustom')])

const specIndex = computed(() => {
  const index = commonSpecs.indexOf(form.tireSpec)
  if (index >= 0) return index
  return customSpec.value ? commonSpecs.length : 0
})

const successLink = computed(() => {
  if (!createdOrder.value) return ''
  return detailLink(createdOrder.value.orderNo, form.phone)
})

onLoad((options: Record<string, string> | undefined) => {
  // URL 参数 ref=XXX 自动回填邀请码（分享链接带的）
  if (options?.ref) {
    const code = String(options.ref).trim().toUpperCase()
    form.referralCode = code
    // 页面初始化后主动校验一次
    setTimeout(() => {
      if (code.length >= 6) validateReferral(code)
    }, 800)
  }
  init()
})

async function init(): Promise<void> {
  siteLoading.value = true
  siteError.value = false
  loadAgreement()
  try {
    const data = await getSite()
    site.value = data
    const start = todayString()
    const pkg = data.packages[0]
    const baseMonths = Number(pkg?.baseMonths) || 6
    const proposedReturn = addMonthsToDate(start, baseMonths)
    const maxDate = String(data.config?.maxStorageDate || '2027-05-01').slice(0, 10)
    form.storageStartDate = start
    form.pickupDate = start
    form.expectedReturnDate = isDateAfter(proposedReturn, maxDate) ? maxDate : proposedReturn
    const cachedUser = getSsoUser()
    if (cachedUser?.phone && !form.phone) form.phone = cachedUser.phone
    // 登录用户自动拉取邀请码/免单额度
    if (getSsoToken()) {
      getMyReferral()
        .then((r) => {
          myReferral.value = r
        })
        .catch(() => {})
      getMyRewards()
        .then((r) => {
          availableRewards.value = r.available || []
          if (availableRewards.value.length > 0) {
            form.useFreeReward = true
          }
        })
        .catch(() => {})
    }
  } catch (error) {
    siteError.value = true
  } finally {
    siteLoading.value = false
  }
}

async function loadAgreement(): Promise<void> {
  agreementLoading.value = true
  try {
    agreementText.value = await getAgreement()
  } catch (error) {
    agreementText.value = ''
  } finally {
    agreementLoading.value = false
  }
}

function servicePrice(type: ServiceType): number {
  const pkg =
    packages.value.find((item) => (type === 'store' ? item.storePrice != null : item.pickupPrice != null)) ||
    packages.value[0]
  if (!pkg) return 0
  return Number(type === 'store' ? pkg.storePrice : pkg.pickupPrice) || 0
}

function setServiceType(type: ServiceType): void {
  form.serviceType = type
  if (type === 'pickup') {
    if (!form.pickupDate) form.pickupDate = form.storageStartDate || minStartDate
  } else {
    form.pickupSlot = ''
  }
  clearError('pickupDate')
  clearError('pickupSlot')
}

function onSpecChange(event: any): void {
  const index = Number(event?.detail?.value)
  if (index === commonSpecs.length) {
    customSpec.value = true
    form.tireSpec = form.tireSpec && !commonSpecs.includes(form.tireSpec) ? form.tireSpec : ''
  } else {
    customSpec.value = false
    form.tireSpec = commonSpecs[index] || ''
  }
  clearError('tireSpec')
}

function onStartChange(event: any): void {
  const value = String(event?.detail?.value || '')
  form.storageStartDate = value
  if (!isDateAfter(form.expectedReturnDate, value)) {
    const pkg = activePackage.value
    const proposed = addMonthsToDate(value, Number(pkg?.baseMonths) || 6)
    form.expectedReturnDate = isDateAfter(proposed, maxStorageDate.value) ? maxStorageDate.value : proposed
  }
  if (!isDateAfter(form.pickupDate, value)) {
    form.pickupDate = value
    form.pickupSlot = ''
  }
  clearError('storageStartDate')
  clearError('expectedReturnDate')
}

function onReturnChange(event: any): void {
  form.expectedReturnDate = String(event?.detail?.value || '')
  clearError('expectedReturnDate')
}

function onPickupDateChange(event: any): void {
  form.pickupDate = String(event?.detail?.value || '')
  form.pickupSlot = ''
  clearError('pickupDate')
}

function toggleAddon(code: string): void {
  if (!code) return
  if (addonCodes.value.includes(code)) {
    addonCodes.value = addonCodes.value.filter((item) => item !== code)
  } else {
    addonCodes.value = [...addonCodes.value, code]
  }
}

function isAddonSelected(code: string): boolean {
  return addonCodes.value.includes(code)
}

// --- 邀请码实时校验 ---
function onReferralInput(): void {
  const value = form.referralCode.trim().toUpperCase()
  form.referralCode = value
  referralPreview.value = null
  referralError.value = ''
  if (referralPreviewTimer) {
    clearTimeout(referralPreviewTimer)
    referralPreviewTimer = null
  }
  if (value.length < 6) return
  referralPreviewTimer = setTimeout(() => {
    validateReferral(value)
  }, 400)
}

async function onReferralBlur(): Promise<void> {
  const value = form.referralCode.trim().toUpperCase()
  form.referralCode = value
  if (referralPreviewTimer) {
    clearTimeout(referralPreviewTimer)
    referralPreviewTimer = null
  }
  if (value.length < 6) return
  await validateReferral(value)
}

async function validateReferral(code: string): Promise<void> {
  try {
    previewReferral(code)
      .then((r) => {
        // 不能用自己的邀请码
        if (myReferral.value && r.code === myReferral.value.code) {
          referralPreview.value = null
          referralError.value = t('create.referralSelf')
        } else {
          referralPreview.value = r
          referralError.value = ''
        }
      })
      .catch(() => {
        referralPreview.value = null
        referralError.value = t('create.referralInvalid')
      })
  } catch {
    referralPreview.value = null
    referralError.value = t('create.referralInvalid')
  }
}

function openAgreement(): void {
  agreementVisible.value = true
  if (!agreementText.value && !agreementLoading.value) loadAgreement()
}

function confirmAgreement(): void {
  form.agreementAccepted = true
  agreementVisible.value = false
  clearError('agreement')
}

function clearError(key: string): void {
  delete errors[key]
}

function fail(key: string, message: string): false {
  errors[key] = message
  return false
}

function validate(): boolean {
  Object.keys(errors).forEach((key) => delete errors[key])
  if (!form.customerName.trim()) return fail('name', t('create.validName'))
  if (!isPhone(form.phone)) return fail('phone', t('create.validPhone'))
  if (!form.tireSpec.trim()) return fail('tireSpec', t('create.validSpec'))
  if (!form.storageStartDate) return fail('storageStartDate', t('create.validStart'))
  if (!form.expectedReturnDate) return fail('expectedReturnDate', t('create.validReturn'))
  if (!isDateAfter(form.expectedReturnDate, form.storageStartDate)) {
    return fail('expectedReturnDate', t('create.validReturnOrder'))
  }
  if (isDateAfter(form.expectedReturnDate, maxStorageDate.value)) {
    return fail('expectedReturnDate', t('create.validMaxDate', { date: maxStorageDate.value }))
  }
  if (form.serviceType === 'pickup') {
    if (!form.pickupDate) return fail('pickupDate', t('create.validPickupDate'))
    if (form.pickupDate < form.storageStartDate) {
      return fail('pickupDate', t('create.pickupBeforeStart'))
    }
    if (!form.pickupSlot) return fail('pickupSlot', t('create.validSlot'))
  }
  if (!form.agreementAccepted) return fail('agreement', t('create.agreementRequired'))
  return true
}

function toast(title: string): void {
  uni.showToast({ title, icon: 'none', duration: 2200 })
}

async function submit(): Promise<void> {
  if (submitting.value) return
  if (siteLoading.value) return
  if (!activePackage.value) {
    toast(t('create.packageMissing'))
    return
  }
  if (!validate()) {
    const first = Object.keys(errors)[0]
    if (first) toast(errors[first])
    return
  }

  const payload: CreateOrderPayload = {
    clientToken: clientToken.value,
    customerName: form.customerName.trim(),
    phone: form.phone.trim(),
    plateNo: form.plateNo.trim() || undefined,
    carType: form.carType,
    tireSpec: form.tireSpec.trim(),
    withWheelRim: Boolean(form.withWheelRim),
    serviceType: form.serviceType,
    storageStartDate: form.storageStartDate,
    expectedReturnDate: form.expectedReturnDate,
    addonCodes: addonCodes.value,
    note: form.note.trim() || undefined,
    agreementAccepted: true,
    referralCode: form.referralCode.trim().toUpperCase() || undefined,
    useFreeReward: form.useFreeReward || undefined,
    paymentMethod: form.paymentMethod,
  }
  if (form.serviceType === 'pickup') {
    payload.pickupDate = form.pickupDate
    payload.pickupSlot = form.pickupSlot as SlotName
  }

  submitting.value = true
  try {
    const result = await createOrder(payload)
    if (Number(result.amountTotal) !== finalAmountTotal.value) {
      toast(t('create.amountMismatch'))
    }
    createdOrder.value = result
    qrVisible.value = true
    clientToken.value = createClientToken()
    // 免单或使用邀请码后清除前端标记，避免影响下一次创建
    form.useFreeReward = false
  } catch (error) {
    const text = errorText(error)
    if (/SLOT_FULL/.test((error as any)?.code || '')) {
      toast(t('create.slotFull'))
      form.pickupSlot = ''
    } else {
      toast(text || t('create.submitFailed'))
    }
  } finally {
    submitting.value = false
  }
}

function copyOrderNo(): void {
  const orderNo = createdOrder.value?.orderNo
  if (!orderNo) return
  uni.setClipboardData({
    data: orderNo,
    success: () => toast(t('common.copied')),
    fail: () => toast(t('common.copyFailed')),
  })
}

function viewOrder(): void {
  const order = createdOrder.value
  if (!order) return
  qrVisible.value = false
  uni.navigateTo({ url: detailLink(order.orderNo, form.phone) })
}

function closeSuccess(): void {
  qrVisible.value = false
  const order = createdOrder.value
  if (order) {
    uni.navigateTo({ url: detailLink(order.orderNo, form.phone) })
  }
}
</script>

<style scoped>
.page {
  padding: 0 24rpx 20rpx;
}
.error-card {
  margin-top: 24rpx;
  padding: 28rpx;
  border-radius: var(--radius-card);
  background: #fff;
  border: 2rpx solid rgba(224, 82, 63, 0.2);
}
.error-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: var(--color-accent);
}
.error-hint {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: var(--color-text-muted);
  line-height: 1.5;
}
.error-retry {
  display: inline-flex;
  margin-top: 20rpx;
}
.summary-card {
  margin-top: 24rpx;
  padding: 28rpx;
  background: linear-gradient(135deg, #f0f7ff, #ffffff 65%);
  border: 1rpx solid var(--color-border-soft);
}
.summary-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.summary-label {
  display: block;
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.summary-name {
  display: block;
  margin-top: 4rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--color-primary-text);
}
.summary-price {
  display: flex;
  align-items: baseline;
  color: var(--color-accent);
}
.summary-cur {
  font-size: 24rpx;
  font-weight: 700;
}
.summary-num {
  font-size: 48rpx;
  font-weight: 800;
}
.summary-hint {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
  color: var(--color-text-muted);
  line-height: 1.5;
}
.form-card {
  margin-top: 20rpx;
  padding: 8rpx 28rpx 16rpx;
}
.card-title {
  display: block;
  padding: 20rpx 0 6rpx;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-text);
}
.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.card-title-hint {
  font-size: 22rpx;
  color: var(--color-text-muted);
}
.field-input {
  width: 100%;
  height: 72rpx;
  padding: 0 20rpx;
  border-radius: var(--radius-sm);
  background: #f8fafc;
  font-size: 27rpx;
  color: var(--color-text);
}
.custom-input {
  margin-top: 12rpx;
}
.ph {
  color: #a1a1aa;
  font-size: 26rpx;
}
.picker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72rpx;
  padding: 0 20rpx;
  border-radius: var(--radius-sm);
  background: #f8fafc;
}
.picker-value {
  font-size: 27rpx;
  color: var(--color-text);
}
.picker-placeholder {
  font-size: 26rpx;
  color: #a1a1aa;
}
.picker-arrow {
  font-size: 30rpx;
  color: #a1a1aa;
}
.chip-row {
  display: flex;
  gap: 16rpx;
}
.chip {
  flex: 1;
  height: 68rpx;
  line-height: 68rpx;
  text-align: center;
  border-radius: var(--radius-sm);
  background: #f4f5f7;
  color: var(--color-text-muted);
  font-size: 26rpx;
  border: 2rpx solid transparent;
}
.chip.on {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  border-color: var(--color-primary);
  font-weight: 600;
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6rpx 0;
}
.switch-text {
  font-size: 26rpx;
  color: var(--color-text);
}
.switch {
  position: relative;
  width: 96rpx;
  height: 52rpx;
  border-radius: var(--radius-pill);
  background: #d8dde7;
  transition: background 0.2s ease;
}
.switch.on {
  background: var(--color-primary);
}
.switch-knob {
  position: absolute;
  top: 6rpx;
  left: 6rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
  box-shadow: 0 2rpx 8rpx rgba(15, 23, 42, 0.2);
}
.switch.on .switch-knob {
  transform: translateX(44rpx);
}
.service-grid {
  display: flex;
  gap: 16rpx;
  padding: 12rpx 0;
}
.service-card {
  flex: 1;
  padding: 22rpx;
  border-radius: var(--radius-card);
  border: 2rpx solid var(--color-border);
  background: #fff;
}
.service-card.on {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.service-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.service-name {
  font-size: 27rpx;
  font-weight: 600;
  color: var(--color-text);
}
.service-check {
  width: 32rpx;
  height: 32rpx;
  line-height: 30rpx;
  text-align: center;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-size: 20rpx;
}
.service-price {
  display: flex;
  align-items: baseline;
  margin-top: 10rpx;
  color: var(--color-accent);
}
.service-cur {
  font-size: 22rpx;
  font-weight: 700;
}
.service-num {
  font-size: 40rpx;
  font-weight: 800;
}
.return-pill {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  height: 64rpx;
  padding: 0 24rpx;
  border-radius: var(--radius-pill);
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  font-size: 25rpx;
}
.return-check {
  font-size: 24rpx;
}
.months-hint {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: var(--color-primary-text);
}
.addon-row {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid rgba(23, 23, 23, 0.05);
}
.addon-row:last-child {
  border-bottom: none;
}
.addon-check,
.agree-check {
  width: 42rpx;
  height: 42rpx;
  line-height: 38rpx;
  text-align: center;
  border-radius: 10rpx;
  border: 2rpx solid var(--color-border);
  color: #fff;
  font-size: 24rpx;
  flex: none;
  background: #fff;
}
.addon-check.on,
.agree-check.on {
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.addon-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.addon-name {
  font-size: 26rpx;
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
.addon-empty {
  display: block;
  padding: 20rpx 0;
  font-size: 24rpx;
  color: var(--color-text-muted);
}
.field-textarea {
  width: 100%;
  min-height: 140rpx;
  padding: 18rpx 20rpx;
  border-radius: var(--radius-sm);
  background: #f8fafc;
  font-size: 26rpx;
  color: var(--color-text);
  line-height: 1.6;
}
.pay-seg {
  display: flex;
  gap: 12rpx;
  padding: 12rpx 0 4rpx;
}
.pay-seg-item {
  flex: 1;
  padding: 18rpx 12rpx;
  border-radius: var(--radius-card);
  border: 2rpx solid var(--color-border);
  background: #fff;
  text-align: center;
}
.pay-seg-item.on {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.pay-seg-name {
  display: block;
  font-size: 25rpx;
  font-weight: 600;
  color: var(--color-text);
}
.pay-seg-item.on .pay-seg-name {
  color: var(--color-primary-text);
}
.pay-seg-sub {
  display: block;
  margin-top: 6rpx;
  font-size: 20rpx;
  color: var(--color-text-muted);
}
.pay-detail {
  margin-top: 12rpx;
  padding: 20rpx;
  border-radius: var(--radius-sm);
  background: #f8fafc;
}
.pay-detail-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-text);
}
.pay-detail-desc {
  display: block;
  margin-top: 6rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: var(--color-text-muted);
}
.pay-warn {
  margin-top: 10rpx;
  padding: 10rpx 14rpx;
  border-radius: 10rpx;
  background: #fff7ed;
  color: #b45309;
  font-size: 22rpx;
  line-height: 1.5;
}
.agreement-block {
  padding: 24rpx 8rpx 0;
}
.agree-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10rpx;
}
.agree-text {
  font-size: 24rpx;
  color: var(--color-text-muted);
}
.agree-link {
  font-size: 24rpx;
  color: var(--color-primary);
}
.agree-error {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: var(--color-accent);
}
.bottom-spacer {
  height: calc(150rpx + constant(safe-area-inset-bottom));
  height: calc(150rpx + env(safe-area-inset-bottom));
}
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}
.modal-panel {
  width: 100%;
  max-width: 660rpx;
  background: #fff;
  border-radius: 32rpx;
  padding: 32rpx;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 20rpx;
  border-bottom: 1rpx solid var(--color-border);
}
.modal-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--color-text);
}
.modal-close {
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  text-align: center;
  font-size: 30rpx;
  color: var(--color-text-muted);
}
.agreement-scroll {
  flex: 1;
  max-height: 52vh;
  margin-top: 20rpx;
}
.agreement-rich {
  font-size: 25rpx;
  color: var(--color-text);
  line-height: 1.8;
}
.agreement-empty {
  display: block;
  padding: 30rpx 0;
  font-size: 25rpx;
  color: var(--color-text-muted);
  text-align: center;
}
.modal-btn {
  margin-top: 24rpx;
}
.field-input.on {
  border-color: rgba(34, 197, 94, 0.5) !important;
  box-shadow: 0 0 0 2rpx rgba(34, 197, 94, 0.12);
}
.referral-hint {
  padding: 8rpx 4rpx 2rpx;
  font-size: 22rpx;
  line-height: 1.5;
}
.referral-hint.ok {
  color: #22c55e;
}
.referral-hint.err {
  color: var(--color-accent);
}
.free-bar {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-top: 8rpx;
  padding: 18rpx 22rpx;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, #fff7ed, #fef3c7);
  border: 1rpx solid rgba(249, 115, 22, 0.25);
}
.free-bar-icon {
  font-size: 34rpx;
  line-height: 1;
}
.free-bar-text {
  flex: 1;
  font-size: 24rpx;
  color: #9a3412;
  line-height: 1.5;
}
.free-switch {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-shrink: 0;
}
.free-switch-label {
  font-size: 22rpx;
  color: #9a3412;
}
</style>
