import assert from "node:assert/strict";
import test from "node:test";

import {
  detectTableLayout,
  isTableHeavyFront,
  reconstructPdfLines,
  // Node 타입 스트리핑은 확장자를 명시해야 해석한다(pdf-line-reconstruct.test.ts 와 동일).
} from "../../src/lib/passage-authoring/pdf-line-reconstruct.ts";

// ============================================================================
// 지면 형태(표) 판정 회귀 테스트
//
// 이 판정이 왜 있는지가 테스트의 존재 이유다:
//   텍스트 레이어가 살아 있는 PDF 는 판독 라우트를 아예 타지 않아(네트워크 0회)
//   `[[LAYOUT=…]]` 꼬리줄을 못 받는다. 그래서 **표가 가득한 디지털 교재가
//   하이브리드(원본 페이지 함께 보내기) 기본 OFF** 였다 — 표·밑줄·박스가 텍스트
//   판독에서 소멸하는, 원본 페이지가 가장 필요한 바로 그 자료가.
//
// 두 방향의 실패는 값이 다르다:
//   · 놓침(표인데 false) → 사용자가 모달 스위치로 즉시 켤 수 있다. 싸다.
//   · 오탐(평문인데 true) → 편당 페이지 이미지가 실려 **원가만** 오른다. 비싸다.
// 그래서 아래 "아니어야 한다" 케이스들이 이 파일의 본론이다.
// ============================================================================

/** pdfjs TextItem 모양의 조각 하나. y 는 PDF 관례대로 위쪽이 큰 값. */
function span(str: string, x: number, y: number, width: number, height = 10) {
  return { str, transform: [1, 0, 0, 1, x, y], width, height };
}

/**
 * 표 지면을 만든다 — 4열(x=40·160·280·400), 셀 폭 60 이라 열 사이는 60pt 가 빈다
 * (셀 경계 문턱은 1em=10pt). 행은 y 20 간격.
 */
function tablePage(rows: number, startY = 700) {
  const columns = [40, 160, 280, 400];
  const values = ["cat", "고양이", "명사", "3회"];
  const out: ReturnType<typeof span>[] = [];
  for (let row = 0; row < rows; row += 1) {
    columns.forEach((x, index) => {
      out.push(span(values[index], x, startY - row * 20, 60));
    });
  }
  return out;
}

/** 평문 지면 — 낱말이 3pt 간격으로 붙어 있어 셀 경계가 생기지 않는다. */
function prosePage(lines: number, startY = 700, wordsPerLine = 10) {
  const out: ReturnType<typeof span>[] = [];
  for (let line = 0; line < lines; line += 1) {
    for (let word = 0; word < wordsPerLine; word += 1) {
      out.push(span("evidence", 40 + word * 30, startY - line * 20, 27));
    }
  }
  return out;
}

// ── 표로 잡아야 하는 지면 ───────────────────────────────────────────────────

test("4열·12행 표 지면은 TABLE_HEAVY 로 잡는다", () => {
  assert.equal(detectTableLayout(tablePage(12)), true);
});

test("한 열이 긴 예문이어도 나머지가 짧은 셀이면 표다", () => {
  // 단어장 표의 흔한 모양: 표제어·품사·뜻 + 예문 한 칸.
  const spans: ReturnType<typeof span>[] = [];
  for (let row = 0; row < 12; row += 1) {
    const y = 700 - row * 20;
    spans.push(span("abandon", 40, y, 60));
    spans.push(span("동사", 160, y, 40));
    spans.push(span("버리다", 240, y, 50));
    spans.push(span("He abandoned the plan without telling anyone.", 320, y, 200));
  }
  assert.equal(detectTableLayout(spans), true);
});

test("지면의 3분의 1 이상이 표 행이면 표 지면이다", () => {
  // 표 6행 + 평문 12줄 = 18줄 중 33% → 문턱(30%)을 넘는다.
  assert.equal(
    detectTableLayout([...tablePage(6), ...prosePage(12, 500)]),
    true,
  );
});

// ── 표가 아니어야 하는 지면(오탐 방지가 본론) ───────────────────────────────

test("평문 지면은 표가 아니다 — 낱말 간격은 셀 경계가 아니다", () => {
  assert.equal(detectTableLayout(prosePage(15)), false);
});

test("2단 조판 교재(왼쪽 영어 / 오른쪽 한글)는 표가 아니다", () => {
  // 2셀 구조는 표로 치지 않는다. 텍스트만으로 뜻이 통하는 지면에 원가를 물리면 안 된다.
  const spans: ReturnType<typeof span>[] = [];
  for (let line = 0; line < 14; line += 1) {
    const y = 700 - line * 20;
    spans.push(span("The committee reviewed the proposal.", 40, y, 300));
    spans.push(span("위원회는 그 제안을 검토했다.", 400, y, 300));
    // 한 단 안의 낱말 조각도 섞어 둔다(실제 pdfjs 산출과 같은 밀도).
    spans.push(span("again", 350, y, 28));
  }
  assert.equal(detectTableLayout(spans), false);
});

