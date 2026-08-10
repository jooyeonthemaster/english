// 어휘 적절성(VOCAB_CHOICE) md 레인 0원 결정론 픽스처 테스트.
// 정상경로(5·1 / 8·2 / 10·3 / 5·1 변형) → 게이트 반려 전종 → 드리프트 관용 →
// 스냅 보정 3종 → 어댑터 → processVocabChoice 왕복 → validateQuestionQuality →
// 레인 계약(과금·적격성·설정 집행·난이도 3분기)까지. LLM 콜 0회.
// 실행: npx tsx scripts/_test-md-vocab.ts
import {
  autoSnapVocabMarks, buildVocabRenderedPassage, collectVocabMarks,
  parseMdVocab, reconstructVocabPassage, type MdVocabQuestion,
} from "../src/lib/md-qgen/parser-vocab";
import { gateMdVocab } from "../src/lib/md-qgen/gate-vocab";
import { adaptMdVocabToAiQuestion } from "../src/lib/md-qgen/adapter-vocab";
import { VOCAB_CHOICE_MD_LANE } from "../src/lib/md-qgen/lane-vocab";
import { buildMdVocabPrompt } from "../src/lib/md-qgen/prompts-vocab";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { CREDIT_COSTS } from "../src/lib/credit-costs";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

const PASSAGE =
  "Urban tree canopies mitigate summer surface heat in ways that concrete pavements never can. " +
  "Shade from a mature street tree lowers the temperature of the asphalt beneath it by several degrees at midday. " +
  "Because maintenance budgets remain scarce, however, many councils postpone new planting for another fiscal year. " +
  "The savings look substantial on a spreadsheet, yet they offset only a fraction of the cooling that is lost. " +
  "Residents then pay the difference through higher electricity bills every August.";

interface Fx { label: string; original: string; shown: string; code: string; answer?: boolean }
const F = (label: string, original: string, shown: string, code: string, answer = false): Fx =>
  ({ label, original, shown, code, answer });

function markedFrom(passage: string, fixtures: Fx[]): string {
  let out = passage;
  for (const f of fixtures) {
    out = out.replace(new RegExp(`(?<![A-Za-z])${f.original}(?![A-Za-z])`), `[[${f.label}:${f.shown}]]`);
  }
  return out;
}

/** 픽스처 → md 전문. 프롬프트 "## 출력 형식" 리터럴과 1:1이어야 한다. */
function buildMd(fixtures: Fx[]): string {
  const answers = fixtures.filter((f) => f.answer);
  const wrongs = fixtures.filter((f) => !f.answer);
  const lines = [
    "밑줄지문:",
    markedFrom(PASSAGE, fixtures),
    "",
    "원형·판단축:",
    ...fixtures.map((f) => `(${f.label}) ${f.original} | ${f.code}`),
    `정답: ${answers.map((f) => `(${f.label})`).join(", ")}`,
    ...answers.map((f) => `고침(${f.label}): ${f.original}`),
    "해설: 이 글은 가로수 그늘이 지표 온도를 낮춘다는 결과를 바로 다음 문장에서 수치로 제시합니다. 따라서 표시된 단어가 그 방향을 배반하면 문맥상 쓰임이 적절하지 않습니다.",
  ];
  if (wrongs.length > 0) {
    lines.push("오답:");
    for (const f of wrongs) lines.push(`(${f.label}) 이 자리는 앞뒤 문장의 논리와 방향이 일치하므로 문맥상 적절합니다.`);
  }
  return lines.join("\n");
}

const FX5: Fx[] = [
  F("a", "mitigate", "intensify", "v", true), F("b", "lowers", "lowers", "v"),
  F("c", "scarce", "scarce", "n"), F("d", "postpone", "postpone", "d"),
  F("e", "substantial", "substantial", "j"),
];
const FX8: Fx[] = [
  F("a", "mitigate", "mitigate", "v"), F("b", "lowers", "raises", "v", true),
  F("c", "scarce", "scarce", "n"), F("d", "postpone", "accelerate", "d", true),
  F("e", "substantial", "substantial", "j"), F("f", "offset", "offset", "v"),
  F("g", "fraction", "fraction", "j"), F("h", "higher", "higher", "j"),
];
const FX10: Fx[] = [
  F("a", "mitigate", "mitigate", "v"), F("b", "pavements", "gardens", "n", true),
  F("c", "lowers", "lowers", "v"), F("d", "temperature", "temperature", "n"),
  F("e", "midday", "midnight", "n", true), F("f", "scarce", "scarce", "j"),
  F("g", "postpone", "postpone", "d"), F("h", "substantial", "substantial", "j"),
  F("i", "offset", "double", "v", true), F("j", "higher", "higher", "j"),
];
const FX5V: Fx[] = [
  F("a", "mitigate", "intensify", "v", true), F("b", "lowers", "reduces", "v"),
  F("c", "scarce", "limited", "n"), F("d", "postpone", "defer", "d"),
  F("e", "substantial", "considerable", "j"),
];
// SOURCE_EXACT 선지 충돌: 정답 (d) 의 오용어가 (b) 의 원문 단어와 글자까지 같다.
// 후처리 선지가 ["mitigate","lowers","scarce","lowers","substantial"] 이 되어 정답이
// 유일하지 않다(fast 는 duplicate-option-text error, md 는 차단하지 않는다).
const FX5DUP: Fx[] = [
  F("a", "mitigate", "mitigate", "v"), F("b", "lowers", "lowers", "v"),
  F("c", "scarce", "scarce", "n"), F("d", "postpone", "lowers", "d", true),
  F("e", "substantial", "substantial", "j"),
];
const GOOD = buildMd(FX5);
const swap = (fx: Fx[], label: string, patch: Partial<Fx>): Fx[] =>
  fx.map((f) => (f.label === label ? { ...f, ...patch } : f));

