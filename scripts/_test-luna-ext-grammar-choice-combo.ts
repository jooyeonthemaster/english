// GRAMMAR_CHOICE_COMBO(네모 어법) luna 확장 픽스처 테스트 — SPEC §3 계약.
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-grammar-choice-combo.ts
import { GRAMMAR_CHOICE_COMBO_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/grammar-choice-combo";
import { GRAMMAR_CHOICE_COMBO_MD_LANE } from "../src/lib/md-qgen/lane-combo";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import type { MdComboQuestion } from "../src/lib/md-qgen/parser-combo";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

// 표적 3종(서로 다른 문장·서로 다른 포인트·누설 없음·시제/수량/지각동사 시비 없음):
//  (A) 수일치(d) provide|provides — 관계사절 복수 주어 urban trees
//  (B) 분사(c) compacted|compacting — by 행위자구가 뒤따르는 수동 분사
//  (C) 관계사(b) where|which — 뒤에 완전한 절(누설 면제 기능어라 연어·패턴 축만 유효)
const PASSAGE =
  "The benefits that urban trees provide to crowded districts depend on the volume of soil beneath the pavement. " +
  "Soil compacted by construction traffic holds far less moisture than loose ground, so a street tree planted in a narrow pit rarely reaches maturity. " +
  "For that reason, planners now dig wider trenches, where young roots can spread and absorb the moisture they need.";

const MARKED = PASSAGE.replace("provide", "[[A:provide|provides]]")
  .replace("compacted", "[[B:compacted|compacting]]")
  .replace("where", "[[C:where|which]]");

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

const GOOD = {
  markedPassage: MARKED,
  slots: [
    { label: "(A)", correct: "provide", wrong: "provides", code: "d" },
    { label: "(B)", correct: "compacted", wrong: "compacting", code: "c" },
    { label: "(C)", correct: "where", wrong: "which", code: "b" },
  ],
  options: [
    { label: "①", values: ["provides", "compacted", "where"] },
    { label: "②", values: ["provide", "compacting", "which"] },
    { label: "③", values: ["provide", "compacted", "where"] },
    { label: "④", values: ["provides", "compacting", "where"] },
    { label: "⑤", values: ["provide", "compacted", "which"] },
  ],
  answer: "③",
  explanation:
    "(A)는 관계사절의 주어 urban trees가 복수이므로 provide가 옳고, (B)는 by 행위자구가 이어지므로 수동 분사 compacted가 옳습니다. (C)는 뒤에 주어와 목적어를 갖춘 완전한 절이 이어지므로 관계부사 where가 옳습니다.",
  wrong: [
    { label: "①", text: "(A)에 provides를 넣으면 관계사절의 복수 주어 urban trees와 수가 어긋나므로 틀립니다." },
    { label: "②", text: "(B)의 compacting은 by 행위자구와 충돌하는 능동 분사이고 (C)의 which는 완전한 절을 이끌 수 없으므로 틀립니다." },
    { label: "④", text: "(A)의 provides는 복수 주어와 어긋나고 (B)의 compacting은 수동 문맥과 충돌하므로 틀립니다." },
    { label: "⑤", text: "(C)에 which를 넣으면 뒤에 불완전한 절이 와야 하는데 완전한 절이 이어지므로 틀립니다." },
  ],
};
const clone = () => JSON.parse(JSON.stringify(GOOD)) as typeof GOOD;

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok → 평가 표면 ─────────────────
{
  const parsed = GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("정상 픽스처: 코어스 무발동(corrections 0)", parsed.corrections.length === 0, parsed.corrections.join("; "));
  const adapt = GRAMMAR_CHOICE_COMBO_MD_LANE.adapt(parsed, ctx);
  const ai = adapt.aiQuestion;
  check(
    "레인 어댑터 왕복: ok + 숫자 라벨 축",
    adapt.ok === true &&
      !!ai &&
      ai.correctAnswer === "3" &&
      Array.isArray(ai.options) &&
      (ai.options as Array<{ label: string }>)[0].label === "1" &&
      Array.isArray(ai.slots) &&
      (ai.slots as Array<{ label: string }>)[0].label === "(A)",
    adapt.error,
  );
  if (ai) {
    const surface = GRAMMAR_CHOICE_COMBO_LUNA_EXT.renderEvalSurface(ai, PASSAGE);
    check(
      "평가 표면: 발문+네모지문+조합 선지 렌더",
      surface.includes("어법에 맞는 표현") &&
        surface.includes("(A) [") &&
        surface.includes("(B) [") &&
        surface.includes("(C) [") &&
        surface.includes("① provides - compacted - where") &&
        surface.includes(PASSAGE.slice(0, 29)),
      surface.slice(0, 160),
    );
    console.log("── 평가 표면 표본 ──\n" + surface + "\n──");
  }
}

// ── ② 코어스: 발동/무발동 ───────────────────────────────────────────────────
{
  // 오답해설 순서 뒤섞임 → 라벨 오름차순 정렬(발동).
  const shuffled = clone();
  shuffled.wrong = [GOOD.wrong[3], GOOD.wrong[0], GOOD.wrong[2], GOOD.wrong[1]];
  const parsed = GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(shuffled), ctx);
  const q = parsed.question as MdComboQuestion;
  check(
    "코어스: 오답 라벨 정렬 발동",
    parsed.gateIssues.length === 0 && q.wrong.map((w) => w.label).join("") === "①②④⑤",
    q.wrong.map((w) => w.label).join(""),
  );

  // slots 배열 순서 드리프트 → 라벨 오름차순 정렬(발동, 게이트 클린).
  const slotShuffled = clone();
  slotShuffled.slots = [GOOD.slots[2], GOOD.slots[0], GOOD.slots[1]];
  const parsedSlots = GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(slotShuffled), ctx);
  check(
    "코어스: 원형·포인트 라벨 정렬 발동",
    parsedSlots.gateIssues.length === 0 && has(parsedSlots.corrections, "오름차순"),
    [...parsedSlots.gateIssues, ...parsedSlots.corrections].join("; "),
  );

  // 마커 라벨이 등장순이 아님((B) 가 먼저) → 등장순 재번호 + 선지 값 순열 + 해설 동기 치환.
  const swapped = clone();
  swapped.markedPassage = PASSAGE.replace("provide", "[[B:provide|provides]]")
    .replace("compacted", "[[A:compacted|compacting]]")
    .replace("where", "[[C:where|which]]");
  swapped.slots = [
    { label: "(A)", correct: "compacted", wrong: "compacting", code: "c" },
    { label: "(B)", correct: "provide", wrong: "provides", code: "d" },
    { label: "(C)", correct: "where", wrong: "which", code: "b" },
  ];
  swapped.options = [
    { label: "①", values: ["compacted", "provides", "where"] },
    { label: "②", values: ["compacting", "provide", "which"] },
    { label: "③", values: ["compacted", "provide", "where"] },
    { label: "④", values: ["compacting", "provides", "where"] },
    { label: "⑤", values: ["compacted", "provide", "which"] },
  ];
  swapped.explanation =
    "(B)는 관계사절의 주어 urban trees가 복수이므로 provide가 옳고, (A)는 by 행위자구가 이어지므로 수동 분사 compacted가 옳습니다. (C)는 뒤에 주어와 목적어를 갖춘 완전한 절이 이어지므로 관계부사 where가 옳습니다.";
  const parsedSwap = GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(swapped), ctx);
  const qs = parsedSwap.question as MdComboQuestion;
  check(
    "코어스: 등장순 재번호 발동(마커·메타·선지 값·해설 동기)",
    parsedSwap.gateIssues.length === 0 &&
      has(parsedSwap.corrections, "재번호") &&
      qs.slots[0].correct === "provide" &&
      qs.options[0].values.join("|") === "provides|compacted|where" &&
      qs.explanation.startsWith("(A)는 관계사절"),
    [...parsedSwap.gateIssues, ...parsedSwap.corrections].join("; "),
  );

  // 코어스 4 — 후보쌍 공통 토큰 트리밍(구·절 단위 네모 → 변별 토큰만). 발동.
  const WIDE_MARKED = PASSAGE.replace(
    "provide to crowded",
    "[[A:provide to crowded|provides to crowded]]",
  )
    .replace("compacted by", "[[B:compacted by|compacting by]]")
    .replace("where", "[[C:where|which]]");
  const wide = {
    markedPassage: WIDE_MARKED,
    slots: [
      { label: "(A)", correct: "provide to crowded", wrong: "provides to crowded", code: "d" },
      { label: "(B)", correct: "compacted by", wrong: "compacting by", code: "c" },
      { label: "(C)", correct: "where", wrong: "which", code: "b" },
    ],
    options: [
      { label: "①", values: ["provides to crowded", "compacted by", "where"] },
      { label: "②", values: ["provide to crowded", "compacting by", "which"] },
      { label: "③", values: ["provide to crowded", "compacted by", "where"] },
      { label: "④", values: ["provides to crowded", "compacting by", "where"] },
      { label: "⑤", values: ["provide to crowded", "compacted by", "which"] },
    ],
    answer: "③",
    explanation: GOOD.explanation,
    wrong: GOOD.wrong,
  };
  const parsedWide = GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(wide), ctx);
  const qw = parsedWide.question as MdComboQuestion;
  check(
    "코어스: 후보쌍 공통 토큰 트리밍 발동(마커·메타·선지 값 동기)",
    parsedWide.gateIssues.length === 0 &&
      has(parsedWide.corrections, "트리밍") &&
      qw.slots[0].correct === "provide" &&
      qw.slots[0].wrong === "provides" &&
      qw.slots[1].correct === "compacted" &&
      qw.slots[2].correct === "where" &&
      qw.markedPassage.includes("[[A:provide|provides]] to crowded") &&
      qw.markedPassage.includes("[[B:compacted|compacting]] by") &&
      qw.options[0].values.join("|") === "provides|compacted|where",
    [...parsedWide.gateIssues, ...parsedWide.corrections, qw.slots[0].correct].join("; "),
  );

  // 코어스 4 안전 롤백 — 좁힌 후보가 네모 밖에 기등장(누설 신설)하면 통째로 되돌린다.
  const PASSAGE_ROLLBACK =
    PASSAGE + " City budgets, however, rarely provide for trenches of that size.";
  const rollback = JSON.parse(JSON.stringify(wide)) as typeof wide;
  rollback.markedPassage = PASSAGE_ROLLBACK.replace(
    "provide to crowded",
    "[[A:provide to crowded|provides to crowded]]",
  )
    .replace("compacted by", "[[B:compacted by|compacting by]]")
    .replace("where", "[[C:where|which]]");
  const parsedRollback = GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(rollback), {
    ...ctx,
    passage: PASSAGE_ROLLBACK,
  });
  const qr = parsedRollback.question as MdComboQuestion;
  check(
    "코어스: 트리밍이 누설을 새로 만들면 롤백(게이트 클린 유지)",
    parsedRollback.gateIssues.length === 0 &&
      !has(parsedRollback.corrections, "트리밍") &&
      qr.slots[0].correct === "provide to crowded",
    [...parsedRollback.gateIssues, ...parsedRollback.corrections, qr.slots[0].correct].join("; "),
  );

  // S3 스냅(레인 재사용): 선지 값 대소문자 드리프트 → 후보 정본으로 정규화.
  const cased = clone();
  cased.options[0].values[0] = "Provides";
  const parsedCase = GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(cased), ctx);
  const qc = parsedCase.question as MdComboQuestion;
  check(
    "코어스: 선지 값 정본 표기 스냅 발동",
    parsedCase.gateIssues.length === 0 &&
      parsedCase.corrections.length === 1 &&
      qc.options[0].values[0] === "provides",
    [...parsedCase.gateIssues, ...parsedCase.corrections].join("; "),
  );
}

