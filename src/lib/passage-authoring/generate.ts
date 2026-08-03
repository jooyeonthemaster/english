import { APICallError, generateObject, type ModelMessage } from "ai";

import { googleGenerativeAI } from "@/lib/ai";
import {
  ATLAS_AUTHORING_MODEL_ID,
  ATLAS_CLOUD_PROVIDER,
  atlasUsageWithCost,
} from "@/lib/atlas-ai";

import {
  bridgeStubWarnings,
  computeCoverage,
  computePassageMetrics,
  extractVocabTermStats,
  extractVocabTerms,
} from "./metrics";
import {
  applyOffset,
  assignSkeletons,
  authoringSkeletonSeed,
  buildAuthoringSystemPrompt,
  buildAuthoringUserPrompt,
  selectAuthoringMaterialsWithBudget,
  summarizeMaterials,
  targetWordRange,
} from "./prompts";
import {
  authoredPassageSchema,
  GRADE_BAND_LABELS,
  PLAN_SKELETON_CODES,
  type AuthoredPassage,
  type AuthoringMaterial,
  type AuthoringRequest,
  type AuthoringResultItem,
  type PassageMetrics,
  type PassagePlan,
  type PassageSkeleton,
} from "./schema";

// ============================================================================
// AI 지문 생성 실행기 — 지문 1편(=크레딧 2)을 만드는 최소 단위.
//
// 호출부(잡 러너)는 이 함수를 편수만큼 돌리고, throw 된 편만 부분 환불한다.
// 따라서 이 파일의 판단 기준은 하나다: **크레딧을 태울 가치가 있는 결과인가.**
//  - 본문이 망가졌다(비영어·길이 폭주/붕괴) → throw. 재시도하거나 환불된다.
//  - 본문은 멀쩡한데 메타(한국어 요약·설명·plan)만 비었다 → throw 하지 않는다.
//    결정론적 폴백으로 채운다. 설명 한 줄 때문에 정상 지문을 버리고 과금하는 것이
//    가장 나쁜 결과다.
//
// 회귀 방지 계약
//  - 재시도는 이 루프에서만 관리한다(SDK maxRetries:0). 두 겹이면 과금이 곱으로 는다.
//  - **모델 호출은 편당 최대 2회다.** 2회차는 "재시도"이거나 "봉투 수리"이며, 둘을
//    동시에 쓰지 않는다(더하면 6편 배치가 250s 예산을 넘긴다 — 아래 예산 계산 참조).
//  - deadlineAt(상위 시간예산)을 넘겨서는 새 호출을 하지 않는다. 라우트가 죽으면
//    선차감된 크레딧의 환불 트랜잭션까지 함께 죽는다.
//  - usedMaterialIds 는 모델에게 묻지 않는다. selectAuthoringMaterialsWithBudget() 가
//    실제로 프롬프트에 실은 자료 id 를 그대로 쓴다(환각 근거 표시 차단).
//  - metrics/coverage 도 모델에게 묻지 않는다. metrics.ts 가 본문에서 계산한다.
//  - **페이지 이미지 첨부는 assignment scope 밖이라 예산 게이트
//    (ASSIGNMENT_BUDGET_NON_TEXT_INPUT, question-generation-assignment-budget-policy.ts)
//    대상이 아니다.** run-job.ts 는 그 scope 를 열지 않기 때문이다(scopeStorage 미사용).
//    **이 배선을 문제 생성 경로에 그대로 이식하지 말 것** — 거기서는 같은 코드가
//    비텍스트 입력 차단에 걸리거나, 더 나쁘게는 게이트를 우회하게 된다.
// ============================================================================

/** 생성 모델 — OpenRouter 경유 gemini flash 계열. env 핀은 atlas-ai.ts 에서 해석된다. */
export const AUTHORING_MODEL_ID: string = ATLAS_AUTHORING_MODEL_ID;

