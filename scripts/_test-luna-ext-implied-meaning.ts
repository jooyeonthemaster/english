// IMPLIED_MEANING luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-implied-meaning.ts
import { IMPLIED_MEANING_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/implied-meaning";
import { IMPLIED_MEANING_MD_LANE } from "../src/lib/md-qgen/lane-implied";
import { IMPLIED_MD_DIRECTION_MULTI } from "../src/lib/md-qgen/adapter-implied";
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
  "When the town library finally reopened, the shelves were fuller than ever, yet longtime readers felt that something was missing. " +
  "The renovation had replaced every scratched table and every dim lamp, and the catalogue now answered in seconds. " +
  "Visitors praised the speed, and the staff enjoyed the quiet efficiency of the new systems. " +
  "Still, the head librarian kept one battered reading desk by the window, refusing offers to replace it. " +
  "Patrons had carved decades of small notes into its surface, and she argued that no upgrade could reproduce them. " +
  "In her eyes, the desk was a ledger written by many hands.";

const TARGET = "a ledger written by many hands";

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
  expression: TARGET,
  options: [
    { label: "①", text: "proof that the renovation failed to improve the library" },
    { label: "②", text: "a surface damaged by careless patrons over the years" },
    { label: "③", text: "a shared record of readers' lives that no upgrade can restore" },
    { label: "④", text: "an outdated tool the library keeps out of habit" },
    { label: "⑤", text: "a design model for the furniture of future libraries" },
  ],
  answers: ["③"],
  explanation:
    "낡은 책상을 남긴 이유가 이용자들이 수십 년 새겨 온 기록에 있음을 앞의 두 문장이 보여 주므로, 밑줄은 책상이 여러 사람의 흔적이 쌓인 공동의 기록물이라는 뜻입니다. 따라서 ③이 함축 의미로 가장 적절합니다.",
  // 라벨 뒤섞기 — 코어스(오름차순 정렬) 발동 검증용.
  wrong: [
    { label: "⑤", text: "근거없음 — 미래 도서관 가구의 모범이라는 서술은 지문에 근거가 없어 탈락입니다." },
    { label: "①", text: "범위확대 — 개보수 전체의 실패라는 처방은 지문이 말하지 않은 확장이므로 탈락입니다." },
    { label: "④", text: "방향반대 — 사서가 책상을 아끼는 이유를 습관 탓으로 뒤집어 논지와 반대이므로 탈락입니다." },
    { label: "②", text: "표면직역 — 새겨진 자국을 훼손으로만 읽은 직역이라 필자의 평가를 놓쳐 탈락입니다." },
  ],
};

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok ──────────────────────────
{
  const parsed = IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("코어스: 축자 픽스처엔 무발동(corrections 0)", parsed.corrections.length === 0, parsed.corrections.join("; "));
  const q = parsed.question as { expression: string; wrong: Array<{ label: string }> };
  check(
    "코어스: 오답 라벨 정렬 발동",
    q.wrong.map((w) => w.label).join("") === "①②④⑤",
    q.wrong.map((w) => w.label).join(""),
  );
  const adapt = IMPLIED_MEANING_MD_LANE.adapt(parsed, ctx);
  check(
    "레인 어댑터 왕복: ok + 정답 숫자축",
    adapt.ok === true && !!adapt.aiQuestion && adapt.aiQuestion.correctAnswer === "3",
    adapt.error ?? String(adapt.aiQuestion?.correctAnswer),
  );
  if (adapt.aiQuestion) {
    const surface = IMPLIED_MEANING_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+밑줄 마커+선지 렌더",
      surface.includes("함축") &&
        surface.includes(`__${TARGET}__`) &&
        /① proof that/.test(surface),
      surface.slice(0, 120),
    );
    console.log("── 평가 표면 표본 ──\n" + surface + "\n──");
  }
}

// ── ② 코어스 발동: 곱슬따옴표 장식 밑줄 → 지문 축자 스냅 ────────────────────
{
  const decorated = { ...GOOD, expression: "“a ledger written by many hands”" };
  const parsed = IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(decorated), ctx);
  const q = parsed.question as { expression: string };
  check(
    "코어스 발동: 장식 벗겨 축자 보정 + 게이트 클린",
    parsed.corrections.length > 0 && q.expression === TARGET && parsed.gateIssues.length === 0,
    `corrections=${parsed.corrections.join("; ")} / expr='${q.expression}' / issues=${parsed.gateIssues.join("; ")}`,
  );
}

