// 네모 어법(GRAMMAR_CHOICE_COMBO) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 전종 → 어댑터 → processGrammarChoiceCombo 왕복 →
// 검증기 → **셔플 상호작용(정찰 R7)** → 레인 계약(과금·적격성·난이도 3분기).
// 실행: npx tsx scripts/_test-md-combo.ts
import {
  autoSnapComboSlots,
  collectComboMarks,
  parseMdCombo,
  rebuildComboPassage,
} from "../src/lib/md-qgen/parser-combo";
import { gateMdCombo } from "../src/lib/md-qgen/gate-combo";
import { adaptMdComboToAiQuestion } from "../src/lib/md-qgen/adapter-combo";
// fast error 승격 이식분 전종(수량·지각동사·누설 3분기·보문 that 오라벨).
import { runComboFastParityChecks } from "./_test-md-combo-fastparity";
import { GRAMMAR_CHOICE_COMBO_MD_LANE } from "../src/lib/md-qgen/lane-combo";
import { buildMdComboPrompt } from "../src/lib/md-qgen/prompts-combo";
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
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

// ───────────────────────────────────────────────────────────────────────────
// 픽스처 — 세 네모가 서로 다른 문장·서로 다른 포인트(d 수일치 / c 분사 / i 병렬),
// 판단 근거가 각각 왼쪽 선행사·오른쪽 by 행위자구·문장 앞머리 등위로 흩어져 있다.
// ───────────────────────────────────────────────────────────────────────────
const PASSAGE =
  "Urban canopies cool dense blocks, yet the benefit that these canopies provide disappears when roots have no room to spread. " +
  "Soil compacted by heavy construction traffic holds almost no water, so young trees starve within a single dry summer. " +
  "Planners who understand this widen the trenches, add structural soil, and protect the root zone before a single sapling arrives.";

const MARKED =
  "Urban canopies cool dense blocks, yet the benefit that these canopies [[A:provide|provides]] disappears when roots have no room to spread. " +
  "Soil [[B:compacted|compacting]] by heavy construction traffic holds almost no water, so young trees starve within a single dry summer. " +
  "Planners who understand this widen the trenches, add structural soil, and [[C:protect|protecting]] the root zone before a single sapling arrives.";

const GOOD = `네모지문:
${MARKED}

원형·포인트:
(A) provide | provides | d
(B) compacted | compacting | c
(C) protect | protecting | i

선지:
① provides …… compacted …… protect
② provide …… compacting …… protecting
③ provide …… compacted …… protect
④ provides …… compacting …… protect
⑤ provide …… compacted …… protecting
정답: ③
해설: (A)는 관계절의 선행사가 복수인 these canopies 이므로 복수 동사 provide 가 옳고, (B)는 뒤에 by 행위자구가 이어져 흙이 다져지는 쪽이므로 과거분사 compacted 가 옳습니다. (C)는 앞의 widen, add 와 등위로 이어지는 자리라 같은 형태의 protect 가 옳습니다.
오답:
① (A)의 provides 는 선행사 these canopies 의 수와 어긋납니다.
② (B)의 compacting 은 능동이라 by 행위자구와 충돌하고, (C)의 protecting 은 등위 짝의 형태를 깨뜨립니다.
④ (A)의 provides 가 수일치를 깨고, (B)의 compacting 이 태를 뒤집습니다.
⑤ (C)의 protecting 은 widen, add 와 병렬을 이루지 못합니다.`;

const OPT = { slotCount: 3, optionCount: 5 } as const;
const gateOf = (text: string) =>
  gateMdCombo(autoSnapComboSlots(parseMdCombo(text), PASSAGE).question, PASSAGE, OPT);
const rawGateOf = (text: string) => gateMdCombo(parseMdCombo(text), PASSAGE, OPT);
const swap = (from: string, to: string) => GOOD.replace(from, to);

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdCombo(GOOD);
check("파싱: 네모지문 추출", parsed.markedPassage === MARKED);
check("파싱: 슬롯 3개", parsed.slots.length === 3, `실제 ${parsed.slots.length}`);
check("파싱: 슬롯 필드(라벨·올바름·틀림·코드)",
  parsed.slots[0].label === "(A)" && parsed.slots[0].correct === "provide" &&
  parsed.slots[0].wrong === "provides" && parsed.slots[2].code === "i");
check("파싱: 선지 5개", parsed.options.length === 5, `실제 ${parsed.options.length}`);
check("파싱: 선지 값 3개 분해(구분자 ' …… ')",
  parsed.options.every((o) => o.values.length === 3) &&
  parsed.options[2].values.join("|") === "provide|compacted|protect");
