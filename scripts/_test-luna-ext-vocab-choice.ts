// VOCAB_CHOICE luna 확장 픽스처 테스트 — SPEC §3 계약.
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-vocab-choice.ts
import { VOCAB_CHOICE_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/vocab-choice";
import { VOCAB_CHOICE_MD_LANE } from "../src/lib/md-qgen/lane-vocab";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import type { MdVocabQuestion } from "../src/lib/md-qgen/parser-vocab";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

// ── 픽스처 지문: 표적 5개(praised·mitigate·substantial·postpone·collapse)가
//    전부 지문에서 딱 1회씩 등장하도록 설계 ─────────────────────────────────────
const S1 = "Urban trees are praised for the shade they cast on hot streets.";
const S2 =
  "Because leafy canopies mitigate the heat of the pavement, planners in many cities line avenues with maples and oaks.";
const S3 =
  "Measurements show that shaded asphalt stays several degrees cooler than exposed asphalt through the afternoon.";
const S4 =
  "Yet this benefit carries a substantial cost that budget documents rarely mention, so councils often postpone new planting.";
const S5 =
  "When such expenses are ignored, tree programs expand in good years and collapse in the first lean season.";
const PASSAGE = [S1, S2, S3, S4, S5].join(" ");

// SOURCE_EXACT: 정답 (b)만 오용어(intensify), 나머지는 원문 그대로.
const MARKED = [
  S1.replace("praised", "[[a:praised]]"),
  S2.replace("mitigate", "[[b:intensify]]"),
  S3,
  S4.replace("substantial", "[[c:substantial]]").replace("postpone", "[[d:postpone]]"),
  S5.replace("collapse", "[[e:collapse]]"),
].join(" ");

const ctx: MdLaneContext = {
  passage: PASSAGE,
  difficulty: "KILLER",
  rawDifficulty: "KILLER",
  resolved: {},
  rawTypeSettings: null,
  teacherPoints: [],
  variantIndex: 0,
  variantCount: 1,
};
const ctxV: MdLaneContext = { ...ctx, resolved: { vocabChoiceSynonymVariants: true } };
const teacherPointsOf = (text: string) =>
  [{ text, unit: "WORD", tag: "", note: "" }] as unknown as MdLaneContext["teacherPoints"];

const GOOD = {
  markedPassage: MARKED,
  marks: [
    { label: "(a)", original: "praised", shown: "praised", code: "j" },
    { label: "(b)", original: "mitigate", shown: "intensify", code: "v" },
    { label: "(c)", original: "substantial", shown: "substantial", code: "j" },
    { label: "(d)", original: "postpone", shown: "postpone", code: "d" },
    { label: "(e)", original: "collapse", shown: "collapse", code: "v" },
  ],
  answers: ["(b)"],
  fixes: [{ label: "(b)", fix: "mitigate" }],
  explanation:
    "바로 다음 문장이 그늘진 아스팔트가 노출된 아스팔트보다 더 시원하게 유지된다는 측정 결과를 제시하므로, 수관이 포장의 열기를 강화한다는 (b)의 낱말은 인과 방향을 뒤집어 적절하지 않습니다. 이 자리에는 열기를 누그러뜨린다는 방향의 낱말이 와야 합니다.",
  wrong: [
    { label: "(a)", text: "가로수가 그늘 덕분에 칭송받는다는 도입 문장의 평가 극성과 일치하므로 적절합니다." },
    { label: "(c)", text: "예산 문서가 잘 언급하지 않는 상당한 비용이라는 서술이 뒤의 관리 지출 맥락과 맞아 적절합니다." },
    { label: "(d)", text: "비용 부담 때문에 새 식재를 미룬다는 인과 연결이 자연스러워 적절합니다." },
    { label: "(e)", text: "비용을 무시한 프로그램이 호황기에 팽창했다가 첫 긴축기에 무너진다는 대비가 문맥에 맞아 적절합니다." },
  ],
};

// 동의어 변장 모드: 5곳 전부 표시어가 원문과 다르다(비정답 4곳은 근접 동의어).
const MARKED_V = [
  S1.replace("praised", "[[a:lauded]]"),
  S2.replace("mitigate", "[[b:intensify]]"),
  S3,
  S4.replace("substantial", "[[c:considerable]]").replace("postpone", "[[d:delay]]"),
  S5.replace("collapse", "[[e:crumble]]"),
].join(" ");
const GOOD_V = {
  ...GOOD,
  markedPassage: MARKED_V,
  marks: [
    { label: "(a)", original: "praised", shown: "lauded", code: "j" },
    { label: "(b)", original: "mitigate", shown: "intensify", code: "v" },
    { label: "(c)", original: "substantial", shown: "considerable", code: "j" },
    { label: "(d)", original: "postpone", shown: "delay", code: "d" },
    { label: "(e)", original: "collapse", shown: "crumble", code: "v" },
  ],
};

// ── ① 정상 왕복(SOURCE_EXACT): 게이트 클린 → 레인 adapt ok → 평가 표면 ───────
{
  const parsed = VOCAB_CHOICE_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("코어스 무발동: 보정 0건", parsed.corrections.length === 0, parsed.corrections.join("; "));
  const adapt = VOCAB_CHOICE_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const ai = adapt.aiQuestion;
    const mws = ai.markedWords as Array<Record<string, unknown>>;
    check("어댑터: 발문 단일형·표시모드 SOURCE_EXACT",
      String(ai.direction).includes("적절하지 않은 것은") && ai.vocabDisplayMode === "SOURCE_EXACT",
      `${ai.direction} / ${ai.vocabDisplayMode}`);
    check("어댑터: 정답 (b)·betterWord=원문·비정답 betterWord 없음",
      ai.correctAnswer === "(b)" && mws[1].betterWord === "mitigate" &&
        mws[1].substituteWord === "intensify" && mws[0].betterWord === undefined,
      JSON.stringify({ correctAnswer: ai.correctAnswer, b: mws[1] }));
    check("어댑터: 선지 라벨 (a)~(e) 소문자 축",
      (ai.options as Array<{ label: string }>).map((o) => o.label).join("") === "(a)(b)(c)(d)(e)");
    check("어댑터: 오답해설 라벨 학생 표면 축(1,3,4,5)",
      (ai.wrongOptionExplanations as Array<{ label: string }>).map((w) => w.label).join(",") === "1,3,4,5",
      JSON.stringify(ai.wrongOptionExplanations));
    const surface = VOCAB_CHOICE_LUNA_EXT.renderEvalSurface(ai, PASSAGE);
    check("평가 표면: 발문+밑줄 번호 지문·정답 원단어 무노출",
      surface.includes("적절하지 않은 것은") && surface.includes("__① praised__") &&
        surface.includes("__② intensify__") && surface.includes("__⑤ collapse__") &&
        !surface.includes("mitigate") && surface.includes("Urban trees are"),
      surface.slice(0, 160));
    console.log("── 평가 표면 실물 ──\n" + surface + "\n──");
  }
}

