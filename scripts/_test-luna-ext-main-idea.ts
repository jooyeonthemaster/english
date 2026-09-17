// MAIN_IDEA luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-main-idea.ts
import {
  MAIN_IDEA_LUNA_EXT,
  mainIdeaFormatTellIssues,
} from "../src/lib/md-qgen/luna-ext/main-idea";
import { MAIN_IDEA_MD_LANE } from "../src/lib/md-qgen/lane-main-idea";
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
  "Urban wildlife has learned to thrive in cities. Raccoons open containers that were designed to keep them out, and crows drop nuts onto crosswalks so passing cars crack them open. " +
  "Researchers who track these behaviors find that they spread quickly through populations, as young animals imitate the techniques that prove successful. " +
  "The lesson is clear: cities are not biological deserts but engines of rapid adaptation, and the animals that master them are rewriting what we thought we knew about learning in the wild.";

const EVIDENCE =
  "The lesson is clear: cities are not biological deserts but engines of rapid adaptation, and the animals that master them are rewriting what we thought we knew about learning in the wild.";

const TEACHER_SENTENCE =
  "Researchers who track these behaviors find that they spread quickly through populations, as young animals imitate the techniques that prove successful.";

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
  stemAxis: "요지",
  evidence: EVIDENCE,
  options: [
    { label: "①", text: "도시 환경은 야생 동물의 학습 능력을 약화시켜 본능에만 의존하게 만든다." },
    { label: "②", text: "야생 동물은 인간이 만든 시설물을 이용해 먹이를 얻는 요령을 익힌다." },
    { label: "③", text: "도시는 생물학적 불모지가 아니라 동물의 빠른 적응과 학습을 이끄는 환경이다." },
    { label: "④", text: "도시 야생 동물이 일으키는 피해를 막을 제도적 관리 방안이 마련되어야 한다." },
    { label: "⑤", text: "도시에 사는 동물은 야생에 남은 동물보다 오래 생존하는 경향을 보인다." },
  ],
  answers: ["③"],
  explanation:
    "전환 없이 마지막 문장이 글 전체를 종합하며, 도시가 동물의 빠른 적응과 학습을 이끄는 엔진이라는 판단이 곧 요지입니다. 이를 재진술한 선지가 정답입니다.",
  wrong: [
    { label: "⑤", text: "생존 기간 비교는 지문에 근거 문장이 없는 통념형 진술입니다." },
    { label: "①", text: "지문은 학습이 확산된다고 했지 본능 의존은 말하지 않았으므로 방향이 반대입니다." },
    { label: "④", text: "제도적 관리라는 당위는 지문이 말하지 않은 범위확대입니다." },
    { label: "②", text: "시설물 이용 사례는 글의 근거일 뿐 요지로 승격한 부분승격 함정입니다." },
  ],
};

// ── ① 정상 왕복: parseAndGate 클린 → 레인 adapt ok ──────────────────────────
{
  const parsed = MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check("정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check(
    "코어스 무발동: 정렬된 선지에 corrections 없음",
    parsed.corrections.length === 0,
    parsed.corrections.join("; "),
  );
  const q = parsed.question as { wrong: Array<{ label: string }> };
  check(
    "코어스: 오답 라벨 표시 정렬(무기록 결정론)",
    q.wrong.map((w) => w.label).join("") === "①②④⑤",
    q.wrong.map((w) => w.label).join(""),
  );
  const adapt = MAIN_IDEA_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    check(
      "어댑터: 정답 축·발문 결정형",
      adapt.aiQuestion.correctAnswer === "3" &&
        String(adapt.aiQuestion.direction).includes("요지"),
      `${adapt.aiQuestion.correctAnswer} / ${adapt.aiQuestion.direction}`,
    );
    const surface = MAIN_IDEA_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 발문+지문+원문자 선지 렌더",
      surface.includes("요지") &&
        surface.includes(PASSAGE.slice(0, 40)) &&
        surface.includes("③ 도시는 생물학적 불모지가 아니라"),
      surface.slice(0, 120),
    );
    console.log("── 평가 표면 표본(전체) ──\n" + surface + "\n──");
  }
}

