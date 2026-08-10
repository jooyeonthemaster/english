// 내용 일치(CONTENT_MATCH) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → postProcessQuestion → 셔플 → 품질검증 왕복 +
// 과금 축·적격성·난이도 3분기·설정 집행까지.
// 실행: npx tsx scripts/_test-md-content-match.ts
//
// 형식 계약: `선지:` ①~ / `근거:` ①~(지문 축자 문장) / `정답:` / `해설:` / `오답:`.
// 정답은 `정답:` 줄이 유일 진실원이다 — 줄마다 O/X 를 받지 않는다(§1-B 철칙 1).
import {
  autoSnapContentMatchEvidence,
  locateContentMatchSpan,
  parseMdContentMatch,
  parseContentMatchAnswerRun,
  splitPassageSentences,
  type MdContentMatchQuestion,
} from "../src/lib/md-qgen/parser-content-match";
import { gateMdContentMatch } from "../src/lib/md-qgen/gate-content-match";
import {
  adaptMdContentMatchToAiQuestion,
  contentMatchDirection,
} from "../src/lib/md-qgen/adapter-content-match";
import { CONTENT_MATCH_MD_LANE } from "../src/lib/md-qgen/lane-content-match";
import { buildMdContentMatchPrompt } from "../src/lib/md-qgen/prompts-content-match";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import { runContentMatchDecorationFixtures } from "./_test-md-content-match-decoration";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { shuffleQuestionOptionsForDiversity } from "../src/lib/question-diversity";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { CREDIT_COSTS } from "../src/lib/credit-costs";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

// ── 지문(7문장) ─────────────────────────────────────────────────────────────
const S = [
  "Urban planners once treated street trees as decoration rather than infrastructure.",
  "A decade of measurements in three coastal cities has changed that assumption.",
  "Mature canopies lowered midday street temperatures by up to three degrees.",
  "The cooling effect appeared only after the saplings had grown for roughly ten years.",
  "Younger plantings offered shade that was too thin to register on the instruments.",
  "Residents nevertheless reported feeling cooler long before the sensors agreed.",
  "Planners now budget for maintenance across decades instead of a single season.",
];
const PASSAGE = S.join(" ");

function md(input: {
  options: string[];
  evidence: string[];
  answer: string;
  explanation?: string;
  wrong: [string, string][];
}): string {
  const labels = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
  return [
    "선지:",
    ...input.options.map((text, i) => `${labels[i]} ${text}`),
    "",
    "근거:",
    ...input.evidence.map((text, i) => `${labels[i]} ${text}`),
    "",
    `정답: ${input.answer}`,
    `해설: ${input.explanation ?? "지문은 냉각 효과가 묘목이 약 십 년 자란 뒤에야 나타났다고 밝힙니다. 따라서 심은 첫해 여름부터 기온이 내려갔다는 진술은 시점 조건을 떼어 낸 왜곡입니다."}`,
    "오답:",
    ...input.wrong.map(([label, text]) => `${label} ${text}`),
  ].join("\n");
}

// 5지·정답1·불일치·영문 선지 — 기본 경로.
const OPTIONS5 = [
  "Street trees were once regarded as ornament instead of civic infrastructure.",
  "Fully grown canopies cut midday street temperatures by as much as three degrees.",
  "The temperature drop showed up in the very first summer after planting.",
  "People said they felt cooler earlier than the instruments confirmed.",
  "Maintenance budgets are now planned across decades rather than one season.",
];
const EVIDENCE5 = [S[0], S[2], S[3], S[5], S[6]];
const WRONG5: [string, string][] = [
  ["①", "과거에 가로수를 장식으로 여겼다는 첫 문장이 이 진술을 그대로 확정합니다."],
  ["②", "최대 삼 도까지 낮아졌다는 측정 결과가 이 진술과 정확히 맞습니다."],
  ["④", "주민들이 센서보다 먼저 시원함을 느꼈다고 적혀 있어 참입니다."],
  ["⑤", "유지비를 수십 년 단위로 잡는다는 마지막 문장과 일치합니다."],
];
const GOOD = md({ options: OPTIONS5, evidence: EVIDENCE5, answer: "③", wrong: WRONG5 });

const BASE_GATE = { optionCount: 5, answerCount: 1, optionLanguage: "en" as const };

