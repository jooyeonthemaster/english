// TOPIC_SENTENCE_WRITING luna 확장 픽스처 테스트 — 전 유형 이식 캠페인(SPEC §3 계약).
// 실행: node_modules/.bin/tsx scripts/_test-luna-ext-topic-sentence-writing.ts
import { TOPIC_SENTENCE_WRITING_LUNA_EXT } from "../src/lib/md-qgen/luna-ext/topic-sentence-writing";
import { TOPIC_SENTENCE_WRITING_MD_LANE } from "../src/lib/md-qgen/lane-topic-sentence-writing";
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

// ── KILLER 프리셋 = cloze · 2빈칸 · 미끼 2 · 힌트 없음 · 루브릭 채점 ─────────
const PASSAGE_CLOZE =
  "Every field now brags about the size of its datasets. Companies measure success by how many records they collect, and researchers race to assemble ever larger corpora. " +
  "Yet the projects that actually change minds are rarely the biggest ones. They are the ones that decide, before collecting anything, which observations deserve to enter the file at all. " +
  "A small archive curated by a clear rule beats a warehouse of noise, because every conclusion inherits the discipline of the choosing.";

const ctxCloze: MdLaneContext = {
  passage: PASSAGE_CLOZE,
  difficulty: "KILLER",
  rawDifficulty: "KILLER",
  resolved: {},
  rawTypeSettings: null,
  teacherPoints: [],
  variantIndex: 0,
  variantCount: 1,
};

const CLOZE_GOOD = {
  topic: "What actually improves a judgment is not (A) but (B).",
  chips: [
    "used",
    "the",
    "gathered",
    "filter",
    "sheer",
    "standards",
    "to",
    "information",
    "amount",
    "of",
    "it",
    "the",
    "speed",
    "sources",
  ],
  distractors: ["speed", "sources"],
  blanks: [
    { label: "(A)", answer: "the sheer amount of gathered information", variants: [] },
    {
      label: "(B)",
      answer: "the standards used to filter it",
      variants: ["standards used to filter it"],
    },
  ],
  scoringCriteria: [
    "(A)에 수집 정보의 양을 가리키는 어구를 어순에 맞게 완성하면 2점을 부여합니다.",
    "(B)에 선별 기준을 가리키는 어구를 완성하면 2점을 부여합니다.",
  ],
  explanation:
    "글 전체가 수집 규모의 자랑이 아니라 선별 기준이 판단의 질을 정한다는 결론으로 수렴하므로 대조 구문으로 주제문을 세웠습니다. 학생은 보기에 섞인 미끼에 끌려 두 빈칸의 초점을 맞바꾸는 지점에서 흔들립니다.",
};

// ── INTERMEDIATE 프리셋 = scrambled · verbatim(미끼 파생 레짐) · 미끼 1 · 힌트 ──
const PASSAGE_SCR =
  "Raccoons in Chicago open latched bins that defeat their forest cousins, and the city's coyotes wait for traffic lights before crossing. " +
  "Each generation picks up the tricks of the last one faster than field biologists can document them. " +
  "What looks like mere nuisance behavior is, on closer inspection, evidence that the hardest habitats make the quickest students, and the campus is every street.";

const ctxScr: MdLaneContext = {
  ...ctxCloze,
  passage: PASSAGE_SCR,
  difficulty: "INTERMEDIATE",
  rawDifficulty: "INTERMEDIATE",
};

const SCR_GOOD = {
  topic: "Urban pressure quietly turns wild animals into flexible and fast learners.",
  chips: [
    "turns",
    "wild",
    "quietly",
    "learners",
    "into",
    "urban",
    "flexible",
    "fast",
    "pressure",
    "and",
    "animals",
    "forces",
  ],
  hint: "도시라는 압력이 야생 동물을 유연하고 빠른 학습자로 조용히 바꿔 놓는다는 논지입니다.",
  acceptedVariants: [
    "Quietly, urban pressure turns wild animals into flexible and fast learners.",
  ],
  explanation:
    "여러 동물 사례가 도시 환경이 학습 능력을 끌어올린다는 하나의 결론으로 수렴하므로 이를 주제문으로 세웠습니다. 학생은 미끼 동사에 끌려 동사 자리를 잘못 잡는 지점에서 흔들립니다.",
};

