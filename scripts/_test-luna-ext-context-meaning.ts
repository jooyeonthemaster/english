// CONTEXT_MEANING luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-context-meaning.ts
import { CONTEXT_MEANING_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/context-meaning";
import { CONTEXT_MEANING_MD_LANE } from "../src/lib/md-qgen/lane-context-meaning";
import { CONTEXT_MEANING_MD_DIRECTION_MULTI } from "../src/lib/md-qgen/adapter-context-meaning";
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

// 표적 "carried": 사전 대표뜻('옮기다')으로 바꿔 읽으면 무너지고, 뒤의
// "a steep price" 를 읽어야 '(대가를) 수반하다'로 확정되는 다의어 자리.
// 지문에 정확히 1회 등장(스냅·게이트 유일성 검산의 전제).
const PASSAGE =
  "For years the committee treated silence as agreement, and its plans sailed through without debate. " +
  "When a junior member finally pressed for details, the chairman waved her question aside as a distraction. " +
  "Yet the budget she doubted soon collapsed, and those who had nodded along began to see that their easy unanimity had carried a steep price. " +
  "The next season the group adopted a simple rule: no proposal could pass until at least one member had argued against it.";

const TARGET = "carried";

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
  word: TARGET,
  options: [
    { label: "①", text: "moved from place to place" },
    { label: "②", text: "involved as an unavoidable cost" },
    { label: "③", text: "supported the weight of" },
    { label: "④", text: "won approval easily" },
    { label: "⑤", text: "paid back with interest" },
  ],
  answers: ["②"],
  explanation:
    "밑줄 친 carried 는 뒤의 a steep price 와 결합해 대가를 수반했다는 뜻으로 쓰였습니다. 쉽게 얻은 만장일치가 예산 붕괴라는 비용을 치르게 했다는 앞뒤 문장의 인과가 이 의미축을 확정합니다.",
  // 라벨 뒤섞기 — 코어스(오름차순 정렬) 발동 검증용.
  wrong: [
    { label: "⑤", text: "근접 의미장 — 값 지불의 의미장에 있으나 이자를 붙여 갚았다는 함축은 지문 어디에도 없어 탈락입니다." },
    { label: "①", text: "대표뜻 — carry 를 배울 때 가장 먼저 외우는 옮기다라는 뜻이라 밑줄만 본 학생이 집지만, 대가는 나르는 물건이 아니므로 탈락입니다." },
    { label: "④", text: "문맥 유혹 오독 — 앞부분의 통과 이미지에 이끌린 오독으로, 밑줄 문장은 승인이 아니라 대가를 말하므로 탈락입니다." },
    { label: "③", text: "폴리세미 — carry 가 실제로 갖는 무게를 지탱하다라는 뜻이지만 이 문맥의 목적어는 무게가 아니므로 탈락입니다." },
  ],
};

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok ──────────────────────────
{
  const parsed = CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("코어스: 축자 픽스처엔 무발동(corrections 0)", parsed.corrections.length === 0, parsed.corrections.join("; "));
  const q = parsed.question as { word: string; wrong: Array<{ label: string }> };
  check(
    "코어스: 오답 라벨 정렬 발동",
    q.wrong.map((w) => w.label).join("") === "①③④⑤",
    q.wrong.map((w) => w.label).join(""),
  );
  const adapt = CONTEXT_MEANING_MD_LANE.adapt(parsed, ctx);
  check(
    "레인 어댑터 왕복: ok + 정답 숫자축 + 축자 밑줄",
    adapt.ok === true &&
      !!adapt.aiQuestion &&
      adapt.aiQuestion.correctAnswer === "2" &&
      adapt.aiQuestion.underlinedWord === TARGET &&
      typeof adapt.aiQuestion.surroundingText === "string" &&
      (adapt.aiQuestion.surroundingText as string).includes(TARGET),
    adapt.error ?? `correctAnswer=${String(adapt.aiQuestion?.correctAnswer)}`,
  );
  if (adapt.aiQuestion) {
    const surface = CONTEXT_MEANING_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+밑줄 마커+선지 렌더",
      surface.includes("문맥상 의미") &&
        surface.includes(`__${TARGET}__`) &&
        /① moved from place to place/.test(surface) &&
        /⑤ paid back with interest/.test(surface),
      surface.slice(0, 120),
    );
    console.log("── 평가 표면 표본 ──\n" + surface + "\n──");
  }
}

