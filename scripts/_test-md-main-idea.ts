// 요지·주장(MAIN_IDEA) md 레인 0원 결정론 픽스처 테스트 — 실콜 없음.
// 파싱 → 스냅 → 게이트 → 어댑터 → postProcessQuestion → 셔플 → 품질검증기 → 레인 계약.
// 실행: npx tsx scripts/_test-md-main-idea.ts
//
// 형식 계약(스펙 §1-B 준수): 선지 줄은 `라벨 본문` 하나뿐이고, 정답은 `정답:` 줄이
// 유일 진실원이다. 지문을 변형하지 않는 유형이라 지문 정합 앵커는 `근거:` 줄 하나뿐이며,
// 게이트가 그 줄만 지문과 축자 대조한다.
import {
  autoSnapMainIdea,
  mainIdeaLabelOf,
  parseMdMainIdea,
} from "../src/lib/md-qgen/parser-main-idea";
import { gateMdMainIdea } from "../src/lib/md-qgen/gate-main-idea";
import {
  adaptMdMainIdeaToAiQuestion,
  buildMainIdeaMdDirection,
  mainIdeaDigitLabel,
} from "../src/lib/md-qgen/adapter-main-idea";
import { MAIN_IDEA_MD_LANE } from "../src/lib/md-qgen/lane-main-idea";
import { buildMdMainIdeaPrompt } from "../src/lib/md-qgen/prompts-main-idea";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { shuffleQuestionOptionsForDiversity } from "../src/lib/question-diversity";
import { CREDIT_COSTS } from "../src/lib/credit-costs";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

// ── 픽스처 ────────────────────────────────────────────────────────────────────
const PASSAGE =
  "Personalized recommendation systems promise to widen what we encounter. " +
  "Every click is read as a preference, and the feed is quietly rebuilt around it. " +
  "Users therefore report that their tastes feel broader than ever. " +
  "However, the pool of material the system draws from narrows with each round of feedback. " +
  "The sense of expansion is real, but it describes the interface rather than the catalogue. " +
  "What feels like a widening horizon is in fact a shrinking one.";

const EVIDENCE =
  "The sense of expansion is real, but it describes the interface rather than the catalogue.";

const OPTIONS_KO = [
  "개인화 추천은 취향이 넓어진다는 느낌을 주지만 실제 선택의 폭은 좁아진다.",
  "개인화 추천은 이용자의 취향을 실제로 넓혀 준다.",
  "개인화 추천은 원하는 자료를 찾는 탐색 비용을 줄여 준다.",
  "플랫폼의 추천 알고리즘은 제도적으로 규제되어야 한다.",
  "이용자는 알고리즘이 고른 자료를 신뢰하지 않는다.",
];

const WRONG_KO = [
  "방향반대 — 도입부의 체감을 결론으로 끌어올렸지만 지문은 실제 선택지가 줄어든다고 말합니다.",
  "도입부함정 — 전환 앞의 편익 서술을 요지로 승격한 진술입니다.",
  "범위확대 — 지문이 말하지 않은 제도적 해결책까지 넓힌 진술입니다.",
  "근거없음 — 그럴듯한 통념이지만 지문에 근거 문장이 없습니다.",
];

const EXPLANATION =
  "필자는 개인화 추천이 넓어졌다는 체감을 주지만 그 확장은 화면에 대한 것이라고 지적합니다. " +
  "실제로 제공되는 자료의 범위는 되먹임이 반복될수록 좁아지므로, 체감과 실제가 어긋난다는 것이 이 글의 요지입니다.";

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];

function mdOf(over?: {
  stemLine?: string | null;
  evidence?: string | null;
  options?: string[];
  answer?: string;
  explanation?: string | null;
  wrong?: string[];
}): string {
  const options = over?.options ?? OPTIONS_KO;
  const wrong = over?.wrong ?? WRONG_KO;
  const lines: string[] = [];
  if (over?.stemLine !== null) lines.push(over?.stemLine ?? "발문형: 요지");
  if (over?.evidence !== null) lines.push(`근거: ${over?.evidence ?? EVIDENCE}`);
  options.forEach((text, index) => lines.push(`${CIRCLED[index]} ${text}`));
  lines.push(`정답: ${over?.answer ?? "①"}`);
  if (over?.explanation !== null) lines.push(`해설: ${over?.explanation ?? EXPLANATION}`);
  lines.push("오답:");
  wrong.forEach((text, index) => lines.push(`${CIRCLED[index + 1]} ${text}`));
  return lines.join("\n");
}

const GOOD = mdOf();

function gateOf(text: string, options?: Parameters<typeof gateMdMainIdea>[2]): string[] {
  const q = autoSnapMainIdea(parseMdMainIdea(text), PASSAGE).question;
  return gateMdMainIdea(q, PASSAGE, { optionCount: 5, answerCount: 1, ...options });
}

/** 게이트가 그 자리를 지목하는지 — 메시지가 곧 재생성 피드백이라 문구까지 본다. */
function rejects(
  name: string,
  text: string,
  needle: string,
  options?: Parameters<typeof gateMdMainIdea>[2],
) {
  const issues = gateOf(text, options);
  check(name, issues.some((i) => i.includes(needle)), issues.join(" / ") || "(반려 없음)");
}
/** 선지 배열만 갈아 끼운 md — 게이트 반려 픽스처의 최다 형태. */
const withOptions = (...options: string[]) => mdOf({ options });

