import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirror tsconfig's "@/*" → repo-root alias so tests can import route handlers
// (which use "@/lib/…") the same way the app does.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // config.ts captures ADMIN_TOKEN at module load, so it must be present in
    // the env before any test imports it (the admin-route tests rely on it).
    env: {
      ADMIN_TOKEN: "identity-test-token",
    },
  },
});
