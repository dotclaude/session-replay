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
    // COOP/COEP headers disabled in dev mode because they break Firefox HMR
    // To test video export in dev, use: npm run preview (production build)
    //
    // The issue: Firefox's strict COEP enforcement blocks Vite's pre-bundled deps
    // Chrome is more lenient and works with these headers, but Firefox needs them off
    //
    // Trade-off: Dev mode works in all browsers, but video export requires production build
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    // Ensure production build works with COEP
    target: 'esnext',
  },
});
