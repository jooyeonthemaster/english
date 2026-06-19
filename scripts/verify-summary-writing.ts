/**
 * SUMMARY_WRITING (요약문 영작) — 정답 누수 / 직렬화 가드 회귀 검증.
 *   npx tsx scripts/verify-summary-writing.ts
 *
 * 핵심 불변식 SW-LEAK-1: 정답계열 4필드(blanks[].answer / modelAnswer /
 *   acceptableVariants / wordBankDistractors)는 학생 직렬화 경로에 절대 노출 금지.
 *   👁학생노출 필드(summaryWithBlanks placeholder / koreanGloss / wordBank(미끼는
 *   wordBankDistractors 가 아니라 합성된 보기 칩) / firstLetterHint) 만 questionText 로 나간다.
 *
 * 검증 대상 직렬화 4경로(모두 SUMMARY_WRITING 일 때 summaryWritingStudentParts 만 써야 함):
 *   1) src/lib/question-generation-persistence.ts          buildGeneratedQuestionText
 *   2) src/components/workbench/generate-questions-dialog/build-question-text.ts  buildQuestionText
 *   3) src/app/(director)/director/workbench/generate/generate-page-types.ts      buildQuestionText
 *   4) src/lib/summary-writing.ts                          summaryWritingStudentParts
 *
 * 합성 픽스처: 난이도(BASIC/INTERMEDIATE/KILLER) × gloss on/off × wordBank on/off ×
 *   clueMode none/firstLetter × blankCount 1/2/3 의 조합. 각 픽스처의 정답계열 4필드에
 *   고유한 SECRET 토큰("SECRETANSWERTOKEN_*")을 심어, 직렬화 결과에 단 하나라도 나오면 FAIL.
 *   동시에 👁필드(koreanGloss / wordBank chip / firstLetterHint / (A) placeholder)는
 *   정상 노출되는지 양성 확인.
 */

import { buildGeneratedQuestionText } from "../src/lib/question-generation-persistence";
import { buildQuestionText as buildQuestionTextDialog } from "../src/components/workbench/generate-questions-dialog/build-question-text";
import { buildQuestionText as buildQuestionTextPage } from "../src/app/(director)/director/workbench/generate/generate-page-types";
import { summaryWritingStudentParts } from "../src/lib/summary-writing";
import type { SummaryWritingQuestion } from "../src/lib/question-schemas-essay";

// ─── SECRET 토큰 (정답계열 필드 전용 — 학생면에 나오면 절대 안 됨) ───
// 고유 prefix 로 직렬화 결과에서 substring 검색한다.
const SECRET = {
  blankAnswer: "SECRETANSWERTOKEN_BLANKANS",
  modelAnswer: "SECRETANSWERTOKEN_MODELANS",
  acceptableVariant: "SECRETANSWERTOKEN_VARIANT",
  wordBankDistractor: "SECRETANSWERTOKEN_DISTRACTOR",
  requiredLemma: "SECRETANSWERTOKEN_LEMMA",
  scoringCriteria: "SECRETANSWERTOKEN_RUBRIC",
} as const;

// 직렬화 결과에 절대 나오면 안 되는 토큰 목록 (SW-LEAK-1 — 핵심 4필드 + 보강 2필드).
const FORBIDDEN_TOKENS: string[] = Object.values(SECRET);

// 👁학생노출 가시 토큰 (정상 노출돼야 — 양성 확인용).
const VISIBLE = {
  gloss: "VISIBLEGLOSSTOKEN",
  wordBankUseful: "visiblewordbanktoken",
  firstLetter: "v t",
} as const;

const LABELS = ["(A)", "(B)", "(C)"] as const;

interface FixtureOptions {
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  glossEnabled: boolean;
  wordBankEnabled: boolean;
  clueMode: "none" | "firstLetter";
  blankCount: 1 | 2 | 3;
  identityField: "_typeId" | "subType"; // 두 식별 경로 모두 검증
}

type SwQuestionLike = Record<string, unknown>;

