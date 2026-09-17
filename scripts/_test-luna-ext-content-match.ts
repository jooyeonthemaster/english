// CONTENT_MATCH luna 확장 픽스처 테스트 — SPEC §3 계약(견본: _test-luna-ext-title.ts).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-content-match.ts
import { CONTENT_MATCH_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/content-match";
import { CONTENT_MATCH_MD_LANE } from "../src/lib/md-qgen/lane-content-match";
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

// 7문장 지문 — 근거 5개(1·2·4·5·7번째 문장)가 지문 전역·등장순으로 흩어진다.
const S = [
  "For decades, city planners regarded street trees as mere decoration, budgeting for them only after roads and pipes had been funded.",
  "Recent measurements, however, show that a mature canopy can lower summer street temperatures by several degrees.",
  "The cooling effect does not appear overnight.",
  "A sapling planted today typically needs more than a decade before its shade produces any measurable drop in temperature.",
  "Because of this delay, researchers argue that tree planting should be treated as long-term infrastructure rather than as a quick fix.",
  "Some cities have already rewritten their zoning codes accordingly.",
  "In Melbourne, for example, every new development must now reserve space for canopy trees that will not reach full size until the 2040s.",
];
const PASSAGE = S.join(" ");

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

// 정본 픽스처 — 기본 설정(선지 5·정답 1·불일치·영문 선지). 정답 ③ = 조건·시점 탈락.
const GOOD = {
  options: [
    { label: "①", text: "Urban planners long treated roadside trees as ornamental extras, funding them only after basic infrastructure had been paid for." },
    { label: "②", text: "Data gathered in recent years indicate that streets shaded by fully grown trees stay noticeably cooler through the hottest months." },
    { label: "③", text: "A sapling put in the ground today will begin to cool its street within the first few summers after planting." },
    { label: "④", text: "Given the long wait for benefits, some researchers say urban tree planting deserves the status of durable infrastructure." },
    { label: "⑤", text: "One Australian city obliges new building projects to set aside room for trees that will only mature decades from now." },
  ],
  evidence: [
    { label: "①", sentence: S[0] },
    { label: "②", sentence: S[1] },
    { label: "③", sentence: S[3] },
    { label: "④", sentence: S[4] },
    { label: "⑤", sentence: S[6] },
  ],
  answers: ["③"],
  explanation:
    "지문은 오늘 심은 묘목이 측정 가능한 냉각 효과를 내기까지 10년 이상이 걸린다고 말합니다. ③은 심은 지 몇 해 안에 거리가 시원해진다고 하여 시점 조건이 어긋나므로 정답입니다.",
  wrong: [
    { label: "①", text: "첫 문장이 가로수를 장식으로 여겨 도로·관 다음에 예산을 배정했다고 말하므로 참입니다." },
    { label: "②", text: "성숙한 수관이 여름 기온을 낮춘다는 최근 측정 결과를 전하는 두 번째 문장과 맞아떨어집니다." },
    { label: "④", text: "연구자들이 나무 심기를 장기 기반 시설로 다루자고 주장한다는 문장이 이를 확정합니다." },
    { label: "⑤", text: "멜버른의 새 개발이 수십 년 뒤에야 다 자랄 나무 공간을 확보해야 한다는 문장과 일치합니다." },
  ],
};

// ── ① 정상 왕복: parseAndGate 클린 → 코어스 무발동 → 레인 adapt ok ──────────
{
  const parsed = CONTENT_MATCH_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("코어스 무발동: 정렬된 입력엔 보정 기록 없음", parsed.corrections.length === 0, parsed.corrections.join("; "));
  const adapt = CONTENT_MATCH_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const aq = adapt.aiQuestion as { direction?: string; correctAnswer?: string };
    check(
      "어댑터 산출: 발문 결정론 합성(불일치·ko) + 정답 축 3",
      aq.direction === "다음 글의 내용과 일치하지 않는 것은?" && aq.correctAnswer === "3",
      `direction='${aq.direction}' correctAnswer='${aq.correctAnswer}'`,
    );
    const surface = CONTENT_MATCH_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+지문+원문자 선지 렌더",
      surface.includes("일치하지 않는") &&
        surface.includes(PASSAGE.slice(0, 40)) &&
        surface.includes("① Urban planners") &&
        surface.includes("③ A sapling put in the ground"),
      surface.slice(0, 120),
    );
    console.log("── 평가 표면 실물 ──\n" + surface + "\n──");
  }
}

