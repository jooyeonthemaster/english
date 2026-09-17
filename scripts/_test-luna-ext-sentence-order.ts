// SENTENCE_ORDER luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-sentence-order.ts
import { SENTENCE_ORDER_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/sentence-order";
import { SENTENCE_ORDER_MD_LANE } from "../src/lib/md-qgen/lane-order";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import { reconstructionEq } from "../src/lib/md-qgen/parser";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import type { MdOrderQuestion } from "../src/lib/md-qgen/parser-order";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

// ── 픽스처 지문 — 8문장, 원문 순서: 주어진 글 → (B) → (C) → (A) ────────────────
const S1 =
  "For centuries, farmers in the Alps moved their herds up the mountains each summer, following the fresh grass as it appeared.";
const S2 = "This seasonal journey, called transhumance, shaped far more than the cows' diet.";
const S3 =
  "The regular movement of animals carved paths that later became trade routes connecting valleys that had once been isolated.";
const S4 =
  "Merchants began to travel the same trails, carrying salt and cloth to villages that had rarely seen outsiders.";
const S5 =
  "Trade along these paths did more than exchange goods, because it carried news, songs, and marriage partners between distant communities.";
const S6 =
  "Families that had never met began to share festivals, and dialects slowly borrowed words from one another.";
const S7 =
  "Linguists who map Alpine dialects today can still trace the old cattle trails in the words villagers use.";
const S8 =
  "A shepherd's route walked five hundred years ago survives as a shared word for bread or snow.";

const GIVEN = `${S1} ${S2}`;
const PB = `${S3} ${S4}`; // 원문 1번째 단락 구간 — 라벨 (B)
const PC = `${S5} ${S6}`; // 원문 2번째 단락 구간 — 라벨 (C)
const PA = `${S7} ${S8}`; // 원문 3번째 단락 구간 — 라벨 (A)
const PASSAGE = [GIVEN, PB, PC, PA].join(" ");

// (A) 첫 문장(S7)의 재진술 — 단서(still=역접 계열) 보존·1문장·0.6~1.7배·새 표현.
const VARIANT_HEAD =
  "Even now, researchers who chart the dialects of Alpine villages can still follow those ancient herding paths through local vocabulary.";
const VARIANT_A = `${VARIANT_HEAD} ${S8}`;

const ctx0: MdLaneContext = {
  passage: PASSAGE,
  difficulty: "KILLER",
  rawDifficulty: "KILLER",
  resolved: {},
  rawTypeSettings: null,
  teacherPoints: [],
  variantIndex: 0,
  variantCount: 1,
};
const ctx1: MdLaneContext = { ...ctx0, resolved: { sentenceOrderPrefixVariationCount: 1 } };
const ctx3: MdLaneContext = { ...ctx0, resolved: { sentenceOrderPrefixVariationCount: 3 } };

const GOOD = {
  given: GIVEN,
  paragraphs: [
    { label: "(A)", text: PA },
    { label: "(B)", text: PB },
    { label: "(C)", text: PC },
  ],
  options: [
    { label: "①", text: "(A)-(C)-(B)" },
    { label: "②", text: "(B)-(A)-(C)" },
    { label: "③", text: "(B)-(C)-(A)" },
    { label: "④", text: "(C)-(A)-(B)" },
    { label: "⑤", text: "(C)-(B)-(A)" },
  ],
  answer: "③",
  explanation:
    "(B)가 도입한 paths 를 (C)의 these paths 가 되받고, (C)가 말한 교류의 누적을 (A)의 오늘날 방언 추적이 이어받으므로 (B)-(C)-(A) 순서가 확정됩니다. 참조 사슬과 시간 진행이 같은 배열로 수렴합니다.",
  wrong: [
    { label: "⑤", text: "(C)가 첫 자리에 오면 these paths 가 가리킬 길이 아직 등장하지 않아 참조가 해소되지 않습니다." },
    { label: "①", text: "(A)의 오늘날 방언 이야기는 (C)가 말한 세대 간 교류의 결과라서 교류보다 먼저 올 수 없습니다." },
    { label: "④", text: "(C)의 these paths 앞에 길을 만든 (B)가 오지 않아 선행어가 없습니다." },
    { label: "②", text: "결론에 해당하는 (A)가 교류 확산을 다룬 (C)보다 먼저 와서 시간 순서가 역행합니다." },
  ],
};
const GOOD_VAR = { ...GOOD, variants: [{ label: "(A)", text: VARIANT_A }] };

// ── ⓪ 픽스처 자가 검증 — parser.ts reconstructionEq 재사용(재구현 금지 규약) ──
check(
  "픽스처 자가 검증: 주어진 글+원문 순서 단락 재구성 == 지문",
  reconstructionEq([GIVEN, PB, PC, PA].join(" "), PASSAGE),
);

// ── ① 정상 왕복(variation=0): 게이트 클린 → 레인 adapt ok ───────────────────
{
  const parsed = SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx0);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("정상 픽스처: 코어스 무발동", parsed.corrections.length === 0, parsed.corrections.join("; "));
  const q = parsed.question as MdOrderQuestion;
  check(
    "코어스(침묵): 오답 라벨 오름차순 정렬",
    q.wrong.map((w) => w.label).join("") === "①②④⑤",
    q.wrong.map((w) => w.label).join(""),
  );
  const adapt = SENTENCE_ORDER_MD_LANE.adapt(parsed, ctx0);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const ai = adapt.aiQuestion as {
      correctAnswer?: unknown;
      options?: Array<{ label: string; text: string }>;
      paragraphs?: Array<{ label: string; text: string }>;
    };
    check(
      "어댑터 형상: 정답 3·순열 재조립·라벨 리터럴",
      ai.correctAnswer === "3" &&
        ai.options?.[2]?.text === "(B)-(C)-(A)" &&
        ai.paragraphs?.map((p) => p.label).join("") === "(A)(B)(C)",
    );
    const surface = SENTENCE_ORDER_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+주어진 글+단락+선지 렌더 · 지문 원문 미노출",
      surface.includes("주어진 글 다음에 이어질") &&
        surface.includes("[주어진 글]") &&
        surface.includes("(A) Linguists") &&
        surface.includes("① (A)-(C)-(B)") &&
        !surface.includes(PASSAGE),
      surface.slice(0, 120),
    );
    console.log("── 평가 표면 실물 ──\n" + surface + "\n──");
  }
}

