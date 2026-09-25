import { dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "node:module";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: dirname(require.resolve("eslint-config-next/package.json")),
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "release/**",
      "next-env.d.ts",
      "public/brand/source/**",
    ],
  },
];

export default eslintConfig;
