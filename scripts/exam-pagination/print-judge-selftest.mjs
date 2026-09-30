#!/usr/bin/env node
// ============================================================================
// PDF 판정식 자가 시험(순수 — 브라우저 · 서버 없음): node scripts/exam-pagination/print-judge-selftest.mjs
//  26-09-30 GPE-1: 쪽마다 50자 고정 하한이 짧은 정답표 쪽(5문항 시험지 — pdfjs 41자, DOM 60여 자)을 백지로 오판했다.
//  judgePdf 는 이제 정답표 · 표지 프레임에만 DOM 상대 하한(pageFloor)을 쓴다. 이 시험은
//   · 대조군: 종전 고정 하한은 그 정답표 쪽을 RED 로 본다(거짓 RED 재현 — 못 하면 시험이 무뎌진 것)
//   · 짧은 정답표 · 표지는 GREEN, 백지가 된 정답표 · 본문 쪽 · 미마운트(DOM 0자) 정답표는 RED,
//   · 쪽 수 ≠ 프레임 수면 쪽별 정보를 쓰지 않는다(순번이 어긋난 하한 적용 금지)
//  를 확인한다. 계기 음성테스트: PRINT_JUDGE_FAULT=fixed-floor(하한을 늘 50) → RED.
// ============================================================================
import { MIN_PAGE_CHARS, judgePdf, pageFloor } from "./print-harness.mjs";

const fault = process.env.PRINT_JUDGE_FAULT || null;
const floorOf = fault === "fixed-floor" ? () => MIN_PAGE_CHARS : pageFloor;
/** 판정(결함 주입 시 하한 함수만 바꿔 같은 식으로) */
function judge(pdf, frames, frameInfo) {
  const fails = [];
  if (fault === "fixed-floor") {
    const blank = pdf.chars.filter((c, i) => c < floorOf(frameInfo, i)).length;
    if (pdf.pages !== frames) fails.push("pages");
    if (blank) fails.push(`blank ${blank}`);
  } else judgePdf({ ...pdf, warning: [] }, frames, fails, "PDF", frameInfo);
  return fails.length ? "RED" : "GREEN";
}
const body = (chars) => ({ short: false, chars });
const key = (chars) => ({ short: true, chars });
const pdf = (chars) => ({ pages: chars.length, chars, warning: [] });

const CASES = [
  // [이름, PDF 쪽별 글자, 프레임 정보, 기대]
  ["GPE-1 5문항 정답표(pdfjs 41 · DOM 62)", [612, 588, 41], [body(640), body(610), key(62)], "GREEN"],
  ["1문항 정답표(DOM 12 · PDF 9)", [700, 9], [body(720), key(12)], "GREEN"],
  ["짧은 표지(DOM 30 · PDF 22)", [22, 650], [key(30), body(680)], "GREEN"],
  ["정답표가 백지(쪽 번호 3자)", [612, 588, 3], [body(640), body(610), key(62)], "RED"],
  ["본문 쪽이 백지", [612, 0, 41], [body(640), body(610), key(62)], "RED"],
  ["본문 쪽이 짧다(DOM 은 길다)", [612, 30, 41], [body(640), body(610), key(62)], "RED"],
  ["미마운트 정답표(DOM 0자)", [612, 588, 3], [body(640), body(610), key(0)], "RED"],
  ["쪽 수 ≠ 프레임 수(쪽별 하한 미사용)", [612, 41], [body(640), body(610), key(62)], "RED"],
];

const fails = [];
// 대조군: 종전 고정 하한(50)은 GPE-1 정답표 쪽을 백지로 본다
const legacyBlank = CASES[0][1].filter((c) => c < MIN_PAGE_CHARS).length;
if (legacyBlank !== 1) fails.push(`대조군: 종전 고정 하한이 GPE-1 거짓 RED 를 재현하지 못했다(백지 ${legacyBlank})`);
for (const [name, chars, frameInfo, want] of CASES) {
  const got = judge(pdf(chars), frameInfo.length, frameInfo);
  console.log(`${got === want ? "ok  " : "FAIL"} ${name}: ${got}(기대 ${want}) · 하한 ${chars.map((_, i) => floorOf(frameInfo, i)).join("/")}`);
  if (got !== want) fails.push(`${name}: ${got} ≠ ${want}`);
}
const verdict = fails.length ? "RED" : "GREEN";
console.log(JSON.stringify({ verdict, fault, fails }, null, 2));
process.exit(verdict === "GREEN" ? 0 : 1);
