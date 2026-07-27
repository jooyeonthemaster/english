// 문맥 속 의미(CONTEXT_MEANING) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → processContextMeaning 왕복 → 셔플 → 품질검증 →
// 레인 계약(과금·적격성·설정 집행·난이도 3분기)까지. 실행: npx tsx scripts/_test-md-context-meaning.ts
//
// 형식 계약: `밑줄:` 한 줄 + 원문자 선지 N줄 + `정답:` + `해설:` + `오답:`.
// 지문을 재출력시키지 않으므로 지문 재구성 게이트가 없고, 대신 지문 결속점이
// `밑줄:` 한 줄뿐이라 그 줄의 축자·자리 유일성이 이 유형의 최강 게이트다
// (후처리가 그 문자열을 지문에 도로 써 넣기 때문에 축자 실패는 곧 지문 오염이다).
import { autoSnapContextMeaningTarget, locateContextMeaningTarget, parseMdContextMeaning, type MdContextMeaningQuestion } from "../src/lib/md-qgen/parser-context-meaning";
import { gateMdContextMeaning } from "../src/lib/md-qgen/gate-context-meaning";
import { adaptMdContextMeaningToAiQuestion, CONTEXT_MEANING_MD_DIRECTION, CONTEXT_MEANING_MD_DIRECTION_MULTI } from "../src/lib/md-qgen/adapter-context-meaning";
import { CONTEXT_MEANING_MD_LANE as LANE } from "../src/lib/md-qgen/lane-context-meaning";
import { buildMdContextMeaningPrompt, clampContextMeaningMdAnswerCount, clampContextMeaningMdOptionCount } from "../src/lib/md-qgen/prompts-context-meaning";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { shuffleQuestionOptionsForDiversity } from "../src/lib/question-diversity";
import { CREDIT_COSTS } from "../src/lib/credit-costs";
import { runContextMeaningDecorationFixtures } from "./_test-md-context-meaning-decoration";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));
type Rec = Record<string, unknown>;
type Opts = Array<Record<string, unknown>>;

// ── 지문 · 정상 md ────────────────────────────────────────────────────────
const PASSAGE =
  "Reform movements often stall long before their opponents mount a serious defence. " +
  "The early leaders win a few visible concessions, and the victory is cheap, bought with promises that cost the powerful nothing. " +
  "Supporters then read the quiet that follows as proof of progress rather than as a warning. " +
  "By the time the original demands return to the table, the language of the campaign has been borrowed by the very institutions it set out to change. " +
  "What began as a challenge ends as a slogan that anyone can repeat without changing anything.";
const DUP_PASSAGE = `${PASSAGE} Every later campaign learns that a cheap settlement is the most expensive kind.`;
const TARGET = "cheap";
const ANSWER_TEXT = "won without real sacrifice";
const UL = `밑줄: ${TARGET}`;

const GOOD = `${UL}
① low in price
② poorly made
③ ${ANSWER_TEXT}
④ obtained by sheer luck
⑤ offered at a discount
정답: ③
해설: 이 글은 초기 지도자들이 얻은 승리가 권력자에게 아무 대가도 치르게 하지 않은 약속으로 산 것이라고 말합니다. 따라서 밑줄 자리는 값이 싸다는 뜻이 아니라 진짜 희생 없이 얻었다는 평가의 의미로 쓰였습니다.
오답:
① 대표뜻 — 가격이 낮다는 가장 흔한 의미라 밑줄만 본 학생이 즉시 집지만, 이 문장에는 가격을 재는 대상이 없습니다.
② 폴리세미 — 조잡하다는 뜻도 이 단어가 실제로 갖지만, 이 문장이 평가하는 것은 물건의 품질이 아니라 승리의 값어치입니다.
④ 문맥 유혹 오독 — 대가가 없었다는 서술을 운으로 옮긴 것이며, 지문은 약속이라는 수단을 분명히 밝히고 있습니다.
⑤ 근접 의미장 — 가격 의미장 안의 오독이라 끝까지 남지만, 할인 여부는 지문 어디에도 없습니다.`;

type GateOpts = Parameters<typeof gateMdContextMeaning>[2];
/** 파싱 → 스냅 → 게이트 (실서비스 레인 경로와 동일 순서) */
function gateOf(text: string, passage = PASSAGE, options?: GateOpts): string[] {
  const q = autoSnapContextMeaningTarget(parseMdContextMeaning(text), passage).question;
  return gateMdContextMeaning(q, passage, { optionCount: 5, answerCount: 1, ...options });
}
function gateObj(q: MdContextMeaningQuestion, passage = PASSAGE, options?: GateOpts): string[] {
  return gateMdContextMeaning(q, passage, { optionCount: 5, answerCount: 1, ...options });
}
const snapOf = (text: string, passage = PASSAGE) =>
  autoSnapContextMeaningTarget(parseMdContextMeaning(text), passage);