// ── ① cloze 정상 왕복: parseAndGate 클린 → 레인 adapt ok ─────────────────────
{
  const parsed = TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(CLOZE_GOOD), ctxCloze);
  check("cloze 정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  check("cloze 코어스 무발동: corrections 없음", parsed.corrections.length === 0, parsed.corrections.join("; "));
  const q = parsed.question as {
    modelAnswer: string;
    blanks: Array<{ label: string; answer: string; variants: string[] }>;
    distractorsDerived: boolean;
  };
  check(
    "cloze 모범답안: 주제문 치환 합성(파생값 — 모델이 내지 않는다)",
    q.modelAnswer ===
      "What actually improves a judgment is not the sheer amount of gathered information but the standards used to filter it.",
    q.modelAnswer,
  );
  const adapt = TOPIC_SENTENCE_WRITING_MD_LANE.adapt(parsed, ctxCloze);
  check("cloze 레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const ai = adapt.aiQuestion as Record<string, unknown>;
    const blanks = ai.blanks as Array<Record<string, unknown>>;
    check(
      "cloze 어댑터 계약: 모드 XOR + 라벨 키 + acceptedAnswers(동치) 탑재 + options 부재",
      ai.mode === "cloze" &&
        typeof ai.summaryWithBlanks === "string" &&
        !("scrambledWords" in ai) &&
        !("options" in ai) &&
        blanks.length === 2 &&
        blanks[0].label === "(A)" &&
        JSON.stringify(blanks[1].acceptableVariants) ===
          JSON.stringify(["standards used to filter it"]) &&
        JSON.stringify(ai.wordBankDistractors) === JSON.stringify(["speed", "sources"]) &&
        ai.correctAnswer === q.modelAnswer,
    );
    const surface = TOPIC_SENTENCE_WRITING_LUNA_EXT.renderEvalSurface(ai, PASSAGE_CLOZE);
    check(
      "cloze 평가 표면: 발문+지문+[주제문]+[보기] 렌더 · 정답 미노출",
      surface.includes("영작하시오") &&
        surface.includes(PASSAGE_CLOZE.slice(0, 40)) &&
        surface.includes("[주제문]") &&
        surface.includes("[보기]") &&
        surface.includes("(A): ____") &&
        !surface.includes("the sheer amount of gathered information") &&
        !surface.includes("the standards used to filter it"),
      surface.slice(0, 160),
    );
    console.log("── cloze 평가 표면 표본 ──\n" + surface + "\n──");
  }
}

