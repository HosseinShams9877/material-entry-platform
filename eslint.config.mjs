import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript — قواعد ایمنی نوع فعال
    "@typescript-eslint/no-explicit-any": "error", // any ممنوع — Type دقیق الزامی
    "@typescript-eslint/no-non-null-assertion": "error", // ! غیر null — الگوی خطاخیز
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "@typescript-eslint/ban-ts-comment": "error",
    "@typescript-eslint/prefer-as-const": "warn",

    // React rules (تصمیم معماری: exhaustive-deps خاموش برای جلوگیری از Refactor گستردهٔ UI)
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // General JavaScript
    "prefer-const": "warn",
    "no-console": ["error", { allow: ["log", "warn", "error"] }], // فقط Logger مجاز است لاگ ساختاریافته بدهد؛ console مستقیم محدود
    "no-debugger": "error",
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-irregular-whitespace": "error",
    "no-case-declarations": "warn",
    "no-fallthrough": "error",
    "no-mixed-spaces-and-tabs": "error",
    "no-redeclare": "error",
    "no-undef": "off", // TS مسئول است
    "no-unreachable": "error",
    "no-useless-escape": "warn",
  },
}, {
  // مسیرهای قالبی/محیطی که بخشی از اپلیکیشن نیستند
  ignores: [
    "node_modules/**", ".next/**", "out/**", "build/**",
    "next-env.d.ts", "examples/**", "skills/**", "mini-services/**",
    ".zscripts/**", "download/**", "db/**", "uploads/**", "tests/**",
  ]
}];

export default eslintConfig;
