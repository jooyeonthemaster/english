// 주제/요지(TOPIC_MAIN_IDEA) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → postProcessQuestion → 셔플 → 품질검증까지 왕복.
// 실행: npx tsx scripts/_test-md-topic-main-idea.ts
//
// 형식 계약: 선지 줄은 `<원문자> <텍스트>` 한 형태뿐이고, 정답의 유일 진실원은
// `정답:` 줄이다(줄마다 정답 표시를 받던 계약은 반의어 실사용 반려 2연속의 원인).
// 발문은 서버가 설정으로 확정하므로 모델에게 받지 않는다. 지문 정박점은
// `근거문장:` 한 줄 — 이 유형에 유일한 지문 대조 지점이다.
import {
  autoSnapTopicMainIdea,
  foldForGistMatch,
  locateGistEvidence,
  normalizeGistLabel,
  parseMdTopicMainIdea,
  type MdTopicMainIdeaQuestion,
} from "../src/lib/md-qgen/parser-topic-main-idea";
import { gateMdTopicMainIdea } from "../src/lib/md-qgen/gate-topic-main-idea";
import { runGistPipelineChecks } from "./_test-md-topic-main-idea-pipeline";
import { runGistRegressChecks } from "./_test-md-topic-main-idea-regress";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

const PASSAGE =
  "Streaming platforms promise that their recommendation engines will broaden what listeners encounter. " +
  "The claim is intuitive, since no human curator could survey a catalogue of that size. " +
  "In practice, however, a recommendation is a statistical restatement of choices that have already been made. " +
  "Because the model is trained on what a listener has approved before, its suggestions drift toward the center of that history. " +
  "The catalogue that appears to be infinite is therefore experienced as a narrow corridor. " +
  "What expands is the number of available items, not the range of taste that a listener actually exercises.";

const EVIDENCE =
  "What expands is the number of available items, not the range of taste that a listener actually exercises.";

// 요지 모드(보기 언어 ko) — 정답을 ③에 두어 라벨→숫자 축 변환을 실제로 검증한다.
const GOOD = `근거문장: ${EVIDENCE}
① 추천 알고리즘은 사람이 감당할 수 없는 규모의 목록을 대신 훑어 이용자가 몰랐던 취향을 발견하게 해 줍니다.
② 추천 모델이 과거 데이터에 치우치지 않도록 기업은 알고리즘의 작동 방식을 공개해야 합니다.
③ 추천 알고리즘은 이용자가 이미 승인한 선택을 통계적으로 재생산하기 때문에 목록이 넓어 보여도 실제 취향의 폭은 좁아집니다.
④ 이용자에게 제시되는 항목의 수는 플랫폼이 보유한 목록의 규모에 따라 결정됩니다.
⑤ 추천 알고리즘은 이용자의 과거 선택을 재료로 삼아 취향의 폭을 꾸준히 넓혀 왔습니다.
정답: ③
해설: 글은 추천이 새로움을 넓혀 준다는 통념을 제시한 뒤 추천이 이미 승인된 선택의 통계적 재진술이라는 근거로 이를 반박합니다. 마지막 문장이 늘어나는 것은 항목의 수일 뿐 실제로 행사되는 취향의 폭이 아니라고 못 박으므로, 글 전체를 대표하는 진술은 취향의 폭이 좁아진다는 것입니다.
오답:
① 도입부함정 — 반박 이전의 통념을 그대로 옮겨 매력적이지만 글은 그 통념을 곧바로 뒤집습니다.
② 범위확대 — 소재는 같지만 작동 방식을 공개해야 한다는 처방은 지문이 하지 않은 주장입니다.
④ 세부과장 — 항목의 수라는 표면 사실만 말해 필자의 판단이 빠져 있습니다.
⑤ 방향반대 — 핵심어는 정답과 같지만 취향의 폭이 넓어졌다고 방향을 뒤집었습니다.`;