// ── ② 동의어 변장 모드 왕복 ─────────────────────────────────────────────────
{
  const parsed = VOCAB_CHOICE_LUNA_EXT.parseAndGate(JSON.stringify(GOOD_V), ctxV);
  check("변장 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  const adapt = VOCAB_CHOICE_MD_LANE.adapt(parsed, ctxV);
  check("변장: adapt ok·SYNONYM_VARIANT",
    adapt.ok === true && adapt.aiQuestion?.vocabDisplayMode === "SYNONYM_VARIANT",
    adapt.error);
  if (adapt.aiQuestion) {
    const surface = VOCAB_CHOICE_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check("변장 표면: 원문 단어 전부 은닉·동의어 표시",
      surface.includes("__① lauded__") && surface.includes("__④ delay__") &&
        !surface.includes("praised") && !surface.includes("postpone"),
      surface.slice(0, 160));
  }
}

// ── ③ 코어스: 발동 케이스 ───────────────────────────────────────────────────
{
  // (i) 오답 라벨 정렬
  const shuffled = { ...GOOD, wrong: [GOOD.wrong[3], GOOD.wrong[0], GOOD.wrong[2], GOOD.wrong[1]] };
  const p1 = VOCAB_CHOICE_LUNA_EXT.parseAndGate(JSON.stringify(shuffled), ctx);
  check("코어스: 오답 라벨 정렬 발동((e)(a)(d)(c) → (a)(c)(d)(e))",
    (p1.question as MdVocabQuestion).wrong.map((w) => w.label).join("") === "(a)(c)(d)(e)" &&
      p1.gateIssues.length === 0,
    (p1.question as MdVocabQuestion).wrong.map((w) => w.label).join(""));

  // (ii) 라벨 등장순 재번호 — (a)↔(b) 맞바꾼 출력이 재번호로 살아난다.
  const relabeled = {
    ...GOOD,
    markedPassage: MARKED.replace("[[a:praised]]", "[[TMP:praised]]")
      .replace("[[b:intensify]]", "[[a:intensify]]")
      .replace("[[TMP:praised]]", "[[b:praised]]"),
    marks: [
      { label: "(b)", original: "praised", shown: "praised", code: "j" },
      { label: "(a)", original: "mitigate", shown: "intensify", code: "v" },
      ...GOOD.marks.slice(2),
    ],
    answers: ["(a)"],
    fixes: [{ label: "(a)", fix: "mitigate" }],
    wrong: [{ label: "(b)", text: GOOD.wrong[0].text }, ...GOOD.wrong.slice(1)],
  };
  const p2 = VOCAB_CHOICE_LUNA_EXT.parseAndGate(JSON.stringify(relabeled), ctx);
  const q2 = p2.question as MdVocabQuestion;
  check("코어스: 라벨 등장순 재번호 발동(answers·fixes·wrong 동기)",
    p2.corrections.some((c) => c.includes("재번호")) && q2.answers.join("") === "(b)" &&
      q2.fixes["(b)"] === "mitigate" && q2.wrong.map((w) => w.label).join("") === "(a)(c)(d)(e)" &&
      p2.gateIssues.length === 0,
    `corr=${p2.corrections.join("; ")} issues=${p2.gateIssues.join("; ")}`);

  // (iii) shown ↔ 마커 실물 동기화 — marks 가 마커와 다른 단어를 주장하면 마커가 이긴다.
  const drifted = {
    ...GOOD,
    marks: GOOD.marks.map((m, i) => (i === 1 ? { ...m, shown: "weaken" } : m)),
  };
  const p3 = VOCAB_CHOICE_LUNA_EXT.parseAndGate(JSON.stringify(drifted), ctx);
  check("코어스: 표시어 마커 동기화 발동(weaken → intensify)",
    p3.corrections.some((c) => c.includes("마커 실물")) &&
      (p3.question as MdVocabQuestion).marks[1].shown === "intensify" &&
      p3.gateIssues.length === 0,
    `corr=${p3.corrections.join("; ")} issues=${p3.gateIssues.join("; ")}`);

  // (iv) 고침 누락 → 레인 스냅이 원형으로 채운다(0원 결정형).
  const noFix = { ...GOOD, fixes: [] };
  const p4 = VOCAB_CHOICE_LUNA_EXT.parseAndGate(JSON.stringify(noFix), ctx);
  check("코어스: 고침 누락 채움 발동(레인 autoSnap 재사용)",
    p4.corrections.some((c) => c.includes("고침(b) 누락")) &&
      (p4.question as MdVocabQuestion).fixes["(b)"] === "mitigate" && p4.gateIssues.length === 0,
    `corr=${p4.corrections.join("; ")} issues=${p4.gateIssues.join("; ")}`);
}

// ── ④ 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  const gp = (fixture: unknown, c: MdLaneContext = ctx) =>
    VOCAB_CHOICE_LUNA_EXT.parseAndGate(JSON.stringify(fixture), c).gateIssues;

  check("음성테스트: 마커 밖 한 단어 무단 편집 → 재구성 불일치 반려",
    has(gp({ ...GOOD, markedPassage: MARKED.replace("ignored", "overlooked") }), "재구성 불일치"));

  check("음성테스트: 마커 4개 → 개수 반려",
    has(gp({ ...GOOD, markedPassage: MARKED.replace("[[e:collapse]]", "collapse") }), "4개"));

  // 정답 원형이 지문에 2회 등장 — 남은 지문이 정답을 흘린다.
  const dupTail = " Few doubt that trees mitigate summer heat.";
  const ctxDup = { ...ctx, passage: PASSAGE + dupTail };
  check("음성테스트: 정답 원형 2회 등장 → 자리 모호·누설 반려",
    has(gp({ ...GOOD, markedPassage: MARKED + dupTail }, ctxDup), "2회 등장"));

  // 대소문자만 다른 잔존(문두 대문자) — #10-b 승격 축.
  const caseTail = " Mitigate, some critics insist, was never the right verb.";
  const ctxCase = { ...ctx, passage: PASSAGE + caseTail };
  check("음성테스트: 정답 원단어 대소문자 잔존 → 역추론 누설 반려",
    has(gp({ ...GOOD, markedPassage: MARKED + caseTail }, ctxCase), "대소문자만 달리"));

  // 정답 자리가 오용어로 교체되지 않음(shown=original).
  const unchanged = {
    ...GOOD,
    markedPassage: MARKED.replace("[[b:intensify]]", "[[b:mitigate]]"),
    marks: GOOD.marks.map((m, i) => (i === 1 ? { ...m, shown: "mitigate" } : m)),
  };
  check("음성테스트: 정답 표시어=원형 → 미교체 반려", has(gp(unchanged), "교체되지 않음"));

  check("음성테스트: 고침이 원형과 다름 → 반려",
    has(gp({ ...GOOD, fixes: [{ label: "(b)", fix: "intensify" }] }), "과 다름"));

  // SOURCE_EXACT 인데 비정답을 동의어로 표시 — 스냅(마커=진실원)이 원형을 덮고
  // 게이트가 "지문 축자 아님"으로 반려한다(parser-vocab R2 문서화 동작).
  const exactDrift = {
    ...GOOD,
    markedPassage: MARKED.replace("[[c:substantial]]", "[[c:considerable]]"),
    marks: GOOD.marks.map((m, i) => (i === 2 ? { ...m, shown: "considerable" } : m)),
  };
  check("음성테스트: SOURCE_EXACT 비정답 변형 → 반려", has(gp(exactDrift), "축자로 없음"));

  // 변장 모드인데 비정답이 원문 그대로.
  const variantUnchanged = {
    ...GOOD_V,
    markedPassage: MARKED_V.replace("[[c:considerable]]", "[[c:substantial]]"),
    marks: GOOD_V.marks.map((m, i) => (i === 2 ? { ...m, shown: "substantial" } : m)),
  };
  check("음성테스트: 변장 모드 비정답 원문 그대로 → 반려",
    has(gp(variantUnchanged, ctxV), "원문 그대로"));

  check("음성테스트: 판단축 코드 닫힌 집합 밖(x) → 반려",
    has(gp({ ...GOOD, marks: GOOD.marks.map((m, i) => (i === 0 ? { ...m, code: "x" } : m)) }), "닫힌 집합"));

  const answerInWrong = {
    ...GOOD,
    wrong: [{ label: "(b)", text: "정답 라벨이 오답 목록에." }, ...GOOD.wrong.slice(1)],
  };
  check("음성테스트: 오답 목록에 정답 라벨 → 반려", has(gp(answerInWrong), "정답 라벨"));

  const parseFail = VOCAB_CHOICE_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)",
    parseFail.question === null && has(parseFail.gateIssues, "파싱 실패"));
}

