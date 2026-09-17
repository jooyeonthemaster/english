// TOPIC_MAIN_IDEA luna 확장 픽스처 테스트 — SPEC §3 계약.
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-topic-main-idea.ts
import { TOPIC_MAIN_IDEA_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/topic-main-idea";
import { TOPIC_MAIN_IDEA_MD_LANE } from "../src/lib/md-qgen/lane-topic-main-idea";
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
  "Many city planners once believed that wider roads would ease congestion. " +
  "When extra lanes opened, however, commuters who had avoided driving returned to the road, and traffic soon grew to fill the added space. " +
  "Researchers call this induced demand, and it has been observed in cities on every continent. " +
  "The real lesson is that congestion is shaped less by the amount of asphalt than by the choices people make when travel becomes easier.";

const EVIDENCE =
  "The real lesson is that congestion is shaped less by the amount of asphalt than by the choices people make when travel becomes easier.";

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
// 보기 언어 en = 주제 모드(영어 명사구 선지) — 레인과 같은 결정 소스.
const ctxTopic: MdLaneContext = { ...ctx, rawTypeSettings: { optionLanguage: "en" } };
const ctx6: MdLaneContext = {
  ...ctx,
  resolved: { genericOptionCount: 6, genericAnswerCount: 2 },
};
const ctxNeg: MdLaneContext = { ...ctx, resolved: { answerPolarity: "NEGATIVE" } };

// 기본 ctx(요지 모드: 한국어 진술문 5지 1답). 오답 라벨은 일부러 비정렬(코어스 검증).
const GOOD = {
  evidence: EVIDENCE,
  options: [
    { label: "①", text: "도로를 넓히면 혼잡이 곧 풀린다는 계획가들의 통념은 여전히 유효하다." },
    { label: "②", text: "혼잡의 정도는 도로의 양보다 이동이 쉬워졌을 때 사람들이 내리는 선택에 달려 있다." },
    { label: "③", text: "유도 수요는 모든 대륙의 도시에서 관찰된 보편적 현상이다." },
    { label: "④", text: "정부는 도로 확장 대신 대중교통 투자로 정책 방향을 돌려야 한다." },
    { label: "⑤", text: "차선 증설 공사는 완공까지 교통 흐름을 크게 방해한다." },
  ],
  answers: ["②"],
  explanation:
    "근거문장은 혼잡이 아스팔트의 양보다 이동이 쉬워졌을 때의 선택에 의해 형성된다고 말합니다. 도로 확장의 실패 사례와 유도 수요 개념이 전부 이 결론으로 수렴하므로 사람들의 선택이 혼잡을 좌우한다는 진술이 요지로 가장 적절합니다.",
  wrong: [
    { label: "⑤", text: "차선 공사의 불편은 지문에 근거가 없는 통념형 서술입니다." },
    { label: "①", text: "글이 반박하는 도입부의 통념을 요지로 승격한 함정입니다." },
    { label: "④", text: "대중교통 투자는 지문이 내리지 않은 처방으로 밀고 나간 선지입니다." },
    { label: "③", text: "유도 수요의 관찰 범위는 예시 층위의 세부 정보에 머무는 진술입니다." },
  ],
};

// 주제 모드(영어 명사구 5지 1답).
const GOOD_TOPIC = {
  evidence: EVIDENCE,
  options: [
    { label: "①", text: "the lasting belief that road expansion smooths urban traffic" },
    { label: "②", text: "the dependence of congestion on travel choices rather than road supply" },
    { label: "③", text: "the engineering challenges of adding lanes to old highways" },
    { label: "④", text: "the need to remove private cars from crowded city centers" },
    { label: "⑤", text: "statistical tools for measuring commuter behavior worldwide" },
  ],
  answers: ["②"],
  explanation:
    "근거문장은 혼잡이 아스팔트의 양보다 사람들의 선택에 의해 형성된다고 말합니다. 글 전체가 도로 공급이 아니라 통행 선택이 혼잡을 좌우한다는 관점으로 수렴하므로 해당 명사구가 주제로 가장 적절합니다.",
  wrong: [
    { label: "①", text: "글이 반박하는 도입부의 통념을 주제로 삼은 함정입니다." },
    { label: "③", text: "공학적 난점은 지문이 다루지 않는 소재입니다." },
    { label: "④", text: "승용차 퇴출은 지문에 없는 처방으로 밀고 나간 선지입니다." },
    { label: "⑤", text: "통계 도구는 예시 층위에도 없는 통념형 서술입니다." },
  ],
};

// 6지 2답(교사 설정) — 정답 라벨을 일부러 비정렬(기록 코어스 발동 검증).
const GOOD6 = {
  evidence: EVIDENCE,
  options: [
    { label: "①", text: "도로 확장은 여전히 혼잡 해소의 가장 확실한 수단이다." },
    { label: "②", text: "이동이 쉬워지면 사람들의 선택이 혼잡을 다시 만들어 낸다." },
    { label: "③", text: "유도 수요는 일부 대도시에서만 나타나는 예외적 현상이다." },
    { label: "④", text: "혼잡을 좌우하는 것은 아스팔트의 양이 아니라 통행자의 선택이다." },
    { label: "⑤", text: "차량 통행량 통계는 도시 계획의 핵심 자료로 쓰인다." },
    { label: "⑥", text: "도로 정책은 건설 비용과 편익을 함께 고려해야 한다." },
  ],
  answers: ["④", "②"],
  explanation:
    "근거문장은 혼잡이 아스팔트의 양보다 사람들의 선택에 의해 형성된다고 말합니다. 선택이 혼잡을 다시 만든다는 진술과 통행자의 선택이 혼잡을 좌우한다는 진술이 모두 이 논지를 담고 있으므로 정답으로 적절합니다.",
  wrong: [
    { label: "⑥", text: "비용과 편익의 고려는 지문이 내리지 않은 처방입니다." },
    { label: "①", text: "글이 반박하는 통념을 그대로 옮긴 선지입니다." },
    { label: "⑤", text: "통계 활용은 지문에 근거가 없는 서술입니다." },
    { label: "③", text: "지문은 유도 수요가 모든 대륙에서 관찰됐다고 말하므로 지문과 어긋납니다." },
  ],
};

// ── ① 정상 왕복 (요지 모드): 게이트 클린 → 레인 adapt ok ────────────────────
{
  const parsed = TOPIC_MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상(요지): 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("정상(요지): 무발동 — corrections 비어 있음", parsed.corrections.length === 0, parsed.corrections.join("; "));
  const q = parsed.question as { wrong: Array<{ label: string }> };
  check(
    "코어스(무기록): 오답 해설 라벨 정렬 발동",
    q.wrong.map((w) => w.label).join("") === "①③④⑤",
    q.wrong.map((w) => w.label).join(""),
  );
  const adapt = TOPIC_MAIN_IDEA_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복(요지): ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    check("어댑터: correctAnswer 숫자 축", adapt.aiQuestion.correctAnswer === "2", String(adapt.aiQuestion.correctAnswer));
    const surface = TOPIC_MAIN_IDEA_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면(요지): 발문+지문+원문자 선지 렌더",
      surface.includes("요지") &&
        surface.includes(PASSAGE.slice(0, 40)) &&
        surface.includes("② 혼잡의 정도는") &&
        surface.includes("⑤ 차선 증설"),
      surface.slice(0, 120),
    );
    console.log("── 평가 표면 표본(요지) ──\n" + surface + "\n──");
  }
}

