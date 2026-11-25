import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Configuración separada de vite.config.js para no afectar el build.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{js,jsx}'],
  },
});
