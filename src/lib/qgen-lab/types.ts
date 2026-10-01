// qgen-lab 계약(클라·서버 공용, 순수 타입) — 26-09-25 어법 생성 모델 벤치
//   gemini-3.7-flash(프로덕션) vs openai/gpt-6-luna + jev(TypeSafe System One) 사전 출제 포인트 설계.
// 엔진(서버): src/app/api/dev/qgen-lab/_lib/*  ·  UI: src/app/(director)/director/dev/qgen-lab/*
// 이 파일은 계약의 정본이다. 필드를 바꾸면 엔진·UI·분석 스크립트(.tmp-qgen-lab-2609)를 함께 바꿔라.

import type { MdGrammarQuestion } from "@/lib/md-qgen/parser";

export type LabDifficulty = "KILLER" | "INTERMEDIATE" | "BASIC";

/** 생성 출력 계약.
 *  md        = 프로덕션 gemini md 계약(밑줄지문/원형·포인트/정답/고침/해설/오답) — parseMdGrammar 로 파싱.
 *  luna-json = 프로덕션 luna 레인 JSON 계약(LUNA_GRAMMAR_JSON_SCHEMA strict) — adaptLunaGrammarJson 으로 파싱. */
export type GenFormat = "md" | "luna-json";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface GenModelConfig {
  /** OpenRouter 모델 slug. 예: google/gemini-3.7-flash, openai/gpt-6-luna, openai/gpt-6-luna-pro */
  model: string;
  /** reasoning.effort. null 이면 reasoning 필드 생략. 프로덕션 md-stream 은 "high" 하드코딩. */
  effort: ReasoningEffort | null;
  /** max_tokens(사고+출력 공유). 프로덕션 14000. */
  maxTokens: number;
  /** provider.order 핀(allow_fallbacks:false). 프로덕션 luna = ["openai"], gemini = 미지정. */
  providerPin: string[] | null;
  format: GenFormat;
}

/** 사전 출제 포인트 설계(planner) — jev 가 무엇을 얼마나 강하게 정하는가. */
export type PlannerMode =
  | "none" // 계획 없음(프로덕션 그대로)
  | "soft" // 참고 블록(모델이 무시 가능 — 프로덕션 정답위치 넛지와 같은 탈출구 문구)
  | "hard"; // 교사 지정 포인트 블록 + 준수 게이트(프로덕션 teacherPoints 채널)

export interface PlannerSpec {
  /** planners/index.ts 레지스트리 키. "none" 이면 계획 단계 생략. */
  id: string;
  mode: PlannerMode;
  params?: Record<string, unknown>;
}

/** 생성 후 jev 검증(D10 계열). */
export interface VerifierSpec {
  id: "none" | "jev-d10";
  /** regenerate = 실패를 게이트 이슈로 올려 프로덕션 재생성 1회에 태움
   *  escalate   = 실패 시 escalateTo 모델로 1회 재생성
   *  flag       = 기록만(비차단, 지표용) */
  onFail: "regenerate" | "escalate" | "flag";
  params?: Record<string, unknown>;
}

export interface ArmConfig {
  /** 안정 ID(원장·분석 키). 예: K-G37, K-L6-high, K-G37+J-verify */
  id: string;
  /** 화면 라벨(한국어). */
  label: string;
  family: "gemini" | "luna";
  difficulty: LabDifficulty;
  gen: GenModelConfig;
  planner: PlannerSpec;
  verifier: VerifierSpec;
  /** verifier.onFail === "escalate" 일 때만 사용. */
  escalateTo?: GenModelConfig;
  /** 병렬 N개 생성 후 선별(best-of-N). 없으면 단일 생성. 게이트 통과본 중 selector 가 1개를 고른다. */
  sampling?: { n: number; selector: "jev-select" | "first-clean" };
  /** 구제 전략(RESCUE-SPEC §3) — 있으면 오케스트레이터가 플래너·1차·재생성·검증기 단계를 건너뛰고
   *  ENG/strategies/index.ts 레지스트리의 전략이 채택본을 낸다(판정·후처리·기록은 기존 그대로). */
  strategy?: StrategySpec;
  /** 이 팔이 검증하는 가설 한 줄. */
  hypothesis: string;
  /** 스크리닝/확정 단계 노출 여부 등 UI 그룹. */
  group: "baseline" | "luna-variant" | "jev" | "rescue";
}

export interface StrategySpec {
  /** strategies/index.ts STRATEGIES 키(icl | cx | icl+cx | crit …). */
  id: string;
  /** 전략 손잡이 + 공통 가드(maxUsd·softDeadlineMs, RESCUE-SPEC §6). */
  params?: Record<string, unknown>;
}

// ── 지문 ────────────────────────────────────────────────────────────────────

export interface LabPassage {
  id: string; // G-2027_09 | P-02 | custom-<hash>
  label: string;
  source: "gichul" | "prod" | "custom";
  text: string;
  words: number;
  /** 평가원 실물(있을 때만) — 심사·비교용. 생성 프롬프트에는 절대 넣지 않는다. */
  gold?: { numbered: string; ansNo: number; ansFrag: string; fix: string; frags: string[]; tier?: string } | null;
}

