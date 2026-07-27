// 글의 순서(SENTENCE_ORDER) md 레인 0원 결정론 픽스처 테스트. 실행: npx tsx scripts/_test-md-order.ts
// 파싱 → 스냅 → 게이트 전종 → 어댑터 → postProcessQuestion(PASSTHROUGH) → 품질 검증기 →
// **DOCX questionText 역파싱 왕복** → 레인 계약(과금·적격성·설정 집행·난이도 3분기). 후처리가
// 없는 유형이라 어댑터 산출이 곧 저장 형상이다 — 인쇄물만 깨지는 결함(정찰 R6)까지 여기서 잡는다.
import { autoSnapOrderChunks, foldForOrderMatch, orderDisplayParagraphs, orderPermutationText, parseMdSentenceOrder, parseOrderPermutation } from "../src/lib/md-qgen/parser-order";
import { orderCohesionCues, orderDemonstrativeStems, orderFlippedCue } from "../src/lib/md-qgen/gate-order-variant";
import { gateMdSentenceOrder } from "../src/lib/md-qgen/gate-order";
import { adaptMdSentenceOrderToAiQuestion } from "../src/lib/md-qgen/adapter-order";
import { SENTENCE_ORDER_MD_LANE } from "../src/lib/md-qgen/lane-order";
import { buildMdSentenceOrderPrompt } from "../src/lib/md-qgen/prompts-order";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { buildGeneratedQuestionText } from "../src/lib/question-generation-persistence";
import { sentenceOrderSegmentsFromQuestionText } from "../src/components/exams/paper-builder/question-body-layout";
import { CREDIT_COSTS } from "../src/lib/credit-costs";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import { ABBREV_B, ABBREV_C, ABBREV_OK_B, ADJACENT_GIVEN, A_LOWER_LABEL, A_QUOTED_LABEL, A_YET_BAD, A_YET_OK, CONNECTIVE_A, DUP_WRONGS, EXPLANATION, FAT_A, GIVEN, GIVEN_3, GOOD, LABELS, LG_PASSAGE, LG_VAR_A_CHAINLESS, LG_VAR_A_GENERIC, LG_VAR_A_LONG, LG_VAR_A_OK, LG_VAR_B_OK, LG_VAR_B_SHORT, LOWER_OPENERS, MD_LONG_GIVEN_WITH_VARIANT, MID_B, MID_C, OPTS, PASSAGE, PASSAGE_4, P_A, P_B, P_C, QUOTED_GIVEN, QUOTE_B, QUOTE_C, SEAM_A, SEAM_B, SEAM_C, SEAM_G, SEAM_PASSAGE, SHORT_C, US_C, V1, V2, V3, VAR_A, VAR_ADDED_CONNECTIVE, VAR_A_CHAIN_LOST, VAR_A_CIRCLED, VAR_A_DECONNECTED, VAR_A_FILLER, VAR_A_HEAD, VAR_A_MIXED, VAR_A_NO_STOP, VAR_A_NUMBERED, VAR_A_WRAPPED, VAR_B, VAR_BODY_LABEL, VAR_B_CUE_LOST, VAR_B_KEPT, VAR_C, VAR_COPIED, VAR_C_CUE_LOST, VAR_C_FLIPPED, VAR_C_RELOCATED, VAR_KOREAN, VAR_OFFTOPIC, VAR_OTHER_PARAGRAPH, VAR_QUOTED_LABEL, VAR_SOURCE_COPY, VAR_TAIL_EDITED, VAR_THREE_SENTENCES, VAR_TOO_SHORT, Variants, WRONGS, bOpener, headOf, lgMd, mdOf, passageOf, restate, tailOf } from "./_test-md-order-fixtures";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}



