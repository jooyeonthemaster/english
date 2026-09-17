// SUMMARY_WRITING luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-summary-writing.ts
import { SUMMARY_WRITING_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/summary-writing";
import { SUMMARY_WRITING_MD_LANE } from "../src/lib/md-qgen/lane-summary-writing";
import { LunaJsonMdBridge } from "../src/lib/md-qgen/luna-stream-bridge";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import type { MdSummaryWritingQuestion } from "../src/lib/md-qgen/parser-summary-writing";

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

// KILLER 기본(rawTypeSettings null): blankCount 1 · 해석 off · 보기 usePartial(미끼≥1) ·
// 어형 inflected · 목표단어 hidden · 채점 rubric — resolveSummaryWritingSettings 실측.
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
  summary:
    "Rather than starving wild creatures, city life is (A), since young animals rapidly copy whichever inventive tricks succeed.",
  chips: ["rapid", "driving", "adaptation", "behavioral", "instinct", "declining"],
  blanks: [
    {
      label: "(A)",
      answer: "driving rapid behavioral adaptation",
      variants: ["fueling rapid behavioral adaptation"],
    },
  ],
  criteria: [
    "의미: 도시가 빠른 행동 적응을 이끈다는 인과가 드러나면 2점",
    "형태: 동명사구가 문장에 자연스럽게 이어지면 1점",
  ],
  explanation:
    "요약문은 도시 환경이 동물의 빠른 행동 적응을 이끈다는 글 전체의 논지를 압축합니다. 어린 동물이 성공한 기술을 모방하며 퍼뜨린다는 근거가 인과를 확정하므로 빈칸에는 driving rapid behavioral adaptation 이 들어갑니다.",
};

// ── ① 정상 왕복(KILLER 기본): parseAndGate 클린 → 레인 adapt ok → 평가 표면 ──
{
  const parsed = SUMMARY_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(GOOD), ctx);
  check(
    "정상 픽스처: 게이트 클린(usePartial·rubric 전 게이트)",
    parsed.gateIssues.length === 0,
    parsed.gateIssues.join("; "),
  );
  const adapt = SUMMARY_WRITING_MD_LANE.adapt(parsed, ctx);
  check("레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const distractors = (adapt.aiQuestion.wordBankDistractors as string[]) ?? [];
    check(
      "어댑터: 미끼 = 잔여 칩 파생 + 루브릭 채점 모드 + 모범답안 파생",
      adapt.aiQuestion.scoringMode === "LLM_RUBRIC" &&
        distractors.join(",") === "instinct,declining" &&
        String(adapt.aiQuestion.modelAnswer).includes(
          "city life is driving rapid behavioral adaptation",
        ),
      JSON.stringify({
        scoringMode: adapt.aiQuestion.scoringMode,
        distractors,
        modelAnswer: adapt.aiQuestion.modelAnswer,
      }),
    );
    const surface = SUMMARY_WRITING_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "평가 표면: 합성 발문+지문+마스킹 요약문+[보기] 렌더",
      surface.includes("[보기]에서 필요한 단어만 골라") &&
        surface.includes("[4점]") &&
        surface.includes(PASSAGE.slice(0, 40)) &&
        surface.includes("(A) _____") &&
        surface.includes("[보기] rapid / driving / adaptation"),
      surface.slice(0, 200),
    );
    console.log("── 평가 표면 실물 ──\n" + surface + "\n──");
  }
}

