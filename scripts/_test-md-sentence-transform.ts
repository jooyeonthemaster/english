// 문장 전환(SENTENCE_TRANSFORM) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → postProcessQuestion → validateQuestionQuality →
// buildAnswerSpec → gradeAnswer 왕복 + 레인 계약(과금·적격성·난이도 3분기)까지.
// 실행: npx tsx scripts/_test-md-sentence-transform.ts
//
// 형식 계약: 이 유형은 **서술형**이라 선지가 없다 → `정답:` 줄도 `오답:` 블록도 없다.
// 정답의 유일 진실원은 `모범답안:` 줄이고 어댑터가 correctAnswer 로 복제한다(철칙 1).
// 채점은 FREE_WRITING → MANUAL_ONLY 이므로 acceptedAnswers 계열 필드가 없다.
import {
  autoSnapSentenceTransform,
  locateSentenceInPassage,
  parseMdSentenceTransform,
} from "../src/lib/md-qgen/parser-sentence-transform";
import { gateMdSentenceTransform } from "../src/lib/md-qgen/gate-sentence-transform";
import { adaptMdSentenceTransformToAiQuestion } from "../src/lib/md-qgen/adapter-sentence-transform";
import { SENTENCE_TRANSFORM_MD_LANE } from "../src/lib/md-qgen/lane-sentence-transform";
import { buildMdSentenceTransformPrompt } from "../src/lib/md-qgen/prompts-sentence-transform";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { buildAnswerSpec } from "../src/lib/exam-scoring/answer-spec";
import { gradeAnswer } from "../src/lib/exam-scoring/grade";
import { CREDIT_COSTS } from "../src/lib/credit-costs";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

const PASSAGE =
  "Urban planners once treated rooftops as dead space, useful only for equipment. " +
  "Because the canopy of a green roof intercepts sunlight before it reaches the membrane below, the surface stays measurably cooler through the afternoon. " +
  "Engineers who monitor these buildings report that the district's cooling effect persists even during prolonged heat waves. " +
  "The savings are modest for a single structure, yet they accumulate across a dense district. " +
  "City councils have therefore begun to subsidize installation rather than merely permit it.";

const ORIGINAL =
  "Because the canopy of a green roof intercepts sunlight before it reaches the membrane below, the surface stays measurably cooler through the afternoon.";
const MODEL =
  "Intercepting sunlight before it reaches the membrane below, the canopy of a green roof keeps the surface measurably cooler through the afternoon.";

const GOOD = `원문장: ${ORIGINAL}
조건:
- 분사구문으로 전환할 것
- 'Intercepting'으로 시작할 것
모범답안: ${MODEL}
채점기준:
- 만점: 분사구문으로 압축되고 원문의 인과 관계가 그대로 유지된 문장
- 부분점수: 어순이나 축약만 다른 동치 변형
- 0점: 원인과 결과가 뒤바뀌었거나 분사구문이 아닌 문장
해설: 종속절의 주어를 주절 주어로 통일한 뒤 접속사와 정동사를 지우고 분사구문으로 압축했습니다. 원문의 인과 관계와 "stays measurably cooler"가 담고 있던 정도 한정이 모두 남아 명제 의미가 그대로 보존됩니다.`;

