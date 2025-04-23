import { defineConfig } from 'vite';

export default defineConfig({
  base: '/', 
  plugins: [],
  server: {
    port: 3000,
    open: true
  },
  envDir: './',
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets'
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        format: 'es',
        chunkFileNames: 'assets/worker-[hash].js'
      }
    }
  },
  optimizeDeps: {
    exclude: ['src/workers/*']
  }
});
