import { defineConfig } from 'vite';

const port = Number(process.env.E2E_PORT ?? 4173);
// VITE_BASE defaults to '/' so local dev and the SWA build keep root-relative
// URLs. Pages sets VITE_BASE=/nyan-noodle/ when building the subpath site.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port, strictPort: true },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
});
