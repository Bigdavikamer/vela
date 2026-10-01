// Flat config (ESLint 9) built on Expo's shared rules.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      // Deno runtime: different globals and `npm:` import specifiers. These are
      // type-checked and bundled by Supabase on deploy, not by this config.
      'supabase/functions/**',
    ],
  },
  {
    rules: {
      // Reanimated's entire API is `sharedValue.value = ...`, including inside
      // gesture callbacks and event handlers. The React Compiler rule reads
      // that as mutating a value captured by an effect; for a SharedValue it is
      // the documented and only way to drive an animation.
      'react-hooks/immutability': 'off',

      // The remaining cases are async results landing in state (auth profile,
      // recorder interruption) and per-item resets keyed off an index. Both are
      // legitimate uses of an effect, so this stays visible as a warning rather
      // than being silenced or contorted into a worse shape.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];