// ── 1. 정상 경로 ──────────────────────────────────────────────────────────
const parsed = parseMdContextMeaning(GOOD);
const baseQ = snapOf(GOOD).question;
check("파싱: 밑줄 단어", parsed.word === TARGET, parsed.word);
check("파싱: 선지 5개", parsed.options.length === 5, `실제 ${parsed.options.length}`);
check("파싱: 선지 라벨 ①~⑤", parsed.options.map((o) => o.label).join("") === "①②③④⑤");
check("파싱: 정답 ③ 단일", parsed.answers.join(",") === "③" && parsed.answer === "③");
check("파싱: 해설 존재", parsed.explanation.length > 20);
check("파싱: 오답해설 4개(정답 줄 제외)", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check("파싱: 오답해설에 정답 라벨 없음", parsed.wrong.every((w) => w.label !== "③"));
check("위치확정: 밑줄이 지문에 정확히 1회", locateContextMeaningTarget(PASSAGE, TARGET)?.count === 1);
check("스냅: 정상 입력은 무보정", snapOf(GOOD).corrections.length === 0);
check("게이트: 정상 입력 클린", gateOf(GOOD).length === 0, gateOf(GOOD).join(" / "));

// ── 2~4. 게이트 반려 (치환형) — [이름, 치환 전, 치환 후, 기대 메시지, 지문?] ──
const MENTION_PASSAGE =
  "Roman writers used the word coloratus for anything touched by heat or by shame. " +
  "Later scholars kept the term long after its original sense had faded from ordinary speech.";
const QUOTE_PASSAGE =
  'Editors argued for hours about whether the label "green" belonged in the headline at all. ' +
  "The dispute revealed how much a single adjective can carry in a political season.";
const PROPER_PASSAGE =
  "The committee sent its final draft to Warsaw before anyone had read the appendix. " +
  "Officials there returned it within a week without a single comment.";
const LONG_OPTION = "⑤ a price that has been reduced by the seller for a limited time";

const REJECTS: Array<[string, string | RegExp, string, string, string?]> = [
  // 선지·정답·해설 형상
  ["선지 4개", "⑤ offered at a discount\n", "", "선지 4개"],
  ["선지 라벨 순서 오류", "④ obtained", "⑥ obtained", "선지 라벨"],
  ["선지 내용 중복", "⑤ offered at a discount", "⑤ low in price", "선지 중복"],
  ["정답 누락", "정답: ③\n", "", "정답 누락"],
  ["정답 라벨이 선지 밖", "정답: ③", "정답: ⑧", "정답 라벨(⑧)"],
  ["정답 개수 불일치(설정 1개인데 2개)", "정답: ③", "정답: ③, ④", "정답 2개"],
  ["해설 누락", /^해설:.*$/m, "", "해설 누락"],
  ["오답해설 개수 부족", /^⑤ 근접 의미장.*$/m, "", "오답해설"],
  // 선지 언어·형태(설정 집행 + 후처리의 조용한 삭제 차단)
  ["영어 보기 설정에 한글 선지", "⑤ offered at a discount", "⑤ 할인해 내놓은", "한글이 섞임"],
  ["괄호 뜻풀이(후처리가 괄호 안을 삭제)", "① low in price", "① low in price (the usual sense)", "괄호 주석"],
  ["문장으로 늘어진 선지", "⑤ offered at a discount", LONG_OPTION, "문장으로 늘어짐"],
  ["선지가 밑줄 단어와 동일(동어반복)", "⑤ offered at a discount", "⑤ cheap", "밑줄 단어와 동일"],
  // 밑줄 표적 — 이 유형의 심장
  ["밑줄 줄 누락", /^밑줄:.*$/m, "", "밑줄 표현 누락"],
  ["지문에 없는 밑줄", UL, "밑줄: expensive", "축자로 없음"],
  ["밑줄 5단어 초과", UL, "밑줄: the language of the campaign has been borrowed", "너무 김"],
  ["기능어 단독 밑줄(fast warning 을 반려로 승격)", UL, "밑줄: the", "기능어 단독"],
  ["밑줄 양끝이 영문자 아님(후처리 단어경계 계약)", UL, "밑줄: cheap,", "영문자로 시작·종료하지 않음"],
  ["밑줄이 지문에 2회 등장", UL, UL, "2회 등장", DUP_PASSAGE],
  ["지문이 용어를 설명·인용(mention)", UL, "밑줄: coloratus", "용어 자체를 설명·인용하는 자리", MENTION_PASSAGE],
  ["따옴표로 인용된 토큰", UL, "밑줄: green", "따옴표로 인용된 토큰", QUOTE_PASSAGE],
  ["문장 중간 대문자 토큰(고유명사)", UL, "밑줄: Warsaw", "대문자 시작 토큰", PROPER_PASSAGE],
];
for (const [name, from, to, needle, passage] of REJECTS) {
  const issues = gateOf(GOOD.replace(from as never, to), passage ?? PASSAGE);
  check(`게이트 반려: ${name}`, has(issues, needle), issues.join(" / "));
}
// 대소문자 축자 위반은 스냅이 고쳐 주므로, 스냅 미적용 경로로 격리 검증한다.
check("게이트 반려: 지문 표기와 다름(대소문자 축자)", has(gateMdContextMeaning(parseMdContextMeaning(GOOD.replace(UL, "밑줄: Cheap")), PASSAGE, { optionCount: 5, answerCount: 1 }), "지문 표기와 다름"));

// 오반려 방지 — 정상 표적·정상 선지를 게이트가 물지 않아야 한다.
const ACCEPTS: Array<[string, string, string]> = [
  ["문장 첫 단어 대문자는 통과", "밑줄: Charge", "Charge is what the old accountants called any claim that outlived its paperwork. The habit survived long after the ledgers themselves had been thrown away."],
  ["3글자 다의어 표적 통과(countContentTokens 함정 회귀 방지)", "밑줄: run", "The old presses would run for three days before anyone checked the ink levels. Nobody thought to ask what the machines were actually printing."],
];
for (const [name, target, passage] of ACCEPTS) {
  const issues = gateOf(GOOD.replace(UL, target), passage);
  check(`오반려 방지: ${name}`, issues.length === 0, issues.join(" / "));
}

// 객체 구성형 게이트 — 문자열 치환으로 못 만드는 형상.
check("게이트 반려: 오답해설에 정답 라벨 포함", has(gateObj({ ...baseQ, wrong: [...baseQ.wrong, { label: "③", text: "정답인데 끼어듦" }] }), "정답 라벨(③) 포함"));
check("게이트 반려: 선지 텍스트 누락", has(gateObj({ ...baseQ, options: baseQ.options.map((o, i) => (i === 1 ? { ...o, text: "" } : o)) }), "② 선지 텍스트 누락"));
const SKEWED = ["price", "quality", ANSWER_TEXT, "luck", "discount"].map((text, i) => ({ label: "①②③④⑤"[i], text }));
check("게이트 반려: 정답만 다단어이고 나머지 전부 한 단어(형태 누출)", has(gateObj({ ...baseQ, options: SKEWED }), "형태로 정답이 들킨다"));
check("오반려 방지: 정상 선지 묶음은 평행성 반려 없음", !has(gateOf(GOOD), "형태로 정답이 들킨다"));
{
  // 굴절형 동어반복 — 단일 토큰끼리만 비교하는 정밀 검사(charge ↔ charging).
  const lp = "The committee decided to charge the newcomers a fee that nobody could explain. Later minutes show that the fee was never collected from anyone at all.";
  const lq: MdContextMeaningQuestion = {
    kind: "contextMeaning",
    word: "charge",
    options: ["charging", "accuse", "bill", "attack", "load"].map((text, i) => ({ label: "①②③④⑤"[i], text })),
    answers: ["③"],
    answer: "③",
    explanation: "요금을 물린다는 뜻으로 쓰였습니다. 뒤 문장이 요금 징수 여부를 다룹니다.",
    wrong: ["①", "②", "④", "⑤"].map((label) => ({ label, text: "폴리세미 오독입니다." })),
  };
  check("게이트 반려: 선지가 밑줄 단어의 굴절형", has(gateObj(lq, lp), "굴절형"), gateObj(lq, lp).join(" / "));
  const fixed = { ...lq, options: lq.options.map((o, i) => (i === 0 ? { ...o, text: "rush" } : o)) };
  check("오반려 방지: 굴절형이 아닌 단일 단어 선지는 통과", !has(gateObj(fixed, lp), "굴절형"));
}

// ── 5. 드리프트 관용 (파서는 관대하게, 게이트는 엄격하게) ─────────────────
const DRIFTS: Array<[string, string, string]> = [
  ["불릿 접두", "③ won without", "- ③ won without"],
  ["별표 불릿", "④ obtained by", "* ④ obtained by"],
  ["굵게 라벨", "② poorly made", "**②** poorly made"],
  ["굵게 전체", "⑤ offered at", "**⑤ offered at"],
  ["숫자 라벨 점", "② poorly made", "2. poorly made"],
  ["숫자 라벨 괄호", "② poorly made", "(2) poorly made"],
  ["숫자 라벨 닫는괄호", "② poorly made", "2) poorly made"],
  ["표 형식 행", "② poorly made", "| ② | poorly made"],
  ["라벨 뒤 마침표", "② poorly made", "②. poorly made"],
  ["정답 전각 콜론", "정답: ③", "정답： ③"],
  ["정답 평숫자", "정답: ③", "정답: 3"],
  ["정답 괄호숫자", "정답: ③", "정답: (3)"],
  ["정답 원문자+번", "정답: ③", "정답: ③번"],
  ["정답 뒤 부가설명", "정답: ③", "정답: ③ — ①은 대표뜻 함정입니다"],
  ["밑줄 라벨 변형(단어)", UL, `밑줄 단어: ${TARGET}`],
  ["밑줄 라벨 변형(표현)", UL, `밑줄 표현: ${TARGET}`],
  ["밑줄 따옴표 장식", UL, `밑줄: "${TARGET}"`],
  ["밑줄 굵게 장식", UL, `밑줄: **${TARGET}**`],
  ["밑줄 곱슬따옴표 장식", UL, `밑줄: “${TARGET}”`],
  ["밑줄 백틱 장식", UL, `밑줄: \`${TARGET}\``],
  ["해설 전각 콜론", "해설:", "해설："],
  ["밑줄 마크다운 헤더", UL, `## ${UL}`],
  ["정답 마크다운 헤더", "정답: ③", "### 정답: ③"],
  ["해설 마크다운 헤더", "해설:", "## 해설:"],
  ["오답 마크다운 헤더", "오답:", "## 오답:"],
  ["오답 목록에 정답 줄 끼움", "오답:\n", "오답:\n③ (정답) 이 선지가 정답입니다.\n"],
  // ★ 웨이브2 회귀(F2/R2 · silent-drop): 키워드 줄 무관용 = 이 웨이브 지배적 계통.
  // 필드 통째 유실 → "정답 누락"·"해설 누락"·"오답해설 0개" 라는 **사실과 다른 원인**이
  // 재생성 피드백으로 나가 2차도 같은 자리에서 반려됐다. 전수 대조는 §12 분할 모듈.
  ["정답 굵게 헤더", "정답: ③", "**정답:** ③"],
  ["정답 굵게(콜론 바깥)", "정답: ③", "**정답**: ③"],
  ["정답 굵게+전각 콜론", "정답: ③", "**정답：** ③"],
  ["정답 불릿 접두", "정답: ③", "- 정답: ③"],
  ["정답 줄 전체 굵게", "정답: ③", "**정답: ③**"],
  ["정답 값만 굵게", "정답: ③", "정답: **③**"],
  // ★ R2: '굵게 헤더'와 '값만 굵게'를 각각 덮고 **교차**를 비워 둔 자리(전수는 §12).
  ["정답 굵게 헤더+값 굵게(R2 교차)", "정답: ③", "**정답:** **③**"],
  ["해설 굵게 헤더", "해설:", "**해설:**"],
  ["해설 불릿 접두", "해설:", "* 해설:"],
  ["오답 굵게 헤더", "오답:", "**오답:**"],
  ["오답 라벨 확장", "오답:", "오답 해설:"],
  ["오답 굵게+라벨 확장+전각 콜론", "오답:", "**오답 해설：**"],
  ["밑줄 굵게 헤더", UL, `**밑줄:** ${TARGET}`],
  ["밑줄 인용 접두", UL, `> ${UL}`],
  ["밑줄 라벨 확장(어구)", UL, `밑줄 어구: ${TARGET}`],
  // ★ 웨이브2 회귀(F1 · silent-drop): 선지 본문 마크다운 장식은 **양끝 대칭**으로
  // 벗겨야 한다. 종전에는 뒤쪽 `**` 만 지워 앞쪽 별표가 학생 표면까지 갔다.
  ["선지 본문 굵게(양쪽)", `③ ${ANSWER_TEXT}`, `③ **${ANSWER_TEXT}**`],
  ["선지 본문 굵게(앞쪽만)", `③ ${ANSWER_TEXT}`, `③ **${ANSWER_TEXT}`],
  ["선지 본문 굵게(뒤쪽만)", `③ ${ANSWER_TEXT}`, `③ ${ANSWER_TEXT}**`],
  ["선지 본문 백틱", "① low in price", "① `low in price`"],
  ["선지 본문 __굵게__", "② poorly made", "② __poorly made__"],
  ["선지 본문 기울임", "④ obtained by sheer luck", "④ *obtained by sheer luck*"],
  ["선지 인용 접두", "④ obtained by", "> ④ obtained by"],
  ["선지 + 불릿", "⑤ offered at", "+ ⑤ offered at"],
  ["오답해설 기제 이름 굵게", "① 대표뜻 —", "① **대표뜻** —"],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdContextMeaning(drifted);
  const issues = gateOf(drifted);
  check(`드리프트 관용: ${name}`, q.options.length === 5 && q.wrong.length === 4 && issues.length === 0, `선지 ${q.options.length}개 · 오답 ${q.wrong.length}개 · ${issues.join(" / ")}`);
}
{
  // 선지를 `정답:`·`해설:` 뒤에 쓴 순서 드리프트 — 엄격 구역이 비었을 때만 넓혀 읽는다.
  const lines = GOOD.split("\n");
  const optionLines = lines.filter((l) => /^[①-⑤] [a-z]/.test(l));
  const rest = lines.filter((l) => !/^[①-⑤] [a-z]/.test(l));
  const at = rest.indexOf("오답:");
  const q = parseMdContextMeaning([...rest.slice(0, at), ...optionLines, ...rest.slice(at)].join("\n"));
  check("드리프트 관용: 선지가 정답 줄 뒤에 있어도 구제", q.options.length === 5 && q.answers.join(",") === "③", `선지 ${q.options.length}개`);
}
{
  // ★ 웨이브2 회귀(F1): 모델이 **정답 선지만** 굵게 쓰는 실측 습관. 종전 파서는 뒤쪽
  // `**` 만 지워 `**won without real sacrifice` 로 확정했고 게이트·후처리(sanitize)·
  // 검증기가 전부 통과시켜, 학생은 별표 한 줄만 보고 지문 없이 정답을 찍었다.
  const q = parseMdContextMeaning(GOOD.replace(`③ ${ANSWER_TEXT}`, `③ **${ANSWER_TEXT}**`));
  check("회귀(정답 누출): 정답 선지만 굵게 써도 별표가 남지 않는다", q.options[2].text === ANSWER_TEXT, JSON.stringify(q.options[2]?.text));
  check("회귀(정답 누출): 다섯 선지의 장식이 서로 다르지 않다", q.options.every((o) => !/[*`_]/.test(o.text)), JSON.stringify(q.options.map((o) => o.text)));
  // 전 선지를 굵게 쓰면 종전에는 5줄 모두 앞쪽 별표가 살아 표면이 통째로 깨졌다.
  const allBold = GOOD.replace(/^([①-⑤]) (.+)$/gm, "$1 **$2**");
  const qa = parseMdContextMeaning(allBold);
  check("회귀(표면 파손): 전 선지·전 오답해설 굵게 → 장식 0개 잔존 · 게이트 클린", qa.options.every((o) => !/[*`]/.test(o.text)) && qa.wrong.every((w) => !/[*`]/.test(w.text)) && gateOf(allBold).length === 0, `${JSON.stringify(qa.options.map((o) => o.text))} / ${gateOf(allBold).join(" / ")}`);
  // 게이트 이중 방어 — 짝이 깨져 파서가 벗길 수 없는 잔재는 게이트가 자리를 지목한다.
  check("게이트 반려: 짝 깨진 별표가 선지 한가운데 남음(이중 방어)", has(gateOf(GOOD.replace("① low in price", "① low in ** price")), "마크다운 장식이 남음"));
  check("게이트 반려: 짝 깨진 __ 가 선지에 남음(이중 방어)", has(gateOf(GOOD.replace("① low in price", "① low in __price")), "마크다운 장식이 남음"));
}
{
  // ★ 웨이브2 회귀(F3 · gate-gap): 해설·오답해설의 평숫자 선지 지칭. 이 유형은
  // "사전 1번 뜻" 이 정답 기제를 설명하는 가장 자연스러운 한국어라 발생 확률이
  // 유독 높은데, 종전 게이트는 해설 문자열을 아예 보지 않았다.
  const MENTIONS: Array<[string, string, string]> = [
    ["해설이 '1번 뜻' 지칭", "해설: 이 글은", "해설: 사전 1번 뜻이 아닙니다. 이 글은"],
    ["오답해설이 '선지 3' 지칭", "① 대표뜻 —", "① 대표뜻 선지 3보다 매력적이며 —"],
    ["오답해설이 괄호숫자 지칭", "② 폴리세미 —", "② 폴리세미 (2) 자리와 견주면 —"],
    ["오답해설이 원문자 범위 지칭", "④ 문맥 유혹 오독 —", "④ ①~③과 달리 —"],
  ];
  for (const [name, from, to] of MENTIONS) {
    const issues = gateOf(GOOD.replace(from, to));
    check(`게이트 반려(셔플 사망 차단): ${name}`, has(issues, "평숫자 선지 지칭"), issues.join(" / "));
  }
  check("오반려 방지: 원문자 단독 지칭은 셔플이 재매핑하므로 통과", gateOf(GOOD.replace("① 대표뜻 —", "① 대표뜻 ③과 견주면 —")).length === 0);
}
check("과잉 관용 방지: 라벨 없는 산문 줄 무시", parseMdContextMeaning(GOOD.replace(`${UL}\n`, `${UL}\nAll five options below share the same register.\n`)).options.length === 5);
check("과잉 관용 방지: 해설 속 번호 목록 무시", parseMdContextMeaning(GOOD.replace("해설: 이 글은", "해설: 1. 첫째 근거와 2. 둘째 근거를 잇습니다. 이 글은")).options.length === 5);
{
  // 라벨 확장 — `정답:`·`해설:` 을 한 줄로 합쳐 쓰는 드리프트에서도 두 필드를 모두 건진다.
  const merged = GOOD.replace("정답: ③\n해설: ", "**정답 및 해설:** ③ ");
  const q = snapOf(merged).question;
  check("드리프트 관용: `정답 및 해설:` 합본 줄에서 정답·해설 동시 확보", q.answers.join(",") === "③" && q.explanation.length > 20 && q.options.length === 5 && gateObj(q).length === 0, `${q.answers.join(",")} / ${q.explanation.slice(0, 24)} / ${gateObj(q).join(" / ")}`);
}

// ── 6. 스냅 보정 (0원) ────────────────────────────────────────────────────
const SNAPS: Array<[string, string, string]> = [
  ["대소문자 드리프트", "밑줄: Cheap", TARGET],
  ["앞뒤 구두점", "밑줄: cheap.", TARGET],
  ["공백 과다", "밑줄: set  out to   change", "set out to change"],
  ["사이 단어 누락(정본 snapExpressionSpan 경로)", "밑줄: read the that follows", "read the quiet that follows"],
];
for (const [name, drifted, expected] of SNAPS) {
  const s = snapOf(GOOD.replace(UL, drifted));
  check(`스냅: ${name} → 지문 축자 보정`, s.corrections.length === 1 && s.question.word === expected, `${s.question.word} / ${s.corrections.join(" ")}`);
}
check("스냅 후 게이트 클린(대소문자 드리프트)", gateOf(GOOD.replace(UL, "밑줄: Cheap")).length === 0, gateOf(GOOD.replace(UL, "밑줄: Cheap")).join(" / "));
{
  const s = snapOf(GOOD.replace(UL, "밑줄: Cheap"), DUP_PASSAGE);
  check("스냅 보수 가드: 다중 등장은 무보정(게이트가 반려)", s.corrections.length === 0 && s.question.word === "Cheap", s.corrections.join(" "));
}

// ── 7. 어댑터 → processContextMeaning 왕복 → 품질검증 → 셔플 ──────────────
const adapted = adaptMdContextMeaningToAiQuestion(baseQ, PASSAGE, "KILLER");
check("어댑터: 성공", adapted.ok === true, adapted.error);
const ai = (adapted.aiQuestion ?? {}) as Rec;
const aiOpts = ai.options as Opts;
const aiWoe = ai.wrongOptionExplanations as Opts;
check("어댑터: 한국어 단일 발문(fast 표면과 동일 문자열)", ai.direction === CONTEXT_MEANING_MD_DIRECTION, String(ai.direction));
check("어댑터: underlinedWord 지문 축자", ai.underlinedWord === TARGET, String(ai.underlinedWord));
check("어댑터: surroundingText 가 지문 부분문자열", typeof ai.surroundingText === "string" && (ai.surroundingText as string).length > 0 && PASSAGE.includes(ai.surroundingText as string), String(ai.surroundingText));
check("어댑터: 선지 라벨 숫자 축 '1'~'5'", aiOpts.length === 5 && aiOpts[0].label === "1" && aiOpts[4].label === "5");
check("어댑터: correctAnswer '3'", ai.correctAnswer === "3", String(ai.correctAnswer));
check("어댑터: 단일 정답은 correctAnswers 미생성", !("correctAnswers" in ai));
check("어댑터: 오답해설 4개 · 라벨 1,2,4,5", aiWoe.length === 4 && aiWoe.map((w) => w.label).join(",") === "1,2,4,5", aiWoe.map((w) => w.label).join(","));
check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
check("어댑터: 지문 필드·빈칸 계열 이물 없음", !("passageWithUnderline" in ai) && !("blanks" in ai) && !("passageWithBlank" in ai) && !("originalExpression" in ai));

const pp = postProcessQuestion("CONTEXT_MEANING", PASSAGE, ai as never);
check("후처리: 성공", pp.success === true, pp.error);
const data = (pp.data ?? {}) as Rec;
const pwu = String(data.passageWithUnderline ?? "");
check("후처리: passageWithUnderline 에 __밑줄__ 1곳 생성", pwu.includes(`__${TARGET}__`) && (pwu.match(/__/g) ?? []).length === 2, pwu.slice(0, 120));
check("후처리: 지문 원문이 마커 밖에서 무변경", pwu.replace(`__${TARGET}__`, TARGET) === PASSAGE);
check("후처리: correctAnswer '3' 유지", data.correctAnswer === "3", String(data.correctAnswer));
check("후처리: 선지 텍스트가 잘리지 않음(괄호 삭제 없음)", (data.options as Opts)[2].text === ANSWER_TEXT);

function qualityErrors(q: Rec, difficulty: string, optionCount: number, answerCount: number): string[] {
  return validateQuestionQuality({
    typeId: "CONTEXT_MEANING",
    question: { ...q, _typeId: "CONTEXT_MEANING", difficulty },
    passage: PASSAGE,
    requestedDifficulty: difficulty,
    genericOptionCount: optionCount,
    genericAnswerCount: answerCount,
    stemLanguage: "ko",
    optionLanguage: "en",
  })
    .filter((i) => i.severity === "error")
    .map((i) => i.code);
}
check("품질검증: error 0 (KILLER)", qualityErrors(data, "KILLER", 5, 1).length === 0, qualityErrors(data, "KILLER", 5, 1).join(","));
{
  // 셔플(CONTEXT_MEANING 은 SHUFFLE_OPTION_TYPES 멤버) 정합. ★ 해설에 평숫자 선지
  // 지칭이 섞이면 셔플이 통째로 포기된다 — 기제 이름에서 숫자를 뺀 계약의 실증.
  let ok = true;
  let moved = false;
  let detail = "";
  for (let i = 0; i < 40 && ok; i += 1) {
    const s = shuffleQuestionOptionsForDiversity({ ...data }, "CONTEXT_MEANING");
    const label = String(s.correctAnswer);
    const text = (s.options as Opts).find((o) => String(o.label) === label)?.text;
    if (text !== ANSWER_TEXT) {
      ok = false;
      detail = `${label} → ${String(text)}`;
      break;
    }
    if (label !== "3") moved = true;
    const woe = s.wrongOptionExplanations as Record<string, string>;
    if (woe && typeof woe === "object" && !Array.isArray(woe)) {
      if (Object.keys(woe).includes(label)) { ok = false; detail = `오답해설에 정답 라벨 ${label} 잔존`; }
      else if (Object.keys(woe).length !== 4) { ok = false; detail = `오답해설 ${Object.keys(woe).length}개`; }
    }
  }
  check("셔플: 40회 반복 정답·오답해설 라벨 정합", ok, detail);
  check("셔플: 실제로 재배열이 일어난다(평숫자 지칭 가드 미발동)", moved, "40회 모두 제자리");
  // ★ 웨이브2 회귀(F3): 게이트가 없으면 **무엇이 조용히 죽는지**를 함께 고정한다.
  // 평숫자 지칭 하나면 셔플이 통째로 포기되는데 잡 result·경고 어디에도 흔적이
  // 남지 않아 발견이 불가능하다 — 게이트가 유일한 방어선인 이유.
  const dirty = { ...data, wrongOptionExplanations: [{ label: "1", explanation: "대표뜻 — 사전 1번 뜻이라 즉시 집습니다." }] };
  let dirtyMoved = 0;
  for (let i = 0; i < 40; i += 1) {
    if (String(shuffleQuestionOptionsForDiversity({ ...dirty }, "CONTEXT_MEANING").correctAnswer) !== "3") dirtyMoved += 1;
  }
  check("회귀(셔플 사망): 평숫자 지칭이 있으면 40회 전부 제자리 — 게이트만이 방어선", dirtyMoved === 0, `이동 ${dirtyMoved}회`);
}
{
  // 정답이 ③ 이 아닌 경우도 인덱스가 맞는지 (`정답:` 줄이 유일 진실원인지)
  const shifted = GOOD.replace("정답: ③", "정답: ①")
    .replace(/^① 대표뜻.*$/m, "③ 문맥 유혹 오독 — 지문 근거가 없는 확장 해석입니다.")
    .replace(/^④ 문맥 유혹 오독.*$/m, "④ 근접 의미장 — 같은 도메인의 오독입니다.");
  const q = snapOf(shifted).question;
  check("게이트: 정답 ① 형상 클린", gateObj(q).length === 0, gateObj(q).join(" / "));
  const a = (adaptMdContextMeaningToAiQuestion(q, PASSAGE, "KILLER").aiQuestion ?? {}) as Rec;
  const woe = (a.wrongOptionExplanations as Opts).map((w) => w.label).join(",");
  check("어댑터: 정답 ① → correctAnswer '1' · 오답해설 라벨 2,3,4,5", a.correctAnswer === "1" && woe === "2,3,4,5", `${String(a.correctAnswer)} / ${woe}`);
}

// ── 8. 복수 정답(N=6 · K=2) 경로 ─────────────────────────────────────────
const MULTI = `${UL}
① low in price
② ${ANSWER_TEXT}
③ poorly made
④ gained at little true cost
⑤ obtained by sheer luck
⑥ offered at a discount
정답: ②, ④
해설: 초기 지도자들이 얻은 승리는 권력자에게 아무 대가도 치르게 하지 않은 약속으로 산 것입니다. 따라서 진짜 희생 없이 얻었다는 뜻과 실질 비용이 거의 들지 않았다는 뜻이 모두 성립합니다.
오답:
① 대표뜻 — 가격이 낮다는 가장 흔한 의미이지만 이 문장에는 가격을 재는 대상이 없습니다.
③ 폴리세미 — 조잡하다는 뜻은 물건의 품질을 평가할 때 쓰입니다.
⑤ 문맥 유혹 오독 — 대가가 없었다는 서술을 운으로 옮긴 해석입니다.
⑥ 근접 의미장 — 할인 여부는 지문 어디에도 없습니다.`;
{
  const q = snapOf(MULTI).question;
  const multi = { optionCount: 6, answerCount: 2 };
  check("복수정답 파싱: 선지 6개", q.options.length === 6, `실제 ${q.options.length}`);
  check("복수정답 파싱: 정답 ②,④", q.answers.join(",") === "②,④", q.answers.join(","));
  check("복수정답 게이트: 클린", gateObj(q, PASSAGE, multi).length === 0, gateObj(q, PASSAGE, multi).join(" / "));
  check("복수정답 게이트: 설정이 1개면 반려", has(gateObj(q, PASSAGE, { optionCount: 6, answerCount: 1 }), "정답 2개"));
  const m = (adaptMdContextMeaningToAiQuestion(q, PASSAGE, "INTERMEDIATE").aiQuestion ?? {}) as Rec;
  const woe = (m.wrongOptionExplanations as Opts).map((w) => w.label).join(",");
  check("복수정답 어댑터: correctAnswer '2, 4'", m.correctAnswer === "2, 4", String(m.correctAnswer));
  check("복수정답 어댑터: correctAnswers 배열", Array.isArray(m.correctAnswers) && (m.correctAnswers as string[]).join(",") === "2,4");
  check("복수정답 어댑터: '모두' 발문", m.direction === CONTEXT_MEANING_MD_DIRECTION_MULTI && String(m.direction).includes("모두"));
  check("복수정답 어댑터: 오답해설 4개 · 라벨 1,3,5,6", woe === "1,3,5,6", woe);
  const mpp = postProcessQuestion("CONTEXT_MEANING", PASSAGE, m as never);
  check("복수정답 후처리: 성공", mpp.success === true, mpp.error);
  const md = (mpp.data ?? {}) as Rec;
  check("복수정답 후처리: correctAnswers 유지 + 모두 고르기 발문", Array.isArray(md.correctAnswers) && (md.correctAnswers as string[]).join(",") === "2,4" && String(md.direction).includes("모두"), `${String(md.correctAnswer)} / ${String(md.direction)}`);
  check("복수정답 품질검증: error 0", qualityErrors(md, "INTERMEDIATE", 6, 2).length === 0, qualityErrors(md, "INTERMEDIATE", 6, 2).join(","));
}

// ── 9. 한국어 보기 설정(optionLanguage=ko) 경로 ──────────────────────────
const KO_OPTIONS = `${UL}
① 값이 낮다는 뜻
② 조잡하게 만들었다는 뜻
③ 진짜 희생 없이 얻었다는 뜻
④ 순전히 운으로 얻었다는 뜻
⑤ 할인해 내놓았다는 뜻
정답: ③
해설: 승리가 권력자에게 아무 대가도 치르게 하지 않은 약속으로 산 것이라고 말합니다. 그래서 밑줄 자리는 값이 싸다는 뜻이 아니라 진짜 희생 없이 얻었다는 평가의 의미입니다.
오답:
① 대표뜻 — 가격이 낮다는 가장 흔한 의미이지만 이 문장에는 가격을 재는 대상이 없습니다.
② 폴리세미 — 조잡하다는 뜻은 물건의 품질을 평가할 때 쓰입니다.
④ 문맥 유혹 오독 — 대가가 없었다는 서술을 운으로 옮긴 해석입니다.
⑤ 근접 의미장 — 할인 여부는 지문 어디에도 없습니다.`;
{
  const q = snapOf(KO_OPTIONS).question;
  const ko = gateObj(q, PASSAGE, { optionLanguage: "ko" });
  check("보기 언어 ko: 한국어 선지 통과", ko.length === 0, ko.join(" / "));
  check("보기 언어 en: 한국어 선지 반려(설정 집행)", has(gateObj(q, PASSAGE, { optionLanguage: "en" }), "한글이 섞임"));
  const longKo = { ...q, options: q.options.map((o, i) => (i === 0 ? { ...o, text: "값이 낮아서 누구나 부담 없이 살 수 있다는 뜻으로 쓰였다는 것입니다" } : o)) };
  check("보기 언어 ko: 너무 긴 한국어 선지 반려", has(gateObj(longKo, PASSAGE, { optionLanguage: "ko" }), "너무 김"));
}

// ── 10. 레인 계약 ────────────────────────────────────────────────────────
function ctxOf(overrides?: Partial<MdLaneContext>): MdLaneContext {
  return { passage: PASSAGE, difficulty: "KILLER", rawDifficulty: "KILLER", resolved: { genericOptionCount: 5, genericAnswerCount: 1 }, rawTypeSettings: null, teacherPoints: [], variantIndex: 0, variantCount: 1, ...overrides };
}
check("레인: subType CONTEXT_MEANING", LANE.subType === "CONTEXT_MEANING");
check("레인: 과금 QUESTION_GEN_VOCAB (1크레딧) — fast VOCAB_TYPES 동기, 이중청구 회귀 방지", LANE.operationType === "QUESTION_GEN_VOCAB" && CREDIT_COSTS.QUESTION_GEN_VOCAB === 1 && CREDIT_COSTS.QUESTION_GEN_SINGLE === 2, String(LANE.operationType));
check("레인: retryEligible", LANE.retryEligible === true);
check("레인: 적격성 4~8지 · 정답 1~N-1", LANE.isEligible({ genericOptionCount: 5, genericAnswerCount: 1 }) && LANE.isEligible({ genericOptionCount: 8, genericAnswerCount: 7 }) && LANE.isEligible({}) && !LANE.isEligible({ genericOptionCount: 9, genericAnswerCount: 1 }) && !LANE.isEligible({ genericOptionCount: 3, genericAnswerCount: 1 }) && !LANE.isEligible({ genericOptionCount: 5, genericAnswerCount: 5 }));
check("레인: diversityTargets = underlinedWord (question-diversity 축과 동일)", LANE.diversityTargets({ underlinedWord: TARGET }).join("") === TARGET && LANE.diversityTargets({}).length === 0);
check("레인: mdFormat 실값", JSON.stringify(LANE.mdFormat(ctxOf())) === JSON.stringify({ optionCount: 5, answerCount: 1, optionLanguage: "en" }), JSON.stringify(LANE.mdFormat(ctxOf())));
{
  const args = LANE.qualityArgs(ctxOf({ resolved: { genericOptionCount: 6, genericAnswerCount: 2 } }));
  check("레인: qualityArgs 실값(설정 집행)", JSON.stringify(args) === JSON.stringify({ genericOptionCount: 6, genericAnswerCount: 2, stemLanguage: "ko", optionLanguage: "en" }), JSON.stringify(args));
}
check("레인: parseAndGate 정상 클린", LANE.parseAndGate(GOOD, ctxOf()).gateIssues.length === 0, LANE.parseAndGate(GOOD, ctxOf()).gateIssues.join(" / "));
check("레인: parseAndGate 가 설정 개수를 집행(6지 설정에 5지 출력이면 반려)", has(LANE.parseAndGate(GOOD, ctxOf({ resolved: { genericOptionCount: 6, genericAnswerCount: 1 } })).gateIssues, "선지 5개"));
check("레인: parseAndGate 가 보기 언어 설정을 집행", LANE.parseAndGate(KO_OPTIONS, ctxOf({ rawTypeSettings: { optionLanguage: "ko" } })).gateIssues.length === 0 && has(LANE.parseAndGate(KO_OPTIONS, ctxOf()).gateIssues, "한글이 섞임"));
check("레인: parseAndGate 가 스냅 기록을 넘긴다", LANE.parseAndGate(GOOD.replace(UL, "밑줄: Cheap"), ctxOf()).corrections.length === 1);
check("레인: 교사 지정 포인트 준수 검사(픽커 확장 대비 방어)", has(LANE.parseAndGate(GOOD, ctxOf({ teacherPoints: [{ text: "concessions", unit: "word" }] })).gateIssues, "교사 지정 표현이 밑줄에 없음") && LANE.parseAndGate(GOOD, ctxOf({ teacherPoints: [{ text: TARGET, unit: "word" }] })).gateIssues.length === 0);
{
  const laneParsed = LANE.parseAndGate(GOOD, ctxOf());
  const en = LANE.adapt(laneParsed, ctxOf({ rawTypeSettings: { stemLanguage: "en" } }));
  check("레인: adapt 기본 한국어 발문", LANE.adapt(laneParsed, ctxOf()).aiQuestion?.direction === CONTEXT_MEANING_MD_DIRECTION);
  check("레인: stemLanguage=en 이면 영어 발문(설정 집행)", typeof en.aiQuestion?.direction === "string" && !/[가-힣]/.test(String(en.aiQuestion?.direction)), String(en.aiQuestion?.direction));
}
check("레인: 기본 설정이면 extras 없음", LANE.buildExtras(ctxOf()).length === 0);
check("레인: stemLanguage=en 이면 질문 언어 블록 추가", LANE.buildExtras(ctxOf({ rawTypeSettings: { stemLanguage: "en" } })).some((e) => e.includes("질문 언어")));
{
  const base = LANE.buildBasePrompt(ctxOf({ resolved: { genericOptionCount: 6, genericAnswerCount: 2 } }));
  check("레인: buildBasePrompt 가 설정(6지·정답2)을 프롬프트에 실는다", base.includes("⑥ <선지>") && base.includes("정답이 2개"));
}

// ── 11. 프롬프트 계약 (난이도 3분기 · 설정 반영 · 클램프 · 셔플 안전) ────
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdContextMeaningPrompt(PASSAGE, "full", d, { optionCount: 6 });
  check(`프롬프트 ${d}: 난이도 분기 + 6지 스캐폴드 + 형식 + 지문`, p.includes("## 표적 설계") && p.includes("⑥ <선지>") && p.includes("밑줄: <지문에서 밑줄 칠 단어") && p.includes("## 지문") && p.includes(PASSAGE.slice(0, 40)));
}
const KP = buildMdContextMeaningPrompt(PASSAGE, "full", "KILLER");
check("프롬프트: BASIC 은 few-shot 생략, KILLER 는 포함(견본 선례)", !buildMdContextMeaningPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") && KP.includes("모범 설계 해부"));
check("프롬프트: 난이도별 표적 설계 문구가 서로 다르다", new Set((["BASIC", "INTERMEDIATE", "KILLER"] as const).map((d) => buildMdContextMeaningPrompt(PASSAGE, "full", d).split("## 표적 설계")[1]?.slice(0, 120))).size === 3);
check("프롬프트: 오답 기제 분류학 5종 명시", ["대표뜻", "폴리세미", "문맥 유혹 오독", "근접 의미장", "연어 오독"].every((k) => KP.includes(k)));
check("프롬프트: 리트머스 검사(사전 대표 의미 대입) 자기검산 포함", KP.includes("리트머스 검사"));
{
  // ★ 셔플 가드 회귀 방지: 기제 이름은 모델이 오답 해설 첫머리에 그대로 쓴다.
  const decoy = KP.split("## 오답 ")[1]?.split("## 선지 작성")[0] ?? "";
  check("프롬프트: 오답 기제 이름에 평숫자 선지 지칭이 없다", decoy.length > 200 && !/[1-9]\s*번(?!째)/.test(decoy) && !/(?:선지|보기)\s*[1-9](?!\s*개)/.test(decoy), decoy.slice(0, 140));
  check("프롬프트: 전문에 '숫자+번' 선지 지칭이 없다", !/[1-9]\s*번(?!째)/.test(KP));
  check("프롬프트: 평숫자 지칭 금지 지시 존재", KP.includes("평숫자로 지칭하지 마라"));
}
check("프롬프트: 보기 언어 en/ko 분기", buildMdContextMeaningPrompt(PASSAGE, "full", "KILLER", { optionLanguage: "en" }).includes("전부 영어") && buildMdContextMeaningPrompt(PASSAGE, "full", "KILLER", { optionLanguage: "ko" }).includes("전부 한국어 뜻풀이"));
check("프롬프트: 복수 정답이면 병기 형식·개수 명시", buildMdContextMeaningPrompt(PASSAGE, "full", "KILLER", { optionCount: 6, answerCount: 2 }).includes("정답이 2개"));
check("프롬프트: answer-only 모드는 오답 섹션 미요구", !buildMdContextMeaningPrompt(PASSAGE, "answer-only", "KILLER").includes("\n오답:\n"));
check("프롬프트: 선지 줄에 정답 표시 칸을 요구하지 않는다(단순화 계약)", !KP.includes("O 또는 X"));
check("프롬프트: 표적 5단어 상한이 게이트와 같은 숫자", KP.includes("5단어 이내"));
check("프롬프트: 괄호 뜻풀이 금지가 후처리 계약과 함께 명시", KP.includes("괄호 안을 잘라 내므로"));
check("클램프: optionCount 2→4, 99→8, 비수 → 기본 5", clampContextMeaningMdOptionCount(2) === 4 && clampContextMeaningMdOptionCount(99) === 8 && clampContextMeaningMdOptionCount("x") === 5);
check("클램프: answerCount 1~N-1", clampContextMeaningMdAnswerCount(99, 5) === 4 && clampContextMeaningMdAnswerCount(0, 5) === 1 && clampContextMeaningMdAnswerCount(3, 4) === 3);

// ── 12. 장식 전수 회귀(웨이브2 R2 · silent-drop) — 분할 모듈 ─────────────
runContextMeaningDecorationFixtures({ check, PASSAGE, GOOD, MULTI, UL, TARGET, ANSWER_TEXT });

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
