// 문장 삽입(SENTENCE_INSERT) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → processSentenceInsert 왕복 → validateQuestionQuality
// → 레인 계약(과금·적격성·난이도 3분기·설정 집행)까지. 실행: npx tsx scripts/_test-md-sentence-insert.ts
//
// 형식 계약: `삽입문장:` 한 줄(+ 설정 시 `삽입문장(변형):`) · `번호지문:` 블록에 [[1]]~[[N]]
// 인라인 마커 · `정답:` 한 줄 · `해설:` · `오답:`. 정답의 유일 진실원은 `정답:` 줄이고
// 자리 진실원은 번호지문의 마커다 — 줄마다 "이 자리가 정답인가"를 다시 받는 칸은 없다(철칙 1).
import { autoSnapInsertGiven, computeInsertLayout, parseMdSentenceInsert, splitInsertMarkers, stripInsertMarks, type MdInsertQuestion } from "../src/lib/md-qgen/parser-sentence-insert";
import { gateMdSentenceInsert, type GateMdSentenceInsertOptions } from "../src/lib/md-qgen/gate-sentence-insert";
import { adaptMdSentenceInsertToAiQuestion } from "../src/lib/md-qgen/adapter-sentence-insert";
import { SENTENCE_INSERT_MD_LANE } from "../src/lib/md-qgen/lane-sentence-insert";
import { buildMdSentenceInsertPrompt } from "../src/lib/md-qgen/prompts-sentence-insert";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { splitIntoSentences } from "../src/lib/question-postprocess/sentence-splitter";
import { findSentenceInsertMarkerContractIssues } from "../src/lib/question-quality/validators/sentence-insert";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { sentenceInsertOptionMarkerIndex } from "../src/lib/sentence-insert-options";
import { CREDIT_COSTS } from "../src/lib/credit-costs";
import { runWave2Round2Fixtures } from "./_test-md-sentence-insert-wave2";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const rec = (v: unknown): Record<string, unknown> => (v ?? {}) as Record<string, unknown>;

// ───────────────────────────────────────────────────────────────────────────
// 0. 픽스처 지문 — 10문장. 빼낼 문장은 S[2](전환점, 지시어 this 로 앞을 되받는다).
// ───────────────────────────────────────────────────────────────────────────
const S = [
  "Urban planners once treated street trees as ornament, a pleasant afterthought bolted onto finished road designs.",
  "Field measurements have since shown that a mature canopy holds pavement temperatures several degrees below an open street.",
  "But this cooling comes at a cost that few municipal budgets ever name.",
  "That expense surfaces in pruning contracts, sidewalk repairs, and the slow work of replacing roots that lift concrete.",
  "Cities that ignore those bills end up removing the very canopy they paid to establish.",
  "Planting programs therefore succeed only when a city's maintenance money is committed for decades, not seasons.",
  "The lesson is that shade is infrastructure, and infrastructure has to be maintained.",
  "Some cities now fund canopy care through stormwater fees, treating leaves as drainage equipment.",
  "Others fold the same costs into transportation budgets, where pavement life is already tracked.",
  "Either route works, provided the money outlasts the mayor who announced it.",
];
const PASSAGE = S.join(" ");
const OMIT_INDEX = 2;
const GIVEN = S[OMIT_INDEX];
const DISPLAY = S.filter((_, i) => i !== OMIT_INDEX);

/** 표시 문장 목록 + "마커를 그 뒤에 둘 인덱스" → 번호지문. */
function numberedOf(display: string[], afterDisplay: number[]): string {
  return display
    .map((sentence, i) => {
      const slot = afterDisplay.indexOf(i);
      return slot >= 0 ? `${sentence} [[${slot + 1}]]` : sentence;
    })
    .join(" ");
}
/** 마커를 지문 전역에 흩는다(앞쪽 쏠림 금지). 정답 자리는 표시 문장 1 뒤 = ②. */
const GOOD_AFTER = [0, 1, 3, 5, 7];
const NUMBERED = numberedOf(DISPLAY, GOOD_AFTER);
const DEFAULT_EXPLANATION =
  "앞 문장이 그늘의 냉각 효과를 처음 진술하므로 그 뒤에서만 되받는 지시어가 해소됩니다. 바로 뒤 문장이 가리키는 비용도 이 문장이 도입한 대가를 받습니다.";

interface FixtureOpts {
  given?: string;
  variant?: string;
  numbered?: string;
  answer?: string;
  explanation?: string;
  wrongLabels?: string[];
}
function fixture(opts: FixtureOpts): string {
  const wrong = (opts.wrongLabels ?? ["①", "③", "④", "⑤"])
    .map((l) => `${l} 이 자리는 앞 문장이 아직 냉각 효과를 말하지 않아 되받을 대상이 없습니다.`)
    .join("\n");
  return [
    `삽입문장: ${opts.given ?? GIVEN}`,
    opts.variant ? `삽입문장(변형): ${opts.variant}` : "",
    "번호지문:",
    opts.numbered ?? NUMBERED,
    "",
    `정답: ${opts.answer ?? "②"}`,
    `해설: ${opts.explanation ?? DEFAULT_EXPLANATION}`,
    "오답:",
    wrong,
  ].filter((line) => line !== "").join("\n");
}
const GOOD = fixture({});

