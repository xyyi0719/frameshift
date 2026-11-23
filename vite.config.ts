import { defineConfig } from 'vite';

// 纯前端单页；base 用相对路径，方便直接丢静态托管 / 后续小游戏壳。
export default defineConfig({
  base: './',
  server: { port: 5174, host: true },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
});