test("단어장의 '표제어 — 뜻' 2열 목록은 표가 아니다", () => {
  const spans: ReturnType<typeof span>[] = [];
  for (let row = 0; row < 20; row += 1) {
    const y = 700 - row * 18;
    spans.push(span("abandon", 40, y, 60));
    spans.push(span("버리다, 포기하다", 200, y, 90));
  }
  assert.equal(detectTableLayout(spans), false);
});

test("표 행이 지면의 30% 미만이면 표 지면이 아니다", () => {
  // 표 4행 + 평문 12줄 = 16줄 중 25%. 표가 '좀 있는' 문서이지 표 지면은 아니다.
  assert.equal(
    detectTableLayout([...tablePage(4), ...prosePage(12, 500)]),
    false,
  );
});

test("행마다 열 x 가 어긋나면 표가 아니다 — 표를 표이게 하는 건 세로 정렬이다", () => {
  const spans: ReturnType<typeof span>[] = [];
  for (let row = 0; row < 12; row += 1) {
    const y = 700 - row * 20;
    const shift = row * 17; // 어떤 열도 3행을 모으지 못할 만큼 흔든다.
    spans.push(span("aa", 40 + shift, y, 20));
    spans.push(span("bb", 170 + shift, y, 20));
    spans.push(span("cc", 300 + shift, y, 20));
  }
  assert.equal(detectTableLayout(spans), false);
});

test("근거가 부족한 작은 표(조각·줄이 적음)는 판정하지 않는다", () => {
  // 3행짜리 표는 표지·머리글의 우연한 정렬과 구분되지 않는다 → 끈다.
  assert.equal(detectTableLayout(tablePage(3)), false);
});

test("빈 입력·표가 아닌 항목은 조용히 false", () => {
  assert.equal(detectTableLayout([]), false);
  assert.equal(detectTableLayout([{ type: "beginMarkedContent" }, null]), false);
});

// ── 줄 복원과의 공존 ────────────────────────────────────────────────────────

test("표 판정을 붙여도 같은 조각의 줄 복원은 그대로다", () => {
  // 두 함수는 같은 배열을 받는다(pdf-text-layer.ts). 어느 쪽도 입력을 변형하면 안 된다.
  const spans = tablePage(12);
  const before = reconstructPdfLines(spans);
  detectTableLayout(spans);
  const after = reconstructPdfLines(spans);
  assert.equal(after, before);
});

test("표 지면의 텍스트 복원은 실제로 무너진다 — 이게 하이브리드가 필요한 이유다", () => {
  // 단 분리(detectColumnGutter)가 표의 열 사이 여백을 '단 경계'로 읽어, 12행 표가
  // "1열 12줄 + 나머지 12줄"로 접힌다. 행이 통째로 끊겨 어느 값이 어느 행인지
  // 복원할 수 없다 — 이 자료야말로 원본 페이지를 함께 보내야 하는 자료다.
  // (여기서 고칠 문제가 아니다. 텍스트만으로는 표가 소멸한다는 **사실**을 못 박아
  //  두어, 누가 이 판정을 '불필요하다'며 지우지 못하게 한다.)
  const lines = reconstructPdfLines(tablePage(12)).split("\n");
  assert.equal(lines.length, 24);
  assert.equal(lines[0], "cat");
  assert.equal(lines[12], "고양이 명사 3회");
  assert.equal(detectTableLayout(tablePage(12)), true);
});

// ── 보낼 쪽 기준 집계 ───────────────────────────────────────────────────────
//
// 원본 페이지 업로드는 언제나 **앞에서부터** MAX_SEND_PAGES 쪽만 굽는다. 뒤쪽 표를
// 근거로 켜면 모델은 그 표를 영영 못 보고 원가만 는다 — 그래서 호출부는 보낼 쪽의
// 플래그만 넘기고, 여기서는 그 중 과반을 요구한다.

test("보낼 쪽의 과반이 표면 켠다", () => {
  assert.equal(isTableHeavyFront([true, true, false, false]), true);
  assert.equal(isTableHeavyFront([true, false, true, false]), true);
  assert.equal(isTableHeavyFront([true]), true);
  assert.equal(isTableHeavyFront([true, false]), true);
});

test("보낼 쪽에 표가 한 장뿐이면 켜지 않는다", () => {
  assert.equal(isTableHeavyFront([true, false, false, false]), false);
  assert.equal(isTableHeavyFront([false, true, false]), false);
});

test("표가 없거나 볼 쪽이 없으면 끈다", () => {
  assert.equal(isTableHeavyFront([false, false, false, false]), false);
  assert.equal(isTableHeavyFront([]), false);
});
