import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const certDir = path.resolve(__dirname, '../certs');
const certKey = path.join(certDir, 'localhost-key.pem');
const certFile = path.join(certDir, 'localhost.pem');
const hasLocalCert = fs.existsSync(certKey) && fs.existsSync(certFile);

export default defineConfig({
  plugins: [react()],
  envDir: '../',
  server: {
    host: '0.0.0.0',
    port: 5173,
    ...(hasLocalCert && {
      https: {
        key: fs.readFileSync(certKey),
        cert: fs.readFileSync(certFile),
      },
    }),
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
