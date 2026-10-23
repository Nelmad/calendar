/** @type {import('stylelint').Config} */
export default {
    extends: ['stylelint-config-standard'],
    ignoreFiles: ['**/dist/**', 'storybook-static/**', '**/node_modules/**', 'coverage/**', '**/.next/**'],
    rules: {
        'selector-class-pattern': null,
        'custom-property-pattern': null,
        'keyframes-name-pattern': null,
        'import-notation': null,
        'alpha-value-notation': null,
        'color-function-alias-notation': null,
        'color-function-notation': null,
    },
};