// ── ② scrambled 정상 왕복: 미끼 파생(스냅 코어스) → 게이트 클린 → adapt ok ──
{
  const parsed = TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(SCR_GOOD), ctxScr);
  check("scrambled 정상 픽스처: 게이트 클린", parsed.gateIssues.length === 0, parsed.gateIssues.join("; "));
  const q = parsed.question as {
    distractors: string[];
    distractorsDerived: boolean;
    acceptedVariants: string[];
    chips: string[];
  };
  check(
    "scrambled 코어스: verbatim 미끼 칩 타일링 파생 확정",
    q.distractorsDerived === true &&
      JSON.stringify(q.distractors) === JSON.stringify(["forces"]) &&
      has(parsed.corrections, "파생 확정"),
    `distractors=${JSON.stringify(q.distractors)} corrections=[${parsed.corrections.join("; ")}]`,
  );
  check(
    "scrambled 허용답: 등가 어순 생존(같은 칩 멀티셋)",
    q.acceptedVariants.length === 1 && q.acceptedVariants[0].startsWith("Quietly,"),
    JSON.stringify(q.acceptedVariants),
  );
  const adapt = TOPIC_SENTENCE_WRITING_MD_LANE.adapt(parsed, ctxScr);
  check("scrambled 레인 어댑터 왕복: ok", adapt.ok === true && !!adapt.aiQuestion, adapt.error);
  if (adapt.aiQuestion) {
    const ai = adapt.aiQuestion as Record<string, unknown>;
    check(
      "scrambled 어댑터 계약: 모드 XOR + 미끼·허용답·힌트 탑재",
      ai.mode === "scrambled" &&
        Array.isArray(ai.scrambledWords) &&
        !("summaryWithBlanks" in ai) &&
        !("blanks" in ai) &&
        !("options" in ai) &&
        JSON.stringify(ai.wordBankDistractors) === JSON.stringify(["forces"]) &&
        Array.isArray(ai.acceptableVariants) &&
        ai.koreanGloss === SCR_GOOD.hint &&
        ai.correctAnswer === SCR_GOOD.topic,
    );
    const surface = TOPIC_SENTENCE_WRITING_LUNA_EXT.renderEvalSurface(ai, PASSAGE_SCR);
    check(
      "scrambled 평가 표면: 발문+[주제 힌트]+[배열 단어] 렌더 · 정답 어순 미노출",
      surface.includes("배열하시오") &&
        surface.includes("[주제 힌트]") &&
        surface.includes("[배열 단어]") &&
        surface.includes(PASSAGE_SCR.slice(0, 40)) &&
        !surface.includes(SCR_GOOD.topic),
      surface.slice(0, 160),
    );
    console.log("── scrambled 평가 표면 표본 ──\n" + surface + "\n──");
  }
}

