// TOPIC luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약, 견본: _test-luna-ext-title.ts).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-topic.ts
import { TOPIC_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/topic";
import { TOPIC_MD_LANE } from "../src/lib/md-qgen/lane-topic";
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
  "For decades, urban planners assumed that adding more lanes was the only cure for traffic congestion. " +
  "Yet cities that widened their highways found the extra space filled within a few years, as easier driving invited more trips. " +
  "Economists call this induced demand: capacity creates its own traffic. " +
  "Recent projects in Seoul and San Francisco reversed the logic, removing elevated roads entirely, and congestion did not worsen while surrounding neighborhoods revived. " +
  "The evidence suggests that the way out of gridlock lies not in pouring more asphalt but in rethinking why people drive at all.";

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
  options: [
    { label: "①", text: "the economic benefits of building wider urban highways" },
    { label: "②", text: "why expanding road capacity fails to relieve congestion" },
    { label: "③", text: "the history of elevated highway construction in Asia" },
    { label: "④", text: "public opposition to removing roads from city centers" },
    { label: "⑤", text: "how commuters choose between cars and public transit" },
  ],
  answers: ["②"],
  explanation:
    "도로를 넓혀도 유발 수요가 그 용량을 다시 채워 정체가 해소되지 않는다는 것이 글의 중심 논지입니다. 따라서 용량 확대가 정체 해소에 실패하는 이유가 주제로 가장 적절합니다.",
  // 일부러 라벨 비오름차순 — 코어스(정렬)가 발동해야 한다.
  wrong: [
    { label: "⑤", text: "통근 수단 선택 과정은 지문이 다루지 않는 범위 밖의 내용입니다." },
    { label: "①", text: "확장의 이점을 내세우는 것은 글의 평가 방향을 뒤집은 관점 반전입니다." },
    { label: "④", text: "도로 철거에 대한 주민 반대는 지문에 근거가 없는 통념입니다." },
    { label: "③", text: "고가도로 건설의 역사는 사례 일부로 초점을 좁힌 세부 함정입니다." },
  ],
};

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok ─────────────────────────
{
  const parsed = TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  const q = parsed.question as { answer: string; wrong: Array<{ label: string }> };
  check(
    "코어스: 오답 라벨 정렬 발동",
    q.wrong.map((w) => w.label).join("") === "①③④⑤",
    q.wrong.map((w) => w.label).join(""),
  );
  check("파서 동형: answer 편의 접근자 = answers[0]", q.answer === "②", q.answer);
  check("코어스 무발동: 깨끗한 픽스처에 corrections 없음", parsed.corrections.length === 0);
  const adapt = TOPIC_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    check(
      "어댑터: 발문 결정론(ko·단일·POSITIVE) + 저장 라벨 축",
      adapt.aiQuestion.direction === "다음 글의 주제로 가장 적절한 것은?" &&
        adapt.aiQuestion.correctAnswer === "2",
      `${String(adapt.aiQuestion.direction)} / ${String(adapt.aiQuestion.correctAnswer)}`,
    );
    const surface = TOPIC_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+지문+선지 렌더",
      surface.includes("주제") &&
        surface.includes(PASSAGE.slice(0, 40)) &&
        surface.includes("② why expanding road capacity"),
      surface.slice(0, 120),
    );
    console.log("── 평가 표면 표본 ──\n" + surface.slice(0, 320) + "\n──");
  }
}

