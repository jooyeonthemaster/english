import { generateObject, type JSONValue } from "ai";
import { z } from "zod";

import {
  ATLAS_CLOUD_PROVIDER,
  atlasChatModel,
  atlasUsageWithCost,
  normalizeAtlasModelId,
} from "@/lib/atlas-ai";
import { buildAiGrammarErrorSchema } from "@/lib/question-ai-schemas-mc";

import type {
  QualityMode,
  QuestionGenerationUsageEvent,
} from "./run-question-generation-types";

/**
 * 어법 프리미엄 사다리 (P1) — GRAMMAR_ERROR × generationPlan=PREMIUM 전용 엔진.
 *
 * 계약서: docs/grammar-premium-ladder-spec.md §1·§3.
 * 원본(프롬프트 문구·사다리 정책): experiments/grammar-quality-20260714/x-strategies.ts
 * 의 w3GenerateSplit / w3Repair / w3ProObject (w3-triple-ladder, 결승 60지문 C·F 0).
 *
 * 구성:
 *  - 콜1 정답 생성(few-shot A등급 2개 + 미니멀 규칙 → answer-only 소형 스키마)
 *  - 콜2 미끼 추가(콜1 확정값 변경 금지 → 기존 GRAMMAR_ERROR 5밑줄 스키마)
 *  - 게이트 사다리: 하드블록 → 전체 재생성 ≤2회(반려 사유 주입) /
 *    소프트 error·배치위반 → 표적수리 1콜 후 수용(잔존 재생성 회송 금지 — 결승 롤백 실측)
 *  - 최종 수용 직전 question.difficulty = 요청 난이도 결정론 덮어쓰기
 *  - 파싱 실패는 동형 재시도 1회 흡수, reasoning-disable 형상 400 은 effort 폴백 1회
 *  - deadlineAt(fast 라우트 270s 벽)을 각 콜 직전 확인 — 부족하면 조기 give-up
 *
 * 결합 규칙(순환 의존 회피): 게이트 판정(후처리+validateQuestionQuality)은 호출자
 * (run-question-generation)가 finalize 콜백으로 주입한다. 이 모듈은 leaf 모듈
 * (atlas-ai·question-ai-schemas-mc)과 _lib 타입 파일에만 의존한다.
 *
 * never-fail: 이 함수는 LLM/게이트 실패를 던지지 않고 status="gave-up" 으로
 * 반환한다 — 호출자는 give-up 시 기존 경로(반려 풀/salvage 사다리)로 합류시킨다.
 *
 * ⚠️ 배포: run-question-generation 경유 3경로(fast/큐/트리거) 공통 코드 —
 * 변경 시 vercel 과 trigger.dev 워커를 동시에 재배포해야 한다.
 */

// ── 모델 ─────────────────────────────────────────────────────────────────────

const DEFAULT_GRAMMAR_PREMIUM_MODEL_ID = "google/gemini-3.1-pro-preview";

/**
 * 사다리 전 콜 공용 모델. preview 만료/교체 대비 env 오버라이드
 * (GRAMMAR_PREMIUM_MODEL_ID) — env 변경은 재배포가 있어야 반영된다.
 */
export const GRAMMAR_PREMIUM_MODEL_ID =
  process.env.GRAMMAR_PREMIUM_MODEL_ID?.trim() ||
  DEFAULT_GRAMMAR_PREMIUM_MODEL_ID;

/** 하드블록 전체 재생성 예산 (초기 생성 제외) — w3-triple-ladder 실측값 고정. */
export const GRAMMAR_PREMIUM_MAX_REGENS = 2;

// 단일 어법 문항(마커 5·오답해설 4)은 12k 로 충분 — prod premiumGrammarTokenCap 과 동일.
const LADDER_MAX_TOKENS = 12_000;

// 콜당 abort 상한 — grammar-too-large 폴백과 동일한 240s 하드캡. deadlineAt 이
// 있으면 잔여 예산으로 더 좁힌다.
const LADDER_CALL_TIMEOUT_MS = 240_000;

// 잔여 예산이 이보다 작으면 콜을 시작하지 않는다(조기 give-up) — give-up 후
// 기존 경로 폴백이 돌 시간을 남겨야 한다.
const LADDER_MIN_CALL_BUDGET_MS = 20_000;

// ── few-shot 예시 상수 (결승 A등급 실물 2문항 — 발췌 박제) ───────────────────
// 출처: experiments/grammar-quality-20260714/x/w3-triple-ladder/results-run1-100pct.jsonl
// 지문 요약만 요약이며, 밑줄·정답·근거 구간 인용은 전부 결승 산출물 원문 그대로다.