// ── ② 코어스 발동 (기계 확정 교정이 실제로 도는지) ──────────────────────────
{
  const shuffled = {
    ...GOOD,
    options: [GOOD.options[1], GOOD.options[0], GOOD.options[2], GOOD.options[3], GOOD.options[4]],
  };
  const parsed = MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(shuffled), ctx);
  const labels = (parsed.question as { options: Array<{ label: string }> }).options
    .map((o) => o.label)
    .join("");
  check(
    "코어스 발동: 선지 라벨 순열 재정렬 + 게이트 클린",
    has(parsed.corrections, "재정렬") && labels === "①②③④⑤" && parsed.gateIssues.length === 0,
    `corrections=${parsed.corrections.join("; ")} labels=${labels} issues=${parsed.gateIssues.join("; ")}`,
  );

  const marked = {
    ...GOOD,
    options: GOOD.options.map((o, i) => (i === 2 ? { ...o, text: `✅ ${o.text}` } : o)),
  };
  const parsedMarked = MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(marked), ctx);
  check(
    "스냅 발동: 인라인 정답 표시 제거 + 게이트 클린",
    has(parsedMarked.corrections, "인라인 정답 표시 제거") && parsedMarked.gateIssues.length === 0,
    `corrections=${parsedMarked.corrections.join("; ")} issues=${parsedMarked.gateIssues.join("; ")}`,
  );

  const dupAnswers = { ...GOOD, answers: ["③", "③"] };
  const parsedDup = MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(dupAnswers), ctx);
  check(
    "코어스 발동: 정답 라벨 중복 제거 + 게이트 클린",
    has(parsedDup.corrections, "정답 라벨 중복 제거") && parsedDup.gateIssues.length === 0,
    `corrections=${parsedDup.corrections.join("; ")} issues=${parsedDup.gateIssues.join("; ")}`,
  );
}

// ── ③ 게이트 음성테스트 (계기 검증 — 위반이 울리는지) ───────────────────────
{
  const short = { ...GOOD, options: GOOD.options.slice(0, 4), wrong: GOOD.wrong.slice(0, 3) };
  check(
    "음성테스트: 선지 4개 반려",
    has(MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(short), ctx).gateIssues, "선지 4개"),
  );

  const fakeEvidence = {
    ...GOOD,
    evidence: "Cities always destroy the learning habits of every animal that settles in them.",
  };
  check(
    "음성테스트: 근거 문장 비축자 반려(유일 앵커)",
    has(MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(fakeEvidence), ctx).gateIssues, "근거 문장"),
  );

  const answerInWrong = {
    ...GOOD,
    wrong: [...GOOD.wrong.slice(0, 3), { label: "③", text: "정답 라벨이 오답 목록에 끼었습니다." }],
  };
  check(
    "음성테스트: 오답 목록에 정답 라벨 반려",
    has(
      MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(answerInWrong), ctx).gateIssues,
      "오답해설에 정답 라벨 포함",
    ),
  );

  const truncated = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 4 ? { ...o, text: "도시에 사는 동물은 야생에 남은 동물보다 오래 생존하며," } : o,
    ),
  };
  check(
    "음성테스트: 잘린 선지 꼬리 반려",
    has(MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(truncated), ctx).gateIssues, "잘림"),
  );

  const englishMixed = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 1 ? { ...o, text: "Urban animals simply learn faster than their wild cousins." } : o,
    ),
  };
  check(
    "음성테스트: 한국어 설정에 영어 선지 반려",
    has(
      MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(englishMixed), ctx).gateIssues,
      "한국어 진술문이 아님",
    ),
  );

  const nounPhrases = {
    ...GOOD,
    options: [
      { label: "①", text: "도시 야생 동물의 학습 능력 변화에 대한 고찰" },
      { label: "②", text: "인간 시설물을 이용하는 야생 동물 행동의 실태" },
      { label: "③", text: "도시는 생물학적 불모지가 아니라 동물의 빠른 적응과 학습을 이끄는 환경이다." },
      { label: "④", text: "도시 야생 동물 피해에 대한 제도적 관리의 시급성" },
      { label: "⑤", text: "도시 환경과 동물 생존 기간 사이의 상관관계" },
    ],
  };
  check(
    "음성테스트: 명사구 선지 다수 반려(제목·주제형 표면)",
    has(MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(nounPhrases), ctx).gateIssues, "명사구"),
  );

  const parseFail = MAIN_IDEA_LUNA_EXT.parseAndGate("{broken json", ctx);
  check("음성테스트: JSON 파손 → gateIssues 반환(throw 금지)", has(parseFail.gateIssues, "파싱 실패"));
}

