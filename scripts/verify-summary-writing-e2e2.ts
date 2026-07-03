/* eslint-disable no-console */
/**
 * SUMMARY_WRITING (요약문 영작) — 실모델 E2E 재생성·회귀검증 하니스 v2.
 *   npx tsx scripts/verify-summary-writing-e2e2.ts
 *
 * 목적: 직전 시각검수에서 잡힌 결함이 "새(수정된) 프롬프트/직렬화 레벨"에서
 *   실제 모델 재생성으로도 해소됐는지 확인한다. verify-summary-writing-e2e.ts 를
 *   재사용하되 다음 회귀 게이트 5종을 추가하고 OUT 경로를 c:\tmp\sw-samples2 로 바꾼다.
 *
 *   1. blankGloss 미생성/미노출: structuredData.blankGlosses 가 비거나, 있어도 학생
 *      직렬화(buildGeneratedQuestionText)에 "[빈칸 해석]" 절대 없어야.
 *   2. koreanGloss 비-1:1: glossEnabled 케이스에서 koreanGloss 가 blanks[].answer 의
 *      한국어 1:1 직역이 아니어야(영어 정답 그대로 미포함 + 과도정렬 휴리스틱 경고).
 *   3. 앞글자 정렬: clueMode=firstLetter 에서 summaryWritingFirstLetterLine(q) 의 각
 *      빈칸 토큰수 == 해당 answer 단어수(정답 파생이라 항상 일치).
 *   4. 발문 단/복수: blankCount=1 발문에 "각 빈칸"이 아니라 "빈칸을". >=2 는 "각 빈칸".
 *   5. 단어수 인라인 제거: [요약문] 직렬화에 "(약 N단어)"/"(N단어)" 없어야(발문에만).
 *
 * 모델: PREMIUM(Claude Sonnet 5) 고정 → 실패 시 STANDARD(Gemini) 폴백 →
 *   둘 다 실패면 status:"gen_unavailable" + 합성 픽스처로 검증 진행.
 */

import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { STRUCTURED_TYPE_PROMPTS } from "../src/lib/question-schemas";
import { getAiResponseSchema } from "../src/lib/question-ai-schemas-mc";
import { generateQuestionObject } from "../src/lib/question-generation-llm";
import type { QuestionGenerationPlan } from "../src/lib/question-generation-plans";
import {
  buildQuestionTargetCandidateBlock,
  getTypeQualityRubric,
  validateQuestionQuality,
  type QuestionQualityIssue,
} from "../src/lib/question-quality";
import { buildGeminiCompactGenerationPrompt } from "../src/lib/question-generation-prompt-contract";
import {
  buildQuestionTypeSettingsPrompt,
  readSummaryWritingBlankCountSetting,
  resolveSummaryWritingSettings,
  buildSummaryWritingDirection,
} from "../src/lib/question-type-generation-settings";
import { buildGeneratedQuestionText } from "../src/lib/question-generation-persistence";
import { summaryWritingFirstLetterLine } from "../src/lib/summary-writing";

const SUBTYPE = "SUMMARY_WRITING";
const RUNS_PER_CASE = 1; // 케이스별 1회 (지문 2개 = 케이스 2개씩) — 과금 절제, 필요시 상향
const OUT_DIR = "c:\\tmp\\sw-samples2";

// ─── 지문 2개 (재생성용) ────────────────────────────────────────────────────
const PASSAGES: { id: string; topic: string; content: string }[] = [
  {
    id: "P-Sampling",
    topic: "Sampling bias",
    content:
      "When researchers want to understand a large population, they almost never measure every individual. Instead, they collect data from a smaller sample and use it to make inferences about the whole. The reliability of those inferences depends heavily on how the sample is chosen. If a researcher gathers more and more data without increasing the diversity or size of the sample in a representative way, the results do not become more accurate; instead, the existing bias is simply amplified. A famous failure occurred in 1936, when a magazine polled millions of its mostly wealthy readers and confidently predicted the wrong winner of the U.S. presidential election. The lesson is that a sample drawn from a self-selected group, rather than a truly random one, can introduce systematic bias that no amount of extra data will fix.",
  },
  {
    id: "P-Diversity",
    topic: "Superficial diversity in evaluation",
    content:
      "Organizations often celebrate diversity, but they sometimes measure it in shallow ways. When evaluators reward only the differences they can easily see, such as appearance or background, they may overlook the deeper variety of thought and experience that actually drives better decisions. Pursuing this superficial kind of diversity can backfire: it can lead to greater bias, because evaluators begin to treat visible differences as the goal in themselves rather than as one signal among many. Genuine inclusion requires looking past the surface and valuing the perspectives people bring, not merely the categories they appear to belong to. Studies of hiring committees show that groups focused on cognitive diversity consistently outperform those that chase visible markers alone.",
  },
];

// ─── 케이스 (rawSettings 조합) — 지문 2개씩 ─────────────────────────────────
interface CaseSpec {
  id: string;
  label: string;
  rawSettings: Record<string, unknown>;
  passageIds: string[];
}

