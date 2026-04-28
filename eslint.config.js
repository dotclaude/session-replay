import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'docs', 'public']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended],
    plugins: {
      'react': react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Allow _-prefixed vars as intentional no-ops (API params, side-effect hooks)
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', args: 'after-used' }],
      // React 17+ JSX runtime - no React import needed
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      // Disable prop-types validation (project doesn't use PropTypes)
      'react/prop-types': 'off',
      // Allow empty catch blocks (intentional error suppression pattern)
      'no-empty': 'off',
      // Allow control characters in regex (ANSI escape codes)
      'no-control-regex': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    languageOptions: {
      globals: globals.browser,
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    plugins: {
      'react': react,
    },
    rules: {
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      'react/prop-types': 'off',
      // Allow any types in TS (project doesn't enforce strict typing)
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow _-prefixed vars as intentional no-ops (API params, side-effect hooks)
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', args: 'after-used' }],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    languageOptions: {
      globals: globals.browser,
      ecmaVersion: 2023,
      sourceType: 'module',
    },
  },
])
