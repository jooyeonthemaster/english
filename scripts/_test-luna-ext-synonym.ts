// SYNONYM luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-synonym.ts
import { SYNONYM_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/synonym";
import { SYNONYM_MD_LANE } from "../src/lib/md-qgen/lane-synonym";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import type { MdSynonymQuestion } from "../src/lib/md-qgen/parser-synonym";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}
const has = (issues: string[], needle: string) => issues.some((i) => i.includes(needle));

// "defer" 는 1회(표적 적격) · "committee" 는 2회(자리 모호 음성테스트용) 등장.
const PASSAGE =
  "The committee decided to defer the final vote until independent auditors could examine the records. " +
  "Several members had pushed for an immediate decision, but they accepted the wait once they saw how thin the evidence was. " +
  "A verdict reached without full documentation, the chair argued, would only invite challenges later, and the committee could not afford another dispute.";

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
  target: "defer",
  options: [
    { label: "①", text: "postpone" },
    { label: "②", text: "cancel" },
    { label: "③", text: "expedite" },
    { label: "④", text: "withhold" },
    { label: "⑤", text: "conceal" },
  ],
  answers: ["①"],
  explanation:
    "이 문맥에서 defer 는 표결을 뒤로 미룬다는 뜻으로 쓰였습니다. 그 의미를 그대로 보존하는 postpone 이 가장 가깝습니다.",
  // 라벨을 일부러 뒤섞어 정렬 코어스 발동을 검증한다.
  wrong: [
    { label: "⑤", text: "감추다는 뜻이라 표결 연기의 의미축이 아닙니다." },
    { label: "②", text: "표결 자체를 없애는 것이어서 미룬다는 인과가 사라집니다." },
    { label: "④", text: "정보를 내주지 않는다는 뜻이라 목적어 연어가 어긋납니다." },
    { label: "③", text: "오히려 서두른다는 뜻으로 방향이 반대입니다." },
  ],
};

// ── ① 정상 왕복: parseAndGate 클린 → 코어스 → 레인 adapt ok ─────────────────
{
  const parsed = SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  const q = parsed.question as MdSynonymQuestion;
  check(
    "코어스: 오답 라벨 정렬 발동",
    q.wrong.map((w) => w.label).join("") === "②③④⑤",
    q.wrong.map((w) => w.label).join(""),
  );
  const adapt = SYNONYM_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    check(
      "어댑터 산출: targetWord·정답·문맥 문장",
      adapt.aiQuestion.targetWord === "defer" &&
        adapt.aiQuestion.correctAnswer === "1" &&
        String(adapt.aiQuestion.contextSentence).includes("defer"),
      JSON.stringify({
        targetWord: adapt.aiQuestion.targetWord,
        correctAnswer: adapt.aiQuestion.correctAnswer,
      }),
    );
    const surface = SYNONYM_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+밑줄 지문+원문자 선지 렌더",
      surface.includes("밑줄 친 단어") &&
        surface.includes("__defer__") &&
        surface.includes("① postpone") &&
        surface.includes("⑤ conceal"),
      surface.slice(0, 120),
    );
    console.log("── 평가 표면 표본 ──\n" + surface + "\n──");
  }
}

// ── ② 코어스 무발동·스냅 발동 ───────────────────────────────────────────────
{
  const sortedWrong = {
    ...GOOD,
    wrong: [...GOOD.wrong].sort((a, b) => a.label.localeCompare(b.label)),
  };
  const parsed = SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(sortedWrong), ctx);
  const q = parsed.question as MdSynonymQuestion;
  check(
    "코어스 무발동: 이미 정렬된 오답은 무변화 + 보정 0건",
    q.wrong.map((w) => w.label).join("") === "②③④⑤" && parsed.corrections.length === 0,
    `${q.wrong.map((w) => w.label).join("")} / corrections=${parsed.corrections.length}`,
  );

  // 대소문자 드리프트 — 지문 축자 스냅(공유 autoSnapSynonymTarget)이 살린다.
  const caseDrift = { ...GOOD, target: "Defer" };
  const snapped = SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(caseDrift), ctx);
  const sq = snapped.question as MdSynonymQuestion;
  check(
    "스냅 발동: 'Defer' → 지문 축자 'defer' 보정 + 게이트 클린",
    sq.target === "defer" && snapped.corrections.length === 1 && snapped.gateIssues.length === 0,
    `target=${sq.target} corrections=${snapped.corrections.join("; ")} issues=${snapped.gateIssues.join("; ")}`,
  );
}

