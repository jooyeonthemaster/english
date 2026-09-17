// WORD_ORDER luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-word-order.ts
import { WORD_ORDER_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/word-order";
import { WORD_ORDER_MD_LANE } from "../src/lib/md-qgen/lane-word-order";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

const PASSAGE =
  "Urban wildlife has learned to thrive in cities. Raccoons open containers that were designed to keep them out, and crows drop nuts onto crosswalks so passing cars crack them open. " +
  "Researchers who track these behaviors find that they spread quickly through populations, as young animals imitate the techniques that prove successful. " +
  "The lesson is clear: cities are not biological deserts but engines of rapid adaptation, and the animals that master them are rewriting what we thought we knew about learning in the wild.";

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

// 지문 3번째 문장의 변형(관계절 → 분사구문 + 주절 수동 전환) — 원문과 연속
// 겹침은 "these behaviors"(2단어)뿐이라 verbatim 게이트(#9)에 걸리지 않는다.
const MODEL_ANSWER =
  "Tracked by researchers, these behaviors spread quickly, as successful techniques are imitated by young animals.";

const GOOD = {
  answerChunks: [
    "Tracked by researchers,",
    "these behaviors",
    "spread quickly,",
    "as successful techniques",
    "are imitated",
    "by young animals.",
  ],
  distractors: ["imitating", "by populations"],
  hint: "연구가 밝혀낸 행동 확산의 원리를 요약하는 문장입니다.",
  acceptedAnswers: [
    "These behaviors spread quickly, tracked by researchers, as successful techniques are imitated by young animals.",
  ],
  explanation:
    "관찰 주체를 분사구문 'Tracked by researchers'로 접고 주절을 수동태로 전환했습니다. 확산의 주체와 모방의 행위자를 지문에서 확정해야 이 어순만 유일하게 성립합니다.",
};

// ── ① 정상 왕복: parseAndGate 클린 → 코어스 무발동 → 레인 adapt ok ──────────
{
  const parsed = WORD_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("정상 픽스처: 코어스 무발동", parsed.corrections.length === 0, parsed.corrections.join("; "));

  const q = parsed.question as {
    modelAnswer: string;
    chips: string[];
    distractors: string[];
    chunksFromAnswer?: boolean;
  };
  check(
    "모범답안: 청크에서 항등 파생(join)",
    q.modelAnswer === MODEL_ANSWER,
    q.modelAnswer,
  );
  check(
    "칩 = 청크 ∪ 미끼(8개) + 신형식 플래그",
    q.chips.length === 8 && q.distractors.length === 2 && q.chunksFromAnswer === true,
    `chips=${q.chips.length} distractors=${q.distractors.length}`,
  );

  const adapt = WORD_ORDER_MD_LANE.adapt(parsed, ctx);
  const ai = adapt.aiQuestion as Record<string, unknown> | undefined;
  check(
    "레인 어댑터 왕복: ok + 미끼 있는 발문 + correctAnswer=modelAnswer + options 키 부재",
    adapt.ok === true &&
      !!ai &&
      ai.direction ===
        "주어진 단어를 올바른 순서로 배열하여 문장을 완성하시오. (쓰지 않는 단어가 포함되어 있음)" &&
      ai.correctAnswer === MODEL_ANSWER &&
      !("options" in (ai ?? {})),
    adapt.error,
  );
  const accepted = (ai?.acceptedAnswers ?? []) as string[];
  check(
    "허용답 집합: 모범답안 선두 + 등가 어순 보존",
    accepted[0] === MODEL_ANSWER && accepted.includes(GOOD.acceptedAnswers[0]),
    JSON.stringify(accepted),
  );

  if (ai) {
    const surface = WORD_ORDER_LUNA_EXT.renderEvalSurface(ai, PASSAGE);
    check(
      "평가 표면: 발문+지문+칩 은행, 정답 어순 무노출",
      surface.includes("배열하여 문장을 완성하시오") &&
        surface.includes(PASSAGE.slice(0, 40)) &&
        surface.includes("[ imitating ]") &&
        surface.includes("힌트: 연구가") &&
        !surface.includes(MODEL_ANSWER),
      surface.slice(0, 160),
    );
    console.log("── 평가 표면 표본 ──\n" + surface + "\n──");
  }
}

// ── ② 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  const fatChunk = {
    ...GOOD,
    answerChunks: [
      "Tracked by researchers, these behaviors spread quickly, as successful techniques",
      "are imitated",
      "by young animals.",
    ],
  };
  check(
    "음성테스트: 과대 청크(정답 절반 초과) 반려",
    has(WORD_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(fatChunk), ctx).gateIssues, "절반"),
  );

  const fewDistractors = { ...GOOD, distractors: ["imitating"] };
  check(
    "음성테스트: KILLER 미끼 1개 반려",
    has(WORD_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(fewDistractors), ctx).gateIssues, "미끼 1개"),
  );

  const verbatim = {
    ...GOOD,
    answerChunks: [
      "Researchers who track these behaviors",
      "find that they spread quickly",
      "through populations,",
      "as young animals imitate",
      "the techniques",
      "that prove successful.",
    ],
    acceptedAnswers: [],
    explanation: "지문 문장을 그대로 옮겨 배열만 바꿨습니다. 어순 판단 근거는 원문과 동일합니다.",
  };
  check(
    "음성테스트: 지문 verbatim 재배열 반려",
    has(WORD_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(verbatim), ctx).gateIssues, "통째 복사"),
  );

  const englishHint = { ...GOOD, hint: "The sentence explains how behaviors spread." };
  check(
    "음성테스트: 영어 힌트 반려",
    has(WORD_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(englishHint), ctx).gateIssues, "한국어가 아님"),
  );

  const dupDistractor = { ...GOOD, distractors: ["are imitated", "by populations"] };
  check(
    "음성테스트: 미끼=정답 청크 축자 동일 반려",
    has(WORD_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(dupDistractor), ctx).gateIssues, "동일"),
  );

  // 유일성 붕괴 계통(판정 라운드1 실측): 정답 청크를 통째로 삼키는 미끼.
  const swallowDistractor = {
    ...GOOD,
    distractors: ["imitating", "and by young animals"],
  };
  check(
    "음성테스트: 정답 청크를 통째로 품은 미끼 반려(복수정답 경로)",
    has(
      WORD_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(swallowDistractor), ctx).gateIssues,
      "통째로 포함",
    ),
  );

  const swallowMid = {
    ...GOOD,
    distractors: ["imitating", "when these behaviors stall"],
  };
  check(
    "음성테스트: 정답 청크를 중간에 품은 미끼도 반려(연속 낱말열 판정)",
    has(
      WORD_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(swallowMid), ctx).gateIssues,
      "통째로 포함",
    ),
  );

  const partialWord = {
    ...GOOD,
    distractors: ["imitating", "by young animal keepers"],
  };
  check(
    "무발동 대조: 낱말 경계가 다른 부분일치는 반려하지 않음",
    !has(
      WORD_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(partialWord), ctx).gateIssues,
      "통째로 포함",
    ),
    WORD_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(partialWord), ctx).gateIssues.join("; "),
  );

  const parseFail = WORD_ORDER_LUNA_EXT.parseAndGate("{broken json", ctx);
  check(
    "음성테스트: JSON 파손 → gateIssues 반환(throw 금지)",
    parseFail.question === null && has(parseFail.gateIssues, "파싱 실패"),
  );
}

