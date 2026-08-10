// 주제문 영작(TOPIC_SENTENCE_WRITING) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → postProcessQuestion → validateQuestionQuality 왕복
// + buildAnswerSpec → gradeAnswer **채점 왕복**(서술형 계열의 핵심 축) + 레인 계약.
// 실행: npx tsx scripts/_test-md-topic-sentence-writing.ts
//
// 형식 계약(규범 §1-B 적용본):
//  · scrambled → `주제문:` 한 줄이 곧 모범답안. 별도 모범답안 줄 없음.
//  · cloze     → `정답(A):`·`정답(B):` 가 진실원. 모범답안은 주제문 치환으로 **합성**한다.
//  · 구분자는 목록 `- ` 와 나열 ` / ` 두 종류뿐(동치도 쉼표가 아니라 슬래시).
import {
  parseMdTopicSentenceWriting,
  sameTswTokenMultiset,
  synthesizeTswModelAnswer,
  tswBlankAnswerSequence,
} from "../src/lib/md-qgen/parser-topic-sentence-writing";
import {
  autoSnapTopicSentenceWriting,
  deriveTswVerbatimDistractors,
} from "../src/lib/md-qgen/snap-topic-sentence-writing";
import { gateMdTopicSentenceWriting } from "../src/lib/md-qgen/gate-topic-sentence-writing";
import { adaptMdTopicSentenceWritingToAiQuestion } from "../src/lib/md-qgen/adapter-topic-sentence-writing";
import {
  TOPIC_SENTENCE_WRITING_MD_LANE,
  buildTswMdDirectionEn,
} from "../src/lib/md-qgen/lane-topic-sentence-writing";
import {
  buildMdTopicSentenceWritingPrompt,
  tswMdBlankLabels,
  type TswMdShape,
} from "../src/lib/md-qgen/prompts-topic-sentence-writing";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import type { MdDifficulty } from "../src/lib/md-qgen/prompts";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
import {
  resolveQuestionTypeGenerationSettings,
  resolveTopicSentenceWritingSettings,
} from "../src/lib/question-type-generation-settings";
import { buildAnswerSpec } from "../src/lib/exam-scoring/answer-spec";
import { gradeAnswer } from "../src/lib/exam-scoring/grade";
import { CREDIT_COSTS } from "../src/lib/credit-costs";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

const PASSAGE =
  "Urban planners once assumed that adding lanes would ease congestion, yet the extra capacity was absorbed within a few years. " +
  "Households moved farther out, trips grew longer, and the road filled again. " +
  "Cities that instead funded frequent buses and trams saw a different pattern. " +
  "When homes, offices, and shops sit close together, a short walk replaces many of those trips. " +
  "The gains appear only where compact building and reliable service arrive together; either one alone leaves the old habits in place.";

// ── 형식 실값(난이도 프리셋과 1:1) ─────────────────────────────────────────
const BASIC_SHAPE: TswMdShape = {
  mode: "scrambled", topicForm: "nounPhrase", hintEnabled: true, hintLooseness: "literal",
  chunking: "chunk", distractors: 0, fidelity: "verbatim", scrambleOrder: "random",
  blankCount: 1, blankAssignment: "separate", clueMode: "none",
  sourceMode: "explicit", sourceSentenceParaphrase: false, scoringGranularity: "keyword",
};
const INT_SHAPE: TswMdShape = {
  mode: "scrambled", topicForm: "sentence", hintEnabled: true, hintLooseness: "natural",
  chunking: "word", distractors: 1, fidelity: "verbatim", scrambleOrder: "scrambleStrong",
  blankCount: 1, blankAssignment: "separate", clueMode: "none",
  sourceMode: "paraphrase", sourceSentenceParaphrase: false, scoringGranularity: "keyword",
};
const KILLER_SHAPE: TswMdShape = {
  mode: "cloze", topicForm: "sentence", hintEnabled: false, hintLooseness: "natural",
  chunking: "word", distractors: 2, fidelity: "inflected", scrambleOrder: "scrambleStrong",
  blankCount: 2, blankAssignment: "separate", clueMode: "none",
  sourceMode: "inference", sourceSentenceParaphrase: true, scoringGranularity: "rubric",
};

const BASIC_MD = `방식: scrambled
주제문: the combined effect of compact building and reliable transit service
칩: and reliable transit service / the combined effect / of compact building
힌트: 밀집 개발과 믿을 만한 대중교통이 함께 갔을 때 생기는 효과를 가리키는 표현입니다.
해설: 글은 차선 확장이 왜 실패했는지와 대중교통에 투자한 도시가 왜 달랐는지를 나란히 놓습니다. 마지막 문장이 두 조건이 함께 있어야 효과가 난다고 못 박으므로 주제는 둘의 결합 효과입니다.`;

const INT_MD = `방식: scrambled
주제문: Dense development paired with transit investment lowers the total commuting burden of a city.
칩: lowers the total / of a city / Dense development / increases / commuting burden / paired with / transit investment
미끼: increases
힌트: 밀집 개발과 대중교통 투자가 함께 갈 때 도시 전체의 통근 부담이 줄어든다는 이야기입니다.
허용답:
- Transit investment paired with dense development lowers the total commuting burden of a city.
해설: 차선을 늘린 도시는 유발 수요로 다시 막혔고 대중교통에 투자한 도시만 다른 결과를 얻었습니다. 마지막 문장이 밀집과 서비스가 함께여야 한다고 못 박으므로 주제는 둘의 결합이 통근 부담을 낮춘다는 명제입니다.`;

const KILLER_MD = `방식: cloze
주제문: Congestion eases not by (A) but by (B) working together.
보기: capacity / expand / and / transit / housing / compact / widening / road / frequent / highways
미끼: widening / highways

정답(A): expanding road capacity
정답(B): compact housing and frequent transit
동치(B): frequent transit and compact housing

채점기준:
- 두 빈칸이 대조 구조의 양극을 각각 채우면 각 2점입니다.
- 한쪽만 맞으면 부분점수 2점을 부여합니다.
해설: 차선 확장은 유발 수요로 상쇄되고 대중교통 투자만으로도 오래된 습관이 바뀌지 않는다고 글이 말합니다. 마지막 문장이 두 조건의 동시 충족을 요구하므로 주제문은 확장이 아니라 밀집과 서비스의 결합에 방점을 둡니다.`;

// 위 픽스처의 줄 리터럴 — 장식 감사·회귀 픽스처가 같은 줄을 통째로 갈아 끼운다.
const INT_ANSWER =
  "Dense development paired with transit investment lowers the total commuting burden of a city.";
const INT_CHIP_LINE =
  "칩: lowers the total / of a city / Dense development / increases / commuting burden / paired with / transit investment";
const INT_HINT_LINE =
  "힌트: 밀집 개발과 대중교통 투자가 함께 갈 때 도시 전체의 통근 부담이 줄어든다는 이야기입니다.";
const INT_EXPL_LINE =
  "해설: 차선을 늘린 도시는 유발 수요로 다시 막혔고 대중교통에 투자한 도시만 다른 결과를 얻었습니다. 마지막 문장이 밀집과 서비스가 함께여야 한다고 못 박으므로 주제는 둘의 결합이 통근 부담을 낮춘다는 명제입니다.";
const KILLER_BANK_LINE =
  "보기: capacity / expand / and / transit / housing / compact / widening / road / frequent / highways";

