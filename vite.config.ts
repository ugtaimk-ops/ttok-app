import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(process.env.APP_URL || 'https://ais-bvonneldyx46ericl2z475-351843784929.asia-northeast1.run.app'),
      'import.meta.env.VITE_APP_SHARED_SECRET': JSON.stringify(process.env.APP_SHARED_SECRET || ''),
      // RevenueCat's Public SDK key - like Firebase's client apiKey, this is designed to
      // ship inside the app (it can only initiate purchases/read entitlements for the
      // configured app_user_id, not access account-wide secrets).
      'import.meta.env.VITE_REVENUECAT_API_KEY_ANDROID': JSON.stringify(process.env.REVENUECAT_API_KEY_ANDROID || 'test_hbymLKCPywOoVKMDsPqkqvymckS'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Dynamic HMR configuration that adapts to proxy environments and prevents WebSocket failures
      hmr: process.env.DISABLE_HMR === 'true' ? false : {
        protocol: 'wss',
        clientPort: 443,
      },
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
