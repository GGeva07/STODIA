import { defineConfig } from 'tsup';

// Sin bundle: dist/ refleja src/, así el loader de módulos puede escanear dist/modules/*.
export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.test.ts'],
  format: 'cjs',
  target: 'node20',
  bundle: false,
  clean: true,
  sourcemap: true,
});
