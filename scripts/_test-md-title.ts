// 제목 추론(TITLE) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → postProcessQuestion → 셔플 → 품질검증 왕복,
// 그리고 설정 5노브(선지수·정답수·정답극성·발문언어·선지언어) 집행까지.
// 실행: npx tsx scripts/_test-md-title.ts
//
// 형식 계약(§4-7 확정): 원문자 선지 N줄 + `정답:` + `해설:` + `오답:` 이 전부다.
// 선지 줄에는 정답 여부를 표시하지 않는다 — 정답의 유일 진실원은 `정답:` 줄이며
// (규범 §1-B 철칙 1), 줄마다 정답 칸을 받던 계약이 반의어 실사용 반려의 원인이었다.
import {
  autoSnapTitleOptions,
  gateMdTitle,
  parseMdTitle,
  titleMdLabel,
} from "../src/lib/md-qgen/parser-title";
import {
  adaptMdTitleToAiQuestion,
  buildTitleMdDirection,
  titleDigitLabel,
} from "../src/lib/md-qgen/adapter-title";
import { TITLE_MD_LANE } from "../src/lib/md-qgen/lane-title";
import {
  buildMdTitlePrompt,
  clampTitleMdAnswerCount,
  clampTitleMdOptionCount,
} from "../src/lib/md-qgen/prompts-title";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { shuffleQuestionOptionsForDiversity } from "../src/lib/question-diversity";
import { CREDIT_COSTS } from "../src/lib/credit-costs";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

const PASSAGE =
  "Cities across the world have raised tall barriers along their busiest roads to hold back the roar of traffic. " +
  "Residents behind those walls, however, often report that their streets have become harder to live with rather than easier. " +
  "Once the steady hum of distant traffic is stripped away, every slammed door and passing scooter stands out against the new quiet. " +
  "What makes a place feel noisy is therefore not the sheer volume of sound but the contrast between a sound and its background. " +
  "Engineers who chase ever lower decibel readings can end up building the very irritation they set out to remove.";

const GOOD = `① Why Silencing a City Can Make It Louder
② Sound Barriers: A Proven Cure for Traffic Noise
③ The Rising Toll of Traffic Noise on Health
④ Redesigning Streets Around Human Perception
⑤ Why People Complain More Than They Suffer
정답: ①
해설: 이 글은 방음벽으로 소음의 총량을 줄였는데도 주민들이 오히려 더 시끄럽다고 느낀 역설을 다룹니다. 시끄러움을 결정하는 것은 소리의 절대량이 아니라 배경과의 대비이므로 조용하게 만들려는 시도가 성가심을 키운다는 결론이 제목의 축입니다.
오답:
② 방향반대 — 핵심 소재인 방음벽을 표제로 앞세워 가장 제목다워 보이지만 필자가 말한 실패를 성공으로 뒤집었습니다.
③ 도입부함정 — 논지 전환 이전의 도입 서술에 시야가 갇힌 제목이라 이 글의 결론이 아닙니다.
④ 범위확대 — 지각이라는 재료는 지문에 있지만 도시 설계 전반의 처방까지는 지문이 말하지 않았습니다.
⑤ 근거없음 — 그럴듯한 통념이지만 지문에 이를 뒷받침하는 문장이 하나도 없습니다.`;

function gateOf(text: string, options?: Parameters<typeof gateMdTitle>[2]): string[] {
  const q = autoSnapTitleOptions(parseMdTitle(text)).question;
  return gateMdTitle(q, PASSAGE, { optionCount: 5, answerCount: 1, ...options });
}

