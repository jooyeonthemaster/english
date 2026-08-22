// FILL_BLANK_KEY luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-fill-blank-key.ts
import { FILL_BLANK_KEY_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/fill-blank-key";
import { FILL_BLANK_KEY_MD_LANE } from "../src/lib/md-qgen/lane-fill-blank-key";
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

// 4문장 지문 — 표적은 3번째 문장(첫 문장 금지 게이트 대비), 정답 "quietly revise it"
// 은 지문 전체에서 정확히 1회 등장한다.
const PASSAGE =
  "Most people assume that memory works like a video camera, faithfully recording events exactly as they happened. " +
  "Decades of research tell a different story: remembering is an active process in which the brain rebuilds the past from scattered fragments and present beliefs. " +
  "Witnesses who retell an event repeatedly do not simply repeat it; they quietly revise it, absorbing details from questions, newspapers, and other people's accounts. " +
  "What courts need, therefore, is not more confident testimony but procedures that treat memory as evidence that can be contaminated.";

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

// 2차 수리(결정형 확정성 장치) 전용 지문 — D1 극성 · D2 스팬 경계 · D3 어휘 앵커가
// 각각 독립적으로 울리는(그리고 정상 표적에서는 침묵하는) 자리를 한 지문에 모았다.
const PASSAGE_D =
  "Coaches often assume that a losing streak means the team has stopped caring. " +
  "Careful study of training records tells a different story about effort and rest. " +
  "Sports scientists do not think tired athletes are losing their edge. " +
  "It is more likely that these slumps reflect a hidden fragility. " +
  "Some coaches still demand knee-jerk sacrifices from injured players. " +
  "The damage arrives in a slow drip-drip-drip rhythm that nobody notices. " +
  "Trainers don't call these dips a collapse of will. " +
  "Careful scheduling reduces the strain of the long season on young players. " +
  "Planned rest rebuilds resilience, and resilient athletes recover far faster.";

const ctxD: MdLaneContext = { ...ctx, passage: PASSAGE_D };

const EXPL_D =
  "빈칸 문장은 글의 논지를 정리하는 자리입니다. 앞뒤 문장의 대조가 정답을 유일하게 지목합니다.";

const TARGET_SENTENCE =
  "Witnesses who retell an event repeatedly do not simply repeat it; they quietly revise it, absorbing details from questions, newspapers, and other people's accounts.";

const GOOD = {
  sentenceWithBlank:
    "Witnesses who retell an event repeatedly do not simply repeat it; they _____, absorbing details from questions, newspapers, and other people's accounts.",
  answer: "quietly revise it",
  explanation:
    "빈칸 문장은 기억이 회상할 때마다 다시 만들어진다는 글의 논지를 목격자 사례로 구체화하는 자리입니다. 바로 앞 문장이 기억 인출을 'rebuilds the past'라고 규정했으므로, 단순 반복이 아니라 세부를 흡수하며 고쳐 쓴다는 'quietly revise it'이 유일하게 지목됩니다.",
};

// ── ① 정상 왕복: parseAndGate 클린 → 코어스 무발동 → 레인 adapt ok ──────────
{
  const parsed = FILL_BLANK_KEY_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("정상 픽스처: 코어스 무발동", parsed.corrections.length === 0, parsed.corrections.join("; "));

  const adapt = FILL_BLANK_KEY_MD_LANE.adapt(parsed, ctx);
  const ai = adapt.aiQuestion as Record<string, unknown> | undefined;
  check(
    "레인 어댑터 왕복: ok + 결정형 발문 + options 키 부재",
    adapt.ok === true &&
      !!ai &&
      ai.direction === "다음 빈칸에 들어갈 알맞은 말을 본문에서 찾아 쓰시오." &&
      !("options" in (ai ?? {})),
    adapt.error,
  );
  const accepted = (ai?.acceptedAnswers ?? []) as string[];
  check(
    "허용답 집합: 정답이 선두(어댑터 결정론 조립)",
    accepted[0] === "quietly revise it",
    JSON.stringify(accepted),
  );

  if (ai) {
    const surface = FILL_BLANK_KEY_LUNA_EXT.renderEvalSurface(ai, PASSAGE);
    check(
      "평가 표면: 발문+빈칸 뚫린 지문, 정답 무노출",
      surface.includes("다음 빈칸에 들어갈 알맞은 말") &&
        surface.includes("_____") &&
        surface.includes("Witnesses who retell an event repeatedly") &&
        !surface.includes("quietly revise it"),
      surface.slice(0, 160),
    );
    console.log("── 평가 표면 표본 ──\n" + surface + "\n──");
  }
}

// ── ② 코어스 검증 (발동 2종 — 무발동은 ①에서 검증) ─────────────────────────
{
  const wideBlank = {
    ...GOOD,
    sentenceWithBlank: GOOD.sentenceWithBlank.replace("_____", "__________"),
  };
  const p1 = FILL_BLANK_KEY_LUNA_EXT.parseAndGate(JSON.stringify(wideBlank), ctx);
  check(
    "코어스: 빈칸 마커 폭 정규화 발동 + 게이트 클린",
    p1.corrections.some((c) => c.includes("마커 폭")) && p1.gateIssues.length === 0,
    `corrections=${JSON.stringify(p1.corrections)} issues=${p1.gateIssues.join("; ")}`,
  );

  const noBlank = { ...GOOD, sentenceWithBlank: TARGET_SENTENCE };
  const p2 = FILL_BLANK_KEY_LUNA_EXT.parseAndGate(JSON.stringify(noBlank), ctx);
  const q2 = p2.question as { sentenceWithBlank: string } | null;
  check(
    "코어스: 빈칸 미표기 문장에서 정답 스팬 치환 + 게이트 클린",
    p2.corrections.some((c) => c.includes("치환")) &&
      p2.gateIssues.length === 0 &&
      !!q2 &&
      q2.sentenceWithBlank.includes("_____"),
    `corrections=${JSON.stringify(p2.corrections)} issues=${p2.gateIssues.join("; ")}`,
  );
}

// ── ③ 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  const frameAltered = {
    ...GOOD,
    sentenceWithBlank: GOOD.sentenceWithBlank.replace("repeatedly", "many times"),
  };
  check(
    "음성테스트: 프레임 변조(원문과 불일치) 반려",
    has(FILL_BLANK_KEY_LUNA_EXT.parseAndGate(JSON.stringify(frameAltered), ctx).gateIssues, "되끼운 문장이 지문에 없음"),
  );

  const notVerbatim = { ...GOOD, answer: "silently revise it" };
  check(
    "음성테스트: 정답 비축자(지문에 없는 표현) 반려",
    has(FILL_BLANK_KEY_LUNA_EXT.parseAndGate(JSON.stringify(notVerbatim), ctx).gateIssues, "축자로 없음"),
  );

  const twoBlanks = {
    ...GOOD,
    sentenceWithBlank:
      "Witnesses who retell an event repeatedly do not simply _____; they _____, absorbing details from questions, newspapers, and other people's accounts.",
  };
  check(
    "음성테스트: 빈칸 2개 반려",
    has(FILL_BLANK_KEY_LUNA_EXT.parseAndGate(JSON.stringify(twoBlanks), ctx).gateIssues, "빈칸이 2개"),
  );

  const hallucinatedQuote = {
    ...GOOD,
    explanation:
      "빈칸 문장은 목격자 기억의 변형을 보여 주는 자리입니다. 지문이 'the fallibility of recollection'이라고 명시했으므로 정답이 유일하게 지목됩니다.",
  };
  check(
    "음성테스트: 해설 환각 인용(지문에 없는 영어) 반려",
    has(FILL_BLANK_KEY_LUNA_EXT.parseAndGate(JSON.stringify(hallucinatedQuote), ctx).gateIssues, "환각 인용"),
  );

  const oneWordAnswer = { ...GOOD, answer: "revise" };
  check(
    "음성테스트: 1단어 정답(채점 붕괴) 반려",
    has(FILL_BLANK_KEY_LUNA_EXT.parseAndGate(JSON.stringify(oneWordAnswer), ctx).gateIssues, "1단어"),
  );

  // 1차 벤치 실측 결함(luna, cmsilz13z…): finishReason "stop" 인데도 해설이
  // "…결론입니다. 앞서" 에서 끊긴 채 게이트를 통과했다 → ext 자체 검사로 반려.
  const truncatedExplanation = {
    ...GOOD,
    explanation:
      "빈칸 문장은 기억이 회상할 때마다 다시 만들어진다는 글의 논지를 목격자 사례로 구체화하는 자리입니다. 앞서",
  };
  check(
    "음성테스트: 해설 미완결 절단(문장부호 없이 끊김) 반려",
    has(
      FILL_BLANK_KEY_LUNA_EXT.parseAndGate(JSON.stringify(truncatedExplanation), ctx).gateIssues,
      "미완결",
    ),
  );

  const nonPoliteEnding = {
    ...GOOD,
    explanation:
      "빈칸 문장은 기억이 회상할 때마다 다시 만들어진다는 글의 논지를 목격자 사례로 구체화하는 자리입니다. 바로 앞 문장이 기억 인출을 'rebuilds the past'라고 규정하므로 정답은 하나로 좁혀진다.",
  };
  check(
    "음성테스트: 해설 종결 문체 이탈(합쇼체 아님) 반려",
    has(
      FILL_BLANK_KEY_LUNA_EXT.parseAndGate(JSON.stringify(nonPoliteEnding), ctx).gateIssues,
      "합쇼체",
    ),
  );

  const parseFail = FILL_BLANK_KEY_LUNA_EXT.parseAndGate("{broken json", ctx);
  check(
    "음성테스트: JSON 파손 → gateIssues 반환(throw 금지)",
    parseFail.question === null && has(parseFail.gateIssues, "파싱 실패"),
  );
}