// 1. 정상 경로 — 파싱 · 스냅 · 게이트 클린
const parsed = parseMdSentenceOrder(GOOD);
const labels = parsed.paragraphs.map((p) => p.label).join("");
check("파싱: 단락 3개 · 라벨 (A)(B)(C)", parsed.paragraphs.length === 3 && labels === "(A)(B)(C)", labels);
check("파싱: 주어진 글 축자", parsed.given === GIVEN, parsed.given.slice(0, 50));
check("파싱: 변형본 줄 없음(설정 off)", parsed.variants.length === 0);
const withVariants = parseMdSentenceOrder(mdOf({ variants: V2 }));
check("파싱: 변형 줄이 축자 줄을 삼키지 않음(두 정규식 배타)", withVariants.paragraphs.length === 3 && withVariants.paragraphs.map((p) => p.text).join("|") === [P_A, P_B, P_C].join("|"), withVariants.paragraphs.map((p) => p.text.slice(0, 18)).join(" | "));
check("파싱: 변형본 2개 · 라벨 (A)(B) 순서", withVariants.variants.map((x) => x.label).join("") === "(A)(B)" && withVariants.variants[0].text === VAR_A, withVariants.variants.map((x) => x.label).join(""));
check("파싱 관용: '단락 (A) (변형) ：' 표기 흔들림 흡수 · 제시 순서 뒤바뀜은 스냅이 정렬", (() => {
  const drift = parseMdSentenceOrder(mdOf({ variants: V1 }).replace("단락(A,변형):", "단락 (A) (변형) ："));
  const swapped = autoSnapOrderChunks(parseMdSentenceOrder([`주어진글: ${GIVEN}`, `단락(B): ${P_B}`, `단락(B,변형): ${VAR_B}`, `단락(A): ${P_A}`, `단락(A,변형): ${VAR_A}`, `단락(C): ${P_C}`, ...OPTS, "정답: ③", `해설: ${EXPLANATION}`, "오답:", ...WRONGS].join("\n")), PASSAGE);
  return drift.variants.length === 1 && drift.variants[0].text === VAR_A && drift.paragraphs.length === 3 && swapped.question.variants.map((x) => x.label).join("") === "(A)(B)" && gateMdSentenceOrder(swapped.question, PASSAGE, { prefixVariationCount: 2 }).length === 0;
})());
check("첫 문장 절단: 축자 단락을 첫 문장 + 나머지로 가른다", headOf(P_B) === "But this narrow role soon widened." && tailOf(P_B).startsWith("Readers began"), `${headOf(P_B)} || ${tailOf(P_B).slice(0, 20)}`);
check("첫 문장 절단: 약어·이니셜 마침표는 문장 끝이 아님", headOf("Fig. 2 shows the margin. Readers replied.") === "Fig. 2 shows the margin." && headOf("A study by A. Smith changed that. Readers replied.") === "A study by A. Smith changed that.", headOf("A study by A. Smith changed that. Readers replied."));
const cuesOf = (s: string) => orderCohesionCues(foldForOrderMatch(s));
check("응집 단서: 종류 + **방향**을 함께 뽑는다(역접·시간 후행·후방참조)", cuesOf(headOf(P_B)).join(",") === "역접,시간·순서(후행),후방참조" && cuesOf(headOf(P_C)).includes("시간·순서(후행)"), cuesOf(headOf(P_B)).join(","));
// 적대검수 F3 — that+명사 되받기를 놓치면 '단서 0개' 라서 검사가 통째로 꺼진다.
check("응집 단서: that+명사 되받기를 후방참조로 포착(무검사 구간 봉합)", cuesOf(headOf(P_A)).includes("후방참조") && [...orderDemonstrativeStems(foldForOrderMatch(headOf(P_A)))].sort().join(",") === "layer,record", [...orderDemonstrativeStems(foldForOrderMatch(headOf(P_A)))].join(","));
check("응집 단서: 보문절 that 은 지시사가 아님(showed that … / 허사 it)", orderDemonstrativeStems(foldForOrderMatch("Studies showed that scholars now mine the record.")).size === 0 && !cuesOf("It was clear that the margin mattered.").includes("후방참조"), [...orderDemonstrativeStems(foldForOrderMatch("Studies showed that scholars now mine the record."))].join(","));
check("응집 단서: 맨 대명사는 약한 단서(대명사) — 지시 명사구와 구별", cuesOf("They answered them in the same book.").includes("대명사") && !cuesOf("They answered them in the same book.").includes("후방참조"), cuesOf("They answered them in the same book.").join(","));
// 적대검수 F13 — 사전이 좁으면 단서를 **보존한** 자연 재진술이 반려된다(오탐 = 잡 실패·환불).
check("응집 단서: 사전 확장 — as a consequence / in spite of / one case is", cuesOf("As a consequence the practice spread through every port.").includes("인과(결과)") && cuesOf("In spite of the ruling the guild refused to license it.").includes("역접") && cuesOf("One case is the Bristol register, which lists four dials.").includes("예시"), [cuesOf("As a consequence the practice spread through every port.").join("/"), cuesOf("In spite of the ruling the guild refused to license it.").join("/"), cuesOf("One case is the Bristol register, which lists four dials.").join("/")].join(" | "));
check("응집 단서: 방향 뒤집힘 판정(later→earlier 만 잡고, 방향 없는 종류는 무시)", orderFlippedCue(["시간·순서(후행)", "후방참조"], ["시간·순서(선행)", "후방참조"]) === "시간·순서(후행) → 시간·순서(선행)" && orderFlippedCue(["시간·순서(후행)"], ["시간·순서(후행)"]) === null && orderFlippedCue(["역접"], ["예시"]) === null, String(orderFlippedCue(["시간·순서(후행)", "후방참조"], ["시간·순서(선행)", "후방참조"])));
check("파싱: 단락 본문 축자", parsed.paragraphs[0].text === P_A && parsed.paragraphs[1].text === P_B && parsed.paragraphs[2].text === P_C);
check("파싱: 선지 5개 · 순열 전부 해석", parsed.options.length === 5 && parsed.options.every((o) => o.order.length === 3), `${parsed.options.length}개`);
check("파싱: 정답 ③", parsed.answer === "③", parsed.answer);
check("파싱: 오답해설 4개", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check("파싱: 해설 존재", parsed.explanation.length > 20);

const snapped = autoSnapOrderChunks(parsed, PASSAGE);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
const gate = gateMdSentenceOrder(snapped.question, PASSAGE);
check("게이트: 정상 입력 클린", gate.length === 0, gate.join(" / "));
check("순열 유틸: 괄호형·민자형 해석 · 리터럴 재조립 · 비순열 거부", orderPermutationText(parseOrderPermutation("(B)-(C)-(A)") ?? []) === "(B)-(C)-(A)" && orderPermutationText(parseOrderPermutation("B - C - A") ?? []) === "(B)-(C)-(A)" && parseOrderPermutation("(A)-(A)-(B)") === null);
check("fold: 구두점 무관 · 대소문자 무관 정규화", foldForOrderMatch("The  margin—at last, “read”.") === "the margin at last read", foldForOrderMatch("The  margin—at last, “read”."));

// 2. 게이트 반려 케이스 — 전종(표 구동)
function gateOf(md: string, passage = PASSAGE, variation = 0): string[] {
  const q = autoSnapOrderChunks(parseMdSentenceOrder(md), passage).question;
  return gateMdSentenceOrder(q, passage, { prefixVariationCount: variation });
}


const REJECTS: Array<{ name: string; md: string; needle: string; passage?: string; variation?: number }> = [
  { name: "#1 단락 2개", md: GOOD.replace(`단락(C): ${P_C}\n`, ""), needle: "단락 2개" },
  { name: "#1 라벨 중복", md: GOOD.replace("단락(C):", "단락(B):"), needle: "(A)(B)(C) 순서가 아님" },
  { name: "#2 주어진 글 3문장", md: mdOf({ given: GIVEN_3 }), passage: passageOf(GIVEN_3, P_B, P_C, P_A), needle: "3문장" },
  { name: "#3 주어진 글에 단락 라벨 오염", md: GOOD.replace("주어진글: In", "주어진글: (A) In"), needle: "단락 라벨" },
  { name: "#4 단락 본문 선두 순서표식", md: GOOD.replace("단락(A): Modern", "단락(A): 1. Modern"), needle: "순서 번호" },
  { name: "#4 단락 본문에 구조 라벨 재등장", md: GOOD.replace("단락(A): Modern", "단락(A): (B) Modern"), needle: "구조 라벨" },
  { name: "#4 단락 1문장", md: mdOf({ c: SHORT_C }), needle: "1문장" },
  { name: "#5 단락 분량 불균형", md: mdOf({ a: FAT_A }), passage: passageOf(GIVEN, P_B, P_C, FAT_A), needle: "분량 불균형" },
  { name: "#6 지문 무단 편집(단어 교체)", md: GOOD.replace("a slow conversation", "a long conversation"), needle: "축자 분할이 아님" },
  { name: "#6 이음매 문장 유실", md: mdOf({ b: "But this narrow role soon widened." }), needle: "유실" },
  { name: "#6 지문 끝 절삭", md: mdOf({ a: P_A.split(". ")[0] + "." }), needle: "지문 끝" },
  { name: "#6 구간 중복 사용", md: mdOf({ a: P_C }), needle: "중복 사용" },
  { name: "#6 주어진 글이 지문 맨 앞이 아님", md: mdOf({ given: P_B, b: GIVEN }), needle: "지문 맨 앞" },
  { name: "#7 선지 4개", md: mdOf({ options: OPTS.slice(0, 4) }), needle: "선지 4개" },
  { name: "#7 순열 아님", md: mdOf({ options: [...OPTS.slice(0, 4), "⑤ (C)-(C)-(A)"] }), needle: "순열이 아님" },
  { name: "#7 순열 중복", md: mdOf({ options: [...OPTS.slice(0, 4), "⑤ (B)-(C)-(A)"] }), needle: "순열 중복" },
  { name: "#8 정답 누락", md: GOOD.replace(/^정답: ③$/m, ""), needle: "정답 누락" },
  { name: "#8 정답 결정론 도출 불일치", md: mdOf({ answer: "②" }), needle: "정답 불일치" },
  { name: "#9 정답이 표시 순서 (A)-(B)-(C)", md: mdOf({ a: P_B, b: P_C, c: P_A, answer: "①", options: ["① (A)-(B)-(C)", ...OPTS.slice(1)] }), needle: "표시 순서" },
  { name: "#10 공짜 소거(미해소 연결사)", md: mdOf({ a: CONNECTIVE_A }), passage: passageOf(GIVEN, P_B, P_C, CONNECTIVE_A), needle: "공짜로 소거" },
  { name: "#12 해설 누락", md: mdOf({ explanation: "" }), needle: "해설 누락" },
  { name: "#12 오답해설 3개", md: mdOf({ wrong: WRONGS.slice(0, 3) }), needle: "오답해설 3개" },

  // ── 적대검수 회귀 · #6-b 문장 경계 절단 불변식(무손실 재구성으로는 안 보인다) ──
  { name: "#6-b 문장 한가운데 절단(접속사 뒤)", md: mdOf({ given: SEAM_G, a: SEAM_A, b: MID_B, c: MID_C }), passage: SEAM_PASSAGE, needle: "문장 경계가 아님" },
  // #2·#5 변형 설정이 켜져도 **주어진 글 축자** 형식 검사가 살아 있어야 한다.
  { name: "#2 변형 켜짐 — 주어진 글 4문장도 반려", md: MD_LONG_GIVEN_WITH_VARIANT, passage: PASSAGE_4, variation: 1, needle: "4문장" },
  { name: "#5 변형 켜짐 — 주어진 글 분량비도 반려", md: MD_LONG_GIVEN_WITH_VARIANT, passage: PASSAGE_4, variation: 1, needle: "단락 평균" },
  // #3·#4 fast 와 탐지 범위 동기 — 소문자 라벨을 놓치면 fast 대비 회귀다.
  { name: "#3 주어진 글에 소문자 라벨 오염", md: GOOD.replace("주어진글: In", "주어진글: (a) In"), needle: "단락 라벨" },
  { name: "#4 단락 본문에 소문자 구조 라벨 (a) 재등장", md: mdOf({ a: A_LOWER_LABEL }), passage: passageOf(GIVEN, P_B, P_C, A_LOWER_LABEL), needle: "구조 라벨" },
  // #12 개수가 아니라 라벨 집합 — 중복은 어댑터 Map 에서 해설을 조용히 삼킨다.
  { name: "#12 오답해설 라벨 중복", md: mdOf({ wrong: DUP_WRONGS }), needle: "라벨 중복" },
  { name: "#12 오답해설 라벨 결손", md: mdOf({ wrong: DUP_WRONGS }), needle: "누락 라벨" },

  // ── 재검증 잔여 결함 · #6-b 약어 마침표는 문장 끝이 아니다(두 검사를 다 우회했다) ──
  { name: "#6-b 약어 마침표(Prof.) 뒤 절단", md: mdOf({ given: SEAM_G, a: SEAM_A, b: ABBREV_B, c: ABBREV_C }), passage: passageOf(SEAM_G, ABBREV_B, ABBREV_C, SEAM_A), needle: "약어" },
  // #6-b 개시어 검사 생존 — 면제식을 넓힌 뒤에도 소문자 개시 중간 절단은 잡혀야 한다.
  { name: "#6-b 종결부호 뒤 소문자 개시 절단", md: mdOf({ given: SEAM_G, a: SEAM_A, b: QUOTE_B, c: QUOTE_C }), passage: passageOf(SEAM_G, QUOTE_B, QUOTE_C, SEAM_A), needle: "소문자" },
  // ── #11 단락 변형 계약 · 라벨은 순서대로 앞에서 N개에만 붙는다 ──────────────
  { name: "#11 변형 설정인데 변형 줄 없음", md: GOOD, variation: 2, needle: "줄이 없음" },
  { name: "#11 변형 꺼짐인데 변형 줄 출력", md: mdOf({ variants: V1 }), needle: "꺼져 있는데" },
  { name: "#11 라벨이 (A)부터 순서대로가 아님((A)(C))", md: mdOf({ variants: { A: VAR_A, C: VAR_C } }), variation: 2, needle: "(A)(B) 가 아님" },
  { name: "#11 설정보다 많은 라벨에 변형", md: mdOf({ variants: V2 }), variation: 1, needle: "(A) 가 아님" },
  { name: "#11-(1) 2번째 문장부터 축자와 다름", md: mdOf({ variants: { A: VAR_TAIL_EDITED } }), variation: 1, needle: "2번째 문장 이후가 축자와 다름" },
  { name: "#11-(2) 첫 문장을 그대로 복사(변형 아님)", md: mdOf({ variants: { A: VAR_COPIED } }), variation: 1, needle: "새 표현이 없음" },
  { name: "#11-(3) 강한 단서(역접·후방참조)가 전부 사라짐", md: mdOf({ variants: { A: VAR_A, B: VAR_B_CUE_LOST } }), variation: 2, needle: "역접·후방참조)가 모두 사라짐" },
  { name: "#11-(3) 되받기가 유일 단서인 (C) 에서 그것이 사라짐", md: mdOf({ variants: { A: VAR_A, B: VAR_B, C: VAR_C_CUE_LOST } }), variation: 3, needle: "후방참조)가 모두 사라짐" },
  { name: "#11-(4) 내용 정박 — 지문 무관 문장", md: mdOf({ variants: { A: VAR_OFFTOPIC } }), variation: 1, needle: "이어지지 않음" },
  { name: "#11-(4) 정박 대상 — 다른 단락의 재진술", md: mdOf({ variants: { A: VAR_OTHER_PARAGRAPH } }), variation: 1, needle: "재진술 대상은 그 단락 자신의 첫 문장" },
  { name: "#11-(4) 지문 축자 구간 복사", md: mdOf({ variants: { A: VAR_SOURCE_COPY } }), variation: 1, needle: "지문 축자 구간을 그대로 옮겨 옴" },
  { name: "#11-(5) 분량 이탈(절삭)", md: mdOf({ variants: { A: VAR_TOO_SHORT } }), variation: 1, needle: "분량 이탈" },
  { name: "#11-(5) 한 문장을 세 문장으로 늘림", md: mdOf({ variants: { A: VAR_THREE_SENTENCES } }), variation: 1, needle: "문장으로 늘림" },
  { name: "#11 변형본 언어 이탈(한국어)", md: mdOf({ variants: { A: VAR_KOREAN } }), variation: 1, needle: "영어 단어가 없음" },
  { name: "#11 변형본에 구조 라벨 오염", md: mdOf({ variants: { A: VAR_BODY_LABEL } }), variation: 1, needle: "구조 라벨" },
  // #10 확장 — 학생이 읽는 것은 변형본이므로 표시면도 공짜 소거 검사를 받는다.
  { name: "#10 변형하며 문두에 연결사를 새로 붙임", md: mdOf({ variants: { A: VAR_ADDED_CONNECTIVE } }), variation: 1, needle: "공짜로 소거" },

  // ── 적대검수 재수리 회귀 — 전부 종전 구현에서 CLEAN 통과하던 입력이다 ─────────
  { name: "#11 단서의 방향 뒤집기(later→earlier) — 표시면이 정답 키와 반대 순서 지시", md: mdOf({ variants: { A: VAR_A, B: VAR_B, C: VAR_C_FLIPPED } }), variation: 3, needle: "방향" },
  { name: "#11 지시 대상 이동(those remarks→those copying errors) — 복수정답", md: mdOf({ variants: { A: VAR_A, B: VAR_B, C: VAR_C_RELOCATED } }), variation: 3, needle: "지시 대상이 앞 조각이 아니라" },
  { name: "#11 that+명사 되받기 소멸(단서 0개로 보여 무검사였던 구간)", md: mdOf({ variants: { A: VAR_A_CHAIN_LOST } }), variation: 1, needle: "후방참조)가 모두 사라짐" },
  { name: "#11 필러 문장 접두 — 암기 대상 첫 문장이 바이트 그대로 생존", md: mdOf({ variants: { A: VAR_A_FILLER } }), variation: 1, needle: "1문장이어야 한다" },
  { name: "#11 축자 첫 문장을 통째로 품은 재진술(구 덧붙임)", md: mdOf({ variants: { A: VAR_A_WRAPPED } }), variation: 1, needle: "통째로 품고 있음" },
  { name: "#11 변형본 선두 순서표식 '1.' — 표시면·인쇄물에 정답 순서 노출", md: mdOf({ variants: { A: VAR_A_NUMBERED } }), variation: 1, needle: "순서 번호" },
  { name: "#11 변형본 선두 원숫자 '②'", md: mdOf({ variants: { A: VAR_A_CIRCLED } }), variation: 1, needle: "순서 번호" },
  { name: "#11 한·영 혼용 변형본(영어 단어는 있다)", md: mdOf({ variants: { A: VAR_A_MIXED } }), variation: 1, needle: "한글이 섞임" },
  { name: "#11 변형 첫 문장 종결부호 누락 — 표시면에서 뒷문장과 융합", md: mdOf({ variants: { A: VAR_A_NO_STOP } }), variation: 1, needle: "종결부호" },
  { name: "#11 단서 0개 첫 문장에서 어휘 사슬을 전부 지움(대체 앵커)", md: lgMd({ A: LG_VAR_A_CHAINLESS }), passage: LG_PASSAGE, variation: 1, needle: "어휘 사슬" },
  { name: "#11 어휘 사슬 — 다른 조각에도 흔한 낱말만 남기면 자리 근거가 아님", md: lgMd({ A: LG_VAR_A_GENERIC }), passage: LG_PASSAGE, variation: 1, needle: "어휘 사슬" },
  // #4·#5 표시면 재집행 — 축자는 완전 균형인데 표시면만 하한 미달·불균형이다.
  { name: "#4 표시면 단락 최소 단어 미달(변형으로 줄임)", md: lgMd({ A: LG_VAR_A_LONG, B: LG_VAR_B_SHORT }), passage: LG_PASSAGE, variation: 2, needle: "표시면 기준 단락 (B) 이 19단어" },
  { name: "#5 표시면 분량 불균형(축자는 균형)", md: lgMd({ A: LG_VAR_A_LONG, B: LG_VAR_B_SHORT }), passage: LG_PASSAGE, variation: 2, needle: "표시면 기준 단락 분량 불균형" },
];
for (const r of REJECTS) {
  const issues = gateOf(r.md, r.passage ?? PASSAGE, r.variation ?? 0);
  check(`게이트 ${r.name} 반려`, issues.some((i) => i.includes(r.needle)), issues.join(" / ") || "(이슈 없음)");
}
check("게이트 #12 오답해설에 정답 번호 포함 반려", gateMdSentenceOrder({ ...snapped.question, wrong: [...snapped.question.wrong, { label: "③", text: "정답인데 끼어듦" }] }, PASSAGE).some((i) => i.includes("정답 번호 포함")));

// ── 짝 대조(오탐 금지) — 새·기존 게이트가 정상 문항을 잡지 않는다는 실증 ──────
// absent 가 있으면 "그 진단만 없으면 통과"(다른 축의 반려는 무관), 없으면 완전 클린.
const CLEANS: Array<{ name: string; md: string; passage?: string; variation?: number; absent?: string[] }> = [
  { name: "#6-b 문장 경계 절단은 클린 — 같은 지문·같은 조각, 절단선만 마침표 뒤", md: mdOf({ given: SEAM_G, a: SEAM_A, b: SEAM_B, c: SEAM_C }), passage: SEAM_PASSAGE },
  { name: "#4 직접 인용된 라벨 토큰 면제(fast 등가) — 축자 의무 유형의 탈출 불가 반려 방지", md: mdOf({ a: A_QUOTED_LABEL }), passage: passageOf(GIVEN, P_B, P_C, A_QUOTED_LABEL) },
  { name: "#10 'Yet another …' 는 한정사구 — 공짜 소거 오탐 없음", md: mdOf({ a: A_YET_OK }), passage: passageOf(GIVEN, P_B, P_C, A_YET_OK), absent: ["공짜로 소거"] },
  { name: "#10 정답 첫 단락은 연결사 예외 — (B)가 'But' 으로 시작해도 통과", md: GOOD, absent: ["공짜로 소거"] },
  // #11 정상 경로 — 0/1/2/3 전 구간이 완전 클린이어야 한다(노브가 실제로 작동한다).
  { name: "#11 변형 0개 — 축자 전용 경로 클린(무회귀)", md: GOOD, variation: 0 },
  ...([[1, V1], [2, V2], [3, V3]] as const).map(([n, v]) => ({ name: `#11 변형 ${n}개 ${LABELS.slice(0, n).map((l) => `(${l})`).join("")} 클린`, md: mdOf({ variants: v }), variation: n })),
  { name: "#11 변형본의 직접 인용된 라벨 토큰 면제(fast 등가)", md: mdOf({ variants: { A: VAR_QUOTED_LABEL } }), variation: 1 },
  // 단서 보존 오탐 금지 — 강한 단서 하나가 남으면 나머지가 떨어져도 순서는 결정된다.
  ...VAR_B_KEPT.map(([n, b]) => ({ name: `#11 ${n} 강한 단서가 남으면 통과`, md: mdOf({ variants: { A: VAR_A, B: b } }), variation: 2 })),

  // ── 재수리 오탐 금지 짝 — 새 검사가 정상 재진술을 잡지 않는다는 실증 ──────────
  // (C) 변형본은 시간 방향(Later·in turn)을 유지하고 지시어 머리명사만 동의어로 바꾼다
  // (those remarks → those same notes) — 방향 검사도 선행어 검사도 여기서 침묵해야 한다.
  { name: "#11 방향 유지 + 지시어 동의어 교체는 통과(새 검사 2종 오탐 금지)", md: mdOf({ variants: V3 }), variation: 3, absent: ["방향", "지시 대상이 앞 조각이 아니라"] },
  { name: "#11 되받기를 유지한 재진술은 통과(that layered record 보존)", md: mdOf({ variants: { A: VAR_A } }), variation: 1 },
  { name: "#10 축자가 'However' 로 시작해도 변형본이 자립화했으면 통과(탈출 불가 반려 제거)", md: mdOf({ a: CONNECTIVE_A, variants: { A: VAR_A_DECONNECTED } }), passage: passageOf(GIVEN, P_B, P_C, CONNECTIVE_A), variation: 1 },
  { name: "#4·#5 표시면 재집행 오탐 금지 — 분량을 지킨 변형은 통과", md: lgMd({ A: LG_VAR_A_OK, B: LG_VAR_B_OK }), passage: LG_PASSAGE, variation: 2 },
  { name: "#11 단서 0개 첫 문장이라도 어휘 사슬을 하나 남기면 통과(records 보존)", md: lgMd({ A: LG_VAR_A_OK }), passage: LG_PASSAGE, variation: 1 },
  { name: "표시면 전용 지문: 변형 0 이면 축자 전 구간 클린(무회귀)", md: lgMd(), passage: LG_PASSAGE, variation: 0 },

  // ── 오탐 금지 짝 · #6-b 소문자 고유명사·단어내 대문자는 중간 절단이 아니다 ─────
  ...LOWER_OPENERS.map((head) => ({ name: `#6-b 소문자 시작 고유명사 오탐 없음 — '${head.split(" ")[0]}'`, md: mdOf({ b: bOpener(head) }), passage: passageOf(GIVEN, bOpener(head), P_C, P_A) })),
  // #6-b 약어가 조각 **안**에 있으면 무관 / 문장을 실제로 끝낼 수 있는 약어는 목록 제외.
  { name: "#6-b 같은 지문, 약어를 조각 안에 두면 클린", md: mdOf({ given: SEAM_G, a: SEAM_A, b: ABBREV_OK_B, c: SEAM_C }), passage: passageOf(SEAM_G, ABBREV_OK_B, SEAM_C, SEAM_A) },
  { name: "#6-b 문장이 실제로 'U.S.' 로 끝나면 클린(문장 종결 가능 약어는 제외)", md: mdOf({ given: SEAM_G, a: SEAM_A, b: SEAM_B, c: US_C }), passage: passageOf(SEAM_G, SEAM_B, US_C, SEAM_A) },
  // #3 단락 경로에만 있던 가드(인접 문자·직접 인용 면제)를 주어진 글 경로에도 이식.
  { name: "#3 주어진 글의 직접 인용된 라벨 토큰 면제", md: mdOf({ given: QUOTED_GIVEN }), passage: passageOf(QUOTED_GIVEN, P_B, P_C, P_A) },
  { name: "#3 주어진 글의 f(A) 는 구조 라벨이 아님(인접 문자 가드)", md: mdOf({ given: ADJACENT_GIVEN }), passage: passageOf(ADJACENT_GIVEN, P_B, P_C, P_A) },
];
for (const c of CLEANS) {
  const issues = gateOf(c.md, c.passage ?? PASSAGE, c.variation ?? 0);
  const ok = c.absent ? !issues.some((i) => c.absent!.some((a) => i.includes(a))) : issues.length === 0;
  check(`게이트 ${c.name}`, ok, issues.join(" / "));
}
check("게이트 #10 'Yet the …' 는 여전히 반려(좁힌 예외가 게이트를 무너뜨리지 않음)", gateOf(mdOf({ a: A_YET_BAD }), passageOf(GIVEN, P_B, P_C, A_YET_BAD)).some((i) => i.includes("공짜로 소거")));
{
  // #12 정답 미확정 입력에서는 '정답을 뺀 나머지' 기준 동반 진단을 내지 않는다(need 가
  // 선지 5개가 되어 '오답해설 4개 (5개 필요)' 같은 거짓 요구가 재생성으로 주입됐다).
  const noise = (i: string) => /오답해설 \d+개|누락 라벨/.test(i);
  const noAnswer = gateOf(GOOD.replace(/^정답: ③$/m, ""));
  check("게이트 #12 정답 누락 입력엔 거짓 동반 진단 없음", noAnswer.some((i) => i.includes("정답 누락")) && !noAnswer.some(noise), noAnswer.join(" / "));
  const alienAnswer = gateMdSentenceOrder({ ...snapped.question, answer: "⑨" }, PASSAGE);
  check("게이트 #12 정답 라벨이 선지 밖인 입력도 동일", alienAnswer.some((i) => i.includes("선지에 없음")) && !alienAnswer.some(noise), alienAnswer.join(" / "));
  const alienWrong = gateMdSentenceOrder({ ...snapped.question, answer: "", wrong: [...snapped.question.wrong, { label: "⑨", text: "선지에 없는 라벨" }] }, PASSAGE);
  check("게이트 #12 정답 미확정이어도 선지 밖 라벨·중복은 계속 잡는다", alienWrong.some((i) => i.includes("선지에 없는 라벨: ⑨")) && !alienWrong.some(noise), alienWrong.join(" / "));
}

// 3. 드리프트 관용 · 0원 스냅
check("파서 관용: '단락 (A) ：' 전각 콜론·공백 표기 흡수", parseMdSentenceOrder(GOOD.replace("단락(A):", "단락 (A) ：")).paragraphs.length === 3);
check("파서 관용: 괄호 없는 순열 'B-C-A' 흡수", parseMdSentenceOrder(GOOD.replace("③ (B)-(C)-(A)", "③ B-C-A")).options[2].order.join("") === "(B)(C)(A)");
{
  const q = parseMdSentenceOrder(GOOD.replace(`단락(B): ${P_B}`, `단락(B):\n${P_B}`));
  check("파서 관용: 단락 본문 개행 드리프트 흡수", q.paragraphs.length === 3 && q.paragraphs[1].text === P_B, q.paragraphs.map((p) => p.text.slice(0, 12)).join(" | "));
}
{
  // 제시 순서 뒤바뀜 — 라벨이 진실원이므로 (A)(B)(C) 로 정렬한다.
  const drift = [`주어진글: ${GIVEN}`, `단락(B): ${P_B}`, `단락(A): ${P_A}`, `단락(C): ${P_C}`, ...OPTS, "정답: ③", `해설: ${EXPLANATION}`, "오답:", ...WRONGS].join("\n");
  const s = autoSnapOrderChunks(parseMdSentenceOrder(drift), PASSAGE);
  check("스냅: 단락 제시 순서 (A)(B)(C) 정렬", s.corrections.some((c) => c.includes("정렬")) && s.question.paragraphs.map((p) => p.label).join("") === "(A)(B)(C)", s.corrections.join(" / "));
  check("스냅 후 게이트 클린(정렬)", gateMdSentenceOrder(s.question, PASSAGE).length === 0);
}
{
  // 구두점 정규화 드리프트 — em-dash 를 하이픈으로 바꿔 적은 실측 패턴.
  const s = autoSnapOrderChunks(parseMdSentenceOrder(GOOD.replace("conversation—each", "conversation-each")), PASSAGE);
  check("스냅: 구두점 드리프트를 원문 축자로 복원", s.corrections.some((c) => c.includes("구두점")) && s.question.paragraphs[2].text.includes("—"), s.corrections.join(" / "));
  check("스냅 후 게이트 클린(구두점 복원)", gateMdSentenceOrder(s.question, PASSAGE).length === 0);
}
{
  // 적대검수 회귀 — 스냅이 축자 줄만 보정하면 같은 드리프트를 쓴 변형 줄과 어긋나
  // #11-(1) 이 반려한다. variation=0 이면 조용히 흡수되던 드리프트가 설정 하나 때문에
  // 잡 실패·환불이 되던 비대칭이다. 이제 변형본 꼬리도 같은 축으로 함께 옮긴다.
  const driftB = P_B.replace("correct it, and their remarks", "correct it and their remarks");
  const md = [`주어진글: ${GIVEN}`, `단락(A): ${P_A}`, `단락(A,변형): ${VAR_A}`, `단락(B): ${driftB}`, `단락(B,변형): ${restate(driftB, "Yet such a narrow use soon broadened.")}`, `단락(C): ${P_C}`, ...OPTS, "정답: ③", `해설: ${EXPLANATION}`, "오답:", ...WRONGS].join("\n");
  const s = autoSnapOrderChunks(parseMdSentenceOrder(md), PASSAGE);
  const after = gateMdSentenceOrder(s.question, PASSAGE, { prefixVariationCount: 2 });
  check("스냅: 축자 보정 시 변형본 꼬리도 함께 보정", s.corrections.some((c) => c.includes("변형본 꼬리")) && s.question.variants[1].text === VAR_B, s.corrections.join(" / "));
  check("스냅 후 게이트 클린(변형 켜짐 · 구두점 드리프트)", after.length === 0, after.join(" / "));
}
{
  // 적대검수 회귀 — 변형 줄만 개행 폴백이 없어, 같은 드리프트가 축자 줄에서는 흡수되고
  // 변형 줄에서는 절삭 → 반려였다. 확장은 '한 줄 포획이 문장 미완결' 일 때만 한다.
  const folded = mdOf({ variants: V1 }).replace(`단락(A,변형): ${VAR_A}`, `단락(A,변형): ${VAR_A_HEAD} A crowded margin can reveal a whole community of readers\nwhose names appear in no catalogue at all.`);
  const q = parseMdSentenceOrder(folded);
  check("파서 관용: 변형 줄 개행 드리프트 흡수(축자 줄과 같은 2단 전략)", q.variants.length === 1 && q.variants[0].text === VAR_A, q.variants[0]?.text.slice(-40));
  check("파서 보수 가드: 문장이 완결된 한 줄은 확장하지 않음(뒤 라인 삼킴 방지)", parseMdSentenceOrder(mdOf({ variants: V1 })).variants[0].text === VAR_A);
  check("게이트: 개행 드리프트 흡수 후 클린", gateOf(folded, PASSAGE, 1).length === 0, gateOf(folded, PASSAGE, 1).join(" / "));
}
{
  // 보수 가드 — 단어 수준 재작성은 스냅이 건드리지 않고 게이트가 반려한다.
  const s = autoSnapOrderChunks(parseMdSentenceOrder(GOOD.replace("a slow conversation", "a lengthy conversation")), PASSAGE);
  check("스냅 보수 가드: 단어 재작성은 무보정 + 게이트 반려", s.corrections.length === 0 && gateMdSentenceOrder(s.question, PASSAGE).some((i) => i.includes("축자 분할이 아님")));
}

// 4. 어댑터 → 저장 형상 → 후처리(PASSTHROUGH) → 품질 검증기 → DOCX 역파싱 왕복
{
  const adapt = adaptMdSentenceOrderToAiQuestion(snapped.question, PASSAGE, "KILLER");
  check("어댑터: 성공", adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  const paras = ai.paragraphs as Array<Record<string, unknown>>;
  const opts = ai.options as Array<Record<string, unknown>>;
  const woe = ai.wrongOptionExplanations as Array<Record<string, unknown>>;
  check("어댑터: paragraphs[].label 리터럴 (A)(B)(C)", paras.map((p) => p.label).join("") === "(A)(B)(C)");
  check("어댑터: paragraphs[].text 지문 축자", paras.every((p) => PASSAGE.includes(String(p.text))));
  check("어댑터: givenSentence 축자(변형 off)", ai.givenSentence === GIVEN);
  check("어댑터: options 라벨 '1'~'5' 숫자축", opts.length === 5 && opts[0].label === "1" && opts[4].label === "5");
  check("어댑터: options 텍스트가 순열 리터럴로 재조립", opts.map((o) => String(o.text)).join(" ") === "(A)-(C)-(B) (B)-(A)-(C) (B)-(C)-(A) (C)-(A)-(B) (C)-(B)-(A)", opts.map((o) => String(o.text)).join(" "));
  check("어댑터: correctAnswer '3'", ai.correctAnswer === "3", String(ai.correctAnswer));
  check("어댑터: 오답해설 4개 · 숫자 라벨 · 정답 미포함", woe.length === 4 && woe.map((w) => String(w.label)).join(",") === "1,2,4,5", woe.map((w) => String(w.label)).join(","));
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check("어댑터: 이물 필드 없음(빈칸 계열·passageWith*)", !("blanks" in ai) && !("passageWithBlank" in ai) && !("passageWithMarkers" in ai) && !("originalExpression" in ai));

  const pp = postProcessQuestion("SENTENCE_ORDER", PASSAGE, ai as never);
  check("후처리: PASSTHROUGH 성공", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  check("후처리: 지문 필드를 만들지 않음(PASSTHROUGH 계약)", !("passageWithMarkers" in data) && !("passageWithBlank" in data));
  const woeRecord = data.wrongOptionExplanations;
  check("후처리: wrongOptionExplanations Record 정규화", !!woeRecord && typeof woeRecord === "object" && !Array.isArray(woeRecord) && Object.keys(woeRecord as object).join(",") === "1,2,4,5", JSON.stringify(woeRecord).slice(0, 80));

  const issues = validateQuestionQuality({
    typeId: "SENTENCE_ORDER", question: { ...data, difficulty: "KILLER" }, passage: PASSAGE, requestedDifficulty: "KILLER",
    ...SENTENCE_ORDER_MD_LANE.qualityArgs({ rawTypeSettings: null } as unknown as MdLaneContext),
  });
  const errors = issues.filter((i) => i.severity === "error");
  check("품질 검증기: error 0 (fast 검증기 왕복)", errors.length === 0, errors.map((e) => e.code).join(" / "));

  // ── DOCX 역파싱 왕복(정찰 R6 필수) ──────────────────────────────────────
  const questionText = buildGeneratedQuestionText({ ...data, _typeId: "SENTENCE_ORDER" });
  check("직렬화: [주어진 문장] 헤더 + (A)(B)(C) 줄", questionText.includes("[주어진 문장] ") && questionText.includes(`(A) ${P_A}`) && questionText.includes(`(C) ${P_C}`), questionText.slice(0, 120));
  const segs = sentenceOrderSegmentsFromQuestionText(questionText);
  const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
  check("DOCX 역파싱: given 박스 + 단락 3개 복원", segs.length === 4 && segs[0].kind === "box" && segs.slice(1).every((s) => s.kind === "para"), segs.map((s) => s.kind).join(","));
  check("DOCX 역파싱 왕복: given 일치", segs[0].kind === "box" && collapse(segs[0].text) === collapse(GIVEN), segs[0].kind === "box" ? segs[0].text.slice(0, 60) : "");
  check("DOCX 역파싱 왕복: 단락 라벨·본문 일치", segs.slice(1).every((s, i) => s.kind === "para" && s.label === ["(A)", "(B)", "(C)"][i] && collapse(s.text) === collapse([P_A, P_B, P_C][i])), segs.slice(1).map((s) => (s.kind === "para" ? `${s.label}:${s.text.slice(0, 16)}` : s.kind)).join(" | "));
}
{
  // 변형 모드 어댑터 — 학생 표면(=저장 형상)에는 변형본이, 게이트에는 축자 줄이 쓰인다.
  const q = autoSnapOrderChunks(parseMdSentenceOrder(mdOf({ variants: V2 })), PASSAGE).question;
  const ai = (adaptMdSentenceOrderToAiQuestion(q, PASSAGE, "KILLER", "PARAGRAPH_VARIANT").aiQuestion ?? {}) as Record<string, unknown>;
  const texts = (ai.paragraphs as Array<Record<string, unknown>>).map((p) => String(p.text));
  check("어댑터(변형): 변형본이 있는 라벨만 변형본, 없으면 축자", texts.join("|") === [VAR_A, VAR_B, P_C].join("|"), texts.map((t) => t.slice(0, 24)).join(" | "));
  check("어댑터(변형): givenSentence 는 언제나 축자(주어진 글은 변형 대상이 아니다)", ai.givenSentence === GIVEN, String(ai.givenSentence).slice(0, 50));
  check("어댑터(변형): paragraphs[].label 리터럴 유지", (ai.paragraphs as Array<Record<string, unknown>>).map((p) => p.label).join("") === "(A)(B)(C)");
  check("어댑터(변형): 변형 단락은 첫 문장만 다르고 나머지는 지문 축자", texts[0].endsWith(tailOf(P_A)) && texts[1].endsWith(tailOf(P_B)) && !PASSAGE.includes(texts[0]));
  const exact = (adaptMdSentenceOrderToAiQuestion(q, PASSAGE, "KILLER").aiQuestion ?? {}) as Record<string, unknown>;
  check("어댑터: SOURCE_EXACT 모드는 변형 줄이 있어도 축자를 싣는다(무회귀 가드)", (exact.paragraphs as Array<Record<string, unknown>>).map((p) => String(p.text)).join("|") === [P_A, P_B, P_C].join("|"));

  // 변형 문항의 품질 검증기 왕복 — filterQualityIssues 의 근거를 실측으로 고정한다.
  const pp = postProcessQuestion("SENTENCE_ORDER", PASSAGE, ai as never);
  const errs = validateQuestionQuality({
    typeId: "SENTENCE_ORDER", question: { ...((pp.data ?? {}) as Record<string, unknown>), difficulty: "KILLER" }, passage: PASSAGE, requestedDifficulty: "KILLER",
    ...SENTENCE_ORDER_MD_LANE.qualityArgs({ rawTypeSettings: null } as unknown as MdLaneContext),
  }).filter((i) => i.severity === "error").map((i) => i.code);
  check("품질 검증기(변형): 발화 코드는 paragraph-not-source-backed 하나뿐 — 나머지 축은 전부 통과", errs.join(",") === "sentence-order-paragraph-not-source-backed", errs.join(" / ") || "(없음)");
  const laneCtx = (variation: number) => ({ resolved: { sentenceOrderPrefixVariationCount: variation } }) as unknown as MdLaneContext;
  check("레인 filterQualityIssues: variation>0 이면 설계상 필연 코드만 제외", JSON.stringify(SENTENCE_ORDER_MD_LANE.filterQualityIssues?.([...errs, "sentence-order-answer-key-mismatch"], laneCtx(2))) === JSON.stringify(["sentence-order-answer-key-mismatch"]));
  check("레인 filterQualityIssues: variation=0 이면 한 건도 걸러내지 않는다(진짜 결함)", JSON.stringify(SENTENCE_ORDER_MD_LANE.filterQualityIssues?.(errs, laneCtx(0))) === JSON.stringify(errs));
}
check("어댑터: 단락 2개면 실패(형상 방어)", adaptMdSentenceOrderToAiQuestion({ ...snapped.question, paragraphs: snapped.question.paragraphs.slice(0, 2) }, PASSAGE, "KILLER").ok === false);
check("어댑터: 정답 라벨이 선지에 없으면 실패", adaptMdSentenceOrderToAiQuestion({ ...snapped.question, answer: "⑨" }, PASSAGE, "KILLER").ok === false);
{
  // 오답해설 중복 라벨 방어 — 종전 Map 은 뒤 값이 이겨 해설 1건이 조용히 사라졌다.
  const dup = autoSnapOrderChunks(parseMdSentenceOrder(mdOf({ wrong: DUP_WRONGS })), PASSAGE).question;
  const r = adaptMdSentenceOrderToAiQuestion(dup, PASSAGE, "KILLER");
  check("어댑터: 오답해설 중복 라벨이면 실패(조용한 해설 소실 금지)", r.ok === false, JSON.stringify(r.aiQuestion ?? {}).slice(0, 80));
}

// 5. 레인 계약 — 과금 · 적격성 · 설정 집행 · 난이도 3분기 · end-to-end
const ctxOf = (over: Partial<MdLaneContext> = {}): MdLaneContext =>
  ({
    passage: PASSAGE,
    difficulty: "KILLER",
    rawDifficulty: "KILLER",
    resolved: {},
    rawTypeSettings: null,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
    ...over,
  }) as MdLaneContext;

check("레인: subType SENTENCE_ORDER", SENTENCE_ORDER_MD_LANE.subType === "SENTENCE_ORDER");
check("레인: 과금 QUESTION_GEN_SINGLE (2크레딧)", SENTENCE_ORDER_MD_LANE.operationType === "QUESTION_GEN_SINGLE" && CREDIT_COSTS.QUESTION_GEN_SINGLE === 2, String(SENTENCE_ORDER_MD_LANE.operationType));
check("레인: retryEligible", SENTENCE_ORDER_MD_LANE.retryEligible === true);
check("레인: 적격성 — prefixVariationCount 0~3 전 범위 승차(2단 출력으로 해소)", [{}, { sentenceOrderPrefixVariationCount: 0 }, { sentenceOrderPrefixVariationCount: 3 }].every((r) => SENTENCE_ORDER_MD_LANE.isEligible(r)) && [4, -1].every((n) => !SENTENCE_ORDER_MD_LANE.isEligible({ sentenceOrderPrefixVariationCount: n })));
{
  // 회피 표적은 **비축자 절단 좌표**여야 한다 — 지문 축자를 넘기면 라우트의 "겹치지 않게
  // 하라" 헤더 아래에서 축자 분할 계약과 정면충돌해 재생성까지 같은 반려로 수렴한다.
  const targets = SENTENCE_ORDER_MD_LANE.diversityTargets({ givenSentence: GIVEN, paragraphs: [{ text: P_A }, { text: P_B }, { text: P_C }] });
  check("레인: diversityTargets 는 절단 좌표 1건(축자 스팬 금지)", targets.length === 1 && targets[0].includes("절단 좌표"), targets.join(" | "));
  check("레인: diversityTargets 에 지문 축자(영문)가 섞이지 않음 — 무손실 축자 분할 계약과 무충돌", targets.every((t) => !/[A-Za-z]{3,}/.test(t) && !PASSAGE.includes(t)), targets.join(" | "));
  check("레인: diversityTargets — 구조 결손 입력이면 빈 배열", SENTENCE_ORDER_MD_LANE.diversityTargets({}).length === 0 && SENTENCE_ORDER_MD_LANE.diversityTargets({ givenSentence: GIVEN }).length === 0);
}
check("레인: mdFormat 포렌식 메타(변형 라벨 포함)", JSON.stringify(SENTENCE_ORDER_MD_LANE.mdFormat(ctxOf({ resolved: { sentenceOrderPrefixVariationCount: 2, sentenceOrderPointFocus: true } }))) === JSON.stringify({ prefixVariationCount: 2, variantLabels: ["(A)", "(B)"], pointFocus: true, paragraphCount: 3, optionCount: 5 }), JSON.stringify(SENTENCE_ORDER_MD_LANE.mdFormat(ctxOf({ resolved: { sentenceOrderPrefixVariationCount: 2, sentenceOrderPointFocus: true } }))));
check("레인: mdFormat 변형 0 이면 variantLabels 빈 배열", JSON.stringify(SENTENCE_ORDER_MD_LANE.mdFormat(ctxOf()).variantLabels) === "[]");
check("레인: qualityArgs 에 언어 실값", JSON.stringify(SENTENCE_ORDER_MD_LANE.qualityArgs(ctxOf())) === JSON.stringify({ stemLanguage: "ko", optionLanguage: "en" }), JSON.stringify(SENTENCE_ORDER_MD_LANE.qualityArgs(ctxOf())));
check("레인: buildExtras — pointFocus off 면 빈 배열", SENTENCE_ORDER_MD_LANE.buildExtras(ctxOf()).length === 0);
check("레인: buildExtras — pointFocus on 이면 응집장치 가이드 주입", SENTENCE_ORDER_MD_LANE.buildExtras(ctxOf({ resolved: { sentenceOrderPointFocus: true } })).some((e) => e.includes("응집장치")));
check("레인: buildExtras — 발문 영어 설정 집행", SENTENCE_ORDER_MD_LANE.buildExtras(ctxOf({ rawTypeSettings: { SENTENCE_ORDER: { stemLanguage: "en" } } })).some((e) => e.includes("질문 언어")));
check("레인: buildBasePrompt 가 변형 설정을 프롬프트로 전달", SENTENCE_ORDER_MD_LANE.buildBasePrompt(ctxOf({ resolved: { sentenceOrderPrefixVariationCount: 3 } })).includes("## 단락 첫 문장 변형"));
{
  const laneParsed = SENTENCE_ORDER_MD_LANE.parseAndGate(GOOD, ctxOf());
  check("레인 end-to-end: 게이트 클린", laneParsed.gateIssues.length === 0, laneParsed.gateIssues.join(" / "));
  const laneAdapt = SENTENCE_ORDER_MD_LANE.adapt(laneParsed, ctxOf());
  check("레인 end-to-end: 어댑터 성공", laneAdapt.ok === true, laneAdapt.error);
  const enAdapt = SENTENCE_ORDER_MD_LANE.adapt(laneParsed, ctxOf({ rawTypeSettings: { SENTENCE_ORDER: { stemLanguage: "en" } } }));
  check("레인 end-to-end: 영어 발문 어댑터 반영", /^Which is the most appropriate order/.test(String((enAdapt.aiQuestion as Record<string, unknown>).direction)));
  for (const [n, variants] of [[1, V1], [2, V2], [3, V3]] as const) {
    const variantCtx = ctxOf({ resolved: { sentenceOrderPrefixVariationCount: n } });
    const variantParsed = SENTENCE_ORDER_MD_LANE.parseAndGate(mdOf({ variants }), variantCtx);
    check(`레인 end-to-end(변형 ${n}): 게이트 클린`, variantParsed.gateIssues.length === 0, variantParsed.gateIssues.join(" / "));
    const ai = SENTENCE_ORDER_MD_LANE.adapt(variantParsed, variantCtx).aiQuestion as Record<string, unknown>;
    const want = [VAR_A, VAR_B, VAR_C].map((v, i) => (i < n ? v : [P_A, P_B, P_C][i]));
    check(`레인 end-to-end(변형 ${n}): 앞 ${n}개 단락만 변형본, givenSentence 는 축자`, (ai.paragraphs as Array<Record<string, unknown>>).map((p) => String(p.text)).join("|") === want.join("|") && ai.givenSentence === GIVEN);
    // DOCX 왕복 — 변형본이 인쇄물까지 그대로 간다(PASSTHROUGH 라 후처리 보정이 없다).
    const data = (postProcessQuestion("SENTENCE_ORDER", PASSAGE, ai as never).data ?? {}) as Record<string, unknown>;
    const segs = sentenceOrderSegmentsFromQuestionText(buildGeneratedQuestionText({ ...data, _typeId: "SENTENCE_ORDER" }));
    const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
    check(`DOCX 역파싱 왕복(변형 ${n}): 단락 본문이 변형본으로 복원`, segs.length === 4 && segs.slice(1).every((s, i) => s.kind === "para" && collapse(s.text) === collapse(want[i])), segs.map((s) => (s.kind === "para" ? s.text.slice(0, 18) : "box")).join(" | "));
  }
}
{
  // 교사 지정 포인트 준수 — 이음매(단락 시작/끝) 또는 주어진 글에 있어야 한다.
  const ok = SENTENCE_ORDER_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ teacherPoints: [{ text: "But this narrow role soon widened.", unit: "sentence" } as never] }),
  );
  check("레인: 교사 포인트 — 단락 시작 문장은 준수", ok.gateIssues.length === 0, ok.gateIssues.join(" / "));
  const ng = SENTENCE_ORDER_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ teacherPoints: [{ text: "their remarks filled the space that copyists had once reserved", unit: "sentence" } as never] }),
  );
  check("레인: 교사 포인트 — 단락 한가운데 지정은 반려", ng.gateIssues.some((i) => i.includes("교사 지정")), ng.gateIssues.join(" / "));

  // 적대검수 회귀 — 변형은 정확히 '단락 첫 문장'을 갈아 끼우므로, 교사가 이음매에
  // 지정한 문장이 표시·저장본에서 사라지는데도 축자 기준으로는 '준수'로 통과했다.
  const seamPoint = [{ text: "But this narrow role soon widened.", unit: "sentence" } as never];
  const seamGate = (v: Variants, n: number) => SENTENCE_ORDER_MD_LANE.parseAndGate(mdOf({ variants: v }), ctxOf({ teacherPoints: seamPoint, resolved: { sentenceOrderPrefixVariationCount: n } })).gateIssues;
  const [clash, noClash] = [seamGate(V2, 2), seamGate(V1, 1)];
  check("레인: 교사 포인트 — 변형이 그 문장을 지우면 반려(표시면 기준 판정)", clash.some((i) => i.includes("표시면에서 사라짐")), clash.join(" / ") || "(없음)");
  check("레인: 교사 포인트 — 변형 대상이 아닌 단락의 이음매는 그대로 준수(오탐 금지)", noClash.length === 0, noClash.join(" / "));
  const shown = orderDisplayParagraphs(autoSnapOrderChunks(parseMdSentenceOrder(mdOf({ variants: V2 })), PASSAGE).question);
  check("레인: 교사 포인트 반려의 근거 — 그 문장이 실제로 표시면에 없다", !shown.some((p) => p.text.includes("But this narrow role soon widened.")), shown.map((p) => p.text.slice(0, 18)).join(" | "));
}