check("파싱: 정답 ③", parsed.answer === "③", parsed.answer);
check("파싱: 해설 존재", parsed.explanation.length > 20);
check("파싱: 오답해설 4개 + 정답 라벨 제외",
  parsed.wrong.length === 4 && !parsed.wrong.some((w) => w.label === "③"), `실제 ${parsed.wrong.length}`);
check("마커 수집: 라벨 3개 · 각 후보 2개",
  collectComboMarks(MARKED).map((m) => m.label).join("") === "(A)(B)(C)" &&
  collectComboMarks(MARKED).every((m) => m.candidates.length === 2));
check("재구성: 올바른 표현으로 되돌리면 원 지문",
  rebuildComboPassage(MARKED, (_l, c) => c[0]).text === PASSAGE);
const snapped = autoSnapComboSlots(parsed, PASSAGE);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
const gate = gateMdCombo(snapped.question, PASSAGE, OPT);
check("게이트: 정상 입력 클린", gate.length === 0, gate.join(" / "));

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 전종
// ───────────────────────────────────────────────────────────────────────────
check("게이트 #1 마커 수: 2개면 즉시 반려",
  has(gateOf(swap("[[C:protect|protecting]]", "protect")), "네모 마커 2개"));
check("게이트 #1 메타 수: 2줄이면 즉시 반려",
  has(gateOf(swap("(C) protect | protecting | i\n", "")), "원형·포인트 항목 2개"));
check("게이트 #2 라벨 순서: 지문 등장순이 아니면 반려",
  has(gateOf(GOOD
    .replace("[[A:provide|provides]]", "[[B:provide|provides]]")
    .replace("[[B:compacted|compacting]]", "[[A:compacted|compacting]]")), "지문 등장순"));
check("게이트 #5 지문 무단 편집 반려",
  has(gateOf(swap("heavy construction traffic", "construction traffic")), "지문 재구성 불일치"));
check("게이트 #5 마커 왼쪽이 원문 축자가 아니면 반려",
  has(gateOf(GOOD
    .replace("[[A:provide|provides]]", "[[A:providing|provides]]")
    .replace("(A) provide | provides | d", "(A) providing | provides | d")), "지문 재구성 불일치"));
// #4 는 스냅(S1/S2)이 흡수하는 드리프트다 — 스냅이 실패했을 때의 방벽으로서
// 게이트가 실제로 잡는지를 스냅 전 파싱본으로 확인한다(스냅 통과는 §4 에서).
check("게이트 #4 메타 올바른 표현이 마커와 불일치하면 반려(스냅 전)",
  has(rawGateOf(swap("(A) provide | provides | d", "(A) provided | provides | d")), "마커 왼쪽과 불일치"));
check("게이트 #4 메타 틀린 표현이 마커와 불일치하면 반려(스냅 전)",
  has(rawGateOf(swap("(B) compacted | compacting | c", "(B) compacted | compacts | c")), "마커 오른쪽과 불일치"));
check("게이트 #3 파이프 누락(후보 1개) 반려",
  has(gateOf(swap("[[B:compacted|compacting]]", "[[B:compacted]]")), "네모 후보 1개"));
check("게이트 #6 두 후보 동일 반려",
  has(gateOf(GOOD
    .replace("[[C:protect|protecting]]", "[[C:protect|protect]]")
    .replace("(C) protect | protecting | i", "(C) protect | protect | i")), "변형되지 않음"));
check("게이트 #7 후보 금지 문자('/') 반려",
  has(gateOf(GOOD
    .replace("[[C:protect|protecting]]", "[[C:protect|protect/protecting]]")
    .replace("(C) protect | protecting | i", "(C) protect | protect/protecting | i")), "금지 문자"));
check("게이트 #10 포인트코드 중복 반려",
  has(gateOf(swap("(C) protect | protecting | i", "(C) protect | protecting | d")), "포인트코드 중복"));
check("게이트 #9 시제 단독 교체 반려",
  has(gateOf(GOOD.split("protecting").join("protected")), "시제 단독 교체"));
check("게이트 #13 선지 4개 반려",
  has(gateOf(swap("⑤ provide …… compacted …… protecting\n", "")), "선지 4개"));
check("게이트 #14 구분자 오사용(값 1개) 반려",
  has(gateOf(swap("① provides …… compacted …… protect", "① provides - compacted - protect")), "값 1개"));
