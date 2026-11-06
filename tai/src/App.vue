<script setup>
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(() => {
  // H5 / 微信内置浏览器：保持页面路由稳定，不做额外全局拦截
})
</script>

<style lang="scss">
@import '@/styles/tokens.scss';

page {
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue',
    'Microsoft YaHei', sans-serif;
  font-size: 28rpx;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

uni-page-body {
  background-color: var(--color-bg);
}

/* H5 居中容器：PC 预览不单独做版式，仅限制最大宽度 750px */
#app {
  max-width: 750px;
  margin: 0 auto;
  min-height: 100vh;
  background-color: var(--color-bg);
  box-shadow: 0 0 40px rgba(30, 58, 138, 0.08);
}

view,
text,
image,
input,
textarea,
button {
  box-sizing: border-box;
}

button::after {
  border: none;
}

/* 通用按钮 */
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 84rpx;
  padding: 0 36rpx;
  border-radius: var(--radius-pill);
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1;
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
}

.btn-primary[disabled],
.btn-disabled {
  background: #b7c7e8;
  color: #fff;
}

.btn-accent {
  background: var(--color-accent);
  color: #fff;
}

.btn-ghost {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
}

.btn-outline {
  background: transparent;
  border: 2rpx solid var(--color-border);
  color: var(--color-text);
}

.btn-sm {
  height: 64rpx;
  padding: 0 24rpx;
  font-size: 24rpx;
}

.card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
}

.safe-bottom {
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
