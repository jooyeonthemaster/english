import { z } from "zod";

import { GRAMMAR_POINT_CATALOG } from "@/lib/grammar-point-catalog";
import type { GenerateQuestionObjectResult } from "@/lib/question-generation-llm";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import {
  QUESTION_GENERATION_RESEARCH_STAGES,
  hasQuestionGenerationResearchRuntime,
  observeQuestionGenerationResearchCandidates,
} from "@/lib/question-generation-research-runtime";
import type { QuestionQualityIssue } from "@/lib/question-quality";

import { generateWithRetry } from "./generate-with-retry";
import { isQuestionGenerationAssignmentBudgetError } from "@/lib/atlas-production-assignment-fetch-boundary";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ── 어법 부분수리 범위 판정(단일 소스) ───────────────────────────────────────
// run-question-generation(shouldAttemptCandidateRepair 발동 판정)과 아래 repair
// 프롬프트(범위 제한 지시)가 같은 판정을 공유해야 하므로, 순환 import 가 없는
// 이 리프 모듈에서 관리한다.

// 미끼(디코이)만 교체하면 해소되는 위반 — 정답·설계는 무결하므로 전체 재생성
// (~40k tok) 대신 "미끼 1개 교체" 린 교정(~4k)이 정확한 처방이다 (26-07-06 실측:
// 통과본은 반려본에서 미끼 2개만 교체 / 26-07-14 round-1 감독관 판정: 필러 미끼는
// 기존 decoy-only repair 인프라로 부분수리).
export const GRAMMAR_DECOY_ONLY_REPAIRABLE_CODES = new Set([
  "grammar-killer-answer-point-repeated",
  "grammar-decoy-point-monotony",
  "grammar-decoy-point-diversity",
  // 26-07-14 round-2 신설: 장식 필러 미끼 스팬 — 해당 미끼 1개만 학생이 실제로
  // 저울질하는 문법 자리로 교체하면 해소된다.
  "grammar-decoy-filler-span",
]);

// grammar-obvious-adjacent-sv-agreement 는 정답 발화(정답 재선정 필요 → repair
// 무의미, NOT_WORTH_REPAIR)와 미끼 발화(미끼 1개 교체로 해소)가 같은 코드를 쓴다.
// dispatcher 의 정답 발화 메시지는 `GRAMMAR_ERROR answer "..."` 형식이고 decoy 를
// 언급하지 않으므로 메시지의 decoy/미끼 키워드로 구분한다 — 미끼 발화 메시지가
// 키워드를 안 싣는 쪽으로 어긋나도 결과는 "재생성 경로"라 하드 실패로 이어지지
// 않는다(안전 열화).
export function isDecoyOnlyRepairableGrammarIssue(issue: {
  code: string;
  message: string;
}): boolean {
  if (GRAMMAR_DECOY_ONLY_REPAIRABLE_CODES.has(issue.code)) return true;
  if (issue.code === "grammar-obvious-adjacent-sv-agreement") {
    // 정답 발화는 항상 `GRAMMAR_ERROR answer "…"` 고정 접두를 싣는다. 메시지에
    // errorExpression(지문 축자 스팬)이 그대로 삽입되므로, 지문 소재가 decoy 인
    // 경우("decoys attracts" 류) 키워드 검사만으로는 정답 발화가 미끼 발화로
    // 오분류될 수 있다 — 접두를 먼저 배제해 정답 발화는 항상 재생성 경로로 보낸다.
    if (/^GRAMMAR_ERROR answer\b/.test(issue.message)) return false;
    return /decoy|미끼/i.test(issue.message);
  }
  return false;
}

