import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), {
      name: 'exclude-ui-editor-catalog-from-release',
      apply: 'build' as const,
      closeBundle() {
        // The catalog is used only by the local UI editor and need not ship
        // inside production APK/AAB assets or the Render web directory.
        fs.rmSync(path.resolve(__dirname, 'dist/ui-catalog.json'), { force: true });
      },
    }],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(process.env.APP_URL || (process.env.NODE_ENV === 'production' ? 'https://ttok-backend.onrender.com' : '')),
      // RevenueCat's Public SDK key - like Firebase's client apiKey, this is designed to
      // ship inside the app (it can only initiate purchases/read entitlements for the
      // configured app_user_id, not access account-wide secrets).
      'import.meta.env.VITE_REVENUECAT_API_KEY_ANDROID': JSON.stringify(process.env.REVENUECAT_API_KEY_ANDROID || ''),
      'import.meta.env.VITE_REVENUECAT_API_KEY_IOS': JSON.stringify(process.env.REVENUECAT_API_KEY_IOS || ''),
    },
    resolve: {
      dedupe: ['react', 'react-dom', 'firebase', '@firebase/app', '@firebase/auth', '@firebase/firestore', '@firebase/functions'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Let Vite use the local page's protocol and port for HMR.
      hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
