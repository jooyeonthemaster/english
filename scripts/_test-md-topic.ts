// 주제 추론(TOPIC) md 레인 0원 결정론 픽스처 테스트. 실행: npx tsx scripts/_test-md-topic.ts
// 파싱 → 스냅 → 게이트 전종 → 어댑터 → postProcessQuestion(PASSTHROUGH) → 셔플 →
// 품질 검증기 → 레인 계약(과금·적격성·설정 집행·발문 결정론·난이도 3분기·다양성).
//
// 이 유형은 지문을 변형하지 않으므로 "지문 재구성" 게이트가 없다. 대신 형식이 얇아
// 실패가 전부 **선지 집합의 형상**에서 나온다 — 개수·라벨 축·중복·정답 축·오답해설·
// 언어 축·길이 평행·지문 축자 복사. 아래 픽스처는 그 전종을 한 번씩 밟는다.
import {
  autoSnapTopicOptions,
  parseMdTopic,
  stripTopicDecoration,
  topicLabel,
  topicLengthUnits,
} from "../src/lib/md-qgen/parser-topic";
import { gateMdTopic } from "../src/lib/md-qgen/gate-topic";
import { adaptMdTopicToAiQuestion, topicDigitLabel } from "../src/lib/md-qgen/adapter-topic";
import { TOPIC_MD_LANE, buildTopicDirection } from "../src/lib/md-qgen/lane-topic";
import {
  buildMdTopicPrompt,
  clampTopicMdAnswerCount,
  clampTopicMdOptionCount,
} from "../src/lib/md-qgen/prompts-topic";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { shuffleQuestionOptionsForDiversity } from "../src/lib/question-diversity";
import { CREDIT_COSTS } from "../src/lib/credit-costs";
import { runTopicWave2Regressions } from "./_test-md-topic-wave2";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

// ───────────────────────────────────────────────────────────────────────────
// 픽스처 — 도입부 통념(강한 수종) → However 전환 → 수관 연속성이 진짜 변수.
// 오답 넷이 기제 4종을 하나씩 밟도록 짰다(도입부·범위이탈·관점반전·관점소거).
// ───────────────────────────────────────────────────────────────────────────
const PASSAGE =
  "City planners once assumed that the coolest streets were simply the ones with the toughest trees. " +
  "Newer measurements tell a different story. " +
  "A single heat-resistant specimen surrounded by open pavement barely lowers the air around it. " +
  "When canopies overlap, however, the shade becomes continuous and the street holds its cooler air through the afternoon. " +
  "Planting fewer species in an unbroken line therefore outperforms scattering a catalogue of hardy varieties. " +
  "What matters for cooling is not the pedigree of each tree but the continuity of the cover they form together.";

const OPTION_TEXTS = [
  "the rising popularity of heat-resistant trees in modern cities",
  "why continuous tree cover outweighs species choice in cooling streets",
  "how urban trees can fully replace mechanical cooling systems",
  "the limited effect of shade on afternoon street temperatures",
  "the growing variety of trees planted along city streets",
];

const GOOD = `① ${OPTION_TEXTS[0]}
② ${OPTION_TEXTS[1]}
③ ${OPTION_TEXTS[2]}
④ ${OPTION_TEXTS[3]}
⑤ ${OPTION_TEXTS[4]}
정답: ②
해설: 이 글은 강한 수종을 고르면 된다는 통념을 뒤집어, 거리의 기온을 낮추는 것은 나무 하나의 강인함이 아니라 수관이 이어져 만들어지는 그늘의 연속성임을 논증합니다. 따라서 중심 화제와 필자의 판단을 함께 담은 진술이 주제로 가장 적절합니다.
오답:
① 도입부 소재 함정으로, 논지가 꺾이기 전의 통념일 뿐 필자가 반박하려고 꺼낸 배경입니다.
③ 범위 이탈로, 지문이 말하지 않은 해결책까지 논의를 넓힌 진술입니다.
④ 관점 반전으로, 핵심어를 그대로 쓰면서 필자의 평가 방향만 뒤집은 진술입니다.
⑤ 관점 소거로, 중심 화제는 맞지만 필자의 판단이 빠져 소재에 머무릅니다.`;

const BASE_GATE = { optionCount: 5, answerCount: 1, optionLanguage: "en" as const };