// ── ③ 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  const short = clone();
  short.options = short.options.slice(0, 4);
  check(
    "음성테스트: 선지 4개 반려",
    has(GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(short), ctx).gateIssues, "선지 4개"),
  );

  const edited = clone();
  edited.markedPassage = MARKED.replace("planners", "planners boldly"); // 마커 밖 무단 편집
  check(
    "음성테스트: 지문 재구성 불일치 반려(축자 seam)",
    has(GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(edited), ctx).gateIssues, "재구성 불일치"),
  );

  // 후보가 네모 밖 지문에 기등장 — 패밀리 핵심 게이트(정답 누설).
  const PASSAGE_LEAK =
    PASSAGE + " City budgets, however, rarely provide for trenches of that size.";
  const leak = clone();
  leak.markedPassage = PASSAGE_LEAK.replace("provide", "[[A:provide|provides]]")
    .replace("compacted", "[[B:compacted|compacting]]")
    .replace("where", "[[C:where|which]]");
  check(
    "음성테스트: 후보 기등장 → 정답 누설 반려",
    has(
      GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(leak), { ...ctx, passage: PASSAGE_LEAK }).gateIssues,
      "정답 누설",
    ),
  );

  const twoCorrect = clone();
  twoCorrect.options[4].values = ["provide", "compacted", "where"]; // ⑤ 도 전부-올바름
  check(
    "음성테스트: 전부-올바른 조합 2개 반려",
    has(GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(twoCorrect), ctx).gateIssues, "올바른 조합이 2개"),
  );

  const answerInWrong = clone();
  answerInWrong.wrong = [
    ...GOOD.wrong.slice(0, 3),
    { label: "③", text: "정답 라벨이 오답 목록에 끼어든 드리프트." },
  ];
  check(
    "음성테스트: 오답 목록의 정답 라벨 → 커버리지 반려",
    has(
      GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(answerInWrong), ctx).gateIssues,
      "오답해설 없는 선지 ⑤",
    ),
  );

  // 시제 쌍은 마커까지 일치시켜야 한다 — 메타만 바꾸면 autoSnap 이 마커 진실원으로
  // 되돌려(정상 동작) 게이트가 볼 수 없다.
  const tense = clone();
  tense.markedPassage = MARKED.replace("[[A:provide|provides]]", "[[A:provide|provided]]");
  tense.slots[0] = { label: "(A)", correct: "provide", wrong: "provided", code: "d" };
  tense.options[0].values[0] = "provided";
  tense.options[3].values[0] = "provided";
  check(
    "음성테스트: 시제 단독 토글 반려",
    has(GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(tense), ctx).gateIssues, "시제 단독 교체"),
  );

  const dupCode = clone();
  dupCode.slots[1].code = "d";
  check(
    "음성테스트: 포인트코드 중복 반려",
    has(GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(dupCode), ctx).gateIssues, "포인트코드 중복"),
  );

  const parseFail = GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)", has(parseFail.gateIssues, "파싱 실패"));
}

