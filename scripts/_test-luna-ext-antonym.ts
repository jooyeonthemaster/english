// ANTONYM luna 확장 픽스처 테스트 — SPEC §3 계약(견본: _test-luna-ext-title.ts).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-antonym.ts
import { ANTONYM_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/antonym";
import { ANTONYM_MD_LANE } from "../src/lib/md-qgen/lane-antonym";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import type { MdAntonymQuestion } from "../src/lib/md-qgen/parser-antonym";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

// 표적 5개(flourish·fragile·expel·fade·subsides)는 전부 지문에 단어 경계 1회 등장.
// "reefs" 는 의도적으로 2회 등장시켜 유일 확정 음성테스트의 재료로 쓴다.
const PASSAGE =
  "Coral reefs flourish in warm, shallow waters, yet their survival depends on a fragile balance. " +
  "When ocean temperatures rise, corals expel the algae that nourish them, and their vivid colors fade into a pale white. " +
  "Scientists who monitor these bleaching events warn that recovery is possible only if the stress subsides quickly. " +
  "Protecting reefs therefore requires reducing local pollution while the global climate stabilizes.";

const MARKED =
  "Coral reefs [[A:flourish]] in warm, shallow waters, yet their survival depends on a [[B:fragile]] balance. " +
  "When ocean temperatures rise, corals [[C:expel]] the algae that nourish them, and their vivid colors [[D:fade]] into a pale white. " +
  "Scientists who monitor these bleaching events warn that recovery is possible only if the stress [[E:subsides]] quickly. " +
  "Protecting reefs therefore requires reducing local pollution while the global climate stabilizes.";

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

// 정답 (D) fade - vanish: 유의어를 반의어 자리에 꽂은 함정. 바른짝 intensify.
// wrong 은 일부러 뒤섞어(E,A,C,B) 정렬 코어스의 결정론을 함께 확인한다.
const GOOD = {
  markedPassage: MARKED,
  pairs: [
    { label: "(A)", word: "flourish", antonym: "wither" },
    { label: "(B)", word: "fragile", antonym: "sturdy" },
    { label: "(C)", word: "expel", antonym: "absorb" },
    { label: "(D)", word: "fade", antonym: "vanish" },
    { label: "(E)", word: "subsides", antonym: "escalates" },
  ],
  answer: "(D)",
  correctAntonym: "intensify",
  explanation:
    "이 지문에서 fade 는 산호의 색이 옅어져 사라진다는 소멸 축의 의미로 쓰였습니다. vanish 는 같은 방향의 유의어이므로 반의 관계가 성립하지 않으며, 문맥상 실제 반의어는 intensify 입니다.",
  wrong: [
    { label: "(E)", text: "가라앉다와 고조되다는 강도 축의 정확한 반의 관계입니다." },
    { label: "(A)", text: "번성하다와 시들다는 생장 축의 정확한 반의 관계입니다." },
    { label: "(C)", text: "내보내다와 흡수하다는 출입 축의 정확한 반의 관계입니다." },
    { label: "(B)", text: "깨지기 쉬운과 튼튼한은 견고성 축의 정확한 반의 관계입니다." },
  ],
};

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok ──────────────────────────
{
  const parsed = ANTONYM_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  const q = parsed.question as MdAntonymQuestion;
  check(
    "코어스: 오답 라벨 정렬(표시 결정론)",
    q.wrong.map((w) => w.label).join("") === "(A)(B)(C)(E)",
    q.wrong.map((w) => w.label).join(""),
  );
  check("코어스 무발동: 정상 픽스처는 교정 0건", parsed.corrections.length === 0, parsed.corrections.join("; "));
  const adapt = ANTONYM_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const mw = adapt.aiQuestion.markedWords as Array<Record<string, unknown>>;
    check(
      "어댑터 산출: markedWords 5개·정답 인덱스·바른짝",
      mw.length === 5 &&
        adapt.aiQuestion.correctAnswer === "4" &&
        mw[3].isIncorrectPair === true &&
        mw[3].correctAntonym === "intensify" &&
        (adapt.aiQuestion.wrongOptionExplanations as unknown[]).length === 4,
      JSON.stringify({ ca: adapt.aiQuestion.correctAnswer, n: mw.length }),
    );
    const surface = ANTONYM_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+밑줄 지문+선지 렌더",
      surface.includes("반의어") &&
        surface.includes("__(A) flourish__") &&
        surface.includes("__(D) fade__") &&
        surface.includes("① (A) flourish - wither") &&
        surface.includes("④ (D) fade - vanish"),
      surface.slice(0, 160),
    );
    console.log("── 평가 표면 실물 ──\n" + surface + "\n──");
  }
}