function runLane(md: string, shape: TswMdShape) {
  const parsed = parseMdTopicSentenceWriting(md, shape.mode);
  const snapped = autoSnapTopicSentenceWriting(parsed, shape);
  return {
    parsed,
    ...snapped,
    issues: gateMdTopicSentenceWriting(snapped.question, PASSAGE, shape),
  };
}
function gateOf(md: string, shape: TswMdShape): string[] {
  return runLane(md, shape).issues;
}
function hit(issues: string[], needle: string): boolean {
  return issues.some((issue) => issue.includes(needle));
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로 — 파싱 · 스냅 무보정 · 게이트 클린
// ───────────────────────────────────────────────────────────────────────────
const basic = runLane(BASIC_MD, BASIC_SHAPE);
check("BASIC 파싱: 모드 scrambled · 방식 줄 인식", basic.parsed.mode === "scrambled" && basic.parsed.declaredMode === "scrambled");
check("BASIC 파싱: 주제문 = 모범답안", basic.parsed.modelAnswer === basic.parsed.topic && basic.parsed.topic.startsWith("the combined effect"));
check("BASIC 파싱: 칩 3개", basic.parsed.chips.length === 3, basic.parsed.chips.join(" | "));
check("BASIC 파싱: 미끼 0개 · 힌트 존재 · 해설 존재", basic.parsed.distractors.length === 0 && basic.parsed.hint.length > 5 && basic.parsed.explanation.length > 20);
check("BASIC 스냅: 무보정", basic.corrections.length === 0, basic.corrections.join(" / "));
check("BASIC 게이트: 클린", basic.issues.length === 0, basic.issues.join(" / "));

const int = runLane(INT_MD, INT_SHAPE);
check("INT 파싱: 칩 7개 · 미끼 1개", int.parsed.chips.length === 7 && int.parsed.distractors.length === 1, `${int.parsed.chips.length}/${int.parsed.distractors.length}`);
check("INT 파싱: 허용답 1개", int.parsed.acceptedVariants.length === 1, int.parsed.acceptedVariants.join(" | "));
check("INT 스냅: 무보정(허용답 멀티셋 동일)", int.corrections.length === 0, int.corrections.join(" / "));
check("INT 게이트: 클린", int.issues.length === 0, int.issues.join(" / "));

const killer = runLane(KILLER_MD, KILLER_SHAPE);
check("KILLER 파싱: 빈칸 2개 · 라벨 (A)(B)", killer.parsed.blanks.map((b) => b.label).join("") === "(A)(B)", killer.parsed.blanks.map((b) => b.label).join(""));
check("KILLER 파싱: 동치(B) 1개 · 동치(A) 0개", killer.parsed.blanks[1].variants.length === 1 && killer.parsed.blanks[0].variants.length === 0);
check("KILLER 파싱: 보기 10칩 · 미끼 2개", killer.parsed.chips.length === 10 && killer.parsed.distractors.length === 2);
check("KILLER 파싱: 채점기준 2개", killer.parsed.scoringCriteria.length === 2, String(killer.parsed.scoringCriteria.length));
check(
  "KILLER 파싱: 모범답안을 주제문 치환으로 합성(철칙1 — 받지 않는다)",
  killer.parsed.modelAnswer ===
    "Congestion eases not by expanding road capacity but by compact housing and frequent transit working together.",
  killer.parsed.modelAnswer,
);
check("KILLER 스냅: 무보정", killer.corrections.length === 0, killer.corrections.join(" / "));
check("KILLER 게이트: 클린", killer.issues.length === 0, killer.issues.join(" / "));
check(
  "합성 헬퍼: 라벨 치환 · 구두점 앞 공백 정리",
  synthesizeTswModelAnswer("A study shows (A) .", [{ label: "(A)", answer: "steady gains", variants: [] }]) ===
    "A study shows steady gains.",
);
check(
  "빈칸 정답 시퀀스: 라벨 순 이어붙임",
  tswBlankAnswerSequence(killer.question.blanks) === "expanding road capacity compact housing and frequent transit",
  tswBlankAnswerSequence(killer.question.blanks),
);

// ───────────────────────────────────────────────────────────────────────────
// 2. 스냅(0원 보정) — 절삭은 반드시 corrections 로 남긴다
// ───────────────────────────────────────────────────────────────────────────
{
  const polluted = INT_MD.replace(
    "- Transit investment paired with dense development lowers the total commuting burden of a city.",
    "- Transit investment paired with dense development lowers the total commuting burden of a city.\n- Dense development lowers commuting burden.",
  );
  const r = runLane(polluted, INT_SHAPE);
  check(
    "스냅: 멀티셋이 다른 허용답 절삭 + 기록(오답 흡수 방지)",
    r.question.acceptedVariants.length === 1 && r.corrections.some((c) => c.includes("토큰 구성이 달라 제거")),
    r.corrections.join(" / "),
  );
  check("스냅: 절삭 후 게이트 클린", r.issues.length === 0, r.issues.join(" / "));
}
{
  const polluted = KILLER_MD.replace(
    "정답(A): expanding road capacity",
    "정답(A): expanding road capacity\n동치(A): enlarging the roadway footprint",
  );
  const r = runLane(polluted, KILLER_SHAPE);
  check(
    "스냅: 보기로 조립 불가한 동치 절삭 + 기록",
    r.question.blanks[0].variants.length === 0 && r.corrections.some((c) => c.includes("조립 불가")),
    r.corrections.join(" / "),
  );
}
{
  const r = runLane(`${KILLER_MD}\n힌트: 도시 혼잡은 밀집과 서비스가 함께일 때만 풀립니다.`, KILLER_SHAPE);
  check(
    "스냅: hintEnabled=false 면 힌트 줄 버림 + 기록(발문-실물 정합)",
    r.question.hint === "" && r.corrections.some((c) => c.includes("힌트 미사용 설정")),
    r.corrections.join(" / "),
  );
  check("스냅: 힌트 버린 뒤 게이트 클린", r.issues.length === 0, r.issues.join(" / "));
}
{
  const r = runLane(`${KILLER_MD}\n모범답안: Congestion never eases at all.`, KILLER_SHAPE);
  check(
    "스냅: cloze 모범답안 줄은 계약 밖 — 합성본 채택 + 기록",
    r.question.modelAnswer.startsWith("Congestion eases not by expanding") &&
      r.corrections.some((c) => c.includes("모범답안 줄은 계약 밖")),
    r.corrections.join(" / "),
  );
}
{
  // 칩이 정답 어순 그대로 → 결정론 재배열로 떼어 놓고 기록. 게이트는 결과물을 본다.
  const leaked = BASIC_MD.replace(
    "칩: and reliable transit service / the combined effect / of compact building",
    "칩: the / combined / effect / of / compact / building / and / reliable / transit / service",
  );
  const r = runLane(leaked, BASIC_SHAPE);
  check(
    "스냅: 정답 어순 칩을 결정론 재배열 + 기록(위험 #1)",
    r.corrections.some((c) => c.includes("결정론 재배열")),
    r.corrections.join(" / "),
  );
  check("스냅: 재배열 후 어순 누수 게이트 통과", !hit(r.issues, "어순이 누설"), r.issues.join(" / "));
  check("스냅: 재배열은 칩 내용 불변(멀티셋 보존)", r.question.chips.length === 10 && r.question.chips.includes("combined"));
}
{
  const r = runLane(BASIC_MD.replace("칩:", "보기:"), BASIC_SHAPE);
  check(
    "스냅: scrambled 인데 `보기:` 로 온 재료 흡수 + 기록",
    r.question.chips.length === 3 && r.corrections.some((c) => c.includes("`보기:`")),
    r.corrections.join(" / "),
  );
  check("스냅: 라벨 혼용 흡수 후 게이트 클린", r.issues.length === 0, r.issues.join(" / "));
}

// ───────────────────────────────────────────────────────────────────────────
// 3. 게이트 반려 — 공통
// ───────────────────────────────────────────────────────────────────────────
check("게이트: 주제문 누락", hit(gateOf(BASIC_MD.replace(/^주제문:.*$/m, ""), BASIC_SHAPE), "주제문 줄 누락"));
check(
  "게이트: 주제문 누락 시 미끼 파생을 하지 않는다(진짜 원인을 가리지 않게)",
  !hit(gateOf(BASIC_MD.replace(/^주제문:.*$/m, ""), BASIC_SHAPE), "잉여 재료") &&
    !hit(gateOf(BASIC_MD.replace(/^주제문:.*$/m, "주제문: 밀집 개발과 대중교통 투자의 결합 효과"), BASIC_SHAPE), "잉여 재료"),
  gateOf(BASIC_MD.replace(/^주제문:.*$/m, ""), BASIC_SHAPE).join(" / "),
);
{
  // W2-#8 (redundant-contract): `방식:` 은 설정 상수의 에코라 정보량 0 — 반려 사유가 아니다.
  // 종전에는 이 한 줄 때문에 나머지가 완벽한 문항이 재생성 1회를 태웠다(§1-B 철칙1).
  const r = runLane(BASIC_MD.replace("방식: scrambled", "방식: cloze"), BASIC_SHAPE);
  check("W2-#8 게이트: 방식 줄 불일치는 반려하지 않고 기록만", r.issues.length === 0, r.issues.join(" / "));
  check(
    "W2-#8 스냅: 방식 줄 드리프트를 corrections 로 남김(조용히 버리지 않는다)",
    r.corrections.some((c) => c.includes("`방식:` 줄이 'cloze'")),
    r.corrections.join(" / "),
  );
}
check(
  "게이트: 모범답안이 영어가 아님",
  hit(gateOf(BASIC_MD.replace(/^주제문:.*$/m, "주제문: 밀집 개발과 대중교통 투자의 결합 효과"), BASIC_SHAPE), "영어가 아님"),
);
check(
  "게이트: 완성 답안 단어 수 범위 밖(명사구 2단어)",
  hit(gateOf(BASIC_MD.replace(/^주제문:.*$/m, "주제문: transit effect"), BASIC_SHAPE), "단어 —"),
);
check(
  "게이트: 지문 문장 통째 복사 반려(위험 #5)",
  hit(
    gateOf(
      INT_MD.replace(
        /^주제문:.*$/m,
        "주제문: Urban planners once assumed that adding lanes would ease congestion, yet the extra capacity was absorbed.",
      ),
      INT_SHAPE,
    ),
    "지문 문장의 통째 복사",
  ),
);
check(
  "게이트: hintEnabled 인데 힌트 줄 없음",
  hit(gateOf(BASIC_MD.replace(/^힌트:.*$/m, ""), BASIC_SHAPE), "[주제 힌트] 사용 설정인데"),
);
check(
  "게이트: 힌트에 정답 어구가 영어로 노출",
  hit(
    gateOf(BASIC_MD.replace(/^힌트:.*$/m, "힌트: 핵심은 compact building and reliable transit service 입니다."), BASIC_SHAPE),
    "정답 어구가 그대로 노출",
  ),
);
{
  // W2-#4 (redundant-contract, critical): verbatim 배열에서 미끼는 칩 타일링의 **파생값**
  // 이다. 종전에는 `미끼:` 줄을 두 번째 진실원으로 받아, 칩이 완벽한 문항이 줄 하나 누락만으로
  // "미끼 0개" + "미선언 잉여 재료" 두 건 동시 반려됐다(반의어 실사용 2연속 반려와 동형).
  const r = runLane(INT_MD.replace(/^미끼:.*$/m, ""), INT_SHAPE);
  check("W2-#4 게이트: 미끼 줄이 없어도 파생 확정 → 클린(이중 반려 소멸)", r.issues.length === 0, r.issues.join(" / "));
  check(
    "W2-#4 스냅: 파생 미끼가 칩 원문 'increases' 로 확정 + 기록",
    r.question.distractors.join("/") === "increases" && r.question.distractorsDerived &&
      r.corrections.some((c) => c.includes("칩 타일링에서 파생 확정")),
    `${r.question.distractors.join("/")} | ${r.corrections.join(" / ")}`,
  );
  const bogus = runLane(INT_MD.replace("미끼: increases", "미끼: shrinks"), INT_SHAPE);
  check(
    "W2-#4 게이트: 칩에 없는 미끼를 선언해도 파생값이 이겨 클린",
    bogus.issues.length === 0 && bogus.question.distractors.join("/") === "increases",
    bogus.issues.join(" / "),
  );
  const zero = runLane(`${BASIC_MD}\n미끼: highways`, BASIC_SHAPE);
  check(
    "W2-#4 게이트: 미끼 0개 설정 + 허위 미끼 선언 → 파생 0개라 클린",
    zero.issues.length === 0 && zero.question.distractors.length === 0,
    zero.issues.join(" / "),
  );
}
check(
  "게이트: 잉여 재료 개수가 설정과 다르면 여전히 반려(파생 경로)",
  hit(gateOf(BASIC_MD.replace(/^칩:(.*)$/m, "칩:$1 / highways"), BASIC_SHAPE), "잉여 재료가 1개 (설정은 정확히 0개)"),
);
check(
  "게이트: 미끼 설정인데 칩에 미끼가 아예 없으면 자리를 지목(파생 경로)",
  hit(
    gateOf(INT_MD.replace(" / increases", "").replace(/^미끼:.*$/m, ""), INT_SHAPE),
    "미끼 재료 1개를 칩 나열에 섞어라",
  ),
  gateOf(INT_MD.replace(" / increases", "").replace(/^미끼:.*$/m, ""), INT_SHAPE).join(" / "),
);
{
  // 파생이 불가능한 비-verbatim 경로에서는 종전 계약(선언 + 개수·실재 검사)이 그대로 산다.
  const inflected: TswMdShape = { ...INT_SHAPE, fidelity: "inflected" };
  check(
    "게이트(비-verbatim): 미끼 1개 설정인데 0개",
    hit(gateOf(INT_MD.replace(/^미끼:.*$/m, ""), inflected), "설정은 정확히 1개"),
  );
  check(
    "게이트(비-verbatim): 미끼가 칩 안에 없음",
    hit(gateOf(INT_MD.replace("미끼: increases", "미끼: shrinks"), inflected), "제시 재료 안에 없음"),
  );
}
check(
  "게이트: 구두점 전용 칩",
  hit(gateOf(BASIC_MD.replace("칩: and reliable", "칩: , / and reliable"), BASIC_SHAPE), "구두점만으로 된 재료"),
);
check("게이트: 해설 누락", hit(gateOf(BASIC_MD.replace(/^해설:[\s\S]*$/m, ""), BASIC_SHAPE), "해설 누락"));
check(
  "게이트: 루브릭 채점인데 채점기준 부족",
  hit(gateOf(KILLER_MD.replace("- 한쪽만 맞으면 부분점수 2점을 부여합니다.\n", ""), KILLER_SHAPE), "루브릭 채점 설정"),
);

// ───────────────────────────────────────────────────────────────────────────
// 4. 게이트 반려 — scrambled 전용
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트(scrambled): 칩 2개 미만",
  hit(gateOf(BASIC_MD.replace(/^칩:.*$/m, "칩: the combined effect of compact building and reliable transit service"), BASIC_SHAPE), "2개 이상 필요"),
);
check(
  "게이트(scrambled): 모드 XOR — 빈칸 정답 줄이 섞임",
  hit(gateOf(`${BASIC_MD}\n정답(A): compact building`, BASIC_SHAPE), "두 모드를 섞으면"),
);
check(
  "게이트(scrambled): 한 칩이 정답 전체를 담음",
  hit(
    gateOf(
      BASIC_MD.replace(/^칩:.*$/m, "칩: the combined effect of compact building and reliable transit service / of / and"),
      BASIC_SHAPE,
    ),
    "정답 전체를 담고 있음",
  ),
);
check(
  "게이트(scrambled·verbatim): 조립 부족 토큰 지목",
  hit(gateOf(BASIC_MD.replace("and reliable transit service / ", ""), BASIC_SHAPE), "부족 토큰"),
);
check(
  "게이트(scrambled·verbatim): 미선언 잉여 재료 지목",
  hit(gateOf(BASIC_MD.replace(/^칩:(.*)$/m, "칩:$1 / highways"), BASIC_SHAPE), "잉여 재료"),
);
{
  const inflected: TswMdShape = { ...INT_SHAPE, fidelity: "inflected" };
  check(
    "게이트(scrambled·inflected): 어간 커버리지 부족 지목",
    hit(
      gateOf(INT_MD.replace(" / commuting burden / paired with / transit investment", " / paired with"), inflected),
      "핵심 내용어",
    ),
  );
  check(
    "게이트(scrambled·inflected): 어형 변형 칩은 통과(verbatim 이었으면 반려)",
    gateOf(INT_MD.replace("Dense development /", "Dense developments /"), inflected).length === 0 &&
      hit(gateOf(INT_MD.replace("Dense development /", "Dense developments /"), INT_SHAPE), "부족 토큰"),
    gateOf(INT_MD.replace("Dense development /", "Dense developments /"), inflected).join(" / "),
  );
}
check(
  "게이트(scrambled): 허용답 멀티셋 불일치 잔여 검출(사후 불변식)",
  gateMdTopicSentenceWriting(
    { ...int.question, acceptedVariants: ["Dense development lowers commuting burden."] },
    PASSAGE,
    INT_SHAPE,
  ).some((i) => i.includes("토큰 구성이 다름")),
);

