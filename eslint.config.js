import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * 扁平化 ESLint 配置。
 * .astro 文件不在此处做风格检查（Astro 组件由 `astro check` 负责类型层校验），
 * 这里聚焦 TS/JS 源码的规则与类型安全。
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.astro/**',
      '**/.wrangler/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // AGENTS.md §5.1：禁止 any，未知类型用 unknown 再收窄
      '@typescript-eslint/no-explicit-any': 'error',
      // 要求类型导入写成 `import type` / 内联 `type` 修饰符。
      // disallowTypeAnnotations: false 是刻意的：`env.d.ts` 这类**全局声明文件**一旦出现顶层 import
      // 就会被 TS 视为「模块」，其中的 `declare namespace App` 也会随之内收，不再全局可见。
      // 这种场合只能用 `import('...').T` 形式的类型注解，不能强制改写。
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', disallowTypeAnnotations: false },
      ],
    },
  },
);
