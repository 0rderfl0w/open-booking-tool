import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import devApiProxy from './dev-api-proxy';

export default defineConfig({
  plugins: [react(), devApiProxy()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