// ── ② 정상 왕복(variation=1): 2단 출력 — 축자 게이트 + 표시면 변형본 ─────────
{
  const parsed = SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(GOOD_VAR), ctx1);
  check(
    "변형 픽스처(variation=1): 게이트 클린",
    parsed.gateIssues.length === 0,
    parsed.gateIssues.join("; "),
  );
  const adapt = SENTENCE_ORDER_MD_LANE.adapt(parsed, ctx1);
  const ai = adapt.aiQuestion as
    | { paragraphs?: Array<{ label: string; text: string }> }
    | undefined;
  check(
    "변형 픽스처: adapt ok + 표시면 (A)=변형본·(B)(C)=축자",
    adapt.ok === true &&
      ai?.paragraphs?.[0]?.text === VARIANT_A &&
      ai?.paragraphs?.[1]?.text === PB,
    adapt.error,
  );
}

// ── ③ 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  const broken = {
    ...GOOD,
    paragraphs: GOOD.paragraphs.map((p) =>
      p.label === "(B)" ? { ...p, text: p.text.replace("carved", "created") } : p,
    ),
  };
  check(
    "음성테스트: 축자 깨짐(단어 교체) 반려",
    has(SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(broken), ctx0).gateIssues, "축자 분할이 아님"),
  );
  const short = { ...GOOD, options: GOOD.options.slice(0, 4) };
  check(
    "음성테스트: 선지 4개 반려",
    has(SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(short), ctx0).gateIssues, "선지 4개"),
  );
  const wrongAnswer = { ...GOOD, answer: "⑤" };
  check(
    "음성테스트: 정답-원문 순서 불일치 반려",
    has(SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(wrongAnswer), ctx0).gateIssues, "정답 불일치"),
  );
  const parseFail = SENTENCE_ORDER_LUNA_EXT.parseAndGate("{broken json", ctx0);
  check(
    "음성테스트: JSON 파손 → gateIssues 반환(throw 금지)",
    parseFail.question === null && has(parseFail.gateIssues, "파싱 실패"),
  );
  const tailBroken = {
    ...GOOD,
    variants: [{ label: "(A)", text: `${VARIANT_HEAD} ${S8.replace("bread", "cheese")}` }],
  };
  check(
    "음성테스트(변형): 2번째 문장 훼손 반려",
    has(
      SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(tailBroken), ctx1).gateIssues,
      "2번째 문장 이후가 축자와 다름",
    ),
  );
  const copyVariant = { ...GOOD, variants: [{ label: "(A)", text: PA }] };
  check(
    "음성테스트(변형): 축자 복사 반려(새 표현 없음)",
    has(
      SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(copyVariant), ctx1).gateIssues,
      "새 표현이 없음",
    ),
  );
  check(
    "음성테스트: 변형 설정 꺼짐인데 변형 줄 출력 반려",
    has(
      SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(GOOD_VAR), ctx0).gateIssues,
      "변형 설정이 꺼져",
    ),
  );
}

