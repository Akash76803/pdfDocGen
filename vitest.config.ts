import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@document-tool/calculation-engine': path.resolve(__dirname, 'packages/calculation-engine/src/index.ts'),
      '@document-tool/contracts': path.resolve(__dirname, 'packages/contracts/src/index.ts'),
      '@document-tool/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@document-tool/datasource-csv': path.resolve(__dirname, 'packages/datasource-csv/src/index.ts'),
      '@document-tool/datasource-excel': path.resolve(__dirname, 'packages/datasource-excel/src/index.ts'),
      '@document-tool/datasource-sdk': path.resolve(__dirname, 'packages/datasource-sdk/src/index.ts'),
      '@document-tool/document-design-engine': path.resolve(__dirname, 'packages/document-design-engine/src/index.ts'),
      '@document-tool/grouping-engine': path.resolve(__dirname, 'packages/grouping-engine/src/index.ts'),
      '@document-tool/mapping-engine': path.resolve(__dirname, 'packages/mapping-engine/src/index.ts'),
      '@document-tool/persistence': path.resolve(__dirname, 'packages/persistence/src/index.ts'),
      '@document-tool/renderer-docx': path.resolve(__dirname, 'packages/renderer-docx/src/index.ts'),
      '@document-tool/renderer-image': path.resolve(__dirname, 'packages/renderer-image/src/index.ts'),
      '@document-tool/renderer-pdf': path.resolve(__dirname, 'packages/renderer-pdf/src/index.ts'),
      '@document-tool/renderer-sdk': path.resolve(__dirname, 'packages/renderer-sdk/src/index.ts'),
      '@document-tool/template-engine': path.resolve(__dirname, 'packages/template-engine/src/index.ts'),
      '@document-tool/validation': path.resolve(__dirname, 'packages/validation/src/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    exclude: [
      '**/node_modules/**', '**/dist/**', 'reference/**',
      'packages/persistence/test/phase6*.test.ts', 'packages/persistence/test/phase7*.test.ts',
      'packages/persistence/test/phase91*.test.ts', 'packages/persistence/test/vector-ux2*.test.ts',
      'packages/renderer-pdf/test/phase650-card-pdf-export.test.ts',
      'packages/renderer-image/test/phase650-card-image-export.test.ts',
      'packages/renderer-image/test/phase4192-png-renderer.test.ts',
      'packages/renderer-pdf/test/phase43-pagination.test.ts',
      'packages/datasource-excel/test/excel-adapter.test.ts',
      'packages/datasource-csv/test/csv-adapter.test.ts',
      'apps/desktop/src/lib/nativePdfGeneration.test.ts',
    ],
  },
});
