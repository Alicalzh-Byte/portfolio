import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * 后台 SPA 独立构建，产物挂在 /admin（TECH_DESIGN §1.1）。
 * 这里不引入任何 Node 能力，因此无需 @types/node。
 */
export default defineConfig({
  plugins: [react()],
  // 与部署路径一致：构建产物的资源前缀 + 开发服务器的基础路径
  base: '/admin/',
  server: {
    port: 5173,
    // 开发时把 /api 代理到本地 Pages Functions（wrangler），避免跨域与 CORS
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4321',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // 后台不进公开站，产物保持默认即可
    sourcemap: false,
  },
});