function gateOf(text: string, options?: GateMdSentenceInsertOptions): string[] {
  const q = autoSnapInsertGiven(parseMdSentenceInsert(text), PASSAGE).question;
  return gateMdSentenceInsert(q, PASSAGE, { slotCount: 5, ...options });
}
/** 게이트 반려 단언 — 실패 시 실제 진단 전문을 보여준다. */
function rejects(name: string, text: string, needle: string, options?: GateMdSentenceInsertOptions) {
  const issues = gateOf(text, options);
  check(name, issues.some((i) => i.includes(needle)), issues.join(" / ") || "(클린)");
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 전제 — 후처리와 같은 분할기가 지문을 10문장으로 나눈다
// ───────────────────────────────────────────────────────────────────────────
check("전제: splitIntoSentences 가 픽스처 문장 10개와 정확히 일치", splitIntoSentences(PASSAGE).join("|") === S.join("|"), `${splitIntoSentences(PASSAGE).length}문장`);

// ───────────────────────────────────────────────────────────────────────────
// 2. 정상 경로 — 파싱 · 좌표 · 스냅 · 게이트
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdSentenceInsert(GOOD);
check("파싱: 삽입문장 축자", parsed.given === GIVEN, parsed.given);
check("파싱: 변형본 없음(설정 꺼짐)", parsed.givenVariant === "");
check("파싱: 정답 ②", parsed.answer === "②", parsed.answer);
check("파싱: 오답해설 4개", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check("파싱: 해설 존재", parsed.explanation.length > 10);
check("파싱: 번호지문에 뒤 블록이 섞이지 않음", !parsed.numberedPassage.includes("정답:") && parsed.numberedPassage.startsWith(S[0]), parsed.numberedPassage.slice(-40));

const split = splitInsertMarkers(parsed.numberedPassage);
check("마커 수집: 5개 · 번호 1..5", split.marks.map((m) => m.num).join("") === "12345");
check("마커 제거: 잔여 지문 복원(빼낸 문장만 빠진 형태)", stripInsertMarks(parsed.numberedPassage).replace(/\s+/g, " ").trim() === DISPLAY.join(" "));

const layout = computeInsertLayout(parsed, PASSAGE);
check("좌표: 빼낸 문장 인덱스 2", layout.omittedIndex === OMIT_INDEX, String(layout.omittedIndex));
check("좌표: 표시 문장 9개", layout.displaySentences.length === 9);
check("좌표: 마커별 직전 표시 문장 = [0,1,3,5,7]", layout.afterDisplayIndex.join(",") === GOOD_AFTER.join(","), layout.afterDisplayIndex.join(","));
check("★ 좌표: 원문 복원이 성립하는 자리는 ② 하나뿐", layout.matchingGaps.join(",") === "1", layout.matchingGaps.join(","));

const snapped = autoSnapInsertGiven(parsed, PASSAGE);
const goodIssues = gateMdSentenceInsert(snapped.question, PASSAGE, { slotCount: 5 });
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0);
check("게이트: 정상 입력 클린", goodIssues.length === 0, goodIssues.join(" / "));

// ───────────────────────────────────────────────────────────────────────────
// 3. 게이트 반려 전종
// ───────────────────────────────────────────────────────────────────────────
rejects("게이트: 삽입문장 누락", GOOD.replace(`삽입문장: ${GIVEN}\n`, ""), "삽입문장 누락");
rejects("게이트: 번호지문 누락", GOOD.replace(`번호지문:\n${NUMBERED}\n`, ""), "번호지문 누락");
rejects("게이트: 마커 개수 부족", GOOD.replace(" [[5]]", ""), "삽입 자리 마커 4개");
rejects("게이트: 마커 번호가 지문 등장순이 아님", fixture({ numbered: NUMBERED.replace("[[2]]", "[[3]]").replace(`[[3]] ${DISPLAY[3]}`, `[[2]] ${DISPLAY[3]}`) }), "마커 번호가 지문 등장순");
rejects("★ 게이트: 지문 무단 편집 → 재구성 불일치", GOOD.replace("pruning contracts", "pruning deals"), "지문 재구성 불일치");
rejects("★ 게이트: 삽입문장을 지어내면 축자 반려", fixture({ given: "But this warming arrives with an invoice that nobody ever signs." }), "삽입문장이 지문 축자가 아님");
// 두 문장을 한꺼번에 빼낸 경우 — 재구성은 성립하지만 완결된 한 문장이 아니다.
rejects("★ 게이트: 두 문장 동시 추출 → 완결된 한 문장이 아님", fixture({ given: `${S[3]} ${S[4]}`, numbered: numberedOf(S.filter((_, i) => i !== 3 && i !== 4), [0, 1, 2, 3, 4]), answer: "③", wrongLabels: ["①", "②", "④", "⑤"] }), "완결된 한 문장이 아님");
// 첫 문장 추출 — 후처리 하드 실패 선반영. 이 문장은 응집 단서도 없어 함께 잡힌다.
const FIRST_OUT = fixture({ given: S[0], numbered: numberedOf(S.slice(1), [0, 1, 2, 3, 4]) });
rejects("★ 게이트: 지문 첫 문장 추출 반려", FIRST_OUT, "첫 문장은 뺄 수 없다");
rejects("게이트: 응집 단서 없는 주어진 문장 반려", FIRST_OUT, "응집 단서");
rejects("★ 게이트: 정답이 복원 자리와 다르면 반려", GOOD.replace("정답: ②", "정답: ④"), "정답 불일치");
rejects("게이트: 정답이 양끝 자리면 반려", fixture({ given: S[1], numbered: numberedOf(S.filter((_, i) => i !== 1), [0, 1, 2, 3, 4]), answer: "①", wrongLabels: ["②", "③", "④", "⑤"] }), "양끝 자리");
rejects("게이트: 마커가 문장 한가운데", fixture({ numbered: NUMBERED.replace(" [[3]]", "").replace("pruning contracts,", "pruning contracts, [[3]]") }), "문장 경계가 아님");
rejects("게이트: 마커가 지문 맨 앞", fixture({ numbered: `[[1]] ${NUMBERED.replace(" [[1]]", "")}` }), "지문 맨 앞");
rejects("게이트: 두 마커가 붙어 사이에 문장이 없음", fixture({ numbered: `${DISPLAY[0]} [[1]] [[2]] ${DISPLAY[1]} ${DISPLAY[2]} [[3]] ${DISPLAY[3]} [[4]] ${DISPLAY[4]} [[5]] ${DISPLAY.slice(5).join(" ")}` }), "사이에 문장이 없음");
rejects("★ 게이트: 추출 자리에 마커 없음(후처리 하드 실패 선반영)", fixture({ numbered: numberedOf(DISPLAY, [0, 2, 3, 5, 7]) }), "마커가 없음");
rejects("게이트: 정답 누락", GOOD.replace("정답: ②\n", ""), "정답 누락");
rejects("게이트: 정답 라벨이 자리 범위 밖", GOOD.replace("정답: ②", "정답: ⑦"), "자리 마커 범위 밖");
rejects("게이트: 해설 누락", GOOD.replace(/^해설: .*$/m, "해설:"), "해설 누락");
rejects("게이트: 해설이 자리 번호(원문자)로 위치를 지칭", fixture({ explanation: "정답은 ② 자리입니다. 앞뒤 고리가 그 자리에서만 닫힙니다." }), "자리 번호(원문자)");
rejects("게이트: 오답해설 개수 부족", fixture({ wrongLabels: ["①", "③", "④"] }), "오답해설 3개");
rejects("게이트: 오답해설 라벨 중복", fixture({ wrongLabels: ["①", "③", "③", "⑤"] }), "라벨 중복");
check("게이트: 오답해설에 정답 번호 포함", gateMdSentenceInsert({ ...snapped.question, wrong: [...snapped.question.wrong, { label: "②", text: "정답인데 끼어듦" }] }, PASSAGE, { slotCount: 5 }).some((i) => i.includes("정답 번호 포함")));
check("게이트: answer-only 모드는 오답해설 개수를 묻지 않는다", gateMdSentenceInsert({ ...snapped.question, wrong: [] }, PASSAGE, { slotCount: 5, requireWrong: false }).length === 0);
check("게이트: 짧은 지문(자리 수 + 1 문장 미만)이면 원인을 지목하고 즉시 반려", gateMdSentenceInsert(parsed, S.slice(0, 5).join(" "), { slotCount: 5 }).some((i) => i.includes("지문이 5문장뿐")));
{
  // 정답 누출 — 표시 지문에 삽입문장과 거의 같은 문장이 남아 있는 퇴화 지문.
  const leakPassage = `${S[0]} ${S[1]} ${GIVEN} ${GIVEN} ${S[3]} ${S[4]} ${S[5]} ${S[6]}`;
  const leakText = fixture({ numbered: numberedOf([S[0], S[1], GIVEN, S[3], S[4], S[5], S[6]], [0, 1, 2, 3, 4]), answer: "③", wrongLabels: ["①", "②", "④", "⑤"] });
  const issues = gateMdSentenceInsert(parseMdSentenceInsert(leakText), leakPassage, { slotCount: 5 });
  check("게이트: 삽입문장이 표시 지문에 남아 정답 노출", issues.some((i) => i.includes("노출")), issues.join(" / "));
}

// ───────────────────────────────────────────────────────────────────────────
// 4. 드리프트 관용 — 전부 파싱 성공 + 게이트 클린이어야 한다
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string][] = [
  ["마커 안 공백", GOOD.replace("[[3]]", "[[ 3 ]]")],
  ["마커를 원문자로 표기", GOOD.replace("[[4]]", "[[④]]")],
  ["대괄호 없는 맨 원문자 마커(전량)", GOOD.replace(/\[\[([1-5])\]\]/g, (_m, d) => "①②③④⑤"[Number(d) - 1])],
  ["정답을 숫자로 표기", GOOD.replace("정답: ②", "정답: 2")],
  ["정답을 괄호 숫자로 표기", GOOD.replace("정답: ②", "정답: (2)")],
  ["정답을 이중 대괄호로 표기", GOOD.replace("정답: ②", "정답: [[2]]")],
  ["전각 콜론", GOOD.replace("삽입문장:", "삽입문장：").replace("정답:", "정답：")],
  ["번호지문 머리표와 같은 줄", GOOD.replace(`번호지문:\n${NUMBERED}`, `번호지문: ${NUMBERED}`)],
  ["번호지문 안 줄바꿈", GOOD.replace(` ${DISPLAY[4]}`, `\n${DISPLAY[4]}`)],
  ["마커 주변 공백 과다", GOOD.replace(" [[2]] ", "    [[2]]    ")],
  ["곱슬 아포스트로피 드리프트", GOOD.replace("a city's", "a city’s")],
  ["오답 불릿 접두", GOOD.replace("\n① 이 자리는", "\n- ① 이 자리는")],
  ["오답 굵게 라벨", GOOD.replace("\n③ 이 자리는", "\n**③** 이 자리는")],
  ["오답 숫자 라벨", GOOD.replace("\n④ 이 자리는", "\n4. 이 자리는")],
  ["오답 표 형식 행", GOOD.replace("\n⑤ 이 자리는", "\n| ⑤ | 이 자리는")],
  ["오답 목록에 정답 줄 끼어듦", GOOD.replace("오답:\n", "오답:\n② (정답) 이 자리가 맞습니다.\n")],
  // ── wave2 회귀: 키워드 줄 무관용이 필드를 통째로 삼키던 계통(silent-drop) ──
  // 선지 줄만 관대하게 파싱하고 머리표를 무관용으로 잡으면, 굵게·전각콜론 한 번에
  // 그 필드가 사라지고 게이트가 '정답 누락'(정답이 적혀 있는데도) 같은 **사실과 다른
  // 원인**을 재생성 프롬프트로 흘린다. 아래 6종이 수리 전 실측 실패 형상이다.
  ["머리표 관용: 정답 값을 굵게(`정답: **②**`)", GOOD.replace("정답: ②", "정답: **②**")],
  ["머리표 관용: 정답 머리표를 굵게(`**정답:** ②`)", GOOD.replace("정답: ②", "**정답:** ②")],
  ["머리표 관용: 삽입문장 머리표를 굵게", GOOD.replace("삽입문장:", "**삽입문장:**")],
  ["머리표 관용: 삽입문장 값을 굵게 감쌈", GOOD.replace(`삽입문장: ${GIVEN}`, `삽입문장: **${GIVEN}**`)],
  [
    "머리표 관용: 전 머리표를 굵게(수리 전 진단이 '삽입문장 누락' 한 줄뿐이었다)",
    GOOD.replace("삽입문장:", "**삽입문장:**")
      .replace("번호지문:", "**번호지문:**")
      .replace("정답: ②", "**정답:** ②")
      .replace("해설:", "**해설:**")
      .replace("오답:", "**오답:**"),
  ],
  ["머리표 관용: 굵게 + 전각 콜론 혼용", GOOD.replace("삽입문장:", "**삽입문장：**").replace("해설:", "**해설：**")],
  ["머리표 관용: 불릿 접두", GOOD.replace("정답: ②", "- 정답: ②").replace("해설:", "- 해설:")],
  ["머리표 관용: 헤딩 접두", GOOD.replace("번호지문:", "## 번호지문:").replace("오답:", "## 오답:")],
  ["머리표 관용: 앞 공백", GOOD.replace("정답: ②", "   정답: ②").replace("오답:", "   오답:")],
];
for (const [name, drifted] of DRIFTS) {
  const q = parseMdSentenceInsert(drifted);
  const issues = gateOf(drifted);
  check(`드리프트 관용: ${name}`, q.wrong.length === 4 && issues.length === 0, `오답 ${q.wrong.length}개 · ${issues.join(" / ")}`);
}
check("과잉 관용 방지: 오답 라벨 없는 산문 줄 무시", parseMdSentenceInsert(GOOD.replace("오답:\n", "오답:\n아래는 각 자리가 깨지는 이유입니다.\n")).wrong.length === 4);

