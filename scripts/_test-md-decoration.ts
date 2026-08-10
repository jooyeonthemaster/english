// md 장식 흡수 공용 유틸 픽스처 — 유형별 파서가 각자 재발명하다 반복 실패한 계통.
import { cleanMdValue, keywordLineRe, readKeywordValue, sliceKeywordSection, stripEmphasis, unwrapQuotes } from "../src/lib/md-qgen/decoration";
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok && d ? ` — ${d}` : ""}`); ok ? pass++ : fail++; };

// 강조 제거
for (const [inp, want] of [
  ["**정답**", "정답"], ["__정답__", "정답"], ["_정답_", "정답"], ["*정답*", "정답"],
  ["`③`", "③"], ["***bold italic***", "bold italic"], ["~~취소~~", "취소"],
  ["were *once* regarded", "were once regarded"],
  ["**③**, **⑤**", "③, ⑤"],
  ["…planting.**", "…planting."],
  ["**한쪽만", "한쪽만"],
] as [string, string][]) {
  check(`강조 제거: ${JSON.stringify(inp)}`, stripEmphasis(inp) === want, `→ ${JSON.stringify(stripEmphasis(inp))}`);
}
check("언더스코어: 낱말 내부는 보존", stripEmphasis("file_name and snake_case") === "file_name and snake_case", stripEmphasis("file_name and snake_case"));

// 따옴표 한 겹
check('따옴표 한 겹: "값"', unwrapQuotes('"값"') === "값");
check("따옴표 한 겹: 곱슬", unwrapQuotes("“값”") === "값");
check("본문 따옴표는 보존", unwrapQuotes('"Green" corridors were once "decoration"') === '"Green" corridors were once "decoration"');

// 값 정리
check("cleanMdValue: 강조+따옴표+공백", cleanMdValue('  **"핵심   표현"**  ') === "핵심 표현", cleanMdValue('  **"핵심   표현"**  '));
check("cleanMdValue: 비문자열은 빈 문자열", cleanMdValue(undefined) === "");

// 머리표 정규식 — 장식 매트릭스
const HEADS: [string, string][] = [
  ["정답: ③", "③"], ["**정답:** ③", "③"], ["**정답**: ③", "③"], ["__정답:__ ③", "③"],
  ["_정답:_ ③", "③"], ["`정답:` ③", "③"], ["## 정답: ③", "③"], ["### 정답: ③", "③"],
  ["> 정답: ③", "③"], ["- 정답: ③", "③"], ["* 정답: ③", "③"], ["정답： ③", "③"],
  ["   정답:   ③   ", "③"], ["| 정답: ③", "③"], ["***정답:*** ③", "③"],
  ["정답: **③**", "③"], ["정답: `③`", "③"], ["정답: \"③\"", "③"],
];
for (const [line, want] of HEADS) {
  const m = line.match(keywordLineRe("정답"));
  const got = cleanMdValue(m?.[1] ?? "");
  check(`머리표: ${JSON.stringify(line)}`, got === want, `→ ${JSON.stringify(got)}`);
}
check("머리표: 산문은 오인하지 않음", "정답을 고르는 문제입니다".match(keywordLineRe("정답"))?.[1] !== "③");

// 값이 다음 줄
check("값 다음 줄", readKeywordValue("정답:\n③\n해설: x", "정답", ["해설"]) === "③");
check("값 다음 줄: 다음 섹션을 넘지 않음", readKeywordValue("정답:\n해설: x", "정답", ["해설"]) === "");
check("값 인라인 우선", readKeywordValue("**정답:** ④\n해설: x", "정답", ["해설"]) === "④");

// 섹션 절단
const MD = `해설: 첫 문장. 둘째 문장.
오답:
① 가
② 나
지문: 무시`;
check("섹션 절단: 해설", sliceKeywordSection(MD, "해설", ["오답", "지문"]) === "첫 문장. 둘째 문장.");
check("섹션 절단: 오답 2줄", sliceKeywordSection(MD, "오답", ["해설", "지문"]).split("\n").length === 2);
check(
  "섹션 절단: 헤더가 굵어도 경계가 산다",
  sliceKeywordSection("해설: 본문\n**오답:**\n① 가", "해설", ["오답"]) === "본문",
  sliceKeywordSection("해설: 본문\n**오답:**\n① 가", "해설", ["오답"]),
);

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