// ── 콜 단위 추론(reasoning) ─────────────────────────────────────────────────
// providerOptions 가 없으면 atlas-ai.ts 의 gemini 분기 기본값
// (atlasReasoningEffortFor → "none" → { reasoning:{enabled:false} })이 그대로 실려,
// 3.6-flash 가 **사고 없이** 첫 토큰부터 논증문을 즉흥 생성한다. 그러면 논지가 먼저
// 정해지고 문장이 그 논지에 복무하는 글이 아니라, 앞 문장에 그럴듯한 다음 문장을
// 붙이는 산문이 나온다 — 오너가 말한 "기계적"의 물리적 원인이다.
//
// ⚠️ 왜 high 가 아니라 low 인가 — 26-07-25 실측(scripts 프로브, google/gemini-3.6-flash).
// 처음에 이 값을 "high" 로 두면서 "이 콜의 실질 출력은 800토큰대라 사고 예산이 출력
// 예산을 잠식할 여지가 거의 없다"고 적었다. **그 추론이 틀렸다.** reasoning 토큰은
// exclude:true 로 응답 본문에 안 실릴 뿐 completion 예산을 그대로 먹는다:
//
//   effort   자료없음(prompt 2.4k자)          자료있음(prompt 18.4k자)
//   high     40.8s / reasoning 6,006 / $0.057  50.8s·54.0s 모두 **실패**
//                                              (AI_NoObjectGeneratedError:
//                                               could not parse the response
//                                               — 240s 를 줘도 실패. 시간이
//                                               아니라 8,000 캡을 reasoning 이
//                                               태워 JSON 이 잘린 것)
//   medium   33.8s / reasoning 3,672 / $0.039  43.1s / reasoning 5,278 / 160w
//   low      11.4s / reasoning 1,610 / $0.023  4.5s·12.9s / 121~148w
//   none      5.2s / reasoning     0 / $0.011  106w (목표 165 대비 -36%)
//
// 판정: none 은 분량이 무너지고(사고가 분량 준수에 실제로 기여한다), high 는 자료를
// 붙이는 순간 구조적으로 실패하며 원가도 편당 $0.057(≈79원)로 크레딧 2 매출
// (146~264원)의 30~54% 를 먹는다. medium 은 43s 라 1차 60s·2차 40s 예산에 너무
// 붙는다. **low 가 유일하게 빠르고·싸고·분량을 지킨다.**
//
// 사용자가 본 "생성 시간이 초과됐습니다" 의 경로: 1차 콜이 ~50s 만에 파싱 실패 →
// 2차가 더 짧은 타임아웃을 받아 abort → toUserErrorMessage 의 /abort/ 분기가
// /no object generated/ 분기보다 먼저 걸린다. 증상은 타임아웃, 원인은 토큰 고갈이다.
//
// 이 값을 올리려면 **반드시 자료를 붙인 조건으로 먼저 재라.** 프롬프트가 커질수록
// reasoning 도 함께 늘어 같은 캡을 더 빨리 태운다.
//
// 배선 주의: 반드시 camelCase `reasoningEffort` 여야 한다. snake_case 로 넣으면
// openai-compatible getArgs 가 스키마 밖 키를 스프레드한 뒤
// `reasoning_effort: compatibleOptions.reasoningEffort` 로 덮어써 undefined 가 된다
// (question-generation-llm.ts:140-172 실측 주석). camelCase 로 실으면 와이어의
// reasoning_effort 를 atlasReasoningRequestFor 가 requestedEffort 로 소비해
// { reasoning: { enabled:true, effort, exclude:true } } 가 된다 — 전역 env
// (OPENROUTER_GEMINI_REASONING_EFFORT)를 건드리지 않는 콜 단위 경로다.
/**
 * 이 리졸버가 낼 수 있는 값. 게이트웨이 와이어에 **그대로** 실리므로 표준 3종뿐이다.
 */
export type AuthoringReasoningEffort = "low" | "medium" | "high";

const REASONING_EFFORT_WHITELIST: readonly string[] = ["low", "medium", "high"];

/**
 * 비상 오버라이드 정규화 — **화이트리스트 밖 값은 무시하고 파생 로직으로 떨어뜨린다.**
 *
 * 왜 화이트리스트인가: 이 문자열 하나를 두 레인이 **서로 다른 방식으로** 소비한다.
 *   · JSON 레인   providerOptions.reasoningEffort → atlas-ai.atlasReasoningRequestFor
 *                 가 gemini 분기에서 "none" 을 { reasoning:{ enabled:false } } 로
 *                 **번역**해 준다(atlas-ai.ts:352-369).
 *   · 스트림 레인 게이트웨이 chat/completions body 에 { enabled:true, effort } 로
 *                 **직송**한다(passage-authoring/stream/route.ts — 사고 델타를
 *                 받아야 해서 exclude:false 가 필요하고, 그래서 공용 변환기를
 *                 쓰지 않는다).
 * 검증 없이 통과시키면 "none" 한 값으로 두 레인의 의미가 갈린다 — JSON 레인은
 * 사고를 끄고, 스트림 레인은 비표준 effort:"none" 을 실어 400 을 받거나 조용히
 * 무시된다. **장애 대응으로 이 env 를 켜는 바로 그 순간 한쪽 레인만 다르게
 * 깨지는 것**이 최악의 결과라, 범위 밖 값은 아예 없었던 것으로 본다.
 *
 * ⚠️ 사고를 **완전히 끄는 일**은 이 손잡이로 표현하지 않는다(그래서 "none" 은
 * 화이트리스트에 없다). 끄려면 레인 킬스위치와 **같은 축** — 이미 있는
 * PASSAGE_AUTHORING_STREAM=off 처럼 재빌드 없이 경로 자체를 바꾸는 env — 를 따로
 * 두어야 두 레인이 같은 의미로 꺼진다. effort 문자열에 끄기까지 태우면 "값의
 * 의미"와 "경로의 on/off"가 한 손잡이에 섞여 지금 같은 레인 격차가 다시 난다.
 */
export function normalizeReasoningEffortOverride(
  raw: string | undefined,
): AuthoringReasoningEffort | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  return REASONING_EFFORT_WHITELIST.includes(value)
    ? (value as AuthoringReasoningEffort)
    : null;
}

/**
 * 비상 오버라이드. **평소에는 비어 있어야 한다** — 값을 넣는 순간 아래 리졸버의
 * 입력 크기 판정이 통째로 무력화되어 26-07-25 사고(자료를 붙이면 JSON 절단)가
 * 그대로 재현된다. 장애 대응으로 전 요청을 "low" 로 눌러야 할 때만 쓴다.
 */
const AUTHORING_REASONING_OVERRIDE = normalizeReasoningEffortOverride(
  process.env.PASSAGE_AUTHORING_REASONING_EFFORT,
);