// ── ③ 코어스: 라벨 정규화·재정렬 발동 / 허용답 절삭 ─────────────────────────
{
  const messy = {
    ...CLOZE_GOOD,
    blanks: [
      { ...CLOZE_GOOD.blanks[1], label: "B." },
      { ...CLOZE_GOOD.blanks[0], label: "(a)" },
    ],
  };
  const parsed = TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(messy), ctxCloze);
  const q = parsed.question as { blanks: Array<{ label: string; answer: string }> };
  check(
    "코어스 발동: 라벨 'B.'·'(a)' → '(A)(B)' 정규화 + 오름차순 재정렬 후 게이트 클린",
    parsed.gateIssues.length === 0 &&
      has(parsed.corrections, "정규화") &&
      has(parsed.corrections, "재정렬") &&
      q.blanks.map((b) => b.label).join("") === "(A)(B)" &&
      q.blanks[0].answer === CLOZE_GOOD.blanks[0].answer,
    `issues=[${parsed.gateIssues.join("; ")}] corrections=[${parsed.corrections.join("; ")}]`,
  );

  // [보기] 미선언 잉여 칩 제거 — r1 감수 Q15 계통(칩 15개·미사용 11개·중복 'through'·
  // 주제문 프레임 단어 되싣기). 필요 칩 + 미끼 2개만 남고 게이트는 클린을 유지해야 한다.
  const pollutedBank = {
    ...CLOZE_GOOD,
    chips: [
      ...CLOZE_GOOD.chips,
      "what", // 주제문 프레임 단어 되싣기
      "judgment",
      "not",
      "the", // 정답에 더 필요하지 않은 중복 칩
      "improves",
    ],
  };
  const parsedBank = TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(
    JSON.stringify(pollutedBank),
    ctxCloze,
  );
  const qBank = parsedBank.question as { chips: string[]; distractors: string[] };
  check(
    "코어스 발동: [보기] 미선언 잉여 칩 5개 제거(선언 미끼·조립 필요 칩은 보존)",
    parsedBank.gateIssues.length === 0 &&
      qBank.chips.length === CLOZE_GOOD.chips.length &&
      ["speed", "sources"].every((d) => qBank.chips.includes(d)) &&
      qBank.chips.filter((c) => c === "the").length === 2 &&
      !qBank.chips.includes("judgment") &&
      has(parsedBank.corrections, "미선언 잉여 칩 5개 제거"),
    `issues=[${parsedBank.gateIssues.join("; ")}] chips=${JSON.stringify(qBank.chips)} corrections=[${parsedBank.corrections.join("; ")}]`,
  );

  // 코어스 무발동(음성) — 조립 불가 [보기]는 손대지 않는다(게이트가 자리를 지목해야
  // 재생성 피드백이 성립한다). 잉여 칩이 있어도 원본이 깨졌으면 그대로 둔다.
  const brokenBank = {
    ...CLOZE_GOOD,
    chips: [...CLOZE_GOOD.chips.filter((c) => c !== "filter"), "noise", "warehouse"],
  };
  const parsedBroken = TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(
    JSON.stringify(brokenBank),
    ctxCloze,
  );
  check(
    "코어스 무발동: 조립 불가 [보기]는 잉여가 있어도 손대지 않고 게이트가 부족 토큰 지목",
    has(parsedBroken.gateIssues, "조립 불가") &&
      !has(parsedBroken.corrections, "미선언 잉여 칩"),
    `issues=[${parsedBroken.gateIssues.join("; ")}] corrections=[${parsedBroken.corrections.join("; ")}]`,
  );

  // 허용답 절삭 — 토큰 구성이 다른 변형은 오답 흡수 위험이라 제거(반려 아님).
  const badVariant = {
    ...SCR_GOOD,
    acceptedVariants: [
      ...SCR_GOOD.acceptedVariants,
      "Urban pressure turns wild animals into flexible learners.",
    ],
  };
  const parsedVar = TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(badVariant), ctxScr);
  const qVar = parsedVar.question as { acceptedVariants: string[] };
  check(
    "코어스 발동: 토큰 구성 다른 허용답 절삭(게이트 클린 유지 + 기록)",
    parsedVar.gateIssues.length === 0 &&
      qVar.acceptedVariants.length === 1 &&
      has(parsedVar.corrections, "토큰 구성이 달라 제거"),
    `issues=[${parsedVar.gateIssues.join("; ")}] corrections=[${parsedVar.corrections.join("; ")}]`,
  );
}

