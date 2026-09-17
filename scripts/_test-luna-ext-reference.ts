// REFERENCE(지칭 추론) luna 확장 픽스처 테스트 — SPEC §3 계약.
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-reference.ts
import { REFERENCE_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/reference";
import { REFERENCE_MD_LANE } from "../src/lib/md-qgen/lane-reference";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import type { MdReferenceQuestion } from "../src/lib/md-qgen/parser-reference";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

// 표적 문장은 상수로 두고 지문을 조립한다 — 축자 계약을 픽스처가 스스로 보증.
const SENT =
  "Instead of discarding the complaints, the planners archived every objection they had collected, and later cities reused them to skip years of public consultation.";
const EXPLETIVE_SENT =
  "It is clear that the archive changed how planning disputes are settled.";
const PASSAGE =
  "For decades the city planners of Delft treated resident objections as obstacles to be managed. " +
  `${SENT} ${EXPLETIVE_SENT} ` +
  "What began as a defensive record became a shared resource, and planners who once dreaded objections now study them like case law.";

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
  markedSentence: SENT.replace("reused them", "reused [[them]]"),
  options: [
    { label: "①", text: "훗날 등장한 다른 도시들" },
    { label: "②", text: "계획가들이 보관해 둔 반대 의견들" },
    { label: "③", text: "델프트의 도시 계획가들" },
    { label: "④", text: "주민들이 두려워한 새 계획안" },
    { label: "⑤", text: "수년간의 공공 협의 절차" },
  ],
  answer: "②",
  explanation:
    "밑줄 친 대명사는 '계획가들이 보관해 둔 반대 의견들'을 가리킵니다. 훗날의 도시들이 재사용해 협의 기간을 건너뛴 것은 앞 절에서 계획가들이 보관해 둔 반대 의견 기록이기 때문입니다.",
  wrong: [
    { label: "⑤", text: "재사용으로 건너뛴 대상이지 재사용된 목적어가 아닙니다." },
    { label: "①", text: "대명사 바로 앞의 주어여서 매력적이지만 재사용의 주체이지 대상이 아닙니다." },
    { label: "④", text: "주민 반대의 계기일 뿐 보관되거나 재사용된 대상이 아닙니다." },
    { label: "③", text: "반대 의견을 모은 주체이지 재사용된 대상이 아닙니다." },
  ],
};

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok → 평가 표면 ──────────────
{
  const parsed = REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  const q = parsed.question as MdReferenceQuestion;
  check(
    "코어스 발동: 오답 라벨 오름차순 정렬",
    q.wrong.map((w) => w.label).join("") === "①③④⑤",
    q.wrong.map((w) => w.label).join(""),
  );
  check("스냅 무발동: 축자 픽스처는 보정 0건", parsed.corrections.length === 0, parsed.corrections.join("; "));

  const adapt = REFERENCE_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const ai = adapt.aiQuestion;
    check(
      "어댑터 산출: 대명사·정답·오답해설·문맥창",
      ai.underlinedPronoun === "them" &&
        ai.correctAnswer === "2" &&
        Array.isArray(ai.wrongOptionExplanations) &&
        (ai.wrongOptionExplanations as unknown[]).length === 4 &&
        typeof ai.surroundingText === "string" &&
        (ai.surroundingText as string).length > 0 &&
        PASSAGE.includes(ai.surroundingText as string),
      JSON.stringify({ p: ai.underlinedPronoun, a: ai.correctAnswer }),
    );
    const surface = REFERENCE_LUNA_EXT.renderEvalSurface(ai, PASSAGE);
    check(
      "평가 표면: 발문+밑줄 지문+원문자 선지",
      surface.includes("'them'") &&
        surface.includes("reused __them__ to skip") &&
        surface.includes("① 훗날 등장한 다른 도시들") &&
        surface.includes("② 계획가들이 보관해 둔 반대 의견들"),
      surface.slice(0, 160),
    );
    check(
      "평가 표면: 다른 them 출현에 밑줄 오염 없음",
      surface.includes("now study them like case law"),
    );
    console.log("── 평가 표면 실물 ──\n" + surface + "\n──");
  }
}

// ── ② 코어스 무발동: 이미 정렬된 오답은 그대로 ──────────────────────────────
{
  const sorted = { ...GOOD, wrong: [...GOOD.wrong].sort((a, b) => a.label.localeCompare(b.label)) };
  const parsed = REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(sorted), ctx);
  const q = parsed.question as MdReferenceQuestion;
  check(
    "코어스 무발동: 정렬 픽스처 순서 유지 + 게이트 클린",
    q.wrong.map((w) => w.label).join("") === "①③④⑤" && parsed.gateIssues.length === 0,
    parsed.gateIssues.join("; "),
  );
}

