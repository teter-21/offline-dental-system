import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const frontendDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, frontendDir, "");

  const isDesktop = mode === "desktop";

  return {
    // The compiled frontend is served at
    // http://127.0.0.1:3001 by Express.
    base: "/",

    plugins: [
      react(),

      {
        name: "production-security-policy",
        apply: "build",

        transformIndexHtml() {
          let api;

          try {
            api = new URL(env.VITE_API_URL);
          } catch {
            throw new Error("Set VITE_API_URL in the frontend environment.");
          }

          const secureRemote = api.protocol === "https:";

          const localDesktop =
            api.protocol === "http:" &&
            api.hostname === "127.0.0.1" &&
            api.port === "3001";

          if (
            api.username ||
            api.password ||
            api.pathname !== "/" ||
            api.search ||
            api.hash ||
            (isDesktop ? !localDesktop : !secureRemote)
          ) {
            throw new Error(
              isDesktop
                ? "Desktop VITE_API_URL must be http://127.0.0.1:3001."
                : "Production VITE_API_URL must be an HTTPS URL without credentials.",
            );
          }

          const policy = [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' blob: data:",
            "font-src 'self' data:",
            `connect-src 'self' ${api.origin}`,
            "media-src 'self' blob:",
            "frame-src https://www.google.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join("; ");

          return [
            {
              tag: "meta",
              attrs: {
                "http-equiv": "Content-Security-Policy",
                content: policy,
              },
              injectTo: "head-prepend",
            },
            {
              tag: "meta",
              attrs: {
                name: "referrer",
                content: "no-referrer",
              },
              injectTo: "head-prepend",
            },
          ];
        },
      },
    ],

    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
    },
  };
});
