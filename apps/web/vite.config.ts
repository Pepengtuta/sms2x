import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = "http://localhost:3000";

// The API runs as a separate process. Report a dead API plainly instead of
// dumping a raw ECONNREFUSED stack trace into the dev server log.
const proxy = {
  target: API,
  changeOrigin: true,
  configure: (instance: any) => {
    const handler = (err: Error, _req: any, res: any) => {
      console.error(
        `\n  [ssmmss] The API is not running at ${API}.\n` +
          `  [ssmmss] Start it in another terminal:  npm run dev:api\n`
      );
      if (res && !res.headersSent && typeof res.writeHead === "function") {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: { code: "API_DOWN", message: "API server is not running. Start it with: npm run dev:api" },
          })
        );
      }
    };
    instance.on("error", handler);
    // Vite registers its own error listener after this hook; drop it so the log
    // shows the useful message instead of a raw ECONNREFUSED stack.
    setTimeout(() => {
      instance.listeners("error").forEach((l: any) => {
        if (l !== handler) instance.removeListener("error", l);
      });
    }, 0);
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // NOTE: do not proxy /health — the dashboard has its own /health page, and
      // proxying it would swallow the route and return JSON instead of the app.
      "/server-info": proxy,
      "/auth": proxy,
      "/v1": proxy,
      "/dashboard": proxy,
      "/gateway": proxy,
    },
  },
});