const CASES: CaseSpec[] = [
  {
    id: "BASIC",
    label: "BASIC 단일빈칸 (gloss on, useAll verbatim, blank 1)",
    passageIds: ["P-Sampling", "P-Diversity"],
    rawSettings: { difficulty: "BASIC" },
  },
  {
    id: "INTERMEDIATE",
    label: "INTERMEDIATE 2빈칸+미끼 (gloss on, usePartial 미끼)",
    passageIds: ["P-Diversity", "P-Sampling"],
    rawSettings: { difficulty: "INTERMEDIATE", blankCount: 2 },
  },
  {
    id: "KILLER",
    label: "KILLER 2빈칸 inference (gloss off, inflected, 미끼)",
    passageIds: ["P-Sampling", "P-Diversity"],
    rawSettings: { difficulty: "KILLER", blankCount: 2 },
  },
  {
    id: "FIRSTLETTER",
    label: "clueMode=firstLetter, wordBank off (보기 없이 앞글자 단서)",
    passageIds: ["P-Diversity", "P-Sampling"],
    rawSettings: {
      difficulty: "INTERMEDIATE",
      clueMode: "firstLetter",
      wordBankEnabled: false,
      blankCount: 1,
    },
  },
];

// ─── 토큰화 헬퍼 ─────────────────────────────────────────────────────────────
function normTokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z]+(?:[-'][a-z]+)*/g) ?? []).filter(Boolean);
}
function contentTokens(s: string): string[] {
  return normTokens(s).filter((t) => t.length >= 4);
}

// ─── 프로덕션 미러 프롬프트 빌드 ──────────────────────────────────────────────
function buildPrompt(passageContent: string, rawSettings: Record<string, unknown>, difficulty: string): string {
  const typePrompt = STRUCTURED_TYPE_PROMPTS[SUBTYPE] || `${SUBTYPE} 유형의 문제를 만드세요.`;
  const typeQualityRubric = getTypeQualityRubric(SUBTYPE, difficulty);
  const targetCandidateBlock = buildQuestionTargetCandidateBlock(SUBTYPE, passageContent, {
    requestedDifficulty: difficulty,
  });
  const typeSettingsPrompt = buildQuestionTypeSettingsPrompt(SUBTYPE, rawSettings, difficulty);
  return buildGeminiCompactGenerationPrompt({
    schoolType: "고등학교",
    gradeInfo: "2학년",
    passageContent,
    targetCandidateBlock,
    typePrompt,
    typeQualityRubric,
    count: 1,
    difficulty,
    customPrompt: typeSettingsPrompt,
  });
}

// ─── 검증 (한 생성물에 대해) ──────────────────────────────────────────────────
interface VerifyResult {
  schemaOk: boolean;
  gateErrors: string[];
  gateWarnings: string[];
  leakFails: string[];
  structureFails: string[];
  studentText: string;
  // 회귀 게이트(직전 결함) 카운터
  blankGlossLeak: number;
  glossOneToOneWarn: number;
  firstLetterMisalign: number;
  directionPluralBug: number;
  wordCountInline: number;
}

const SECRET_FIELDS_DESC =
  "blanks[].answer / modelAnswer / acceptableVariants / wordBankDistractors / requiredLemmas";

// koreanGloss 1:1 직역 휴리스틱: answer 의 핵심어(영어)가 koreanGloss 에 그대로 박히거나,
// answer 의 한국어 직역 토큰들이 과도하게 koreanGloss 와 정렬되면 경고. 최소한 영어 정답
// 어구(연속 2토큰+)가 koreanGloss 에 통째로 들어가면 명백한 누수다.
function detectGlossOneToOne(koreanGloss: string, blanks: Record<string, unknown>[]): string[] {
  const warns: string[] = [];
  const glossLower = koreanGloss.toLowerCase();
  const glossEnSeq = ` ${contentTokens(koreanGloss).join(" ")} `;
  for (const b of blanks) {
    const answer = String(b.answer || "");
    if (!answer.trim()) continue;
    // (a) 영어 정답 어구(≥2 내용어)가 koreanGloss 에 통째로 — 명백한 누수.
    const ansToks = contentTokens(answer);
    if (ansToks.length >= 2) {
      const phrase = ` ${ansToks.join(" ")} `;
      if (glossEnSeq.includes(phrase)) {
        warns.push(`koreanGloss 에 영어 정답 어구 통째 노출: "${ansToks.join(" ")}"`);
        continue;
      }
    }
    // (b) 영어 정답 내용어가 1개라도 koreanGloss 안에 (영어로) 박혀 있으면 누수.
    for (const t of ansToks) {
      if (glossLower.includes(t)) {
        warns.push(`koreanGloss 에 영어 정답 단어 "${t}" 노출(${String(b.label)})`);
        break;
      }
    }
  }
  return warns;
}

function verifyOne(
  q: Record<string, unknown>,
  passage: string,
  difficulty: string,
  rawSettings: Record<string, unknown>,
): VerifyResult {
  const gateErrors: string[] = [];
  const gateWarnings: string[] = [];
  const leakFails: string[] = [];
  const structureFails: string[] = [];

  // 1) 스키마.
  const blankCount = readSummaryWritingBlankCountSetting(rawSettings);
  const responseSchema = getAiResponseSchema(SUBTYPE, { summaryWritingBlankCount: blankCount });
  const schemaParse = responseSchema.safeParse({ questions: [q] });
  const schemaOk = schemaParse.success;
  if (!schemaOk) {
    structureFails.push(
      "schema: " +
        schemaParse.error.issues
          .slice(0, 4)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
    );
  }

  // 2) 품질게이트.
  const issues: QuestionQualityIssue[] = validateQuestionQuality({
    typeId: SUBTYPE,
    question: q,
    passage,
    requestedDifficulty: difficulty,
    stemLanguage: "ko",
    optionLanguage: "en",
  });
  for (const issue of issues) {
    if (issue.severity === "error") gateErrors.push(`${issue.code}: ${issue.message}`);
    else gateWarnings.push(`${issue.code}: ${issue.message}`);
  }

  // 3) 학생 직렬화.
  const studentText = buildGeneratedQuestionText({ _typeId: SUBTYPE, ...q });

  // 3a) [빈칸 정답] 마커 금지(SW-LEAK-1).
  if (studentText.includes("[빈칸 정답]")) {
    leakFails.push("'[빈칸 정답]' 마커가 학생 직렬화에 노출됨 (SW-LEAK-1 위반)");
  }

  const blanks = Array.isArray(q.blanks) ? (q.blanks as Record<string, unknown>[]) : [];

  // 3b) 정답 어구(연속 2토큰+) 누수 — 설계상 노출 라인([보기]/[앞글자]) 제외.
  const leakScope = studentText
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("[보기]") && !line.trimStart().startsWith("[앞글자]"))
    .join("\n");
  const scopeSeq = ` ${contentTokens(leakScope).join(" ")} `;
  const checkPhraseLeak = (raw: unknown, fieldName: string) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    const toks = contentTokens(raw);
    if (toks.length < 2) return;
    const phrase = ` ${toks.join(" ")} `;
    if (scopeSeq.includes(phrase)) {
      leakFails.push(`${fieldName} 어구가 학생 영역(보기/앞글자 제외)에 통째로 노출: "${toks.join(" ")}"`);
    }
  };
  for (const b of blanks) checkPhraseLeak(b.answer, "blanks[].answer");
  if (studentText.includes("[미끼]") || /\bdistractor\b/i.test(studentText)) {
    leakFails.push("미끼 정체 표식(wordBankDistractors)이 학생 텍스트에 노출됨");
  }
  if (studentText.includes("[채점") || studentText.includes("[모범")) {
    leakFails.push("교사용 채점/모범답안 마커가 학생 텍스트에 노출됨");
  }

  // ── 회귀 게이트 1: blankGloss 미생성/미노출 ──────────────────────────────
  let blankGlossLeak = 0;
  const blankGlosses = Array.isArray(q.blankGlosses) ? (q.blankGlosses as unknown[]) : [];
  if (blankGlosses.length > 0) {
    // 생성 자체는 v1 계약상 "빈 배열"이어야 하나, 비어있지 않더라도 학생면에 새지만
    // 않으면 치명결함은 아니다 → 학생 직렬화 [빈칸 해석] 노출만 fail 로 본다(여기 보수적
    // 으로 1회 카운트해 가시화하고, 실제 fail 은 직렬화 노출에서).
    console.log(`    (info) blankGlosses 가 비어있지 않음(${blankGlosses.length}개) — 학생면 노출 여부로 판정`);
  }
  if (studentText.includes("[빈칸 해석]")) {
    blankGlossLeak++;
    leakFails.push("'[빈칸 해석]'(blankGlosses) 가 학생 직렬화에 노출됨 (직전 결함 회귀)");
  }

  // ── 회귀 게이트 2: koreanGloss 비-1:1 (영어 정답 미포함 + 과도정렬 경고) ───
  let glossOneToOneWarn = 0;
  const koreanGloss = typeof q.koreanGloss === "string" ? q.koreanGloss : "";
  if (koreanGloss.trim()) {
    const glossWarns = detectGlossOneToOne(koreanGloss, blanks);
    // 영어 정답이 koreanGloss 에 그대로 박힌 것은 명백한 누수(fail), 그 외 정렬 경고는 warn.
    for (const w of glossWarns) {
      if (w.includes("영어 정답")) {
        glossOneToOneWarn++;
        leakFails.push(`koreanGloss 1:1 누수: ${w}`);
      } else {
        glossOneToOneWarn++;
        gateWarnings.push(`koreanGloss-1to1: ${w}`);
      }
    }
  }

  // 4) 구조 검증.
  const summary = typeof q.summaryWithBlanks === "string" ? q.summaryWithBlanks : "";
  const labels = blanks
    .map((b) => String(b.label || "").toUpperCase())
    .filter((l) => /^\([A-Z]\)$/.test(l));
  const uniqLabels = [...new Set(labels)];
  for (const l of uniqLabels) {
    const count = summary.split(l).length - 1;
    if (count !== 1) structureFails.push(`summaryWithBlanks 에 ${l} 가 ${count}회 (정확히 1회여야)`);
  }
  const summarySeq = ` ${contentTokens(summary.replace(/\([A-Z]\)/g, " ")).join(" ")} `;
  for (const b of blanks) {
    const toks = contentTokens(String(b.answer || ""));
    if (toks.length < 2) continue;
    const phrase = ` ${toks.join(" ")} `;
    if (summarySeq.includes(phrase)) {
      structureFails.push(`summaryWithBlanks 에 정답 어구 통째 포함: "${toks.join(" ")}"`);
    }
  }
  const wordBank = Array.isArray(q.wordBank) ? (q.wordBank as unknown[]).map((w) => String(w)) : [];
  if (wordBank.length >= 2) {
    const bankSeq = wordBank.flatMap((c) => normTokens(c)).join(" ");
    const ansSeq = normTokens(
      String(q.modelAnswer || "") || blanks.map((b) => String(b.answer || "")).join(" "),
    ).join(" ");
    if (bankSeq && ansSeq && ansSeq.includes(bankSeq)) {
      structureFails.push("wordBank 나열 순서가 modelAnswer 어순과 동일(어순 누설)");
    }
  }

  // ── 회귀 게이트 3: 앞글자 정렬(정답 파생 라인) ───────────────────────────
  // 직전 결함: firstLetterHint 토큰수가 answer 와 7 vs 8 미정렬. 헬퍼는 정답에서 파생하므로
  // summaryWritingFirstLetterLine 의 각 빈칸 토큰수 == answer 단어수 여야 항상 일치.
  let firstLetterMisalign = 0;
  if (String(q.clueMode || "") === "firstLetter") {
    const line = summaryWritingFirstLetterLine(q); // "(A) p s d   (B) r o f"
    const perBlank = line.split(/\s{2,}/).filter(Boolean); // 빈칸 단위 분리
    // 라벨→힌트토큰수 맵.
    const hintByLabel: Record<string, number> = {};
    for (const seg of perBlank) {
      const m = seg.match(/^\(([A-Z])\)\s+(.*)$/);
      if (m) hintByLabel[`(${m[1]})`] = normTokens(m[2]).length;
    }
    for (const b of blanks) {
      const label = String(b.label || "").toUpperCase();
      const answer = String(b.answer || "").trim();
      const ansN = normTokens(answer).length;
      const hintN = hintByLabel[label];
      if (hintN === undefined) {
        firstLetterMisalign++;
        structureFails.push(`${label} 앞글자 라인에서 누락(firstLetter)`);
        continue;
      }
      if (hintN !== ansN) {
        firstLetterMisalign++;
        structureFails.push(`${label} 앞글자 토큰수(${hintN}) != answer 단어수(${ansN}) — 직전 결함 회귀`);
      }
    }
  }

  // ── 회귀 게이트 4: 발문 단/복수 ──────────────────────────────────────────
  let directionPluralBug = 0;
  const direction = String(q.direction || "");
  const resolved = resolveSummaryWritingSettings(rawSettings, difficulty);
  if (resolved.blankCount === 1) {
    if (direction.includes("각 빈칸")) {
      directionPluralBug++;
      structureFails.push(`발문 단/복수 버그: blankCount=1 인데 "각 빈칸" 사용 — "${direction}"`);
    }
  } else if (resolved.blankCount >= 2) {
    // 단어수 문구가 있을 때만 단/복수 검사가 의미 있음(hidden/firstLetter면 문구 자체가 없음).
    const hasWordCountClause = /빈칸을 (약 )?\d+단어로/.test(direction);
    if (hasWordCountClause && !direction.includes("각 빈칸") && /[^각] ?빈칸을/.test(direction)) {
      directionPluralBug++;
      structureFails.push(`발문 단/복수 버그: blankCount>=2 인데 "각 빈칸" 미사용 — "${direction}"`);
    }
  }

  // ── 회귀 게이트 5: 단어수 인라인 제거([요약문] 직렬화에 (약 N단어) 없어야) ──
  let wordCountInline = 0;
  for (const line of studentText.split("\n")) {
    if (line.trimStart().startsWith("[요약문]")) {
      if (/\(\s*약?\s*\d+\s*단어\s*\)/.test(line)) {
        wordCountInline++;
        structureFails.push(`[요약문] 직렬화에 단어수 인라인 노출: "${line.trim()}"`);
      }
    }
  }

  return {
    schemaOk,
    gateErrors,
    gateWarnings,
    leakFails,
    structureFails,
    studentText,
    blankGlossLeak,
    glossOneToOneWarn,
    firstLetterMisalign,
    directionPluralBug,
    wordCountInline,
  };
}

