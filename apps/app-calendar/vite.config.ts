import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5176,
    strictPort: true,
    cors: true,
    origin: 'http://localhost:5173',
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/main.tsx'),
      name: 'app-calendar',
      formats: ['umd'],
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
    },
  },
});