// ── ② 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ────────────────
{
  // 축자 seam 파손: 마커 밖 쉼표 하나를 지운다 → 재구성 불일치.
  const seamBroken = {
    ...GOOD,
    markedPassage: MARKED.replace("warm, shallow", "warm shallow"),
  };
  check(
    "음성테스트: 마커 밖 무단 편집 → 재구성 불일치 반려",
    has(ANTONYM_LUNA_EXT.parseAndGate(JSON.stringify(seamBroken), ctx).gateIssues, "재구성 불일치"),
  );

  // 어휘쌍 수 부족(4개).
  const shortPairs = { ...GOOD, pairs: GOOD.pairs.slice(0, 4) };
  check(
    "음성테스트: 어휘쌍 4개 반려",
    has(ANTONYM_LUNA_EXT.parseAndGate(JSON.stringify(shortPairs), ctx).gateIssues, "어휘쌍 4개"),
  );

  // 다중 등장 표적: "reefs" 는 지문에 2회 → 밑줄 자리 모호.
  const ambiguous = {
    ...GOOD,
    markedPassage: MARKED.replace("Coral reefs [[A:flourish]]", "Coral [[A:reefs]] flourish"),
    pairs: [
      { label: "(A)", word: "reefs", antonym: "individuals" },
      ...GOOD.pairs.slice(1),
    ],
  };
  check(
    "음성테스트: 다중 등장 표적 → 밑줄 자리 모호 반려",
    has(ANTONYM_LUNA_EXT.parseAndGate(JSON.stringify(ambiguous), ctx).gateIssues, "2회 등장"),
  );

  // 형태 불일치: subsides(-s) 에 원형 escalate 를 짝지음.
  const formMismatch = {
    ...GOOD,
    pairs: GOOD.pairs.map((p) =>
      p.label === "(E)" ? { ...p, antonym: "escalate" } : p,
    ),
  };
  check(
    "음성테스트: -s 형태 불일치 반려",
    has(ANTONYM_LUNA_EXT.parseAndGate(JSON.stringify(formMismatch), ctx).gateIssues, "형태 불일치"),
  );

  // 오답 목록에 정답 라벨 혼입.
  const answerInWrong = {
    ...GOOD,
    wrong: [...GOOD.wrong.slice(0, 3), { label: "(D)", text: "정답 라벨이 오답 목록에." }],
  };
  check(
    "음성테스트: 오답 목록에 정답 라벨 반려",
    has(
      ANTONYM_LUNA_EXT.parseAndGate(JSON.stringify(answerInWrong), ctx).gateIssues,
      "정답 라벨 포함",
    ),
  );

  // 바른짝이 정답 쌍의 짝 단어와 동일 → 그 쌍은 오류가 아니게 된다.
  const degenerate = { ...GOOD, correctAntonym: "vanish" };
  check(
    "음성테스트: 바른짝=짝 단어 반려",
    has(ANTONYM_LUNA_EXT.parseAndGate(JSON.stringify(degenerate), ctx).gateIssues, "바른짝"),
  );

  const parseFail = ANTONYM_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)", has(parseFail.gateIssues, "파싱 실패"));
}