// ── ③ 코어스 검증 (발동 3종 — 무발동은 ①에서 검증) ─────────────────────────
{
  const markerInChunk = {
    ...GOOD,
    answerChunks: [
      "Tracked by researchers, / these behaviors",
      "spread quickly,",
      "as successful techniques",
      "are imitated",
      "by young animals.",
    ],
  };
  const p1 = WORD_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(markerInChunk), ctx);
  const q1 = p1.question as { modelAnswer: string; chips: string[] };
  check(
    "코어스: 원소 안 ' / ' 마커 분해 발동 + 게이트 클린 + 모범답안 불변",
    p1.corrections.some((c) => c.includes("분해")) &&
      p1.gateIssues.length === 0 &&
      q1.modelAnswer === MODEL_ANSWER &&
      q1.chips.length === 8,
    `corrections=${JSON.stringify(p1.corrections)} issues=${p1.gateIssues.join("; ")}`,
  );

  const noPeriod = {
    ...GOOD,
    answerChunks: [...GOOD.answerChunks.slice(0, 5), "by young animals"],
    acceptedAnswers: [],
  };
  const p2 = WORD_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(noPeriod), ctx);
  const q2 = p2.question as { modelAnswer: string };
  check(
    "코어스: 종결부호 보정 발동 + 게이트 클린",
    p2.corrections.some((c) => c.includes("종결부호")) &&
      p2.gateIssues.length === 0 &&
      q2.modelAnswer.endsWith("animals."),
    `corrections=${JSON.stringify(p2.corrections)} issues=${p2.gateIssues.join("; ")}`,
  );

  // 패밀리 특칙 계기: 칩으로 조립되지 않는 허용답(단어 누락 변형)은 오답 흡수
  // 사고이므로 스냅이 결정론 절삭한다 — 게이트는 클린, 절삭은 corrections 기록.
  const badAccepted = {
    ...GOOD,
    acceptedAnswers: [...GOOD.acceptedAnswers, "These behaviors are quickly imitated."],
  };
  const p3 = WORD_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(badAccepted), ctx);
  const adapt3 = WORD_ORDER_MD_LANE.adapt(p3, ctx);
  const accepted3 = (adapt3.aiQuestion?.acceptedAnswers ?? []) as string[];
  check(
    "코어스: 조립 불가 허용답 절삭 발동(오답 흡수 방지) + 게이트 클린",
    p3.corrections.some((c) => c.includes("허용답") && c.includes("제외")) &&
      p3.gateIssues.length === 0 &&
      accepted3.length === 2 &&
      !accepted3.includes("These behaviors are quickly imitated."),
    `corrections=${JSON.stringify(p3.corrections)} accepted=${JSON.stringify(accepted3)}`,
  );
}

