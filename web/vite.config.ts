import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    fs: {
      allow: [path.resolve(__dirname, '..')]
    }
  },
  build: {
    outDir: path.resolve(__dirname, '../dist/web'),
    emptyOutDir: false
  }
});
