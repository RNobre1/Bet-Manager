import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/api/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
      "lib/**/*.test.{ts,tsx}",
    ],
    setupFiles: ["./tests/setup-env.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