function parseSnap(text: string, passage = PASSAGE) {
  return autoSnapSentenceTransform(parseMdSentenceTransform(text), passage).question;
}
function gateOf(
  text: string,
  opts?: Parameters<typeof gateMdSentenceTransform>[2],
  passage = PASSAGE,
): string[] {
  return gateMdSentenceTransform(parseSnap(text, passage), passage, {
    difficulty: "KILLER",
    ...opts,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로 — 파싱
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdSentenceTransform(GOOD);
check("파싱: 원문장 축자", parsed.originalSentence === ORIGINAL, parsed.originalSentence);
check("파싱: 조건 2개", parsed.conditions.length === 2, JSON.stringify(parsed.conditions));
check("파싱: 모범답안", parsed.modelAnswer === MODEL, parsed.modelAnswer);
check("파싱: 채점기준 3개", parsed.scoringCriteria.length === 3, JSON.stringify(parsed.scoringCriteria));
check("파싱: 해설 존재", parsed.explanation.length > 40, parsed.explanation);
check("파싱: kind 태그", parsed.kind === "sentenceTransform");

const snapped = autoSnapSentenceTransform(parsed, PASSAGE);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
check(
  "게이트: 정상 입력 클린(KILLER)",
  gateMdSentenceTransform(snapped.question, PASSAGE, { difficulty: "KILLER" }).length === 0,
  gateMdSentenceTransform(snapped.question, PASSAGE, { difficulty: "KILLER" }).join(" / "),
);

// 위치 탐색 유틸
{
  const loc = locateSentenceInPassage(PASSAGE, ORIGINAL);
  check(
    "위치탐색: 축자 복원 · 1회 · 문장 경계 양쪽",
    !!loc &&
      loc.verbatim === ORIGINAL &&
      loc.count === 1 &&
      loc.startsAtSentenceBoundary &&
      loc.endsAtSentenceBoundary,
    JSON.stringify(loc),
  );
  check("위치탐색: 지문에 없는 문장은 null", locateSentenceInPassage(PASSAGE, "Rooftops are gardens now.") === null);
  const first = locateSentenceInPassage(
    PASSAGE,
    "Urban planners once treated rooftops as dead space, useful only for equipment.",
  );
  check("위치탐색: 지문 첫 문장도 시작 경계로 인정", !!first && first.startsAtSentenceBoundary);
}

// BASIC / INTERMEDIATE 정상 경로
const BASIC_GOOD = `원문장: Engineers who monitor these buildings report that the district's cooling effect persists even during prolonged heat waves.
조건:
- 관계절을 분사구로 줄여 쓸 것
모범답안: Engineers monitoring these buildings report that the district's cooling effect persists even during prolonged heat waves.
채점기준:
- 만점: 관계절이 분사구로 줄어들고 나머지 의미가 그대로인 문장
- 0점: 관계절이 그대로 남아 있거나 주어가 바뀐 문장
해설: 주격 관계대명사와 정동사를 지우고 현재분사로 줄여 명사구를 압축했습니다. 보고 주체와 지속되는 대상이 그대로여서 의미역과 명제 의미가 보존됩니다.`;

const INTERMEDIATE_GOOD = `원문장: The savings are modest for a single structure, yet they accumulate across a dense district.
조건:
- 'Although'로 시작하는 양보절로 바꿀 것
모범답안: Although the savings are modest for a single structure, they accumulate across a dense district.
채점기준:
- 만점: 양보절이 앞에 오고 두 절의 논리 관계가 유지된 문장
- 0점: 양보 관계가 인과나 병렬로 바뀐 문장
해설: 등위접속사 yet 이 지고 있던 대조 관계를 종속 양보절로 옮겨 문장의 무게중심을 뒤쪽 주절로 이동시켰습니다. 두 절의 명제와 극성이 그대로여서 의미가 보존됩니다.`;

check(
  "게이트: BASIC 정상(조건 1개) 클린",
  gateOf(BASIC_GOOD, { difficulty: "BASIC" }).length === 0,
  gateOf(BASIC_GOOD, { difficulty: "BASIC" }).join(" / "),
);
check(
  "게이트: INTERMEDIATE 정상(조건 1개) 클린",
  gateOf(INTERMEDIATE_GOOD, { difficulty: "INTERMEDIATE" }).length === 0,
  gateOf(INTERMEDIATE_GOOD, { difficulty: "INTERMEDIATE" }).join(" / "),
);
check(
  "게이트: KILLER 는 조건 1개면 반려(killer-needs-multiple-conditions 승격)",
  gateOf(BASIC_GOOD, { difficulty: "KILLER" }).some((i) => i.includes("KILLER")),
  gateOf(BASIC_GOOD, { difficulty: "KILLER" }).join(" / "),
);

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 원문장 축
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 원문장 누락 반려",
  gateOf(GOOD.replace(`원문장: ${ORIGINAL}\n`, "")).some((i) => i.includes("원문장 누락")),
);
check(
  "게이트: 원문장이 지문에 없으면 반려(모델이 지어냄)",
  gateOf(
    GOOD.replace(ORIGINAL, "Because the canopy of a green roof blocks every ray of sunlight, the building never heats up."),
  ).some((i) => i.includes("지문에 축자로 없음")),
  gateOf(GOOD.replace(ORIGINAL, "Because the canopy of a green roof blocks every ray of sunlight, the building never heats up.")).join(" / "),
);
check(
  "게이트: 원문장이 문장 중간에서 시작하면 반려(절만 잘라옴)",
  gateOf(
    GOOD.replace(ORIGINAL, "the surface stays measurably cooler through the afternoon."),
  ).some((i) => i.includes("문장 중간에서 시작")),
);
check(
  "게이트: 원문장이 문장 끝으로 끝나지 않으면 반려",
  gateOf(
    GOOD.replace(
      ORIGINAL,
      "Because the canopy of a green roof intercepts sunlight before it reaches the membrane below,",
    ),
  ).some((i) => i.includes("문장 끝")),
);
check(
  "게이트: 원문장에 한국어가 섞이면 반려",
  gateOf(GOOD.replace(ORIGINAL, `${ORIGINAL} (초록 지붕)`)).some((i) => i.includes("원문장에 한국어")),
);
{
  const DUP_PASSAGE = `${PASSAGE} The savings are modest for a single structure, yet they accumulate across a dense district.`;
  const dupText = GOOD.replace(
    ORIGINAL,
    "The savings are modest for a single structure, yet they accumulate across a dense district.",
  );
  check(
    "게이트: 원문장이 지문에 2회 등장하면 반려(밑줄 모호)",
    gateOf(dupText, undefined, DUP_PASSAGE).some((i) => i.includes("2회 등장")),
    gateOf(dupText, undefined, DUP_PASSAGE).join(" / "),
  );
}
{
  const SHORT_PASSAGE = `Time flies. ${PASSAGE}`;
  const shortText = GOOD.replace(ORIGINAL, "Time flies.");
  check(
    "게이트: 원문장이 너무 짧으면 반려(전환 손잡이 없음)",
    gateOf(shortText, undefined, SHORT_PASSAGE).some((i) => i.includes("너무 짧아")),
    gateOf(shortText, undefined, SHORT_PASSAGE).join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. 게이트 반려 — 조건 축
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 조건 누락 반려",
  gateOf(
    GOOD.replace("조건:\n- 분사구문으로 전환할 것\n- 'Intercepting'으로 시작할 것\n", ""),
  ).some((i) => i.includes("조건 누락")),
);
check(
  "게이트: 조건 개수 초과 반려",
  gateOf(
    GOOD.replace(
      "- 'Intercepting'으로 시작할 것",
      "- 'Intercepting'으로 시작할 것\n- 현재분사를 쓸 것\n- 접속사를 지울 것\n- 주어를 통일할 것\n- 마침표로 끝낼 것",
    ),
  ).some((i) => i.includes("이하로 줄여라")),
);
check(
  "게이트: 조건에 한국어가 없으면 반려",
  gateOf(GOOD.replace("- 분사구문으로 전환할 것", "- use a participial phrase")).some((i) =>
    i.includes("한국어가 없음"),
  ),
);
check(
  "게이트: 조건 중복 반려",
  gateOf(GOOD.replace("- 'Intercepting'으로 시작할 것", "- 분사구문으로 전환할 것")).some((i) =>
    i.includes("중복"),
  ),
);
check(
  "게이트: 조건 단어 수 불일치 반려(정확 개수)",
  gateOf(GOOD.replace("- 분사구문으로 전환할 것", "- 총 14단어로 쓸 것")).some((i) =>
    i.includes("14단어를 요구"),
  ),
  gateOf(GOOD.replace("- 분사구문으로 전환할 것", "- 총 14단어로 쓸 것")).join(" / "),
);
check(
  "게이트: 조건 단어 수 범위 수식은 스킵(오탐 금지)",
  gateOf(GOOD.replace("- 분사구문으로 전환할 것", "- 총 25단어 이내로 쓸 것")).length === 0,
  gateOf(GOOD.replace("- 분사구문으로 전환할 것", "- 총 25단어 이내로 쓸 것")).join(" / "),
);
check(
  "게이트: 조건 단어 수 일치하면 통과",
  gateOf(
    GOOD.replace("- 분사구문으로 전환할 것", "- 총 22단어로 쓸 것"),
  ).length === 0,
  gateOf(GOOD.replace("- 분사구문으로 전환할 것", "- 총 22단어로 쓸 것")).join(" / "),
);
check(
  "게이트: 필수 인용 토큰이 모범답안에 없으면 반려",
  gateOf(GOOD.replace("- 'Intercepting'으로 시작할 것", "- 'Regardless'로 시작할 것")).some((i) =>
    i.includes("'Regardless' 이 모범답안에 없다"),
  ),
  gateOf(GOOD.replace("- 'Intercepting'으로 시작할 것", "- 'Regardless'로 시작할 것")).join(" / "),
);
check(
  "게이트: 금지 인용 토큰이 잔존하면 반려",
  gateOf(GOOD.replace("- 분사구문으로 전환할 것", "- 'sunlight'를 사용하지 말 것")).some((i) =>
    i.includes("사용을 금지"),
  ),
  gateOf(GOOD.replace("- 분사구문으로 전환할 것", "- 'sunlight'를 사용하지 말 것")).join(" / "),
);
check(
  "게이트: 금지 토큰이 실제로 없으면 통과(단어경계 오탐 금지)",
  gateOf(GOOD.replace("- 분사구문으로 전환할 것", "- 'because'를 사용하지 말 것")).length === 0,
  gateOf(GOOD.replace("- 분사구문으로 전환할 것", "- 'because'를 사용하지 말 것")).join(" / "),
);

// ───────────────────────────────────────────────────────────────────────────
// 4. 게이트 반려 — 모범답안 축
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 모범답안 누락 반려",
  gateOf(GOOD.replace(`모범답안: ${MODEL}\n`, "")).some((i) => i.includes("모범답안 누락")),
);
check(
  "게이트: 모범답안 == 원문장(구두점만 다름) 반려 [transform-answer-not-transformed 이식]",
  gateOf(GOOD.replace(MODEL, ORIGINAL.replace(",", "").toUpperCase())).some((i) =>
    i.includes("전환이 적용되지 않았다"),
  ),
  gateOf(GOOD.replace(MODEL, ORIGINAL.replace(",", "").toUpperCase())).join(" / "),
);
check(
  "게이트: 모범답안이 지문에 통째로 있으면 반려(베껴쓰기 과제화)",
  gateOf(
    GOOD.replace(MODEL, "City councils have therefore begun to subsidize installation rather than merely permit it."),
  ).some((i) => i.includes("지문에 그대로 들어 있음")),
  gateOf(GOOD.replace(MODEL, "City councils have therefore begun to subsidize installation rather than merely permit it.")).join(" / "),
);
check(
  "게이트: 모범답안에 한국어가 섞이면 반려",
  gateOf(GOOD.replace(MODEL, `${MODEL} (분사구문)`)).some((i) => i.includes("모범답안에 한국어")),
);
check(
  "게이트: 모범답안이 문장부호로 끝나지 않으면 반려(절단형)",
  gateOf(GOOD.replace(MODEL, MODEL.replace(/\.$/, ""))).some((i) => i.includes("문장부호로 끝나지 않음")),
);
check(
  "게이트: 모범답안이 너무 짧으면 반려",
  gateOf(GOOD.replace(MODEL, "It cools.")).some((i) => i.includes("너무 짧음")),
);

// ───────────────────────────────────────────────────────────────────────────
// 5. 게이트 반려 — 채점기준·해설 축
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 채점기준 1개면 반려",
  gateOf(
    GOOD.replace("- 부분점수: 어순이나 축약만 다른 동치 변형\n", "").replace(
      "- 0점: 원인과 결과가 뒤바뀌었거나 분사구문이 아닌 문장\n",
      "",
    ),
  ).some((i) => i.includes("채점기준 1개")),
);
check(
  "게이트: 채점기준 개수 초과 반려",
  gateOf(
    GOOD.replace(
      "- 0점: 원인과 결과가 뒤바뀌었거나 분사구문이 아닌 문장",
      "- 0점: 원인과 결과가 뒤바뀐 문장\n- 감점A: 관사 오류\n- 감점B: 철자 오류\n- 감점C: 대소문자 오류",
    ),
  ).some((i) => i.includes("이하로 줄여라")),
);
check(
  "게이트: 채점기준 중복 반려",
  gateOf(
    GOOD.replace("- 부분점수: 어순이나 축약만 다른 동치 변형", "- 만점: 분사구문으로 압축되고 원문의 인과 관계가 그대로 유지된 문장"),
  ).some((i) => i.includes("채점기준 2 이 앞 항목과 중복")),
);
check(
  "게이트: requireScoringCriteria:false 면 채점기준 없어도 클린(answer-only 모드)",
  gateOf(GOOD.replace(/채점기준:\n(?:- .*\n)+/, ""), { requireScoringCriteria: false }).length === 0,
  gateOf(GOOD.replace(/채점기준:\n(?:- .*\n)+/, ""), { requireScoringCriteria: false }).join(" / "),
);
check(
  "게이트: 채점기준 누락은 기본 모드에서 반려",
  gateOf(GOOD.replace(/채점기준:\n(?:- .*\n)+/, "")).some((i) => i.includes("채점기준 0개")),
);
check(
  "게이트: 해설 누락 반려",
  gateOf(GOOD.split("해설:")[0]).some((i) => i.includes("해설 누락")),
);
check(
  "게이트: 해설이 너무 짧으면 반려",
  gateOf(GOOD.replace(/^해설: .*$/m, "해설: 바꿨습니다.")).some((i) => i.includes("해설이 너무 짧음")),
);
check(
  "게이트: 해설 환각 인용 반려 [explanation-quoted-token-missing 이식]",
  gateOf(GOOD.replace('"stays measurably cooler"', '"absorbs every photon of light"')).some((i) =>
    i.includes("환각 인용"),
  ),
  gateOf(GOOD.replace('"stays measurably cooler"', '"absorbs every photon of light"')).join(" / "),
);
check(
  "게이트: 지문 실재 인용은 통과(오탐 금지)",
  gateOf(GOOD.replace('"stays measurably cooler"', '"intercepts sunlight before it reaches"')).length === 0,
  gateOf(GOOD.replace('"stays measurably cooler"', '"intercepts sunlight before it reaches"')).join(" / "),
);
check(
  "게이트: 모범답안 인용도 통과(문항 표면 코퍼스)",
  gateOf(GOOD.replace('"stays measurably cooler"', '"keeps the surface measurably cooler"')).length === 0,
  gateOf(GOOD.replace('"stays measurably cooler"', '"keeps the surface measurably cooler"')).join(" / "),
);

// ───────────────────────────────────────────────────────────────────────────
// 6. 드리프트 관용 — 전부 파싱 성공 + 게이트 클린이어야 한다
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string][] = [
  ["불릿 접두(원문장)", `원문장: ${ORIGINAL}`, `- 원문장: ${ORIGINAL}`],
  ["별표 불릿(모범답안)", `모범답안: ${MODEL}`, `* 모범답안: ${MODEL}`],
  ["굵게 라벨", `모범답안: ${MODEL}`, `**모범답안:** ${MODEL}`],
  ["굵게 라벨(콜론 밖)", `원문장: ${ORIGINAL}`, `**원문장**: ${ORIGINAL}`],
  ["헤딩 접두", `원문장: ${ORIGINAL}`, `### 원문장: ${ORIGINAL}`],
  ["인용부호 접두", `모범답안: ${MODEL}`, `> 모범답안: ${MODEL}`],
  ["표 행", `원문장: ${ORIGINAL}`, `| 원문장: ${ORIGINAL} |`],
  ["잔여 파이프", `모범답안: ${MODEL}`, `모범답안: ${MODEL} |`],
  ["전각 콜론", `원문장: ${ORIGINAL}`, `원문장： ${ORIGINAL}`],
  ["라벨 별칭 원문", `원문장: ${ORIGINAL}`, `원문: ${ORIGINAL}`],
  ["라벨 별칭 대상 문장", `원문장: ${ORIGINAL}`, `대상 문장: ${ORIGINAL}`],
  ["라벨 별칭 정답", `모범답안: ${MODEL}`, `정답: ${MODEL}`],
  ["라벨 별칭 모범 답안(공백)", `모범답안: ${MODEL}`, `모범 답안: ${MODEL}`],
  ["라벨 별칭 전환 조건", "조건:", "전환 조건:"],
  ["라벨 별칭 채점 기준(공백)", "채점기준:", "채점 기준:"],
  ["번호 목록 조건", "- 분사구문으로 전환할 것", "1. 분사구문으로 전환할 것"],
  ["괄호 번호 목록 조건", "- 분사구문으로 전환할 것", "1) 분사구문으로 전환할 것"],
  ["원문자 목록 조건", "- 분사구문으로 전환할 것", "① 분사구문으로 전환할 것"],
  ["가운뎃점 불릿 조건", "- 분사구문으로 전환할 것", "• 분사구문으로 전환할 것"],
  ["조건 목록 사이 빈 줄", "- 'Intercepting'으로 시작할 것", "\n- 'Intercepting'으로 시작할 것\n"],
  ["값 감싼 큰따옴표", `모범답안: ${MODEL}`, `모범답안: "${MODEL}"`],
  ["값 감싼 곱슬따옴표", `원문장: ${ORIGINAL}`, `원문장: “${ORIGINAL}”`],
  ["조건 값을 라벨 줄에 바로", "조건:\n- 분사구문으로 전환할 것", "조건: 분사구문으로 전환할 것"],
  ["채점기준 값을 라벨 줄에 바로", "채점기준:\n- 만점:", "채점기준: 만점:"],
  // ★ 웨이브2: 키워드 줄 무관용이 전체 지적의 1위 계통(silent-drop 60건)이다.
  //   라벨 하나라도 못 읽으면 그 필드가 통째로 사라지고, 게이트가 "누락" 이라는
  //   **사실과 다른 원인**을 지목해 재생성 피드백이 모델을 엉뚱한 방향으로 몬다.
  //   아래는 종전에 전부 유실되던 실측 드리프트다.
  ["단일 별표 강조 라벨", `모범답안: ${MODEL}`, `*모범답안:* ${MODEL}`],
  ["단일 별표 강조(콜론 밖)", `원문장: ${ORIGINAL}`, `*원문장*: ${ORIGINAL}`],
  ["밑줄 강조 라벨", "해설: 종속절", "__해설:__ 종속절"],
  ["대괄호 라벨(원문장)", `원문장: ${ORIGINAL}`, `[원문장]: ${ORIGINAL}`],
  ["대괄호 라벨(채점기준)", "채점기준:", "[채점기준]:"],
  ["검은 렌즈 괄호 라벨", `모범답안: ${MODEL}`, `【모범답안】: ${MODEL}`],
  ["소괄호 라벨(조건)", "조건:", "(조건):"],
  ["낫표 라벨(해설)", "해설: 종속절", "「해설」: 종속절"],
  ["변형 콜론 ﹕(FE55)", `원문장: ${ORIGINAL}`, `원문장﹕ ${ORIGINAL}`],
  ["변형 콜론 ︓(FE13)", `모범답안: ${MODEL}`, `모범답안︓ ${MODEL}`],
  ["콜론 앞 공백", `모범답안: ${MODEL}`, `모범답안 : ${MODEL}`],
  ["굵게 + 전각 콜론 동시", "해설: 종속절", "**해설：** 종속절"],
  ["라벨 별칭 원 문장(공백)", `원문장: ${ORIGINAL}`, `원 문장: ${ORIGINAL}`],
  ["라벨 별칭 정답 문장", `모범답안: ${MODEL}`, `정답 문장: ${MODEL}`],
  ["라벨 별칭 모범답안 문장", `모범답안: ${MODEL}`, `모범답안 문장: ${MODEL}`],
  ["라벨 별칭 채점 요소", "채점기준:", "채점 요소:"],
  ["라벨 별칭 해 설(공백)", "해설: 종속절", "해 설: 종속절"],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseSnap(drifted);
  const issues = gateOf(drifted);
  check(
    `드리프트 관용: ${name}`,
    q.originalSentence === ORIGINAL &&
      q.modelAnswer === MODEL &&
      q.conditions.length === 2 &&
      q.scoringCriteria.length === 3 &&
      issues.length === 0,
    `original='${q.originalSentence.slice(0, 30)}' model='${q.modelAnswer.slice(0, 30)}' cond=${q.conditions.length} score=${q.scoringCriteria.length} · ${issues.join(" / ")}`,
  );
}

