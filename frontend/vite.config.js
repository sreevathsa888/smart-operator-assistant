import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run dev` proxies /api to the FastAPI backend (VITE_API_URL, default http://localhost:8000).
// `npm run build:single` produces one self-contained HTML file (used for the hosted preview).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
    server: { proxy: { '/api': { target: env.VITE_API_URL || 'http://localhost:8000', changeOrigin: true } } },
    build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 3000 },
  };
});