// ── ② 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  const leak = {
    ...GOOD,
    summary:
      "City life is (A) for wild animals, and this driving rapid behavioral adaptation appears wherever young animals copy successful tricks.",
  };
  check(
    "음성테스트: 정답 어구 요약문 통째 노출 반려",
    has(SUMMARY_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(leak), ctx).gateIssues, "노출"),
  );

  const unbuildable = {
    ...GOOD,
    chips: ["rapid", "driving", "adaptation", "instinct", "declining"],
  };
  check(
    "음성테스트: 보기 칩으로 정답 조립 불가(behavioral 부재) 반려",
    has(
      SUMMARY_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(unbuildable), ctx).gateIssues,
      "조립 불가",
    ),
  );

  const noDistractor = {
    ...GOOD,
    chips: ["rapid", "adaptation", "driving", "behavioral"],
  };
  check(
    "음성테스트: usePartial 미끼 0개 반려",
    has(
      SUMMARY_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(noDistractor), ctx).gateIssues,
      "미끼 칩이 0개",
    ),
  );

  const oneWord = {
    ...GOOD,
    blanks: [{ ...GOOD.blanks[0], answer: "adapting", variants: [] }],
  };
  check(
    "음성테스트: 1단어 정답 반려(다단어 계약)",
    has(SUMMARY_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(oneWord), ctx).gateIssues, "1단어"),
  );

  const twoBlanks = {
    ...GOOD,
    blanks: [
      GOOD.blanks[0],
      { label: "(B)", answer: "erasing wild instincts", variants: [] },
    ],
  };
  check(
    "음성테스트: 설정(1개) 밖 빈칸 2개 반려",
    has(
      SUMMARY_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(twoBlanks), ctx).gateIssues,
      "1개 필요",
    ),
  );

  const fragmentVariant = {
    ...GOOD,
    blanks: [{ ...GOOD.blanks[0], variants: ["rapid"] }],
  };
  check(
    "음성테스트: 동치가 완전한 어구가 아닌 조각이면 반려(허용 답안 집합 무결성)",
    has(
      SUMMARY_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(fragmentVariant), ctx).gateIssues,
      "조각",
    ),
  );

  const parseFail = SUMMARY_WRITING_LUNA_EXT.parseAndGate("{broken json", ctx);
  check(
    "음성테스트: JSON 파손 → gateIssues 반환(throw 금지)",
    has(parseFail.gateIssues, "파싱 실패") && parseFail.question === null,
  );
}

// ── 설정축 2: 빈칸 2·해석 on·useAll·keyword 채점·약 4단어 (INTERMEDIATE) ─────
const SETTINGS2 = {
  blankCount: 2,
  glossEnabled: true,
  wordBankEnabled: true,
  wordBankUsage: "useAll",
  wordBankFidelity: "verbatim",
  scoringGranularity: "keyword",
  targetWordsMode: "approx",
  targetWordsPerBlank: 4,
};
const ctx2: MdLaneContext = {
  ...ctx,
  difficulty: "INTERMEDIATE",
  rawDifficulty: "INTERMEDIATE",
  rawTypeSettings: SETTINGS2,
};

const GOOD2 = {
  summary:
    "City animals thrive because young ones (A) of their neighbors, turning urban areas into (B) for wildlife.",
  gloss:
    "어린 동물이 이웃의 검증된 기술을 그대로 따라 하기 때문에 도시가 야생 동물의 배움터가 된다는 뜻입니다.",
  chips: ["proven", "of", "imitate", "schools", "the", "adaptation", "true", "techniques"],
  blanks: [
    {
      label: "(A)",
      answer: "imitate the proven techniques",
      variants: ["copy the proven techniques"],
      lemmas: ["imitate", "techniques"],
    },
    {
      label: "(B)",
      answer: "true schools of adaptation",
      variants: [],
      lemmas: ["schools", "adaptation"],
    },
  ],
  criteria: ["의미: 모방 학습과 적응 배움터의 두 축이 드러나면 각 1점"],
  explanation:
    "요약문은 어린 동물의 모방 학습이 도시를 적응의 배움터로 만든다는 글 전체의 논지를 압축합니다. 모방이 확산의 경로라는 근거와 도시가 적응의 엔진이라는 결론이 각 빈칸을 확정합니다.",
};

// ── ③ 정상 왕복(설정축 2): useAll 전량 소비 + LEMMA 채점 + 해석 상자 ────────
{
  const parsed = SUMMARY_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(GOOD2), ctx2);
  check(
    "설정축2 정상 픽스처: 게이트 클린(useAll·keyword·approx)",
    parsed.gateIssues.length === 0,
    parsed.gateIssues.join("; "),
  );
  check(
    "코어스 무발동: 정순 빈칸에 재정렬·정규화 correction 없음",
    !has(parsed.corrections, "재정렬") && !has(parsed.corrections, "정규화"),
    parsed.corrections.join("; "),
  );
  const adapt = SUMMARY_WRITING_MD_LANE.adapt(parsed, ctx2);
  check("설정축2 레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const blanks = adapt.aiQuestion.blanks as Array<Record<string, unknown>>;
    check(
      "어댑터: LEMMA 채점 + 표제어·목표단어수 탑재 + useAll 미끼 없음",
      adapt.aiQuestion.scoringMode === "LEMMA" &&
        (blanks[0].requiredLemmas as string[]).join(",") === "imitate,techniques" &&
        blanks[0].targetWordCount === 4 &&
        adapt.aiQuestion.wordBankDistractors === undefined,
      JSON.stringify({ scoringMode: adapt.aiQuestion.scoringMode, blanks }),
    );
    const direction = String(adapt.aiQuestion.direction);
    check(
      "발문: 결정론 합성(해석 참고 + 변형 없이 모두 사용 + 약 4단어)",
      direction.includes("[해석]을 참고하여") &&
        direction.includes("변형 없이 한 번씩 모두 사용") &&
        direction.includes("약 4단어"),
      direction,
    );
    const surface = SUMMARY_WRITING_LUNA_EXT.renderEvalSurface(adapt.aiQuestion, PASSAGE);
    check(
      "설정축2 평가 표면: [해석]·[요약문]·[보기] + 빈칸 2개 마스킹",
      surface.includes("[해석]") &&
        surface.includes("(A) _____") &&
        surface.includes("(B) _____") &&
        surface.includes("[보기]"),
      surface.slice(0, 200),
    );
  }
}