// ── ② 코어스 발동: 대소문자 드리프트 밑줄 → 지문 축자 스냅 ──────────────────
{
  const decorated = { ...GOOD, word: "Carried" };
  const parsed = CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(decorated), ctx);
  const q = parsed.question as { word: string };
  check(
    "코어스 발동: 대소문자 보정 + 게이트 클린",
    parsed.corrections.length > 0 && q.word === TARGET && parsed.gateIssues.length === 0,
    `corrections=${parsed.corrections.join("; ")} / word='${q.word}' / issues=${parsed.gateIssues.join("; ")}`,
  );
}

// ── ③ 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ────────────────
{
  const short = { ...GOOD, options: GOOD.options.slice(0, 4) };
  check(
    "음성테스트: 선지 4개 반려",
    has(CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(short), ctx).gateIssues, "선지 4개"),
  );

  const notVerbatim = { ...GOOD, word: "transported" };
  check(
    "음성테스트: 축자 깨짐(지문에 없는 밑줄) 반려",
    has(
      CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(notVerbatim), ctx).gateIssues,
      "지문에 축자로 없음",
    ),
  );

  // "member" 는 지문에 2회 등장 — 밑줄 자리가 확정되지 않는다.
  const ambiguous = { ...GOOD, word: "member" };
  check(
    "음성테스트: 다중 등장 표현 자리 모호 반려",
    has(CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(ambiguous), ctx).gateIssues, "모호"),
  );

  const tooLong = { ...GOOD, word: "those who had nodded along began" };
  check(
    "음성테스트: 밑줄 6단어 초과 반려",
    has(CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(tooLong), ctx).gateIssues, "너무 김"),
  );

  const functionWord = { ...GOOD, word: "the" };
  check(
    "음성테스트: 기능어 단독 밑줄 반려",
    has(CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(functionWord), ctx).gateIssues, "기능어 단독"),
  );

  // 따옴표 인용(언급 mention) 자리 — 지문이 말 자체를 소개하는 토큰.
  const ctxQuote: MdLaneContext = {
    ...ctx,
    passage: PASSAGE + ' Critics later summed the whole episode up as "groupthink".',
  };
  const quoted = { ...GOOD, word: "groupthink" };
  check(
    "음성테스트: 따옴표 인용 토큰 반려",
    has(CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(quoted), ctxQuote).gateIssues, "따옴표로 인용"),
  );

  const tautology = {
    ...GOOD,
    options: GOOD.options.map((o, i) => (i === 0 ? { ...o, text: "carries" } : o)),
  };
  check(
    "음성테스트: 밑줄 굴절형 선지(동어반복) 반려",
    has(CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(tautology), ctx).gateIssues, "동어반복"),
  );

  const parens = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 2 ? { ...o, text: "supported the weight (of things)" } : o,
    ),
  };
  check(
    "음성테스트: 선지 괄호 주석 반려",
    has(CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(parens), ctx).gateIssues, "괄호 주석"),
  );

  const koMixed = {
    ...GOOD,
    options: GOOD.options.map((o, i) => (i === 3 ? { ...o, text: "대가를 수반함" } : o)),
  };
  check(
    "음성테스트: 언어 혼입 반려(en 설정에 한국어 선지)",
    has(CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(koMixed), ctx).gateIssues, "한글이 섞임"),
  );

  const twoAnswers = { ...GOOD, answers: ["②", "④"] };
  check(
    "음성테스트: 정답 개수 초과 반려",
    has(CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(twoAnswers), ctx).gateIssues, "정답 2개"),
  );

  const answerInWrong = {
    ...GOOD,
    wrong: [
      ...GOOD.wrong.slice(0, 3),
      { label: "②", text: "정답 라벨이 오답 목록에 끼었습니다." },
    ],
  };
  check(
    "음성테스트: 오답 목록에 정답 라벨 반려",
    has(
      CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(answerInWrong), ctx).gateIssues,
      "정답 라벨",
    ),
  );

  // 평숫자 선지 지칭 — 셔플 취소(UNMAPPABLE_MENTION)를 게이트가 선제 반려.
  const numericMention = {
    ...GOOD,
    wrong: GOOD.wrong.map((w, i) =>
      i === 1 ? { ...w, text: "대표뜻 — 1번 선지와 같은 이유로 탈락입니다." } : w,
    ),
  };
  check(
    "음성테스트: 오답해설 평숫자 선지 지칭 반려",
    has(
      CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(numericMention), ctx).gateIssues,
      "평숫자",
    ),
  );

  const parseFail = CONTEXT_MEANING_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)", has(parseFail.gateIssues, "파싱 실패"));

  const ctxTeacher: MdLaneContext = {
    ...ctx,
    teacherPoints: [{ text: "sailed through", unit: "phrase" }],
  };
  check(
    "음성테스트: 교사 지정 표현 미준수 반려(레인 동형 방어)",
    has(
      CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctxTeacher).gateIssues,
      "교사 지정",
    ),
  );
}

