// 서버 액션·API 라우트를 운영 의존 없이 실제 코드 그대로 돌리기 위한 가짜 환경(학원 범위 테스트 전용).
// tsx 로 로드되는 .ts 모듈은 CommonJS 경로로 require 되므로 Module._resolveFilename 을 감싸
// prisma·세션·캐시 무효화·크레딧·AI 모듈을 가짜로 바꿔 끼운다. 운영 DB·네트워크 무접촉.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS 테스트 스텁(require 경로 가로채기용) */
"use strict";

const Module = require("node:module");
const path = require("node:path");

const STUBS = path.join(__dirname, "stubs");
const BY_REQUEST = {
  "@/lib/prisma": "prisma.cjs",
  "next/cache": "next-cache.cjs",
  "@/lib/auth": "auth.cjs",
  "@/lib/auth-student": "auth-student.cjs",
  "@/lib/app-events": "app-events.cjs",
  "@/lib/extraction/api-utils": "extraction-api-utils.cjs",
  "@/lib/credits": "credits.cjs",
  "@/lib/platform-api-costs": "platform-api-costs.cjs",
  "@/lib/ai": "ai-model.cjs",
  "@/lib/atlas-ai": "atlas-ai.cjs",
  ai: "ai-sdk.cjs",
};
// 경로 끝으로 가로채는 모듈(상대 경로 import) — AI 분석 본체.
const BY_SUFFIX = [["run-full-analysis", "run-full-analysis.cjs"]];

// 계기 음성테스트용: IDOR_MUTANT="<원본 절대경로>=><결함 주입 사본 절대경로>" 이면 원본 대신 사본을 로드한다
// (저장소 파일은 건드리지 않는다 — 사본은 tmp/ 에 두고 상대 import 를 절대경로로 바꿔 둔다).
const MUTANT = process.env.IDOR_MUTANT ? process.env.IDOR_MUTANT.split("=>").map((p) => path.normalize(p)) : null;

let installed = false;
function install() {
  if (installed) return;
  installed = true;
  const orig = Module._resolveFilename;
  Module._resolveFilename = function resolveWithStubs(request, parent, ...rest) {
    if (typeof request === "string" && BY_REQUEST[request]) return path.join(STUBS, BY_REQUEST[request]);
    const resolved = orig.call(this, request, parent, ...rest);
    for (const [suffix, stub] of BY_SUFFIX) {
      if (typeof request === "string" && request.endsWith(suffix)) return path.join(STUBS, stub);
    }
    if (MUTANT && path.normalize(resolved) === MUTANT[0]) return MUTANT[1];
    return resolved;
  };
}

const state = {
  db: null,
  staff: null,
  student: null,
  events: [],
  credits: [],
  // 가짜 ai SDK 의 streamText 가로채기(검사가 AI 문맥을 들여다볼 때만 건다 — kit.fresh() 가 매번 비운다).
  onStreamText: null,
};
globalThis.__idorEnv = state;

module.exports = { install, state };