function gateOf(text: string, options = BASE_GATE): string[] {
  const q = autoSnapContentMatchEvidence(parseMdContentMatch(text), PASSAGE).question;
  return gateMdContentMatch(q, PASSAGE, options);
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdContentMatch(GOOD);
check("파싱: 선지 5개", parsed.options.length === 5, `실제 ${parsed.options.length}`);
check("파싱: 근거 5개", parsed.evidence.length === 5, `실제 ${parsed.evidence.length}`);
check("파싱: 정답 ③ 단일", parsed.answers.join(",") === "③", parsed.answers.join(","));
check("파싱: 오답해설 4개", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check("파싱: 해설 존재", parsed.explanation.length > 10);
check(
  "파싱: 선지·근거가 서로 다른 구역으로 갈림",
  parsed.options[0].text === OPTIONS5[0] && parsed.evidence[0].sentence === S[0],
  `${parsed.options[0].text} / ${parsed.evidence[0].sentence}`,
);
check(
  "문장 분해: 지문 7문장",
  splitPassageSentences(PASSAGE).length === 7,
  `실제 ${splitPassageSentences(PASSAGE).length}`,
);

const snapped = autoSnapContentMatchEvidence(parsed, PASSAGE);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
check(
  "게이트: 정상 입력 클린",
  gateMdContentMatch(snapped.question, PASSAGE, BASE_GATE).length === 0,
  gateMdContentMatch(snapped.question, PASSAGE, BASE_GATE).join(" / "),
);

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 전종
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 선지 4개면 반려",
  gateOf(GOOD.replace(`⑤ ${OPTIONS5[4]}\n`, "")).some((i) => i.startsWith("선지 4개")),
);
check(
  "게이트: `근거:` 머리표 누락은 원인을 지목",
  gateOf(GOOD.replace("근거:\n", "")).some((i) => i.includes("`근거:` 머리표가 없어")),
  gateOf(GOOD.replace("근거:\n", "")).join(" / "),
);
check(
  "게이트: 근거 1줄 누락",
  gateOf(GOOD.replace(`⑤ ${S[6]}\n`, "")).some((i) => i.startsWith("근거 4개")),
);
check(
  "게이트: 지어낸 근거 반려",
  gateOf(
    GOOD.replace(S[5], "Every resident planted a sapling in the first week of spring."),
  ).some((i) => i.includes("지어낸 근거")),
  gateOf(GOOD.replace(S[5], "Every resident planted a sapling in the first week of spring.")).join(" / "),
);
check(
  "게이트: 두 문장에 걸친 표기 변형 근거 반려",
  gateOf(
    GOOD.replace(`④ ${S[5]}`, `④ ${S[4].replace(/\.$/, ",")} ${S[5]}`),
  ).some((i) => i.includes("지문 표기와 다름")),
  gateOf(GOOD.replace(`④ ${S[5]}`, `④ ${S[4].replace(/\.$/, ",")} ${S[5]}`)).join(" / "),
);
check(
  "게이트: 한 문장을 두 선지의 근거로 쓰면 반려",
  gateOf(GOOD.replace(`④ ${S[5]}`, `④ ${S[2]}`)).some((i) => i.includes("근거로 함")),
  gateOf(GOOD.replace(`④ ${S[5]}`, `④ ${S[2]}`)).join(" / "),
);
check(
  "게이트: 근거가 지문 등장순이 아니면 반려",
  gateOf(GOOD.replace(`② ${S[2]}\n`, `② ${S[5]}\n`).replace(`④ ${S[5]}\n`, `④ ${S[2]}\n`)).some(
    (i) => i.includes("지문 앞쪽임"),
  ),
);
check(
  "게이트: 근거가 60단어 초과면 반려",
  gateOf(GOOD.replace(`② ${S[2]}`, `② ${PASSAGE} ${PASSAGE}`)).some((i) =>
    i.includes("지문 문장 하나만"),
  ),
);
check(
  "게이트: 선지가 지문 문장 축자 복사면 반려",
  gateOf(GOOD.replace(`② ${OPTIONS5[1]}`, `② ${S[2]}`)).some((i) => i.includes("축자 복사")),
);
check(
  "게이트: 선지 중복 반려",
  gateOf(GOOD.replace(`② ${OPTIONS5[1]}`, `② ${OPTIONS5[0]}`)).some((i) =>
    i.includes("다른 선지와 중복"),
  ),
);
check(
  "게이트: 선지 언어 en 인데 한글 섞이면 반려",
  gateOf(GOOD.replace(`④ ${OPTIONS5[3]}`, "④ 주민들은 센서보다 먼저 시원함을 느꼈다고 말했다.")).some(
    (i) => i.includes("한글이 섞임"),
  ),
);
check(
  "게이트: 선지 언어 ko 인데 영문이면 반려",
  gateOf(GOOD, { ...BASE_GATE, optionLanguage: "ko" }).some((i) => i.includes("한국어가 아님")),
);
check(
  "게이트: 진술문이 너무 짧으면 반려",
  gateOf(GOOD.replace(`④ ${OPTIONS5[3]}`, "④ It was hot.")).some((i) => i.includes("너무 짧아")),
);
check(
  // 프로덕션 검증기의 option-length-giveaway 와 동일 임계(최장 >= 최단 x3 및 차이 18자 초과).
  "게이트: 길이 편중 반려",
  gateOf(
    GOOD.replace(
      `④ ${OPTIONS5[3]}`,
      "④ Sensors and residents disagreed for a long time, and the gap between what people felt while walking along the street in the afternoon and what the instruments actually recorded stayed surprisingly wide for many long years.",
    ),
  ).some((i) => i.includes("길이 편중")),
);
check(
  "게이트: 정답 누락 반려",
  gateOf(GOOD.replace("정답: ③", "정답:")).some((i) => i === "정답 누락"),
);
check(
  "게이트: 정답 라벨이 선지에 없으면 반려",
  gateOf(GOOD.replace("정답: ③", "정답: ⑦")).some((i) => i.includes("정답 라벨(⑦)")),
);
{
  // 정답 축이 확정되지 않았는데 라벨별 파생 검사를 돌리면 "③ 오답해설 누락"
  // (= 정답에 오답해설을 쓰라)이라는 **유해한 재생성 지시**가 나간다. 1회뿐인
  // 재생성이 오지시로 소모되고, 모델이 따르면 정답 라벨이 오답해설에 들어가
  // 다시 반려된다(실패·환불). 원인 한 줄만 자리를 지목해야 한다.
  const unreadable = gateOf(GOOD.replace("정답: ③", "정답: 세 번째 진술"));
  check(
    "게이트: 정답 줄을 못 읽으면 '받은 값' 을 지목",
    unreadable.some((i) => i.includes("라벨을 인식할 수 없음") && i.includes("세 번째 진술")),
    unreadable.join(" / "),
  );
  check(
    "게이트: 정답 미확정 상태에서 '오답해설 누락' 파생 지시를 내지 않음",
    !unreadable.some((i) => i.includes("오답해설 누락")),
    unreadable.join(" / "),
  );
}
{
  // 인식 실패한 줄이 있으면 개수 메시지에 원문 선두를 실어 원인을 지목한다
  // (개수만 알려 주면 모델은 "한 줄 더 쓰라"로 읽고 엉뚱한 곳을 고친다).
  const lost = GOOD.replace(`③ ${OPTIONS5[2]}`, OPTIONS5[2]);
  const issues = gateOf(lost);
  check(
    "게이트: 개수 불일치에 인식 실패 줄을 함께 지목",
    issues.some((i) => i.startsWith("선지 4개") && i.includes("인식하지 못한 줄")),
    issues.join(" / "),
  );
  // 힌트는 **그 구역의** 실패 줄만 싣는다 — 근거 구역의 잔재를 선지 메시지에
  // 실으면 자리 지목이 오히려 틀린 곳을 가리킨다(§1-B 철칙 5).
  const evidenceNoise = GOOD.replace(`③ ${S[3]}`, S[3]);
  check(
    "게이트: 근거 구역 실패 줄은 근거 메시지에만 실린다",
    (() => {
      const list = gateOf(evidenceNoise);
      return (
        list.some((i) => i.startsWith("근거 4개") && i.includes("인식하지 못한 줄")) &&
        !list.some((i) => i.startsWith("선지") && i.includes("인식하지 못한 줄"))
      );
    })(),
    gateOf(evidenceNoise).join(" / "),
  );
}
check(
  "게이트: 정답 개수 불일치 반려",
  gateOf(GOOD.replace("정답: ③", "정답: ②, ③")).some((i) => i.startsWith("정답 2개")),
);
check(
  "게이트: 해설 누락 반려",
  gateOf(GOOD.replace(/^해설: .*$/m, "해설:")).some((i) => i === "해설 누락"),
);
check(
  "게이트: 오답해설 개수 반려",
  gateOf(GOOD.replace(`⑤ ${WRONG5[3][1]}`, "")).some((i) => i.startsWith("오답해설 3개")),
);
check(
  "게이트: 오답해설 라벨 누락·중복 반려",
  (() => {
    const issues = gateOf(GOOD.replace(`① ${WRONG5[0][1]}`, `② ${WRONG5[0][1]}`));
    return issues.some((i) => i.includes("① 오답해설 누락")) && issues.some((i) => i.includes("라벨 중복"));
  })(),
);
check(
  "게이트: 오답해설에 정답 라벨 포함 반려(파서 필터 우회 경로)",
  gateMdContentMatch(
    {
      ...snapped.question,
      wrong: [...snapped.question.wrong, { label: "③", text: "정답인데 끼어듦" }],
    },
    PASSAGE,
    BASE_GATE,
  ).some((i) => i.includes("정답 라벨 포함")),
);
check(
  "게이트: answer-only 모드는 오답해설을 요구하지 않음",
  gateMdContentMatch({ ...snapped.question, wrong: [] }, PASSAGE, {
    ...BASE_GATE,
    requireWrong: false,
  }).length === 0,
);
check(
  "게이트(휴면): 교사 지정 문장이 근거에 없으면 반려",
  gateMdContentMatch(snapped.question, PASSAGE, {
    ...BASE_GATE,
    teacherPoints: [{ text: S[4], unit: "sentence" }],
  }).some((i) => i.includes("교사 지정 문장")),
);
check(
  "게이트(휴면): 교사 지정 문장이 근거면 통과",
  gateMdContentMatch(snapped.question, PASSAGE, {
    ...BASE_GATE,
    teacherPoints: [{ text: S[2], unit: "sentence" }],
  }).length === 0,
);

// ───────────────────────────────────────────────────────────────────────────
// 3. 드리프트 관용 — 전부 5선지 + 게이트 클린이어야 한다(줄 유실 0).
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string][] = [
  ["숫자 라벨(점)", `② ${OPTIONS5[1]}`, `2. ${OPTIONS5[1]}`],
  ["숫자 라벨(괄호)", `② ${OPTIONS5[1]}`, `(2) ${OPTIONS5[1]}`],
  ["숫자 라벨(닫는 괄호)", `② ${OPTIONS5[1]}`, `2) ${OPTIONS5[1]}`],
  ["불릿 접두", `③ ${OPTIONS5[2]}`, `- ③ ${OPTIONS5[2]}`],
  ["별표 불릿", `③ ${OPTIONS5[2]}`, `* ③ ${OPTIONS5[2]}`],
  ["굵게 라벨", `④ ${OPTIONS5[3]}`, `**④** ${OPTIONS5[3]}`],
  ["표 형식 행", `⑤ ${OPTIONS5[4]}`, `| ⑤ | ${OPTIONS5[4]} |`],
  ["라벨 뒤 점", `⑤ ${OPTIONS5[4]}`, `⑤. ${OPTIONS5[4]}`],
  ["라벨 뒤 괄호", `⑤ ${OPTIONS5[4]}`, `⑤) ${OPTIONS5[4]}`],
  ["라벨 뒤 공백 과다", `⑤ ${OPTIONS5[4]}`, `⑤    ${OPTIONS5[4]}`],
  ["근거 줄 불릿", `③ ${S[3]}`, `- ③ ${S[3]}`],
  ["전각 콜론(정답)", "정답: ③", "정답： ③"],
  ["숫자 정답", "정답: ③", "정답: 3"],
  ["정답 뒤 사족", "정답: ③", "정답: ③ — 시점 조건이 빠졌다"],
  ["머리표 뒤 공백", "근거:", "근거:  "],
  ["오답 라벨 숫자", `① ${WRONG5[0][1]}`, `1. ${WRONG5[0][1]}`],
  // ── 잔여 구분자 흡수(silent-drop) — 남으면 학생 표면 선지가 ": …" 로 시작한다.
  //    개수만 단정하던 종전 픽스처가 이 오염을 통과시켰다(텍스트 동등성 단정 추가).
  ["라벨 뒤 콜론", `③ ${OPTIONS5[2]}`, `③: ${OPTIONS5[2]}`],
  ["라벨 뒤 대시", `③ ${OPTIONS5[2]}`, `③ - ${OPTIONS5[2]}`],
  ["라벨 뒤 중점", `③ ${OPTIONS5[2]}`, `③ · ${OPTIONS5[2]}`],
  ["진술문 굵게", `③ ${OPTIONS5[2]}`, `③ **${OPTIONS5[2]}**`],
  ["표 행(양끝 파이프)", `③ ${OPTIONS5[2]}`, `| ③ | ${OPTIONS5[2]} |`],
  // ── 불릿 문자 확대 — CommonMark 표준 `+` 와 대시 불릿에서 줄이 통째로 소멸했다.
  ["플러스 불릿(CommonMark)", `③ ${OPTIONS5[2]}`, `+ ③ ${OPTIONS5[2]}`],
  ["em대시 불릿", `③ ${OPTIONS5[2]}`, `— ③ ${OPTIONS5[2]}`],
  ["en대시 불릿", `③ ${OPTIONS5[2]}`, `– ③ ${OPTIONS5[2]}`],
  ["가운뎃점 불릿", `③ ${OPTIONS5[2]}`, `· ③ ${OPTIONS5[2]}`],
  ["삼각 불릿", `③ ${OPTIONS5[2]}`, `‣ ③ ${OPTIONS5[2]}`],
  ["인용 접두", `③ ${OPTIONS5[2]}`, `> ③ ${OPTIONS5[2]}`],
  ["근거 줄 플러스 불릿", `③ ${S[3]}`, `+ ③ ${S[3]}`],
  ["근거 줄 표 행", `③ ${S[3]}`, `| ③ | ${S[3]} |`],
  // ── 키워드 줄 장식 관용 — 이번 웨이브 최다 결함 계통(silent-drop).
  //    선지 줄에 굵게를 이미 허용하므로 모델 입장에서 머리표 굵게는 같은 장식이다.
  ["정답 값 굵게", "정답: ③", "정답: **③**"],
  ["정답 머리표 굵게", "정답: ③", "**정답:** ③"],
  ["정답 라벨만 굵게", "정답: ③", "**정답**: ③"],
  ["정답 머리표 헤딩", "정답: ③", "## 정답: ③"],
  ["정답 머리표 불릿", "정답: ③", "- 정답: ③"],
  ["정답 값 인라인코드", "정답: ③", "정답: `③`"],
  ["해설 머리표 굵게", "해설: ", "**해설:** "],
  ["해설 머리표 전각콜론", "해설: ", "해설： "],
  ["오답 머리표 굵게", "\n오답:\n", "\n**오답:**\n"],
  ["오답 머리표 별칭", "\n오답:\n", "\n오답 해설:\n"],
  ["근거 머리표 굵게", "\n근거:\n", "\n**근거:**\n"],
  ["근거 머리표 헤딩", "\n근거:\n", "\n### 근거:\n"],
  ["근거 머리표 별칭", "\n근거:\n", "\n근거 문장:\n"],
  ["선지 머리표 굵게", "선지:\n", "**선지:**\n"],
  ["표 구분행 삽입", "근거:\n", "근거:\n|---|---|\n"],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdContentMatch(drifted);
  const issues = gateOf(drifted);
  // 개수뿐 아니라 **텍스트 동등성**까지 단정한다 — 개수만 보면 라벨과 본문 사이
  // 잔여 구분자(`| `·`: `·`- `)가 선지 텍스트에 눌어붙은 채로 통과한다.
  const textClean =
    q.options.every((o, i) => o.text === OPTIONS5[i]) &&
    q.evidence.every((e, i) => e.sentence === EVIDENCE5[i]);
  check(
    `줄 유실 방지: ${name}`,
    q.options.length === 5 && q.evidence.length === 5 && textClean && issues.length === 0,
    `선지 ${q.options.length} · 근거 ${q.evidence.length} · '${q.options[2]?.text}' · ${issues.join(" / ")}`,
  );
}