/**
 * 프롬프트 총량 임계(자). 이 위로는 medium 을 쓰지 않는다.
 *
 * 26-07-25 실측(google/gemini-3.6-flash, medium): 총 11.4k자 → 33.8s,
 * 총 27.4k자 → 43.1s. 기울기 약 0.58ms/자다. 1차 타임아웃 60s 에서 안전 여유
 * 10s 를 남기려면 약 39k자가 상한인데, 그 계산은 "재시도가 40s 를 받는다"는
 * 사실을 무시한 값이다 — 1차가 50s 를 쓰고 실패하면 2차는 반드시 abort 된다.
 * 그래서 1차가 30s 를 넘기지 않는 구간에서만 medium 을 허용한다.
 */
const MEDIUM_EFFORT_MAX_PROMPT_CHARS = 16_000;

/**
 * 이 콜에 쓸 사고 강도를 **요청에서 계산한다**(env 상수가 아니라).
 *
 * 왜 손잡이가 아니라 리졸버인가:
 *   26-07-25 사고의 원인은 "누가 값을 잘못 골랐다"가 아니라 **적정값이 요청마다
 *   다르다**는 것이었다. reasoning 토큰은 프롬프트가 커질수록 함께 늘고 같은
 *   completion 예산(maxOutputTokens)을 먹으므로, 자료 없는 요청에 맞는 값이
 *   자료 18k자짜리 요청에서는 JSON 을 잘라 버린다. 고정 손잡이는 그 사실을
 *   표현할 수 없다 — env·DB·UI 어디에 두든 "누군가 잘못 고를 수 있는 자리"를
 *   하나 만들 뿐이다. 입력에서 파생하면 그 실패 클래스 자체가 사라진다.
 *   (같은 이유로 문제 생성도 resolveQgenReasoningEffort(subType) 로 파생한다 —
 *    run-question-generation.ts:201. 이 파일은 그 관습을 따른다.)
 *
 * "high" 는 어떤 조건에서도 자동 선택하지 않는다. 실측에서 자료 없는 최소
 * 요청조차 40.8s / reasoning 6,006 토큰이었고, 60s 상한에서는 실패했다.
 *
 * 반환은 항상 low|medium|high 다(env 오버라이드 포함 — 위 정규화). 스트림 레인이
 * 이 값을 게이트웨이 와이어에 직송하므로 비표준 문자열이 새어 나가면 안 된다.
 */
export function resolveAuthoringReasoningEffort(args: {
  /** system + user 프롬프트 총 글자수. */
  promptChars: number;
  /** 첨부된 원본 페이지 이미지 수. */
  imageCount: number;
}): AuthoringReasoningEffort {
  if (AUTHORING_REASONING_OVERRIDE) return AUTHORING_REASONING_OVERRIDE;
  // 이미지가 붙으면 비전 디코딩분이 얹히는데 그 지연은 아직 실측이 없다.
  // 예산도 75s 로 늘어나 있어 여유가 있어 보이지만, 미실측 구간에서 사고를
  // 올리는 것이 바로 이번 사고의 방식이었다 — 재기 전까지는 낮은 쪽에 선다.
  if (args.imageCount > 0) return "low";
  if (args.promptChars > MEDIUM_EFFORT_MAX_PROMPT_CHARS) return "low";
  return "medium";
}

// ── 시간 예산 ───────────────────────────────────────────────────────────────
// 최악 계산: 6편 / AUTHORING_CONCURRENCY 3 = 2웨이브.
//   웨이브당 1차 75s(이미지 첨부 시) + 2차 40s = 115s → 총 230s < 250s
//   (AUTHORING_RUN_BUDGET_MS). 2차 호출을 "재시도 + 수리" 두 번으로 늘리면 여기서
//   바로 예산을 넘긴다 — 그래서 둘 중 하나만 쓴다.
/** 1차 시도 타임아웃(텍스트만). 지문 1편 + 한국어 메타는 사고 high 에서 보통 20~45s. */
const PRIMARY_TIMEOUT_MS = 60_000;
/** 페이지 이미지가 붙은 1차 시도 — 업로드·비전 디코딩분을 얹는다(실측 후 조정). */
const PRIMARY_WITH_IMAGES_TIMEOUT_MS = 75_000;
/** 2차 호출(재시도 또는 봉투 수리) 타임아웃 — 남은 예산을 아껴야 하므로 짧게. */
const SECONDARY_TIMEOUT_MS = 40_000;
/** 편당 모델 호출 상한. 1차 + (재시도 XOR 수리). */
const MAX_MODEL_CALLS = 2;
const RETRY_BACKOFF_MS = 800;
/** 이만큼도 남지 않았으면 새 호출을 시작하지 않는다(빈손 과금 방지). */
const MIN_ATTEMPT_MS = 8_000;

// ── 분량 게이트 ─────────────────────────────────────────────────────────────
// 예전 값(0.55~2.0)은 계약이라 부를 수 없었다 — 목표 150단어에 82~300단어가 전부
// "성공"으로 통과했고, 그동안 프롬프트는 ±15% 를 약속하고 있었다(이중장부).
// 지금은 두 단계다:
//   하드(여기)  0.6~1.6 밖 → throw. 재시도 또는 환불 대상.
//   소프트      targetWordRange(spec) 밖 → 아래 봉투 수리 1회 대상.
// 소프트 경계는 **프롬프트가 모델에게 말한 그 범위와 같은 함수**(targetWordRange)를
// 쓴다. 두 곳에서 따로 숫자를 적는 순간 이중장부가 되살아난다.
const MIN_WORD_RATIO = 0.6;
const MAX_WORD_RATIO = 1.6;