/** 결승 레코드 #22 — passageId ebsi_go3_20150409_A-q19, 정답 (D) Choose→Choosing 심음. */
export const GRAMMAR_PREMIUM_FEWSHOT_EXAMPLE_1 = `### 모범 예시 ① — 검증 A등급 실물
발문: 다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?
지문 요약: 'fine'처럼 의미가 빈약한 필러 단어 대신 'great'·'terrific' 같은 표현력 있는 단어를 골라 쓰라고 조언하는 글입니다.
밑줄 5개:
(A) frequently — pointCode (f) [미끼: 원문 그대로] · 근거 구간: "Some of the words we use most frequently are not expressive."
(B) what — pointCode (b) [미끼: 원문 그대로] · 근거 구간: "If someone asked you what you thought of a movie or your dinner,"
(C) to express — pointCode (k) [미끼: 원문 그대로] · 근거 구간: "'Fine' can be used to express satisfaction or disappointment."
(D) Choosing — pointCode (a) [정답: 비문 — 원형 "Choose"] · 근거 구간: "Choosing words that are more expressive, like 'great' or 'terrific' or 'wonderful' if you want to express pleasure"
(E) misunderstood — pointCode (e) [미끼: 원문 그대로] · 근거 구간: "These words won't be misunderstood."
정답: (D)
한줄 근거: (D) 정동사 vs 준동사 - 부사절을 제외한 주절 문장을 완성시킬 정동사의 필요 여부 판정`;

/** 결승 레코드 #25 — passageId ebsi_go3_20260507-q20, 정답 (B) appropriately→appropriate 심음. */
export const GRAMMAR_PREMIUM_FEWSHOT_EXAMPLE_2 = `### 모범 예시 ② — 검증 A등급 실물
발문: 다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?
지문 요약: 힘든 하루를 보낸 아이를 음식으로 달래면 정서적 필요가 제대로 충족되지 않는다는 메시지를 주므로, 아이의 감정적·신체적 상처를 먼저 돌본 뒤에만 간식을 허용하라는 글입니다.
밑줄 5개:
(A) feeling — pointCode (c) [미끼: 원문 그대로] · 근거 구간: "when we try to comfort a child with food rather than attend to their physical and emotional needs, we leave them feeling not understood."
(B) appropriate — pointCode (f) [정답: 비문 — 원형 "appropriately"] · 근거 구간: "they receive the message that their needs can't or won't be met appropriately."
(C) valid — pointCode (f) [미끼: 원문 그대로] · 근거 구간: "Consequently, they understand one of the following: that their needs are not valid;"
(D) shout — pointCode (k) [미끼: 원문 그대로] · 근거 구간: "or that they need to shout louder to be heard."
(E) tending — pointCode (c) [미끼: 원문 그대로] · 근거 구간: "If, after tending to your child's emotional and physical wounds you want to offer"
정답: (B)
한줄 근거: (B) 부사 vs 형용사 — 동사 수식 부사 판단`;

// w3FewshotBlock 프리앰블 원문 그대로.
const FEWSHOT_PREAMBLE =
  "다음은 우리 검증을 통과한 A등급 모범 예시 2개입니다. 밑줄 자리의 품질(5개 전부 구조적 판단 자리), 정답 오형의 명백성, 근거의 간결함을 이 수준으로 재현합니다. 예시의 지문·표현을 새 문항에 복사하지 않습니다.";

export function buildGrammarPremiumFewshotBlock(): string {
  return [
    FEWSHOT_PREAMBLE,
    "",
    GRAMMAR_PREMIUM_FEWSHOT_EXAMPLE_1,
    "",
    GRAMMAR_PREMIUM_FEWSHOT_EXAMPLE_2,
  ].join("\n");
}

// ── answer-only 소형 스키마 (콜1) — x-strategies answerOnlySchema 이식 ────────

const GRAMMAR_PREMIUM_POINT_CODES = [
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
] as const;

const POINT_LEGEND =
  "(a)정·준동사 (b)관계사 (c)분사능수동 (d)수일치 (e)능수동태 (f)형부자리 (g)대명사 (h)목적격보어 (i)병렬 (j)가정법 (k)to-v/v-ing (l)전치사vs.접속사 (m)비교구문";