check("게이트 #14 후보에 없는 제3의 값 반려",
  has(gateOf(swap("④ provides …… compacting", "④ provided …… compacting")), "두 후보 중 어느 쪽과도 다름"));
check("게이트 #15 조합 중복 반려",
  has(gateOf(swap("④ provides …… compacting …… protect", "④ provides …… compacted …… protect")), "동일한 조합이 중복"));
check("게이트 #16 전부-올바름 2개 반려",
  has(gateOf(swap("① provides …… compacted …… protect", "① provide …… compacted …… protect")), "전부 올바른 조합이 2개"));
check("게이트 #16 정답 라벨 오지정 반려",
  has(gateOf(swap("정답: ③", "정답: ①")), "전부-올바른 조합"));
check("게이트 #17 near-miss 부재 반려",
  has(gateOf(GOOD
    .replace("① provides …… compacted …… protect", "① provides …… compacting …… protecting")
    .replace("⑤ provide …… compacted …… protecting", "⑤ provides …… compacted …… protecting")), "near-miss"));
check("게이트 #17 틀린 후보 미사용 반려",
  has(gateOf(GOOD
    .replace("② provide …… compacting …… protecting", "② provide …… compacted …… protecting")
    .replace("④ provides …… compacting …… protect", "④ provides …… compacted …… protect")),
    "틀린 후보가 오답 선지에 한 번도"));
check("게이트 #18 오답해설 3개 반려",
  has(gateOf(swap("⑤ (C)의 protecting 은 widen, add 와 병렬을 이루지 못합니다.", "")), "오답해설 3개"));
check("게이트 #18 오답해설에 정답 라벨 포함 반려",
  has(gateMdCombo({ ...snapped.question, wrong: [...snapped.question.wrong, { label: "③", text: "끼어듦" }] },
    PASSAGE, OPT), "정답 라벨 포함"));
check("게이트 #18 해설 절단(마지막 라벨 뒤 내용 없음) 반려",
  has(gateMdCombo({ ...snapped.question, explanation: "(A)는 복수 동사가 옳습니다. (B)는 과거분사입니다. (C) " },
    PASSAGE, OPT), "해설이 슬롯 라벨에서 끊김"));

check("게이트 #18 오답해설 라벨 중복 + 누락 반려(개수는 4개라 상쇄돼 보임)",
  (() => {
    const issues = gateMdCombo({ ...snapped.question, wrong: [
      { label: "①", text: "가" }, { label: "①", text: "나" },
      { label: "②", text: "다" }, { label: "④", text: "라" }] }, PASSAGE, OPT);
    return has(issues, "오답해설 라벨 중복") && has(issues, "오답해설 없는 선지 ⑤") &&
      !has(issues, "오답해설 4개");
  })());
check("게이트 #18 오답해설 본문 절단('⑤ ' 라벨만) 반려",
  has(gateOf(swap("⑤ (C)의 protecting 은 widen, add 와 병렬을 이루지 못합니다.", "⑤ ")),
    "오답해설 본문 없음"));
check("게이트 #18 해설에 '정답:' 라인이 섞이면 반려(스포일러 회귀 봉인)",
  has(gateMdCombo({ ...snapped.question, explanation: "(A)는 복수입니다. (C)는 병렬입니다.\n정답: ③" },
    PASSAGE, OPT), "학생 표면에 정답 번호가 노출"));

// ───────────────────────────────────────────────────────────────────────────
// 2-B. fast error 급 승격 이식분 — 라우트가 validateQuestionQuality 를 차단하지
//      않으므로 이 게이트가 유일한 방벽이다(적대검수 26-07-26 · 재검증 26-07-26).
//      500줄 한도 때문에 _test-md-combo-fastparity.ts 로 분리했고, 여기서 전건을
//      그대로 돌린다 — 진입점은 이 파일 하나다.
// ───────────────────────────────────────────────────────────────────────────
runComboFastParityChecks(check, has);

// ───────────────────────────────────────────────────────────────────────────
// 3. 드리프트 관용 — 파서는 관대하게
// ───────────────────────────────────────────────────────────────────────────
check("파서 관용: 'A) x | y | (d) 수일치' 표기 흡수",
  gateOf(swap("(A) provide | provides | d", "A) provide | provides | (d) 수일치")).length === 0);
check("파서 관용: 구분자 공백·점 표기 드리프트 흡수",
  gateOf(swap("③ provide …… compacted …… protect", "③ provide……compacted ... protect")).length === 0);
