import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      '@document-tool/contracts': path.resolve(__dirname, '../../packages/contracts/src'),
      '@document-tool/datasource-sdk': path.resolve(__dirname, '../../packages/datasource-sdk/src'),
      '@document-tool/datasource-excel': path.resolve(__dirname, '../../packages/datasource-excel/src'),
      '@document-tool/datasource-csv': path.resolve(__dirname, '../../packages/datasource-csv/src'),
      '@document-tool/template-engine': path.resolve(__dirname, '../../packages/template-engine/src'),
      '@document-tool/mapping-engine': path.resolve(__dirname, '../../packages/mapping-engine/src'),
      '@document-tool/grouping-engine': path.resolve(__dirname, '../../packages/grouping-engine/src'),
      '@document-tool/calculation-engine': path.resolve(__dirname, '../../packages/calculation-engine/src'),
      '@document-tool/renderer-sdk': path.resolve(__dirname, '../../packages/renderer-sdk/src'),
      '@document-tool/renderer-pdf': path.resolve(__dirname, '../../packages/renderer-pdf/src'),
      '@document-tool/renderer-image': path.resolve(__dirname, '../../packages/renderer-image/src'),
      '@document-tool/renderer-docx': path.resolve(__dirname, '../../packages/renderer-docx/src'),
      '@document-tool/core': path.resolve(__dirname, '../../packages/core/src'),
      '@document-tool/persistence': path.resolve(__dirname, '../../packages/persistence/src'),
      '@document-tool/design-engine': path.resolve(__dirname, '../../packages/design-engine/src'),
      '@document-tool/validation': path.resolve(__dirname, '../../packages/validation/src'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