const ctxOf = (over: Partial<MdLaneContext> = {}): MdLaneContext => ({
  passage: PASSAGE,
  difficulty: "KILLER",
  rawDifficulty: "KILLER",
  resolved: {},
  rawTypeSettings: null,
  teacherPoints: [],
  variantIndex: 0,
  variantCount: 1,
  ...over,
});

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdMainIdea(GOOD);
check("파싱: 선지 5개", parsed.options.length === 5, `실제 ${parsed.options.length}`);
check("파싱: 라벨 축 ①~⑤", parsed.options.map((o) => o.label).join("") === "①②③④⑤");
check("파싱: 발문형 요지", parsed.stemAxis === "요지", parsed.stemAxis);
check("파싱: 근거 축자", parsed.evidence === EVIDENCE, parsed.evidence);
check("파싱: 정답 ①", parsed.answers.join(",") === "①", parsed.answers.join(","));
check("파싱: 오답해설 4개", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check("파싱: 오답 라벨 ②~⑤", parsed.wrong.map((w) => w.label).join("") === "②③④⑤");
check("파싱: 해설 존재", parsed.explanation === EXPLANATION, parsed.explanation.slice(0, 40));
check("파싱: 선지 본문에 라벨 잔재 없음", parsed.options.every((o) => !/^[①-⑧]/.test(o.text)));

const snapped = autoSnapMainIdea(parsed, PASSAGE);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
check("게이트: 정상 입력 클린", gateMdMainIdea(snapped.question, PASSAGE, { optionCount: 5, answerCount: 1 }).length === 0, gateMdMainIdea(snapped.question, PASSAGE, { optionCount: 5, answerCount: 1 }).join(" / "));
check("라벨 유틸: 원문자·숫자·괄호 표기 정규화", mainIdeaLabelOf("③") === "③" && mainIdeaLabelOf("3") === "③" && mainIdeaLabelOf("(3)") === "③" && mainIdeaLabelOf("9") === "");

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 전종
// ───────────────────────────────────────────────────────────────────────────
const TEACHER_SENTENCE = "Users therefore report that their tastes feel broader than ever.";
check("게이트: 선지 4개면 반려(개수 단독 반환)", gateOf(mdOf({ options: OPTIONS_KO.slice(0, 4), wrong: WRONG_KO.slice(0, 3) })).join(" / ").startsWith("선지 4개"));
rejects("게이트: 라벨 순서 어긋나면 반려", GOOD.replace("③ 개인화 추천은 원하는", "⑥ 개인화 추천은 원하는"), "순서가 아님");
rejects("게이트: 선지 본문 누락 반려", GOOD.replace(`④ ${OPTIONS_KO[3]}`, "④"), "선지 본문 누락");
rejects("게이트: 선지 중복 반려", withOptions(OPTIONS_KO[0], OPTIONS_KO[1], OPTIONS_KO[1], OPTIONS_KO[3], OPTIONS_KO[4]), "선지 중복");
rejects("게이트: 선지 포함관계 반려(종결부호 차이로 새던 구멍)", withOptions(OPTIONS_KO[0], "개인화 추천은 이용자의 취향을 실제로 넓혀 준다는 점이 중요하다.", OPTIONS_KO[1], OPTIONS_KO[3], OPTIONS_KO[4]), "포함관계");
rejects("게이트: 선지 길이 불균형 반려", withOptions("개인화 추천은 취향이 넓어진다는 느낌을 주면서도 되먹임이 반복될수록 실제로 접할 수 있는 자료의 폭은 오히려 좁아지므로 확장의 체감과 실제 결과는 어긋난다.", "추천은 편리하다.", OPTIONS_KO[2], OPTIONS_KO[3], OPTIONS_KO[4]), "길이 불균형");
rejects("게이트: 한국어 설정인데 영어 선지면 반려", withOptions(OPTIONS_KO[0], "Recommendation feels wider than it is.", OPTIONS_KO[2], OPTIONS_KO[3], OPTIONS_KO[4]), "한국어 진술문이 아님");
rejects("게이트: 명사구 선지 다수면 반려(제목·주제형 표면)", withOptions("개인화 추천의 확장 착각", "추천 알고리즘과 취향의 관계", "탐색 비용 절감의 효과", "플랫폼 규제의 필요성", "알고리즘 신뢰도 문제"), "명사구");
rejects("게이트: 정답 누락 반려", GOOD.replace("정답: ①\n", ""), "정답 누락");
rejects("게이트: 정답 개수 불일치 반려", mdOf({ answer: "①, ③" }), "정답 2개");
rejects("게이트: 정답 라벨이 선지에 없으면 반려", mdOf({ answer: "⑦" }), "정답 라벨(⑦)이 선지에 없음");
rejects("게이트: 근거 누락 반려", mdOf({ evidence: null }), "근거 문장 누락");
rejects("게이트: 근거가 지문에 없으면 반려(지문 정합 유일 앵커)", mdOf({ evidence: "Recommendation engines quietly reduce the range of what users can find." }), "지문에 축자로 없음");
rejects("게이트: 근거가 너무 짧으면 반려", mdOf({ evidence: "Every click is read" }), "너무 짧음");
rejects("게이트: 근거가 지문 통째면 반려(문장 하나 계약)", mdOf({ evidence: PASSAGE }), "지문 문장 하나만");
rejects("게이트: 해설 누락 반려", mdOf({ explanation: null }), "해설 누락");
rejects("게이트: 해설이 한국어가 아니면 반려", mdOf({ explanation: "The writer argues that personalization narrows the pool of material." }), "해설이 한국어가 아님");
rejects("게이트: 해설이 너무 짧으면 반려", mdOf({ explanation: "요지입니다." }), "해설이 너무 짧음");
rejects("게이트: 오답해설 개수 반려", mdOf({ wrong: WRONG_KO.slice(0, 3) }), "오답해설 3개");
rejects("게이트: 오답해설 누락 라벨 지목", mdOf({ wrong: WRONG_KO.slice(0, 3) }), "⑤ 오답해설 누락");
rejects("게이트: 오답해설이 너무 짧으면 반려", mdOf({ wrong: [WRONG_KO[0], "짧다", WRONG_KO[2], WRONG_KO[3]] }), "너무 짧음");
check("게이트: 오답해설에 정답 라벨이 남으면 반려", gateMdMainIdea({ ...snapped.question, wrong: [...snapped.question.wrong, { label: "①", text: "정답인데 끼어듦" }] }, PASSAGE, { optionCount: 5, answerCount: 1 }).some((i) => i.includes("정답 라벨 포함")));
rejects("게이트: 교사 지정 근거 문장 미반영 반려", GOOD, "교사 지정 근거 문장", { teacherPoints: [TEACHER_SENTENCE] });
check("게이트: 교사 지정 문장을 근거로 쓰면 클린", gateOf(mdOf({ evidence: TEACHER_SENTENCE }), { teacherPoints: [TEACHER_SENTENCE] }).length === 0, gateOf(mdOf({ evidence: TEACHER_SENTENCE }), { teacherPoints: [TEACHER_SENTENCE] }).join(" / "));

// 영어 선지 설정 — 언어 축이 반대로 뒤집힌다.
const OPTIONS_EN = [
  "Personalized recommendation systems feel expansive while quietly narrowing what users can reach.",
  "Personalized recommendation systems genuinely broaden the tastes of their users.",
  "Personalized recommendation systems lower the cost of searching for material.",
  "Recommendation algorithms should be regulated by public institutions.",
  "Users do not trust the material that recommendation algorithms select.",
];
check("게이트(영어 선지 설정): 영어 선지는 클린", gateOf(mdOf({ options: OPTIONS_EN }), { optionLanguage: "en" }).length === 0, gateOf(mdOf({ options: OPTIONS_EN }), { optionLanguage: "en" }).join(" / "));
rejects("게이트(영어 선지 설정): 한국어가 섞이면 반려", withOptions(OPTIONS_EN[0], OPTIONS_KO[1], OPTIONS_EN[2], OPTIONS_EN[3], OPTIONS_EN[4]), "한국어가 섞임", { optionLanguage: "en" });
rejects("게이트: 정답 선지가 근거 문장 축자 복사면 반려", withOptions(EVIDENCE, OPTIONS_EN[1], OPTIONS_EN[2], OPTIONS_EN[3], OPTIONS_EN[4]), "축자 복사", { optionLanguage: "en" });

// 복수 정답 설정 — 정답 2개 · 오답해설 3개.
{
  const multi = mdOf({ answer: "①, ③", wrong: [WRONG_KO[0], WRONG_KO[2], WRONG_KO[3]] });
  const q = parseMdMainIdea(multi);
  check("복수정답 파싱: 정답 2개", q.answers.join(",") === "①,③", q.answers.join(","));
  const issues = gateMdMainIdea(autoSnapMainIdea(q, PASSAGE).question, PASSAGE, { optionCount: 5, answerCount: 2 });
  check("복수정답 게이트: 오답해설 라벨이 어긋나면 지목", issues.some((i) => i.includes("오답해설")), issues.join(" / "));
}
{
  // 정답 ①③ · 오답해설 ②④⑤ 정합 — 클린이어야 한다.
  const lines = [
    "발문형: 요지",
    `근거: ${EVIDENCE}`,
    ...OPTIONS_KO.map((text, index) => `${CIRCLED[index]} ${text}`),
    "정답: ①, ③",
    `해설: ${EXPLANATION}`,
    "오답:",
    `② ${WRONG_KO[0]}`,
    `④ ${WRONG_KO[2]}`,
    `⑤ ${WRONG_KO[3]}`,
  ].join("\n");
  const q = autoSnapMainIdea(parseMdMainIdea(lines), PASSAGE).question;
  const issues = gateMdMainIdea(q, PASSAGE, { optionCount: 5, answerCount: 2 });
  check("복수정답 게이트: 정답 2개 · 오답해설 3개면 클린", issues.length === 0, issues.join(" / "));
  const ai = (adaptMdMainIdeaToAiQuestion(q, PASSAGE, "KILLER").aiQuestion ?? {}) as Record<string, unknown>;
  check("복수정답 어댑터: correctAnswer '1, 3' + correctAnswers 배열", ai.correctAnswer === "1, 3" && Array.isArray(ai.correctAnswers) && (ai.correctAnswers as string[]).join(",") === "1,3", String(ai.correctAnswer));
  check("복수정답 어댑터: 발문에 '모두'", String(ai.direction).includes("모두"), String(ai.direction));
}

// ───────────────────────────────────────────────────────────────────────────
// 3. 드리프트 관용 — 전부 5선지 + 게이트 클린이어야 한다(줄 유실 회귀 방지)
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string][] = [
  ["불릿 접두", `① ${OPTIONS_KO[0]}`, `- ① ${OPTIONS_KO[0]}`],
  ["별표 불릿", `② ${OPTIONS_KO[1]}`, `* ② ${OPTIONS_KO[1]}`],
  ["굵게 라벨", `③ ${OPTIONS_KO[2]}`, `**③** ${OPTIONS_KO[2]}`],
  ["표 형식 행", `④ ${OPTIONS_KO[3]}`, `| ④ | ${OPTIONS_KO[3]} |`],
  ["라벨 뒤 마침표", `⑤ ${OPTIONS_KO[4]}`, `⑤. ${OPTIONS_KO[4]}`],
  ["라벨 뒤 공백 과다", `① ${OPTIONS_KO[0]}`, `①    ${OPTIONS_KO[0]}`],
  ["선지 굵게 표기", `② ${OPTIONS_KO[1]}`, `② **${OPTIONS_KO[1]}**`],
  ["근거 인용부호", `근거: ${EVIDENCE}`, `근거: "${EVIDENCE}"`],
  ["근거 곱슬 인용부호", `근거: ${EVIDENCE}`, `근거: “${EVIDENCE}”`],
  ["전각 콜론(정답)", "정답: ①", "정답： ①"],
  ["정답 뒤 사족", "정답: ①", "정답: ① — 나머지 넷은 전부 탈락합니다"],
  ["정답 굵게", "정답: ①", "정답: **①**"],
  ["발문형 누락", "발문형: 요지\n", ""],
  ["발문형 사족", "발문형: 요지", "발문형: 요지(주제가 아니라 요지)"],
  ["오답 목록에 정답 줄 끼워넣기", "오답:", "오답:\n① 이건 정답이라 여기 있으면 안 됩니다"],
  ["선지 앞 산문 줄", "① 개인화", "이 문항은 전환 이후를 겨냥합니다.\n① 개인화"],
  ["번호 매긴 설계 메모(원문자 우선 계약)", "① 개인화", "1. 전환 이후가 요지다\n① 개인화"],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdMainIdea(drifted);
  const issues = gateOf(drifted);
  check(`줄 유실 방지: ${name}`, q.options.length === 5 && issues.length === 0, `선지 ${q.options.length}개 · ${issues.join(" / ")}`);
}
{
  const digits = ["1.", "2.", "3.", "4.", "5."];
  const text = [
    "발문형： 요지", `근거： ${EVIDENCE}`,
    ...OPTIONS_KO.map((t, i) => `${digits[i]} ${t}`),
    "정답： 1", `해설： ${EXPLANATION}`, "오답：",
    ...WRONG_KO.map((t, i) => `${digits[i + 1]} ${t}`),
  ].join("\n");
  const q = parseMdMainIdea(text);
  check("드리프트: 전각 콜론 + 숫자 라벨 전면 폴백", q.options.length === 5 && q.answers.join("") === "①" && gateOf(text).length === 0, `선지 ${q.options.length}개 · ${gateOf(text).join(" / ")}`);
}
check("드리프트: 발문형 주장 인식", parseMdMainIdea(GOOD.replace("발문형: 요지", "발문형: 주장")).stemAxis === "주장");

