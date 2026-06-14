import { defineConfig } from 'vite';

// base:'./' — относительные пути обязательны для file:// в WebView (APK).
// strictPort — фиксируем 8778, чтобы dev-сервер не пересёкся с соседними проектами
// (08_MergeMoney держит 8777).
export default defineConfig({
  base: './',
  server: {
    port: 8778,
    strictPort: true,
    open: false,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
