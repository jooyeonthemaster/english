// SENTENCE_TRANSFORM luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-sentence-transform.ts
import { SENTENCE_TRANSFORM_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/sentence-transform";
import { SENTENCE_TRANSFORM_MD_LANE } from "../src/lib/md-qgen/lane-sentence-transform";
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

const TARGET =
  "Because the canopy intercepts sunlight before it reaches the pavement, the surface stays measurably cooler through the afternoon.";
const PASSAGE =
  "Urban trees do far more than decorate the streets. " +
  TARGET +
  " City planners who measured these effects concluded that a single mature tree can offset the heat of an entire parking lot. " +
  "The finding has pushed several cities to rewrite their zoning codes around shade.";

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
  originalSentence: TARGET,
  conditions: ["분사구문으로 바꿀 것", "'Intercepting'으로 시작할 것"],
  modelAnswer:
    "Intercepting sunlight before it reaches the pavement, the canopy keeps the surface measurably cooler through the afternoon.",
  scoringCriteria: [
    "만점: 분사구문 전환과 'Intercepting' 시작, 주어 통일이 모두 정확하고 의미가 보존된 형태입니다.",
    "부분점수: 의미는 같으나 쉼표 위치나 어순이 어긋난 동치 변형은 감점 후 인정합니다.",
    "0점: 접속사가 남아 있거나 원문의 의미가 달라진 답안은 인정하지 않습니다.",
  ],
  explanation:
    "부사절 'Because the canopy intercepts sunlight'를 분사구문으로 바꾸고 종속절의 주어였던 the canopy를 주절 주어로 끌어올려 'Intercepting'으로 시작하게 했습니다. 원문의 긍정 극성과 measurably라는 정도 한정, canopy가 가리고 surface가 시원해진다는 의미역이 그대로 보존됩니다.",
};

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok:true ─────────────────────
{
  const parsed = SENTENCE_TRANSFORM_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("코어스 무발동: 정상 픽스처 corrections 없음", parsed.corrections.length === 0, parsed.corrections.join("; "));
  const adapt = SENTENCE_TRANSFORM_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    check(
      "어댑터 계약: correctAnswer=modelAnswer 복제·금지 키 부재",
      adapt.aiQuestion.correctAnswer === GOOD.modelAnswer &&
        !("options" in adapt.aiQuestion) &&
        !("acceptedAnswers" in adapt.aiQuestion) &&
        !("blanks" in adapt.aiQuestion),
      JSON.stringify(Object.keys(adapt.aiQuestion)),
    );
    const surface = SENTENCE_TRANSFORM_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+밑줄 지문+조건 렌더, 정답 무누출",
      surface.includes("바꾸어 쓰시오") &&
        surface.includes("<u>Because the canopy intercepts") &&
        surface.includes("- 분사구문으로 바꿀 것") &&
        surface.includes("답안:") &&
        !surface.includes("Intercepting sunlight") &&
        !surface.includes("canopy keeps"),
      surface.slice(0, 120),
    );
    console.log("── 평가 표면 표본 ──\n" + surface + "\n──");
  }
}