// ── ② 게이트 음성테스트 (계기 검증 — 위반이 울리는지) ───────────────────────
{
  const short = { ...GOOD, options: GOOD.options.slice(0, 4) };
  check(
    "음성테스트: 선지 4개 반려",
    TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(short), ctx).gateIssues.length > 0,
  );
  const answerInWrong = {
    ...GOOD,
    wrong: [...GOOD.wrong.slice(0, 3), { label: "②", text: "정답 라벨이 오답 목록에 끼었습니다." }],
  };
  check(
    "음성테스트: 오답 목록에 정답 라벨 반려",
    has(TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(answerInWrong), ctx).gateIssues, "정답 라벨"),
  );
  const koMixed = {
    ...GOOD,
    options: GOOD.options.map((o, i) => (i === 2 ? { ...o, text: "도시 고가도로의 역사" } : o)),
  };
  check(
    "음성테스트: 언어 혼입 반려(en 설정에 한국어 선지)",
    has(TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(koMixed), ctx).gateIssues, "한국어"),
  );
  const answerLeak = {
    ...GOOD,
    options: GOOD.options.map((o, i) => (i === 1 ? { ...o, text: `${o.text} (정답)` } : o)),
  };
  check(
    "음성테스트: 선지 정답 표시 누출 반려",
    has(TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(answerLeak), ctx).gateIssues, "정답 표시"),
  );
  const verbatim = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 4 ? { ...o, text: "capacity creates its own traffic" } : o,
    ),
  };
  check(
    "음성테스트: 지문 축자 복사 선지 반려",
    has(TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(verbatim), ctx).gateIssues, "그대로"),
  );
  // r1 판정 수리 — 선지 쌍 형상(축자 공유·거울쌍). 계기가 울리는지 확인한다.
  const twin = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 2
        ? { ...o, text: "why expanding road capacity manages to relieve congestion" }
        : o,
    ),
  };
  check(
    "음성테스트: 선지 축자 공유(연속 4단어) 반려",
    has(TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(twin), ctx).gateIssues, "연속으로 그대로 공유"),
    TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(twin), ctx).gateIssues.join("; "),
  );
  const mirror = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 0
        ? { ...o, text: "the primacy of wider roads over fewer trips in cities" }
        : i === 2
          ? { ...o, text: "the primacy of fewer trips over wider roads in cities" }
          : o,
    ),
  };
  check(
    "음성테스트: 낱말만 뒤집은 거울쌍 반려",
    has(TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(mirror), ctx).gateIssues, "거울쌍"),
    TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(mirror), ctx).gateIssues.join("; "),
  );
  const parseFail = TOPIC_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)", has(parseFail.gateIssues, "파싱 실패"));
  const wrongShape = TOPIC_LUNA_EXT.parseAndGate('{"foo": 1}', ctx);
  check("음성테스트: 형상 파손 JSON → gateIssues 반환(throw 금지)", has(wrongShape.gateIssues, "파싱 실패"));
}

// ── ③ 코어스: 발동/무발동 각 1 ──────────────────────────────────────────────
{
  // 발동: 마침표 표기 혼재 → autoSnap 이 떼는 쪽으로 통일(내용 무첨가)하고 게이트 클린.
  const mixedPeriod = {
    ...GOOD,
    options: GOOD.options.map((o, i) => (i === 4 ? { ...o, text: `${o.text}.` } : o)),
  };
  const snapped = TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(mixedPeriod), ctx);
  check(
    "코어스 발동: 마침표 혼재 → corrections 기록 + 게이트 클린",
    snapped.gateIssues.length === 0 && snapped.corrections.some((c) => c.includes("마침표")),
    `issues=${snapped.gateIssues.join("; ")} corrections=${snapped.corrections.join("; ")}`,
  );
  // 발동: 정답 라벨 중복 → 파서 관용과 동일하게 dedupe 되어 게이트 클린.
  const dupAnswers = { ...GOOD, answers: ["②", "②"] };
  const deduped = TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(dupAnswers), ctx);
  check(
    "코어스 발동: 정답 라벨 중복 dedupe → 게이트 클린",
    deduped.gateIssues.length === 0 &&
      (deduped.question as { answers: string[] }).answers.length === 1,
    deduped.gateIssues.join("; "),
  );
  // 발동: 영어 선지 대문자 시작 → 소문자 교정(반려 아님) + 게이트 클린.
  const capitalized = {
    ...GOOD,
    options: GOOD.options.map((o) => ({
      ...o,
      text: o.text.charAt(0).toUpperCase() + o.text.slice(1),
    })),
  };
  const cased = TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(capitalized), ctx);
  check(
    "코어스 발동: 선지 대문자 시작 → 소문자 교정 + 게이트 클린",
    cased.gateIssues.length === 0 &&
      cased.corrections.filter((c) => c.includes("소문자")).length === 5 &&
      (cased.question as { options: Array<{ text: string }> }).options.every((o) =>
        /^[a-z]/.test(o.text),
      ),
    `issues=${cased.gateIssues.join("; ")} corrections=${cased.corrections.join("; ")}`,
  );
  // 무발동: 고유명사로 시작하는 선지는 지문 증거로 보호된다(지문에 'Seoul' 중간 등장).
  const proper = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 2 ? { ...o, text: "Seoul's removal of elevated roads and its aftermath" } : o,
    ),
  };
  const properParsed = TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(proper), ctx);
  check(
    "코어스 무발동: 고유명사 시작 선지는 소문자화하지 않음",
    properParsed.corrections.every((c) => !c.includes("소문자")) &&
      (properParsed.question as { options: Array<{ text: string }> }).options[2].text.startsWith(
        "Seoul",
      ),
    properParsed.corrections.join("; "),
  );
  // 무발동은 ①에서도 검증(깨끗한 픽스처 corrections 0건 + 정렬 결과 확인).
}

