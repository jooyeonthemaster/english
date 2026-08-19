// luna 문제생성 레인 0원 결정론 픽스처 테스트 (26-08-14, O217 시공 검증).
// ① JSON→md 점진 렌더 브릿지(청크 분단·이스케이프·필드 침묵) ② 라벨 등장순 재번호
// ③ 마커 자동삽입 코어스 ④ 파서 마커 존재 게이트(신설 — 음성테스트 포함)
// ⑤ luna 어댑터 → 기존 스냅·게이트 왕복 ⑥ 적격성 판정.
// 실행: npx tsx scripts/_test-luna-lane.ts
import {
  LunaJsonMdBridge,
  LUNA_BLANK_BRIDGE_SPECS,
  LUNA_GRAMMAR_BRIDGE_SPECS,
} from "../src/lib/md-qgen/luna-stream-bridge";
import {
  adaptLunaBlankJson,
  adaptLunaGrammarJson,
  ensureGrammarMarkersPresent,
  isLunaQgenEligible,
  renumberGrammarByAppearance,
} from "../src/lib/md-qgen/luna-lane";
import {
  autoSnapGrammarMarks,
  gateMdQuestion,
  type MdGrammarQuestion,
} from "../src/lib/md-qgen/parser";
import { contextAroundUnique } from "../src/lib/md-qgen/adapter";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

// ── 공용 픽스처 ──────────────────────────────────────────────────────────────
const PASSAGE =
  "The scientist that studies climate patterns has found that rising temperatures " +
  'affect "coastal" ecosystems. Researchers who analyze the data believe that ' +
  "immediate action is required. The evidence they collected suggests that policy " +
  "makers should act now before the window of opportunity closes forever.";

// 밑줄 5곳은 인접 게이트(사이 3단어 미만 반려)를 지키도록 분산 배치한다.
const GRAMMAR_JSON = {
  markedPassage: PASSAGE.replace("studies", "[[A:studies]]")
    .replace("affect", "[[B:affect]]")
    .replace("who", "[[C:who]]")
    .replace("believe", "[[D:believes]]")
    .replace("should act", "[[E:should act]]"),
  marks: [
    { label: "(A)", shown: "studies", original: "studies", code: "a" },
    { label: "(B)", shown: "affect", original: "affect", code: "a" },
    { label: "(C)", shown: "who", original: "who", code: "g" },
    { label: "(D)", shown: "believes", original: "believe", code: "a" },
    { label: "(E)", shown: "should act", original: "should act", code: "b" },
  ],
  answer: "(D)",
  fix: "believe",
  explanation: '주어 "Researchers"는 복수이므로 "believe"가 옳다.',
  wrong: [
    { label: "(A)", text: "단수 주어와 수일치한다." },
    { label: "(B)", text: "복수 주어와 수일치한다." },
    { label: "(C)", text: "선행사를 받는 주격 관계대명사로 옳다." },
    { label: "(E)", text: "조동사+원형으로 옳다." },
  ],
};

