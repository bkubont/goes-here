import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Match the Vite @ alias so lib modules can be imported in tests.
// TZ is fixed so date-only strings ("YYYY-MM-DD" = UTC midnight) are checked
// in a US timezone, where that instant is the previous evening.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
    env: {
      TZ: "America/New_York",
    },
  },
});