// ───────────────────────────────────────────────────────────────────────────
// 4. 스냅 — 0원 자동 보정
// ───────────────────────────────────────────────────────────────────────────
const cleanGate = (q: Parameters<typeof gateMdMainIdea>[0]) =>
  gateMdMainIdea(q, PASSAGE, { optionCount: 5, answerCount: 1 });
{
  const s = autoSnapMainIdea(parseMdMainIdea(GOOD.replace(`① ${OPTIONS_KO[0]}`, `① ${OPTIONS_KO[0]} (정답)`)), PASSAGE);
  check("스냅: 선지의 인라인 정답 표시 제거(정답의 진실원은 `정답:` 줄뿐)", s.corrections.length === 1 && s.question.options[0].text === OPTIONS_KO[0], `${s.corrections.join(" / ")} · '${s.question.options[0].text}'`);
  check("스냅 후 게이트 클린", cleanGate(s.question).length === 0, cleanGate(s.question).join(" / "));
}
{
  // 근거 줄에서 잔단어가 빠진 실측형 드리프트 — 정본 snapExpressionSpan 가드로 축자 복원.
  const drift = "The sense of expansion is real, but describes the interface rather than the catalogue.";
  const s = autoSnapMainIdea(parseMdMainIdea(mdOf({ evidence: drift })), PASSAGE);
  check("스냅: 근거 문장을 지문 축자로 복원", s.corrections.some((c) => c.includes("근거 문장")) && s.question.evidence === EVIDENCE, `${s.corrections.join(" / ")} · '${s.question.evidence}'`);
  check("스냅 후 게이트 클린(근거)", cleanGate(s.question).length === 0, cleanGate(s.question).join(" / "));
  // 보수 가드 — 머리·꼬리가 지문에 없으면 스냅하지 않고 게이트에 맡긴다.
  const wild = "Recommendation engines quietly reduce the range of what users can find.";
  const w = autoSnapMainIdea(parseMdMainIdea(mdOf({ evidence: wild })), PASSAGE);
  check("스냅 보수 가드: 근거가 지문과 무관하면 손대지 않음", w.corrections.length === 0 && w.question.evidence === wild);
}

// ───────────────────────────────────────────────────────────────────────────
// 4-b. 회귀 픽스처 — 적대검수 웨이브 2 지적분(critical 1 · major 3)
//      전부 "실측 프로브로 재현된 뒤" 고정한 것이다.
// ───────────────────────────────────────────────────────────────────────────

