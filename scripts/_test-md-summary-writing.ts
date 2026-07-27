// 요약문 영작(SUMMARY_WRITING) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 설정집행 → 게이트 → 어댑터 → postProcessQuestion →
// validateQuestionQuality → buildAnswerSpec → gradeAnswer 까지 전 구간 왕복.
// 실행: npx tsx scripts/_test-md-summary-writing.ts
//
// 서술형이라 견본(반의어)에 없는 축이 둘 더 있다:
//  ① 채점 왕복(buildAnswerSpec → gradeAnswer) — acceptedAnswers 계열이 아니라
//     acceptableVariants + requiredLemmas 계열이라 LEMMA 모드 판정이 핵심이다.
//  ② 결정형 파생(modelAnswer · wordBankDistractors) — 형식에서 받지 않고 만든다.
import {
  parseMdSummaryWriting,
  summaryWritingLabel,
  summaryWritingLabelSequence,
  summaryWritingMdModelAnswer,
  type MdSummaryWritingQuestion,
} from "../src/lib/md-qgen/parser-summary-writing";
import {
  autoSnapSummaryWriting,
  chipsFollowAnswerOrder,
  deriveSummaryWritingDistractors,
} from "../src/lib/md-qgen/snap-summary-writing";
import {
  enforceSummaryWritingSettings,
  gateMdSummaryWriting,
  type SummaryWritingGateOptions,
} from "../src/lib/md-qgen/gate-summary-writing";
import { adaptMdSummaryWritingToAiQuestion } from "../src/lib/md-qgen/adapter-summary-writing";
import { SUMMARY_WRITING_MD_LANE } from "../src/lib/md-qgen/lane-summary-writing";
import {
  buildMdSummaryWritingPrompt,
  summaryWritingDistractorNeed,
} from "../src/lib/md-qgen/prompts-summary-writing";
import {
  buildSummaryWritingDirection,
  resolveQuestionTypeGenerationSettings,
  resolveSummaryWritingSettings,
  type ResolvedSummaryWritingSettings,
} from "../src/lib/question-type-generation-settings";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { buildAnswerSpec } from "../src/lib/exam-scoring/answer-spec";
import { gradeAnswer } from "../src/lib/exam-scoring/grade";
import { CREDIT_COSTS } from "../src/lib/credit-costs";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

const PASSAGE =
  "Researchers who want sharper estimates often keep adding observations to a study that was never designed to grow. " +
  "They log more sessions, more clicks, more responses, yet every new record still comes from the same narrow pool of volunteers. " +
  "Because the frame stays fixed, the extra records mostly repeat the tendencies the pool already had. " +
  "Precision improves on paper while the distance between the pool and the wider population stays exactly where it was. " +
  "A study can therefore look more confident and be more wrong at the same time.";

// ───────────────────────────────────────────────────────────────────────────
// 설정 픽스처 — fast 와 동일한 결정 소스(resolveSummaryWritingSettings)로 만든다.
// ───────────────────────────────────────────────────────────────────────────
const RAW_MAIN = {
  difficulty: "INTERMEDIATE",
  blankCount: 1,
  glossEnabled: true,
  glossLooseness: "natural",
  wordBankEnabled: true,
  wordBankUsage: "usePartial",
  boxDistractors: 2,
  wordBankFidelity: "verbatim",
  wordBankChunking: "word",
  wordBankOrder: "scrambleStrong",
  targetWordsMode: "approx",
  targetWordsPerBlank: 7,
  clueMode: "none",
  connectorFrame: "partial",
  summarySourceMode: "paraphrase",
  scoringGranularity: "keyword",
};
const MAIN: ResolvedSummaryWritingSettings = resolveSummaryWritingSettings(
  RAW_MAIN,
  "INTERMEDIATE",
);

const RAW_KILLER = {
  difficulty: "KILLER",
  blankCount: 2,
  glossEnabled: false,
  wordBankEnabled: false,
  targetWordsMode: "hidden",
  scoringGranularity: "rubric",
  summarySourceMode: "inference",
};
const KILLER: ResolvedSummaryWritingSettings = resolveSummaryWritingSettings(
  RAW_KILLER,
  "KILLER",
);

function gateOptions(s: ResolvedSummaryWritingSettings): SummaryWritingGateOptions {
  return {
    blankCount: s.blankCount,
    glossEnabled: s.glossEnabled,
    wordBankEnabled: s.wordBankEnabled,
    wordBankUsage: s.wordBankUsage,
    boxDistractors: s.boxDistractors,
    targetWordsMode: s.targetWordsMode,
    targetWordsPerBlank: s.targetWordsPerBlank,
    requireCriteria: s.scoringGranularity === "rubric",
    requireLemmas: s.scoringGranularity === "keyword",
  };
}

const GOOD = `요약문: (A), which can lead to greater bias in the result.
해석: 표본의 틀을 넓히지 않은 채 기록만 늘리면 결과의 편향이 오히려 커질 수 있다는 뜻입니다.
보기: without / sample / expanding / collecting / size / the / reducing / increasing / data

정답(A): Collecting data without increasing the sample size
동치(A): Gathering data without increasing the sample size
핵심어(A): collecting, data, sample, size

채점기준:
- 자료 수집과 표본이 함께 드러나면 1점입니다.
- 표본을 늘리지 않았다는 대조가 드러나면 1점입니다.
해설: 이 글은 관측치를 아무리 늘려도 표본의 틀이 고정되어 있으면 편향이 그대로 남는다고 말합니다. 따라서 빈칸에는 표본을 넓히지 않은 채 자료만 모으는 행위가 들어가야 합니다.`;

const GOOD_KILLER = `요약문: (A) can make a study look more confident without narrowing (B).
정답(A): Adding records to a sampling frame that never widens
핵심어(A): adding, records, sampling, frame
정답(B): its distance from the population it claims to describe
핵심어(B): distance, population, describe

채점기준:
- 표본 틀이 넓어지지 않는다는 조건이 드러나면 2점입니다.
- 모집단과의 간극이 그대로라는 귀결이 드러나면 2점입니다.
해설: 이 글은 표본 틀을 넓히지 않은 채 기록만 늘리면 정밀도만 올라간다고 말합니다. 그래서 겉보기 확신과 실제 대표성 사이의 간극이 그대로 남는다는 점이 요약의 핵심입니다.`;

function pipeline(
  text: string,
  s: ResolvedSummaryWritingSettings,
): { question: MdSummaryWritingQuestion; corrections: string[]; issues: string[] } {
  const snapped = autoSnapSummaryWriting(parseMdSummaryWriting(text));
  const enforced = enforceSummaryWritingSettings(snapped.question, {
    glossEnabled: s.glossEnabled,
    wordBankEnabled: s.wordBankEnabled,
  });
  return {
    question: enforced.question,
    corrections: [...snapped.corrections, ...enforced.corrections],
    issues: gateMdSummaryWriting(enforced.question, PASSAGE, gateOptions(s)),
  };
}
const gateOf = (text: string, s = MAIN) => pipeline(text, s).issues;

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로 파싱
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdSummaryWriting(GOOD);
check("파싱: 요약문", parsed.summary === "(A), which can lead to greater bias in the result.", parsed.summary);
check("파싱: 해석 한국어", parsed.gloss.includes("표본의 틀"), parsed.gloss);
check("파싱: 보기 칩 9개", parsed.chips.length === 9, `실제 ${parsed.chips.length}`);
check("파싱: 빈칸 1개 · 라벨 (A)", parsed.blanks.length === 1 && parsed.blanks[0].label === "(A)");
check(
  "파싱: 정답",
  parsed.blanks[0]?.answer === "Collecting data without increasing the sample size",
  parsed.blanks[0]?.answer,
);
check("파싱: 동치 1개", parsed.blanks[0]?.variants.length === 1, String(parsed.blanks[0]?.variants));
check("파싱: 핵심어 4개", parsed.blanks[0]?.lemmas.length === 4, String(parsed.blanks[0]?.lemmas));
check("파싱: 채점기준 2줄", parsed.criteria.length === 2, String(parsed.criteria.length));
check("파싱: 해설 존재 · 채점기준 미포함", parsed.explanation.startsWith("이 글은") && !parsed.explanation.includes("채점기준"));
check("파싱: 라벨 정규화 (a)→(A)", summaryWritingLabel("(a)") === "(A)" && summaryWritingLabel("(Z)") === "");
check(
  "파싱: 요약문 라벨 등장순 추출",
  summaryWritingLabelSequence("(A) x (B) y").join("") === "(A)(B)",
);

// ───────────────────────────────────────────────────────────────────────────
// 2. 결정형 파생 — 형식에서 받지 않는 두 필드
// ───────────────────────────────────────────────────────────────────────────
const snappedMain = pipeline(GOOD, MAIN);
check(
  "파생: 모범답안 = 요약문 + 정답 치환",
  summaryWritingMdModelAnswer(snappedMain.question) ===
    "Collecting data without increasing the sample size, which can lead to greater bias in the result.",
  summaryWritingMdModelAnswer(snappedMain.question),
);
check(
  "파생: 미끼 = 조립 잔여 칩 2개(expanding·reducing)",
  deriveSummaryWritingDistractors(snappedMain.question.chips, snappedMain.question.blanks)
    .sort()
    .join(",") === "expanding,reducing",
  deriveSummaryWritingDistractors(snappedMain.question.chips, snappedMain.question.blanks).join(","),
);
check(
  "파생: 보기가 없으면 미끼도 없다",
  deriveSummaryWritingDistractors([], snappedMain.question.blanks).length === 0,
);
check(
  "파생: 모범답안 파생은 라벨이 여러 개여도 순서대로 치환",
  summaryWritingMdModelAnswer({
    ...snappedMain.question,
    summary: "(A) then (B).",
    blanks: [
      { label: "(A)", answer: "first phrase", variants: [], lemmas: [] },
      { label: "(B)", answer: "second phrase", variants: [], lemmas: [] },
    ],
  }) === "first phrase then second phrase.",
);

// ───────────────────────────────────────────────────────────────────────────
// 3. 게이트 — 정상 클린 + 반려 전종
// ───────────────────────────────────────────────────────────────────────────
check("게이트: 정상 입력 클린(MAIN)", snappedMain.issues.length === 0, snappedMain.issues.join(" / "));
check("스냅: 정상 입력 무보정", snappedMain.corrections.length === 0, snappedMain.corrections.join(" / "));

const killerRun = pipeline(GOOD_KILLER, KILLER);
check("게이트: 정상 입력 클린(KILLER 2빈칸·보기없음)", killerRun.issues.length === 0, killerRun.issues.join(" / "));