/** 생성 콜에 함께 실을 원본 페이지 이미지(하이브리드 판독). run-job 이 조달한다. */
export interface AuthoringPageImage {
  data: Buffer | Uint8Array;
  /** 예: "image/jpeg". 비면 image/jpeg 로 본다. */
  mediaType: string;
}

export interface AuthoringGenerationOutcome {
  /** id·index·status 는 호출부(잡 러너)가 붙인다 — 여기선 내용만 책임진다. */
  item: Omit<AuthoringResultItem, "id" | "index" | "status">;
  usage: unknown;
  modelId: string;
}

// ── 출력 정리 ───────────────────────────────────────────────────────────────

const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/** 모델이 본문을 ```fence``` 나 따옴표로 감싸 보내는 사고를 결정론적으로 되돌린다. */
function stripWrappers(text: string): string {
  let out = text.trim();
  const fence = out.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  if (fence) out = fence[1].trim();
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("“") && out.endsWith("”")) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

/**
 * 본문 첫 줄에 제목이 섞여 들어온 경우 제거한다("# Title" / "Title: …" / title 필드와
 * 동일한 줄 / 종결부호 없는 짧은 머리줄). 정상 지문의 첫 줄은 문단 전체라 마침표로
 * 끝나므로 오탐하지 않는다.
 */
function stripTitleLine(passage: string, title: string): string {
  const lines = passage.split("\n");
  if (lines.length < 2) return passage;
  const first = (lines[0] ?? "").trim();
  if (!first) return lines.slice(1).join("\n").trim();

  const bare = first
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/^(?:title|제목)\s*[:：]\s*/i, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
  if (!bare) return lines.slice(1).join("\n").trim();

  const isMarkedTitle =
    /^#{1,6}\s/.test(first) || /^(?:title|제목)\s*[:：]/i.test(first);
  const isSameAsTitle = Boolean(title) && normalize(bare) === normalize(title);
  const looksLikeHeadline =
    bare.length <= 80 &&
    !/[.!?…]["'”’)\]]*$/.test(bare) &&
    bare.split(/\s+/).filter(Boolean).length <= 12;

  if (isMarkedTitle || isSameAsTitle || looksLikeHeadline) {
    return lines.slice(1).join("\n").trim();
  }
  return passage;
}

/** 남은 마크다운 잔재 제거 + 개행 정규화. plain text 계약(schema §4)을 강제한다. */
function toPlainText(passage: string): string {
  return passage
    .replace(/\r\n?/g, "\n")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]{1,200})\*\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 본문이 영어인지 — 한국어로 써버리는 사고(자료가 한국어일 때 흔하다) 차단. */
function looksEnglish(text: string): boolean {
  const ascii = (text.match(/[A-Za-z]/g) || []).length;
  const hangul = (text.match(/[가-힣]/g) || []).length;
  if (ascii < 40) return false;
  return ascii > hangul;
}

// ── 결정론적 폴백 ───────────────────────────────────────────────────────────

function fallbackKoreanSummary(ctx: {
  topicLabel: string;
  title: string;
  request: AuthoringRequest;
  words: number;
}): string {
  const subject = ctx.topicLabel || ctx.title;
  const level = GRADE_BAND_LABELS[ctx.request.spec.gradeBand];
  return `${subject ? `'${subject}' 소재의 ` : ""}${level} 수준 영어 지문 (${ctx.words}단어)`;
}

function fallbackRationale(ctx: {
  request: AuthoringRequest;
  materials: AuthoringMaterial[];
}): string {
  const level = GRADE_BAND_LABELS[ctx.request.spec.gradeBand];
  const head = `${level} 수준, 목표 ${ctx.request.spec.targetWords}단어 설정으로 새로 작성한 지문입니다.`;
  const body = ctx.materials.length
    ? ` 첨부하신 자료 ${ctx.materials.length}건(${summarizeMaterials(ctx.materials)})을 반영했습니다.`
    : ` 첨부 자료 없이 요청 내용만으로 작성했습니다.`;
  return `${head}${body} (AI가 설명을 비워 자동으로 채운 문구입니다.)`;
}

const PLAN_LINE_LIMIT = 300;

const planLine = (value: unknown): string =>
  typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, PLAN_LINE_LIMIT)
    : "";

/**
 * 모델이 본문보다 먼저 적은 설계를 검증한다.
 *  - skeleton 은 카탈로그 코드여야 한다. 아니면 **이 편에 배정된 골격**으로 되돌린다
 *    (결정론 폴백) — 결과 카드의 골격 뱃지와 실제 배분이 어긋나면 안 된다.
 *  - grounding 은 a/b/c 만.
 *  - **비어도 절대 throw 하지 않는다.** plan 은 메타 필드다. 설계 한 줄이 비었다고
 *    멀쩡한 지문을 버리고 크레딧을 태우는 것이 가장 나쁜 결과다(위 박스 주석).
 *    전 서술 칸이 비면 undefined 를 돌려 결과 카드가 빈 plan 블록을 그리지 않게 한다.
 */