// ── decoy-only 수리 채택 완화 (26-07-14 round-3 ②) ──────────────────────────
// 종전 채택 조건은 "수리 후 blocking 0"뿐 — 수리가 표적 미끼를 고쳐도 다른 잔존
// 결함 하나 때문에 개선본이 통째로 버려지고 '원본'이 relaxed 출하됐다(round-3
// 실측: C 7건 중 5건). decoy-only 수리에 한해, blocking 0 이 아니어도
//   (i) 표적 결함 일부 해소 — 총 blocking 건수가 엄격히 감소
//   (ii) 새 error 미발생·기존 error 비악화 — 코드별 잔존 건수 ≤ 원 건수
//   (iii) 잔존 결함 전부가 여전히 decoy-only — 정답 관련/설계 코드가 하나라도
//        남거나 새로 생기면 채택 금지
// 를 만족하면 개선본을 채택한다. 잔존 blocking 이 있으면 호출자의 기존 반려
// 경로를 그대로 타므로 출하 게이트는 불변 — 반려 풀(salvage)·relaxed 출하의
// 기준만 원본에서 개선본으로 바뀐다(안전 방향 단조 개선, 하드 실패 영향 0).
export function isAdoptableDecoyOnlyRepairResidual(
  originalIssues: Array<{ code: string; message: string }>,
  repairedIssues: Array<{ code: string; message: string }>,
): boolean {
  if (repairedIssues.length === 0) return true; // 완전 해소 — 항상 채택
  if (repairedIssues.length >= originalIssues.length) return false; // (i) 위반
  const originalCounts = new Map<string, number>();
  for (const issue of originalIssues) {
    originalCounts.set(issue.code, (originalCounts.get(issue.code) ?? 0) + 1);
  }
  const repairedCounts = new Map<string, number>();
  for (const issue of repairedIssues) {
    if (!isDecoyOnlyRepairableGrammarIssue(issue)) return false; // (iii) 위반
    repairedCounts.set(issue.code, (repairedCounts.get(issue.code) ?? 0) + 1);
  }
  for (const [code, count] of repairedCounts) {
    if (count > (originalCounts.get(code) ?? 0)) return false; // (ii) 위반
  }
  return true;
}

// ── decoy 교체 재료 주입 (26-07-14 round-3 ①) ───────────────────────────────
// round-3 실측 병목: decoy-only 수리 프롬프트가 "이 미끼를 교체하라"고만 하고
// 무엇으로 바꿀지 재료를 주지 않아 수리가 발동해도 실패했다. 원 생성 프롬프트에
// 쓴 targetCandidateBlock 의 후보 라인(code/tier/use/position/expression 표기)을
// 재주입한다. 프롬프트 비대 방지: decoy 로 쓸 수 있는 후보만 상위 N개로 절단.
const GRAMMAR_CANDIDATE_LINE_RE = /^\d+\.\s+code=\([a-m]\)\s/;
const DECOY_REPLACEMENT_CANDIDATE_LIMIT = 15;

function extractDecoyEligibleCandidateLines(targetCandidateBlock: string): string[] {
  return targetCandidateBlock
    .split("\n")
    .filter((line) => GRAMMAR_CANDIDATE_LINE_RE.test(line.trim()))
    // use=alternate-answer-only 는 "미끼로 절대 사용 금지" 표기 — 교체 재료에서 제외.
    .filter((line) => !line.includes("use=alternate-answer-only"))
    .slice(0, DECOY_REPLACEMENT_CANDIDATE_LIMIT);
}

// 재태깅 수리의 "무엇으로" 재료 (26-07-14 round-3 ③): 카탈로그 코드 표 1줄 요약 —
// 라벨 정정이 유효한 코드 어휘(a~m) 밖으로 나가지 않게 한다.
const GRAMMAR_POINT_CODE_SUMMARY = Object.values(GRAMMAR_POINT_CATALOG)
  .map((info) => `${info.code}=${info.label}`)
  .join(", ");