// ── ④ 코어스 발동 + 설정 집행 절삭 ──────────────────────────────────────────
{
  // 코어스: 빈칸 역순 + 괄호 없는 맨몸 라벨 → 정규화·재정렬 후 게이트 클린.
  const coerce = {
    ...GOOD2,
    blanks: [GOOD2.blanks[1], { ...GOOD2.blanks[0], label: "A" }],
  };
  const parsed = SUMMARY_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(coerce), ctx2);
  const q = parsed.question as MdSummaryWritingQuestion;
  check(
    "코어스 발동: 맨몸 라벨 (A) 정본화 + 라벨 오름차순 재정렬 + 게이트 클린",
    q.blanks.map((b) => b.label).join("") === "(A)(B)" &&
      has(parsed.corrections, "정규화") &&
      has(parsed.corrections, "재정렬") &&
      parsed.gateIssues.length === 0,
    `labels=${q.blanks.map((b) => b.label).join("")} / corr=${parsed.corrections.join("; ")} / ${parsed.gateIssues.join("; ")}`,
  );
  const adapt = SUMMARY_WRITING_MD_LANE.adapt(parsed, ctx2);
  check(
    "코어스 후 왕복: 레인 adapt ok + (A) 정답 유지",
    adapt.ok === true &&
      (adapt.aiQuestion?.blanks as Array<Record<string, unknown>>)?.[0]?.answer ===
        "imitate the proven techniques",
    adapt.error,
  );

  // 설정 집행: 보기 off 설정인데 해석·보기를 그래도 냈다 → 반려 대신 절삭(레인 enforce 재사용).
  const ctx3: MdLaneContext = { ...ctx, rawTypeSettings: { wordBankEnabled: false } };
  const extra = {
    ...GOOD,
    gloss: "도시 생활이 빠른 행동 적응을 이끈다는 내용입니다.",
  };
  const enforced = SUMMARY_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(extra), ctx3);
  const eq = enforced.question as MdSummaryWritingQuestion;
  check(
    "설정 집행: 꺼진 [해석]·[보기] 절삭 + correction 기록 + 게이트 클린",
    eq.gloss === "" &&
      eq.chips.length === 0 &&
      has(enforced.corrections, "절삭") &&
      enforced.gateIssues.length === 0,
    `gloss='${eq.gloss}' chips=${eq.chips.length} / corr=${enforced.corrections.join("; ")} / ${enforced.gateIssues.join("; ")}`,
  );
}

// ── ⑤ 설정축2 음성테스트: keyword 표제어 계약 + useAll 잔여 칩 ──────────────
{
  const orphanLemma = {
    ...GOOD2,
    blanks: [
      { ...GOOD2.blanks[0], lemmas: ["imitation"] },
      GOOD2.blanks[1],
    ],
  };
  check(
    "음성테스트: 정답에 없는 형태의 표제어 반려(스냅 불능 orphan)",
    has(
      SUMMARY_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(orphanLemma), ctx2).gateIssues,
      "핵심어(A)",
    ),
  );
  const leftoverChip = { ...GOOD2, chips: [...GOOD2.chips, "declining"] };
  check(
    "음성테스트: useAll 잔여 칩 반려",
    has(
      SUMMARY_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(leftoverChip), ctx2).gateIssues,
      "useAll",
    ),
  );
}