// ── ② 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  const notVerbatim = {
    ...GOOD,
    originalSentence:
      "Because the canopy blocks sunlight before it reaches the pavement, the surface stays measurably cooler through the afternoon.",
  };
  check(
    "음성테스트: 비축자 원문장 반려",
    has(SENTENCE_TRANSFORM_LUNA_EXT.parseAndGate(JSON.stringify(notVerbatim), ctx).gateIssues, "축자로 없음"),
  );

  const notTransformed = { ...GOOD, modelAnswer: TARGET };
  check(
    "음성테스트: 전환 미이행(모범답안=원문장) 반려",
    has(SENTENCE_TRANSFORM_LUNA_EXT.parseAndGate(JSON.stringify(notTransformed), ctx).gateIssues, "전환이 적용되지"),
  );

  const oneCondition = { ...GOOD, conditions: ["분사구문으로 바꿀 것"] };
  check(
    "음성테스트: KILLER 조건 1개 반려",
    has(SENTENCE_TRANSFORM_LUNA_EXT.parseAndGate(JSON.stringify(oneCondition), ctx).gateIssues, "KILLER"),
  );

  const missingRequiredToken = {
    ...GOOD,
    conditions: ["분사구문으로 바꿀 것", "'Had'로 시작할 것"],
  };
  check(
    "음성테스트: 필수 인용 토큰 미충족 반려",
    has(
      SENTENCE_TRANSFORM_LUNA_EXT.parseAndGate(JSON.stringify(missingRequiredToken), ctx).gateIssues,
      "모범답안에 없다",
    ),
  );

  const koreanMixed = {
    ...GOOD,
    modelAnswer: "Intercepting sunlight before it reaches the pavement, the canopy 는 표면을 시원하게 유지합니다.",
  };
  check(
    "음성테스트: 모범답안 한국어 혼입 반려",
    has(SENTENCE_TRANSFORM_LUNA_EXT.parseAndGate(JSON.stringify(koreanMixed), ctx).gateIssues, "한국어가 섞임"),
  );

  const parseFail = SENTENCE_TRANSFORM_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)", has(parseFail.gateIssues, "파싱 실패"));
}

// ── ③ 코어스 검증 (발동 — 무발동은 ①에서 확인) ─────────────────────────────
{
  const missingPeriod = { ...GOOD, originalSentence: TARGET.replace(/\.$/, "") };
  const snapped = SENTENCE_TRANSFORM_LUNA_EXT.parseAndGate(JSON.stringify(missingPeriod), ctx);
  const q = snapped.question as { originalSentence: string } | null;
  check(
    "코어스 발동: 문말 구두점 축자 복원 + 게이트 클린",
    snapped.corrections.some((c) => c.includes("구두점")) &&
      q !== null &&
      q.originalSentence === TARGET &&
      snapped.gateIssues.length === 0,
    `corrections=${snapped.corrections.join("; ")} issues=${snapped.gateIssues.join("; ")}`,
  );

  // r1 감수 반영 코어스 — 조건 줄 말미 마침표 통일(붙은 문항/안 붙은 문항 혼재 조판).
  const tailPeriod = {
    ...GOOD,
    conditions: ["분사구문으로 바꿀 것.", "'Intercepting'으로 시작할 것."],
  };
  const unified = SENTENCE_TRANSFORM_LUNA_EXT.parseAndGate(JSON.stringify(tailPeriod), ctx);
  const uq = unified.question as { conditions: string[] } | null;
  check(
    "코어스 발동: 조건 줄 말미 마침표 제거 + 게이트 클린",
    unified.corrections.some((c) => c.includes("마침표")) &&
      uq !== null &&
      uq.conditions[0] === "분사구문으로 바꿀 것" &&
      uq.conditions[1] === "'Intercepting'으로 시작할 것" &&
      unified.gateIssues.length === 0,
    `corrections=${unified.corrections.join("; ")} issues=${unified.gateIssues.join("; ")}`,
  );

  const ellipsisTail = {
    ...GOOD,
    conditions: ["분사구문으로 바꿀 것", "'Intercepting'으로 시작할 것(예: A…)"],
  };
  const kept = SENTENCE_TRANSFORM_LUNA_EXT.parseAndGate(JSON.stringify(ellipsisTail), ctx);
  check(
    "코어스 무발동: 마침표 없는 조건은 원형 유지",
    !kept.corrections.some((c) => c.includes("마침표")),
    kept.corrections.join("; "),
  );

  const bulletDecorated = {
    ...GOOD,
    conditions: ["- 분사구문으로 바꿀 것", "- 'Intercepting'으로 시작할 것"],
  };
  const stripped = SENTENCE_TRANSFORM_LUNA_EXT.parseAndGate(JSON.stringify(bulletDecorated), ctx);
  const sq = stripped.question as { conditions: string[] } | null;
  check(
    "코어스 발동: 조건 머리 불릿 장식 제거 + 게이트 클린",
    stripped.corrections.some((c) => c.includes("장식 제거")) &&
      sq !== null &&
      sq.conditions[0] === "분사구문으로 바꿀 것" &&
      stripped.gateIssues.length === 0,
    `corrections=${stripped.corrections.join("; ")} issues=${stripped.gateIssues.join("; ")}`,
  );
}