// ─── 합성 픽스처 (모델 미가용 시 폴백) — 수정된 계약 반영(blankGlosses 빈배열) ──
function syntheticFixtures() {
  return [
    {
      caseId: "BASIC",
      difficulty: "BASIC",
      passageId: "P-Sampling",
      rawSettings: { difficulty: "BASIC" } as Record<string, unknown>,
      q: {
        difficulty: "BASIC",
        direction: buildSummaryWritingDirection(resolveSummaryWritingSettings({ difficulty: "BASIC" }, "BASIC")),
        summaryWithBlanks: "(A) , which can lead to greater bias in the result.",
        blanks: [
          {
            label: "(A)",
            answer: "Collecting data without increasing the sample size",
            acceptableVariants: ["Gathering data without enlarging the sample"],
            requiredLemmas: ["collect", "sample"],
            targetWordCount: 7,
            connectorFrameAfter: ", which can lead to greater bias in the result.",
          },
        ],
        koreanGloss: "표본 크기를 늘리지 않고 자료를 더 모으기만 하면 결과의 편향이 오히려 커질 수 있다.",
        blankGlosses: [],
        wordBank: ["the sample size", "without", "collecting data", "increasing"],
        wordBankPolicy: "useAll",
        wordBankFidelity: "verbatim",
        targetWordsMode: "approx",
        connectorFrame: "full",
        summarySourceMode: "paraphrase",
        sourceSentenceParaphrase: false,
        clueMode: "none",
        modelAnswer: "Collecting data without increasing the sample size, which can lead to greater bias in the result.",
        correctAnswer: "(A) Collecting data without increasing the sample size",
        scoringCriteria: ["핵심어구 'collecting data' 포함 시 1점", "'without increasing the sample size' 포함 시 1점"],
        scoringMode: "LLM_RUBRIC",
        explanation: "지문은 표본을 늘리지 않고 자료만 더 모으면 편향이 증폭된다고 말한다.",
        keyPoints: ["표본 편향", "데이터 양 != 정확도", "동명사구 영작"],
        tags: ["요약문영작", "표본편향"],
      } as Record<string, unknown>,
    },
    {
      caseId: "INTERMEDIATE",
      difficulty: "INTERMEDIATE",
      passageId: "P-Diversity",
      rawSettings: { difficulty: "INTERMEDIATE", blankCount: 2 } as Record<string, unknown>,
      q: {
        difficulty: "INTERMEDIATE",
        direction: buildSummaryWritingDirection(resolveSummaryWritingSettings({ difficulty: "INTERMEDIATE", blankCount: 2 }, "INTERMEDIATE")),
        summaryWithBlanks: "(A) , which can lead to greater bias, because evaluators (B) .",
        blanks: [
          {
            label: "(A)",
            answer: "Pursuing superficial diversity",
            acceptableVariants: ["Chasing surface-level diversity"],
            requiredLemmas: ["pursue", "diversity"],
            targetWordCount: 3,
            connectorFrameAfter: ", which can lead to greater bias,",
          },
          {
            label: "(B)",
            answer: "reward only visible differences",
            acceptableVariants: ["reward visible differences alone"],
            requiredLemmas: ["reward", "visible"],
            targetWordCount: 4,
          },
        ],
        koreanGloss: "겉으로 드러나는 차이에만 치우쳐 평가하면 오히려 편향이 커질 수 있다.",
        blankGlosses: [],
        wordBank: ["differences", "pursuing", "reward", "diversity", "only", "superficial", "visible", "real", "actual"],
        wordBankDistractors: ["real", "actual"],
        wordBankPolicy: "usePartial",
        wordBankFidelity: "verbatim",
        blankAssignment: "separate",
        targetWordsMode: "approx",
        connectorFrame: "partial",
        summarySourceMode: "paraphrase",
        sourceSentenceParaphrase: false,
        clueMode: "none",
        modelAnswer: "Pursuing superficial diversity, which can lead to greater bias, because evaluators reward only visible differences.",
        correctAnswer: "(A) Pursuing superficial diversity, (B) reward only visible differences",
        scoringCriteria: ["(A) 'superficial diversity' 핵심어 1점", "(B) 'visible differences' 핵심어 1점"],
        scoringMode: "LLM_RUBRIC",
        explanation: "표면적 다양성 추구가 가시적 차이에만 보상하게 만들어 편향을 키운다.",
        keyPoints: ["표면적 다양성", "미끼 real/actual 배제", "두 빈칸 배분"],
        tags: ["요약문영작", "다양성"],
      } as Record<string, unknown>,
    },
    {
      caseId: "FIRSTLETTER",
      difficulty: "INTERMEDIATE",
      passageId: "P-Sampling",
      rawSettings: { difficulty: "INTERMEDIATE", clueMode: "firstLetter", wordBankEnabled: false, blankCount: 1 } as Record<string, unknown>,
      q: {
        difficulty: "INTERMEDIATE",
        direction: buildSummaryWritingDirection(resolveSummaryWritingSettings({ difficulty: "INTERMEDIATE", clueMode: "firstLetter", wordBankEnabled: false, blankCount: 1 }, "INTERMEDIATE")),
        summaryWithBlanks: "A self-selected sample introduces (A) that more data cannot fix.",
        blanks: [
          {
            label: "(A)",
            answer: "systematic bias",
            acceptableVariants: ["a systematic bias"],
            requiredLemmas: ["systematic", "bias"],
            firstLetterHint: "s b",
            targetWordCount: 2,
          },
        ],
        koreanGloss: "스스로 선택된 표본은 자료를 아무리 늘려도 고칠 수 없는 문제를 낳는다.",
        blankGlosses: [],
        wordBankPolicy: "freeCount",
        wordBankFidelity: "verbatim",
        targetWordsMode: "hidden",
        connectorFrame: "partial",
        summarySourceMode: "paraphrase",
        sourceSentenceParaphrase: false,
        clueMode: "firstLetter",
        modelAnswer: "A self-selected sample introduces systematic bias that more data cannot fix.",
        correctAnswer: "(A) systematic bias",
        scoringCriteria: ["'systematic bias' 핵심어 2점"],
        scoringMode: "LLM_RUBRIC",
        explanation: "자기선택 표본은 체계적 편향을 낳고 데이터 양으로는 교정되지 않는다.",
        keyPoints: ["체계적 편향", "앞글자 단서", "보기 없이 영작"],
        tags: ["요약문영작", "표본편향"],
      } as Record<string, unknown>,
    },
  ];
}