// ── ③-b 표적 확정성 결정형 장치 (2차 수리 — r2 F 계통 3종) ──────────────────
{
  const gate = (fx: Record<string, string>) =>
    FILL_BLANK_KEY_LUNA_EXT.parseAndGate(JSON.stringify(fx), ctxD);

  // D1 극성 — 빈칸이 필자가 부정하는 통념 안(r2 Q15 'crying out in pain').
  const polarity = gate({
    sentenceWithBlank: "Sports scientists do not think tired athletes are _____.",
    answer: "losing their edge",
    explanation: EXPL_D,
  });
  check(
    "음성테스트 D1: 부정하는 통념 자리(부정 극성) 반려",
    has(polarity.gateIssues, "부정하는 통념"),
    polarity.gateIssues.join("; "),
  );

  // D1 축약형 — `n't` 는 앞이 반드시 낱자라 룩비하인드에 묶으면 영원히 무검출이다
  // (실측 r2 Q15 "experts don't think plants are _____" 가 이 한 글자로 새어 나갔다).
  const contraction = gate({
    sentenceWithBlank: "Trainers don't call these dips a _____.",
    answer: "collapse of will",
    explanation: EXPL_D,
  });
  check(
    "음성테스트 D1': 축약형 부정(don't) 자리도 반려 — 회귀 가드",
    has(contraction.gateIssues, "부정하는 통념"),
    contraction.gateIssues.join("; "),
  );

  // D1 무발동 — "not X but Y" 의 Y 자리는 정상 표적이다(절 경계 뒤 구간만 본다).
  const goodTarget = gate({
    sentenceWithBlank: "Planned rest _____, and resilient athletes recover far faster.",
    answer: "rebuilds resilience",
    explanation: EXPL_D,
  });
  check(
    "정상 표적(어근 resili- 가 지문에 실재): 신규 검사 전부 침묵",
    goodTarget.gateIssues.length === 0,
    goodTarget.gateIssues.join("; "),
  );

  // D3 어휘 앵커 — 파생명사의 어근이 지문에 0건(r2 Q09 'emotional investment').
  const noStem = gate({
    sentenceWithBlank: "It is more likely that these slumps reflect a _____.",
    answer: "hidden fragility",
    explanation: EXPL_D,
  });
  check(
    "음성테스트 D3-a: 파생명사 어근이 지문에 없음 반려",
    has(noStem.gateIssues, "어근"),
    noStem.gateIssues.join("; "),
  );

  // D3 하이픈 합성어 — 구성 요소가 지문에 0건(r1 Q19 'knee-jerk survival actions').
  const compound = gate({
    sentenceWithBlank: "Some coaches still demand _____ from injured players.",
    answer: "knee-jerk sacrifices",
    explanation: EXPL_D,
  });
  check(
    "음성테스트 D3-b: 하이픈 합성어 구성요소 근거 부재 반려",
    has(compound.gateIssues, "합성어"),
    compound.gateIssues.join("; "),
  );

  // D3 의성·리듬 반복어(r1 Q13 'steady drip-drip-drip manner').
  const reduplication = gate({
    sentenceWithBlank: "The damage arrives in a slow _____ that nobody notices.",
    answer: "drip-drip-drip rhythm",
    explanation: EXPL_D,
  });
  check(
    "음성테스트 D3-c: 의성·리듬 반복 표현 반려",
    has(reduplication.gateIssues, "반복하는 의성"),
    reduplication.gateIssues.join("; "),
  );

  // D2 코어스 — 빈칸 직후 of 보충어를 스팬 안으로 확장해 답형을 고정(r2 Q16).
  const dangling = gate({
    sentenceWithBlank: "Careful scheduling _____ of the long season on young players.",
    answer: "reduces the strain",
    explanation: EXPL_D,
  });
  const dq = dangling.question as { answer: string; sentenceWithBlank: string } | null;
  check(
    "코어스 D2: 빈칸 직후 of 보충어를 정답 스팬으로 확장 + 게이트 클린",
    dangling.gateIssues.length === 0 &&
      !!dq &&
      dq.answer === "reduces the strain of the long season" &&
      dq.sentenceWithBlank === "Careful scheduling _____ on young players.",
    `issues=${dangling.gateIssues.join("; ")} q=${JSON.stringify(dq)}`,
  );

  // D2 반려 — 확장하면 단어 상한(7)을 넘어 교정 불가 → 게이트 이슈로 승격.
  const danglingHard = gate({
    sentenceWithBlank: "Careful _____ of the long season on young players.",
    answer: "scheduling reduces the strain",
    explanation: EXPL_D,
  });
  check(
    "음성테스트 D2: 교정 불가한 스팬 경계 파손(of 구 잔류) 반려",
    has(danglingHard.gateIssues, "명사구 한가운데서 끊겨"),
    danglingHard.gateIssues.join("; "),
  );
}

