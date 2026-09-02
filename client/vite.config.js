import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the repo from a project sub-path:
  // https://<user>.github.io/traffic-loop/
  base: "/traffic-loop/",
  server: {
    port: 5173,
    host: "localhost",
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