function gateOf(text: string, over: Partial<typeof BASE_GATE> = {}): string[] {
  const q = autoSnapTopicOptions(parseMdTopic(text)).question;
  return gateMdTopic(q, PASSAGE, { ...BASE_GATE, ...over });
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdTopic(GOOD);
check("파싱: 선지 5개", parsed.options.length === 5, `실제 ${parsed.options.length}`);
check(
  "파싱: 선지 라벨 ①~⑤ · 본문 축자",
  parsed.options.map((o) => o.label).join("") === "①②③④⑤" &&
    parsed.options[1].text === OPTION_TEXTS[1],
  parsed.options.map((o) => o.label).join(""),
);
check("파싱: 정답 ②(단일)", parsed.answer === "②" && parsed.answers.length === 1, parsed.answer);
check("파싱: 오답해설 4개", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check(
  "파싱: 오답 라벨이 정답을 제외한 넷",
  parsed.wrong.map((w) => w.label).join("") === "①③④⑤",
  parsed.wrong.map((w) => w.label).join(""),
);
check("파싱: 해설 존재", parsed.explanation.length > 30);
check("파싱: 해설에 '오답:' 이후 내용이 섞이지 않음", !parsed.explanation.includes("도입부 소재 함정"));

const snapped = autoSnapTopicOptions(parsed);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
check(
  "게이트: 정상 입력 클린",
  gateMdTopic(snapped.question, PASSAGE, BASE_GATE).length === 0,
  gateMdTopic(snapped.question, PASSAGE, BASE_GATE).join(" / "),
);

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 전종 — 메시지가 '자리를 지목'하는지까지 본다(철칙 5).
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트 개수: 선지 4개면 즉시 반려 + 읽힌 라벨 노출",
  (() => {
    const issues = gateOf(GOOD.replace(`⑤ ${OPTION_TEXTS[4]}\n`, ""));
    return issues.length === 1 && issues[0].includes("선지 4개") && issues[0].includes("①②③④");
  })(),
  gateOf(GOOD.replace(`⑤ ${OPTION_TEXTS[4]}\n`, "")).join(" / "),
);
check(
  "게이트 라벨: 라벨 중복 반려",
  gateOf(GOOD.replace("④ the limited", "③ the limited")).some((i) => i.includes("선지 라벨 중복: ③")),
);
check(
  "게이트 라벨: 라벨 건너뜀 반려(④ 누락 · ⑥ 사용)",
  (() => {
    const issues = gateOf(GOOD.replace("④ the limited", "⑥ the limited"));
    return (
      issues.some((i) => i.includes("선지 라벨 ④ 누락")) &&
      issues.some((i) => i.includes("⑥ 은 범위 밖"))
    );
  })(),
  gateOf(GOOD.replace("④ the limited", "⑥ the limited")).join(" / "),
);
check(
  "게이트 정답: 정답 누락 반려",
  gateOf(GOOD.replace("정답: ②\n", "")).some((i) => i.includes("정답 누락")),
);
check(
  "게이트 정답: 선지에 없는 라벨 반려",
  gateOf(GOOD.replace("정답: ②", "정답: ⑧")).some((i) => i.includes("정답 라벨(⑧)이 선지에 없음")),
);
check(
  "게이트 정답: 개수 불일치 반려(K=1 인데 2개)",
  gateOf(GOOD.replace("정답: ②", "정답: ②, ④")).some((i) => i.includes("정답 라벨 2개 (1개 필요)")),
);
check(
  "게이트 해설: 누락 반려",
  gateOf(GOOD.replace(/^해설:.*$/m, "해설:")).some((i) => i.includes("해설 누락")),
);
check(
  "게이트 오답해설: 개수 부족 + 어느 라벨이 빠졌는지 지목",
  (() => {
    const issues = gateOf(GOOD.replace(/^④ 관점 반전.*$/m, ""));
    return (
      issues.some((i) => i.includes("오답해설 3개 (4개 필요)")) &&
      issues.some((i) => i.includes("④ 오답 해설 누락"))
    );
  })(),
  gateOf(GOOD.replace(/^④ 관점 반전.*$/m, "")).join(" / "),
);
check(
  "게이트 오답해설: 정답 라벨 포함 반려(파서 필터를 우회한 직접 호출)",
  gateMdTopic(
    { ...snapped.question, wrong: [...snapped.question.wrong, { label: "②", text: "정답인데 끼어듦" }] },
    PASSAGE,
    BASE_GATE,
  ).some((i) => i.includes("오답해설에 정답 라벨(②) 포함")),
);
check(
  "게이트 오답해설: 라벨 중복 반려",
  gateMdTopic(
    { ...snapped.question, wrong: [...snapped.question.wrong, { label: "①", text: "중복 해설" }] },
    PASSAGE,
    BASE_GATE,
  ).some((i) => i.includes("오답해설 라벨 중복: ①")),
);
check(
  "게이트 선지 중복: 같은 표현 두 자리 반려",
  gateOf(GOOD.replace(`⑤ ${OPTION_TEXTS[4]}`, `⑤ ${OPTION_TEXTS[0]}`)).some((i) =>
    i.includes("선지 중복: ① 와 ⑤"),
  ),
);
check(
  "게이트 언어축: 영어 선지에 한국어 혼입 반려",
  gateOf(GOOD.replace(`③ ${OPTION_TEXTS[2]}`, "③ 도시 나무가 기계식 냉방을 대체하는 방법")).some((i) =>
    i.includes("③ 선지에 한국어가 섞임"),
  ),
);
check(
  "게이트 언어축: 한국어 선지 설정에서 영어만 있는 선지 반려",
  gateOf(GOOD, { optionLanguage: "ko" }).some((i) => i.includes("선지에 한국어가 없음")),
);
check(
  "게이트 길이: 지나치게 짧은 선지 반려",
  gateOf(GOOD.replace(`④ ${OPTION_TEXTS[3]}`, "④ urban trees")).some((i) =>
    i.includes("④ 선지가 너무 짧아"),
  ),
);
check(
  "게이트 길이: 문장급으로 긴 선지 반려",
  gateOf(
    GOOD.replace(
      `④ ${OPTION_TEXTS[3]}`,
      "④ the writer argues that planting trees in a continuous line along every city street will always lower the afternoon temperature far more than any other measure that planners might consider",
    ),
  ).some((i) => i.includes("④ 선지가 너무 김")),
);
check(
  "게이트 길이: 선지 길이 불균형 반려",
  gateOf(GOOD.replace(`④ ${OPTION_TEXTS[3]}`, "④ shade and afternoon heat")).some((i) =>
    i.includes("선지 길이 불균형"),
  ),
);
check(
  "게이트 길이: 정답만 유독 길면 반려(길이 누출)",
  gateOf(
    GOOD.replace(
      `② ${OPTION_TEXTS[1]}`,
      "② why the unbroken continuity of overlapping tree cover matters far more than the pedigree of each species",
    ),
  ).some((i) => i.includes("정답 선지 ② 만 유독 김")),
);
check(
  "게이트 지문 복사: 지문 문장을 그대로 옮긴 선지 반려",
  gateOf(
    GOOD.replace(`③ ${OPTION_TEXTS[2]}`, "③ the coolest streets were simply the ones with the toughest trees"),
  ).some((i) => i.includes("③ 선지가 지문 표현을 그대로 옮김")),
);
check(
  "게이트 정답 누출: 선지 끝의 '(정답)' 표시 반려",
  gateOf(GOOD.replace(`② ${OPTION_TEXTS[1]}`, `② ${OPTION_TEXTS[1]} (정답)`)).some((i) =>
    i.includes("② 선지에 정답 표시가 섞임"),
  ),
);
check(
  "게이트 정답 누출: 선지 끝의 ★ 표시 반려",
  gateOf(GOOD.replace(`② ${OPTION_TEXTS[1]}`, `② ${OPTION_TEXTS[1]} ★`)).some((i) =>
    i.includes("정답 표시가 섞임"),
  ),
);
check(
  "게이트 옵션: requireWrong=false 면 오답해설 없이도 클린(answer-only 모드)",
  gateMdTopic({ ...snapped.question, wrong: [] }, PASSAGE, {
    ...BASE_GATE,
    requireWrong: false,
  }).length === 0,
);

// ───────────────────────────────────────────────────────────────────────────
// 3. 드리프트 관용 — 전부 5선지 + 게이트 클린이어야 한다(줄 유실 0).
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string][] = [
  ["평숫자 라벨", `⑤ ${OPTION_TEXTS[4]}`, `5. ${OPTION_TEXTS[4]}`],
  ["괄호 숫자 라벨", `⑤ ${OPTION_TEXTS[4]}`, `(5) ${OPTION_TEXTS[4]}`],
  ["굵게 라벨", `② ${OPTION_TEXTS[1]}`, `**②** ${OPTION_TEXTS[1]}`],
  ["굵게 본문", `② ${OPTION_TEXTS[1]}`, `② **${OPTION_TEXTS[1]}**`],
  ["불릿 접두", `③ ${OPTION_TEXTS[2]}`, `- ③ ${OPTION_TEXTS[2]}`],
  ["별표 불릿", `③ ${OPTION_TEXTS[2]}`, `* ③ ${OPTION_TEXTS[2]}`],
  ["인용 기호 접두", `③ ${OPTION_TEXTS[2]}`, `> ③ ${OPTION_TEXTS[2]}`],
  ["표 형식 행", `④ ${OPTION_TEXTS[3]}`, `| ④ | ${OPTION_TEXTS[3]} |`],
  ["라벨 뒤 콜론", `④ ${OPTION_TEXTS[3]}`, `④: ${OPTION_TEXTS[3]}`],
  ["따옴표 감싼 선지", `④ ${OPTION_TEXTS[3]}`, `④ "${OPTION_TEXTS[3]}"`],
  ["곱슬 따옴표 감싼 선지", `④ ${OPTION_TEXTS[3]}`, `④ “${OPTION_TEXTS[3]}”`],
  ["라벨 이중 표기", `① ${OPTION_TEXTS[0]}`, `① 1) ${OPTION_TEXTS[0]}`],
  ["공백 과다", `① ${OPTION_TEXTS[0]}`, `①    ${OPTION_TEXTS[0].replace(" of ", "  of  ")}`],
  ["정답 줄 굵게", "정답: ②", "**정답: ②**"],
  ["정답 줄 전각 콜론", "정답: ②", "정답： ②"],
  ["정답 줄 평숫자", "정답: ②", "정답: 2"],
  ["정답 줄 괄호 숫자", "정답: ②", "정답: (2)"],
  ["정답 줄 부가 설명", "정답: ②", "정답: ② — 나머지 넷은 주제가 아닙니다"],
  ["해설 줄 굵게", "해설: 이 글은", "**해설:** 이 글은"],
  ["오답 머리표 굵게", "오답:", "**오답:**"],
  ["오답 항목 평숫자", "③ 범위 이탈로", "3) 범위 이탈로"],
  ["오답 목록에 정답 줄 끼어듦", "오답:\n①", "오답:\n② (정답) 이 줄은 무시돼야 합니다\n①"],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdTopic(drifted);
  const issues = gateOf(drifted);
  check(
    `드리프트 관용: ${name}`,
    q.options.length === 5 && issues.length === 0,
    `선지 ${q.options.length}개 · ${issues.join(" / ")}`,
  );
}