/**
 * 합성 SUMMARY_WRITING 객체. 정답계열 필드에는 SECRET 토큰을, 👁필드에는 VISIBLE 토큰을 심는다.
 * summaryWithBlanks 는 (A)(B) placeholder 만 담고 정답어구를 포함하지 않는다(SW-LEAK-MASK 계약).
 */
function makeFixture(opts: FixtureOptions): { question: SwQuestionLike; label: string } {
  const labels = LABELS.slice(0, opts.blankCount);

  const blanks = labels.map((label, i) => ({
    label,
    // 🔒비밀 — 빈칸 모범 영작 (SECRET 심음). 앞 두 단어 "value tactics"는 앞글자 단서가
    // 정답에서 파생됨(summaryWritingFirstLetterLine)을 검증하기 위한 것 — 파생 첫글자 "v t ..."
    // 가 노출되되 정답 전체(SECRET)는 절대 노출되지 않아야 한다.
    answer: `value tactics ${SECRET.blankAnswer}_${label}_${i}`,
    // 🔒비밀 — 동치답
    acceptableVariants: [`${SECRET.acceptableVariant}_${label}_alt1`, `${SECRET.acceptableVariant}_${label}_alt2`],
    // 🔒비밀 — 채점 표제어
    requiredLemmas: [`${SECRET.requiredLemma}_${label}`],
    // 👁학생노출 — 앞글자 단서 (clueMode=firstLetter 일 때만 직렬화돼야)
    firstLetterHint: VISIBLE.firstLetter,
    // 👁학생노출 — 목표 단어수
    targetWordCount: 5,
    // 👁학생노출 — 빈칸 뒤 프레임
    connectorFrameAfter: ", which matters.",
  }));

  // (A)(B)(C) placeholder 로 구성된 영어 요약문 — 정답어구 미포함.
  const summaryWithBlanks =
    labels.map((label) => `${label} `).join("and ") + "in the end.";

  const question: SwQuestionLike = {
    direction: "다음 글의 요약문 빈칸에 들어갈 말을 영작하시오.",
    correctAnswer: "(A) ... (B) ...", // 표시용 — SECRET 미포함이어야 의미 있음(아래 검증에서 별도 확인)
    explanation: "교사용 해설(학생 직렬화 경로엔 안 나감).",
    keyPoints: ["kp1", "kp2", "kp3"],
    tags: ["요약문영작"],
    difficulty: opts.difficulty,

    summaryWithBlanks,
    blanks,

    // 👁학생노출 — 해석 (glossEnabled 일 때만 채움)
    koreanGloss: opts.glossEnabled ? `해석 텍스트 ${VISIBLE.gloss} 입니다.` : undefined,
    blankGlosses: opts.glossEnabled
      ? labels.map((label) => ({ label, gloss: `${VISIBLE.gloss}_${label}` }))
      : undefined,

    // 👁학생노출 — 보기 칩 (wordBankEnabled 일 때만). 유용 단어 + 미끼가 "섞인 합성 보기".
    // 단, 미끼 칩 자체에는 SECRET 을 심지 않는다 — wordBank 는 학생 노출 필드라 누수가 아니다.
    // 누수 검증은 별도 비밀 필드 wordBankDistractors 로 한다.
    wordBank: opts.wordBankEnabled
      ? [VISIBLE.wordBankUseful, "another", "decoy_visible"]
      : undefined,
    // 🔒비밀 — 어느 칩이 미끼인지 (학생 비노출). SECRET 심음.
    wordBankDistractors: opts.wordBankEnabled
      ? [`${SECRET.wordBankDistractor}_1`, `${SECRET.wordBankDistractor}_2`]
      : undefined,
    wordBankPolicy: opts.wordBankEnabled ? "usePartial" : undefined,
    wordBankFidelity: "verbatim",

    blankAssignment: opts.blankCount >= 2 ? "separate" : undefined,
    clueMode: opts.clueMode,
    targetWordsMode: "approx",
    connectorFrame: "partial",
    summarySourceMode: "paraphrase",
    sourceSentenceParaphrase: false,

    // 🔒비밀 — 전체 모범답안 (SECRET 심음)
    modelAnswer: `${SECRET.modelAnswer} full sentence here.`,
    // 🔒비밀 — 전체답 동치
    acceptableVariants: [`${SECRET.acceptableVariant}_FULL`],
    // 🔒비밀 — 교사 루브릭
    scoringCriteria: [`${SECRET.scoringCriteria}_핵심어 포함`],
    scoringMode: "LLM_RUBRIC",
  };

  // 유형 식별 필드 — 누수가드는 _typeId / subType 둘 다 인식해야 한다.
  question[opts.identityField] = "SUMMARY_WRITING";

  const label =
    `${opts.difficulty}` +
    ` gloss=${opts.glossEnabled ? "on" : "off"}` +
    ` wb=${opts.wordBankEnabled ? "on" : "off"}` +
    ` clue=${opts.clueMode}` +
    ` blanks=${opts.blankCount}` +
    ` id=${opts.identityField}`;

  return { question, label };
}