// 스냅 — 구두점·대소문자 드리프트만 축자로 되돌린다(보수 가드)
{
  const s = autoSnapInsertGiven(parseMdSentenceInsert(fixture({ given: GIVEN.replace(/\.$/, "") })), PASSAGE);
  check("스냅: 마침표 누락 삽입문장을 축자로 보정", s.corrections.length === 1 && s.question.given === GIVEN, s.corrections.join(" / "));
  check("스냅 후 게이트 클린", gateMdSentenceInsert(s.question, PASSAGE, { slotCount: 5 }).length === 0);
  const invented = autoSnapInsertGiven(parseMdSentenceInsert(fixture({ given: "But this warming arrives with an invoice that nobody ever signs." })), PASSAGE);
  check("스냅 보수 가드: 단어가 다르면 보정하지 않는다(게이트가 반려)", invented.corrections.length === 0 && invented.question.given !== GIVEN);
}
check("스냅: 대소문자 드리프트 보정", autoSnapInsertGiven(parseMdSentenceInsert(fixture({ given: GIVEN.toLowerCase() })), PASSAGE).question.given === GIVEN);

// ───────────────────────────────────────────────────────────────────────────
// 5. 어댑터 → processSentenceInsert 왕복 → 품질 검증
// ───────────────────────────────────────────────────────────────────────────
{
  const adapt = adaptMdSentenceInsertToAiQuestion(snapped.question, PASSAGE, "KILLER");
  check("어댑터: 성공", adapt.ok === true, adapt.error);
  const ai = rec(adapt.aiQuestion);
  check("★ 어댑터: markerAfterSentenceIndices 는 원 지문 좌표 [0,1,4,6,8]", (ai.markerAfterSentenceIndices as number[]).join(",") === "0,1,4,6,8", String(ai.markerAfterSentenceIndices));
  check("어댑터: correctAnswer '2'", ai.correctAnswer === "2", String(ai.correctAnswer));
  check("어댑터: sourceSentenceToOmit 축자", ai.sourceSentenceToOmit === GIVEN);
  check("어댑터: givenSentence = 축자(변형 꺼짐)", ai.givenSentence === GIVEN);
  check("어댑터: 오답해설 라벨이 선지 축('1'~'5') · 정답 제외", (ai.wrongOptionExplanations as Array<{ label: string }>).map((w) => w.label).join(",") === "1,3,4,5", JSON.stringify(ai.wrongOptionExplanations));
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check("어댑터: options·passageWithMarkers 를 만들지 않는다(후처리 소관)", !("options" in ai) && !("passageWithMarkers" in ai));
  check("어댑터: 타 유형 이물 필드 없음", !("blanks" in ai) && !("passageWithBlank" in ai) && !("markedWords" in ai) && !("paragraphs" in ai));

  const pp = postProcessQuestion("SENTENCE_INSERT", PASSAGE, ai as never);
  const data = rec(pp.data);
  const pwm = String(data.passageWithMarkers ?? "");
  const wrongKeys = Object.keys(rec(data.wrongOptionExplanations));
  const options = data.options as Array<Record<string, unknown>>;
  check("후처리: 성공", pp.success === true, pp.error);
  check("후처리: passageWithMarkers 에 ①~⑤ 5개", ["①", "②", "③", "④", "⑤"].every((m) => pwm.includes(m)) && !pwm.includes("⑥"));
  check("후처리: 빼낸 문장이 표시 지문에서 제거됨", !pwm.includes(GIVEN.slice(0, 40)));
  // 후처리는 정답을 **추출 자리 기준 원문자**로 재부여한다(fast 와 동일 형상).
  // 어댑터가 보낸 "2" 와 같은 자리를 가리켜야 재키잉 경고가 뜨지 않는다.
  check("★ 후처리: 정답 자리 유지(②=인덱스 1)", sentenceInsertOptionMarkerIndex(data.correctAnswer) === 1, String(data.correctAnswer));
  check("★ 후처리: 정답 재키잉 경고 없음(md 가 이미 결정형으로 맞춰 보냈다)", !pp.warnings.some((w) => w.includes("Re-keyed")), pp.warnings.join(" / "));
  check("후처리: AI 선지 무시 경고 없음(어댑터가 options 를 만들지 않았다)", !pp.warnings.some((w) => w.includes("Ignored AI-provided")), pp.warnings.join(" / "));
  check("후처리: omittedSourceSentenceIndex 2", data.omittedSourceSentenceIndex === OMIT_INDEX);
  check("후처리: 선지 5개 · 라벨 1~5 · 텍스트 ①~⑤", options.length === 5 && options[0].label === "1" && options[4].text === "⑤");
  check("후처리: 오답해설 4개 생존 · 정답 자리 미포함", wrongKeys.length === 4 && !wrongKeys.includes("2"), JSON.stringify(wrongKeys));
  check("★ 후처리: 마커 렌더 계약 위반 0(문장 중간·인접 빈 갭 없음)", findSentenceInsertMarkerContractIssues(pwm).length === 0, findSentenceInsertMarkerContractIssues(pwm).map((f) => f.code).join(" / "));

  const errs = validateQuestionQuality({ typeId: "SENTENCE_INSERT", question: data, passage: PASSAGE, requestedDifficulty: "KILLER", sentenceInsertSlotCount: 5, stemLanguage: "ko", optionLanguage: "ko" }).filter((i) => i.severity === "error");
  check("★ 품질 검증: error 0", errs.length === 0, errs.map((e) => e.code).join(" / "));
}

