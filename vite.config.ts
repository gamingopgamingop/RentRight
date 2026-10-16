import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { forwardOutperoCall } from "./api/_outpero";
import { forwardNemotronChat, MAX_BODY_BYTES } from "./api/_nemotron";

/**
 * Dev-only SERVER middleware that mirrors the production serverless function
 * at api/outpero-call.ts. It serves POST /api/outpero-call, reads the secret
 * from the server env, and forwards to Outpero — so the browser never holds
 * or sends the API key, in dev or prod. This is a real Node server handler,
 * not a passthrough proxy.
 */
function outperoDevServer(apiKey: string | undefined): Plugin {
  return {
    name: "outpero-dev-server",
    configureServer(server) {
      server.middlewares.use("/api/outpero-call", (req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", async () => {
          try {
            const raw = Buffer.concat(chunks).toString("utf-8");
            const body = raw ? JSON.parse(raw) : {};
            const idem = req.headers["idempotency-key"];
            const { status, json } = await forwardOutperoCall(
              body,
              apiKey,
              typeof idem === "string" ? idem : undefined
            );
            res.statusCode = status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(json));
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ message: e?.message || "Server error" }));
          }
        });
      });
    },
  };
}

// https://vitejs.dev/config/
/**
 * Dev-only SERVER middleware mirroring the production function at
 * api/nemotron/[...path].ts. It serves POST /api/nemotron/*, reads the NVIDIA
 * key from the server env, validates and forwards to NVIDIA — so the browser
 * never holds/sends the key and never calls NVIDIA directly (no CORS) in dev
 * either. Shares forwardNemotronChat() with the serverless function.
 */
function nemotronDevServer(apiKey: string | undefined): Plugin {
  return {
    name: "nemotron-dev-server",
    configureServer(server) {
      server.middlewares.use("/api/nemotron", (req, res) => {
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: { message: "Only POST is supported." } }));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let tooLarge = false;
        req.on("data", (c) => {
          size += (c as Buffer).length;
          if (size > MAX_BODY_BYTES) {
            tooLarge = true;
            req.destroy();
          } else {
            chunks.push(Buffer.from(c));
          }
        });
        req.on("end", async () => {
          try {
            if (tooLarge) {
              res.statusCode = 413;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: { message: "Request body too large." } }));
              return;
            }
            const raw = Buffer.concat(chunks).toString("utf-8");
            const body = raw ? JSON.parse(raw) : {};
            const { status, json } = await forwardNemotronChat(body, apiKey);
            res.statusCode = status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(json));
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: { message: "Internal proxy error." } }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load ALL env vars (including non-VITE_ secrets) for server-side use.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      host: "::",
      port: 8080,
      // NOTE: basicSsl is enabled below, so the dev server serves HTTPS on the
      // same port. Browser mic/voice features need a secure context: use
      // https://localhost:8080 or the https:// Network URL (for phones on the LAN).
      //
      // NOTE: Neither Nemotron nor Outpero is proxied here anymore. Both are
      // served by the dev middlewares below (nemotronDevServer / outperoDevServer),
      // which mirror the production serverless functions and keep secrets
      // strictly server-side. The browser only ever talks to same-origin /api/*.
    },
    plugins: [
      react(),
      basicSsl(),
      nemotronDevServer(env.NVIDIA_API_KEY),
      outperoDevServer(env.OUTPERO_API_KEY),
      mode === 'development' &&
      componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
