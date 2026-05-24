import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    server: {
      deps: {
        inline: ["server-only"]
      }
    }
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
      "server-only": new URL("./tests/server-only-stub.ts", import.meta.url).pathname
    }
  }
});
