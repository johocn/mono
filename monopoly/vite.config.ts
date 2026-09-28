import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'release',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: 'mono.html',
      output: {
        entryFileNames: 'js/mono.js',
        chunkFileNames: 'js/[name].js',
        assetFileNames: 'assets/mono/[name][extname]',
      },
    },
  },
  server: { port: 52300, host: '127.0.0.1' },
});