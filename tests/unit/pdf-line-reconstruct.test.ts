import assert from "node:assert/strict";
import test from "node:test";

import {
  reconstructPdfLines,
  denseLength,
  isPdfTextSpan,
  // Node 타입 스트리핑은 확장자를 명시해야 해석한다(확장자 없는 기존
  // .test.ts 들은 같은 러너에서 이미 실패한다 — 선재 조건).
} from "../../src/lib/passage-authoring/pdf-line-reconstruct.ts";

// ============================================================================
// PDF 줄 복원 회귀 테스트
//
// 이 로직이 깨지면 어떤 일이 벌어지는지가 테스트의 존재 이유다:
//   · 줄이 안 나뉘면 단어장의 "표제어 — 뜻" 구조가 뭉개져 표제어를 못 뽑는다
//     (metrics.extractVocabTerms 는 줄 단위로 읽는다).
//   · 단이 안 갈리면 한국 영어 교재(왼쪽 영어 / 오른쪽 한글 해설)에서 영어 문장
//     중간에 한글이 끼어들어 문장 경계가 깨진다. 실측으로 확인된 실패였다
//     (어법 초중고 1000.pdf) — 그 페이지 구조를 아래 twoColumnPage 가 재현한다.
// ============================================================================

/** pdfjs TextItem 모양의 조각 하나. y 는 PDF 관례대로 위쪽이 큰 값. */
function span(str: string, x: number, y: number, width: number, height = 10) {
  return { str, transform: [1, 0, 0, 1, x, y], width, height };
}

test("같은 y 의 조각들은 한 줄로, 다른 y 는 다른 줄로 묶인다", () => {
  const out = reconstructPdfLines([
    span("world", 60, 700, 40),
    span("Hello", 10, 700, 40),
    span("second line", 10, 680, 80),
  ]);
  assert.equal(out, "Hello world\nsecond line");
});

test("붙어 있는 조각은 공백 없이 이어 붙는다(단어 조각 보존)", () => {
  // pdfjs 는 커닝·폰트 전환 때문에 한 단어를 여러 조각으로 쪼갠다.
  // 사이가 벌어지지 않았으면 그대로 이어야 "hello" 가 "hel lo" 로 깨지지 않는다.
  const out = reconstructPdfLines([span("hel", 10, 700, 20), span("lo", 30, 700, 12)]);
  assert.equal(out, "hello");
});

test("떨어져 있는 조각 사이에는 공백이 들어간다", () => {
  const out = reconstructPdfLines([span("a", 10, 700, 8), span("b", 40, 700, 8)]);
  assert.equal(out, "a b");
});

test("위에서 아래로 읽는 순서를 지킨다(PDF 는 좌하단 원점)", () => {
  const out = reconstructPdfLines([
    span("bottom", 10, 100, 40),
    span("top", 10, 700, 40),
    span("middle", 10, 400, 40),
  ]);
  assert.equal(out, "top\nmiddle\nbottom");
});

/**
 * 2단 교재 페이지 재현 — 왼쪽 영어 본문(x 40~380), 오른쪽 한글 해설(x 430~780).
 * 두 단은 **같은 y** 를 공유한다. 이게 실제 교재의 구조이고, 단 분리가 없으면
 * 한 줄로 병합돼 버린다.
 */
function twoColumnPage() {
  const spans: ReturnType<typeof span>[] = [];
  for (let row = 0; row < 30; row += 1) {
    const y = 700 - row * 14;
    spans.push(span(`English sentence number ${row}`, 40, y, 330));
    spans.push(span(`한글 해설 ${row}`, 430, y, 340));
  }
  return spans;
}

test("2단 조판은 단별로 분리된다 — 영어 줄에 한글이 섞이지 않는다", () => {
  const out = reconstructPdfLines(twoColumnPage());
  const lines = out.split("\n");

  const hasHangul = (s: string) => /[가-힣]/.test(s);
  const hasLatin = (s: string) => /[A-Za-z]/.test(s);
  const mixed = lines.filter((line) => hasHangul(line) && hasLatin(line));
  assert.deepEqual(mixed, [], `영어·한글이 한 줄에 섞였다: ${mixed.join(" / ")}`);

  // 왼쪽 단을 먼저 다 읽고 오른쪽 단으로 넘어간다(사람이 읽는 순서).
  const firstHangul = lines.findIndex(hasHangul);
  const lastLatin = lines.map(hasLatin).lastIndexOf(true);
  assert.ok(
    lastLatin < firstHangul,
    "왼쪽 단을 끝내기 전에 오른쪽 단이 끼어들었다",
  );
});

test("전폭 머리글이 있어도 단 분리가 유지된다", () => {
  // 실측 실패의 원인이던 조건: 전폭을 가로지르는 제목 줄이 가운데 칸을 메워
  // "완전히 빈 띠" 조건을 무너뜨렸다. 골짜기 판정은 여기에 흔들리면 안 된다.
  const spans = twoColumnPage();
  spans.push(span("실전 1000제 기출 (상중하 포함)", 40, 730, 740));
  const out = reconstructPdfLines(spans);
  const mixed = out
    .split("\n")
    .filter((line) => /[가-힣]/.test(line) && /[A-Za-z]/.test(line));
  // 머리글 자신은 한글뿐이라 섞임으로 잡히지 않는다. 본문이 안 섞이면 통과.
  assert.deepEqual(mixed, []);
});

test("단일 단 페이지는 쪼개지 않는다(오분할 방지)", () => {
  const spans: ReturnType<typeof span>[] = [];
  for (let row = 0; row < 30; row += 1) {
    // 한 줄이 페이지 전체 폭을 쓰는 보통의 지문 페이지.
    spans.push(span(`A full width sentence for row ${row}`, 40, 700 - row * 14, 740));
  }
  const out = reconstructPdfLines(spans);
  const lines = out.split("\n");
  assert.equal(lines.length, 30);
  assert.ok(lines[0].startsWith("A full width sentence for row 0"));
});

test("글자 조각이 아닌 항목(TextMarkedContent 등)은 걸러진다", () => {
  assert.equal(isPdfTextSpan({ type: "beginMarkedContent" }), false);
  assert.equal(isPdfTextSpan(null), false);
  assert.equal(isPdfTextSpan(span("ok", 0, 0, 10)), true);
  const out = reconstructPdfLines([
    { type: "beginMarkedContent" },
    span("visible", 10, 700, 40),
  ]);
  assert.equal(out, "visible");
});

test("빈 입력에도 안전하다", () => {
  assert.equal(reconstructPdfLines([]), "");
  assert.equal(denseLength("  \n\t "), 0);
  assert.equal(denseLength("ab c"), 3);
});