// ── 계획(planner) 산출 ─────────────────────────────────────────────────────

export interface PlanSite {
  /** 지문 축자 부분문자열(유일하게 찾아지도록 필요시 앞뒤 문맥 포함). */
  span: string;
  /** 밑줄로 그을 핵심 표현(span 안의 1~2단어). */
  core: string;
  sentenceIdx: number;
  role: "answer" | "decoy";
  /** 정답 자리일 때 제안 오형(없으면 모델 재량). */
  wrongForm?: string;
  /** 문법 범주(코드 a~m 또는 거친 범주명). */
  category?: string;
  /** 플래너 종합 점수(0~1, 높을수록 우선). */
  score: number;
  /** jev 원시 확률 등 근거(표시·분석용). */
  evidence?: Record<string, number | string>;
}

export interface PlannerPlan {
  plannerId: string;
  mode: PlannerMode;
  /** 순위 정렬된 정답 후보(soft 는 여러 개, hard 는 1개). */
  answerCandidates: PlanSite[];
  /** 순위 정렬된 미끼 후보. */
  decoyCandidates: PlanSite[];
  /** 프롬프트 extras 에 붙는 블록(soft). hard 는 teacherPoints 로 간다. */
  promptBlock: string;
  /** hard 모드: 프로덕션 teacherPoints 와이어 형식. */
  teacherPoints?: { text: string; unit: "word" | "phrase"; tag?: string; note?: string }[];
  ms: number;
  jevCalls: number;
  jevCostUsd: number;
  /** 후보 제안에 LLM 을 쓴 설계(D13)면 그 비용·시간. */
  llmCostUsd: number;
  llmMs: number;
  debug?: unknown;
}

// ── 검증(verifier) 산출 ────────────────────────────────────────────────────

export interface VerifyResult {
  verifierId: string;
  pass: boolean;
  /** 밑줄별 jev P(문법적으로 옳다) — 라벨 (A)~(E) 순. */
  perMark: { label: string; shown: string; pGrammatical: number }[];
  answerLabel: string;
  reason: string;
  ms: number;
  jevCostUsd: number;
}

// ── 생성 시도(attempt) · 실행 결과 ─────────────────────────────────────────

export interface AttemptRecord {
  n: number; // 1부터
  /** stage = 전략의 소형 LLM 콜(비평·수정·작가 등), assemble = 코드 조립 결과 가상 레코드(costUsd 0, model "assembler"). */
  kind: "gen" | "regen" | "escalate" | "stage" | "assemble";
  /** 전략 실행의 단계 라벨("draft#1", "regen", "crit" …). 기존 경로는 필드 없음. */
  stage?: string | null;
  model: string;
  provider: string | null;
  promptChars: number;
  promptSha1: string;
  /** 요청 시작 기준 ms. null = 발생 안 함. */
  ttfbMs: number | null;
  firstReasoningMs: number | null;
  firstContentMs: number | null;
  durationMs: number;
  finishReason: string | null;
  errorChunk: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  costUsd: number | null;
  /** 모델 원문(파싱 전, 설계메모 포함). */
  text: string;
  gateIssues: string[];
  /** 최종 채택 여부(프로덕션 규칙: 재생성은 이슈 수 ≤ 일 때만 채택). */
  adopted: boolean;
  /** 전송 오류(EMPTY_BODY·타임아웃 등)로 파싱까지 못 간 경우 메시지. */
  transportError?: string;
  /** 이 시도에 대한 jev 검증(검증기 팔만). RunResult.verify 는 채택본의 것. */
  verify?: VerifyResult | null;
  /** 실제 응답한 모델 slug(StreamOnceResult.model — 요청 slug 와 다를 수 있음). */
  servedModel?: string | null;
  /** OpenRouter generation id(비용·시간 사후 대조용). */
  generationId?: string | null;
}

export type RunStatus = "ok" | "gate_fail" | "error";

