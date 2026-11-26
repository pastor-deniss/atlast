// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    rules: {
      // HTML entities are a web/JSX-DOM concern: React Native's <Text> does not
      // decode them, so "&apos;" would render literally. Plain quotes are correct.
      'react/no-unescaped-entities': 'off',
      // This React Compiler rule flags the fetch-on-mount pattern
      // (useEffect(() => { load() }, [load])) and the hydration flags in
      // use-color-scheme.web.ts / use-is-wide-screen.ts, which are intentional.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