interface GateOpts { markerCount?: number; answerCount?: number; synonymVariants?: boolean; noSnap?: boolean }
/** noSnap: 스냅이 흡수해 버리는 불변식은 원본 게이트로 직접 검증한다. */
function gateOf(text: string, o?: GateOpts): string[] {
  const variant = o?.synonymVariants === true;
  const q = o?.noSnap
    ? parseMdVocab(text)
    : autoSnapVocabMarks(parseMdVocab(text), PASSAGE, { synonymVariants: variant }).question;
  return gateMdVocab(q, PASSAGE, {
    markerCount: o?.markerCount ?? 5, answerCount: o?.answerCount ?? 1, synonymVariants: variant,
  });
}
const snapOf = (text: string, variant = false) =>
  autoSnapVocabMarks(parseMdVocab(text), PASSAGE, { synonymVariants: variant });

// ── 1. 정상 경로 ────────────────────────────────────────────────────────────
const parsed = parseMdVocab(GOOD);
check("파싱: 밑줄 5개", parsed.marks.length === 5, `실제 ${parsed.marks.length}`);
check("파싱: 원형·표시어·판단축 결합",
  parsed.marks[0].original === "mitigate" && parsed.marks[0].shown === "intensify" && parsed.marks[0].code === "v",
  JSON.stringify(parsed.marks[0]));
check("파싱: 정답 [(a)] · 고침(a) = 원형",
  parsed.answers.join(",") === "(a)" && parsed.fixes["(a)"] === "mitigate");
check("파싱: 오답해설 4개 · 해설 존재", parsed.wrong.length === 4 && parsed.explanation.length > 10);
check("마커 수집·재구성: 5개 · 원문 복원",
  collectVocabMarks(parsed.markedPassage).length === 5 &&
  reconstructVocabPassage(parsed).trim() === PASSAGE.trim());
check("렌더 합성: __(a) intensify__ 형식(후처리 산출과 동형)",
  buildVocabRenderedPassage(parsed).includes("__(a) intensify__"));
check("스냅: 정상 입력은 무보정", snapOf(GOOD).corrections.length === 0);

for (const [name, fx, marker, answer, variant] of [
  ["5·1 SOURCE_EXACT", FX5, 5, 1, false], ["8·2 SOURCE_EXACT", FX8, 8, 2, false],
  ["10·3 SOURCE_EXACT", FX10, 10, 3, false], ["5·1 SYNONYM_VARIANT", FX5V, 5, 1, true],
] as [string, Fx[], number, number, boolean][]) {
  const issues = gateOf(buildMd(fx), { markerCount: marker, answerCount: answer, synonymVariants: variant });
  check(`게이트: ${name} 클린`, issues.length === 0, issues.join(" / "));
}

