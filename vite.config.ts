import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  server: {
    watch: { ignored: ["**/.local/**", "**/.build/**"] },
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/.local/**",
        "**/.build/**",
      ],
    },
  },
  plugins: [
    react(),
    {
      name: "forma-local-config",
      configureServer(server) {
        if (process.env.FORMA_LOCAL !== "true") return;
        server.middlewares.use("/cloud-config.json", (_req, res) => {
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "no-store");
          res.end(
            JSON.stringify({
              enabled: true,
              mode: "local",
              apiUrl: "http://127.0.0.1:8787",
            }),
          );
        });
      },
    },
  ],
});