// 잔여 구분자 오염이 **학생 표면까지** 새지 않는지 전 구간으로 확인한다.
// CONTENT_MATCH 는 PASSTHROUGH + sanitize 대상도 아니라 후처리가 씻어 주지 않는다.
{
  const messy = GOOD.replace(`⑤ ${OPTIONS5[4]}`, `| ⑤ | ${OPTIONS5[4]} |`).replace(
    `③ ${OPTIONS5[2]}`,
    `③: ${OPTIONS5[2]}`,
  );
  const q = autoSnapContentMatchEvidence(parseMdContentMatch(messy), PASSAGE).question;
  const adapt = adaptMdContentMatchToAiQuestion(q, PASSAGE, "KILLER", {
    matchType: "불일치",
    answerCount: 1,
  });
  const pp = postProcessQuestion("CONTENT_MATCH", PASSAGE, (adapt.aiQuestion ?? {}) as never);
  const saved = ((pp.data ?? {}) as Record<string, unknown>).options as Array<Record<string, unknown>>;
  check(
    "표면 무오염: 표 파이프·콜론 잔재가 저장 선지 텍스트에 남지 않음",
    adapt.ok === true && saved?.[2]?.text === OPTIONS5[2] && saved?.[4]?.text === OPTIONS5[4],
    `${adapt.error ?? ""} '${saved?.[2]?.text}' / '${saved?.[4]?.text}'`,
  );
}