// ── ②-b r1 패널 대응 코어스 (종결부호·관사·선지 표면) ───────────────────────
{
  // 밑줄에 종결 마침표가 딸려 들어간 경우 — 기출은 종결부호를 밑줄 밖에 둔다.
  const withPeriod = { ...GOOD, expression: `${TARGET}.` };
  const parsed = IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(withPeriod), ctx);
  const q = parsed.question as { expression: string };
  check(
    "코어스: 밑줄 꼬리 종결부호 제거 + 게이트 클린",
    q.expression === TARGET &&
      parsed.corrections.some((c) => c.includes("종결부호")) &&
      parsed.gateIssues.length === 0,
    `expr='${q.expression}' / corr=${parsed.corrections.join("; ")} / issues=${parsed.gateIssues.join("; ")}`,
  );

  // 관사를 잘라 시작한 명사구 표적 — 기출은 관사부터 통째로 긋는다.
  const noArticle = { ...GOOD, expression: "ledger written by many hands" };
  const parsedA = IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(noArticle), ctx);
  const qa = parsedA.question as { expression: string };
  check(
    "코어스: 명사구 밑줄에 관사 복원",
    qa.expression === TARGET && parsedA.corrections.some((c) => c.includes("관사")),
    `expr='${qa.expression}' / corr=${parsedA.corrections.join("; ")}`,
  );

  // 대문자 완결문+마침표 선지 → 기출 표면(소문자 구·마침표 없음)으로 하강.
  const sentenceOptions = {
    ...GOOD,
    options: GOOD.options.map((o) => ({
      ...o,
      text: o.text.slice(0, 1).toUpperCase() + o.text.slice(1) + ".",
    })),
  };
  const parsedO = IMPLIED_MEANING_LUNA_EXT.parseAndGate(
    JSON.stringify(sentenceOptions),
    ctx,
  );
  const qo = parsedO.question as { options: Array<{ text: string }> };
  check(
    "코어스: 대문자 완결문 선지 → 소문자 구·마침표 제거",
    qo.options.every((o) => /^[a-z]/.test(o.text) && !o.text.endsWith(".")) &&
      qo.options[2].text === GOOD.options[2].text &&
      parsedO.gateIssues.length === 0,
    qo.options.map((o) => o.text).join(" | "),
  );

  // 무발동 확인 — 이미 기출 표면인 GOOD 은 선지 보정이 울리지 않는다.
  check(
    "코어스 무발동: 기출 표면 선지엔 보정 없음",
    !IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx).corrections.some(
      (c) => c.includes("선지를 기출 표면"),
    ),
  );
}

// ── ③ 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ────────────────
{
  const short = { ...GOOD, options: GOOD.options.slice(0, 4) };
  check(
    "음성테스트: 선지 4개 반려",
    has(IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(short), ctx).gateIssues, "선지 4개"),
  );

  const notVerbatim = { ...GOOD, expression: "a chronicle of unseen readers" };
  check(
    "음성테스트: 축자 깨짐(지문에 없는 밑줄) 반려",
    has(
      IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(notVerbatim), ctx).gateIssues,
      "지문에 축자로 없음",
    ),
  );

  const tooLong = { ...GOOD, expression: "the head librarian kept one battered reading desk" };
  check(
    "음성테스트: 밑줄 7단어 초과 반려",
    has(IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(tooLong), ctx).gateIssues, "너무 김"),
  );

  // 자리 모호 — 같은 표현이 지문에 2회 이상이면 밑줄 위치가 확정되지 않는다.
  const ctxDup: MdLaneContext = {
    ...ctx,
    passage:
      PASSAGE +
      " Visitors even photographed the quiet efficiency of the reading room, as if quiet efficiency were the point.",
  };
  const ambiguous = { ...GOOD, expression: "quiet efficiency" };
  check(
    "음성테스트: 다중 등장 표현 자리 모호 반려",
    has(IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(ambiguous), ctxDup).gateIssues, "모호"),
  );

  const answerInWrong = {
    ...GOOD,
    wrong: [
      ...GOOD.wrong.slice(0, 3),
      { label: "③", text: "정답 라벨이 오답 목록에 끼었습니다." },
    ],
  };
  check(
    "음성테스트: 오답 목록에 정답 라벨 반려",
    has(
      IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(answerInWrong), ctx).gateIssues,
      "정답 라벨",
    ),
  );

  const koMixed = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 1 ? { ...o, text: "도서관의 조용한 기록" } : o,
    ),
  };
  check(
    "음성테스트: 언어 혼입 반려(en 설정에 한국어 선지)",
    has(IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(koMixed), ctx).gateIssues, "한글이 섞임"),
  );

  const twoAnswers = { ...GOOD, answers: ["③", "①"] };
  check(
    "음성테스트: 정답 개수 초과 반려",
    has(IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(twoAnswers), ctx).gateIssues, "정답 2개"),
  );

  // r1 Q23 계통 — 정답 자리에 밑줄의 축자 직역이 앉은 문항(해설과 정면 충돌).
  const literalAnswer = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 2
        ? { ...o, text: "a physical ledger book kept in the library archive" }
        : o,
    ),
  };
  check(
    "음성테스트: 정답이 밑줄 축자 직역(축자 표지+밑줄 어휘) 반려",
    has(
      IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(literalAnswer), ctx).gateIssues,
      "축자 직역",
    ),
  );

  // 오반려 방지 — 같은 축자 표지가 **오답**에 있으면 울리지 않는다(정상 미끼).
  const literalDistractor = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 1
        ? { ...o, text: "a physical ledger book kept in the library archive" }
        : o,
    ),
  };
  check(
    "오반려 방지: 축자 직역이 오답 자리면 무발동",
    !has(
      IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(literalDistractor), ctx)
        .gateIssues,
      "축자 직역",
    ),
  );

  const parseFail = IMPLIED_MEANING_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)", has(parseFail.gateIssues, "파싱 실패"));

  const ctxTeacher: MdLaneContext = {
    ...ctx,
    teacherPoints: [{ text: "quiet efficiency", unit: "phrase" }],
  };
  check(
    "음성테스트: 교사 지정 표현 미준수 반려(레인 동형 방어)",
    has(
      IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctxTeacher).gateIssues,
      "교사 지정",
    ),
  );
}

