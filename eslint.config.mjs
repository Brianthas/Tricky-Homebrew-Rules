import js from "@eslint/js";

export default [
  {
    ignores: ["node_modules/**", "styles/**", "lang/**"]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {
      // fvtt-types checks Foundry globals through jsconfig.json, more
      // accurately than a hand-maintained list would.
      "no-undef": "off",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-prototype-builtins": "off",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-unsafe-optional-chaining": "error",
      "no-self-compare": "error",
      "no-unmodified-loop-condition": "warn",

      // The let x = null; try { x = ... } catch { return null; } idiom reads as a
      // dead store to this rule. It is deliberate here and the catch always returns.
      "no-useless-assignment": "off"
    }
  }
];
