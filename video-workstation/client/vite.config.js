import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/video/',  // 设置为在 /video/ 子路径下运行
  server: {
    allowedHosts: [
      'xobi.kk666.online',
      'video.xobi.kk666.online',
      '.xobi.kk666.online',
    ],
    hmr: {
      clientPort: 443,  // HTTPS 端口
      path: '/video/',  // HMR WebSocket 路径
    },
  },
})
