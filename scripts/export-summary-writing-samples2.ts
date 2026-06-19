/**
 * SUMMARY_WRITING (요약문 영작) export 검증 하니스.
 *   npx tsx scripts/export-summary-writing-samples.ts
 *
 * 입력: c:/tmp/sw-samples/questions.json (없으면 합성 3개 사용)
 * 처리: 각 질문을 ExamQuestionData[] + BuilderSettings(v2) 로 감싸 — export-docx/route.ts /
 *       export-hwpx/route.ts 의 resolveBuilderItems + applyBuilderSettings 흐름을 그대로 미러 —
 *       buildBuilderExamDocument / buildBuilderHwpxDocument 를 호출한다.
 * 산출:
 *   c:/tmp/sw-samples/docx/sw-<case>-student.docx / -answer.docx
 *   c:/tmp/sw-samples/hwpx/sw-<case>-student.hwpx / -answer.hwpx
 *   + 한 페이지에 다문항을 배치한 sw-ALL-student/answer (컬럼/줄간격 회귀 확인용)
 *   + (선택) SUMMARY_COMPLETE 비교기준선 sc-baseline-*
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Packer } from "docx";

import {
  buildBuilderExamDocument,
  type BuilderItem,
  type BuilderSettings,
} from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";
import { buildBuilderHwpxDocument } from "@/app/api/exams/[examId]/export-hwpx/_lib/builder";
import { packageHwpx } from "@/app/api/exams/[examId]/export-hwpx/_lib/package";
import type { BuilderItemResolved } from "@/app/api/exams/[examId]/export-hwpx/_lib/render/question";
import { shouldForceSourcePassage } from "@/components/exams/paper-builder/passage-policy";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";

// ---------------------------------------------------------------------------
// 출력 디렉토리
// ---------------------------------------------------------------------------
const ROOT = "c:/tmp/sw-samples2";
const DOCX_DIR = path.join(ROOT, "docx");
const HWPX_DIR = path.join(ROOT, "hwpx");
for (const d of [DOCX_DIR, HWPX_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

const docxFiles: string[] = [];
const hwpxFiles: string[] = [];

// ---------------------------------------------------------------------------
// 입력 로드 (없으면 합성)
// ---------------------------------------------------------------------------
type RawQuestion = {
  id: string;
  difficulty: string;
  subType: string;
  structuredData: Record<string, unknown>;
  questionText: string;
  correctAnswer: string;
  points?: number;
};

function loadQuestions(): RawQuestion[] {
  const file = path.join(ROOT, "questions.json");
  if (existsSync(file)) {
    try {
      const arr = JSON.parse(readFileSync(file, "utf8"));
      if (Array.isArray(arr) && arr.length) {
        console.log(`[load] questions.json: ${arr.length}개`);
        return arr as RawQuestion[];
      }
    } catch (e) {
      console.warn(`[load] questions.json 파싱 실패 — 합성 사용: ${(e as Error).message}`);
    }
  }
  console.log("[load] questions.json 없음/비어있음 → 합성 3개 사용");
  return synthQuestions();
}

// 합성 폴백: BASIC / INTERMEDIATE / KILLER(firstLetter 포함)
function synthQuestions(): RawQuestion[] {
  return [
    {
      id: "synth-basic",
      difficulty: "BASIC",
      subType: "SUMMARY_WRITING",
      correctAnswer: "(A) Helping others",
      points: 2,
      questionText:
        "다음 글의 요약문 빈칸 (A)에 들어갈 말을 [해석]을 참고하여 [보기]의 단어를 변형 없이 한 번씩 모두 사용하여 약 2단어로 영작하시오. [2점]\n\n[해석] 남을 도우면 결국 자신도 더 행복해진다.\n\n[요약문] (A) _____ (약 2단어) makes us happier in the end.\n\n[보기] helping / others",
      structuredData: {
        summaryWithBlanks: "(A) makes us happier in the end.",
        koreanGloss: "남을 도우면 결국 자신도 더 행복해진다.",
        wordBank: ["helping", "others"],
        wordBankPolicy: "useAll",
        wordBankFidelity: "verbatim",
        blankAssignment: "separate",
        clueMode: "none",
        targetWordsMode: "approx",
        modelAnswer: "Helping others makes us happier in the end.",
        blanks: [
          { label: "(A)", answer: "Helping others", targetWordCount: 2, requiredLemmas: ["help", "other"] },
        ],
      },
    },
    {
      id: "synth-inter",
      difficulty: "INTERMEDIATE",
      subType: "SUMMARY_WRITING",
      correctAnswer: "(A) Pursuing superficial diversity, (B) reward only visible differences",
      points: 3,
      questionText:
        "다음 글의 요약문 빈칸 (A), (B)에 들어갈 말을 [해석]을 참고하여 [보기]에서 필요한 단어만 골라 영작하시오. [3점]\n\n[해석] 표면적 다양성만 추구하면 평가자가 보이는 차이에만 보상해 오히려 편향이 커진다.\n\n[요약문] (A) _____ (약 3단어) , which can lead to greater bias, because evaluators (B) _____ (약 4단어) .\n\n[보기] pursuing / superficial / diversity / reward / only / visible / differences / real / actual",
      structuredData: {
        summaryWithBlanks:
          "(A) , which can lead to greater bias, because evaluators (B) .",
        koreanGloss: "표면적 다양성만 추구하면 평가자가 보이는 차이에만 보상해 오히려 편향이 커진다.",
        wordBank: ["pursuing", "superficial", "diversity", "reward", "only", "visible", "differences", "real", "actual"],
        wordBankDistractors: ["real", "actual"],
        wordBankPolicy: "usePartial",
        wordBankFidelity: "verbatim",
        blankAssignment: "separate",
        clueMode: "none",
        targetWordsMode: "approx",
        modelAnswer:
          "Pursuing superficial diversity, which can lead to greater bias, because evaluators reward only visible differences.",
        acceptableVariants: [],
        blanks: [
          { label: "(A)", answer: "Pursuing superficial diversity", targetWordCount: 3 },
          { label: "(B)", answer: "reward only visible differences", targetWordCount: 4 },
        ],
      },
    },
    {
      id: "synth-killer-firstletter",
      difficulty: "KILLER",
      subType: "SUMMARY_WRITING",
      correctAnswer: "(A) existing bias cannot be corrected by more data",
      points: 4,
      questionText:
        "다음 글의 요약문 빈칸 (A)에 들어갈 말을 영작하시오. [4점]\n\n[요약문] When a sample lacks true representativeness, (A) _____ , no matter how large the dataset grows.\n\n[앞글자] (A) e b c b c b m d",
      structuredData: {
        summaryWithBlanks:
          "When a sample lacks true representativeness, (A), no matter how large the dataset grows.",
        wordBankPolicy: "freeCount",
        blankAssignment: "separate",
        clueMode: "firstLetter",
        targetWordsMode: "hidden",
        modelAnswer:
          "When a sample lacks true representativeness, existing bias cannot be corrected by more data, no matter how large the dataset grows.",
        blanks: [
          {
            label: "(A)",
            answer: "existing bias cannot be corrected by more data",
            firstLetterHint: "e b c b c b m d",
            requiredLemmas: ["bias", "correct", "data"],
          },
        ],
      },
    },
  ];
}

// 비교 기준선 SUMMARY_COMPLETE (서술형) — 레이아웃 회귀 비교용(선택)
function summaryCompleteBaseline(): RawQuestion {
  return {
    id: "sc-baseline",
    difficulty: "INTERMEDIATE",
    subType: "SUMMARY_COMPLETE",
    correctAnswer: "(A) reducing, (B) bias",
    points: 3,
    questionText:
      "다음 글의 요약문을 완성하시오. [3점]\n\n[요약문] Collecting more data without (A) reducing sampling error only magnifies (B) bias in the results.",
    structuredData: {},
  };
}

// ---------------------------------------------------------------------------
// RawQuestion → ExamQuestionData
// ---------------------------------------------------------------------------
function toExamQuestionData(q: RawQuestion, orderNum: number): ExamQuestionData {
  return {
    orderNum,
    points: q.points ?? defaultPoints(q.difficulty),
    question: {
      id: q.id,
      type: "SHORT_ANSWER",
      subType: q.subType,
      questionText: q.questionText,
      structuredData: q.structuredData,
      options: null,
      correctAnswer: q.correctAnswer ?? "",
      difficulty: q.difficulty,
      passage: null,
      explanation: null,
    },
  };
}

function defaultPoints(difficulty: string): number {
  if (difficulty === "BASIC") return 2;
  if (difficulty === "KILLER") return 4;
  return 3;
}

// ---------------------------------------------------------------------------
// BuilderSettings(v2) 구성 — route.ts 의 parseSettings 가 받는 형태 그대로.
//   items[].questionId / questionText / includePassage / points / answerSpaceLines.
// 서술형(SUMMARY_WRITING)은 답란을 위해 answerSpaceLines 를 줘서 영작 답란이 그려지게 한다.
// ---------------------------------------------------------------------------
function buildSettings(questions: ExamQuestionData[], opts: { columns: 1 | 2; title: string }): BuilderSettings {
  const items: BuilderItem[] = questions.map((eq, i) => ({
    localId: `local-${i}`,
    blockType: "question",
    questionId: eq.question.id,
    orderNum: i + 1,
    points: eq.points,
    includePassage: false,
    // route.ts 는 item.questionText 가 있으면 그것을, 없으면 sourceQuestion.questionText 를 쓴다.
    // 우리는 이미 직렬화된 questionText 를 그대로 전달(SW-LEAK-1 학생안전 직렬화 미러).
    questionText: eq.question.questionText,
    answerSpaceLines: eq.question.subType === "SUMMARY_WRITING" ? 3 : 0,
  }));

  return {
    source: "exam-paper-builder-v2",
    version: 2,
    template: "default",
    layout: {
      paperSize: "A4",
      columns: opts.columns,
      density: "comfortable",
      showAnswerSpace: true,
      showPassageTitle: false,
      showQuestionMeta: true, // [N점 · 요약문 영작] 메타 표시
      passageStyle: "plain",
      pageNumberStyle: "center",
    },
    header: {
      subtitle: "SMOAT 영어",
      schoolName: "샘플고등학교",
      className: "3학년 1반",
      studentNameLabel: "이름",
      instructions: "요약문 영작 export 검증용 샘플 시험지입니다.",
      academyLogoDataUrl: null,
    },
    items,
  };
}

// ---------------------------------------------------------------------------
// route.ts resolveBuilderItems / applyBuilderSettings 미러
// ---------------------------------------------------------------------------
function shouldForceBuilderSourcePassage(
  original: ExamQuestionData,
  item: Pick<BuilderItem, "questionText" | "passageContent">,
): boolean {
  const passageContent = item.passageContent || original.question.passage?.content || "";
  return shouldForceSourcePassage({
    subType: original.question.subType,
    questionText: item.questionText || original.question.questionText,
    structuredData: (original.question as { structuredData?: unknown }).structuredData,
    passage: { content: passageContent },
  });
}

function resolveBuilderItems(
  questions: ExamQuestionData[],
  items: BuilderItem[],
): BuilderItemResolved[] {
  const byQuestionId = new Map(questions.map((it) => [it.question.id, it]));
  return items
    .map((item, index) => {
      const original = byQuestionId.get(item.questionId);
      if (!original) return null;
      const forceSourcePassage = shouldForceBuilderSourcePassage(original, item);
      const questionText = repairGrammarCorrectionQuestionText({
        subType: original.question.subType,
        questionText: item.questionText || original.question.questionText,
        structuredData: (original.question as { structuredData?: unknown }).structuredData,
      });
      return {
        ...item,
        questionText,
        includePassage: item.includePassage !== false || forceSourcePassage,
        orderNum: item.orderNum ?? index + 1,
        points: item.points ?? original.points,
        sourceQuestion: original.question,
      } as BuilderItemResolved;
    })
    .filter((it): it is BuilderItemResolved => Boolean(it));
}

function applyBuilderSettings(
  questions: ExamQuestionData[],
  settings: BuilderSettings,
): ExamQuestionData[] {
  if (!settings?.items?.length) return questions;
  const byQuestionId = new Map(questions.map((it) => [it.question.id, it]));
  return settings.items
    .map((item, index) => {
      const original = byQuestionId.get(item.questionId);
      if (!original) return null;
      const includePassage =
        item.includePassage !== false || shouldForceBuilderSourcePassage(original, item);
      const passage = !includePassage
        ? null
        : {
            title: item.passageTitle || original.question.passage?.title || "",
            content: item.passageContent || original.question.passage?.content || "",
          };
      return {
        ...original,
        orderNum: index + 1,
        points: item.points || original.points,
        question: {
          ...original.question,
          questionText: repairGrammarCorrectionQuestionText({
            subType: original.question.subType,
            questionText: item.questionText || original.question.questionText,
            structuredData: (original.question as { structuredData?: unknown }).structuredData,
          }),
          options: item.options ? JSON.stringify(item.options) : original.question.options,
          correctAnswer: item.correctAnswer ?? original.question.correctAnswer,
          passage,
        },
      } satisfies ExamQuestionData;
    })
    .filter((it): it is ExamQuestionData => Boolean(it));
}

// ---------------------------------------------------------------------------
// 한 시험지(=questions 묶음) → DOCX/HWPX student & answer
// ---------------------------------------------------------------------------
async function exportExam(opts: {
  caseName: string;
  title: string;
  questions: ExamQuestionData[];
  columns: 1 | 2;
}) {
  const { caseName, title, questions, columns } = opts;
  const settings = buildSettings(questions, { columns, title });

  for (const includeAnswers of [false, true]) {
    const sheet = includeAnswers ? "answer" : "student";

    // ---- DOCX ----
    try {
      const resolved = resolveBuilderItems(questions, settings.items);
      const full = applyBuilderSettings(questions, settings);
      const doc = buildBuilderExamDocument({
        title,
        settings,
        resolvedItems: resolved,
        includeAnswers,
        fullExamQuestions: full,
      });
      const buf = await Packer.toBuffer(doc);
      const out = path.join(DOCX_DIR, `sw-${caseName}-${sheet}.docx`);
      writeFileSync(out, Buffer.from(buf));
      docxFiles.push(out);
      console.log(`  [docx] ${path.basename(out)} (${buf.byteLength}B)`);
    } catch (e) {
      console.error(`  [docx FAIL] ${caseName}-${sheet}: ${(e as Error).stack || (e as Error).message}`);
    }

    // ---- HWPX ----
    try {
      const resolvedH = resolveBuilderItems(questions, settings.items);
      const fullH = applyBuilderSettings(questions, settings);
      const hdoc = buildBuilderHwpxDocument({
        title,
        settings,
        resolvedItems: resolvedH,
        includeAnswers,
        fullExamQuestions: fullH,
      });
      const hbuf = await packageHwpx(hdoc);
      const hout = path.join(HWPX_DIR, `sw-${caseName}-${sheet}.hwpx`);
      writeFileSync(hout, hbuf);
      hwpxFiles.push(hout);
      console.log(`  [hwpx] ${path.basename(hout)} (${hbuf.length}B)`);
    } catch (e) {
      console.error(`  [hwpx FAIL] ${caseName}-${sheet}: ${(e as Error).stack || (e as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const raw = loadQuestions();

  // 케이스 이름: difficulty 기반 + 충돌 방지 인덱스
  const seen = new Map<string, number>();
  const caseNameFor = (q: RawQuestion) => {
    const base = (q.difficulty || "MISC").toLowerCase();
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return seen.get(base)! > 1 || raw.filter((r) => (r.difficulty || "").toLowerCase() === base).length > 1
      ? `${base}-${n}`
      : base;
  };

  // 1) 개별 케이스 export
  for (const q of raw) {
    const eq = toExamQuestionData(q, 1);
    const caseName = caseNameFor(q);
    console.log(`\n[case] ${caseName}  (${q.id} / ${q.difficulty})`);
    await exportExam({
      caseName,
      title: `요약문 영작 — ${q.difficulty}`,
      questions: [eq],
      columns: 1,
    });
  }

  // 2) ALL: 한 페이지에 여러 문항(컬럼/줄간격 회귀 확인). 2단 배치.
  console.log(`\n[case] ALL  (${raw.length}문항, 2단)`);
  const allEq = raw.map((q, i) => toExamQuestionData(q, i + 1));
  await exportExam({
    caseName: "ALL",
    title: "요약문 영작 — 전체(2단)",
    questions: allEq,
    columns: 2,
  });

  // 3) 비교 기준선 SUMMARY_COMPLETE (선택)
  try {
    console.log(`\n[case] baseline (SUMMARY_COMPLETE 비교)`);
    const scEq = toExamQuestionData(summaryCompleteBaseline(), 1);
    await exportExam({
      caseName: "baseline-summary-complete",
      title: "요약문 완성 — 비교 기준선",
      questions: [scEq],
      columns: 1,
    });
  } catch (e) {
    console.warn(`  [baseline skip] ${(e as Error).message}`);
  }

  console.log(`\n=== DONE ===`);
  console.log(`docx: ${docxFiles.length}, hwpx: ${hwpxFiles.length}`);
  writeFileSync(
    path.join(ROOT, "export-manifest.json"),
    JSON.stringify({ docxFiles, hwpxFiles }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
