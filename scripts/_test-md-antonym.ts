// 반의어(ANTONYM) md 레인 0원 결정론 픽스처 테스트 — 견본(EXEMPLAR) 검증.
// 파싱 → 스냅 → 게이트 → 어댑터 → processAntonym 왕복 형상 + 과금 축까지.
// 실행: npx tsx scripts/_test-md-antonym.ts
//
// 형식 계약(26-07-26 단순화): 쌍 줄은 `라벨 단어 - 짝단어` 하나뿐이고,
// 정답·바른짝은 `정답:` `바른짝:` 전용 줄이 진실원이다(어법 정본과 동형).
// 줄마다 O/X 칸을 받던 종전 계약은 실사용 반려 2연속의 원인이라 제거했다.
import {
  autoSnapAntonymPairs,
  collectAntonymMarks,
  gateMdAntonym,
  parseMdAntonym,
  stripAntonymMarks,
} from "../src/lib/md-qgen/parser-antonym";
import { adaptMdAntonymToAiQuestion } from "../src/lib/md-qgen/adapter-antonym";
import { ANTONYM_MD_LANE } from "../src/lib/md-qgen/lane-antonym";
import { buildMdAntonymPrompt } from "../src/lib/md-qgen/prompts-antonym";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { CREDIT_COSTS } from "../src/lib/credit-costs";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

const PASSAGE =
  "Languages that seem unrelated often share a common ancestor buried deep in prehistory. " +
  "Comparative linguists diverge from earlier scholars by tracing regular sound correspondences rather than surface resemblances. " +
  "Written records preserve only a thin slice of that history, so reconstruction must proceed by inference. " +
  "Sound change is usually gradual, spreading through a speech community over generations. " +
  "The resulting dialects eventually become distinct enough to count as separate languages.";

function markedFrom(passage: string, marks: [string, string][]): string {
  let out = passage;
  for (const [label, word] of marks) {
    out = out.replace(
      new RegExp(`(?<![A-Za-z])${word}(?![A-Za-z])`),
      `[[${label}:${word}]]`,
    );
  }
  return out;
}

const MARKS: [string, string][] = [
  ["A", "common"],
  ["B", "diverge"],
  ["C", "preserve"],
  ["D", "gradual"],
  ["E", "distinct"],
];

const GOOD = `밑줄지문:
${markedFrom(PASSAGE, MARKS)}

짝:
(A) common - rare
(B) diverge - converge
(C) preserve - discard
(D) gradual - abrupt
(E) distinct - indistinguishable
정답: (A)
바른짝: separate
해설: 이 글에서 common 은 "빈번한"이 아니라 "공유된"의 뜻으로 쓰였습니다. rare 는 빈도축의 반의어라 문맥 의미축과 어긋나며, 실제 반의어는 separate 입니다.
오답:
(B) 갈라진다는 뜻의 diverge 와 한데 모인다는 converge 는 같은 축의 정반대입니다.
(C) 보존한다는 preserve 와 버린다는 discard 는 보존축의 정반대입니다.
(D) 점진적이라는 gradual 과 급작스럽다는 abrupt 는 속도축의 정반대입니다.
(E) 구별된다는 distinct 와 구별되지 않는다는 indistinguishable 은 같은 축의 정반대입니다.`;