// ── ③-b 평가 표면 계기 검증: 한 단어 후보가 지문 앞쪽 동형 토큰에 안 걸리는가 ──
{
  const P =
    "Studies show that mature canopies cool streets, and the benefits that urban trees provide depend on soil volume. " +
    "Soil compacted by traffic holds less moisture. Planners dig trenches where roots spread.";
  const ai = {
    direction: "(A), (B), (C)의 각 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?",
    slots: [
      {
        label: "(A)",
        correctExpression: "that",
        wrongExpression: "what",
        // 어댑터가 싣는 ±45자 창(두 번째 that 주변)
        surroundingText: "and the benefits that urban trees provide depend on soil",
      },
      {
        label: "(B)",
        correctExpression: "compacted",
        wrongExpression: "compacting",
        surroundingText: "Soil compacted by traffic holds less moisture",
      },
      { label: "(C)", correctExpression: "where", wrongExpression: "which", surroundingText: "" },
    ],
    options: [{ label: "1", text: "that - compacted - where" }],
  } as unknown as Parameters<typeof GRAMMAR_CHOICE_COMBO_LUNA_EXT.renderEvalSurface>[0];
  const surface = GRAMMAR_CHOICE_COMBO_LUNA_EXT.renderEvalSurface(ai, P);
  check(
    "평가 표면: surroundingText 앵커로 한 단어 후보 위치 확정(앞쪽 동형 토큰 오배치 방지)",
    surface.includes("Studies show that mature") &&
      surface.includes("the benefits (A) [") &&
      surface.includes("Soil (B) [") &&
      surface.includes("trenches (C) ["),
    surface.split("\n\n")[1],
  );
}