function finalizePlan(
  raw: AuthoredPassage["plan"] | undefined,
  assignedSkeleton: Exclude<PassageSkeleton, "AUTO">,
): PassagePlan | undefined {
  // ⚠️ **배정된 골격이 이긴다.** 옛 코드는 모델이 보낸 코드가 카탈로그 안이기만 하면
  //   그걸 그대로 실었는데, 그러면 서버가 S4 를 지시했어도 모델이 "S1" 이라고 적는
  //   순간 카드가 S1 을 표시한다 — 이 함수 주석이 "결과 카드의 골격 뱃지와 실제
  //   배분이 어긋나면 안 된다"고 못박은 바로 그 상태다(옛 구현은 모델 코드가
  //   **무효일 때만** 배정으로 되돌려서 의도를 절반만 지켰다).
  //   실제로 이 구멍 때문에 "골격 씨앗이 먹혔는가"를 화면으로 확인할 수 없었다.
  const rawSkeleton = planLine(raw?.skeleton).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const skeleton = assignedSkeleton;
  if (
    (PLAN_SKELETON_CODES as readonly string[]).includes(rawSkeleton) &&
    rawSkeleton !== assignedSkeleton
  ) {
    // 화면에는 얹지 않는다(선생님에게 S 코드 불일치는 소음이다). 다만 모델이 지시된
    // 골격을 무시했다는 사실은 프롬프트 준수 신호라 로그에는 반드시 남는다.
    console.warn(
      `[PASSAGE-AUTHORING] skeleton mismatch — assigned ${assignedSkeleton}, model reported ${rawSkeleton}`,
    );
  }

  const groundingRaw = planLine(raw?.grounding).toLowerCase();
  const groundingMatch = groundingRaw.match(/\b([abc])\b/);
  const grounding = groundingMatch ? groundingMatch[1] : groundingRaw.slice(0, 40);

  const thesis = planLine(raw?.thesis);
  const warrantA = planLine(raw?.warrantA);
  const warrantB = planLine(raw?.warrantB);
  const turn = planLine(raw?.turn);
  const closingMove = planLine(raw?.closingMove);

  if (!thesis && !warrantA && !warrantB && !turn && !closingMove) return undefined;
  return { skeleton, grounding, thesis, warrantA, warrantB, turn, closingMove };
}

// ── 측정 봉투(envelope) ─────────────────────────────────────────────────────
//
// metrics.ts 가 이미 평균/최장 문장 길이·문단 수를 계산해 놓고도 품질 루프에
// 연결돼 있지 않았다 — 중1 설정에 고3 문장이 나와도 통과했다. 봉투는 프롬프트가
// 모델에게 말한 수치(prompts.applyOffset / targetWordRange)와 **같은 원본**을 쓴다.

interface PassageEnvelope {
  avgLo: number;
  avgHi: number;
  longestHi: number;
  wordLo: number;
  wordHi: number;
  /** 허용 문단 수 상한. 0 이면 검사하지 않는다(실용문은 편지·공지의 블록 배치 유지). */
  maxParagraphs: number;
}

function passageEnvelope(request: AuthoringRequest): PassageEnvelope {
  const spec = request.spec;
  const params = applyOffset(spec.gradeBand, spec.lexical, spec.syntax);
  const { low, high } = targetWordRange(spec);
  // 절대규칙 2 와 한 쌍이다: 기본은 ONE unbroken paragraph, 실용문은 자유,
  // 300단어 이상 서술문만 2블록까지.
  const maxParagraphs =
    spec.genre === "PRACTICAL"
      ? 0
      : spec.genre === "NARRATIVE" && spec.targetWords >= 300
        ? 2
        : 1;
  return {
    avgLo: params.avgLo,
    avgHi: params.avgHi,
    longestHi: params.longestHi,
    wordLo: low,
    wordHi: high,
    maxParagraphs,
  };
}

/** 위반 문구는 그대로 수리 프롬프트에 실린다 — 영어·측정치 명시. */
function envelopeViolations(
  metrics: PassageMetrics,
  env: PassageEnvelope,
): string[] {
  const out: string[] = [];
  if (metrics.words < env.wordLo) {
    out.push(
      `the passage is ${metrics.words} words, under the required ${env.wordLo}-${env.wordHi}`,
    );
  } else if (metrics.words > env.wordHi) {
    out.push(
      `the passage is ${metrics.words} words, over the required ${env.wordLo}-${env.wordHi}`,
    );
  }
  if (metrics.avgSentenceWords > env.avgHi) {
    out.push(
      `mean sentence length ${metrics.avgSentenceWords} exceeds the allowed ${env.avgLo}-${env.avgHi}`,
    );
  } else if (metrics.sentences > 0 && metrics.avgSentenceWords < env.avgLo) {
    out.push(
      `mean sentence length ${metrics.avgSentenceWords} is below the allowed ${env.avgLo}-${env.avgHi}`,
    );
  }
  if (metrics.longestSentenceWords > env.longestHi) {
    out.push(
      `one sentence runs ${metrics.longestSentenceWords} words, over the ${env.longestHi}-word cap`,
    );
  }
  if (env.maxParagraphs > 0 && metrics.paragraphs > env.maxParagraphs) {
    out.push(
      `${metrics.paragraphs} paragraphs, but this passage must be ${env.maxParagraphs === 1 ? "ONE unbroken paragraph" : `at most ${env.maxParagraphs} blocks`}`,
    );
  }
  return out;
}

/**
 * 봉투 수리 프롬프트. **같은 지문을 다시 쓰게 하는 것**이지 새 지문을 시키는 게
 * 아니다 — 논지·전환·예시가 바뀌면 그건 수리가 아니라 두 번째 생성이고, 그러면
 * 편당 과금이 두 배가 되는 대신 얻는 게 없다.
 */