function gateOf(text: string, pairCount = 5): string[] {
  const q = autoSnapAntonymPairs(parseMdAntonym(text), PASSAGE).question;
  return gateMdAntonym(q, PASSAGE, { pairCount });
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdAntonym(GOOD);
check("파싱: 쌍 5개", parsed.pairs.length === 5, `실제 ${parsed.pairs.length}`);
check("파싱: 정답 (A)", parsed.answer === "(A)", parsed.answer);
check("파싱: 바른짝 separate", parsed.correctAntonym === "separate", parsed.correctAntonym);
check("파싱: 오답해설 4개", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check("파싱: 해설 존재", parsed.explanation.length > 10);
check(
  "마커 수집·복원: 5개 · 원문 복원",
  collectAntonymMarks(parsed.markedPassage).length === 5 &&
    stripAntonymMarks(parsed.markedPassage).trim() === PASSAGE.trim(),
);

const snapped = autoSnapAntonymPairs(parsed, PASSAGE);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0);
check("게이트: 정상 입력 클린", gateMdAntonym(snapped.question, PASSAGE, { pairCount: 5 }).length === 0,
  gateMdAntonym(snapped.question, PASSAGE, { pairCount: 5 }).join(" / "));

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트 개수: 4쌍이면 반려",
  gateOf(GOOD.replace("(E) distinct - indistinguishable\n", "")).some((i) => i.includes("어휘쌍")),
);
check(
  "게이트: 지문 무단 편집 반려",
  gateOf(GOOD.replace("buried deep in prehistory", "buried in prehistory")).some((i) =>
    i.includes("지문 재구성 불일치"),
  ),
);
check(
  "게이트: 마커 안 단어 변형 반려",
  gateOf(GOOD.replace("[[C:preserve]]", "[[C:preserved]]")).some(
    (i) => i.includes("지문 재구성 불일치") || i.includes("밑줄 마커와 불일치"),
  ),
);
check(
  "게이트: 정답 라벨이 어휘쌍에 없으면 반려",
  gateOf(GOOD.replace("정답: (A)", "정답: (H)")).some((i) => i.includes("정답 라벨")),
);
check(
  "게이트: 바른짝 누락 반려",
  gateOf(GOOD.replace("바른짝: separate\n", "")).some((i) => i.includes("바른짝 누락")),
);
check(
  "게이트: 바른짝 == 정답 쌍의 짝 단어면 반려(오류가 아니게 됨)",
  gateOf(GOOD.replace("바른짝: separate", "바른짝: rare")).some((i) =>
    i.includes("짝 단어와 동일"),
  ),
);
check(
  "게이트: 바른짝 == 표적 단어면 반려",
  gateOf(GOOD.replace("바른짝: separate", "바른짝: common")).some((i) =>
    i.includes("표적 단어와 동일"),
  ),
);
check(
  "게이트: 오답해설 개수 반려",
  gateOf(
    GOOD.replace("(E) 구별된다는 distinct 와 구별되지 않는다는 indistinguishable 은 같은 축의 정반대입니다.", ""),
  ).some((i) => i.includes("오답해설")),
);
check(
  "게이트: 표면형 정합 반려(-ly 불일치)",
  gateOf(GOOD.replace("(D) gradual - abrupt", "(D) gradual - abruptly")).some((i) =>
    i.includes("형태 불일치"),
  ),
);
check(
  "게이트: 밑줄 마커 수가 모자라면 반려",
  gateOf(GOOD.replace("[[E:distinct]]", "distinct")).some((i) => i.includes("밑줄 마커")),
);
check(
  "게이트: 오답해설에 정답 라벨 포함 반려",
  gateMdAntonym(
    {
      ...snapped.question,
      wrong: [...snapped.question.wrong, { label: "(A)", text: "정답인데 끼어듦" }],
    },
    PASSAGE,
    { pairCount: 5 },
  ).some((i) => i.includes("정답 라벨 포함")),
);

// ───────────────────────────────────────────────────────────────────────────
// 3. 줄 유실 회귀 방지 — 전부 5쌍 + 게이트 클린이어야 한다.
//    ★ "||" 는 26-07-26 실사용 반려의 실제 원인이다(모델이 실제로 그렇게 냈다).
//      종전 계약은 그 줄의 O/X 칸이 밀려 정답 판정이 통째로 무너졌다.
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string][] = [
  ["★ 이중 파이프 잔재 (실사용 원인)", "(A) common - rare", "(A) common - rare || X | separate"],
  ["잔여 O 칸", "(B) diverge - converge", "(B) diverge - converge | O"],
  ["잔여 빈 파이프", "(B) diverge - converge", "(B) diverge - converge |"],
  ["불릿 접두", "(C) preserve - discard", "- (C) preserve - discard"],
  ["별표 불릿", "(C) preserve - discard", "* (C) preserve - discard"],
  ["굵게 라벨", "(D) gradual - abrupt", "**(D)** gradual - abrupt"],
  ["en dash 구분자", "(D) gradual - abrupt", "(D) gradual – abrupt"],
  ["em dash 구분자", "(D) gradual - abrupt", "(D) gradual — abrupt"],
  ["표 형식 행", "(E) distinct - indistinguishable", "| (E) | distinct - indistinguishable |"],
  ["라벨 점 표기", "(E) distinct - indistinguishable", "E. distinct - indistinguishable"],
  ["라벨 소문자", "(E) distinct - indistinguishable", "(e) distinct - indistinguishable"],
  ["구분자 주변 공백 과다", "(E) distinct - indistinguishable", "(E) distinct    -    indistinguishable"],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdAntonym(drifted);
  const issues = gateOf(drifted);
  check(
    `줄 유실 방지: ${name}`,
    q.pairs.length === 5 && issues.length === 0,
    `쌍 ${q.pairs.length}개 · ${issues.join(" / ")}`,
  );
}

