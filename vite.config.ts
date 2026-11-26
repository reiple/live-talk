import { defineConfig } from 'vite';

// /api 요청은 AI 대화 서버로 넘긴다 (기본 localhost:8787, docker compose 의 api 서비스)
export default defineConfig({
  server: {
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:8787' },
  },
  preview: {
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:8787' },
  },
});
