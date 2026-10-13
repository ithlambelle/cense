import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Logic tests run in plain Node. A component test opts into a browser-like
// page by starting its file with: // @vitest-environment jsdom
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
