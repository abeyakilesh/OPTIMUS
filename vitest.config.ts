import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // See tests/stubs/server-only.ts — Next resolves this marker itself, so
      // there is nothing in node_modules for vitest to find.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/kernel/**/*.test.ts"],
    reporters: "verbose",
  },
});