// [critical · gate-gap] 인라인 정답 표시 제거가 줄 끝(`$` 앵커)에만 걸려 있었다.
// 앞머리 `(정답)`·꼬리 `← 정답`·체크 이모지가 스냅·게이트·품질검증기를 전부 클린으로
// 통과해 **정답이 표시된 선지가 그대로 시험지에 인쇄**됐다. 위치 무관 전역 제거로 고친다.
const INLINE_ANSWER_MARK_CASES: [string, string][] = [
  ["앞머리 (정답)", `(정답) ${OPTIONS_KO[0]}`],
  ["앞머리 [정답]", `[정답] ${OPTIONS_KO[0]}`],
  ["앞머리 【정답】", `【정답】 ${OPTIONS_KO[0]}`],
  ["꼬리 (정답)", `${OPTIONS_KO[0]} (정답)`],
  ["꼬리 굵게 **(정답)**", `${OPTIONS_KO[0]} **(정답)**`],
  ["꼬리 화살표 ← 정답", `${OPTIONS_KO[0]} ← 정답`],
  ["꼬리 화살표 <- 정답", `${OPTIONS_KO[0]} <- 정답`],
  ["꼬리 화살표 → 정답선지", `${OPTIONS_KO[0]} → 정답선지`],
  ["앞머리 체크 이모지 ✅", `✅ ${OPTIONS_KO[0]}`],
  ["앞머리 ✔️(이형자 선택자 포함)", `✔️ ${OPTIONS_KO[0]}`],
  ["앞머리 👉 (answer)", `👉 (answer) ${OPTIONS_KO[0]}`],
  ["꼬리 (correct)", `${OPTIONS_KO[0]} (correct)`],
];
for (const [name, text] of INLINE_ANSWER_MARK_CASES) {
  const s = autoSnapMainIdea(parseMdMainIdea(withOptions(text, ...OPTIONS_KO.slice(1))), PASSAGE);
  const issues = cleanGate(s.question);
  check(
    `스냅(회귀·critical): 인라인 정답 표시 위치 무관 제거 — ${name}`,
    s.question.options[0].text === OPTIONS_KO[0] &&
      s.corrections.length === 1 &&
      issues.length === 0,
    `'${s.question.options[0].text}' · ${s.corrections.join(" / ")} · ${issues.join(" / ")}`,
  );
}
rejects(
  "게이트(회귀·critical): 스냅이 못 걷어낸 정답 표시 잔재를 라벨로 지목",
  withOptions(`정답 ${OPTIONS_KO[0]}`, ...OPTIONS_KO.slice(1)),
  "① 선지 본문에 정답 표시가 남음",
);
rejects(
  "게이트(회귀·critical): 스냅이 모르는 괄호 변형(`(정답 선지임)`)도 지목",
  withOptions(`${OPTIONS_KO[0]} (정답 선지임)`, ...OPTIONS_KO.slice(1)),
  "① 선지 본문에 정답 표시가 남음",
);
check(
  "게이트(회귀·critical): 체크 이모지 잔재 지목(스냅을 우회한 직접 호출 경로 방어)",
  cleanGate({
    ...snapped.question,
    options: [
      { label: "①", text: `✅ ${OPTIONS_KO[0]}` },
      ...snapped.question.options.slice(1),
    ],
  }).some((i) => i.includes("① 선지 본문에 정답 표시가 남음")),
);
check(
  "게이트(회귀·critical): 조사가 붙은 '정답을' 은 본문 어휘로 통과(오반려 방지)",
  gateOf(
    withOptions(
      "학생은 정답을 맞히는 능력보다 스스로 질문을 세우는 능력을 길러야 한다.",
      ...OPTIONS_KO.slice(1),
    ),
  ).length === 0,
  gateOf(withOptions("학생은 정답을 맞히는 능력보다 스스로 질문을 세우는 능력을 길러야 한다.", ...OPTIONS_KO.slice(1))).join(" / "),
);
check(
  "게이트(회귀·critical): 영어 선지의 'correct'·'answer' 는 본문 어휘로 통과(오반려 방지)",
  gateOf(
    withOptions(
      "Users are correct to sense expansion, yet the answer lies in the interface rather than the catalogue.",
      ...OPTIONS_EN.slice(1),
    ),
    { optionLanguage: "en" },
  ).length === 0,
  gateOf(withOptions("Users are correct to sense expansion, yet the answer lies in the interface rather than the catalogue.", ...OPTIONS_EN.slice(1)), { optionLanguage: "en" }).join(" / "),
);

// [major · silent-drop] 섹션 라벨에 마크다운 장식이 붙으면 앵커 매칭이 전멸했다.
// `**정답:**` 하나로 선지 구간 절단이 실패해 오답해설까지 선지로 흡수(9개) → 게이트가
// `선지 9개 (5개 필요)` 만 뱉고, 그 거짓 피드백이 [반려 재생성] 프롬프트에 실렸다.
const KEYWORD_DECORATION_DRIFTS: [string, string, string][] = [
  ["정답 굵게 헤더", "정답: ①", "**정답:** ①"],
  ["정답 굵게(콜론 밖)", "정답: ①", "**정답**: ①"],
  ["정답 헤딩", "정답: ①", "### 정답: ①"],
  ["정답 불릿", "정답: ①", "- 정답: ①"],
  ["정답 인용", "정답: ①", "> 정답: ①"],
  ["정답 굵게 + 전각 콜론 + 값 굵게", "정답: ①", "**정답：** **①**"],
  ["오답 굵게 헤더", "오답:", "**오답:**"],
  ["오답 헤딩(콜론 없음)", "오답:", "### 오답"],
  ["오답 불릿", "오답:", "- 오답:"],
  ["근거 굵게 헤더", "근거: ", "**근거:** "],
  ["근거 인용 + 값 굵게", `근거: ${EVIDENCE}`, `> 근거: **${EVIDENCE}**`],
  ["해설 굵게 헤더", "해설: ", "**해설:** "],
  ["해설 헤딩", "해설: ", "#### 해설: "],
  ["발문형 굵게 헤더", "발문형: 요지", "**발문형:** 요지"],
];
for (const [name, from, to] of KEYWORD_DECORATION_DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdMainIdea(drifted);
  const issues = gateOf(drifted);
  check(
    `키워드 줄 관용(회귀·major): ${name}`,
    q.options.length === 5 &&
      q.answers.join("") === "①" &&
      q.wrong.length === 4 &&
      q.evidence === EVIDENCE &&
      q.explanation === EXPLANATION &&
      issues.length === 0,
    `선지 ${q.options.length} · 정답 '${q.answers.join("")}' · 오답 ${q.wrong.length} · 근거 '${q.evidence.slice(0, 24)}' · ${issues.join(" / ")}`,
  );
}
{
  // `### 정답` 헤딩은 값이 다음 줄로 내려간다 — 같은 경로로 흡수해야 정답이 살아난다.
  const headingAnswer = GOOD.replace("정답: ①", "### 정답\n①");
  const q = parseMdMainIdea(headingAnswer);
  check(
    "키워드 줄 관용(회귀·major): `### 정답` 헤딩 — 값이 다음 줄이어도 읽는다",
    q.answers.join("") === "①" && q.options.length === 5 && gateOf(headingAnswer).length === 0,
    `'${q.answers.join("")}' · 선지 ${q.options.length} · ${gateOf(headingAnswer).join(" / ")}`,
  );
}
{
  // 앵커를 하나도 못 찾으면 개수 오류가 아니라 **원인**을 지목해야 한다(철칙 3·5).
  const noAnchors = [
    "발문형: 요지",
    `근거: ${EVIDENCE}`,
    ...OPTIONS_KO.map((text, index) => `${CIRCLED[index]} ${text}`),
    `해설: ${EXPLANATION}`,
    ...WRONG_KO.map((text, index) => `${CIRCLED[index + 1]} ${text}`),
  ].join("\n");
  const q = parseMdMainIdea(noAnchors);
  const issues = gateOf(noAnchors);
  check(
    "게이트(회귀·major): `정답:`·`오답:` 를 하나도 못 찾으면 개수 대신 원인을 지목",
    issues.length === 1 &&
      issues[0].includes("`정답:`·`오답:` 줄을 찾지 못함") &&
      !issues.some((i) => i.includes("선지 9개")),
    issues.join(" / "),
  );
  check(
    "파싱(회귀·major): 섹션 앵커 탐지 기록(anchors)",
    q.anchors.answer === false &&
      q.anchors.wrong === false &&
      parseMdMainIdea(GOOD).anchors.answer &&
      parseMdMainIdea(GOOD).anchors.wrong &&
      parseMdMainIdea(GOOD.replace("정답: ①\n", "")).anchors.wrong,
  );
}
rejects(
  "게이트(회귀·major): `정답:` 만 없으면 종전대로 '정답 누락'(앵커 방어선이 덮어쓰지 않음)",
  GOOD.replace("정답: ①\n", ""),
  "정답 누락",
);