// ── ② 정상 왕복 (주제 모드 = 보기 언어 en): 게이트 클린 → adapt ok ──────────
{
  const parsed = TOPIC_MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(GOOD_TOPIC), ctxTopic);
  check("정상(주제): 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  const adapt = TOPIC_MAIN_IDEA_MD_LANE.adapt(parsed, ctxTopic);
  check("레인 어댑터 왕복(주제): ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const surface = TOPIC_MAIN_IDEA_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면(주제): 주제 발문 + 영어 명사구 선지",
      surface.includes("주제") && surface.includes("② the dependence of congestion"),
      surface.slice(0, 120),
    );
    console.log("── 평가 표면 표본(주제) ──\n" + surface.split("\n\n")[0] + " …(지문 생략)…\n" + surface.split("\n\n")[2] + "\n──");
  }
}

// ── ③ 코어스 검증 (발동/무발동) ─────────────────────────────────────────────
{
  // 발동 1: 정답 라벨 비정렬(6지 2답) → 오름차순 코어스 + 기록.
  const parsed6 = TOPIC_MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(GOOD6), ctx6);
  check("6지 2답: 게이트 클린", parsed6.gateIssues.length === 0, parsed6.gateIssues.join("; "));
  const q6 = parsed6.question as { answers: string[] };
  check(
    "코어스 발동: 정답 라벨 오름차순 + 기록",
    q6.answers.join("") === "②④" && has(parsed6.corrections, "오름차순"),
    `${q6.answers.join("")} / ${parsed6.corrections.join("; ")}`,
  );
  const adapt6 = TOPIC_MAIN_IDEA_MD_LANE.adapt(parsed6, ctx6);
  check(
    "레인 어댑터 왕복(복수 정답): ok + correctAnswers",
    adapt6.ok === true &&
      adapt6.aiQuestion?.correctAnswer === "2, 4" &&
      JSON.stringify(adapt6.aiQuestion?.correctAnswers) === '["2","4"]',
    adapt6.error ?? JSON.stringify(adapt6.aiQuestion?.correctAnswers),
  );
  // 발동 2: 근거문장 구두점 드리프트(종결 마침표 누락) → 레인 스냅이 축자 복원.
  const drift = { ...GOOD, evidence: EVIDENCE.slice(0, -1) };
  const parsedDrift = TOPIC_MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(drift), ctx);
  check(
    "코어스 발동: 근거문장 축자 보정(레인 스냅 재사용)",
    parsedDrift.gateIssues.length === 0 && has(parsedDrift.corrections, "근거문장"),
    `${parsedDrift.gateIssues.join("; ")} / ${parsedDrift.corrections.join("; ")}`,
  );
  // 무발동은 ①에서 검증(GOOD corrections 비어 있음).
}

