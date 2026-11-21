import js from '@eslint/js';

export default [
  {
    ...js.configs.recommended,
    files: ['src/**/*.js', 'tests/**/*.js', 'scripts/**/*.js', 'script.js', 'sw.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        crypto: 'readonly',
        Notification: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        Chart: 'readonly',
        console: 'readonly',
        caches: 'readonly',
        self: 'readonly',
        Response: 'readonly',
        fetch: 'readonly',
        FileReader: 'readonly',
        HTMLElement: 'readonly',
        Intl: 'readonly',
        Date: 'readonly'
      }
    }
  },
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'],
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] }
  },
  {
    files: ['script.js', 'sw.js'],
    rules: {
      'no-unused-vars': 'warn',
      'no-useless-escape': 'off'
    }
  }
];