// ───────────────────────────────────────────────────────────────────────────
// 5. 게이트 반려 — cloze 전용
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트(cloze): 빈칸 정답 줄 없음",
  hit(gateOf(KILLER_MD.replace(/^정답\(A\):.*$/m, "").replace(/^정답\(B\):.*$/m, "").replace(/^동치\(B\):.*$/m, ""), KILLER_SHAPE), "빈칸 정답 줄이 없음"),
);
check("게이트(cloze): 보기 줄 없음", hit(gateOf(KILLER_MD.replace(/^보기:.*$/m, ""), KILLER_SHAPE), "`보기:` 줄 누락"));
check(
  "게이트(cloze): 빈칸 개수 불일치",
  hit(gateOf(KILLER_MD.replace(/^정답\(B\):.*$/m, "").replace(/^동치\(B\):.*$/m, ""), KILLER_SHAPE), "빈칸 1개 (2개 필요)"),
);
check(
  "게이트(cloze): 주제문에 라벨이 없음(0회)",
  hit(gateOf(KILLER_MD.replace("not by (A) but", "not by growth but"), KILLER_SHAPE), "(A) 가 0회"),
);
check(
  "게이트(cloze): 라벨이 2회",
  hit(gateOf(KILLER_MD.replace("but by (B) working together.", "but by (B) and (B) working together."), KILLER_SHAPE), "(B) 가 2회"),
);
check(
  "게이트(cloze): 퇴화 stem(골격 내용어 3개 미만)",
  hit(gateOf(KILLER_MD.replace(/^주제문:.*$/m, "주제문: The (A), (B)."), KILLER_SHAPE), "주제문 골격에 내용 단어가"),
);
check(
  "게이트(cloze): 빈칸 정답이 한 단어",
  hit(gateOf(KILLER_MD.replace("정답(A): expanding road capacity", "정답(A): expanding"), KILLER_SHAPE), "이 유형의 빈칸은 다단어"),
);
check(
  "게이트(cloze): 빈칸 정답이 한국어",
  hit(gateOf(KILLER_MD.replace("정답(A): expanding road capacity", "정답(A): 도로 용량 확장"), KILLER_SHAPE), "정답이 영어가 아님"),
);
check(
  "게이트(cloze): 빈칸 정답 중복",
  hit(
    gateOf(KILLER_MD.replace("정답(B): compact housing and frequent transit", "정답(B): expanding road capacity"), KILLER_SHAPE),
    "빈칸 정답 중복",
  ),
);
check(
  "게이트(cloze): 정답이 주제문에 통째 노출",
  hit(
    gateOf(
      KILLER_MD.replace("주제문: Congestion eases not by (A) but by (B) working together.",
        "주제문: Congestion eases not by (A) but by compact housing frequent transit and (B) working together."),
      KILLER_SHAPE,
    ),
    "주제문에 그대로 노출됨",
  ),
);
check(
  "게이트(cloze): 보기로 조립 불가 — 부족 토큰 지목",
  hit(gateOf(KILLER_MD.replace("보기: capacity / expand / ", "보기: expand / "), KILLER_SHAPE), "부족 토큰"),
);
check(
  "게이트(cloze): 한 칩이 다단어 정답을 통째로 담음",
  hit(
    gateOf(KILLER_MD.replace("보기: capacity / expand /", "보기: expanding road capacity / capacity / expand /"), KILLER_SHAPE),
    "정답을 통째로 담고 있음",
  ),
);