// ── ⑥ 브릿지: 청크 1·7·1024 분단, JSON 구문 무노출·섹션 라벨 방류 ────────────
{
  const json = JSON.stringify(GOOD2);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(SUMMARY_WRITING_LUNA_EXT.bridgeSpecs, (d) => (out += d));
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지(청크 ${chunk}): 요약문·해석·보기·정답·동치·채점기준·해설 방류 + JSON 무노출`,
      out.includes("요약문: City animals thrive") &&
        out.includes("\n해석: 어린 동물이") &&
        out.includes(" / imitate / schools") &&
        out.includes("\n\n정답(A): imitate the proven techniques") &&
        out.includes("\n\n정답(B): true schools of adaptation") &&
        out.includes("\n동치: copy the proven techniques") &&
        out.includes("\n채점기준: 의미") &&
        out.includes("\n해설: ") &&
        !out.includes("{") &&
        !out.includes('"label"') &&
        !out.includes('"answer"'),
      out.slice(0, 200),
    );
  }
}

// ── ⑦ 동적 스키마·검산 블록: 설정이 형식을 바꾼다 ───────────────────────────
{
  const schemaOf = (c: MdLaneContext) =>
    SUMMARY_WRITING_LUNA_EXT.buildJsonSchema(c).schema as Record<string, any>;

  const s1 = schemaOf(ctx); // KILLER 기본: 빈칸1·해석 off·보기 on·rubric
  check(
    "동적 스키마(기본): gloss 부재·chips 존재·빈칸 1·(A)·lemmas 부재",
    s1.properties.gloss === undefined &&
      s1.properties.chips !== undefined &&
      s1.properties.blanks.minItems === 1 &&
      s1.properties.blanks.items.properties.label.enum.join("") === "(A)" &&
      s1.properties.blanks.items.properties.lemmas === undefined &&
      !s1.required.includes("gloss") &&
      s1.required.includes("chips"),
  );

  const s2 = schemaOf(ctx2); // 빈칸2·해석 on·keyword
  check(
    "동적 스키마(설정축2): gloss 존재·빈칸 2·(A)(B)·lemmas minItems 1",
    s2.properties.gloss !== undefined &&
      s2.properties.blanks.minItems === 2 &&
      s2.properties.blanks.items.properties.label.enum.join("") === "(A)(B)" &&
      s2.properties.blanks.items.properties.lemmas?.minItems === 1 &&
      s2.required.includes("gloss") &&
      s2.properties.blanks.items.required.includes("lemmas"),
  );

  const ctx3: MdLaneContext = { ...ctx, rawTypeSettings: { wordBankEnabled: false } };
  const s3 = schemaOf(ctx3);
  check(
    "동적 스키마(보기 off): chips 필드 자체가 없음",
    s3.properties.chips === undefined && !s3.required.includes("chips"),
  );

  const selfcheckDefault = SUMMARY_WRITING_LUNA_EXT.buildSelfcheck(ctx);
  check(
    "검산 블록(기본): 사다리 + usePartial 미끼 개수 + 누수·축자·합쇼체 전사",
    selfcheckDefault.includes("우선순위") &&
      selfcheckDefault.includes("미끼 칩이 1개 이상") &&
      selfcheckDefault.includes("[누수]") &&
      selfcheckDefault.includes("[축자]") &&
      selfcheckDefault.includes("합쇼체"),
  );
  check(
    "검산 블록(writing 특칙): 허용 답안 집합의 표기 변형 전부 나열",
    selfcheckDefault.includes("[허용 답안 집합]") &&
      selfcheckDefault.includes("표기 변형") &&
      selfcheckDefault.includes("축약형") &&
      selfcheckDefault.includes("관사"),
  );
  const selfcheck2 = SUMMARY_WRITING_LUNA_EXT.buildSelfcheck(ctx2);
  check(
    "검산 블록(설정축2): useAll·핵심어·해석 규칙으로 전환",
    selfcheck2.includes("[useAll]") &&
      selfcheck2.includes("[핵심어]") &&
      selfcheck2.includes("[해석]") &&
      !selfcheck2.includes("[usePartial]"),
  );
  const ctxExact: MdLaneContext = {
    ...ctx,
    rawTypeSettings: { scoringGranularity: "exact" },
  };
  check(
    "검산 블록(exact): 허용 답안 빠짐없이 나열 규칙",
    SUMMARY_WRITING_LUNA_EXT.buildSelfcheck(ctxExact).includes("빠짐없이"),
  );

  const ruleLines = (selfcheckDefault.split("## 출력 전 자가 검산")[1] ?? "")
    .split("\n")
    .filter((l) => l.startsWith("- ")).length;
  console.log(`검산 규칙 수(기본 ctx): ${ruleLines}`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
