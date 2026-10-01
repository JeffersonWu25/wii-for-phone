// Verification scaffolding. launch.sh copies this file to phone/vite.verify.config.js
// and cleanup.sh deletes the copy. Do not pass this scripts/ path to Vite.
// Omits mkcert HTTPS so the controller can open the local relay's plain ws:// socket.
import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  envDir: repoRoot,
  server: {
    host: '127.0.0.1',
    port: 15174,
    strictPort: true,
  },
});
