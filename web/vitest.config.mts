import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

// Logic tests run in plain Node. A component test opts into a browser-like
// page by starting its file with: // @vitest-environment jsdom
// e2e/ holds the Playwright journey tests (npm run e2e), never run by vitest.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