export const grammarPremiumAnswerOnlySchema = z.object({
  direction: z.string().describe("발문 (한국어)"),
  answerDesign: z
    .string()
    .describe(
      "내부 설계 메모: 정답 문장 인용, 오류 변형(원형→오형), 그 자리에서 비문인 통사적 이유, 반증 검사(다른 해석으로 읽어도 비문인지) 결과를 한국어 3~5문장으로 적습니다.",
    ),
  answer: z.object({
    expression: z.string().describe("정답 자리의 원문 표현 (최소 문법 단위 1~3단어, 원문 그대로)"),
    errorExpression: z
      .string()
      .describe("지문에 심을 오류 형태 — expression 의 어간을 유지하고 형태만 틀리게 변형합니다."),
    correction: z.string().describe("올바른 표현 — 원문 그대로 (expression 과 동일)"),
    surroundingText: z
      .string()
      .describe("판단 근거가 되는 원문 구간 40~120자를 그대로 인용합니다."),
    pointCode: z
      .enum(GRAMMAR_PREMIUM_POINT_CODES)
      .describe(`어법 출제 포인트 코드. ${POINT_LEGEND}`),
  }),
  explanation: z
    .string()
    .describe("정답 해설 (한국어 합니다체, 150~300자): 왜 비문인지, 무엇으로 고치는지 서술합니다."),
});

export type GrammarPremiumAnswerStage = z.infer<typeof grammarPremiumAnswerOnlySchema>;

// 콜2·수리 공용 완성 스키마 — 기존 GRAMMAR_ERROR 계약(밑줄 5·정답 1) 그대로.
// 사다리는 5/1 형상 전용이다(결승 실측 형상) — 다른 마커 형상 요청은 호출자가
// 기존 경로로 유지한다.
const grammarPremiumFullSchema = buildAiGrammarErrorSchema(5, 1);

// ── 프롬프트 빌더 (w3GenerateSplit / w3Repair 문구 이식 — 미니멀 유지) ────────

// S3 "제약 최소" 계약 그대로 — 후보블록·체크리스트·규칙 목록 없음.
const MINIMAL_RULES = [
  "- 밑줄 5개: (A)~(E), 지문 등장 순서대로 부여합니다.",
  "- 정답 1개: 어법상 명백한 비문이어야 합니다 — 원문 표현을 틀린 형태로 변형해 심습니다.",
  "- 미끼 4개: 원문 그대로 두되, 학생이 실제로 고민할 자리여야 합니다.",
  "- 해설은 한국어 합니다체로 작성합니다.",
].join("\n");

function passageBlock(passage: string): string {
  return ["## 지문 (원문 — 표현을 인용할 때 한 글자도 바꾸지 않습니다)", passage].join("\n");
}

function rejectLine(rejectNote: string | null): string[] {
  return rejectNote
    ? [`- 직전 시도 반려: ${rejectNote} — 같은 결함이 재발하지 않도록 출제합니다.`]
    : [];
}

export interface GrammarPremiumPromptContext {
  passageContent: string;
  /** 요청 난이도 라벨 (BASIC | INTERMEDIATE | KILLER) */
  difficulty: string;
  /** 난이도 지시문 (run-question-generation 의 diffInstruction) */
  difficultyInstruction: string;
}

/** 콜1 — 정답 1개만 확정 (미끼 없음). */
export function buildGrammarPremiumAnswerPrompt(
  ctx: GrammarPremiumPromptContext,
  rejectNote: string | null,
): string {
  return [
    "당신은 대한민국 수능 영어 어법 문항 출제자입니다. 아래 지문으로 어법 문항의 '정답 1개'만 먼저 확정합니다. 미끼는 이 단계에서 만들지 않습니다.",
    "",
    buildGrammarPremiumFewshotBlock(),
    "",
    "- 정답 자리는 어법상 명백한 비문이 되도록 원문 표현의 형태만 틀리게 변형해 심습니다. 고치면 정확히 원문이 됩니다.",
    "- 해설은 한국어 합니다체로 작성합니다.",
    `- pointCode 범례: ${POINT_LEGEND}`,
    `- 난이도: ${ctx.difficulty} — ${ctx.difficultyInstruction}`,
    ...rejectLine(rejectNote),
    "",
    passageBlock(ctx.passageContent),
  ].join("\n");
}