// 해설 전용 수리의 "무엇으로" 재료 (26-07-14 round-3 ③): 린트 메시지
// ("<필드명>: <파손 종류> — …")에서 필드명+파손 종류만 추출해
// "explanation(어투 혼용), keyPoints[2](수 모순)" 형태로 요약한다. 형식이 다른
// 메시지는 건너뛴다 — 요약은 보강 재료일 뿐, 실패해도 기존 지시로 폴백(무회귀).
function summarizeExplanationLintTargets(
  issues: Array<{ code: string; message: string }>,
): string {
  const entries: string[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    if (
      issue.code !== "grammar-explanation-lint" &&
      !issue.code.startsWith("grammar-explanation-lint-")
    ) {
      continue;
    }
    const match = /^([A-Za-z][\w()[\]]*):\s*([^—]+?)\s*—/.exec(issue.message);
    if (!match) continue;
    const entry = `${match[1]}(${match[2].trim()})`;
    if (seen.has(entry)) continue;
    seen.add(entry);
    entries.push(entry);
  }
  return entries.join(", ");
}

// 재태깅 수리 대상 — 밑줄 스팬의 실제 문법 판단과 pointCode/keyPoints 명명이
// 어긋난 것뿐이라 라벨 정정만으로 해소된다 (26-07-14 round-2 경고→차단 승격분).
function isRetagOnlyGrammarIssue(issue: { code: string }): boolean {
  return (
    issue.code === "grammar-pointcode-span-mismatch" ||
    issue.code === "grammar-appear-pointcode-voice-mismatch"
  );
}

// 해설/메타데이터 전용 결함 — 문항 본체와 정답 설계는 보존한 채 학생에게
// 보이는 해설 텍스트만 다시 쓰면 해소된다. 사실 오분석은 salvage 에서 경고로
// 강등하지 않되, 이 좁은 수리 경로로 한 번 고칠 기회만 준다.
const EXPLANATION_ONLY_GRAMMAR_ISSUE_CODES = new Set([
  "grammar-agreement-explanation-too-thin",
  "grammar-afford-modal-mislabel",
  "grammar-answer-in-wrong-explanations",
  "grammar-appear-adverb-mislabel",
  "grammar-category-mislabel",
  "grammar-error-explanation-surface-order",
  "grammar-explanation-answer-range-leak",
  "grammar-explanation-meta-leak",
  "grammar-explanation-range-shorthand",
  "grammar-explanation-self-contradictory",
  "grammar-explanation-typo",
  "grammar-human-made-postmodifier-mislabel",
  "grammar-keypoint-token-not-source-backed",
  "grammar-keypoint-untested-token",
  "grammar-look-like-complement-mislabel",
  "grammar-terminology-error",
  "grammar-terminology-register",
  "grammar-noun-clause-pronoun-mislabel",
  "grammar-phrasal-verb-mislabel",
  "grammar-seem-to-complement-mislabel",
  "grammar-seem-to-object-mislabel",
  "grammar-that-way-adverb-mislabel",
  "grammar-vague-metadata-tag",
  "wrong-option-explanation-count",
]);

function isExplanationOnlyGrammarIssue(issue: { code: string }): boolean {
  return (
    EXPLANATION_ONLY_GRAMMAR_ISSUE_CODES.has(issue.code) ||
    issue.code === "grammar-explanation-lint" ||
    issue.code.startsWith("grammar-explanation-lint-")
  );
}

