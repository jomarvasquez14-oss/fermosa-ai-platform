import path from "path";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      // Tests run in Node; the react-server-only marker must not throw there.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    // Keep vitest's robust defaults (`**/node_modules/**`, `**/dist/**`, …) —
    // a bare "node_modules" only matches the top-level dir, so a nested git
    // worktree under `.claude/worktrees/*/node_modules` would otherwise get
    // globbed for third-party package tests and poison the run (M0049).
    exclude: [...configDefaults.exclude, "**/.next/**", "**/.claude/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
