import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/', // Change to '/session-replay/' if deploying to user.github.io/session-replay/
  optimizeDeps: {
    // Vite's dep pre-bundler rewrites worker imports in a way that breaks COEP
    // MIME enforcement. Excluding these forces them to load as native ES modules
    // directly from node_modules, which preserves their worker blob URLs.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    port: 5174,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    // Removed /api proxy - no bridge server needed
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