// ─── 단건 실행 (실모델) ──────────────────────────────────────────────────────
type GenStatus = "ok-premium" | "ok-standard" | "gen_unavailable";

async function tryGenerate(
  prompt: string,
  rawSettings: Record<string, unknown>,
  logPrefix: string,
): Promise<{ q: Record<string, unknown> | null; plan: GenStatus; error?: string }> {
  const blankCount = readSummaryWritingBlankCountSetting(rawSettings);
  const schema = getAiResponseSchema(SUBTYPE, { summaryWritingBlankCount: blankCount });
  const plans: { plan: QuestionGenerationPlan; tag: GenStatus }[] = [
    { plan: "PREMIUM", tag: "ok-premium" },
    { plan: "STANDARD", tag: "ok-standard" },
  ];
  let lastErr = "";
  for (const { plan, tag } of plans) {
    try {
      const result = await generateQuestionObject({
        schema,
        prompt,
        generationPlan: plan,
        logPrefix: `${logPrefix}-${plan}`,
        maxRetries: 1,
        maxTokens: 6000,
      });
      const obj = result.object as { questions?: Record<string, unknown>[] };
      const q = Array.isArray(obj?.questions) && obj.questions[0] ? obj.questions[0] : null;
      if (q) {
        console.log(`  ✓ generated via ${plan}`);
        return { q, plan: tag };
      }
      lastErr = `${plan}: empty questions[]`;
      console.warn(`  ✗ ${plan} returned empty`);
    } catch (err) {
      lastErr = `${plan}: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`  ✗ ${plan} failed: ${lastErr}`);
    }
  }
  return { q: null, plan: "gen_unavailable", error: lastErr };
}

// ─── 풀 내용 출력 ────────────────────────────────────────────────────────────
function dumpContent(q: Record<string, unknown>) {
  const blanks = Array.isArray(q.blanks) ? (q.blanks as Record<string, unknown>[]) : [];
  console.log("  ── direction ──");
  console.log("    " + String(q.direction || "(없음)"));
  console.log("  ── koreanGloss ──");
  console.log("    " + String(q.koreanGloss || "(없음 — gloss off)"));
  console.log("  ── blankGlosses ──");
  console.log("    " + (Array.isArray(q.blankGlosses) ? JSON.stringify(q.blankGlosses) : "(없음/undefined)"));
  console.log("  ── summaryWithBlanks ──");
  console.log("    " + String(q.summaryWithBlanks || "(없음)"));
  console.log("  ── wordBank ──");
  console.log("    " + (Array.isArray(q.wordBank) ? (q.wordBank as unknown[]).join(" / ") : "(없음 — wordBank off)"));
  if (Array.isArray(q.wordBankDistractors)) {
    console.log("  ── wordBankDistractors (비밀) ──");
    console.log("    " + (q.wordBankDistractors as unknown[]).join(" / "));
  }
  console.log("  ── blanks[].answer (비밀) ──");
  for (const b of blanks) {
    console.log(`    ${b.label}: ${b.answer}` + (b.firstLetterHint ? `   [모델 firstLetterHint: ${b.firstLetterHint}]` : ""));
  }
  console.log("  ── modelAnswer (비밀) ──");
  console.log("    " + String(q.modelAnswer || "(없음)"));
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
interface SampleOut {
  id: string;
  difficulty: string;
  subType: string;
  structuredData: Record<string, unknown>;
  questionText: string;
  correctAnswer: string;
  points: number;
}

function pointsForDifficulty(d: string): number {
  if (d === "BASIC") return 2;
  if (d === "KILLER") return 4;
  return 3;
}

async function main() {
  console.log("\n" + "#".repeat(80));
  console.log("# SUMMARY_WRITING — 실모델 재생성·회귀검증 v2 (OUT=" + OUT_DIR + ")");
  console.log("#".repeat(80));

  let generated = 0;
  let passed = 0;
  let failed = 0;
  let leakFailsTotal = 0;
  let blankGlossLeakTotal = 0;
  let glossOneToOneWarnTotal = 0;
  let firstLetterMisalignTotal = 0;
  let directionPluralBugTotal = 0;
  let wordCountInlineTotal = 0;
  const gateFails: { case: string; codes: string[] }[] = [];
  const samples: SampleOut[] = [];
  let usedModel: GenStatus | "synthetic" = "gen_unavailable";
  let anyRealGen = false;
  const sampleSummaries: string[] = [];

  const passageById = (id: string) => PASSAGES.find((p) => p.id === id)!;

  for (const c of CASES) {
    const difficulty = String(c.rawSettings.difficulty || "INTERMEDIATE");
    const resolved = resolveSummaryWritingSettings(c.rawSettings, difficulty);
    const expectedDirection = buildSummaryWritingDirection(resolved);

    console.log("\n" + "=".repeat(80));
    console.log(`CASE ${c.id} — ${c.label}`);
    console.log(`  resolved: gloss=${resolved.glossEnabled}/${resolved.glossLooseness} wordBank=${resolved.wordBankEnabled}/${resolved.wordBankUsage} distractors=${resolved.boxDistractors} fidelity=${resolved.wordBankFidelity} blankCount=${resolved.blankCount} clue=${resolved.clueMode} targetWords=${resolved.targetWordsMode} source=${resolved.summarySourceMode}`);
    console.log(`  expected direction: ${expectedDirection}`);
    console.log("=".repeat(80));

    for (const passageId of c.passageIds) {
      const passage = passageById(passageId);
      const prompt = buildPrompt(passage.content, c.rawSettings, difficulty);
      for (let run = 1; run <= RUNS_PER_CASE; run++) {
        console.log(`\n[${c.id} | ${passage.id} (${passage.topic}) | run ${run}/${RUNS_PER_CASE}]`);
        const gen = await tryGenerate(prompt, c.rawSettings, `SW2-${c.id}-${passage.id}-r${run}`);
        if (!gen.q) {
          console.warn(`  GENERATION UNAVAILABLE: ${gen.error}`);
          continue;
        }
        anyRealGen = true;
        usedModel = gen.plan;
        generated++;
        const q = gen.q;
        dumpContent(q);

        const vr = verifyOne(q, passage.content, difficulty, c.rawSettings);
        const ok =
          vr.schemaOk &&
          vr.gateErrors.length === 0 &&
          vr.leakFails.length === 0 &&
          vr.structureFails.length === 0;

        console.log("  ── 검증 ──");
        console.log(`    schema: ${vr.schemaOk ? "PASS" : "FAIL"}`);
        console.log(`    gate errors: ${vr.gateErrors.length}` + (vr.gateErrors.length ? "\n      - " + vr.gateErrors.join("\n      - ") : ""));
        if (vr.gateWarnings.length) console.log(`    gate warnings: ${vr.gateWarnings.length}\n      - ` + vr.gateWarnings.join("\n      - "));
        console.log(`    leak fails: ${vr.leakFails.length}` + (vr.leakFails.length ? "\n      - " + vr.leakFails.join("\n      - ") : ""));
        console.log(`    structure fails: ${vr.structureFails.length}` + (vr.structureFails.length ? "\n      - " + vr.structureFails.join("\n      - ") : ""));
        console.log(`    [회귀] blankGlossLeak=${vr.blankGlossLeak} glossOneToOneWarn=${vr.glossOneToOneWarn} firstLetterMisalign=${vr.firstLetterMisalign} directionPluralBug=${vr.directionPluralBug} wordCountInline=${vr.wordCountInline}`);
        console.log("  ── 학생 직렬화(buildGeneratedQuestionText) ──");
        console.log(vr.studentText.split("\n").map((l) => "    " + l).join("\n"));
        console.log(`  ⇒ ${ok ? "PASS" : "FAIL"}`);

        leakFailsTotal += vr.leakFails.length;
        blankGlossLeakTotal += vr.blankGlossLeak;
        glossOneToOneWarnTotal += vr.glossOneToOneWarn;
        firstLetterMisalignTotal += vr.firstLetterMisalign;
        directionPluralBugTotal += vr.directionPluralBug;
        wordCountInlineTotal += vr.wordCountInline;
        if (vr.gateErrors.length) {
          gateFails.push({ case: `${c.id}-${passage.id}-r${run}`, codes: vr.gateErrors.map((e) => e.split(":")[0]) });
        }
        if (ok) {
          passed++;
          samples.push({
            id: `sw-${c.id.toLowerCase()}-${passage.id.toLowerCase()}-r${run}-${usedModel}`,
            difficulty,
            subType: SUBTYPE,
            structuredData: q,
            questionText: vr.studentText,
            correctAnswer: String(q.correctAnswer || q.modelAnswer || ""),
            points: pointsForDifficulty(difficulty),
          });
        } else {
          failed++;
        }
        if (sampleSummaries.length < 2) {
          const bks = Array.isArray(q.blanks) ? (q.blanks as Record<string, unknown>[]) : [];
          sampleSummaries.push(
            `[${c.id}/${passage.id}/${usedModel}] dir="${String(q.direction).slice(0, 60)}" | summary="${String(q.summaryWithBlanks).slice(0, 60)}" | gloss="${String(q.koreanGloss || "(off)").slice(0, 40)}" | ans=${bks.map((b) => `${b.label}:${b.answer}`).join(" ")} | leak=${vr.leakFails.length} gateErr=${vr.gateErrors.length}`,
          );
        }
      }
    }
  }

  // ── 모델 미가용 폴백 ──
  if (!anyRealGen) {
    console.log("\n" + "!".repeat(80));
    console.log("! 실모델 생성 전부 실패 — 합성 픽스처로 검증 진행 (status: gen_unavailable)");
    console.log("!".repeat(80));
    usedModel = "synthetic";
    for (const fx of syntheticFixtures()) {
      const passage = passageById(fx.passageId);
      console.log("\n" + "=".repeat(80));
      console.log(`SYNTHETIC ${fx.caseId}`);
      console.log("=".repeat(80));
      dumpContent(fx.q);
      generated++;
      const vr = verifyOne(fx.q, passage.content, fx.difficulty, fx.rawSettings);
      const ok =
        vr.schemaOk &&
        vr.gateErrors.length === 0 &&
        vr.leakFails.length === 0 &&
        vr.structureFails.length === 0;
      console.log("  ── 검증 ──");
      console.log(`    schema: ${vr.schemaOk ? "PASS" : "FAIL"}`);
      console.log(`    gate errors: ${vr.gateErrors.length}` + (vr.gateErrors.length ? "\n      - " + vr.gateErrors.join("\n      - ") : ""));
      console.log(`    leak fails: ${vr.leakFails.length}` + (vr.leakFails.length ? "\n      - " + vr.leakFails.join("\n      - ") : ""));
      console.log(`    structure fails: ${vr.structureFails.length}` + (vr.structureFails.length ? "\n      - " + vr.structureFails.join("\n      - ") : ""));
      console.log(`    [회귀] blankGlossLeak=${vr.blankGlossLeak} glossOneToOneWarn=${vr.glossOneToOneWarn} firstLetterMisalign=${vr.firstLetterMisalign} directionPluralBug=${vr.directionPluralBug} wordCountInline=${vr.wordCountInline}`);
      console.log("  ── 학생 직렬화 ──");
      console.log(vr.studentText.split("\n").map((l) => "    " + l).join("\n"));
      console.log(`  ⇒ ${ok ? "PASS" : "FAIL"}`);
      leakFailsTotal += vr.leakFails.length;
      blankGlossLeakTotal += vr.blankGlossLeak;
      glossOneToOneWarnTotal += vr.glossOneToOneWarn;
      firstLetterMisalignTotal += vr.firstLetterMisalign;
      directionPluralBugTotal += vr.directionPluralBug;
      wordCountInlineTotal += vr.wordCountInline;
      if (vr.gateErrors.length) gateFails.push({ case: `SYN-${fx.caseId}`, codes: vr.gateErrors.map((e) => e.split(":")[0]) });
      if (ok) {
        passed++;
        samples.push({
          id: `sw-synthetic-${fx.caseId.toLowerCase()}`,
          difficulty: fx.difficulty,
          subType: SUBTYPE,
          structuredData: fx.q,
          questionText: vr.studentText,
          correctAnswer: String(fx.q.correctAnswer || ""),
          points: pointsForDifficulty(fx.difficulty),
        });
      } else {
        failed++;
      }
      if (sampleSummaries.length < 2) {
        const bks = Array.isArray(fx.q.blanks) ? (fx.q.blanks as Record<string, unknown>[]) : [];
        sampleSummaries.push(
          `[SYN-${fx.caseId}] dir="${String(fx.q.direction).slice(0, 60)}" | summary="${String(fx.q.summaryWithBlanks).slice(0, 60)}" | ans=${bks.map((b) => `${b.label}:${b.answer}`).join(" ")} | leak=${vr.leakFails.length}`,
        );
      }
    }
  }

  // ── 샘플 저장 (통과분만 — 다음 단계 소비) ──
  const samplesPath = `${OUT_DIR}\\questions.json`;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(samplesPath, JSON.stringify(samples, null, 2), "utf-8");

  console.log("\n" + "#".repeat(80));
  console.log("# 최종 요약");
  console.log("#".repeat(80));
  console.log(`model: ${usedModel}`);
  console.log(`generated: ${generated}  passed: ${passed}  failed: ${failed}`);
  console.log(`leakFails: ${leakFailsTotal}  gateFails: ${gateFails.length}`);
  console.log(`[회귀] blankGlossLeak=${blankGlossLeakTotal} glossOneToOneWarn=${glossOneToOneWarnTotal} firstLetterMisalign=${firstLetterMisalignTotal} directionPluralBug=${directionPluralBugTotal} wordCountInline=${wordCountInlineTotal}`);
  console.log(`samples saved: ${samplesPath} (${samples.length} 통과항목)`);

  const out = {
    ok:
      failed === 0 &&
      leakFailsTotal === 0 &&
      blankGlossLeakTotal === 0 &&
      firstLetterMisalignTotal === 0 &&
      directionPluralBugTotal === 0 &&
      wordCountInlineTotal === 0 &&
      generated > 0,
    model: usedModel,
    generated,
    passed,
    blankGlossLeak: blankGlossLeakTotal,
    glossOneToOneWarn: glossOneToOneWarnTotal,
    firstLetterMisalign: firstLetterMisalignTotal,
    directionPluralBug: directionPluralBugTotal,
    wordCountInline: wordCountInlineTotal,
    leakFails: leakFailsTotal,
    gateFails: gateFails.length,
    samplesPath,
    notes: anyRealGen
      ? `실모델(${usedModel}) 재생성 검증. 비밀필드(${SECRET_FIELDS_DESC}) 누수=${leakFailsTotal}, 직전결함 회귀(blankGloss/gloss1:1/앞글자/단복수/단어수인라인)=${blankGlossLeakTotal}/${glossOneToOneWarnTotal}/${firstLetterMisalignTotal}/${directionPluralBugTotal}/${wordCountInlineTotal}.`
      : "실모델 생성 전부 실패 — 합성 픽스처로 검증(gen_unavailable).",
    sampleContent: sampleSummaries.join(" || "),
  };
  console.log("\n===RESULT_JSON_START===");
  console.log(JSON.stringify(out, null, 2));
  console.log("===RESULT_JSON_END===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
