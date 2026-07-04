import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// KO 시험지 렌더 행 경계(isSourceLineStart) + KO 봉투 게이트 회귀 스위트.
//   - KO-EN-REG-2: joinRenderedLinesForDisplay keepListBreaks 가 래핑 이어짐 행을
//     리스트로 오탐(문장 중간 강제 개행)하지 않는지 — SUMMARY_COMPLETE "(A) ___" ·
//     "3.5 million" 픽스처.
//   - KO-3/KO-RC-1/KO-RENDER-1: 운문(시) 지문의 원문 행 경계가 웹/HWPX 조인에서
//     전부 보존되는지(래핑 이어짐 행만 공백 병합).
//   - KO-RC-2: _manualEditedFlat 스텁 structuredData 에서 어댑터가 null 로 강등되는지.
//   - KO-RC-7: 지문 첫 행 "〈제1수〉" 가 보기 헤더로 오분류되지 않는지(given 한정).
//   - KO-RENDER-3: 행 경계를 넘는 __밑줄__ 마킹의 행별 균형 정규화.
// TS + "@/..." 앨리어스 → tsx 하니스로 실행해 JSON 요약을 뽑는다(ko-text-core 미러).
const harnessSource = `
import paperUtils from "@/components/exams/paper-builder/paper-item-utils";
import metrics from "@/components/exams/paper-builder/pagination-metrics";
import koAdapter from "@/components/exams/paper-builder/korean/ko-paper-adapter";

const { joinRenderedLinesForDisplay } = paperUtils;
const { textToLinesWithMeta, textToLines } = metrics;
const {
  joinKoStructLines,
  splitKoStructBoxRows,
  balanceKoUnderlineMarkersPerLine,
  koPaperRenderModel,
  koStemForItem,
} = koAdapter;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed += 1;
  else failures.push(detail ? name + " :: " + detail : name);
}

// ── (1) KO-EN-REG-2: 래핑 오탐 회귀 픽스처 ─────────────────────────────────
// SUMMARY_COMPLETE 요약문이 래핑되다 "(A)" 로 시작하는 이어짐 행이 생긴 케이스.
{
  const lines = [
    "The passage suggests that",
    "(A) ______ can trigger",
    "(B) ______ in the brain.",
  ];
  const flagged = joinRenderedLinesForDisplay(lines, {
    keepListBreaks: true,
    sourceLineStarts: [true, false, false],
  });
  check(
    "summary '(A)' wrapped row: no mid-sentence hard break",
    !flagged.includes("\\n"),
    JSON.stringify(flagged),
  );
  check(
    "summary '(A)' wrapped row: equals legacy space-join",
    flagged === lines.join(" "),
  );
}

// "3.5 million" — \\d+[.)] 매치 래핑행 오탐 픽스처.
{
  const lines = ["The company grew to", "3.5 million users last year."];
  const flagged = joinRenderedLinesForDisplay(lines, {
    keepListBreaks: true,
    sourceLineStarts: [true, false],
  });
  check(
    "'3.5 million' wrapped row: no hard break",
    flagged === "The company grew to 3.5 million users last year.",
    JSON.stringify(flagged),
  );
}

// 원문 개행([조건] 번호 목록)은 그대로 하드 개행 유지 — 이 유스케이스가
// keepListBreaks 도입 목적이므로 회귀 금지.
{
  const lines = ["[조건]", "1. 10단어 이내로 쓸 것", "2. 수동태를 쓸 것"];
  const flagged = joinRenderedLinesForDisplay(lines, {
    keepListBreaks: true,
    sourceLineStarts: [true, true, true],
  });
  check(
    "[조건] source-start list rows keep breaks",
    flagged === "[조건]\\n1. 10단어 이내로 쓸 것\\n2. 수동태를 쓸 것",
    JSON.stringify(flagged),
  );
}

// 원문 행이더라도 리스트 패턴이 아니면 공백 연결(종전 통짜 대비 차이는 리스트/라벨 원문
// 개행뿐임을 고정).
{
  const lines = ["This is a plain sentence", "and this is its own source line."];
  const flagged = joinRenderedLinesForDisplay(lines, {
    keepListBreaks: true,
    sourceLineStarts: [true, true],
  });
  check("plain source rows still space-joined", flagged === lines.join(" "));
}

// 플래그 미전달(레거시 호출부) 거동은 종전 그대로 — 휴리스틱이 "(A)" 행에 개행.
{
  const lines = ["The passage suggests that", "(A) ______ can trigger"];
  const legacy = joinRenderedLinesForDisplay(lines, { keepListBreaks: true });
  check(
    "legacy path (no flags) keeps old heuristic",
    legacy === "The passage suggests that\\n(A) ______ can trigger",
    JSON.stringify(legacy),
  );
}

// keepListBreaks 미사용(지문 통짜) 경로 무변경.
{
  const lines = ["First paragraph line.", "", "Second paragraph line."];
  check(
    "passage flat join unchanged",
    joinRenderedLinesForDisplay(lines) === "First paragraph line. Second paragraph line.",
  );
}

// ── (2) textToLinesWithMeta: 원문 행 경계 플래그 + textToLines byte 동일 ────
{
  const text = "죽는 날까지 하늘을 우러러 한 점 부끄럼이 없기를 잎새에 이는 바람에도 나는 괴로워했다\\n짧은 행";
  const meta = textToLinesWithMeta(text, 120, 11.5);
  const plain = textToLines(text, 120, 11.5);
  check(
    "textToLines delegates byte-identical",
    JSON.stringify(plain) === JSON.stringify(meta.map((w: { line: string }) => w.line)),
  );
  check("wrapping produced continuation rows", meta.length > 2);
  const starts = meta.filter((w: { isSourceLineStart: boolean }) => w.isSourceLineStart).length;
  check("exactly one source-start per source line", starts === 2);
  check("first row is source-start", meta[0].isSourceLineStart === true);
  check("second row is wrap continuation", meta[1].isSourceLineStart === false);
  check(
    "last row (second source line) is source-start",
    meta[meta.length - 1].isSourceLineStart === true,
  );
}

// ── (3) KO 운문: 자작 시 3연이 행 그대로 복원되는지 ────────────────────────
{
  const poem = [
    "새벽 강가에 안개가 내리고",
    "나는 잊힌 이름을 부른다",
    "",
    "바람은 갈대숲을 지나며",
    "낡은 약속을 흔들어 깨우고",
    "",
    "먼 산등성이 위로",
    "첫 햇살이 조용히 걸어온다",
  ].join("\\n");
  // 넉넉한 폭 → 시행별 1행(래핑 없음).
  const meta = textToLinesWithMeta(poem, 600, 11.5);
  const view = splitKoStructBoxRows(
    meta.map((w: { line: string }) => w.line),
    {
      isSegStart: true,
      style: "passage",
      sourceLineStarts: meta.map((w: { isSourceLineStart: boolean }) => w.isSourceLineStart),
    },
  );
  check(
    "verse: every source line preserved, stanza gap = blank line",
    view.body ===
      "새벽 강가에 안개가 내리고\\n나는 잊힌 이름을 부른다\\n\\n바람은 갈대숲을 지나며\\n낡은 약속을 흔들어 깨우고\\n\\n먼 산등성이 위로\\n첫 햇살이 조용히 걸어온다",
    JSON.stringify(view.body),
  );

  // 좁은 폭 → 시행이 래핑돼도, 래핑 이어짐 행만 공백 병합되고 시행 경계는 유지.
  const narrow = textToLinesWithMeta(poem, 90, 11.5);
  check("narrow width actually wraps", narrow.length > 8);
  const narrowBody = joinKoStructLines(
    narrow.map((w: { line: string }) => w.line),
    narrow.map((w: { isSourceLineStart: boolean }) => w.isSourceLineStart),
  );
  check(
    "verse under wrapping: source line boundaries survive",
    narrowBody ===
      "새벽 강가에 안개가 내리고\\n나는 잊힌 이름을 부른다\\n\\n바람은 갈대숲을 지나며\\n낡은 약속을 흔들어 깨우고\\n\\n먼 산등성이 위로\\n첫 햇살이 조용히 걸어온다",
    JSON.stringify(narrowBody),
  );
}

// 희곡 대사(임의 화자명)도 원문 행 경계로 보존 — 화자 화이트리스트 휴리스틱 의존 소멸.
{
  const play = ["명서: 아니, 그게 무슨 소리냐?", "명서 처: 방금 우체부가 다녀갔어요."];
  const body = joinKoStructLines(play, [true, true]);
  check(
    "play dialogue lines preserved",
    body === "명서: 아니, 그게 무슨 소리냐?\\n명서 처: 방금 우체부가 다녀갔어요.",
    JSON.stringify(body),
  );
}

// 플래그 없는 레거시 경로: KO_HARD_BREAK_LINE_RE 휴리스틱 폴백 유지.
{
  const body = joinKoStructLines(["ㄱ. 첫째 항목", "이어지는 프로즈", "• 불릿"]);
  check(
    "legacy KO join heuristic fallback",
    body === "ㄱ. 첫째 항목 이어지는 프로즈\\n• 불릿",
    JSON.stringify(body),
  );
}

// ── (4) KO-RC-7: 헤더 탐지 given 한정 ─────────────────────────────────────
{
  const passageRows = ["〈제1수〉", "강호에 봄이 드니 미친 흥이 절로 난다"];
  const passageView = splitKoStructBoxRows(passageRows, {
    isSegStart: true,
    style: "passage",
    sourceLineStarts: [true, true],
  });
  check("passage 〈제1수〉 not consumed as header", passageView.header === null);
  check(
    "passage 〈제1수〉 stays in body with line break",
    passageView.body === "〈제1수〉\\n강호에 봄이 드니 미친 흥이 절로 난다",
    JSON.stringify(passageView.body),
  );

  const givenRows = ["〈 보 기 〉", "ㄱ. 첫째 진술", "ㄴ. 둘째 진술"];
  const givenView = splitKoStructBoxRows(givenRows, {
    isSegStart: true,
    style: "given",
    sourceLineStarts: [true, true, true],
  });
  check("given bogi header still extracted", givenView.header === "〈 보 기 〉");
  check(
    "given body keeps item lines",
    givenView.body === "ㄱ. 첫째 진술\\nㄴ. 둘째 진술",
    JSON.stringify(givenView.body),
  );

  const condView = splitKoStructBoxRows(["[조건]", "• 한 문장으로 쓸 것"], {
    isSegStart: true,
    style: "given",
    sourceLineStarts: [true, true],
  });
  check("condition header still extracted", condView.header === "[조건]");
}

// 지문 말미 출처/각주 걷어내기 무회귀.
{
  const rows = [
    "모란이 피기까지는",
    "나는 아직 나의 봄을 기다리고 있을 테요",
    "- 김영랑, 「모란이 피기까지는」 -",
    "*테요: '터이에요'의 준말",
  ];
  const view = splitKoStructBoxRows(rows, {
    isSegStart: true,
    style: "passage",
    sourceLineStarts: [true, true, true, true],
  });
  check("source line extracted", view.sourceLine === "- 김영랑, 「모란이 피기까지는」 -");
  check("footnote extracted", JSON.stringify(view.footnotes) === JSON.stringify(["*테요: '터이에요'의 준말"]));
  check(
    "verse body preserved after trailing extraction",
    view.body === "모란이 피기까지는\\n나는 아직 나의 봄을 기다리고 있을 테요",
    JSON.stringify(view.body),
  );
}

// ── (5) KO-RENDER-3: 행 경계 __밑줄__ 균형 정규화 ─────────────────────────
{
  check(
    "multiline underline marker rebalanced per line",
    balanceKoUnderlineMarkersPerLine("㉠__산산이 부서진\\n이름이여__") ===
      "㉠__산산이 부서진__\\n__이름이여__",
  );
  check(
    "single-line marker untouched",
    balanceKoUnderlineMarkersPerLine("㉠__산산이 부서진 이름이여__ 그대로") ===
      "㉠__산산이 부서진 이름이여__ 그대로",
  );
  check(
    "blank run untouched",
    balanceKoUnderlineMarkersPerLine("빈칸 _____ 은 그대로") === "빈칸 _____ 은 그대로",
  );
}

// ── (6) KO-RC-2: _manualEditedFlat 스텁 → 어댑터 null + 폴백 ───────────────
{
  const validItem = {
    includePassage: true,
    passageContent: "사회적 신뢰는 공동체 유지의 토대이다. 신뢰가 무너지면 거래 비용이 급증한다.",
    questionText: "윗글의 내용과 일치하지 않는 것은?\\n① 선지 하나",
    sourceQuestion: {
      subType: "KO_RD_FACT",
      structuredData: {
        _typeId: "KO_RD_FACT",
        direction: "윗글의 내용과 일치하지 않는 것은?",
        options: [
          { label: "①", text: "사회적 신뢰는 공동체 유지의 토대이다." },
          { label: "②", text: "신뢰가 무너지면 거래 비용이 급증한다." },
          { label: "③", text: "선지 셋" },
          { label: "④", text: "선지 넷" },
          { label: "⑤", text: "선지 다섯" },
        ],
        correctAnswer: "③",
      },
      questionText: "윗글의 내용과 일치하지 않는 것은?\\n① 선지 하나",
      passage: { content: "" },
    },
  };
  const model = koPaperRenderModel(validItem as never);
  check("valid KO envelope resolves render model", model !== null);
  check(
    "valid KO envelope stem populated",
    Boolean(model && model.stem.text.includes("일치하지")),
  );

  const stubItem = {
    ...validItem,
    sourceQuestion: {
      ...validItem.sourceQuestion,
      structuredData: { _manualEditedFlat: true, _generationPlan: "PREMIUM" },
    },
  };
  check("_manualEditedFlat stub degrades to null", koPaperRenderModel(stubItem as never) === null);
  check(
    "stub falls back to questionText first line for stem",
    koStemForItem(stubItem as never) === "윗글의 내용과 일치하지 않는 것은?",
  );

  const stubJsonItem = {
    ...validItem,
    sourceQuestion: {
      ...validItem.sourceQuestion,
      structuredData: JSON.stringify({ _manualEditedFlat: true }),
    },
  };
  check(
    "stringified stub also degrades to null",
    koPaperRenderModel(stubJsonItem as never) === null,
  );

  const nonEnvelopeItem = {
    ...validItem,
    sourceQuestion: {
      ...validItem.sourceQuestion,
      structuredData: { tags: ["x"], _generationPlan: "PREMIUM" },
    },
  };
  check(
    "non-envelope object (no direction/_typeId) degrades to null",
    koPaperRenderModel(nonEnvelopeItem as never) === null,
  );
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-paper-render-line-breaks-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const summary = runHarness();

test("ko paper render line breaks + envelope gate: all cases pass", () => {
  assert.equal(
    summary.failed,
    0,
    `ko-paper-render-line-breaks failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 25, `expected ≥25 checks, got ${summary.passed}`);
});
