import tseslint from 'typescript-eslint';
import mono from './tools/eslint-plugin-mono/index.js';

export default [
  { ignores: ['release/**', 'node_modules/**', 'public/**'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser, ecmaVersion: 2022, sourceType: 'module' },
  },
  {
    // 禁写死：只作用于渲染层
    files: ['src/render/**/*.ts'],
    plugins: { mono },
    rules: { 'mono/no-hardcoded-color': 'error', 'mono/no-visual-number': 'error' },
  },
];