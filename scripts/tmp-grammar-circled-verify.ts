/**
 * 어법(GRAMMAR_ERROR) 표시 라벨 (A)→① 변환 헬퍼 검증.
 * 생성 카드/해설/오답분석/정답 줄이 시험지 렌더와 동일하게 원형숫자를 쓰는지 확인.
 * (렌더러 자체는 React라 여기선 순수 헬퍼만 — 시각 검증은 앱에서.)
 */
import {
  circleGrammarLabelMentions,
  circleGrammarWrongOptionExplanations,
  grammarMarkerDisplayLabel,
  formatGrammarErrorPassageMarkers,
  formatInlineMarkersForSubtype,
} from "../src/components/exams/paper-builder/option-display";

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `  →  got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

console.log("\n[H1] grammarMarkerDisplayLabel — (A)→①, 멱등");
check("(A) → ①", grammarMarkerDisplayLabel("(A)"), "①");
check("A → ①", grammarMarkerDisplayLabel("A"), "①");
check("(E) → ⑤", grammarMarkerDisplayLabel("(E)"), "⑤");
check("① → ① (멱등)", grammarMarkerDisplayLabel("①"), "①");

console.log("\n[H2] circleGrammarLabelMentions — 해설/정답 프로즈");
check(
  "해설 (A)번 → ①번",
  circleGrammarLabelMentions("(A)번에 표시된 'what'은 문맥상..."),
  "①번에 표시된 'what'은 문맥상...",
);
check("정답 (A), (B) → ①, ②", circleGrammarLabelMentions("(A), (B)"), "①, ②");
check("(C)(D) 연속 → ③④", circleGrammarLabelMentions("(C)(D)"), "③④");
check("라벨 없는 텍스트 무변경", circleGrammarLabelMentions("틀린 부분 없음"), "틀린 부분 없음");
check("빈 문자열", circleGrammarLabelMentions(""), "");

console.log("\n[H3] circleGrammarWrongOptionExplanations — 키=평문숫자, 본문=①");
check(
  "키 (B)/(C) → 2/3, 본문 (B)→②",
  circleGrammarWrongOptionExplanations({
    "(B)": "(B) 자리의 named 는 옳다.",
    "(C)": "(C) 의 arguing 은 능동.",
  }),
  { "2": "② 자리의 named 는 옳다.", "3": "③ 의 arguing 은 능동." },
);
check("undefined 통과", circleGrammarWrongOptionExplanations(undefined), undefined);

console.log("\n[H4] 지문 마커 — formatGrammarErrorPassageMarkers (시험지 경로와 동일, GRAMMAR_ERROR만)");
check(
  "__(A) what__ → __① what__ (GRAMMAR_ERROR)",
  formatGrammarErrorPassageMarkers("In fact __(A) what__ the internet", "GRAMMAR_ERROR"),
  "In fact __① what__ the internet",
);
check(
  "타 유형(ANTONYM)은 무변경 — (A) 보존",
  formatInlineMarkersForSubtype("brave __(A) word__ here", "ANTONYM"),
  "brave __(A) word__ here",
);
check(
  "타 유형(GRAMMAR_CHOICE_COMBO)은 무변경",
  formatInlineMarkersForSubtype("__(A) x__", "GRAMMAR_CHOICE_COMBO"),
  "__(A) x__",
);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