// ── ④ 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  const short = { ...GOOD, options: GOOD.options.slice(0, 4) };
  check(
    "음성테스트: 선지 4개 반려",
    has(TOPIC_MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(short), ctx).gateIssues, "선지 4개"),
  );
  const paraphrased = {
    ...GOOD,
    evidence: "Congestion is mostly caused by the choices people make in daily travel.",
  };
  check(
    "음성테스트: 근거문장 재진술 반려(축자 아님)",
    has(TOPIC_MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(paraphrased), ctx).gateIssues, "축자로 없음"),
  );
  const fragment = {
    ...GOOD,
    evidence: "congestion is shaped less by the amount of asphalt",
  };
  check(
    "음성테스트: 문장 중간 조각 반려(완결 문장 아님)",
    has(TOPIC_MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(fragment), ctx).gateIssues, "완결된 한 문장이 아님"),
  );
  const englishMixed = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 2 ? { ...o, text: "Induced demand appears everywhere." } : o,
    ),
  };
  check(
    "음성테스트: 요지 모드에 영어 선지 반려",
    has(TOPIC_MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(englishMixed), ctx).gateIssues, "한국어 진술문이 아님"),
  );
  const answerInWrong = {
    ...GOOD,
    wrong: [...GOOD.wrong.slice(0, 3), { label: "②", text: "정답 라벨이 오답 목록에 끼었습니다." }],
  };
  check(
    "음성테스트: 오답 해설에 정답 라벨 반려",
    has(TOPIC_MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(answerInWrong), ctx).gateIssues, "정답 라벨"),
  );
  const verbatimOption = {
    ...GOOD_TOPIC,
    options: GOOD_TOPIC.options.map((o, i) =>
      i === 4 ? { ...o, text: "commuters who had avoided driving returned to the road" } : o,
    ),
  };
  check(
    "음성테스트: 주제 모드 지문 축자 복사 선지 반려",
    has(TOPIC_MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(verbatimOption), ctxTopic).gateIssues, "축자 복사"),
  );
  const numericMention = {
    ...GOOD,
    explanation: "글의 결론을 가장 잘 접은 2번 선지가 요지로 적절합니다.",
  };
  check(
    "음성테스트: 해설의 선지 번호 지칭 반려",
    has(TOPIC_MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(numericMention), ctx).gateIssues, "번호로 지칭"),
  );
  // md 파서는 정답 라벨을 dedupe 한다 — JSON 경로도 동형이어야 "②,②" 가
  // 정답 2개로 게이트를 통과하는 구멍(스키마는 중복을 못 막는다)이 닫힌다.
  const dupAnswers = { ...GOOD6, answers: ["②", "②"] };
  check(
    "음성테스트: 정답 라벨 중복 → dedupe 후 개수 반려",
    has(TOPIC_MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(dupAnswers), ctx6).gateIssues, "정답 1개"),
  );
  const parseFail = TOPIC_MAIN_IDEA_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)", has(parseFail.gateIssues, "파싱 실패"));
}

