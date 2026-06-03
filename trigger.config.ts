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
  // Warm start 가속(v4) — 실행 사이 태스크 프로세스를 살려둔다. 모듈 스코프의
  // Prisma 커넥션(@/lib/prisma)과 Document AI 토큰 캐시(google-document-ai.ts)가
  // 다음 런에 재사용되므로, cold pod 에서 첫 DB 쿼리가 3~9초씩 걸리던 비용이
  // warm start 에선 ~28ms로 떨어진다(문제생성 warm 실측치와 동일). 추출은 페이지
  // 마다 pod 를 띄우고 드물게 돌아 항상 cold 였던 게 핵심 병목이었음.
  //   - 효과 범위: warm start 만 가속(긴 유휴 후 첫 cold run 은 불변).
  //   - 연속 잡/페이지 후 finalize/정상 운영에서 큰 이득.
  //   - maxExecutionsPerProcess: 메모리 누수 방지용 주기적 프로세스 재시작.
  experimental_processKeepAlive: {
    enabled: true,
    maxExecutionsPerProcess: 50,
    devMaxPoolSize: 10,
  },
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
          "QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS",
          "TRIGGER_WORKBENCH_QUESTION_QUEUE_NAME",
          "TRIGGER_WORKBENCH_ANALYSIS_QUEUE_NAME",
          "TRIGGER_TUTOR_PROGRAM_QUEUE_NAME",
          "TRIGGER_EXTRACTION_PAGE_QUEUE_NAME",
          "TRIGGER_EXTRACTION_ORCHESTRATOR_QUEUE_NAME",
          "TRIGGER_EXTRACTION_FINALIZE_QUEUE_NAME",
          "TRIGGER_WORKBENCH_QUESTION_CONCURRENCY",
          "TRIGGER_WORKBENCH_QUESTION_PER_ACADEMY",
          "TRIGGER_WORKBENCH_ANALYSIS_CONCURRENCY",
          "TRIGGER_WORKBENCH_ANALYSIS_PER_ACADEMY",
          "TRIGGER_TUTOR_PROGRAM_CONCURRENCY",
          "TRIGGER_TUTOR_PROGRAM_PER_ACADEMY",
          "TRIGGER_EXTRACTION_PAGE_CONCURRENCY",
          "TRIGGER_EXTRACTION_PAGE_PER_ACADEMY",
          "TRIGGER_EXTRACTION_ORCHESTRATOR_CONCURRENCY",
          "TRIGGER_EXTRACTION_ORCHESTRATOR_PER_ACADEMY",
          "TRIGGER_EXTRACTION_FINALIZE_CONCURRENCY",
          "TRIGGER_EXTRACTION_FINALIZE_PER_ACADEMY",
          "TRIGGER_WORKBENCH_QUESTION_MAX_ATTEMPTS",
          "TRIGGER_WORKBENCH_ANALYSIS_MAX_ATTEMPTS",
          "TRIGGER_TUTOR_PROGRAM_MAX_ATTEMPTS",
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
