/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { exerciseStorePlugin } from './server/exerciseStorePlugin';

export default defineConfig({
  plugins: [react(), tailwindcss(), exerciseStorePlugin(fileURLToPath(new URL('./dados', import.meta.url)))],
  server: {
    port: 5173,
    host: '127.0.0.1',
    // Os arquivos de dados não fazem parte do código: não recarregar a página quando mudam.
    watch: { ignored: ['**/dados/**'] },
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
});