// ── ② 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  const short = { ...GOOD, options: GOOD.options.slice(0, 4) };
  check(
    "음성테스트: 선지 4개 반려",
    has(CONTENT_MATCH_LUNA_EXT.parseAndGate(JSON.stringify(short), ctx).gateIssues, "선지 4개"),
  );

  const fabricated = {
    ...GOOD,
    evidence: GOOD.evidence.map((e, i) =>
      i === 2 ? { label: "③", sentence: "Street trees also purify the air of a city within a single season." } : e,
    ),
  };
  check(
    "음성테스트: 지어낸 근거 반려",
    has(CONTENT_MATCH_LUNA_EXT.parseAndGate(JSON.stringify(fabricated), ctx).gateIssues, "지문에 없음"),
  );

  // 내용어 2개짜리 절 인용 — 스냅 보수 가드에 걸려 확장되지 않고 게이트가 반려해야 한다.
  const fragment = {
    ...GOOD,
    evidence: GOOD.evidence.map((e, i) => (i === 0 ? { label: "①", sentence: "mere decoration" } : e)),
  };
  check(
    "음성테스트: 근거가 지문 문장 전체가 아님 반려(짧은 절 인용)",
    has(CONTENT_MATCH_LUNA_EXT.parseAndGate(JSON.stringify(fragment), ctx).gateIssues, "문장 전체가 아님"),
  );

  const verbatim = {
    ...GOOD,
    options: GOOD.options.map((o, i) => (i === 1 ? { ...o, text: S[1] } : o)),
  };
  check(
    "음성테스트: 지문 축자 복사 진술 반려",
    has(CONTENT_MATCH_LUNA_EXT.parseAndGate(JSON.stringify(verbatim), ctx).gateIssues, "축자 복사"),
  );

  const koMixed = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 3 ? { ...o, text: "연구자들은 나무 심기를 장기 기반 시설로 봐야 한다고 주장한다." } : o,
    ),
  };
  check(
    "음성테스트: 언어 혼입 반려(en 설정에 한국어 진술)",
    has(CONTENT_MATCH_LUNA_EXT.parseAndGate(JSON.stringify(koMixed), ctx).gateIssues, "한글이 섞임"),
  );

  const answerInWrong = {
    ...GOOD,
    wrong: GOOD.wrong.map((w, i) => (i === 1 ? { label: "③", text: "정답 라벨이 오답 목록에 끼었습니다." } : w)),
  };
  check(
    "음성테스트: 오답 목록에 정답 라벨 반려",
    has(CONTENT_MATCH_LUNA_EXT.parseAndGate(JSON.stringify(answerInWrong), ctx).gateIssues, "정답 라벨"),
  );

  // ②와 ④의 근거 문장을 맞바꿈 — 라벨 축은 유지되므로 등장순 위반만 남는다.
  const outOfOrder = {
    ...GOOD,
    evidence: GOOD.evidence.map((e, i) =>
      i === 1 ? { label: "②", sentence: S[4] } : i === 3 ? { label: "④", sentence: S[1] } : e,
    ),
  };
  check(
    "음성테스트: 근거 지문 등장순 위반 반려",
    has(CONTENT_MATCH_LUNA_EXT.parseAndGate(JSON.stringify(outOfOrder), ctx).gateIssues, "지문 앞쪽"),
  );

  const parseFail = CONTENT_MATCH_LUNA_EXT.parseAndGate("{broken json", ctx);
  check(
    "음성테스트: JSON 파손 → gateIssues 반환(throw 금지)",
    has(parseFail.gateIssues, "파싱 실패") && parseFail.question === null,
  );
}