// 정답 자리가 ② 가 아닌 형상도 좌표가 맞는지 (정답: 줄 축 검증)
{
  const text = fixture({ given: S[5], numbered: numberedOf(S.filter((_, i) => i !== 5), [0, 2, 4, 6, 8]), answer: "③", wrongLabels: ["①", "②", "④", "⑤"] });
  const q = autoSnapInsertGiven(parseMdSentenceInsert(text), PASSAGE).question;
  const issues = gateMdSentenceInsert(q, PASSAGE, { slotCount: 5 });
  check("게이트: 다른 문장을 빼낸 형상도 클린", issues.length === 0, issues.join(" / "));
  const ai = rec(adaptMdSentenceInsertToAiQuestion(q, PASSAGE, "KILLER").aiQuestion);
  check("어댑터: 빼낸 문장이 S[5] 면 좌표 [0,2,4,7,9] · 정답 '3'", (ai.markerAfterSentenceIndices as number[]).join(",") === "0,2,4,7,9" && ai.correctAnswer === "3", `${String(ai.markerAfterSentenceIndices)} / ${String(ai.correctAnswer)}`);
  const pp = postProcessQuestion("SENTENCE_INSERT", PASSAGE, ai as never);
  check("후처리: 재키잉 없이 정답 자리 ③ 유지", pp.success === true && sentenceInsertOptionMarkerIndex(rec(pp.data).correctAnswer) === 2 && !pp.warnings.some((w) => w.includes("Re-keyed")), pp.error ?? String(rec(pp.data).correctAnswer));
}