// ── 2. 게이트 반려 전종 ─────────────────────────────────────────────────────
// (e) 오답 줄을 (d) 로 바꿔 "라벨 중복 4줄 · (e) 누락" 을 만든다 — 개수만 세는
// 게이트는 이걸 클린으로 통과시킨다.
const DUP_WRONG_LABEL = GOOD.replace(
  /^\(e\) 이 자리는.*$/m,
  "(d) 이 자리는 앞뒤 문장의 논리와 방향이 일치하므로 문맥상 적절합니다.",
);
const REJECT: [string, string, string, GateOpts?][] = [
  ["#0 밑줄지문 누락", GOOD.replace("밑줄지문:", "지문:"), "밑줄지문 누락"],
  ["#1 마커 개수(4곳)", buildMd(FX5.slice(0, 4)), "밑줄 마커"],
  ["#2 마커 밖 지문 무단 편집", GOOD.replace("concrete pavements never can", "concrete never can"), "지문 재구성 불일치"],
  ["#2 원형이 지문 축자가 아님(원본 게이트)", GOOD.replace("(c) scarce | n", "(c) scarcity | n"), "지문 재구성 불일치", { noSnap: true }],
  ["#2 원형이 지문에 없음(원본 게이트)", GOOD.replace("(c) scarce | n", "(c) scarcity | n"), "지문에 축자로 없음", { noSnap: true }],
  ["#2 정답 자리 원형 오기는 스냅으로도 못 살린다", GOOD.replace("(a) mitigate | v", "(a) alleviate | v"), "지문 재구성 불일치"],
  ["#3 판단축 코드 닫힌 집합 밖", GOOD.replace("(d) postpone | d", "(d) postpone | z"), "닫힌 집합"],
  ["#4 정답 개수가 설정과 불일치", GOOD, "정답 라벨", { answerCount: 2 }],
  ["#5 고침이 원형과 다름", GOOD.replace("고침(a): mitigate", "고침(a): reduce"), "고침(a)"],
  ["#6 정답 자리 미변형", GOOD.replace("[[a:intensify]]", "[[a:mitigate]]"), "오용어로 교체되지 않음"],
  ["#7 SOURCE_EXACT 비정답 변형(원본 게이트)", GOOD.replace("[[c:scarce]]", "[[c:limited]]"), "비정답 표시어가 원문과 다름", { noSnap: true }],
  ["#7 비정답 변형은 스냅 경유해도 결국 반려", GOOD.replace("[[c:scarce]]", "[[c:limited]]"), "지문 재구성 불일치"],
  ["#8 변형 모드인데 비정답이 원문 그대로", buildMd(swap(FX5V, "d", { shown: "postpone" })), "표시어가 원문 그대로", { synonymVariants: true }],
  ["#9 변형 모드 정답 누출(비정답 표시어 = 정답 원형)", buildMd(swap(FX5V, "e", { shown: "mitigate" })), "정답 노출", { synonymVariants: true }],
  ["#10 원형이 지문에 2회 등장", buildMd(swap(FX5, "e", { original: "tree", shown: "tree" })), "회 등장"],
  ["#11 라벨이 지문 등장순이 아님", buildMd([F("b", "mitigate", "intensify", "v", true), F("a", "lowers", "lowers", "v"), ...FX5.slice(2)]), "지문 등장순"],
  ["#12 해설 누락", GOOD.replace(/^해설:.*$/m, "해설:"), "해설 누락"],
  ["#13 오답해설 개수", GOOD.replace(/^\(e\) 이 자리는.*$/m, ""), "오답해설"],
  // 라벨 중복 + 다른 라벨 누락은 개수가 상쇄돼 구 게이트를 통과했다(선지 하나가
  // 해설 없이 저장 · 어댑터 Map 이 중복을 뒤엣것으로 덮어씀).
  ["#13 라벨 중복(개수는 정확)", DUP_WRONG_LABEL, "오답해설 라벨 중복: (d)"],
  ["#13 비정답 라벨 누락(개수는 정확)", DUP_WRONG_LABEL, "오답해설 누락 라벨: (e)"],
  // 표시어 축 중복 — 학생 표면에 글자까지 같은 선지 2개가 실린다(정답 유일성 파괴).
  ["#16 표시어 중복 SOURCE_EXACT(정답 오용어 = 다른 자리 원문 단어)",
    buildMd(FX5DUP), "표시어 중복"],
  ["#16 표시어가 다른 밑줄의 원문 단어와 동일", buildMd(FX5DUP), "다른 밑줄((b))의 원문 단어"],
  ["#16 표시어 중복 SYNONYM_VARIANT(동의어 두 자리가 같은 단어)",
    buildMd(swap(FX5V, "e", { shown: "limited" })), "표시어 중복", { synonymVariants: true }],
  ["비정답에 고침 부착", `${GOOD}\n고침(c): scarce`, "정답이 아닌데 고침"],
  ["표시어가 단어가 아닌 설명구", GOOD.replace("[[a:intensify]]", "[[a:make the heat much worse]]"), "단어 형태가 아님"],
];
for (const [name, text, expect, o] of REJECT) {
  const issues = gateOf(text, o);
  check(`게이트 반려 ${name}`, issues.some((i) => i.includes(expect)), issues.join(" / ") || "반려 없음");
}
check("게이트 반려 #14 오답해설에 정답 라벨 포함",
  gateMdVocab(
    { ...snapOf(GOOD).question, wrong: [...parsed.wrong, { label: "(a)", text: "정답인데 끼어듦" }] },
    PASSAGE, { markerCount: 5, answerCount: 1 },
  ).some((i) => i.includes("정답 라벨 포함")));