// [major · silent-drop] 선지가 두 줄로 접히면 둘째 줄이 통째로 버려져,
// 쉼표로 끝나는 **미완성 정답 선지**가 게이트 완전 클린으로 저장됐다(= 정답 없는 문항).
const FOLDED_TAIL = "실제 선택의 폭은 좁아진다.";
const FOLDED_HEAD = "개인화 추천이 주는 확장의 체감은 화면에 대한 것일 뿐이며,";
{
  const folded = GOOD.replace(`① ${OPTIONS_KO[0]}`, `① ${FOLDED_HEAD}\n   ${FOLDED_TAIL}`);
  const q = parseMdMainIdea(folded);
  const issues = gateOf(folded);
  check(
    "파싱(회귀·major): 두 줄로 접힌 선지를 이어 붙인다(둘째 줄 유실 차단)",
    q.options.length === 5 && q.options[0].text === `${FOLDED_HEAD} ${FOLDED_TAIL}`,
    `${q.options.length}개 · '${q.options[0].text}'`,
  );
  check("파싱(회귀·major): 이어 붙인 선지는 게이트 클린", issues.length === 0, issues.join(" / "));
}
rejects(
  "게이트(회귀·major): 이어짐 줄이 아예 없어 잘린 선지는 라벨로 지목",
  GOOD.replace(`① ${OPTIONS_KO[0]}`, `① ${FOLDED_HEAD}`),
  "① 선지가 문장으로 끝나지 않음",
);
rejects(
  "게이트(회귀·major): 연결어미로 끝난 선지도 잘림으로 지목",
  withOptions("개인화 추천은 취향이 넓어진다는 느낌을 주지만", ...OPTIONS_KO.slice(1)),
  "선지가 문장으로 끝나지 않음",
);
check(
  "파싱(회귀·major): 이어짐 관용이 키워드 줄을 삼키지 않는다(`정답:` 부재 시 `해설:` → ⑤)",
  (() => {
    const q = parseMdMainIdea(GOOD.replace("정답: ①\n", ""));
    return q.options.length === 5 && q.options[4].text === OPTIONS_KO[4];
  })(),
  parseMdMainIdea(GOOD.replace("정답: ①\n", "")).options[4]?.text,
);
check(
  "파싱(회귀·major): 이어짐 관용이 구분선·표 구분행을 삼키지 않는다",
  (() => {
    const q = parseMdMainIdea(GOOD.replace(`② ${OPTIONS_KO[1]}`, `② ${OPTIONS_KO[1]}\n|---|---|\n---`));
    return q.options.length === 5 && q.options[1].text === OPTIONS_KO[1];
  })(),
);

// ───────────────────────────────────────────────────────────────────────────
// 5. 어댑터 → 후처리 왕복
// ───────────────────────────────────────────────────────────────────────────
const adapt = adaptMdMainIdeaToAiQuestion(snapped.question, PASSAGE, "KILLER");
check("어댑터: 성공", adapt.ok === true, adapt.error);
const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
const rows = (value: unknown) => (value as Array<Record<string, unknown>>) ?? [];
const adaptFails = (over: Record<string, unknown>) =>
  adaptMdMainIdeaToAiQuestion({ ...snapped.question, ...over }, PASSAGE, "KILLER").ok === false;
check("어댑터: 발문 결정형(요지·긍정·단일·한국어)", ai.direction === "다음 글의 요지로 가장 적절한 것은?", String(ai.direction));
check("어댑터: 선지 라벨 숫자 문자열 '1'~'5' + 본문 보존", rows(ai.options).map((o) => o.label).join(",") === "1,2,3,4,5" && rows(ai.options)[0].text === OPTIONS_KO[0]);
check("어댑터: correctAnswer '1'", ai.correctAnswer === "1", String(ai.correctAnswer));
check("어댑터: 단일 정답이면 correctAnswers 미생성", !("correctAnswers" in ai));
check("어댑터: 오답해설 라벨이 선지 라벨 축과 동행", rows(ai.wrongOptionExplanations).map((w) => w.label).join(",") === "2,3,4,5");
check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
check("어댑터: 빈칸 계열 이물 필드 없음(type-foreign-field 방어)", !("blanks" in ai) && !("passageWithBlank" in ai) && !("originalExpression" in ai) && !("blankAnswerMode" in ai));
check("어댑터: 지문 필드·근거를 만들지 않음(PASSTHROUGH 계약)", !("passageWithMarkers" in ai) && !("passageWithUnderline" in ai) && !("evidence" in ai) && !("근거" in ai));
check("어댑터: difficulty 원본 전달", ai.difficulty === "KILLER");
check("어댑터: 정답 라벨이 선지에 없으면 실패", adaptFails({ answers: ["⑧"] }));
check("어댑터: 선지 3개면 실패(형상 방어)", adaptFails({ options: snapped.question.options.slice(0, 3) }));
check("어댑터: 오답해설 라벨 중복이면 실패(조용한 소실 차단)", adaptFails({ wrong: [...snapped.question.wrong, { label: "②", text: "중복" }] }));
check("라벨 유틸: 원문자 → 저장 숫자 라벨", mainIdeaDigitLabel("①") === "1" && mainIdeaDigitLabel("⑧") === "8" && mainIdeaDigitLabel("x") === "x");