export interface RepairCandidateInput {
  subType: string;
  /** 후처리 직전(AI 출력 레벨)의 탈락 초안 — 교정 출력도 동일 후처리를 다시 탄다. */
  draft: Record<string, unknown>;
  /** Exact provider-returned candidate that this repair prompt derives from. */
  researchParentCandidate?: Record<string, unknown>;
  /** 이 후보를 탈락시킨 A(차단) 품질 결함들 */
  blockingIssues: QuestionQualityIssue[];
  passageContent: string;
  /** 원 생성 프롬프트에 쓴 유형별 후보 블록 — 어법 decoy-only 수리의 교체 재료
   * (26-07-14 round-3 ①). 미전달/타 유형이면 기존 프롬프트 그대로(무회귀). */
  targetCandidateBlock?: string;
  /** 원 생성과 동일한 응답 스키마(구조 유효성 보장 — 마이크로 스키마 불필요) */
  responseSchema: z.ZodType;
  generationPlan: QuestionGenerationPlan;
  perQuestionTokenFloor: number;
  deadlineAt?: number;
  /** PREMIUM 캐시용 정적 system 프리앰블(원 생성과 동일) */
  system?: string;
  /** strict 구조화 출력을 생략하고 프롬프트 인라인 JSON 모드로 교정 (Wave-3 SW/TSW PREMIUM — 원 생성 라우팅과 동일) */
  forceJsonFallback?: boolean;
  onModelUsage?: (result: GenerateQuestionObjectResult<unknown>) => void;
}

/**
 * SHIP-FIRST 부분 repair — A(차단) 결함으로 탈락한 단일 후보를 문항 전체를 처음부터
 * 재생성(full regen)하는 대신 "이 초안에서 이 결함만 고쳐라"로 1회 교정 재생성한다.
 *
 * 왜 full regen 보다 나은가: 모델에게 (1) 깨진 초안 자체와 (2) 구체적 실패 코드/메시지를
 * 줘서 맹목 재생성보다 적중률을 높인다. 동일 응답 스키마를 재사용하므로 구조 유효성은
 * 그대로 보장되고(마이크로 스키마 불필요), 정답·밑줄·마커의 원문 일치 같은 불변식만
 * 다시 맞추면 된다. 비용은 단건 페이로드라 full regen 대비 작다.
 *
 * 호출자(run-question-generation 루프)는 교정 출력을 신뢰하지 않고 반드시 후처리+품질
 * 게이트를 재실행한다. 데드라인 초과/실패/형식 불일치 시 null 을 반환해 호출자가 기존
 * 재생성 경로로 폴백하게 한다(무회귀 — happy-path 와 다중결함 케이스는 건드리지 않음).
 * 근거: docs/GENERATION-ENGINE-REDESIGN-ROADMAP.md §4 WS3.
 */