/** 콜2 — 확정 정답 변경 금지, 미끼 4자리 추가해 완성 문항 출력. */
export function buildGrammarPremiumDecoyPrompt(
  ctx: GrammarPremiumPromptContext,
  answerStage: GrammarPremiumAnswerStage,
  rejectNote: string | null,
): string {
  return [
    "1차 설계에서 아래와 같이 정답 1개만 심은 어법 문항이 확정되었습니다. 이제 미끼 4자리를 추가해 밑줄 5개 완성 문항을 출력합니다.",
    "",
    buildGrammarPremiumFewshotBlock(),
    "",
    "## 확정 정답 (변경 금지)",
    JSON.stringify(
      {
        direction: answerStage.direction,
        answer: answerStage.answer,
        explanation: answerStage.explanation,
      },
      null,
      2,
    ),
    "",
    "## 요구사항",
    "- 정답 마커는 위 확정값의 expression·errorExpression·correction·pointCode·surroundingText 를 그대로 사용합니다. 라벨은 지문 등장 순서에 따라 부여합니다.",
    "- 미끼 4자리는 원문 그대로(isError=false)이며, 이 정답을 가리지 않으면서 저울질이 성립해야 합니다 — 정답과 다른 문장·다른 pointCode 를 우선하고, 각 미끼는 학생이 실제로 고민할 자리여야 합니다.",
    "- 미끼가 정답보다 더 틀려 보이면 안 됩니다 (정답 유일성 유지).",
    "- 해설·keyPoints 는 한국어 합니다체로 작성하고, 1차 해설을 기반으로 오답 위치 해설 4개를 추가합니다.",
    `- 난이도: ${ctx.difficulty} — ${ctx.difficultyInstruction}`,
    ...rejectLine(rejectNote),
    "",
    passageBlock(ctx.passageContent),
  ].join("\n");
}

// 수리 프롬프트의 결함 코드 한국어 주해 — w3 W3_DEFECT_GLOSS 이식.
const REPAIR_DEFECT_GLOSS: Record<string, string> = {
  "grammar-decoy-filler-span":
    "필러 미끼 — 장식 자리(단순 전치사·강조 does 등)입니다. 학생이 실제 고민할 구조 자리로 교체합니다.",
  "grammar-explanation-lint": "해설 린트 위반 — 해설 문구를 규정 형식에 맞게 수정합니다.",
  "grammar-category-mislabel": "pointCode 오태깅 — 실제 문법 포인트에 맞는 코드로 바로잡습니다.",
  "grammar-keypoint-choice-mismatch": "keyPoints 와 밑줄 설계가 불일치합니다 — keyPoints 를 바로잡습니다.",
  "grammar-answer-point-not-core": "정답 포인트가 핵심 어법 포인트가 아닙니다.",
  "grammar-nonstandard-terminology": "비표준 문법 용어 사용 — 표준 용어로 수정합니다.",
  "placement-answer-first-sentence":
    "정답 밑줄이 첫 문장에 있습니다 — 정답 자리를 더 뒤 문장으로 옮깁니다.",
  "placement-answer-relpos-lt-0.2":
    "정답 밑줄이 지문 앞 20% 구간에 있습니다 — 더 뒤의 자리로 옮깁니다.",
  "placement-same-sentence-multi-underline":
    "같은 문장에 밑줄이 2개 이상 몰렸습니다 — 밑줄을 서로 다른 문장으로 분산합니다.",
};

function repairDefectLines(codes: string[]): string {
  return codes
    .map((c) => `- ${c}: ${REPAIR_DEFECT_GLOSS[c] ?? "결정론 검사 반려 코드입니다."}`)
    .join("\n");
}

/** 수리 프롬프트에 동봉하는 후보 라인 상한 — 산더미 주입 금지(계약 §1). */
const REPAIR_CANDIDATE_LINE_CAP = 15;

/** 표적수리 1콜 — 지적된 부분만 고친 문항 전체 재출력. 후보 상위 15줄만 동봉. */
export function buildGrammarPremiumRepairPrompt(
  ctx: GrammarPremiumPromptContext,
  aiQuestion: Record<string, unknown>,
  defects: string[],
  repairCandidateLines?: string[],
): string {
  const candidateLines = (repairCandidateLines ?? [])
    .slice(0, REPAIR_CANDIDATE_LINE_CAP)
    .join("\n");
  return [
    "당신은 대한민국 수능 영어 어법 문항 검수·수리 담당자입니다. 아래 [현재 문항]이 결정론 검사에서 [결함 목록]으로 반려되었습니다. 지적된 부분만 고친 문항 전체를 동일 스키마로 다시 출력합니다.",
    "",
    "## 수리 규칙",
    "- 결함으로 지적되지 않은 정답 자리(expression·errorExpression·correction·pointCode)는 변경하지 않습니다.",
    "- 결함과 무관한 다른 밑줄·해설은 그대로 보존합니다.",
    "- 결함으로 지적된 자리만 교체·수정합니다. 미끼를 교체할 때는 원문 그대로(isError=false)의 다른 자리를 고릅니다.",
    MINIMAL_RULES,
    `- 난이도: ${ctx.difficulty} — ${ctx.difficultyInstruction}`,
    "",
    "## 결함 목록",
    repairDefectLines(defects),
    ...(candidateLines
      ? [
          "",
          "## 미끼 교체 재료 — 코드 탐지 상위 후보 (이 블록의 정답 선택 지시는 무시하고 미끼 재료로만 사용합니다)",
          candidateLines,
        ]
      : []),
    "",
    "## 현재 문항 (JSON)",
    JSON.stringify(aiQuestion, null, 2),
    "",
    passageBlock(ctx.passageContent),
  ].join("\n");
}