// 과잉 관용 방지 — 라벨 없는 산문 줄은 선지로 오인하지 않는다.
check(
  "과잉 관용 방지: 라벨 없는 산문 줄 무시",
  parseMdTopic(GOOD.replace("① the rising", "아래는 선지 다섯 개입니다.\n① the rising")).options
    .length === 5,
);
// 해설·오답 구역의 라벨 줄이 선지로 새지 않는다(구조 차단).
check(
  "과잉 관용 방지: 오답 구역 라벨 줄은 선지가 아니다",
  parseMdTopic(GOOD).options.every((o) => OPTION_TEXTS.includes(o.text)),
);

check(
  "라벨 정규화: 원문자·평숫자·괄호·마침표 표기가 같은 라벨",
  topicLabel("③") === "③" && topicLabel("3") === "③" && topicLabel("(3)") === "③" && topicLabel("3.") === "③",
);
check(
  "라벨 정규화: 파싱 상한 ⑩ · 범위 밖은 빈 문자열",
  topicLabel("10") === "⑩" && topicLabel("11") === "" && topicLabel("99") === "" && topicLabel("") === "",
);
check(
  "장식 제거: 굵게·따옴표·표 파이프·중복 라벨",
  stripTopicDecoration("**the rising popularity**") === "the rising popularity" &&
    stripTopicDecoration('"the rising popularity"') === "the rising popularity" &&
    stripTopicDecoration("| the rising popularity |") === "the rising popularity" &&
    // 라벨 이중 표기 제거는 **자기 라벨일 때만** 한다(웨이브2 correctness 수리).
    // 자기 라벨을 모르는 호출은 선두 토큰에 손대지 않는다 — 다른 선지 지칭 보호.
    stripTopicDecoration("② the rising popularity", "②") === "the rising popularity" &&
    stripTopicDecoration("② the rising popularity") === "② the rising popularity",
);
check(
  "길이 단위: 영어는 단어 수 · 한국어는 공백 제외 글자 수",
  topicLengthUnits("the rising popularity of trees", "en") === 5 &&
    topicLengthUnits("수관 연속성의 중요성", "ko") === 9,
  `${topicLengthUnits("the rising popularity of trees", "en")} / ${topicLengthUnits("수관 연속성의 중요성", "ko")}`,
);