// ── ① 브릿지: 청크 분단 스트리밍 → md 동형 텍스트 ────────────────────────────
{
  const json = JSON.stringify(GRAMMAR_JSON);
  for (const chunkSize of [1, 3, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(LUNA_GRAMMAR_BRIDGE_SPECS, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunkSize) bridge.push(json.slice(i, i + chunkSize));
    check(
      `브릿지 어법(청크 ${chunkSize}): 지문 방류`,
      out.includes("[[A:studies]]") && out.includes("window of opportunity closes"),
      out.slice(0, 120),
    );
    check(
      `브릿지 어법(청크 ${chunkSize}): 섹션 라벨`,
      out.includes("\n정답: (D)") && out.includes("\n고침: believe") && out.includes("\n해설: "),
    );
    check(
      `브릿지 어법(청크 ${chunkSize}): marks 침묵 + JSON 구문 무노출`,
      !out.includes('"label"') && !out.includes("{") && !out.includes('\\"'),
      out,
    );
    check(
      `브릿지 어법(청크 ${chunkSize}): 오답 라벨 나열`,
      out.includes("\n(A) 단수 주어와") && out.includes("\n(E) 조동사+원형"),
    );
    // 이스케이프 복원 — 지문의 큰따옴표("coastal")가 원문 그대로.
    check(`브릿지 어법(청크 ${chunkSize}): 따옴표 unescape`, out.includes('"coastal"'));
  }
  // \uXXXX 이스케이프(한글) — JSON.stringify 는 한글을 이스케이프하지 않으므로 강제 케이스.
  let out = "";
  const bridge = new LunaJsonMdBridge(LUNA_GRAMMAR_BRIDGE_SPECS, (d) => (out += d));
  const forced = '{"markedPassage":"\\ud55c\\uae00 \\u00e9"}';
  for (const ch of forced) bridge.push(ch);
  check("브릿지: \\uXXXX 복원(1char 청크)", out.includes("한글 é"), out);
}

// ── ① 브릿지: 빈칸 스펙 ──────────────────────────────────────────────────────
{
  const blankJson = {
    originalExpression: "immediate action is required",
    options: [
      { label: "①", text: "urgent measures must follow" },
      { label: "②", text: "data must be re-analyzed" },
      { label: "③", text: "warming is a natural cycle" },
      { label: "④", text: "policy is already sufficient" },
      { label: "⑤", text: "evidence remains inconclusive" },
    ],
    answer: "①",
    explanation: "즉각적 조치 필요성이 핵심 논지다.",
    wrong: [
      { label: "②", text: "재분석 요구는 논지가 아니다." },
      { label: "③", text: "자연 주기설은 반대 논지다." },
      { label: "④", text: "충분하다는 근거가 없다." },
      { label: "⑤", text: "증거는 결정적이라고 서술된다." },
    ],
  };
  let out = "";
  const bridge = new LunaJsonMdBridge(LUNA_BLANK_BRIDGE_SPECS, (d) => (out += d));
  const json = JSON.stringify(blankJson);
  for (let i = 0; i < json.length; i += 5) bridge.push(json.slice(i, i + 5));
  check(
    "브릿지 빈칸: 섹션·선지·정답",
    out.startsWith("빈칸원문: immediate action is required") &&
      out.includes("\n① urgent measures") &&
      out.includes("\n\n정답: ①") &&
      out.includes("\n해설: "),
    out.slice(0, 200),
  );
}

// ── ② 라벨 등장순 재번호 ─────────────────────────────────────────────────────
{
  // (A)와 (D)의 라벨이 등장순과 뒤집힌 픽스처.
  const swapped = JSON.parse(JSON.stringify(GRAMMAR_JSON));
  swapped.markedPassage = PASSAGE.replace("studies", "[[D:studies]]")
    .replace("affect", "[[B:affect]]")
    .replace("who", "[[C:who]]")
    .replace("believe", "[[A:believes]]")
    .replace("should act", "[[E:should act]]");
  swapped.marks = [
    { label: "(D)", shown: "studies", original: "studies", code: "a" },
    { label: "(B)", shown: "affect", original: "affect", code: "a" },
    { label: "(C)", shown: "who", original: "who", code: "g" },
    { label: "(A)", shown: "believes", original: "believe", code: "a" },
    { label: "(E)", shown: "should act", original: "should act", code: "b" },
  ];
  swapped.answer = "(A)";
  swapped.wrong = [
    { label: "(D)", text: "단수 주어와 수일치한다." },
    { label: "(B)", text: "복수 주어와 수일치한다." },
    { label: "(C)", text: "선행사를 받는 주격 관계대명사로 옳다." },
    { label: "(E)", text: "조동사+원형으로 옳다." },
  ];
  const adapted = adaptLunaGrammarJson(JSON.stringify(swapped));
  const q = adapted.question;
  check("재번호: 발동", adapted.renumbered);
  check(
    "재번호: 등장순 A→E",
    q.markedPassage!.indexOf("[[A:") < q.markedPassage!.indexOf("[[B:") &&
      q.markedPassage!.indexOf("[[B:") < q.markedPassage!.indexOf("[[C:") &&
      q.markedPassage!.indexOf("[[C:") < q.markedPassage!.indexOf("[[D:") &&
      q.markedPassage!.indexOf("[[D:") < q.markedPassage!.indexOf("[[E:"),
  );
  check("재번호: 정답 라벨 동기", q.answer === "(D)" && q.fixes["(D)"] === "believe");
  check(
    "재번호: 게이트 왕복 클린",
    gateMdQuestion(autoSnapGrammarMarks(q, PASSAGE).question, PASSAGE).length === 0,
    JSON.stringify(gateMdQuestion(q, PASSAGE)),
  );
}

// ── ③ 마커 자동삽입 + ④ 신설 게이트(음성테스트) ─────────────────────────────
{
  // (C) 마커를 본문에서 제거(비정답) — O217 실사 G25 계통 재현.
  const dropped = JSON.parse(JSON.stringify(GRAMMAR_JSON));
  dropped.markedPassage = String(dropped.markedPassage).replace("[[C:who]]", "who");
  // ④ 게이트 음성테스트: 코어스 없이 게이트만 태우면 반드시 울려야 한다.
  const rawQ: MdGrammarQuestion = {
    kind: "grammar",
    marks: dropped.marks.map((m: any) => ({ ...m })),
    markedPassage: dropped.markedPassage,
    answer: dropped.answer,
    answers: [dropped.answer],
    fix: dropped.fix,
    fixes: { [dropped.answer]: dropped.fix },
    explanation: dropped.explanation,
    wrong: dropped.wrong,
  };
  check(
    "신설 게이트: 마커 누락이 울린다(음성테스트)",
    has(gateMdQuestion(rawQ, PASSAGE), "마커가 지문 사본"),
    JSON.stringify(gateMdQuestion(rawQ, PASSAGE)),
  );
  // ③ 코어스 경유(프로덕션 luna 경로)면 자동삽입으로 클린.
  const adapted = adaptLunaGrammarJson(JSON.stringify(dropped));
  check("마커 자동삽입: (C) 복원", adapted.markerInserted.includes("(C)"), JSON.stringify(adapted.markerInserted));
  check(
    "마커 자동삽입: 게이트 왕복 클린",
    adapted.issues.length === 0 &&
      gateMdQuestion(autoSnapGrammarMarks(adapted.question, PASSAGE).question, PASSAGE).length === 0,
    JSON.stringify([adapted.issues, gateMdQuestion(adapted.question, PASSAGE)]),
  );
  // 정답 마커 누락은 자동수리 금지 — 이슈로 반려(재생성 유도).
  const droppedAnswer = JSON.parse(JSON.stringify(GRAMMAR_JSON));
  droppedAnswer.markedPassage = String(droppedAnswer.markedPassage).replace(
    "[[D:believes]]",
    "believes",
  );
  const adaptedAnswer = adaptLunaGrammarJson(JSON.stringify(droppedAnswer));
  check(
    "마커 자동삽입: 정답 밑줄은 수리 불가 → 이슈",
    has(adaptedAnswer.issues, "자동수리 불가"),
    JSON.stringify(adaptedAnswer.issues),
  );
}

// ── ③-b 밑줄 인접 게이트 (26-08-14 실사용 신고 "learns to prefer" 계통) ──────
{
  // (D)[believes] (E)[that] — 한 구를 쪼갠 인접 밑줄(사이 0단어).
  const adjacent = JSON.parse(JSON.stringify(GRAMMAR_JSON));
  adjacent.markedPassage = PASSAGE.replace("studies", "[[A:studies]]")
    .replace("affect", "[[B:affect]]")
    .replace("who", "[[C:who]]")
    .replace("believe that", "[[D:believes]] [[E:that]]");
  adjacent.marks = [
    { label: "(A)", shown: "studies", original: "studies", code: "a" },
    { label: "(B)", shown: "affect", original: "affect", code: "a" },
    { label: "(C)", shown: "who", original: "who", code: "g" },
    { label: "(D)", shown: "believes", original: "believe", code: "a" },
    { label: "(E)", shown: "that", original: "that", code: "g" },
  ];
  const adapted = adaptLunaGrammarJson(JSON.stringify(adjacent));
  const issues = gateMdQuestion(
    autoSnapGrammarMarks(adapted.question, PASSAGE).question,
    PASSAGE,
  );
  check("인접 게이트: 붙은 밑줄이 울린다(음성테스트)", has(issues, "인접"), JSON.stringify(issues));
  // 분산 배치 정본은 인접 이슈가 없어야 한다.
  const clean = adaptLunaGrammarJson(JSON.stringify(GRAMMAR_JSON));
  check(
    "인접 게이트: 분산 배치는 침묵",
    !has(
      gateMdQuestion(autoSnapGrammarMarks(clean.question, PASSAGE).question, PASSAGE),
      "인접",
    ),
  );
}

// ── ③-b2 밑줄 span 게이트 (26-08-14 실사용 신고 2호 "trying to solve" 계통) ──
{
  // (E)를 3단어 구로 확장 — 반려돼야 한다.
  const wide = JSON.parse(JSON.stringify(GRAMMAR_JSON));
  wide.markedPassage = PASSAGE.replace("studies", "[[A:studies]]")
    .replace("affect", "[[B:affect]]")
    .replace("who", "[[C:who]]")
    .replace("believe", "[[D:believes]]")
    .replace("should act now", "[[E:should act now]]");
  wide.marks = wide.marks.map((m: any) =>
    m.label === "(E)" ? { ...m, shown: "should act now", original: "should act now" } : m,
  );
  const adapted = adaptLunaGrammarJson(JSON.stringify(wide));
  const issues = gateMdQuestion(
    autoSnapGrammarMarks(adapted.question, PASSAGE).question,
    PASSAGE,
  );
  check("span 게이트: 3단어 구가 울린다(음성테스트)", has(issues, "구·절"), JSON.stringify(issues));
  // 2단어(should act) 정본은 침묵해야 한다.
  const clean = adaptLunaGrammarJson(JSON.stringify(GRAMMAR_JSON));
  check(
    "span 게이트: 1~2단어는 침묵",
    !has(
      gateMdQuestion(autoSnapGrammarMarks(clean.question, PASSAGE).question, PASSAGE),
      "구·절",
    ),
  );
}

// ── ③-c 오답 해설 라벨 정렬 (표시 결정론) ────────────────────────────────────
{
  const shuffledWrong = JSON.parse(JSON.stringify(GRAMMAR_JSON));
  shuffledWrong.wrong = [
    { label: "(E)", text: "조동사+원형으로 옳다." },
    { label: "(B)", text: "복수 주어와 수일치한다." },
    { label: "(A)", text: "단수 주어와 수일치한다." },
    { label: "(C)", text: "선행사를 받는 주격 관계대명사로 옳다." },
  ];
  const adapted = adaptLunaGrammarJson(JSON.stringify(shuffledWrong));
  check(
    "오답 정렬: 어법 (A)→(E)",
    adapted.question.wrong.map((w) => w.label).join("") === "(A)(B)(C)(E)",
    adapted.question.wrong.map((w) => w.label).join(""),
  );
}

// ── ⑤ 빈칸 어댑터 왕복 ──────────────────────────────────────────────────────
{
  const blankJson = {
    originalExpression: "immediate action is required",
    options: [
      { label: "①", text: "urgent measures must follow" },
      { label: "②", text: "data must be re-analyzed" },
      { label: "③", text: "warming is a natural cycle" },
      { label: "④", text: "policy is already sufficient" },
      { label: "⑤", text: "evidence remains inconclusive" },
    ],
    answer: "①",
    explanation: "즉각적 조치 필요성이 핵심 논지다.",
    wrong: [
      { label: "⑤", text: "증거는 결정적이라고 서술된다." },
      { label: "③", text: "자연 주기설은 반대 논지다." },
      { label: "④", text: "충분하다는 근거가 없다." },
      { label: "②", text: "재분석 요구는 논지가 아니다." },
    ],
  };
  const { question } = adaptLunaBlankJson(JSON.stringify(blankJson));
  check("빈칸 어댑터: 게이트 클린", gateMdQuestion(question, PASSAGE).length === 0);
  check(
    "오답 정렬: 빈칸 ②→⑤ (실사용 ⑤③④② 신고 재현)",
    question.wrong.map((w) => w.label).join("") === "②③④⑤",
    question.wrong.map((w) => w.label).join(""),
  );
  const broken = { ...blankJson, originalExpression: "The greater the investment, [빈칸]." };
  const { question: bq } = adaptLunaBlankJson(JSON.stringify(broken));
  check(
    "빈칸 어댑터: 비축자 빈칸원문은 게이트가 반려",
    has(gateMdQuestion(bq, PASSAGE), "축자"),
  );
}

// ── ⑥ 적격성 ────────────────────────────────────────────────────────────────
// 26-08-19 전 라인업 3.7 통일(O226): luna 레인은 옵트인(QGEN_LUNA_LANE=on).
// 적격성 판정 자체는 보존돼야 하므로 on 상태에서 검증하고, 기본(미설정) 상태의
// 전면 비활성도 별도 검증한다.
{
  const base = { blankCount: 1, markerCount: 5, answerCount: 1, hasMdLane: false };
  check(
    "기본(미설정): luna 전면 비활성",
    !isLunaQgenEligible({ ...base, subType: "GRAMMAR_ERROR" }),
  );
  process.env.QGEN_LUNA_LANE = "on";
  check("적격: 단일 빈칸", isLunaQgenEligible({ ...base, subType: "BLANK_INFERENCE" }));
  check("적격: 어법 5·1", isLunaQgenEligible({ ...base, subType: "GRAMMAR_ERROR" }));
  // 26-08-14 캠페인 확장: 다중 빈칸(2~3)·어법 비표준(5~10마커)도 luna 적격.
  check(
    "적격(확장): 다중 빈칸 2",
    isLunaQgenEligible({ ...base, subType: "BLANK_INFERENCE", blankCount: 2 }),
  );
  check(
    "적격(확장): 어법 7마커",
    isLunaQgenEligible({ ...base, subType: "GRAMMAR_ERROR", markerCount: 7 }),
  );
  check(
    "부적격: 빈칸 4개(범위 밖)",
    !isLunaQgenEligible({ ...base, subType: "BLANK_INFERENCE", blankCount: 4 }),
  );
  check(
    "부적격: 어법 11마커(범위 밖)",
    !isLunaQgenEligible({ ...base, subType: "GRAMMAR_ERROR", markerCount: 11 }),
  );
  check(
    "부적격: 신형 레인 유형",
    !isLunaQgenEligible({ ...base, subType: "ANTONYM", hasMdLane: true }),
  );
  process.env.QGEN_LUNA_LANE = "off";
  check(
    "킬스위치: QGEN_LUNA_LANE=off",
    !isLunaQgenEligible({ ...base, subType: "GRAMMAR_ERROR" }),
  );
  delete process.env.QGEN_LUNA_LANE;
}

// contextAroundUnique(26-08-19 O226): 같은 표면형이 왼쪽 문맥에 있으면 창 시작을
// 민다 — 34번 "that smell that" 마커 이동(양팔 F)의 결정형 봉합.
{
  const p = "You know that smell that hangs in the air after you've mowed the lawn? Yeah, that's actually an SOS.";
  const idx = p.indexOf("that", p.indexOf("smell")); // 두 번째 that(관계사)
  const win = contextAroundUnique(p, idx, 4);
  const firstThat = win.indexOf("that");
  check(
    "창 내 첫 that = 표적(왼쪽 중복 제거)",
    firstThat >= 0 && win.slice(firstThat).startsWith("that hangs"),
    JSON.stringify(win),
  );
  // 중복이 없으면 기존 contextAround 와 동일 동작(좌우 문맥 유지)
  const idx2 = p.indexOf("hangs");
  const win2 = contextAroundUnique(p, idx2, 5);
  check("중복 없으면 좌우 문맥 유지", win2.includes("smell") && win2.includes("hangs"), win2);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