// ── ②-b 해설 지면 코어스: 내부 용어 정화 + 기제 표기 서식 통일 ─────────────
{
  const jargon = {
    ...GOOD,
    explanation:
      "표적 단어는 이 문맥에서 표결을 미룬다는 뜻입니다. 표적은 postpone 으로 바꾸어도 의미가 보존됩니다.",
    wrong: [
      { label: "②", text: "연어 위반: 표결 자체를 없애는 것이어서 인과가 사라집니다." },
      { label: "③", text: "[강도 이동] 오히려 서두른다는 뜻으로 방향이 반대입니다." },
      { label: "④", text: "다의어 오축 — 정보를 내주지 않는다는 뜻이라 연어가 어긋납니다." },
      { label: "⑤", text: "표적어의 다른 뜻이라 표결 연기의 의미축이 아닙니다." },
    ],
  };
  const parsed = SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(jargon), ctx);
  const q = parsed.question as MdSynonymQuestion;
  check(
    "코어스: 해설 내부 용어('표적 단어는'·'표적은') → '밑줄 친 단어' + 조사 보정",
    q.explanation.startsWith("밑줄 친 단어는") &&
      q.explanation.includes("밑줄 친 단어는 postpone") &&
      !q.explanation.includes("표적"),
    q.explanation,
  );
  check(
    "코어스: 오답해설 내부 용어 정화('표적어의' → '밑줄 친 단어의')",
    q.wrong.some((w) => w.text.startsWith("밑줄 친 단어의")) &&
      q.wrong.every((w) => !w.text.includes("표적")),
    q.wrong.map((w) => w.text).join(" | "),
  );
  check(
    "코어스: 기제 표기 콜론형·대괄호형 → 전각 대시 다수형",
    q.wrong.some((w) => w.text.startsWith("연어 위반 — ")) &&
      q.wrong.some((w) => w.text.startsWith("강도 이동 — ")) &&
      // 이미 다수형인 줄은 건드리지 않는다.
      q.wrong.some((w) => w.text.startsWith("다의어 오축 — ")),
    q.wrong.map((w) => w.text).join(" | "),
  );
  check(
    "코어스: 보정 근거가 corrections 에 남는다",
    parsed.corrections.some((c) => c.includes("내부 용어")) &&
      parsed.corrections.some((c) => c.includes("기제 표기")),
    parsed.corrections.join("; "),
  );
  check(
    "코어스 무발동: 정상 픽스처는 해설·오답해설 무변화",
    (() => {
      const clean = SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
      const cq = clean.question as MdSynonymQuestion;
      return (
        cq.explanation === GOOD.explanation &&
        clean.corrections.length === 0 &&
        cq.wrong.every((w) =>
          GOOD.wrong.some((g) => g.label === w.label && g.text === w.text),
        )
      );
    })(),
  );
}

// ── ②-c 검산 블록: 유일성 조항이 실제로 실려 있는지 ─────────────────────────
{
  const selfcheck = SYNONYM_LUNA_EXT.buildSelfcheck(ctx);
  check(
    "검산 블록: 정답 유일성 3조항(같은 뜻줄기 금지·지문 인용 배제근거·정답 앵커)",
    selfcheck.includes("같은 뜻줄기의 오답은 절대 세우지 마라") &&
      selfcheck.includes("배제 근거는 지문에서 인용할 수 있어야 한다") &&
      selfcheck.includes("정답에도 지문 앵커가 있어야 한다") &&
      selfcheck.includes("복수정답 신고 사유"),
  );
  check(
    "검산 블록: 해설 지면 조항(정답 단어 명시·내부 용어 금지·기제 골격·정답 위치 편향)",
    selfcheck.includes("영어 철자 그대로") &&
      selfcheck.includes("출제 내부 용어") &&
      selfcheck.includes("<기제 이름> — <설명>") &&
      selfcheck.includes("정답 라벨을 ① 에 두지 마라"),
  );
}