// 하이픈 포함 단어가 깨지지 않는다 (well-ordered 류) — 공백 대시 우선 분리
{
  const hy = parseMdAntonym(GOOD.replace("(D) gradual - abrupt", "(D) well-ordered - chaotic"));
  const d = hy.pairs.find((p) => p.label === "(D)");
  check(
    "하이픈 단어 보존: 'well-ordered - chaotic' 정확 분리",
    d?.word === "well-ordered" && d?.antonym === "chaotic",
    `word='${d?.word}' antonym='${d?.antonym}'`,
  );
}

// 과잉 관용 방지 — 짝 섹션 밖 산문은 쌍으로 오인하지 않는다
{
  const prose = GOOD.replace("짝:\n", "짝:\nAll five pairs below follow the same axis.\n");
  check(
    "과잉 관용 방지: 라벨 없는 산문 줄 무시",
    parseMdAntonym(prose).pairs.length === 5,
    `실제 ${parseMdAntonym(prose).pairs.length}쌍`,
  );
}

// 스냅: 짝 섹션 표적 단어가 마커와 다르면 마커를 진실원으로 보정
{
  const drift = GOOD.replace("(C) preserve - discard", "(C) preserves - discard");
  const s = autoSnapAntonymPairs(parseMdAntonym(drift), PASSAGE);
  check(
    "스냅: 표적 단어를 마커 축자로 보정",
    s.corrections.length === 1 && s.question.pairs[2].word === "preserve",
    s.corrections.join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. 어댑터 → processAntonym 왕복
// ───────────────────────────────────────────────────────────────────────────
{
  const adapt = adaptMdAntonymToAiQuestion(snapped.question, PASSAGE, "KILLER");
  check("어댑터: 성공", adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  const mw = ai.markedWords as Array<Record<string, unknown>>;
  check("어댑터: markedWords 라벨 축 (A) 대문자 유지", mw[0].label === "(A)");
  check("어댑터: correctAnswer 숫자 문자열 '1'", ai.correctAnswer === "1", String(ai.correctAnswer));
  check(
    "어댑터: 정답 쌍만 isIncorrectPair·correctAntonym (정답: 줄이 진실원)",
    mw.filter((m) => m.isIncorrectPair === true).length === 1 &&
      mw[0].correctAntonym === "separate" &&
      mw[1].correctAntonym === undefined,
  );
  check(
    "어댑터: surroundingText 채움 + 지문 포함",
    mw.every((m) => typeof m.surroundingText === "string" && PASSAGE.includes(String(m.surroundingText))),
  );
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check(
    "어댑터: 빈칸 계열 이물 필드 없음",
    !("blanks" in ai) && !("passageWithBlank" in ai) && !("originalExpression" in ai),
  );

  const pp = postProcessQuestion("ANTONYM", PASSAGE, ai as never);
  check("후처리: 성공", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  const pwm = String(data.passageWithMarkers ?? "");
  check("후처리: passageWithMarkers 에 __(A) common__ 생성", pwm.includes("__(A) common__"), pwm.slice(0, 80));
  check("후처리: correctAnswer '1'", data.correctAnswer === "1", String(data.correctAnswer));
  const opts = data.options as Array<Record<string, unknown>>;
  check("후처리: 선지 5개 · 라벨 1~5", opts.length === 5 && opts[0].label === "1" && opts[4].label === "5");
  check(
    "후처리: 선지 텍스트에 (A) 접두 없음",
    opts.every((o) => !/^\(/.test(String(o.text))),
    String(opts[0]?.text),
  );
}

// 정답이 (A) 가 아닌 경우도 인덱스가 맞는지 (정답: 줄 축 검증)
{
  const shifted = GOOD.replace("정답: (A)", "정답: (C)")
    .replace("바른짝: separate", "바른짝: retain")
    .replace("(C) 보존한다는 preserve 와 버린다는 discard 는 보존축의 정반대입니다.\n", "")
    .replace("오답:\n", "오답:\n(A) 공유된다는 common 과 드물다는 rare 는 서로 다른 축입니다.\n");
  const q = autoSnapAntonymPairs(parseMdAntonym(shifted), PASSAGE).question;
  check("게이트: 정답 (C) 형상 클린", gateMdAntonym(q, PASSAGE, { pairCount: 5 }).length === 0,
    gateMdAntonym(q, PASSAGE, { pairCount: 5 }).join(" / "));
  const adapt = adaptMdAntonymToAiQuestion(q, PASSAGE, "KILLER");
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  const mw = ai.markedWords as Array<Record<string, unknown>>;
  check(
    "어댑터: 정답 (C) → correctAnswer '3' · 그 자리만 isIncorrectPair",
    ai.correctAnswer === "3" && mw[2].isIncorrectPair === true && mw[0].isIncorrectPair === false,
    String(ai.correctAnswer),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. 레인 계약 — 과금 축(이중청구 회귀 방지) · 적격성 · 난이도 3분기
// ───────────────────────────────────────────────────────────────────────────
check("레인: subType ANTONYM", ANTONYM_MD_LANE.subType === "ANTONYM");
check(
  "레인: 과금 QUESTION_GEN_VOCAB (1크레딧) — 이중청구 회귀 방지",
  ANTONYM_MD_LANE.operationType === "QUESTION_GEN_VOCAB" && CREDIT_COSTS.QUESTION_GEN_VOCAB === 1,
  String(ANTONYM_MD_LANE.operationType),
);
check("레인: retryEligible", ANTONYM_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 5~10 · 범위 밖 거부",
  ANTONYM_MD_LANE.isEligible({ antonymPairCount: 5 }) &&
    ANTONYM_MD_LANE.isEligible({ antonymPairCount: 10 }) &&
    !ANTONYM_MD_LANE.isEligible({ antonymPairCount: 11 }) &&
    !ANTONYM_MD_LANE.isEligible({ antonymPairCount: 4 }),
);
check(
  "레인: diversityTargets = markedWords[].word",
  ANTONYM_MD_LANE.diversityTargets({
    markedWords: [{ word: "common" }, { word: "diverge" }],
  }).join(",") === "common,diverge",
);
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdAntonymPrompt(PASSAGE, "full", d, { pairCount: 7 });
  check(
    `프롬프트 ${d}: 난이도 분기 + 7쌍 스캐폴드 + 지문 포함`,
    p.includes("(G)") && p.includes("## 지문") && p.includes(PASSAGE.slice(0, 40)),
  );
}
check(
  "프롬프트: 쌍 줄에 O/X 칸을 요구하지 않는다(단순화 계약)",
  !buildMdAntonymPrompt(PASSAGE, "full", "KILLER").includes("O 또는 X"),
);
check(
  "프롬프트: 정답·바른짝 전용 줄 요구",
  buildMdAntonymPrompt(PASSAGE, "full", "KILLER").includes("바른짝:"),
);
check(
  "프롬프트: pairCount 클램프(3→5, 99→10)",
  buildMdAntonymPrompt(PASSAGE, "full", "KILLER", { pairCount: 3 }).includes("(E) ...") &&
    buildMdAntonymPrompt(PASSAGE, "full", "KILLER", { pairCount: 99 }).includes("(J) ..."),
);

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