function laneCtx(overrides?: Partial<MdLaneContext>): MdLaneContext {
  return {
    passage: PASSAGE,
    difficulty: "KILLER",
    rawDifficulty: "KILLER",
    resolved: { genericOptionCount: 5, genericAnswerCount: 1 },
    rawTypeSettings: null,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdTitle(GOOD);
check("파싱: 선지 5개", parsed.options.length === 5, `실제 ${parsed.options.length}`);
check(
  "파싱: 라벨 축 ①②③④⑤",
  parsed.options.map((o) => o.label).join("") === "①②③④⑤",
  parsed.options.map((o) => o.label).join(""),
);
check("파싱: 정답 ①", parsed.answers.join(",") === "①", parsed.answers.join(","));
check("파싱: 오답해설 4개", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check("파싱: 해설 존재", parsed.explanation.length > 30);
check(
  "파싱: 선지 본문에 라벨 잔재 없음",
  parsed.options.every((o) => !/^[①-⑧]/.test(o.text)),
  parsed.options[0]?.text,
);
check(
  "파싱: 선지 텍스트 축자 보존",
  parsed.options[0].text === "Why Silencing a City Can Make It Louder",
  parsed.options[0].text,
);
check("스냅: 정상 입력은 무보정", autoSnapTitleOptions(parsed).corrections.length === 0);
check("게이트: 정상 입력 클린", gateOf(GOOD).length === 0, gateOf(GOOD).join(" / "));
check("라벨 정규화: '(3)'·'3.'·'③' 전부 ③", titleMdLabel("(3)") === "③" && titleMdLabel("3.") === "③" && titleMdLabel("③") === "③");
check("라벨 정규화: 범위 밖은 빈 문자열", titleMdLabel("9") === "" && titleMdLabel("x") === "");

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 전종
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 선지 4개면 반려",
  gateOf(GOOD.replace("⑤ Why People Complain More Than They Suffer\n", "")).some((i) =>
    i.includes("선지 4개"),
  ),
);
check(
  "게이트: 라벨 축 어긋나면 반려",
  gateOf(GOOD.replace("④ Redesigning", "⑥ Redesigning")).some((i) => i.includes("선지 라벨")),
);
check(
  "게이트: 선지 텍스트 누락 반려",
  gateOf(GOOD.replace("③ The Rising Toll of Traffic Noise on Health", "③")).some((i) =>
    i.includes("③ 선지 텍스트 누락"),
  ),
);
check(
  "게이트: 선지 중복 반려(라벨 지목)",
  gateOf(
    GOOD.replace(
      "⑤ Why People Complain More Than They Suffer",
      "⑤ The Rising Toll of Traffic Noise on Health",
    ),
  ).some((i) => i.includes("선지 중복") && i.includes("③") && i.includes("⑤")),
);
check(
  "게이트: 제목이 아니라 문장 길이면 반려",
  gateOf(
    GOOD.replace(
      "④ Redesigning Streets Around Human Perception",
      `④ ${"Redesigning every street around human perception ".repeat(4)}`,
    ),
  ).some((i) => i.includes("제목이 아니라 문장 길이")),
);
check(
  "게이트: 영어 선지 설정인데 한국어가 섞이면 반려",
  gateOf(GOOD.replace("④ Redesigning Streets Around Human Perception", "④ 인간 지각 중심의 거리 재설계")).some(
    (i) => i.includes("한국어가 섞임"),
  ),
);
check(
  "게이트: 한국어 선지 설정인데 한국어가 없으면 반려(라벨 전수 지목)",
  gateOf(GOOD, { optionLanguage: "ko" }).filter((i) => i.includes("한국어가 없음")).length === 5,
);
check(
  "게이트: 선지 길이 불균형 반려",
  gateOf(
    GOOD.replace("⑤ Why People Complain More Than They Suffer", "⑤ Noise"),
  ).some((i) => i.includes("길이 불균형")),
);
check(
  "게이트: 정답 누락 반려",
  gateOf(GOOD.replace("정답: ①\n", "")).some((i) => i.includes("정답 누락")),
);
check(
  "게이트: 정답 라벨이 선지에 없으면 반려",
  gateOf(GOOD.replace("정답: ①", "정답: ⑦")).some((i) => i.includes("정답 라벨(⑦)")),
);
check(
  "게이트: 정답 개수 불일치 반려",
  gateOf(GOOD, { answerCount: 2 }).some((i) => i.includes("정답 1개 (2개 필요)")),
);
check(
  "게이트: 정답 선지가 지문 축자 복사면 반려",
  gateOf(
    GOOD.replace(
      "① Why Silencing a City Can Make It Louder",
      "① the contrast between a sound and its background",
    ),
  ).some((i) => i.includes("지문 축자 복사")),
);
check(
  "게이트: 해설 누락 반려",
  gateOf(GOOD.replace(/^해설:.*$/m, "")).some((i) => i.includes("해설 누락")),
);
check(
  "게이트: 오답해설 누락을 라벨로 지목",
  gateOf(GOOD.replace(/^④ 범위확대.*$/m, "")).some(
    (i) => i.includes("오답해설 누락") && i.includes("④"),
  ),
);
check(
  "게이트: 오답해설 라벨 중복 반려",
  gateOf(GOOD.replace("⑤ 근거없음 —", "④ 근거없음 —")).some((i) => i.includes("오답해설 라벨 중복")),
);
{
  const q = autoSnapTitleOptions(parseMdTitle(GOOD)).question;
  check(
    "게이트: 오답해설에 정답 라벨이 끼면 반려",
    gateMdTitle(
      { ...q, wrong: [...q.wrong, { label: "①", text: "정답인데 끼어듦" }] },
      PASSAGE,
      { optionCount: 5, answerCount: 1 },
    ).some((i) => i.includes("정답 라벨 포함")),
  );
  check(
    "게이트: 오답해설 본문이 비면 반려",
    gateMdTitle(
      { ...q, wrong: q.wrong.map((w, i) => (i === 0 ? { ...w, text: "" } : w)) },
      PASSAGE,
      { optionCount: 5, answerCount: 1 },
    ).some((i) => i.includes("빈 줄")),
  );
  check(
    "게이트: requireWrong=false 면 오답해설 미요구",
    gateMdTitle({ ...q, wrong: [] }, PASSAGE, {
      optionCount: 5,
      answerCount: 1,
      requireWrong: false,
    }).length === 0,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. 드리프트 관용 — 전부 선지 5개 + 게이트 클린이어야 한다(줄 유실 회귀 방지).
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string][] = [
  ["불릿 접두", "③ The Rising", "- ③ The Rising"],
  ["별표 불릿", "③ The Rising", "* ③ The Rising"],
  ["굵게 라벨", "④ Redesigning", "**④** Redesigning"],
  ["굵게 줄 전체", "⑤ Why People Complain More Than They Suffer", "**⑤ Why People Complain More Than They Suffer**"],
  ["표 형식 행", "⑤ Why People Complain More Than They Suffer", "| ⑤ | Why People Complain More Than They Suffer |"],
  ["잔여 파이프", "④ Redesigning Streets Around Human Perception", "④ | Redesigning Streets Around Human Perception"],
  ["라벨 점 표기(아라비아)", "③ The Rising", "3. The Rising"],
  ["라벨 괄호 표기(아라비아)", "③ The Rising", "(3) The Rising"],
  ["라벨 뒤 대시 구분자", "② Sound Barriers", "② — Sound Barriers"],
  ["라벨 뒤 마침표", "② Sound Barriers", "②. Sound Barriers"],
  ["오답 해설의 굵게 기제 이름", "② 방향반대 —", "② **방향반대** —"],
  ["전각 콜론(정답·해설·오답)", "정답: ①", "정답： ①"],
  ["정답 줄 부가 설명", "정답: ①", "정답: ① — ②가 가장 매력적인 오답이다"],
  ["정답 아라비아 표기", "정답: ①", "정답: 1"],
  ["정답 괄호 표기", "정답: ①", "정답: (1)"],
  // ↓ 웨이브2 silent-drop 회귀 — 키워드 줄 무관용으로 필드가 통째로 사라지던 계통.
  ["굵게 정답 헤더", "정답: ①", "**정답:** ①"],
  ["굵게 정답 헤더(콜론 밖)", "정답: ①", "**정답**: ①"],
  ["굵게 정답 라벨", "정답: ①", "정답: **①**"],
  ["굵게 해설 헤더", "해설: 이 글은", "**해설:** 이 글은"],
  ["굵게 오답 헤더", "\n오답:", "\n**오답:**"],
  ["헤딩 오답 헤더", "\n오답:", "\n### 오답:"],
  ["헤딩 정답 헤더", "정답: ①", "## 정답: ①"],
  ["인용 해설 헤더", "해설: 이 글은", "> 해설: 이 글은"],
  ["불릿 정답 헤더", "정답: ①", "- 정답: ①"],
  ["앞 공백 정답 헤더", "정답: ①", "  정답: ①"],
  ["전각 콜론 오답 헤더", "\n오답:", "\n오답："],
  ["헤딩 선지 줄", "③ The Rising", "### ③ The Rising"],
  ["인용 선지 줄", "③ The Rising", "> ③ The Rising"],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdTitle(drifted);
  const issues = gateOf(drifted);
  check(
    `줄 유실 방지: ${name}`,
    q.options.length === 5 && issues.length === 0,
    `선지 ${q.options.length}개 · ${issues.join(" / ")}`,
  );
}
{
  const bolded = GOOD.replace("② 방향반대 —", "② **방향반대** —");
  const wrongText = parseMdTitle(bolded).wrong.find((w) => w.label === "②")?.text ?? "";
  check(
    "드리프트: 굵게 마커가 저장 문자열에 잔재로 남지 않는다",
    wrongText.startsWith("방향반대") && !wrongText.includes("**"),
    wrongText.slice(0, 40),
  );
}
{
  const prose = GOOD.replace("① Why", "아래 다섯 개의 제목 후보를 제시한다.\n① Why");
  check(
    "과잉 관용 방지: 라벨 없는 산문 줄 무시",
    parseMdTitle(prose).options.length === 5,
    `실제 ${parseMdTitle(prose).options.length}개`,
  );
}
{
  const noiseAfter = `${GOOD}\n\n참고: 5 titles were considered before this set.`;
  check(
    "과잉 관용 방지: 오답 구역 밖 맨몸 숫자 줄을 선지로 줍지 않음",
    parseMdTitle(noiseAfter).options.length === 5 && gateOf(noiseAfter).length === 0,
    gateOf(noiseAfter).join(" / "),
  );
}
{
  const explanationNumbers = GOOD.replace(
    "해설: 이 글은",
    "해설: 2 단계로 읽어야 합니다. 이 글은",
  );
  check(
    "과잉 관용 방지: 해설 속 숫자를 선지로 오인하지 않음",
    parseMdTitle(explanationNumbers).options.length === 5,
    `실제 ${parseMdTitle(explanationNumbers).options.length}개`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. 스냅 보정
// ───────────────────────────────────────────────────────────────────────────
{
  const shuffledLines = GOOD.replace(
    "① Why Silencing a City Can Make It Louder\n② Sound Barriers: A Proven Cure for Traffic Noise",
    "② Sound Barriers: A Proven Cure for Traffic Noise\n① Why Silencing a City Can Make It Louder",
  );
  const snapped = autoSnapTitleOptions(parseMdTitle(shuffledLines));
  check(
    "스냅: 선지 제시 순서 뒤바뀜을 라벨 순으로 정렬",
    snapped.corrections.some((c) => c.includes("라벨 순으로 정렬")) &&
      snapped.question.options.map((o) => o.label).join("") === "①②③④⑤" &&
      snapped.question.options[0].text.startsWith("Why Silencing"),
    snapped.corrections.join(" / "),
  );
  check("스냅 후 게이트 클린", gateOf(shuffledLines).length === 0, gateOf(shuffledLines).join(" / "));
}
{
  const dupLabel = GOOD.replace("③ The Rising", "③ ③ The Rising");
  const snapped = autoSnapTitleOptions(parseMdTitle(dupLabel));
  check(
    "스냅: 선지 본문의 라벨 중복 표기 제거",
    snapped.corrections.some((c) => c.includes("라벨 중복")) &&
      snapped.question.options[2].text === "The Rising Toll of Traffic Noise on Health",
    snapped.question.options[2].text,
  );
}
{
  const collide = GOOD.replace("⑤ Why People", "③ Why People");
  const snapped = autoSnapTitleOptions(parseMdTitle(collide));
  check(
    "스냅 보수 가드: 라벨이 순열이 아니면 정렬하지 않는다",
    !snapped.corrections.some((c) => c.includes("정렬")),
    snapped.corrections.join(" / "),
  );
  check(
    "스냅 보수 가드 뒤 게이트가 원인을 지목",
    gateOf(collide).some((i) => i.includes("선지 라벨")),
    gateOf(collide).join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. 어댑터 → postProcessQuestion → 셔플 → 품질검증 왕복
// ───────────────────────────────────────────────────────────────────────────
const snappedGood = autoSnapTitleOptions(parseMdTitle(GOOD)).question;
{
  const adapt = adaptMdTitleToAiQuestion(snappedGood, PASSAGE, "KILLER");
  check("어댑터: 성공", adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  const options = ai.options as Array<Record<string, unknown>>;
  check(
    "어댑터: 선지 라벨 숫자 축 '1'~'5'",
    options.length === 5 && options[0].label === "1" && options[4].label === "5",
    options.map((o) => o.label).join(","),
  );
  check("어댑터: 선지 텍스트 보존", options[0].text === "Why Silencing a City Can Make It Louder");
  check("어댑터: correctAnswer '1'", ai.correctAnswer === "1", String(ai.correctAnswer));
  check("어댑터: 단일 정답이면 correctAnswers 미생성", !("correctAnswers" in ai));
  check(
    "어댑터: 발문 결정형(긍정·단일·한국어)",
    ai.direction === "다음 글의 제목으로 가장 적절한 것은?",
    String(ai.direction),
  );
  const wrong = ai.wrongOptionExplanations as Array<Record<string, unknown>>;
  check(
    "어댑터: 오답해설 4개 · 라벨 2~5",
    wrong.length === 4 && wrong.map((w) => w.label).join(",") === "2,3,4,5",
    wrong.map((w) => w.label).join(","),
  );
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check(
    "어댑터: 빈칸 계열 이물 필드 없음(type-foreign-field 회귀 방지)",
    !("blanks" in ai) &&
      !("passageWithBlank" in ai) &&
      !("originalExpression" in ai) &&
      !("blankAnswerMode" in ai),
  );
  check(
    "어댑터: 지문 필드를 만들지 않는다(PASSTHROUGH 계약)",
    !("passageWithMarkers" in ai) && !("passageWithNumbers" in ai) && !("passageWithUnderline" in ai),
  );

  const pp = postProcessQuestion("TITLE", PASSAGE, ai as never);
  check("후처리: 성공(PASSTHROUGH)", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  check(
    "후처리: 선지 무변경",
    JSON.stringify(data.options) === JSON.stringify(ai.options),
    JSON.stringify(data.options)?.slice(0, 60),
  );
  const record = data.wrongOptionExplanations as Record<string, string>;
  check(
    "후처리: wrongOptionExplanations 배열→Record 정규화",
    !Array.isArray(record) && Object.keys(record).sort().join(",") === "2,3,4,5",
    JSON.stringify(record).slice(0, 60),
  );

  const issues = validateQuestionQuality({
    typeId: "TITLE",
    question: { ...data, difficulty: "KILLER" },
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    ...TITLE_MD_LANE.qualityArgs(laneCtx()),
  });
  const errors = issues.filter((i) => i.severity === "error");
  check(
    "품질검증: error 0(기록 전용 레인이라 여기서 새면 그대로 출하된다)",
    errors.length === 0,
    errors.map((e) => `${e.code}: ${e.message}`).join(" / "),
  );

  // TITLE 은 SHUFFLE_OPTION_TYPES 멤버 — 라우트가 후처리 뒤 셔플한다.
  let shuffleOk = true;
  let shuffleDetail = "";
  for (let i = 0; i < 40; i += 1) {
    const shuffled = shuffleQuestionOptionsForDiversity({ ...data }, "TITLE") as Record<
      string,
      unknown
    >;
    const opts = shuffled.options as Array<Record<string, unknown>>;
    const answerLabel = String(shuffled.correctAnswer);
    const answerText = opts.find((o) => o.label === answerLabel)?.text;
    if (answerText !== "Why Silencing a City Can Make It Louder") {
      shuffleOk = false;
      shuffleDetail = `정답 이탈: ${answerLabel} → ${String(answerText)}`;
      break;
    }
    const explanations = shuffled.wrongOptionExplanations as Record<string, string>;
    const labels = Object.keys(explanations).sort().join(",");
    if (labels.includes(answerLabel) || Object.keys(explanations).length !== 4) {
      shuffleOk = false;
      shuffleDetail = `오답해설 축 이탈: ${labels} (정답 ${answerLabel})`;
      break;
    }
    const paired = opts.every((o) => {
      const label = String(o.label);
      if (label === answerLabel) return true;
      const text = String(o.text);
      const explanation = explanations[label] ?? "";
      // 기제 이름이 해설 첫머리에 있으므로 선지-해설 동행이 결정형으로 검증된다.
      if (text.startsWith("Sound Barriers")) return explanation.startsWith("방향반대");
      if (text.startsWith("The Rising Toll")) return explanation.startsWith("도입부함정");
      if (text.startsWith("Redesigning Streets")) return explanation.startsWith("범위확대");
      if (text.startsWith("Why People Complain")) return explanation.startsWith("근거없음");
      return false;
    });
    if (!paired) {
      shuffleOk = false;
      shuffleDetail = "선지-오답해설 동행 깨짐";
      break;
    }
  }
  check("셔플: 40회 반복에도 정답·오답해설 축 정합(R7 등가)", shuffleOk, shuffleDetail);
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 비표준 형상 — 선지 8개 · 정답 2개 · 부정 극성 · 한국어 선지
// ───────────────────────────────────────────────────────────────────────────
const GOOD_8_2 = `① Why Silencing a City Can Make It Louder
② Contrast, Not Volume, Decides What Feels Noisy
③ Sound Barriers: A Proven Cure for Traffic Noise
④ The Rising Toll of Traffic Noise on Health
⑤ Redesigning Streets Around Human Perception
⑥ Why People Complain More Than They Suffer
⑦ Cheaper Roads Through Smarter Traffic Planning
⑧ How Engineers Learned to Measure Decibels
정답: ①, ②
해설: 이 글은 소음의 총량을 줄이려는 시도가 오히려 성가심을 키운 역설을 다룹니다. 시끄러움을 결정하는 것은 절대량이 아니라 배경과의 대비라는 결론이 두 정답 제목의 공통 축입니다.
오답:
③ 방향반대 — 핵심 소재를 표제로 앞세웠지만 필자가 말한 실패를 성공으로 뒤집었습니다.
④ 도입부함정 — 논지 전환 이전의 도입 서술에 갇힌 제목이라 결론이 아닙니다.
⑤ 범위확대 — 지각이라는 재료는 있으나 도시 설계 전반의 처방은 지문 밖입니다.
⑥ 근거없음 — 그럴듯한 통념이지만 지문에 뒷받침 문장이 없습니다.
⑦ 범위확대 — 비용 절감은 지문이 다루지 않은 다른 축의 주장입니다.
⑧ 도입부함정 — 측정이라는 소재만 빌렸을 뿐 글의 판단이 빠졌습니다.`;
{
  const q = autoSnapTitleOptions(parseMdTitle(GOOD_8_2)).question;
  check("8·2: 선지 8개 파싱", q.options.length === 8, `실제 ${q.options.length}`);
  check("8·2: 정답 2개 파싱", q.answers.join(",") === "①,②", q.answers.join(","));
  check(
    "8·2: 정답 줄 구분자 드리프트(과/및/원문자 인접) 흡수",
    ["정답: ①과 ②", "정답: ① 및 ②", "정답: ①②", "정답: 1, 2"].every(
      (line) => parseMdTitle(GOOD_8_2.replace("정답: ①, ②", line)).answers.join(",") === "①,②",
    ),
  );
  check(
    "8·2: 정답 줄 뒤 산문은 정답으로 줍지 않는다",
    parseMdTitle(GOOD_8_2.replace("정답: ①, ②", "정답: ① 과연 ②는 매력적이다")).answers.join(",") ===
      "①",
    parseMdTitle(GOOD_8_2.replace("정답: ①, ②", "정답: ① 과연 ②는 매력적이다")).answers.join(","),
  );
  const issues = gateMdTitle(q, PASSAGE, { optionCount: 8, answerCount: 2 });
  check("8·2: 게이트 클린", issues.length === 0, issues.join(" / "));
  const adapt = adaptMdTitleToAiQuestion(q, PASSAGE, "INTERMEDIATE");
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  check("8·2: 어댑터 성공", adapt.ok === true, adapt.error);
  check("8·2: correctAnswer '1, 2'", ai.correctAnswer === "1, 2", String(ai.correctAnswer));
  check(
    "8·2: correctAnswers 배열",
    JSON.stringify(ai.correctAnswers) === JSON.stringify(["1", "2"]),
    JSON.stringify(ai.correctAnswers),
  );
  check(
    "8·2: 복수정답 발문에 '모두'(generic-multi-answer-direction 계약)",
    String(ai.direction).includes("모두"),
    String(ai.direction),
  );
  check(
    "8·2: 오답해설 6개 · 라벨 3~8",
    (ai.wrongOptionExplanations as Array<Record<string, unknown>>)
      .map((w) => w.label)
      .join(",") === "3,4,5,6,7,8",
  );
  const pp = postProcessQuestion("TITLE", PASSAGE, ai as never);
  const ctx8 = laneCtx({ resolved: { genericOptionCount: 8, genericAnswerCount: 2 } });
  const errors = validateQuestionQuality({
    typeId: "TITLE",
    question: { ...(pp.data as Record<string, unknown>), difficulty: "INTERMEDIATE" },
    passage: PASSAGE,
    requestedDifficulty: "INTERMEDIATE",
    ...TITLE_MD_LANE.qualityArgs(ctx8),
  }).filter((i) => i.severity === "error");
  check(
    "8·2: 품질검증 error 0(option-count·generic-answer-count 동시 통과)",
    errors.length === 0,
    errors.map((e) => e.code).join(" / "),
  );
}
{
  const adapt = adaptMdTitleToAiQuestion(snappedGood, PASSAGE, "KILLER", { negative: true });
  const direction = String((adapt.aiQuestion ?? {}).direction);
  check(
    "부정 극성: 발문이 '적절하지 않은'(gist-polarity 계약)",
    direction === "다음 글의 제목으로 가장 적절하지 않은 것은?",
    direction,
  );
  const errors = validateQuestionQuality({
    typeId: "TITLE",
    question: {
      ...(postProcessQuestion("TITLE", PASSAGE, adapt.aiQuestion as never).data as Record<
        string,
        unknown
      >),
      difficulty: "KILLER",
    },
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    ...TITLE_MD_LANE.qualityArgs(
      laneCtx({ resolved: { genericOptionCount: 5, genericAnswerCount: 1, answerPolarity: "NEGATIVE" } }),
    ),
  }).filter((i) => i.severity === "error");
  check("부정 극성: 품질검증 error 0", errors.length === 0, errors.map((e) => e.code).join(" / "));
}
check(
  "발문 8종: 긍정·부정 × 단일·복수 × 한국어·영어",
  buildTitleMdDirection() === "다음 글의 제목으로 가장 적절한 것은?" &&
    buildTitleMdDirection({ negative: true }).includes("적절하지 않은") &&
    buildTitleMdDirection({ multi: true }).includes("모두") &&
    buildTitleMdDirection({ negative: true, multi: true }).includes("적절하지 않은") &&
    buildTitleMdDirection({ language: "en" }).startsWith("Which of the following is the most") &&
    /\bNOT\b/.test(buildTitleMdDirection({ negative: true, language: "en" })) &&
    buildTitleMdDirection({ multi: true, language: "en" }).startsWith("Choose all") &&
    /\bNOT\b/.test(buildTitleMdDirection({ negative: true, multi: true, language: "en" })),
);
check(
  "발문: 빈칸·순서 어휘 미포함(title-direction-foreign 회귀 방지)",
  [
    buildTitleMdDirection(),
    buildTitleMdDirection({ negative: true }),
    buildTitleMdDirection({ multi: true }),
    buildTitleMdDirection({ negative: true, multi: true }),
  ].every((d) => !/빈칸|들어갈 말|들어가기에|순서로|배열|들어갈 곳/.test(d)),
);
{
  const KO = `① 조용하게 만들수록 더 시끄러워지는 이유
② 방음벽은 교통 소음의 검증된 해법이다
③ 도시 소음이 건강에 남기는 커지는 대가
④ 인간의 지각을 중심에 둔 거리 재설계
⑤ 사람들은 겪는 것보다 더 많이 불평한다
정답: ①
해설: 이 글은 소음의 총량을 줄였는데도 더 시끄럽게 느껴진 역설을 다룹니다. 시끄러움을 결정하는 것은 절대량이 아니라 배경과의 대비라는 결론이 제목의 축입니다.
오답:
② 방향반대 — 필자가 말한 실패를 성공으로 뒤집었습니다.
③ 도입부함정 — 논지 전환 이전의 도입 서술에 갇힌 제목입니다.
④ 범위확대 — 도시 설계 전반의 처방은 지문이 말하지 않았습니다.
⑤ 근거없음 — 지문에 뒷받침 문장이 하나도 없습니다.`;
  const q = autoSnapTitleOptions(parseMdTitle(KO)).question;
  check(
    "한국어 선지: 게이트 클린",
    gateMdTitle(q, PASSAGE, { optionCount: 5, answerCount: 1, optionLanguage: "ko" }).length === 0,
    gateMdTitle(q, PASSAGE, { optionCount: 5, answerCount: 1, optionLanguage: "ko" }).join(" / "),
  );
  check(
    "한국어 선지: 영어 설정이면 반려(설정 집행 확인)",
    gateMdTitle(q, PASSAGE, { optionCount: 5, answerCount: 1, optionLanguage: "en" }).length > 0,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 레인 계약 — 과금·적격성·난이도 3분기·설정 집행
// ───────────────────────────────────────────────────────────────────────────
check("레인: subType TITLE", TITLE_MD_LANE.subType === "TITLE");
check(
  "레인: 과금 QUESTION_GEN_SINGLE(2크레딧) — fast VOCAB_TYPES 밖",
  TITLE_MD_LANE.operationType === "QUESTION_GEN_SINGLE" && CREDIT_COSTS.QUESTION_GEN_SINGLE === 2,
  `${TITLE_MD_LANE.operationType} / ${CREDIT_COSTS.QUESTION_GEN_SINGLE}`,
);
check("레인: retryEligible", TITLE_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 4~8 · 정답수 1~N-1 · 범위 밖 거부",
  TITLE_MD_LANE.isEligible({ genericOptionCount: 4, genericAnswerCount: 1 }) &&
    TITLE_MD_LANE.isEligible({ genericOptionCount: 8, genericAnswerCount: 7 }) &&
    TITLE_MD_LANE.isEligible({}) &&
    !TITLE_MD_LANE.isEligible({ genericOptionCount: 3, genericAnswerCount: 1 }) &&
    !TITLE_MD_LANE.isEligible({ genericOptionCount: 9, genericAnswerCount: 1 }) &&
    !TITLE_MD_LANE.isEligible({ genericOptionCount: 5, genericAnswerCount: 5 }) &&
    !TITLE_MD_LANE.isEligible({ genericOptionCount: 5, genericAnswerCount: 0 }),
);
check("레인: buildExtras 는 비어 있다(설정은 베이스·게이트·어댑터가 집행)", TITLE_MD_LANE.buildExtras(laneCtx()).length === 0);
check(
  "레인: parseAndGate 정상 경로 클린",
  TITLE_MD_LANE.parseAndGate(GOOD, laneCtx()).gateIssues.length === 0,
  TITLE_MD_LANE.parseAndGate(GOOD, laneCtx()).gateIssues.join(" / "),
);
check(
  "레인: parseAndGate 가 설정 실값으로 반려(선지 5개인데 8개 설정)",
  TITLE_MD_LANE.parseAndGate(
    GOOD,
    laneCtx({ resolved: { genericOptionCount: 8, genericAnswerCount: 1 } }),
  ).gateIssues.some((i) => i.includes("8개 필요")),
);
check(
  "레인: adapt 가 부정 극성 발문을 싣는다",
  String(
    (
      TITLE_MD_LANE.adapt(
        TITLE_MD_LANE.parseAndGate(
          GOOD,
          laneCtx({ resolved: { genericOptionCount: 5, genericAnswerCount: 1, answerPolarity: "NEGATIVE" } }),
        ),
        laneCtx({ resolved: { genericOptionCount: 5, genericAnswerCount: 1, answerPolarity: "NEGATIVE" } }),
      ).aiQuestion ?? {}
    ).direction,
  ).includes("적절하지 않은"),
);
check(
  "레인: adapt 가 발문 언어 설정(stemLanguage=en)을 집행",
  String(
    (
      TITLE_MD_LANE.adapt(
        TITLE_MD_LANE.parseAndGate(GOOD, laneCtx({ rawTypeSettings: { TITLE: { stemLanguage: "en" } } })),
        laneCtx({ rawTypeSettings: { TITLE: { stemLanguage: "en" } } }),
      ).aiQuestion ?? {}
    ).direction,
  ).startsWith("Which of the following"),
);
check(
  "레인: qualityArgs 가 설정 실값을 넘긴다",
  JSON.stringify(
    TITLE_MD_LANE.qualityArgs(
      laneCtx({ resolved: { genericOptionCount: 6, genericAnswerCount: 2, answerPolarity: "NEGATIVE" } }),
    ),
  ) ===
    JSON.stringify({
      genericOptionCount: 6,
      genericAnswerCount: 2,
      answerPolarity: "NEGATIVE",
      stemLanguage: "ko",
      optionLanguage: "en",
    }),
  JSON.stringify(TITLE_MD_LANE.qualityArgs(laneCtx({ resolved: { genericOptionCount: 6, genericAnswerCount: 2, answerPolarity: "NEGATIVE" } }))),
);
check(
  "레인: qualityArgs 기본 경로는 answerPolarity 키를 싣지 않는다",
  !("answerPolarity" in TITLE_MD_LANE.qualityArgs(laneCtx())),
);
check(
  "레인: mdFormat 포렌식 메타",
  JSON.stringify(TITLE_MD_LANE.mdFormat(laneCtx())) ===
    JSON.stringify({
      optionCount: 5,
      answerCount: 1,
      answerPolarity: "POSITIVE",
      optionLanguage: "en",
    }),
  JSON.stringify(TITLE_MD_LANE.mdFormat(laneCtx())),
);
check(
  "레인: diversityTargets = 정답 선지 텍스트",
  TITLE_MD_LANE.diversityTargets({
    options: [
      { label: "1", text: "Why Silencing a City Can Make It Louder" },
      { label: "2", text: "Sound Barriers" },
    ],
    correctAnswer: "1",
  }).join("|") === "Why Silencing a City Can Make It Louder",
);
check(
  "레인: diversityTargets 복수정답",
  TITLE_MD_LANE.diversityTargets({
    options: [
      { label: "1", text: "A" },
      { label: "2", text: "B" },
      { label: "3", text: "C" },
    ],
    correctAnswers: ["1", "3"],
  }).join("|") === "A|C",
);
check(
  "레인: diversityTargets 정답 미해석이면 빈 배열(오답 유출 방지)",
  TITLE_MD_LANE.diversityTargets({ options: [{ label: "1", text: "A" }] }).length === 0,
);
check("라벨 변환: ①→'1' · ⑧→'8'", titleDigitLabel("①") === "1" && titleDigitLabel("⑧") === "8");

// ── 프롬프트 계약 ──────────────────────────────────────────────────────────
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdTitlePrompt(PASSAGE, "full", d, { optionCount: 7, answerCount: 1 });
  check(
    `프롬프트 ${d}: 난이도 분기 + 7선지 스캐폴드 + 지문 포함`,
    p.includes("⑦") &&
      p.includes("## 지문") &&
      p.includes(PASSAGE.slice(0, 40)) &&
      p.includes(d === "KILLER" ? "KILLER 의 생명" : d === "BASIC" ? "기본 난이도" : "중급 난이도"),
  );
}
check(
  "프롬프트: 선지 줄에 정답 표시 칸을 요구하지 않는다(철칙 1 — 단순화 계약)",
  !buildMdTitlePrompt(PASSAGE).includes("O 또는 X") &&
    buildMdTitlePrompt(PASSAGE).includes("어느 선지가 정답인지는 줄에 표시하지 말고"),
);
check(
  "프롬프트: 오답 기제 분류학 4종(방향반대·도입부함정·범위확대·근거없음)",
  ["방향반대", "도입부함정", "범위확대", "근거없음"].every((k) =>
    buildMdTitlePrompt(PASSAGE).includes(k),
  ),
);
check(
  "프롬프트: BASIC 은 few-shot 생략 · KILLER 는 few-shot 포함",
  !buildMdTitlePrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") &&
    buildMdTitlePrompt(PASSAGE, "full", "KILLER").includes("모범 설계 해부"),
);
check(
  "프롬프트: answer-only 모드는 오답 섹션을 요구하지 않는다",
  !buildMdTitlePrompt(PASSAGE, "answer-only").includes("\n오답:") &&
    buildMdTitlePrompt(PASSAGE, "full").includes("\n오답:"),
);
check(
  "프롬프트: 선지 언어 설정 집행(en/ko 분기)",
  buildMdTitlePrompt(PASSAGE, "full", "KILLER", { optionLanguage: "en" }).includes("영어 제목") &&
    buildMdTitlePrompt(PASSAGE, "full", "KILLER", { optionLanguage: "ko" }).includes("한국어 제목"),
);
check(
  "프롬프트: 부정 극성이면 극성 전용 절이 정답·오답 지시를 덮어쓴다",
  buildMdTitlePrompt(PASSAGE, "full", "KILLER", { answerPolarity: "NEGATIVE" }).includes(
    "정답 극성 — '제목으로 적절하지 않은 것' 고르기",
  ) &&
    !buildMdTitlePrompt(PASSAGE, "full", "KILLER", { answerPolarity: "NEGATIVE" }).includes(
      "기제 분류학",
    ),
);
check(
  "프롬프트: 복수정답이면 정답 병기 예시가 ① 앵커를 피한다",
  buildMdTitlePrompt(PASSAGE, "full", "KILLER", { optionCount: 5, answerCount: 2 }).includes("②, ④"),
);
check(
  "프롬프트: 선지수 클램프(3→4, 99→8)",
  buildMdTitlePrompt(PASSAGE, "full", "KILLER", { optionCount: 3 }).includes("④ ...") &&
    !buildMdTitlePrompt(PASSAGE, "full", "KILLER", { optionCount: 3 }).includes("⑤ ...") &&
    buildMdTitlePrompt(PASSAGE, "full", "KILLER", { optionCount: 99 }).includes("⑧ ..."),
);
check(
  "클램프 함수: optionCount 4~8 · answerCount 1~N-1",
  clampTitleMdOptionCount(3) === 4 &&
    clampTitleMdOptionCount(99) === 8 &&
    clampTitleMdOptionCount("x") === 5 &&
    clampTitleMdAnswerCount(9, 5) === 4 &&
    clampTitleMdAnswerCount(0, 5) === 1 &&
    clampTitleMdAnswerCount("x", 5) === 1,
);

// ───────────────────────────────────────────────────────────────────────────
// 8. 웨이브2 적대검수 지적 회귀 픽스처 (critical/major 4건 고정)
// ───────────────────────────────────────────────────────────────────────────

// 8-A. silent-drop — 키워드 줄(정답·해설·오답) 무관용으로 필드가 통째로 사라지던 계통.
//      단건 드리프트는 위 DRIFTS 표가 덮고, 여기서는 복합 사고와 2차 피해를 고정한다.
{
  const allBold = GOOD.replace("정답: ①", "**정답:** ①")
    .replace("해설: 이 글은", "**해설:** 이 글은")
    .replace("\n오답:", "\n**오답:**");
  const q = autoSnapTitleOptions(parseMdTitle(allBold)).question;
  check(
    "회귀(silent-drop): 세 헤더를 동시에 굵게 써도 구역 분할이 살아 있다(종전 '선지 9개')",
    q.options.length === 5 &&
      q.answers.join(",") === "①" &&
      q.wrong.length === 4 &&
      q.explanation.length > 30,
    `선지 ${q.options.length} · 정답 [${q.answers.join(",")}] · 오답 ${q.wrong.length} · 해설 ${q.explanation.length}자`,
  );
  check("회귀(silent-drop): 세 헤더 굵게도 게이트 클린", gateOf(allBold).length === 0, gateOf(allBold).join(" / "));
}
{
  const boldWrongHead = GOOD.replace("\n오답:", "\n**오답:**");
  const explanation = parseMdTitle(boldWrongHead).explanation;
  check(
    "회귀(silent-drop): 오답 헤더가 굵어도 해설이 오답 블록을 삼키지 않는다",
    !explanation.includes("방향반대") && !explanation.includes("오답"),
    `…${explanation.slice(-50)}`,
  );
}
{
  const boldBody = GOOD.replace("해설: 이 글은", "**해설:** **이 글은").replace(
    "결론이 제목의 축입니다.",
    "결론이 제목의 축입니다.**",
  );
  const explanation = parseMdTitle(boldBody).explanation;
  check(
    "회귀(silent-drop): 해설 본문의 굵게 잔재가 저장 문자열에 남지 않는다",
    explanation.startsWith("이 글은") && !explanation.includes("**") && explanation.endsWith("축입니다."),
    `${explanation.slice(0, 20)} … ${explanation.slice(-20)}`,
  );
}
check(
  "회귀(silent-drop): 정답 줄 라벨이 각각 굵어도 병기 정답이 유실되지 않는다",
  parseMdTitle(GOOD_8_2.replace("정답: ①, ②", "**정답:** **①**, **②**")).answers.join(",") === "①,②",
  parseMdTitle(GOOD_8_2.replace("정답: ①, ②", "**정답:** **①**, **②**")).answers.join(","),
);
{
  const noAnswer = GOOD.replace("정답: ①\n", "");
  const issues = gateOf(noAnswer);
  check(
    "회귀(silent-drop): 정답을 못 읽으면 '오답해설 누락: ①' 같은 거짓 사유를 만들지 않는다",
    issues.some((i) => i.includes("정답 누락")) && !issues.some((i) => i.includes("오답해설 누락")),
    issues.join(" / "),
  );
}

// 8-B. correctness — 자기라벨 스냅이 정상 제목의 첫 토큰을 삼키던 계통.
{
  const numeric5 = GOOD.replace(
    "⑤ Why People Complain More Than They Suffer",
    "⑤ 5 Ways Cities Get Quiet Wrong",
  );
  const snapped = autoSnapTitleOptions(parseMdTitle(numeric5));
  check(
    "회귀(correctness): 자기 번호와 같은 숫자로 시작하는 정상 제목을 삼키지 않는다",
    snapped.question.options[4].text === "5 Ways Cities Get Quiet Wrong" &&
      snapped.corrections.length === 0,
    `'${snapped.question.options[4].text}' / ${snapped.corrections.join(" / ")}`,
  );
  const numeric3 = GOOD.replace(
    "③ The Rising Toll of Traffic Noise on Health",
    "③ 3 Lessons From Noisy Streets",
  );
  const snapped3 = autoSnapTitleOptions(parseMdTitle(numeric3));
  check(
    "회귀(correctness): ③ 3 Lessons … 도 보존(스냅 무발화)",
    snapped3.question.options[2].text === "3 Lessons From Noisy Streets" &&
      snapped3.corrections.length === 0,
    `'${snapped3.question.options[2].text}' / ${snapped3.corrections.join(" / ")}`,
  );
}
for (const [name, to, removed] of [
  ["원문자 중복", "⑤ ⑤ Why People Complain More Than They Suffer", "⑤"],
  ["점 표기 중복", "⑤ 5. Why People Complain More Than They Suffer", "5."],
  ["괄호 표기 중복", "⑤ (5) Why People Complain More Than They Suffer", "(5)"],
] as const) {
  const snapped = autoSnapTitleOptions(
    parseMdTitle(GOOD.replace("⑤ Why People Complain More Than They Suffer", to)),
  );
  check(
    `회귀(correctness): 구분자 있는 라벨 중복은 계속 제거 + 제거 문자열 인용 — ${name}`,
    snapped.question.options[4].text === "Why People Complain More Than They Suffer" &&
      snapped.corrections.some((c) => c.includes("라벨 중복") && c.includes(`'${removed}'`)),
    `'${snapped.question.options[4].text}' / ${snapped.corrections.join(" / ")}`,
  );
}

// 8-C. gate-gap — 한국어 해설 산문 오염(비한글 CJK · 영단어+종결어미 짜깁기).
//      fast 는 error 로 차단하지만 md 는 qualityIssues 를 기록만 하므로 0원 게이트가 정본이다.
const CJK_DECIDE = "决"; // 决 — 중문 간체
const KANA_KARA = "から"; // から — 구형 flash TITLE 실적발 패턴
const HANJA_GONG = "功"; // 功 — 한글 직후 괄호 병기(정당한 표기 관례)
{
  const issues = gateOf(
    GOOD.replace("대비이므로", `대비가 시끄러움을 ${CJK_DECIDE}定한다는 결론이므로`),
  );
  check(
    "회귀(gate-gap): 해설의 비한글 CJK 혼입을 문자까지 지목해 반려",
    issues.some((i) => i.startsWith("해설에") && i.includes("외국 문자") && i.includes(CJK_DECIDE)),
    issues.join(" / "),
  );
}
{
  const issues = gateOf(
    GOOD.replace(
      "③ 도입부함정 — 논지 전환 이전의 도입 서술에 시야가 갇힌 제목이라 이 글의 결론이 아닙니다.",
      `③ 도입부함정 — 핵심 논지${KANA_KARA} 벗어난 도입 서술이라 결론이 아닙니다.`,
    ),
  );
  check(
    "회귀(gate-gap): 오답해설의 가나 혼입을 라벨과 함께 반려",
    issues.some((i) => i.startsWith("③ 오답해설") && i.includes("외국 문자")),
    issues.join(" / "),
  );
}
{
  const issues = gateOf(
    GOOD.replace(
      "필자가 말한 실패를 성공으로 뒤집었습니다.",
      "필자의 판단을 뒤집어 방음벽이 성공했다고 steals다.",
    ),
  );
  check(
    "회귀(gate-gap): 오답해설의 영단어+종결어미 짜깁기를 라벨과 함께 반려",
    issues.some((i) => i.startsWith("② 오답해설") && i.includes("steals다")),
    issues.join(" / "),
  );
}
{
  // ⚠ NFC 함정 회귀 — 소스에 CJK 문자를 직접 쓰면 호환한자 U+F900 이 U+8C48 로 접혀
  //   `F900-FAFF` 범위가 `8C48-FAFF` 로 벌어지고 한글 음절(AC00-D7A3)이 통째로
  //   클래스에 들어온다. 이 구현 중 실제로 재현됐고, 그때 정상 해설이 전건 반려됐다.
  const koSweep = GOOD.replace(
    "해설: 이 글은",
    `해설: 가힣뷁쀍 같은 한글 음절과 공(${HANJA_GONG})이 큰 병기, system이다 같은 표기는 전부 정상입니다. 이 글은`,
  );
  const issues = gateOf(koSweep);
  check(
    "회귀(FP 방지): 한글 전 범위·한자 병기·'system이다' 를 오염으로 오인하지 않는다",
    issues.length === 0,
    issues.join(" / "),
  );
}

// 8-D. prompt-quality — NEGATIVE 극성에서 난이도 3분기가 증발하고 POSITIVE 지시와 충돌하던 계통.
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdTitlePrompt(PASSAGE, "full", d, { answerPolarity: "NEGATIVE" });
  check(
    `회귀(prompt-quality): NEGATIVE ${d} 도 난이도 3분기를 유지한다`,
    p.includes(d === "KILLER" ? "KILLER 의 생명" : d === "BASIC" ? "기본 난이도" : "중급 난이도"),
  );
}
{
  const neg = buildMdTitlePrompt(PASSAGE, "full", "KILLER", { answerPolarity: "NEGATIVE" });
  const pos = buildMdTitlePrompt(PASSAGE, "full", "KILLER");
  check(
    "회귀(prompt-quality): NEGATIVE 에도 소재 구속·층위 일치가 실린다(종전 전면 부재)",
    neg.includes("소재 구속") && neg.includes("층위 일치"),
  );
  check(
    "회귀(prompt-quality): NEGATIVE 마감 절이 '끝까지 저울질' 을 요구하지 않는다(복수정답 유발)",
    !neg.includes("끝까지 저울질") &&
      pos.includes("끝까지 저울질") &&
      neg.includes("어느 하나도 '부적절'로 오인될 여지가 없어야"),
  );
  check(
    "회귀(prompt-quality): NEGATIVE few-shot 은 부정 극성 해부본(POSITIVE 오답 기제 해부 미탑재)",
    neg.includes("정답(= 제목으로 적절하지 않은 것)") &&
      !neg.includes("오답 해부(기제 각 1개") &&
      pos.includes("오답 해부(기제 각 1개"),
  );
  check(
    "회귀(prompt-quality): NEGATIVE BASIC 은 few-shot 생략(POSITIVE 와 동일 규칙)",
    !buildMdTitlePrompt(PASSAGE, "full", "BASIC", { answerPolarity: "NEGATIVE" }).includes(
      "모범 설계 해부",
    ),
  );
  check(
    "회귀(prompt-quality): NEGATIVE 자기검산이 정답(부적절)을 '결론 압축'으로 검산하지 않는다",
    neg.includes("정답(부적절) 선지만 그렇게 풀어 쓸 수 없어야 한다"),
  );
}
check(
  "회귀(gate-gap): 프롬프트 자기검산이 게이트와 같은 금지(한자·가나·영단어+다)를 명시",
  buildMdTitlePrompt(PASSAGE).includes("steals다") &&
    buildMdTitlePrompt(PASSAGE, "full", "KILLER", { answerPolarity: "NEGATIVE" }).includes("steals다"),
);

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
