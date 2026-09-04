import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 0.0.0.0 바인딩 — 컨테이너 밖(호스트 브라우저)에서 5173 접근 가능하게
    port: 5173,
    watch: {
      usePolling: true, // 마운트된 볼륨의 파일 변경을 감지하려면 폴링 필요 (macOS Docker)
    },
  },
})