// ── ④ 코어스 발동 검증 ───────────────────────────────────────────────────────
{
  const shuffled = {
    ...GOOD,
    options: [GOOD.options[2], GOOD.options[0], GOOD.options[1], GOOD.options[4], GOOD.options[3]],
  };
  const parsed = SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(shuffled), ctx0);
  const q = parsed.question as MdOrderQuestion;
  check(
    "코어스 발동: 선지 셔플 → ①~⑤ 정렬 + 게이트 클린",
    parsed.gateIssues.length === 0 &&
      has(parsed.corrections, "선지 제시 순서") &&
      q.options.map((o) => o.label).join("") === "①②③④⑤",
    parsed.gateIssues.join("; ") || parsed.corrections.join("; "),
  );
  // 선지 **순열 배치**가 기출 고정 배열에서 흐트러진 경우(r1 적대검수 계통 2):
  // 라벨 ①~⑤ 는 연속인데 순열이 뒤섞였다 — 정답·오답해설 라벨이 함께 옮겨져야 한다.
  const scrambledPerms = {
    ...GOOD,
    options: [
      { label: "①", text: "(B)-(C)-(A)" }, // 정답 순열이 ① 로 올라감
      { label: "②", text: "(B)-(A)-(C)" },
      { label: "③", text: "(C)-(B)-(A)" },
      { label: "④", text: "(C)-(A)-(B)" },
      { label: "⑤", text: "(A)-(C)-(B)" },
    ],
    answer: "①",
    wrong: [
      { label: "②", text: "(B)-(A)-(C) 에 붙은 해설입니다." },
      { label: "③", text: "(C)-(B)-(A) 에 붙은 해설입니다." },
      { label: "④", text: "(C)-(A)-(B) 에 붙은 해설입니다." },
      { label: "⑤", text: "(A)-(C)-(B) 에 붙은 해설입니다." },
    ],
  };
  const parsedPerm = SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(scrambledPerms), ctx0);
  const qp = parsedPerm.question as MdOrderQuestion;
  const wrongAt = (label: string) => qp.wrong.find((w) => w.label === label)?.text ?? "";
  check(
    "코어스 발동: 순열 배치 → 기출 고정 배열 복원 + 정답·오답해설 라벨 동반 이동",
    parsedPerm.gateIssues.length === 0 &&
      has(parsedPerm.corrections, "기출 고정 배열") &&
      qp.options.map((o) => o.text).join("|") ===
        "(A)-(C)-(B)|(B)-(A)-(C)|(B)-(C)-(A)|(C)-(A)-(B)|(C)-(B)-(A)" &&
      qp.answer === "③" &&
      qp.wrong.map((w) => w.label).join("") === "①②④⑤" &&
      wrongAt("①") === "(A)-(C)-(B) 에 붙은 해설입니다." &&
      wrongAt("②") === "(B)-(A)-(C) 에 붙은 해설입니다." &&
      wrongAt("④") === "(C)-(A)-(B) 에 붙은 해설입니다." &&
      wrongAt("⑤") === "(C)-(B)-(A) 에 붙은 해설입니다.",
    parsedPerm.gateIssues.join("; ") || `${qp.answer} / ${qp.options.map((o) => o.text).join("|")}`,
  );
  check(
    "코어스 무발동: 이미 기출 고정 배열이면 침묵",
    !has(
      SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx0).corrections,
      "기출 고정 배열",
    ),
  );
  // 음성테스트: 집합 자체가 기출 5종이 아님((A)-(B)-(C) 가 선지에 올라간 계통 1).
  const identityInOptions = {
    ...GOOD,
    options: [
      { label: "①", text: "(A)-(B)-(C)" },
      { label: "②", text: "(B)-(A)-(C)" },
      { label: "③", text: "(B)-(C)-(A)" },
      { label: "④", text: "(C)-(A)-(B)" },
      { label: "⑤", text: "(C)-(B)-(A)" },
    ],
  };
  check(
    "음성테스트: (A)-(B)-(C) 가 선지에 오르면 반려(코어스로 못 고침 — 재생성)",
    has(
      SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(identityInOptions), ctx0).gateIssues,
      "선지 순열 집합이 기출 5종이 아님",
    ),
  );
  const reordered = {
    ...GOOD,
    paragraphs: [GOOD.paragraphs[1], GOOD.paragraphs[0], GOOD.paragraphs[2]],
  };
  const parsed2 = SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(reordered), ctx0);
  const q2 = parsed2.question as MdOrderQuestion;
  check(
    "코어스 발동(레인 스냅 재사용): 단락 제시 역순 → (A)(B)(C) 정렬 + 게이트 클린",
    parsed2.gateIssues.length === 0 &&
      has(parsed2.corrections, "단락 제시 순서") &&
      q2.paragraphs.map((p) => p.label).join("") === "(A)(B)(C)",
    parsed2.gateIssues.join("; ") || parsed2.corrections.join("; "),
  );
}

