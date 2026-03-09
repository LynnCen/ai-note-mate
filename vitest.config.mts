import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    pool: "threads",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.git/**", "**/.next/**", "**/.worktrees/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@client": path.resolve(__dirname, "./src/client"),
      "@server": path.resolve(__dirname, "./src/server"),
      "@agents": path.resolve(__dirname, "./src/agents"),
    },
  },
});
