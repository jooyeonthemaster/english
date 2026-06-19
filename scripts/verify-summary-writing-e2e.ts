/* eslint-disable no-console */
/**
 * SUMMARY_WRITING (요약문 영작) — 실모델 E2E 생성·검증 하니스.
 *   npx tsx scripts/verify-summary-writing-e2e.ts
 *
 * 목적: 신규 서술형 유형 SUMMARY_WRITING 을 "실제 모델로 생성"해 스키마·품질게이트·
 *   정답 누수·구조 규칙을 한 번에 검증한다. (synthetic 픽스처 누수가드는 별도
 *   scripts/verify-summary-writing.ts 가 담당 — 본 스크립트는 실 생성물 품질 검증.)
 *
 * 프로덕션 경로(run-question-generation.ts)를 1:1 미러:
 *   buildGeminiCompactGenerationPrompt(typePrompt=STRUCTURED_TYPE_PROMPTS, rubric)
 *     + mergeCustomPrompt(buildQuestionTypeSettingsPrompt(SUMMARY_WRITING, rawSettings, difficulty))
 *   → generateQuestionObject({ schema: getAiResponseSchema("SUMMARY_WRITING",{summaryWritingBlankCount}) })
 *   → validateQuestionQuality("SUMMARY_WRITING", q, ...)
 *   → buildGeneratedQuestionText({_typeId, ...q}) 로 누수 검사.
 *
 * 모델: PREMIUM(Claude claude-sonnet-4-6) 우선 → 실패 시 STANDARD(Gemini) 폴백 →
 *   둘 다 실패(키 문제)면 status:"gen_unavailable" + 합성 픽스처 3개로 검증 진행.
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

const SUBTYPE = "SUMMARY_WRITING";
const RUNS_PER_CASE = 2; // 비결정성 표면화

// ─── 지문 (적절한 영어 지문 3개) ───────────────────────────────────────────
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
  {
    id: "P-Habit",
    topic: "Habits shape identity",
    content:
      "Small actions, repeated daily, quietly build the person we become. A single decision to read for ten minutes or to take a short walk seems trivial in isolation. Yet when such choices are consumed as a habit and repeated over months and years, they accumulate into something far larger than any one act. Psychologists argue that we do not simply have habits; our habits gradually shape our sense of who we are. Each time you act in a certain way, you cast a vote for a particular identity, and over time the evidence piles up. In this sense, the goal is not so much to achieve a single outcome as to become the type of person whose ordinary routine makes that outcome almost inevitable.",
  },
];

// ─── 케이스 (rawSettings 조합) ──────────────────────────────────────────────
interface CaseSpec {
  id: string;
  label: string;
  rawSettings: Record<string, unknown>;
  passageId: string;
}

// rawSettings 는 flat 키(resolve/read 헬퍼가 flat 우선 → nested(typeId) 폴백)로 준다.
const CASES: CaseSpec[] = [
  {
    id: "BASIC",
    label: "BASIC 단일빈칸 (gloss on, useAll verbatim, blank 1)",
    passageId: "P-Sampling",
    rawSettings: {
      difficulty: "BASIC",
      // BASIC 프리셋: gloss on/literal, wordBank useAll/verbatim, blank 1
    },
  },
  {
    id: "INTERMEDIATE",
    label: "INTERMEDIATE 2빈칸+미끼 (gloss on, usePartial 미끼)",
    passageId: "P-Diversity",
    rawSettings: {
      difficulty: "INTERMEDIATE",
      blankCount: 2,
      // INTER 프리셋: gloss on/natural, usePartial + boxDistractors 1
    },
  },
  {
    id: "KILLER",
    label: "KILLER 2빈칸 inference (gloss off, inflected, 미끼)",
    passageId: "P-Habit",
    rawSettings: {
      difficulty: "KILLER",
      blankCount: 2,
      // KILLER 프리셋: gloss off, usePartial inflected, inference, shared, distractors 2
    },
  },
  {
    id: "FIRSTLETTER",
    label: "clueMode=firstLetter, wordBank off (보기 없이 앞글자 단서)",
    passageId: "P-Sampling",
    rawSettings: {
      difficulty: "INTERMEDIATE",
      clueMode: "firstLetter",
      wordBankEnabled: false,
      blankCount: 1,
    },
  },
];

// ─── 토큰화 헬퍼 (누수 검사) ─────────────────────────────────────────────────
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
  // 결정론 발문·세부옵션 제약 주입 (directionAutoText·보기/단서/난이도)
  const typeSettingsPrompt = buildQuestionTypeSettingsPrompt(SUBTYPE, rawSettings, difficulty);

  const base = buildGeminiCompactGenerationPrompt({
    schoolType: "고등학교",
    gradeInfo: "2학년",
    passageContent,
    targetCandidateBlock,
    typePrompt,
    typeQualityRubric,
    count: 1,
    difficulty,
    // 프로덕션의 mergeCustomPromptWithTypeSettings 와 동일 효과 — 세부옵션 제약을 customPrompt 로.
    customPrompt: typeSettingsPrompt,
  });
  return base;
}

// ─── 검증 (한 생성물에 대해) ──────────────────────────────────────────────────
interface VerifyResult {
  schemaOk: boolean;
  gateErrors: string[];
  gateWarnings: string[];
  leakFails: string[];
  structureFails: string[];
  studentText: string;
}

const SECRET_FIELDS_DESC = "blanks[].answer / modelAnswer / acceptableVariants / wordBankDistractors";

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

  // 1) 스키마 통과(getAiResponseSchema) — 단건 재검증.
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

  // 2) 품질게이트 — validateQuestionQuality → error severity 0 이어야.
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

  // 3) 누수 — 학생 직렬화 텍스트에 정답계열 토큰이 안 나오는지.
  //    buildGeneratedQuestionText 는 _typeId/subType 로 SUMMARY_WRITING 분기.
  const studentText = buildGeneratedQuestionText({ _typeId: SUBTYPE, ...q });

  // 3a) [빈칸 정답] 마커 금지(SW-LEAK-1).
  if (studentText.includes("[빈칸 정답]")) {
    leakFails.push("'[빈칸 정답]' 마커가 학생 직렬화에 노출됨 (SW-LEAK-1 위반)");
  }

  // 3b) 정답계열 "어구"(blanks[].answer 의 연속 다토큰)가 학생 직렬화에 통째로
  //     박혀 있으면 누수. 계약(question-quality.ts sw-answer-not-in-summary)과 동일 철학:
  //       · modelAnswer/acceptableVariants 는 누수 비교 제외 — 빈칸을 채운 "전체 문장"이라
  //         connectorFrame·빈칸밖 가시 텍스트를 visible summary 와 정당히 길게 공유한다.
  //       · [보기]·[앞글자] 줄은 설계상 의도된 노출(보기 칩은 정답 구성 단어를 담는 게 본질,
  //         앞글자는 첫 글자만)이므로 누수 검사 대상에서 제외한다.
  //       · 단일 내용어 1개 공유는 paraphrase/inference 자연 겹침이라 허용 — 연속 2토큰+만 누수.
  const blanks = Array.isArray(q.blanks) ? (q.blanks as Record<string, unknown>[]) : [];
  // 설계상 노출 라인([보기]/[앞글자])을 제거한, "정답이 새면 안 되는" 학생 영역만 남긴다.
  const leakScope = studentText
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("[보기]") && !line.trimStart().startsWith("[앞글자]"))
    .join("\n");
  const scopeSeq = ` ${contentTokens(leakScope).join(" ")} `;
  // 계약(sw-answer-not-in-summary)과 정확히 일치: 정답의 "내용어 전체 어구"(≥4글자 토큰을
  // 이은 연속열)가 통째로 학생 영역에 나타날 때만 누수로 본다. connectorFrame 가 정답의
  // 일부 내용어(desired/outcome 등)를 정당히 공유하는 부분 겹침은 허용(거짓양성 방지).
  const checkPhraseLeak = (raw: unknown, fieldName: string) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    const toks = contentTokens(raw);
    if (toks.length < 2) return;
    const phrase = ` ${toks.join(" ")} `;
    if (scopeSeq.includes(phrase)) {
      leakFails.push(`${fieldName} 어구가 학생 영역(보기/앞글자 제외)에 통째로 노출: "${toks.join(" ")}"`);
    }
  };
  // 빈칸별 비밀 영작(blanks[].answer)만 누수 대상(계약과 동일).
  for (const b of blanks) checkPhraseLeak(b.answer, "blanks[].answer");
  // 비밀 필드의 별도 마커가 따로 새지 않는지(미끼 정체/채점/모범답안 라벨).
  if (studentText.includes("[미끼]") || /\bdistractor\b/i.test(studentText)) {
    leakFails.push("미끼 정체 표식(wordBankDistractors)이 학생 텍스트에 노출됨");
  }
  if (studentText.includes("[채점") || studentText.includes("[모범")) {
    leakFails.push("교사용 채점/모범답안 마커가 학생 텍스트에 노출됨");
  }

  // 4) 구조 검증.
  const summary = typeof q.summaryWithBlanks === "string" ? q.summaryWithBlanks : "";
  const labels = blanks
    .map((b) => String(b.label || "").toUpperCase())
    .filter((l) => /^\([A-Z]\)$/.test(l));
  const uniqLabels = [...new Set(labels)];

  // 4a) summaryWithBlanks 에 각 라벨 정확히 1회.
  for (const l of uniqLabels) {
    const count = summary.split(l).length - 1;
    if (count !== 1) structureFails.push(`summaryWithBlanks 에 ${l} 가 ${count}회 (정확히 1회여야)`);
  }

  // 4b) summaryWithBlanks 에 정답어구(answer 다토큰) 미포함 — placeholder 만.
  const summarySeq = ` ${contentTokens(summary.replace(/\([A-Z]\)/g, " ")).join(" ")} `;
  for (const b of blanks) {
    const toks = contentTokens(String(b.answer || ""));
    if (toks.length < 2) continue;
    const phrase = ` ${toks.join(" ")} `;
    if (summarySeq.includes(phrase)) {
      structureFails.push(`summaryWithBlanks 에 정답 어구 통째 포함: "${toks.join(" ")}"`);
    }
  }

  // 4c) wordBank 가 modelAnswer 어순과 다른지(어순 누설 금지).
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

  // 4d) firstLetter 케이스: firstLetterHint 토큰수 == answer 토큰수.
  if (String(q.clueMode || "") === "firstLetter") {
    for (const b of blanks) {
      const hint = String(b.firstLetterHint || "").trim();
      const answer = String(b.answer || "").trim();
      if (!hint || !answer) {
        structureFails.push(`clueMode=firstLetter 인데 ${b.label} firstLetterHint/answer 누락`);
        continue;
      }
      const hintN = normTokens(hint).length;
      const ansN = normTokens(answer).length;
      if (hintN !== ansN) {
        structureFails.push(`${b.label} firstLetterHint 토큰수(${hintN}) != answer 토큰수(${ansN})`);
      }
    }
  }

  return { schemaOk, gateErrors, gateWarnings, leakFails, structureFails, studentText };
}

// ─── 합성 픽스처 (모델 미가용 시 폴백) ────────────────────────────────────────
function syntheticFixtures(): { caseId: string; difficulty: string; rawSettings: Record<string, unknown>; q: Record<string, unknown>; passageId: string }[] {
  return [
    // 레퍼런스1: BASIC 단일빈칸
    {
      caseId: "BASIC",
      difficulty: "BASIC",
      passageId: "P-Sampling",
      rawSettings: { difficulty: "BASIC" },
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
        koreanGloss: "표본 크기를 늘리지 않고 데이터를 더 모으기만 하면 결과의 편향이 커질 수 있다.",
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
        explanation: "지문은 표본을 늘리지 않고 데이터만 더 모으면 편향이 증폭된다고 말한다.",
        keyPoints: ["표본 편향", "데이터 양 != 정확도", "동명사구 영작"],
        tags: ["요약문영작", "표본편향"],
      },
    },
    // INTER: 2빈칸 + 미끼
    {
      caseId: "INTERMEDIATE",
      difficulty: "INTERMEDIATE",
      passageId: "P-Diversity",
      rawSettings: { difficulty: "INTERMEDIATE", blankCount: 2 },
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
        koreanGloss: "겉으로 드러나는 다양성만 좇으면, 평가자들이 보이는 차이에만 보상하게 되어 오히려 편향이 커질 수 있다.",
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
      },
    },
    // KILLER: 2빈칸 inference + firstLetter 포함
    {
      caseId: "KILLER",
      difficulty: "KILLER",
      passageId: "P-Habit",
      rawSettings: { difficulty: "KILLER", blankCount: 2, clueMode: "firstLetter" },
      q: {
        difficulty: "KILLER",
        direction: buildSummaryWritingDirection(resolveSummaryWritingSettings({ difficulty: "KILLER", blankCount: 2, clueMode: "firstLetter" }, "KILLER")),
        summaryWithBlanks: "What we (A) , so our (B) over time.",
        blanks: [
          {
            label: "(A)",
            answer: "repeatedly consume as habit",
            acceptableVariants: ["consume repeatedly as a habit"],
            requiredLemmas: ["repeat", "consume", "habit"],
            firstLetterHint: "r c a h",
            connectorFrameAfter: ", so",
          },
          {
            label: "(B)",
            answer: "habits shape our identity",
            acceptableVariants: ["routines form who we are"],
            requiredLemmas: ["habit", "shape", "identity"],
            firstLetterHint: "h s o i",
          },
        ],
        wordBank: ["shape", "consume", "habit", "our", "repeatedly", "identity", "as", "shaping", "form", "become"],
        wordBankDistractors: ["shaping", "form", "become"],
        wordBankPolicy: "usePartial",
        wordBankFidelity: "inflected",
        blankAssignment: "shared",
        targetWordsMode: "hidden",
        connectorFrame: "partial",
        summarySourceMode: "inference",
        sourceSentenceParaphrase: true,
        clueMode: "firstLetter",
        modelAnswer: "What we repeatedly consume as habit, so our habits shape our identity over time.",
        correctAnswer: "(A) repeatedly consume as habit, (B) habits shape our identity",
        scoringCriteria: ["(A) 'consume/habit' 핵심 1점", "(B) 'shape identity' 핵심 1점", "어형 적절성 1점"],
        scoringMode: "LLM_RUBRIC",
        explanation: "지문의 상위 명제: 반복되는 습관이 정체성을 형성한다는 추론 요약.",
        keyPoints: ["추론 요약", "어형 변형(inflected)", "shared 배분", "앞글자 단서"],
        tags: ["요약문영작", "습관", "정체성"],
      },
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

// ─── 풀 출력 ─────────────────────────────────────────────────────────────────
function dumpContent(q: Record<string, unknown>) {
  const blanks = Array.isArray(q.blanks) ? (q.blanks as Record<string, unknown>[]) : [];
  console.log("  ── direction ──");
  console.log("    " + String(q.direction || "(없음)"));
  console.log("  ── koreanGloss ──");
  console.log("    " + String(q.koreanGloss || "(없음 — gloss off)"));
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
    console.log(`    ${b.label}: ${b.answer}` + (b.firstLetterHint ? `   [앞글자: ${b.firstLetterHint}]` : ""));
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
  console.log("# SUMMARY_WRITING — 실모델 E2E 생성·검증");
  console.log("#".repeat(80));

  let generated = 0;
  let passed = 0;
  let failed = 0;
  let leakFailsTotal = 0;
  const gateFails: { case: string; codes: string[] }[] = [];
  const samples: SampleOut[] = [];
  let usedModel: GenStatus | "synthetic" = "gen_unavailable";
  let anyRealGen = false;
  const sampleSummaries: string[] = [];

  const passageById = (id: string) => PASSAGES.find((p) => p.id === id)!;

  for (const c of CASES) {
    const passage = passageById(c.passageId);
    const difficulty = String(c.rawSettings.difficulty || "INTERMEDIATE");
    const resolved = resolveSummaryWritingSettings(c.rawSettings, difficulty);
    const expectedDirection = buildSummaryWritingDirection(resolved);

    console.log("\n" + "=".repeat(80));
    console.log(`CASE ${c.id} — ${c.label}`);
    console.log(`  passage: ${passage.id} (${passage.topic})`);
    console.log(`  resolved: gloss=${resolved.glossEnabled}/${resolved.glossLooseness} wordBank=${resolved.wordBankEnabled}/${resolved.wordBankUsage} distractors=${resolved.boxDistractors} fidelity=${resolved.wordBankFidelity} blankCount=${resolved.blankCount} clue=${resolved.clueMode} targetWords=${resolved.targetWordsMode} source=${resolved.summarySourceMode}`);
    console.log(`  expected direction: ${expectedDirection}`);
    console.log("=".repeat(80));

    const prompt = buildPrompt(passage.content, c.rawSettings, difficulty);

    for (let run = 1; run <= RUNS_PER_CASE; run++) {
      console.log(`\n[${c.id} run ${run}/${RUNS_PER_CASE}]`);
      const gen = await tryGenerate(prompt, c.rawSettings, `SW-${c.id}-r${run}`);
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
      const allErrors = [...vr.structureFails];
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
      console.log("  ── 학생 직렬화(buildGeneratedQuestionText) ──");
      console.log(vr.studentText.split("\n").map((l) => "    " + l).join("\n"));
      console.log(`  ⇒ ${ok ? "PASS" : "FAIL"}`);

      leakFailsTotal += vr.leakFails.length;
      if (vr.gateErrors.length) {
        gateFails.push({ case: `${c.id}-r${run}`, codes: vr.gateErrors.map((e) => e.split(":")[0]) });
      }
      void allErrors;
      if (ok) passed++;
      else failed++;

      // 샘플 저장(통과분 우선, 실패도 진단용으로 기록하되 통과한 것만 export 소비 대상으로).
      samples.push({
        id: `sw-${c.id.toLowerCase()}-r${run}-${usedModel}`,
        difficulty,
        subType: SUBTYPE,
        structuredData: q,
        questionText: vr.studentText,
        correctAnswer: String(q.correctAnswer || q.modelAnswer || ""),
        points: pointsForDifficulty(difficulty),
      });
      if (sampleSummaries.length < 2) {
        const blanks = Array.isArray(q.blanks) ? (q.blanks as Record<string, unknown>[]) : [];
        sampleSummaries.push(
          `[${c.id}/${usedModel}] dir="${String(q.direction).slice(0, 60)}..." | summary="${String(q.summaryWithBlanks).slice(0, 70)}" | ans=${blanks.map((b) => `${b.label}:${b.answer}`).join(" ")} | leak=${vr.leakFails.length} gateErr=${vr.gateErrors.length}`,
        );
      }
    }
  }

  // ── 모델 미가용 폴백: 합성 픽스처 3개로 검증 진행 ──
  if (!anyRealGen) {
    console.log("\n" + "!".repeat(80));
    console.log("! 실모델 생성 전부 실패 — 합성 픽스처 3개로 검증 진행 (status: gen_unavailable)");
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
      console.log("  ── 학생 직렬화 ──");
      console.log(vr.studentText.split("\n").map((l) => "    " + l).join("\n"));
      console.log(`  ⇒ ${ok ? "PASS" : "FAIL"}`);
      leakFailsTotal += vr.leakFails.length;
      if (vr.gateErrors.length) gateFails.push({ case: `SYN-${fx.caseId}`, codes: vr.gateErrors.map((e) => e.split(":")[0]) });
      if (ok) passed++;
      else failed++;
      samples.push({
        id: `sw-synthetic-${fx.caseId.toLowerCase()}`,
        difficulty: fx.difficulty,
        subType: SUBTYPE,
        structuredData: fx.q,
        questionText: vr.studentText,
        correctAnswer: String(fx.q.correctAnswer || ""),
        points: pointsForDifficulty(fx.difficulty),
      });
      if (sampleSummaries.length < 2) {
        const blanks = Array.isArray(fx.q.blanks) ? (fx.q.blanks as Record<string, unknown>[]) : [];
        sampleSummaries.push(
          `[SYN-${fx.caseId}] dir="${String(fx.q.direction).slice(0, 60)}..." | summary="${String(fx.q.summaryWithBlanks).slice(0, 70)}" | ans=${blanks.map((b) => `${b.label}:${b.answer}`).join(" ")} | leak=${vr.leakFails.length}`,
        );
      }
    }
  }

  // ── 샘플 저장 ──
  const samplesPath = "c:\\tmp\\sw-samples\\questions.json";
  mkdirSync("c:\\tmp\\sw-samples", { recursive: true });
  writeFileSync(samplesPath, JSON.stringify(samples, null, 2), "utf-8");

  // ── 최종 요약 ──
  console.log("\n" + "#".repeat(80));
  console.log("# 최종 요약");
  console.log("#".repeat(80));
  console.log(`model: ${usedModel}`);
  console.log(`generated: ${generated}  passed: ${passed}  failed: ${failed}  leakFails: ${leakFailsTotal}`);
  console.log(`gateFails: ${gateFails.length ? JSON.stringify(gateFails) : "none"}`);
  console.log(`samples saved: ${samplesPath} (${samples.length} items)`);

  // JSON 결과 블록 — 호출자가 파싱하기 쉽게 마지막에 한 번.
  const out = {
    ok: failed === 0 && leakFailsTotal === 0 && generated > 0,
    model: usedModel,
    generated,
    passed,
    failed,
    leakFails: leakFailsTotal,
    gateFails,
    samplesPath,
    notes: anyRealGen
      ? `실모델(${usedModel}) 생성물 검증. 정답계열(${SECRET_FIELDS_DESC}) 누수=${leakFailsTotal}.`
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
