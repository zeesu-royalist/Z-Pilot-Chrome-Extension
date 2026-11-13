import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { build as esbuild } from 'esbuild';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'build-content-script',
      async closeBundle() {
        await esbuild({
          entryPoints: [resolve(__dirname, 'src/content/page-agent.ts')],
          bundle: true,
          outfile: resolve(__dirname, 'dist/content.js'),
          format: 'iife',
          minify: true,
          target: 'chrome120',
          define: { 'process.env.NODE_ENV': '"production"' },
          platform: 'browser',
        });
        console.log('✓ content.js built as standalone IIFE via esbuild');
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        // content.js is NOT here — handled by esbuild plugin above
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
