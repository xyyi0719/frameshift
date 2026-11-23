import { defineConfig } from 'vite';

// 单页纯前端。base 用相对路径，方便直接丢到 itch.io / 任意静态托管。
export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
});
