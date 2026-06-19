/* eslint-disable no-console */
/**
 * SUMMARY_WRITING (요약문 영작) — 앞글자/단어수 단서 = "단어별 분리 빈칸 슬롯" 렌더 검증 v3.
 *   npx tsx scripts/verify-summary-writing-e2e3.ts
 *
 * 검증 대상(신규 계약, summaryWritingMaskedSummary):
 *   - clueMode=firstLetter → "(A) r____ o____ s____" (단어별 슬롯, 칸마다 정답 단어 앞글자, 소문자)
 *   - clueMode=wordCount   → "(A) ____ ____ ____"     (단어 수만큼 빈 슬롯, 앞글자 없음)
 *   - clueMode=none        → "(A) _____"              (통짜 빈칸 1개)
 *   - 별도 [앞글자] 줄은 절대 없어야 한다(앞글자는 쓰는 칸 안에 있어야 함).
 *
 * 게이트:
 *   - firstLetter: buildGeneratedQuestionText 의 [요약문] 라벨별 슬롯 "x____ y____ ..." 가 있고,
 *       슬롯 첫글자 시퀀스 == blanks[].answer 각 단어 첫글자(소문자), 슬롯 개수 == 정답 단어수.
 *   - wordCount:   [요약문] 라벨 뒤 "____ ____ ..." 빈 슬롯이 정답 단어수만큼, 슬롯에 첫글자 없음.
 *   - none:        [요약문] 라벨 뒤 통짜 "_____" 1개.
 *   - 전 케이스: [앞글자] 줄 없음, 정답계열 누수 0, 스키마 통과, 품질게이트 error 0.
 *   - 생성물 [요약문] 직렬화 라인을 콘솔에 그대로 출력(육안).
 *   - 통과분 c:\tmp\sw-samples3\questions.json 저장.
 *
 * 모델: PREMIUM(Claude) 고정. 실패 시 STANDARD(Gemini) 폴백 → 둘 다 실패면 합성 픽스처.
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
import { summaryWritingMaskedSummary } from "../src/lib/summary-writing";

const SUBTYPE = "SUMMARY_WRITING";
const RUNS_PER_CASE = 1;
const OUT_DIR = "c:\\tmp\\sw-samples3";

// ─── 지문 2개 ────────────────────────────────────────────────────────────────
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

// ─── 케이스 (요청한 4종) — 지문 1~2개씩 ────────────────────────────────────
interface CaseSpec {
  id: string;
  label: string;
  expectClue: "firstLetter" | "wordCount" | "none";
  rawSettings: Record<string, unknown>;
  passageIds: string[];
}

const CASES: CaseSpec[] = [
  {
    id: "firstLetter-single",
    label: "firstLetter 단일빈칸 (보기 없음, blank 1) — 칸마다 앞글자",
    expectClue: "firstLetter",
    passageIds: ["P-Sampling", "P-Diversity"],
    rawSettings: {
      difficulty: "INTERMEDIATE",
      clueMode: "firstLetter",
      wordBankEnabled: false,
      blankCount: 1,
    },
  },
  {
    id: "firstLetter-double",
    label: "firstLetter 2빈칸 KILLER (보기 없음, blank 2) — 칸마다 앞글자",
    expectClue: "firstLetter",
    passageIds: ["P-Diversity", "P-Sampling"],
    rawSettings: {
      difficulty: "KILLER",
      clueMode: "firstLetter",
      wordBankEnabled: false,
      blankCount: 2,
    },
  },
  {
    id: "wordCount",
    label: "wordCount 단일빈칸 — 단어 수만큼 빈 슬롯(앞글자 없음)",
    expectClue: "wordCount",
    passageIds: ["P-Sampling", "P-Diversity"],
    rawSettings: {
      difficulty: "INTERMEDIATE",
      clueMode: "wordCount",
      blankCount: 1,
    },
  },
  {
    id: "none-with-bank",
    label: "none + 보기(wordBank on) BASIC — 통짜 빈칸 1개",
    expectClue: "none",
    passageIds: ["P-Diversity", "P-Sampling"],
    rawSettings: {
      difficulty: "BASIC",
      clueMode: "none",
      wordBankEnabled: true,
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
function firstAlphaLower(word: string): string {
  const m = word.match(/[A-Za-z]/);
  return m ? m[0].toLowerCase() : "";
}
function answerWords(answer: string): string[] {
  return String(answer).split(/\s+/).filter(Boolean);
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

// ─── [요약문] 라인에서 라벨별 슬롯 토큰 추출 ─────────────────────────────────
// 라인 예: "[요약문] Some text (A) r____ o____ s____ and more, (B) ____ ____ ."
// 라벨 (X) 뒤부터 다음 라벨/문장끝까지의 토큰 중 "밑줄 슬롯(____ 포함)"만 모은다.
interface SlotInfo {
  slots: string[]; // 라벨 뒤 슬롯 토큰들(밑줄 포함 토큰). 예: ["r____","o____"] 또는 ["____","____"] 또는 ["_____"]
}
function extractSlotsByLabel(summaryLine: string): Record<string, SlotInfo> {
  const result: Record<string, SlotInfo> = {};
  // 라벨 위치 찾기
  const labelRe = /\(([A-Z])\)/g;
  const matches: { label: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = labelRe.exec(summaryLine)) !== null) {
    matches.push({ label: `(${m[1]})`, index: m.index });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].label.length;
    const end = i + 1 < matches.length ? matches[i + 1].index : summaryLine.length;
    const segment = summaryLine.slice(start, end);
    // 공백 분리 토큰 중 밑줄(_) 3개 이상 포함한 것만 슬롯으로 인정
    const slots = segment
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => /_{3,}/.test(t));
    result[matches[i].label] = { slots };
  }
  return result;
}

// ─── 검증 (한 생성물에 대해) ──────────────────────────────────────────────────
interface VerifyResult {
  schemaOk: boolean;
  gateErrors: string[];
  gateWarnings: string[];
  leakFails: string[];
  structureFails: string[];
  studentText: string;
  summaryLine: string;
  // 카운터
  firstLetterSlotOk: number;   // firstLetter 케이스에서 슬롯 검증 통과한 빈칸 수
  wordCountSlotOk: number;     // wordCount 케이스에서 슬롯 검증 통과한 빈칸 수
  noneSlotOk: number;          // none 케이스에서 통짜빈칸 통과한 빈칸 수
  separateLetterLineFound: number; // [앞글자] 줄 발견 수(0이어야)
}

const SECRET_FIELDS_DESC =
  "blanks[].answer / modelAnswer / acceptableVariants / wordBankDistractors / requiredLemmas";

function verifyOne(
  q: Record<string, unknown>,
  passage: string,
  difficulty: string,
  rawSettings: Record<string, unknown>,
  expectClue: "firstLetter" | "wordCount" | "none",
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
  const lines = studentText.split("\n");
  const summaryLine = lines.find((l) => l.trimStart().startsWith("[요약문]")) || "";

  // 3a) [빈칸 정답] 마커 금지(SW-LEAK-1).
  if (studentText.includes("[빈칸 정답]")) {
    leakFails.push("'[빈칸 정답]' 마커가 학생 직렬화에 노출됨 (SW-LEAK-1 위반)");
  }
  // 3a') [빈칸 해석] 금지.
  if (studentText.includes("[빈칸 해석]")) {
    leakFails.push("'[빈칸 해석]'(blankGlosses) 가 학생 직렬화에 노출됨");
  }

  // 3b) ★별도 [앞글자] 줄이 없어야 한다(신규 계약 핵심).
  let separateLetterLineFound = 0;
  for (const l of lines) {
    if (l.trimStart().startsWith("[앞글자]")) {
      separateLetterLineFound++;
      structureFails.push(`별도 [앞글자] 줄 발견(신규 계약 위반): "${l.trim()}"`);
    }
  }

  const blanks = Array.isArray(q.blanks) ? (q.blanks as Record<string, unknown>[]) : [];

  // 3c) 정답 어구(연속 2토큰+) 누수 — 설계상 노출 라인([보기]) 제외.
  //     ([앞글자] 줄은 존재해선 안 되므로 누수 스코프에서 제외하지 않는다.)
  const leakScope = lines
    .filter((line) => !line.trimStart().startsWith("[보기]"))
    .join("\n");
  const scopeSeq = ` ${contentTokens(leakScope).join(" ")} `;
  const checkPhraseLeak = (raw: unknown, fieldName: string) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    const toks = contentTokens(raw);
    if (toks.length < 2) return;
    const phrase = ` ${toks.join(" ")} `;
    if (scopeSeq.includes(phrase)) {
      leakFails.push(`${fieldName} 어구가 학생 영역(보기 제외)에 통째로 노출: "${toks.join(" ")}"`);
    }
  };
  for (const b of blanks) checkPhraseLeak(b.answer, "blanks[].answer");
  checkPhraseLeak(q.modelAnswer, "modelAnswer");
  if (studentText.includes("[미끼]") || /\bdistractor\b/i.test(studentText)) {
    leakFails.push("미끼 정체 표식(wordBankDistractors)이 학생 텍스트에 노출됨");
  }
  if (studentText.includes("[채점") || studentText.includes("[모범")) {
    leakFails.push("교사용 채점/모범답안 마커가 학생 텍스트에 노출됨");
  }

  // 4) summaryWithBlanks 구조: 각 라벨 1회 + 정답 어구 통째 미포함.
  const summary = typeof q.summaryWithBlanks === "string" ? q.summaryWithBlanks : "";
  const labels = blanks
    .map((b) => String(b.label || "").toUpperCase())
    .filter((l) => /^\([A-Z]\)$/.test(l));
  const uniqLabels = [...new Set(labels)];
  for (const l of uniqLabels) {
    const count = summary.split(l).length - 1;
    if (count !== 1) structureFails.push(`summaryWithBlanks 에 ${l} 가 ${count}회 (정확히 1회여야)`);
  }

  // 5) ★슬롯 렌더 검증 — [요약문] 라인을 단서 모드에 맞게.
  let firstLetterSlotOk = 0;
  let wordCountSlotOk = 0;
  let noneSlotOk = 0;
  const slotMap = extractSlotsByLabel(summaryLine);

  for (const b of blanks) {
    const label = String(b.label || "").toUpperCase();
    if (!/^\([A-Z]\)$/.test(label)) continue;
    const answer = String(b.answer || "");
    const words = answerWords(answer);
    const expectedFirsts = words.map(firstAlphaLower);
    const info = slotMap[label];
    if (!info) {
      structureFails.push(`${label}: [요약문] 라인에서 라벨 슬롯 영역을 찾지 못함`);
      continue;
    }
    const slots = info.slots;

    if (expectClue === "firstLetter") {
      // 슬롯 개수 == 정답 단어수
      if (slots.length !== words.length) {
        structureFails.push(
          `${label} firstLetter 슬롯 개수(${slots.length}) != 정답 단어수(${words.length}) — 슬롯=[${slots.join(" ")}] ans="${answer}"`,
        );
        continue;
      }
      // 각 슬롯 = "<첫글자>____" 형태, 첫글자 == 정답 단어 첫글자(소문자)
      let allGood = true;
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        // 글루 진단: 슬롯이 "x____" 뒤에 알파벳이 붙으면(=다음 단어 글루) 별도로 명시.
        if (/_{3,}[A-Za-z]/.test(slot)) {
          structureFails.push(`${label} firstLetter 슬롯 글루(다음 단어 붙음)(idx ${i}): "${slot}" — 마지막 밑줄 뒤 공백 누락`);
          allGood = false;
          break;
        }
        const sm = slot.match(/^([A-Za-z]?)(_{3,})$/);
        if (!sm) {
          structureFails.push(`${label} firstLetter 슬롯 형식 불량(idx ${i}): "${slot}"`);
          allGood = false;
          break;
        }
        const slotFirst = sm[1].toLowerCase();
        if (slotFirst !== expectedFirsts[i]) {
          structureFails.push(
            `${label} firstLetter 슬롯 앞글자 불일치(idx ${i}): 슬롯="${slotFirst}" != 정답단어 "${words[i]}"의 첫글자 "${expectedFirsts[i]}"`,
          );
          allGood = false;
          break;
        }
      }
      if (allGood) firstLetterSlotOk++;
    } else if (expectClue === "wordCount") {
      // 슬롯 개수 == 정답 단어수, 각 슬롯 = 순수 밑줄(앞글자 없음)
      if (slots.length !== words.length) {
        structureFails.push(
          `${label} wordCount 슬롯 개수(${slots.length}) != 정답 단어수(${words.length}) — 슬롯=[${slots.join(" ")}] ans="${answer}"`,
        );
        continue;
      }
      let allGood = true;
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        // 글루 진단: 마지막 슬롯에 다음 단어가 붙는 경우.
        if (/_{3,}[A-Za-z]/.test(slot)) {
          structureFails.push(`${label} wordCount 슬롯 글루(다음 단어 붙음)(idx ${i}): "${slot}" — 마지막 밑줄 뒤 공백 누락`);
          allGood = false;
          break;
        }
        if (!/^_{3,}$/.test(slot)) {
          structureFails.push(`${label} wordCount 슬롯에 앞글자/문자 포함(idx ${i}): "${slot}" (순수 밑줄이어야)`);
          allGood = false;
          break;
        }
      }
      if (allGood) wordCountSlotOk++;
    } else {
      // none: 통짜 빈칸 1개(밑줄 토큰 하나). 뒤에 문장부호 1개는 허용(예: "_____," 는 정상).
      if (slots.length !== 1) {
        structureFails.push(`${label} none 슬롯 개수(${slots.length}) != 1 (통짜 빈칸 1개여야) — 슬롯=[${slots.join(" ")}]`);
        continue;
      }
      const noneSlot = slots[0];
      // 글루(알파벳/숫자 붙음)는 결함, 문장부호 꼬리표(,.;:!? 등)는 정상.
      if (/_{3,}[A-Za-z0-9]/.test(noneSlot)) {
        structureFails.push(`${label} none 슬롯 글루(다음 단어 붙음): "${noneSlot}" — 밑줄 뒤 공백 누락`);
        continue;
      }
      if (!/^_{3,}[^\w]*$/.test(noneSlot)) {
        structureFails.push(`${label} none 슬롯 형식 불량: "${noneSlot}" (밑줄 + 선택적 문장부호여야)`);
        continue;
      }
      noneSlotOk++;
    }
  }

  // 6) (직접 헬퍼 호출) summaryWritingMaskedSummary 일관성 — 직렬화와 동일한 슬롯 생성하는지 교차확인.
  const maskedDirect = summaryWritingMaskedSummary(q);
  if (maskedDirect && summaryLine && !summaryLine.includes(maskedDirect)) {
    gateWarnings.push("summaryWritingMaskedSummary 직접결과가 [요약문] 라인에 그대로 포함되지 않음(직렬화 경로 차이 확인 필요)");
  }

  return {
    schemaOk,
    gateErrors,
    gateWarnings,
    leakFails,
    structureFails,
    studentText,
    summaryLine,
    firstLetterSlotOk,
    wordCountSlotOk,
    noneSlotOk,
    separateLetterLineFound,
  };
}

// ─── 합성 픽스처 (모델 미가용 시 폴백) ──────────────────────────────────────
function syntheticFixtures() {
  return [
    {
      caseId: "firstLetter-single",
      expectClue: "firstLetter" as const,
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
            answer: "random observed selection",
            acceptableVariants: ["a systematic bias"],
            requiredLemmas: ["systematic", "bias"],
            targetWordCount: 3,
          },
        ],
        koreanGloss: "스스로 선택된 표본은 자료를 아무리 늘려도 고칠 수 없는 문제를 낳는다.",
        blankGlosses: [],
        wordBankPolicy: "freeCount",
        wordBankFidelity: "verbatim",
        targetWordsMode: "hidden",
        clueMode: "firstLetter",
        modelAnswer: "A self-selected sample introduces random observed selection that more data cannot fix.",
        correctAnswer: "(A) random observed selection",
        scoringCriteria: ["핵심어 포함 시 점수"],
        scoringMode: "LLM_RUBRIC",
        explanation: "자기선택 표본은 체계적 편향을 낳는다.",
        keyPoints: ["앞글자 단서", "보기 없이 영작"],
        tags: ["요약문영작"],
      } as Record<string, unknown>,
    },
    {
      caseId: "firstLetter-double",
      expectClue: "firstLetter" as const,
      difficulty: "KILLER",
      passageId: "P-Diversity",
      rawSettings: { difficulty: "KILLER", clueMode: "firstLetter", wordBankEnabled: false, blankCount: 2 } as Record<string, unknown>,
      q: {
        difficulty: "KILLER",
        direction: buildSummaryWritingDirection(resolveSummaryWritingSettings({ difficulty: "KILLER", clueMode: "firstLetter", wordBankEnabled: false, blankCount: 2 }, "KILLER")),
        summaryWithBlanks: "(A) , which can lead to greater bias, because evaluators (B) .",
        blanks: [
          {
            label: "(A)",
            answer: "pursuing superficial diversity",
            acceptableVariants: ["chasing surface diversity"],
            requiredLemmas: ["pursue", "diversity"],
            targetWordCount: 3,
          },
          {
            label: "(B)",
            answer: "reward visible markers",
            acceptableVariants: ["reward visible differences"],
            requiredLemmas: ["reward", "visible"],
            targetWordCount: 3,
          },
        ],
        koreanGloss: "겉으로 드러나는 차이에만 치우쳐 평가하면 오히려 편향이 커질 수 있다.",
        blankGlosses: [],
        wordBankPolicy: "freeCount",
        wordBankFidelity: "verbatim",
        blankAssignment: "separate",
        targetWordsMode: "hidden",
        clueMode: "firstLetter",
        modelAnswer: "Pursuing superficial diversity, which can lead to greater bias, because evaluators reward visible markers.",
        correctAnswer: "(A) pursuing superficial diversity, (B) reward visible markers",
        scoringCriteria: ["(A) 핵심어", "(B) 핵심어"],
        scoringMode: "LLM_RUBRIC",
        explanation: "표면적 다양성 추구가 편향을 키운다.",
        keyPoints: ["두 빈칸", "앞글자 단서"],
        tags: ["요약문영작"],
      } as Record<string, unknown>,
    },
    {
      caseId: "wordCount",
      expectClue: "wordCount" as const,
      difficulty: "INTERMEDIATE",
      passageId: "P-Sampling",
      rawSettings: { difficulty: "INTERMEDIATE", clueMode: "wordCount", blankCount: 1 } as Record<string, unknown>,
      q: {
        difficulty: "INTERMEDIATE",
        direction: buildSummaryWritingDirection(resolveSummaryWritingSettings({ difficulty: "INTERMEDIATE", clueMode: "wordCount", blankCount: 1 }, "INTERMEDIATE")),
        summaryWithBlanks: "Gathering more data cannot fix (A) introduced by a self-selected sample.",
        blanks: [
          {
            label: "(A)",
            answer: "the underlying systematic bias",
            acceptableVariants: ["systematic sampling bias"],
            requiredLemmas: ["systematic", "bias"],
            targetWordCount: 4,
          },
        ],
        koreanGloss: "자료를 더 모아도 자기선택 표본이 만든 문제는 고쳐지지 않는다.",
        blankGlosses: [],
        wordBankPolicy: "freeCount",
        wordBankFidelity: "verbatim",
        targetWordsMode: "exact",
        clueMode: "wordCount",
        modelAnswer: "Gathering more data cannot fix the underlying systematic bias introduced by a self-selected sample.",
        correctAnswer: "(A) the underlying systematic bias",
        scoringCriteria: ["핵심어"],
        scoringMode: "LLM_RUBRIC",
        explanation: "데이터 양으로는 체계적 편향이 교정되지 않는다.",
        keyPoints: ["단어 수 단서"],
        tags: ["요약문영작"],
      } as Record<string, unknown>,
    },
    {
      caseId: "none-with-bank",
      expectClue: "none" as const,
      difficulty: "BASIC",
      passageId: "P-Diversity",
      rawSettings: { difficulty: "BASIC", clueMode: "none", wordBankEnabled: true, blankCount: 1 } as Record<string, unknown>,
      q: {
        difficulty: "BASIC",
        direction: buildSummaryWritingDirection(resolveSummaryWritingSettings({ difficulty: "BASIC", clueMode: "none", wordBankEnabled: true, blankCount: 1 }, "BASIC")),
        summaryWithBlanks: "(A) can backfire and lead to greater bias in evaluation.",
        blanks: [
          {
            label: "(A)",
            answer: "Pursuing superficial diversity",
            acceptableVariants: ["Chasing surface diversity"],
            requiredLemmas: ["pursue", "diversity"],
            targetWordCount: 3,
          },
        ],
        koreanGloss: "겉으로 드러나는 다양성만 좇으면 평가에서 오히려 편향이 커질 수 있다.",
        blankGlosses: [],
        wordBank: ["pursuing", "superficial", "diversity", "celebrating", "deep"],
        wordBankDistractors: ["celebrating", "deep"],
        wordBankPolicy: "usePartial",
        wordBankFidelity: "verbatim",
        targetWordsMode: "hidden",
        clueMode: "none",
        modelAnswer: "Pursuing superficial diversity can backfire and lead to greater bias in evaluation.",
        correctAnswer: "(A) Pursuing superficial diversity",
        scoringCriteria: ["핵심어"],
        scoringMode: "LLM_RUBRIC",
        explanation: "표면적 다양성 추구가 편향을 키운다.",
        keyPoints: ["보기 제공", "통짜 빈칸"],
        tags: ["요약문영작"],
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
        console.log(`  generated via ${plan}`);
        return { q, plan: tag };
      }
      lastErr = `${plan}: empty questions[]`;
      console.warn(`  ${plan} returned empty`);
    } catch (err) {
      lastErr = `${plan}: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`  ${plan} failed: ${lastErr}`);
    }
  }
  return { q: null, plan: "gen_unavailable", error: lastErr };
}

// ─── 풀 내용 출력 ────────────────────────────────────────────────────────────
function dumpContent(q: Record<string, unknown>) {
  const blanks = Array.isArray(q.blanks) ? (q.blanks as Record<string, unknown>[]) : [];
  console.log("  -- direction --");
  console.log("    " + String(q.direction || "(없음)"));
  console.log("  -- clueMode --");
  console.log("    " + String(q.clueMode || "(없음)"));
  console.log("  -- summaryWithBlanks (raw) --");
  console.log("    " + String(q.summaryWithBlanks || "(없음)"));
  console.log("  -- wordBank --");
  console.log("    " + (Array.isArray(q.wordBank) ? (q.wordBank as unknown[]).join(" / ") : "(없음 — wordBank off)"));
  console.log("  -- blanks[].answer (비밀) --");
  for (const b of blanks) {
    console.log(`    ${b.label}: ${b.answer}`);
  }
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
interface SampleOut {
  id: string;
  difficulty: string;
  subType: string;
  clueMode: string;
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
  console.log("# SUMMARY_WRITING — 단어별 분리 빈칸 슬롯 렌더 검증 v3 (OUT=" + OUT_DIR + ")");
  console.log("#".repeat(80));

  let generated = 0;
  let passed = 0;
  let failed = 0;
  let leakFailsTotal = 0;
  let firstLetterSlotOkTotal = 0;
  let wordCountSlotOkTotal = 0;
  let noneSlotOkTotal = 0;
  let separateLetterLineFoundTotal = 0;
  const gateFails: { case: string; codes: string[] }[] = [];
  const samples: SampleOut[] = [];
  let usedModel: GenStatus | "synthetic" = "gen_unavailable";
  let anyRealGen = false;
  const sampleSummaryLines: string[] = [];

  const passageById = (id: string) => PASSAGES.find((p) => p.id === id)!;

  const runVerify = (
    q: Record<string, unknown>,
    passage: string,
    difficulty: string,
    rawSettings: Record<string, unknown>,
    expectClue: "firstLetter" | "wordCount" | "none",
    tag: string,
    modelTag: string,
  ) => {
    generated++;
    dumpContent(q);
    const vr = verifyOne(q, passage, difficulty, rawSettings, expectClue);
    const ok =
      vr.schemaOk &&
      vr.gateErrors.length === 0 &&
      vr.leakFails.length === 0 &&
      vr.structureFails.length === 0 &&
      vr.separateLetterLineFound === 0;

    console.log("  -- 검증 --");
    console.log(`    schema: ${vr.schemaOk ? "PASS" : "FAIL"}`);
    console.log(`    gate errors: ${vr.gateErrors.length}` + (vr.gateErrors.length ? "\n      - " + vr.gateErrors.join("\n      - ") : ""));
    if (vr.gateWarnings.length) console.log(`    gate warnings: ${vr.gateWarnings.length}\n      - ` + vr.gateWarnings.join("\n      - "));
    console.log(`    leak fails: ${vr.leakFails.length}` + (vr.leakFails.length ? "\n      - " + vr.leakFails.join("\n      - ") : ""));
    console.log(`    structure fails: ${vr.structureFails.length}` + (vr.structureFails.length ? "\n      - " + vr.structureFails.join("\n      - ") : ""));
    console.log(`    [슬롯] firstLetterOk=${vr.firstLetterSlotOk} wordCountOk=${vr.wordCountSlotOk} noneOk=${vr.noneSlotOk} separateLetterLine=${vr.separateLetterLineFound}`);
    console.log("  -- [요약문] 직렬화 라인(육안) --");
    console.log("    >> " + (vr.summaryLine || "(없음!)"));
    console.log("  -- 학생 직렬화 전체(buildGeneratedQuestionText) --");
    console.log(vr.studentText.split("\n").map((l) => "    " + l).join("\n"));
    console.log(`  => ${ok ? "PASS" : "FAIL"}`);

    leakFailsTotal += vr.leakFails.length;
    firstLetterSlotOkTotal += vr.firstLetterSlotOk;
    wordCountSlotOkTotal += vr.wordCountSlotOk;
    noneSlotOkTotal += vr.noneSlotOk;
    separateLetterLineFoundTotal += vr.separateLetterLineFound;
    if (vr.gateErrors.length) gateFails.push({ case: tag, codes: vr.gateErrors.map((e) => e.split(":")[0]) });

    if (vr.summaryLine && sampleSummaryLines.length < 8) {
      sampleSummaryLines.push(`[${tag}/${modelTag}] ${vr.summaryLine.trim()}`);
    }

    if (ok) {
      passed++;
      samples.push({
        id: `sw-${tag.toLowerCase()}-${modelTag}`,
        difficulty,
        subType: SUBTYPE,
        clueMode: String(q.clueMode || expectClue),
        structuredData: q,
        questionText: vr.studentText,
        correctAnswer: String(q.correctAnswer || q.modelAnswer || ""),
        points: pointsForDifficulty(difficulty),
      });
    } else {
      failed++;
    }
    return vr;
  };

  for (const c of CASES) {
    const difficulty = String(c.rawSettings.difficulty || "INTERMEDIATE");
    const resolved = resolveSummaryWritingSettings(c.rawSettings, difficulty);
    const expectedDirection = buildSummaryWritingDirection(resolved);

    console.log("\n" + "=".repeat(80));
    console.log(`CASE ${c.id} — ${c.label}`);
    console.log(`  resolved: clue=${resolved.clueMode} wordBank=${resolved.wordBankEnabled} blankCount=${resolved.blankCount} targetWords=${resolved.targetWordsMode}`);
    console.log(`  expected direction: ${expectedDirection}`);
    console.log("=".repeat(80));

    for (const passageId of c.passageIds) {
      const passage = passageById(passageId);
      const prompt = buildPrompt(passage.content, c.rawSettings, difficulty);
      for (let run = 1; run <= RUNS_PER_CASE; run++) {
        console.log(`\n[${c.id} | ${passage.id} (${passage.topic}) | run ${run}/${RUNS_PER_CASE}]`);
        const gen = await tryGenerate(prompt, c.rawSettings, `SW3-${c.id}-${passage.id}-r${run}`);
        if (!gen.q) {
          console.warn(`  GENERATION UNAVAILABLE: ${gen.error}`);
          continue;
        }
        anyRealGen = true;
        usedModel = gen.plan;
        runVerify(gen.q, passage.content, difficulty, c.rawSettings, c.expectClue, `${c.id}-${passage.id}-r${run}`, gen.plan);
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
      console.log(`SYNTHETIC ${fx.caseId} (expectClue=${fx.expectClue})`);
      console.log("=".repeat(80));
      runVerify(fx.q, passage.content, fx.difficulty, fx.rawSettings, fx.expectClue, `SYN-${fx.caseId}`, "synthetic");
    }
  }

  // ── 샘플 저장 (통과분만) ──
  const samplesPath = `${OUT_DIR}\\questions.json`;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(samplesPath, JSON.stringify(samples, null, 2), "utf-8");

  console.log("\n" + "#".repeat(80));
  console.log("# 최종 요약");
  console.log("#".repeat(80));
  console.log(`model: ${usedModel}`);
  console.log(`generated: ${generated}  passed: ${passed}  failed: ${failed}`);
  console.log(`leakFails: ${leakFailsTotal}  gateFails: ${gateFails.length}  separateLetterLine: ${separateLetterLineFoundTotal}`);
  console.log(`[슬롯] firstLetterSlotOk=${firstLetterSlotOkTotal} wordCountSlotOk=${wordCountSlotOkTotal} noneSlotOk=${noneSlotOkTotal}`);
  console.log(`samples saved: ${samplesPath} (${samples.length} 통과항목)`);
  console.log("\n-- 샘플 [요약문] 라인 --");
  for (const s of sampleSummaryLines) console.log("  " + s);

  const out = {
    ok:
      failed === 0 &&
      leakFailsTotal === 0 &&
      separateLetterLineFoundTotal === 0 &&
      generated > 0,
    model: usedModel,
    generated,
    passed,
    firstLetterSlotOk: firstLetterSlotOkTotal,
    wordCountSlotOk: wordCountSlotOkTotal,
    noneSlotOk: noneSlotOkTotal,
    separateLetterLineFound: separateLetterLineFoundTotal,
    leakFails: leakFailsTotal,
    gateFails: gateFails.length,
    samplesPath,
    notes: anyRealGen
      ? `실모델(${usedModel}) 재생성 검증. 비밀필드(${SECRET_FIELDS_DESC}) 누수=${leakFailsTotal}, 별도[앞글자]줄=${separateLetterLineFoundTotal}, 슬롯 firstLetter/wordCount/none OK=${firstLetterSlotOkTotal}/${wordCountSlotOkTotal}/${noneSlotOkTotal}.`
      : "실모델 생성 전부 실패 — 합성 픽스처로 검증(gen_unavailable).",
    sampleSummaryLines,
  };
  console.log("\n===RESULT_JSON_START===");
  console.log(JSON.stringify(out, null, 2));
  console.log("===RESULT_JSON_END===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
