import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  const target = env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:21114';

  return {
    plugins: [react(), tailwindcss()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    server: {
      port: 5173,
      strictPort: true,
      // Same-origin in development: the browser keeps its own Origin header, which the API checks
      // against ADMIN_ALLOWED_ORIGINS (http://localhost:5173). changeOrigin only rewrites Host.
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
    preview: { port: 4173, strictPort: true },
    build: { sourcemap: false },
  };
});