// 주제 모드(보기 언어 en) — 선지는 영어 명사구다.
const GOOD_TOPIC = `근거문장: ${EVIDENCE}
① how streaming platforms assemble catalogues of enormous size
② the way recommendation engines narrow taste by recycling past approvals
③ the need for open disclosure of how ranking models are trained
④ a human curator's advantage over statistical models in music selection
⑤ the steady widening of listener taste driven by data-based suggestion
정답: ②
해설: 글은 추천이 선택의 폭을 넓힌다는 통념을 제시한 뒤 추천이 과거 선택의 통계적 재진술임을 들어 반박합니다. 늘어나는 것은 항목의 수일 뿐이라는 마지막 문장이 논지를 확정하므로 중심 화제는 추천이 취향을 좁힌다는 것입니다.
오답:
① 범위축소 — 목록의 규모는 소재일 뿐 필자의 관점이 빠져 있습니다.
③ 범위확대 — 지문이 하지 않은 제도적 처방으로 확장했습니다.
④ 근거없음 — 사람 큐레이터와의 우열은 지문에 근거가 없습니다.
⑤ 방향반대 — 핵심어는 같지만 논지의 방향이 정반대입니다.`;

const KO_OPTS = { optionCount: 5, answerCount: 1, gistMode: "MAIN_IDEA" } as const;
const EN_OPTS = { optionCount: 5, answerCount: 1, gistMode: "TOPIC" } as const;