function buildRevisionPrompt(violations: string[]): string {
  return [
    "# REVISION PASS — your draft failed the measured envelope",
    "The server measured your passage and found:",
    ...violations.map((line) => `- ${line}`),
    "Rewrite the SAME passage — same thesis, same pivot, same example, same argument. Change only sentence boundaries, clause packing, and wording density until every measurement is inside the envelope. Do not shorten by deleting the concrete instantiation; split or merge sentences instead. Do not introduce a new topic, a new example, or a summary sentence. Return the full corrected JSON object.",
  ].join("\n");
}

// ── 검증·조립 ───────────────────────────────────────────────────────────────

/**
 * 모델 출력 → 결과 아이템. 본문이 쓸 수 없는 수준이면 throw 해서 재시도/환불로
 * 넘긴다. 메타 필드는 절대 throw 하지 않는다(위 박스 주석의 과금 원칙).
 */
function finalizeItem(
  raw: AuthoredPassage,
  ctx: {
    request: AuthoringRequest;
    materials: AuthoringMaterial[];
    skeleton: Exclude<PassageSkeleton, "AUTO">;
    perMaterialCharsSent: Record<string, { sent: number; total: number }>;
  },
): AuthoringGenerationOutcome["item"] {
  const title = stripWrappers(raw.title || "").slice(0, 120);
  const passage = toPlainText(stripTitleLine(stripWrappers(raw.passage || ""), title));

  if (!passage) {
    throw new Error("생성된 지문이 비어 있습니다. 다시 시도해주세요.");
  }
  if (!looksEnglish(passage)) {
    throw new Error("생성된 지문이 영어가 아닙니다. 다시 시도해주세요.");
  }

  const target = ctx.request.spec.targetWords;
  const metrics = computePassageMetrics(passage, target);
  const low = Math.floor(target * MIN_WORD_RATIO);
  const high = Math.ceil(target * MAX_WORD_RATIO);
  if (metrics.words < low || metrics.words > high) {
    throw new Error(
      `생성된 지문의 분량이 범위를 벗어났습니다 (${metrics.words}단어, 허용 ${low}~${high}). 다시 시도해주세요.`,
    );
  }

  // 분모 정직성: 대조 대상은 모델이 실제로 본 클리핑 사본에서 뽑고(보지도 못한 뒷부분
  // 단어까지 대조하면 커버리지가 부당하게 낮게 나온다), 분모 표시용 총 개수는
  // **클리핑 전 원본**에서 잰다("앞 200개만 대조했어요(전체 512개)").
  const originalTermStats = extractVocabTermStats(ctx.request.materials ?? []);
  const coverage = computeCoverage(passage, {
    vocabTerms: extractVocabTerms(ctx.materials),
    grammarPoints: raw.usedGrammarPoints ?? [],
    termsTotalDetected: originalTermStats.totalDetected,
    termsTruncated: originalTermStats.truncated,
  });

  const topicLabel = (raw.topicLabel || "").trim().replace(/\s+/g, " ").slice(0, 40);
  const koreanSummary = (raw.koreanSummary || "").trim().slice(0, 200);
  const rationale = (raw.rationale || "").trim().slice(0, 600);

  return {
    title: title || "AI 생성 지문",
    passage,
    koreanSummary:
      koreanSummary ||
      fallbackKoreanSummary({
        topicLabel,
        title,
        request: ctx.request,
        words: metrics.words,
      }),
    rationale:
      rationale ||
      fallbackRationale({ request: ctx.request, materials: ctx.materials }),
    topicLabel,
    plan: finalizePlan(raw.plan, ctx.skeleton),
    metrics,
    coverage,
    // 빈 다리 문장 통지 — 차단·재생성 없이 사실만 얹는다(metrics.ts §1-d).
    warnings: bridgeStubWarnings(passage),
    usedMaterialIds: ctx.materials.map((material) => material.id),
    perMaterialCharsSent: ctx.perMaterialCharsSent,
  };
}

// ── 실행 ────────────────────────────────────────────────────────────────────

/** 남은 시간예산 안에서 이번 시도에 줄 타임아웃. 예산이 이미 없으면 최소치로 한 번은 친다. */
function attemptTimeoutMs(base: number, deadlineAt: number): number {
  const remaining = deadlineAt - Date.now();
  if (!Number.isFinite(remaining)) return base;
  return Math.max(MIN_ATTEMPT_MS, Math.min(base, remaining));
}

/**
 * 이 편에 배정된 골격. run-job 이 배치 전체를 보고 결정론적으로 나눠 넘기지만,
 * 넘기지 않는 호출부(하위호환)를 위해 prompts.assignSkeletons 로 **같은 규칙**을
 * 다시 계산한다. 여기서 정한 값을 buildAuthoringUserPrompt 에도 그대로 넘겨,
 * 프롬프트가 지시한 골격과 결과 카드가 표시하는 골격이 갈라지지 않게 한다.
 */
function resolveSkeleton(
  explicit: PassageSkeleton | undefined,
  request: AuthoringRequest,
  index: number,
): Exclude<PassageSkeleton, "AUTO"> {
  if (explicit && explicit !== "AUTO") return explicit;
  return (
    assignSkeletons(
      request.count,
      request.diversify,
      request.spec,
      // 씨앗은 반드시 공용 함수로 만든다 — 호출부마다 다른 문자열을 쓰면 프롬프트가
      // 지시한 골격과 결과 카드가 표시하는 골격이 갈라진다(assignSkeletons 계약).
      authoringSkeletonSeed(request),
    )[index] ?? "S1"
  );
}

