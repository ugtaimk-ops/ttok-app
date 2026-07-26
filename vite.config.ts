import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(process.env.APP_URL || 'https://ais-bvonneldyx46ericl2z475-351843784929.asia-northeast1.run.app'),
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
