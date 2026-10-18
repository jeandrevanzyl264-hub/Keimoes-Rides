import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const setting = process.env.VITE_USE_EMULATORS ?? env.VITE_USE_EMULATORS;
  const useEmulators = setting === 'true' || (setting === undefined && command === 'serve' && mode !== 'production');
  if (command === 'build' && useEmulators && process.env.KR_ALLOW_EMULATOR_BUILD !== 'true') {
    throw new Error('Refusing to publish a local-emulator build. Use npm run build:production for Netlify/hosting. Local preview builds require KR_ALLOW_EMULATOR_BUILD=true explicitly.');
  }
  const appUrl = process.env.VITE_PUBLIC_APP_URL || env.VITE_PUBLIC_APP_URL || process.env.URL || '';
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_USE_EMULATORS': JSON.stringify(useEmulators ? 'true' : 'false'),
      'import.meta.env.VITE_PUBLIC_APP_URL': JSON.stringify(appUrl),
    },
    server: { host: '0.0.0.0', port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('/node_modules/')) return;
            if (id.includes('/@firebase/') || id.includes('/firebase/')) return 'firebase';
            if (id.includes('/leaflet/')) return 'map';
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react';
          }
        }
      }
    }
  };
});