// ── ③ 코어스 발동: 라벨 재번호 + 짝 정렬 + 레인 스냅 ───────────────────────
{
  // (A)↔(B) 마커 맞교환 — 등장순 재번호가 되살려야 한다.
  const swapped = {
    ...GOOD,
    markedPassage: MARKED.replace("[[A:flourish]]", "[[B:flourish]]").replace(
      "[[B:fragile]]",
      "[[A:fragile]]",
    ),
    pairs: [
      { label: "(A)", word: "fragile", antonym: "sturdy" },
      { label: "(B)", word: "flourish", antonym: "wither" },
      ...GOOD.pairs.slice(2),
    ],
    wrong: [
      { label: "(A)", text: "깨지기 쉬운과 튼튼한은 견고성 축의 정확한 반의 관계입니다." },
      { label: "(B)", text: "번성하다와 시들다는 생장 축의 정확한 반의 관계입니다." },
      ...GOOD.wrong.filter((w) => w.label === "(C)" || w.label === "(E)"),
    ],
  };
  const parsed = ANTONYM_LUNA_EXT.parseAndGate(JSON.stringify(swapped), ctx);
  const q = parsed.question as MdAntonymQuestion;
  check(
    "코어스 발동: 등장순 재번호 → 게이트 클린",
    parsed.gateIssues.length === 0 && has(parsed.corrections, "재번호"),
    parsed.gateIssues.join("; ") || parsed.corrections.join("; "),
  );
  check(
    "재번호 결과: (A)=flourish·(B)=fragile·짝 배열 오름차순",
    q.pairs.map((p) => p.label).join("") === "(A)(B)(C)(D)(E)" &&
      q.pairs[0].word === "flourish" &&
      q.pairs[1].word === "fragile" &&
      q.markedPassage.includes("[[A:flourish]]") &&
      q.markedPassage.includes("[[B:fragile]]"),
    JSON.stringify(q.pairs.map((p) => `${p.label}${p.word}`)),
  );
  const adapt = ANTONYM_MD_LANE.adapt(parsed, ctx);
  check("재번호 후 레인 어댑터 왕복: ok", adapt.ok === true, adapt.error);

  // 레인 스냅 재사용: 짝 섹션 word 드리프트("faded")를 마커 축자("fade")로 보정.
  const drift = {
    ...GOOD,
    pairs: GOOD.pairs.map((p) => (p.label === "(D)" ? { ...p, word: "faded" } : p)),
  };
  const snapped = ANTONYM_LUNA_EXT.parseAndGate(JSON.stringify(drift), ctx);
  const sq = snapped.question as MdAntonymQuestion;
  check(
    "코어스 발동: 레인 스냅이 word 드리프트 보정 → 게이트 클린",
    snapped.gateIssues.length === 0 &&
      has(snapped.corrections, "보정") &&
      sq.pairs[3].word === "fade",
    snapped.gateIssues.join("; ") || snapped.corrections.join("; "),
  );
}

// ── ④ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(ANTONYM_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 섹션 라벨·쌍·정답·바른짝·해설 방류 + JSON 무노출`,
      out.startsWith("밑줄지문:\n") &&
        out.includes("[[A:flourish]]") &&
        out.includes("\n(A) flourish - wither") &&
        out.includes("\n(E) subsides - escalates") &&
        out.includes("\n\n정답: (D)") &&
        out.includes("\n바른짝: intensify") &&
        out.includes("\n해설: ") &&
        !out.includes("{") &&
        !out.includes('"label"') &&
        !out.includes('"pairs"'),
      out.slice(0, 150),
    );
  }
}

// ── ⑤ 동적 스키마: antonymPairCount 반영 + 클램프 ──────────────────────────
{
  const ctx7 = { ...ctx, resolved: { antonymPairCount: 7 } };
  const spec = ANTONYM_LUNA_EXT.buildJsonSchema(ctx7);
  const schema = spec.schema as Record<string, any>;
  check(
    "동적 스키마: 쌍 7·오답 6·라벨 enum 7((G)까지)",
    spec.strict === true &&
      schema.additionalProperties === false &&
      schema.properties.pairs.minItems === 7 &&
      schema.properties.pairs.maxItems === 7 &&
      schema.properties.wrong.minItems === 6 &&
      schema.properties.pairs.items.properties.label.enum.length === 7 &&
      schema.properties.pairs.items.properties.label.enum[6] === "(G)" &&
      schema.properties.answer.enum.length === 7,
  );
  const ctx99 = { ...ctx, resolved: { antonymPairCount: 99 } };
  const clamped = ANTONYM_LUNA_EXT.buildJsonSchema(ctx99).schema as Record<string, any>;
  check("동적 스키마: 범위 밖 설정은 10으로 클램프", clamped.properties.pairs.maxItems === 10);
  check(
    "검산 블록: 설정 실값 반영(7개·(G))",
    ANTONYM_LUNA_EXT.buildSelfcheck(ctx7).includes("정확히 7개") &&
      ANTONYM_LUNA_EXT.buildSelfcheck(ctx7).includes("(G)"),
  );
  check(
    "검산 블록: 사다리·재구성 축자·정답 누설 지시 포함",
    ["우선순위", "재구성 축자 일치", "정답 누설", "기등장", "합쇼체"].every((needle) =>
      ANTONYM_LUNA_EXT.buildSelfcheck(ctx).includes(needle),
    ),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
