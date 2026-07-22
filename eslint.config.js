import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// eslint 9 flat config：JS 推荐规则 + TS 推荐规则
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // 项目中有意保留的空 catch（归还连接/关闭池时忽略错误，已有注释说明）
      'no-empty': ['error', { allowEmptyCatch: true }],
      // *Schema 常量仅用于 z.infer<typeof X> 类型推导，是合法用途
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: 'Schema$' },
      ],
    },
  },
];