// ── ④ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(CONTEXT_MEANING_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 밑줄·선지·정답·해설 방류 + JSON 무노출`,
      out.startsWith(`밑줄: ${TARGET}\n`) &&
        out.includes("\n② involved as an unavoidable cost") &&
        out.includes("\n정답: ②") &&
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
  const spec = CONTEXT_MEANING_LUNA_EXT.buildJsonSchema(ctx6);
  const schema = spec.schema as Record<string, any>;
  check(
    "동적 스키마: 선지 6·정답 2·오답 4 + 라벨 enum 6",
    schema.properties.options.minItems === 6 &&
      schema.properties.answers.minItems === 2 &&
      schema.properties.wrong.minItems === 4 &&
      schema.properties.options.items.properties.label.enum.length === 6,
  );
  const selfcheck6 = CONTEXT_MEANING_LUNA_EXT.buildSelfcheck(ctx6);
  check(
    "검산 블록: 설정 실값 반영(6개·2개)",
    selfcheck6.includes("정확히 6개") && selfcheck6.includes("정확히 2개"),
  );

  const ctxKo: MdLaneContext = { ...ctx, rawTypeSettings: { optionLanguage: "ko" } };
  const selfcheckKo = CONTEXT_MEANING_LUNA_EXT.buildSelfcheck(ctxKo);
  check(
    "언어 노브: ko 설정 → 검산 한국어 문구 + 게이트가 영어 선지 반려",
    selfcheckKo.includes("한국어 뜻풀이") &&
      has(
        CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctxKo).gateIssues,
        "한국어가 아님",
      ),
  );

  // 다중 정답 왕복 — 6지선다 2정답 픽스처가 게이트 클린 → 멀티 발문 어댑트.
  const GOOD6 = {
    ...GOOD,
    options: [
      ...GOOD.options,
      { label: "⑥", text: "entailed as its hidden cost" },
    ],
    answers: ["②", "⑥"],
    explanation:
      "밑줄 친 carried 는 대가를 수반했다는 뜻으로 쓰였습니다. 예산 붕괴라는 결과를 밝히는 문장의 인과가 이 의미축을 확정하므로 ②과 ⑥이 모두 이 문맥의 의미로 성립합니다.",
  };
  const parsed6 = CONTEXT_MEANING_LUNA_EXT.parseAndGate(JSON.stringify(GOOD6), ctx6);
  const adapt6 = CONTEXT_MEANING_MD_LANE.adapt(parsed6, ctx6);
  check(
    "다중 정답 왕복: 게이트 클린 + 멀티 발문 + correctAnswers",
    parsed6.gateIssues.length === 0 &&
      adapt6.ok === true &&
      adapt6.aiQuestion?.direction === CONTEXT_MEANING_MD_DIRECTION_MULTI &&
      JSON.stringify(adapt6.aiQuestion?.correctAnswers) === '["2","6"]',
    parsed6.gateIssues.join("; ") || adapt6.error || String(adapt6.aiQuestion?.direction),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
