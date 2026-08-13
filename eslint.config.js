// ESLint 平铺配置（ESLint 9 + typescript-eslint v8 + react-hooks）。
// 让 `npm run lint` 可用，并对 TypeScript/TSX 做静态检查，
// 使代码中已有的 eslint-disable 注释真正生效。
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      "coverage/**",
      "scripts/**",
      "supabase/**",
      "*.config.js",
      "*.config.ts",
      "debug-*.mjs",
      "test-*.mjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      // Hooks 规则：rules-of-hooks 为硬错误，exhaustive-deps 为警告
      // （代码中已有针对性的 eslint-disable 注释用于确需省略依赖的 effect）
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // 本项目大量使用 ref 闭包 effect，关闭该严格规则以避免误报
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
];
