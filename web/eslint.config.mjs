import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // S49: analytics go through track() in src/lib/analytics.ts, which checks
  // every event against the catalog. Nothing else may call PostHog. Server
  // errors go through reportServerError() in src/lib/server-errors.ts.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/lib/analytics.ts", "src/lib/analytics-config.ts", "src/lib/analytics.test.ts", "src/instrumentation-client.ts", "src/lib/server-errors.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "posthog-js", allowTypeImports: true, message: "Send analytics with track() from @/lib/analytics, which checks the event catalog." },
            { name: "posthog-node", allowTypeImports: true, message: "Report server errors with reportServerError() from @/lib/server-errors." },
          ],
          patterns: [{ group: ["posthog-js/*"], allowTypeImports: true, message: "Send analytics with track() from @/lib/analytics, which checks the event catalog." }],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output (npm run e2e):
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
