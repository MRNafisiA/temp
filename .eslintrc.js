module.exports = {
    root: true,
    env: { node: true, es2024: true },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'prettier'
    ],
    rules: {
        '@typescript-eslint/no-unused-vars': [
            'error',
            { argsIgnorePattern: '^_+$' }
        ],
        '@typescript-eslint/no-var-requires': 'off'
    },
    ignorePatterns: ['dist', 'build'],
    parser: '@typescript-eslint/parser',
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }
};
