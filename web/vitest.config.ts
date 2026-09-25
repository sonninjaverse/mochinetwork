import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "src/social/**/*.test.ts"],
    // Social code throws without its chain variables. .env.production holds
    // the committed public ones, so a fresh clone or CI has a chain to name;
    // anything local still wins because it is merged second.
    env: {
      ...loadEnv("production", process.cwd(), ""),
      ...loadEnv(mode, process.cwd(), ""),
    },
  },
  resolve: {
    alias: {
      "@social": path.resolve(import.meta.dirname, "src/social"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
}));
