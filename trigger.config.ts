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
  runtime: "node-22",
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
          "ANTHROPIC_API_KEY",
          "GOOGLE_GENERATIVE_AI_API_KEY",
          "GEMINI_API_KEY",
          "GEMINI_MODEL",
          "GEMINI_QUESTION_THINKING_BUDGET",
          "GEMINI_QUESTION_TIMEOUT_MS",
          "GEMINI_QUESTION_MAX_RETRIES",
          "GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS",
          "TRIGGER_WORKBENCH_QUESTION_QUEUE_NAME",
          "TRIGGER_WORKBENCH_ANALYSIS_QUEUE_NAME",
          "TRIGGER_EXTRACTION_PAGE_QUEUE_NAME",
          "TRIGGER_EXTRACTION_ORCHESTRATOR_QUEUE_NAME",
          "TRIGGER_EXTRACTION_FINALIZE_QUEUE_NAME",
          "TRIGGER_WORKBENCH_QUESTION_CONCURRENCY",
          "TRIGGER_WORKBENCH_QUESTION_PER_ACADEMY",
          "TRIGGER_WORKBENCH_ANALYSIS_CONCURRENCY",
          "TRIGGER_WORKBENCH_ANALYSIS_PER_ACADEMY",
          "TRIGGER_EXTRACTION_PAGE_CONCURRENCY",
          "TRIGGER_EXTRACTION_PAGE_PER_ACADEMY",
          "TRIGGER_EXTRACTION_ORCHESTRATOR_CONCURRENCY",
          "TRIGGER_EXTRACTION_ORCHESTRATOR_PER_ACADEMY",
          "TRIGGER_EXTRACTION_FINALIZE_CONCURRENCY",
          "TRIGGER_EXTRACTION_FINALIZE_PER_ACADEMY",
          "TRIGGER_WORKBENCH_QUESTION_MAX_ATTEMPTS",
          "TRIGGER_WORKBENCH_ANALYSIS_MAX_ATTEMPTS",
          "TRIGGER_EXTRACTION_PAGE_MAX_ATTEMPTS",
          "TRIGGER_EXTRACTION_FINALIZE_MAX_ATTEMPTS",
          "GOOGLE_API_KEY",
          "SUPABASE_URL",
          "SUPABASE_ANON_KEY",
          "SUPABASE_SERVICE_ROLE_KEY",
          "SERPER_API_KEY",
          "BRAVE_SEARCH_API_KEY",
          "GOOGLE_CUSTOM_SEARCH_API_KEY",
          "GOOGLE_CUSTOM_SEARCH_CX",
          "ATLASCLOUD_API_KEY",
          "ATLASCLOUD_BASE_URL",
          "ATLASCLOUD_MODEL",
          "WEBTOON_IMAGE_SIZE",
          "WEBTOON_IMAGE_QUALITY",
          "WEBTOON_IMAGE_TIMEOUT_MS",
          "WEBTOON_IMAGE_MAX_ATTEMPTS",
          // Google Cloud Document AI (RECITATION-free OCR engine)
          "GOOGLE_DOC_AI_PROJECT_NUMBER",
          "GOOGLE_DOC_AI_LOCATION",
          "GOOGLE_DOC_AI_PROCESSOR_ID",
          "GOOGLE_DOC_AI_SERVICE_ACCOUNT_B64",
          "EXTRACTION_USE_DOCUMENT_AI",
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