check(
  "게이트: 빈칸 개수 부족 반려",
  gateOf(GOOD, resolveSummaryWritingSettings({ ...RAW_MAIN, blankCount: 2 }, "INTERMEDIATE")).some((i) =>
    i.includes("빈칸 정답 1개 (2개 필요)"),
  ),
);
check(
  "게이트: 라벨 축 오류 반려((B)만 있음)",
  gateOf(
    GOOD.replace("정답(A):", "정답(B):").replace("동치(A):", "동치(B):").replace("핵심어(A):", "핵심어(B):"),
  ).some((i) => i.includes("정답 라벨이 (A) 이 아님")),
);
check(
  "게이트: 요약문 누락 반려",
  gateOf(GOOD.replace(/^요약문:.*$/m, "")).some((i) => i.includes("요약문 누락")),
);
check(
  "게이트: 라벨이 요약문에 2회면 반려",
  gateOf(GOOD.replace("요약문: (A),", "요약문: (A) and (A),")).some((i) =>
    i.includes("(A) 가 2회"),
  ),
);
check(
  "게이트: 설정 범위 밖 라벨 반려",
  gateOf(GOOD.replace("요약문: (A),", "요약문: (A) and (C),")).some((i) =>
    i.includes("설정 범위 밖 라벨"),
  ),
);
check(
  // 라벨 **직후** 빈칸선은 스냅이 제거한다(아래 스냅 섹션). 여기서는 스냅이 손대지
  // 않는 자리(문장 중간)의 밑줄이 게이트에 걸리는지를 본다.
  "게이트: 요약문 밑줄 잔존 반려",
  gateOf(GOOD.replace("which can lead", "which can ______ lead")).some((i) =>
    i.includes("밑줄"),
  ),
);
check(
  "게이트: 요약문이 한국어면 반려",
  gateOf(GOOD.replace(/^요약문:.*$/m, "요약문: (A) 때문에 결과의 편향이 커집니다.")).some((i) =>
    i.includes("요약문이 영어 문장이 아님"),
  ),
);
check(
  "게이트: 정답 누락 반려",
  gateOf(GOOD.replace("정답(A): Collecting data without increasing the sample size", "정답(A): ")).some(
    (i) => i.includes("정답(A) 줄을 인식할 수 없음"),
  ),
);
check(
  "게이트: 정답이 한국어면 반려",
  gateOf(
    GOOD.replace(
      "정답(A): Collecting data without increasing the sample size",
      "정답(A): 표본을 늘리지 않고 자료를 모으는 것",
    ),
  ).some((i) => i.includes("영어 어구가 아님")),
);
check(
  "게이트: 단일어 정답 반려",
  gateOf(
    GOOD.replace("정답(A): Collecting data without increasing the sample size", "정답(A): collecting"),
  ).some((i) => i.includes("다단어 어구가 정답이어야 함")),
);
check(
  "게이트: approx 목표 단어수 이탈 반려",
  gateOf(
    GOOD.replace(
      "정답(A): Collecting data without increasing the sample size",
      "정답(A): Collecting data from the same fixed narrow volunteer pool again and again",
    ),
  ).some((i) => i.includes("약 7단어")),
);
check(
  "게이트: exact 목표 단어수 불일치 반려",
  gateOf(GOOD, resolveSummaryWritingSettings({ ...RAW_MAIN, targetWordsMode: "exact", targetWordsPerBlank: 5 }, "INTERMEDIATE")).some(
    (i) => i.includes("정확히 5단어"),
  ),
);
check(
  "게이트: 핵심어 누락 반려",
  gateOf(GOOD.replace(/^핵심어\(A\):.*$/m, "")).some((i) => i.includes("핵심어(A) 누락")),
);
check(
  "게이트: 핵심어가 정답에 없는 형태면 반려",
  gateMdSummaryWriting(
    {
      ...snappedMain.question,
      blanks: [{ ...snappedMain.question.blanks[0], lemmas: ["zzz"] }],
    },
    PASSAGE,
    gateOptions(MAIN),
  ).some((i) => i.includes("정답 어구에 없는 형태")),
);
check(
  "게이트: 동치가 영어가 아니면 반려",
  gateOf(GOOD.replace("동치(A): Gathering data without increasing the sample size", "동치(A): 자료 수집")).some(
    (i) => i.includes("동치(A) 항목이 영어가 아님"),
  ),
);
check(
  "게이트: 정답 어구가 요약문에 노출되면 반려",
  gateOf(
    GOOD.replace(
      "요약문: (A), which can lead to greater bias in the result.",
      "요약문: Collecting data without increasing the sample size matters here, and (A) follows.",
    ),
  ).some((i) => i.includes("요약문에 통째로 노출")),
);
check(
  "게이트: 정답이 지문 통째 복사면 반려",
  gateOf(
    GOOD.replace(
      "정답(A): Collecting data without increasing the sample size",
      "정답(A): every new record still comes from the same narrow pool of volunteers",
    ),
  ).some((i) => i.includes("지문 문장의 통째 복사")),
);
check(
  "게이트: 해석 누락 반려(glossEnabled)",
  gateOf(GOOD.replace(/^해석:.*$/m, "")).some((i) => i.includes("해석 누락")),
);
check(
  "게이트: 해석이 한국어가 아니면 반려",
  gateOf(GOOD.replace(/^해석:.*$/m, "해석: The frame stays fixed while records grow.")).some((i) =>
    i.includes("해석이 한국어가 아님"),
  ),
);
check(
  "게이트: 보기 칩 부족 반려",
  gateOf(GOOD.replace(/^보기:.*$/m, "보기: collecting")).some((i) => i.includes("보기 칩 1개")),
);
check(
  "게이트: 보기로 정답 조립 불가 반려(부족 토큰 지목)",
  gateOf(GOOD.replace(/^보기:.*$/m, "보기: without / sample / expanding / collecting / size / reducing / data")).some(
    (i) => i.includes("조립 불가") && i.includes('"the"'),
  ),
  gateOf(GOOD.replace(/^보기:.*$/m, "보기: without / sample / expanding / collecting / size / reducing / data")).join(" / "),
);
check(
  "게이트: 한 칩이 다단어 정답을 통째로 담으면 반려",
  gateOf(
    GOOD.replace(
      /^보기:.*$/m,
      "보기: Collecting data without increasing the sample size / expanding / reducing",
    ),
  ).some((i) => i.includes("통째로 담고")),
);
check(
  "게이트: 보기 나열이 정답 어순이면 반려(스냅 우회 직접 호출)",
  gateMdSummaryWriting(
    {
      ...snappedMain.question,
      chips: ["collecting", "data", "without", "increasing", "the", "sample", "size"],
    },
    PASSAGE,
    gateOptions(MAIN),
  ).some((i) => i.includes("정답 어순 그대로")),
);
check(
  "게이트: useAll 인데 잔여 칩이 남으면 반려",
  gateOf(GOOD, resolveSummaryWritingSettings({ ...RAW_MAIN, wordBankUsage: "useAll" }, "INTERMEDIATE")).some(
    (i) => i.includes("useAll 은 전량 사용"),
  ),
);
check(
  "게이트: usePartial 인데 미끼가 0개면 반려",
  gateOf(
    GOOD.replace(/^보기:.*$/m, "보기: without / sample / collecting / size / the / increasing / data"),
  ).some((i) => i.includes("미끼 칩이 0개")),
);
check(
  "게이트: 해석 + 미끼 0 조합은 받아쓰기 반려",
  gateOf(
    GOOD.replace(/^보기:.*$/m, "보기: without / sample / collecting / size / the / increasing / data"),
  ).some((i) => i.includes("받아쓰기")),
);
check(
  "게이트: 해설 누락 반려",
  gateOf(GOOD.replace(/^해설:[\s\S]*$/m, "")).some((i) => i.includes("해설 누락")),
);
check(
  "게이트: 해설이 한국어가 아니면 반려",
  gateOf(GOOD.replace(/^해설:[\s\S]*$/m, "해설: The summary compresses the causal claim of the passage.")).some(
    (i) => i.includes("해설이 한국어가 아님"),
  ),
);
check(
  "게이트: 루브릭 채점인데 채점기준이 없으면 반려",
  pipeline(GOOD_KILLER.replace(/^채점기준:[\s\S]*?(?=^해설:)/m, ""), KILLER).issues.some((i) =>
    i.includes("채점기준 누락"),
  ),
);
check(
  "게이트: 두 빈칸 정답이 같으면 반려",
  pipeline(
    GOOD_KILLER.replace(
      "정답(B): its distance from the population it claims to describe",
      "정답(B): Adding records to a sampling frame that never widens",
    ),
    KILLER,
  ).issues.some((i) => i.includes("다른 빈칸 정답과 동일")),
);