/** 수리 콜은 두 번 과금된다 — 원장이 한 콜만 보면 실측 원가가 조용히 줄어든다. */
function mergeUsage(first: unknown, second: unknown): unknown {
  if (!first || typeof first !== "object") return second;
  if (!second || typeof second !== "object") return first;
  const a = first as Record<string, unknown>;
  const b = second as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...a, ...b };
  for (const key of [
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "promptTokens",
    "completionTokens",
    "reasoningTokens",
    "cachedInputTokens",
    "costUsd",
  ]) {
    const left = a[key];
    const right = b[key];
    if (typeof left === "number" && typeof right === "number") {
      merged[key] = left + right;
    }
  }
  return merged;
}

/**
 * 지문 1편 생성. 성공하면 결과·usage·modelId 를, 실패하면 throw 한다
 * (호출부가 status:"FAILED" 로 기록하고 그 편만 환불한다).
 */
export async function runAuthoringGeneration(args: {
  request: AuthoringRequest;
  index: number;
  avoidTexts: string[];
  /** epoch ms — 이 시각을 넘기면 새 호출을 시작하지 않는다. */
  deadlineAt: number;
  /**
   * 이 편에 배정된 골격. run-job 이 런 시작 시 assignSkeletons 로 배치 전체를 나눠
   * 넘긴다(편별로는 반박형 상한을 걸 수 없다). 미전달이면 여기서 같은 규칙으로 계산.
   */
  skeleton?: PassageSkeleton;
  /**
   * 런별 1회 생성한 자료 마커 nonce. 인젝션 방어의 본질은 "제출 시점에 추측 불가능"
   * 이지 "편별 갱신"이 아니다 — 편마다 새로 만들면 최대 60,000자 자료 블록의
   * 프리픽스가 매 콜 갈라져 같은 자료를 편수만큼 풀가로 태운다.
   */
  nonce?: string;
  /**
   * 원본 페이지 이미지(하이브리드). 판독 텍스트를 **대체하지 않고 보강**한다 —
   * 밑줄·굵게·박스·표·도식은 텍스트 판독에서 전부 소멸하기 때문이다.
   * 편당 4쪽 하드 상한은 조달부(run-job)가 건다.
   */
  pageImages?: AuthoringPageImage[];
}): Promise<AuthoringGenerationOutcome> {
  const { request, index, avoidTexts, deadlineAt } = args;
  const pageImages = args.pageImages ?? [];
  const budgets = selectAuthoringMaterialsWithBudget(request.materials);
  const materials = budgets.map((entry) => entry.material);
  const perMaterialCharsSent: Record<string, { sent: number; total: number }> =
    Object.fromEntries(
      budgets.map((entry) => [
        entry.material.id,
        { sent: entry.sentChars, total: entry.totalChars },
      ]),
    );
  const skeleton = resolveSkeleton(args.skeleton, request, index);

  // STEP 4 에서 시스템 프롬프트가 스펙 의존이 됐다 — TEXTURE 블록 게이팅(고3/수능 ×
  // 서술·실용 제외 × 내신 트랙 제외)이 이 셋으로 결정된다. 여기서 상수를 지어 넣지
  // 말고 반드시 요청 스펙을 그대로 넘긴다.
  const system = buildAuthoringSystemPrompt({
    gradeBand: request.spec.gradeBand,
    genre: request.spec.genre,
    examTrack: request.spec.examTrack,
  });
  const prompt = buildAuthoringUserPrompt({
    request,
    index,
    avoidTexts,
    skeleton,
    nonce: args.nonce,
  });

  // ── prompt: <문자열> → messages 배열 ──────────────────────────────────────
  // content part 가 실릴 자리를 만드는 것이 전부다. 참조 구현은
  // similar-exam-generation/question-analysis/analysis-call.ts:72-84 — 같은
  // provider(atlascloud/OpenRouter), 같은 generateObject 로 프로덕션에서 돌고 있다.
  // atlas-ai.transformRequestBody 는 model·reasoning·stream 만 손대고 content 파트는
  // 건드리지 않으므로 SDK 직렬화가 그대로 통과한다. system 은 그대로 둔다.
  const baseMessages: ModelMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...pageImages.map((image) => ({
          type: "image" as const,
          image: image.data,
          mediaType: image.mediaType || "image/jpeg",
        })),
      ],
    },
  ];

  // 사고 강도는 이 요청의 실제 부피에서 파생한다(위 리졸버). 고정 상수가 아니다.
  const reasoningEffort = resolveAuthoringReasoningEffort({
    promptChars: system.length + prompt.length,
    imageCount: pageImages.length,
  });

  const envelope = passageEnvelope(request);
  const logHead = `[PASSAGE-AUTHORING] ${AUTHORING_MODEL_ID} #${index + 1}/${request.count}`;
  const primaryTimeout =
    pageImages.length > 0 ? PRIMARY_WITH_IMAGES_TIMEOUT_MS : PRIMARY_TIMEOUT_MS;

  let lastError: unknown;
  /** 하드 게이트를 통과한 최선의 결과. 수리가 실패해도 이걸 돌려준다(과금 낭비 금지). */
  let best: { item: AuthoringGenerationOutcome["item"]; violations: string[] } | null =
    null;
  let usage: unknown;
  /** 다음 콜을 "수리"로 만들 재료. null 이면 다음 콜은 단순 재시도다. */
  let revision: { draftJson: string; violations: string[] } | null = null;

  for (let call = 0; call < MAX_MODEL_CALLS; call += 1) {
    const startedAt = Date.now();
    const timeoutMs = attemptTimeoutMs(
      call === 0 ? primaryTimeout : SECONDARY_TIMEOUT_MS,
      deadlineAt,
    );
    const messages: ModelMessage[] = revision
      ? [
          ...baseMessages,
          { role: "assistant", content: revision.draftJson },
          { role: "user", content: buildRevisionPrompt(revision.violations) },
        ]
      : baseMessages;

    try {
      const result = await generateObject({
        model: googleGenerativeAI(AUTHORING_MODEL_ID),
        schema: authoredPassageSchema,
        system,
        messages,
        // 같은 자료로 여러 편을 뽑아도 소재가 겹치지 않아야 한다 — 창작이라 높게.
        temperature: 0.85,
        // plan 7줄 + 260단어 지문 + 한국어 메타 + 라벨 배열은 실측 600~750 토큰이다.
        // 캡이 그보다 훨씬 큰 이유는 **reasoning 이 같은 예산을 먹기 때문**이다
        // (exclude:true 는 "응답에 안 싣는다"이지 "안 센다"가 아니다).
        // 8,000 이던 시절 high 가 reasoning 만 6,000 을 태워 JSON 이 잘렸고, 그게
        // 26-07-25 첫 실사용 실패의 원인이었다(상단 실측표).
        // 12,000 근거: low 실측 최대 2,570, medium 5,816 — medium 으로 올려도
        // 본문 자리가 6,000 이상 남는다. 캡은 상한일 뿐 쓴 토큰만 과금되므로,
        // 여유를 크게 잡는 비용은 0 이고 잘림 사고의 비용은 편당 환불이다.
        maxOutputTokens: 12_000,
        // 재시도는 이 루프에서만(위 계약).
        maxRetries: 0,
        // 콜 단위 추론 opt-in — 전역 env 를 건드리지 않는다(위 배선 주석).
        providerOptions: {
          [ATLAS_CLOUD_PROVIDER]: { reasoningEffort },
        },
        abortSignal: AbortSignal.timeout(timeoutMs),
      });

      const item = finalizeItem(result.object, {
        request,
        materials,
        skeleton,
        perMaterialCharsSent,
      });
      const violations = envelopeViolations(item.metrics, envelope);
      usage = mergeUsage(usage, atlasUsageWithCost(result));

      // 수리본이 원본보다 나쁘면 원본을 지킨다(모델이 "고치다가" 더 망가뜨리는 경우).
      if (!best || violations.length < best.violations.length) {
        best = { item, violations };
      }

      console.log(
        // effort·프롬프트 크기를 함께 남긴다 — 사고 강도가 요청에서 파생되므로,
        // 나중에 지연·품질을 되짚을 때 "그 콜이 어느 구간이었나"를 알 수 없으면
        // 임계값(MEDIUM_EFFORT_MAX_PROMPT_CHARS)을 조정할 근거가 안 남는다.
        `${logHead} call ${call + 1}${revision ? " (revision)" : ""} ok in ${Date.now() - startedAt}ms (${item.metrics.words}w / target ${request.spec.targetWords}w, avg ${item.metrics.avgSentenceWords}, ${violations.length} envelope violation(s), effort=${reasoningEffort}, prompt=${(system.length + prompt.length).toLocaleString()}자, ${summarizeMaterials(materials)}${pageImages.length ? `, +${pageImages.length}p images` : ""})`,
      );

      if (best.violations.length === 0) break;
      // 남은 콜이 있고, 아직 수리를 안 썼고, 시간예산이 허락할 때만 1회 수리한다.
      if (call + 1 >= MAX_MODEL_CALLS || revision) break;
      if (Date.now() + MIN_ATTEMPT_MS > deadlineAt) {
        console.warn(`${logHead} skipped revision — 시간예산 소진 (deadline)`);
        break;
      }
      revision = {
        draftJson: JSON.stringify(result.object),
        violations: best.violations,
      };
    } catch (err) {
      lastError = err;
      console.warn(
        `${logHead} call ${call + 1}${revision ? " (revision)" : ""} failed in ${Date.now() - startedAt}ms:`,
        err instanceof Error ? err.message : err,
      );
      // 수리 콜이 실패했다면 이미 손에 쓸 만한 초안이 있다 — 버리지 않는다.
      if (revision) break;
      // 비재시도성 오류(400/401/403 등)는 두 번째 과금 호출을 하지 않는다.
      if (APICallError.isInstance(err) && err.isRetryable === false) break;
      if (call + 1 >= MAX_MODEL_CALLS) break;
      if (Date.now() + RETRY_BACKOFF_MS + MIN_ATTEMPT_MS > deadlineAt) {
        console.warn(`${logHead} skipped retry — 시간예산 소진 (deadline)`);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    }
  }

  if (best) {
    if (best.violations.length > 0) {
      // 봉투를 못 맞춘 채 끝났어도 **차단하지 않는다.** 하드 게이트를 통과한 지문은
      // 쓸 수 있는 지문이고, 결과 카드가 metrics 로 "기출 범위 벗어남"을 표시한다.
      console.warn(
        `${logHead} delivered with envelope violations: ${best.violations.join(" / ")}`,
      );
    }
    return { item: best.item, usage, modelId: AUTHORING_MODEL_ID };
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("AI 지문 생성에 실패했습니다.");
}