// 슬롯 8개(비기본 설정) 경로 — 설정 집행 왕복
{
  const text = fixture({ numbered: numberedOf(DISPLAY, [0, 1, 2, 3, 4, 5, 6, 7]), wrongLabels: ["①", "③", "④", "⑤", "⑥", "⑦", "⑧"] });
  const q = autoSnapInsertGiven(parseMdSentenceInsert(text), PASSAGE).question;
  const clean = gateMdSentenceInsert(q, PASSAGE, { slotCount: 8 });
  check("슬롯 8: 게이트 클린", clean.length === 0, clean.join(" / "));
  check("슬롯 8: 개수 설정 집행(5개 요구 시 반려)", gateMdSentenceInsert(q, PASSAGE, { slotCount: 5 }).some((i) => i.includes("삽입 자리 마커 8개")));
  const ai = rec(adaptMdSentenceInsertToAiQuestion(q, PASSAGE, "INTERMEDIATE").aiQuestion);
  check("슬롯 8: 좌표 8개 · 오답해설 7개", (ai.markerAfterSentenceIndices as number[]).length === 8 && (ai.wrongOptionExplanations as unknown[]).length === 7);
  const pp = postProcessQuestion("SENTENCE_INSERT", PASSAGE, ai as never);
  check("슬롯 8: 후처리 성공 · 선지 8개 · 정답 자리 ②", pp.success === true && (rec(pp.data).options as unknown[]).length === 8 && sentenceInsertOptionMarkerIndex(rec(pp.data).correctAnswer) === 1, pp.error);
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 변형(paraphrasePrefix) 2단 출력 계약
// ───────────────────────────────────────────────────────────────────────────
const VARIANT = "Yet this relief carries a cost that few municipal budgets ever name.";
{
  const q = autoSnapInsertGiven(parseMdSentenceInsert(fixture({ variant: VARIANT })), PASSAGE).question;
  const clean = gateMdSentenceInsert(q, PASSAGE, { slotCount: 5, paraphrasePrefix: true });
  check("변형 파싱: 축자·변형 두 줄 분리", q.given === GIVEN && q.givenVariant === VARIANT, q.givenVariant);
  check("변형 게이트: 클린", clean.length === 0, clean.join(" / "));
  check("변형 게이트: 설정 꺼짐인데 변형 줄이 있으면 반려", gateMdSentenceInsert(q, PASSAGE, { slotCount: 5 }).some((i) => i.includes("변형 설정이 꺼져 있는데")));
  rejects("변형 게이트: 설정 켜짐인데 변형 줄이 없으면 반려", GOOD, "'삽입문장(변형):' 줄이 없음", { paraphrasePrefix: true });

  const ai = rec(adaptMdSentenceInsertToAiQuestion(q, PASSAGE, "KILLER", "PREFIX_VARIANT").aiQuestion);
  check("★ 변형 어댑터: 학생 표면은 변형본 · 서버가 지울 문장은 축자", ai.givenSentence === VARIANT && ai.sourceSentenceToOmit === GIVEN, `${String(ai.givenSentence)} / ${String(ai.sourceSentenceToOmit)}`);
  const pp = postProcessQuestion("SENTENCE_INSERT", PASSAGE, ai as never);
  const data = rec(pp.data);
  check("★ 변형 후처리: 성공 · 축자 문장 제거 · 정답 자리 ② 유지 · 재키잉 없음", pp.success === true && !String(data.passageWithMarkers).includes(GIVEN.slice(0, 40)) && sentenceInsertOptionMarkerIndex(data.correctAnswer) === 1 && !pp.warnings.some((w) => w.includes("Re-keyed")), pp.error ?? `${String(data.correctAnswer)} / ${pp.warnings.join(" ")}`);
}
const variantRejects = (name: string, variant: string, needle: string) =>
  rejects(name, fixture({ variant }), needle, { paraphrasePrefix: true });
variantRejects("변형 검사: 축자를 그대로 복사하면 반려", GIVEN, "축자와 동일");
variantRejects("변형 검사: 되받는 지시어를 지우면 반려", "However, cooler pavement carries a cost few municipal budgets ever name.", "지시어·대명사가 사라짐");
variantRejects("변형 검사: 문장 전체를 다시 쓰면 반려(앞부분만 변형 계약)", "However, the shade that lowers street temperatures also creates bills nobody planned for.", "문장 전체를 다시 씀");
variantRejects("변형 검사: 지문의 다른 구간을 옮겨 오면 반려", S[6], "다른 구간을 그대로 옮겨");
variantRejects("변형 검사: 분량 이탈 반려", "Yet this costs money.", "분량 이탈");

// ───────────────────────────────────────────────────────────────────────────
// 7. 레인 계약 — 과금 축 · 적격성 · 설정 집행 · 난이도 3분기
// ───────────────────────────────────────────────────────────────────────────
check("레인: subType SENTENCE_INSERT", SENTENCE_INSERT_MD_LANE.subType === "SENTENCE_INSERT");
check("★ 레인: 과금 QUESTION_GEN_SINGLE — fast getOperationType(VOCAB_TYPES 미포함)과 동기", SENTENCE_INSERT_MD_LANE.operationType === "QUESTION_GEN_SINGLE" && CREDIT_COSTS.QUESTION_GEN_SINGLE === 2, String(SENTENCE_INSERT_MD_LANE.operationType));
check("레인: retryEligible", SENTENCE_INSERT_MD_LANE.retryEligible === true);
check("레인: 적격성 5~8 · 범위 밖 거부 · 미지정은 기본 5로 적격", SENTENCE_INSERT_MD_LANE.isEligible({ sentenceInsertSlotCount: 5 }) && SENTENCE_INSERT_MD_LANE.isEligible({ sentenceInsertSlotCount: 8 }) && !SENTENCE_INSERT_MD_LANE.isEligible({ sentenceInsertSlotCount: 4 }) && !SENTENCE_INSERT_MD_LANE.isEligible({ sentenceInsertSlotCount: 9 }) && SENTENCE_INSERT_MD_LANE.isEligible({}));
check("레인: diversityTargets = 이미 빼낸 문장", SENTENCE_INSERT_MD_LANE.diversityTargets({ omittedSourceSentence: GIVEN }).join("") === GIVEN && SENTENCE_INSERT_MD_LANE.diversityTargets({}).length === 0);

function ctxOf(overrides: Partial<MdLaneContext> = {}): MdLaneContext {
  return { passage: PASSAGE, difficulty: "KILLER", rawDifficulty: "KILLER", resolved: { sentenceInsertSlotCount: 5 }, rawTypeSettings: null, teacherPoints: [], variantIndex: 0, variantCount: 1, ...overrides };
}
{
  const laneParsed = SENTENCE_INSERT_MD_LANE.parseAndGate(GOOD, ctxOf());
  const adapt = SENTENCE_INSERT_MD_LANE.adapt(laneParsed, ctxOf());
  const en = SENTENCE_INSERT_MD_LANE.adapt(laneParsed, ctxOf({ rawTypeSettings: { SENTENCE_INSERT: { stemLanguage: "en" } } }));
  const points = (text: string) => [{ text }] as MdLaneContext["teacherPoints"];
  check("레인: parseAndGate 클린", laneParsed.gateIssues.length === 0, laneParsed.gateIssues.join(" / "));
  check("레인: adapt 성공 · 한국어 발문", adapt.ok === true && String(adapt.aiQuestion?.direction).includes("주어진 문장"));
  check("레인: 질문 언어 en 이면 발문 영어 집행", String(en.aiQuestion?.direction).startsWith("Where would"), String(en.aiQuestion?.direction));
  check("레인: qualityArgs 에 slotCount·언어 실값", SENTENCE_INSERT_MD_LANE.qualityArgs(ctxOf()).sentenceInsertSlotCount === 5 && SENTENCE_INSERT_MD_LANE.qualityArgs(ctxOf()).stemLanguage === "ko");
  check("레인: mdFormat 포렌식 메타", JSON.stringify(SENTENCE_INSERT_MD_LANE.mdFormat(ctxOf({ resolved: { sentenceInsertSlotCount: 7, sentenceInsertParaphrasePrefix: true } }))) === JSON.stringify({ slotCount: 7, paraphrasePrefix: true, pointFocus: false }));
  check("레인: pointFocus 설정이면 응집장치 가이드 블록 주입(꺼짐이면 없음)", SENTENCE_INSERT_MD_LANE.buildExtras(ctxOf({ resolved: { sentenceInsertSlotCount: 5, sentenceInsertPointFocus: true } })).some((b) => b.includes("출제 포인트 가이드")) && SENTENCE_INSERT_MD_LANE.buildExtras(ctxOf()).length === 0);
  check("레인: 교사 지정 문장을 빼내지 않으면 반려 · 빼내면 통과", SENTENCE_INSERT_MD_LANE.parseAndGate(GOOD, ctxOf({ teacherPoints: points(S[6]) })).gateIssues.some((i) => i.includes("교사 지정 문장")) && SENTENCE_INSERT_MD_LANE.parseAndGate(GOOD, ctxOf({ teacherPoints: points(GIVEN) })).gateIssues.length === 0);
}

for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdSentenceInsertPrompt(PASSAGE, "full", d, { slotCount: 6 });
  const marker = d === "BASIC" ? "기본 난이도" : d === "INTERMEDIATE" ? "중급 난이도" : "KILLER 의 생명";
  check(`프롬프트 ${d}: 난이도 분기 + 6자리 스캐폴드 + 지문 포함`, p.includes("[[6]]") && !p.includes("[[7]]") && p.includes("## 지문") && p.includes(PASSAGE.slice(0, 40)) && p.includes(marker));
}
const KILLER_PROMPT = buildMdSentenceInsertPrompt(PASSAGE, "full", "KILLER");
check("프롬프트: few-shot 은 BASIC 에서 생략(정본 어법 빌더 선례)", !buildMdSentenceInsertPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") && KILLER_PROMPT.includes("모범 설계 해부"));
check("프롬프트: 재구성 불변식·첫 문장 금지·양끝 금지를 명시", ["원 지문과 한 글자도 다르지 않아야", "첫 문장은 빼낼 수 없다", "양끝"].every((s) => KILLER_PROMPT.includes(s)));
check("프롬프트: paraphrasePrefix 설정 집행(변형 줄 요구)", buildMdSentenceInsertPrompt(PASSAGE, "full", "KILLER", { paraphrasePrefix: true }).includes("삽입문장(변형):") && !KILLER_PROMPT.includes("삽입문장(변형):"));
check("프롬프트: 자리마다 정답 여부를 다시 받는 칸이 없다(형식 설계 철칙 1)", !KILLER_PROMPT.includes("O 또는 X"));
check("프롬프트: slotCount 클램프(3→5, 99→8)", buildMdSentenceInsertPrompt(PASSAGE, "full", "KILLER", { slotCount: 3 }).includes("[[5]]") && !buildMdSentenceInsertPrompt(PASSAGE, "full", "KILLER", { slotCount: 3 }).includes("[[6]]") && buildMdSentenceInsertPrompt(PASSAGE, "full", "KILLER", { slotCount: 99 }).includes("[[8]]"));
check("프롬프트: answer-only 모드는 오답 블록을 요구하지 않는다", !buildMdSentenceInsertPrompt(PASSAGE, "answer-only", "KILLER").includes("\n오답:"));

// 어댑터 방어 — 게이트를 우회해 직접 부를 때도 오염 문항을 만들지 않는다
{
  const dupWrong: MdInsertQuestion = { ...snapped.question, wrong: [...snapped.question.wrong, { label: "①", text: "중복 라벨" }] };
  const firstOut = parseMdSentenceInsert(fixture({ given: S[0], numbered: numberedOf(S.slice(1), [0, 1, 2, 3, 4]), answer: "①" }));
  check("어댑터 방어: 오답해설 라벨 중복이면 실패(조용한 덮어쓰기 금지)", adaptMdSentenceInsertToAiQuestion(dupWrong, PASSAGE, "KILLER").ok === false);
  check("어댑터 방어: 첫 문장 추출이면 실패", adaptMdSentenceInsertToAiQuestion(firstOut, PASSAGE, "KILLER").ok === false);
}

// ───────────────────────────────────────────────────────────────────────────
// 8. 적대검수(wave2) 회귀 픽스처 — 각 항목은 수리 전 실측 실패를 그대로 재현한다.
// ───────────────────────────────────────────────────────────────────────────

/** 임의 지문으로 5자리 문항 md 를 짓고 파싱→스냅→게이트→어댑터→후처리→품질 왕복. */
function roundTrip(sentences: string[], omit: number, afterDisplay: number[], answer: string) {
  const passage = sentences.join(" ");
  const display = sentences.filter((_, i) => i !== omit);
  const text = [
    `삽입문장: ${sentences[omit]}`,
    "번호지문:",
    numberedOf(display, afterDisplay),
    "",
    `정답: ${answer}`,
    `해설: ${DEFAULT_EXPLANATION}`,
    "오답:",
    ["①", "②", "③", "④", "⑤"].filter((l) => l !== answer).map((l) => `${l} 이 자리는 앞 고리가 닫히지 않습니다.`).join("\n"),
  ].join("\n");
  const q = autoSnapInsertGiven(parseMdSentenceInsert(text), passage).question;
  const gate = gateMdSentenceInsert(q, passage, { slotCount: 5 });
  const adapt = adaptMdSentenceInsertToAiQuestion(q, passage, "KILLER");
  const pp = adapt.ok && adapt.aiQuestion ? postProcessQuestion("SENTENCE_INSERT", passage, adapt.aiQuestion as never) : null;
  const errs = pp?.success
    ? validateQuestionQuality({ typeId: "SENTENCE_INSERT", question: rec(pp.data), passage, requestedDifficulty: "KILLER", sentenceInsertSlotCount: 5, stemLanguage: "ko", optionLanguage: "ko" }).filter((i) => i.severity === "error")
    : [];
  return { passage, text, q, gate, adapt, pp, errs, display };
}
function checkRoundTrip(name: string, r: ReturnType<typeof roundTrip>, omit: number) {
  check(`${name}: 게이트 클린`, r.gate.length === 0, r.gate.join(" / "));
  check(`${name}: 어댑터·후처리·품질 왕복`, r.adapt.ok === true && r.pp?.success === true && r.errs.length === 0, `${r.adapt.error ?? ""} ${r.pp?.error ?? ""} ${r.errs.map((e) => e.code).join(" / ")}`);
  check(`${name}: 빼낸 문장 좌표 ${omit}`, computeInsertLayout(r.q, r.passage).omittedIndex === omit, String(computeInsertLayout(r.q, r.passage).omittedIndex));
}

// 8-1 (critical) splitIntoSentences 는 무손실 왕복이 아니다 — 인용부호·단일문자 약어
// 지문에서 `sentences.filter(...).join(" ")` 축은 유령 공백을 만들어, 모델이 지문을
// 한 글자도 안 바꾸고 완벽히 옮겨 적어도 omittedIndex=-1 이 되고 게이트가 '삽입문장이
// 지문의 완결된 한 문장이 아님' 이라는 **거짓 원인**만 낸다(그 문구가 그대로 재생성
// 피드백이 되어 같은 출력을 반복 → 실패·환불). 해당 지문군에서 유형 영구 사용 불가였다.
{
  // (a) 닫는 따옴표가 다음 단위 선두로 흘러가는 지문(stranding).
  const quoteHead = ['A city forester told the council, "Trees are the cheapest cooling machine we own."', ...S.slice(1, 8)];
  checkRoundTrip("★ 회귀(C1a) 인용부호 지문", roundTrip(quoteHead, 2, [0, 1, 3, 4, 5], "②"), 2);
  // (b) `U.S.` 를 `U.` / `S.` 로 쪼개는 단일문자 약어 분기.
  const usPassage = [...S.slice(0, 4), "In the U.S. alone, cities that ignore those bills end up removing the very canopy they paid to establish.", ...S.slice(5, 8)];
  checkRoundTrip("★ 회귀(C1b) U.S. 지문", roundTrip(usPassage, 2, [0, 1, 3, 4, 5], "②"), 2);
  // (c) 빼낼 문장 **자신**이 닫는 따옴표로 끝나 분할기 단위와 글자가 달라지는 형상.
  //     여기서 '삽입문장이 지문 축자가 아님' 을 발화하면 축자 완벽 출력이 거짓 반려된다.
  const quoteOmit = [...S.slice(0, 2), 'One forester put it bluntly: "This cooling comes at a cost that few municipal budgets ever name."', ...S.slice(3, 8)];
  const rc = roundTrip(quoteOmit, 2, [0, 1, 3, 4, 5], "②");
  checkRoundTrip("★ 회귀(C1c) 빼낸 문장이 인용으로 끝남", rc, 2);
  check("★ 회귀(C1c): 분할기 단위와 삽입문장 글자가 달라도 축자 반려를 내지 않는다", rc.q.given !== computeInsertLayout(rc.q, rc.passage).sentences[2] && rc.gate.length === 0);
  // 폴백은 **복원 증명이 선 뒤에만** 발동한다 — 지문 파손·지어낸 문장은 그대로 반려.
  const damaged = rc.text.replace("pruning contracts", "pruningcontracts");
  const invented = rc.text.replace(`삽입문장: ${quoteOmit[2]}`, "삽입문장: But this warming arrives with an invoice that nobody ever signs.");
  const gateOf2 = (t: string, p: string) => gateMdSentenceInsert(autoSnapInsertGiven(parseMdSentenceInsert(t), p).question, p, { slotCount: 5 });
  check("★ 회귀(C1) 폴백이 지문 파손을 통과시키지 않는다", gateOf2(damaged, rc.passage).some((i) => i.includes("지문 재구성 불일치")), gateOf2(damaged, rc.passage).join(" / "));
  check("★ 회귀(C1) 폴백이 지어낸 문장을 통과시키지 않는다", gateOf2(invented, rc.passage).length > 0, "(클린)");
  // 두 문장 동시 추출은 여전히 '완결된 한 문장이 아님' — 폴백이 토큰 수까지 대조한다.
  rejects("★ 회귀(C1) 폴백이 두 문장 동시 추출을 삼키지 않는다", fixture({ given: `${S[3]} ${S[4]}`, numbered: numberedOf(S.filter((_, i) => i !== 3 && i !== 4), [0, 1, 2, 3, 4]), answer: "③", wrongLabels: ["①", "②", "④", "⑤"] }), "완결된 한 문장이 아님");
}

// 8-2 (major) 변형본 응집 단서 검사가 무효였다 — 계약이 꼬리를 축자 복사하도록 강제하는데
// 검사가 문장 '전체'를 봐서, 관계대명사 `that` 하나가 두 축을 동시에 만족시켜 자리를
// 고정하던 `this cooling` 이 통째로 사라진 변형본도 클린이었다(복수정답 출하).
{
  const stripped = "Shade lowers pavement heat at a cost that few municipal budgets ever name.";
  const issues = gateOf(fixture({ variant: stripped }), { paraphrasePrefix: true });
  check("★ 회귀(M1): 변형 접두부에서 되받음이 사라지면 반려(꼬리가 대신 통과시키지 못한다)", issues.some((i) => i.includes("지시어·대명사가 사라짐")), issues.join(" / ") || "(클린)");
  check("★ 회귀(M1): 접두부 연결사(But) 소실도 반려 — validators 사전에 없던 축", issues.some((i) => i.includes("연결사가 사라짐")), issues.join(" / ") || "(클린)");
}

// 8-3 (major) 게이트가 후처리 임계(0.85)만 베끼고 유사도 **함수**는 다른 것을 써서,
// '게이트 클린 → 후처리 하드 실패(재생성 기회 없음)' 밴드가 있었다. 라우트의 1회
// 재생성은 gateIssues 에만 걸려 있어 모델 콜 1회를 소진한 채 잡이 죽었다.
{
  const leakS = [...S.slice(0, 3), "This cooling arrives at a cost that few municipal budgets name.", ...S.slice(3, 7)];
  const r = roundTrip(leakS, 2, [0, 1, 3, 4, 5], "②");
  check("★ 회귀(M2): 후처리 하드 실패 밴드를 게이트가 먼저 잡는다", r.gate.some((i) => i.includes("노출")), r.gate.join(" / ") || "(클린)");
  check("★ 회귀(M2): 같은 payload 가 후처리에서는 하드 실패였다(밴드 실재 증명)", r.pp === null || r.pp.success === false, r.pp?.error ?? "");
}

// 8-4 (major) 자리 범위 밖 마커를 파서가 조용히 버려, 리터럴이 잔여 지문에 남아
// '지문 무단 편집' 으로 오진됐다(모델은 지문을 고치지 않았다).
{
  const stray = fixture({ numbered: NUMBERED.replace(` ${DISPLAY[8]}`, ` [[9]] ${DISPLAY[8]}`) });
  check("★ 회귀(M3): [[9]] 를 조용히 버리지 않는다(리터럴이 잔여 지문에 남지 않음)", !stripInsertMarks(parseMdSentenceInsert(stray).numberedPassage).includes("[[9]]") && splitInsertMarkers(parseMdSentenceInsert(stray).numberedPassage).marks.length === 6);
  rejects("★ 회귀(M3): 게이트가 범위 밖 자리를 지목(철칙 5)", stray, "자리 범위(1~5) 밖: [[9]]");
  rejects("회귀(M3): [[0]] 도 수집·지목", fixture({ numbered: NUMBERED.replace(` ${DISPLAY[8]}`, ` [[0]] ${DISPLAY[8]}`) }), "자리 범위(1~5) 밖: [[0]]");
  rejects("회귀(M3): [[10]] 도 수집·지목", fixture({ numbered: NUMBERED.replace(` ${DISPLAY[8]}`, ` [[10]] ${DISPLAY[8]}`) }), "자리 범위(1~5) 밖: [[10]]");
  rejects("회귀(M3): 개수는 맞고 번호만 범위 밖이어도 지목", fixture({ numbered: NUMBERED.replace("[[5]]", "[[9]]") }), "자리 범위(1~5) 밖: [[9]]");
  rejects("회귀(M3): 슬롯 8에서 [[9]] 를 더 쓴 형상", fixture({ numbered: numberedOf(DISPLAY, [0, 1, 2, 3, 4, 5, 6, 7]).replace(` ${DISPLAY[8]}`, ` [[9]] ${DISPLAY[8]}`), wrongLabels: ["①", "③", "④", "⑤", "⑥", "⑦", "⑧"] }), "자리 범위(1~8) 밖: [[9]]", { slotCount: 8 });
}

// 8-5 (major) 마커 자리를 구분자 없이 이어 붙여, 마커를 문장 사이에 '붙여' 쓴 출력이
// (원문을 한 글자도 안 고쳤는데) '지문 무단 편집' 으로 거짓 반려됐다.
{
  check("★ 회귀(M4): 마커 양옆이 모두 붙어도 클린", gateOf(fixture({ numbered: NUMBERED.replace(" [[4]] ", "[[4]]") })).length === 0, gateOf(fixture({ numbered: NUMBERED.replace(" [[4]] ", "[[4]]") })).join(" / "));
  check("회귀(M4): 앞 공백만/뒤 공백만도 클린(수리 전부터 통과하던 축)", gateOf(fixture({ numbered: NUMBERED.replace(" [[4]] ", " [[4]]") })).length === 0 && gateOf(fixture({ numbered: NUMBERED.replace(" [[4]] ", "[[4]] ") })).length === 0);
  check("회귀(M4): 전 마커를 붙여 써도 클린", gateOf(fixture({ numbered: NUMBERED.replace(/ \[\[(\d)\]\] /g, "[[$1]]") })).length === 0, gateOf(fixture({ numbered: NUMBERED.replace(/ \[\[(\d)\]\] /g, "[[$1]]") })).join(" / "));
  // 단어 한복판 마커는 붙인 그대로 둬야 '문장 경계가 아님' 진단이 살아 있다(과잉 관용 방지).
  rejects("회귀(M4): 단어 한복판 마커는 여전히 문장 경계 반려", fixture({ numbered: NUMBERED.replace(" [[3]] ", " ").replace("pruning", "prun[[3]]ing") }), "문장 경계가 아님");
}

// 8-6·8-7 (wave2 2차 라운드) 회귀 픽스처 — 파일 500줄 규약으로 모듈 분리, 카운터는 공유.
runWave2Round2Fixtures(check);

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