// ── ⑤ 구동사 seam 음성테스트 — 머리만 치환해 particle 잔류(#17 승격 게이트) ──
{
  const T1 = "Careful editors review every dataset before publication.";
  const T2 =
    "They were leaving out the extreme values, because a single outlier can distort the average.";
  const T3 = "Readers who trust the summary rarely ask what was removed.";
  const T4 = "Over time, this quiet filtering shapes which findings survive.";
  const T5 = "The habit protects clarity, but it can also conceal inconvenient evidence.";
  const PASSAGE_SEAM = [T1, T2, T3, T4, T5].join(" ");
  const MARKED_SEAM = [
    T1.replace("review", "[[a:review]]"),
    T2.replace("leaving", "[[b:including]]").replace("distort", "[[c:distort]]"),
    T3,
    T4.replace("filtering", "[[d:filtering]]"),
    T5.replace("conceal", "[[e:conceal]]"),
  ].join(" ");
  const seamFixture = {
    markedPassage: MARKED_SEAM,
    marks: [
      { label: "(a)", original: "review", shown: "review", code: "c" },
      { label: "(b)", original: "leaving", shown: "including", code: "v" },
      { label: "(c)", original: "distort", shown: "distort", code: "v" },
      { label: "(d)", original: "filtering", shown: "filtering", code: "n" },
      { label: "(e)", original: "conceal", shown: "conceal", code: "v" },
    ],
    answers: ["(b)"],
    fixes: [{ label: "(b)", fix: "leaving" }],
    explanation:
      "극단값을 일부러 빼놓았다는 문맥이므로 포함한다는 방향의 (b)는 적절하지 않습니다.",
    wrong: [
      { label: "(a)", text: "자료를 검토한다는 서술이 문맥에 맞아 적절합니다." },
      { label: "(c)", text: "이상치 하나가 평균을 왜곡할 수 있다는 서술이 적절합니다." },
      { label: "(d)", text: "조용한 걸러내기라는 지시가 앞 내용과 맞아 적절합니다." },
      { label: "(e)", text: "불리한 증거를 감출 수 있다는 경고가 문맥에 맞아 적절합니다." },
    ],
  };
  const ctxSeam = { ...ctx, passage: PASSAGE_SEAM };
  const issues = VOCAB_CHOICE_LUNA_EXT.parseAndGate(JSON.stringify(seamFixture), ctxSeam).gateIssues;
  check("음성테스트: 구동사 머리만 치환(leaving out→including out) → seam 반려",
    has(issues, "구동사") && issues.length === 1,
    issues.join("; "));
}