function snapOf(text: string): MdTopicMainIdeaQuestion {
  return autoSnapTopicMainIdea(parseMdTopicMainIdea(text), PASSAGE).question;
}
function gateOf(text: string, opts = KO_OPTS): string[] {
  return gateMdTopicMainIdea(snapOf(text), PASSAGE, opts);
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdTopicMainIdea(GOOD);
check("파싱: 선지 5개", parsed.options.length === 5, `실제 ${parsed.options.length}`);
check("파싱: 라벨 ①~⑤ 순서", parsed.options.map((o) => o.label).join("") === "①②③④⑤");
check("파싱: 정답 ③ 단일", parsed.answers.join(",") === "③", parsed.answers.join(","));
check("파싱: 근거문장 축자", parsed.evidence === EVIDENCE, parsed.evidence);
check("파싱: 오답해설 4개", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check("파싱: 오답해설 라벨이 비정답 집합", parsed.wrong.map((w) => w.label).join("") === "①②④⑤");
check("파싱: 해설 존재", parsed.explanation.length > 20);
check("파싱: 해설이 오답 블록을 삼키지 않음", !parsed.explanation.includes("도입부함정"));

const snapped = autoSnapTopicMainIdea(parsed, PASSAGE);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
check(
  "게이트: 정상 입력 클린(요지 모드)",
  gateMdTopicMainIdea(snapped.question, PASSAGE, KO_OPTS).length === 0,
  gateMdTopicMainIdea(snapped.question, PASSAGE, KO_OPTS).join(" / "),
);
check(
  "게이트: 정상 입력 클린(주제 모드)",
  gateOf(GOOD_TOPIC, EN_OPTS).length === 0,
  gateOf(GOOD_TOPIC, EN_OPTS).join(" / "),
);
check("정박 유틸: 근거문장 지문 위치 확정", locateGistEvidence(PASSAGE, EVIDENCE) === EVIDENCE);
check(
  "정박 유틸: 재진술은 위치 확정 실패",
  locateGistEvidence(PASSAGE, "What grows is only the number of items available to a listener.") === null,
);
check(
  "정박 유틸: 구두점 무관 fold",
  foldForGistMatch("The claim is intuitive, since no human curator...") ===
    "the claim is intuitive since no human curator",
  foldForGistMatch("The claim is intuitive, since no human curator..."),
);
check(
  "라벨 정규화: 원문자·숫자·괄호 모두 흡수",
  normalizeGistLabel("③") === "③" &&
    normalizeGistLabel("3") === "③" &&
    normalizeGistLabel("(3)") === "③" &&
    normalizeGistLabel("3.") === "③" &&
    normalizeGistLabel("9") === "" &&
    normalizeGistLabel("") === "",
);

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 전종
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 선지 4개면 반려",
  gateOf(GOOD.replace("⑤ 추천 알고리즘은 이용자의 과거 선택을 재료로 삼아 취향의 폭을 꾸준히 넓혀 왔습니다.\n", "")).some(
    (i) => i.startsWith("선지 4개"),
  ),
);
check(
  "게이트: 라벨 중복 반려",
  gateOf(GOOD.replace("② 추천 모델이", "① 추천 모델이")).some((i) => i.includes("선지 라벨이")),
);
check(
  "게이트: 선지 텍스트 중복 반려",
  gateOf(
    GOOD.replace(
      "④ 이용자에게 제시되는 항목의 수는 플랫폼이 보유한 목록의 규모에 따라 결정됩니다.",
      "④ 추천 알고리즘은 사람이 감당할 수 없는 규모의 목록을 대신 훑어 이용자가 몰랐던 취향을 발견하게 해 줍니다.",
    ),
  ).some((i) => i.includes("선지 텍스트 중복")),
);
check(
  "게이트: 정답 누락 반려",
  gateOf(GOOD.replace("정답: ③\n", "")).some((i) => i === "정답 누락"),
);
check(
  "게이트: 정답 라벨이 선지에 없으면 반려",
  gateOf(GOOD.replace("정답: ③", "정답: ⑧")).some((i) => i.includes("정답 라벨(⑧)이 선지에 없음")),
);
check(
  "게이트: 정답 개수 불일치 반려",
  gateOf(GOOD.replace("정답: ③", "정답: ②, ④")).some((i) => i.startsWith("정답 2개")),
);
check(
  "게이트: 해설 누락 반려",
  gateOf(GOOD.replace(/^해설:.*$/m, "")).some((i) => i === "해설 누락"),
);
check(
  "게이트: 근거문장 누락 반려",
  gateOf(GOOD.replace(/^근거문장:.*\n/m, "")).some((i) => i.includes("근거문장 누락")),
);
check(
  "게이트: 근거문장 재진술 반려(지문 정박 실패)",
  gateOf(
    GOOD.replace(EVIDENCE, "What grows is only the number of items, not the taste a listener uses."),
  ).some((i) => i.includes("근거문장이 지문에 축자로 없음")),
);
check(
  "게이트: 오답해설 개수 부족 반려",
  gateOf(GOOD.replace("④ 세부과장 — 항목의 수라는 표면 사실만 말해 필자의 판단이 빠져 있습니다.\n", "")).some(
    (i) => i.startsWith("오답해설 3개"),
  ),
);
check(
  "게이트: 특정 라벨 오답해설 누락을 지목",
  gateOf(GOOD.replace("④ 세부과장 — 항목의 수라는 표면 사실만 말해 필자의 판단이 빠져 있습니다.\n", "")).some(
    (i) => i === "④ 오답해설 누락",
  ),
);
{
  const q = snapOf(GOOD);
  check(
    "게이트: 오답해설에 정답 라벨 포함 반려",
    gateMdTopicMainIdea(
      { ...q, wrong: [...q.wrong, { label: "③", text: "정답인데 끼어듦" }] },
      PASSAGE,
      KO_OPTS,
    ).some((i) => i === "오답해설에 정답 라벨 포함"),
  );
  check(
    "게이트: 오답해설 라벨 중복 반려",
    gateMdTopicMainIdea(
      { ...q, wrong: [...q.wrong, { label: "①", text: "중복 해설" }] },
      PASSAGE,
      KO_OPTS,
    ).some((i) => i.includes("오답해설 라벨 중복")),
  );
}
check(
  "게이트: 요지 모드에 영어 선지 반려",
  gateOf(
    GOOD.replace(
      "④ 이용자에게 제시되는 항목의 수는 플랫폼이 보유한 목록의 규모에 따라 결정됩니다.",
      "④ the number of items shown to a listener depends on catalogue size",
    ),
  ).some((i) => i.includes("한국어 진술문이 아님")),
);
check(
  "게이트: 주제 모드에 한국어 선지 반려",
  gateOf(GOOD, EN_OPTS).some((i) => i.includes("영어 주제 표현이 아님")),
);
check(
  "게이트: 주제 모드 지문 축자 복사 선지 반려",
  gateOf(
    GOOD_TOPIC.replace(
      "① how streaming platforms assemble catalogues of enormous size",
      "① the range of taste that a listener actually exercises",
    ),
    EN_OPTS,
  ).some((i) => i.includes("지문 축자 복사")),
);
check(
  "게이트: 해설의 번호 지칭 반려(셔플 무력화 방지)",
  gateOf(GOOD.replace("글 전체를 대표하는 진술은", "3번이 보여 주듯 글 전체를 대표하는 진술은")).some(
    (i) => i.includes("번호로 지칭"),
  ),
);
check(
  "게이트: 오답해설의 번호 지칭 반려",
  gateOf(GOOD.replace("① 도입부함정 —", "① 도입부함정 — 선지 1은")).some((i) =>
    i.includes("번호로 지칭"),
  ),
);
check(
  "게이트: 선지 안 정답 표시 잔존 반려",
  gateOf(GOOD.replace("좁아집니다.", "좁아집니다. (정답) 이 점이 핵심입니다.")).some((i) =>
    i.includes("정답 표시가 남아 있음"),
  ),
);
check(
  "게이트: 선지 텍스트 누락 반려",
  gateMdTopicMainIdea(
    {
      ...snapOf(GOOD),
      options: snapOf(GOOD).options.map((o) => (o.label === "②" ? { ...o, text: "   " } : o)),
    },
    PASSAGE,
    KO_OPTS,
  ).some((i) => i === "② 선지 텍스트 누락"),
);
check(
  "게이트: answer-only 모드는 오답해설 개수를 묻지 않음",
  gateMdTopicMainIdea({ ...snapOf(GOOD), wrong: [] }, PASSAGE, {
    ...KO_OPTS,
    requireWrong: false,
  }).length === 0,
);

// ───────────────────────────────────────────────────────────────────────────
// 3. 드리프트 관용 — 전부 선지 5개 + 게이트 클린이어야 한다.
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string][] = [
  ["불릿 접두", "① 추천 알고리즘은 사람이", "- ① 추천 알고리즘은 사람이"],
  ["별표 불릿", "② 추천 모델이", "* ② 추천 모델이"],
  ["굵게 라벨", "② 추천 모델이", "**②** 추천 모델이"],
  ["표 형식 행", "④ 이용자에게", "| ④ | 이용자에게"],
  ["숫자 점 라벨", "③ 추천 알고리즘은 이용자가", "3. 추천 알고리즘은 이용자가"],
  ["괄호 숫자 라벨", "④ 이용자에게", "(4) 이용자에게"],
  ["라벨 뒤 공백 과다", "⑤ 추천 알고리즘은 이용자의", "⑤    추천 알고리즘은 이용자의"],
  ["전각 콜론(정답)", "정답: ③", "정답： ③"],
  ["숫자 정답", "정답: ③", "정답: 3"],
  ["괄호 숫자 정답", "정답: ③", "정답: (3)"],
  ["정답 뒤 산문", "정답: ③", "정답: ③ — 나머지는 모두 그럴듯한 함정입니다"],
  ["근거 라벨 변형", "근거문장:", "근거 문장:"],
  ["근거 라벨 축약", "근거문장:", "근거:"],
  ["오답 라벨 숫자", "① 도입부함정 —", "1. 도입부함정 —"],
  ["괄호 닫기 라벨", "② 추천 모델이", "2) 추천 모델이"],
  ["콜론 뒤 공백 없음", "정답: ③", "정답:③"],
  ["굵게 머리표(정답)", "정답: ③", "**정답: ③**"],
  ["굵게 머리표(정답, 콜론 뒤 닫힘)", "정답: ③", "**정답:** ③"],
  ["굵게 머리표(근거문장)", "근거문장:", "**근거문장:**"],
  ["굵게 머리표(해설)", "해설: 글은", "**해설:** 글은"],
  ["굵게 머리표(오답)", "오답:\n", "**오답:**\n"],
  ["머리표 불릿", "오답:\n", "- 오답:\n"],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = snapOf(drifted);
  const issues = gateMdTopicMainIdea(q, PASSAGE, KO_OPTS);
  check(
    `드리프트 관용: ${name}`,
    q.options.length === 5 && q.answers.join(",") === "③" && issues.length === 0,
    `선지 ${q.options.length}개 · 정답 ${q.answers.join(",")} · ${issues.join(" / ")}`,
  );
}
{
  // 오답 목록에 정답 줄을 끼워 넣는 실측 패턴 — 파서가 걸러내고 게이트는 클린.
  const drifted = GOOD.replace(
    "오답:\n",
    "오답:\n③ 정답이라 여기 없어야 하는데 모델이 끼워 넣음\n",
  );
  const q = snapOf(drifted);
  check(
    "드리프트 관용: 오답 목록 속 정답 줄 제거",
    q.wrong.length === 4 && gateMdTopicMainIdea(q, PASSAGE, KO_OPTS).length === 0,
    `${q.wrong.length}개 · ${gateMdTopicMainIdea(q, PASSAGE, KO_OPTS).join(" / ")}`,
  );
}
{
  // 모델이 발문 줄을 굳이 출력한 경우 — 파서가 무시하고 어댑터가 확정 발문을 쓴다.
  const withStem = GOOD.replace(
    "근거문장:",
    "발문: 다음 글의 요지로 가장 적절한 것은?\n근거문장:",
  );
  const q = snapOf(withStem);
  check(
    "드리프트 관용: 모델이 낸 발문 줄 무시(발문의 진실원은 설정)",
    q.options.length === 5 && gateMdTopicMainIdea(q, PASSAGE, KO_OPTS).length === 0,
    gateMdTopicMainIdea(q, PASSAGE, KO_OPTS).join(" / "),
  );
}
{
  // 과잉 관용 방지 — 라벨 없는 산문·연도 숫자 줄을 선지로 오인하지 않는다.
  const prose = GOOD.replace(
    "① 추천 알고리즘은 사람이",
    "2026년에는 추천 방식이 또 달라질 것입니다.\n① 추천 알고리즘은 사람이",
  );
  check(
    "과잉 관용 방지: 연도로 시작하는 산문 줄 무시",
    parseMdTopicMainIdea(prose).options.length === 5,
    `실제 ${parseMdTopicMainIdea(prose).options.length}개`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. 스냅(0원 보정)
// ───────────────────────────────────────────────────────────────────────────
{
  const shuffledOrder = GOOD.replace(
    "① 추천 알고리즘은 사람이 감당할 수 없는 규모의 목록을 대신 훑어 이용자가 몰랐던 취향을 발견하게 해 줍니다.\n② 추천 모델이",
    "② 추천 모델이",
  ).replace(
    "③ 추천 알고리즘은 이용자가",
    "① 추천 알고리즘은 사람이 감당할 수 없는 규모의 목록을 대신 훑어 이용자가 몰랐던 취향을 발견하게 해 줍니다.\n③ 추천 알고리즘은 이용자가",
  );
  const s = autoSnapTopicMainIdea(parseMdTopicMainIdea(shuffledOrder), PASSAGE);
  check(
    "스냅: 선지 제시 순서를 라벨 순으로 정렬",
    s.corrections.some((c) => c.includes("정렬")) &&
      s.question.options.map((o) => o.label).join("") === "①②③④⑤",
    s.corrections.join(" / "),
  );
}
{
  const s = autoSnapTopicMainIdea(
    parseMdTopicMainIdea(GOOD.replace("좁아집니다.", "좁아집니다. (정답)")),
    PASSAGE,
  );
  check(
    "스냅: 선지 끝 정답 표시 제거(학생 표면 누출 차단)",
    s.corrections.some((c) => c.includes("정답 표시 제거")) &&
      !s.question.options.some((o) => o.text.includes("(정답)")) &&
      gateMdTopicMainIdea(s.question, PASSAGE, KO_OPTS).length === 0,
    s.corrections.join(" / "),
  );
}
{
  const s = autoSnapTopicMainIdea(
    parseMdTopicMainIdea(GOOD.replace("② 추천 모델이", "② (2) 추천 모델이")),
    PASSAGE,
  );
  check(
    "스냅: 선지 앞 중복 번호 제거",
    s.corrections.some((c) => c.includes("중복 번호")) &&
      s.question.options[1].text.startsWith("추천 모델이"),
    s.corrections.join(" / "),
  );
}
{
  // 종결 구두점을 빠뜨린 인용 — 지문 축자로 되돌린다.
  const s = autoSnapTopicMainIdea(
    parseMdTopicMainIdea(GOOD.replace(`근거문장: ${EVIDENCE}`, `근거문장: ${EVIDENCE.slice(0, -1)}`)),
    PASSAGE,
  );
  check(
    "스냅: 근거문장 구두점 드리프트를 축자로 보정",
    s.corrections.some((c) => c.includes("축자로 보정")) && s.question.evidence === EVIDENCE,
    `${s.corrections.join(" / ")} · '${s.question.evidence}'`,
  );
}
{
  // 따옴표로 감싼 인용 — 게이트가 통과하도록 벗겨 낸다.
  const s = autoSnapTopicMainIdea(
    parseMdTopicMainIdea(GOOD.replace(`근거문장: ${EVIDENCE}`, `근거문장: "${EVIDENCE}"`)),
    PASSAGE,
  );
  check(
    "스냅: 근거문장 감싼 따옴표 제거",
    s.question.evidence === EVIDENCE && gateMdTopicMainIdea(s.question, PASSAGE, KO_OPTS).length === 0,
    `'${s.question.evidence}'`,
  );
}
{
  // 연속하지 않은 두 문장을 붙여 쓴 경우 — 찾아지는 가장 긴 한 문장으로 축약.
  const joined = `${EVIDENCE} The claim is intuitive, since no human curator could survey a catalogue of that size.`;
  const s = autoSnapTopicMainIdea(
    parseMdTopicMainIdea(GOOD.replace(`근거문장: ${EVIDENCE}`, `근거문장: ${joined}`)),
    PASSAGE,
  );
  check(
    "스냅: 두 문장 결합을 축자 한 문장으로 축약",
    s.corrections.some((c) => c.includes("한 문장으로 축약")) && s.question.evidence === EVIDENCE,
    `${s.corrections.join(" / ")} · '${s.question.evidence}'`,
  );
}


// ───────────────────────────────────────────────────────────────────────────
// 5~8. 어댑터·후처리·셔플·품질검증 · 설정 집행 · 프롬프트 · 레인 계약
//     (파일 500줄 규약으로 후단은 -pipeline.ts 로 갈랐다 — 같은 카운터를 공유한다)
// ───────────────────────────────────────────────────────────────────────────
runGistPipelineChecks({ check, PASSAGE, GOOD, GOOD_TOPIC, snapOf });

// ───────────────────────────────────────────────────────────────────────────
// 9. 적대검수 wave2 회귀 픽스처 — 재현된 결함 하나당 검사 하나(-regress.ts)
// ───────────────────────────────────────────────────────────────────────────
runGistRegressChecks({ check, PASSAGE, EVIDENCE, GOOD, GOOD_TOPIC, snapOf });

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