// ── ④ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(SENTENCE_TRANSFORM_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 원문장·조건·모범답안·채점기준·해설 방류 + JSON 무노출`,
      out.includes("원문장: Because the canopy intercepts") &&
        out.includes("\n조건:") &&
        out.includes("\n- 분사구문으로 바꿀 것") &&
        out.includes("\n\n모범답안: Intercepting sunlight") &&
        out.includes("\n채점기준:") &&
        out.includes("\n- 만점:") &&
        out.includes("\n\n해설: ") &&
        !out.includes("{") &&
        !out.includes('"originalSentence"') &&
        !out.includes('"conditions"'),
      out.slice(0, 150),
    );
  }
}

// ── ⑤ 동적 스키마·검산 블록: 난이도 실값 반영 ───────────────────────────────
{
  const killerSchema = SENTENCE_TRANSFORM_LUNA_EXT.buildJsonSchema(ctx).schema as Record<string, any>;
  check(
    "동적 스키마(KILLER): 조건 2~4·채점기준 2~5·strict 형상",
    killerSchema.additionalProperties === false &&
      killerSchema.properties.conditions.minItems === 2 &&
      killerSchema.properties.conditions.maxItems === 4 &&
      killerSchema.properties.scoringCriteria.minItems === 2 &&
      killerSchema.properties.scoringCriteria.maxItems === 5 &&
      killerSchema.required.length === 5,
  );
  const basicCtx: MdLaneContext = { ...ctx, difficulty: "BASIC", rawDifficulty: "BASIC" };
  const basicSchema = SENTENCE_TRANSFORM_LUNA_EXT.buildJsonSchema(basicCtx).schema as Record<string, any>;
  check(
    "동적 스키마(BASIC): 조건 1~3",
    basicSchema.properties.conditions.minItems === 1 && basicSchema.properties.conditions.maxItems === 3,
  );
  const killerCheck = SENTENCE_TRANSFORM_LUNA_EXT.buildSelfcheck(ctx);
  const basicCheck = SENTENCE_TRANSFORM_LUNA_EXT.buildSelfcheck(basicCtx);
  check(
    "검산 블록: 난이도 실값 반영(KILLER 2~4개+축 규칙, BASIC 1~3개)",
    killerCheck.includes("2~4개") &&
      killerCheck.includes("서로 다른 전환 축") &&
      basicCheck.includes("1~3개") &&
      !basicCheck.includes("서로 다른 전환 축"),
  );
  check(
    "검산 블록: 사다리+핵심 반려 조건 전사",
    killerCheck.includes("우선순위") &&
      killerCheck.includes("축자") &&
      killerCheck.includes("총 N단어") &&
      killerCheck.includes("환각 인용") &&
      killerCheck.includes("합쇼체"),
  );
  // r1 감수 F 계통(조립 키트·분량 잠금 부재·조건 오지목·보존 상투구) 전사 확인
  check(
    "검산 블록: r1 F 계통 보강 규칙 전사",
    killerCheck.includes("분량 잠금은 필수") &&
      killerCheck.includes("조립 키트") &&
      killerCheck.includes("1/3(33%)") &&
      killerCheck.includes("조건-모범답안 역검") &&
      killerCheck.includes("서수") &&
      killerCheck.includes("판정 축 하나") &&
      killerCheck.includes("보존 주장은 실제로 성립하는 것만"),
    killerCheck.slice(0, 80),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