// 선지 머리표를 통째로 빠뜨려도 선지 구역을 복원한다.
{
  const noHead = GOOD.replace("선지:\n", "");
  const q = parseMdContentMatch(noHead);
  check(
    "줄 유실 방지: `선지:` 머리표 누락",
    q.options.length === 5 && q.evidence.length === 5 && gateOf(noHead).length === 0,
    `선지 ${q.options.length} · ${gateOf(noHead).join(" / ")}`,
  );
}

// 구역 순서가 뒤바뀌어도(근거 먼저·선지 나중) 서로를 삼키지 않는다.
{
  const optionBlock = OPTIONS5.map((t, i) => `${["①", "②", "③", "④", "⑤"][i]} ${t}`).join("\n");
  const evidenceBlock = EVIDENCE5.map((t, i) => `${["①", "②", "③", "④", "⑤"][i]} ${t}`).join("\n");
  const swapped = GOOD.replace(`선지:\n${optionBlock}\n\n근거:\n${evidenceBlock}`, `근거:\n${evidenceBlock}\n\n선지:\n${optionBlock}`);
  const q = parseMdContentMatch(swapped);
  check(
    "줄 유실 방지: 선지·근거 구역 순서 역전",
    q.options.length === 5 && q.evidence.length === 5 && gateOf(swapped).length === 0,
    `선지 ${q.options.length} · 근거 ${q.evidence.length} · ${gateOf(swapped).join(" / ")}`,
  );
}

// 접힌 줄(긴 근거를 두 줄에 나눠 씀)을 복원한다.
{
  const folded = GOOD.replace(`② ${S[2]}`, "② Mature canopies lowered midday street\ntemperatures by up to three degrees.");
  const q = parseMdContentMatch(folded);
  check(
    "줄 유실 방지: 근거 줄 접힘 복원",
    q.evidence.length === 5 && q.evidence[1].sentence === S[2],
    `근거 ${q.evidence.length} · '${q.evidence[1]?.sentence}'`,
  );
}

// 과잉 관용 방지 — 라벨 없는 산문 줄을 항목으로 오인하지 않는다.
{
  const prose = GOOD.replace("근거:\n", "근거:\nBelow are the passage sentences that decide each statement.\n");
  check(
    "과잉 관용 방지: 라벨 없는 산문 줄 무시",
    parseMdContentMatch(prose).evidence.length === 5,
    `실제 ${parseMdContentMatch(prose).evidence.length}`,
  );
}

check(
  "정답 런 파싱: 선행 라벨만(사족 무시)",
  parseContentMatchAnswerRun("③ — ④는 참이다").join(",") === "③",
  parseContentMatchAnswerRun("③ — ④는 참이다").join(","),
);
check(
  "정답 런 파싱: 복수 정답 병기",
  parseContentMatchAnswerRun("②, ⑤").join(",") === "②,⑤",
  parseContentMatchAnswerRun("②, ⑤").join(","),
);

// ───────────────────────────────────────────────────────────────────────────
// 4. 스냅 — 0원 보정
// ───────────────────────────────────────────────────────────────────────────
{
  // 근거를 문장 일부(절)만 적음 → 문장 전체 축자로 확장.
  const partial = GOOD.replace(`② ${S[2]}`, "② lowered midday street temperatures by up to three degrees");
  const snap = autoSnapContentMatchEvidence(parseMdContentMatch(partial), PASSAGE);
  check(
    "스냅: 근거 절 → 지문 문장 축자 확장",
    snap.corrections.length === 1 && snap.question.evidence[1].sentence === S[2],
    `${snap.corrections.join(" / ")} · '${snap.question.evidence[1]?.sentence}'`,
  );
  check("스냅 후 게이트 클린(절 인용)", gateOf(partial).length === 0, gateOf(partial).join(" / "));
}
{
  // 근거를 살짝 재진술 → 토큰 포함률 압도 문장으로 복원.
  const drifted = GOOD.replace(
    `② ${S[2]}`,
    "② Mature canopies lowered midday street temperatures by three degrees.",
  );
  const snap = autoSnapContentMatchEvidence(parseMdContentMatch(drifted), PASSAGE);
  check(
    "스냅: 재진술 드리프트 → 지문 문장 복원",
    snap.corrections.length === 1 && snap.question.evidence[1].sentence === S[2],
    `${snap.corrections.join(" / ")} · '${snap.question.evidence[1]?.sentence}'`,
  );
}
{
  // 지어낸 근거는 스냅하지 않는다(보수 가드) — 게이트가 잡아야 한다.
  const invented = GOOD.replace(S[5], "Every resident planted a sapling in the first week of spring.");
  const snap = autoSnapContentMatchEvidence(parseMdContentMatch(invented), PASSAGE);
  check("스냅: 지어낸 근거는 보정하지 않음", snap.corrections.length === 0, snap.corrections.join(" / "));
}