// ─── 픽스처 조합 생성 ───
function buildFixtures(): { question: SwQuestionLike; label: string }[] {
  const out: { question: SwQuestionLike; label: string }[] = [];
  const difficulties: FixtureOptions["difficulty"][] = ["BASIC", "INTERMEDIATE", "KILLER"];
  const blankCounts: FixtureOptions["blankCount"][] = [1, 2, 3];
  const identityFields: FixtureOptions["identityField"][] = ["_typeId", "subType"];

  for (const difficulty of difficulties) {
    for (const glossEnabled of [true, false]) {
      for (const wordBankEnabled of [true, false]) {
        for (const clueMode of ["none", "firstLetter"] as const) {
          for (const blankCount of blankCounts) {
            for (const identityField of identityFields) {
              out.push(
                makeFixture({
                  difficulty,
                  glossEnabled,
                  wordBankEnabled,
                  clueMode,
                  blankCount,
                  identityField,
                }),
              );
            }
          }
        }
      }
    }
  }
  return out;
}

// ─── 직렬화 경로 4종 ───
type SerializePath = { name: string; run: (q: SwQuestionLike) => string };

const PATHS: SerializePath[] = [
  {
    name: "persistence.buildGeneratedQuestionText",
    run: (q) => buildGeneratedQuestionText(q),
  },
  {
    name: "dialog.buildQuestionText",
    run: (q) => buildQuestionTextDialog(q),
  },
  {
    name: "generate-page.buildQuestionText",
    run: (q) => buildQuestionTextPage(q),
  },
  {
    name: "summary-writing.summaryWritingStudentParts",
    // 학생 안전 블록 배열 → 직렬화와 동일하게 join 하여 검사.
    run: (q) => summaryWritingStudentParts(q as Partial<SummaryWritingQuestion>).join("\n\n"),
  },
];

// ─── 실행 ───
let fail = 0;
let pass = 0;
const log = (ok: boolean, msg: string) => {
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log("  ✗ " + msg);
  }
};

const fixtures = buildFixtures();
console.log(
  `\n[verify-summary-writing] ${fixtures.length} 픽스처 × ${PATHS.length} 직렬화 경로 = ` +
    `${fixtures.length * PATHS.length} 누수 검사\n`,
);

for (const { question, label } of fixtures) {
  for (const path of PATHS) {
    let output = "";
    try {
      output = path.run(question);
    } catch (error) {
      log(false, `[${path.name}] [${label}] 직렬화 중 예외: ${(error as Error)?.message ?? error}`);
      continue;
    }

    // 1) 정답 누수 검사 — FORBIDDEN 토큰이 하나라도 있으면 FAIL.
    for (const token of FORBIDDEN_TOKENS) {
      log(
        !output.includes(token),
        `[${path.name}] [${label}] 정답 누수: "${token}" 가 학생 직렬화에 노출됨\n` +
          `      ── 출력 ──\n${indent(output)}`,
      );
    }

    // 2) [빈칸 정답] 마커 자체가 SUMMARY_WRITING 직렬화에 절대 나오면 안 됨(SW-LEAK-1).
    log(
      !output.includes("[빈칸 정답]"),
      `[${path.name}] [${label}] '[빈칸 정답]' 마커가 노출됨 (SUMMARY_WRITING 금지)`,
    );
  }
}

