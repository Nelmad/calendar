import js from '@eslint/js';
import {defineConfig} from 'eslint/config';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig(
    {
        ignores: [
            'dist/**',
            'storybook-static/**',
            'node_modules/**',
            'coverage/**',
            'scripts/**',
            // The former evidence directory (archived outside the repository on 2026-10-22, git-ignored) may remain in a
            // local checkout; its recorded scripts are kept exactly as they ran and are not linted.
            'docs/implementation/evidence/**',
            'examples/*/dist/**',
            'examples/*/dist-server/**',
            'examples/*/.next/**',
            'examples/*/next-env.d.ts',
            // Claude Code worktrees (git-ignored) are checkouts of other branches inside this one.
            '.claude/**',
        ],
    },
    js.configs.recommended,
    tseslint.configs.recommended,
    {
        // Node entry points of the runnable examples (SSR server, configs).
        files: ['examples/*/*.mjs'],
        languageOptions: {
            globals: {console: 'readonly', process: 'readonly', URL: 'readonly'},
        },
    },
    {
        files: ['**/*.{ts,tsx}'],
        plugins: {
            react,
            'react-hooks': reactHooks,
        },
        languageOptions: {
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-hooks/set-state-in-effect': 'off',
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {prefer: 'type-imports', fixStyle: 'inline-type-imports'},
            ],
            '@typescript-eslint/no-unused-vars': [
                'error',
                {argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
            ],
        },
    },
);