// 지문 단독 픽스처 — 공유 PASSAGE 로는 재현되지 않는 축(대소문자 잔존·정규화 드리프트).
function gateSolo(passage: string, marked: string, meta: string, fix: string): string[] {
  const md = [
    "밑줄지문:", marked, "",
    "원형·판단축:", meta, "정답: (a)", `고침(a): ${fix}`,
    "해설: 앞 문장이 결과를 명시하므로 표시된 단어는 그 방향을 배반합니다. 따라서 문맥상 쓰임이 적절하지 않습니다.",
  ].join("\n");
  const q = autoSnapVocabMarks(parseMdVocab(md), passage, { synonymVariants: false }).question;
  return gateMdVocab(q, passage, { markerCount: 1, answerCount: 1, requireWrong: false });
}
{
  // countWordBoundaryMatches 는 대소문자 구분이라 'shade' 를 1회로 세고 문두 'Shade' 를
  // 놓친다. 학생은 밑줄 밖 첫 단어만 보고 정답을 역추론한다.
  const issues = gateSolo(
    "Shade lowers the asphalt temperature at midday. A mature street tree casts shade that cools the pavement below.",
    "Shade lowers the asphalt temperature at midday. A mature street tree casts [[a:sunlight]] that cools the pavement below.",
    "(a) shade | n", "shade",
  );
  check("게이트 반려 #10-b 정답 원단어가 대소문자만 달리 밑줄 밖에 잔존 — fast(vocab-source-word-visible) 승격",
    issues.some((i) => i.includes("대소문자만 달리")), issues.join(" / ") || "반려 없음");
}
{
  // 구 게이트는 #2 재구성(정규화 비교)은 통과시키면서 #10 만 원시 비교로 반려해
  // 1회뿐인 재생성을 소진시켰다 — 하류 후처리는 이 드리프트를 흡수한다.
  const issues = gateSolo(
    "The city’s well–being depends on the shade that cools each August afternoon.",
    "The [[a:budget's]] well–being depends on the shade that cools each August afternoon.",
    "(a) city's | n", "city's",
  );
  check("게이트: 곱슬따옴표·en대시 정규화 차이만 있는 원형은 오반려하지 않는다(#2↔#10 축 통일)",
    issues.length === 0, issues.join(" / "));
}
check("게이트 반려 #17 구동사 particle 잔류 — fast 검증기(substitution-seam) 승격", (() => {
  const p = "Editors often leave out the weakest example before the final round.";
  const md = [
    "밑줄지문:", "Editors often [[a:including]] out the weakest example before the final round.", "",
    "원형·판단축:", "(a) leave | c", "정답: (a)", "고침(a): leave",
    "해설: 편집자가 약한 예시를 빼는 맥락이므로 포함한다는 뜻은 어긋납니다. 문맥은 제외를 요구합니다.",
  ].join("\n");
  const q = autoSnapVocabMarks(parseMdVocab(md), p, { synonymVariants: false }).question;
  return gateMdVocab(q, p, { markerCount: 1, answerCount: 1, requireWrong: false })
    .some((i) => i.includes("particle"));
})());

// ── 3. 드리프트 관용 · 스냅 3종 ─────────────────────────────────────────────
check("파서 관용: 'a) word | (v) 한글설명' 표기 흡수",
  parseMdVocab(GOOD.replace("(b) lowers | v", "b) lowers | (v) 동작 방향")).marks[1].code === "v");
check("파서 관용: 구형 '고침:' 단일 라인은 첫 정답에 귀속",
  parseMdVocab(GOOD.replace("고침(a): mitigate", "고침: mitigate")).fixes["(a)"] === "mitigate");
check("파서 관용: 정답 라인 부가 설명 속 라벨은 정답이 아니다",
  parseMdVocab(GOOD.replace("정답: (a)", "정답: (a) — (c)는 적절합니다")).answers.join(",") === "(a)");
check("파서 관용: 오답 목록에 정답 줄이 끼면 걸러낸다",
  parseMdVocab(GOOD.replace("오답:\n", "오답:\n(a) 정답 줄이 잘못 끼어들었습니다.\n")).wrong
    .every((w) => w.label !== "(a)"));