// ── ②-b 코어스 ④: 해설·오답해설의 내부 마커 유출 제거(발동/무발동) ──────────
{
  const leaked = {
    ...GOOD,
    explanation:
      "밑줄 친 [[them]]가 가리키는 대상은 '계획가들이 보관해 둔 반대 의견들'입니다. 훗날의 도시들이 재사용한 것은 앞 절의 반대 의견 기록이기 때문입니다.",
    wrong: GOOD.wrong.map((w, i) =>
      i === 0 ? { ...w, text: "__them__ 이 가리키는 대상이 아니라 건너뛴 절차입니다." } : w,
    ),
  };
  const parsed = REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(leaked), ctx);
  const q = parsed.question as MdReferenceQuestion;
  check(
    "코어스 ④ 발동: 해설·오답해설 마커 제거 + 보정 기록 + 게이트 클린",
    !q.explanation.includes("[[") &&
      q.explanation.includes("밑줄 친 them가") &&
      !q.wrong.some((w) => w.text.includes("__")) &&
      q.wrong.some((w) => w.text.startsWith("them 이")) &&
      parsed.corrections.filter((c) => c.includes("마커")).length === 2 &&
      parsed.gateIssues.length === 0,
    `corrections=${parsed.corrections.join("; ")} issues=${parsed.gateIssues.join("; ")}`,
  );
  check(
    "코어스 ④ 무발동: 마커 없는 해설은 무보정 + 밑줄문장 마커는 보존",
    REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx).corrections.length === 0 &&
      (
        REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx)
          .question as MdReferenceQuestion
      ).markedSentence.includes("[[them]]"),
  );
}

// ── ③ 스냅 발동: 대소문자 드리프트를 지문 축자로 보정 ───────────────────────
{
  const drift = {
    ...GOOD,
    markedSentence: GOOD.markedSentence.replace("Instead", "instead"),
  };
  const parsed = REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(drift), ctx);
  const q = parsed.question as MdReferenceQuestion;
  check(
    "스냅 발동: 축자 보정 1건 + 원문 복원 + 게이트 클린",
    parsed.corrections.length === 1 &&
      q.markedSentence.startsWith("Instead of discarding") &&
      parsed.gateIssues.length === 0,
    `corrections=${parsed.corrections.join("; ")} issues=${parsed.gateIssues.join("; ")}`,
  );
}

// ── ④ 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ────────────────
{
  const broken = {
    ...GOOD,
    markedSentence: GOOD.markedSentence.replace("every objection", "each objection"),
  };
  check(
    "음성테스트: 축자 깨짐 반려",
    has(REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(broken), ctx).gateIssues, "축자로 없음"),
  );

  const twoMarks = {
    ...GOOD,
    markedSentence: GOOD.markedSentence.replace("objection they had", "objection [[they]] had"),
  };
  check(
    "음성테스트: 마커 2개 반려",
    has(REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(twoMarks), ctx).gateIssues, "정확히 1개 필요"),
  );

  const short = { ...GOOD, options: GOOD.options.slice(0, 4) };
  check(
    "음성테스트: 선지 4개 반려",
    has(REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(short), ctx).gateIssues, "5개 필요"),
  );

  const answerInWrong = {
    ...GOOD,
    wrong: [{ label: "②", text: "정답 라벨이 오답 목록에 끼었습니다." }, ...GOOD.wrong.slice(1)],
  };
  check(
    "음성테스트: 오답 목록에 정답 라벨 반려",
    has(
      REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(answerInWrong), ctx).gateIssues,
      "오답해설에 정답 라벨 포함",
    ),
  );

  const expletive = {
    ...GOOD,
    markedSentence: EXPLETIVE_SENT.replace("It is", "[[It]] is"),
  };
  check(
    "음성테스트: 허사 it 반려",
    has(REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(expletive), ctx).gateIssues, "허사"),
  );

  const nonPronoun = {
    ...GOOD,
    markedSentence: SENT.replace("later cities", "later [[cities]]"),
  };
  check(
    "음성테스트: 비대명사 표적 반려",
    has(
      REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(nonPronoun), ctx).gateIssues,
      "대명사가 아님",
    ),
  );

  const englishOption = {
    ...GOOD,
    options: GOOD.options.map((o, i) => (i === 2 ? { ...o, text: "the city planners" } : o)),
  };
  check(
    "음성테스트: 선지 한국어 아님 반려",
    has(
      REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(englishOption), ctx).gateIssues,
      "한국어가 아님",
    ),
  );

  const parseFail = REFERENCE_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)", has(parseFail.gateIssues, "파싱 실패"));
}