// ── 게이트 판정 계약 (호출자 주입) ───────────────────────────────────────────

export interface GrammarPremiumMarkerPosition {
  label: string;
  isError: boolean;
  relPos: number | null;
  sentenceIndex: number;
  found: boolean;
}

/**
 * 호출자가 주입하는 finalize 콜백의 반환 계약 — prod 후처리(processGrammarError
 * 계열) + validateQuestionQuality 를 감싼 결과. positions/answerRelPos 는
 * 선택 — 미제공 시 배치 소프트 검사만 생략되고 나머지 사다리는 동일하게 돈다.
 */
export interface GrammarPremiumFinalizeResult {
  /** 후처리(마커 재구성) 성공 여부 — 실패면 error 에 사유. */
  ok: boolean;
  error?: string;
  /** 후처리 완료본 (ok=true 일 때) */
  question?: Record<string, unknown>;
  /** validateQuestionQuality severity=error 코드 목록 */
  errors: string[];
  /** validateQuestionQuality severity=warning 코드 목록 */
  warnings: string[];
  answerRelPos?: number | null;
  positions?: {
    markers: GrammarPremiumMarkerPosition[];
    notFoundCount: number;
  } | null;
}

// 전체 재생성을 트리거하는 하드블록 코드 (finalize.errors 기준) — w3 이식.
const HARD_BLOCK_CODES = new Set([
  "grammar-error-not-mutated",
  "grammar-answer-nonword-forced",
  "grammar-obvious-noun-what-relative",
  "grammar-killer-answer-point-repeated",
]);

function hardBlocksOf(fin: GrammarPremiumFinalizeResult): string[] {
  // 후처리 자체가 실패하면 마커를 심지 못한 것 — marker notFound 계열로 취급.
  if (!fin.ok) return [`finalize-failed:${(fin.error ?? "unknown").slice(0, 80)}`];
  const out = fin.errors.filter(
    (c) => HARD_BLOCK_CODES.has(c) || c.includes("render-marker-count"),
  );
  if (fin.positions && fin.positions.notFoundCount > 0) {
    out.push(`marker-not-found(${fin.positions.notFoundCount})`);
  }
  return [...new Set(out)];
}

/** 하드블록이 아닌 error + 배치위반(첫문장 정답·relPos<0.2·동일문장 밑줄 2+) */
function softDefectsOf(fin: GrammarPremiumFinalizeResult): string[] {
  if (!fin.ok) return [];
  const out = fin.errors.filter(
    (c) => !HARD_BLOCK_CODES.has(c) && !c.includes("render-marker-count"),
  );
  const answer = fin.positions?.markers.find((m) => m.isError);
  if (answer && answer.found && answer.sentenceIndex === 0) {
    out.push("placement-answer-first-sentence");
  }
  if (
    fin.answerRelPos !== undefined &&
    fin.answerRelPos !== null &&
    fin.answerRelPos < 0.2
  ) {
    out.push("placement-answer-relpos-lt-0.2");
  }
  if (fin.positions) {
    const bySentence = new Map<number, number>();
    for (const m of fin.positions.markers) {
      if (m.sentenceIndex >= 0) {
        bySentence.set(m.sentenceIndex, (bySentence.get(m.sentenceIndex) ?? 0) + 1);
      }
    }
    if ([...bySentence.values()].some((n) => n >= 2)) {
      out.push("placement-same-sentence-multi-underline");
    }
  }
  return [...new Set(out)];
}

// ── 사다리 이력·콜 원장 타입 ─────────────────────────────────────────────────

export interface GrammarPremiumLadderEvent {
  action:
    | "regenerate"
    | "repair"
    | "repair-failed"
    | "repair-skipped"
    | "accept"
    | "give-up";
  attempt?: number;
  trigger?: string[];
  /** 이 조치로 사라진 코드 (해소 코드) */
  resolved?: string[];
  /** 조치 후에도 남은 코드 */
  remaining?: string[];
  error?: string;
}