export async function repairQuestionCandidate(
  input: RepairCandidateInput,
): Promise<Record<string, unknown> | null> {
  const {
    subType,
    draft,
    researchParentCandidate,
    blockingIssues,
    passageContent,
    targetCandidateBlock,
    responseSchema,
    generationPlan,
    perQuestionTokenFloor,
    deadlineAt,
    system,
    forceJsonFallback,
    onModelUsage,
  } = input;

  if (blockingIssues.length === 0) return null;
  if (deadlineAt && Date.now() >= deadlineAt) return null;

  const defectLines = blockingIssues
    .slice(0, 6)
    .map((issue) => `- [${issue.code}] ${issue.message}`)
    .join("\n");

  // 디코이 한정 위반(정답 pointCode 반복·코드 편중·장식 필러 스팬·미끼 자리의
  // 한눈 수일치)만으로 탈락한 어법 초안은 정답 설계가 무결하다 — 정답까지
  // 갈아엎는 과잉 교정을 막고 미끼 자리만 옮기게 지시한다 (26-07-06 실측:
  // 통과본은 반려본에서 미끼 2개만 교체).
  const decoyOnlyGrammarRepair =
    subType === "GRAMMAR_ERROR" &&
    blockingIssues.every((issue) => isDecoyOnlyRepairableGrammarIssue(issue));
  // 재태깅 수리 — pointCode 오태깅(스팬-라벨 불일치)만으로 탈락: 문항 본체는
  // 무변경, 라벨 명명만 정정 (26-07-14 round-2 감독관 판정 ③).
  const retagOnlyGrammarRepair =
    !decoyOnlyGrammarRepair &&
    subType === "GRAMMAR_ERROR" &&
    blockingIssues.every((issue) => isRetagOnlyGrammarIssue(issue));
  // 해설 전용 수리 — 해설 린트(어투 혼용·수 모순 등)가 단독 결함: 지문·밑줄·
  // 정답표는 그대로 두고 해설만 재작성 (26-07-14 round-2 감독관 판정 ④).
  const explanationOnlyGrammarRepair =
    !decoyOnlyGrammarRepair &&
    !retagOnlyGrammarRepair &&
    subType === "GRAMMAR_ERROR" &&
    blockingIssues.every((issue) => isExplanationOnlyGrammarIssue(issue));

  // decoy 교체 재료(round-3 ①) — 원 생성 후보 블록에서 미끼로 쓸 수 있는 후보만
  // 절단 추출. 후보가 없으면 빈 블록 → 종전 프롬프트와 동일(무회귀).
  const decoyReplacementLines =
    decoyOnlyGrammarRepair && targetCandidateBlock
      ? extractDecoyEligibleCandidateLines(targetCandidateBlock)
      : [];
  const decoyReplacementBlock = decoyReplacementLines.length
    ? [
        "## 대체 미끼 후보 (원 생성에 쓴 소스 후보 목록 — 이 안에서 고르세요)",
        "결함으로 지적된 미끼를 제거하고, 아래 후보 중 (1) 현재 문항의 다른 밑줄들(정답 포함)과 표현·문장이 겹치지 않고 (2) 정답(오류) 밑줄의 pointCode 와 다른 코드인 후보를 골라 교체하세요. 후보 목록 밖의 자리를 새로 창작하지 마세요. 각 후보의 expression 은 지문 원문 표기 그대로이므로 밑줄도 그 표기 그대로 사용하고, use=decoy-only / decoy-preferred 표기 후보를 우선하세요.",
        ...decoyReplacementLines,
      ].join("\n")
    : "";
  // 재태깅 수리 재료(round-3 ③) — 카탈로그 코드 표 1줄. 해설 수리 재료 —
  // 결함 필드명+파손 종류 명시(파싱 실패 시 빈 문자열 → 기존 지시 그대로).
  const retagCatalogSuffix = retagOnlyGrammarRepair
    ? ` pointCode 카탈로그(사용 가능한 전체 코드): ${GRAMMAR_POINT_CODE_SUMMARY}. 정정된 pointCode 는 반드시 이 표의 코드여야 하며, 그 코드가 요구하는 문법 토큰이 밑줄 스팬 안에 실제로 존재해야 합니다.`
    : "";
  const explanationLintTargets = explanationOnlyGrammarRepair
    ? summarizeExplanationLintTargets(blockingIssues)
    : "";
  const explanationTargetSuffix = explanationLintTargets
    ? ` 이번에 고칠 필드는 ${explanationLintTargets} 뿐입니다 — 각 필드에서 괄호 안에 적힌 파손 종류만 정확히 해소하고, 지적되지 않은 해설 필드는 원문 그대로 유지하세요.`
    : "";

  const grammarRepairScopeBlock = decoyOnlyGrammarRepair
    ? `## 교정 범위 제한 (중요)\n정답 밑줄(오류 자리)·correction·해설의 정답 분석은 이미 통과 품질입니다 — 절대 바꾸지 마세요. 위 결함은 미끼(비정답) 밑줄에 국한된 문제(pointCode 조합 위반, 장식 필러 스팬, 한눈에 답이 보이는 인접 주어-동사 수일치 자리)입니다. 지적된 미끼 밑줄만 지문의 다른 문법 포인트 자리(정답과 다른 pointCode, 코드당 최대 2회)로 교체하세요 — 새 미끼 자리는 학생이 실제로 맞는지 틀리는지 저울질해야 하는 구조적 문법 판단 자리여야 하며, only·지시사·단순 전치사 같은 장식 필러나 주어 바로 옆 동사의 단순 수일치 자리는 다시 쓰면 안 됩니다. 교체한 미끼의 wrongOptionExplanations 항목만 새 자리에 맞게 다시 쓰고, 나머지 밑줄·해설은 그대로 보존하세요. pointCode 는 항상 그 자리의 실제 문법 성격대로 정직하게 기재해야 합니다.${decoyReplacementLines.length ? " 교체할 새 미끼 자리는 아래 '대체 미끼 후보' 목록 안에서만 고르세요." : ""}`
    : retagOnlyGrammarRepair
      ? `## 교정 범위 제한 (중요)\n문항 본체는 이미 통과 품질입니다 — 지문·밑줄 위치·오류형(errorExpression)·correction·정답표·선지를 절대 바꾸지 마세요. 위 결함은 밑줄 스팬과 pointCode 라벨의 불일치(오태깅)이므로, 각 밑줄 스팬의 실제 문법 판단에 맞게 pointCode 와 keyPoints 의 명명(라벨 문구)만 정정하세요. keyPoints 를 고칠 때도 새 문법 주제를 창작하지 말고, 해당 밑줄이 실제로 검사하는 문법 범주의 이름으로만 바꾸세요.${retagCatalogSuffix}`
      : explanationOnlyGrammarRepair
        ? `## 교정 범위 제한 (중요)\n문항 본체는 이미 통과 품질입니다 — 지문·밑줄 위치·오류형·correction·정답표·선지·pointCode 를 한 글자도 바꾸지 마세요. 위 결함은 해설 전용이므로 explanation·keyPoints·wrongOptionExplanations 의 해설 텍스트만 다시 작성하세요. 재작성 시: 지적된 결함(어투 혼용·단수/복수 모순·라벨-내용 불일치 등)을 정확히 해소하고, 어투는 합니다체로 통일하며, 근거는 지문 원문과 밑줄 스팬의 실제 구조에서만 가져오세요(지문에 없는 문장 인용 금지).${explanationTargetSuffix}`
        : "";

  const repairPrompt = [
    `아래는 ${subType} 유형 문항 초안입니다. 품질 검사에서 다음 결함으로 탈락했습니다.`,
    `## 반드시 교정할 결함`,
    defectLines,
    grammarRepairScopeBlock,
    decoyReplacementBlock,
    `## 지문 (원문 — 정답·밑줄·마커·원문 인용은 반드시 이 원문과 정확히 일치해야 함)`,
    passageContent,
    `## 탈락한 초안 (JSON)`,
    JSON.stringify(draft),
    `위 결함만 정확히 해소하고 나머지(형식·필드 구조·정답 외 보기)는 최대한 보존하세요. ` +
      `교정된 문항 1개만 questions 배열에 담아 동일한 형식으로 출력하세요. 같은 실수를 반복하지 마세요.`,
  ].filter(Boolean).join("\n\n");

  try {
    const object = await generateWithRetry(
      responseSchema,
      repairPrompt,
      generationPlan,
      Math.min(
        20_000,
        Math.max(1, perQuestionTokenFloor, generationPlan === "PREMIUM" ? 12_288 : 0),
      ),
      undefined,
      onModelUsage,
      {
        system,
        deadlineAt,
        forceJsonFallback,
        researchStage: {
          key: forceJsonFallback
            ? QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_CANDIDATE_REPAIR_JSON
            : QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_CANDIDATE_REPAIR,
          purpose: "candidate",
          derivationParentValue: researchParentCandidate,
        },
      },
    );
    if (isRecord(object) && Array.isArray(object.questions)) {
      const first = object.questions.find(isRecord);
      if (first && hasQuestionGenerationResearchRuntime()) {
        await observeQuestionGenerationResearchCandidates([first]);
      }
      return (first as Record<string, unknown> | undefined) ?? null;
    }
    return null;
  } catch (error) {
    if (isQuestionGenerationAssignmentBudgetError(error)) throw error;
    // 교정 호출 실패는 치명적이지 않다 — 호출자가 기존 재생성 경로로 폴백한다.
    return null;
  }
}