// ── ⑥ 교사 지정 준수(레인 parseAndGate 동형) ────────────────────────────────
{
  const hit = VOCAB_CHOICE_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), {
    ...ctx,
    teacherPoints: teacherPointsOf("mitigate"),
  });
  check("교사 지정 준수: 지정 단어가 밑줄 원형에 있음 → 클린",
    hit.gateIssues.length === 0, hit.gateIssues.join("; "));
  const miss = VOCAB_CHOICE_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), {
    ...ctx,
    teacherPoints: teacherPointsOf("canopies"),
  });
  check("교사 지정 미준수: 지정 단어가 밑줄에 없음 → 반려",
    has(miss.gateIssues, "교사 지정 표현"));
}

// ── ⑦ 브릿지: 청크 분단·JSON 구문 무노출·marks(정답 열쇠) 침묵 ───────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(VOCAB_CHOICE_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(`브릿지(청크 ${chunk}): 섹션 라벨·본문 방류 + JSON 무노출 + marks 침묵`,
      out.includes("밑줄지문:\nUrban trees are [[a:praised]]") &&
        out.includes("[[b:intensify]]") &&
        out.includes("\n정답: (b)") &&
        out.includes("\n고침(b): mitigate") &&
        out.includes("\n해설: ") &&
        out.includes("\n(a) ") &&
        // marks 배열이 침묵하면 원형 'mitigate' 는 고침 한 곳에서만 나온다.
        (out.match(/mitigate/g) ?? []).length === 1 &&
        !out.includes("{") &&
        !out.includes('"label"'),
      out.slice(0, 200));
  }
}