/** 물리 콜 1회당 1행 — 실패 콜도 기록한다 (RCA "시간 블랙홀" 재발 금지). */
export interface GrammarPremiumLadderCall {
  purpose: string;
  modelId: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface GrammarPremiumLadderResult {
  status: "accepted" | "gave-up";
  /**
   * status=accepted: difficulty 동기화 완료된 최종 AI 응답 — 호출자는 이것을
   * 기존 후처리/솔버 게이트/수용 머신에 그대로 투입한다(finalize 는 판정 기록).
   */
  aiQuestion?: Record<string, unknown>;
  /**
   * status=gave-up: 마지막 후보 보존본(있다면, difficulty 동기화 완료) —
   * never-fail 계약: 호출자가 기존 반려 풀/salvage 사다리로 합류시킨다.
   */
  bestCandidate?: Record<string, unknown>;
  /** 마지막 finalize 판정 (후보가 있을 때) */
  finalize?: GrammarPremiumFinalizeResult;
  /** 콜1 산출물 (관측용) */
  answerStage?: Record<string, unknown>;
  giveUpReason?: string;
  ladder: GrammarPremiumLadderEvent[];
  calls: GrammarPremiumLadderCall[];
  regenerations: number;
  repairs: number;
  reasoningFallback: boolean;
  modelId: string;
  /** 모델이 출력했던 difficulty (동기화 전 값, 관측용) */
  modelDifficulty: string | null;
  /** 동기화로 값이 실제로 바뀌었는지 */
  difficultySynced: boolean;
}

export interface GrammarPremiumLadderInput extends GrammarPremiumPromptContext {
  /**
   * 게이트 판정 콜백 — 호출자가 prod 후처리 + validateQuestionQuality 를 감싸
   * 주입한다(순환 의존 회피). 동기/비동기 모두 허용.
   */
  finalize: (
    aiQuestion: Record<string, unknown>,
  ) => GrammarPremiumFinalizeResult | Promise<GrammarPremiumFinalizeResult>;
  /** fast 라우트 시간 벽 (epoch ms) — 각 콜 직전 잔여 예산 확인. */
  deadlineAt?: number;
  /** 콜별 원가 원장 — 물리 콜 1회당 1이벤트(실패 콜 포함, usage 는 성공 시만). */
  onModelUsage?: (event: QuestionGenerationUsageEvent) => void;
  /** usage 이벤트에 기록할 qualityMode (기본 "strict") */
  qualityMode?: QualityMode;
  /**
   * 표적수리 프롬프트에 동봉할 미끼 재료 후보 라인(코드 탐지 상위) —
   * 상위 15줄만 사용한다. 미제공 시 후보 블록 없이 수리한다.
   */
  repairCandidateLines?: string[];
  /** 실험/테스트용 모델 오버라이드 — 기본 GRAMMAR_PREMIUM_MODEL_ID. */
  modelId?: string;
}

// ── LLM 콜 (w3ProObject 이식: 파싱실패 동형재시도 1회 + reasoning 폴백) ───────

class GrammarPremiumDeadlineError extends Error {
  constructor(purpose: string) {
    super(`grammar-premium-ladder deadline budget exhausted before ${purpose}`);
    this.name = "GrammarPremiumDeadlineError";
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface LadderCallContext {
  modelId: string;
  difficulty: string;
  qualityMode: QualityMode;
  deadlineAt?: number;
  onModelUsage?: (event: QuestionGenerationUsageEvent) => void;
  calls: GrammarPremiumLadderCall[];
}

function computeAbortMs(deadlineAt?: number): number {
  if (!deadlineAt) return LADDER_CALL_TIMEOUT_MS;
  return Math.min(LADDER_CALL_TIMEOUT_MS, Math.max(1_000, deadlineAt - Date.now()));
}

async function fireOnce<T>(
  ctx: LadderCallContext,
  args: {
    schema: z.ZodType<T>;
    prompt: string;
    purpose: string;
    attempt: number;
    providerOptions?: Record<string, Record<string, JSONValue>>;
  },
): Promise<T> {
  if (ctx.deadlineAt && ctx.deadlineAt - Date.now() < LADDER_MIN_CALL_BUDGET_MS) {
    throw new GrammarPremiumDeadlineError(args.purpose);
  }
  const startedAt = Date.now();
  const normalizedModelId = normalizeAtlasModelId(ctx.modelId);
  const emitUsage = (usage: unknown) => {
    ctx.onModelUsage?.({
      phase: "question_generation",
      subType: "GRAMMAR_ERROR",
      qualityMode: ctx.qualityMode,
      difficulty: ctx.difficulty,
      generationPlan: "PREMIUM",
      usage,
      provider: ATLAS_CLOUD_PROVIDER,
      modelId: normalizedModelId,
      attempts: args.attempt,
      durationMs: Date.now() - startedAt,
    });
  };
  try {
    const res = await generateObject({
      model: atlasChatModel(ctx.modelId),
      schema: args.schema,
      prompt: args.prompt,
      maxOutputTokens: LADDER_MAX_TOKENS,
      ...(args.providerOptions ? { providerOptions: args.providerOptions } : {}),
      abortSignal: AbortSignal.timeout(computeAbortMs(ctx.deadlineAt)),
    });
    ctx.calls.push({
      purpose: args.purpose,
      modelId: normalizedModelId,
      ok: true,
      durationMs: Date.now() - startedAt,
    });
    emitUsage(atlasUsageWithCost(res));
    return res.object as T;
  } catch (e) {
    // 실패 콜도 원장과 콜 로그에 남긴다 — 성공콜만 기록하던 시간 블랙홀 방지.
    ctx.calls.push({
      purpose: `${args.purpose}#failed`,
      modelId: normalizedModelId,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: errorMessage(e).slice(0, 200),
    });
    emitUsage(undefined);
    throw e;
  }
}

/**
 * 논리 콜 1회 = 물리 콜 최대 2회.
 * 1) strict 스키마 호출 → 산발 파싱 실패("No object generated"/스키마 불일치)는
 *    동형 재시도 1회로 흡수 (pro preview 실측 — strict json_schema 금지 리스크).
 * 2) reasoning-disable 형상 400 거부(OR gemini 잠복 함정)는 reasoning_effort=low
 *    폴백 1회.
 */
async function callLadderModel<T>(
  ctx: LadderCallContext,
  args: { schema: z.ZodType<T>; prompt: string; purpose: string },
): Promise<{ object: T; reasoningFallback: boolean }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const object = await fireOnce(ctx, {
        schema: args.schema,
        prompt: args.prompt,
        purpose: attempt === 1 ? args.purpose : `${args.purpose}-parse-retry`,
        attempt,
      });
      return { object, reasoningFallback: false };
    } catch (e) {
      if (e instanceof GrammarPremiumDeadlineError) throw e;
      const msg = errorMessage(e);
      const parseFail =
        /no object generated|could not parse|did not match schema|type validation failed/i.test(
          msg,
        );
      if (parseFail && attempt === 1) continue;
      if (!parseFail && /reasoning|400/i.test(msg)) {
        const object = await fireOnce(ctx, {
          schema: args.schema,
          prompt: args.prompt,
          purpose: `${args.purpose}-reasoning-fallback`,
          attempt: attempt + 1,
          providerOptions: {
            [ATLAS_CLOUD_PROVIDER]: { reasoning_effort: "low" },
          },
        });
        return { object, reasoningFallback: true };
      }
      throw e;
    }
  }
  throw new Error(`grammar-premium-ladder unreachable (${args.purpose})`);
}