check("파서 관용: '선지:' 헤더 누락 흡수", gateOf(swap("\n선지:\n", "\n")).length === 0);
check("파서 관용: 오답 목록에 정답 줄이 끼면 제거",
  parseMdCombo(swap("오답:\n", "오답:\n③ (정답)\n")).wrong.length === 4);
// 섹션 순서 드리프트(선지 → 해설 → 정답 → 오답). lookahead 가 `오답:` 하나였을 때는
// 해설이 '정답: ③' 라인을 통째로 흡수해 학생 표면에 정답 번호가 박힌 채 저장됐다.
{
  const ORDER_DRIFT = GOOD.replace("정답: ③\n해설: ", "해설: ").replace("\n오답:", "\n정답: ③\n오답:");
  const d = parseMdCombo(ORDER_DRIFT);
  check("파서 관용: 해설이 정답보다 앞서도 '정답:' 라인을 흡수하지 않음",
    !d.explanation.includes("정답:") && d.answer === "③" && d.explanation.endsWith("옳습니다."),
    d.explanation.slice(-40));
  check("파서 관용: 순서 드리프트 입력도 게이트 클린",
    gateOf(ORDER_DRIFT).length === 0, gateOf(ORDER_DRIFT).join(" / "));
}
// 오답해설 절단(`⑤ `)은 파서가 **버리지 않는다** — 버리면 게이트가 절단을 못 본다.
check("파서: 본문이 빈 오답해설 항목을 조용히 버리지 않음",
  parseMdCombo(swap("⑤ (C)의 protecting 은 widen, add 와 병렬을 이루지 못합니다.", "⑤ ")).wrong.length === 4);

// ───────────────────────────────────────────────────────────────────────────
// 4. 0원 스냅 보정
// ───────────────────────────────────────────────────────────────────────────
{
  const s = autoSnapComboSlots(
    parseMdCombo(swap("(B) compacted | compacting | c", "(B) compact | compacting | c")), PASSAGE);
  check("스냅 S1: 메타 올바른 표현을 마커 축자로 보정",
    s.corrections.length === 1 && s.question.slots[1].correct === "compacted", s.corrections.join(" / "));
  check("스냅 S1 후 게이트 클린", gateMdCombo(s.question, PASSAGE, OPT).length === 0);
}
{
  const s = autoSnapComboSlots(
    parseMdCombo(swap("(C) protect | protecting | i", "(C) protect | protects | i")), PASSAGE);
  check("스냅 S2: 메타 틀린 표현을 마커 축자로 보정(선지가 마커만 지지)",
    s.question.slots[2].wrong === "protecting" && s.corrections.some((c) => c.includes("(C)")),
    s.corrections.join(" / "));
}
{
  const s = autoSnapComboSlots(
    parseMdCombo(swap("① provides …… compacted", "① Provides …… compacted")), PASSAGE);
  check("스냅 S3: 선지 값 표기를 후보 정본으로 정규화",
    s.question.options[0].values[0] === "provides" && s.corrections.some((c) => c.includes("정규화")),
    s.corrections.join(" / "));
}
// 대소문자 전용 드리프트(표 셀 첫 글자 대문자화) — 조건이 cmp() 였을 때는 스냅이
// "같음"으로 보고 건너뛰었고, 대소문자에 민감한 게이트 #5 가 하드 반려했다.
{
  const s = autoSnapComboSlots(
    parseMdCombo(swap("(B) compacted | compacting | c", "(B) Compacted | compacting | c")), PASSAGE);
  check("스냅 S1: 대소문자 전용 드리프트도 마커 축자로 보정",
    s.question.slots[1].correct === "compacted" &&
    s.corrections.some((c) => c.includes("(B)")), s.corrections.join(" / "));
  check("스냅 S1(대소문자) 후 게이트 클린 — 재구성 불일치 하드 반려 회귀 봉인",
    gateMdCombo(s.question, PASSAGE, OPT).length === 0,
    gateMdCombo(s.question, PASSAGE, OPT).join(" / "));
}