// 발문 16종 — 검증기 정규식(요지·주장 / 적절하지 않은·NOT / 모두·all)과 동시에 맞물리는지.
const dir = buildMainIdeaMdDirection;
check("발문: 주장축 긍정 단일", dir({ stemAxis: "주장" }) === "다음 글에서 필자가 주장하는 바로 가장 적절한 것은?");
check("발문: 요지축 부정 단일", dir({ negative: true }) === "다음 글의 요지로 가장 적절하지 않은 것은?");
check("발문: 요지축 부정 복수", dir({ negative: true, multi: true }) === "다음 글의 요지로 적절하지 않은 것을 모두 고르시오.");
check("발문: 영어 요지축 긍정", /main idea/.test(dir({ language: "en" })));
check("발문: 영어 주장축은 writer's claim", /writer's claim/.test(dir({ language: "en", stemAxis: "주장" })));
check("발문: 영어 부정은 NOT 포함", /\bNOT\b/.test(dir({ language: "en", negative: true })));
check("발문: 영어 복수는 all 포함", /all/.test(dir({ language: "en", multi: true })));
check("발문: 한국어 발문은 전부 '요지' 또는 '주장' 포함(검증기 정규식)", [dir({}), dir({ stemAxis: "주장" }), dir({ negative: true }), dir({ multi: true })].every((d) => /(요지|주장)/.test(d)));

// 후처리 왕복 — PASSTHROUGH 라 지문 필드는 생기지 않고 공통 정규화만 탄다.
const pp = postProcessQuestion("MAIN_IDEA", PASSAGE, ai as never);
check("후처리: 성공", pp.success === true, pp.error);
const data = (pp.data ?? {}) as Record<string, unknown>;
check("후처리: 지문 필드를 만들지 않음(PASSTHROUGH)", !("passageWithMarkers" in data) && !("passageWithBlank" in data));
check("후처리: 선지 5개 · 라벨 1~5 보존", rows(data.options).map((o) => o.label).join(",") === "1,2,3,4,5");
const woe = data.wrongOptionExplanations as Record<string, string>;
check("후처리: wrongOptionExplanations Record 정규화(키 2,3,4,5)", !!woe && !Array.isArray(woe) && Object.keys(woe).join(",") === "2,3,4,5", JSON.stringify(woe).slice(0, 60));
check("후처리: 한국어 선지 정렬 접두가 붙는다(VISIBLE_KOREAN_OPTION_TYPES)", Object.values(woe).every((v) => v.startsWith("'")), Object.values(woe)[0]?.slice(0, 40));
/** 정답 2개 픽스처(①③) — 셔플·검증기 양쪽에서 쓴다. */
const multiQuestion = {
  ...snapped.question,
  answers: ["①", "③"],
  wrong: snapped.question.wrong.filter((w) => w.label !== "③"),
};

// 품질 검증기 왕복 — md 게이트를 통과한 문항은 fast 검증기에서도 error 0 이어야 한다.
const errorCodesOf = (question: Record<string, unknown>, ctx: MdLaneContext, difficulty = "KILLER") =>
  validateQuestionQuality({
    typeId: "MAIN_IDEA",
    question: { ...question, difficulty },
    passage: PASSAGE,
    requestedDifficulty: difficulty,
    ...MAIN_IDEA_MD_LANE.qualityArgs(ctx),
  })
    .filter((i) => i.severity === "error")
    .map((i) => i.code);
const ppDataOf = (aiQuestion: Record<string, unknown>) =>
  (postProcessQuestion("MAIN_IDEA", PASSAGE, aiQuestion as never).data ?? {}) as Record<string, unknown>;
{
  const codes = errorCodesOf(data, ctxOf());
  check("품질 검증기: error 0 (fast 검증기 왕복)", codes.length === 0, codes.join(" / "));
}
{
  // 부정 극성 — 발문·qualityArgs 가 극성 게이트와 맞물리는지.
  const negCtx = ctxOf({ resolved: { answerPolarity: "NEGATIVE" } });
  const negAi = (MAIN_IDEA_MD_LANE.adapt({ question: snapped.question, gateIssues: [], corrections: [] }, negCtx)
    .aiQuestion ?? {}) as Record<string, unknown>;
  check("부정 극성 어댑터: '가장 적절하지 않은 것은?'", String(negAi.direction).includes("적절하지 않은"), String(negAi.direction));
  const codes = errorCodesOf(ppDataOf(negAi), negCtx);
  check("부정 극성 품질 검증기: error 0(gist-polarity 통과)", codes.length === 0, codes.join(" / "));
}
{
  // 복수 정답 — 발문 '모두' 요구(generic-multi-answer-direction)와 맞물리는지.
  const multiCtx = ctxOf({ resolved: { genericOptionCount: 5, genericAnswerCount: 2 } });
  const multiAi = (MAIN_IDEA_MD_LANE.adapt({ question: multiQuestion, gateIssues: [], corrections: [] }, multiCtx)
    .aiQuestion ?? {}) as Record<string, unknown>;
  const codes = errorCodesOf(ppDataOf(multiAi), multiCtx);
  check("복수정답 품질 검증기: error 0(generic-answer-count·발문 '모두')", codes.length === 0, codes.join(" / "));
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 셔플 상호작용 — MAIN_IDEA 는 SHUFFLE_OPTION_TYPES 멤버다(라우트가 저장 직전 호출).
// ───────────────────────────────────────────────────────────────────────────
{
  let sound = true;
  let shuffledAtLeastOnce = false;
  for (let i = 0; i < 30; i += 1) {
    const shuffled = shuffleQuestionOptionsForDiversity({ ...data }, "MAIN_IDEA");
    const options = rows(shuffled.options);
    const answerLabel = String(shuffled.correctAnswer);
    if (String(options.find((o) => String(o.label) === answerLabel)?.text) !== OPTIONS_KO[0]) sound = false;
    if (String(options[0].text) !== OPTIONS_KO[0]) shuffledAtLeastOnce = true;
    const rec = shuffled.wrongOptionExplanations as Record<string, string>;
    // 후처리가 붙인 접두("'{선지}' 선택지는 ...")가 셔플 뒤에도 같은 선지에 붙어 있어야 한다.
    for (const option of options) {
      const label = String(option.label);
      if (label === answerLabel) continue;
      if (!rec[label] || !rec[label].includes(String(option.text))) sound = false;
    }
  }
  check("셔플: 정답 키와 오답해설이 선지 내용과 동행", sound);
  check("셔플: 실제로 자리를 섞는다(정답 위치 편중 제거)", shuffledAtLeastOnce);
}
{
  // 복수정답도 셔플을 탄다 — 정답 두 개가 모두 내용과 동행해야 한다.
  const multiData = ppDataOf((adaptMdMainIdeaToAiQuestion(multiQuestion, PASSAGE, "KILLER").aiQuestion ?? {}) as Record<string, unknown>);
  let sound = true;
  for (let i = 0; i < 30; i += 1) {
    const shuffled = shuffleQuestionOptionsForDiversity({ ...multiData }, "MAIN_IDEA");
    const options = rows(shuffled.options);
    const labels = String(shuffled.correctAnswer).split(",").map((s) => s.trim());
    const texts = labels.map((l) => String(options.find((o) => String(o.label) === l)?.text));
    if (texts.sort().join("|") !== [OPTIONS_KO[0], OPTIONS_KO[2]].sort().join("|")) sound = false;
    if ((shuffled.correctAnswers as string[]).join(", ") !== String(shuffled.correctAnswer)) sound = false;
  }
  check("셔플(복수정답): correctAnswer·correctAnswers 가 정답 내용과 동행", sound);
}

// ───────────────────────────────────────────────────────────────────────────
// 6-b. 선지 6~8개 경로 — ⑥⑦⑧ 라벨이 파싱·게이트·저장 라벨까지 관통하는지.
// ───────────────────────────────────────────────────────────────────────────
{
  const text = mdOf({
    options: [...OPTIONS_KO, "추천의 정확도는 이용자 수가 늘수록 높아진다."],
    wrong: [...WRONG_KO, "부분승격 — 지문의 부수 조건을 요지로 끌어올린 진술입니다."],
  });
  const q = autoSnapMainIdea(parseMdMainIdea(text), PASSAGE).question;
  const issues = gateMdMainIdea(q, PASSAGE, { optionCount: 6, answerCount: 1 });
  check("6선지: 파싱 라벨 ①~⑥", q.options.map((o) => o.label).join("") === "①②③④⑤⑥");
  check("6선지: 게이트 클린", issues.length === 0, issues.join(" / "));
  check("6선지: 5개 설정이면 개수 반려(설정 집행)", gateMdMainIdea(q, PASSAGE, { optionCount: 5, answerCount: 1 })[0]?.startsWith("선지 6개"));
  const ai6 = (adaptMdMainIdeaToAiQuestion(q, PASSAGE, "INTERMEDIATE").aiQuestion ?? {}) as Record<string, unknown>;
  check("6선지 어댑터: 저장 라벨 '1'~'6' + 오답해설 5개", rows(ai6.options).map((o) => o.label).join(",") === "1,2,3,4,5,6" && rows(ai6.wrongOptionExplanations).length === 5);
  const codes = errorCodesOf(ppDataOf(ai6), ctxOf({ resolved: { genericOptionCount: 6 } }), "INTERMEDIATE");
  check("6선지 품질 검증기: error 0(option-count 정합)", codes.length === 0, codes.join(" / "));
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 레인 계약 — 과금·적격성·설정 집행·다양성
// ───────────────────────────────────────────────────────────────────────────
const lane = MAIN_IDEA_MD_LANE;
const teacherCtx = ctxOf({ teacherPoints: [{ text: TEACHER_SENTENCE, unit: "sentence" }] });
check("레인: subType MAIN_IDEA", lane.subType === "MAIN_IDEA");
check("레인: 과금 QUESTION_GEN_SINGLE (fast getOperationType 동기 · 2크레딧)", lane.operationType === "QUESTION_GEN_SINGLE" && CREDIT_COSTS.QUESTION_GEN_SINGLE === 2, String(lane.operationType));
check("레인: retryEligible", lane.retryEligible === true);
check("레인: 적격성 선지 4~8 · 정답 1~N-1", lane.isEligible({}) && lane.isEligible({ genericOptionCount: 4 }) && lane.isEligible({ genericOptionCount: 8, genericAnswerCount: 7 }) && !lane.isEligible({ genericOptionCount: 3 }) && !lane.isEligible({ genericOptionCount: 9 }) && !lane.isEligible({ genericOptionCount: 5, genericAnswerCount: 5 }) && !lane.isEligible({ genericOptionCount: 5, genericAnswerCount: 0 }));
check("레인: parseAndGate 정상 입력 클린 + 스냅 기록 전달", lane.parseAndGate(GOOD, ctxOf()).gateIssues.length === 0, lane.parseAndGate(GOOD, ctxOf()).gateIssues.join(" / "));
check("레인: parseAndGate 가 설정 개수를 게이트에 집행", lane.parseAndGate(GOOD, ctxOf({ resolved: { genericOptionCount: 6 } })).gateIssues.some((i) => i.includes("6개 필요")));
check("레인: parseAndGate 가 교사 지정 문장을 게이트로 집행", lane.parseAndGate(GOOD, teacherCtx).gateIssues.some((i) => i.includes("교사 지정")));
check("레인: buildExtras 는 교사 지정이 없으면 비어 있다", lane.buildExtras(ctxOf()).length === 0);
check("레인: buildExtras 가 교사 지정 시 `근거:` 집행 블록을 싣는다", lane.buildExtras(teacherCtx).length === 1 && lane.buildExtras(teacherCtx)[0].includes("`근거:` 줄"));
{
  const args = lane.qualityArgs(ctxOf({ resolved: { genericOptionCount: 6, genericAnswerCount: 2 } }));
  check("레인: qualityArgs 가 개수·언어 실값 전달", args.genericOptionCount === 6 && args.genericAnswerCount === 2 && args.stemLanguage === "ko" && args.optionLanguage === "ko", JSON.stringify(args));
}
check("레인: qualityArgs 는 POSITIVE 에서 answerPolarity 키를 싣지 않는다(기본 경로 무변경)", !("answerPolarity" in lane.qualityArgs(ctxOf())) && lane.qualityArgs(ctxOf({ resolved: { answerPolarity: "NEGATIVE" } })).answerPolarity === "NEGATIVE");
{
  const ctx = ctxOf({ rawTypeSettings: { stemLanguage: "en", optionLanguage: "en" } });
  const args = lane.qualityArgs(ctx);
  const adapted = lane.adapt({ question: snapped.question, gateIssues: [], corrections: [] }, ctx);
  check("레인: 언어 설정 읽기(발문 en · 선지 en)", args.stemLanguage === "en" && args.optionLanguage === "en" && /main idea/.test(String((adapted.aiQuestion ?? {}).direction)), String((adapted.aiQuestion ?? {}).direction));
}
{
  const meta = lane.mdFormat(ctxOf({ resolved: { genericOptionCount: 7, genericAnswerCount: 3, answerPolarity: "NEGATIVE" } }));
  check("레인: mdFormat 포렌식 메타", meta.optionCount === 7 && meta.answerCount === 3 && meta.answerPolarity === "NEGATIVE" && meta.optionLanguage === "ko", JSON.stringify(meta));
}
{
  const targets = lane.diversityTargets({ options: [{ label: "1", text: OPTIONS_KO[0] }], correctAnswer: "1" });
  check("레인: diversityTargets 가 정답 진술을 회피 표적으로 내보내지 않는다(자기모순 차단)", targets.length === 1 && !targets[0].includes(OPTIONS_KO[0]) && targets[0].length <= 90 && lane.diversityTargets({}).length === 0, targets.join(" / "));
}

// ───────────────────────────────────────────────────────────────────────────
// 8. 프롬프트 계약 — 난이도 3분기 · 설정 집행 · 형식 리터럴
// ───────────────────────────────────────────────────────────────────────────
const promptOf = (difficulty: "BASIC" | "INTERMEDIATE" | "KILLER" = "KILLER", opts?: Parameters<typeof buildMdMainIdeaPrompt>[3]) =>
  buildMdMainIdeaPrompt(PASSAGE, "full", difficulty, opts);
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = promptOf(d);
  check(`프롬프트 ${d}: 난이도 분기 + 형식 리터럴 + 지문 포함`, p.includes("## 정답 진술 설계") && p.includes("발문형:") && p.includes("근거:") && p.includes("## 지문") && p.includes(PASSAGE.slice(0, 40)));
}
check("프롬프트: 난이도별 문구가 실제로 갈린다", new Set((["BASIC", "INTERMEDIATE", "KILLER"] as const).map((d) => promptOf(d).split("## 정답 진술 설계")[1]?.slice(0, 60))).size === 3);
check("프롬프트: BASIC 은 few-shot 생략", !promptOf("BASIC").includes("모범 설계 해부"));
check("프롬프트: KILLER 는 few-shot 해부 포함", promptOf("KILLER").includes("이 설계가 아름다운 이유"));
check("프롬프트: 선지 수 설정 집행(8개면 ⑧ 스캐폴드)", promptOf("KILLER", { optionCount: 8 }).includes("⑧ <선지>"));
check("프롬프트: 선지 수 클램프(3→4, 99→8)", promptOf("KILLER", { optionCount: 3 }).includes("④ <선지>") && !promptOf("KILLER", { optionCount: 3 }).includes("⑤ <선지>") && promptOf("KILLER", { optionCount: 99 }).includes("⑧ <선지>"));
check("프롬프트: 정답 수 설정 집행(복수면 병기 지시 + ① 앵커링 회피)", promptOf("KILLER", { answerCount: 2 }).includes("정확히 2개를") && promptOf("KILLER", { answerCount: 2 }).includes("예: ②, ④"));
check("프롬프트: 부정 극성 설정 집행(역할 반전 블록)", promptOf("KILLER", { polarity: "NEGATIVE" }).includes("정답 극성") && promptOf("KILLER", { polarity: "NEGATIVE" }).includes("적절하지 않은") && !promptOf("KILLER", { polarity: "NEGATIVE" }).includes("## 오답 4개 — 기제를"));
check("프롬프트: 선지 언어 설정 집행", promptOf("KILLER", { optionLanguage: "en" }).includes("영어 진술문") && promptOf().includes("한국어 진술문"));
check("프롬프트: 선지 줄에 정답 표시 칸을 요구하지 않는다(철칙 1 — 단일 진실원)", !promptOf().includes("O 또는 X"));
check("프롬프트: 오답 기제 분류학 4종 이상 명시", ["방향반대", "도입부함정", "범위확대", "근거없음"].every((k) => promptOf().includes(k)));
check("프롬프트: 선지 번호 지칭 금지(셔플 재매핑 보호)", promptOf().includes("번호(①·1번·(3))로 지칭하지 마라"));
check("프롬프트: answer-only 모드는 오답 섹션을 요구하지 않는다", !buildMdMainIdeaPrompt(PASSAGE, "answer-only", "KILLER").includes("\n오답:\n"));
check("프롬프트: 베이스 빌더가 레인 설정과 동일 경로", MAIN_IDEA_MD_LANE.buildBasePrompt(ctxOf({ resolved: { genericOptionCount: 6 } })).includes("⑥ <선지>"));

// ───────────────────────────────────────────────────────────────────────────
// 8-b. 프롬프트 회귀 픽스처 — 적대검수 웨이브 2 지적분
// ───────────────────────────────────────────────────────────────────────────
// [major · prompt-quality] NEGATIVE 에서 극성 블록 **뒤에** 오는 마감·자기검산·출력형식이
// 계속 POSITIVE 역할을 지시해 극성 블록의 반(反)복수정답 요구와 정면 충돌했다.
// NEGATIVE 의 '오답 N개'는 타당한 요지 진술들이므로 "저울질 대상으로 만들라" ·
// "지문의 어느 문장이 이걸 부정하는가"는 곧 "지문이 지지하는 진술을 부정될 때까지
// 재설계하라"다. 그렇게 나온 복수정답 문항은 게이트가 전부 형상 검사라 클린 통과한다.
const NEG = promptOf("KILLER", { polarity: "NEGATIVE" });
check(
  "프롬프트(회귀·major): NEGATIVE 는 난이도 블록도 극성 반전('타당 선지 설계')",
  NEG.includes("## 타당 선지 설계") && !NEG.includes("## 정답 진술 설계"),
);
check(
  "프롬프트(회귀·major): NEGATIVE 난이도 3분기 전부 존재 + 문구가 실제로 갈린다",
  (["BASIC", "INTERMEDIATE", "KILLER"] as const).every((d) =>
    promptOf(d, { polarity: "NEGATIVE" }).includes("## 타당 선지 설계"),
  ) &&
    new Set(
      (["BASIC", "INTERMEDIATE", "KILLER"] as const).map((d) =>
        promptOf(d, { polarity: "NEGATIVE" }).split("## 타당 선지 설계")[1]?.slice(0, 60),
      ),
    ).size === 3,
);
check(
  "프롬프트(회귀·major): NEGATIVE 마감에 POSITIVE 역할 지시('즉사 오답 금지')가 남지 않는다",
  !NEG.includes("즉사 오답 금지") && NEG.includes("즉사 정답 금지"),
);
check(
  "프롬프트(회귀·major): NEGATIVE 자기검산은 타당 선지의 '뒷받침'을 묻는다",
  NEG.includes("이걸 뒷받침하는가") && !NEG.includes(`오답 4개 각각에 대해`),
);
check(
  "프롬프트(회귀·major): NEGATIVE 출력형식 `근거:` 가 극성 무관 문구",
  NEG.includes("근거: <글의 요지가 가장 압축된 지문 문장 하나") && !NEG.includes("근거: <정답의 논지가"),
);
check(
  "프롬프트(회귀·major): NEGATIVE 는 few-shot 의 '정답' 역할이 반전됨을 명시",
  NEG.includes("모범 설계 해부'의 '정답'"),
);
check(
  "프롬프트(회귀·major): POSITIVE 는 종전 문구 유지(무회귀)",
  promptOf().includes("## 정답 진술 설계") &&
    promptOf().includes("즉사 오답 금지") &&
    !promptOf().includes("타당 선지 설계"),
);
// [major · silent-drop 원천 차단] 선지 스캐폴드에 '개행 없이 한 줄' 제약이 없어
// 모델이 선지를 접을 여지를 계약이 열어 두고 있었다(`근거:` 줄에만 제약이 있었다).
check(
  "프롬프트(회귀·major): 선지 스캐폴드가 '개행 없이 한 줄' 계약을 닫는다",
  promptOf().includes("① <선지 — 한국어 진술문, 개행 없이 한 줄>") &&
    promptOf().includes("선지 본문 안에서 줄을 바꾸면") &&
    promptOf("KILLER", { optionLanguage: "en" }).includes("① <선지 — 영어 진술문, 개행 없이 한 줄>"),
);
// [critical 원천 차단] 프롬프트 어디에도 "선지 줄에 정답 표시를 달지 마라"가 없었다.
check(
  "프롬프트(회귀·critical): 선지 줄 정답 표시 금지를 마감에 명시",
  promptOf().includes("정답 표시·기호") && promptOf().includes("`정답:` 줄에서만 밝힌다"),
);
// [major 원천 차단] 헤더 장식이 파서 앵커를 전멸시켰던 사고의 프롬프트 쪽 방어선.
check(
  "프롬프트(회귀·major): 헤더를 굵게·헤딩으로 꾸미지 말라고 형식 블록에 명시",
  promptOf().includes("헤더는 굵게·헤딩") && NEG.includes("헤더는 굵게·헤딩"),
);

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