// ── ③-2 형식 tell 음성테스트 (r2 보강 — paired 벤치 실측 반려 3계통) ────────
// 실측 근거: eval/MAIN_IDEA 판정. luna 팔에서만 (a) 정답 길이 tell(Q10 1.82배·
// Q15 1.83배) (b) 정답+방향반대 오답 앞머리 축자 공유 거울쌍(Q16 26자) (c) 다른
// 선지를 지시어로 받는 문맥 의존 선지(Q15 ⑤)가 나왔고, 셋 다 공유 게이트를 클린
// 통과했다. 계기가 0건을 울리면 계기가 아니므로 각 계통을 실제로 재현해 확인한다.
{
  const lengthTell = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 2
        ? {
            ...o,
            text:
              "도시는 생물학적 불모지가 아니라 동물이 서로의 성공한 요령을 빠르게 따라 배우며 적응을 거듭하는 환경이다.",
          }
        : o,
    ),
  };
  const parsedLen = MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(lengthTell), ctx);
  check(
    "음성테스트(tell a): 정답이 최장 — 길이 tell 반려",
    has(parsedLen.gateIssues, "정답이 길이로 드러남"),
    parsedLen.gateIssues.join("; "),
  );

  const mirrorPair = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 0
        ? {
            ...o,
            text: "도시는 생물학적 불모지가 아니라 동물의 학습 능력을 서서히 빼앗는 공간이다.",
          }
        : o,
    ),
  };
  const parsedMirror = MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(mirrorPair), ctx);
  check(
    "음성테스트(tell b): 정답+방향반대 오답 앞머리 축자 공유 거울쌍 반려",
    has(parsedMirror.gateIssues, "앞머리") && has(parsedMirror.gateIssues, "정답이 낀 쌍"),
    parsedMirror.gateIssues.join("; "),
  );

  const crossRef = {
    ...GOOD,
    options: GOOD.options.map((o, i) =>
      i === 4
        ? { ...o, text: "이러한 적응 능력을 지키려면 도시의 생태 정책을 다시 설계해야 한다." }
        : o,
    ),
  };
  const parsedRef = MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(crossRef), ctx);
  check(
    "음성테스트(tell c): 다른 선지를 지시어로 받는 문맥 의존 선지 반려",
    has(parsedRef.gateIssues, "지시어로 받음"),
    parsedRef.gateIssues.join("; "),
  );

  // 오반려 방지: 정답이 최장이어도 편차가 좁으면(gemini 실측 분포) 울리지 않아야 한다.
  check(
    "무발동: 정답이 최장이나 편차 좁음 — tell 무반응",
    mainIdeaFormatTellIssues(
      [
        { label: "①", text: "가".repeat(46) },
        { label: "②", text: "나".repeat(44) },
        { label: "③", text: "다".repeat(50) },
        { label: "④", text: "라".repeat(45) },
        { label: "⑤", text: "마".repeat(43) },
      ],
      ["③"],
      "ko",
    ).length === 0,
  );
  // 정답이 최장이 아니어도 전체 불균형(1.6배↑)이면 형식 tell 로 잡는다(Q16 계통).
  check(
    "발동: 정답 아닌 선지가 최장이어도 1.6배 불균형이면 반려",
    mainIdeaFormatTellIssues(
      [
        { label: "①", text: "가".repeat(53) },
        { label: "②", text: "나".repeat(56) },
        { label: "③", text: "다".repeat(34) },
        { label: "④", text: "라".repeat(43) },
        { label: "⑤", text: "마".repeat(32) },
      ],
      ["①"],
      "ko",
    ).some((i) => i.includes("선지 길이 불균형")),
  );
}