for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdSentenceOrderPrompt(PASSAGE, "full", d);
  check(`프롬프트 ${d}: 난이도 분기 + 형식 리터럴 + 지문 포함`, p.includes("절단선 설계") && p.includes("주어진글: <") && p.includes("단락(C): <") && p.includes("## 지문") && p.includes(PASSAGE.slice(0, 40)));
}
check("프롬프트: BASIC 은 few-shot 생략 · KILLER 는 해부 포함(정본 관습)", !buildMdSentenceOrderPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") && buildMdSentenceOrderPrompt(PASSAGE, "full", "KILLER").includes("모범 설계 해부"));
const promptOf = (n: number) => buildMdSentenceOrderPrompt(PASSAGE, "full", "KILLER", { prefixVariationCount: n });
check("프롬프트: 변형 0 이면 변형 줄 지시 없음 · 주어진 글은 언제나 축자 한 줄", !promptOf(0).includes("변형):") && !promptOf(0).includes("## 단락 첫 문장 변형") && promptOf(0).includes("주어진글: <"));
check(
  "프롬프트: 변형 N 이면 라벨 순서대로 앞 N개 단락에만 변형 줄",
  [1, 2, 3].every((n) => {
    const p = promptOf(n);
    const has = (l: string) => p.includes(`단락(${l},변형): <`);
    return p.includes("## 단락 첫 문장 변형") && ["A", "B", "C"].every((l, i) => has(l) === i < n);
  }) && !promptOf(2).includes("주어진글(변형)"),
);
check("프롬프트: 변형 설정 클램프(99→3, -1→0)", promptOf(99).includes("단락(C,변형): <") && !promptOf(-1).includes("## 단락 첫 문장 변형"));
check(
  "프롬프트: dispatchers 서사 이식 — 단서 종류·방향 보존 / anti-aliasing / 나머지 문장 축자",
  ["종류와 방향", "같은 선행어", "anti-aliasing", "**유일한** 정답으로 남아야", "2번째 문장부터는 축자 줄과"].every((s) => promptOf(2).includes(s)),
  ["종류와 방향", "같은 선행어", "anti-aliasing", "**유일한** 정답으로 남아야", "2번째 문장부터는 축자 줄과"].filter((s) => !promptOf(2).includes(s)).join(" | "),
);
check(
  "프롬프트: 변형 블록이 게이트 #11 규칙(복사·타단락 재진술·무관·언어·문장수·분량)을 명시",
  ["그대로 복사", "다른 단락을 재진술한 문장", "공통 내용어가 없는", "영어가 아닌 문장", "여러 문장으로 늘리기", "0.6~1.7배"].every((s) => promptOf(1).includes(s)),
);
check("프롬프트: 자기검산에 변형 항목 추가(뒷문장 축자·단서 생존·유일성 재검)", ["2번째 문장 이후**가", "그대로 살아 있는가", "정답이 여전히 **유일**"].every((s) => promptOf(1).includes(s)));
const REPAIR_NEEDLES = ["방향을 뒤집지 마라", "되받는 대상을 바꾸지 마라", "어휘 사슬이 유일한 자리 근거", "정확히 1문장", "마침표(또는 ?!)로 끝난다", "가장 긴 쪽 ÷ 가장 짧은 쪽 1.9 이하", "순서 번호(1. / ②)", "한글을 한 글자라도 섞지 마라", "그대로 둔 채** 앞뒤에 문장·구를 덧붙이기"];
check("프롬프트: 재수리로 켜진 게이트 축 예고(방향·선행어·어휘 사슬·1문장·종결부호·표시 분량·순서번호·한글)", REPAIR_NEEDLES.every((s) => promptOf(2).includes(s)), REPAIR_NEEDLES.filter((s) => !promptOf(2).includes(s)).join(" | "));
check("프롬프트: 자기검산에 변형본 분량·문장 수 재검 추가", ["**1문장**인가", "24단어 이상·최대/최소 1.9배"].every((s) => promptOf(1).includes(s)));
check("프롬프트: 변형 켜져도 난이도 3분기 유지", (["BASIC", "INTERMEDIATE", "KILLER"] as const).every((d) => buildMdSentenceOrderPrompt(PASSAGE, "full", d, { prefixVariationCount: 2 }).includes("절단선 설계")));
check("프롬프트: answer-only 모드는 오답 섹션 미요구", !buildMdSentenceOrderPrompt(PASSAGE, "answer-only", "KILLER").includes("\n오답:\n"));
for (const d of ["BASIC", "INTERMEDIATE"] as const) {
  const p = buildMdSentenceOrderPrompt(PASSAGE, "full", d);
  check(`프롬프트 ${d}: 게이트 #10(공짜 소거)과 무충돌 — 단락 첫머리 개시어를 권장하지 않음`, !p.includes("단락 첫머리의 시간 표지") && p.includes("문장 안쪽") && p.includes("문장 경계(마침표 뒤)"));
}
check("프롬프트: 자기검산이 게이트 #6-b 3축(대문자 개시·소문자 고유명사 예외·약어 마침표)과 동기", ["첫 글자가 대문자", "von Neumann", "약어의 마침표"].every((s) => buildMdSentenceOrderPrompt(PASSAGE, "full", "KILLER").includes(s)));
check("프롬프트: 공짜 소거·무손실 4등분·자기검산 블록 존재(7블록 골격)", ["## 무손실 4등분", "## 공짜 소거 금지", "## 마감", "## 출력 전 자기검산", "## 출력 형식"].every((h) => buildMdSentenceOrderPrompt(PASSAGE, "full", "KILLER").includes(h)));

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
