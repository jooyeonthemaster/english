// ============================================================================
// 통합 검수·수리 게이트 (26-07-20 차세대 이원 티어 — 캠페인 O199~O201 S3i 확정 스펙)
// ============================================================================
// 스탠다드 티어의 품질 축: 생성 콜(해설품질 계약 주입) 직후, 결정형 게이트를
// 통과한 후보를 flash3@high 1콜로 적대적으로 재파싱해 결함을 찾고, 결함이 있으면
// 고친 완제품을 받아 결정형 게이트로 재검증 후 채택한다. O201 실측(동일 채점자
// 정면비교): 이 구조(S3i)가 콘텐츠성 F 0/46 · 38원/문항 · 63s — E-gate 없는
// 스탠다드에서 프리미엄(2.2%)급 콘텐츠 품질에 도달한 확정 스펙이다.
//
//   - 검사 축 5개: ①정답 유일성(가리고 풀기+반박) ②선지 대입 문법검사/오답 밑줄
//     재파싱 ③해설 사실성(인용 실재·근거 짝) ④한국어 품질 ⑤유형 무결성(절단/변형).
//   - 수리본은 신뢰하지 않는다 — 호출자(run-question-generation)가 반드시
//     finalizeCandidate(후처리+결정형 게이트)를 재실행하고, 게이트 위반 시 원본을
//     유지한다(S3i FIXED_GATE_REJECTED 시맨틱 — 실측 그대로).
//   - 지문 텍스트 수정 금지(빈칸/마커 재조립은 서버 소관). 문항 본체(선지·정답)
//     수정은 허용하되 수정본 재검증 계약이 그대로 적용된다.
//   - never-fail: 게이트 자체 장애(타임아웃·파싱 실패)는 무판정 통과.
//   - 대상: 영어 객관식 유형(기본 집합 아래) — KO(국어)·서술형 제외. PREMIUM
//     플랜에서 E-gate 가 담당하는 유형은 호출자 훅 조건이 중복 방지한다.
//   - 원가: usage 는 onModelUsage 로 기존 usageEvents 원장에 합류한다.
// ============================================================================

import { z } from "zod";

import { ATLAS_STANDARD_QGEN_MODEL_ID } from "@/lib/atlas-ai";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import { QUESTION_GENERATION_RESEARCH_STAGES } from "@/lib/question-generation-research-runtime";
import { isQuestionGenerationAssignmentBudgetError } from "@/lib/atlas-production-assignment-fetch-boundary";
import {
  DEFAULT_EXPLANATION_VERIFY_GATE_TYPES,
  type ExplanationVerifyUsageResult,
} from "./explanation-verify-gate";

// 영어 객관식 기본 대상 집합 = E-gate 8유형(단일 소스에서 파생 — 수동 드리프트
// 방지) + 캠페인 실측 F 33% 였던 기타 객관식(콤보·순서·삽입·어휘·무관·요약MC·
// REFERENCE·어휘 3종). 서술형(무결성 게이트 담당)·KO(셔플 좌표계 — 호출자에서
// koMod 제외)는 비대상.
const DEFAULT_REVIEW_REPAIR_TARGET_TYPES: ReadonlySet<string> = new Set([
  ...DEFAULT_EXPLANATION_VERIFY_GATE_TYPES,
  "GRAMMAR_CHOICE_COMBO",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "REFERENCE",
  "SUMMARY_COMPLETE_MC",
  "IRRELEVANT",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
]);

function resolveReviewRepairTargetTypes(): ReadonlySet<string> | null {
  const raw = process.env.REVIEW_REPAIR_GATE_TYPES?.trim();
  if (!raw) return DEFAULT_REVIEW_REPAIR_TARGET_TYPES;
  if (raw.toUpperCase() === "ALL") return null;
  const parsed = raw
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);
  return parsed.length > 0 ? new Set(parsed) : DEFAULT_REVIEW_REPAIR_TARGET_TYPES;
}

/** 이 subType 이 통합 검수·수리 게이트 대상인지 — env REVIEW_REPAIR_GATE_TYPES 오버라이드("ALL" 허용). */
export function isReviewRepairGateTargetType(
  subType: string | null | undefined,
): boolean {
  if (!subType) return false;
  const types = resolveReviewRepairTargetTypes();
  return types === null || types.has(subType);
}