// ── ④ 게이트 음성테스트 (계기 검증 — 위반이 실제로 울리는지) ─────────────────
{
  // (a) cloze 빈칸 수 미달
  const oneBlank = { ...CLOZE_GOOD, blanks: [CLOZE_GOOD.blanks[0]] };
  check(
    "음성테스트: 빈칸 1개(설정 2개) 반려",
    has(
      TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(oneBlank), ctxCloze).gateIssues,
      "빈칸 1개",
    ),
  );
  // (b) [보기] 조립 불가 — 정답 토큰 'filter' 공급 칩 부재
  const missingChip = {
    ...CLOZE_GOOD,
    chips: CLOZE_GOOD.chips.filter((c) => c !== "filter"),
  };
  check(
    "음성테스트: 보기 칩 부족(조립 불가) 반려",
    has(
      TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(missingChip), ctxCloze).gateIssues,
      "조립 불가",
    ),
  );
  // (c) 빈칸 정답이 주제문에 통째로 노출(받아쓰기 전락)
  const leakedTopic = {
    ...CLOZE_GOOD,
    topic: "What actually improves a judgment is not (A) but the standards used to filter it, (B).",
  };
  check(
    "음성테스트: 정답 어구 주제문 노출 반려",
    has(
      TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(leakedTopic), ctxCloze).gateIssues,
      "그대로 노출",
    ),
  );
  // (d) 한국어 정답(영어 아님)
  const koreanAnswer = {
    ...CLOZE_GOOD,
    blanks: [
      { ...CLOZE_GOOD.blanks[0], answer: "수집된 정보의 양" },
      CLOZE_GOOD.blanks[1],
    ],
  };
  check(
    "음성테스트: 한국어 정답 반려",
    has(
      TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(koreanAnswer), ctxCloze).gateIssues,
      "영어가 아님",
    ),
  );
  // (e) 루브릭 채점기준 미달
  const oneCriterion = { ...CLOZE_GOOD, scoringCriteria: [CLOZE_GOOD.scoringCriteria[0]] };
  check(
    "음성테스트: 채점기준 1개(루브릭 2개 필요) 반려",
    has(
      TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(oneCriterion), ctxCloze).gateIssues,
      "채점기준 1개",
    ),
  );
  // (f) scrambled 잉여 재료 — 파생 미끼가 설정(1개)을 초과
  const extraChip = { ...SCR_GOOD, chips: [...SCR_GOOD.chips, "chicago"] };
  check(
    "음성테스트: 파생 미끼 2개(설정 1개) 잉여 재료 반려",
    has(
      TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(extraChip), ctxScr).gateIssues,
      "잉여 재료",
    ),
  );
  // (g) 부족 토큰 — 정답 단어를 공급하는 칩이 빠짐(타일링 실패 → 자리 지목)
  const droppedChip = { ...SCR_GOOD, chips: SCR_GOOD.chips.filter((c) => c !== "quietly") };
  check(
    "음성테스트: 배열 재료 부족 토큰 반려",
    has(
      TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(droppedChip), ctxScr).gateIssues,
      "부족 토큰",
    ),
  );
  // (h) [주제 힌트]에 정답 영어 어구 연속 노출
  const leakedHint = {
    ...SCR_GOOD,
    hint: "주제는 urban pressure quietly turns wild animals 방향입니다.",
  };
  check(
    "음성테스트: 힌트 정답 어구 노출 반려",
    has(
      TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate(JSON.stringify(leakedHint), ctxScr).gateIssues,
      "힌트",
    ),
  );
  // (i) JSON 파손 → throw 금지, gateIssues 로 반려
  const parseFail = TOPIC_SENTENCE_WRITING_LUNA_EXT.parseAndGate("{broken json", ctxCloze);
  check(
    "음성테스트: JSON 파손 → gateIssues 반환(throw 금지)",
    parseFail.question === null && has(parseFail.gateIssues, "파싱 실패"),
  );
}

// ── ⑤ 브릿지: 청크 분단·JSON 구문 무노출 ────────────────────────────────────
{
  const json = JSON.stringify(CLOZE_GOOD);
  for (const chunk of [1, 7, 1024]) {
    let out = "";
    const bridge = new LunaJsonMdBridge(
      TOPIC_SENTENCE_WRITING_LUNA_EXT.bridgeSpecs,
      (d) => (out += d),
    );
    for (let i = 0; i < json.length; i += chunk) bridge.push(json.slice(i, i + chunk));
    check(
      `브릿지 cloze(청크 ${chunk}): 섹션 라벨·본문 방류 + JSON 무노출`,
      out.includes("주제문: What actually improves") &&
        out.includes("\n\n재료:") &&
        out.includes("\n- used") &&
        out.includes("\n미끼: speed") &&
        out.includes("\n\n정답(A): the sheer amount") &&
        out.includes("\n동치: standards used to filter it") &&
        out.includes("\n채점기준: ") &&
        out.includes("\n\n해설: 글 전체가") &&
        !out.includes("{") &&
        !out.includes('"label"') &&
        !out.includes('"chips"'),
      out.slice(0, 150),
    );
  }
  let outScr = "";
  const bridgeScr = new LunaJsonMdBridge(
    TOPIC_SENTENCE_WRITING_LUNA_EXT.bridgeSpecs,
    (d) => (outScr += d),
  );
  const jsonScr = JSON.stringify(SCR_GOOD);
  for (let i = 0; i < jsonScr.length; i += 7) bridgeScr.push(jsonScr.slice(i, i + 7));
  check(
    "브릿지 scrambled(청크 7): 힌트·허용답 방류 + JSON 무노출",
    outScr.includes("주제문: Urban pressure") &&
      outScr.includes("\n\n힌트: 도시라는") &&
      outScr.includes("\n허용답: Quietly,") &&
      !outScr.includes("{") &&
      !outScr.includes('"hint"'),
    outScr.slice(0, 150),
  );
}