// ── ④ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(WORD_ORDER_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 청크·미끼·힌트·허용답·해설 방류 + JSON 무노출`,
      out.includes("\n청크: Tracked by researchers,") &&
        out.includes("\n청크: by young animals.") &&
        out.includes("\n미끼: imitating") &&
        out.includes("\n힌트: 연구가") &&
        out.includes("\n허용답: These behaviors") &&
        out.includes("\n해설: 관찰 주체를") &&
        !out.includes("{") &&
        !out.includes('"answerChunks"') &&
        !out.includes('"distractors"'),
      out.slice(0, 150),
    );
  }

  let silent = "";
  const bridge = new LunaJsonMdBridge(WORD_ORDER_LUNA_EXT.bridgeSpecs, (d) => (silent += d));
  bridge.push(JSON.stringify({ ...GOOD, hint: "", acceptedAnswers: [] }));
  check(
    "브릿지: 빈 힌트·빈 허용답은 라벨까지 침묵",
    !silent.includes("힌트:") && !silent.includes("허용답:") && silent.includes("\n해설: "),
    silent.slice(-120),
  );
}

// ── ⑤ 동적 스키마·검산 블록 형상 ────────────────────────────────────────────
{
  const spec = WORD_ORDER_LUNA_EXT.buildJsonSchema(ctx);
  const schema = spec.schema as Record<string, any>;
  check(
    "스키마: strict + additionalProperties:false + 5필드 + 본문성 필드 선두",
    spec.strict === true &&
      schema.additionalProperties === false &&
      JSON.stringify(schema.required) ===
        JSON.stringify(["answerChunks", "distractors", "hint", "acceptedAnswers", "explanation"]) &&
      Object.keys(schema.properties)[0] === "answerChunks",
  );
  check(
    "동적 스키마(KILLER): 청크 6~8 · 미끼 최소 2 · 칩 상한 12 구조 보장",
    schema.properties.answerChunks.minItems === 6 &&
      schema.properties.answerChunks.maxItems === 8 &&
      schema.properties.distractors.minItems === 2 &&
      schema.properties.answerChunks.maxItems + schema.properties.distractors.maxItems === 12,
  );

  const basicSchema = WORD_ORDER_LUNA_EXT.buildJsonSchema({ ...ctx, difficulty: "BASIC" })
    .schema as Record<string, any>;
  check(
    "동적 스키마(BASIC): 청크 4~5 · 미끼 최소 1",
    basicSchema.properties.answerChunks.minItems === 4 &&
      basicSchema.properties.answerChunks.maxItems === 5 &&
      basicSchema.properties.distractors.minItems === 1,
  );

  const selfcheck = WORD_ORDER_LUNA_EXT.buildSelfcheck(ctx);
  check(
    "검산 블록: 사다리 + 게이트 반려 조건 전사 + 패밀리 특칙(허용답 전부 나열)",
    selfcheck.includes("1순위") &&
      selfcheck.includes("양보") &&
      selfcheck.includes("6~8개") &&
      selfcheck.includes("절반") &&
      selfcheck.includes("6단어") &&
      selfcheck.includes("축약형") &&
      selfcheck.includes("전부** 나열") &&
      selfcheck.includes("합쇼체") &&
      selfcheck.includes("환각"),
  );
  check(
    "검산 블록: 유일성 붕괴 계통 4종(대안 배열 시뮬·슬롯 배타·미끼 재료 금지·배제 근거)",
    selfcheck.includes("대안 배열 검산") &&
      selfcheck.includes("미끼 슬롯 배타성") &&
      selfcheck.includes("새 종속접속사") &&
      selfcheck.includes("배제 근거 자문"),
  );
  check(
    "검산 블록: 해설 사실성 계통 2종(구조 용어 대조·배제 축 분리)",
    selfcheck.includes("해설 구조 용어 대조 검산") && selfcheck.includes("배제 축 분리 서술"),
  );
  const basicSelfcheck = WORD_ORDER_LUNA_EXT.buildSelfcheck({ ...ctx, difficulty: "BASIC" });
  check(
    "검산 블록: 난이도 실값 반영(BASIC 4~5청크·미끼 1개)",
    basicSelfcheck.includes("4~5개") && basicSelfcheck.includes("하한 1개"),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
