// Verification scaffolding. launch.sh copies this file to host/vite.verify.config.js
// and cleanup.sh deletes the copy. Do not pass this scripts/ path to Vite.
// Lives in host/ so Vite can resolve the "vite" package. Omits mkcert HTTPS so
// the page can open the local relay's plain ws:// socket.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  plugins: [react()],
  envDir: repoRoot,
  server: {
    host: '127.0.0.1',
    port: 15173,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