// ── ④ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(FILL_BLANK_KEY_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 빈칸문장·정답·해설 방류 + JSON 무노출`,
      out.includes("빈칸문장: Witnesses who retell") &&
        out.includes("_____") &&
        out.includes("\n정답: quietly revise it") &&
        out.includes("\n해설: 빈칸 문장은") &&
        !out.includes("{") &&
        !out.includes('"answer"') &&
        !out.includes('"sentenceWithBlank"'),
      out.slice(0, 150),
    );
  }
}

// ── ⑤ 스키마·검산 블록 형상 ─────────────────────────────────────────────────
{
  const spec = FILL_BLANK_KEY_LUNA_EXT.buildJsonSchema(ctx);
  const schema = spec.schema as Record<string, any>;
  check(
    "스키마: strict + additionalProperties:false + 3필드 + acceptedAnswers 부재(구조적 소멸)",
    spec.strict === true &&
      schema.additionalProperties === false &&
      JSON.stringify(schema.required) ===
        JSON.stringify(["sentenceWithBlank", "answer", "explanation"]) &&
      !("acceptedAnswers" in schema.properties) &&
      Object.keys(schema.properties)[0] === "sentenceWithBlank",
  );

  const basic = FILL_BLANK_KEY_LUNA_EXT.buildJsonSchema({ ...ctx, difficulty: "BASIC" });
  const basicSchema = basic.schema as Record<string, any>;
  check(
    "동적 스키마: 난이도별 정답 폭 힌트(BASIC 2~3 / KILLER 2~5)",
    basicSchema.properties.answer.description.includes("2~3단어") &&
      schema.properties.answer.description.includes("2~5단어"),
  );

  const selfcheck = FILL_BLANK_KEY_LUNA_EXT.buildSelfcheck(ctx);
  check(
    "검산 블록: 사다리 + 게이트 반려 조건 전사",
    selfcheck.includes("1순위") &&
      selfcheck.includes("양보") &&
      selfcheck.includes("정확히 1회") &&
      selfcheck.includes("2~7단어") &&
      selfcheck.includes("첫 문장") &&
      selfcheck.includes("합쇼체") &&
      selfcheck.includes("환각"),
  );

  check(
    "검산 블록: 표적 선정 절차 4검사(A 어휘 앵커·B 본문 동치·C 극성·D 스팬 경계) 공개",
    selfcheck.includes("어휘 앵커") &&
      selfcheck.includes("본문 동치 어구") &&
      selfcheck.includes("극성") &&
      selfcheck.includes("스팬 경계") &&
      selfcheck.includes("후보 3개") &&
      selfcheck.includes("끝까지 다 써라"),
  );

  check(
    "검산 블록: 사다리에 실제 탈출구 명시(막히면 무엇을 양보하는지)",
    selfcheck.includes("탈출구") &&
      selfcheck.includes("3순위를 양보") &&
      selfcheck.includes("재활용"),
  );
}

// ── ⑥ 표기 변형 결정론 파생 (서술형 특칙 — acceptedAnswers 는 시스템이 만든다) ──
{
  const adapt = FILL_BLANK_KEY_MD_LANE.adapt(
    {
      question: {
        kind: "fill-blank-key",
        sentenceWithBlank: "They _____ when the plan fails.",
        answer: "do not give up",
        acceptedAnswers: [],
        explanation: "테스트 해설입니다.",
      },
      gateIssues: [],
      corrections: [],
    },
    ctx,
  );
  const accepted = (adapt.aiQuestion?.acceptedAnswers ?? []) as string[];
  check(
    "허용답 파생: 축약형 변형 자동 포함(do not give up → don't give up)",
    adapt.ok === true &&
      accepted[0] === "do not give up" &&
      accepted.some((a) => a.toLowerCase() === "don't give up"),
    JSON.stringify(accepted),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