// ───────────────────────────────────────────────────────────────────────────
// 5. 어댑터 → processGrammarChoiceCombo 왕복 → 검증기
// ───────────────────────────────────────────────────────────────────────────
const adapt = adaptMdComboToAiQuestion(snapped.question, PASSAGE, "KILLER");
check("어댑터: 성공", adapt.ok === true, adapt.error);
const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
{
  const slots = ai.slots as Array<Record<string, unknown>>;
  check("어댑터: slots 3개 · 라벨 (A)(B)(C) · 축자 후보",
    slots.length === 3 && slots.map((s) => s.label).join("") === "(A)(B)(C)" &&
    slots[1].correctExpression === "compacted" && slots[1].wrongExpression === "compacting");
  check("어댑터: surroundingText 가 원 지문에 포함",
    slots.every((s) => typeof s.surroundingText === "string" && s.surroundingText !== "" &&
      PASSAGE.includes(String(s.surroundingText))), String(slots[0].surroundingText));
  check("어댑터: pointCode 닫힌 집합 유지", slots.map((s) => s.pointCode).join("") === "dci");
  const opts = ai.options as Array<Record<string, unknown>>;
  check("어댑터: 선지 라벨 숫자 축('1'~'5') · slotValues 3개 · text ' - ' join",
    opts.length === 5 && opts.map((o) => o.label).join("") === "12345" &&
    (opts[2].slotValues as string[]).length === 3 &&
    opts[2].text === "provide - compacted - protect");
  check("어댑터: correctAnswer 숫자 문자열 '3'", ai.correctAnswer === "3", String(ai.correctAnswer));
  check("어댑터: wrongOptionExplanations 라벨이 선지 축과 동일",
    (ai.wrongOptionExplanations as Array<Record<string, unknown>>).map((w) => w.label).join(",") === "1,2,4,5");
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check("어댑터: 이물 필드 없음(passageWithMarkers·blanks·markedExpressions)",
    !("passageWithMarkers" in ai) && !("blanks" in ai) && !("markedExpressions" in ai) &&
    !("originalExpression" in ai));
  // 순수 매핑 규약 — 게이트가 반려할 절단 항목을 어댑터가 조용히 지우면 결함이
  // 무결성 검사를 통과한 것으로 기록된다(선지 하나가 해설 없이 저장).
  const truncated = adaptMdComboToAiQuestion(
    parseMdCombo(swap("⑤ (C)의 protecting 은 widen, add 와 병렬을 이루지 못합니다.", "⑤ ")),
    PASSAGE, "KILLER");
  check("어댑터: 빈 본문 오답해설을 조용히 버리지 않음(1:1 매핑)",
    (truncated.aiQuestion?.wrongOptionExplanations as unknown[]).length === 4,
    String((truncated.aiQuestion?.wrongOptionExplanations as unknown[])?.length));
}