check("파서: 원형 섹션에 없는 라벨은 원형을 빈 값으로 남긴다(조용히 버리지 않음)", (() => {
  const q = parseMdVocab(GOOD.replace("(d) postpone | d\n", ""));
  return q.marks.length === 5 && q.marks[3].original === "";
})());
check("파서: 판단축 코드 드리프트가 그 줄의 '원형' 까지 죽이지 않는다(2단 파싱)", (() => {
  const upper = parseMdVocab(GOOD.replace("(b) lowers | v", "(b) lowers | V"));
  const paren = parseMdVocab(GOOD.replace("(b) lowers | v", "(b) lowers | v(방향 반전)"));
  const bare = parseMdVocab(GOOD.replace("(b) lowers | v", "(b) lowers"));
  return upper.marks[1].original === "lowers" && upper.marks[1].code === "v" &&
    paren.marks[1].original === "lowers" && paren.marks[1].code === "v" &&
    bare.marks[1].original === "lowers" && bare.marks[1].code === "";
})());
check("게이트: 닫힌 집합 밖 코드는 원형을 살린 채 #3 만 정확히 발화한다(허위 '재구성 불일치' 차단)", (() => {
  const issues = gateOf(GOOD.replace("(b) lowers | v", "(b) lowers | z(방향 반전)"));
  return issues.length === 1 && issues[0].includes("닫힌 집합");
})());
// #13 을 집합 검사로 조인 만큼, 라벨 표기 드리프트는 파서가 더 넓게 흡수해야
// 반려율이 튀지 않는다(대문자 오답 라벨은 실측 드리프트다).
check("파서 관용: 오답 라벨 대문자 표기 흡수 — 새 #13 집합 검사가 오반려하지 않는다", (() => {
  const drifted = GOOD.replace(/^\(e\) 이 자리는/m, "(E) 이 자리는");
  return parseMdVocab(drifted).wrong.some((w) => w.label === "(e)") &&
    gateOf(drifted).length === 0;
})());
check("파서 관용: 정답 라벨 대문자·한글 접속('및') 드리프트 흡수", (() => (
  parseMdVocab(GOOD.replace("정답: (a)", "정답: (A)")).answers.join(",") === "(a)" &&
  parseMdVocab(buildMd(FX8).replace("정답: (b), (d)", "정답: (B) 및 (D)")).answers.join(",") === "(b),(d)"
))());
{
  const s = snapOf(GOOD.replace("(c) scarce | n", "(c) scarcely | n"));
  check("스냅 (1): SOURCE_EXACT 비정답 원형을 마커 축자로 교정 + 교정 후 클린",
    s.corrections.length === 1 && s.question.marks[2].original === "scarce" &&
    gateMdVocab(s.question, PASSAGE, { markerCount: 5, answerCount: 1 }).length === 0,
    s.corrections.join(" / "));
}
{
  // 변형 모드에서 (1) 을 돌리면 원형이 동의어로 덮여 원문과 다른 지문이 저장된다(정찰 R2).
  const s = snapOf(buildMd(FX5V), true);
  check("스냅 (1): 변형 모드에서는 비정답 원형 교정을 하지 않는다 (R2 회귀 방지)",
    s.corrections.length === 0 && s.question.marks[1].original === "lowers", s.corrections.join(" / "));
}
{
  // 정답 자리는 (1) 의 대상이 아니므로 대소문자 스냅이 유일한 구제 수단이다.
  const s = snapOf(GOOD.replace("(a) mitigate | v", "(a) Mitigate | v"));
  check("스냅 (2): 정답 자리 원형의 대소문자 전용 스냅 + 교정 후 클린",
    s.corrections.some((c) => c.includes("대소문자")) && s.question.marks[0].original === "mitigate" &&
    s.question.marks[0].shown === "intensify" &&
    gateMdVocab(s.question, PASSAGE, { markerCount: 5, answerCount: 1 }).length === 0,
    s.corrections.join(" / "));
}
{
  const s = snapOf(buildMd(FX5V).replace("(b) lowers | v", "(b) Lowers | v"), true);
  check("스냅 (2): 변형 모드 비정답 원형의 대소문자 스냅(표시어는 보존)",
    s.corrections.length === 1 && s.question.marks[1].original === "lowers" &&
    s.question.marks[1].shown === "reduces", s.corrections.join(" / "));
}
{
  // 정답 라벨을 못 읽으면 진짜 정답 자리가 비정답으로 분류돼 원형이 오용어로 덮이고,
  // 게이트가 "원형이 지문에 축자로 없음: 'intensify'" 라는 **허위 지적**을 1회뿐인
  // 재생성 프롬프트에 되먹인다(모델은 옳게 쓴 원형을 고치라는 지시를 받는다).
  const s = snapOf(GOOD.replace("정답: (a)", "정답: 첫째 밑줄"));
  check("스냅 (1): 정답 축이 불확실하면(라벨 파싱 실패) 비정답 원형 교정을 통째로 끈다",
    s.question.marks[0].original === "mitigate" &&
    s.corrections.every((c) => !c.includes("비정답 원형 교정")), s.corrections.join(" / "));
}
{
  const drifted = buildMd(FX8).replace("(c) scarce | n", "(c) scarcely | n");
  const off = autoSnapVocabMarks(parseMdVocab(drifted), PASSAGE, { answerCount: 3 });
  const on = autoSnapVocabMarks(parseMdVocab(drifted), PASSAGE, { answerCount: 2 });
  check("스냅 (1): 정답 개수가 설정과 어긋나면 교정을 끄고, 맞으면 켠다",
    off.corrections.length === 0 && on.corrections.some((c) => c.includes("비정답 원형 교정")),
    `off=[${off.corrections.join("/")}] on=[${on.corrections.join("/")}]`);
}
{
  const s = snapOf(GOOD.replace(/^고침\(a\):.*$/m, ""));
  check("스냅 (3): 누락된 고침을 원형으로 채움(값이 계약상 유일 결정)",
    s.question.fixes["(a)"] === "mitigate" && s.corrections.some((c) => c.includes("고침")),
    s.corrections.join(" / "));
}