// ── 좌표 확정: 단어 경계 + 유일 등장 (critical) ────────────────────────────
// 경계가 없으면 'the' 가 ra"the"r 안에, 'res' 가 temperatu"res" 안에, 'an' 이
// Urb"an" 안에 걸리고, 그 좌표가 스냅으로 흘러 **선지와 무관한 문장**이 근거로
// 확신 있게 인용된다(게이트는 축자·분포·순서를 전부 통과시켜 CLEAN).
check(
  "좌표: 단어 내부 매칭 금지('res'·'an')",
  locateContentMatchSpan(PASSAGE, "res") === null &&
    locateContentMatchSpan(PASSAGE, "an") === null,
  JSON.stringify([locateContentMatchSpan(PASSAGE, "res"), locateContentMatchSpan(PASSAGE, "an")]),
);
check(
  "좌표: 2회 이상 등장하면 자리 미확정('the')",
  locateContentMatchSpan(PASSAGE, "the") === null,
  JSON.stringify(locateContentMatchSpan(PASSAGE, "the")),
);
check(
  "좌표: 유일·경계 일치는 그대로 찾는다",
  (() => {
    const span = locateContentMatchSpan(PASSAGE, S[2]);
    return span !== null && PASSAGE.slice(span.start, span.end) === S[2].replace(/\.$/, "");
  })(),
);
{
  // ② 의 진짜 근거는 S[2] 인데 모델이 'measurements' 한 단어만 적었다.
  // 종전에는 fold indexOf 가 S[1] 안을 먼저 찾아 근거를 **S[1] 전문**으로 갈아
  // 끼우고 게이트가 CLEAN 을 줬다 — 선지와 무관한 문장이 (근거: "…") 로 출하됐다.
  const oneWord = GOOD.replace(`② ${S[2]}`, "② measurements");
  const snap = autoSnapContentMatchEvidence(parseMdContentMatch(oneWord), PASSAGE);
  check(
    "스냅: 짧은·모호한 근거는 문장 전문으로 갈아 끼우지 않음(무관한 문장 인용 차단)",
    snap.corrections.length === 0 && snap.question.evidence[1].sentence === "measurements",
    `${snap.corrections.join(" / ")} · '${snap.question.evidence[1]?.sentence}'`,
  );
  check(
    "게이트: 스냅이 손대지 않은 짧은 근거를 반려(자리 지목)",
    gateOf(oneWord).some((i) => i.includes("② 근거가 지문 문장 전체가 아님")),
    gateOf(oneWord).join(" / "),
  );
}
{
  // 근거 정보량 하한 — 지문 축자 단어 하나로 형식만 만족시키는 경로를 막는다.
  // (`근거:` 구역은 이 유형에 "지문 재구성 일치" 게이트가 없어 추가한 대체물이다.)
  const wordOnly = GOOD.replace(`② ${S[2]}`, "② canopies");
  check(
    "게이트: 한 단어짜리 근거 반려(정보량 하한)",
    gateOf(wordOnly).some((i) => i.includes("지문 문장 전체가 아님")),
    gateOf(wordOnly).join(" / "),
  );
  // 절 인용(내용어 4개 이상)은 종전대로 문장 축자로 확장돼 클린이어야 한다(무회귀).
  const clause = GOOD.replace(`② ${S[2]}`, "② lowered midday street temperatures by up to three degrees");
  check("게이트: 절 인용은 스냅 후 여전히 클린(무회귀)", gateOf(clause).length === 0, gateOf(clause).join(" / "));
}
{
  // 문장 두 개를 이어 붙인 근거는 문장 하한 검사가 잡는다(축자로는 존재한다).
  const twoSentences = GOOD.replace(`④ ${S[5]}`, `④ ${S[4]} ${S[5]}`);
  check(
    "게이트: 두 문장 이어붙인 근거 반려",
    gateOf(twoSentences).some((i) => i.includes("④ 근거가 지문 문장 전체가 아님")),
    gateOf(twoSentences).join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. 어댑터 → 후처리 → 셔플 → 품질검증 왕복
// ───────────────────────────────────────────────────────────────────────────
{
  const adapt = adaptMdContentMatchToAiQuestion(snapped.question, PASSAGE, "KILLER", {
    matchType: "불일치",
    answerCount: 1,
    stemLanguage: "ko",
  });
  check("어댑터: 성공", adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  check(
    "어댑터: 발문을 설정에서 결정론 합성(불일치·단일)",
    ai.direction === "다음 글의 내용과 일치하지 않는 것은?",
    String(ai.direction),
  );
  check("어댑터: matchType 설정값", ai.matchType === "불일치", String(ai.matchType));
  const options = ai.options as Array<Record<string, unknown>>;
  check(
    "어댑터: 선지 라벨 숫자 축 '1'~'5'",
    options.length === 5 && options[0].label === "1" && options[4].label === "5",
  );
  check("어댑터: 선지 텍스트 보존", options[2].text === OPTIONS5[2], String(options[2].text));
  check("어댑터: correctAnswer '3'", ai.correctAnswer === "3", String(ai.correctAnswer));
  check("어댑터: K=1 이면 correctAnswers 미생성", !("correctAnswers" in ai));
  const woe = ai.wrongOptionExplanations as Array<Record<string, unknown>>;
  check(
    "어댑터: 오답해설 4개 · 정답 라벨 제외",
    woe.length === 4 && woe.map((w) => w.label).join(",") === "1,2,4,5",
    woe.map((w) => w.label).join(","),
  );
  check(
    "어댑터: 오답해설에 지문 근거 문장 부착",
    woe.every((w) => typeof w.explanation === "string" && String(w.explanation).includes("근거: ")) &&
      String(woe[0].explanation).includes(S[0]),
    String(woe[0].explanation),
  );
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check(
    "어댑터: 타 유형 이물 필드 없음",
    !("blanks" in ai) &&
      !("passageWithBlank" in ai) &&
      !("passageWithMarkers" in ai) &&
      !("originalExpression" in ai) &&
      !("markedWords" in ai),
  );

  const pp = postProcessQuestion("CONTENT_MATCH", PASSAGE, ai as never);
  check("후처리: 성공(PASSTHROUGH)", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  const ppWoe = data.wrongOptionExplanations as Record<string, string>;
  check(
    "후처리: 오답해설 배열 → Record('1','2','4','5')",
    !Array.isArray(ppWoe) && Object.keys(ppWoe).sort().join(",") === "1,2,4,5",
    Object.keys(ppWoe ?? {}).join(","),
  );
  check(
    "후처리: 선지·정답 무변경(지문 필드 미합성)",
    (data.options as unknown[]).length === 5 &&
      data.correctAnswer === "3" &&
      !("passageWithMarkers" in data),
  );

  // 셔플(SHUFFLE_OPTION_TYPES 멤버) — 정답이 내용을 따라 이동해야 한다.
  let shuffleOk = true;
  let moved = false;
  for (let i = 0; i < 30; i += 1) {
    const shuffled = shuffleQuestionOptionsForDiversity({ ...data }, "CONTENT_MATCH");
    const opts = shuffled.options as Array<Record<string, unknown>>;
    const answerLabel = String(shuffled.correctAnswer);
    const answerOption = opts.find((o) => String(o.label) === answerLabel);
    if (!answerOption || answerOption.text !== OPTIONS5[2]) shuffleOk = false;
    if (answerLabel !== "3") moved = true;
    // 오답해설도 내용을 따라 이동한다 — 라벨이 정답과 겹치면 안 된다.
    const keys = Object.keys(shuffled.wrongOptionExplanations as Record<string, string>);
    if (keys.includes(answerLabel) || keys.length !== 4) shuffleOk = false;
  }
  check("셔플: 정답·오답해설이 선지 내용을 따라 재매핑", shuffleOk);
  check("셔플: 실제로 위치가 분산됨(정답 고정 아님)", moved);

  const issues = validateQuestionQuality({
    typeId: "CONTENT_MATCH",
    question: { ...data, difficulty: "KILLER" },
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    contentMatchType: "불일치",
    stemLanguage: "ko",
    optionLanguage: "en",
  });
  const errors = issues.filter((i) => i.severity === "error");
  check("품질검증: error 0", errors.length === 0, errors.map((e) => `${e.code}:${e.message}`).join(" / "));
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 6지·정답2·일치 — 복수 정답 경로
// ───────────────────────────────────────────────────────────────────────────
const OPTIONS6 = [
  "Street trees have always been treated as essential city infrastructure.",
  "Ten years of readings across three coastal cities overturned the earlier view.",
  "Mature canopies raised midday street temperatures by three degrees.",
  "The cooling effect was measurable in the first season after planting.",
  "Residents felt the difference before the sensors could confirm it.",
  "Maintenance is now budgeted one season at a time.",
];
const GOOD6 = md({
  options: OPTIONS6,
  evidence: [S[0], S[1], S[2], S[3], S[5], S[6]],
  answer: "②, ⑤",
  explanation:
    "십 년간의 측정이 기존 통념을 뒤집었다는 서술과 주민 체감이 센서보다 앞섰다는 서술이 지문에 그대로 있습니다. 나머지 진술은 인과나 시점이 뒤집혀 지문과 어긋납니다.",
  wrong: [
    ["①", "첫 문장은 과거에 장식으로 취급했다고 밝혀 이 진술과 반대입니다."],
    ["③", "지문은 기온을 낮췄다고 했으므로 높였다는 진술은 인과 방향이 뒤집혔습니다."],
    ["④", "냉각 효과는 약 십 년 뒤에야 나타났으므로 첫 계절 진술은 시점 조건이 빠졌습니다."],
    ["⑥", "유지비를 수십 년 단위로 잡는다고 했으므로 한 계절 단위 진술은 어긋납니다."],
  ],
});
const GATE6 = { optionCount: 6, answerCount: 2, optionLanguage: "en" as const };
{
  const q6 = autoSnapContentMatchEvidence(parseMdContentMatch(GOOD6), PASSAGE).question;
  check("6지2정답: 파싱", q6.options.length === 6 && q6.answers.join(",") === "②,⑤", q6.answers.join(","));
  check(
    "6지2정답: 게이트 클린",
    gateMdContentMatch(q6, PASSAGE, GATE6).length === 0,
    gateMdContentMatch(q6, PASSAGE, GATE6).join(" / "),
  );
  const adapt = adaptMdContentMatchToAiQuestion(q6, PASSAGE, "INTERMEDIATE", {
    matchType: "일치",
    answerCount: 2,
    stemLanguage: "ko",
  });
  check("6지2정답: 어댑터 성공", adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  check(
    "6지2정답: 발문이 '모두 고르시오'(일치)",
    ai.direction === "다음 글의 내용과 일치하는 것을 모두 고르시오.",
    String(ai.direction),
  );
  check("6지2정답: correctAnswer '2, 5'", ai.correctAnswer === "2, 5", String(ai.correctAnswer));
  check(
    "6지2정답: correctAnswers 배열 동반",
    Array.isArray(ai.correctAnswers) && (ai.correctAnswers as string[]).join(",") === "2,5",
    JSON.stringify(ai.correctAnswers),
  );
  check(
    "6지2정답: 오답해설 4개(비정답만)",
    (ai.wrongOptionExplanations as unknown[]).length === 4,
  );
  const pp = postProcessQuestion("CONTENT_MATCH", PASSAGE, ai as never);
  const issues = validateQuestionQuality({
    typeId: "CONTENT_MATCH",
    question: { ...(pp.data as Record<string, unknown>), difficulty: "INTERMEDIATE" },
    passage: PASSAGE,
    requestedDifficulty: "INTERMEDIATE",
    contentMatchType: "일치",
    stemLanguage: "ko",
    optionLanguage: "en",
  });
  const errors = issues.filter((i) => i.severity === "error");
  check("6지2정답: 품질검증 error 0", errors.length === 0, errors.map((e) => e.code).join(" / "));
}

// 발문 문형 4분기 + 영어 발문
check(
  "발문: 극성·개수·언어 4분기",
  contentMatchDirection("불일치", 1, "ko") === "다음 글의 내용과 일치하지 않는 것은?" &&
    contentMatchDirection("일치", 1, "ko") === "다음 글의 내용과 일치하는 것은?" &&
    contentMatchDirection("불일치", 3, "ko").includes("모두") &&
    /does NOT match/.test(contentMatchDirection("불일치", 1, "en")) &&
    /matches the content/.test(contentMatchDirection("일치", 1, "en")) &&
    /all the statements that match/.test(contentMatchDirection("일치", 2, "en")),
);

// ───────────────────────────────────────────────────────────────────────────
// 7. 프롬프트 계약
// ───────────────────────────────────────────────────────────────────────────
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdContentMatchPrompt(PASSAGE, "full", d, { optionCount: 8, answerCount: 1 });
  check(
    `프롬프트 ${d}: 난이도 분기 + 8지 스캐폴드 + 지문 포함`,
    p.includes("표적 설계") &&
      p.includes("⑧ ...") &&
      p.includes("## 지문") &&
      p.includes(PASSAGE.slice(0, 40)),
  );
}
{
  const killer = buildMdContentMatchPrompt(PASSAGE, "full", "KILLER");
  const basic = buildMdContentMatchPrompt(PASSAGE, "full", "BASIC");
  check("프롬프트: KILLER 만 few-shot 해부", killer.includes("모범 설계 해부") && !basic.includes("모범 설계 해부"));
  check("프롬프트: 발문 작성 금지 선언", killer.includes("발문 줄을 쓰지 마라"));
  check("프롬프트: 근거 줄 축자 계약", killer.includes("근거:") && killer.includes("한 글자도 바꾸지 말고"));
  check("프롬프트: 지문 등장 순서 계약", killer.includes("지문 등장 순서대로"));
  check("프롬프트: 선지 줄에 참·거짓 칸을 요구하지 않음(단순화 계약)", !/O 또는 X/.test(killer));
  check(
    "프롬프트: 극성 분기(불일치 기본 · 일치 설정)",
    killer.includes("일치하지 않는") &&
      buildMdContentMatchPrompt(PASSAGE, "full", "KILLER", { matchType: "일치" }).includes(
        "오답 진술",
      ),
  );
  check(
    "프롬프트: 선지 언어 분기",
    /진술문은 전부 \*\*영어\*\*/.test(killer) &&
      /진술문은 전부 \*\*한국어\*\*/.test(
        buildMdContentMatchPrompt(PASSAGE, "full", "KILLER", { optionLanguage: "ko" }),
      ),
  );
  check(
    "프롬프트: 복수 정답이면 병기 예시(라벨 앵커링 회피 · 중복 없음)",
    (() => {
      const two = buildMdContentMatchPrompt(PASSAGE, "full", "KILLER", {
        optionCount: 5,
        answerCount: 2,
      });
      const all = buildMdContentMatchPrompt(PASSAGE, "full", "KILLER", {
        optionCount: 5,
        answerCount: 5,
      });
      return (
        two.includes("예: ②, ④") &&
        two.includes('", " 로 이어서') &&
        all.includes("예: ①, ②, ③, ④, ⑤")
      );
    })(),
  );
  check(
    "프롬프트: 개수 클램프(3→5, 99→12 · 정답수 상한)",
    buildMdContentMatchPrompt(PASSAGE, "full", "KILLER", { optionCount: 3 }).includes("⑤ ...") &&
      buildMdContentMatchPrompt(PASSAGE, "full", "KILLER", { optionCount: 99 }).includes("⑫ ...") &&
      buildMdContentMatchPrompt(PASSAGE, "full", "KILLER", {
        optionCount: 5,
        answerCount: 9,
      }).includes("정확히 5개다"),
  );
  check(
    "프롬프트: answer-only 모드는 오답 섹션 미요구",
    !buildMdContentMatchPrompt(PASSAGE, "answer-only", "KILLER").includes("\n오답:"),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. 레인 계약 — 과금 축 · 적격성 · 설정 집행
// ───────────────────────────────────────────────────────────────────────────
function ctxOf(overrides?: Partial<MdLaneContext>): MdLaneContext {
  return {
    passage: PASSAGE,
    difficulty: "KILLER",
    rawDifficulty: "KILLER",
    resolved: { contentMatchOptionCount: 5, contentMatchAnswerCount: 1, contentMatchType: "불일치" },
    rawTypeSettings: null,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
    ...overrides,
  };
}

check("레인: subType CONTENT_MATCH", CONTENT_MATCH_MD_LANE.subType === "CONTENT_MATCH");
check(
  "레인: 과금 QUESTION_GEN_SINGLE (fast VOCAB_TYPES 미포함 유형)",
  CONTENT_MATCH_MD_LANE.operationType === "QUESTION_GEN_SINGLE" &&
    CREDIT_COSTS.QUESTION_GEN_SINGLE > CREDIT_COSTS.QUESTION_GEN_VOCAB,
  String(CONTENT_MATCH_MD_LANE.operationType),
);
check("레인: retryEligible", CONTENT_MATCH_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 5~12지 · 정답 1~선지수",
  CONTENT_MATCH_MD_LANE.isEligible({ contentMatchOptionCount: 5, contentMatchAnswerCount: 1 }) &&
    CONTENT_MATCH_MD_LANE.isEligible({ contentMatchOptionCount: 12, contentMatchAnswerCount: 12 }) &&
    !CONTENT_MATCH_MD_LANE.isEligible({ contentMatchOptionCount: 13, contentMatchAnswerCount: 1 }) &&
    !CONTENT_MATCH_MD_LANE.isEligible({ contentMatchOptionCount: 4, contentMatchAnswerCount: 1 }) &&
    !CONTENT_MATCH_MD_LANE.isEligible({ contentMatchOptionCount: 5, contentMatchAnswerCount: 6 }),
);
check("레인: buildExtras 는 비어 있다(설정은 base·어댑터가 집행)", CONTENT_MATCH_MD_LANE.buildExtras(ctxOf()).length === 0);
check(
  "레인: parseAndGate 클린 통과",
  CONTENT_MATCH_MD_LANE.parseAndGate(GOOD, ctxOf()).gateIssues.length === 0,
  CONTENT_MATCH_MD_LANE.parseAndGate(GOOD, ctxOf()).gateIssues.join(" / "),
);
check(
  "레인: parseAndGate 가 스냅 기록을 올린다",
  CONTENT_MATCH_MD_LANE.parseAndGate(
    GOOD.replace(`② ${S[2]}`, "② lowered midday street temperatures by up to three degrees"),
    ctxOf(),
  ).corrections.length === 1,
);
{
  const ctx = ctxOf();
  const parsedLane = CONTENT_MATCH_MD_LANE.parseAndGate(GOOD, ctx);
  const adapt = CONTENT_MATCH_MD_LANE.adapt(parsedLane, ctx);
  check("레인: adapt 성공 · 발문 극성 집행", adapt.ok === true && adapt.aiQuestion?.direction === "다음 글의 내용과 일치하지 않는 것은?", adapt.error);
}
{
  // 극성 설정이 '일치' 면 발문·matchType 이 함께 뒤집힌다.
  const ctx = ctxOf({
    resolved: { contentMatchOptionCount: 5, contentMatchAnswerCount: 1, contentMatchType: "일치" },
  });
  const adapt = CONTENT_MATCH_MD_LANE.adapt(CONTENT_MATCH_MD_LANE.parseAndGate(GOOD, ctx), ctx);
  check(
    "레인: 극성 '일치' 설정 집행",
    adapt.aiQuestion?.direction === "다음 글의 내용과 일치하는 것은?" &&
      adapt.aiQuestion?.matchType === "일치",
    String(adapt.aiQuestion?.direction),
  );
}
{
  // 발문 언어 설정(en)은 어댑터가 결정론으로 집행한다.
  const ctx = ctxOf({ rawTypeSettings: { CONTENT_MATCH: { stemLanguage: "en" } } });
  const adapt = CONTENT_MATCH_MD_LANE.adapt(CONTENT_MATCH_MD_LANE.parseAndGate(GOOD, ctx), ctx);
  check(
    "레인: 발문 언어 en 집행",
    String(adapt.aiQuestion?.direction).includes("does NOT match"),
    String(adapt.aiQuestion?.direction),
  );
}
{
  // 선지 언어 설정(ko)은 프롬프트와 게이트 양쪽에서 집행된다.
  const ctx = ctxOf({ rawTypeSettings: { CONTENT_MATCH: { optionLanguage: "ko" } } });
  check(
    "레인: 선지 언어 ko 설정이 프롬프트·게이트에 함께 걸린다",
    CONTENT_MATCH_MD_LANE.buildBasePrompt(ctx).includes("진술문은 전부 **한국어**") &&
      CONTENT_MATCH_MD_LANE.parseAndGate(GOOD, ctx).gateIssues.some((i) =>
        i.includes("한국어가 아님"),
      ),
  );
}
{
  // resolved 에 값이 없으면 raw 설정 리더로 폴백한다(레인 자체 기본값 금지).
  const ctx = ctxOf({
    resolved: {},
    rawTypeSettings: { CONTENT_MATCH: { optionCount: 6, answerCount: 2, matchType: "일치" } },
  });
  const meta = CONTENT_MATCH_MD_LANE.mdFormat(ctx);
  check(
    "레인: resolved 공백이면 raw 설정으로 폴백(6지·2정답·일치)",
    meta.optionCount === 6 && meta.answerCount === 2 && meta.matchType === "일치",
    JSON.stringify(meta),
  );
}
{
  // R2 주지적의 **프로덕션 진입점** 재현: 복수 정답에서 라벨별 장식(`정답: **②**, **⑤**`)이
  // 뒤 라벨을 삼키면 레인이 "정답 1개(2개 필요)" + "⑤ 오답해설 누락"(정답에 오답해설을
  // 쓰라는 유해 지시)을 그대로 재생성 피드백에 실었다.
  const ctx = ctxOf({
    resolved: { contentMatchOptionCount: 6, contentMatchAnswerCount: 2, contentMatchType: "일치" },
  });
  const laneParsed = CONTENT_MATCH_MD_LANE.parseAndGate(
    GOOD6.replace("정답: ②, ⑤", "정답: **②**, **⑤**"),
    ctx,
  );
  const adapt = CONTENT_MATCH_MD_LANE.adapt(laneParsed, ctx);
  check(
    "레인: 복수 정답 라벨별 장식(`**②**, **⑤**`)이 전 구간 통과",
    laneParsed.gateIssues.length === 0 &&
      adapt.ok === true &&
      adapt.aiQuestion?.correctAnswer === "2, 5",
    `${laneParsed.gateIssues.join(" / ")} ${adapt.error ?? ""}`,
  );
}
check(
  "레인: qualityArgs 에 극성·언어 실값",
  (() => {
    const args = CONTENT_MATCH_MD_LANE.qualityArgs(ctxOf());
    return args.contentMatchType === "불일치" && args.stemLanguage === "ko" && args.optionLanguage === "en";
  })(),
);
check(
  "레인: mdFormat 포렌식 메타",
  (() => {
    const meta = CONTENT_MATCH_MD_LANE.mdFormat(ctxOf());
    return meta.optionCount === 5 && meta.answerCount === 1 && meta.matchType === "불일치";
  })(),
);
check(
  "레인: diversityTargets = 이미 출제된 정답 진술(지문 축자 아님)",
  CONTENT_MATCH_MD_LANE.diversityTargets({
    options: [
      { label: "1", text: "alpha statement" },
      { label: "2", text: "beta statement" },
      { label: "3", text: "gamma statement" },
    ],
    correctAnswer: "2",
  }).join("|") === "beta statement",
);
check(
  "레인: diversityTargets 복수 정답",
  CONTENT_MATCH_MD_LANE.diversityTargets({
    options: [
      { label: "1", text: "alpha statement" },
      { label: "2", text: "beta statement" },
      { label: "3", text: "gamma statement" },
    ],
    correctAnswers: ["1", "3"],
  }).join("|") === "alpha statement|gamma statement",
);
check(
  "레인: diversityTargets 형상 불명이면 빈 배열(생성 방해 금지)",
  CONTENT_MATCH_MD_LANE.diversityTargets({}).length === 0 &&
    CONTENT_MATCH_MD_LANE.diversityTargets({ options: [{ label: "1", text: "x" }] }).length === 0,
);

// 어댑터 방어 — 정답 개수 계약 위반은 저장 전에 막는다.
{
  const broken: MdContentMatchQuestion = { ...snapped.question, answers: ["③", "④"] };
  const adapt = adaptMdContentMatchToAiQuestion(broken, PASSAGE, "KILLER", {
    matchType: "불일치",
    answerCount: 1,
  });
  check("어댑터 방어: 정답 개수 불일치 실패", adapt.ok === false, adapt.error);
}
{
  const dup: MdContentMatchQuestion = {
    ...snapped.question,
    wrong: [...snapped.question.wrong, { label: "①", text: "중복" }],
  };
  const adapt = adaptMdContentMatchToAiQuestion(dup, PASSAGE, "KILLER", {
    matchType: "불일치",
    answerCount: 1,
  });
  check("어댑터 방어: 오답해설 라벨 중복 실패(조용한 덮어쓰기 차단)", adapt.ok === false, adapt.error);
}

// ───────────────────────────────────────────────────────────────────────────
// 9. 웨이브2 R2 — 장식 전수 회귀(별도 파일, 500줄 규약 분할)
// ───────────────────────────────────────────────────────────────────────────
runContentMatchDecorationFixtures({
  check,
  PASSAGE,
  S,
  GOOD,
  GOOD6,
  OPTIONS5,
  EVIDENCE5,
  WRONG5,
  BASE_GATE,
  GATE6,
  buildMd: md,
});

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