// ───────────────────────────────────────────────────────────────────────────
// 4. 스냅 보정 — 표면 정돈만 한다(내용 무첨가).
// ───────────────────────────────────────────────────────────────────────────
{
  const mixed = GOOD.replace(`① ${OPTION_TEXTS[0]}`, `① ${OPTION_TEXTS[0]}.`).replace(
    `③ ${OPTION_TEXTS[2]}`,
    `③ ${OPTION_TEXTS[2]}.`,
  );
  const s = autoSnapTopicOptions(parseMdTopic(mixed));
  check(
    "스냅: 마침표 혼재를 '떼는 쪽'으로 통일",
    s.corrections.some((c) => c.includes("마침표")) &&
      s.question.options.every((o) => !o.text.endsWith(".")),
    s.corrections.join(" / "),
  );
  check("스냅: 통일 후 게이트 클린", gateMdTopic(s.question, PASSAGE, BASE_GATE).length === 0);
}
{
  const allEnded = OPTION_TEXTS.reduce(
    (acc, t, i) => acc.replace(`${"①②③④⑤"[i]} ${t}`, `${"①②③④⑤"[i]} ${t}.`),
    GOOD,
  );
  const s = autoSnapTopicOptions(parseMdTopic(allEnded));
  check(
    "스냅: 전부 마침표면 손대지 않는다(일관돼 있으면 표면 단서가 아니다)",
    s.corrections.length === 0 && s.question.options.every((o) => o.text.endsWith(".")),
    s.corrections.join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. 어댑터 → postProcessQuestion(PASSTHROUGH) → 셔플 → 품질 검증기 왕복
// ───────────────────────────────────────────────────────────────────────────
const KO_DIRECTION = "다음 글의 주제로 가장 적절한 것은?";
{
  const adapt = adaptMdTopicToAiQuestion(snapped.question, PASSAGE, "KILLER", {
    direction: KO_DIRECTION,
  });
  check("어댑터: 성공", adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  const opts = ai.options as Array<Record<string, unknown>>;
  check(
    "어댑터: 선지 라벨이 숫자 문자열 '1'~'5' · 본문 축자",
    opts.length === 5 && opts[0].label === "1" && opts[4].label === "5" && opts[1].text === OPTION_TEXTS[1],
  );
  check("어댑터: correctAnswer '2'", ai.correctAnswer === "2", String(ai.correctAnswer));
  check("어댑터: 단일 정답이면 correctAnswers 를 만들지 않는다", !("correctAnswers" in ai));
  check(
    "어댑터: wrongOptionExplanations 라벨 축이 선지 라벨과 동기(정답 제외 4개)",
    (() => {
      const w = ai.wrongOptionExplanations as Array<Record<string, unknown>>;
      return w.length === 4 && w.map((x) => x.label).join(",") === "1,3,4,5";
    })(),
  );
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check(
    "어댑터: 이물 필드 없음(빈칸 계열·지문 필드)",
    !("blanks" in ai) &&
      !("passageWithBlank" in ai) &&
      !("originalExpression" in ai) &&
      !("blankAnswerMode" in ai) &&
      !Object.keys(ai).some((k) => k.startsWith("passageWith")),
  );
  check("어댑터: 발문은 레인이 준 값 그대로", ai.direction === KO_DIRECTION);

  const pp = postProcessQuestion("TOPIC", PASSAGE, ai as never);
  check("후처리: 성공(PASSTHROUGH)", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  check(
    "후처리: 선지·정답 무변경(지문 필드 합성 없음)",
    (data.options as Array<Record<string, unknown>>).length === 5 &&
      data.correctAnswer === "2" &&
      !("passageWithMarkers" in data),
  );
  const wrongRecord = data.wrongOptionExplanations as Record<string, string>;
  check(
    "후처리: wrongOptionExplanations 배열 → Record(키 '1','3','4','5')",
    !Array.isArray(wrongRecord) && Object.keys(wrongRecord).sort().join(",") === "1,3,4,5",
    JSON.stringify(Object.keys(wrongRecord ?? {})),
  );
  check(
    "후처리: 오답 해설에 선지 문구 앞머리 부착(VISIBLE_KOREAN_OPTION_TYPES 계약)",
    wrongRecord["1"].startsWith(`'${OPTION_TEXTS[0]}' 선택지는`),
    wrongRecord["1"]?.slice(0, 60),
  );

  // 라우트 규약대로 mapped → shuffle → validate 순으로 태운다.
  const mapped: Record<string, unknown> = {
    ...data,
    _typeId: "TOPIC",
    _typeLabel: "주제 추론",
    difficulty: "KILLER",
  };
  let shuffleOk = true;
  let shuffleDetail = "";
  for (let i = 0; i < 40; i += 1) {
    const shuffled = shuffleQuestionOptionsForDiversity({ ...mapped }, "TOPIC");
    const sOpts = shuffled.options as Array<Record<string, unknown>>;
    const answerLabel = String(shuffled.correctAnswer);
    const answerOption = sOpts.find((o) => o.label === answerLabel);
    const sWrong = shuffled.wrongOptionExplanations as Record<string, string>;
    const wrongLabels = Object.keys(sWrong).sort().join(",");
    const expectedWrong = sOpts
      .filter((o) => o.label !== answerLabel)
      .map((o) => String(o.label))
      .sort()
      .join(",");
    // 각 오답 해설은 자기 선지 문구를 앞머리에 달고 있으므로 내용 동행을 직접 검사할 수 있다.
    const glued = sOpts.every(
      (o) => o.label === answerLabel || sWrong[String(o.label)]?.includes(String(o.text)),
    );
    if (
      sOpts.length !== 5 ||
      answerOption?.text !== OPTION_TEXTS[1] ||
      wrongLabels !== expectedWrong ||
      !glued
    ) {
      shuffleOk = false;
      shuffleDetail = `answer=${answerLabel} text=${String(answerOption?.text).slice(0, 30)} wrong=${wrongLabels}`;
      break;
    }
  }
  check("셔플 40회: 정답 라벨·오답 해설이 선지 내용과 끝까지 동행", shuffleOk, shuffleDetail);

  const issues = validateQuestionQuality({
    typeId: "TOPIC",
    question: mapped,
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    ...TOPIC_MD_LANE.qualityArgs({ rawTypeSettings: null, resolved: {} } as unknown as MdLaneContext),
  });
  const errors = issues.filter((i) => i.severity === "error");
  check(
    "품질 검증기: error 0건 (5지·1정답·영어 선지·한국어 발문)",
    errors.length === 0,
    errors.map((e) => e.code).join(", "),
  );
}

// 정답이 ① 이 아닌 경우에도 라벨 축이 어긋나지 않는다(정답: 줄이 유일 진실원).
{
  const shifted = GOOD.replace("정답: ②", "정답: ④")
    .replace(/^④ 관점 반전.*$/m, "② 관점 반전으로, 필자의 평가 방향을 뒤집은 진술입니다.")
    .replace(/^\n?/, "");
  const q = autoSnapTopicOptions(parseMdTopic(shifted)).question;
  check("게이트: 정답 ④ 형상 클린", gateMdTopic(q, PASSAGE, BASE_GATE).length === 0, gateMdTopic(q, PASSAGE, BASE_GATE).join(" / "));
  const ai = (adaptMdTopicToAiQuestion(q, PASSAGE, "BASIC", { direction: KO_DIRECTION }).aiQuestion ??
    {}) as Record<string, unknown>;
  check("어댑터: 정답 ④ → correctAnswer '4'", ai.correctAnswer === "4", String(ai.correctAnswer));
  check(
    "어댑터: 오답해설 라벨이 '1','2','3','5'",
    (ai.wrongOptionExplanations as Array<Record<string, unknown>>)
      .map((w) => w.label)
      .join(",") === "1,2,3,5",
  );
  check("어댑터: difficulty 는 원본 난이도 그대로", ai.difficulty === "BASIC");
}

// 어댑터 방어 — 게이트를 우회한 직접 호출에서도 조용한 소실이 없다.
{
  const q = snapped.question;
  check(
    "어댑터 방어: 정답 라벨이 선지에 없으면 실패",
    adaptMdTopicToAiQuestion({ ...q, answers: ["⑧"], answer: "⑧" }, PASSAGE, "KILLER", {
      direction: KO_DIRECTION,
    }).ok === false,
  );
  check(
    "어댑터 방어: 오답해설 라벨 중복이면 실패(덮어쓰기 소실 차단)",
    adaptMdTopicToAiQuestion(
      { ...q, wrong: [...q.wrong, { label: "①", text: "중복" }] },
      PASSAGE,
      "KILLER",
      { direction: KO_DIRECTION },
    ).ok === false,
  );
  check(
    "어댑터 방어: 선지 3개면 실패",
    adaptMdTopicToAiQuestion({ ...q, options: q.options.slice(0, 3) }, PASSAGE, "KILLER", {
      direction: KO_DIRECTION,
    }).ok === false,
  );
  check("어댑터: 라벨 변환 ①→'1' · ⑧→'8' · 미해석 ''", topicDigitLabel("①") === "1" && topicDigitLabel("⑧") === "8" && topicDigitLabel("(Z)") === "");
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 비표준 형식 — 8지·2정답 / 부정 극성 / 한국어 선지 / 영어 발문
// ───────────────────────────────────────────────────────────────────────────
const WIDE_TEXTS = [
  "the rising popularity of heat-resistant trees in modern cities",
  "why continuous tree cover outweighs species choice in cooling streets",
  "how urban trees can fully replace mechanical cooling systems",
  "the limited effect of shade on afternoon street temperatures",
  "the growing variety of trees planted along city streets",
  "why unbroken canopy lines cool a street more than isolated trees",
  "the historical origins of street planting in crowded industrial towns",
  "the cost of maintaining hardy tree varieties in dry climates",
];
const WIDE = `${WIDE_TEXTS.map((t, i) => `${"①②③④⑤⑥⑦⑧"[i]} ${t}`).join("\n")}
정답: ②, ⑥
해설: 두 진술 모두 수관이 이어질 때 거리 전체가 시원해진다는 이 글의 논지를 정확히 압축합니다. 나머지는 도입부 통념이거나 지문 밖 확장이라 주제가 될 수 없습니다.
오답:
① 도입부 소재 함정으로, 논지가 꺾이기 전의 통념일 뿐입니다.
③ 범위 이탈로, 지문이 말하지 않은 해결책까지 넓힌 진술입니다.
④ 관점 반전으로, 필자의 평가 방향을 뒤집은 진술입니다.
⑤ 관점 소거로, 중심 화제만 남고 판단이 빠진 진술입니다.
⑦ 지문 밖 통념으로, 역사적 기원은 이 글이 다루지 않습니다.
⑧ 지문 밖 통념으로, 유지 비용은 이 글의 논의 밖입니다.`;
{
  const wideGate = { optionCount: 8, answerCount: 2, optionLanguage: "en" as const };
  const q = autoSnapTopicOptions(parseMdTopic(WIDE)).question;
  check("8지·2정답: 파싱 선지 8개", q.options.length === 8, `실제 ${q.options.length}`);
  check("8지·2정답: 정답 라벨 2개(②⑥)", q.answers.join("") === "②⑥", q.answers.join(""));
  check("8지·2정답: 오답해설 6개", q.wrong.length === 6, `실제 ${q.wrong.length}`);
  check(
    "8지·2정답: 게이트 클린",
    gateMdTopic(q, PASSAGE, wideGate).length === 0,
    gateMdTopic(q, PASSAGE, wideGate).join(" / "),
  );
  check(
    "8지·2정답: 5지 설정으로 검사하면 반려(설정 실값 집행)",
    gateMdTopic(q, PASSAGE, BASE_GATE).some((i) => i.includes("선지 8개 (5개 필요)")),
  );
  const direction = buildTopicDirection("POSITIVE", 2, "ko");
  const ai = (adaptMdTopicToAiQuestion(q, PASSAGE, "INTERMEDIATE", { direction }).aiQuestion ??
    {}) as Record<string, unknown>;
  check("8지·2정답: correctAnswer '2, 6'", ai.correctAnswer === "2, 6", String(ai.correctAnswer));
  check(
    "8지·2정답: correctAnswers 배열 동시 탑재",
    JSON.stringify(ai.correctAnswers) === JSON.stringify(["2", "6"]),
    JSON.stringify(ai.correctAnswers),
  );
  const pp = postProcessQuestion("TOPIC", PASSAGE, ai as never);
  const mapped = { ...(pp.data as Record<string, unknown>), _typeId: "TOPIC", difficulty: "INTERMEDIATE" };
  const errors = validateQuestionQuality({
    typeId: "TOPIC",
    question: mapped,
    passage: PASSAGE,
    requestedDifficulty: "INTERMEDIATE",
    genericOptionCount: 8,
    genericAnswerCount: 2,
    stemLanguage: "ko",
    optionLanguage: "en",
  }).filter((i) => i.severity === "error");
  check("8지·2정답: 품질 검증기 error 0건", errors.length === 0, errors.map((e) => e.code).join(", "));
}

// 한국어 선지 설정
const KO_TEXTS = [
  "도시에서 인기를 끄는 내열성 수종의 확산",
  "거리 냉각에서 수종 선택보다 중요한 수관의 연속성",
  "도시 나무가 기계식 냉방을 완전히 대체하는 방법",
  "오후 기온을 낮추는 데 그늘이 갖는 제한적 효과",
  "도시 가로변에 심기는 나무 종류의 다양성",
];
const KO_MD = `${KO_TEXTS.map((t, i) => `${"①②③④⑤"[i]} ${t}`).join("\n")}
정답: ②
해설: 이 글은 강한 수종이라는 통념을 뒤집고 수관이 이어질 때 거리가 시원해진다고 논증합니다. 따라서 중심 화제와 필자의 판단을 함께 담은 진술이 주제로 가장 적절합니다.
오답:
① 도입부 소재 함정으로, 논지가 꺾이기 전의 통념일 뿐입니다.
③ 범위 이탈로, 지문이 말하지 않은 해결책까지 넓힌 진술입니다.
④ 관점 반전으로, 필자의 평가 방향을 뒤집은 진술입니다.
⑤ 관점 소거로, 중심 화제만 남고 판단이 빠진 진술입니다.`;
{
  const koGate = { optionCount: 5, answerCount: 1, optionLanguage: "ko" as const };
  const q = autoSnapTopicOptions(parseMdTopic(KO_MD)).question;
  check("한국어 선지: 게이트 클린", gateMdTopic(q, PASSAGE, koGate).length === 0, gateMdTopic(q, PASSAGE, koGate).join(" / "));
  check(
    "한국어 선지: 영어 설정으로 검사하면 반려(언어 축 집행)",
    gateMdTopic(q, PASSAGE, BASE_GATE).some((i) => i.includes("선지에 한국어가 섞임")),
  );
  const ai = (adaptMdTopicToAiQuestion(q, PASSAGE, "BASIC", { direction: KO_DIRECTION }).aiQuestion ??
    {}) as Record<string, unknown>;
  const pp = postProcessQuestion("TOPIC", PASSAGE, ai as never);
  const errors = validateQuestionQuality({
    typeId: "TOPIC",
    question: { ...(pp.data as Record<string, unknown>), difficulty: "BASIC" },
    passage: PASSAGE,
    requestedDifficulty: "BASIC",
    genericOptionCount: 5,
    genericAnswerCount: 1,
    stemLanguage: "ko",
    optionLanguage: "ko",
  }).filter((i) => i.severity === "error");
  check("한국어 선지: 품질 검증기 error 0건", errors.length === 0, errors.map((e) => e.code).join(", "));
}

// 부정 극성 — 발문·검증기 통과 축
{
  const direction = buildTopicDirection("NEGATIVE", 1, "ko");
  const ai = (adaptMdTopicToAiQuestion(snapped.question, PASSAGE, "KILLER", { direction })
    .aiQuestion ?? {}) as Record<string, unknown>;
  const pp = postProcessQuestion("TOPIC", PASSAGE, ai as never);
  const errors = validateQuestionQuality({
    typeId: "TOPIC",
    question: { ...(pp.data as Record<string, unknown>), difficulty: "KILLER" },
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    genericOptionCount: 5,
    genericAnswerCount: 1,
    stemLanguage: "ko",
    optionLanguage: "en",
    answerPolarity: "NEGATIVE",
  }).filter((i) => i.severity === "error");
  check(
    "부정 극성: 발문이 극성 게이트를 통과(error 0건)",
    errors.length === 0,
    `${direction} / ${errors.map((e) => e.code).join(", ")}`,
  );
}

// 영어 발문 — 검증기 경고 축(topic 단어 포함)
{
  const ai = (adaptMdTopicToAiQuestion(snapped.question, PASSAGE, "KILLER", {
    direction: buildTopicDirection("POSITIVE", 1, "en"),
  }).aiQuestion ?? {}) as Record<string, unknown>;
  const issues = validateQuestionQuality({
    typeId: "TOPIC",
    question: { ...(postProcessQuestion("TOPIC", PASSAGE, ai as never).data as Record<string, unknown>), difficulty: "KILLER" },
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    genericOptionCount: 5,
    genericAnswerCount: 1,
    stemLanguage: "en",
    optionLanguage: "en",
  });
  check(
    "영어 발문: direction-mismatch 경고조차 없음",
    !issues.some((i) => i.code === "topic-direction-mismatch"),
    issues.map((i) => `${i.severity}:${i.code}`).join(", "),
  );
}

// 발문 결정론 8분기 전수
check(
  "발문: 극성 × 정답개수 × 언어 8분기",
  buildTopicDirection("POSITIVE", 1, "ko") === "다음 글의 주제로 가장 적절한 것은?" &&
    buildTopicDirection("POSITIVE", 2, "ko") === "다음 글의 주제로 적절한 것을 모두 고르시오." &&
    buildTopicDirection("NEGATIVE", 1, "ko") === "다음 글의 주제로 가장 적절하지 않은 것은?" &&
    buildTopicDirection("NEGATIVE", 2, "ko").includes("적절하지 않은 것을 모두") &&
    buildTopicDirection("POSITIVE", 1, "en").includes("topic") &&
    buildTopicDirection("POSITIVE", 2, "en").includes("all") &&
    buildTopicDirection("NEGATIVE", 1, "en").includes("NOT") &&
    buildTopicDirection("NEGATIVE", 2, "en").includes("NOT"),
);

// ───────────────────────────────────────────────────────────────────────────
// 7. 레인 계약 — 과금·적격성·설정 집행·난이도 3분기·다양성·mdFormat
// ───────────────────────────────────────────────────────────────────────────
const ctxOf = (over: Partial<MdLaneContext> = {}): MdLaneContext =>
  ({
    passage: PASSAGE,
    difficulty: "KILLER",
    rawDifficulty: "KILLER",
    resolved: {},
    rawTypeSettings: null,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
    ...over,
  }) as MdLaneContext;

check("레인: subType TOPIC", TOPIC_MD_LANE.subType === "TOPIC");
check(
  "레인: 과금 QUESTION_GEN_SINGLE (fast getOperationType 의 VOCAB_TYPES 비포함 유형)",
  TOPIC_MD_LANE.operationType === "QUESTION_GEN_SINGLE" && CREDIT_COSTS.QUESTION_GEN_SINGLE === 2,
  String(TOPIC_MD_LANE.operationType),
);
check("레인: retryEligible", TOPIC_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 — 기본값(미설정)·4~8지 허용",
  TOPIC_MD_LANE.isEligible({}) &&
    TOPIC_MD_LANE.isEligible({ genericOptionCount: 4 }) &&
    TOPIC_MD_LANE.isEligible({ genericOptionCount: 8, genericAnswerCount: 7 }),
);
check(
  "레인: 적격성 — 범위 밖 거부(3지·9지·정답 과다)",
  !TOPIC_MD_LANE.isEligible({ genericOptionCount: 3 }) &&
    !TOPIC_MD_LANE.isEligible({ genericOptionCount: 9 }) &&
    !TOPIC_MD_LANE.isEligible({ genericOptionCount: 5, genericAnswerCount: 5 }),
);
check(
  "레인: buildExtras 는 빈 배열(설정은 base 프롬프트가 단일 진실원)",
  TOPIC_MD_LANE.buildExtras(ctxOf()).length === 0,
);
check(
  "레인: parseAndGate 정상 입력 클린",
  TOPIC_MD_LANE.parseAndGate(GOOD, ctxOf()).gateIssues.length === 0,
  TOPIC_MD_LANE.parseAndGate(GOOD, ctxOf()).gateIssues.join(" / "),
);
check(
  "레인: parseAndGate 가 설정 실값으로 게이트한다(8지 설정 · 5지 출력)",
  TOPIC_MD_LANE.parseAndGate(GOOD, ctxOf({ resolved: { genericOptionCount: 8 } }))
    .gateIssues.some((i) => i.includes("(8개 필요)")),
);
check(
  "레인: parseAndGate 가 스냅 기록을 넘긴다",
  TOPIC_MD_LANE.parseAndGate(GOOD.replace(`① ${OPTION_TEXTS[0]}`, `① ${OPTION_TEXTS[0]}.`), ctxOf())
    .corrections.length === 1,
);
check(
  "레인: adapt 가 한국어 기본 발문을 싣는다",
  (TOPIC_MD_LANE.adapt(TOPIC_MD_LANE.parseAndGate(GOOD, ctxOf()), ctxOf()).aiQuestion ?? {})
    .direction === KO_DIRECTION,
);
check(
  "레인: adapt 가 stemLanguage=en 설정에서 영어 발문을 싣는다",
  String(
    (
      TOPIC_MD_LANE.adapt(
        TOPIC_MD_LANE.parseAndGate(GOOD, ctxOf()),
        ctxOf({ rawTypeSettings: { stemLanguage: "en" } }),
      ).aiQuestion ?? {}
    ).direction,
  ).includes("topic"),
);
check(
  "레인: adapt 가 부정 극성 발문을 싣는다",
  String(
    (
      TOPIC_MD_LANE.adapt(
        TOPIC_MD_LANE.parseAndGate(GOOD, ctxOf()),
        ctxOf({ resolved: { answerPolarity: "NEGATIVE" } }),
      ).aiQuestion ?? {}
    ).direction,
  ).includes("적절하지 않은"),
);
check(
  "레인: qualityArgs 가 설정 실값을 넘긴다",
  (() => {
    const args = TOPIC_MD_LANE.qualityArgs(
      ctxOf({ resolved: { genericOptionCount: 6, genericAnswerCount: 2 } }),
    );
    return args.genericOptionCount === 6 && args.genericAnswerCount === 2 && args.stemLanguage === "ko";
  })(),
);
check(
  "레인: qualityArgs 는 POSITIVE 에서 answerPolarity 키를 넣지 않는다",
  !("answerPolarity" in TOPIC_MD_LANE.qualityArgs(ctxOf())) &&
    TOPIC_MD_LANE.qualityArgs(ctxOf({ resolved: { answerPolarity: "NEGATIVE" } })).answerPolarity ===
      "NEGATIVE",
);
check(
  "레인: mdFormat 포렌식 메타",
  (() => {
    const meta = TOPIC_MD_LANE.mdFormat(
      ctxOf({ resolved: { genericOptionCount: 8, genericAnswerCount: 2, answerPolarity: "NEGATIVE" } }),
    );
    return meta.optionCount === 8 && meta.answerCount === 2 && meta.polarity === "NEGATIVE";
  })(),
);
check(
  "레인: diversityTargets 는 정답 선지 문구를 90자 안에서 낸다(주제 자체는 유지 명시)",
  (() => {
    const targets = TOPIC_MD_LANE.diversityTargets({
      options: [
        { label: "1", text: OPTION_TEXTS[0] },
        { label: "2", text: OPTION_TEXTS[1] },
      ],
      correctAnswer: "2",
    });
    return (
      targets.length === 1 &&
      targets[0].includes("주제 자체는 유지") &&
      targets[0].includes(OPTION_TEXTS[1].slice(0, 20)) &&
      targets[0].length <= 90
    );
  })(),
  TOPIC_MD_LANE.diversityTargets({
    options: [{ label: "2", text: OPTION_TEXTS[1] }],
    correctAnswer: "2",
  })[0],
);
check(
  "레인: diversityTargets 는 복수 정답도 수집하고, 형상 불명이면 빈 배열",
  TOPIC_MD_LANE.diversityTargets({
    options: [
      { label: "1", text: OPTION_TEXTS[0] },
      { label: "2", text: OPTION_TEXTS[1] },
    ],
    correctAnswer: "1, 2",
  }).length === 2 && TOPIC_MD_LANE.diversityTargets({}).length === 0,
);

// 프롬프트 — 난이도 3분기 · 설정 집행 · 형식 계약
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdTopicPrompt(PASSAGE, "full", d, { optionCount: 5 });
  check(
    `프롬프트 ${d}: 난이도 분기 + 선지 스캐폴드 + 지문 포함`,
    p.includes("## 표적 설계") &&
      p.includes("⑤ <선지>") &&
      p.includes("## 지문") &&
      p.includes(PASSAGE.slice(0, 40)),
  );
}
check(
  "프롬프트: KILLER·INTERMEDIATE 만 few-shot 해부(BASIC 은 생략)",
  buildMdTopicPrompt(PASSAGE, "full", "KILLER").includes("모범 설계 해부") &&
    buildMdTopicPrompt(PASSAGE, "full", "INTERMEDIATE").includes("모범 설계 해부") &&
    !buildMdTopicPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부"),
);
check(
  "프롬프트: 오답 기제 분류학 5종을 모두 싣는다",
  (() => {
    const p = buildMdTopicPrompt(PASSAGE, "full", "KILLER");
    return ["관점 반전", "도입부 소재 함정", "범위 이탈", "지문 밖 통념", "관점 소거"].every((k) =>
      p.includes(k),
    );
  })(),
);
check(
  "프롬프트: 선지 줄에 정답 표시 칸을 요구하지 않는다(철칙 1 — 정답은 '정답:' 줄만)",
  (() => {
    const p = buildMdTopicPrompt(PASSAGE, "full", "KILLER");
    return !p.includes("O 또는 X") && !p.includes("(정답 여부)") && p.includes("정답: <①~⑤ 하나>");
  })(),
);
check(
  "프롬프트: optionCount 설정 집행(8지면 ⑧ 스캐폴드·오답 7개)",
  (() => {
    const p = buildMdTopicPrompt(PASSAGE, "full", "KILLER", { optionCount: 8 });
    return p.includes("⑧ <선지>") && p.includes("## 오답 7개");
  })(),
);
check(
  "프롬프트: answerCount 설정 집행(2정답이면 병기 예시·복수 정답 블록)",
  (() => {
    const p = buildMdTopicPrompt(PASSAGE, "full", "KILLER", { optionCount: 5, answerCount: 2 });
    return p.includes("## 정답 2개 (교사 설정, 필수)") && p.includes("정답 라벨 2개를");
  })(),
);
check(
  "프롬프트: 부정 극성 집행(선지 설계 블록이 뒤집힌다)",
  (() => {
    const p = buildMdTopicPrompt(PASSAGE, "full", "KILLER", { polarity: "NEGATIVE" });
    return p.includes("정답(부적절)") && p.includes("적절하지 **않은**") && !p.includes("## 오답 4개");
  })(),
);
check(
  "프롬프트: 부정 극성이면 마감·자기검산도 함께 뒤집힌다(정답=부적절 기준)",
  (() => {
    const p = buildMdTopicPrompt(PASSAGE, "full", "KILLER", { polarity: "NEGATIVE" });
    return (
      p.includes("## ⚠ 극성 주의") &&
      p.includes("복수정답 금지가 이 극성의 생명이다") &&
      p.includes("왜 이것이 이 글의 주제가 될 수 없는가") &&
      !p.includes("즉사 오답 금지")
    );
  })(),
);
check(
  "프롬프트: 부정 극성 few-shot 역할 전환 안내(BASIC 은 few-shot 자체가 없어 미출력)",
  buildMdTopicPrompt(PASSAGE, "full", "KILLER", { polarity: "NEGATIVE" }).includes(
    "오답으로 설계된 넷이 이번 문항의 정답 후보",
  ) &&
    !buildMdTopicPrompt(PASSAGE, "full", "BASIC", { polarity: "NEGATIVE" }).includes(
      "오답으로 설계된 넷이 이번 문항의 정답 후보",
    ),
);
check(
  "프롬프트: 선지 언어 설정 집행(ko 면 한국어 명사구 · 요지형 금지)",
  (() => {
    const p = buildMdTopicPrompt(PASSAGE, "full", "KILLER", { optionLanguage: "ko" });
    return p.includes("한국어 명사구") && p.includes("MAIN_IDEA");
  })(),
);
check(
  "프롬프트: answer-only 모드는 오답 섹션을 요구하지 않는다",
  !buildMdTopicPrompt(PASSAGE, "answer-only", "KILLER").includes("\n오답:"),
);
check(
  "프롬프트: 발문을 모델에게 받지 않는다(direction 출력 요구 없음)",
  !buildMdTopicPrompt(PASSAGE, "full", "KILLER").includes("발문:"),
);
check(
  "프롬프트: 번호 지칭 금지 지시(셔플 후 해설 무효화 방지)",
  buildMdTopicPrompt(PASSAGE, "full", "KILLER").includes("번호(③, 3번, 선지 2)로 지칭하지 마라"),
);
check(
  "클램프: optionCount 3→4 · 9→8 / answerCount 0→1 · 상한 optionCount-1",
  clampTopicMdOptionCount(3) === 4 &&
    clampTopicMdOptionCount(9) === 8 &&
    clampTopicMdOptionCount("x") === 5 &&
    clampTopicMdAnswerCount(0, 5) === 1 &&
    clampTopicMdAnswerCount(9, 5) === 4,
);

// ───────────────────────────────────────────────────────────────────────────
// 8. 웨이브2 적대검수 지적 회귀 픽스처 (별 파일 — 이 파일의 줄수 규약 유지)
// ───────────────────────────────────────────────────────────────────────────
runTopicWave2Regressions(check, { PASSAGE, OPTION_TEXTS, GOOD, BASE_GATE });

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