// ── ⑧ 동적 스키마·검산 블록 ─────────────────────────────────────────────────
{
  const spec = VOCAB_CHOICE_LUNA_EXT.buildJsonSchema(ctx);
  const schema = spec.schema as Record<string, any>;
  check("동적 스키마(기본 5·1): strict·형상·enum",
    spec.strict === true &&
      spec.name === "vocab_choice_item" &&
      JSON.stringify(schema.required) ===
        JSON.stringify(["markedPassage", "marks", "answers", "fixes", "explanation", "wrong"]) &&
      schema.properties.marks.minItems === 5 &&
      schema.properties.answers.minItems === 1 &&
      schema.properties.fixes.minItems === 1 &&
      schema.properties.wrong.minItems === 4 &&
      schema.properties.marks.items.properties.label.enum.join("") === "(a)(b)(c)(d)(e)" &&
      schema.properties.marks.items.properties.code.enum.join("") === "nvjdc",
    JSON.stringify(schema.required));
  const ctx72: MdLaneContext = {
    ...ctx,
    resolved: { vocabChoiceMarkerCount: 7, vocabChoiceAnswerCount: 2 },
  };
  const schema72 = VOCAB_CHOICE_LUNA_EXT.buildJsonSchema(ctx72).schema as Record<string, any>;
  check("동적 스키마(7·2): 마커 7·정답 2·오답 5·라벨 (g)까지",
    schema72.properties.marks.minItems === 7 &&
      schema72.properties.answers.minItems === 2 &&
      schema72.properties.answers.maxItems === 2 &&
      schema72.properties.fixes.minItems === 2 &&
      schema72.properties.wrong.minItems === 5 &&
      schema72.properties.marks.items.properties.label.enum.length === 7 &&
      schema72.properties.marks.items.properties.label.enum[6] === "(g)");
  const sc = VOCAB_CHOICE_LUNA_EXT.buildSelfcheck(ctx);
  const sc72 = VOCAB_CHOICE_LUNA_EXT.buildSelfcheck(ctx72);
  const scV = VOCAB_CHOICE_LUNA_EXT.buildSelfcheck(ctxV);
  check("검산 블록: 사다리+설정 실값 반영",
    sc.includes("1순위") && sc.includes("정확히 1개") &&
      sc72.includes("정확히 2개") && sc72.includes("(g)") &&
      sc72.includes("서로 다른 문장에 두고 서로 다른 판단축"));
  check("검산 블록: 변장 섹션은 설정 켤 때만",
    scV.includes("변장") && !sc.includes("변장") &&
      sc.includes("변형된 자리 집합이 정확히 일치") && !scV.includes("변형된 자리 집합"));
  check("변장 스키마: markedPassage 설명이 동의어 계약으로 전환",
    String((VOCAB_CHOICE_LUNA_EXT.buildJsonSchema(ctxV).schema as any).properties.markedPassage.description).includes("동의어"));
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
