// 기출 문제 은행 빌더 — 빌더 직렬화 계약(라벨·발문·유형 매핑) 단일 정본.
// 실 DB 표본(.tmp-gichul-bank/_db-shapes.json) 과 src/lib/question-generation-persistence.ts 의
// buildGeneratedQuestionText 를 따른다. 여기 값을 바꾸면 은행 전체가 바뀐다.
import { CIRC } from "./text.mjs";

/** typeGroup → 빌더 subType */
export const SUBTYPE_OF = {
  "빈칸추론": "BLANK_INFERENCE",
  "어법": "GRAMMAR_ERROR",
  "어휘": "VOCAB_CHOICE",
  "글의순서": "SENTENCE_ORDER",
  "문장삽입": "SENTENCE_INSERT",
  "무관한문장": "IRRELEVANT",
  "요약문": "SUMMARY_COMPLETE_MC",
  "주장": "MAIN_IDEA",
  "요지": "MAIN_IDEA",
  "주제": "TOPIC",
  "제목": "TITLE",
  "내용일치": "CONTENT_MATCH",
  "함축의미": "IMPLIED_MEANING",
  "지칭": "REFERENCE",
};

/** 수능 고정 지시문(내용 창작 아님) — 인쇄본 발문이 없을 때만 쓴다. */
export const CANON = {
  "빈칸추론": "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
  "어법": "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
  "어휘": "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?",
  "글의순서": "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것을 고르시오.",
  "문장삽입": "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오.",
  "무관한문장": "다음 글에서 전체 흐름과 관계 없는 문장은?",
  "요약문": "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
  "주장": "다음 글에서 필자가 주장하는 바로 가장 적절한 것은?",
  "요지": "다음 글의 요지로 가장 적절한 것은?",
  "주제": "다음 글의 주제로 가장 적절한 것은?",
  "제목": "다음 글의 제목으로 가장 적절한 것은?",
  "내용일치": "다음 글의 내용과 일치하지 않는 것은?",
  "함축의미": "다음 글에서 밑줄 친 부분이 의미하는 바로 가장 적절한 것은?",
  "지칭": "밑줄 친 부분이 가리키는 대상이 나머지 넷과 다른 것은?",
};

/** 일반 5지선다 옵션 — label "1".."5" (실 DB 다수 형식), 정답 "N" */
export function mcOptions(choices) {
  return choices.map((text, i) => ({ label: String(i + 1), text }));
}
export function mcAnswer(n) { return String(n); }

/** 어법 — label "(A)".."(E)", 정답 "(C)" */
export function grammarOptions(spans) {
  return spans.map((text, i) => ({ label: `(${"ABCDE"[i]})`, text }));
}
export function grammarAnswer(n) { return `(${"ABCDE"[n - 1]})`; }
export function grammarMarker(i) { return `(${"ABCDE"[i]})`; }

/** 어휘 — 지문 __(a) word__, options label "1".."5" text word, 정답 "5" */
export function vocabMarker(i) { return `(${"abcde"[i]})`; }

/** 문장삽입 — canonical: label "1" text "①" … 정답 "③"(원문자) */
export function insertOptions(n = 5) {
  return Array.from({ length: n }, (_, i) => ({ label: String(i + 1), text: CIRC[i] }));
}
export function insertAnswer(n) { return CIRC[n - 1]; }

/** 무관한 문장 — label "①" text "①", 정답 "④"(원문자) */
export function irrelevantOptions() {
  return CIRC.slice(0, 5).map((c) => ({ label: c, text: c }));
}
export function irrelevantAnswer(n) { return CIRC[n - 1]; }

/** 글의 순서 — canonical 5 순열, label "1".."5", 정답 "N" */
export const ORDER_PERMS = ["(A)-(C)-(B)", "(B)-(A)-(C)", "(B)-(C)-(A)", "(C)-(A)-(B)", "(C)-(B)-(A)"];
export const ORDER_SEQ = { 1: "ACB", 2: "BAC", 3: "BCA", 4: "CAB", 5: "CBA" };
export function orderOptions() { return ORDER_PERMS.map((t, i) => ({ label: String(i + 1), text: t })); }

/** 요약문 — "a …… b" + blankValues */
export function summaryOptions(pairs) {
  return pairs.map(([a, b], i) => ({
    label: String(i + 1),
    text: `${a} …… ${b}`,
    blankValues: [{ label: "(A)", value: a }, { label: "(B)", value: b }],
    blankA: a,
    blankB: b,
  }));
}

/** questionText 조립 — buildGeneratedQuestionText 와 같은 "\n\n" 결합 */
export function joinParts(...parts) {
  return parts.filter((p) => typeof p === "string" && p.trim()).join("\n\n");
}

/** 각주 꼬리 — 지문 뒤에 붙는 한 단락 */
export function footnoteTail(footnotes) {
  if (!footnotes || footnotes.length === 0) return "";
  return footnotes.join("  ");
}