// ── ③ 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  const notInPassage = { ...GOOD, target: "harmonize" };
  check(
    "음성테스트: 표적이 지문에 없음 → 축자 반려",
    has(SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(notInPassage), ctx).gateIssues, "축자로 없음"),
  );

  const ambiguous = { ...GOOD, target: "committee" };
  check(
    "음성테스트: 표적 2회 등장 → 자리 모호 반려",
    has(SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(ambiguous), ctx).gateIssues, "회 등장"),
  );

  const leak = {
    ...GOOD,
    options: GOOD.options.map((o, i) => (i === 2 ? { ...o, text: "defer" } : o)),
  };
  check(
    "음성테스트: 표적 자신이 선지에 → 정답 누설 반려",
    has(SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(leak), ctx).gateIssues, "대상 단어와 동일"),
  );

  const gloss = {
    ...GOOD,
    options: GOOD.options.map((o, i) => (i === 1 ? { ...o, text: "cancel (취소하다)" } : o)),
  };
  check(
    "음성테스트: 선지 한글 뜻풀이 → 표면 계약 반려",
    has(SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(gloss), ctx).gateIssues, "한글"),
  );

  const answerInWrong = {
    ...GOOD,
    wrong: [
      ...GOOD.wrong.slice(0, 3),
      { label: "①", text: "정답 라벨이 오답 칸에 들어간 실측 드리프트입니다." },
    ],
  };
  const aiw = SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(answerInWrong), ctx);
  check(
    "음성테스트: 오답 칸의 정답 라벨 → 걷어냄 근거를 지목하며 개수 반려",
    has(aiw.gateIssues, "오답 칸에 있어 제외됨") && has(aiw.gateIssues, "3개"),
    aiw.gateIssues.join("; "),
  );

  const plainNumber = {
    ...GOOD,
    explanation: "2번 선지는 표결 자체를 없애는 것이므로 오답입니다.",
  };
  check(
    "음성테스트: 해설의 평숫자 선지 지칭 → 셔플 불가 반려",
    has(SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(plainNumber), ctx).gateIssues, "평숫자"),
  );

  const short = { ...GOOD, options: GOOD.options.slice(0, 4) };
  check(
    "음성테스트: 선지 4개 → 개수 반려",
    has(SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(short), ctx).gateIssues, "4개"),
  );

  const teacherCtx: MdLaneContext = {
    ...ctx,
    teacherPoints: [{ text: "verdict", unit: "word" }],
  };
  check(
    "음성테스트: 교사 지정 단어 ≠ 표적 → 준수 반려",
    has(
      SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), teacherCtx).gateIssues,
      "교사 지정",
    ),
  );

  const parseFail = SYNONYM_LUNA_EXT.parseAndGate("{broken json", ctx);
  check(
    "음성테스트: JSON 파손 → gateIssues 반환(throw 금지)",
    has(parseFail.gateIssues, "파싱 실패") && parseFail.question === null,
  );
}

// ── ④ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(SYNONYM_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 대상·선지·정답·해설·오답 방류 + JSON 무노출`,
      out.includes("대상: defer") &&
        out.includes("\n① postpone") &&
        out.includes("\n정답: ①") &&
        out.includes("\n해설: ") &&
        out.includes("서두른다는 뜻으로 방향이 반대입니다") &&
        !out.includes("{") &&
        !out.includes('"label"'),
      out.slice(0, 150),
    );
  }
}

// ── ⑤ 동적 스키마 + 복수 정답 왕복 ──────────────────────────────────────────
{
  const ctx6: MdLaneContext = {
    ...ctx,
    resolved: { genericOptionCount: 6, genericAnswerCount: 2 },
  };
  const spec = SYNONYM_LUNA_EXT.buildJsonSchema(ctx6);
  const schema = spec.schema as Record<string, any>;
  check(
    "동적 스키마: 선지 6·정답 2·오답 4·라벨 enum 6",
    schema.properties.options.minItems === 6 &&
      schema.properties.answers.minItems === 2 &&
      schema.properties.wrong.minItems === 4 &&
      schema.properties.options.items.properties.label.enum.length === 6,
  );
  const selfcheck = SYNONYM_LUNA_EXT.buildSelfcheck(ctx6);
  check(
    "검산 블록: 설정 실값 반영(선지 6·정답 2·오답 4)",
    selfcheck.includes("정확히 6개") &&
      selfcheck.includes("정확히 2개") &&
      selfcheck.includes("정확히 4개") &&
      selfcheck.includes("①②③④⑤⑥"),
  );

  const GOOD6 = {
    target: "defer",
    options: [
      { label: "①", text: "postpone" },
      { label: "②", text: "suspend" },
      { label: "③", text: "expedite" },
      { label: "④", text: "withhold" },
      { label: "⑤", text: "conceal" },
      { label: "⑥", text: "disclose" },
    ],
    answers: ["①", "②"],
    explanation:
      "이 문맥에서 defer 는 표결을 뒤로 미룬다는 뜻으로 쓰였습니다. postpone 과 suspend 는 서로 다른 측면에서 그 의미를 보존합니다.",
    wrong: [
      { label: "③", text: "오히려 서두른다는 뜻으로 방향이 반대입니다." },
      { label: "④", text: "정보를 내주지 않는다는 뜻이라 목적어 연어가 어긋납니다." },
      { label: "⑤", text: "감추다는 뜻이라 표결 연기의 의미축이 아닙니다." },
      { label: "⑥", text: "공개한다는 뜻이라 동의 관계가 아닙니다." },
    ],
  };
  const parsed6 = SYNONYM_LUNA_EXT.parseAndGate(JSON.stringify(GOOD6), ctx6);
  check("복수 정답: 게이트 클린", parsed6.gateIssues.length === 0, parsed6.gateIssues.join("; "));
  const adapt6 = SYNONYM_MD_LANE.adapt(parsed6, ctx6);
  check(
    "복수 정답: adapt ok + 「모두」 발문 + correctAnswers",
    adapt6.ok === true &&
      !!adapt6.aiQuestion &&
      String(adapt6.aiQuestion.direction).includes("모두") &&
      JSON.stringify(adapt6.aiQuestion.correctAnswers) === '["1","2"]',
    adapt6.error ?? JSON.stringify(adapt6.aiQuestion?.correctAnswers),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