// ── ④ 교사 지정 준수(레인 판정 등가 복제) ───────────────────────────────────
{
  const asPoints = (texts: string[]) =>
    texts.map((text) => ({ text })) as unknown as MdLaneContext["teacherPoints"];
  const ctxMiss = { ...ctx, teacherPoints: asPoints(["absorb"]) };
  check(
    "교사 지정: 미반영 표현 반려",
    has(GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctxMiss).gateIssues, "교사 지정"),
  );
  const ctxHit = { ...ctx, teacherPoints: asPoints(["compacted"]) };
  check(
    "교사 지정: 반영 표현 통과",
    GRAMMAR_CHOICE_COMBO_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctxHit).gateIssues.length === 0,
  );
}

// ── ⑤ 브릿지: 청크 분단·JSON 구문 무노출·메타 침묵 ──────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(GRAMMAR_CHOICE_COMBO_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 네모지문·선지·정답·해설 방류 + JSON 무노출`,
      out.startsWith("네모지문:\n") &&
        out.includes("[[A:provide|provides]]") &&
        out.includes("\n① ┃ provides ┃ compacted ┃ where") &&
        out.includes("\n\n정답: ③") &&
        out.includes("\n해설: ") &&
        !out.includes("{") &&
        !out.includes('"label"'),
      out.slice(0, 150),
    );
  }
}

