import { AI_QUESTION_SCHEMAS, getAiResponseSchema } from "@/lib/question-ai-schemas-mc";
import {
  GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS,
  normalizeQuestionGenerationOuterAttempts,
} from "@/lib/concurrency-config";
import { KO_PASSAGE_KIND_LABELS, type KoPassageKind } from "@/lib/korean/core/passage-meta";
import { shuffleKoMc5Options } from "@/lib/korean/core/shuffle";
import { buildKoGenerationPrompt } from "@/lib/korean/prompts/generation";
import { runKoSolverGate } from "@/lib/korean/quality/solver-gate";
import { runGrammarSolverGate } from "./grammar-solver-gate";
import {
  getExplanationVerifyGateMode,
  isExplanationVerifyGateTargetType,
  runExplanationVerifyGate,
} from "./explanation-verify-gate";
import {
  isReviewRepairGateEnabled,
  isReviewRepairGateTargetType,
  runReviewRepairGate,
} from "./review-repair-gate";
import { getKoTypeModule, isKoQuestionType } from "@/lib/korean/registry";
import { readKoResolvedSettings } from "@/lib/korean/settings";
import { postProcessQuestion } from "@/lib/question-postprocess";
import { reorderChipsAwayFromAnswer, reshuffleTopicSentenceWritingChips } from "@/lib/topic-sentence-writing";
import { normalizePassageWhitespace } from "@/lib/question-postprocess/text-utils";
import { QUESTION_SCHEMAS, STRUCTURED_TYPE_PROMPTS } from "@/lib/question-schemas";
import { buildQuestionTypeSettingsPrompt, getQuestionTypeGenerationTokenFloor, readQuestionTypeDifficultySetting, readSummaryWritingBlankCountSetting, readTopicSentenceWritingBlankCountSetting, resolveQuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import { buildQuestionTargetCandidateBlock, getTypeQualityRubric, type QuestionQualityIssue, validateQuestionQuality } from "@/lib/question-quality";
import { analyzeEnglishPassageIntegrity } from "@/lib/question-quality/passage-integrity";
import { selectUsableGrammarCandidates } from "@/lib/question-quality/candidate-blocks/grammar";
import { buildDiversityPromptBlock, shuffleQuestionOptionsForDiversity } from "@/lib/question-diversity";
import { DIFF_DESCRIPTION, TYPE_LABELS } from "./constants";
import { generateWithRetry } from "./generate-with-retry";
import { runGrammarPremiumLadder } from "./grammar-premium-ladder";
import { isAdoptableDecoyOnlyRepairResidual, isDecoyOnlyRepairableGrammarIssue, repairQuestionCandidate } from "./question-repair";
import { fallbackResponseSchema } from "./schemas";
import { buildGenerationPrompt, STRUCTURED_OUTPUT_INSTRUCTIONS, UNSTRUCTURED_OUTPUT_INSTRUCTIONS } from "./prompts";
import { isNonRetryableQuestionGenerationProviderError } from "@/lib/question-generation-llm";
import {
  ATLAS_PREMIUM_QGEN_MODEL_ID,
  ATLAS_STANDARD_MODEL_ID,
  isAtlasClaudeModel,
} from "@/lib/atlas-ai";
import { buildResearchAwareQuestionResponseSchema } from "@/lib/question-generation-research-schema";
import {
  adaptQuestionGenerationResearchProfileCandidate,
  applyQuestionGenerationResearchPromptProfile,
  buildQuestionGenerationResearchProfileResponseSchema,
  getQuestionGenerationResearchPromptProfileId,
  getQuestionGenerationResearchPromptProfileMaxOutputTokens,
  isQuestionGenerationResearchSingleShotProfileActive,
  QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES,
} from "@/lib/question-generation-research-profiles";
import {
  QUESTION_GENERATION_RESEARCH_STAGES,
  decideQuestionGenerationResearchCandidate,
  getQuestionGenerationResearchExpectedQuestionCount,
  getQuestionGenerationResearchTransportPolicy,
  hasQuestionGenerationResearchRuntime,
  observeQuestionGenerationResearchCandidates,
  runQuestionGenerationResearchOperation,
} from "@/lib/question-generation-research-runtime";
import { anchorVerbatimText, tokenizePassage } from "@/lib/passage-point-tokenizer";
import {
  checkTeacherPointCompliance,
  clampTeacherPoints,
  POINT_PICKER_CONFIG,
  TEACHER_POINT_UNITS,
  TEACHER_POINTS_HARD_CAP,
  type TeacherPointPayload,
  type TeacherPointUnit,
} from "@/app/(director)/director/workbench/generate/generation-config-panel-parts/point-picker-config";
import type { QualityMode, QuestionGenerationRejectionIssue, QuestionGenerationRejectionSummary, QuestionGenerationUsageEvent, RejectionRecorder, RunGenerationInput } from "./run-question-generation-types";
import { RELAXED_BLOCKING_QUALITY_CODES, SALVAGE_RELAXABLE_CODES } from "./run-question-generation-constants";
import { admitSalvageCandidatesFromPool, buildCorrectiveRetryFeedback, buildRejectionSample, buildRejectionSummary, buildSalvageNotice, formatIssuesForLog, getLargestGrammarAnswerCount, getLargestGrammarMarkerCount, getLargestIrrelevantSlotCount, hasBlankParaphraseAnswerSetting, hasDoubleNegativeBlankSetting, hasSingleBlankInferenceSetting, isRecord, mergeCustomPromptWithTypeSettings, recordRejectedCandidate, recordRejection, summarizeQualityIssues, trimGrammarDecoySurplus } from "./run-question-generation-helpers";

export type {
  QuestionGenerationRejectionIssue,
  QuestionGenerationRejectionSummary,
  QuestionGenerationUsageEvent,
  RunGenerationInput,
} from "./run-question-generation-types";

const STANDARD_GRAMMAR_KILLER_RESCUE_CODES = new Set([
  "grammar-killer-thin-answer",
  "grammar-killer-generic-answer-point",
  "grammar-killer-answer-point-repeated",
  "grammar-killer-thin-relative-animacy",
  "grammar-killer-thin-concessive-as",
  "grammar-killer-thin-connector",
  "grammar-killer-thin-missing-aux",
  "grammar-shallow-participle-adjective-answer",
  "grammar-obvious-adjacent-sv-agreement",
  "grammar-obvious-local-agreement",
  "grammar-marker-too-dense",
  "grammar-explanation-too-long-hard",
]);

const GRAMMAR_DESIGN_ISSUES_NOT_WORTH_REPAIR = new Set([
  ...STANDARD_GRAMMAR_KILLER_RESCUE_CODES,
  "grammar-shallow-checklist-decoys",
  "grammar-weak-filler-decoys",
  "grammar-too-basic-decoys",
  "grammar-shallow-nearby-passive-decoy",
  "grammar-shallow-than-decoy",
  "grammar-shallow-depends-decoy",
  "grammar-obvious-modal-gerund",
  "grammar-obvious-modal-to-infinitive",
  "grammar-obvious-to-gerund-after-verb",
  "grammar-obvious-before-after-to-infinitive",
  "grammar-obvious-object-pronoun-subject",
  "grammar-obvious-local-pronoun-agreement",
  "grammar-obvious-intransitive-passive",
  "grammar-obvious-passive-to-gap-ing",
  "grammar-obvious-adverb-adjective",
  "grammar-obvious-what-noun-prefix",
  "grammar-semantic-who-what-answer",
  "grammar-semantic-how-why-answer",
  // permit/give/deny 류의 retained-object passive 는 표시형 자체가 정문일 수
  // 있어 정답 자리 선정부터 폐기해야 한다. 부분 수리 호출을 낭비하지 않는다.
  "grammar-debatable-retained-object-passive",
  "grammar-error-pos-change",
  "grammar-gibberish-inversion-fragment",
  // 교정형 원형 노출(round-1 ①)은 정답 자리 자체를 옮겨야 해소된다 — 초안 보존
  // 교정(repair)으로는 못 고치므로 린 교정 호출을 건너뛰고 재생성으로 보낸다.
  "grammar-correction-form-exposed",
  // 정답 오형이 비실존 어형(round-2 신설: 비단어·조동사+be 연쇄·명사 뒤 what
  // 강제)도 정답 자리 재선정이 필요해 초안 보존 교정으로 못 고친다 — 재생성
  // (+GRAMMAR_RETRY_DIRECTIVES 지시) 경로로 보낸다. 모든 품질 모드에서 차단하며
  // 정답 자리 재선정이 필요하므로 부분 수리 대신 재생성한다.
  "grammar-answer-nonword-forced",
]);

// GRAMMAR_ERROR STANDARD/PREMIUM 1차 프롬프트 말단에 붙이는 '출력 직전' 자기검증 체크리스트.
// 오늘 실측 최다 반려 코드(오류 미주입·정답표 desync·KILLER 인접 자명 자리·필러 미끼·
// 명사 뒤 what 비문 등)를 겨냥해, 생성기가 JSON 을 내보내기 직전에 스스로 교정하게 유도한다.
// 종결 명령 앞에 주입되며(프롬프트 빌더가 위치 보장), 값이 없으면 기존 프롬프트와 바이트 동일.
const GRAMMAR_ERROR_FINAL_CHECKLIST = `## 출력 직전 최종 자기검증 (하나라도 위반 시 해당 부분을 고치고 나서 JSON을 출력)
1. 정답 밑줄: 오류형(errorExpression)이 지문에 실제로 심어져 있고, correction 은 원문 그대로인가? (오류를 심지 않으면 무효)
2. 정답 포인트: pointCode 가 a~i,k(핵심 10) 중 하나이고, KILLER 라면 인접 주어-동사처럼 한눈에 보이는 자리가 아닌가?
3. 미끼 밑줄 전부: only/given/does/지시사 that 같은 장식 필러가 아니라 구조적으로 의미 있는 문법 자리인가?
4. KILLER: 어떤 미끼도 정답과 같은 pointCode 를 쓰지 않는가?
5. 모든 expression/correction 이 지문 원문에 한 글자도 다르지 않게 실재하는가? (잘린 표현·창작 표현 무효)
6. 명사 뒤에 what 을 넣는 변형을 정답으로 쓰지 않았는가? (한눈에 비문 = 반려됨)
7. keyPoints 3개가 각각 실제 밑줄 라벨로 시작하고 1번이 정답 라벨인가?`;

// 재시도 피드백 보강(26-07-14 round-0 실측): correctiveActionForCode(helpers)가
// 커버하지 않는 어법 주요 반려 코드는 원시 코드명+게이트 메시지만 전달돼 같은
// 결함으로 연속 반려된다(q03: grammar-killer-overdrilled-answer 2연속). 코드명이
// 아니라 "다음 시도에서 행동을 바꿀 수 있는" 한국어 1줄 지시가 가야 교정된다.
// helpers 에 이미 Fix 문구가 있는 코드(예: grammar-killer-answer-point-repeated)는
// 넣지 않는다 — 같은 지시가 두 번 실리면 프롬프트만 커진다.
const GRAMMAR_RETRY_DIRECTIVES: Record<string, string> = {
  "grammar-solver-mismatch":
    "독립 솔버가 정답을 재현하지 못했다(답 없음/복수 정답/다른 답) — 심은 오형이 '명백한 비문'이 되는 자리로 정답을 재선정할 것. 특히 ①현대 표준 용법으로 방어 가능한 형태(singular they·형식 가정법 were·수동+양태부사) 금지 ②같은 문장의 정동사/분사 쌍을 동시에 밑줄하는 배치 금지(어느 쪽을 고쳐도 정문이 되는 동률 발생)",
  "grammar-killer-overdrilled-answer":
    "that↔what·전치사↔접속사처럼 과훈련된(기출 암기형) 변형을 정답으로 다시 쓰지 말 것 — 이 지문 고유 구조에서 다른 최소대립쌍(수식어구를 건너뛴 수일치·의미상 주어와 분사 관계·병렬 짝)을 정답 자리로 고를 것",
  "grammar-correction-form-exposed":
    "교정형(올바른 원문 형태)이 지문 다른 곳에 그대로 노출되지 않는 자리를 정답으로 고를 것 — 학생이 지문 대조만으로 답을 베낄 수 있으면 무효",
  "grammar-obvious-local-agreement":
    "주어 바로 옆 동사의 단순 수일치를 정답으로 쓰지 말 것 — 주어와 동사 사이에 긴 수식어구·관계절이 끼어 구조 파악이 필요한 자리로 옮길 것",
  "grammar-answer-point-not-core":
    "정답 pointCode 는 핵심 코드(a~i,k) 중에서만 고를 것 — 지엽·암기형 포인트를 정답 자리에 쓰지 말 것",
  "grammar-pointcode-span-mismatch":
    "각 밑줄의 pointCode 를 실제 밑줄 스팬의 문법 범주와 일치시킬 것 — 분사 자리에 관계사 코드를 붙이는 식의 오태깅 금지",
  "grammar-killer-thin-relative-animacy":
    "who↔which 선행사 유생성 단순 교체를 KILLER 정답으로 쓰지 말 것 — 절의 완전/불완전 구조까지 따져야 하는 관계사 자리나 다른 장거리 구조 자리로 바꿀 것",
  "grammar-disputed-usage-target":
    "문법성 판정이 갈릴 수 있는 표현은 밑줄 자리에서 제외할 것 — 정오가 논쟁 없이 확정되는 자리만 쓸 것",
  "grammar-obvious-double-ing":
    "진행형 뒤에 -ing 를 겹치는 식의 한눈 비문을 만들지 말 것 — 문맥 판단이 필요한 그럴듯한 오형으로 바꿀 것",
  // 26-07-14 round-2 신설 코드 매핑 — 코드명이 아니라 "다음 시도에서 행동을
  // 바꿀 수 있는" 지시로 번역한다(감독관 판정 ①②).
  "grammar-answer-nonword-forced":
    "오형(errorExpression)은 실존하는 영어 어형만 쓸 것: 비단어·조동사+be 연쇄·명사 뒤 what 삽입 금지 — 그 자리를 버리고 지문의 다른 자리에 오류를 재선정할 것",
  "grammar-decoy-filler-span":
    "장식 필러(only·given·지시사·단순 전치사 등) 미끼를 다시 쓰지 말 것 — 해당 미끼를 학생이 실제로 맞는지 틀리는지 저울질하는 구조적 문법 판단 자리로 교체할 것",
};

// 생성·수리 콜의 gemini 사고 강도 (26-07-20 이원 티어). 전역 env
// (OPENROUTER_GEMINI_REASONING_EFFORT — 전 gemini 소비자 공용, 프로덕션 low)를
// 건드리지 않고 문제생성 콜에만 콜 단위로 싣는다.
//  - 빈칸·선택형(출력 짧음): high — O197~O201 확증 계약.
//  - 어법: medium — 7/21 00시 실사용 실측: 프로덕션 어법 KILLER 프롬프트(대형
//    컴팩트 계약+12k 출력캡)에 high 사고를 얹으면 콜당 120s 상시 초과(전 시도
//    타임아웃 → 1건 실패·1건 salvage). medium 프로브 2지문 E2E 76s/151s 완주.
//    (S3i 의 어법@high 63s 는 경량 실험 계약 기준 — 프로덕션 프롬프트 다이어트가
//    후속 과제. 그 전까지 medium 이 데드라인 안전선.)
//  - 무거운 구조형(순서·삽입·무관·요약MC·콤보 — 출력 큼): medium — 스모크 실측
//    high 가 1콜 170s+ 로 fast 데드라인(270s)을 태움. O199 S6(medium 원샷 F 0%)이
//    품질 근거. env QGEN_GEMINI_REASONING_EFFORT 는 전 유형 강제 오버라이드.
const QGEN_MEDIUM_EFFORT_SUBTYPES: ReadonlySet<string> = new Set([
  "GRAMMAR_ERROR",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "IRRELEVANT",
  "SUMMARY_COMPLETE_MC",
  "GRAMMAR_CHOICE_COMBO",
]);
function resolveQgenReasoningEffort(subType?: string): string {
  const override = process.env.QGEN_GEMINI_REASONING_EFFORT?.trim();
  if (override) return override;
  return subType && QGEN_MEDIUM_EFFORT_SUBTYPES.has(subType) ? "medium" : "high";
}

function grammarRetryDirectiveForCode(code: string): string | null {
  const direct = GRAMMAR_RETRY_DIRECTIVES[code];
  if (direct) return direct;
  // round-1 신설 소스 정합 게이트(교정형 원형 노출)는 코드명 확정 전이라 exposed
  // 계열 접미로도 매칭한다 — 오매칭해도 프롬프트 지시 1줄이라 실패율에 무해.
  if (code.startsWith("grammar-") && code.includes("exposed")) {
    return GRAMMAR_RETRY_DIRECTIVES["grammar-correction-form-exposed"];
  }
  return null;
}

// killer-overdrilled 반려 "이력" 지시 — round-1 실증(q05·q29): 과훈련 정형 정답으로
// 반려돼도 재시도가 같은 pointCode 계열 정답으로 수렴했다. 누적 반려 이력에 이
// 코드가 있으면(최근 1회분에 없더라도) 반려된 정답 pointCode 를 sample 에서 뽑아
// "동일 계열 재선정 금지"를 재시도 피드백에 상시 주입한다(줄 1개 — 프롬프트 폭증 없음).
function buildKillerOverdrilledHistoryDirective(
  cumulativeIssues: QuestionGenerationRejectionIssue[],
): string | null {
  const rejectedAnswerCodes = new Set<string>();
  let overdrilledSeen = false;
  for (const issue of cumulativeIssues) {
    if (issue.subType !== "GRAMMAR_ERROR") continue;
    if (!issue.codes?.includes("grammar-killer-overdrilled-answer")) continue;
    overdrilledSeen = true;
    const marked = Array.isArray(issue.sample?.markedExpressions)
      ? issue.sample.markedExpressions
      : [];
    for (const item of marked) {
      if (!isRecord(item) || item.isError !== true) continue;
      const code = String(item.pointCode ?? "").match(/[a-m]/i)?.[0]?.toLowerCase();
      if (code) rejectedAnswerCodes.add(code);
    }
  }
  if (!overdrilledSeen) return null;
  const codeText = rejectedAnswerCodes.size
    ? ` (반려된 정답 pointCode: ${[...rejectedAnswerCodes].sort().join(", ")})`
    : "";
  return `- 교정 지시 [grammar-killer-overdrilled-answer 이력]: 이전 시도가 과훈련 정형 정답으로 반려된 이력이 있음${codeText} — 반려된 정답과 동일 pointCode 계열을 다시 정답으로 선정하지 말 것. 정답 자리를 다른 핵심 코드 자리(수식어구를 건너뛴 수일치·의미상 주어와 분사 관계·병렬 짝·완전/불완전절 관계사 등)로 옮길 것`;
}

// 최근 시도 1회분의 어법 반려 코드 중 상위 3개만 한국어 행동 지시로 변환해 교정
// 피드백 말미에 덧붙인다 — 프롬프트 폭증 방지(최대 3줄+이력 지시 1줄,
// GRAMMAR_ERROR 반려에만 반응). 기존 buildCorrectiveRetryFeedback 출력은 그대로
// 보존한다. cumulativeIssues 는 killer-overdrilled 이력 지시 전용(미전달 시
// recentIssues 로 대체 — 기존 호출과 하위호환).
function appendGrammarRetryDirectives(
  baseFeedback: string | undefined,
  recentIssues: QuestionGenerationRejectionIssue[],
  cumulativeIssues?: QuestionGenerationRejectionIssue[],
): string | undefined {
  const counts = new Map<string, number>();
  for (const issue of recentIssues) {
    if (issue.subType !== "GRAMMAR_ERROR") continue;
    for (const code of issue.codes ?? []) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const directives: string[] = [];
  for (const [code] of ranked) {
    const directive = grammarRetryDirectiveForCode(code);
    if (!directive) continue;
    directives.push(`- 교정 지시 [${code}]: ${directive}`);
    if (directives.length >= 3) break;
  }
  const historyDirective = buildKillerOverdrilledHistoryDirective(
    cumulativeIssues?.length ? cumulativeIssues : recentIssues,
  );
  if (historyDirective) directives.push(historyDirective);
  if (directives.length === 0) return baseFeedback;
  if (!baseFeedback) {
    return ["## 직전 시도 반려 — 아래 지시를 반영해 다시 출제", ...directives].join("\n");
  }
  return [baseFeedback, ...directives].join("\n");
}

function isStandardGrammarKillerRequest(input: RunGenerationInput): boolean {
  if (input.generationPlan === "PREMIUM") return false;
  return input.plan.some(
    (item) =>
      item.subType === "GRAMMAR_ERROR" &&
      item.count > 0 &&
      readQuestionTypeDifficultySetting(
        input.typeSettings?.GRAMMAR_ERROR,
        input.diffLabel,
      ) === "KILLER",
  );
}

// 미끼(디코이)만 교체하면 해소되는 위반의 판정(GRAMMAR_DECOY_ONLY_REPAIRABLE_CODES
// +adjacent-sv 미끼 발화 구분)은 question-repair.ts 의 단일 소스
// isDecoyOnlyRepairableGrammarIssue 를 쓴다 — 발동 판정(여기)과 repair 프롬프트의
// 범위 제한(저쪽)이 어긋나면 안 되기 때문. 정답·설계는 무결하므로 전체 재생성
// (~40k tok) 대신 린 교정 호출(~4k)이 정확한 처방이다 (26-07-06 스윕: PREM-K
// 4/4런에서 answer-point-repeated 단독 반려가 전액 재생성을 유발).

function shouldAttemptCandidateRepair(
  subType: string,
  issues: QuestionQualityIssue[],
): boolean {
  if (subType !== "GRAMMAR_ERROR") return true;
  if (issues.length === 0) return true;
  // 디코이 전용 위반만 있으면 설계 보존 교정이 가능 — NOT_WORTH_REPAIR 에
  // 앞서 허용한다 (rescue 코드셋 경유로 point-repeated·adjacent-sv-agreement 가
  // 금지목록에 포함됨). adjacent-sv-agreement 는 미끼 발화만 여기 해당하고
  // 정답 발화는 아래 금지목록 검사로 떨어져 재생성 경로를 유지한다.
  if (issues.every((issue) => isDecoyOnlyRepairableGrammarIssue(issue))) {
    return true;
  }
  return !issues.every((issue) =>
    GRAMMAR_DESIGN_ISSUES_NOT_WORTH_REPAIR.has(issue.code),
  );
}

function shouldRunStandardGrammarKillerRescue(
  input: RunGenerationInput,
  rejectionRecorder: RejectionRecorder,
): boolean {
  if (input.plan.length !== 1 || input.plan[0]?.subType !== "GRAMMAR_ERROR") {
    return false;
  }
  if (!isStandardGrammarKillerRequest(input)) return false;

  const qualityIssues = rejectionRecorder.issues.filter(
    (issue) => issue.phase === "quality" && issue.subType === "GRAMMAR_ERROR",
  );
  if (qualityIssues.length === 0) return false;
  return qualityIssues.every(
    (issue) =>
      Array.isArray(issue.codes) &&
      issue.codes.length > 0 &&
      issue.codes.every((code) =>
        STANDARD_GRAMMAR_KILLER_RESCUE_CODES.has(code),
      ),
  );
}

function buildStandardGrammarKillerRescueInput(
  input: RunGenerationInput,
): RunGenerationInput {
  const rawGrammarSettings = input.typeSettings?.GRAMMAR_ERROR;
  const grammarSettings = isRecord(rawGrammarSettings) ? rawGrammarSettings : {};
  return {
    ...input,
    typeSettings: {
      ...(input.typeSettings ?? {}),
      GRAMMAR_ERROR: {
        ...grammarSettings,
        difficulty: "INTERMEDIATE",
      },
    },
    customPrompt: [
      input.customPrompt,
      "STANDARD GRAMMAR_ERROR KILLER rescue: previous KILLER attempts found only shallow/local targets in this passage. Generate one strong INTERMEDIATE grammar item instead of failing. Keep every answer locally plausible, source-backed, and structurally meaningful; do not label the item as KILLER.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
// ─────────────────────────────────────────────────────────────────────────────
// 교사 지정 출제 포인트("포인트 짚어주기") 서버 소비 — point-picker-design.md §2
// 서버 소비 1~3단계. 유형별 생성 직전에 questionTypeSettings[subType].teacherPoints 를
//   (1) 방어적 파싱: 배열 아님·하드캡(12) 초과 payload 는 통째로 무시(클라 계약
//       위반 = 미신뢰), 항목 단위 형상 불량은 그 항목만 드롭.
//   (2) 축자 재앵커링: 클라 오프셋은 신뢰하지 않고, 엔진 입구에서 정규화된
//       passageContent 기준 indexOf(anchorVerbatimText)로 다시 찾는다. 실패
//       항목은 드롭+로그(비차단 — 나머지 포인트는 계속 사용).
//   (3) 유형 상한 클램프: clampTeacherPoints(point-picker-config 단일 소스) —
//       미등재 유형·중복 text·상한 초과분이 여기서 정리된다.
// 결과는 프롬프트 빌더의 `teacherPoints` 파라미터로만 전달한다. AI 플랜의
// targetPoints(분석 포인트)와는 완전히 별개 채널이며 병존 가능하다.
// ─────────────────────────────────────────────────────────────────────────────

function isTeacherPointUnitValue(value: unknown): value is TeacherPointUnit {
  return (TEACHER_POINT_UNITS as readonly unknown[]).includes(value);
}

/** 로그용 축약 — 재앵커링 실패 텍스트가 길면 앞 60자만 남긴다. */
function previewTeacherPointText(text: string): string {
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

function resolveTeacherPointsForType(
  subType: string,
  rawTypeSettings: unknown,
  passageContent: string,
): TeacherPointPayload[] {
  const raw = isRecord(rawTypeSettings)
    ? rawTypeSettings.teacherPoints
    : undefined;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    console.warn(
      `[AUTO-GEN] ${subType} teacherPoints ignored: expected an array.`,
    );
    return [];
  }
  if (raw.length > TEACHER_POINTS_HARD_CAP) {
    console.warn(
      `[AUTO-GEN] ${subType} teacherPoints ignored: ${raw.length} items exceed the hard cap (${TEACHER_POINTS_HARD_CAP}).`,
    );
    return [];
  }
  const parsed: TeacherPointPayload[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const { text, unit, tag, note } = item;
    if (typeof text !== "string" || text.trim().length === 0) continue;
    if (!isTeacherPointUnitValue(unit)) continue;
    const payload: TeacherPointPayload = { text, unit };
    if (typeof tag === "string" && tag.trim().length > 0) payload.tag = tag;
    if (typeof note === "string" && note.trim().length > 0) payload.note = note;
    parsed.push(payload);
  }
  if (parsed.length === 0) return [];
  // 재앵커링은 원문 그대로 1차, 공백 접기 2차 — 엔진 입구 정규화(NBSP·연속 공백
  // 접기)로 클라 선택 원문과 어긋난 항목을 구제한다. 단어 경계로 스냅된 지문 축자
  // 슬라이스를 최종 text 로 써서 프롬프트 인용이 항상 지문에 실재함을 보장한다.
  const tokenized = tokenizePassage(passageContent);
  const anchored: TeacherPointPayload[] = [];
  for (const point of parsed) {
    const snapped =
      anchorVerbatimText(tokenized, point.text) ??
      anchorVerbatimText(tokenized, point.text.replace(/\s+/g, " ").trim());
    if (!snapped) {
      console.warn(
        `[AUTO-GEN] ${subType} teacher point dropped (re-anchor failed): "${previewTeacherPointText(point.text)}"`,
      );
      continue;
    }
    anchored.push({ ...point, text: snapped.text });
  }
  if (anchored.length === 0) return [];
  return clampTeacherPoints(subType, rawTypeSettings, anchored);
}

export async function runQuestionGeneration(
  {
    plan,
    schoolType,
    gradeInfo,
    passageContent: rawPassageContent,
    teacherIntentBlock,
    analysisContext,
    diffLabel,
    diffInstruction,
    // 이원 티어(26-07-20): top-level generationPlan(호출자=사용자 선택)이 라우팅의
    // 1차 입력이다 — 진입점이 normalize+유형별 저장 설정까지 반영해 넘긴다.
    // 하류 소비: 모델 매핑·프롬프트 표면·토큰 상한·어법 사다리·검수리/E-gate 모드.
    // KO(국어) 유형만 아래에서 STANDARD 로 동결된다(개편 범위 밖).
    generationPlan,
    customPrompt,
    typeSettings,
    diversity,
    koPassageKind,
    onModelUsage,
  }: RunGenerationInput,
  {
    qualityMode = "strict",
    rejectionRecorder,
    attemptIndex = 0,
    previousAttemptFeedback,
    deadlineAt,
    deferExplanationVerify = false,
  }: {
    qualityMode?: QualityMode;
    rejectionRecorder?: RejectionRecorder;
    /** 재시도 회차 (0-based) — 다양성 스티어링 위치가 재시도마다 바뀌게 한다. */
    attemptIndex?: number;
    /** 직전 시도의 거절 사유 — 다음 프롬프트에 교정 지시로 주입(맹목 재시도 방지). */
    previousAttemptFeedback?: string;
    /** 시간예산 데드라인(epoch ms) — provider 호출 abort 를 남은예산으로 좁힌다. */
    deadlineAt?: number;
    /**
     * true 면 인라인 해설 사실검증 E-gate 를 호출하지 않고 문항을 PENDING 으로만
     * 표시한다 — async 워커(workbench-explanation-verify)가 임계경로 밖에서 이어받아
     * 검증/수리한다. fast 라우트가 켠다(느린 grok 검증이 인라인 데드라인을 넘겨
     * fail-open 되던 O153 회귀 차단).
     */
    deferExplanationVerify?: boolean;
  } = {},
): Promise<Record<string, unknown>[]> {
  const researchSingleShotProfileActive =
    isQuestionGenerationResearchSingleShotProfileActive();
  if (researchSingleShotProfileActive) {
    const [profileItem] = plan;
    if (
      plan.length !== 1 ||
      !profileItem ||
      profileItem.count !== 1 ||
      profileItem.targetPoints.length > 0 ||
      teacherIntentBlock.trim().length > 0 ||
      customPrompt?.trim() ||
      diversity !== undefined ||
      qualityMode !== "strict" ||
      attemptIndex !== 0 ||
      previousAttemptFeedback?.trim()
    ) {
      throw new Error(
        "research prompt profile requires one strict count-1 assignment with no prompt or retry drift",
      );
    }
  }
  // NBSP·빈줄 잔재가 모델 출력(원문 복사 스팬)과 게이트 문자열 비교, 저장본
  // 렌더링까지 전파되므로 엔진 입구에서 한 번 정규화한다.
  // 추가: 지문에 이미 들어있는 밑줄 런(`____` 빈칸·이중언어 워크시트 잔재)은 마커
  // (`__(A) ...__`) 카운트·렌더를 오염시킨다 — 긴/워크시트 지문 GRAMMAR 마커가
  // "5개 기대, 24개 렌더"로 결정론적 소진하던 실측 원인. 엔진 입구에서 제거해
  // 모델·후처리·게이트가 모두 깨끗한 지문을 보게 한다(전 마커 유형 공통).
  const passageContent = normalizePassageWhitespace(rawPassageContent)
    .replace(/_{2,}/g, " ")
    .replace(/[ \t]{2,}/g, " ");
  const generatedGroups = await Promise.all(
    plan.map(async (item) => {
      const { subType, count: typeCount, targetPoints } = item;
      const researchQuestionCount =
        getQuestionGenerationResearchExpectedQuestionCount();
      if (researchQuestionCount !== undefined) {
        if (!Number.isSafeInteger(typeCount) || typeCount <= 0) {
          throw new Error(
            `research ${subType} count must be a positive safe integer`,
          );
        }
        if (typeCount !== researchQuestionCount) {
          throw new Error(
            `research ${subType} count ${typeCount} differs from sealed count ${researchQuestionCount}`,
          );
        }
      }
      if (typeCount <= 0) return [];
      const expectedTypeCount = Math.max(1, Math.floor(Number(typeCount) || 1));
      const rawTypeSettings = typeSettings?.[subType];
      const effectiveDiffLabel = readQuestionTypeDifficultySetting(
        rawTypeSettings,
        diffLabel,
      );
      // difficulty 미전파 수정(26-07-14 round-1 ⑤): 정식 3티어(BASIC/INTERMEDIATE/
      // KILLER) 밖의 요청 라벨(예: 실험 하니스의 ADVANCED)은 위 normalize 가
      // INTERMEDIATE 로 접는다 — 프롬프트·게이트는 접힌 값으로 구동하는 게 맞지만,
      // 저장 question.difficulty 까지 접혀 요청-저장 불일치(difficulty-mismatch
      // warning 10건 실측)가 남았다. 저장 라벨만 요청 원문을 보존한다(정식 티어
      // 요청은 두 값이 같아 기존 동작과 바이트 동일).
      const requestedDiffRaw = String(
        (isRecord(rawTypeSettings) && rawTypeSettings.difficulty !== undefined
          ? rawTypeSettings.difficulty
          : diffLabel) ?? "",
      )
        .trim()
        .toUpperCase();
      const storedDiffLabel = /^[A-Z][A-Z_]{2,23}$/.test(requestedDiffRaw)
        ? requestedDiffRaw
        : effectiveDiffLabel;
      const effectiveDiffInstruction =
        DIFF_DESCRIPTION[effectiveDiffLabel] || diffInstruction;
      // KO(국어) 유형은 이원 티어 개편 동결 대상 — 아래 플랜/모델 결정이 참조한다.
      // 연구 런타임 활성 시에는 동결을 풀어 호출자 플랜을 존중한다(구 클램프의
      // 게이트 정정 계승 — KO 프리미엄 비교 실험이 침묵 무력화되지 않게).
      const koTypeFrozenStandard =
        isKoQuestionType(subType) && !hasQuestionGenerationResearchRuntime();
      // ── 이원 티어 라우팅 값 소비부 (26-07-20, W2-E 유형 클램프 해체) ─────────
      // 캠페인 O197~O201 확정 아키텍처: 모델은 전 유형 flash3 로 통일되고, 티어는
      // 파이프라인 무게를 고른다 — STANDARD = 생성+통합 검수리 2콜(+결정형 게이트),
      // PREMIUM = 풀 파이프라인(어법 사다리·솔버·E-gate). 유형→플랜 강제
      // (resolveUnifiedGenerationPlan 클램프)를 해체하고 호출자(사용자 선택) 플랜을
      // 존중한다. 하류 전부(프롬프트·토큰 상한·어법 사다리·검수리/E-gate 모드·
      // _generationPlan 스탬프)가 이 값을 소비한다.
      // KO(국어) 예외: KO 서브시스템은 이번 개편 범위 밖 — 기존 프로덕션 동작
      // (항상 STANDARD 레인 + 레거시 표준 모델)을 그대로 동결한다.
      const effectiveGenerationPlan: QuestionGenerationPlan = koTypeFrozenStandard
        ? "STANDARD"
        : generationPlan;

      console.log(
        `[AUTO-GEN] Step 2: Generating ${subType} x${typeCount} via ${effectiveGenerationPlan} plan (${effectiveDiffLabel})...`,
      );

      const typePrompt =
        STRUCTURED_TYPE_PROMPTS[subType] ||
        `${subType} 유형의 문제를 만드세요.`;
      const typeQualityRubric = getTypeQualityRubric(
        subType,
        effectiveDiffLabel,
      );

      const resolvedTypeSettings = resolveQuestionTypeGenerationSettings(
        subType,
        rawTypeSettings,
        // 전역 난이도 전달 — 유형별 오버라이드가 없을 때 SUMMARY_WRITING 프리셋·배점이
        // effectiveDiffLabel(모델 지시·question.difficulty)과 같은 난이도로 정렬되게 한다.
        effectiveDiffLabel,
      );
      const {
        effectiveTypeSettings,
        irrelevantSlotCount,
        grammarMarkerCount,
        grammarAnswerCount,
        grammarPointFocus,
        grammarCorrectionErrorCount,
        summaryCompleteMcBlankCount,
        summaryCompleteBlankCount,
        contentMatchOptionCount,
        contentMatchAnswerCount,
        contentMatchType,
        vocabChoiceMarkerCount,
        vocabChoiceAnswerCount,
        sentenceInsertSlotCount,
        antonymPairCount,
        blankInferenceBlankCount,
        blankInferenceDoubleNegative,
        blankInferenceParaphraseAnswer,
        blankInferenceGranularity,
        blankPointFocus,
        sentenceInsertPointFocus,
        irrelevantPointFocus,
        sentenceOrderPointFocus,
        genericOptionCount,
        genericAnswerCount,
        answerPolarity,
      } = resolvedTypeSettings;

      // ── 미끼 스페어 과잉생성 (26-07-06 1회호출 캠페인 Wave 3-lite) ──────────
      // KILLER 어법(단일 정답)은 생성 G = 검증 K + 1 로 미끼를 1개 더 받아,
      // 조합 위반(정답 pointCode 반복 등) 미끼를 trimGrammarDecoySurplus 가
      // 후처리 직전에 결정론 드랍한다 — "미끼 1개 불량 → 전체 재생성" 루프의
      // 0-콜 대체. 검증·결핍판정·반려샘플은 계속 K 기준이라 게이트 계약 불변.
      const grammarDecoySurplusActive =
        subType === "GRAMMAR_ERROR" &&
        effectiveDiffLabel === "KILLER" &&
        (grammarAnswerCount ?? 1) === 1;
      const generatedGrammarMarkerCount = grammarDecoySurplusActive
        ? Math.min(10, (grammarMarkerCount ?? 5) + 1)
        : grammarMarkerCount;
      const generationTypeSettings = grammarDecoySurplusActive
        ? {
            ...(isRecord(effectiveTypeSettings) ? effectiveTypeSettings : {}),
            markerCount: generatedGrammarMarkerCount,
          }
        : effectiveTypeSettings;

      const typeSettingsPrompt = buildQuestionTypeSettingsPrompt(
        subType,
        generationTypeSettings,
        // 동일 전역 난이도 — EXACT-direction 프롬프트가 resolve 결과(발문·배점)와 일치하도록.
        effectiveDiffLabel,
      );
      const diversitySignals = diversity?.bySubType?.[subType];
      // 재시도마다 다른 위치/후보 순서를 받도록 attempt 오프셋을 가산한다
      // (배치 간 간격은 variantCount 만큼 벌려 동일 배치 내 충돌 방지).
      // variantIndex 미지정(단건)은 그대로 두면 무작위 오프셋이 매 호출 적용된다.
      const effectiveVariantIndex =
        typeof diversity?.variantIndex === "number"
          ? diversity.variantIndex +
            attemptIndex * Math.max(1, Math.floor(diversity.variantCount ?? 1))
          : undefined;
      const diversityPromptBlock = diversity
        ? buildDiversityPromptBlock(subType, diversitySignals, effectiveVariantIndex, {
            sentenceInsertSlotCount,
            vocabChoiceMarkerCount,
            vocabChoiceAnswerCount,
            antonymPairCount,
            grammarMarkerCount: generatedGrammarMarkerCount,
            grammarAnswerCount,
          })
        : "";
      const mergedCustomPrompt = mergeCustomPromptWithTypeSettings(
        customPrompt,
        [typeSettingsPrompt, diversityPromptBlock].filter(Boolean).join("\n\n"),
      );
      const targetCandidateBlock = buildQuestionTargetCandidateBlock(
        subType,
        passageContent,
        {
          irrelevantSlotCount,
          grammarMarkerCount: generatedGrammarMarkerCount,
          grammarScarcityBaseCount: grammarMarkerCount,
          grammarAnswerCount,
          // 연구 프로필 G4: 후보 블록을 diet 변형으로 빌드 (프로덕션 기본 무영향).
          grammarCandidateBlockVariant:
            getQuestionGenerationResearchPromptProfileId() ===
            QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G4_DIET_GUARDED
              ? "diet"
              : undefined,
          grammarCorrectionErrorCount,
          antonymPairCount,
          blankInferenceBlankCount,
          blankInferenceParaphraseAnswer,
          blankInferenceDoubleNegative,
          requestedDifficulty: effectiveDiffLabel,
          usedTargets: diversitySignals?.usedTargets,
          usedAnswerLabels: diversitySignals?.usedAnswerLabels,
          usedPointCodes: diversitySignals?.usedPointCodes,
          variantIndex: effectiveVariantIndex,
          diversityEnabled: !!diversity,
          // 어법류=grammarPointFocus, 빈칸=blankPointFocus, 문장삽입=
          // sentenceInsertPointFocus, 무관문장=irrelevantPointFocus, 글의순서=
          // sentenceOrderPointFocus — 리졸버가 subType별로만 세팅하므로 상호배타.
          pointFocus:
            grammarPointFocus ??
            blankPointFocus ??
            sentenceInsertPointFocus ??
            irrelevantPointFocus ??
            sentenceOrderPointFocus,
        },
      );
      // 교사 지정 출제 포인트(§2 1~3단계) — 파싱→축자 재앵커링→유형 클램프를
      // 마친 목록. AI 플랜 targetPoints 와 혼동 금지: 서로 다른 채널이며, 프롬프트
      // 빌더에는 별도 `teacherPoints` 파라미터로만 전달한다. 미지정(대부분의
      // 요청)이면 빈 배열 → 프롬프트 바이트 동일(기존 동작 무영향).
      const teacherPoints = resolveTeacherPointsForType(
        subType,
        rawTypeSettings,
        passageContent,
      );
      if (teacherPoints.length > 0) {
        console.log(
          `[AUTO-GEN] ${subType}: ${teacherPoints.length} teacher point(s) anchored for prompt injection.`,
        );
      }
      // ── KO(국어) 유형 컨텍스트 — KO_ 게이트 전 지점이 공유한다 ─────────────
      // koMod: 레지스트리 모듈(셔플 exempt·솔버 게이트 판정), koResolved: examMode
      // 등 정규화 설정, koKind: 호출자가 전달한 지문 갈래. 영어 유형은 전부 null.
      const koMod = isKoQuestionType(subType) ? getKoTypeModule(subType) : null;
      const koResolved = koMod
        ? readKoResolvedSettings(subType, rawTypeSettings)
        : null;
      const koKind: KoPassageKind | null =
        koMod && koPassageKind && koPassageKind in KO_PASSAGE_KIND_LABELS
          ? (koPassageKind as KoPassageKind)
          : null;

      // S3i 경량 생성 계약 발동 판정(26-07-21, O204 후속) — 실험이 검증한 표준
      // 형상(단일 빈칸 / 어법 5마커·정답1)의 스탠다드 레인만. 그 외 형상·유형·
      // KO·연구 프로필은 기존 컴팩트 프롬프트 유지. env STANDARD_LEAN_CONTRACT=off
      // 로 즉시 롤백 가능. 경량 계약의 안전망 = 결정형 게이트 + 검수리 콜.
      const useStandardLeanContract =
        effectiveGenerationPlan === "STANDARD" &&
        !koTypeFrozenStandard &&
        !researchSingleShotProfileActive &&
        process.env.STANDARD_LEAN_CONTRACT?.trim().toLowerCase() !== "off" &&
        ((subType === "BLANK_INFERENCE" &&
          (blankInferenceBlankCount ?? 1) === 1) ||
          (subType === "GRAMMAR_ERROR" &&
            (grammarMarkerCount ?? 5) === 5 &&
            (grammarAnswerCount ?? 1) === 1));

      const hasAiSchema = !!AI_QUESTION_SCHEMAS[subType];
      const isStructured = hasAiSchema || !!QUESTION_SCHEMAS[subType];
      // SUMMARY_WRITING(요약문 영작)은 SUMMARY_COMPLETE 의 blankCount 경로를 미러한다.
      // 동적 빌더(buildSummaryWritingSchema)가 (A)~(C) 라벨 enum·blanks.length 를
      // blankCount(1~3)로 고정하도록 getAiResponseSchema 에 전달. PASSTHROUGH 라
      // 후처리 분기는 불필요(스키마 검증만으로 충분).
      const summaryWritingBlankCount =
        subType === "SUMMARY_WRITING"
          ? readSummaryWritingBlankCountSetting(rawTypeSettings)
          : undefined;
      // TOPIC_SENTENCE_WRITING(주제문 영작) cloze 모드도 blankCount(1~2) 동적 스키마를 미러.
      const topicSentenceWritingBlankCount =
        subType === "TOPIC_SENTENCE_WRITING"
          ? readTopicSentenceWritingBlankCountSetting(rawTypeSettings)
          : undefined;
      const baseResponseSchema = hasAiSchema
        ? getAiResponseSchema(subType, {
            irrelevantSlotCount,
            grammarMarkerCount: generatedGrammarMarkerCount,
            grammarAnswerCount,
            grammarCorrectionErrorCount,
            summaryCompleteMcBlankCount,
            summaryCompleteBlankCount,
            summaryWritingBlankCount,
            topicSentenceWritingBlankCount,
            contentMatchOptionCount,
            contentMatchAnswerCount,
            vocabChoiceMarkerCount,
            vocabChoiceAnswerCount,
            sentenceInsertSlotCount,
            antonymPairCount,
            blankInferenceBlankCount,
            genericOptionCount,
            genericAnswerCount,
            expectedQuestionCount: expectedTypeCount,
          })
        : isStructured
          ? buildResearchAwareQuestionResponseSchema(
              QUESTION_SCHEMAS[subType],
              { expectedQuestionCount: expectedTypeCount },
            )
          : fallbackResponseSchema;
      const responseSchema = buildQuestionGenerationResearchProfileResponseSchema(
        baseResponseSchema,
        {
          subType,
          plan: effectiveGenerationPlan,
          grammarMarkerCount: generatedGrammarMarkerCount,
          grammarAnswerCount,
          blankInferenceBlankCount,
        },
      );

      const structuredInstructions = isStructured
        ? STRUCTURED_OUTPUT_INSTRUCTIONS
        : UNSTRUCTURED_OUTPUT_INSTRUCTIONS;
      const perQuestionTokenFloor = getQuestionTypeGenerationTokenFloor(
        subType,
        resolvedTypeSettings,
      );

      try {
        // KO_ 게이트: 국어 유형은 buildKoGenerationPrompt(동일 {system?, prompt}
        // 반환형 — PREMIUM anthropic 캐시 경로 재사용)로 위임. 영어 빌더는 무접촉.
        const researchPromptSurface =
          applyQuestionGenerationResearchPromptProfile(
            {
              typePrompt,
              typeQualityRubric,
              targetCandidateBlock,
              finalChecklist:
                subType === "GRAMMAR_ERROR"
                  ? GRAMMAR_ERROR_FINAL_CHECKLIST
                  : undefined,
              customPrompt: previousAttemptFeedback
                ? [mergedCustomPrompt, previousAttemptFeedback]
                    .filter(Boolean)
                    .join("\n\n")
                : mergedCustomPrompt,
            },
            { subType, plan: effectiveGenerationPlan },
          );
        const generationPromptInput = {
          schoolType,
          gradeInfo,
          passageContent,
          teacherIntentBlock,
          analysisContext,
          targetPoints,
          typePrompt: researchPromptSurface.typePrompt,
          structuredInstructions,
          targetCandidateBlock: researchPromptSurface.targetCandidateBlock,
          typeQualityRubric: researchPromptSurface.typeQualityRubric,
          typeCount,
          diffLabel: effectiveDiffLabel,
          diffInstruction: effectiveDiffInstruction,
          generationPlan: effectiveGenerationPlan,
          subType,
          finalChecklist: researchPromptSurface.finalChecklist,
          standardContractScope: researchPromptSurface.standardContractScope,
          // 교사 지정 출제 포인트 — targetPoints(AI 플랜)와 별개 파라미터.
          // prompts.ts 가 "## 교사 지정 출제 포인트 (필수 반영)" 블록으로 소비.
          teacherPoints,
          customPrompt: researchPromptSurface.customPrompt,
          useStandardLeanContract,
        };
        const { system: generationSystem, prompt: generationPrompt } = koMod
          ? buildKoGenerationPrompt({
              ...generationPromptInput,
              examMode: koResolved?.examMode,
              passageKindLabel: koKind
                ? KO_PASSAGE_KIND_LABELS[koKind]
                : undefined,
            })
          : buildGenerationPrompt(generationPromptInput);
        // KO-EN-REG-1: 무게이트 PREMIUM 바닥 절은 영어 PREMIUM 기본 floor(4_096)를
        // 올리는 무회귀 위반이라 제거(원식 환원). 단 KO+PREMIUM 은 16_384 바닥이
        // 필요하다 — 실측(26-07-03 PREMIUM 스윕 6/7 생성실패): sonnet-5 는 flash 보다
        // 장문이라 KO 봉투(자료·근거앵커 5개·오답해설 4개)가 8_192 에서 JSON 이
        // 중간에 잘려 AI_TypeValidationError 로 전멸한다. koMod 게이트라 영어 경로는
        // byte 불변.
        const generationMaxTokens = Math.min(
          20_000,
          Math.max(
            perQuestionTokenFloor,
            (Number(typeCount) || 1) * perQuestionTokenFloor,
            koMod && effectiveGenerationPlan === "PREMIUM" ? 16_384 : 0,
          ),
        );
        const standardGrammarTokenCap =
          subType === "GRAMMAR_ERROR" && effectiveGenerationPlan !== "PREMIUM"
            ? Math.min(
                20_000,
                Math.max(
                  // 경량 계약(고사고)은 사고 토큰이 출력 예산을 공유하므로 실험
                  // 실측 상한(16k)을 쓴다 — 12k 면 사고가 출력분을 잠식해 절단.
                  useStandardLeanContract
                    ? 16_000
                    : effectiveDiffLabel === "KILLER"
                      ? 12_000
                      : 8_192,
                  (Number(typeCount) || 1) *
                    (useStandardLeanContract
                      ? 16_000
                      : effectiveDiffLabel === "KILLER"
                        ? 12_000
                        : 8_192),
                ),
              )
            : generationMaxTokens;
        // PREMIUM 어법: 20k 바닥은 폭주 생성이 180s abort 까지 달리게 한다
        // (실측 26-07-04 스윕: PREMIUM 타임아웃 3/8, 베이스라인도 동율 — 기존 지병).
        // 단일 어법 문항(마커≤10·오답해설≤9·errorDesign 포함)은 12k로 충분 —
        // 출력 상한으로 생성 시간 꼬리를 잘라 타임아웃 확률을 낮춘다.
        const premiumGrammarTokenCap =
          subType === "GRAMMAR_ERROR" && effectiveGenerationPlan === "PREMIUM"
            ? Math.min(
                20_000,
                Math.max(12_000, (Number(typeCount) || 1) * 12_000),
              )
            : generationMaxTokens;
        const researchProfileMaxOutputTokens =
          getQuestionGenerationResearchPromptProfileMaxOutputTokens();
        const effectiveGenerationMaxTokens = Math.min(
          generationMaxTokens,
          standardGrammarTokenCap,
          premiumGrammarTokenCap,
          researchProfileMaxOutputTokens ?? Number.POSITIVE_INFINITY,
        );
        // Wave-3 TIMEOUT-RCA(26-07-05 실측): sonnet-5(OpenRouter) strict 구조화
        // 출력이 SUMMARY_WRITING/TOPIC_SENTENCE_WRITING 봉투(옵션·enum 필드 20여
        // 개)에서 스키마 기인으로 전멸한다 — 응답 없이 180s abort 되거나 masked
        // 400("Provider returned error"). A/B 프로브: 동일 미니 프롬프트가 trivial
        // 스키마 8s vs SW/TSW 봉투 90s abort. STANDARD(Gemini)는 정상이므로
        // PREMIUM 만 프롬프트 인라인 JSON 모드로 직행한다(zod 클라이언트 검증 +
        // 하류 품질게이트 재검증 — grammar-too-large 폴백과 동일 계약).
        // 26-07-14 모델 교체 반영: 위 전멸은 Anthropic strict json_schema 전용
        // 결함이라, PREMIUM 문제생성 기본 모델이 gemini-3.1-pro-preview 로 바뀐
        // 뒤에는 STANDARD(Gemini)와 동일하게 strict 구조화 출력을 그대로 쓴다.
        // env(PREMIUM_QGEN_MODEL_ID)로 Claude 로 롤백한 경우에만 재발동한다 —
        // 만에 하나 gemini 가 이 봉투를 거부해도 masked-400/grammar-too-large
        // 오류 트리거 JSON 폴백이 기존대로 받아낸다.
        const premiumForceJsonFallback =
          effectiveGenerationPlan === "PREMIUM" &&
          isAtlasClaudeModel(ATLAS_PREMIUM_QGEN_MODEL_ID) &&
          (subType === "SUMMARY_WRITING" ||
            subType === "TOPIC_SENTENCE_WRITING");

        // 후보 1개를 정규화→후처리→매핑→셔플→품질검증까지 끝내 "확정"한다. SHIP-FIRST
        // repair(교정 재생성)에서 재검증에 그대로 재사용하기 위해 인라인 함수로 추출한다
        // (루프 스코프 변수 캡처). 동작은 추출 전과 동일. 어법 프리미엄 사다리(P1)의
        // finalize 콜백도 이 함수를 재사용한다 — 게이트 판정 단일 소스(계약서 §1·§3).
        const finalizeCandidate = (
          rawQ: Record<string, unknown>,
        ):
          | {
              ok: true;
              finalQuestion: Record<string, unknown>;
              blockingErrors: QuestionQualityIssue[];
              allWarnings: QuestionQualityIssue[];
              hasRelaxedWarnings: boolean;
              normalizedDraft: Record<string, unknown>;
            }
          | { ok: false; error: string; normalizedDraft: Record<string, unknown> } => {
          // 과거에는 "BLANK_INFERENCE 의 typeSettings 프롬프트 존재 = 부정-부정"이었지만,
          // 언어/다중빈칸 블록이 생기면서 그 프록시가 깨졌다. resolved 플래그로만 판정한다.
          // KILLER 빈칸(비DN)은 교사 옵트인(paraphraseAnswer)과 무관하게 PARAPHRASE
          // 모드를 강제한다 — 과거에는 이 자리에서 SOURCE_EXACT 로 강제하고 후처리가
          // 정답 선지를 원문 verbatim 으로 재작성해, DIFFICULTY_RUBRIC 의 "정답은 원문
          // 복사가 아닌 추상 패러프레이즈" 지시와 정면 모순이었다(추론 없이 풀려 KILLER
          // 미성립). paraphraseAnswer 설정은 옵트인 true 만 존재(readBooleanSetting 이
          // true 외 값을 전부 false 로 접음)하므로 "명시적 false 존중" 분기는 불가능하고
          // 필요도 없다. BASIC/INTERMEDIATE 는 기존 동작 유지(옵트인 없으면 SOURCE_EXACT).
          // 26-07-06: 단일빈칸 한정(count===1)을 제거 — 다중빈칸 KILLER 도 강제.
          // 근거: 전수 실측에서 blankCount=2 KILLER 가 45~65 로 전 매트릭스 최저였고
          // 원인이 "정답 조합 verbatim-by-design"(베껴 즉답)이었다. 옵트인 경로
          // (paraphraseAnswer=true)가 이미 다중빈칸 PARAPHRASE 를 지원하므로 배관 동일.
          // 26-07-06(2차): INTERMEDIATE 로도 확장 — 다지문 스윕 실측에서 STANDARD
          // INT 빈칸의 fatal 7/8 이 전부 "정답=원문 verbatim 복사(후처리 강제)라
          // 본문 대조만으로 풀림 + 해설은 패러프레이즈 서사(내적 모순)"였다.
          // BASIC 은 SOURCE_EXACT 유지(기초 난이도 계약).
          const forceKillerBlankParaphrase =
            subType === "BLANK_INFERENCE" &&
            (effectiveDiffLabel === "KILLER" || effectiveDiffLabel === "INTERMEDIATE") &&
            !resolvedTypeSettings.blankInferenceDoubleNegative;
          const normalizedBeforeTrim: Record<string, unknown> =
            subType === "BLANK_INFERENCE" &&
            resolvedTypeSettings.blankInferenceDoubleNegative
              ? { ...rawQ, blankAnswerMode: "DOUBLE_NEGATIVE" }
              : subType === "BLANK_INFERENCE" &&
                  (resolvedTypeSettings.blankInferenceParaphraseAnswer ||
                    forceKillerBlankParaphrase)
                ? { ...rawQ, blankAnswerMode: "PARAPHRASE" }
                : subType === "BLANK_INFERENCE" &&
                    (resolvedTypeSettings.blankInferenceBlankCount ?? 1) === 1
                  ? { ...rawQ, blankAnswerMode: "SOURCE_EXACT" }
                  : rawQ;
          // 미끼 스페어 드랍(G→K) — 후처리·검증·repair 초안·반려 샘플이 전부
          // 같은 K-좌표계를 보도록 파이프라인 진입 전에 트림한다.
          const normalizedAiQuestion: Record<string, unknown> =
            grammarDecoySurplusActive
              ? trimGrammarDecoySurplus(normalizedBeforeTrim, {
                  finalMarkerCount: grammarMarkerCount ?? 5,
                  finalAnswerCount: grammarAnswerCount ?? 1,
                })
              : normalizedBeforeTrim;
          const ppResult = postProcessQuestion(
            subType,
            passageContent,
            normalizedAiQuestion,
          );
          if (!ppResult.success) {
            return {
              ok: false,
              error: ppResult.error || "Post-process failed",
              normalizedDraft: normalizedAiQuestion,
            };
          }
          if (ppResult.warnings.length > 0) {
            console.warn(
              `[AUTO-GEN] Post-process warnings for ${subType}: ${formatIssuesForLog(
                ppResult.warnings,
              )}`,
            );
          }

          const mapped: Record<string, unknown> = {
            ...(ppResult.data as Record<string, unknown>),
            _typeId: subType,
            _typeLabel: TYPE_LABELS[subType] || subType,
            _generationPlan: effectiveGenerationPlan,
            difficulty: effectiveDiffLabel,
            // 교사 지정 출제 포인트 스탬프 — 이 문항이 어떤 포인트를 반영해
            // 만들어졌는지 문제 상세에서 재현하기 위한 기록. structuredData 에
            // 통째로 저장된다(미지정 대부분의 문항은 키 자체가 없어 무영향).
            ...(teacherPoints.length > 0 ? { _teacherPoints: teacherPoints } : {}),
          };

          // 배열 영작: scrambledWords 가 정답 어순(modelAnswer)대로 읽히면 왼→오 읽기로 풀려
          // 누수다. 기존 Math.random 1회 셔플 + 완전동일성 체크는 비결정적이고 "청크 근사정렬"
          // (예: 청크가 거의 정답 순서)을 못 막았다. TOPIC_SENTENCE_WRITING 과 동일한 결정론
          // 재배열(어간 부분수열로 어순 누수 판정 후 해시정렬→역순→회전, 멱등·칩불변)을 재사용한다.
          if (
            subType === "WORD_ORDER" &&
            Array.isArray(mapped.scrambledWords) &&
            mapped.scrambledWords.length > 1 &&
            typeof mapped.modelAnswer === "string"
          ) {
            mapped.scrambledWords = reorderChipsAwayFromAnswer(
              mapped.scrambledWords as string[],
              mapped.modelAnswer,
            );
          }

          // 주제문 영작: 보기/배열단어가 정답 어순 그대로면 누수(왼→오 읽기로 풀림). 모델
          // 셔플에만 의존하지 않고 결정론적으로 정답 어순에서 떼어 놓는다(게이트 검증 전 수행).
          if (subType === "TOPIC_SENTENCE_WRITING") {
            const reshuffled = reshuffleTopicSentenceWritingChips(mapped);
            mapped.scrambledWords = reshuffled.scrambledWords;
            mapped.wordBank = reshuffled.wordBank;
          }

          // KO(국어): ① 서버 주입 koContext — examMode·passageKind 를 LLM 에코가
          // 아니라 서버 진실로 저장하고, validateKoQuestion 이 검증 시 복원한다.
          // ② 정답 위치 결정론 셔플 — 선지-마커 1:1 유형(lockedOptionOrder)은 제외.
          // 둘 다 검증 "전"에 수행해 셔플 결과의 일관성까지 검증된다.
          if (koMod) {
            mapped.koContext = {
              examMode: koResolved?.examMode ?? "SUNEUNG",
              passageKind: koKind,
            };
            if (
              koMod.meta.answerFormat === "MC5" &&
              !koMod.meta.lockedOptionOrder
            ) {
              shuffleKoMc5Options(mapped);
            }
          }

          // 다양성 모드: 보기 배열형 유형의 보기 내용을 셔플해 정답 위치 편중을
          // 제거한다. 게이트 검증 전에 수행해 셔플 결과의 일관성까지 검증된다.
          // (KO 는 SHUFFLE_OPTION_TYPES 미등록이라 아래 호출은 무동작 통과.)
          const finalQuestion = diversity
            ? shuffleQuestionOptionsForDiversity(mapped, subType)
            : mapped;

          const qualityIssues = validateQuestionQuality({
            typeId: subType,
            question: finalQuestion,
            passage: passageContent,
            requestedDifficulty: effectiveDiffLabel,
            // 기사용 타깃 재사용 게이트는 첫 2회 시도에만 — 재시도 비용을 묶고,
            // 타깃 풀이 고갈된 지문은 이후 시도/relaxed 폴백에서 재사용을 허용.
            diversityUsedTargets:
              attemptIndex < 2 ? diversitySignals?.usedTargets : undefined,
            irrelevantSlotCount,
            grammarMarkerCount,
            grammarAnswerCount,
            grammarCorrectionErrorCount,
            stemLanguage: resolvedTypeSettings.stemLanguage,
            optionLanguage: resolvedTypeSettings.optionLanguage,
            vocabChoiceMarkerCount,
            vocabChoiceAnswerCount,
            sentenceInsertSlotCount,
            antonymPairCount,
            blankInferenceBlankCount,
            blankInferenceParaphraseAnswer,
            blankInferenceGranularity,
            genericOptionCount,
            genericAnswerCount,
            contentMatchType,
            answerPolarity,
          });
          // 교사 지정 출제 포인트 준수 게이트 — 프롬프트의 "필수 반영" 블록은
          // 지시일 뿐 모델이 무시할 수 있다(26-07-14 실측: 포인트가 주입됐는데
          // 빈칸이 엉뚱한 곳에 출제). 판정 규칙은 point-picker-config 의
          // checkTeacherPointCompliance 단일 소스 — hard 9유형(어법 3종·빈칸·
          // 어휘·반의어·문장삽입·무관문장·글의순서)은 모든 포인트가 유형 표면과
          // 겹쳐야 통과, soft(요지/주제/제목)는 의미 판단이라 게이트 없음.
          // strict 에서 반려→재시도(missing 포인트+promptRole 을 교정 지시로),
          // relaxed/scarce 는 RELAXED_BLOCKING 미등재 코드라 경고로 강등된다
          // (생성실패 절대금지 계약 유지).
          if (teacherPoints.length > 0) {
            const compliance = checkTeacherPointCompliance(
              subType,
              finalQuestion,
              teacherPoints,
            );
            if (!compliance.ok) {
              const role = POINT_PICKER_CONFIG[subType]?.promptRole ?? "";
              qualityIssues.push({
                severity: "error",
                code: "teacher-point-ignored",
                message: `교사 지정 출제 포인트가 문항에 반영되지 않았습니다: ${compliance.missing
                  .map((point) => `"${previewTeacherPointText(point.text)}"`)
                  .join(", ")}${role ? ` — ${role}` : ""}`,
              });
            }
          }
          const qualityErrors = qualityIssues.filter(
            (issue) => issue.severity === "error",
          );
          const qualityWarnings = qualityIssues.filter(
            (issue) => issue.severity === "warning",
          );
          // scarce = relaxed + 전 유형 "완성도(craft)" 게이트 추가 강등(정답
          // 유일성·누출·렌더 무결성은 유지) — never-fail 구제 사다리의 최후 모드.
          const isBlockingInMode = (issue: QuestionQualityIssue): boolean => {
            if (qualityMode === "strict") return true;
            if (!RELAXED_BLOCKING_QUALITY_CODES.has(issue.code)) return false;
            if (
              qualityMode === "scarce" &&
              SALVAGE_RELAXABLE_CODES.has(issue.code)
            ) {
              return false;
            }
            return true;
          };
          const blockingQualityErrors = qualityErrors.filter(isBlockingInMode);
          const relaxedQualityWarnings =
            qualityMode === "relaxed" || qualityMode === "scarce"
              ? qualityErrors
                  .filter((issue) => !isBlockingInMode(issue))
                  .map((issue) => ({ ...issue, severity: "warning" as const }))
              : [];
          // 요청 난이도 보존(round-1 ⑤) — 게이트 검증은 접힌 effectiveDiffLabel
          // 기준으로 끝냈으므로, 저장 라벨만 여기서 요청 원문으로 되돌린다
          // (정식 3티어 요청은 storedDiffLabel === effectiveDiffLabel 라 무동작).
          if (storedDiffLabel !== effectiveDiffLabel) {
            finalQuestion.difficulty = storedDiffLabel;
          }
          return {
            ok: true,
            finalQuestion,
            blockingErrors: blockingQualityErrors,
            allWarnings: [...qualityWarnings, ...relaxedQualityWarnings],
            hasRelaxedWarnings: relaxedQualityWarnings.length > 0,
            normalizedDraft: normalizedAiQuestion,
          };
        };

        // ── 어법 프리미엄 사다리 (P1) — docs/grammar-premium-ladder-spec.md §2·§3 ──
        // GRAMMAR_ERROR × PREMIUM(strict 레인)만 새 엔진(3콜 사다리)으로 교체한다.
        // 사다리는 5밑줄/정답1 단건 형상 전용이며(결승 실측 형상 —
        // grammar-premium-ladder.ts 계약), 교사 지정 채널(teacherPoints·
        // 지문 주석 intent·customPrompt)은 미니멀 프롬프트가 소비할 수 없으므로
        // 기존 경로를 유지한다. ⚠️pointFocus 는 제외 조건이 아니다 — 기본값 ON 인
        // UI 토글이라 조건에 넣으면 사실상 전 요청이 사다리를 우회한다(26-07-15
        // E2E 실측로 발견). 결승 실측도 pointFocus 무관 형상으로 검증됐고, 사다리의
        // 미니멀 프롬프트는 pointFocus 를 소비하지 않되 결과 품질이 focus 취지
        // (최빈출 포인트 중심)를 상회함이 채점으로 입증됨.
        // relaxed/scarce(salvage) 레인도 기존 경로 그대로 —
        // STANDARD 어법·비어법·비생성 경로는 이 분기에 진입하지 않아 바이트
        // 동일(무회귀 §2-2). diversity 회피는 finalize 게이트(validateQuestionQuality
        // 의 diversityUsedTargets)가 계속 강제하므로 사다리 대상에서 빼지 않는다.
        // ⚠️ 배포: fast/큐/트리거 3경로 공통 코드 — vercel 과 trigger.dev 워커를
        // 동시에 재배포해야 한다(§2-5).
        // 26-07-21 단일 상품: 어법 KILLER 는 플랜 무관 사다리 라우팅 — 1방 생성은
        // 게이트 반려 재시도가 지배해 190~280s(O205), 사다리는 29~64s/28~111원으로
        // 더 싸고 빠르고 품질 우위(jul17 실측 재확인). PREMIUM 잔존 경로(이원 복귀
        // 시)도 기존대로 사다리. STANDARD KILLER 사다리 수용본은 이후 통합 검수리
        // 게이트가 커버한다(E-gate 휴면).
        const useGrammarPremiumLadder =
          subType === "GRAMMAR_ERROR" &&
          (effectiveGenerationPlan === "PREMIUM" ||
            effectiveDiffLabel === "KILLER") &&
          !researchSingleShotProfileActive &&
          qualityMode === "strict" &&
          !koMod &&
          expectedTypeCount === 1 &&
          (grammarMarkerCount ?? 5) === 5 &&
          (grammarAnswerCount ?? 1) === 1 &&
          teacherPoints.length === 0 &&
          !customPrompt?.trim() &&
          !teacherIntentBlock.trim();
        const rootResearchStage = useGrammarPremiumLadder
          ? {
              key: QUESTION_GENERATION_RESEARCH_STAGES.GRAMMAR_LADDER_ANSWER_ONLY,
              purpose: "design" as const,
            }
          : premiumForceJsonFallback
            ? {
                key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_PROMPT_JSON_FALLBACK,
                purpose: "candidate" as const,
              }
            : {
                key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
                purpose: "candidate" as const,
              };
        return await runQuestionGenerationResearchOperation(
          {
            rootStage: rootResearchStage,
            subType,
            difficulty: effectiveDiffLabel,
            generationPlan: effectiveGenerationPlan,
            qualityMode,
          },
          async () => {
        const researchEnabled = hasQuestionGenerationResearchRuntime();
        let ladderAcceptedQuestion: Record<string, unknown> | null = null;
        let ladderResearchCandidate: Record<string, unknown> | null = null;
        // 사다리 finalize 콜백의 마지막 판정 전문 — 사다리 제어흐름상 마지막
        // finalize 호출이 곧 최종 후보(수용본/give-up 보존본) 판정이므로, 수용
        // 머신 합류·반려 풀 보존 시 재검증 없이 그대로 재사용한다. ref 컨테이너를
        // 쓰는 이유: 클로저 내부 할당은 TS 외부 흐름분석이 추적하지 못해(캡처된
        // let 변수) 사용처에서 null/never 로 잘못 좁혀지기 때문.
        const ladderFinRef: {
          current: ReturnType<typeof finalizeCandidate> | null;
        } = { current: null };
        if (useGrammarPremiumLadder) {
          const ladderResult = await runGrammarPremiumLadder({
            passageContent,
            difficulty: effectiveDiffLabel,
            difficultyInstruction: effectiveDiffInstruction,
            deadlineAt,
            qualityMode,
            generationPlan: effectiveGenerationPlan,
            onModelUsage,
            // 표적수리 미끼 재료 — 기존 후보 블록의 비어 있지 않은 줄(상위 15줄
            // 절단은 사다리 쪽 캡이 수행).
            repairCandidateLines: targetCandidateBlock
              ? targetCandidateBlock
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
              : undefined,
            // 게이트 판정 = 기존 finalizeCandidate 재사용(계약서 §1 "기존 결정론
            // 게이트 전체"). positions/answerRelPos 는 미제공(선택 필드) — 배치
            // 소프트 검사만 생략되고 나머지 사다리 정책은 동일하게 돈다.
            finalize: (candidateAiQuestion) => {
              const finResult = finalizeCandidate(candidateAiQuestion);
              ladderFinRef.current = finResult;
              if (!finResult.ok) {
                return {
                  ok: false,
                  error: finResult.error,
                  errors: [],
                  warnings: [],
                };
              }
              return {
                ok: true,
                question: finResult.finalQuestion,
                errors: finResult.blockingErrors.map((issue) => issue.code),
                warnings: finResult.allWarnings.map((issue) => issue.code),
              };
            },
          });
          // 사다리 이력 로그 — 재생성/수리 횟수·트리거·해소 코드·콜별 소요(실패
          // 콜 포함)를 남긴다(§2-3 관측성, "시간 블랙홀" 재발 금지).
          const ladderTrail = ladderResult.ladder
            .map((event) =>
              [
                event.action,
                event.trigger?.length ? `←${event.trigger.join("|")}` : "",
                event.resolved?.length ? ` 해소:${event.resolved.join("|")}` : "",
                event.remaining?.length ? ` 잔존:${event.remaining.join("|")}` : "",
                event.error ? ` (${event.error})` : "",
              ].join(""),
            )
            .join(" → ");
          const ladderCallsLog = ladderResult.calls
            .map(
              (call) =>
                `${call.purpose}=${call.ok ? "ok" : "FAIL"}/${(call.durationMs / 1000).toFixed(1)}s`,
            )
            .join(", ");
          console.log(
            `[AUTO-GEN] grammar-premium-ladder ${ladderResult.status} (model=${ladderResult.modelId}, regen=${ladderResult.regenerations}, repair=${ladderResult.repairs}, reasoningFallback=${ladderResult.reasoningFallback}) | trail: ${ladderTrail || "clean"} | calls: ${ladderCallsLog}`,
          );
          const ladderTriggerCodes = [
            ...new Set(
              ladderResult.ladder.flatMap((event) => event.trigger ?? []),
            ),
          ];
          if (ladderResult.status === "accepted" && ladderResult.aiQuestion) {
            ladderAcceptedQuestion = ladderResult.aiQuestion;
            ladderResearchCandidate = ladderResult.researchRawCandidate ?? null;
            // 수용 전 내부 반려(재생성/수리 트리거) 이력도 rejectionRecorder 원장에
            // 남긴다 — 기존 경로가 후보 반려마다 기록하던 관측성과 등가.
            if (ladderResult.regenerations > 0 || ladderResult.repairs > 0) {
              recordRejection(rejectionRecorder, {
                phase: "quality",
                qualityMode,
                subType,
                message: `grammar-premium-ladder internal rejections before accept | ${ladderTrail}`,
                codes: ladderTriggerCodes,
              });
            }
          } else {
            if (researchEnabled && ladderResult.researchRawCandidate) {
              await decideQuestionGenerationResearchCandidate(
                ladderResult.researchRawCandidate,
                "parsed_rejected",
              );
            }
            const giveUpReason = ladderResult.giveUpReason ?? "unknown";
            console.warn(
              `[AUTO-GEN] grammar-premium-ladder gave up (${giveUpReason}); falling back to the legacy PREMIUM generation path (never-fail §2-1).`,
            );
            const bestFin = ladderResult.bestCandidate
              ? ladderFinRef.current
              : null;
            if (bestFin?.ok) {
              recordRejection(rejectionRecorder, {
                phase: "quality",
                qualityMode,
                subType,
                message: `grammar-premium-ladder give-up (${giveUpReason}) | ${ladderTrail} | ${summarizeQualityIssues(bestFin.blockingErrors)}`,
                codes: bestFin.blockingErrors.map((issue) => issue.code),
                sample: buildRejectionSample(subType, bestFin.finalQuestion),
              });
              // never-fail(§2-1): 사다리 최선 후보를 반려 풀에 보존 — 모든 재시도
              // 소진 후 salvage 사다리가 재승인 후보로 쓴다(F급 코드 혼입 후보는
              // admitSalvageCandidatesFromPool 이 걸러낸다).
              recordRejectedCandidate(rejectionRecorder, {
                subType,
                qualityMode,
                attemptIndex,
                question: bestFin.finalQuestion,
                blockingCodes: bestFin.blockingErrors.map((issue) => issue.code),
                blockingIssues: bestFin.blockingErrors,
                warnings: bestFin.allWarnings,
              });
            } else if (bestFin) {
              recordRejection(rejectionRecorder, {
                phase: "postprocess",
                qualityMode,
                subType,
                message: `grammar-premium-ladder give-up (${giveUpReason}) | post-process failed: ${bestFin.error} | ${ladderTrail}`,
                sample: buildRejectionSample(subType, bestFin.normalizedDraft),
              });
            } else {
              recordRejection(rejectionRecorder, {
                phase: "model",
                qualityMode,
                subType,
                message: `grammar-premium-ladder give-up without candidate (${giveUpReason}) | ${ladderTrail}`,
              });
            }
          }
        }

        // 사다리 수용본은 기존 생성 콜을 대체한다(계약서 §3 — generateWithRetry
        // 대체). give-up/비대상 형상은 기존 PREMIUM/STANDARD 경로 그대로 진행
        // (never-fail §2-1 폴백 — "사다리 도입 = 생성 실패"는 어떤 경로로도 불가).
        const object = ladderAcceptedQuestion
          ? { questions: [ladderAcceptedQuestion] }
          : await generateWithRetry(
              responseSchema,
              generationPrompt,
              effectiveGenerationPlan,
              effectiveGenerationMaxTokens,
              undefined,
              (result) => {
                onModelUsage?.({
                  phase: "question_generation",
                  subType,
                  qualityMode,
                  difficulty: effectiveDiffLabel,
                  generationPlan: effectiveGenerationPlan,
                  usage: result.usage,
                  provider: result.provider,
                  modelId: result.modelId,
                  attempts: result.attempts,
                  durationMs: result.durationMs,
                });
              },
              {
                system: generationSystem,
                deadlineAt,
                forceJsonFallback: premiumForceJsonFallback,
                // KO 동결: 레거시 표준 모델(3.5-flash)·기존 60s 콜 타임아웃 유지 —
                // flash3 통일·타임아웃 상향(120s)의 범위 밖.
                // 영어 유형: 경량 계약(S3i)이면 실험 계약대로 high, 그 외에는
                // 유형별 티어(무거운 컴팩트 프롬프트의 어법·구조형은 medium —
                // O204). 전역 gemini env 미의존, env 로 모델 교체 시 자동 무시.
                modelId: koMod ? ATLAS_STANDARD_MODEL_ID : undefined,
                timeoutMs: koMod ? 60_000 : undefined,
                // 경량 계약 A/B 실측(O205): 빈칸은 lean+high 가 59s/27원(입증),
                // 어법은 lean 이어도 high 면 일부 콜이 120s 타임아웃(출력이 큼)
                // → 어법은 lean 에서도 medium 유지.
                reasoningEffort: koMod
                  ? undefined
                  : useStandardLeanContract && subType === "BLANK_INFERENCE"
                    ? process.env.QGEN_GEMINI_REASONING_EFFORT?.trim() || "high"
                    : resolveQgenReasoningEffort(subType),
                applyReasoningEffortToGemini: !koMod,
              },
            );

        const generatedQuestionsAll =
          isRecord(object) && Array.isArray(object.questions)
            ? object.questions.filter(isRecord)
            : [];
        if (generatedQuestionsAll.length !== expectedTypeCount) {
          console.warn(
            `[AUTO-GEN] ${subType} returned ${generatedQuestionsAll.length}/${expectedTypeCount} questions; trimming to requested count.`,
          );
        }
        const generatedQuestions = generatedQuestionsAll.slice(0, expectedTypeCount);
        if (
          researchEnabled &&
          !ladderAcceptedQuestion &&
          generatedQuestions.length > 0
        ) {
          await observeQuestionGenerationResearchCandidates(generatedQuestions);
        }
        const qs: Record<string, unknown>[] = [];

        for (const q of generatedQuestions) {
          let researchDecisionCandidate =
            q === ladderAcceptedQuestion
              ? ladderResearchCandidate ?? q
              : q;
          const adaptedProfileCandidate = researchSingleShotProfileActive
            ? adaptQuestionGenerationResearchProfileCandidate(q, passageContent)
            : { ok: true as const, question: q };
          if (!adaptedProfileCandidate.ok) {
            recordRejection(rejectionRecorder, {
              phase: "postprocess",
              qualityMode,
              subType,
              message: adaptedProfileCandidate.error,
              sample: buildRejectionSample(subType, q),
            });
            if (researchEnabled) {
              await decideQuestionGenerationResearchCandidate(
                researchDecisionCandidate,
                "parsed_rejected",
              );
            }
            continue;
          }
          const candidateForFinalize = adaptedProfileCandidate.question;
          // 사다리 수용 후보는 사다리의 마지막 finalize 판정을 그대로 재사용한다
          // (finalizeCandidate 는 어법에서 결정론 — 재실행과 동치, 중복 계산만 절약).
          let fin =
            q === ladderAcceptedQuestion && ladderFinRef.current
              ? ladderFinRef.current
              : finalizeCandidate(candidateForFinalize);
          if (!fin.ok) {
            console.warn(
              `[AUTO-GEN] Post-process failed for ${subType}: ${fin.error}`,
            );
            recordRejection(rejectionRecorder, {
              phase: "postprocess",
              qualityMode,
              subType,
              message: fin.error,
              sample: buildRejectionSample(subType, fin.normalizedDraft),
            });
            if (researchEnabled) {
              await decideQuestionGenerationResearchCandidate(
                researchDecisionCandidate,
                "parsed_rejected",
              );
            }
            continue;
          }

          // 사다리 수용 계약(계약서 §1): 소프트 잔존 error 는 "표적수리 1콜 후
          // 수용 — 재생성 회송 금지"(결승 롤백 실측: 회송은 품질 델타 0에 원가만
          // +45~130%)다. 잔존 코드를 경고로 강등해 기존 수용 머신(솔버게이트→
          // 경고 부착→qs.push)에 합류시킨다. 하드블록(오류 미주입·마커 미렌더·
          // nonword 등)은 사다리가 수용 전에 소거를 보장하므로 여기 남는 것은
          // 소프트 코드뿐이며, blockingErrors=0 이 되므로 바로 아래 SHIP-FIRST
          // repair 는 자동으로 건너뛴다(이중 수리 금지). 어법 솔버 게이트는 그대로
          // 통과해야 출하된다(계약서 §1 "기존 솔버 게이트 재사용").
          if (q === ladderAcceptedQuestion && fin.blockingErrors.length > 0) {
            console.warn(
              `[AUTO-GEN] grammar-premium-ladder residual soft codes demoted to warnings: ${formatIssuesForLog(
                fin.blockingErrors,
              )}`,
            );
            fin = {
              ...fin,
              blockingErrors: [],
              allWarnings: [
                ...fin.allWarnings,
                ...fin.blockingErrors.map((issue) => ({
                  ...issue,
                  severity: "warning" as const,
                })),
              ],
            };
            fin.finalQuestion._reviewRecommended = true;
          }

          // SHIP-FIRST 부분 repair: A(차단) 결함이 적으면(<=3종) 문항 전체 재생성 전에
          // "이 초안에서 이 결함만 고쳐라"로 후보당 1회 교정 재생성을 시도한다. 데드라인
          // 안에서만. 성공 시 교체, 실패 시 원래 탈락 경로로 폴백(무회귀·happy-path 0영향).
          //
          // KO 제외(KO-GEN-3): KO 는 finalize 안에서 정답 위치 셔플이 검증 "전"에
          // 무조건(비-identity) 적용되므로, blockingErrors 의 선지 라벨(①~⑤) 좌표는
          // 셔플 "후" 기준인데 repair 에 넘기는 draft(normalizedDraft)는 셔플 "전"
          // 좌표다 — LLM 이 엉뚱한 선지를 고치는 체계적 오도(LLM 1회 낭비)가 된다.
          // KO 는 strict 재시도 루프(교정 피드백 주입)가 자체 복구 경로라 skip 이
          // 부작용 최소안이다(영어 경로는 셔플 없음 — 기존 동작 그대로).
          // PREMIUM 도 repair 대상 — reasoning-off 이후 호출당 ~13-30s 라 후보당
          // 1회 교정 재생성이 데드라인(270s) 안에 충분히 들어온다(26-07-06,
          // 프리미엄 생성 실패율 완화의 일부).
          if (
            !researchSingleShotProfileActive &&
            !koMod &&
            fin.blockingErrors.length > 0 &&
            fin.blockingErrors.length <= 3 &&
            shouldAttemptCandidateRepair(subType, fin.blockingErrors) &&
            (!deadlineAt || Date.now() < deadlineAt)
          ) {
            // 수리 채택 완화(26-07-14 round-3 ②)의 스코프 판정 — question-repair 의
            // decoy-only 범위 제한 프롬프트와 같은 predicate 를 공유한다. fin 이
            // 개선본으로 재할당되기 전에 원본 기준으로 고정해 둔다.
            const decoyOnlyRepairScope =
              subType === "GRAMMAR_ERROR" &&
              fin.blockingErrors.every((issue) =>
                isDecoyOnlyRepairableGrammarIssue(issue),
              );
            const originalBlockingErrors = fin.blockingErrors;
            const repaired = await repairQuestionCandidate({
              subType,
              draft: fin.normalizedDraft,
              researchParentCandidate: researchEnabled
                ? researchDecisionCandidate
                : undefined,
              blockingIssues: fin.blockingErrors,
              passageContent,
              // 어법 decoy-only 수리의 교체 재료(26-07-14 round-3 ①) — 원 생성과
              // 동일한 후보 블록을 재주입해 "무엇으로 바꿀지"를 준다(decoy-eligible
              // 상위 후보 절단은 question-repair 쪽에서 수행).
              targetCandidateBlock,
              responseSchema,
              generationPlan: effectiveGenerationPlan,
              perQuestionTokenFloor,
              deadlineAt,
              system: generationSystem,
              forceJsonFallback: premiumForceJsonFallback,
              // 원 생성과 동일 사고 계약(flash3@high) — KO 는 SHIP-FIRST repair
              // 자체가 제외라 이 경로는 영어 유형 전용이다.
              reasoningEffort: resolveQgenReasoningEffort(subType),
              applyReasoningEffortToGemini: true,
              onModelUsage: (result) => {
                onModelUsage?.({
                  phase: "question_generation",
                  subType,
                  qualityMode,
                  difficulty: effectiveDiffLabel,
                  generationPlan: effectiveGenerationPlan,
                  usage: result.usage,
                  provider: result.provider,
                  modelId: result.modelId,
                  attempts: result.attempts,
                  durationMs: result.durationMs,
                });
              },
            });
            if (repaired) {
              const repairedFin = finalizeCandidate(repaired);
              let adoptedRepair = false;
              if (repairedFin.ok && repairedFin.blockingErrors.length === 0) {
                console.log(
                  `[AUTO-GEN] ${subType} candidate repaired (was: ${originalBlockingErrors
                    .map((issue) => issue.code)
                    .join(",")})`,
                );
                fin = repairedFin;
                adoptedRepair = true;
              } else if (
                repairedFin.ok &&
                decoyOnlyRepairScope &&
                isAdoptableDecoyOnlyRepairResidual(
                  originalBlockingErrors,
                  repairedFin.blockingErrors,
                )
              ) {
                // 완화 채택(26-07-14 round-3 ②): decoy-only 수리에 한해 "표적 결함
                // 일부 해소 + 새 error 미발생 + 기존 코드 비악화 + 잔존 전부
                // decoy-only(정답 관련 코드 잔존 시 채택 금지)"면 blocking 0 이
                // 아니어도 개선본을 채택한다. 잔존 blocking 이 있으므로 이 후보는
                // 여전히 아래 반려 경로를 타지만, 반려 풀(salvage)·relaxed 출하가
                // 원본 대신 개선본 기준이 된다 — round-3 실측 "수리 실패 시 원본
                // relaxed 출하" 봉합. 출하 게이트 자체는 불변(하드 실패 영향 0).
                console.log(
                  `[AUTO-GEN] ${subType} candidate partially repaired (${originalBlockingErrors
                    .map((issue) => issue.code)
                    .join(",")} -> ${repairedFin.blockingErrors
                    .map((issue) => issue.code)
                    .join(",")})`,
                );
                fin = repairedFin;
                adoptedRepair = true;
              }
              if (researchEnabled) {
                if (adoptedRepair) {
                  await decideQuestionGenerationResearchCandidate(
                    researchDecisionCandidate,
                    "parsed_rejected",
                  );
                  researchDecisionCandidate = repaired;
                } else {
                  await decideQuestionGenerationResearchCandidate(
                    repaired,
                    "parsed_rejected",
                  );
                }
              }
            }
          }

          if (fin.blockingErrors.length > 0) {
            console.warn(
              `[AUTO-GEN] Quality errors for ${subType}: ${formatIssuesForLog(
                fin.blockingErrors,
              )}`,
            );
            recordRejection(rejectionRecorder, {
              phase: "quality",
              qualityMode,
              subType,
              message: summarizeQualityIssues(fin.blockingErrors),
              codes: fin.blockingErrors.map((issue) => issue.code),
              sample: buildRejectionSample(subType, fin.finalQuestion),
            });
            // never-fail 구제 사다리용 후보 보존 — craft 결함만 있는 후보는 모든
            // 재시도 소진 후 경고 부착으로 재승인될 수 있다(F급 혼입 후보는
            // admitSalvageCandidatesFromPool 이 걸러낸다).
            recordRejectedCandidate(rejectionRecorder, {
              subType,
              qualityMode,
              attemptIndex,
              question: fin.finalQuestion,
              blockingCodes: fin.blockingErrors.map((issue) => issue.code),
              blockingIssues: fin.blockingErrors,
              warnings: fin.allWarnings,
            });
            if (researchEnabled) {
              await decideQuestionGenerationResearchCandidate(
                researchDecisionCandidate,
                "parsed_rejected",
              );
            }
            continue;
          }

          // KO 난도5 독립 솔버 게이트 — needsSolverGate 유형만(후보당 LLM 1회 비용),
          // strict 모드 전용(relaxed 폴백은 수율 보존을 위해 생략). 품질검증 통과
          // "후"에 태워 결정론 게이트를 이미 통과한 후보만 비용을 쓴다. 불일치 =
          // 후보 반려 → strict 재시도 유도(ko-solver-mismatch 는 RELAXED_BLOCKING).
          if (koMod?.meta.needsSolverGate) {
            if (qualityMode === "strict") {
              const solverIssue = await runKoSolverGate({
                question: fin.finalQuestion,
                researchParentCandidate: researchEnabled
                  ? researchDecisionCandidate
                  : undefined,
                passage: passageContent,
                mod: koMod,
                generationPlan: effectiveGenerationPlan,
                // KO 동결 — 문제생성 STANDARD 매핑이 flash3 로 바뀌어도 KO 솔버는
                // 레거시 표준 모델을 유지한다(이원 티어 개편 범위 밖).
                modelId: ATLAS_STANDARD_MODEL_ID,
                deadlineAt,
                onModelUsage: (result) => {
                  onModelUsage?.({
                    phase: "question_generation",
                    subType,
                    qualityMode,
                    difficulty: effectiveDiffLabel,
                    generationPlan: effectiveGenerationPlan,
                    usage: result.usage,
                    provider: result.provider,
                    modelId: result.modelId,
                    attempts: result.attempts,
                    durationMs: result.durationMs,
                  });
                },
              });
              if (solverIssue) {
                console.warn(
                  `[AUTO-GEN] KO solver gate rejected ${subType}: ${solverIssue.message}`,
                );
                recordRejection(rejectionRecorder, {
                  phase: "quality",
                  qualityMode,
                  subType,
                  message: solverIssue.message,
                  codes: [solverIssue.code],
                  sample: buildRejectionSample(subType, fin.finalQuestion),
                });
                if (researchEnabled) {
                  await decideQuestionGenerationResearchCandidate(
                    researchDecisionCandidate,
                    "parsed_rejected",
                  );
                }
                continue;
              }
            }
            // 통과(또는 relaxed 생략) 후보는 검수 권장 배지 — HITL 라우팅.
            fin.finalQuestion._reviewRecommended = true;
          }

          // 어법 독립 솔버 게이트 (round-6) — 결정론 오형 봉인이 못 막는 "정문 심기"
          // (형식가정법·수동+양태부사·동일문장 이중답 등)를 학생 시점 블라인드 풀이로
          // 차단. strict+relaxed 두 레인 실행(F의 relaxed 출하 금지), scarce/salvage
          // 최후 사다리는 생략 — never-fail 보존. 솔버 장애는 무판정 통과.
          // 26-07-20 이원 티어: PREMIUM(풀 파이프라인) 전용으로 조정 — STANDARD 는
          // S3i 확정 스펙(2콜: 생성+통합 검수리)이 담당하며, 검수리 콜의 축①
          // (가리고 풀기+반박)이 솔버 역할을 흡수한다(O201 실측 콘텐츠성 F 0/46).
          if (
            !researchSingleShotProfileActive &&
            subType === "GRAMMAR_ERROR" &&
            effectiveGenerationPlan === "PREMIUM" &&
            (qualityMode === "strict" || qualityMode === "relaxed")
          ) {
            const grammarSolverIssue = await runGrammarSolverGate({
              question: fin.finalQuestion,
              researchParentCandidate: researchEnabled
                ? researchDecisionCandidate
                : undefined,
              // 솔버는 항상 STANDARD 플랜 + 레거시 표준 모델(3.5-flash) 고정 —
              // 6라운드+42구성 실측이 flash 솔버 기준이고, 이원 티어에서 STANDARD
              // 매핑이 생성 모델(flash3)과 같아졌으므로 modelId 를 고정하지 않으면
              // 생성기가 자기 문항을 푸는 자기검증이 된다(O199: 외부>셀프).
              generationPlan: "STANDARD",
              modelId: ATLAS_STANDARD_MODEL_ID,
              deadlineAt,
              onModelUsage: (result) => {
                onModelUsage?.({
                  phase: "question_generation",
                  subType,
                  qualityMode,
                  difficulty: effectiveDiffLabel,
                  generationPlan: effectiveGenerationPlan,
                  usage: result.usage,
                  provider: result.provider,
                  modelId: result.modelId,
                  attempts: result.attempts,
                  durationMs: result.durationMs,
                });
              },
            });
            if (grammarSolverIssue) {
              console.warn(
                `[AUTO-GEN] grammar solver gate rejected ${subType}: ${grammarSolverIssue.message}`,
              );
              recordRejection(rejectionRecorder, {
                phase: "quality",
                qualityMode,
                subType,
                message: grammarSolverIssue.message,
                codes: [grammarSolverIssue.code],
                sample: buildRejectionSample(subType, fin.finalQuestion),
              });
              if (researchEnabled) {
                await decideQuestionGenerationResearchCandidate(
                  researchDecisionCandidate,
                  "parsed_rejected",
                );
              }
              continue;
            }
          }

          // 통합 검수·수리 게이트 (26-07-20 이원 티어, O201 S3i 확정 스펙) —
          // 결정형 게이트를 통과한 후보를 1콜로 적대 검수하고, 결함이 있으면 수리본을
          // 받아 finalizeCandidate 로 재검증 후 채택한다(게이트 위반 수리본은 원본
          // 유지 — S3i FIXED_GATE_REJECTED 시맨틱). 발동 조건:
          //   - STANDARD: 영어 객관식 전 유형에서 이 게이트가 해설·정답 검증을
          //     담당한다(스탠다드 티어의 품질 축). env 로 E-gate STANDARD 모드를
          //     되살려도 이 게이트는 유지된다 — 리뷰 지적: fast 라우트는 E-gate 를
          //     defer(async 해설 전용)하므로 E-gate env 가 이 게이트를 끄면 정답
          //     축이 통째로 무검증이 된다.
          //   - PREMIUM: E-gate 대상 유형(어법·빈칸·선택형)만 E-gate 소관으로
          //     제외하고, 그 외 객관식(콤보·순서·삽입·어휘·무관·요약MC 등 — 캠페인
          //     실측 F 33% 레인)은 이 게이트가 커버한다.
          // KO(국어)는 셔플 좌표계 문제로 제외(기존 KO 솔버 게이트가 담당).
          // 전 품질 레인(strict/relaxed/scarce) 실행 — 이 게이트는 후보를 반려하지
          // 않으므로(수리 채택 또는 원본 유지) never-fail 과 충돌하지 않고, salvage
          // 출하물이 무검증으로 나가는 구멍(리뷰 지적)을 막는다.
          if (
            !researchSingleShotProfileActive &&
            !koMod &&
            isReviewRepairGateEnabled() &&
            isReviewRepairGateTargetType(subType) &&
            !(
              effectiveGenerationPlan === "PREMIUM" &&
              isExplanationVerifyGateTargetType(subType) &&
              getExplanationVerifyGateMode(effectiveGenerationPlan) !== "off"
            )
          ) {
            const review = await runReviewRepairGate({
              subType,
              question: fin.finalQuestion,
              passage: passageContent,
              generationPlan: effectiveGenerationPlan,
              // KILLER 어법의 미끼 스페어(G=K+1) 스키마를 검수리에 그대로 쓰면
              // 수리본이 K 마커라 스키마 검증에 죽거나 검수 안 된 6번째 마커를
              // 창작하게 된다(리뷰 지적) — 검수리는 최종 형상(K) 스키마로 재구성.
              responseSchema: grammarDecoySurplusActive
                ? getAiResponseSchema(subType, {
                    irrelevantSlotCount,
                    grammarMarkerCount,
                    grammarAnswerCount,
                    grammarCorrectionErrorCount,
                    summaryCompleteMcBlankCount,
                    summaryCompleteBlankCount,
                    summaryWritingBlankCount,
                    topicSentenceWritingBlankCount,
                    contentMatchOptionCount,
                    contentMatchAnswerCount,
                    vocabChoiceMarkerCount,
                    vocabChoiceAnswerCount,
                    sentenceInsertSlotCount,
                    antonymPairCount,
                    blankInferenceBlankCount,
                    genericOptionCount,
                    genericAnswerCount,
                    expectedQuestionCount: 1,
                  })
                : responseSchema,
              researchParentCandidate: researchEnabled
                ? researchDecisionCandidate
                : undefined,
              deadlineAt,
              onModelUsage: (result) => {
                onModelUsage?.({
                  phase: "question_generation",
                  subType,
                  qualityMode,
                  difficulty: effectiveDiffLabel,
                  generationPlan: effectiveGenerationPlan,
                  usage: result.usage,
                  provider: result.provider,
                  modelId: result.modelId,
                  attempts: result.attempts,
                  durationMs: result.durationMs,
                });
              },
            });
            let reviewStamp: string | null = null;
            if (review.status === "FIXED" && review.fixedItem) {
              const fixedFin = finalizeCandidate(review.fixedItem);
              if (fixedFin.ok && fixedFin.blockingErrors.length === 0) {
                console.log(
                  `[AUTO-GEN] review-repair adopted a fixed ${subType} item (defects: ${(review.defects ?? []).slice(0, 3).join(" | ") || "unspecified"})`,
                );
                if (researchEnabled) {
                  await decideQuestionGenerationResearchCandidate(
                    researchDecisionCandidate,
                    "parsed_rejected",
                  );
                  researchDecisionCandidate = review.fixedItem;
                }
                fin = fixedFin;
                reviewStamp = "REPAIRED";
              } else {
                // 수리본이 결정형 게이트에 걸림 — 원본 유지(검수 결함 표시만 부착).
                console.warn(
                  `[AUTO-GEN] review-repair fix rejected by deterministic gates for ${subType}; keeping the original item.`,
                );
                reviewStamp = "FIX_REJECTED";
              }
            } else if (review.status === "FIX_REJECTED") {
              reviewStamp = "FIX_REJECTED";
            } else if (review.status === "PASS") {
              reviewStamp = "VERIFIED";
            } else if (review.status === "SKIPPED_BUDGET") {
              reviewStamp = "SKIPPED_BUDGET";
            }
            // ERROR/SKIPPED_SCHEMA 는 무판정 통과(표시 없음) — never-fail.
            if (reviewStamp) {
              fin.finalQuestion._reviewRepairStatus = reviewStamp;
              if (reviewStamp !== "VERIFIED" && reviewStamp !== "SKIPPED_BUDGET") {
                fin.finalQuestion._reviewRepairDefects = (review.defects ?? []).slice(0, 6);
              }
            }
          }

          // 해설 사실검증 게이트 (E-gate, 캠페인 20260716 O153/O156/O160, W2-F 확장) —
          // V4(해설 사실성)는 수락 문항의 지배적 치명 결함이며 결정론 린트가 못 잡는다.
          // grok 검증 → grok 표적수리 → grok 재검증. 모드는 플랜 기반(PREMIUM=enforce/
          // STANDARD=warn), env EXPLANATION_VERIFY_GATE_MODE 로 강제 가능. 대상 유형은
          // 게이트 모듈의 단일 소스 isExplanationVerifyGateTargetType 에 위임(어법·빈칸 +
          // 선택형, env EXPLANATION_VERIFY_GATE_TYPES 오버라이드). effectiveGenerationPlan
          // 은 항상 PREMIUM/STANDARD 라 off 는 env 강제로만 — 즉 어법·빈칸·선택형은 기본
          // 활성이다. strict/relaxed 레인 전용 — scarce/salvage 최후 사다리는 생략해
          // never-fail 보존. 게이트 장애는 무판정 통과.
          if (
            !researchSingleShotProfileActive &&
            !deferExplanationVerify &&
            isExplanationVerifyGateTargetType(subType) &&
            (qualityMode === "strict" || qualityMode === "relaxed") &&
            getExplanationVerifyGateMode(effectiveGenerationPlan) !== "off"
          ) {
            const explanationGate = await runExplanationVerifyGate({
              subType,
              generationPlan: effectiveGenerationPlan,
              question: fin.finalQuestion,
              passage: passageContent,
              researchParentCandidate: researchEnabled
                ? researchDecisionCandidate
                : undefined,
              deadlineAt,
              onModelUsage: (result) => {
                onModelUsage?.({
                  phase: "question_generation",
                  subType,
                  qualityMode,
                  difficulty: effectiveDiffLabel,
                  generationPlan: effectiveGenerationPlan,
                  usage: result.usage,
                  provider: result.provider,
                  modelId: result.modelId,
                  attempts: result.attempts,
                  durationMs: result.durationMs,
                });
              },
            });
            if (explanationGate.issue) {
              console.warn(
                `[AUTO-GEN] explanation verify gate rejected ${subType}: ${explanationGate.issue.message}`,
              );
              recordRejection(rejectionRecorder, {
                phase: "quality",
                qualityMode,
                subType,
                message: explanationGate.issue.message,
                codes: [explanationGate.issue.code],
                sample: buildRejectionSample(subType, fin.finalQuestion),
              });
              if (researchEnabled) {
                await decideQuestionGenerationResearchCandidate(
                  researchDecisionCandidate,
                  "parsed_rejected",
                );
              }
              continue;
            }
            // 검증 결과를 문항에 표시(structuredData 자동 반영, _ prefix). SKIPPED_BUDGET
            // 은 인라인 예산 가드가 판정을 건너뛴 경우로, 반려하지 않고 표시만 남겨 출하한다
            // (async E-gate·교사 검수가 백스톱). 그 외 통과 경로는 VERIFIED(수리본 채택 시
            // VERIFIED_REPAIRED)로, warn 모드 재검증 실패는 반려 아닌 FAILED 표시로 남긴다.
            if (explanationGate.skippedInsufficientBudget) {
              fin.finalQuestion._explanationVerified = false;
              fin.finalQuestion._explanationVerifyStatus = "SKIPPED_BUDGET";
            } else if (explanationGate.warning) {
              fin.finalQuestion._explanationVerified = false;
              fin.finalQuestion._explanationVerifyStatus = "FAILED";
            } else {
              if (explanationGate.updatedQuestion) {
                fin.finalQuestion = explanationGate.updatedQuestion;
              }
              fin.finalQuestion._explanationVerified = true;
              fin.finalQuestion._explanationVerifyStatus =
                explanationGate.updatedQuestion ? "VERIFIED_REPAIRED" : "VERIFIED";
            }
            if (explanationGate.warning) {
              fin.allWarnings.push({
                severity: "warning",
                code: "explanation-verify-warning",
                message: explanationGate.warning,
              });
            }
          }

          // deferExplanationVerify: 인라인 게이트를 건너뛴 경우(위 조건에서 제외),
          // async E-gate(workbench-explanation-verify)가 이어받도록 PENDING 표시만
          // 남긴다. 대상 판정·모드·해설 존재 조건은 인라인 게이트와 동일 집합이라,
          // 인라인이 실제 검증할 문항만 async 로 넘어간다(비대상·모드 off·빈 해설은
          // 표시 없음 → 워커가 건너뜀).
          if (
            deferExplanationVerify &&
            !researchSingleShotProfileActive &&
            isExplanationVerifyGateTargetType(subType) &&
            getExplanationVerifyGateMode(effectiveGenerationPlan) !== "off" &&
            typeof fin.finalQuestion.explanation === "string" &&
            fin.finalQuestion.explanation.length > 0
          ) {
            fin.finalQuestion._explanationVerified = false;
            fin.finalQuestion._explanationVerifyStatus = "PENDING";
          }

          // SHIP-FIRST: 취향/난이도 경고(강등된 B 코드 포함)도 검수 UI 가시성을 위해
          // strict 모드에서까지 항상 부착한다. 단 _qualityMode='relaxed'(저품질 신호)는
          // 실제 relaxed 폴백 경로에서만 — 취향 경고에 저품질 배지를 달지 않는다.
          if (fin.allWarnings.length > 0) {
            fin.finalQuestion._qualityWarnings = fin.allWarnings;
            console.warn(
              `[AUTO-GEN] Quality warnings for ${subType}: ${formatIssuesForLog(
                fin.allWarnings,
              )}`,
            );
          }
          if (fin.hasRelaxedWarnings) {
            fin.finalQuestion._qualityMode = "relaxed";
          }

          if (researchEnabled) {
            await decideQuestionGenerationResearchCandidate(
              researchDecisionCandidate,
              "parsed_accepted",
            );
          }
          qs.push(fin.finalQuestion);
        }

        console.log(`[AUTO-GEN] ${subType} done: ${qs.length} questions`);
        return qs;
          },
        );
      } catch (err) {
        console.error(
          `[AUTO-GEN] Failed ${subType}:`,
          err instanceof Error ? err.message : err,
        );
        if (isNonRetryableQuestionGenerationProviderError(err)) {
          throw err;
        }
        recordRejection(rejectionRecorder, {
          phase: "model",
          qualityMode,
          subType,
          message: err instanceof Error ? err.message : String(err),
        });
        return [];
      }
    }),
  );

  return generatedGroups.flat();
}

export async function runQuestionGenerationWithEmptyRetry(
  input: RunGenerationInput,
  {
    maxAttempts = GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS,
    logPrefix = "AUTO-GEN",
    deadlineAt,
    deferExplanationVerify = false,
  }: {
    maxAttempts?: number;
    logPrefix?: string;
    /**
     * 절대 시각(epoch ms). 이 시각이 지나면 새 시도를 시작하지 않고 조기 종료한다.
     * 느린 PREMIUM(Claude)이 다수 재시도로 Vercel 120s/trigger 600s 한도를 넘겨
     * 함수가 강제종료→잡 고아→환불 누락되는 것을 막는다. 미전달 시 기존 동작과 동일.
     */
    deadlineAt?: number;
    /**
     * true 면 인라인 해설 사실검증 E-gate 를 생략하고 문항을 PENDING 으로만 표시한다
     * (async 워커가 임계경로 밖에서 검증). 내부의 모든 runQuestionGeneration 호출
     * (strict/relaxed/rescue/scarce/salvage)에 그대로 전파된다. 미전달 시 기존 동작 동일.
     */
    deferExplanationVerify?: boolean;
  } = {},
): Promise<{
  questions: Record<string, unknown>[];
  attempts: number;
  relaxedFallback: boolean;
  rejectionSummary: QuestionGenerationRejectionSummary;
  usageEvents: QuestionGenerationUsageEvent[];
}> {
  const usageEvents: QuestionGenerationUsageEvent[] = [];
  const hasEnglishGenerationRequested = input.plan.some(
    (item) => item.count > 0 && !isKoQuestionType(item.subType),
  );
  const inputWithUsage: RunGenerationInput = {
    ...input,
    // KO(국어) 동결의 외곽 정합(이원 티어 리뷰 지적): 내부 runQuestionGeneration 이
    // KO 유형을 STANDARD 로 동결하는데 외곽 루프(재시도 상한·PREMIUM salvage 직행
    // 분기)가 호출자 PREMIUM 을 그대로 읽으면 KO 요청이 relaxed 폴백 레인을 잃는다.
    // 생성 대상이 전부 KO 면 외곽 플랜도 STANDARD 로 접는다(영어 혼합 요청은 유지).
    generationPlan:
      input.generationPlan === "PREMIUM" && !hasEnglishGenerationRequested
        ? "STANDARD"
        : input.generationPlan,
    onModelUsage: (event) => {
      usageEvents.push(event);
      input.onModelUsage?.(event);
    },
  };
  const rejectionRecorder: RejectionRecorder = { issues: [] };
  const hasEnglishGeneration = hasEnglishGenerationRequested;
  const passageIntegrityFindings = hasEnglishGeneration
    ? analyzeEnglishPassageIntegrity(inputWithUsage.passageContent)
    : [];
  if (passageIntegrityFindings.length > 0) {
    for (const item of inputWithUsage.plan) {
      if (item.count <= 0 || isKoQuestionType(item.subType)) continue;
      recordRejection(rejectionRecorder, {
        phase: "quality",
        qualityMode: "strict",
        subType: item.subType,
        message: passageIntegrityFindings
          .map((finding) => `${finding.code}: ${finding.message}`)
          .join(" | "),
        codes: passageIntegrityFindings.map((finding) => finding.code),
      });
    }
    return {
      questions: [],
      attempts: 0,
      relaxedFallback: false,
      rejectionSummary: buildRejectionSummary(rejectionRecorder),
      usageEvents,
    };
  }
  const hasNegativeParaphraseBlank = hasDoubleNegativeBlankSetting(inputWithUsage);
  const hasBlankParaphraseAnswer = hasBlankParaphraseAnswerSetting(inputWithUsage);
  const hasSingleBlankInference = hasSingleBlankInferenceSetting(inputWithUsage);
  const hasKillerSingleBlankInference =
    hasSingleBlankInference &&
    inputWithUsage.plan.some(
      (item) =>
        item.subType === "BLANK_INFERENCE" &&
        item.count > 0 &&
        readQuestionTypeDifficultySetting(
          inputWithUsage.typeSettings?.BLANK_INFERENCE,
          inputWithUsage.diffLabel,
        ) === "KILLER",
    );
  const hasSummaryCompleteMc = inputWithUsage.plan.some(
    (item) => item.subType === "SUMMARY_COMPLETE_MC" && item.count > 0,
  );
  // 요약문 영작(서술형, PASSTHROUGH)은 객관식 SUMMARY_COMPLETE_MC 만큼 정합 제약이
  // 빡빡하지 않으므로 재시도 상한을 기본(4)에서 한 단계만(5) 올린다 — 누수/엔트로피
  // 게이트(sw-*)가 strict 재시도에서 교정될 기회를 약간 더 준다.
  const hasSummaryWriting = inputWithUsage.plan.some(
    (item) => item.subType === "SUMMARY_WRITING" && item.count > 0,
  );
  const hasGrammarError = inputWithUsage.plan.some(
    (item) => item.subType === "GRAMMAR_ERROR" && item.count > 0,
  );
  const hasStandardGrammarKiller = isStandardGrammarKillerRequest(inputWithUsage);
  const requestedCount = inputWithUsage.plan.reduce(
    (sum, item) => sum + Math.max(0, Math.floor(Number(item.count) || 0)),
    0,
  );
  const largestIrrelevantSlotCount = getLargestIrrelevantSlotCount(inputWithUsage);
  const largestGrammarMarkerCount = getLargestGrammarMarkerCount(inputWithUsage);
  const largestGrammarAnswerCount = getLargestGrammarAnswerCount(inputWithUsage);
  // 네모 어법은 세 슬롯 전부 정합을 요구해 수율이 낮다 — 확장 유형과 동일하게 6회.
  const hasGrammarChoiceCombo = inputWithUsage.plan.some(
    (item) => item.subType === "GRAMMAR_CHOICE_COMBO" && item.count > 0,
  );
  const requestedMaxAttempts =
    getQuestionGenerationResearchTransportPolicy()?.outerMaxAttempts ??
    normalizeQuestionGenerationOuterAttempts(maxAttempts);
  const hasExtendedRetryType =
    hasSummaryCompleteMc ||
    hasGrammarChoiceCombo ||
    largestIrrelevantSlotCount > 5 ||
    largestGrammarMarkerCount > 5 ||
    largestGrammarAnswerCount > 1;
  const rawAttempts = hasKillerSingleBlankInference
    ? Math.max(10, requestedMaxAttempts)
    : hasNegativeParaphraseBlank || hasBlankParaphraseAnswer || hasExtendedRetryType
      ? Math.max(6, requestedMaxAttempts)
      : hasSummaryWriting
        ? Math.max(5, requestedMaxAttempts)
        : Math.max(4, requestedMaxAttempts);
  // PREMIUM(Claude)은 1회 호출이 실측 ~25~35s(긴 지문은 더)로 느려 strict 다회 재시도가
  // 누적되면 시간 벽을 넘긴다. 데드라인(fast 270s/trigger 540s)이 실제 한계라 상한은
  // 그 안에서 교정 재시도(buildCorrectiveRetryFeedback)+relaxed 폴백이 충분히 돌도록
  // 5로 둔다(5×~33s≈165s + relaxed, 270s 예산 내). 성공은 평균 1.22회라 정상 케이스는
  // 영향 없고, 긴/어려운 지문에서 품질 게이트(list-like·too-easy) 통과 기회를 늘린다.
  // STANDARD(Gemini ~9s)는 기존 상한을 유지한다.
  const PREMIUM_STRICT_ATTEMPT_CAP = 5;
  // 26-07-06 2차: 3→4 — gemini 호출 ~10s 라 저비용이고, STANDARD KILLER 어법의
  // 구제 의존율 3/4(다지문 실측)을 strict 재시도 1회 추가로 낮춘다(지정 설계와 병행).
  const STANDARD_GRAMMAR_KILLER_STRICT_ATTEMPT_CAP = 4;
  const attempts =
    inputWithUsage.generationPlan === "PREMIUM"
      ? Math.max(1, Math.min(rawAttempts, PREMIUM_STRICT_ATTEMPT_CAP, requestedMaxAttempts))
      : hasStandardGrammarKiller
        ? // 26-07-06 2차: requestedMaxAttempts(기본 2)를 min 에서 제거 — 다른
          // STANDARD 유형은 rawAttempts(≥4)를 그대로 받는데 어법 KILLER 만 2회로
          // 조여져 구제 의존율 3/4 의 한 원인이었다. gemini ~10s 라 4회도 저비용.
          Math.max(1, Math.min(rawAttempts, STANDARD_GRAMMAR_KILLER_STRICT_ATTEMPT_CAP))
      : rawAttempts;

  // 실패 반환 직전 전용 — 어법 결핍 지문(금지 표면이 후보 대부분과 겹치는 퇴화
  // 케이스, 실측: glass 지문 금지 31개 vs 정제 후보 1개)이면 마지막 거절 사유로
  // 마커를 남겨, UI 가 "다시 생성하세요" 대신 "지문 부적합"을 안내하게 한다
  // (workbench-generation-errors 의 grammar-scarce-passage 매핑 짝). 레스큐/repair
  // 판정 이후 실패 경로에서만 호출되므로 그 결정들에는 영향이 없다.
  const getGrammarScarceInfo = (): {
    scarce: boolean;
    usableCount: number;
    codeCount: number;
  } => {
    if (!hasGrammarError) return { scarce: false, usableCount: 0, codeCount: 0 };
    try {
      const { candidates: usableSites } = selectUsableGrammarCandidates(
        inputWithUsage.passageContent,
        inputWithUsage.diffLabel,
      );
      const usableSiteCodes = new Set(usableSites.map((site) => site.code));
      const requestedMarkerCount = Math.max(5, largestGrammarMarkerCount);
      return {
        scarce:
          usableSites.length < requestedMarkerCount + 2 ||
          usableSiteCodes.size < 3,
        usableCount: usableSites.length,
        codeCount: usableSiteCodes.size,
      };
    } catch {
      return { scarce: false, usableCount: 0, codeCount: 0 };
    }
  };

  const recordGrammarScarcePassageMarker = () => {
    if (!hasGrammarError) return;
    const hasGrammarQualityRejection = rejectionRecorder.issues.some(
      (issue) => issue.phase === "quality" && issue.subType === "GRAMMAR_ERROR",
    );
    if (!hasGrammarQualityRejection) return;
    const info = getGrammarScarceInfo();
    if (!info.scarce) return;
    recordRejection(rejectionRecorder, {
      phase: "quality",
      qualityMode: "strict",
      subType: "GRAMMAR_ERROR",
      message: `grammar-scarce-passage: this passage offers only ${info.usableCount} clean grammar sites across ${info.codeCount} point codes after forbidden-surface filtering; it is a poor fit for grammar-judgment items`,
      codes: ["grammar-scarce-passage"],
    });
  };

  // 결핍 지문 최선 생성(유저 결정 26-07-04: "못 만듭니다"로 끝내지 말고 만들어
  // 주되 품질이 제한적인 이유를 알린다). 기존 사다리(strict→rescue/relaxed)가
  // 전부 실패한 뒤에만, 어법 단독 요청 + 결핍 지문일 때 1회 실행한다 —
  // 취향 게이트(GRAMMAR_SCARCE_RELAXABLE_CODES)를 경고로 강등한 scarce 모드로
  // 생성하고, 출하물에 사유 notice·검수권장을 부착한다. 정답 유일성·무결성
  // 게이트는 그대로라 "틀린 문항"은 여전히 출하되지 않는다.
  const runGrammarScarceBestEffort = async (): Promise<
    Record<string, unknown>[] | null
  > => {
    if (!hasGrammarError) return null;
    if (
      inputWithUsage.plan.length !== 1 ||
      inputWithUsage.plan[0]?.subType !== "GRAMMAR_ERROR"
    ) {
      return null;
    }
    if (deadlineAt && Date.now() >= deadlineAt) return null;
    const info = getGrammarScarceInfo();
    if (!info.scarce) return null;
    console.warn(
      `[${logPrefix}] Scarce grammar passage (${info.usableCount} usable sites / ${info.codeCount} codes); running best-effort scarce pass with taste gates downgraded.`,
    );
    const scarceFeedback = [
      pendingFeedback,
      "Scarce-passage best effort: this passage lacks clean grammar sites. Build the most defensible item possible — the answer must still be a single unambiguous error with verbatim source backing, but decoy variety and trap depth may be simpler than usual. Do not fabricate disputed or broken-looking mutations to fill slots.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const bestEffort = await runQuestionGeneration(inputWithUsage, {
      qualityMode: "scarce",
      rejectionRecorder,
      attemptIndex: attempts + 1,
      previousAttemptFeedback: scarceFeedback,
      deadlineAt,
      deferExplanationVerify,
    });
    if (bestEffort.length === 0) return null;
    const notice = `이 지문에는 어법 문제로 낼 만한 깨끗한 문법 구조가 부족해(정제 후 사용 가능 자리 ${info.usableCount}개) 일부 품질 기준을 완화하고 생성했습니다. 밑줄 구성이 단순하거나 함정 매력도가 낮을 수 있으니 검수 후 사용을 권장합니다.`;
    for (const question of bestEffort) {
      question._qualityMode = "relaxed";
      question._reviewRecommended = true;
      question._scarcePassage = true;
      question._generationNotice = notice;
    }
    return bestEffort;
  };

  // ── never-fail 구제 사다리 (26-07-06 유저 결정: "생성 실패"는 최악의 결과) ──
  // ① 거절 후보 풀 재승인(LLM 0회·즉시): strict/relaxed 에서 craft(완성도) 게이트
  //    에만 걸려 탈락한 후보가 있으면 그 게이트를 경고로 강등하고 notice 를 붙여
  //    출하한다. F급(정답 무효·누출·렌더 파손) 결함 후보는 절대 재승인되지 않는다.
  // ② 풀이 비면 scarce(구제) 모드 LLM 1회 — 전 유형 craft 게이트 강등 생성.
  // ③ 그래도 없으면 정직한 실패(모델 전면 장애·지문 부적합만 남는다).
  const admitFromPool = (): Record<string, unknown>[] | null => {
    const admitted = admitSalvageCandidatesFromPool(rejectionRecorder, {
      needed: Math.max(1, requestedCount),
    });
    if (admitted.length === 0) return null;
    console.warn(
      `[${logPrefix}] Never-fail salvage: admitting ${admitted.length} craft-flagged candidate(s) from the rejection pool with review notice.`,
    );
    return admitted;
  };

  const runUniversalSalvage = async (): Promise<
    Record<string, unknown>[] | null
  > => {
    const pooled = admitFromPool();
    if (pooled) return pooled;
    if (deadlineAt && Date.now() >= deadlineAt) return null;
    console.warn(
      `[${logPrefix}] Never-fail salvage: rejection pool empty; running one salvage-mode generation pass.`,
    );
    const salvageFeedback = [
      pendingFeedback,
      "Salvage pass: previous attempts were rejected by craft-quality gates. Produce the most defensible item possible. The answer must remain single, unambiguous, and source-backed; craft polish (decoy attractiveness, trap depth, explanation length) may be simpler than usual. Never fabricate disputed or broken-looking constructions.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const salvage = await runQuestionGeneration(inputWithUsage, {
      qualityMode: "scarce",
      rejectionRecorder,
      attemptIndex: attempts + 2,
      previousAttemptFeedback: salvageFeedback,
      deadlineAt,
      deferExplanationVerify,
    });
    if (salvage.length === 0) {
      // salvage 시도의 탈락 후보도 풀에 쌓였을 수 있다 — 한 번 더 재승인 시도.
      return admitFromPool();
    }
    for (const question of salvage) {
      question._qualityMode = "relaxed";
      question._reviewRecommended = true;
      const warningCodes = Array.isArray(question._qualityWarnings)
        ? (question._qualityWarnings as Array<{ code?: unknown }>)
            .map((issue) => (typeof issue?.code === "string" ? issue.code : ""))
            .filter(Boolean)
        : [];
      question._generationNotice = buildSalvageNotice(warningCodes);
    }
    return salvage;
  };

  let pendingFeedback: string | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // 시간 예산 가드: 1회는 반드시 시도하되(크레딧 차감됨), 이후 시도는 남은
    // 시간이 없으면 시작하지 않는다 — 함수 강제종료로 잡이 고아가 되어 환불이
    // 누락되는 것을 막고, 호출자의 catch 에서 정상 실패+환불로 흐르게 한다.
    if (deadlineAt && attempt > 1 && Date.now() >= deadlineAt) {
      console.warn(
        `[${logPrefix}] Time budget reached before attempt ${attempt}/${attempts}; stopping strict retries early.`,
      );
      break;
    }
    const issueCountBeforeAttempt = rejectionRecorder.issues.length;
    const questions = await runQuestionGeneration(inputWithUsage, {
      rejectionRecorder,
      attemptIndex: attempt - 1,
      previousAttemptFeedback: pendingFeedback,
      deadlineAt,
      deferExplanationVerify,
    });
    const shouldRequireFullRequestedCount =
      hasNegativeParaphraseBlank || hasBlankParaphraseAnswer || hasGrammarError;
    const hasEnoughQuestions = shouldRequireFullRequestedCount
      ? questions.length >= requestedCount
      : questions.length > 0;
    if (hasEnoughQuestions) {
      return {
        questions,
        attempts: attempt,
        relaxedFallback: false,
        rejectionSummary: buildRejectionSummary(rejectionRecorder),
        usageEvents,
      };
    }
    // 이번 시도에서 새로 기록된 거절 사유를 다음 시도 프롬프트에 교정 지시로
    // 주입한다 (맹목 재시도 → 교정 재생성). 어법은 helpers 매핑에 없는 주요
    // 반려 코드를 한국어 행동 지시로 번역해 덧붙인다(최근 1회분·상위 3코드).
    const issuesFromThisAttempt = rejectionRecorder.issues.slice(
      issueCountBeforeAttempt,
    );
    pendingFeedback = appendGrammarRetryDirectives(
      buildCorrectiveRetryFeedback(issuesFromThisAttempt, {
        cumulativeIssues: rejectionRecorder.issues,
      }),
      issuesFromThisAttempt,
      // killer-overdrilled 이력 지시는 누적 이력 기준 — 최근 시도에 그 코드가
      // 없어도 반려 이력이 있으면 동일 pointCode 계열 재선정 금지를 주입한다
      // (round-1 실증: q05·q29 가 반려 이력에도 같은 계열로 수렴).
      rejectionRecorder.issues,
    );
    if (attempt === attempts) {
      break;
    }
    console.warn(
      `[${logPrefix}] Generation result did not pass quality/count gate (${questions.length}/${requestedCount}); retrying (${attempt + 1}/${attempts})`,
    );
  }

  if (deadlineAt && Date.now() >= deadlineAt) {
    // 시간 예산 소진 — LLM 재시도는 불가하지만 풀 재승인은 무비용이라 항상 시도.
    const pooledAtDeadline = admitFromPool();
    if (pooledAtDeadline) {
      return {
        questions: pooledAtDeadline,
        attempts,
        relaxedFallback: true,
        rejectionSummary: buildRejectionSummary(rejectionRecorder),
        usageEvents,
      };
    }
    console.warn(
      `[${logPrefix}] Time budget reached; skipping relaxed fallback, returning empty (caller refunds).`,
    );
    recordGrammarScarcePassageMarker();
    return {
      questions: [],
      attempts,
      relaxedFallback: false,
      rejectionSummary: buildRejectionSummary(rejectionRecorder),
      usageEvents,
    };
  }

  if (shouldRunStandardGrammarKillerRescue(inputWithUsage, rejectionRecorder)) {
    console.warn(
      `[${logPrefix}] STANDARD GRAMMAR_ERROR KILLER attempts only found shallow/local targets; running INTERMEDIATE rescue instead of failing.`,
    );
    const rescueInput = buildStandardGrammarKillerRescueInput(inputWithUsage);
    const rescueFeedback = [
      pendingFeedback,
      "Rescue requirement: do not repeat the rejected KILLER-local answer pattern. Produce a strong INTERMEDIATE item with five meaningful grammar marks and exactly one clear, source-backed wrong expression.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const rescueQuestions = await runQuestionGeneration(rescueInput, {
      qualityMode: "strict",
      rejectionRecorder,
      attemptIndex: attempts,
      previousAttemptFeedback: rescueFeedback,
      deadlineAt,
      deferExplanationVerify,
    });
    if (rescueQuestions.length > 0) {
      for (const question of rescueQuestions) {
        question._requestedDifficulty = "KILLER";
        question._difficultyDowngraded = true;
        question._reviewRecommended = true;
        question._qualityMode = question._qualityMode ?? "rescue";
      }
      return {
        questions: rescueQuestions,
        attempts: attempts + 1,
        relaxedFallback: true,
        rejectionSummary: buildRejectionSummary(rejectionRecorder),
        usageEvents,
      };
    }
    console.warn(
      `[${logPrefix}] STANDARD GRAMMAR_ERROR KILLER rescue also failed; skipping relaxed KILLER fallback to avoid extra shallow retries.`,
    );
    const killerBestEffort =
      (await runGrammarScarceBestEffort()) ?? (await runUniversalSalvage());
    if (killerBestEffort) {
      for (const question of killerBestEffort) {
        question._requestedDifficulty = "KILLER";
        question._difficultyDowngraded = true;
      }
      return {
        questions: killerBestEffort,
        attempts: attempts + 2,
        relaxedFallback: true,
        rejectionSummary: buildRejectionSummary(rejectionRecorder),
        usageEvents,
      };
    }
    recordGrammarScarcePassageMarker();
    return {
      questions: [],
      attempts: attempts + 1,
      relaxedFallback: false,
      rejectionSummary: buildRejectionSummary(rejectionRecorder),
      usageEvents,
    };
  }

  if (inputWithUsage.generationPlan === "PREMIUM") {
    // 프리미엄은 relaxed LLM 폴백 대신 구제 사다리로 직행 — 풀 재승인(0비용)이
    // 먼저라 대부분 추가 지연 없이 출하되고, 풀이 비었을 때만 salvage 1회를 쓴다.
    console.warn(
      `[${logPrefix}] Strict premium generation exhausted after ${attempts} attempts; entering never-fail salvage ladder.`,
    );
    const premiumBestEffort =
      (await runGrammarScarceBestEffort()) ?? (await runUniversalSalvage());
    if (premiumBestEffort) {
      return {
        questions: premiumBestEffort,
        attempts: attempts + 1,
        relaxedFallback: true,
        rejectionSummary: buildRejectionSummary(rejectionRecorder),
        usageEvents,
      };
    }
    recordGrammarScarcePassageMarker();
    return {
      questions: [],
      attempts,
      relaxedFallback: false,
      rejectionSummary: buildRejectionSummary(rejectionRecorder),
      usageEvents,
    };
  }

  console.warn(
    `[${logPrefix}] Strict quality generation exhausted after ${attempts} attempts; running relaxed quality fallback.`,
  );
  const relaxedQuestions = await runQuestionGeneration(inputWithUsage, {
    qualityMode: "relaxed",
    rejectionRecorder,
    attemptIndex: attempts,
    previousAttemptFeedback: pendingFeedback,
    deadlineAt,
    deferExplanationVerify,
  });
  if (relaxedQuestions.length === 0) {
    const relaxedBestEffort =
      (await runGrammarScarceBestEffort()) ?? (await runUniversalSalvage());
    if (relaxedBestEffort) {
      return {
        questions: relaxedBestEffort,
        attempts: attempts + 2,
        relaxedFallback: true,
        rejectionSummary: buildRejectionSummary(rejectionRecorder),
        usageEvents,
      };
    }
    recordGrammarScarcePassageMarker();
  }
  return {
    questions: relaxedQuestions,
    attempts: attempts + 1,
    relaxedFallback: true,
    rejectionSummary: buildRejectionSummary(rejectionRecorder),
    usageEvents,
  };
}
