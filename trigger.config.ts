import { defineConfig } from "@trigger.dev/sdk/v3";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

/**
 * Trigger.dev v3 configuration for the NARA project.
 * - Project: neander.co.ltd / nara
 * - projectRef is stored here as the authoritative source of truth.
 * - Secret keys (TRIGGER_SECRET_KEY) live in .env (not committed).
 */
export default defineConfig({
  project: "proj_xlyxputqkbksyzuyraxl",
  runtime: "node",
  logLevel: "log",
  maxDuration: 900,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 2000,
      maxTimeoutInMs: 30000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
  build: {
    extensions: [
      prismaExtension({
        schema: "prisma/schema.prisma",
        mode: "legacy",
      }),
      // Reads the deploy host's process.env and uploads the listed keys to
      // the Trigger.dev environment so the worker can access DB, Storage
      // and Gemini at runtime. The CLI auto-loads .env during deploy.
      syncEnvVars(async () => {
        const keys = [
          "DATABASE_URL",
          "DIRECT_URL",
          "GOOGLE_GENERATIVE_AI_API_KEY",
          "SUPABASE_URL",
          "SUPABASE_ANON_KEY",
          "SUPABASE_SERVICE_ROLE_KEY",
        ];
        const out: Record<string, string> = {};
        for (const k of keys) {
          const v = process.env[k];
          if (v) out[k] = v;
        }
        return out;
      }),
    ],
  },
});