// ── ⑥ 스키마·검산 블록 형상 ─────────────────────────────────────────────────
{
  const spec = GRAMMAR_CHOICE_COMBO_LUNA_EXT.buildJsonSchema(ctx);
  const schema = spec.schema as Record<string, any>;
  check(
    "스키마: strict + 파서 산출물 동형(본문 선두·개수 고정·닫힌 라벨)",
    spec.strict === true &&
      Object.keys(schema.properties)[0] === "markedPassage" &&
      schema.additionalProperties === false &&
      schema.properties.slots.minItems === 3 &&
      schema.properties.slots.items.properties.label.enum.join("") === "(A)(B)(C)" &&
      schema.properties.slots.items.properties.code.enum.length === 13 &&
      schema.properties.options.minItems === 5 &&
      schema.properties.options.items.properties.values.minItems === 3 &&
      schema.properties.answer.enum.length === 5 &&
      schema.properties.wrong.minItems === 4,
  );

  const sc = GRAMMAR_CHOICE_COMBO_LUNA_EXT.buildSelfcheck(ctx);
  check(
    "검산 블록: 예산+사다리+재구성+누설+기출 네모 폭+라벨 귀속+합쇼체",
    sc.includes("출력 예산") &&
      sc.includes("1순위 판정 확정성") &&
      sc.includes("재구성 축자 검산") &&
      sc.includes("기등장하면 반려") &&
      sc.includes("표적 교체뿐") &&
      sc.includes("변별 토큰만") &&
      sc.includes("near-miss 3개") &&
      sc.includes("that 규칙 정본") &&
      sc.includes("오답해설 라벨 귀속 검산") &&
      sc.includes("합쇼체") &&
      !sc.includes("교사 지정"),
    sc.slice(0, 80),
  );
  const scTeacher = GRAMMAR_CHOICE_COMBO_LUNA_EXT.buildSelfcheck({
    ...ctx,
    teacherPoints: [{ text: "compacted" }] as unknown as MdLaneContext["teacherPoints"],
  });
  check("검산 블록: 교사 지정 조건부 블록", scTeacher.includes("교사 지정 준수 검산"));
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