// ── 3-b. 잔여 결함 회귀 (독립 프로브 실증분) ────────────────────────────────
{
  // 스냅(2)가 원형만 갈고 고침을 두면 #5(고침 == 원형)가 **모델이 옳게 낸 문항**을
  // 반려한다 — 스냅이 스스로 만든 허위 결함이 1회뿐인 재생성을 태운다.
  const synced = GOOD.replace("(a) mitigate | v", "(a) Mitigate | v")
    .replace("고침(a): mitigate", "고침(a): Mitigate");
  const s = snapOf(synced);
  check("스냅 (2): 원형을 스냅하면 같은 라벨의 고침도 함께 스냅 — #5 오반려 차단",
    s.question.fixes["(a)"] === "mitigate" &&
    gateMdVocab(s.question, PASSAGE, { markerCount: 5, answerCount: 1 }).length === 0,
    JSON.stringify(s.question.fixes));
  // 과잉 스냅 금지 — 고침이 스냅 전 원형과 다르면 손대지 않고 #5 가 정확히 반려한다.
  check("스냅 (2): 원형과 무관한 고침은 따라가지 않는다(#5 유지)",
    gateOf(GOOD.replace("(a) mitigate | v", "(a) Mitigate | v")
      .replace("고침(a): mitigate", "고침(a): reduce")).some((i) => i.includes("고침(a) 'reduce'")));
}
{
  // `정답: (f)` — 개수만 보는 가드는 answersReliable 을 세워 스냅(1)이 **진짜 정답
  // 자리의 원형을 오용어로 덮었다**(허위 '재구성 불일치' + '원형이 지문에 없음: intensify').
  const s = snapOf(GOOD.replace("정답: (a)", "정답: (f)").replace("고침(a):", "고침(f):"));
  const issues = gateMdVocab(s.question, PASSAGE, { markerCount: 5, answerCount: 1 });
  check("스냅 (1): 마커 밖 정답 라벨((f))은 개수가 맞아도 정답 축 불신 — 허위 반려 차단",
    s.corrections.length === 0 && s.question.marks[0].original === "mitigate" &&
    issues.some((i) => i.includes("정답 라벨((f))이 밑줄에 없음")) &&
    !issues.some((i) => i.includes("재구성 불일치")), issues.join(" / "));
}
check("파서 관용: 메타 라인 라벨 대문자 흡수 — 정답·고침·오답과 같은 폭", (() => {
  const drifted = GOOD.replace("(c) scarce | n", "(C) scarce | n");
  return parseMdVocab(drifted).marks[2].original === "scarce" && gateOf(drifted).length === 0;
})());
check("게이트 #9: 변형 모드에서 비정답 표시어 == 다른 **비정답** 원형은 누출도 중복도 아니다",
  // (b) 원형 'lowers' 는 화면에서 'reduces' 로 가려져 있다 — 선지도 안 겹치고 정답도 안 샌다.
  gateOf(buildMd(swap(FX5V, "e", { shown: "lowers" })), { synonymVariants: true }).length === 0,
  gateOf(buildMd(swap(FX5V, "e", { shown: "lowers" })), { synonymVariants: true }).join(" / "));