// ── ③ 코어스: 라벨 정렬 발동 + 레인 스냅(절 인용 → 문장 축자) 재사용 ─────────
{
  const shuffled = {
    ...GOOD,
    options: [GOOD.options[2], GOOD.options[0], GOOD.options[1], GOOD.options[4], GOOD.options[3]],
    evidence: [GOOD.evidence[4], GOOD.evidence[0], GOOD.evidence[1], GOOD.evidence[2], GOOD.evidence[3]],
    wrong: [GOOD.wrong[3], GOOD.wrong[0], GOOD.wrong[2], GOOD.wrong[1]],
  };
  const parsed = CONTENT_MATCH_LUNA_EXT.parseAndGate(JSON.stringify(shuffled), ctx);
  const q = parsed.question as {
    options: Array<{ label: string }>;
    evidence: Array<{ label: string }>;
    wrong: Array<{ label: string }>;
  };
  check(
    "코어스 발동: 선지·근거·오답 라벨 오름차순 재정렬 + 게이트 클린",
    parsed.gateIssues.length === 0 &&
      q.options.map((o) => o.label).join("") === "①②③④⑤" &&
      q.evidence.map((e) => e.label).join("") === "①②③④⑤" &&
      q.wrong.map((w) => w.label).join("") === "①②④⑤",
    parsed.gateIssues.join("; "),
  );
  check(
    "코어스 발동: 보정 기록(재정렬) 남김",
    parsed.corrections.some((c) => c.includes("재정렬")),
    parsed.corrections.join("; "),
  );
  const adapt = CONTENT_MATCH_MD_LANE.adapt(parsed, ctx);
  check("코어스 후 레인 adapt ok", adapt.ok === true, adapt.error);

  // 내용어 7개짜리 절 인용 — 레인 autoSnap 이 지문 문장 전문으로 확장해 살린다.
  const clause = {
    ...GOOD,
    evidence: GOOD.evidence.map((e, i) =>
      i === 0 ? { label: "①", sentence: "city planners regarded street trees as mere decoration" } : e,
    ),
  };
  const snapped = CONTENT_MATCH_LUNA_EXT.parseAndGate(JSON.stringify(clause), ctx);
  check(
    "레인 스냅 재사용: 절 인용을 지문 문장 축자로 보정 + 게이트 클린",
    snapped.gateIssues.length === 0 && snapped.corrections.some((c) => c.includes("① 근거를 지문 문장 축자로 보정")),
    `${snapped.gateIssues.join("; ")} / ${snapped.corrections.join("; ")}`,
  );
}

// ── ④ 브릿지: 청크 분단(1·7·1024)·JSON 구문 무노출 ─────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(CONTENT_MATCH_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 진술·근거·정답·해설·오답 방류 + JSON 무노출`,
      out.includes("\n① Urban planners") &&
        out.includes("\n근거 ① For decades") &&
        out.includes("\n정답: ③") &&
        out.includes("\n해설: 지문은") &&
        out.includes("\n④ 연구자들이") &&
        !out.includes("{") &&
        !out.includes('"label"'),
      out.slice(0, 150),
    );
  }
}

// ── ⑤ 동적 스키마: 형식 노브(선지수·정답수·극성·언어)가 ctx 를 따라간다 ──────
{
  const ctx7: MdLaneContext = {
    ...ctx,
    resolved: { contentMatchOptionCount: 7, contentMatchAnswerCount: 2, contentMatchType: "일치" },
    rawTypeSettings: { CONTENT_MATCH: { optionLanguage: "ko" } },
  };
  const spec = CONTENT_MATCH_LUNA_EXT.buildJsonSchema(ctx7);
  const schema = spec.schema as Record<string, any>;
  check(
    "동적 스키마: 선지 7·근거 7·정답 2·오답 5·라벨 enum 7",
    schema.properties.options.minItems === 7 &&
      schema.properties.evidence.minItems === 7 &&
      schema.properties.answers.minItems === 2 &&
      schema.properties.wrong.minItems === 5 &&
      schema.properties.options.items.properties.label.enum.length === 7 &&
      schema.properties.options.items.properties.label.enum[6] === "⑦",
  );
  check(
    "동적 스키마: 극성(일치)·언어(ko) 반영",
    (schema.properties.answers.description as string).includes("일치하는") &&
      (schema.properties.options.items.properties.text.description as string).includes("한국어"),
  );
  const selfcheck = CONTENT_MATCH_LUNA_EXT.buildSelfcheck(ctx7);
  check(
    "검산 블록: 설정 실값 반영(7개·2개·①~⑦·일치·한국어)",
    selfcheck.includes("정확히 7개") &&
      selfcheck.includes("정확히 2개") &&
      selfcheck.includes("①②③④⑤⑥⑦") &&
      selfcheck.includes("2개만 지문 내용과 일치하고") &&
      selfcheck.includes("한국어로 쓴다"),
  );
  const selfcheckDefault = CONTENT_MATCH_LUNA_EXT.buildSelfcheck(ctx);
  check(
    "검산 블록: 기본 설정(불일치·영문·사다리 포함)",
    selfcheckDefault.includes("1개만 지문 내용과 어긋나고") &&
      selfcheckDefault.includes("영어로 쓴다") &&
      selfcheckDefault.includes("우선순위"),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