// ── ④ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(TOPIC_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 선지·정답·해설 방류 + JSON 무노출`,
      out.includes("\n② why expanding road capacity") &&
        out.includes("\n정답: ②") &&
        out.includes("\n해설: ") &&
        out.includes("\n⑤ 통근 수단 선택 과정은") &&
        !out.includes("{") &&
        !out.includes('"label"'),
      out.slice(0, 150),
    );
  }
}

// ── ⑤ 동적 스키마·검산: 노브(선지수·정답수·언어·극성) 반영 ──────────────────
{
  const ctx6: MdLaneContext = {
    ...ctx,
    resolved: { genericOptionCount: 6, genericAnswerCount: 2 },
  };
  const spec = TOPIC_LUNA_EXT.buildJsonSchema(ctx6);
  const schema = spec.schema as Record<string, any>;
  check(
    "동적 스키마: 선지 6·정답 2·오답 4",
    spec.strict === true &&
      schema.additionalProperties === false &&
      schema.properties.options.minItems === 6 &&
      schema.properties.answers.minItems === 2 &&
      schema.properties.wrong.minItems === 4 &&
      schema.properties.options.items.properties.label.enum.length === 6,
  );
  const selfcheck6 = TOPIC_LUNA_EXT.buildSelfcheck(ctx6);
  check(
    "검산 블록: 설정 실값 + 사다리",
    selfcheck6.includes("정확히 6개") && selfcheck6.includes("정확히 2개") && selfcheck6.includes("1순위"),
  );
  check(
    "검산 블록: r1 수리 규칙(선지 쌍 형상·소문자 표기·해설 구조 서술)",
    selfcheck6.includes("거울쌍") &&
      selfcheck6.includes("4단어 이상 연속") &&
      selfcheck6.includes("소문자로 시작") &&
      selfcheck6.includes("논지 전환 이후"),
  );

  const ctxNeg: MdLaneContext = { ...ctx, resolved: { answerPolarity: "NEGATIVE" } };
  const negSchema = TOPIC_LUNA_EXT.buildJsonSchema(ctxNeg).schema as Record<string, any>;
  check(
    "동적 스키마: NEGATIVE 극성 반영(정답=부적절·wrong=타당 근거)",
    String(negSchema.properties.answers.description).includes("않은") &&
      String(negSchema.properties.wrong.items.properties.text.description).includes("타당"),
  );
  check(
    "검산 블록: NEGATIVE 복수정답 금지 규칙",
    TOPIC_LUNA_EXT.buildSelfcheck(ctxNeg).includes("복수정답"),
  );

  const ctxKo: MdLaneContext = { ...ctx, rawTypeSettings: { optionLanguage: "ko" } };
  const koSchema = TOPIC_LUNA_EXT.buildJsonSchema(ctxKo).schema as Record<string, any>;
  check(
    "동적 스키마: 선지 언어 ko 반영",
    String(koSchema.properties.options.items.properties.text.description).includes("한국어") &&
      TOPIC_LUNA_EXT.buildSelfcheck(ctxKo).includes("한국어 명사구"),
  );
  // ko 설정에서 영어 선지는 실제로 반려되어야 한다(검산-게이트 축 동기 검증).
  check(
    "음성테스트: ko 설정에 영어 선지 반려",
    has(TOPIC_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctxKo).gateIssues, "한국어가 없음"),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