// ── 4. 어댑터 → processVocabChoice → validateQuestionQuality 왕복 ───────────
function roundTrip(name: string, fx: Fx[], marker: number, answer: number, variant: boolean) {
  const q = snapOf(buildMd(fx), variant).question;
  const adapt = adaptMdVocabToAiQuestion(q, PASSAGE, "KILLER", variant);
  check(`어댑터[${name}]: 성공`, adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  const mw = ai.markedWords as Array<Record<string, unknown>>;
  check(`어댑터[${name}]: markedWords ${marker}개 · 라벨 소문자 "(a)" 축 유지`,
    mw.length === marker && mw[0].label === "(a)");
  check(`어댑터[${name}]: 정답만 isInappropriate·betterWord · substituteWord 는 전 마커`,
    mw.filter((m) => m.isInappropriate === true).length === answer &&
    mw.filter((m) => m.betterWord !== undefined).length === answer &&
    mw.every((m) => typeof m.substituteWord === "string" && String(m.substituteWord)));
  check(`어댑터[${name}]: surroundingText 가 원 지문 축자 조각`,
    mw.every((m) => PASSAGE.includes(String(m.surroundingText))));
  check(`어댑터[${name}]: vocabDisplayMode · keyPoints 빈 배열 · 후처리 소관/이물 필드 없음`,
    ai.vocabDisplayMode === (variant ? "SYNONYM_VARIANT" : "SOURCE_EXACT") &&
    Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0 &&
    !("passageWithMarkers" in ai) && !("blanks" in ai) && !("passageWithBlank" in ai) &&
    !("originalExpression" in ai) && !("markedExpressions" in ai));
  check(`어댑터[${name}]: 발문이 K에 따라 갈린다`,
    String(ai.direction).includes(answer >= 2 ? "모두 고르시오" : "적절하지 않은 것은?"),
    String(ai.direction));

  const pp = postProcessQuestion("VOCAB_CHOICE", PASSAGE, ai as never);
  check(`후처리[${name}]: 성공`, pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  const pwm = String(data.passageWithMarkers ?? "");
  check(`후처리[${name}]: passageWithMarkers 에 표시어 렌더`,
    fx.every((f) => pwm.includes(`__(${f.label}) ${f.shown}__`)), pwm.slice(0, 120));
  const expected = fx.map((f, i) => (f.answer ? String(i + 1) : "")).filter(Boolean).join(", ");
  check(`후처리[${name}]: correctAnswer 숫자 축 '${expected}'`,
    data.correctAnswer === expected, String(data.correctAnswer));
  const opts = data.options as Array<Record<string, unknown>>;
  check(`후처리[${name}]: 선지 ${marker}개 · 라벨 1~N · 표시어 동기`,
    opts.length === marker && opts[0].label === "1" && opts.every((o, i) => o.text === fx[i].shown),
    JSON.stringify(opts.slice(0, 2)));
  const errors = validateQuestionQuality({
    typeId: "VOCAB_CHOICE", question: data, passage: PASSAGE,
    vocabChoiceMarkerCount: marker, vocabChoiceAnswerCount: answer,
  }).filter((i) => i.severity === "error");
  check(`검증기[${name}]: error 0`, errors.length === 0,
    errors.map((e) => `${e.code}: ${e.message}`).join(" | "));
}
roundTrip("5·1", FX5, 5, 1, false);
roundTrip("8·2", FX8, 8, 2, false);
roundTrip("10·3", FX10, 10, 3, false);
roundTrip("5·1 변형", FX5V, 5, 1, true);
check("어댑터: 정답 없음 / 밑줄에 없는 정답 라벨 방어",
  adaptMdVocabToAiQuestion({ ...(parsed as MdVocabQuestion), answers: [] }, PASSAGE, "KILLER", false).ok === false &&
  adaptMdVocabToAiQuestion({ ...(parsed as MdVocabQuestion), answers: ["(z)"] }, PASSAGE, "KILLER", false).ok === false);

// ── 5. 레인 계약 ────────────────────────────────────────────────────────────
function ctxOf(resolved: Record<string, unknown>, extra?: Partial<MdLaneContext>): MdLaneContext {
  return {
    passage: PASSAGE, difficulty: "KILLER", rawDifficulty: "KILLER", resolved,
    rawTypeSettings: null, teacherPoints: [], variantIndex: 0, variantCount: 1, ...extra,
  };
}
const L = VOCAB_CHOICE_MD_LANE;
const LANE_CHECKS: [string, boolean, string?][] = [
  ["subType VOCAB_CHOICE", L.subType === "VOCAB_CHOICE"],
  ["과금 QUESTION_GEN_SINGLE(2크레딧) — fast getOperationType 과 동기",
    L.operationType === "QUESTION_GEN_SINGLE" && CREDIT_COSTS.QUESTION_GEN_SINGLE === 2, String(L.operationType)],
  ["retryEligible", L.retryEligible === true],
  ["적격성 marker 5~10 · answer 1~marker · 범위 밖 거부",
    L.isEligible({ vocabChoiceMarkerCount: 5, vocabChoiceAnswerCount: 1 }) &&
    L.isEligible({ vocabChoiceMarkerCount: 10, vocabChoiceAnswerCount: 10 }) && L.isEligible({}) &&
    !L.isEligible({ vocabChoiceMarkerCount: 11 }) && !L.isEligible({ vocabChoiceMarkerCount: 4 }) &&
    !L.isEligible({ vocabChoiceMarkerCount: 5, vocabChoiceAnswerCount: 6 }) &&
    !L.isEligible({ vocabChoiceMarkerCount: 5, vocabChoiceAnswerCount: 0 })],
  ["diversityTargets = markedWords[].originalWord",
    L.diversityTargets({ markedWords: [{ originalWord: "mitigate" }, { originalWord: "scarce" }] })
      .join(",") === "mitigate,scarce"],
  ["mdFormat · qualityArgs 가 설정 실값을 싣는다", (() => {
    const ctx = ctxOf({ vocabChoiceMarkerCount: 8, vocabChoiceAnswerCount: 2, vocabChoiceSynonymVariants: true });
    const f = L.mdFormat(ctx); const qa = L.qualityArgs(ctx);
    return f.markerCount === 8 && f.answerCount === 2 && f.synonymVariants === true &&
      qa.vocabChoiceMarkerCount === 8 && qa.vocabChoiceAnswerCount === 2 && qa.stemLanguage === "ko";
  })()],
  ["parseAndGate 가 설정(8·2)을 집행 — 5·1 출력은 반려",
    L.parseAndGate(GOOD, ctxOf({ vocabChoiceMarkerCount: 8, vocabChoiceAnswerCount: 2 })).gateIssues.length > 0],
  ["parseAndGate 정상 경로 클린 + adapt 성공", (() => {
    const ctx = ctxOf({ vocabChoiceMarkerCount: 5, vocabChoiceAnswerCount: 1 });
    const p = L.parseAndGate(GOOD, ctx);
    return p.gateIssues.length === 0 && L.adapt(p, ctx).ok === true;
  })()],
  ["buildBasePrompt 가 변형 설정을 프롬프트에 집행",
    L.buildBasePrompt(ctxOf({ vocabChoiceSynonymVariants: true })).includes("## 동의어 변장 모드")],
  ["교사 지정 포인트 미반영 반려 / 반영 통과", (() => {
    const miss = ctxOf({}, { teacherPoints: [{ text: "electricity", unit: "word" }] });
    const hit = ctxOf({}, { teacherPoints: [{ text: "mitigate", unit: "word" }] });
    return L.parseAndGate(GOOD, miss).gateIssues.some((i) => i.includes("교사 지정")) &&
      L.parseAndGate(GOOD, hit).gateIssues.length === 0;
  })()],
  ["stemLanguage=en 이면 언어 블록 + 영어 발문 + qualityArgs 동기", (() => {
    const ctx = ctxOf({}, { rawTypeSettings: { VOCAB_CHOICE: { stemLanguage: "en" } } });
    const extras = L.buildExtras(ctx);
    const a = L.adapt(L.parseAndGate(GOOD, ctx), ctx);
    return extras.length === 1 && extras[0].includes("질문 언어") &&
      /NOT appropriate/.test(String(a.aiQuestion?.direction)) && L.qualityArgs(ctx).stemLanguage === "en";
  })()],
  ["기본 설정이면 extras 비어 있음", L.buildExtras(ctxOf({})).length === 0],
];
for (const [name, ok, detail] of LANE_CHECKS) check(`레인: ${name}`, ok, detail);

// ── 6. 프롬프트 계약 ────────────────────────────────────────────────────────
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdVocabPrompt(PASSAGE, "full", d, { markerCount: 7, answerCount: 2 });
  check(`프롬프트 ${d}: 난이도 분기 + 7라벨 스캐폴드 + 출력형식 + 지문`,
    p.includes("(g) ...") && p.includes("## 출력 형식 (마크다운") && p.includes("원형·판단축:") &&
    p.includes("## 지문") && p.includes(PASSAGE.slice(0, 40)));
}
const P = (o?: Parameters<typeof buildMdVocabPrompt>[3], m: "full" | "answer-only" = "full") =>
  buildMdVocabPrompt(PASSAGE, m, "KILLER", o);
const PROMPT_CHECKS: [string, boolean][] = [
  ["난이도 3분기 텍스트가 서로 다르다",
    new Set((["BASIC", "INTERMEDIATE", "KILLER"] as const)
      .map((d) => buildMdVocabPrompt(PASSAGE, "full", d))).size === 3],
  ["BASIC 은 few-shot 생략 · KILLER 는 포함",
    !buildMdVocabPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") && P().includes("모범 설계 해부")],
  ["markerCount 클램프(3→5, 99→10) · answerCount 클램프(0→1, 99→marker)",
    P({ markerCount: 3 }).includes("(e) ...") && P({ markerCount: 99 }).includes("(j) ...") &&
    P({ markerCount: 5, answerCount: 0 }).includes('적절하지 않은 것" 1개짜리') &&
    P({ markerCount: 5, answerCount: 99 }).includes('적절하지 않은 것" 5개짜리')],
  ["K=1 은 단일 정답 라인 · K≥2 는 ', ' 병기",
    P({ markerCount: 5, answerCount: 1 }).includes("정답: <(a)~(e) 하나>") &&
    P({ markerCount: 5, answerCount: 2 }).includes('정답 라벨 2개를 ", " 로 병기')],
  ["K=N 이면 오답 섹션을 요구하지 않는다", !P({ markerCount: 5, answerCount: 5 }).includes("\n오답:\n")],
  ["answer-only 모드는 오답 섹션 미요구", !P(undefined, "answer-only").includes("\n오답:\n")],
  ["synonymVariants 블록이 base 지시를 뒤집는다고 명시",
    P({ synonymVariants: true }).includes("## 동의어 변장 모드") &&
    P({ synonymVariants: true }).includes("보다 우선한다") &&
    !P({ synonymVariants: false }).includes("## 동의어 변장 모드") &&
    P({ synonymVariants: false }).includes("나머지 4곳은 원문 단어 그대로다")],
  ["정답 예시 라벨이 (a) 앵커링을 피한다", P({ markerCount: 5, answerCount: 2 }).includes("(b), (d)")],
  ["판단축 닫힌 집합·자기검산·마감 블록 존재",
    P().includes("## 판단축 코드") && P().includes("## 출력 전 자기검산") && P().includes("## 마감 — 위반하면")],
];
for (const [name, ok] of PROMPT_CHECKS) check(`프롬프트: ${name}`, ok);

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
