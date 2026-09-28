import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const target = 'http://127.0.0.1:' + (process.env.MANXIANG_MOCK === '1' ? '3100' : '3000');
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', assetsDir: 'build' },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: {
      '/api': {
        target, changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (outgoing, incoming) => {
            // Only rewrite this development UI's origin, retaining cross-site rejection.
            if (['http://127.0.0.1:5173', 'http://localhost:5173'].includes(incoming.headers.origin || '')) outgoing.setHeader('Origin', target);
          });
        },
      },
    },
  },
});
