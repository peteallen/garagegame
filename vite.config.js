import { defineConfig } from 'vite';

export default defineConfig(() => ({
  base: process.env.GITHUB_PAGES === 'true' ? '/garagegame/' : '/',
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 5173),
  },
}));
