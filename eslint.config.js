import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // _restore é um worktree de outro branch e _to_delete é código arquivado:
  // lintá-los enchia o relatório com ~22 mil erros de arquivos que ninguém
  // mantém, escondendo os problemas reais de src/.
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      "_restore",
      "_to_delete",
      "node_modules",
      // Arquivos gerados pelo Lovable/TanStack ("This file is automatically
      // generated. Do not edit it directly."): corrigir lint neles é perdido na
      // próxima regeração.
      "src/routeTree.gen.ts",
      "src/routes/mcp.ts",
      "src/integrations/supabase/types.ts",
      "src/integrations/supabase/client.server.ts",
      "src/integrations/supabase/auth-middleware.ts",
      "src/integrations/supabase/previewAuthStorage.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);
