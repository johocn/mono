import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig(({ command }) => ({
  // 生产发布在 www.joho.cn/tire/ 子目录，构建产物需带 /tire/ 前缀；开发环境仍用根路径
  base: command === 'build' ? '/tire/' : '/',
  plugins: [uni()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
}))
