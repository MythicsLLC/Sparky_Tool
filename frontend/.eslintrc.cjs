module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    // React 17+ JSX transform — no need to import React in every file
    'react/react-in-jsx-scope': 'off',
    // PropTypes are not used in this project (Clerk + TS-style inference)
    'react/prop-types': 'off',
    // Warn on unused variables; ignore leading-underscore names (intentional)
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Allow console in dev but warn so logs don't sneak into production
    'no-console': 'warn',
  },
}