// ───────────────────────────────────────────────────────────────────────────
// 6. 드리프트 관용 — 전부 정상 파싱 + 게이트 클린이어야 한다
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string, TswMdShape][] = [
  ["불릿 접두", "주제문: the combined", "- 주제문: the combined", BASIC_SHAPE],
  ["굵게 라벨", "주제문: the combined", "**주제문:** the combined", BASIC_SHAPE],
  ["표 파이프 행", "칩: and reliable", "| 칩: and reliable", BASIC_SHAPE],
  ["전각 콜론", "주제문: the combined", "주제문： the combined", BASIC_SHAPE],
  ["구분자 공백 과다", " / the combined effect / ", "  /  the combined effect  /  ", BASIC_SHAPE],
  ["파이프 구분자", "칩: and reliable transit service / the combined effect / of compact building", "칩: and reliable transit service | the combined effect | of compact building", BASIC_SHAPE],
  ["별표 불릿 목록", "- Transit investment paired", "* Transit investment paired", INT_SHAPE],
  ["번호 매기기 목록", "- Transit investment paired", "1. Transit investment paired", INT_SHAPE],
  ["라벨 소문자", "정답(A): expanding", "정답(a): expanding", KILLER_SHAPE],
  ["라벨 괄호 없음", "정답(B): compact", "정답 B: compact", KILLER_SHAPE],
  ["동치 굵게", "동치(B): frequent", "**동치(B):** frequent", KILLER_SHAPE],
  ["채점기준 불릿 별표", "- 두 빈칸이 대조", "* 두 빈칸이 대조", KILLER_SHAPE],
];
for (const [name, from, to, shape] of DRIFTS) {
  const source = shape === KILLER_SHAPE ? KILLER_MD : shape === INT_SHAPE ? INT_MD : BASIC_MD;
  const issues = gateOf(source.replace(from, to), shape);
  check(`드리프트 관용: ${name}`, issues.length === 0, issues.join(" / "));
}
{
  const single: TswMdShape = { ...KILLER_SHAPE, blankCount: 1, blankAssignment: "separate" };
  const md = `방식: cloze
주제문: Congestion eases only where (A) arrive together.
보기: compact / housing / and / frequent / transit / widening / highways
미끼: widening / highways
정답: compact housing and frequent transit
채점기준:
- 밀집과 서비스 두 축이 모두 들어가면 만점입니다.
- 한 축만 있으면 절반 점수입니다.
해설: 글은 차선 확장이 유발 수요로 상쇄된다는 사실과 대중교통 투자만으로는 부족하다는 사실을 함께 제시합니다. 마지막 문장이 두 조건의 동시 충족을 요구하므로 빈칸은 둘의 결합을 받습니다.`;
  const r = runLane(md, single);
  check(
    "드리프트 관용: 라벨 없는 단일 `정답:` → (A) 로 흡수",
    r.question.blanks.length === 1 && r.question.blanks[0].label === "(A)",
    r.question.blanks.map((b) => b.label).join(","),
  );
  check("드리프트 관용: 단일 빈칸 게이트 클린", r.issues.length === 0, r.issues.join(" / "));
}
{
  const prose = BASIC_MD.replace("칩:", "이 문항은 명사구 배열입니다.\n칩:");
  check("과잉 관용 방지: 라벨 없는 산문 줄은 무시", gateOf(prose, BASIC_SHAPE).length === 0, gateOf(prose, BASIC_SHAPE).join(" / "));
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 어댑터 — 후처리 경계 · 모드 XOR · 이물 필드 금지
// ───────────────────────────────────────────────────────────────────────────
const KO_DIRECTION_INT = "다음 글의 주제문이 되도록 [주제 힌트]를 참고하여 주어진 단어를 올바른 순서로 배열하시오. (쓰지 않는 단어가 포함됨) [3점]";
const scrambledAdapt = adaptMdTopicSentenceWritingToAiQuestion(int.question, "INTERMEDIATE", INT_SHAPE, KO_DIRECTION_INT);
const scrambledAi = (scrambledAdapt.aiQuestion ?? {}) as Record<string, unknown>;
check("어댑터(scrambled): 성공", scrambledAdapt.ok === true, scrambledAdapt.error);
check("어댑터: options 키 자체가 없음(correct-answer-mismatch 회피)", !("options" in scrambledAi));
check("어댑터: keyPoints 빈 배열 · tags 빈 배열", Array.isArray(scrambledAi.keyPoints) && (scrambledAi.keyPoints as []).length === 0 && (scrambledAi.tags as []).length === 0);
check(
  "어댑터(scrambled): 모드 XOR — cloze 필드 부재",
  !("summaryWithBlanks" in scrambledAi) && !("wordBank" in scrambledAi) && !("blanks" in scrambledAi),
);
check("어댑터(scrambled): scrambledWords 존재", Array.isArray(scrambledAi.scrambledWords) && (scrambledAi.scrambledWords as string[]).length === 7);
check("어댑터: correctAnswer === modelAnswer", scrambledAi.correctAnswer === scrambledAi.modelAnswer && typeof scrambledAi.modelAnswer === "string");
check("어댑터: direction 은 결정론 합성값 그대로", scrambledAi.direction === KO_DIRECTION_INT);
check("어댑터: 설정 메타 복제(fidelity·sourceMode·clueMode)", scrambledAi.wordBankFidelity === "verbatim" && scrambledAi.sourceMode === "paraphrase" && scrambledAi.clueMode === "none");
check("어댑터(scrambled): acceptableVariants 최상위 1개", Array.isArray(scrambledAi.acceptableVariants) && (scrambledAi.acceptableVariants as string[]).length === 1);
check("어댑터: 미끼 선언 유지", Array.isArray(scrambledAi.wordBankDistractors) && (scrambledAi.wordBankDistractors as string[])[0] === "increases");
check(
  "어댑터: 재호출 멱등(칩 순서 불변 — reshuffle 이중 호출 안전)",
  JSON.stringify(
    (adaptMdTopicSentenceWritingToAiQuestion(int.question, "INTERMEDIATE", INT_SHAPE, KO_DIRECTION_INT).aiQuestion as Record<string, unknown>)
      .scrambledWords,
  ) === JSON.stringify(scrambledAi.scrambledWords),
);

const KO_DIRECTION_KILLER = "다음 글의 주제문 빈칸 (A), (B)에 들어갈 말을 [보기]에서 필요한 단어만 골라 (필요시 어형을 바꿔) 영작하시오. (쓰지 않는 단어가 포함됨) [4점]";
const clozeAdapt = adaptMdTopicSentenceWritingToAiQuestion(killer.question, "KILLER", KILLER_SHAPE, KO_DIRECTION_KILLER);
const clozeAi = (clozeAdapt.aiQuestion ?? {}) as Record<string, unknown>;
const clozeBlanks = clozeAi.blanks as Array<Record<string, unknown>>;
check("어댑터(cloze): 성공", clozeAdapt.ok === true, clozeAdapt.error);
check("어댑터(cloze): 모드 XOR — scrambledWords 부재", !("scrambledWords" in clozeAi));
check("어댑터(cloze): summaryWithBlanks · wordBank 존재", typeof clozeAi.summaryWithBlanks === "string" && Array.isArray(clozeAi.wordBank));
check("어댑터(cloze): blanks 라벨 '(A)' 괄호 대문자(채점 키 축)", clozeBlanks.map((b) => b.label).join("") === "(A)(B)", clozeBlanks.map((b) => b.label).join(""));
check("어댑터(cloze): blanks 에 requiredLemmas 없음(TSW 는 VARIANTS 채점)", clozeBlanks.every((b) => !("requiredLemmas" in b)));
check("어댑터(cloze): 동치 없는 빈칸엔 acceptableVariants 키 부재", !("acceptableVariants" in clozeBlanks[0]) && Array.isArray(clozeBlanks[1].acceptableVariants));
check("어댑터(cloze): scoringCriteria 실림", Array.isArray(clozeAi.scoringCriteria) && (clozeAi.scoringCriteria as string[]).length === 2);
check("어댑터(cloze): koreanGloss 부재(hintEnabled=false)", !("koreanGloss" in clozeAi));
check("어댑터: 실패 경로 — 모범답안 없으면 ok:false", adaptMdTopicSentenceWritingToAiQuestion({ ...int.question, modelAnswer: "" }, "INTERMEDIATE", INT_SHAPE, KO_DIRECTION_INT).ok === false);

// ───────────────────────────────────────────────────────────────────────────
// 8. 후처리(PASSTHROUGH) → 품질 검증기 왕복
// ───────────────────────────────────────────────────────────────────────────
for (const [name, ai, difficulty, blankCount] of [
  ["scrambled", scrambledAi, "INTERMEDIATE", 1],
  ["cloze", clozeAi, "KILLER", 2],
] as const) {
  const pp = postProcessQuestion("TOPIC_SENTENCE_WRITING", PASSAGE, ai as never);
  check(`후처리(${name}): PASSTHROUGH 성공`, pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  check(`후처리(${name}): 어댑터 필드 무손실`, data.modelAnswer === ai.modelAnswer && data.mode === ai.mode);
  check(`후처리(${name}): options 생성 안 됨`, !Array.isArray(data.options) || (data.options as []).length === 0);
  const issues = validateQuestionQuality({
    typeId: "TOPIC_SENTENCE_WRITING",
    question: data,
    passage: PASSAGE,
    requestedDifficulty: difficulty,
    topicSentenceWritingBlankCount: blankCount,
    stemLanguage: "ko",
  });
  const errors = issues.filter((i) => i.severity === "error");
  check(`검증기(${name}): error 0건`, errors.length === 0, errors.map((e) => `${e.code}: ${e.message}`).join(" / "));
}

// ───────────────────────────────────────────────────────────────────────────
// 9. 채점 왕복 — buildAnswerSpec → gradeAnswer (서술형 계열의 핵심 축)
// ───────────────────────────────────────────────────────────────────────────
{
  const spec = buildAnswerSpec({
    id: "q-scrambled",
    type: "ESSAY",
    subType: "TOPIC_SENTENCE_WRITING",
    structuredData: scrambledAi,
    correctAnswer: String(scrambledAi.correctAnswer),
    points: 3,
  });
  check("채점(scrambled): TEXT_SINGLE · VARIANTS · key 'answer'", spec.inputKind === "TEXT_SINGLE" && spec.textMode === "VARIANTS" && spec.fields?.[0]?.key === "answer", `${spec.inputKind}/${spec.textMode}`);
  check("채점(scrambled): 부분점수 없음(필드 1개)", spec.partialCredit === false);
  const model = String(scrambledAi.modelAnswer);
  check("채점(scrambled): 모범답안 → CORRECT", gradeAnswer(spec, { texts: { answer: model } }).status === "CORRECT");
  check(
    "채점(scrambled): 허용답(등가 어순) → CORRECT",
    gradeAnswer(spec, { texts: { answer: "Transit investment paired with dense development lowers the total commuting burden of a city." } }).status === "CORRECT",
  );
  check("채점(scrambled): 오답 → WRONG", gradeAnswer(spec, { texts: { answer: "Adding lanes lowers congestion." } }).status === "WRONG");
  check("채점(scrambled): 문말 마침표 없어도 CORRECT(normalizeText 관용)", gradeAnswer(spec, { texts: { answer: model.replace(/\.$/, "") } }).status === "CORRECT");
}
{
  const spec = buildAnswerSpec({
    id: "q-cloze",
    type: "ESSAY",
    subType: "TOPIC_SENTENCE_WRITING",
    structuredData: clozeAi,
    correctAnswer: String(clozeAi.correctAnswer),
    points: 4,
  });
  check("채점(cloze): TEXT_MULTI · 필드 키 = 빈칸 라벨", spec.inputKind === "TEXT_MULTI" && spec.fields?.map((f) => f.key).join("") === "(A)(B)", `${spec.inputKind}/${spec.fields?.map((f) => f.key).join("")}`);
  check("채점(cloze): 부분점수 활성", spec.partialCredit === true);
  const full = gradeAnswer(spec, { texts: { "(A)": "expanding road capacity", "(B)": "compact housing and frequent transit" } });
  check("채점(cloze): 두 빈칸 정답 → CORRECT 4점", full.status === "CORRECT" && full.earnedPoints === 4, `${full.status}/${full.earnedPoints}`);
  const half = gradeAnswer(spec, { texts: { "(A)": "expanding road capacity", "(B)": "more highways" } });
  check("채점(cloze): 한 빈칸만 정답 → PARTIAL 2점", half.status === "PARTIAL" && half.earnedPoints === 2, `${half.status}/${half.earnedPoints}`);
  const variant = gradeAnswer(spec, { texts: { "(A)": "expanding road capacity", "(B)": "frequent transit and compact housing" } });
  check("채점(cloze): 동치(B) 로 답해도 CORRECT", variant.status === "CORRECT", variant.status);
  check("채점(cloze): 둘 다 오답 → WRONG", gradeAnswer(spec, { texts: { "(A)": "more lanes", "(B)": "more parking" } }).status === "WRONG");
}

// ───────────────────────────────────────────────────────────────────────────
// 10. 레인 계약 — 과금 축 · 적격성 · 난이도 3분기 · 발문 · 통합 왕복
// ───────────────────────────────────────────────────────────────────────────
function ctxOf(rawSettings: unknown, rawDifficulty: string): MdLaneContext {
  const mdDifficulty: MdDifficulty =
    rawDifficulty === "BASIC" || rawDifficulty === "INTERMEDIATE" ? rawDifficulty : "KILLER";
  return {
    passage: PASSAGE,
    difficulty: mdDifficulty,
    rawDifficulty,
    resolved: resolveQuestionTypeGenerationSettings(
      "TOPIC_SENTENCE_WRITING",
      rawSettings,
      rawDifficulty,
    ) as unknown as Record<string, unknown>,
    rawTypeSettings: rawSettings,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
  };
}

check("레인: subType", TOPIC_SENTENCE_WRITING_MD_LANE.subType === "TOPIC_SENTENCE_WRITING");
check(
  "레인: 과금 QUESTION_GEN_SINGLE (fast VOCAB_TYPES 미포함) — 이중청구 회귀 방지",
  TOPIC_SENTENCE_WRITING_MD_LANE.operationType === "QUESTION_GEN_SINGLE" && CREDIT_COSTS.QUESTION_GEN_SINGLE === 2,
  String(TOPIC_SENTENCE_WRITING_MD_LANE.operationType),
);
check("레인: retryEligible", TOPIC_SENTENCE_WRITING_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 — 모드·빈칸·미끼 범위",
  TOPIC_SENTENCE_WRITING_MD_LANE.isEligible({ topicSentenceWritingMode: "cloze", topicSentenceWritingBlankCount: 2, topicSentenceWritingDistractorCount: 3 }) &&
    TOPIC_SENTENCE_WRITING_MD_LANE.isEligible({ topicSentenceWritingMode: "scrambled", topicSentenceWritingBlankCount: 1, topicSentenceWritingDistractorCount: 0 }) &&
    !TOPIC_SENTENCE_WRITING_MD_LANE.isEligible({ topicSentenceWritingMode: "quiz", topicSentenceWritingBlankCount: 1 }) &&
    !TOPIC_SENTENCE_WRITING_MD_LANE.isEligible({ topicSentenceWritingMode: "cloze", topicSentenceWritingBlankCount: 3 }) &&
    !TOPIC_SENTENCE_WRITING_MD_LANE.isEligible({ topicSentenceWritingMode: "cloze", topicSentenceWritingBlankCount: 2, topicSentenceWritingDistractorCount: 4 }),
);
check(
  "레인: 프로덕션 resolved 전량 적격(3난이도)",
  (["BASIC", "INTERMEDIATE", "KILLER"] as const).every((d) =>
    TOPIC_SENTENCE_WRITING_MD_LANE.isEligible(ctxOf({}, d).resolved),
  ),
);
check(
  "레인: diversityTargets = modelAnswer",
  TOPIC_SENTENCE_WRITING_MD_LANE.diversityTargets({ modelAnswer: "Dense development lowers commuting burden." })[0] ===
    "Dense development lowers commuting burden.",
);
check(
  "레인: qualityArgs 슬롯(topicSentenceWritingBlankCount + stemLanguage)",
  (() => {
    const args = TOPIC_SENTENCE_WRITING_MD_LANE.qualityArgs(ctxOf({}, "KILLER"));
    return args.topicSentenceWritingBlankCount === 2 && args.stemLanguage === "ko";
  })(),
);
for (const [difficulty, expected] of [
  ["BASIC", { mode: "scrambled", topicForm: "nounPhrase", distractors: 0, blankCount: 1 }],
  ["INTERMEDIATE", { mode: "scrambled", topicForm: "sentence", distractors: 1, blankCount: 1 }],
  ["KILLER", { mode: "cloze", topicForm: "sentence", distractors: 2, blankCount: 2 }],
] as const) {
  const format = TOPIC_SENTENCE_WRITING_MD_LANE.mdFormat(ctxOf({}, difficulty));
  check(
    `레인 mdFormat ${difficulty}: 프리셋 실값 반영`,
    format.mode === expected.mode &&
      format.topicForm === expected.topicForm &&
      format.distractors === expected.distractors &&
      format.blankCount === expected.blankCount,
    JSON.stringify(format),
  );
  const prompt = TOPIC_SENTENCE_WRITING_MD_LANE.buildBasePrompt(ctxOf({}, difficulty));
  check(
    `프롬프트 ${difficulty}: 난이도 분기 + 모드 형식 + 지문 포함`,
    prompt.includes(`방식: ${expected.mode}`) &&
      prompt.includes("## 지문") &&
      prompt.includes(PASSAGE.slice(0, 40)) &&
      (difficulty === "KILLER" ? prompt.includes("KILLER 의 생명") : !prompt.includes("KILLER 의 생명")),
  );
  const extras = TOPIC_SENTENCE_WRITING_MD_LANE.buildExtras(ctxOf({}, difficulty));
  check(
    `레인 buildExtras ${difficulty}: 결정론 발문 블록 실림`,
    extras.some((block) => block.includes("학생이 볼 발문")) && extras.length === 1,
    String(extras.length),
  );
}
check(
  "프롬프트: cloze 는 모범답안 줄을 요구하지 않는다(철칙1)",
  !TOPIC_SENTENCE_WRITING_MD_LANE.buildBasePrompt(ctxOf({}, "KILLER")).includes("모범답안: <"),
);
check(
  "프롬프트: 핵심어(표제어) 칸을 만들지 않는다(철칙1·2)",
  !TOPIC_SENTENCE_WRITING_MD_LANE.buildBasePrompt(ctxOf({}, "KILLER")).includes("핵심어"),
);
check("프롬프트: 빈칸 라벨 헬퍼 (A)(B)", tswMdBlankLabels(2).join("") === "(A)(B)" && tswMdBlankLabels(9).join("") === "(A)(B)");
check(
  "프롬프트: 미끼 0개 설정이면 미끼 줄을 요구하지 않는다",
  !buildMdTopicSentenceWritingPrompt(PASSAGE, "full", "BASIC", BASIC_SHAPE).includes("미끼: <미끼1") &&
    buildMdTopicSentenceWritingPrompt(PASSAGE, "full", "KILLER", KILLER_SHAPE).includes("미끼: <미끼1 / 미끼2>"),
);
check(
  "발문: 한국어 결정론 합성 — 미끼 안내·배점이 설정을 따른다",
  (() => {
    const ko = String(ctxOf({}, "KILLER").resolved.topicSentenceWritingDirection);
    const koBasic = String(ctxOf({}, "BASIC").resolved.topicSentenceWritingDirection);
    return ko.includes("(A), (B)") && ko.includes("[4점]") && ko.includes("쓰지 않는 단어") && koBasic.includes("[2점]") && !koBasic.includes("쓰지 않는 단어");
  })(),
);
check(
  "발문(en): 배점·빈칸 라벨·미끼 안내가 영어로도 보존된다(설정 무시 구멍 0)",
  (() => {
    const en = buildTswMdDirectionEn(resolveTopicSentenceWritingSettings({}, "KILLER"));
    const enBasic = buildTswMdDirectionEn(resolveTopicSentenceWritingSettings({}, "BASIC"));
    return en.includes("(A), (B)") && en.includes("[4점]") && en.includes("not used") && enBasic.includes("[2점]") && enBasic.includes("topic phrase");
  })(),
  buildTswMdDirectionEn(resolveTopicSentenceWritingSettings({}, "KILLER")),
);
{
  const ctx = ctxOf({ TOPIC_SENTENCE_WRITING: { stemLanguage: "en" } }, "KILLER");
  const parsedLane = TOPIC_SENTENCE_WRITING_MD_LANE.parseAndGate(KILLER_MD, ctx);
  const adapted = TOPIC_SENTENCE_WRITING_MD_LANE.adapt(parsedLane, ctx);
  check("레인 통합: parseAndGate 게이트 클린", parsedLane.gateIssues.length === 0, parsedLane.gateIssues.join(" / "));
  check("레인 통합: adapt 성공 + 영어 발문 집행", adapted.ok === true && /^Write the words for blanks \(A\), \(B\)/.test(String(adapted.aiQuestion?.direction)), String(adapted.aiQuestion?.direction));
}
{
  const ctx = ctxOf({}, "INTERMEDIATE");
  const parsedLane = TOPIC_SENTENCE_WRITING_MD_LANE.parseAndGate(INT_MD, ctx);
  const adapted = TOPIC_SENTENCE_WRITING_MD_LANE.adapt(parsedLane, ctx);
  check("레인 통합(INT): 게이트 클린 · 한국어 발문", parsedLane.gateIssues.length === 0 && String(adapted.aiQuestion?.direction).includes("[3점]"), parsedLane.gateIssues.join(" / "));
}
check(
  "헬퍼: sameTswTokenMultiset — 어순만 다르면 true, 토큰이 다르면 false",
  sameTswTokenMultiset("a b c", "c b a") && !sameTswTokenMultiset("a b c", "a b") && !sameTswTokenMultiset("it's", "it is"),
);

// ───────────────────────────────────────────────────────────────────────────
// 11. 적대검수 웨이브2 회귀 — 지적 1건당 재현 픽스처 1개 이상
//     (지적서: .wave2-findings/topic-sentence-writing.json)
// ───────────────────────────────────────────────────────────────────────────
function specOf(ai: Record<string, unknown>, points: number) {
  return buildAnswerSpec({
    id: "q-w2",
    type: "ESSAY",
    subType: "TOPIC_SENTENCE_WRITING",
    structuredData: ai,
    correctAnswer: String(ai.correctAnswer),
    points,
  });
}
function adaptOf(q: Parameters<typeof adaptMdTopicSentenceWritingToAiQuestion>[0], shape: TswMdShape) {
  return (adaptMdTopicSentenceWritingToAiQuestion(q, "INTERMEDIATE", shape, "발문").aiQuestion ??
    {}) as Record<string, unknown>;
}

// ── W2-#1 (critical · silent-drop): 두 줄로 접힌 `주제문:` 이 첫 줄만 잡혀 조용히 절단 ──
{
  const folded = INT_MD.replace(
    "주제문: Dense development paired with transit investment lowers the total commuting burden of a city.",
    "주제문: Dense development paired with transit investment\nlowers the total commuting burden of a city.",
  );
  const r = runLane(folded, INT_SHAPE);
  check(
    "W2-#1 파서: 접힌 주제문을 이어 붙여 절단 방지",
    r.question.modelAnswer ===
      "Dense development paired with transit investment lowers the total commuting burden of a city.",
    r.question.modelAnswer,
  );
  check("W2-#1 게이트: 접힘 흡수 후 클린", r.issues.length === 0, r.issues.join(" / "));
  check(
    "W2-#1 과잉 흡수 금지: 한국어 사족 줄은 주제문에 붙지 않는다",
    runLane(`${BASIC_MD.replace("칩:", "이 문항은 명사구 배열입니다.\n칩:")}`, BASIC_SHAPE).question
      .modelAnswer === "the combined effect of compact building and reliable transit service",
  );
  check(
    "W2-#1 과잉 흡수 금지: 이미 문말 부호로 끝난 값에는 다음 줄을 붙이지 않는다",
    runLane(
      INT_MD.replace(
        "칩: lowers the total",
        "and it also shortens travel time.\n칩: lowers the total",
      ),
      INT_SHAPE,
    ).question.modelAnswer.endsWith("of a city."),
  );
  // 게이트 심층 방어 — 파서가 못 이어 붙이는 절단(대문자로 이어지는 줄)도 잉여 토큰으로 잡는다.
  const inflected: TswMdShape = { ...INT_SHAPE, fidelity: "inflected" };
  const cut = INT_MD.replace(
    "주제문: Dense development paired with transit investment lowers the total commuting burden of a city.",
    "주제문: Dense development paired with transit investment\nLowers the total commuting burden of a city.",
  );
  check(
    "W2-#1 게이트(비-verbatim): 절단된 정답을 잉여 토큰으로 지목(종전엔 클린)",
    hit(gateOf(cut, inflected), "모범답안이 잘려 들어왔거나"),
    gateOf(cut, inflected).join(" / "),
  );
}

// ── W2-#2 (critical · correctness): cleanValue 가 trim 이전에 후행 `**` 를 떼서 잔류 ──
for (const [name, tailStr] of [
  ["줄 끝 공백 1개", " "],
  ["표 셀 마감 파이프", " |"],
  ["공백+파이프+공백", " | "],
] as const) {
  const md = INT_MD.replace(
    "주제문: Dense development paired with transit investment lowers the total commuting burden of a city.",
    `주제문: **Dense development paired with transit investment lowers the total commuting burden of a city.**${tailStr}`,
  );
  const r = runLane(md, INT_SHAPE);
  check(
    `W2-#2 파서: 굵게 마크업이 정답에 눌어붙지 않음 (${name})`,
    !r.question.modelAnswer.includes("*") &&
      r.question.modelAnswer.endsWith("of a city.") &&
      r.issues.length === 0,
    `${r.question.modelAnswer} | ${r.issues.join(" / ")}`,
  );
  const spec = specOf(adaptOf(r.question, INT_SHAPE), 3);
  check(
    `W2-#2 채점: 완벽 답안이 CORRECT (${name})`,
    gradeAnswer(spec, {
      texts: {
        answer:
          "Dense development paired with transit investment lowers the total commuting burden of a city.",
      },
    }).status === "CORRECT",
  );
}

// ── W2-#3 (critical · correctness): 칩이 공급 못 하는 내부 구두점 → 만점 구조적 불가 ──
{
  const shape: TswMdShape = { ...INT_SHAPE, distractors: 0 };
  const md = `방식: scrambled
주제문: Only when compact building and reliable transit arrive together, commuting burdens actually fall.
칩: Only / when / compact / building / and / reliable / transit / arrive / together / commuting / burdens / actually / fall
힌트: 두 조건이 함께일 때만 통근 부담이 실제로 줄어든다는 이야기입니다.
해설: 글은 차선 확장이 유발 수요로 상쇄된다는 사실을 먼저 제시합니다. 마지막 문장이 두 조건의 동시 충족을 요구하므로 주제는 결합 조건입니다.`;
  const r = runLane(md, shape);
  check("W2-#3 게이트: 클린 유지(멀쩡한 문항을 반려하지 않는다)", r.issues.length === 0, r.issues.join(" / "));
  check(
    "W2-#3 스냅: 구두점 제거형을 허용답에 추가 + 기록",
    r.question.acceptedVariants.some((v) => !v.includes(",")) &&
      r.corrections.some((c) => c.includes("구두점 제거형을 허용답에 추가")),
    `${r.question.acceptedVariants.join(" | ")} || ${r.corrections.join(" / ")}`,
  );
  const spec = specOf(adaptOf(r.question, shape), 3);
  check(
    "W2-#3 채점: 칩을 완벽히 배열한 답안(쉼표 없음) → CORRECT",
    gradeAnswer(spec, {
      texts: {
        answer:
          "Only when compact building and reliable transit arrive together commuting burdens actually fall",
      },
    }).status === "CORRECT",
  );
  check(
    "W2-#3 채점: 어순이 틀린 답안은 여전히 WRONG(구두점 완화가 오답을 흡수하지 않는다)",
    gradeAnswer(spec, {
      texts: {
        answer:
          "Commuting burdens actually fall only when compact building arrive together and reliable transit",
      },
    }).status === "WRONG",
  );
  // 칩이 쉼표를 공급하면 파생하지 않는다(불필요한 동치 추가 금지).
  const supplied = runLane(md.replace("/ together /", "/ together, /"), shape);
  check(
    "W2-#3 칩이 쉼표를 공급하면 허용답을 파생하지 않음",
    supplied.question.acceptedVariants.length === 0,
    supplied.question.acceptedVariants.join(" | "),
  );
}
{
  // cloze 동형 — 빈칸 정답의 내부 쉼표를 [보기]가 공급하지 않는 경우.
  const shape: TswMdShape = { ...KILLER_SHAPE, blankCount: 1, distractors: 2, scoringGranularity: "keyword" };
  const md = `방식: cloze
주제문: What raises the quality of a judgment is (A) rather than sheer volume.
보기: careful / selection / not / accumulation / speed / sources
미끼: speed / sources
정답(A): careful selection, not accumulation
해설: 글은 수집량이 판단의 질을 보장하지 않는다고 말합니다. 마지막 문장이 선별 기준을 판단의 축으로 못 박습니다.`;
  const r = runLane(md, shape);
  check("W2-#3(cloze) 게이트: 클린", r.issues.length === 0, r.issues.join(" / "));
  const spec = specOf(adaptOf(r.question, shape), 4);
  check(
    "W2-#3(cloze) 채점: 보기만으로 조립한 답안(쉼표 없음) → CORRECT",
    gradeAnswer(spec, { texts: { "(A)": "careful selection not accumulation" } }).status === "CORRECT",
  );
}

// ── W2-#5 (major · correctness): 미끼 표기 드리프트 → 런타임 칩 중복·전체 재정렬 ──
{
  // 런타임 mergeChipsWithDistractors(student-safe-data.ts:88-97)는 **정확일치**다.
  const exactMatchInvariant = (ai: Record<string, unknown>) => {
    const chips = (ai.scrambledWords ?? ai.wordBank ?? []) as string[];
    const distractors = (ai.wordBankDistractors ?? []) as string[];
    return distractors.every((d) => chips.includes(d));
  };
  const md = `방식: scrambled
주제문: Dense development paired with transit investment lowers commuting burden overall.
칩: lowers / Increases / Dense development / commuting burden / paired with / transit investment / overall
미끼: increases
힌트: 밀집과 대중교통 투자가 함께 갈 때 통근 부담이 준다는 이야기입니다.
해설: 차선을 늘린 도시는 유발 수요로 다시 막혔습니다. 마지막 문장이 밀집과 서비스가 함께여야 한다고 못 박습니다.`;
  const r = runLane(md, INT_SHAPE);
  check("W2-#5 게이트(verbatim): 클린", r.issues.length === 0, r.issues.join(" / "));
  check(
    "W2-#5 파생 미끼는 칩 원문 'Increases' — 런타임 정확일치 불변식",
    r.question.distractors.join("/") === "Increases" && exactMatchInvariant(adaptOf(r.question, INT_SHAPE)),
    r.question.distractors.join("/"),
  );
  const inflected: TswMdShape = { ...INT_SHAPE, fidelity: "inflected" };
  const r2 = runLane(md, inflected);
  check(
    "W2-#5 비-verbatim: 미끼를 칩 원문으로 정합 + 기록",
    r2.question.distractors.join("/") === "Increases" &&
      r2.corrections.some((c) => c.includes("칩 원문 'Increases' 으로 정합")),
    `${r2.question.distractors.join("/")} | ${r2.corrections.join(" / ")}`,
  );
  check("W2-#5 비-verbatim: 정합 후 게이트 클린", r2.issues.length === 0, r2.issues.join(" / "));
  check("W2-#5 비-verbatim: 런타임 정확일치 불변식", exactMatchInvariant(adaptOf(r2.question, inflected)));
  // 곡선 아포스트로피 표기 드리프트도 같은 계통(cloze 경로에서 확인).
  const curly = `방식: cloze
주제문: A city's gains appear only where (A) arrive together.
보기: compact / housing / and / frequent / transit / a city’s sprawl / highways
미끼: a city's sprawl / highways
정답(A): compact housing and frequent transit
채점기준:
- 밀집과 서비스 두 축이 모두 들어가면 만점입니다.
- 한 축만 있으면 절반 점수입니다.
해설: 글은 차선 확장이 유발 수요로 상쇄된다고 말합니다. 마지막 문장이 두 조건의 동시 충족을 요구합니다.`;
  const single: TswMdShape = { ...KILLER_SHAPE, blankCount: 1 };
  const r3 = runLane(curly, single);
  check(
    "W2-#5 곡선 아포스트로피 미끼도 칩 원문으로 정합",
    exactMatchInvariant(adaptOf(r3.question, single)) &&
      r3.corrections.some((c) => c.includes("칩 원문")),
    `${r3.question.distractors.join(" | ")} || ${r3.corrections.join(" / ")}`,
  );
}

// ── W2-#6 (major · silent-drop): 진짜 마크다운 표 행이 통째로 유실 ──
{
  const table = `| 항목 | 값 |
| --- | --- |
| 방식 | scrambled |
| 주제문 | Dense development paired with transit investment lowers the total commuting burden of a city. |
| 칩 | lowers the total / of a city / Dense development / increases / commuting burden / paired with / transit investment |
| 미끼 | increases |
| 힌트 | 밀집 개발과 대중교통 투자가 함께 갈 때 도시 전체의 통근 부담이 줄어든다는 이야기입니다. |
| 해설 | 차선을 늘린 도시는 유발 수요로 다시 막혔습니다. 마지막 문장이 밀집과 서비스가 함께여야 한다고 못 박습니다. |`;
  const r = runLane(table, INT_SHAPE);
  check(
    "W2-#6 파서: 표 행(`| 라벨 | 값 |`)을 흡수 — 주제문·칩·힌트·해설 전부 복구",
    r.question.modelAnswer.endsWith("of a city.") &&
      r.question.chips.length === 7 &&
      r.question.hint.length > 5 &&
      r.question.explanation.length > 20,
    `${r.question.chips.length} | ${r.question.modelAnswer}`,
  );
  check("W2-#6 게이트: 표 형식이어도 클린", r.issues.length === 0, r.issues.join(" / "));
  // 라벨을 아예 못 잡은 표는 원인을 지목한다(철칙5 — 이 문구가 곧 재생성 피드백이다).
  const opaque = `| Sentence | Dense development lowers commuting burden. |
| Chips | Dense / development / lowers |`;
  check(
    "W2-#6 게이트: 라벨을 못 잡은 표 출력은 '표로 보인다'를 지목",
    hit(gateOf(opaque, INT_SHAPE), "마크다운 표로 보인다"),
    gateOf(opaque, INT_SHAPE).join(" / "),
  );
}

// ── W2-#7 (major · silent-drop): 불릿 없는 `허용답:` 항목이 통째로 유실 ──
{
  const md = INT_MD.replace(
    "- Transit investment paired with dense development lowers the total commuting burden of a city.",
    "Transit investment paired with dense development lowers the total commuting burden of a city.",
  );
  const r = runLane(md, INT_SHAPE);
  check(
    "W2-#7 파서: 불릿 없는 허용답 항목을 수집",
    r.question.acceptedVariants.length === 1 &&
      r.question.acceptedVariants[0].startsWith("Transit investment"),
    r.question.acceptedVariants.join(" | "),
  );
  check("W2-#7 게이트: 클린", r.issues.length === 0, r.issues.join(" / "));
  const spec = specOf(adaptOf(r.question, INT_SHAPE), 3);
  check(
    "W2-#7 채점: 등가 어순 답안이 CORRECT(종전 WRONG 0)",
    gradeAnswer(spec, {
      texts: {
        answer:
          "Transit investment paired with dense development lowers the total commuting burden of a city.",
      },
    }).status === "CORRECT",
  );
  check(
    "W2-#7 오염된 평문 허용답은 스냅이 절삭 + 기록(관대한 파싱 ≠ 관대한 채점)",
    (() => {
      const polluted = md.replace(
        "Transit investment paired with dense development lowers the total commuting burden of a city.",
        "Transit investment paired with dense development lowers the total commuting burden of a city.\nDense development lowers commuting burden.",
      );
      const p = runLane(polluted, INT_SHAPE);
      return (
        p.question.acceptedVariants.length === 1 &&
        p.corrections.some((c) => c.includes("토큰 구성이 달라 제거")) &&
        p.issues.length === 0
      );
    })(),
  );
}

// ── W2-#8 (major · redundant-contract): `방식:` 사족이 판정 순서 버그로 모드를 뒤집음 ──
{
  const md = INT_MD.replace("방식: scrambled", "방식: scrambled (배열 — 빈칸 완성이 아님)");
  const r = runLane(md, INT_SHAPE);
  check("W2-#8 파서: 설정 모드 키워드가 있으면 사족이 붙어도 일치로 본다", r.question.declaredMode === "scrambled");
  check("W2-#8 게이트: 사족 붙은 방식 줄로 반려되지 않음", r.issues.length === 0, r.issues.join(" / "));
  const clozeSide = runLane(
    KILLER_MD.replace("방식: cloze", "방식: cloze (빈칸 완성 — 배열이 아님)"),
    KILLER_SHAPE,
  );
  check(
    "W2-#8 파서: cloze 쪽 사족도 대칭으로 흡수(판정 순서 고정 아님)",
    clozeSide.question.declaredMode === "cloze" && clozeSide.issues.length === 0,
    clozeSide.issues.join(" / "),
  );
  check(
    "W2-#8 모드 XOR 게이트는 그대로 산다(실제 모드 위반 검출기)",
    hit(gateOf(`${BASIC_MD}\n정답(A): compact building`, BASIC_SHAPE), "두 모드를 섞으면"),
  );
}

// ── W2-#9 (major · contract-violation): 영어 발문이 존재하지 않는 박스를 가리킴 ──
{
  const all = (["BASIC", "INTERMEDIATE", "KILLER"] as const).map((d) =>
    buildTswMdDirectionEn(resolveTopicSentenceWritingSettings({}, d)),
  );
  check(
    "W2-#9 영어 발문: 존재하지 않는 [Topic Hint]/[Word Bank] 를 가리키지 않는다",
    all.every((s) => !/\[Topic Hint\]|\[Word Bank\]/i.test(s)),
    all.join(" || "),
  );
  check(
    "W2-#9 영어 발문: 실물 렌더 라벨([주제 힌트]/[보기])을 그대로 인용한다",
    buildTswMdDirectionEn(resolveTopicSentenceWritingSettings({ hintEnabled: true }, "BASIC")).includes("[주제 힌트]") &&
      buildTswMdDirectionEn(resolveTopicSentenceWritingSettings({}, "KILLER")).includes("[보기]"),
    all.join(" || "),
  );
  check(
    "W2-#9 영어 발문: 배점·빈칸 라벨·미끼 안내는 무회귀",
    all[2].includes("(A), (B)") && all[2].includes("[4점]") && all[2].includes("not used") && all[0].includes("[2점]"),
    all.join(" || "),
  );
}

// ── 지배 결함 계통: 키워드 줄 무관용(굵게·전각콜론·불릿·헤딩·인용·표 파이프) ──
const KEYWORD_DRIFTS: [string, string, string, TswMdShape][] = [
  ["미끼 굵게+전각콜론", "미끼: increases", "**미끼**： increases", { ...INT_SHAPE, fidelity: "inflected" }],
  ["힌트 굵게+공백 없음", "힌트: 밀집", "**힌트:**밀집", INT_SHAPE],
  ["해설 헤딩 접두", "해설: 차선을", "### 해설: 차선을", INT_SHAPE],
  ["칩 인용부호 접두", "칩: lowers", "> 칩: lowers", INT_SHAPE],
  ["주제문 라벨 밖 굵게", "주제문: Dense", "**주제문**: Dense", INT_SHAPE],
  ["정답 전각 괄호", "정답(A): expanding", "정답（A）: expanding", KILLER_SHAPE],
  ["정답 굵게 라벨+전각콜론", "정답(B): compact", "**정답(B)**： compact", KILLER_SHAPE],
  ["동치 전각 괄호", "동치(B): frequent", "동치（B）: frequent", KILLER_SHAPE],
  ["보기 표 파이프 구분자", "보기: capacity / expand", "| 보기 | capacity / expand", KILLER_SHAPE],
  ["채점기준 헤딩 접두", "채점기준:", "### 채점기준:", KILLER_SHAPE],
];
for (const [name, from, to, shape] of KEYWORD_DRIFTS) {
  const source = shape.mode === "cloze" ? KILLER_MD : INT_MD;
  const r = runLane(source.replace(from, to), shape);
  check(`키워드 줄 관용: ${name}`, r.issues.length === 0, r.issues.join(" / "));
}
{
  const inflected: TswMdShape = { ...INT_SHAPE, fidelity: "inflected" };
  check(
    "키워드 줄 관용: 굵게+전각콜론 `미끼:` 가 실제로 파싱된다(누락 아님)",
    runLane(INT_MD.replace("미끼: increases", "**미끼**： increases"), inflected).question.distractors
      .join("/") === "increases",
  );
  check(
    "키워드 줄 관용: 헤딩 접두 `해설:` 가 실제로 파싱된다",
    runLane(INT_MD.replace("해설: 차선을", "### 해설: 차선을"), INT_SHAPE).question.explanation.startsWith("차선을"),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 12. 적대검수 웨이브2 2차 회귀 — 1차 수리가 절반만 고쳤거나 새로 만든 결함
//     (지적서: .wave2-findings/topic-sentence-writing-round2.json + 장식 전수 감사)
// ───────────────────────────────────────────────────────────────────────────

// ── W3-#1 (major · 1차 수리가 낳은 회귀): 그리디 타일링이 exact-cover 가 아니라,
//    청크 미끼가 정답 토큰의 **부분집합**이면 칩 나열 순서에 따라 판정이 갈렸다.
//    프롬프트가 verbatim 에서 `미끼:` 줄을 없앴으므로 파생 실패 = 이중 거짓 반려 +
//    "미끼 줄에 선언하라"는 계약 자기모순 피드백 → 재생성도 같은 반려 → 실패+환불.
{
  const W3_SHAPE: TswMdShape = { ...BASIC_SHAPE, distractors: 1 };
  const W3_ANSWER = "strict zoning and sustained funding of shared transit";
  const W3_CHIPS = ["strict funding", "strict zoning", "and", "sustained funding", "of shared transit"];
  const w3md = (chips: string[]) => `방식: scrambled
주제문: ${W3_ANSWER}
칩: ${chips.join(" / ")}
힌트: 엄격한 용도 규제와 공용 교통에 대한 꾸준한 재정 지원이 함께 가야 한다는 조건을 가리킵니다.
해설: 차선 확장은 유발 수요로 상쇄되고 대중교통 투자만으로는 오래된 습관이 바뀌지 않는다고 글이 말합니다. 마지막 문장이 두 조건의 동시 충족을 요구하므로 주제는 규제와 재정이 함께 가는 결합입니다.`;

  const permute = <T,>(items: T[]): T[][] => {
    if (items.length <= 1) return [items];
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += 1) {
      const rest = [...items.slice(0, i), ...items.slice(i + 1)];
      for (const tail of permute(rest)) out.push([items[i], ...tail]);
    }
    return out;
  };
  const orders = permute(W3_CHIPS);
  const broken = orders.filter((order) => {
    const r = runLane(w3md(order), W3_SHAPE);
    return r.issues.length > 0 || r.question.distractors.join("|") !== "strict funding";
  });
  check(
    `W3-#1 파생: 칩 나열 ${orders.length}순열 전부 동일 판정(그리디 비결정성 소멸)`,
    broken.length === 0,
    broken.length ? `${broken[0].join(" / ")} → ${runLane(w3md(broken[0]), W3_SHAPE).issues.join(" / ")}` : "",
  );
  const worst = runLane(w3md(W3_CHIPS), W3_SHAPE); // 종전 2건 반려가 나던 바로 그 순서
  check(
    "W3-#1 게이트: 미끼가 정답 토큰의 부분집합이어도 클린(이중 거짓 반려 소멸)",
    worst.issues.length === 0 && worst.question.distractorsDerived,
    worst.issues.join(" / "),
  );

  // 진짜로 덮을 수 없는 칩 구성(정답에 일부만 쓰이는 재료)은 여전히 반려하되,
  // 프롬프트가 금지한 `미끼:` 줄 선언을 지시하면 안 된다(계약 자기모순 금지 · 철칙5).
  const straddle = runLane(
    w3md(["strict zoning", "and sustained", "funding of shared", "transit surplus"]),
    W3_SHAPE,
  );
  check(
    "W3-#1 게이트: 타일링 실패는 '통째로 쓰이거나 안 쓰이거나'로 자리를 지목",
    hit(straddle.issues, "통째로 쓰이거나") && hit(straddle.issues, "transit surplus"),
    straddle.issues.join(" / "),
  );
  check(
    "W3-#1 게이트: 파생 레짐에서는 `미끼:` 줄 선언을 지시하지 않는다(계약 자기모순)",
    !straddle.issues.some((issue) => issue.includes("`미끼:` 줄에 선언")),
    straddle.issues.join(" / "),
  );
  check(
    "W3-#1 스냅: 파생 실패가 corrections 에 흔적을 남긴다(철칙3)",
    straddle.corrections.some((c) => c.includes("미끼 파생 실패")),
    straddle.corrections.join(" / "),
  );
  check(
    "W3-#1 무회귀: 진짜 잉여 재료 초과는 그대로 반려",
    hit(gateOf(w3md([...W3_CHIPS, "highways"]), W3_SHAPE), "잉여 재료가 2개 (설정은 정확히 1개)"),
    gateOf(w3md([...W3_CHIPS, "highways"]), W3_SHAPE).join(" / "),
  );
  check(
    "W3-#1 해가 여럿이면 설정 개수와 맞는 해석을 택한다(칩 구성과 모순 없는 선택)",
    (deriveTswVerbatimDistractors(["a b c", "a", "b", "c"], "a b c", 1) ?? []).join("|") === "a b c" &&
      (deriveTswVerbatimDistractors(["a b c", "a", "b", "c"], "a b c", 3) ?? []).join("|") === "a|b|c",
  );
}

// ── W3-#2 (critical · silent-drop): 장식 전수 감사. 굵게만 관용하고 **언더스코어·
//    쌍장식(따옴표·백틱)** 은 통째로 뚫려 있었다 — 감사 실측 198칸 중 83칸 구멍.
//    머리표에 붙으면 줄이 통째로 유실되고, 값에 붙으면 정답 문자열이 영구 오염된다.
{
  const DECOS: [string, (label: string, value: string) => string][] = [
    ["굵게머리 **L:** V", (l, v) => `**${l}:** ${v}`],
    ["굵게값 L: **V**", (l, v) => `${l}: **${v}**`],
    ["콜론뒤 **L**: V", (l, v) => `**${l}**: ${v}`],
    ["언더스코어 __L:__ V", (l, v) => `__${l}:__ ${v}`],
    ["언더스코어 _L:_ V", (l, v) => `_${l}:_ ${v}`],
    ["언더스코어 __L__: V", (l, v) => `__${l}__: ${v}`],
    ["언더스코어값 L: __V__", (l, v) => `${l}: __${v}__`],
    ["언더스코어값 L: _V_", (l, v) => `${l}: _${v}_`],
    ["쌍장식값 L: \"V\"", (l, v) => `${l}: "${v}"`],
    ["쌍장식값 L: `V`", (l, v) => `${l}: \`${v}\``],
    ["쌍장식값 L: “V”", (l, v) => `${l}: “${v}”`],
    ["한쪽만 L: **V", (l, v) => `${l}: **${v}`],
    ["헤딩 ## L: V", (l, v) => `## ${l}: ${v}`],
    ["인용 > L: V", (l, v) => `> ${l}: ${v}`],
    ["불릿 - L: V", (l, v) => `- ${l}: ${v}`],
    ["전각콜론 L： V", (l, v) => `${l}： ${v}`],
    ["꼬리공백 L: V␣␣␣", (l, v) => `${l}: ${v}   `],
    ["꼬리공백+굵게 L: **V**␣␣", (l, v) => `${l}: **${v}**  `],
  ];
  const INFLECTED: TswMdShape = { ...INT_SHAPE, fidelity: "inflected" };
  type Parsed = ReturnType<typeof parseMdTopicSentenceWriting>;
  const TARGETS: [string, string, TswMdShape, (q: Parsed) => string][] = [
    ["방식: scrambled", INT_MD, INT_SHAPE, (q) => q.declaredMode],
    [`주제문: ${INT_ANSWER}`, INT_MD, INT_SHAPE, (q) => q.topic],
    [INT_CHIP_LINE, INT_MD, INT_SHAPE, (q) => q.chips.join("|")],
    ["미끼: increases", INT_MD, INFLECTED, (q) => q.distractors.join("|")],
    [INT_HINT_LINE, INT_MD, INT_SHAPE, (q) => q.hint],
    ["허용답:", INT_MD, INT_SHAPE, (q) => q.acceptedVariants.join("|")],
    [INT_EXPL_LINE, INT_MD, INT_SHAPE, (q) => q.explanation],
    [KILLER_BANK_LINE, KILLER_MD, KILLER_SHAPE, (q) => q.chips.join("|")],
    ["정답(A): expanding road capacity", KILLER_MD, KILLER_SHAPE, (q) => q.blanks[0]?.answer ?? ""],
    ["동치(B): frequent transit and compact housing", KILLER_MD, KILLER_SHAPE, (q) => (q.blanks[1]?.variants ?? []).join("|")],
    ["채점기준:", KILLER_MD, KILLER_SHAPE, (q) => q.scoringCriteria.join("|")],
  ];
  const drops: string[] = [];
  const rejects: string[] = [];
  for (const [head, src, shape, read] of TARGETS) {
    const cut = head.indexOf(":");
    const label = head.slice(0, cut);
    const value = head.slice(cut + 1).trim();
    const base = read(parseMdTopicSentenceWriting(src, shape.mode));
    for (const [name, wrap] of DECOS) {
      const r = runLane(src.replace(head, wrap(label, value)), shape);
      if (read(r.parsed) !== base) drops.push(`${label}/${name}: ${JSON.stringify(read(r.parsed)).slice(0, 60)}`);
      if (r.issues.length > 0) rejects.push(`${label}/${name}: ${r.issues.join(" / ")}`);
    }
  }
  check(
    `W3-#2 장식 전수 감사: 라벨 ${TARGETS.length}종 × 장식 ${DECOS.length}종 = ${TARGETS.length * DECOS.length}칸 무유실`,
    drops.length === 0,
    drops.slice(0, 3).join(" || "),
  );
  check("W3-#2 장식 전수 감사: 전 칸 게이트 클린(과잉 차단 없음)", rejects.length === 0, rejects.slice(0, 3).join(" || "));

  // 값 오염은 게이트를 통과하고 **채점에서만** 터진다 — 정답 문자열 왕복으로 못 박는다.
  for (const [name, wrap] of [
    ["언더스코어", (v: string) => `__${v}__`],
    ["쌍따옴표", (v: string) => `"${v}"`],
    ["백틱", (v: string) => `\`${v}\``],
    ["굽은따옴표", (v: string) => `“${v}”`],
  ] as const) {
    const r = runLane(INT_MD.replace(INT_ANSWER, wrap(INT_ANSWER)), INT_SHAPE);
    const spec = specOf(adaptOf(r.question, INT_SHAPE), 3);
    check(
      `W3-#2 채점: ${name} 로 감싼 주제문도 완벽 답안이 CORRECT`,
      r.question.modelAnswer === INT_ANSWER &&
        gradeAnswer(spec, { texts: { answer: INT_ANSWER } }).status === "CORRECT",
      `${r.question.modelAnswer} | ${r.issues.join(" / ")}`,
    );
  }
  check(
    "W3-#2 런타임 정확일치: 값 장식이 붙은 미끼도 칩 원문으로 저장",
    runLane(INT_MD.replace("미끼: increases", "미끼: __increases__"), INFLECTED).question.distractors
      .join("|") === "increases",
  );
}

// ── W3-#3 (major · silent-drop): 섹션 경계가 **라벨 글자만** 보고 끊어서, `정답`·`해설`
//    로 시작하는 평범한 한국어 목록 항목이 경계로 오인돼 그 아래가 통째로 사라졌다.
{
  const md = KILLER_MD.replace(
    "- 두 빈칸이 대조 구조의 양극을 각각 채우면 각 2점입니다.",
    "- 정답 어구가 대조 구조의 양극을 각각 채우면 각 2점입니다.",
  );
  const r = runLane(md, KILLER_SHAPE);
  check(
    "W3-#3 파서: `정답`으로 시작하는 목록 항목이 섹션을 끊지 않는다",
    r.question.scoringCriteria.length === 2 && r.issues.length === 0,
    `${r.question.scoringCriteria.length} | ${r.issues.join(" / ")}`,
  );
  check(
    "W3-#3 무회귀: 구분자가 붙은 진짜 라벨 줄은 여전히 경계로 끊는다",
    runLane(KILLER_MD, KILLER_SHAPE).question.scoringCriteria.length === 2 &&
      !runLane(KILLER_MD, KILLER_SHAPE).question.scoringCriteria.some((c) => c.startsWith("차선")),
  );
}

// ── W3-#4 (major · silent-drop): scrambled 는 `주제문:` 줄이 곧 모범답안인데, 모델이
//    라벨만 `모범답안:` 으로 내면 "주제문 줄 누락"이라는 거짓 원인으로 반려됐다.
{
  const r = runLane(INT_MD.replace("주제문:", "모범답안:"), INT_SHAPE);
  const spec = specOf(adaptOf(r.question, INT_SHAPE), 3);
  check(
    "W3-#4 파서: `모범답안:` 로 온 주제문을 흡수 + 기록",
    r.question.modelAnswer === INT_ANSWER &&
      r.issues.length === 0 &&
      r.corrections.some((c) => c.includes("흡수")),
    `${r.question.modelAnswer} | ${r.issues.join(" / ")} | ${r.corrections.join(" / ")}`,
  );
  check(
    "W3-#4 채점: 흡수된 모범답안으로 정상 채점",
    gradeAnswer(spec, { texts: { answer: INT_ANSWER } }).status === "CORRECT",
  );
  check(
    "W3-#4 무회귀: 두 줄이 다 오면 `주제문:` 이 이기고 어긋남을 기록",
    (() => {
      const both = runLane(`${INT_MD}\n모범답안: Adding lanes lowers congestion.`, INT_SHAPE);
      return both.question.modelAnswer === INT_ANSWER && both.corrections.some((c) => c.includes("계약 밖"));
    })(),
  );
}

// ── W3-#5 (major · silent-drop): 출력 형식 리터럴의 `← ...` 주석을 모델이 그대로
//    에코하면 마지막 재료에 한국어 주석이 눌어붙어 미끼 개수·조립이 통째로 어긋난다.
{
  const r = runLane(
    INT_MD.replace(INT_CHIP_LINE, `${INT_CHIP_LINE}   ← 구분자는 슬래시 하나뿐. 셔플 필수`),
    INT_SHAPE,
  );
  check(
    "W3-#5 파서: `←` 주석 에코를 값에서 잘라낸다",
    r.question.chips.length === 7 &&
      r.question.chips.every((chip) => !/[가-힣←]/.test(chip)) &&
      r.issues.length === 0,
    `${r.question.chips.join(" | ")} || ${r.issues.join(" / ")}`,
  );
}

// ── W3-#6 (major · silent-drop): 머리 줄에 값이 없이(`**주제문:**`) 다음 줄로 접히면
//    값이 통째로 유실되고 "주제문 줄 누락"이라는 거짓 원인이 붙었다(줄은 실제로 있다).
{
  const r = runLane(INT_MD.replace(`주제문: ${INT_ANSWER}`, `**주제문:**\n${INT_ANSWER}`), INT_SHAPE);
  check(
    "W3-#6 파서: 값이 빈 머리 줄 뒤 대문자 시작 줄도 흡수",
    r.question.modelAnswer === INT_ANSWER && r.issues.length === 0,
    `${r.question.modelAnswer} | ${r.issues.join(" / ")}`,
  );
  check(
    "W3-#6 무회귀: 한국어 사족 줄은 여전히 흡수하지 않는다",
    runLane(INT_MD.replace(`주제문: ${INT_ANSWER}`, "**주제문:**\n주제를 다시 세우겠습니다."), INT_SHAPE)
      .question.modelAnswer === "",
  );
}

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
