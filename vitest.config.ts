import { defineConfig } from "vitest/config";

// Unit tests only; integration/*.test.mjs is the manifest-gated live tier,
// run separately via `npm run test:integration` (node --test).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