// ─── 👁학생노출 양성 확인 (대표 조합: 모든 가시필드 켜짐) ───
console.log("\n[positive] 👁학생노출 필드 정상 노출 양성 확인\n");
{
  const { question } = makeFixture({
    difficulty: "INTERMEDIATE",
    glossEnabled: true,
    wordBankEnabled: true,
    clueMode: "firstLetter",
    blankCount: 2,
    identityField: "_typeId",
  });

  for (const path of PATHS) {
    const output = path.run(question);

    // 해석(koreanGloss) 노출
    log(
      output.includes(VISIBLE.gloss),
      `[${path.name}] [positive] 해석 토큰 "${VISIBLE.gloss}" 미노출 (gloss on 인데 빠짐)`,
    );
    // 보기(wordBank 유용 단어) 노출
    log(
      output.includes(VISIBLE.wordBankUseful),
      `[${path.name}] [positive] 보기 토큰 "${VISIBLE.wordBankUseful}" 미노출 (wordBank on 인데 빠짐)`,
    );
    // 앞글자 단서 — 별도 줄이 아니라 [요약문] 빈칸이 단어별 슬롯(칸마다 앞글자)으로 렌더된다.
    // answer="value tactics ..." → 슬롯 "v____ t____ ...". 정답에서 파생되므로 토큰 정렬 보장.
    log(
      /v_{3,}/.test(output) && /t_{3,}/.test(output),
      `[${path.name}] [positive] 앞글자 단어별 슬롯("v____ t____") 미노출 (clueMode=firstLetter)`,
    );
    // 앞글자는 쓰는 칸 안에 있어야 하며, 별도 [앞글자] 줄로 분리돼선 안 된다.
    log(
      !output.includes("[앞글자]"),
      `[${path.name}] [positive] 앞글자가 별도 '[앞글자]' 줄로 노출됨(빈칸 슬롯 인라인이어야 함)`,
    );
    // (A) placeholder + 빈칸선(_{3,}) 노출 (요약문 박스)
    log(
      output.includes("(A)") && /_{3,}/.test(output),
      `[${path.name}] [positive] 요약문 placeholder '(A)' + 빈칸선 미노출`,
    );
  }
}

// ─── clueMode=none 일 때 앞글자 미노출 음성 확인 ───
console.log("\n[negative-gating] clueMode=none 이면 앞글자 단서 미노출\n");
{
  const { question } = makeFixture({
    difficulty: "BASIC",
    glossEnabled: true,
    wordBankEnabled: true,
    clueMode: "none",
    blankCount: 1,
    identityField: "_typeId",
  });
  for (const path of PATHS) {
    const output = path.run(question);
    log(
      !output.includes("[앞글자]"),
      `[${path.name}] [negative] clueMode=none 인데 '[앞글자]' 단서가 노출됨`,
    );
    // clueMode=none 이면 단어별 앞글자 슬롯("v____"/"t____")이 없어야(통짜 빈칸 1개만).
    log(
      !/v_{3,}/.test(output) && !/t_{3,}/.test(output),
      `[${path.name}] [negative] clueMode=none 인데 앞글자 단어별 슬롯이 노출됨`,
    );
  }
}

// ─── 결과 ───
function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => "        " + line)
    .join("\n");
}

console.log("\n────────────────────────────────────────────");
if (fail === 0) {
  console.log(
    `✅ ALL PASS — SUMMARY_WRITING 정답 누수 0 (${pass} 검사 통과).\n` +
      `   정답계열 4필드(blanks[].answer / modelAnswer / acceptableVariants / wordBankDistractors)` +
      ` + requiredLemmas/scoringCriteria 가 4개 직렬화 경로 어디에도 노출되지 않음.\n` +
      `   👁학생노출 필드(해석/보기/앞글자/요약문 빈칸)는 정상 노출 확인.`,
  );
} else {
  console.log(`❌ ${fail} 건 실패 / ${pass} 건 통과 — 정답 누수 또는 가시필드 회귀 발생.`);
  process.exit(1);
}