// ── ④ 교사 지정 근거 문장 노브 ──────────────────────────────────────────────
{
  const ctxTp: MdLaneContext = {
    ...ctx,
    teacherPoints: [{ text: TEACHER_SENTENCE, unit: "sentence" }],
  };
  check(
    "음성테스트: 교사 지정 근거 미반영 반려",
    has(MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctxTp).gateIssues, "교사 지정"),
  );
  const compliant = { ...GOOD, evidence: TEACHER_SENTENCE };
  check(
    "교사 지정 근거 반영: 게이트 클린",
    MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(compliant), ctxTp).gateIssues.length === 0,
    MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(compliant), ctxTp).gateIssues.join("; "),
  );
  check(
    "검산 블록: 교사 지정 지시 포함(설정 시에만)",
    MAIN_IDEA_LUNA_EXT.buildSelfcheck(ctxTp).includes("교사 지정") &&
      !MAIN_IDEA_LUNA_EXT.buildSelfcheck(ctx).includes("교사 지정"),
  );
}

// ── ⑤ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(MAIN_IDEA_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 발문형·근거·선지·정답·해설 방류 + JSON 무노출`,
      out.includes("발문형: 요지") &&
        out.includes("근거: The lesson is clear") &&
        out.includes("\n③ 도시는 생물학적") &&
        out.includes("\n정답: ③") &&
        out.includes("\n해설: ") &&
        !out.includes("{") &&
        !out.includes('"label"'),
      out.slice(0, 150),
    );
  }
}

// ── ⑥ 동적 스키마·극성 노브 ─────────────────────────────────────────────────
{
  const ctx6 = { ...ctx, resolved: { genericOptionCount: 6, genericAnswerCount: 2 } };
  const spec = MAIN_IDEA_LUNA_EXT.buildJsonSchema(ctx6);
  const schema = spec.schema as Record<string, any>;
  check(
    "동적 스키마: 선지 6·정답 2·오답 4",
    schema.properties.options.minItems === 6 &&
      schema.properties.answers.minItems === 2 &&
      schema.properties.wrong.minItems === 4 &&
      schema.properties.options.items.properties.label.enum.length === 6,
  );
  check(
    "검산 블록: 설정 실값 반영",
    MAIN_IDEA_LUNA_EXT.buildSelfcheck(ctx6).includes("정확히 6개") &&
      MAIN_IDEA_LUNA_EXT.buildSelfcheck(ctx6).includes("정확히 2개"),
  );

  const ctxNeg = { ...ctx, resolved: { answerPolarity: "NEGATIVE" } };
  check(
    "검산 블록: NEGATIVE 극성 반전(타당 선지 방어·부적절 정답)",
    MAIN_IDEA_LUNA_EXT.buildSelfcheck(ctxNeg).includes("적절하지 않은") &&
      MAIN_IDEA_LUNA_EXT.buildSelfcheck(ctxNeg).includes("방어 가능"),
  );
  const parsedNeg = MAIN_IDEA_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctxNeg);
  const adaptNeg = MAIN_IDEA_MD_LANE.adapt(parsedNeg, ctxNeg);
  check(
    "극성 왕복: NEGATIVE 발문(어댑터 결정형)",
    adaptNeg.ok === true && String(adaptNeg.aiQuestion?.direction).includes("적절하지 않은"),
    String(adaptNeg.aiQuestion?.direction ?? adaptNeg.error),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