// 코드펜스 통째 감싸기
{
  const fenced = "```markdown\n" + GOOD + "\n```";
  const q = parseSnap(fenced);
  check(
    "드리프트 관용: 코드펜스 통째 감싸기",
    q.originalSentence === ORIGINAL && q.modelAnswer === MODEL && gateOf(fenced).length === 0,
    gateOf(fenced).join(" / "),
  );
}

// 줄바꿈된 긴 원문장
{
  const wrapped = GOOD.replace(
    `원문장: ${ORIGINAL}`,
    "원문장: Because the canopy of a green roof intercepts sunlight before it reaches the membrane below,\nthe surface stays measurably cooler through the afternoon.",
  );
  const q = parseSnap(wrapped);
  check(
    "드리프트 관용: 줄바꿈된 원문장을 한 줄로 이어붙임",
    q.originalSentence === ORIGINAL && gateOf(wrapped).length === 0,
    `'${q.originalSentence.slice(0, 60)}' · ${gateOf(wrapped).join(" / ")}`,
  );
}

// 형식 뒤에 지문을 재출력하는 실측 드리프트 — 해설에 섞이면 안 된다
{
  const trailing = `${GOOD}\n\n## 지문\n${PASSAGE}`;
  const q = parseSnap(trailing);
  check(
    "과잉 관용 방지: 뒤따르는 '## 지문' 재출력이 해설에 섞이지 않음",
    !q.explanation.includes("Urban planners") && gateOf(trailing).length === 0,
    q.explanation.slice(-60),
  );
}
{
  const trailingNoHeading = `${GOOD}\nUrban planners once treated rooftops as dead space, useful only for equipment.`;
  const q = parseSnap(trailingNoHeading);
  check(
    "과잉 관용 방지: 헤딩 없는 영어 꼬리도 해설에 섞이지 않음(한국어 줄만 누적)",
    !q.explanation.includes("Urban planners"),
    q.explanation.slice(-60),
  );
}
{
  const alsoModel = GOOD.replace(`모범답안: ${MODEL}`, `모범답안: ${MODEL}\n정답: ${MODEL}`);
  check(
    "과잉 관용 방지: 정본 라벨이 별칭보다 우선(모범답안 + 정답 중복 출력)",
    parseMdSentenceTransform(alsoModel).modelAnswer === MODEL,
    parseMdSentenceTransform(alsoModel).modelAnswer,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 스냅 보정 — 지문이 진실원
// ───────────────────────────────────────────────────────────────────────────
{
  const curly = GOOD.replace(
    ORIGINAL,
    "Because the canopy of a green roof intercepts sunlight before it reaches the membrane below, the surface stays measurably cooler through the afternoon.",
  ).replace(
    "원문장: Because",
    "원문장: because",
  );
  const s = autoSnapSentenceTransform(parseMdSentenceTransform(curly), PASSAGE);
  check(
    "스냅: 대소문자 드리프트를 지문 축자로 보정",
    s.corrections.length === 1 && s.question.originalSentence === ORIGINAL,
    `${s.corrections.join(" / ")} · '${s.question.originalSentence.slice(0, 30)}'`,
  );
}
{
  const spaced = GOOD.replace(ORIGINAL, ORIGINAL.replace("green roof", "green  roof"));
  const s = autoSnapSentenceTransform(parseMdSentenceTransform(spaced), PASSAGE);
  check(
    "스냅: 공백 드리프트를 지문 축자로 보정",
    s.corrections.length === 1 && s.question.originalSentence === ORIGINAL,
    s.corrections.join(" / "),
  );
}
{
  const apos = GOOD.replace(
    ORIGINAL,
    "Engineers who monitor these buildings report that the district’s cooling effect persists even during prolonged heat waves.",
  );
  const s = autoSnapSentenceTransform(parseMdSentenceTransform(apos), PASSAGE);
  check(
    "스냅: 곱슬 아포스트로피를 지문 축자(직선)로 보정",
    s.corrections.length === 1 &&
      s.question.originalSentence ===
        "Engineers who monitor these buildings report that the district's cooling effect persists even during prolonged heat waves.",
    `${s.corrections.join(" / ")} · '${s.question.originalSentence.slice(-40)}'`,
  );
}
{
  const noDot = GOOD.replace(ORIGINAL, ORIGINAL.replace(/\.$/, ""));
  const s = autoSnapSentenceTransform(parseMdSentenceTransform(noDot), PASSAGE);
  check(
    "스냅: 누락된 문말 구두점을 지문 축자로 복원",
    s.corrections.some((c) => c.includes("문말 구두점")) && s.question.originalSentence === ORIGINAL,
    `${s.corrections.join(" / ")} · '${s.question.originalSentence.slice(-30)}'`,
  );
}
{
  // 보수 가드 — 지문에 없는 문장은 손대지 않고 게이트가 반려한다.
  const invented = GOOD.replace(ORIGINAL, "Green roofs are simply a fashion of the moment.");
  const s = autoSnapSentenceTransform(parseMdSentenceTransform(invented), PASSAGE);
  check(
    "스냅 보수 가드: 지문에 없는 원문장은 무보정(게이트가 반려)",
    s.corrections.length === 0 &&
      gateMdSentenceTransform(s.question, PASSAGE, { difficulty: "KILLER" }).some((i) =>
        i.includes("지문에 축자로 없음"),
      ),
    s.corrections.join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. 어댑터 → postProcessQuestion → validateQuestionQuality 왕복
// ───────────────────────────────────────────────────────────────────────────
const adapt = adaptMdSentenceTransformToAiQuestion(snapped.question, "KILLER");
const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
check("어댑터: 성공", adapt.ok === true, adapt.error);
check(
  "어댑터: direction 은 fast 산출과 동일 문구",
  ai.direction === "다음 문장을 주어진 조건에 맞게 바꾸어 쓰시오.",
  String(ai.direction),
);
check("어댑터: originalSentence 축자", ai.originalSentence === ORIGINAL);
check("어댑터: conditions 2개", Array.isArray(ai.conditions) && (ai.conditions as string[]).length === 2);
check("어댑터: modelAnswer", ai.modelAnswer === MODEL);
check("어댑터: scoringCriteria 3개", Array.isArray(ai.scoringCriteria) && (ai.scoringCriteria as string[]).length === 3);
check(
  "어댑터: correctAnswer === modelAnswer (정답 유일 진실원 복제)",
  ai.correctAnswer === MODEL,
  String(ai.correctAnswer),
);
check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
check("어댑터: tags 빈 배열", Array.isArray(ai.tags) && (ai.tags as []).length === 0);
check("어댑터: difficulty 원본 전달", ai.difficulty === "KILLER");
check(
  "★어댑터: options 키 자체가 없다(correct-answer-mismatch 회귀 방지)",
  !("options" in ai),
);
check(
  "★어댑터: 서술형 이물 필드 없음(blanks·passageWithBlank·acceptedAnswers·acceptableVariants)",
  !("blanks" in ai) &&
    !("passageWithBlank" in ai) &&
    !("acceptedAnswers" in ai) &&
    !("acceptableVariants" in ai) &&
    !("scrambledWords" in ai) &&
    !("summaryWithBlanks" in ai),
);
check(
  "어댑터: 렌더 가능 판정 필드 충족(originalSentence && conditions)",
  !!ai.originalSentence && Array.isArray(ai.conditions) && (ai.conditions as string[]).length > 0,
);
check(
  "어댑터: 채점기준이 비면 키를 만들지 않는다",
  !(
    "scoringCriteria" in
    ((adaptMdSentenceTransformToAiQuestion(
      { ...snapped.question, scoringCriteria: [] },
      "BASIC",
    ).aiQuestion ?? {}) as Record<string, unknown>)
  ),
);
for (const [name, patch] of [
  ["원문장", { originalSentence: "" }],
  ["조건", { conditions: [] }],
  ["모범답안", { modelAnswer: "" }],
] as const) {
  const r = adaptMdSentenceTransformToAiQuestion({ ...snapped.question, ...patch }, "BASIC");
  check(`어댑터: ${name} 없으면 ok:false`, r.ok === false && !!r.error, r.error);
}

{
  const pp = postProcessQuestion("SENTENCE_TRANSFORM", PASSAGE, ai as never);
  check("후처리: PASSTHROUGH 성공", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  check(
    "후처리: 어댑터 필드 그대로 통과(후처리가 만들어 주는 것이 없다)",
    data.originalSentence === ORIGINAL &&
      data.modelAnswer === MODEL &&
      data.correctAnswer === MODEL &&
      data.direction === ai.direction,
  );
  check("후처리: options 를 만들어 내지 않는다", !("options" in data) || !Array.isArray(data.options));

  const issues = validateQuestionQuality({
    typeId: "SENTENCE_TRANSFORM",
    question: data,
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    stemLanguage: "ko",
  });
  const errors = issues.filter((i) => i.severity === "error");
  check(
    "품질 검증: error 0건(정상 문항)",
    errors.length === 0,
    errors.map((e) => `${e.code}: ${e.message}`).join(" / "),
  );
  check(
    "품질 검증: transform-answer-not-transformed 미발화",
    !issues.some((i) => i.code === "transform-answer-not-transformed"),
  );
  check(
    "품질 검증: killer-needs-multiple-conditions 미발화(조건 2개)",
    !issues.some((i) => i.code === "killer-needs-multiple-conditions"),
  );

  // 전환 미이행 문항은 fast 검증기도 error 를 낸다 — md 게이트와 축이 같은지 확인.
  const notTransformed = { ...data, modelAnswer: ORIGINAL, correctAnswer: ORIGINAL };
  check(
    "품질 검증: 전환 미이행이면 fast 검증기도 error — md 게이트와 동축",
    validateQuestionQuality({
      typeId: "SENTENCE_TRANSFORM",
      question: notTransformed,
      passage: PASSAGE,
      requestedDifficulty: "KILLER",
    }).some((i) => i.code === "transform-answer-not-transformed"),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 9. 채점 왕복 — buildAnswerSpec → gradeAnswer (서술형 계열의 핵심 축)
// ───────────────────────────────────────────────────────────────────────────
{
  const spec = buildAnswerSpec({
    id: "q-st-1",
    type: "ESSAY",
    subType: "SENTENCE_TRANSFORM",
    correctAnswer: MODEL,
    structuredData: ai,
    sourcePassageContent: PASSAGE,
    points: 5,
  });
  check(
    "채점: FREE_WRITING → MANUAL_ONLY (기계 채점 불가)",
    spec.inputKind === "MANUAL_ONLY" && !!spec.manualReason,
    `${spec.inputKind} / ${spec.manualReason}`,
  );
  check("채점: 텍스트 필드를 만들지 않는다", !spec.fields || spec.fields.length === 0);
  check("채점: 선지 축이 없다", !spec.correctChoices && !spec.optionCount);
  const graded = gradeAnswer(spec, { texts: { answer: MODEL } });
  check(
    "채점: 정답 그대로 써도 NEEDS_REVIEW (자동 만점 금지)",
    graded.status === "NEEDS_REVIEW" && graded.earnedPoints === null,
    `${graded.status} / ${graded.earnedPoints}`,
  );
  const gradedWrong = gradeAnswer(spec, { texts: { answer: "완전히 다른 답" } });
  check("채점: 오답도 NEEDS_REVIEW(강사 검토 위임)", gradedWrong.status === "NEEDS_REVIEW");
}

// ───────────────────────────────────────────────────────────────────────────
// 10. 레인 계약 — 과금 축 · 적격성 · 난이도 3분기 · 언어 · 다양성
// ───────────────────────────────────────────────────────────────────────────
const LANE = SENTENCE_TRANSFORM_MD_LANE;
function ctxOf(
  difficulty: MdLaneContext["difficulty"],
  rawTypeSettings: unknown = null,
): MdLaneContext {
  return {
    passage: PASSAGE,
    difficulty,
    rawDifficulty: difficulty,
    resolved: {},
    rawTypeSettings,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
  };
}

check("레인: subType SENTENCE_TRANSFORM", LANE.subType === "SENTENCE_TRANSFORM");
check(
  "★레인: 과금 QUESTION_GEN_SINGLE (2크레딧) — fast getOperationType 과 동기",
  LANE.operationType === "QUESTION_GEN_SINGLE" && CREDIT_COSTS.QUESTION_GEN_SINGLE === 2,
  String(LANE.operationType),
);
check("레인: retryEligible", LANE.retryEligible === true);
check(
  "레인: 적격성 항상 true(설정 범위 없는 유형)",
  LANE.isEligible({}) && LANE.isEligible({ anything: 99 }),
);
check(
  "레인: parseAndGate 왕복 클린",
  LANE.parseAndGate(GOOD, ctxOf("KILLER")).gateIssues.length === 0,
  LANE.parseAndGate(GOOD, ctxOf("KILLER")).gateIssues.join(" / "),
);
check(
  "레인: parseAndGate 가 난이도를 게이트에 전달(BASIC 1조건 통과 / KILLER 반려)",
  LANE.parseAndGate(BASIC_GOOD, ctxOf("BASIC")).gateIssues.length === 0 &&
    LANE.parseAndGate(BASIC_GOOD, ctxOf("KILLER")).gateIssues.length > 0,
);
check(
  "레인: parseAndGate 가 스냅 corrections 를 전달",
  LANE.parseAndGate(GOOD.replace("원문장: Because", "원문장: because"), ctxOf("KILLER"))
    .corrections.length === 1,
);
check(
  "레인: adapt 성공 + 한국어 발문",
  LANE.adapt(LANE.parseAndGate(GOOD, ctxOf("KILLER")), ctxOf("KILLER")).aiQuestion?.direction ===
    "다음 문장을 주어진 조건에 맞게 바꾸어 쓰시오.",
);
{
  const enSettings = { SENTENCE_TRANSFORM: { stemLanguage: "en" } };
  const enCtx = ctxOf("KILLER", enSettings);
  check(
    "레인: stemLanguage=en 이면 발문만 영어로 교체",
    LANE.adapt(LANE.parseAndGate(GOOD, enCtx), enCtx).aiQuestion?.direction ===
      "Rewrite the following sentence according to the given conditions.",
    String(LANE.adapt(LANE.parseAndGate(GOOD, enCtx), enCtx).aiQuestion?.direction),
  );
  check("레인: stemLanguage=en 이면 언어 블록 1개", LANE.buildExtras(enCtx).length === 1);
  check("레인: stemLanguage=ko 면 extras 없음", LANE.buildExtras(ctxOf("KILLER")).length === 0);
  check(
    "레인: qualityArgs 는 stemLanguage 실값만(전용 카운트 슬롯 없음)",
    JSON.stringify(LANE.qualityArgs(enCtx)) === JSON.stringify({ stemLanguage: "en" }),
    JSON.stringify(LANE.qualityArgs(enCtx)),
  );
}
check(
  "레인: mdFormat 포렌식 실값",
  (LANE.mdFormat(ctxOf("KILLER")) as { conditionMin: number }).conditionMin === 2 &&
    (LANE.mdFormat(ctxOf("BASIC")) as { conditionMin: number }).conditionMin === 1,
  JSON.stringify(LANE.mdFormat(ctxOf("KILLER"))),
);
check(
  "레인: diversityTargets = originalSentence",
  LANE.diversityTargets({ originalSentence: ORIGINAL })[0] === ORIGINAL.slice(0, 90) &&
    LANE.diversityTargets({}).length === 0,
);

// 난이도 3분기 프롬프트
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdSentenceTransformPrompt(PASSAGE, "full", d);
  check(
    `프롬프트 ${d}: 난이도 분기 + 출력형식 + 지문 포함`,
    p.includes("## 출력 형식") &&
      p.includes("원문장:") &&
      p.includes("모범답안:") &&
      p.includes("## 지문") &&
      p.includes(PASSAGE.slice(0, 40)),
  );
}
check(
  "프롬프트: BASIC 은 조건 1개 · KILLER 는 2개 이상을 명시",
  buildMdSentenceTransformPrompt(PASSAGE, "full", "BASIC").includes("조건은 **1개**") &&
    buildMdSentenceTransformPrompt(PASSAGE, "full", "KILLER").includes("조건은 **2개 이상**"),
);
check(
  "프롬프트: few-shot 은 BASIC 에서 생략(정본 어법 빌더 선례)",
  !buildMdSentenceTransformPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") &&
    buildMdSentenceTransformPrompt(PASSAGE, "full", "KILLER").includes("모범 설계 해부"),
);
check(
  "프롬프트: 선지 계약을 요구하지 않는다(서술형 — 정답/오답 블록 없음)",
  !buildMdSentenceTransformPrompt(PASSAGE, "full", "KILLER").includes("오답:") &&
    !buildMdSentenceTransformPrompt(PASSAGE, "full", "KILLER").includes("\n정답: <"),
);
check(
  "프롬프트: 의미 보존 3대 검산(극성·hedge·의미역) 명시",
  ["극성", "hedge", "의미역"].every((k) =>
    buildMdSentenceTransformPrompt(PASSAGE, "full", "INTERMEDIATE").includes(k),
  ),
);
check(
  "프롬프트: answer-only 모드는 채점기준을 요구하지 않는다",
  !buildMdSentenceTransformPrompt(PASSAGE, "answer-only", "KILLER").includes("채점기준:\n- 만점"),
);
// ★ 웨이브2: 게이트가 새로 강제하는 불변식은 프롬프트가 먼저 요구해야 한다.
//   프롬프트가 시키지 않은 것을 게이트가 반려하면 재생성 피드백이 모델을 헤매게 한다
//   (fast 의 SENTENCE_ORDER 자기모순 선례 — 규범 §4-4).
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdSentenceTransformPrompt(PASSAGE, "full", d);
  check(
    `★W2 프롬프트 ${d}: 게이트 신규 불변식 4종을 프롬프트가 먼저 지시한다`,
    p.includes("**문장은 정확히 하나다.**") &&
      p.includes("60단어 초과") &&
      p.includes("**대안 답안을 덧붙이지 마라.**") &&
      p.includes("**'총'을 붙여라**") &&
      p.includes("줄바꿈 없이 한 줄"),
    p.slice(0, 0),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 11. 웨이브2 적대검수 회귀 — critical 1 · major 4. 각 픽스처는 수리 전 결함을
//     그대로 재현하던 입력이다(수리 전에는 전부 실패한다).
// ───────────────────────────────────────────────────────────────────────────

// ── [W2-1 critical] 조건 한 줄의 금지·필수 신호를 토큰별로 갈라 적용 ───────────
// 종전: 줄에 금지 신호가 하나라도 있으면 인용 토큰 **전부**를 금지로 판정했다.
// 프롬프트가 직접 가르치는 전환 축 6(접속사↔전치사구: because↔because of)이
// 통째로 오반려됐고, md 레인은 게이트 반려 = 1회 재생성 후 실패+환불이며 반려
// 문구가 그대로 재생성 피드백으로 실려 회복 경로가 없었다.
{
  const MODEL_DUE =
    "Due to the canopy of a green roof intercepting sunlight before it reaches the membrane below, the surface stays measurably cooler through the afternoon.";
  const buildDue = (cond: string) => `원문장: ${ORIGINAL}
조건:
- ${cond}
- 종속절을 전치사구로 압축할 것
모범답안: ${MODEL_DUE}
채점기준:
- 만점: 종속절이 전치사구로 압축되고 인과 관계가 유지된 문장
- 0점: 인과가 뒤바뀌었거나 접속사가 그대로 남은 문장
해설: 인과 접속사를 전치사구로 바꾸고 종속절의 정동사를 동명사로 낮췄습니다. 원문의 인과 방향과 정도 한정이 그대로여서 명제 의미가 보존됩니다.`;

  for (const cond of [
    "'because'를 쓰지 말고 'Due to'를 사용할 것",
    "'because' 대신 'Due to'를 사용할 것",
    "'because'를 'Due to'로 바꿔 쓸 것",
  ]) {
    check(
      `★W2-1 오반려 금지: 금지·필수 토큰 공존 조건 — ${cond}`,
      gateOf(buildDue(cond)).length === 0,
      gateOf(buildDue(cond)).join(" / "),
    );
  }
  {
    // 검출력 유지 ①: 금지 토큰이 실제로 남아 있으면 그 토큰만 지목한다.
    const issues = gateOf(buildDue("'sunlight'를 쓰지 말고 'Due to'를 사용할 것"));
    check(
      "★W2-1 검출력 유지: 2토큰 조건에서도 진짜 금지 위반은 잡고, 대체 토큰은 지목하지 않는다",
      issues.length === 1 &&
        issues[0].includes("'sunlight' 사용을 금지") &&
        !issues.some((i) => i.includes("'Due to' 사용을 금지")),
      issues.join(" / "),
    );
  }
  {
    // 검출력 유지 ②: 필수 토큰이 빠지면 그 토큰만 지목한다.
    const issues = gateOf(buildDue("'Due to'로 시작하고 'Regardless'를 포함할 것"));
    check(
      "★W2-1 검출력 유지: 2토큰 조건에서 누락된 필수 토큰만 지목",
      issues.length === 1 && issues[0].includes("'Regardless' 이 모범답안에 없다"),
      issues.join(" / "),
    );
  }
}

// ── [W2-2 silent-drop] 줄바꿈된 해설이 영어 인용 줄에서 잘리던 결함 ────────────
{
  const wrapped = GOOD.replace(
    /^해설: .*$/m,
    `해설: 종속절의 주어를 주절 주어로 통일한 뒤 접속사와 정동사를 지웠습니다. 원문이 말한
"stays measurably cooler through the afternoon"
라는 결과절은 손대지 않아 명제 의미가 보존됩니다.`,
  );
  const q = parseSnap(wrapped);
  check(
    "★W2-2: 해설 중간의 영어 인용 줄에서 끊지 않고 뒤따르는 한국어까지 잇는다",
    q.explanation.includes("결과절은 손대지 않아") &&
      q.explanation.endsWith("보존됩니다.") &&
      gateOf(wrapped).length === 0,
    `'${q.explanation}' · ${gateOf(wrapped).join(" / ")}`,
  );
}
{
  // 이어 붙일 한국어가 없으면(인용 줄이 해설의 마지막) 게이트가 절단을 지목한다.
  // 종전 유일한 해설 검사는 '길이 20자'뿐이라 조사에서 끊긴 비문이 CLEAN 이었다.
  const truncated = GOOD.replace(
    /^해설: .*$/m,
    `해설: 종속절의 주어를 주절 주어로 통일한 뒤 접속사와 정동사를 지웠습니다. 원문이 말한
"stays measurably cooler through the afternoon"`,
  );
  const q = parseSnap(truncated);
  check(
    "★W2-2: 이어 붙일 한국어가 없으면 '해설이 문장 중간에서 끊김'을 자리 지목형으로 반려",
    q.explanation.endsWith("원문이 말한") &&
      gateOf(truncated).some((i) => i.includes("문장 중간에서 끊김")),
    `'${q.explanation}' · ${gateOf(truncated).join(" / ")}`,
  );
}
{
  // 과잉 관용 방지 — 영어 줄이 3줄 이상이면 지문 재출력으로 보고 흡수하지 않는다.
  const flood = GOOD.replace(
    /^해설: .*$/m,
    `해설: 종속절의 주어를 주절 주어로 통일했습니다. 원문이 말한
Urban planners once treated rooftops as dead space, useful only for equipment.
Engineers who monitor these buildings report that the effect persists.
City councils have therefore begun to subsidize installation.
라는 부분은 손대지 않았습니다.`,
  );
  const q = parseSnap(flood);
  check(
    "★W2-2 과잉 관용 방지: 영어 줄 3줄 이상은 해설로 흡수하지 않는다(지문 재출력 차단)",
    !q.explanation.includes("Urban planners") &&
      !q.explanation.includes("부분은 손대지 않았습니다"),
    q.explanation,
  );
}

// ── [W2-3 silent-drop] 모범답안 뒤 라벨 없는 영어 줄이 정답에 합쳐지던 결함 ────
{
  const withAlt = GOOD.replace(
    `모범답안: ${MODEL}`,
    `모범답안: ${MODEL}\nAlternatively the canopy of a green roof keeps the surface cooler by intercepting sunlight.`,
  );
  const q = parseSnap(withAlt);
  check(
    "★W2-3: 모범답안 뒤 라벨 없는 영어 부연 줄을 정답에 합치지 않는다",
    q.modelAnswer === MODEL && gateOf(withAlt).length === 0,
    `'${q.modelAnswer}' · ${gateOf(withAlt).join(" / ")}`,
  );
  const alt = (adaptMdSentenceTransformToAiQuestion(q, "KILLER").aiQuestion ?? {}) as Record<
    string,
    unknown
  >;
  check(
    "★W2-3: correctAnswer(채점 기준 원본)도 오염되지 않는다 — FREE_WRITING·MANUAL_ONLY 유형",
    alt.correctAnswer === MODEL && alt.modelAnswer === MODEL,
    String(alt.correctAnswer),
  );
}
{
  // 이어붙이기의 원래 목적(줄바꿈된 한 문장 잇기)은 그대로 살아 있어야 한다.
  const wrappedModel = GOOD.replace(
    `모범답안: ${MODEL}`,
    "모범답안: Intercepting sunlight before it reaches the membrane below,\nthe canopy of a green roof keeps the surface measurably cooler through the afternoon.",
  );
  const q = parseSnap(wrappedModel);
  check(
    "★W2-3 무회귀: 직전 줄이 미종결(쉼표)이면 줄바꿈된 모범답안을 여전히 잇는다",
    q.modelAnswer === MODEL && gateOf(wrappedModel).length === 0,
    `'${q.modelAnswer}' · ${gateOf(wrappedModel).join(" / ")}`,
  );
}
{
  // 한 줄에 두 문장을 쓴 경우는 파서가 못 막으므로 게이트가 결정형으로 잡는다.
  const twoSentence = GOOD.replace(
    MODEL,
    `${MODEL} Alternatively the canopy keeps the surface cooler by intercepting sunlight.`,
  );
  check(
    "★W2-3 게이트: 한 줄에 두 문장인 모범답안 반려(형식 계약은 '완성 문장 한 줄')",
    gateOf(twoSentence).some((i) => i.includes("2개 문장임")),
    gateOf(twoSentence).join(" / "),
  );
}
for (const [name, answer] of [
  [
    "약어 Dr.",
    "Intercepting sunlight before it reaches the membrane below, Dr. Chen's team found the surface measurably cooler.",
  ],
  [
    "이니셜 U.S.",
    "Intercepting sunlight before it reaches the membrane below, the U.S. Green Building Council found the surface measurably cooler.",
  ],
] as const) {
  const md = GOOD.replace(MODEL, answer);
  check(
    `★W2-3 오탐 금지: ${name} 는 문장 경계로 세지 않는다`,
    !gateOf(md).some((i) => i.includes("개 문장임")),
    gateOf(md).join(" / "),
  );
}

// ── [W2-4 gate-gap] 원문장 '문장 하나' 불변식 ────────────────────────────────
{
  const PARA_PASSAGE =
    "Urban planners once treated rooftops as dead space, useful only for equipment.\n\n" +
    "Because the canopy of a green roof intercepts sunlight before it reaches the membrane below, the surface stays measurably cooler through the afternoon. " +
    "Engineers who monitor these buildings report that the district's cooling effect persists even during prolonged heat waves.";
  const TWO_SENTENCES =
    "Urban planners once treated rooftops as dead space, useful only for equipment. Because the canopy of a green roof intercepts sunlight before it reaches the membrane below, the surface stays measurably cooler through the afternoon.";
  const md = GOOD.replace(ORIGINAL, TWO_SENTENCES);

  const s = autoSnapSentenceTransform(parseMdSentenceTransform(md), PARA_PASSAGE);
  check(
    "★W2-4 스냅: 문단 경계(빈 줄)를 넘는 지문 슬라이스는 채택하지 않는다 — 조판 계약(stripOriginalBlock) 보호",
    s.corrections.length === 0 && !/\n/.test(s.question.originalSentence),
    `${s.corrections.join(" / ")} · ${JSON.stringify(s.question.originalSentence.slice(0, 50))}`,
  );
  const issues = gateOf(md, undefined, PARA_PASSAGE);
  check(
    "★W2-4 게이트: 문단 경계를 넘은 원문장 반려(원문 뒷부분이 학생 지면에 고아 텍스트로 인쇄되던 결함)",
    issues.some((i) => i.includes("문단 경계")),
    issues.join(" / "),
  );
  check(
    "★W2-4 게이트: 두 문장짜리 원문장 반려(밑줄 범위와 모범답안 범위의 어긋남)",
    issues.some((i) => i.includes("2개 문장임")),
    issues.join(" / "),
  );
}
{
  // 문단을 넘지 않아도 '문장 하나' 불변식은 동일하게 걸린다.
  const TWO_IN_ONE_PARA =
    "The savings are modest for a single structure, yet they accumulate across a dense district. City councils have therefore begun to subsidize installation rather than merely permit it.";
  const md = GOOD.replace(ORIGINAL, TWO_IN_ONE_PARA);
  check(
    "★W2-4 게이트: 한 문단 안의 두 문장도 반려",
    gateOf(md).some((i) => i.includes("2개 문장임")),
    gateOf(md).join(" / "),
  );
}
{
  const LONG_SENTENCE =
    "The rooftop garden absorbs heat and shelters birds and stores rainwater and cools the air and softens the skyline and lifts the mood of every worker who steps outside for a short break during a long summer afternoon in the dense district that lies below the canopy of broad leaves which planners once dismissed as mere decoration on a roof in the city.";
  const LONG_PASSAGE = `${PASSAGE} ${LONG_SENTENCE}`;
  const md = GOOD.replace(ORIGINAL, LONG_SENTENCE);
  check(
    "★W2-4 게이트: 원문장 단어 수 상한(60단어) 초과 반려",
    gateOf(md, undefined, LONG_PASSAGE).some((i) => i.includes("너무 김")),
    gateOf(md, undefined, LONG_PASSAGE).join(" / "),
  );
  check(
    "★W2-4 무회귀: 정상 길이 원문장은 상한에 걸리지 않는다",
    !gateOf(GOOD).some((i) => i.includes("너무 김")),
  );
}

// ── [W2-5 correctness] 부분 범위 'N단어' 조건 오반려 ──────────────────────────
for (const cond of [
  "전치사구는 4단어로 만들 것",
  "원문의 앞 3단어를 그대로 살릴 것",
  "분사구는 4단어로 만들 것",
  "관계절을 3단어 분사구로 줄일 것",
]) {
  const md = GOOD.replace("- 분사구문으로 전환할 것", `- ${cond}`);
  check(
    `★W2-5 오반려 금지: 부분 범위 단어 수 조건 — ${cond}`,
    gateOf(md).length === 0,
    gateOf(md).join(" / "),
  );
}
for (const [name, cond, expectIssue] of [
  ["총 N단어(기존)", "총 14단어로 쓸 것", true],
  ["문장을 N단어로", "문장을 14단어로 쓸 것", true],
  ["전체 N단어", "전체 14단어로 쓸 것", true],
  ["모범답안을 N단어로(일치)", "모범답안을 22단어로 쓸 것", false],
  ["총 N개 단어(개 삽입)", "총 22개 단어로 쓸 것", false],
] as const) {
  const md = GOOD.replace("- 분사구문으로 전환할 것", `- ${cond}`);
  const issues = gateOf(md);
  check(
    `★W2-5 검출력 유지: ${name}`,
    expectIssue
      ? issues.some((i) => i.includes("단어를 요구"))
      : !issues.some((i) => i.includes("단어를 요구")),
    issues.join(" / "),
  );
}

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