// ───────────────────────────────────────────────────────────────────────────
// 4. 드리프트 관용 — 전부 파싱 성공 + 게이트 클린이어야 한다.
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string][] = [
  ["굵게 라벨", "정답(A): Collecting", "**정답(A):** Collecting"],
  ["굵게 라벨(콜론 밖)", "정답(A): Collecting", "**정답(A)**: Collecting"],
  ["불릿 접두", "정답(A): Collecting", "- 정답(A): Collecting"],
  ["별표 불릿", "핵심어(A): collecting", "* 핵심어(A): collecting"],
  ["라벨 소문자", "정답(A): Collecting", "정답(a): Collecting"],
  ["라벨 대괄호", "정답(A): Collecting", "정답[A]: Collecting"],
  ["라벨 전각괄호", "정답(A): Collecting", "정답（A）: Collecting"],
  ["라벨 주변 공백", "정답(A): Collecting", "정답 (A) : Collecting"],
  ["표 형식 행", "핵심어(A): collecting, data, sample, size", "| 핵심어(A): collecting, data, sample, size |"],
  ["전각 콜론", "동치(A): Gathering", "동치(A)： Gathering"],
  ["핵심어 슬래시 구분자", "핵심어(A): collecting, data, sample, size", "핵심어(A): collecting / data / sample / size"],
  ["보기 쉼표 구분자", "보기: without / sample / expanding / collecting / size / the / reducing / increasing / data", "보기: without, sample, expanding, collecting, size, the, reducing, increasing, data"],
  ["보기 대괄호 감쌈", "보기: without /", "보기: [without /"],
  ["채점기준 번호 목록", "- 자료 수집과 표본이", "1. 자료 수집과 표본이"],
  ["요약문 값이 다음 줄", "요약문: (A), which", "요약문:\n(A), which"],
  ["정답 값 따옴표", "정답(A): Collecting data without increasing the sample size", '정답(A): "Collecting data without increasing the sample size"'],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const run = pipeline(drifted, MAIN);
  check(
    `드리프트 관용: ${name}`,
    run.question.blanks.length === 1 &&
      run.question.blanks[0].answer.startsWith("Collecting data") &&
      run.issues.length === 0,
    `정답='${run.question.blanks[0]?.answer}' · ${run.issues.join(" / ")}`,
  );
}
// 보기 대괄호 드리프트는 닫는 괄호까지 확인한다.
{
  const drifted = GOOD.replace(/^보기:.*$/m, (m) => `보기: [${m.slice(4).trim()}]`);
  const run = pipeline(drifted, MAIN);
  check(
    "드리프트 관용: 보기 [ ] 감쌈 — 칩 9개 유지",
    run.question.chips.length === 9 && run.issues.length === 0,
    `칩 ${run.question.chips.length}개 · ${run.issues.join(" / ")}`,
  );
}
// 라벨 없는 단일형 `정답:` — blankCount=1 구형 드리프트
{
  const bare = GOOD.replace("정답(A):", "정답:")
    .replace("동치(A):", "동치:")
    .replace("핵심어(A):", "핵심어:");
  const run = pipeline(bare, MAIN);
  check(
    "드리프트 관용: 라벨 없는 단일형 정답/동치/핵심어",
    run.question.blanks.length === 1 &&
      run.question.blanks[0].label === "(A)" &&
      run.question.blanks[0].variants.length === 1 &&
      run.question.blanks[0].lemmas.length === 4 &&
      run.issues.length === 0,
    `${JSON.stringify(run.question.blanks)} · ${run.issues.join(" / ")}`,
  );
}
// 과잉 관용 방지 — 산문 줄을 빈칸으로 오인하지 않는다.
{
  const prose = GOOD.replace(
    "정답(A):",
    "이 문항은 요약문 영작입니다.\n정답(A):",
  );
  check(
    "과잉 관용 방지: 라벨 없는 산문 줄 무시",
    parseMdSummaryWriting(prose).blanks.length === 1,
    String(parseMdSummaryWriting(prose).blanks.length),
  );
}
// 값이 비어도 줄을 버리지 않는다(철칙 3 — 게이트가 지목해야 원인이 드러난다).
{
  const empty = parseMdSummaryWriting(GOOD.replace(/^정답\(A\):.*$/m, "정답(A):"));
  check(
    "철칙3: 빈 값도 줄을 버리지 않는다",
    empty.blanks.length === 1 && empty.blanks[0].answer === "",
    JSON.stringify(empty.blanks),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. 스냅 보정
// ───────────────────────────────────────────────────────────────────────────
{
  const run = pipeline(GOOD.replace("요약문: (A),", "요약문: (a) _____,"), MAIN);
  check(
    "스냅: 전각/소문자 라벨 + 라벨 뒤 빈칸선 제거",
    run.question.summary.startsWith("(A),") && run.issues.length === 0,
    `'${run.question.summary}' · ${run.issues.join(" / ")}`,
  );
  check("스냅: 보정 기록 2건", run.corrections.length === 2, run.corrections.join(" / "));
}
{
  const run = pipeline(
    GOOD.replace(
      "동치(A): Gathering data without increasing the sample size",
      "동치(A): Collecting data without increasing the sample size",
    ),
    MAIN,
  );
  check(
    "스냅: 정답과 동일한 동치 제거",
    run.question.blanks[0].variants.length === 0 &&
      run.corrections.some((c) => c.includes("동치 정답")),
    run.corrections.join(" / "),
  );
}
{
  const run = pipeline(
    GOOD.replace("핵심어(A): collecting, data, sample, size", "핵심어(A): collect, sample size"),
    MAIN,
  );
  check(
    "스냅: 핵심어를 정답 표면형 단어 토큰으로 정규화",
    run.question.blanks[0].lemmas.join(",") === "collecting,sample,size" && run.issues.length === 0,
    `${run.question.blanks[0].lemmas.join(",")} · ${run.issues.join(" / ")}`,
  );
}
{
  const inOrder = GOOD.replace(
    /^보기:.*$/m,
    "보기: collecting / data / without / increasing / the / sample / size",
  );
  const run = pipeline(inOrder, MAIN);
  check(
    "스냅: 정답 어순 보기를 결정형으로 재배열",
    run.corrections.some((c) => c.includes("정답 어순")) &&
      !chipsFollowAnswerOrder(run.question.chips, run.question.blanks[0].answer),
    run.corrections.join(" / "),
  );
  check(
    "스냅: 재배열해도 칩 집합은 불변(멀티셋 보존)",
    [...run.question.chips].sort().join(",") ===
      ["collecting", "data", "without", "increasing", "the", "sample", "size"].sort().join(","),
    run.question.chips.join(","),
  );
}
{
  const run = pipeline(GOOD, KILLER);
  check(
    "설정 집행: gloss/보기 off 면 절삭 + 기록",
    run.question.gloss === "" &&
      run.question.chips.length === 0 &&
      run.corrections.filter((c) => c.includes("절삭")).length === 2,
    run.corrections.join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 어댑터 → postProcessQuestion → validateQuestionQuality 왕복
// ───────────────────────────────────────────────────────────────────────────
const DIRECTION_MAIN = buildSummaryWritingDirection(MAIN);
const adapt = adaptMdSummaryWritingToAiQuestion(
  snappedMain.question,
  MAIN,
  DIRECTION_MAIN,
  "INTERMEDIATE",
);
check("어댑터: 성공", adapt.ok === true, adapt.error);
const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
check("어댑터: direction = 결정론 합성 발문", ai.direction === DIRECTION_MAIN, String(ai.direction));
check(
  "어댑터: 발문이 [보기]·[해석]을 지시하고 실제 필드도 존재",
  String(ai.direction).includes("[보기]") &&
    String(ai.direction).includes("[해석]") &&
    Array.isArray(ai.wordBank) &&
    typeof ai.koreanGloss === "string",
);
check(
  "어댑터: options 키 자체가 없다(correct-answer-mismatch 회귀 방지)",
  !("options" in ai),
);
check(
  "어댑터: 이물 필드 없음(blankGlosses·firstLetterHint·passageWithBlank)",
  !("blankGlosses" in ai) &&
    !("passageWithBlank" in ai) &&
    !("originalExpression" in ai) &&
    !(ai.blanks as Array<Record<string, unknown>>)[0].firstLetterHint,
);
check(
  "어댑터: blanks 라벨 (A) 괄호 대문자 고정(채점 키 축)",
  (ai.blanks as Array<Record<string, unknown>>)[0].label === "(A)",
);
check(
  "어댑터: correctAnswer = modelAnswer",
  ai.correctAnswer === ai.modelAnswer && String(ai.modelAnswer).startsWith("Collecting data"),
  String(ai.correctAnswer),
);
check(
  "어댑터: 설정 메타 8종 복제",
  ai.wordBankPolicy === "usePartial" &&
    ai.wordBankFidelity === "verbatim" &&
    ai.blankAssignment === MAIN.blankAssignment &&
    ai.clueMode === "none" &&
    ai.targetWordsMode === "approx" &&
    ai.connectorFrame === "partial" &&
    ai.summarySourceMode === "paraphrase" &&
    ai.sourceSentenceParaphrase === false,
);
check(
  "어댑터: scoringMode 매핑 keyword→LEMMA",
  ai.scoringMode === "LEMMA",
  String(ai.scoringMode),
);
check(
  "어댑터: targetWordCount = 설정 복제(7)",
  (ai.blanks as Array<Record<string, unknown>>)[0].targetWordCount === 7,
);
check(
  "어댑터: wordBankDistractors 는 wordBank 의 부분집합(파생)",
  (ai.wordBankDistractors as string[]).every((d) => (ai.wordBank as string[]).includes(d)),
);
check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);

const pp = postProcessQuestion("SUMMARY_WRITING", PASSAGE, ai as never);
check("후처리: PASSTHROUGH 성공", pp.success === true, pp.error);
const ppData = (pp.data ?? {}) as Record<string, unknown>;
check(
  "후처리: 어댑터 산출이 무손실 통과(요약문·정답·발문)",
  ppData.summaryWithBlanks === ai.summaryWithBlanks &&
    ppData.modelAnswer === ai.modelAnswer &&
    ppData.direction === ai.direction,
);
check("후처리: 지문 필드를 만들어 주지 않는다(어댑터가 완제품)", !("passageWithBlank" in ppData));

const issues = validateQuestionQuality({
  typeId: "SUMMARY_WRITING",
  question: { ...ppData, _typeId: "SUMMARY_WRITING", difficulty: "INTERMEDIATE" },
  passage: PASSAGE,
  requestedDifficulty: "INTERMEDIATE",
  ...SUMMARY_WRITING_MD_LANE.qualityArgs({
    passage: PASSAGE,
    difficulty: "INTERMEDIATE",
    rawDifficulty: "INTERMEDIATE",
    resolved: {},
    rawTypeSettings: RAW_MAIN,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
  }),
});
const errors = issues.filter((i) => i.severity === "error");
check("품질검증: error 0건", errors.length === 0, errors.map((e) => e.code).join(" / "));

// KILLER(보기 없음·2빈칸) 도 동일 왕복
{
  const kAdapt = adaptMdSummaryWritingToAiQuestion(
    killerRun.question,
    KILLER,
    buildSummaryWritingDirection(KILLER),
    "KILLER",
  );
  check("어댑터(KILLER): 성공", kAdapt.ok === true, kAdapt.error);
  const kAi = (kAdapt.aiQuestion ?? {}) as Record<string, unknown>;
  check("어댑터(KILLER): 보기 off → wordBank 키 없음", !("wordBank" in kAi) && !("wordBankDistractors" in kAi));
  check("어댑터(KILLER): gloss off → koreanGloss 키 없음", !("koreanGloss" in kAi));
  check("어댑터(KILLER): hidden → targetWordCount 미탑재", !(kAi.blanks as Array<Record<string, unknown>>)[0].targetWordCount);
  check("어댑터(KILLER): scoringMode 매핑 rubric→LLM_RUBRIC", kAi.scoringMode === "LLM_RUBRIC");
  check("어댑터(KILLER): 채점기준 2줄 탑재", (kAi.scoringCriteria as string[])?.length === 2);
  const kPp = postProcessQuestion("SUMMARY_WRITING", PASSAGE, kAi as never);
  const kIssues = validateQuestionQuality({
    typeId: "SUMMARY_WRITING",
    question: { ...(kPp.data as Record<string, unknown>), difficulty: "KILLER" },
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
  }).filter((i) => i.severity === "error");
  check("품질검증(KILLER): error 0건", kIssues.length === 0, kIssues.map((e) => e.code).join(" / "));
}

// 어댑터 방어 — 형상이 깨진 입력은 ok:false
check(
  "어댑터: 요약문 없으면 실패",
  adaptMdSummaryWritingToAiQuestion(
    { ...snappedMain.question, summary: "" },
    MAIN,
    DIRECTION_MAIN,
    "INTERMEDIATE",
  ).ok === false,
);
check(
  "어댑터: 빈칸 정답 없으면 실패",
  adaptMdSummaryWritingToAiQuestion(
    { ...snappedMain.question, blanks: [] },
    MAIN,
    DIRECTION_MAIN,
    "INTERMEDIATE",
  ).ok === false,
);

// ───────────────────────────────────────────────────────────────────────────
// 7. 채점 왕복 — buildAnswerSpec → gradeAnswer (이 계열의 핵심 축)
// ───────────────────────────────────────────────────────────────────────────
const scorable = {
  id: "q1",
  type: "ENGLISH",
  subType: "SUMMARY_WRITING",
  options: null,
  correctAnswer: String(ppData.correctAnswer ?? ""),
  structuredData: ppData,
  sourcePassageContent: PASSAGE,
  points: 3,
};
const spec = buildAnswerSpec(scorable);
check("채점: inputKind TEXT_SINGLE", spec.inputKind === "TEXT_SINGLE", spec.inputKind);
check("채점: textMode LEMMA(scoringGranularity=keyword)", spec.textMode === "LEMMA", String(spec.textMode));
check(
  "채점: 입력 키가 blanks[].label 원문 '(A)'",
  spec.fields?.[0].key === "(A)",
  String(spec.fields?.[0].key),
);
check(
  "채점: 허용 정답 집합에 정답 + 동치가 병합",
  (spec.fields?.[0].answers ?? []).length === 2,
  JSON.stringify(spec.fields?.[0].answers),
);
check(
  "채점: 표제어 4개 탑재",
  (spec.fields?.[0].lemmas ?? []).join(",") === "collecting,data,sample,size",
  JSON.stringify(spec.fields?.[0].lemmas),
);
check(
  "채점: 정답 그대로 → CORRECT",
  gradeAnswer(spec, { texts: { "(A)": "Collecting data without increasing the sample size" } }).status ===
    "CORRECT",
);
check(
  "채점: 대소문자·문말 구두점 차이 흡수 → CORRECT",
  gradeAnswer(spec, { texts: { "(A)": "collecting data without increasing the sample size." } }).status ===
    "CORRECT",
);
check(
  "채점: 동치 정답 → CORRECT",
  gradeAnswer(spec, { texts: { "(A)": "Gathering data without increasing the sample size" } }).status ===
    "CORRECT",
);
check(
  "채점: 표제어 전부 포함한 변형 → NEEDS_REVIEW(사람 확인)",
  gradeAnswer(spec, { texts: { "(A)": "collecting data from a sample of the same size" } }).status ===
    "NEEDS_REVIEW",
);
check(
  "채점: 표제어 미충족 → WRONG",
  gradeAnswer(spec, { texts: { "(A)": "expanding the pool of volunteers" } }).status === "WRONG",
);
check("채점: 미입력 → WRONG", gradeAnswer(spec, { texts: { "(A)": "" } }).status === "WRONG");
// 2빈칸(부분점수) — KILLER 는 LLM_RUBRIC 이라 MANUAL_ONLY 로 강등된다.
{
  const kAdapt = adaptMdSummaryWritingToAiQuestion(
    killerRun.question,
    KILLER,
    buildSummaryWritingDirection(KILLER),
    "KILLER",
  );
  const kSpec = buildAnswerSpec({
    ...scorable,
    id: "q2",
    structuredData: kAdapt.aiQuestion,
    correctAnswer: String((kAdapt.aiQuestion ?? {}).correctAnswer ?? ""),
    points: 4,
  });
  check(
    "채점(KILLER): LLM_RUBRIC → MANUAL_ONLY 강등",
    kSpec.inputKind === "MANUAL_ONLY",
    kSpec.inputKind,
  );
  check(
    "채점(KILLER): MANUAL_ONLY 는 항상 NEEDS_REVIEW",
    gradeAnswer(kSpec, { texts: {} }).status === "NEEDS_REVIEW",
  );
}
// keyword 채점 + 2빈칸이면 부분점수가 살아난다.
{
  const partialSettings = resolveSummaryWritingSettings(
    { ...RAW_KILLER, scoringGranularity: "keyword" },
    "KILLER",
  );
  const run = pipeline(GOOD_KILLER, partialSettings);
  const pAdapt = adaptMdSummaryWritingToAiQuestion(
    run.question,
    partialSettings,
    buildSummaryWritingDirection(partialSettings),
    "KILLER",
  );
  const pSpec = buildAnswerSpec({
    ...scorable,
    id: "q3",
    structuredData: pAdapt.aiQuestion,
    correctAnswer: "",
    points: 4,
  });
  check("채점(2빈칸): TEXT_MULTI + partialCredit", pSpec.inputKind === "TEXT_MULTI" && pSpec.partialCredit === true);
  check(
    "채점(2빈칸): 키가 (A)·(B)",
    (pSpec.fields ?? []).map((f) => f.key).join(",") === "(A),(B)",
    (pSpec.fields ?? []).map((f) => f.key).join(","),
  );
  check(
    "채점(2빈칸): 둘 다 정답 → CORRECT 만점",
    gradeAnswer(pSpec, {
      texts: {
        "(A)": "Adding records to a sampling frame that never widens",
        "(B)": "its distance from the population it claims to describe",
      },
    }).earnedPoints === 4,
  );
  check(
    "채점(2빈칸): 하나만 정답 + 나머지 표제어 미충족 → PARTIAL",
    gradeAnswer(pSpec, {
      texts: {
        "(A)": "Adding records to a sampling frame that never widens",
        "(B)": "zzz qqq",
      },
    }).status === "PARTIAL",
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. 레인 계약 — 과금 축(이중청구 회귀 방지) · 적격성 · 파이프라인
// ───────────────────────────────────────────────────────────────────────────
function laneCtx(raw: Record<string, unknown>, difficulty: "BASIC" | "INTERMEDIATE" | "KILLER"): MdLaneContext {
  return {
    passage: PASSAGE,
    difficulty,
    rawDifficulty: difficulty,
    resolved: resolveQuestionTypeGenerationSettings(
      "SUMMARY_WRITING",
      raw,
      difficulty,
    ) as unknown as Record<string, unknown>,
    rawTypeSettings: raw,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
  };
}
check("레인: subType SUMMARY_WRITING", SUMMARY_WRITING_MD_LANE.subType === "SUMMARY_WRITING");
check(
  "레인: 과금 QUESTION_GEN_SINGLE — fast VOCAB_TYPES 밖(이중청구 회귀 방지)",
  SUMMARY_WRITING_MD_LANE.operationType === "QUESTION_GEN_SINGLE" &&
    CREDIT_COSTS.QUESTION_GEN_SINGLE === CREDIT_COSTS.QUESTION_GEN_SINGLE,
  String(SUMMARY_WRITING_MD_LANE.operationType),
);
check("레인: retryEligible", SUMMARY_WRITING_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 1~3 · 범위 밖 거부",
  SUMMARY_WRITING_MD_LANE.isEligible({ summaryWritingBlankCount: 1 }) &&
    SUMMARY_WRITING_MD_LANE.isEligible({ summaryWritingBlankCount: 3 }) &&
    SUMMARY_WRITING_MD_LANE.isEligible({}) &&
    !SUMMARY_WRITING_MD_LANE.isEligible({ summaryWritingBlankCount: 4 }) &&
    !SUMMARY_WRITING_MD_LANE.isEligible({ summaryWritingBlankCount: 0 }),
);
check(
  "레인: diversityTargets = blanks[].answer",
  SUMMARY_WRITING_MD_LANE.diversityTargets({
    blanks: [{ answer: "Collecting data" }, { answer: "the sample size" }],
  }).join("|") === "Collecting data|the sample size",
);
{
  const ctx = laneCtx(RAW_MAIN, "INTERMEDIATE");
  const laneParsed = SUMMARY_WRITING_MD_LANE.parseAndGate(GOOD, ctx);
  check("레인: parseAndGate 클린", laneParsed.gateIssues.length === 0, laneParsed.gateIssues.join(" / "));
  const laneAdapt = SUMMARY_WRITING_MD_LANE.adapt(laneParsed, ctx);
  check("레인: adapt 성공", laneAdapt.ok === true, laneAdapt.error);
  check(
    "레인: adapt direction 이 resolved 발문과 동일",
    laneAdapt.aiQuestion?.direction ===
      (ctx.resolved as { summaryWritingDirection?: string }).summaryWritingDirection,
  );
  check(
    "레인: qualityArgs 는 stemLanguage 만(전용 슬롯 없음)",
    Object.keys(SUMMARY_WRITING_MD_LANE.qualityArgs(ctx)).join(",") === "stemLanguage",
    Object.keys(SUMMARY_WRITING_MD_LANE.qualityArgs(ctx)).join(","),
  );
  const format = SUMMARY_WRITING_MD_LANE.mdFormat(ctx);
  check(
    "레인: mdFormat 이 설정 실값 + 파생 목록 보고",
    format.blankCount === 1 &&
      format.wordBankUsage === "usePartial" &&
      Array.isArray(format.derived) &&
      (format.derived as string[]).includes("modelAnswer"),
    JSON.stringify(format),
  );
  check("레인: buildExtras 는 기본 설정에서 비어 있다", SUMMARY_WRITING_MD_LANE.buildExtras(ctx).length === 0);
  check(
    "레인: stemLanguage=en 이면 언어 블록 1개",
    SUMMARY_WRITING_MD_LANE.buildExtras(
      laneCtx({ ...RAW_MAIN, stemLanguage: "en" }, "INTERMEDIATE"),
    ).length === 1,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 9. 프롬프트 — 난이도 3분기 · 형식 리터럴 · 설정 집행
// ───────────────────────────────────────────────────────────────────────────
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const s = resolveSummaryWritingSettings({ ...RAW_MAIN, difficulty: d }, d);
  const p = buildMdSummaryWritingPrompt(PASSAGE, s, buildSummaryWritingDirection(s), "full", d);
  check(
    `프롬프트 ${d}: 난이도 분기 + 형식 리터럴 + 지문 포함`,
    p.includes("## 표적 설계") &&
      p.includes("정답(A):") &&
      p.includes("핵심어(A):") &&
      p.includes("## 지문") &&
      p.includes(PASSAGE.slice(0, 40)),
  );
}
{
  const basic = resolveSummaryWritingSettings({ difficulty: "BASIC" }, "BASIC");
  const inter = resolveSummaryWritingSettings({ difficulty: "INTERMEDIATE" }, "INTERMEDIATE");
  const killer = resolveSummaryWritingSettings({ difficulty: "KILLER" }, "KILLER");
  const pb = buildMdSummaryWritingPrompt(PASSAGE, basic, buildSummaryWritingDirection(basic), "full", "BASIC");
  const pi = buildMdSummaryWritingPrompt(PASSAGE, inter, buildSummaryWritingDirection(inter), "full", "INTERMEDIATE");
  const pk = buildMdSummaryWritingPrompt(PASSAGE, killer, buildSummaryWritingDirection(killer), "full", "KILLER");
  check("프롬프트: BASIC 은 재배열 영작 서사", pb.includes("재배열 영작"));
  check("프롬프트: INTERMEDIATE 는 미끼+배분 서사", pi.includes("배분 판단"));
  check("프롬프트: KILLER 는 상위 층위 추론 서사", pk.includes("KILLER 의 생명"));
  check("프롬프트: BASIC useAll → 전량 사용 지시", pb.includes("useAll"));
  check("프롬프트: KILLER 는 해석 미제공 지시", pk.includes("## 해석 상자 (교사 설정: 없음)"));
  check("프롬프트: KILLER inflected 어형 변형 지시", pk.includes("inflected"));
  check("프롬프트: KILLER hidden 목표 단어수 비노출", pk.includes("학생에게 알리지 않는다"));
  check("프롬프트: KILLER rubric 채점기준 요구", pk.includes("항목별 배점"));
  check("프롬프트: BASIC 은 (B) 라벨을 요구하지 않는다", !pb.includes("정답(B):"));
  // ⚠ 숫자 노브(blankCount·boxDistractors·targetWordsPerBlank)는 프리셋이 아니라
  //   NumericSettingSpec 기본값에서 온다(summary-writing.ts:217-238 readNumericSetting).
  //   즉 난이도만 바꿔서는 빈칸이 2개가 되지 않는다 — 명시 설정이 있어야 한다.
  const inter2 = resolveSummaryWritingSettings(
    { difficulty: "INTERMEDIATE", blankCount: 2 },
    "INTERMEDIATE",
  );
  const pi2 = buildMdSummaryWritingPrompt(
    PASSAGE,
    inter2,
    buildSummaryWritingDirection(inter2),
    "full",
    "INTERMEDIATE",
  );
  check("프롬프트: blankCount=2 면 (B) 라벨까지 요구", pi2.includes("정답(B):"));
  check(
    "프롬프트: blankCount=2 면 발문 라벨도 (A), (B)",
    buildSummaryWritingDirection(inter2).includes("(A), (B)"),
  );
  check(
    "프롬프트: 확정 발문을 그대로 실어 준다",
    pi.includes(buildSummaryWritingDirection(inter)),
  );
}
check(
  "프롬프트: 모범답안·미끼·연결틀 줄을 요구하지 않는다(철칙1 단순화 계약)",
  (() => {
    const p = buildMdSummaryWritingPrompt(PASSAGE, MAIN, DIRECTION_MAIN, "full", "INTERMEDIATE");
    return !p.includes("모범답안:") && !p.includes("미끼:") && !p.includes("연결틀");
  })(),
);
check(
  "프롬프트: 선지 금지 명시(서술형)",
  buildMdSummaryWritingPrompt(PASSAGE, MAIN, DIRECTION_MAIN, "full", "KILLER").includes("선지(①②③④⑤)를 만들지 마라"),
);
check(
  "프롬프트: 보기 off 설정이면 보기 줄을 요구하지 않는다",
  !buildMdSummaryWritingPrompt(PASSAGE, KILLER, buildSummaryWritingDirection(KILLER), "full", "KILLER").includes(
    "보기: <칩1",
  ),
);

// ───────────────────────────────────────────────────────────────────────────
// 10. 적대검수 1기 지적 회귀 픽스처 (wave2 — critical 2 · major 3 + 지배적 결함 계통)
// ───────────────────────────────────────────────────────────────────────────

// ── W1 (critical): usePartial + boxDistractors 기본값 0 → "미끼 정확히 0개" 명령 후
//    그 결과를 반려하던 결정론적 실패. 숫자 노브는 난이도 프리셋을 타지 않아 전 난이도
//    기본값이 0 이다(NumericSettingSpec.defaultValue).
const DEFAULT_INT = resolveSummaryWritingSettings({}, "INTERMEDIATE");
check(
  "W1 전제: 기본 INTERMEDIATE 는 usePartial + boxDistractors 0",
  DEFAULT_INT.wordBankUsage === "usePartial" && DEFAULT_INT.boxDistractors === 0,
  `${DEFAULT_INT.wordBankUsage}/${DEFAULT_INT.boxDistractors}`,
);
check(
  "W1: 미끼 요구량 바닥이 1(0 명령 금지) · 설정값이 크면 그대로",
  summaryWritingDistractorNeed({ boxDistractors: 0 }) === 1 &&
    summaryWritingDistractorNeed({ boxDistractors: 2 }) === 2,
);
{
  const p = buildMdSummaryWritingPrompt(
    PASSAGE,
    DEFAULT_INT,
    buildSummaryWritingDirection(DEFAULT_INT),
    "full",
    "INTERMEDIATE",
  );
  check(
    "W1: 프롬프트가 '미끼 0개' 를 명령하지 않는다(지시·자기검산 양쪽)",
    !p.includes("미끼 칩을 정확히 0개") &&
      !p.includes("남는 칩이 정확히 0개") &&
      p.includes("미끼 칩을 1개 이상"),
  );
  // 지시를 100% 따른 정상 산출물(미끼 2개)이 기본 설정에서 게이트 클린이어야 한다.
  check(
    "W1: 기본 설정(boxDistractors=0)에서 정상 입력이 게이트 클린",
    pipeline(GOOD, DEFAULT_INT).issues.length === 0,
    pipeline(GOOD, DEFAULT_INT).issues.join(" / "),
  );
  // 반대로 미끼가 0개면(= 전 칩이 정답 소속) 자리를 지목해 반려한다.
  const noDistractor = GOOD.replace(
    /^보기:.*$/m,
    "보기: without / sample / collecting / size / the / increasing / data",
  );
  check(
    "W1: 기본 설정에서도 미끼 0개는 반려 + 필요 개수 지목",
    pipeline(noDistractor, DEFAULT_INT).issues.some(
      (i) => i.includes("미끼 칩이 0개") && i.includes("최소 1개"),
    ),
    pipeline(noDistractor, DEFAULT_INT).issues.join(" / "),
  );
}

// ── W2 (critical): 쉼표를 품은 단일 동치가 반쪽 두 개로 분해돼 만점 정답 집합에 실림.
const W2_VARIANT = "Not only collecting more data, but also leaving the sample size fixed";
const W2_MD = GOOD.replace(
  "동치(A): Gathering data without increasing the sample size",
  `동치(A): ${W2_VARIANT}`,
);
{
  const parsedW2 = parseMdSummaryWriting(W2_MD);
  check(
    "W2: 쉼표를 품은 동치가 한 덩어리로 유지된다(쉼표 분해 금지)",
    parsedW2.blanks[0].variants.length === 1 &&
      parsedW2.blanks[0].variants[0] === W2_VARIANT,
    JSON.stringify(parsedW2.blanks[0].variants),
  );
  const run = pipeline(W2_MD, MAIN);
  check("W2: 게이트 클린", run.issues.length === 0, run.issues.join(" / "));
  const w2Adapt = adaptMdSummaryWritingToAiQuestion(
    run.question,
    MAIN,
    DIRECTION_MAIN,
    "INTERMEDIATE",
  );
  const w2Spec = buildAnswerSpec({
    ...scorable,
    id: "w2",
    structuredData: w2Adapt.aiQuestion,
    correctAnswer: String((w2Adapt.aiQuestion ?? {}).correctAnswer ?? ""),
  });
  check(
    "W2: 허용 정답 집합이 2개(정답 + 동치 1) — 조각 3개가 아니다",
    (w2Spec.fields?.[0].answers ?? []).length === 2,
    JSON.stringify(w2Spec.fields?.[0].answers),
  );
  check(
    "W2: 동치의 반쪽만 쓴 답은 만점이 아니다(과거 CORRECT 오채점)",
    gradeAnswer(w2Spec, { texts: { "(A)": "but also leaving the sample size fixed" } })
      .status !== "CORRECT",
  );
  check(
    "W2: 동치 전문은 여전히 CORRECT",
    gradeAnswer(w2Spec, { texts: { "(A)": W2_VARIANT } }).status === "CORRECT",
  );
}
check(
  "W2: ` / ` 구분자는 그대로 다중 동치로 갈라진다",
  parseMdSummaryWriting(
    GOOD.replace(
      "동치(A): Gathering data without increasing the sample size",
      "동치(A): Gathering data without increasing the sample size / Amassing records without widening the frame",
    ),
  ).blanks[0].variants.length === 2,
);
check(
  "W2: `동치(A):` 줄을 여러 번 쓰면 누적된다(줄을 늘리는 정본 계약)",
  parseMdSummaryWriting(
    GOOD.replace(
      "동치(A): Gathering data without increasing the sample size",
      "동치(A): Gathering data without increasing the sample size\n동치(A): Amassing records without widening the frame",
    ),
  ).blanks[0].variants.length === 2,
);
check(
  "W2: 조각처럼 짧은 동치는 게이트가 반려(2차 방어선)",
  gateMdSummaryWriting(
    {
      ...snappedMain.question,
      blanks: [{ ...snappedMain.question.blanks[0], variants: ["the sample size"] }],
    },
    PASSAGE,
    gateOptions(MAIN),
  ).some((i) => i.includes("조각으로 보임")),
);

// ── W3 (major): 보기 칩을 불릿 목록으로 낸 드리프트를 흡수 못 해 쓰레기 칩이 출하됨.
const W3_CHIPS = "보기: without / sample / expanding / collecting / size / the / reducing / increasing / data";
for (const [name, replacement] of [
  [
    "쉼표 섞인 불릿 목록",
    "보기:\n- without, sample, expanding\n- collecting, size, the\n- reducing, increasing, data",
  ],
  [
    "쉼표 없는 불릿 목록",
    "보기:\n- without\n- sample\n- expanding\n- collecting\n- size\n- the\n- reducing\n- increasing\n- data",
  ],
  [
    "번호 목록",
    "보기:\n1. without\n2. sample\n3. expanding\n4. collecting\n5. size\n6. the\n7. reducing\n8. increasing\n9. data",
  ],
  ["슬래시 목록 줄바꿈", "보기:\nwithout / sample / expanding\ncollecting / size / the\nreducing / increasing / data"],
] as [string, string][]) {
  const run = pipeline(GOOD.replace(W3_CHIPS, replacement), MAIN);
  check(
    `W3 드리프트 관용: 보기 ${name} → 칩 9개 · 잔재 0 · 게이트 클린`,
    run.question.chips.length === 9 &&
      run.question.chips.every((c) => !/(^|\s)[-*•](\s|$)/.test(c)) &&
      run.issues.length === 0,
    `${JSON.stringify(run.question.chips)} · ${run.issues.join(" / ")}`,
  );
}
check(
  "W3: 칩에 불릿 잔재가 남으면 게이트가 자리를 지목(최종 방어)",
  gateMdSummaryWriting(
    { ...snappedMain.question, chips: ["- collecting", "data", "expanding"] },
    PASSAGE,
    gateOptions(MAIN),
  ).some((i) => i.includes("불릿·번호 잔재")),
);

// ── W4 (major): 표제어 원형(정본 fast 계약)을 접두 비교가 못 붙여 정상 출력을 반려.
const W4_MD = `요약문: The study looks sharper because researchers keep (A) that never grows.
해석: 표본 틀은 그대로 둔 채 관측만 늘린다는 뜻입니다.
보기: increasing / observations / without / widening / the / frame / expanding / reducing

정답(A): increasing observations without widening the frame
핵심어(A): increase, observation, frame

채점기준:
- 관측 증가가 드러나면 1점입니다.
해설: 이 글은 관측만 늘리는 방식의 한계를 말합니다. 따라서 빈칸에는 틀을 넓히지 않고 관측만 늘리는 행위가 들어가야 합니다.`;
{
  const run = pipeline(W4_MD, MAIN);
  check(
    "W4: -e 동사 원형 표제어(increase)를 정답 표면형(increasing)으로 스냅",
    run.question.blanks[0].lemmas.join(",") === "increasing,observations,frame",
    run.question.blanks[0].lemmas.join(","),
  );
  check("W4: 그 결과 게이트 클린(과거 결정론 반려)", run.issues.length === 0, run.issues.join(" / "));
}
{
  // 일부만 못 붙으면 드롭 + 기록(반려 아님).
  const run = pipeline(W4_MD.replace("핵심어(A): increase, observation, frame", "핵심어(A): increase, zzz, frame"), MAIN);
  check(
    "W4: 대응 형태가 없는 표제어는 드롭 + corrections 기록(반려 아님)",
    run.question.blanks[0].lemmas.join(",") === "increasing,frame" &&
      run.corrections.some((c) => c.includes("드롭")) &&
      run.issues.length === 0,
    `${run.question.blanks[0].lemmas.join(",")} · ${run.corrections.join(" / ")} · ${run.issues.join(" / ")}`,
  );
}
{
  // 전부 못 붙으면 원본을 남겨 게이트가 자리를 지목한다(철칙 3 — 조용히 버리지 않는다).
  const run = pipeline(W4_MD.replace("핵심어(A): increase, observation, frame", "핵심어(A): zzz, qqq"), MAIN);
  check(
    "W4: 표제어 전부가 미대응이면 게이트가 자리를 지목",
    run.issues.some((i) => i.includes("핵심어(A)") && i.includes("정답 어구에 없는 형태")),
    run.issues.join(" / "),
  );
}
{
  const noLemma = GOOD.replace(/^핵심어\(A\):.*$/m, "");
  const exactS = resolveSummaryWritingSettings({ ...RAW_MAIN, scoringGranularity: "exact" }, "INTERMEDIATE");
  const rubricS = resolveSummaryWritingSettings({ ...RAW_MAIN, scoringGranularity: "rubric" }, "INTERMEDIATE");
  check(
    "W4: 핵심어 필수화는 LEMMA 채점(keyword)일 때만 — exact/rubric 은 반려 없음",
    !gateOf(noLemma, exactS).some((i) => i.includes("핵심어(A) 누락")) &&
      !gateOf(noLemma, rubricS).some((i) => i.includes("핵심어(A) 누락")) &&
      gateOf(noLemma, MAIN).some((i) => i.includes("핵심어(A) 누락")),
    `${gateOf(noLemma, exactS).join(" / ")} || ${gateOf(noLemma, rubricS).join(" / ")}`,
  );
}

// ── W5 (major): 요약문 블록이 뒤따르는 비섹션 줄을 흡수 / 괄호 없는 라벨 드리프트 소실.
{
  const noted = GOOD.replace(
    /^해석:/m,
    "(Note: the blank must be filled with a gerund phrase of about seven words.)\n해석:",
  );
  const run = pipeline(noted, MAIN);
  check(
    "W5: 요약문 뒤 영어 메모를 흡수하지 않는다(학생 화면·모범답안 오염 차단)",
    run.question.summary === "(A), which can lead to greater bias in the result." &&
      run.issues.length === 0,
    `'${run.question.summary}' · ${run.issues.join(" / ")}`,
  );
}
{
  const noted = GOOD.replace(
    /^해석:/m,
    "Note that the blank takes a gerund phrase.\n해석:",
  );
  check(
    "W5: 콜론 없는 뒤따르는 문장도 흡수하지 않는다(문장 종결로 닫음)",
    pipeline(noted, MAIN).question.summary === "(A), which can lead to greater bias in the result.",
    pipeline(noted, MAIN).question.summary,
  );
}
{
  const bareLabel = GOOD.replace("정답(A):", "정답 A:")
    .replace("동치(A):", "동치 A:")
    .replace("핵심어(A):", "핵심어 A:");
  const run = pipeline(bareLabel, MAIN);
  check(
    "W5: 괄호 없는 라벨(`정답 A:`)을 파서가 흡수 — 과거 '빈칸 0개' 오진",
    run.question.blanks.length === 1 &&
      run.question.blanks[0].label === "(A)" &&
      run.question.blanks[0].answer.startsWith("Collecting data") &&
      run.question.blanks[0].variants.length === 1 &&
      run.question.blanks[0].lemmas.length === 4 &&
      run.issues.length === 0,
    `${JSON.stringify(run.question.blanks)} · ${run.issues.join(" / ")}`,
  );
}
check(
  "W5: 그래도 요약문에 섹션 줄이 섞이면 게이트가 자리를 지목",
  gateMdSummaryWriting(
    {
      ...snappedMain.question,
      summary: "(A), which can lead to greater bias. 정답 A: Collecting data",
    },
    PASSAGE,
    gateOptions(MAIN),
  ).some((i) => i.includes("다른 섹션 줄이 섞여 있음")),
);

// ── W6 (지배적 결함 계통): 키워드 줄 무관용 — 굵게·전각콜론·불릿·표 파이프.
//    선지·데이터 줄만 관대하면 `- 해설:` 이 통째로 사라지고 게이트가 "해설 누락" 이라는
//    **사실과 다른 원인**을 재생성 프롬프트에 실어 보낸다(프로덕션 2회 사고 계통).
for (const [name, from, to] of [
  ["해설 불릿", "해설:", "- 해설:"],
  ["해설 굵게", "해설:", "**해설:**"],
  ["해설 굵게(콜론 밖)", "해설:", "**해설**:"],
  ["해설 표 파이프", "해설:", "| 해설:"],
  ["해설 전각콜론", "해설:", "해설："],
  ["요약문 굵게", "요약문:", "**요약문:**"],
  ["요약문 불릿", "요약문:", "- 요약문:"],
  ["해석 굵게", "해석:", "**해석:**"],
  ["해석 전각콜론", "해석:", "해석："],
  ["보기 굵게", "보기:", "**보기:**"],
  ["보기 불릿", "보기:", "- 보기:"],
  ["채점기준 굵게", "채점기준:", "**채점기준:**"],
  ["채점기준 전각콜론", "채점기준:", "채점기준："],
] as [string, string, string][]) {
  const run = pipeline(GOOD.replace(from, to), MAIN);
  check(
    `W6 키워드 줄 관용: ${name}`,
    run.question.summary.startsWith("(A),") &&
      run.question.gloss.startsWith("표본의") &&
      run.question.chips.length === 9 &&
      run.question.criteria.length === 2 &&
      run.question.explanation.startsWith("이 글은") &&
      run.issues.length === 0,
    `요약문='${run.question.summary.slice(0, 12)}' 해석='${run.question.gloss.slice(0, 8)}' 칩=${run.question.chips.length} 기준=${run.question.criteria.length} 해설='${run.question.explanation.slice(0, 12)}' · ${run.issues.join(" / ")}`,
  );
}

// ── W7 과잉 절삭 방지: 문장 종결 정지가 "정상 줄바꿈"까지 잘라내면 안 된다.
//    (요약문을 하드랩한 출력이 잘리면 게이트가 "라벨 0회" 라는 또 다른 오진을 낸다.)
{
  const wrapped = GOOD.replace(
    "요약문: (A), which can lead to greater bias in the result.",
    "요약문: (A), which can lead to greater bias\nin the result.",
  ).replace(
    "해설: 이 글은",
    "해설: 첫 문장입니다.\n이 글은",
  );
  const run = pipeline(wrapped, MAIN);
  check(
    "W7: 하드랩된 요약문·해설은 여전히 이어 붙인다(과잉 절삭 없음)",
    run.question.summary === "(A), which can lead to greater bias in the result." &&
      run.question.explanation.startsWith("첫 문장입니다. 이 글은") &&
      run.issues.length === 0,
    `'${run.question.summary}' | '${run.question.explanation.slice(0, 24)}' · ${run.issues.join(" / ")}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// W8 (2차 웨이브): **장식 전수 감사 매트릭스**.
//   파서가 인식하는 키워드 줄 8종 × 장식 8종(굵게 머리/굵게 값/콜론 뒤/언더스코어/
//   쌍 장식/헤딩/인용·불릿/전각콜론+꼬리공백)을 전건 대조한다. 한 칸이라도 뚫리면
//   그 필드가 통째로 사라지고 게이트가 **사실과 다른 원인**을 재생성 프롬프트에 실어
//   보낸다(반의어 프로덕션 2회 사고 계통). 값 손실뿐 아니라 **값 오염**(한쪽 장식만
//   벗겨져 `*(A), which…` 로 저장되는 것)도 같은 계통이라 값 일치까지 본다.
// ═══════════════════════════════════════════════════════════════════════════
const RUBRIC_MAIN = resolveSummaryWritingSettings(
  { ...RAW_MAIN, scoringGranularity: "rubric" },
  "INTERMEDIATE",
);
const W8_BASE = pipeline(GOOD, MAIN).question;
const W8_BASE_RUBRIC = pipeline(GOOD, RUBRIC_MAIN).question;
const W8_PROBES: Record<
  string,
  { line: RegExp; get: (q: MdSummaryWritingQuestion) => string }
> = {
  요약문: { line: /^요약문: (.*)$/m, get: (q) => q.summary },
  해석: { line: /^해석: (.*)$/m, get: (q) => q.gloss },
  보기: { line: /^보기: (.*)$/m, get: (q) => q.chips.join(" | ") },
  "정답(A)": { line: /^정답\(A\): (.*)$/m, get: (q) => q.blanks[0]?.answer ?? "" },
  "동치(A)": {
    line: /^동치\(A\): (.*)$/m,
    get: (q) => (q.blanks[0]?.variants ?? []).join(" | "),
  },
  "핵심어(A)": {
    line: /^핵심어\(A\): (.*)$/m,
    get: (q) => (q.blanks[0]?.lemmas ?? []).join(" | "),
  },
  채점기준: { line: /^채점기준:()$/m, get: (q) => q.criteria.join(" | ") },
  해설: { line: /^해설: (.*)$/m, get: (q) => q.explanation },
};
const W8_DECOS: [string, (head: string, value: string) => string][] = [
  ["굵게머리(콜론 안)", (h, v) => `**${h}:** ${v}`],
  ["굵게머리(콜론 밖)", (h, v) => `**${h}**: ${v}`],
  ["굵게값", (h, v) => `${h}: **${v}**`],
  ["콜론 뒤 한쪽 장식", (h, v) => `${h}: **${v}`],
  ["언더스코어(콜론 안)", (h, v) => `__${h}:__ ${v}`],
  ["언더스코어(콜론 밖)", (h, v) => `__${h}__: ${v}`],
  ["언더스코어 1개", (h, v) => `_${h}:_ ${v}`],
  ["언더스코어 값", (h, v) => `${h}: __${v}__`],
  ["쌍장식 따옴표", (h, v) => `${h}: "${v}"`],
  ["헤딩", (h, v) => `## ${h}: ${v}`],
  ["인용", (h, v) => `> ${h}: ${v}`],
  ["불릿", (h, v) => `- ${h}: ${v}`],
  ["전각콜론", (h, v) => `${h}： ${v}`],
  ["꼬리 공백", (h, v) => `${h}: ${v}   `],
  ["콜론 앞 공백", (h, v) => `${h} : ${v}`],
];
for (const [head, probe] of Object.entries(W8_PROBES)) {
  // 채점기준 줄은 값이 다음 줄부터라 "값 장식" 변형이 의미가 없다(빈 값에 장식만 남는다).
  const decos =
    head === "채점기준"
      ? W8_DECOS.filter((d) => !d[0].includes("값") && !d[0].includes("따옴표"))
      : W8_DECOS;
  for (const [decoName, deco] of decos) {
    const matched = GOOD.match(probe.line);
    const settings = head === "채점기준" ? RUBRIC_MAIN : MAIN;
    const expected = probe.get(head === "채점기준" ? W8_BASE_RUBRIC : W8_BASE);
    const run = pipeline(
      GOOD.replace(probe.line, deco(head, matched?.[1] ?? "").replace(/\$/g, "$$$$")),
      settings,
    );
    check(
      `W8 장식 감사: ${head} × ${decoName}`,
      probe.get(run.question) === expected && run.issues.length === 0,
      `값='${probe.get(run.question)}' 기대='${expected}' · ${run.issues.join(" / ")}`,
    );
  }
}

// W8-b 라벨 자체에 걸린 장식 + 라벨 없는 단일형/혼합 드리프트.
for (const [name, line] of [
  ["맨몸 라벨(괄호 없음)", "정답 A: Collecting data without increasing the sample size"],
  ["라벨 굵게 감쌈", "정답 **(A)**: Collecting data without increasing the sample size"],
  ["라벨 안쪽 굵게", "정답(**A**): Collecting data without increasing the sample size"],
  ["라벨 안쪽 언더스코어", "정답(__A__): Collecting data without increasing the sample size"],
  ["키워드 굵게 + 라벨", "**정답**(A): Collecting data without increasing the sample size"],
  ["키워드 언더스코어 + 라벨", "__정답__(A): Collecting data without increasing the sample size"],
  ["헤딩 + 라벨", "### 정답(A): Collecting data without increasing the sample size"],
  ["인용 + 라벨", "> 정답(A): Collecting data without increasing the sample size"],
  ["인용 + 불릿 + 라벨", "> - 정답(A): Collecting data without increasing the sample size"],
  // 혼합 드리프트: `정답:` 만 맨몸이고 동치·핵심어는 라벨 — 라벨 줄이 하나라도 있으면
  // 맨몸 줄을 안 보던 탓에 값이 멀쩡한 정답 줄이 통째로 버려졌다(게이트는 "받은 값: ''").
  ["맨몸 정답 + 라벨 동치(혼합)", "정답: Collecting data without increasing the sample size"],
] as [string, string][]) {
  const run = pipeline(
    GOOD.replace("정답(A): Collecting data without increasing the sample size", line),
    MAIN,
  );
  check(
    `W8-b 라벨 장식 관용: ${name}`,
    run.question.blanks.length === 1 &&
      run.question.blanks[0].answer ===
        "Collecting data without increasing the sample size" &&
      run.issues.length === 0,
    `${JSON.stringify(run.question.blanks)} · ${run.issues.join(" / ")}`,
  );
}

// W8-c `보기:` 블록 장식 — 줄바꿈 목록·인용·굵게 칩 전부 칩 9개로 회복돼야 한다.
for (const [name, block] of [
  [
    "불릿 목록",
    "보기:\n- without\n- sample\n- expanding\n- collecting\n- size\n- the\n- reducing\n- increasing\n- data",
  ],
  [
    "번호 목록",
    "보기:\n1. without\n2. sample\n3. expanding\n4. collecting\n5. size\n6. the\n7. reducing\n8. increasing\n9. data",
  ],
  [
    "줄바꿈 + 쉼표",
    "보기:\nwithout, sample, expanding\ncollecting, size, the\nreducing, increasing, data",
  ],
  [
    "인용 목록",
    "보기:\n> without / sample / expanding / collecting / size / the / reducing / increasing / data",
  ],
  [
    "굵게 칩",
    "보기: **without** / **sample** / expanding / collecting / size / the / reducing / increasing / data",
  ],
] as [string, string][]) {
  const run = pipeline(GOOD.replace(/^보기:.*$/m, () => block), MAIN);
  check(
    `W8-c 보기 블록 관용: ${name}`,
    run.question.chips.length === 9 && run.issues.length === 0,
    `${JSON.stringify(run.question.chips)} · ${run.issues.join(" / ")}`,
  );
}

// W8-d 통합: **모든 줄에 동시에** 장식이 걸린 출력(모델이 마크다운으로 예쁘게 쓴 형태)이
//   한 건도 흘리지 않고 정본과 같은 값으로 복원되는가 — 한 줄씩 볼 때 통과해도 조합에서
//   깨지면(경계 정규식이 서로 잡아먹으면) 같은 silent-drop 이 재발한다.
const W8D = `## 요약문: **(A), which can lead to greater bias in the result.**
> **해석:** 표본의 틀을 넓히지 않은 채 기록만 늘리면 결과의 편향이 오히려 커질 수 있다는 뜻입니다.
**보기**: without / sample / expanding / collecting / size / the / reducing / increasing / data

- __정답(A):__ Collecting data without increasing the sample size
- **동치(A)**: Gathering data without increasing the sample size
> 핵심어 **(A)**： collecting, data, sample, size

### 채점기준:
> - 의미: 자료 수집과 표본이 함께 드러나면 1점입니다.
- 대조: 표본을 늘리지 않았다는 대조가 드러나면 1점입니다.
**해설:** 이 글은 관측치를 아무리 늘려도 표본의 틀이 고정되어 있으면 편향이 그대로 남는다고 말합니다. 따라서 빈칸에는 표본을 넓히지 않은 채 자료만 모으는 행위가 들어가야 합니다.`;
{
  const run = pipeline(W8D, MAIN);
  const q = run.question;
  check(
    "W8-d 통합: 전 줄 동시 장식(헤딩·인용·불릿·굵게·언더스코어·전각콜론)에서 전 필드 복원",
    q.summary === W8_BASE.summary &&
      q.gloss === W8_BASE.gloss &&
      q.chips.join(" | ") === W8_BASE.chips.join(" | ") &&
      q.blanks.length === 1 &&
      q.blanks[0].answer === W8_BASE.blanks[0].answer &&
      q.blanks[0].variants.join(" | ") === W8_BASE.blanks[0].variants.join(" | ") &&
      q.blanks[0].lemmas.join(" | ") === W8_BASE.blanks[0].lemmas.join(" | ") &&
      q.criteria.length === 2 &&
      q.criteria[0].endsWith("1점입니다.") &&
      q.explanation === W8_BASE.explanation &&
      run.issues.length === 0,
    `${JSON.stringify({
      summary: q.summary,
      gloss: q.gloss.slice(0, 10),
      chips: q.chips.length,
      blanks: q.blanks,
      criteria: q.criteria,
      explanation: q.explanation.slice(0, 12),
    })} · ${run.issues.join(" / ")}`,
  );
}

// ── W9 (2차 지적 재현): 채점기준 **항목**이 `라벨: 값` 형태여도 살아남아야 한다.
//    프롬프트가 "항목별 배점을 한국어로 적어라" 라고 명령하므로 `- 의미: 2점` 은 매우
//    흔한 산출물이다. 산문 블록용 라벨성 가드를 목록에까지 걸었더니 **첫 항목부터**
//    블록이 끊겼다 → rubric 은 "채점기준 누락"(사실과 다른 원인)으로 반려, keyword/exact
//    는 게이트 클린인 채로 루브릭이 저장 문항에서 통째로 소실됐다(어디에도 신호 없음).
for (const [name, first] of [
  ["라벨 콜론", "- 의미: 2점"],
  ["번호 + 라벨 콜론", "1. 의미: 2점"],
  ["전각 콜론", "- 의미： 2점"],
  ["굵게 라벨", "- **의미**: 2점"],
  ["항목 전체 굵게", "- **의미: 2점**"],
  ["항목 언더스코어", "- __의미: 2점__"],
  ["인용 + 불릿", "> - 의미: 2점"],
  ["괄호 배점", "- 의미 정확성 (2점)"],
  ["공백 라벨", "- 핵심 의미 포함: 2점"],
  ["맨몸 라벨", "의미: 2점"],
] as [string, string][]) {
  const drifted = GOOD.replace(
    "- 자료 수집과 표본이 함께 드러나면 1점입니다.\n- 표본을 늘리지 않았다는 대조가 드러나면 1점입니다.",
    `${first}\n- 어순: 1점`,
  );
  for (const [mode, settings] of [
    ["rubric", RUBRIC_MAIN],
    ["keyword", MAIN],
  ] as [string, ResolvedSummaryWritingSettings][]) {
    const run = pipeline(drifted, settings);
    check(
      `W9 채점기준 항목 보존: ${name} [${mode}]`,
      run.question.criteria.length === 2 && run.issues.length === 0,
      `criteria=${JSON.stringify(run.question.criteria)} · ${run.issues.join(" / ")}`,
    );
  }
}

// ── W10: 게이트가 **사실과 다른 원인**을 말하지 않는다.
//    "줄이 없음" 과 "줄은 있는데 값을 못 읽음" 은 모델이 할 일이 정반대다.
{
  const emptyValues = GOOD.replace(/^해설:.*$/m, "해설:").replace(
    "채점기준:\n- 자료 수집과 표본이 함께 드러나면 1점입니다.\n- 표본을 늘리지 않았다는 대조가 드러나면 1점입니다.",
    "채점기준:",
  );
  const run = pipeline(emptyValues, RUBRIC_MAIN);
  check(
    "W10: 빈 값 헤드는 '누락' 이 아니라 '줄은 있으나 값을 읽지 못함'",
    run.issues.some((i) => i.includes("`해설:` 줄은 있으나")) &&
      run.issues.some((i) => i.includes("`채점기준:` 줄은 있으나")),
    run.issues.join(" / "),
  );
}
check(
  "W10: 줄 자체가 없으면 종전대로 '누락' (문구 무회귀)",
  gateOf(GOOD.replace(/^해설:[\s\S]*$/m, "")).some((i) => i === "해설 누락"),
);
{
  // 항목이 `- 정답: 3점` 처럼 섹션 키워드로 시작하면 블록 경계에 걸려 못 읽는다.
  // 그 경우에도 "누락" 이 아니라 **자리를 지목**해야 한다(철칙 5).
  const answery = GOOD.replace(
    "- 자료 수집과 표본이 함께 드러나면 1점입니다.\n- 표본을 늘리지 않았다는 대조가 드러나면 1점입니다.",
    "- 정답: 3점\n- 부분 정답: 2점",
  );
  const run = pipeline(answery, RUBRIC_MAIN);
  check(
    "W10: 항목이 섹션 키워드로 시작하면 자리를 지목한다",
    run.issues.some((i) => i.includes("항목을 하나도 읽지 못함")),
    run.issues.join(" / "),
  );
}

// ── W11: 요약문에 **빈칸 축 밖 라벨**이 남으면 반려.
//    파서의 빈칸 축은 (A)~(C) 고정이라 `정답(D):` 줄은 버려지는데, 요약문에 남은 (D) 는
//    학생 렌더(summaryWritingMaskedSummary 의 `\([A-Z]\)` 치환)가 **채점되지 않는 빈칸**
//    으로 그려 낸다. 게이트가 없으면 그 문항이 클린으로 출하된다(실측).
check(
  "W11: 요약문의 범위 밖 라벨 (D) 반려",
  gateOf(
    GOOD.replace("요약문: (A),", "요약문: (A) or (D),").replace(
      "핵심어(A): collecting, data, sample, size",
      "핵심어(A): collecting, data, sample, size\n정답(D): something nobody scores",
    ),
  ).some((i) => i.includes("설정 범위 밖 라벨") && i.includes("(D)")),
);
check("W11: 정상 요약문은 무회귀(오반려 없음)", gateOf(GOOD).length === 0);

// ── W12: `보기:` 블록에 섞여 든 메모 줄은 칩으로 굳어도 게이트가 자리를 지목한다.
//    (목록 모드의 라벨성 가드를 걷어낸 대가를 게이트가 받는다 — 조용히 버리지 않고
//     지목하는 쪽이 규범이다. 철칙 3·5)
check(
  "W12-b: 한 줄 안의 칩에 붙은 목록 기호는 파서가 흡수(과잉 반려 없음)",
  (() => {
    const run = pipeline(
      GOOD.replace(
        /^보기:.*$/m,
        "보기: - without / - sample / - expanding / - collecting / - size / - the / - reducing / - increasing / - data",
      ),
      MAIN,
    );
    return run.question.chips.length === 9 && run.question.chips[0] === "without" && run.issues.length === 0;
  })(),
);
check(
  "W12: 콜론이 든 칩(메모 혼입)을 지목",
  gateOf(GOOD.replace(/^보기:.*$/m, (m) => `${m}\nNote: chips are shuffled`)).some((i) =>
    i.includes("라벨성 문자열이 섞임"),
  ),
);

// ═══════════════════════════════════════════════════════════════════════════
// W13 (3차 웨이브): 장식 처리를 **공유 유틸(src/lib/md-qgen/decoration.ts)로 단일화**한
//   뒤의 회귀 픽스처. 유형마다 각자 재발명한 처리기가 **각자 다른 부분집합**만 다루던
//   것이 잔여 결함의 근인이었다 — `**` 만 보고 `_` `*` `~~` 백틱을 놓치거나, 한쪽만
//   벗겨 값 말미가 오염되거나, 머리표만 관용하고 값은 그대로 두는 계통.
//   여기서는 ①공유 매트릭스 전 계통 × 전 키워드 줄 ②과잉 세척 금지(본문 강조·본문
//   따옴표 보존) ③머리표 꼬리 개행 함정 ④어댑터 최종 세척을 못 박는다.
// ═══════════════════════════════════════════════════════════════════════════
const W13_DECOS: [string, (head: string, value: string) => string][] = [
  ["백틱 머리", (h, v) => `\`${h}:\` ${v}`],
  ["백틱 값", (h, v) => `${h}: \`${v}\``],
  ["취소선 머리", (h, v) => `~~${h}:~~ ${v}`],
  ["취소선 값", (h, v) => `${h}: ~~${v}~~`],
  ["세겹 강조 머리", (h, v) => `***${h}:*** ${v}`],
  ["세겹 강조 값", (h, v) => `${h}: ***${v}***`],
  ["별표 1개 머리", (h, v) => `*${h}:* ${v}`],
  ["별표 1개 값", (h, v) => `${h}: *${v}*`],
  ["헤딩+굵게+전각콜론", (h, v) => `### **${h}**： ${v}`],
  ["인용+불릿+언더스코어", (h, v) => `> - __${h}:__ ${v}`],
  ["표 파이프 감쌈", (h, v) => `| ${h}: ${v} |`],
];
for (const [head, probe] of Object.entries(W8_PROBES)) {
  // 채점기준은 값이 다음 줄부터라 "값 장식" 변형이 의미가 없다(빈 값에 장식만 남는다).
  const decos =
    head === "채점기준" ? W13_DECOS.filter((d) => !d[0].includes("값")) : W13_DECOS;
  for (const [decoName, deco] of decos) {
    const matched = GOOD.match(probe.line);
    const settings = head === "채점기준" ? RUBRIC_MAIN : MAIN;
    const expected = probe.get(head === "채점기준" ? W8_BASE_RUBRIC : W8_BASE);
    const run = pipeline(
      GOOD.replace(probe.line, deco(head, matched?.[1] ?? "").replace(/\$/g, "$$$$")),
      settings,
    );
    check(
      `W13 공유 장식 매트릭스: ${head} × ${decoName}`,
      probe.get(run.question) === expected && run.issues.length === 0,
      `값='${probe.get(run.question)}' 기대='${expected}' · ${run.issues.join(" / ")}`,
    );
  }
}

// W13-b 과잉 세척 금지 — **본문** 강조는 텍스트만 남기고, **본문** 따옴표는 그대로 둔다.
//   (감싼 따옴표 한 겹만 벗기는 것이 계약이다. 양끝을 무조건 벗기면 `"Green" corridors`
//    같은 정상 문장이 `Green" corridors were once "decoration` 로 저장된다.)
{
  const BODY = `요약문: (A), which is why "precision" and accuracy are *not* the same thing.`;
  const run = pipeline(GOOD.replace(/^요약문: .*$/m, BODY), MAIN);
  check(
    "W13-b 과잉 세척 금지: 본문 강조는 텍스트로 남고 본문 따옴표는 보존된다",
    run.question.summary ===
      `(A), which is why "precision" and accuracy are not the same thing.` &&
      run.issues.length === 0,
    `'${run.question.summary}' · ${run.issues.join(" / ")}`,
  );
}
{
  const q = parseMdSummaryWriting(
    GOOD.replace(
      "해설: 이 글은",
      `해설: 이 지문은 "Green" corridors 처럼 *한때* 장식으로 여겨지던 것을 다룹니다. 이 글은`,
    ),
  );
  check(
    "W13-b 과잉 세척 금지: 해설 본문의 따옴표 보존 · 강조만 제거",
    q.explanation.startsWith(`이 지문은 "Green" corridors 처럼 한때 장식으로`),
    q.explanation.slice(0, 48),
  );
}

// W13-c 머리표 꼬리 개행 함정 — 값이 빈 `정답(A):` 줄이 **다음 줄을 훔치면** 정답이
//   `동치(A): …` 라는 쓰레기가 되고, 훔친 동치 줄은 통째로 사라진다(공유 머리표 정규식을
//   여러 줄 텍스트에 통째로 물렸을 때 실제로 난 회귀 — 반드시 한 줄씩 물려야 한다).
{
  const empty = parseMdSummaryWriting(GOOD.replace(/^정답\(A\):.*$/m, "정답(A):"));
  check(
    "W13-c: 값이 빈 정답 줄이 다음 줄을 훔치지 않는다(동치·핵심어 생존)",
    empty.blanks.length === 1 &&
      empty.blanks[0].answer === "" &&
      empty.blanks[0].variants.length === 1 &&
      empty.blanks[0].lemmas.length === 4,
    JSON.stringify(empty.blanks),
  );
}
{
  const nextLine = GOOD.replace(
    "정답(A): Collecting data without increasing the sample size",
    "정답:\nCollecting data without increasing the sample size",
  ).replace("동치(A):", "동치:").replace("핵심어(A):", "핵심어:");
  const run = pipeline(nextLine, MAIN);
  check(
    "W13-c: 맨몸 `정답:` 값이 다음 줄에 있어도 흡수(공유 readKeywordValue)",
    run.question.blanks[0]?.answer === "Collecting data without increasing the sample size" &&
      run.issues.length === 0,
    `'${run.question.blanks[0]?.answer}' · ${run.issues.join(" / ")}`,
  );
}

// W13-d 빈칸선 경계 — `____`(4개 이상)는 **게이트가 지목해야 할 결함**이라 보존하고,
//   `__값__` 은 마크다운 강조라 벗긴다. 둘을 한 규칙으로 뭉개면 한쪽이 반드시 깨진다.
check(
  "W13-d: 빈칸선은 보존해 게이트가 지목 · 언더스코어 강조는 벗긴다",
  gateOf(GOOD.replace("which can lead", "which can ____ lead")).some((i) =>
    i.includes("밑줄"),
  ) &&
    parseMdSummaryWriting(GOOD.replace(/^요약문: (.*)$/m, "요약문: __$1__")).summary ===
      "(A), which can lead to greater bias in the result.",
  parseMdSummaryWriting(GOOD.replace(/^요약문: (.*)$/m, "요약문: __$1__")).summary,
);

// W13-e 어댑터 최종 세척 — 이 유형은 PASSTHROUGH 라 후처리가 씻어 주지 않는다.
//   파서를 우회해 조립된 입력(다른 호출자·구형 경로)에서도 장식이 학생 표면으로 새면 안 된다.
{
  const dirty: MdSummaryWritingQuestion = {
    ...snappedMain.question,
    summary: "**(A), which can lead to greater bias in the result.**",
    gloss: "`표본을 넓히지 않으면 편향이 커집니다.`",
    chips: ["**without**", "~~sample~~"],
    blanks: [
      {
        label: "(A)",
        answer: "__Collecting data__",
        variants: ["*Gathering data*"],
        lemmas: ["`collecting`"],
      },
    ],
    criteria: ["**의미: 2점**"],
    explanation: "~~이 글은 표본 이야기입니다.~~",
  };
  const out = adaptMdSummaryWritingToAiQuestion(dirty, MAIN, DIRECTION_MAIN, "INTERMEDIATE");
  const dAi = (out.aiQuestion ?? {}) as Record<string, unknown>;
  const dBlank = ((dAi.blanks ?? []) as Array<Record<string, unknown>>)[0] ?? {};
  check(
    "W13-e 어댑터 최종 세척: 저장·표시로 나가는 전 필드에서 장식 소멸",
    out.ok === true &&
      dAi.summaryWithBlanks === "(A), which can lead to greater bias in the result." &&
      dAi.koreanGloss === "표본을 넓히지 않으면 편향이 커집니다." &&
      (dAi.wordBank as string[]).join(",") === "without,sample" &&
      dBlank.answer === "Collecting data" &&
      (dBlank.acceptableVariants as string[]).join(",") === "Gathering data" &&
      (dBlank.requiredLemmas as string[]).join(",") === "collecting" &&
      (dAi.scoringCriteria as string[]).join(",") === "의미: 2점" &&
      dAi.explanation === "이 글은 표본 이야기입니다.",
    JSON.stringify(dAi),
  );
  check(
    "W13-e 어댑터 최종 세척: 모범답안·correctAnswer 도 세척본에서 파생(값 갈림 없음)",
    dAi.modelAnswer === "Collecting data, which can lead to greater bias in the result." &&
      dAi.correctAnswer === dAi.modelAnswer,
    String(dAi.modelAnswer),
  );
  check(
    "W13-e 어댑터: 라벨은 세척 대상이 아니다(채점 입력 키 불변)",
    dBlank.label === "(A)",
    String(dBlank.label),
  );
}

// W13-f 게이트 오염 탐지기도 같은 계통을 흡수한다 — 요약문에 삼켜진 섹션 줄이
//   굵게/백틱으로 장식돼 있으면 못 짚던 자리(자리를 못 짚으면 "빈칸 0개" 같은
//   **사실과 다른 원인**이 그대로 재생성 피드백이 된다).
for (const [name, stray] of [
  ["맨몸", "정답 A: Collecting data"],
  ["굵게(콜론 밖)", "**정답** A: Collecting data"],
  ["굵게(콜론 안)", "**정답 A:** Collecting data"],
  ["백틱", "`정답(A):` Collecting data"],
  ["전각콜론", "정답(A)： Collecting data"],
] as [string, string][]) {
  check(
    `W13-f 게이트 오염 탐지: ${name}`,
    gateMdSummaryWriting(
      {
        ...snappedMain.question,
        summary: `(A), which can lead to greater bias. ${stray}`,
      },
      PASSAGE,
      gateOptions(MAIN),
    ).some((i) => i.includes("다른 섹션 줄이 섞여 있음")),
  );
}
check(
  "W13-f 과잉 반려 금지: 정상 요약문·본문 따옴표는 오염으로 보지 않는다",
  gateMdSummaryWriting(
    {
      ...snappedMain.question,
      summary: `(A), which is why "precision" and accuracy differ in practice.`,
    },
    PASSAGE,
    gateOptions(MAIN),
  ).every((i) => !i.includes("다른 섹션 줄이 섞여 있음")),
);

// W13-g 【계약 개정 26-07-27 · 감독】 채점기준 항목이 섹션 키워드로 **시작만** 해도
//   머리표로 오인돼 뒤의 진짜 섹션 값이 루브릭 조각으로 대체되던 결함(재검증 major)을,
//   머리표 가드(HEAD_CONTENT_GUARD)로 원천 차단했다. 종전 계약은 이 줄을 블록 경계로
//   보고 "항목을 하나도 읽지 못함" 으로 **반려**했는데, `- 정답 어구의 의미가 드러나면 2점`
//   은 프롬프트가 시킨 **정상 루브릭 항목**이다. 반려가 아니라 보존이 옳다
//   (파서는 관대하게 · 게이트는 엄격하게). 콜론 없는 진짜 머리표(`## 해설`)는 그대로 인정된다.
{
  const keywordItem = GOOD.replace(
    "- 자료 수집과 표본이 함께 드러나면 1점입니다.\n- 표본을 늘리지 않았다는 대조가 드러나면 1점입니다.",
    "- 정답 어구의 의미가 드러나면 2점\n- 어순: 1점",
  );
  const run = pipeline(keywordItem, RUBRIC_MAIN);
  check(
    "W13-g: 섹션 키워드로 시작하는 루브릭 항목이 머리표로 오인되지 않고 살아남는다",
    run.question.criteria.length === 2 && run.issues.length === 0,
    `${JSON.stringify(run.question.criteria)} · ${run.issues.join(" / ")}`,
  );
}
for (const [name, first] of [
  ["의미 정확성", "- 의미 정확성이 드러나면 2점"],
  ["대조 서술", "- 표본 대조가 드러나면 2점"],
  ["채점 축 라벨", "- 어순: 2점"],
] as [string, string][]) {
  const run = pipeline(
    GOOD.replace("- 자료 수집과 표본이 함께 드러나면 1점입니다.", first),
    RUBRIC_MAIN,
  );
  check(
    `W13-g 과잉 차단 금지: 섹션 키워드가 아닌 항목명은 그대로 산다 — ${name}`,
    run.question.criteria.length === 2 && run.issues.length === 0,
    `${JSON.stringify(run.question.criteria)} · ${run.issues.join(" / ")}`,
  );
}

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