// ── ⑤ 교사 지정 준수 게이트(레인 등가 복제) ─────────────────────────────────
{
  const tp = (text: string) =>
    [{ text, unit: "SENTENCE", tag: "", note: "" }] as unknown as MdLaneContext["teacherPoints"];
  const seamCtx: MdLaneContext = { ...ctx0, teacherPoints: tp(S3) }; // (B) 시작 = 이음매
  check(
    "교사 포인트: 이음매(단락 시작) 문장 → 통과",
    SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), seamCtx).gateIssues.length === 0,
  );
  const midCtx: MdLaneContext = {
    ...ctx0,
    teacherPoints: tp("carved paths that later became trade routes"),
  };
  check(
    "교사 포인트: 단락 중간 구절 → 반려",
    has(
      SENTENCE_ORDER_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), midCtx).gateIssues,
      "주어진 글·단락 경계 어디에도 없음",
    ),
  );
}

// ── ⑥ 브릿지: 청크 분단(1/7/1024)·JSON 구문 무노출·섹션 라벨 방류 ────────────
{
  const json = JSON.stringify(GOOD_VAR);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(SENTENCE_ORDER_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 주어진 글·단락·변형·선지·정답·해설 방류 + JSON 무노출`,
      out.includes("주어진 글: For centuries") &&
        out.includes("\n(A) Linguists") &&
        out.includes("\n변형 (A) Even now") &&
        out.includes("\n① (A)-(C)-(B)") &&
        out.includes("\n정답: ③") &&
        out.includes("\n해설: ") &&
        !out.includes("{") &&
        !out.includes('"label"') &&
        !out.includes('"given"'),
      out.slice(0, 160),
    );
  }
}

// ── ⑦ 동적 스키마: variation 이 형식을 바꾼다 ────────────────────────────────
{
  type S = Record<string, any>;
  const s0 = SENTENCE_ORDER_LUNA_EXT.buildJsonSchema(ctx0).schema as S;
  check(
    "동적 스키마(variation=0): variants 필드 자체가 없음 + 고정 개수",
    s0.properties.variants === undefined &&
      !s0.required.includes("variants") &&
      s0.properties.paragraphs.minItems === 3 &&
      s0.properties.options.minItems === 5 &&
      s0.properties.wrong.minItems === 4 &&
      s0.properties.answer.enum.length === 5,
  );
  check(
    "스키마: 선지 text 가 기출 5종 순열 enum — (A)-(B)-(C) 원천 봉쇄",
    s0.properties.options.items.properties.text.enum.join("|") ===
      "(A)-(C)-(B)|(B)-(A)-(C)|(B)-(C)-(A)|(C)-(A)-(B)|(C)-(B)-(A)",
    String(s0.properties.options.items.properties.text.enum),
  );
  const s1 = SENTENCE_ORDER_LUNA_EXT.buildJsonSchema(ctx1).schema as S;
  check(
    "동적 스키마(variation=1): variants 1개·라벨 (A) 고정",
    s1.required.includes("variants") &&
      s1.properties.variants.minItems === 1 &&
      s1.properties.variants.maxItems === 1 &&
      s1.properties.variants.items.properties.label.enum.join("") === "(A)",
  );
  const s3 = SENTENCE_ORDER_LUNA_EXT.buildJsonSchema(ctx3).schema as S;
  check(
    "동적 스키마(variation=3): variants 3개·라벨 (A)(B)(C)",
    s3.properties.variants.minItems === 3 &&
      s3.properties.variants.items.properties.label.enum.join("") === "(A)(B)(C)",
  );
  const sc0 = SENTENCE_ORDER_LUNA_EXT.buildSelfcheck(ctx0);
  const sc1 = SENTENCE_ORDER_LUNA_EXT.buildSelfcheck(ctx1);
  check(
    "검산 블록: 사다리+재구성 지시 포함, 변형 섹션은 설정 시에만",
    sc0.includes("우선순위") &&
      sc0.includes("원문 등장 순서로") &&
      !sc0.includes("변형") &&
      sc1.includes("단락 첫 문장 변형") &&
      sc1.includes("0.6~1.7"),
  );
  check(
    "검산 블록(r2 보강): 사고 예산·산술 분량 절차·유일성 스트레스·해설 사실성/표기 규약",
    sc0.includes("사고 예산") &&
      sc0.includes("최대 2회") &&
      sc0.includes("목표 단락 길이") &&
      sc0.includes("정답 유일성 스트레스") &&
      sc0.includes("같은 단락 안") &&
      sc0.includes("기출 고정 배열") &&
      sc0.includes("① (A)-(C)-(B)"),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