// ── ⑤ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(TOPIC_MAIN_IDEA_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 근거문장·선지·정답·해설 방류 + JSON 무노출`,
      out.includes("근거문장: The real lesson") &&
        out.includes("\n① 도로를 넓히면") &&
        out.includes("\n정답: ②") &&
        out.includes("\n해설: ") &&
        out.includes("\n⑤ 차선 공사의 불편") &&
        !out.includes("{") &&
        !out.includes('"label"'),
      out.slice(0, 150),
    );
  }
}

// ── ⑥ 동적 스키마·검산 블록: 설정 반영 ──────────────────────────────────────
{
  const spec = TOPIC_MAIN_IDEA_LUNA_EXT.buildJsonSchema(ctx6);
  const schema = spec.schema as Record<string, any>;
  check(
    "동적 스키마: 선지 6·정답 2·오답 4·라벨 enum 6",
    spec.strict === true &&
      schema.additionalProperties === false &&
      schema.properties.options.minItems === 6 &&
      schema.properties.answers.minItems === 2 &&
      schema.properties.answers.maxItems === 2 &&
      schema.properties.wrong.minItems === 4 &&
      schema.properties.options.items.properties.label.enum.length === 6,
  );
  check(
    "스키마 필드 순서: evidence(본문성 정박점) 최선두",
    Object.keys(schema.properties)[0] === "evidence",
    Object.keys(schema.properties).join(","),
  );
  const specTopic = TOPIC_MAIN_IDEA_LUNA_EXT.buildJsonSchema(ctxTopic);
  const topicSchema = specTopic.schema as Record<string, any>;
  check(
    "동적 스키마: 주제 모드 — 선지 설명이 영어 명사구",
    String(topicSchema.properties.options.items.properties.text.description).includes("명사구"),
  );
  check("검산 블록: 설정 실값 반영(6지)", TOPIC_MAIN_IDEA_LUNA_EXT.buildSelfcheck(ctx6).includes("정확히 6개"));
  const scDefault = TOPIC_MAIN_IDEA_LUNA_EXT.buildSelfcheck(ctx);
  check(
    "검산 블록(요지·긍정): 진술문 규칙 + 정답 포괄성 + 사다리",
    scDefault.includes("정확히 5개") &&
      scDefault.includes("한국어 **완결 진술문**") &&
      scDefault.includes("글 전체를 포괄") &&
      scDefault.includes("1순위 판정 확정성"),
  );
  const scTopic = TOPIC_MAIN_IDEA_LUNA_EXT.buildSelfcheck(ctxTopic);
  check("검산 블록(주제): 영어 명사구 규칙", scTopic.includes("영어 **명사구**") && scTopic.includes("축자 복사로 반려"));
  const scNeg = TOPIC_MAIN_IDEA_LUNA_EXT.buildSelfcheck(ctxNeg);
  check(
    "검산 블록(부정 극성): 정답=부적절 선지로 반전",
    scNeg.includes("부적절한 선지") && !scNeg.includes("글 전체를 포괄하는 요지여야"),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