// ── ④ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(IMPLIED_MEANING_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 밑줄·선지·정답·해설 방류 + JSON 무노출`,
      out.startsWith(`밑줄: ${TARGET}\n`) &&
        out.includes("\n③ a shared record") &&
        out.includes("\n정답: ③") &&
        out.includes("\n해설: ") &&
        !out.includes("{") &&
        !out.includes('"label"'),
      out.slice(0, 160),
    );
  }
}

// ── ⑤ 동적 스키마·검산: 설정(선지수·정답수·언어)이 ctx 를 따라가는지 ─────────
{
  const ctx6: MdLaneContext = {
    ...ctx,
    resolved: { genericOptionCount: 6, genericAnswerCount: 2 },
  };
  const spec = IMPLIED_MEANING_LUNA_EXT.buildJsonSchema(ctx6);
  const schema = spec.schema as Record<string, any>;
  check(
    "동적 스키마: 선지 6·정답 2·오답 4 + 라벨 enum 6",
    schema.properties.options.minItems === 6 &&
      schema.properties.answers.minItems === 2 &&
      schema.properties.wrong.minItems === 4 &&
      schema.properties.options.items.properties.label.enum.length === 6,
  );
  const selfcheck6 = IMPLIED_MEANING_LUNA_EXT.buildSelfcheck(ctx6);
  check(
    "검산 블록: 설정 실값 반영(6개·2개)",
    selfcheck6.includes("정확히 6개") && selfcheck6.includes("정확히 2개"),
  );
  const selfcheckEn = IMPLIED_MEANING_LUNA_EXT.buildSelfcheck(ctx);
  check(
    "검산 블록: r1 패널 대응 4계통(유일성·대입·축자직역·소문자 구 표면) 탑재",
    selfcheckEn.includes("정답 유일성 개별 검산") &&
      selfcheckEn.includes("밑줄 자리 대입 검산") &&
      selfcheckEn.includes("정답에 축자 직역을 앉히지 마라") &&
      selfcheckEn.includes("소문자로 시작하는 구·절이고 마침표가 없다") &&
      selfcheckEn.includes("비유·관용·환유"),
  );

  const ctxKo: MdLaneContext = { ...ctx, rawTypeSettings: { optionLanguage: "ko" } };
  const selfcheckKo = IMPLIED_MEANING_LUNA_EXT.buildSelfcheck(ctxKo);
  check(
    "언어 노브: ko 설정 → 검산 한국어 문구 + 게이트가 영어 선지 반려",
    selfcheckKo.includes("한국어 완결 진술문") &&
      has(
        IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctxKo).gateIssues,
        "한국어가 아님",
      ),
  );

  // 다중 정답 왕복 — 6지선다 2정답 픽스처가 게이트 클린 → 멀티 발문 어댑트.
  const GOOD6 = {
    ...GOOD,
    options: [
      ...GOOD.options,
      { label: "⑥", text: "a living archive shaped by countless quiet visits" },
    ],
    answers: ["③", "⑥"],
    explanation:
      "책상에 쌓인 기록이 여러 이용자의 삶을 담은 공동의 흔적임을 앞 문장들이 보여 주므로, 공동 기록물이라는 뜻과 쌓여 온 살아 있는 기록이라는 뜻이 모두 성립합니다. 따라서 ③과 ⑥이 함축 의미로 적절합니다.",
  };
  const parsed6 = IMPLIED_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(GOOD6), ctx6);
  const adapt6 = IMPLIED_MEANING_MD_LANE.adapt(parsed6, ctx6);
  check(
    "다중 정답 왕복: 게이트 클린 + 멀티 발문 + correctAnswers",
    parsed6.gateIssues.length === 0 &&
      adapt6.ok === true &&
      adapt6.aiQuestion?.direction === IMPLIED_MD_DIRECTION_MULTI &&
      JSON.stringify(adapt6.aiQuestion?.correctAnswers) === '["3","6"]',
    parsed6.gateIssues.join("; ") || adapt6.error || String(adapt6.aiQuestion?.direction),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