// ── 사다리 오케스트레이션 (w3-triple-ladder 이식) ────────────────────────────

export async function runGrammarPremiumLadder(
  input: GrammarPremiumLadderInput,
): Promise<GrammarPremiumLadderResult> {
  const modelId = input.modelId ?? GRAMMAR_PREMIUM_MODEL_ID;
  const calls: GrammarPremiumLadderCall[] = [];
  const ladder: GrammarPremiumLadderEvent[] = [];
  const ctx: LadderCallContext = {
    modelId,
    difficulty: input.difficulty,
    qualityMode: input.qualityMode ?? "strict",
    deadlineAt: input.deadlineAt,
    onModelUsage: input.onModelUsage,
    calls,
  };

  let regenerations = 0;
  let repairs = 0;
  let reasoningFallback = false;
  let rejectNote: string | null = null;
  let repairedThisCycle = false;
  let aiQuestion: Record<string, unknown> | undefined;
  let answerStage: Record<string, unknown> | undefined;
  let fin: GrammarPremiumFinalizeResult | undefined;

  const finish = (
    status: GrammarPremiumLadderResult["status"],
    giveUpReason?: string,
  ): GrammarPremiumLadderResult => {
    // difficulty 동기화 (패치2): 최종 수용 직전 요청 난이도로 결정론 덮어쓰기 —
    // 모델 출력 difficulty 불일치가 B 강등 최다 사유였다. give-up 보존본에도
    // 동일 적용해 반려 풀 합류본의 라벨을 요청값으로 맞춘다.
    let question = aiQuestion;
    let modelDifficulty: string | null = null;
    let difficultySynced = false;
    if (question) {
      modelDifficulty =
        typeof question.difficulty === "string" ? question.difficulty : null;
      difficultySynced = question.difficulty !== input.difficulty;
      question = { ...question, difficulty: input.difficulty };
    }
    return {
      status,
      aiQuestion: status === "accepted" ? question : undefined,
      bestCandidate: status === "gave-up" ? question : undefined,
      finalize: fin,
      answerStage,
      giveUpReason,
      ladder,
      calls,
      regenerations,
      repairs,
      reasoningFallback,
      modelId: normalizeAtlasModelId(modelId),
      modelDifficulty,
      difficultySynced,
    };
  };

  const giveUp = (reason: string, trigger?: string[]): GrammarPremiumLadderResult => {
    ladder.push({
      action: "give-up",
      trigger,
      remaining: fin ? [...hardBlocksOf(fin), ...softDefectsOf(fin)] : undefined,
      error: reason,
    });
    return finish("gave-up", reason);
  };

  const giveUpReasonOf = (e: unknown): string =>
    e instanceof GrammarPremiumDeadlineError
      ? `deadline: ${e.message}`
      : `llm-error: ${errorMessage(e).slice(0, 200)}`;

  /** 미끼분리 2단 생성 (콜1 정답만 → 콜2 미끼 4개) + finalize. */
  const generateSplit = async (): Promise<void> => {
    const s1 = await callLadderModel(ctx, {
      schema: grammarPremiumAnswerOnlySchema,
      prompt: buildGrammarPremiumAnswerPrompt(input, rejectNote),
      purpose: "answer-only",
    });
    reasoningFallback = reasoningFallback || s1.reasoningFallback;
    const s2 = await callLadderModel(ctx, {
      schema: grammarPremiumFullSchema,
      prompt: buildGrammarPremiumDecoyPrompt(input, s1.object, rejectNote),
      purpose: "add-decoys",
    });
    reasoningFallback = reasoningFallback || s2.reasoningFallback;
    answerStage = s1.object;
    aiQuestion = s2.object;
    fin = await input.finalize(aiQuestion);
  };

  // 초기 생성 — 실패(딜레드라인/LLM)는 조기 give-up: 호출자가 기존 경로로 폴백.
  try {
    await generateSplit();
  } catch (e) {
    return giveUp(giveUpReasonOf(e));
  }

  for (;;) {
    const hard = hardBlocksOf(fin!);
    if (hard.length > 0) {
      if (regenerations >= GRAMMAR_PREMIUM_MAX_REGENS) {
        return giveUp("hard-block-budget-exhausted", hard);
      }
      regenerations++;
      repairedThisCycle = false;
      rejectNote = hard.join(", ");
      try {
        await generateSplit();
      } catch (e) {
        // 재생성 실패 — 남은 후보는 하드블록 상태이므로 give-up(보존본 동반).
        return giveUp(giveUpReasonOf(e), hard);
      }
      const after = [...hardBlocksOf(fin!), ...softDefectsOf(fin!)];
      ladder.push({
        action: "regenerate",
        attempt: regenerations,
        trigger: hard,
        resolved: hard.filter((c) => !after.includes(c)),
        remaining: after,
      });
      continue;
    }

    const soft = softDefectsOf(fin!);
    if (soft.length > 0 && !repairedThisCycle) {
      repairedThisCycle = true;
      repairs++;
      try {
        const rep = await callLadderModel(ctx, {
          schema: grammarPremiumFullSchema,
          prompt: buildGrammarPremiumRepairPrompt(
            input,
            aiQuestion!,
            soft,
            input.repairCandidateLines,
          ),
          purpose: "repair",
        });
        reasoningFallback = reasoningFallback || rep.reasoningFallback;
        aiQuestion = rep.object;
        fin = await input.finalize(aiQuestion);
        const after = [...hardBlocksOf(fin), ...softDefectsOf(fin)];
        ladder.push({
          action: "repair",
          trigger: soft,
          resolved: soft.filter((c) => !after.includes(c)),
          remaining: after,
        });
      } catch (e) {
        // 표적수리는 기회 조치 — 실패해도 수리 전 문항(하드블록 없음)을 버리지 않는다.
        if (e instanceof GrammarPremiumDeadlineError) {
          ladder.push({
            action: "repair-skipped",
            trigger: soft,
            remaining: soft,
            error: "deadline",
          });
        } else {
          ladder.push({
            action: "repair-failed",
            trigger: soft,
            remaining: soft,
            error: errorMessage(e).slice(0, 200),
          });
        }
      }
      continue; // 수리 후 하드블록이 남으면 위 재생성 분기로 진입한다.
    }

    // "수리 1콜 후 수용" — 잔존 error 의 재생성 회송은 금지(결승 롤백 실측:
    // 품질 델타 0에 원가만 +45~130%, 회송이 재생성 예산을 선점해 진짜 하드블록
    // 여력을 잠식).
    ladder.push({ action: "accept", remaining: [...new Set([...fin!.errors, ...soft])] });
    break;
  }

  return finish("accepted");
}