export interface RunResult {
  runId: string;
  batchId: string | null;
  armId: string;
  passageId: string;
  rep: number;
  /** 정답 위치 넛지 등 난수의 시드(같은 passage·rep 은 팔이 달라도 같은 값). */
  seed: number;
  status: RunStatus;
  startedAt: string;
  finishedAt: string;
  /** 서버 측 벽시계(계획+생성+재생성+검증 전부). */
  totalMs: number;
  planMs: number;
  verifyMs: number;
  attempts: AttemptRecord[];
  cost: { genUsd: number; jevUsd: number; llmPlanUsd: number; totalUsd: number };
  plan: PlannerPlan | null;
  verify: VerifyResult | null;
  /** best-of-N 선별 기록(sampling 팔만). candidates[i] 는 attempts 중 병렬 1차 시도 i 에 대응. */
  selection?: {
    selectorId: string;
    chosenAttemptN: number | null;
    candidates: { attemptN: number; gateClean: boolean; verifyPass: boolean | null; score: number | null; note?: string }[];
    ms: number;
    jevCostUsd: number;
  } | null;
  /** 구제 전략 기록(arm.strategy 팔만 — 기존 팔은 키 자체가 없다). */
  strategy?: StrategyRecord | null;
  /** 게이트 통과한 최종 문항(실패 시 마지막 파싱본). */
  question: MdGrammarQuestion | null;
  /** 후처리(postProcessQuestion) 산출 — 화면 렌더용. 실패 시 null. */
  display: Record<string, unknown> | null;
  /** validateQuestionQuality(비차단 기록). */
  qualityIssues: string[];
  /** 최종 반려 사유(gate_fail/error). */
  failReason: string | null;
  /** 랩 전용 지표(비차단). */
  labChecks: {
    planAnswerAdopted?: boolean | null; // 계획의 1순위 정답 자리를 실제 정답으로 썼나
    planSitesUsed?: number | null; // 계획 후보 중 밑줄로 쓰인 개수
    answerWordDelta?: number | null; // 오형-원형 단어 수 차(비차단)
    answerSentenceIdx?: number | null;
    // ── 구제 전략 지표(RESCUE-SPEC §3.1 — 전략이 채울 때만) ──
    t1Hits?: number | null; // 미끼 T1 린트 적중 수
    answerFamily?: string | null; // agreement | relative | finite | participle | proform | pronoun | adjadv | voice | other
    answerDepthCode?: "J" | "M" | "R" | null;
    memoAnswerDist?: number | null; // 설계메모가 밝힌 정답 단서 거리(단어)
    decoySelfCheck?: number | null; // cx 거울 점검줄의 "아니오" 수
  };
}

// ── 구제 전략 기록(RESCUE-SPEC §3.1) ──────────────────────────────────────────

export interface StrategyStage {
  name: string;
  /** 실행 시작(t0) 기준 ms. */
  startMs: number;
  ms: number;
  /** 이 단계 동안 늘어난 LLM·jev 지출(단계가 겹치면 겹친 만큼 중복 계상). */
  llmUsd: number;
  jevUsd: number;
  jevCalls: number;
  ok: boolean;
  note?: string;
}

export interface StrategyRecord {
  strategyId: string;
  params: Record<string, unknown>;
  stages: StrategyStage[];
  provenance?: { label: string; role: "answer" | "decoy"; from: string; start: number; end: number }[] | null;
  diagnosis?: {
    t1: number;
    dgMax: number | null;
    answerPBroke: number | null;
    answerDepth: "J" | "M" | "R" | null;
    flags: string[];
  } | null;
  repairs: { kind: "marker" | "decoy-swap" | "answer-regen" | "answer-menu" | "fill"; detail: string }[];
  residualFlags: string[];
  frm?: { itemScore: number; components?: Record<string, number> } | null;
  writer?: { calls: number; templated: number } | null;
  /** 폴백 사유(없으면 null). 전략 예외로 끝난 실행은 "error: …". */
  fallback: string | null;
  /** 자유 기록(시연 id·예산 건너뜀·jev 실패 등). */
  notes: string[];
  jevUsd: number;
  jevCalls: number;
}

// ── SSE 이벤트(프로덕션 md-stream 이름 유지 + 랩 전용 추가) ──────────────────

export type LabEvent =
  | { t: "meta"; runId: string; armId: string; passageId: string; rep: number; seed: number; startedAt: string }
  | { t: "plan"; plan: PlannerPlan }
  | { t: "attempt"; n: number; kind: AttemptRecord["kind"]; model: string; promptChars: number }
  | { t: "r"; d: string }
  | { t: "c"; d: string }
  | { t: "retry"; reason: string }
  | { t: "verify"; verify: VerifyResult }
  /** 구제 전략 단계 종료(소형 콜·비평·조립 — r/c 는 흘리지 않는다). */
  | { t: "stage"; name: string; ms: number; note?: string }
  | { t: "done"; result: RunResult }
  | { t: "error"; message: string; result?: RunResult };

/** POST /api/dev/qgen-lab/generate 요청 본문. */
export interface GenerateRequest {
  armId: string;
  passageId: string;
  /** passageId 가 custom 일 때만. */
  customText?: string;
  rep: number;
  batchId?: string | null;
}

// ── 배치(Aside 가 구동하는 대량 실행) ──────────────────────────────────────

export interface BatchManifest {
  id: string;
  title: string;
  armIds: string[];
  passageIds: string[];
  reps: number;
  /** 동시 실행 수(클라). */
  concurrency: number;
  /** interleave = (지문,rep) 마다 팔을 돌려가며(시간대 편향 상쇄). */
  order: "interleave" | "by-arm";
}

/** 클라가 잰 체감 시간(배치 원장에 서버 결과와 함께 기록). */
export interface ClientTiming {
  runId: string;
  batchId?: string | null;
  clickToMetaMs: number | null;
  clickToFirstReasoningMs: number | null;
  clickToFirstContentMs: number | null;
  clickToDoneMs: number | null;
}