// ── ⑥ 동적 스키마·검산 블록: 모드·설정 실값 반영 ────────────────────────────
{
  const clozeSpec = TOPIC_SENTENCE_WRITING_LUNA_EXT.buildJsonSchema(ctxCloze);
  const cs = clozeSpec.schema as Record<string, any>;
  check(
    "동적 스키마(cloze KILLER): blanks 2·라벨 enum (A)(B)·미끼 2 선언·루브릭·힌트 없음",
    clozeSpec.strict === true &&
      cs.additionalProperties === false &&
      cs.properties.blanks.minItems === 2 &&
      cs.properties.blanks.maxItems === 2 &&
      cs.properties.blanks.items.properties.label.enum.join("") === "(A)(B)" &&
      cs.properties.distractors.minItems === 2 &&
      cs.properties.distractors.maxItems === 2 &&
      "scoringCriteria" in cs.properties &&
      !("hint" in cs.properties) &&
      !("acceptedVariants" in cs.properties) &&
      cs.required[0] === "topic" &&
      cs.required[cs.required.length - 1] === "explanation",
  );
  const scrSpec = TOPIC_SENTENCE_WRITING_LUNA_EXT.buildJsonSchema(ctxScr);
  const ss = scrSpec.schema as Record<string, any>;
  check(
    "동적 스키마(scrambled INTERMEDIATE): 파생 레짐 미끼 필드 부재·힌트·허용답·blanks 없음",
    ss.additionalProperties === false &&
      !("distractors" in ss.properties) &&
      "hint" in ss.properties &&
      "acceptedVariants" in ss.properties &&
      !("blanks" in ss.properties) &&
      !("scoringCriteria" in ss.properties),
  );
  const scCloze = TOPIC_SENTENCE_WRITING_LUNA_EXT.buildSelfcheck(ctxCloze);
  check(
    "검산 블록(cloze): 사다리·라벨 실값·조립 대조·허용답 전부 나열(패밀리 특칙)",
    scCloze.includes("우선순위") &&
      scCloze.includes("(A)") &&
      scCloze.includes("(B)") &&
      scCloze.includes("정확히 2개") &&
      scCloze.includes("전부") &&
      scCloze.includes("조립") &&
      scCloze.includes("합쇼체"),
  );
  check(
    "검산 블록(cloze) r1 F계통 보강: 미끼 대입·지문 근거 우위·빈칸 교차·축약형·칩 위생·통설 주제·대칭 등위·해설 사실/표기",
    scCloze.includes("미끼 대입 검산") &&
      scCloze.includes("지문이 배제하는 단어") &&
      scCloze.includes("서로 맞바꾼 문장") &&
      scCloze.includes("수식어를 하나씩 빼고") &&
      scCloze.includes("되싣지 마라") &&
      scCloze.includes("필자의 결론") &&
      scCloze.includes("대칭 등위") &&
      scCloze.includes("찾아 세어 본 뒤") &&
      scCloze.includes("작은따옴표"),
    scCloze,
  );
  const scScr = TOPIC_SENTENCE_WRITING_LUNA_EXT.buildSelfcheck(ctxScr);
  check(
    "검산 블록(scrambled): 파생 미끼 개수 실값·등가 어순 나열·축자 복사 금지",
    scScr.includes("정확히 1개") &&
      scScr.includes("등가 어순") &&
      scScr.includes("축자 복사") &&
      scScr.includes("양보"),
  );
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