// ── ⑤ 교사 지정 파리티(레인 parseAndGate 동형 — 방어 게이트) ────────────────
{
  const ctxTP: MdLaneContext = {
    ...ctx,
    teacherPoints: [
      { text: "reused", unit: "word" },
      { text: "완전히 없는 표현", unit: "word" },
    ] as MdLaneContext["teacherPoints"],
  };
  const issues = REFERENCE_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctxTP).gateIssues;
  check(
    "교사 지정: 밑줄문장 내 표현은 통과, 밖 표현만 반려",
    issues.filter((i) => i.includes("교사 지정")).length === 1 && has(issues, "완전히 없는 표현"),
    issues.join("; "),
  );
}

// ── ⑥ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(REFERENCE_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 섹션 라벨 방류 + JSON 무노출`,
      out.includes("밑줄문장: Instead of discarding") &&
        out.includes("reused [[them]] to skip") &&
        out.includes("\n① 훗날 등장한 다른 도시들") &&
        out.includes("\n\n정답: ②") &&
        out.includes("\n해설: 밑줄 친 대명사는") &&
        !out.includes("{") &&
        !out.includes('"label"'),
      out.slice(0, 150),
    );
  }
}

// ── ⑦ 스키마·검산 블록 형상 ─────────────────────────────────────────────────
{
  const spec = REFERENCE_LUNA_EXT.buildJsonSchema(ctx);
  const schema = spec.schema as Record<string, any>;
  check(
    "스키마: strict + additionalProperties:false + 파서 산출물 동형 5필드",
    spec.strict === true &&
      schema.additionalProperties === false &&
      schema.properties.options.items.additionalProperties === false &&
      schema.properties.wrong.items.additionalProperties === false &&
      JSON.stringify(schema.required) ===
        JSON.stringify(["markedSentence", "options", "answer", "explanation", "wrong"]),
  );
  check(
    "스키마: 본문성 필드(markedSentence) 선두 — 스트리밍 도착 순서",
    Object.keys(schema.properties)[0] === "markedSentence",
  );
  check(
    "스키마: 선지 5 고정·오답 4 고정·정답 enum ①~⑤ (형식 노브 없음 확인)",
    schema.properties.options.minItems === 5 &&
      schema.properties.options.maxItems === 5 &&
      schema.properties.wrong.minItems === 4 &&
      schema.properties.wrong.maxItems === 4 &&
      JSON.stringify(schema.properties.answer.enum) ===
        JSON.stringify(["①", "②", "③", "④", "⑤"]),
  );
  const selfcheck = REFERENCE_LUNA_EXT.buildSelfcheck(ctx);
  check(
    "검산 블록: 사다리 + 게이트 반려 조건 전사(축자·마커·유일성·허사·형식·해설·오답)",
    selfcheck.includes("우선순위") &&
      selfcheck.includes("양보") &&
      selfcheck.includes("[[ ]]") &&
      selfcheck.includes("딱 한 번") &&
      selfcheck.includes("500자") &&
      selfcheck.includes("20자") &&
      selfcheck.includes("허사") &&
      selfcheck.includes("①②③④⑤") &&
      selfcheck.includes("2.5배") &&
      selfcheck.includes("작은따옴표") &&
      selfcheck.includes("합쇼체"),
  );
  check(
    "검산 블록 r2 보강: 축약형 표적 금지·자질 평행(즉사 상한)·규모 2배·근거 노출·마커 유출·사고 예산",
    selfcheck.includes("축약형 내부 금지") &&
      selfcheck.includes("즉사 오답 상한 2개") &&
      selfcheck.includes("2배를 넘기면 안 된다") &&
      selfcheck.includes("근거 노출 금지") &&
      selfcheck.includes("마커 유출 금지") &&
      selfcheck.includes("사고 예산"),
  );
  const schemaDesc = JSON.stringify(schema);
  check(
    "스키마 필드 설명 r2 보강: 표적 자격(축약형·총칭 we)·선지 층위/규모·해설 마커 금지",
    schemaDesc.includes("총칭 we/us/our") &&
      schemaDesc.includes("2배를 넘기지 않게") &&
      schemaDesc.includes("내부 마커"),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