// 게이트 on/off — 기본 on. 운영 중 즉시 끌 수 있는 스위치(env REVIEW_REPAIR_GATE_MODE=off).
export function isReviewRepairGateEnabled(): boolean {
  return process.env.REVIEW_REPAIR_GATE_MODE?.trim().toLowerCase() !== "off";
}

// 검수리 콜 사고 강도 — S3i 실측은 high(gemini 콜 단위 opt-in 경로로 실림).
function resolveReviewReasoningEffort(): string {
  return process.env.REVIEW_REPAIR_REASONING_EFFORT?.trim() || "high";
}

// 남은 시간예산 최소치 — flash3@high 검수리 1콜은 실측 ~15~40s. 그 미만이면
// 판정을 건너뛰고 SKIPPED_BUDGET 로 표시한다(얇은 예산에서 abort→fail-open
// 침묵 출하 방지 — E-gate 와 동일 설계).
const DEFAULT_REVIEW_REPAIR_MIN_BUDGET_MS = 45_000;

function resolveMinBudgetMs(): number {
  const raw = process.env.REVIEW_REPAIR_MIN_BUDGET_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_REVIEW_REPAIR_MIN_BUDGET_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 생성 응답 봉투({questions: z.array(item)})에서 문항 item 스키마를 꺼낸다 —
 * 수리본(fixed question)의 구조 유효성을 provider 단에서 강제하기 위함
 * (question-repair 와 동일하게 원 생성 스키마를 재사용하는 계약). 봉투 형상이
 * 예상과 다르면 null — 호출자는 게이트를 건너뛴다(fail-open, 구조 미보장 수리
 * 채택 금지).
 */
function extractQuestionItemSchema(responseSchema: z.ZodType): z.ZodType | null {
  try {
    const shape = (responseSchema as z.ZodObject<z.ZodRawShape>).shape;
    let questions: unknown = shape?.questions;
    while (
      questions instanceof z.ZodOptional ||
      questions instanceof z.ZodDefault
    ) {
      questions = questions.unwrap();
    }
    if (questions instanceof z.ZodArray) {
      return questions.element as z.ZodType;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function axisTwoForType(subType: string): string {
  if (subType === "BLANK_INFERENCE") {
    return "선지 대입 문법검사 — 5개 선지 각각을 빈칸에 대입한 완전한 문장을 만들어 하나씩 문법성 판정(주어-동사 일치·품사 자리·잔여 구문과의 결합 포함). 하나라도 비문이면 결함.";
  }
  if (subType === "GRAMMAR_ERROR" || subType === "GRAMMAR_CHOICE_COMBO") {
    return "오답 밑줄/슬롯 각각이 원문 그대로이며 어법상 옳은지 개별 재파싱. 정답 자리의 오형은 논쟁 없이 확정적으로 비문인지 재확인.";
  }
  return "선지 전수 재파싱 — 각 선지가 발문 기준으로 성립/탈락하는 이유를 지문 근거와 대조해 하나씩 판정. 정답 외 선지가 방어 가능하면 결함.";
}

function axisFiveForType(subType: string): string {
  if (subType === "BLANK_INFERENCE") {
    return "빈칸 절단 건전성 — 잔여 의존 구문(트레일링 등위·고아 관계절)·문장 전체 삼킴 여부.";
  }
  if (subType === "GRAMMAR_ERROR") {
    return "변형 1개 원칙 — 지문의 나머지가 원문과 완전 동일한지(밑줄 표현 전부 원문 축자).";
  }
  return "유형 무결성 — 발문·필드 구조가 유형 규칙과 맞는지(순서/삽입은 분할·마커 정합, 무관문장은 번호 연속, 요약MC 는 빈칸 라벨 정합).";
}

const REVIEW_LOG_PREFIX = "REVIEW-REPAIR";

export interface RunReviewRepairGateInput {
  subType: string;
  /** 최종형 문항(후처리·결정형 게이트 통과본) — 학생 노출 표면 전체를 검수 대상으로 준다. */
  question: Record<string, unknown>;
  passage: string;
  generationPlan: QuestionGenerationPlan;
  /** 원 생성 응답 스키마(봉투) — 수리본 구조 강제를 위해 item 스키마를 추출해 재사용. */
  responseSchema: z.ZodType;
  researchParentCandidate?: Record<string, unknown>;
  deadlineAt?: number;
  onModelUsage?: (result: ExplanationVerifyUsageResult) => void;
}

export interface ReviewRepairGateResult {
  status:
    | "PASS"
    | "FIXED"
    | "FIX_REJECTED"
    | "SKIPPED_BUDGET"
    | "SKIPPED_SCHEMA"
    | "ERROR";
  /** verdict=FIXED 일 때 모델이 낸 수리본(생성 스키마 형상) — 호출자가 재-finalize 후 채택 판정. */
  fixedItem?: Record<string, unknown>;
  defects?: string[];
}

/**
 * 통합 검수·수리 1콜 — verdict PASS 면 원본 유지, FIXED 면 수리본을 반환한다.
 * 수리본 채택 여부는 호출자의 finalizeCandidate 재검증이 결정한다(이 모듈은
 * LLM 출력의 구조 유효성까지만 보장). 장애는 status "ERROR" 로 무판정 통과.
 */
export async function runReviewRepairGate(
  input: RunReviewRepairGateInput,
): Promise<ReviewRepairGateResult> {
  if (
    input.deadlineAt !== undefined &&
    input.deadlineAt - Date.now() < resolveMinBudgetMs()
  ) {
    return { status: "SKIPPED_BUDGET" };
  }
  const itemSchema = extractQuestionItemSchema(input.responseSchema);
  if (!itemSchema) {
    console.warn(
      `[${REVIEW_LOG_PREFIX}] cannot extract question item schema for ${input.subType}; skipping review gate.`,
    );
    return { status: "SKIPPED_SCHEMA" };
  }

  const reviewSchema = z.object({
    verdict: z.enum(["PASS", "FIXED"]),
    defectsFound: z.array(z.string().max(200)).max(12).default([]),
    question: itemSchema.optional(),
  });

  // 내부 메타(_ 접두)는 검수 대상 표면이 아니다 — 프롬프트에서 제거해 모델이
  // 메타를 에코하거나 그 값에 휘둘리지 않게 한다.
  const visibleQuestion = Object.fromEntries(
    Object.entries(input.question).filter(([key]) => !key.startsWith("_")),
  );
  // 형상 노이즈 원천 차단(프로덕션 실측: 저장 형상 Record 를 보고 "스키마 위반"
  // 결함을 반복 보고 → 불필요 FIXED): 오답해설을 출력 스키마와 같은 배열 형상으로
  // 변환해 보여준다. 프롬프트 지시만으로는 억제가 불완전했다.
  if (
    visibleQuestion.wrongOptionExplanations &&
    isRecord(visibleQuestion.wrongOptionExplanations)
  ) {
    visibleQuestion.wrongOptionExplanations = Object.entries(
      visibleQuestion.wrongOptionExplanations as Record<string, unknown>,
    ).map(([label, explanation]) => ({ label, explanation }));
  }

  const prompt = [
    "너는 수능 영어 문항의 최종 검수·수리 책임자다. 아래 완제품 문항을 적대적으로 재파싱해 결함을 찾고, 결함이 있으면 고친 완제품을 출력하라.",
    [
      "검사 축(전부 수행, 사고 과정에서 하나씩 명시적으로):",
      "①정답 유일성 — 정답을 가리고 직접 풀고, 타 선지/밑줄 각각에 대해 \"이것도 정답이 될 수 있는가\"를 반박 시도.",
      `②${axisTwoForType(input.subType)}`,
      "③해설 사실성 — 해설·오답해설의 모든 구조 주장(선행사·절 경계·품사·수식 관계·인과)을 실제 문장과 대조. 해설이 인용하는 영어 표현이 지문·선지·고친 형태에 실재하는지, 두 표현의 관계 서술이 실제 그 짝인지 확인. 틀린 근거로 맞는 결론을 내는 해설도 결함.",
      "④한국어 품질 — 존재하지 않는 단어(오타·비어)·깨진 조사·어투 혼용(합니다체 이탈) 검사.",
      `⑤${axisFiveForType(input.subType)}`,
    ].join("\n"),
    "수리 원칙: 본체(선지·정답)를 수정할 경우 반드시 수정본을 스스로 다시 풀어 유일성을 재확인하라. 지문 원문 텍스트는 절대 수정하지 마라. passageWithBlank·passageWithMarkers 같은 지문 전체 복사 필드는 출력하지 마라(서버가 재조립한다). 원문 인용 필드(originalExpression·markedExpressions 의 expression/correction 등)는 지문 축자여야 한다.",
    "형상 주의(중요): 입력 문항 JSON 은 저장 형상이라 출력 스키마와 다를 수 있다 — wrongOptionExplanations 가 {라벨: 문장} 객체인 것, 설계 필드(blankDesign·errorDesign 등)나 스키마의 일부 필드가 입력에 아예 없는 것은 전부 정상이며 결함이 아니다. 형상·필드 누락을 defectsFound 에 넣지 마라. 결함 판정은 오직 검사 축 ①~⑤의 내용(정답 유일성·문법·해설 사실성·한국어·유형 무결성)으로만 하고, 내용 결함이 없으면 반드시 {\"verdict\":\"PASS\"} 를 내라. FIXED 로 고칠 때만 출력 스키마 형상을 채워 내면 된다.",
    '출력: 결함이 없으면 {"verdict":"PASS","defectsFound":[]} 만. 결함이 있으면 {"verdict":"FIXED","defectsFound":["..."],"question":<고친 완제품(원 생성 스키마와 동일 형상, 문항 1개)>}.',
    `## 원지문\n${input.passage}`,
    `## 문항(완제품 JSON)\n${JSON.stringify(visibleQuestion)}`,
  ].join("\n\n");

  try {
    const result = await generateQuestionObject({
      schema: reviewSchema,
      prompt,
      // 검수리 콜은 플랜과 무관한 독립 검증 콜 — S3i 계약 모델(flash3)에 핀한다.
      // 호출자 플랜을 그대로 쓰면 PREMIUM 롤백 env(PREMIUM_QGEN_MODEL_ID=Claude)가
      // 검수리 콜까지 Claude strict 구조화 출력(Wave-3 전멸 실측 형상)으로 바꿔
      // 게이트가 침묵 무판정(ERROR)으로 죽는다. 롤백 노브: STANDARD_QGEN_MODEL_ID.
      generationPlan: "STANDARD",
      modelId: ATLAS_STANDARD_QGEN_MODEL_ID,
      logPrefix: REVIEW_LOG_PREFIX,
      maxTokens: 16_000,
      deadlineAt: input.deadlineAt,
      // S3i 계약: flash3 검수리는 사고 high 콜 단위 고정(전역 gemini env 미의존).
      reasoningEffort: resolveReviewReasoningEffort(),
      applyReasoningEffortToGemini: true,
      researchStage: {
        key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_SOLVER,
        purpose: "evaluation",
        derivationParentValue: input.researchParentCandidate,
      },
    });
    input.onModelUsage?.({
      usage: result.usage,
      provider: result.provider,
      modelId: result.modelId,
      attempts: result.attempts,
      durationMs: result.durationMs,
    });
    const verdict = result.object.verdict;
    const defects = result.object.defectsFound ?? [];
    if (verdict === "PASS") return { status: "PASS", defects };
    const fixed = result.object.question;
    if (!isRecord(fixed)) {
      // FIXED 인데 수리본이 없으면 판정 불능 — 원본 유지(무판정 통과와 동일 취급).
      return { status: "FIX_REJECTED", defects };
    }
    return { status: "FIXED", fixedItem: fixed, defects };
  } catch (error) {
    if (isQuestionGenerationAssignmentBudgetError(error)) throw error;
    console.warn(
      `[${REVIEW_LOG_PREFIX}] gate call failed; passing without verdict: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { status: "ERROR" };
  }
}