const pp = postProcessQuestion("GRAMMAR_CHOICE_COMBO", PASSAGE, ai as never);
check("후처리: 성공", pp.success === true, pp.error);
const data = (pp.data ?? {}) as Record<string, unknown>;
{
  const pwm = String(data.passageWithMarkers ?? "");
  check("후처리: 네모 3개 렌더('(A) [x / y]')",
    (pwm.match(/\([A-C]\)\s*\[[^[\]]*\/[^[\]]*\]/g) ?? []).length === 3, pwm.slice(0, 120));
  check("후처리: 네모 밖 지문 무손상", pwm.includes("Urban canopies cool dense blocks"));
  check("후처리: correctAnswer '3' 유지", data.correctAnswer === "3", String(data.correctAnswer));
  check("후처리: 정답 오지정 경고 없음",
    !pp.warnings.some((w) => w.includes("did not point at")), pp.warnings.join(" / "));
  check("후처리: slotValues canonical · text 재조립",
    (data.options as Array<Record<string, unknown>>).every((o) => (o.slotValues as string[]).join(" - ") === o.text));
  check("후처리: 슬롯 라벨 지문 등장순 유지",
    (data.slots as Array<Record<string, unknown>>).map((s) => s.label).join("") === "(A)(B)(C)");
  check("후처리: wrongOptionExplanations Record 정규화(키 1·2·4·5)",
    Object.keys(data.wrongOptionExplanations as Record<string, unknown>).sort().join(",") === "1,2,4,5");
  const errors = validateQuestionQuality({
    typeId: "GRAMMAR_CHOICE_COMBO", question: data, passage: PASSAGE,
    requestedDifficulty: "KILLER", stemLanguage: "ko", optionLanguage: "ko",
  }).filter((i) => i.severity === "error");
  check("검증기: error 0", errors.length === 0, errors.map((e) => e.code).join(" / "));
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 셔플 상호작용 (정찰 R7) — COMBO 는 SHUFFLE_OPTION_TYPES 멤버다.
//    셔플이 slotValues 를 text 와 함께 옮기고 correctAnswer 를 재동기하는지.
// ───────────────────────────────────────────────────────────────────────────
{
  const baseline = (data.options as Array<Record<string, unknown>>).map((o) => o.text).join("|");
  let companionOk = true;
  let answerOk = true;
  let moved = false;
  for (let i = 0; i < 40; i += 1) {
    const shuffled = shuffleQuestionOptionsForDiversity(data, "GRAMMAR_CHOICE_COMBO");
    const opts = shuffled.options as Array<Record<string, unknown>>;
    if (opts.length !== 5) { companionOk = false; break; }
    if (opts.map((o) => o.text).join("|") !== baseline) moved = true;
    for (const o of opts) {
      if ((o.slotValues as string[]).join(" - ") !== o.text) companionOk = false;
    }
    const answerOption = opts.find((o) => o.label === shuffled.correctAnswer);
    if (!answerOption || (answerOption.slotValues as string[]).join("|") !== "provide|compacted|protect") {
      answerOk = false;
    }
  }
  check("셔플: slotValues 가 text 와 동행", companionOk);
  check("셔플: correctAnswer 가 전부-올바른 조합을 계속 가리킴", answerOk);
  check("셔플: 실제로 재배열이 일어남(40회 중 1회 이상)", moved);
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 레인 계약
// ───────────────────────────────────────────────────────────────────────────
const LANE = GRAMMAR_CHOICE_COMBO_MD_LANE;
function ctxOf(over: Partial<MdLaneContext> = {}): MdLaneContext {
  return {
    passage: PASSAGE, difficulty: "KILLER", rawDifficulty: "KILLER",
    resolved: { grammarPointFocus: true }, rawTypeSettings: null,
    teacherPoints: [], variantIndex: 0, variantCount: 1, ...over,
  };
}
check("레인: subType GRAMMAR_CHOICE_COMBO", LANE.subType === "GRAMMAR_CHOICE_COMBO");
check("레인: 과금 QUESTION_GEN_SINGLE(2크레딧) — fast getOperationType 과 동기",
  LANE.operationType === "QUESTION_GEN_SINGLE" && CREDIT_COSTS.QUESTION_GEN_SINGLE === 2,
  String(LANE.operationType));
check("레인: retryEligible", LANE.retryEligible === true);
check("레인: 적격성 — 노브 없음이면 true, 3 이외 개수 요청은 fast 폴백",
  LANE.isEligible({ grammarPointFocus: true }) && LANE.isEligible({ slotCount: 3 }) &&
  !LANE.isEligible({ slotCount: 4 }) && !LANE.isEligible({ comboSlotCount: 2 }));
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdComboPrompt(PASSAGE, "full", d, { slotCount: 3 });
  check(`프롬프트 ${d}: 난이도 분기 + 출력 형식 리터럴 + 지문 포함`,
    p.includes("네모지문:") && p.includes("[[A:올바른표현|틀린표현]]") && p.includes("…… ") &&
    p.includes("## 지문") && p.includes(PASSAGE.slice(0, 40)) &&
    (d === "KILLER" ? p.includes("KILLER 의 생명")
      : p.includes(d === "BASIC" ? "네모 설계 (기본 난이도)" : "네모 설계 (중급 난이도)")));
}
check("프롬프트: few-shot 은 BASIC 만 생략(정본 어법 빌더 선례)",
  !buildMdComboPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") &&
  buildMdComboPrompt(PASSAGE, "full", "INTERMEDIATE").includes("모범 설계 해부"));
check("프롬프트: answer-only 모드는 오답 섹션 미요구",
  !buildMdComboPrompt(PASSAGE, "answer-only", "KILLER").includes("\n오답:\n"));
// pointFocus 자기모순 봉인 — 주입 가이드가 (i)병렬을 정답에서 금지하는데 KILLER
// 분기가 (i)를 하드 포인트로 요구하면 모델이 둘 중 하나를 반드시 어긴다.
// fast hardPool(candidate-blocks/grammar.ts:1140)과 동일하게 i → d 로 치환한다.
{
  const on = buildMdComboPrompt(PASSAGE, "full", "KILLER", { pointFocus: true });
  const off = buildMdComboPrompt(PASSAGE, "full", "KILLER", { pointFocus: false });
  check("프롬프트: pointFocus=OFF 는 하드 포인트 {b,c,i}",
    off.includes("하드 포인트((b)관계사 · (c)분사 · (i)병렬)") && off.includes("- (C) 병렬(i)"));
  check("프롬프트: pointFocus=ON 은 하드 포인트 {b,c,d} + few-shot (C) 교체(fast hardPool 동형)",
    on.includes("하드 포인트((b)관계사 · (c)분사 · (d)수일치)") &&
    on.includes("- (C) 관계사(b)") && !on.includes("- (C) 병렬(i)"));
  check("프롬프트: pointFocus=ON 은 디코이 부재·우선순위를 명시(모순 해소)",
    on.includes("디코이 자리가 없으므로 세 네모 어디에도 쓰지 마라") &&
    !off.includes("핵심 집중 모드가 켜져 있다"));
  check("프롬프트: pointFocus 는 BASIC·INTERMEDIATE 도 우선순위 못을 받는다",
    (["BASIC", "INTERMEDIATE"] as const).every((d) =>
      buildMdComboPrompt(PASSAGE, "full", d, { pointFocus: true }).includes("핵심 집중 모드가 켜져 있다")));
  // ── 잔여 결함: few-shot·하드풀만 분기하고 산문 예시에 (i)병렬 약권유가 남아 있었다.
  //    pointFocus=ON 은 (i)병렬 전면 금지인데 같은 프롬프트가 "병렬을 써라"를 5곳에서
  //    권하면 모델이 금지·권유 중 하나를 반드시 어긴다(교사 지정 포인트와 경합).
  // ⚠ 니들은 코드 카탈로그(COMBO_MD_POINT_LIST)와 겹치지 않게 잡는다 — 카탈로그의
  //   "(i)병렬"은 포인트코드 닫힌 집합이라 pointFocus 와 무관하게 남아야 한다.
  const HARD_CAP_NUDGE = "하드 포인트((b)관계사 (c)분사 (i)병렬 (j)가정법)";
  const PARALLEL_NUDGES = [
    HARD_CAP_NUDGE,                  // 하드 포인트 상한 목록(BASIC·INTERMEDIATE)
    "절 경계 너머의 병렬 대상",       // KILLER 장거리 의존 예시
    "병렬 대상이 멀리 있는 등위구조", // '강한 자리' 목록
    "병렬 짝 오인",                  // 오인 축 예시
  ];
  check("프롬프트: pointFocus=ON 은 (i)병렬 약권유 문장을 한 줄도 남기지 않는다",
    (["BASIC", "INTERMEDIATE", "KILLER"] as const).every((d) => {
      const p = buildMdComboPrompt(PASSAGE, "full", d, { pointFocus: true });
      return PARALLEL_NUDGES.every((n) => !p.includes(n));
    }),
    (["BASIC", "INTERMEDIATE", "KILLER"] as const)
      .flatMap((d) => PARALLEL_NUDGES
        .filter((n) => buildMdComboPrompt(PASSAGE, "full", d, { pointFocus: true }).includes(n))
        .map((n) => `${d}:${n}`)).join(" / "));
  check("프롬프트: pointFocus=ON 도 금지 선언과 코드 카탈로그의 (i)병렬은 유지",
    on.includes("디코이 자리가 없으므로 세 네모 어디에도 쓰지 마라") && on.includes("(i)병렬"));
  // 치환 누락 방벽 — @@HARD@@/@@HARDCAP@@/@@LONGDEP@@ 가 그대로 새면 모델에게
  // 의미 없는 토큰이 지시로 나간다(난이도×pointFocus 6조합 전수).
  check("프롬프트: @@ 치환 자리표시자가 어느 조합에서도 남지 않는다",
    (["BASIC", "INTERMEDIATE", "KILLER"] as const).every((d) =>
      [true, false].every((f) => !buildMdComboPrompt(PASSAGE, "full", d, { pointFocus: f }).includes("@@"))));
  check("프롬프트: pointFocus=OFF 는 그 다섯 자리를 그대로 유지(무회귀)",
    PARALLEL_NUDGES.slice(1).every((n) => off.includes(n)) &&
    (["BASIC", "INTERMEDIATE"] as const).every((d) =>
      buildMdComboPrompt(PASSAGE, "full", d).includes(HARD_CAP_NUDGE)),
    PARALLEL_NUDGES.filter((n) => !off.includes(n)).join(" / "));
}
check("레인: buildBasePrompt 가 pointFocus 를 프롬프트에 전달",
  LANE.buildBasePrompt(ctxOf({ resolved: { grammarPointFocus: true } }))
    .includes("하드 포인트((b)관계사 · (c)분사 · (d)수일치)") &&
  LANE.buildBasePrompt(ctxOf({ resolved: {} }))
    .includes("하드 포인트((b)관계사 · (c)분사 · (i)병렬)"));
check("레인: buildExtras 에 포인트 가이드 포함",
  LANE.buildExtras(ctxOf()).some((e) => e.includes("어법 출제 포인트 가이드")));
check("레인: buildExtras 브리지가 디코이 부재·우선순위를 못 박음",
  LANE.buildExtras(ctxOf()).some((e) =>
    e.includes("디코이 자리가 없다") && e.includes("'네모 설계' 절을 따른다")));
check("레인: stemLanguage=en 이면 발문 언어 블록 + 영어 발문",
  LANE.buildExtras(ctxOf({ rawTypeSettings: { stemLanguage: "en" } })).some((e) => e.includes("질문 언어")) &&
  String((LANE.adapt({ question: snapped.question, gateIssues: [], corrections: [] },
    ctxOf({ rawTypeSettings: { stemLanguage: "en" } })).aiQuestion ?? {}).direction).startsWith("Which"));
check("레인: parseAndGate 위임 — 정상 입력 클린",
  LANE.parseAndGate(GOOD, ctxOf()).gateIssues.length === 0,
  LANE.parseAndGate(GOOD, ctxOf()).gateIssues.join(" / "));
check("레인: 교사 지정 포인트 미준수 반려 / 준수 통과",
  has(LANE.parseAndGate(GOOD, ctxOf({ teacherPoints: [{ text: "sapling", unit: "word" }] })).gateIssues,
    "교사 지정 표현이 네모에 없음") &&
  LANE.parseAndGate(GOOD, ctxOf({ teacherPoints: [{ text: "compacted", unit: "word" }] })).gateIssues.length === 0);
check("레인: qualityArgs = stemLanguage · optionLanguage",
  JSON.stringify(LANE.qualityArgs(ctxOf())) === JSON.stringify({ stemLanguage: "ko", optionLanguage: "ko" }),
  JSON.stringify(LANE.qualityArgs(ctxOf())));
check("레인: mdFormat 포렌식 메타",
  JSON.stringify(LANE.mdFormat(ctxOf())) === JSON.stringify({ slotCount: 3, optionCount: 5, pointFocus: true }),
  JSON.stringify(LANE.mdFormat(ctxOf())));
check("레인: diversityTargets = slots[].correctExpression",
  LANE.diversityTargets(data).join(",") === "provide,compacted,protect", LANE.diversityTargets(data).join(","));

// ───────────────────────────────────────────────────────────────────────────
// 7. 26-08-11 RCA 회귀 봉인 — 실장애 2계통(docs 메모리 combo-gate-rejection-rca).
//    ① 저장 지문 말미 마침표 누락(잡 cmshhwesl/cmshhphmd) → 재구성 관용 통과
//    ② 관용이 게이트를 끄지 않음(중간 편집·중간 구두점은 여전히 반려)
//    ③ 틀린 후보 지문 실존(잡 cmsony01r 'strict' 계통) → 누설 반려 불변
// ───────────────────────────────────────────────────────────────────────────
const PASSAGE_NO_PERIOD = PASSAGE.replace(/\.$/, "");
{
  const issues = gateMdCombo(snapped.question, PASSAGE_NO_PERIOD, OPT);
  check("RCA-B1 말미 마침표 누락 지문 → 재구성 관용으로 클린",
    issues.length === 0, issues.join(" / "));
}
check("RCA-B2 지문 중간 축자 편집은 여전히 반려",
  has(gateOf(swap("heavy construction", "big construction")), "지문 재구성 불일치"));
check("RCA-B3 지문 중간 구두점 삭제도 여전히 반려",
  has(gateOf(swap("blocks, yet", "blocks yet")), "지문 재구성 불일치"));
{
  // 오늘 실장애 동형: 틀린 후보(provides)가 지문 뒤 문장에 합법 표현으로 실존.
  const LEAK_TAIL = " The city provides the funds for this work.";
  const leakPassage = PASSAGE + LEAK_TAIL;
  const leakParsed = parseMdCombo(GOOD.replace(MARKED, MARKED + LEAK_TAIL));
  const leakIssues = gateMdCombo(
    autoSnapComboSlots(leakParsed, leakPassage).question, leakPassage, OPT);
  check("RCA-A1 틀린 후보 지문 실존 → 누설 반려 불변",
    has(leakIssues, "틀린 후보 'provides'"), leakIssues.join(" / "));
}

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
