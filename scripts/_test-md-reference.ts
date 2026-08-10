// 지칭 추론(REFERENCE) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → processReference 왕복 → 형식 검증기 → 과금 축까지.
// 실행: npx tsx scripts/_test-md-reference.ts
//
// 이 유형의 급소는 "밑줄 자리의 유일 확정"이다 — 같은 대명사가 근처에 또 있어도
// 후처리가 **모델이 지목한 그 출현**에 밑줄을 그어야 한다. 아래 REPEAT 픽스처가
// 그 왕복을 원문 좌표까지 단정한다.
import {
  autoSnapReference,
  buildReferenceContext,
  isReferencePronoun,
  locateReferenceTarget,
  parseMdReference,
  referenceContextResolves,
  referenceTargetOf,
  stripReferenceMarks,
} from "../src/lib/md-qgen/parser-reference";
import {
  gateMdReference,
  referencePronounUsageIssue,
} from "../src/lib/md-qgen/gate-reference";
import { adaptMdReferenceToAiQuestion } from "../src/lib/md-qgen/adapter-reference";
import { REFERENCE_MD_LANE } from "../src/lib/md-qgen/lane-reference";
import { buildMdReferencePrompt } from "../src/lib/md-qgen/prompts-reference";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateReferenceQuestion } from "../src/lib/question-quality/validators/reference";
import { CREDIT_COSTS } from "../src/lib/credit-costs";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

// ───────────────────────────────────────────────────────────────────────────
// 픽스처
// ───────────────────────────────────────────────────────────────────────────
const TARGET_SENTENCE =
  "The planners archived every objection they had collected during the residents’ review, and later cities reused them, skipping years of consultation.";

const PASSAGE =
  "City planners once treated public objections as noise to be managed. " +
  `${TARGET_SENTENCE} ` +
  "Residents who had filed those complaints never learned that their words had traveled so far. " +
  "Archivists now argue that such records deserve the same care as engineering drawings.";

const MARKED = TARGET_SENTENCE.replace("reused them,", "reused [[them]],");

const GOOD = `밑줄문장: ${MARKED}

① 훗날 계획을 참고한 다른 도시들
② 계획가들이 모아 둔 반대 의견들
③ 계획을 세운 도시 계획가들
④ 도시 계획 절차 전체
⑤ 반대 의견을 낸 주민들
정답: ②
해설: 밑줄 친 대명사는 '계획가들이 모아 둔 반대 의견들'을 가리킵니다. 앞 절이 반대 의견을 모아 보관했다고 밝히고 뒤 절이 그 기록을 다시 써서 협의 기간을 줄였다고 말하므로, 지칭 대상은 도시가 아니라 모아 둔 의견 기록입니다.
오답:
① 최근접 명사 함정 — 바로 앞 주어와 수가 같아 위치상 가장 유혹적이지만, 다시 쓰인 것은 도시가 아니라 기록입니다.
③ 역할 전도 — 의견을 모은 주체라 같은 문장에 등장하지만, 재사용되는 대상은 그 주체가 아닙니다.
④ 범위 이동 — 실제 지칭보다 한 단계 넓은 범주여서 재사용 대상이 될 수 없습니다.
⑤ 다른 마디의 주역 — 앞뒤 문장의 주역이지만 이 자리에서 다시 쓰인 것은 사람이 아니라 기록입니다.`;

function withSentence(marked: string): string {
  return GOOD.replace(`밑줄문장: ${MARKED}`, `밑줄문장: ${marked}`);
}

function gateOf(md: string, passage = PASSAGE): string[] {
  const q = autoSnapReference(parseMdReference(md), passage).question;
  return gateMdReference(q, passage);
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로 — 파싱 · 마커 해석 · 좌표 확정
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdReference(GOOD);
check("파싱: 밑줄문장 한 줄 확보", parsed.markedSentence === MARKED, parsed.markedSentence.slice(0, 60));
check("파싱: 선지 5개", parsed.options.length === 5, `실제 ${parsed.options.length}`);
check("파싱: 선지 라벨 ①~⑤ 순서", parsed.options.map((o) => o.label).join("") === "①②③④⑤");
check("파싱: 정답 ②", parsed.answer === "②", parsed.answer);
check("파싱: 해설 존재", parsed.explanation.length > 20);
check("파싱: 오답해설 4개", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check(
  "파싱: 오답해설 라벨이 정답을 제외한 ①③④⑤",
  parsed.wrong.map((w) => w.label).join("") === "①③④⑤",
);

const target = referenceTargetOf(parsed.markedSentence);
check("마커 해석: 마커 1개", target.markCount === 1, String(target.markCount));
check("마커 해석: 대명사 them", target.pronoun === "them", target.pronoun);
check("마커 해석: before 축자", target.before.endsWith("reused "), target.before.slice(-20));
check("마커 해석: after 축자", target.after.startsWith(","), target.after.slice(0, 20));
check(
  "마커 제거: 원문 문장 복원",
  stripReferenceMarks(parsed.markedSentence) === TARGET_SENTENCE,
);

const loc = locateReferenceTarget(PASSAGE, target);
check("좌표 확정: 위치 확보", loc !== null);
check(
  "좌표 확정: 원문 인덱스가 실제 them 자리",
  loc !== null && loc.index === PASSAGE.indexOf("them,") && loc.length === 4,
  loc ? `${loc.index} vs ${PASSAGE.indexOf("them,")}` : "null",
);
check("좌표 확정: 문장 유일 등장", loc !== null && loc.matchCount === 1);
check("좌표 확정: 대소문자 완화 불필요", loc !== null && loc.caseRelaxed === false);
check(
  "좌표 확정: span 이 문장 전체",
  loc !== null && PASSAGE.slice(loc.spanStart, loc.spanEnd) === TARGET_SENTENCE,
);

const ctx0 = loc ? buildReferenceContext(PASSAGE, loc.index, loc.length) : "";
check("문맥 창: 원문 축자 조각", ctx0.length > 20 && PASSAGE.includes(ctx0), ctx0.slice(0, 40));
check(
  "문맥 창: 후처리 규칙으로 같은 자리를 지목",
  loc !== null && referenceContextResolves(PASSAGE, ctx0, loc.index, loc.length),
);

const snapped = autoSnapReference(parsed, PASSAGE);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
check(
  "게이트: 정상 입력 클린",
  gateMdReference(snapped.question, PASSAGE).length === 0,
  gateMdReference(snapped.question, PASSAGE).join(" / "),
);

// 대명사 자격 판정 유닛
check("대명사 자격: them/they/this 허용", isReferencePronoun("them") && isReferencePronoun("They") && isReferencePronoun("this"));
check("대명사 자격: 일반 명사 거부", !isReferencePronoun("objection") && !isReferencePronoun("such"));
check(
  "용법 판정: 허사 it 프레임 검출",
  referencePronounUsageIssue("it", " is clear that reefs cannot survive.") !== null &&
    referencePronounUsageIssue("it", " takes decades to rebuild a reef.") !== null,
);
check(
  "용법 판정: 정상 it 은 통과(오탐 방지)",
  referencePronounUsageIssue("it", " was designed to fit the older frame.") === null &&
    referencePronounUsageIssue("it", " survived the storm.") === null,
);
// 회귀 고정 — 허사 프레임 #1 에 후행 that/to 요구가 빠져 `it is/was + 평가형용사`
// 형태의 **정상 지칭 it 전부**가 반려되던 결함(적대검수 major). it 은 이 유형의
// 최다 표적이라 이 오탐 하나가 반려율을 구조적으로 끌어올렸다.
for (const after of [
  " is remarkable for its detail.",
  " was clear evidence that warming had crossed a threshold.",
  " is common practice among archivists.",
  " was difficult terrain for the settlers.",
  " is useful mainly because the data are open.",
  " seems obvious now.",
  " is now widely known among archivists.",
]) {
  check(
    `용법 판정(오탐 회귀): 정상 지칭 it 통과 — it${after}`,
    referencePronounUsageIssue("it", after) === null,
    String(referencePronounUsageIssue("it", after)),
  );
}
// 같은 수정으로 **진짜 허사**가 새지 않는지 반대 방향도 고정한다.
for (const after of [
  " is clear that reefs cannot survive rapid warming.",
  " is important to note that the data are open.",
  " is worth noting that the ledger survived.",
  " was difficult for the settlers to clear the ridge.",
  " takes decades to rebuild a reef.",
  " has long been argued that memory is reconstructive.",
  " is widely believed that the ruins are older.",
  " follows that the estimate was wrong.",
  " turns out that the map was forged.",
]) {
  check(
    `용법 판정: 진짜 허사 it 반려 — it${after}`,
    referencePronounUsageIssue("it", after) !== null,
  );
}
check(
  "용법 판정: 접속사 that 반려 · 지시대명사 that 통과",
  referencePronounUsageIssue("that", " such records deserve care.") !== null &&
    referencePronounUsageIssue("that", " is why the archive survived.") === null,
);

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 전종
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 밑줄문장 누락 반려",
  gateOf(GOOD.replace(`밑줄문장: ${MARKED}\n`, "")).some((i) => i.includes("밑줄문장 누락")),
);
check(
  "게이트: 마커 0개 반려",
  gateOf(withSentence(TARGET_SENTENCE)).some((i) => i.includes("밑줄 마커 0개")),
);
check(
  "게이트: 마커 2개 반려",
  gateOf(withSentence(MARKED.replace("later cities", "later [[cities]]"))).some((i) =>
    i.includes("밑줄 마커 2개"),
  ),
);
check(
  "게이트: 지문 무단 편집 반려(축자 없음)",
  gateOf(withSentence(MARKED.replace("skipping years", "skipping many years"))).some((i) =>
    i.includes("지문에 축자로 없음"),
  ),
);
check(
  "게이트: 표적이 대명사가 아니면 반려",
  gateOf(
    withSentence(
      TARGET_SENTENCE.replace("every objection", "every [[objection]]"),
    ),
  ).some((i) => i.includes("지칭 추론 대상 대명사가 아님")),
);
check(
  "게이트: 접속사 that 표적 반려",
  gateOf(
    withSentence("Archivists now argue [[that]] such records deserve the same care as engineering drawings."),
  ).some((i) => i.includes("접속사")),
);

const IT_PASSAGE =
  "Coral reefs shelter a quarter of all marine species. It is clear that reefs cannot survive rapid warming.";
check(
  "게이트: 허사 it 표적 반려",
  gateOf(
    withSentence("[[It]] is clear that reefs cannot survive rapid warming."),
    IT_PASSAGE,
  ).some((i) => i.includes("허사 it")),
);

const HEAD_PASSAGE =
  "They arrived in winter and built the first shelters. Later settlers found the site already cleared.";
check(
  "게이트: 지문 서두 표적 반려",
  gateOf(withSentence("[[They]] arrived in winter and built the first shelters."), HEAD_PASSAGE).some(
    (i) => i.includes("지문 맨 앞"),
  ),
);

const DUP_PASSAGE =
  "The rule was simple. They kept the records. Nothing else survived. They kept the records. Only fragments remain.";
check(
  "게이트: 밑줄문장 2회 등장 반려(자리 비유일)",
  gateOf(withSentence("[[They]] kept the records."), DUP_PASSAGE).some((i) =>
    i.includes("2회 등장"),
  ),
);

check(
  "게이트: 선지 4개 반려",
  gateOf(GOOD.replace("⑤ 반대 의견을 낸 주민들\n", "")).some((i) => i.includes("선지 4개")),
);
check(
  "게이트: 선지 라벨 순서 오류 반려",
  gateOf(
    GOOD.replace("③ 계획을 세운 도시 계획가들", "④ 계획을 세운 도시 계획가들").replace(
      "④ 도시 계획 절차 전체",
      "③ 도시 계획 절차 전체",
    ),
  ).some((i) => i.includes("선지 라벨 순서 오류")),
);
check(
  "게이트: 선지 중복 반려",
  gateOf(GOOD.replace("④ 도시 계획 절차 전체", "④ 계획을 세운 도시 계획가들")).some((i) =>
    i.includes("선지 중복"),
  ),
);
check(
  "게이트: 선지 마크업 반려",
  gateOf(GOOD.replace("④ 도시 계획 절차 전체", "④ **도시 계획 절차 전체**")).some((i) =>
    i.includes("서식"),
  ),
);
// 파서가 표 행 파이프를 걷어내지만 칸이 밀린 변종까지 다 흡수할 수는 없다.
// 잔여 파이프는 게이트가 **자리를 지목해** 반려해야 한다 — 종전에는 부패한 선지가
// 게이트·검증기를 전부 통과해 학생 표면과 오답해설 문구까지 오염시켰다.
check(
  "게이트: 선지에 잔여 표 파이프가 남으면 반려",
  gateMdReference(
    {
      ...snapped.question,
      options: snapped.question.options.map((o) =>
        o.label === "④" ? { ...o, text: "| 도시 계획 절차 전체" } : o,
      ),
    },
    PASSAGE,
  ).some((i) => i.includes("표 파이프")),
);
// 선지가 5개를 넘는 유일한 실측 경로는 오답 섹션 라벨 미인식이다. 그 원인을
// 지목하지 않으면 모델은 `선지 9개` + `오답해설 0개(8개 필요)` 라는 따를 수 없는
// 지시를 받는다(규범 §1-B 철칙 3·5 — 산술적으로 무의미한 파생 숫자 금지).
{
  const swallowed = gateMdReference(
    {
      ...snapped.question,
      options: [
        ...snapped.question.options,
        ...snapped.question.wrong.map((w) => ({ label: w.label, text: w.text })),
      ],
      wrong: [],
    },
    PASSAGE,
  );
  check(
    "게이트: 선지 6개 이상이면 오답 섹션 라벨 미인식을 지목",
    swallowed.some((i) => i.includes("오답 섹션 라벨을 인식하지 못해")),
    swallowed.join(" / "),
  );
  check(
    "게이트: 오염된 선지 수에서 파생된 오답해설 요구치를 내지 않음",
    swallowed.some((i) => i.includes("오답해설 0개 (4개 필요")) &&
      !swallowed.some((i) => /오답해설 \d+개 \((?:[5-9]|\d\d)개 필요/.test(i)),
    swallowed.join(" / "),
  );
}
// 다른 유형 형식(`밑줄지문:`)에 이끌려 지문을 통째로 옮기는 교차 드리프트.
// 라벨을 못 알아보면 게이트가 "밑줄문장 누락"이라는 **사실과 반대되는** 원인을
// 지목한다 — 라벨은 흡수하되 '문장 하나' 계약 위반은 자리를 지목해 반려해야 한다.
{
  const LONG_PASSAGE =
    "City planners once treated public objections as noise to be managed, filing them away in basements that no one ever visited again. " +
    `${TARGET_SENTENCE} ` +
    "Residents who had filed those complaints never learned that their words had traveled so far, nor that they had shortened the deliberations of councils in three other regions. " +
    "Archivists now argue that such records deserve the same care as engineering drawings, because they encode the reasoning that produced the final plan.";
  const md = GOOD.replace(
    `밑줄문장: ${MARKED}`,
    `밑줄지문: ${LONG_PASSAGE.replace("reused them,", "reused [[them]],")}`,
  );
  const q = autoSnapReference(parseMdReference(md), LONG_PASSAGE).question;
  const issues = gateMdReference(q, LONG_PASSAGE);
  check(
    "게이트: `밑줄지문:` 교차 드리프트를 흡수하고 '문장 하나' 위반을 원인으로 지목",
    q.markedSentence.length > 500 &&
      q.options.length === 5 &&
      issues.some((i) => i.includes("표적이 든 문장 하나만")) &&
      !issues.some((i) => i.includes("밑줄문장 누락")),
    `밑줄문장 ${q.markedSentence.length}자 · ${issues.join(" / ")}`,
  );
}
// 정상 지칭 It 이 허사로 오인되지 않는지 왕복으로 고정한다(it 은 최다 표적).
{
  const IT_REF_PASSAGE =
    "The map was drawn in 1750 by an anonymous surveyor. It is remarkable for its detail.";
  const issues = gateOf(
    withSentence("[[It]] is remarkable for its detail."),
    IT_REF_PASSAGE,
  );
  check("게이트: 정상 지칭 It 표적은 통과(허사 오탐 방지)", issues.length === 0, issues.join(" / "));
}
check(
  "게이트: 선지 비한국어 반려",
  gateOf(GOOD.replace("④ 도시 계획 절차 전체", "④ the whole planning process")).some((i) =>
    i.includes("한국어가 아님"),
  ),
);
check(
  "게이트: 선지 끝 괄호 지칭 노출 반려",
  gateOf(GOOD.replace("④ 도시 계획 절차 전체", "④ 도시 계획 절차 (반대 의견들)")).some((i) =>
    i.includes("끝 괄호"),
  ),
);
check(
  "게이트: 정답 누락 반려",
  gateOf(GOOD.replace("정답: ②\n", "")).some((i) => i.includes("정답 누락")),
);
check(
  "게이트: 해설 누락 반려",
  gateMdReference(
    { ...snapped.question, explanation: "" },
    PASSAGE,
  ).some((i) => i.includes("해설 누락")),
);
// ── 해설-정답 정합 축: 계약 전환(규범 §1-B 철칙 1) ──────────────────────────
// 종전 게이트는 "정답 선지 문구가 해설에 등장하는가"를 물었다 — '어느 선지가
// 정답인가'를 `정답:` 줄과 해설 **두 곳**에서 받는 중복 계약이라 양방향으로
// 오작동했다(정상 문항을 죽이고 진짜 불일치는 통과). 이제 이 축은 **모순의 적극적
// 증거**가 있을 때만 발화한다. 아래 세 픽스처가 그 계약을 고정한다.
check(
  "게이트: 해설이 다른 선지를 지칭 대상으로 단정하면 반려(해설-정답 불일치 최다 fatal)",
  gateOf(
    GOOD.replace(
      "밑줄 친 대명사는 '계획가들이 모아 둔 반대 의견들'을 가리킵니다.",
      "밑줄 친 대명사는 '훗날 계획을 참고한 다른 도시들'을 가리킵니다.",
    ),
  ).some((i) => i.includes("해설과 정답 라벨이 어긋났다")),
  gateOf(
    GOOD.replace(
      "밑줄 친 대명사는 '계획가들이 모아 둔 반대 의견들'을 가리킵니다.",
      "밑줄 친 대명사는 '훗날 계획을 참고한 다른 도시들'을 가리킵니다.",
    ),
  ).join(" / "),
);
check(
  "게이트: 부정 대조문('A가 아니라 B')의 해설-정답 불일치도 반려(종전 게이트는 통과시켰다)",
  gateMdReference(
    {
      ...snapped.question,
      answer: "④",
      explanation:
        "밑줄 친 대명사는 '도시 계획 절차 전체'가 아니라 계획가들이 모아 둔 반대 의견들을 가리킵니다. 앞 절이 반대 의견을 모아 보관했다고 밝히기 때문입니다.",
      wrong: ["①", "②", "③", "⑤"].map((label) => ({ label, text: "기제 설명 1문장입니다." })),
    },
    PASSAGE,
  ).some((i) => i.includes("해설과 정답 라벨이 어긋났다")),
  gateMdReference(
    {
      ...snapped.question,
      answer: "④",
      explanation:
        "밑줄 친 대명사는 '도시 계획 절차 전체'가 아니라 계획가들이 모아 둔 반대 의견들을 가리킵니다. 앞 절이 반대 의견을 모아 보관했다고 밝히기 때문입니다.",
      wrong: ["①", "②", "③", "⑤"].map((label) => ({ label, text: "기제 설명 1문장입니다." })),
    },
    PASSAGE,
  ).join(" / "),
);
check(
  "게이트: 해설을 자연스럽게 바꿔 쓴 정상 문항은 통과(인용의 부재는 반려 사유가 아니다)",
  gateOf(
    GOOD.replace(
      "밑줄 친 대명사는 '계획가들이 모아 둔 반대 의견들'을 가리킵니다.",
      "밑줄 친 them 은 앞 절에서 계획가들이 모아 보관한 반대 의견 기록을 가리킵니다.",
    ),
  ).length === 0,
  gateOf(
    GOOD.replace(
      "밑줄 친 대명사는 '계획가들이 모아 둔 반대 의견들'을 가리킵니다.",
      "밑줄 친 them 은 앞 절에서 계획가들이 모아 보관한 반대 의견 기록을 가리킵니다.",
    ),
  ).join(" / "),
);
check(
  "게이트: 정답 라벨이 선지 밖이면 반려",
  gateMdReference({ ...snapped.question, answer: "⑤", options: snapped.question.options.slice(0, 4) }, PASSAGE)
    .some((i) => i.includes("정답 라벨") || i.includes("선지 4개")),
);
check(
  "게이트: 오답해설 3개 반려",
  gateOf(
    GOOD.replace(
      "⑤ 다른 마디의 주역 — 앞뒤 문장의 주역이지만 이 자리에서 다시 쓰인 것은 사람이 아니라 기록입니다.",
      "",
    ),
  ).some((i) => i.includes("오답해설 3개")),
);
check(
  "게이트: 오답해설에 정답 라벨 포함 반려",
  gateMdReference(
    {
      ...snapped.question,
      wrong: [...snapped.question.wrong, { label: "②", text: "정답인데 끼어듦" }],
    },
    PASSAGE,
  ).some((i) => i.includes("정답 라벨 포함")),
);
check(
  "게이트: 정답 선지만 유독 길면 반려",
  gateMdReference(
    {
      ...snapped.question,
      options: snapped.question.options.map((o) =>
        o.label === "②"
          ? { ...o, text: "계획가들이 검토 기간 내내 빠짐없이 모아 보관해 둔 주민들의 반대 의견 기록 전체" }
          : { ...o, text: "다른 도시들" },
      ),
    },
    PASSAGE,
  ).some((i) => i.includes("유독 긺")),
);
check(
  "게이트: answer-only 모드는 오답해설 개수를 묻지 않음",
  gateMdReference({ ...snapped.question, wrong: [] }, PASSAGE, { requireWrong: false }).length === 0,
  gateMdReference({ ...snapped.question, wrong: [] }, PASSAGE, { requireWrong: false }).join(" / "),
);

// ───────────────────────────────────────────────────────────────────────────
// 3. 드리프트 관용 — 전부 5선지 + 게이트 클린이어야 한다
// ───────────────────────────────────────────────────────────────────────────
// 선지 텍스트는 **축자**로 단정한다. 개수·게이트만 보면 표 행 드리프트에서
// `'| 계획을 세운 도시 계획가들'` 처럼 부패한 텍스트가 클린 게이트를 통과해
// 학생 표면과 오답해설 문구까지 오염시킨 결함을 못 본다(적대검수 critical).
const EXPECTED_OPTION_TEXTS = [
  "훗날 계획을 참고한 다른 도시들",
  "계획가들이 모아 둔 반대 의견들",
  "계획을 세운 도시 계획가들",
  "도시 계획 절차 전체",
  "반대 의견을 낸 주민들",
];

const DRIFTS: [string, string, string][] = [
  ["라벨 축약(밑줄:)", "밑줄문장: ", "밑줄: "],
  ["전각 콜론", "밑줄문장: ", "밑줄문장： "],
  ["라벨 뒤 개행", `밑줄문장: ${MARKED}`, `밑줄문장:\n${MARKED}`],
  ["마커에 라벨 부착", "[[them]]", "[[A:them]]"],
  ["마커에 숫자 라벨", "[[them]]", "[[1: them]]"],
  ["마커 안 공백", "[[them]]", "[[ them ]]"],
  ["마커에 구두점 포함", "[[them]],", "[[them,]]"],
  ["굵게 대체 마커", "[[them]]", "**them**"],
  ["밑줄 대체 마커", "[[them]]", "__them__"],
  ["선지 불릿 접두", "③ 계획을 세운 도시 계획가들", "- ③ 계획을 세운 도시 계획가들"],
  ["선지 굵게 라벨", "③ 계획을 세운 도시 계획가들", "**③** 계획을 세운 도시 계획가들"],
  ["선지 표 행", "③ 계획을 세운 도시 계획가들", "| ③ | 계획을 세운 도시 계획가들 |"],
  ["선지 숫자 라벨 혼합", "③ 계획을 세운 도시 계획가들", "3) 계획을 세운 도시 계획가들"],
  ["정답 숫자 표기", "정답: ②", "정답: 2"],
  ["정답 굵게 표기", "정답: ②", "정답: **②**"],
  ["정답 줄 전각 콜론", "정답: ②", "정답： ②"],
  ["해설 전각 콜론", "해설: ", "해설： "],
  // ↓ 적대검수 회귀분 — **첫 선지** 장식. 밑줄문장 종료 lookahead 가 선지 라인
  //   정규식의 접두 관용과 1:1이 아니면 밑줄문장이 이 줄을 통째로 삼키고,
  //   게이트가 엉뚱한 곳(지문 축자 불일치)을 지목한다. ③만 장식하면 ①②가
  //   lookahead 를 살려 줘서 이 결함이 안 보인다 — 반드시 ①을 장식할 것.
  ["첫 선지 불릿 접두", "① 훗날 계획을 참고한 다른 도시들", "- ① 훗날 계획을 참고한 다른 도시들"],
  ["첫 선지 굵게 라벨", "① 훗날 계획을 참고한 다른 도시들", "**①** 훗날 계획을 참고한 다른 도시들"],
  ["첫 선지 표 행", "① 훗날 계획을 참고한 다른 도시들", "| ① | 훗날 계획을 참고한 다른 도시들 |"],
  // ↓ 적대검수 회귀분 — **섹션 라벨** 장식. 값 쪽 굵게(`정답: **②**`)는 관용하면서
  //   라벨 쪽만 무관용이면, 필드가 통째로 사라지고 게이트가 "~ 누락"이라는
  //   사실과 반대되는 피드백을 재생성 프롬프트에 싣는다(웨이브 silent-drop 최다).
  ["밑줄문장 라벨 굵게", "밑줄문장: ", "**밑줄문장:** "],
  ["밑줄문장 라벨 굵게+전각콜론", "밑줄문장: ", "**밑줄문장：** "],
  ["정답 라벨 굵게", "정답: ②", "**정답:** ②"],
  ["정답 라벨 불릿 접두", "정답: ②", "- 정답: ②"],
  ["정답 라벨 굵게(콜론 밖)", "정답: ②", "**정답**: ②"],
  ["해설 라벨 굵게", "해설: ", "**해설:** "],
  ["해설 라벨 불릿 접두", "해설: ", "- 해설: "],
  ["오답 라벨 굵게", "오답:", "**오답:**"],
  ["오답 라벨 공백 삽입", "오답:", "오답 해설:"],
  ["오답 라벨 전각 콜론", "오답:", "오답："],
  ["오답 라벨 불릿 접두", "오답:", "- 오답:"],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = autoSnapReference(parseMdReference(drifted), PASSAGE).question;
  const issues = gateMdReference(q, PASSAGE);
  check(
    `드리프트 관용: ${name}`,
    q.options.length === 5 &&
      q.options.map((o) => o.text).join(" | ") === EXPECTED_OPTION_TEXTS.join(" | ") &&
      q.markedSentence === MARKED &&
      q.answer === "②" &&
      q.explanation.length > 20 &&
      q.wrong.length === 4 &&
      issues.length === 0,
    `선지 ${q.options.length}개 [${q.options.map((o) => o.text).join(" / ")}] · 정답 '${q.answer}' · 해설 ${q.explanation.length}자 · 오답 ${q.wrong.length}개 · 밑줄문장 ${q.markedSentence.length}자 · ${issues.join(" / ")}`,
  );
}

// 오답 목록에 정답 줄을 끼워 넣는 실측 패턴 — 파서가 걸러낸다
{
  const withAnswerRow = GOOD.replace(
    "오답:\n",
    "오답:\n② (정답) 계획가들이 모아 둔 반대 의견들\n",
  );
  const q = parseMdReference(withAnswerRow);
  check(
    "드리프트 관용: 오답 목록의 정답 줄 제거",
    q.wrong.length === 4 && q.wrong.every((w) => w.label !== "②"),
    `오답 ${q.wrong.length}개`,
  );
}

// 과잉 관용 방지 — 선지 구역 밖 산문은 선지로 오인하지 않는다
{
  const prose = GOOD.replace("밑줄문장: ", "밑줄문장: ").replace(
    "정답: ②",
    "위 다섯 후보는 모두 지문에 등장합니다.\n정답: ②",
  );
  check("과잉 관용 방지: 라벨 없는 산문 줄 무시", parseMdReference(prose).options.length === 5);
}

// ───────────────────────────────────────────────────────────────────────────
// 4. 스냅 보정 — 구두점·대소문자 드리프트
// ───────────────────────────────────────────────────────────────────────────
{
  const drift = withSentence(MARKED.replace("residents’ review", "residents' review"));
  const s = autoSnapReference(parseMdReference(drift), PASSAGE);
  check(
    "스냅: 곱슬따옴표 드리프트를 지문 축자로 보정",
    s.corrections.length === 1 && s.question.markedSentence === MARKED,
    `${s.corrections.join(" / ")} | ${s.question.markedSentence.slice(0, 60)}`,
  );
  check("스냅 후 게이트 클린", gateMdReference(s.question, PASSAGE).length === 0);
}
{
  const drift = withSentence(MARKED.replace("The planners", "the planners"));
  const s = autoSnapReference(parseMdReference(drift), PASSAGE);
  check(
    "스냅: 대소문자 드리프트 보정",
    s.corrections.length === 1 && s.question.markedSentence === MARKED,
    s.question.markedSentence.slice(0, 40),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. 어댑터 → processReference 왕복 + 형식 검증기
// ───────────────────────────────────────────────────────────────────────────
{
  const adapt = adaptMdReferenceToAiQuestion(snapped.question, PASSAGE, "KILLER");
  check("어댑터: 성공", adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  check("어댑터: underlinedPronoun 원문 축자", ai.underlinedPronoun === "them", String(ai.underlinedPronoun));
  check(
    "어댑터: surroundingText 가 지문 축자 조각",
    typeof ai.surroundingText === "string" &&
      ai.surroundingText.length > 0 &&
      PASSAGE.includes(ai.surroundingText),
    String(ai.surroundingText),
  );
  const opts = ai.options as Array<Record<string, unknown>>;
  check("어댑터: 선지 5개 · 라벨 1~5 숫자 축", opts.length === 5 && opts[0].label === "1" && opts[4].label === "5");
  check("어댑터: 선지 텍스트 보존", opts[1].text === "계획가들이 모아 둔 반대 의견들", String(opts[1].text));
  check("어댑터: correctAnswer '2'", ai.correctAnswer === "2", String(ai.correctAnswer));
  const woe = ai.wrongOptionExplanations as Array<Record<string, unknown>>;
  check(
    "어댑터: 오답해설 4개 · 라벨 1,3,4,5",
    woe.length === 4 && woe.map((w) => w.label).join(",") === "1,3,4,5",
    woe.map((w) => w.label).join(","),
  );
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check(
    "어댑터: passageWithUnderline 미생성(후처리 전담)",
    !("passageWithUnderline" in ai),
  );
  check(
    "어댑터: 빈칸 계열 이물 필드 없음",
    !("blanks" in ai) && !("passageWithBlank" in ai) && !("originalExpression" in ai),
  );
  check(
    "어댑터: 발문이 odd-one-out 형식이 아님",
    typeof ai.direction === "string" &&
      !/나머지[^.?!]{0,10}다른|다른\s*하나/.test(ai.direction) &&
      ai.direction.includes("them"),
    String(ai.direction),
  );

  const pp = postProcessQuestion("REFERENCE", PASSAGE, ai as never);
  check("후처리: 성공", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  const pwu = String(data.passageWithUnderline ?? "");
  check("후처리: passageWithUnderline 에 __them__ 생성", pwu.includes("reused __them__,"), pwu.slice(0, 60));
  check(
    "후처리: 밑줄 마커가 정확히 1개",
    [...pwu.matchAll(/__([^_]+?)__/g)].length === 1,
    String([...pwu.matchAll(/__([^_]+?)__/g)].length),
  );
  check(
    "후처리: 밑줄 밖 지문 무변경",
    pwu.replace("__them__", "them") === PASSAGE,
  );

  const problems: string[] = [];
  validateReferenceQuestion(data, (_severity, code, message) => {
    problems.push(`${code}: ${message}`);
  });
  check("형식 검증기(validateReferenceQuestion): 무발화", problems.length === 0, problems.join(" / "));
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 같은 대명사 반복 — 밑줄 자리 유일 확정 왕복 (이 유형의 급소)
// ───────────────────────────────────────────────────────────────────────────
const REPEAT_PASSAGE =
  "Archivists preserved the complaint letters with unusual care. " +
  "Scholars cited them, and journalists later quoted them to explain a forgotten protest.";

const GOOD_REPEAT = `밑줄문장: Scholars cited them, and journalists later quoted [[them]] to explain a forgotten protest.

① 오랫동안 보관된 민원 편지들
② 편지를 인용한 학자들
③ 잊힌 항의를 취재한 기자들
④ 편지를 보관한 기록 관리자들
⑤ 잊혔던 항의 사건 자체
정답: ①
해설: 밑줄 친 대명사는 '오랫동안 보관된 민원 편지들'을 가리킵니다. 앞 문장이 기록 관리자들이 민원 편지를 보관했다고 밝히고 뒤 절이 그것을 인용해 항의를 설명한다고 말하므로, 지칭 대상은 사람이 아니라 편지입니다.
오답:
② 역할 전도 — 인용하는 주체라 바로 앞에 있지만, 인용되는 대상은 그 주체가 아닙니다.
③ 최근접 명사 함정 — 문장 뒤쪽 주어라 위치상 유혹적이지만, 기자들이 인용한 것은 기자들 자신이 아닙니다.
④ 다른 마디의 주역 — 앞 문장의 주역이지만 인용 대상은 사람이 아니라 편지입니다.
⑤ 범위 이동 — 실제 지칭보다 한 단계 넓은 사건 전체여서 인용 대상이 될 수 없습니다.`;

{
  const q = autoSnapReference(parseMdReference(GOOD_REPEAT), REPEAT_PASSAGE).question;
  const issues = gateMdReference(q, REPEAT_PASSAGE);
  check("반복 대명사: 게이트 클린", issues.length === 0, issues.join(" / "));

  const t = referenceTargetOf(q.markedSentence);
  const l = locateReferenceTarget(REPEAT_PASSAGE, t);
  check(
    "반복 대명사: 좌표가 두 번째 출현",
    l !== null && l.index === REPEAT_PASSAGE.lastIndexOf("them"),
    l ? `${l.index} vs ${REPEAT_PASSAGE.lastIndexOf("them")}` : "null",
  );
  const window = l ? buildReferenceContext(REPEAT_PASSAGE, l.index, l.length) : "";
  check(
    "반복 대명사: 문맥 창이 앞 출현을 품지 않음",
    window.split("them").length - 1 === 1,
    window,
  );
  check(
    "반복 대명사: 창이 그 자리를 지목",
    l !== null && referenceContextResolves(REPEAT_PASSAGE, window, l.index, l.length),
  );

  const adapt = adaptMdReferenceToAiQuestion(q, REPEAT_PASSAGE, "INTERMEDIATE");
  check("반복 대명사: 어댑터 성공", adapt.ok === true, adapt.error);
  const pp = postProcessQuestion(
    "REFERENCE",
    REPEAT_PASSAGE,
    (adapt.aiQuestion ?? {}) as never,
  );
  const pwu = String(((pp.data ?? {}) as Record<string, unknown>).passageWithUnderline ?? "");
  check(
    "반복 대명사: 후처리가 두 번째 출현에만 밑줄",
    pwu.includes("quoted __them__ to") && pwu.includes("cited them,"),
    pwu.slice(50, 140),
  );
  check(
    "반복 대명사: 밑줄 마커 1개",
    [...pwu.matchAll(/__([^_]+?)__/g)].length === 1,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 레인 계약 — 과금 축 · 적격성 · 설정 집행 · 난이도 3분기
// ───────────────────────────────────────────────────────────────────────────
function laneCtx(overrides: Partial<MdLaneContext> = {}): MdLaneContext {
  return {
    passage: PASSAGE,
    difficulty: "KILLER",
    rawDifficulty: "KILLER",
    resolved: {},
    rawTypeSettings: null,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
    ...overrides,
  };
}

check("레인: subType REFERENCE", REFERENCE_MD_LANE.subType === "REFERENCE");
check(
  "레인: 과금 QUESTION_GEN_SINGLE (fast VOCAB_TYPES 미포함과 동기)",
  REFERENCE_MD_LANE.operationType === "QUESTION_GEN_SINGLE" &&
    CREDIT_COSTS.QUESTION_GEN_SINGLE === CREDIT_COSTS[REFERENCE_MD_LANE.operationType],
  String(REFERENCE_MD_LANE.operationType),
);
check("레인: retryEligible", REFERENCE_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 — 전용 노브가 없어 항상 true",
  REFERENCE_MD_LANE.isEligible({}) && REFERENCE_MD_LANE.isEligible({ anything: 99 }),
);
check(
  "레인: diversityTargets 는 surroundingText 우선",
  REFERENCE_MD_LANE.diversityTargets({
    surroundingText: "reused them, skipping",
    underlinedPronoun: "them",
  })[0] === "reused them, skipping",
);
check(
  "레인: diversityTargets 폴백은 underlinedPronoun",
  REFERENCE_MD_LANE.diversityTargets({ underlinedPronoun: "them" })[0] === "them",
);
check("레인: diversityTargets 빈 입력 안전", REFERENCE_MD_LANE.diversityTargets({}).length === 0);
check(
  "레인: parseAndGate 정상 경로 클린",
  REFERENCE_MD_LANE.parseAndGate(GOOD, laneCtx()).gateIssues.length === 0,
  REFERENCE_MD_LANE.parseAndGate(GOOD, laneCtx()).gateIssues.join(" / "),
);
check(
  "레인: parseAndGate 가 스냅 기록을 전달",
  REFERENCE_MD_LANE.parseAndGate(
    withSentence(MARKED.replace("residents’ review", "residents' review")),
    laneCtx(),
  ).corrections.length === 1,
);
check(
  "레인: 교사 지정 포인트 준수 게이트(밑줄문장 밖이면 반려)",
  REFERENCE_MD_LANE.parseAndGate(
    GOOD,
    laneCtx({ teacherPoints: [{ text: "engineering drawings", unit: "phrase" }] }),
  ).gateIssues.some((i) => i.includes("교사 지정")),
);
check(
  "레인: 교사 지정 포인트가 밑줄문장 안이면 통과",
  REFERENCE_MD_LANE.parseAndGate(
    GOOD,
    laneCtx({ teacherPoints: [{ text: "later cities reused them", unit: "phrase" }] }),
  ).gateIssues.length === 0,
);
check("레인: 기본 설정에서 extras 없음", REFERENCE_MD_LANE.buildExtras(laneCtx()).length === 0);
check(
  "레인: 발문 언어 en 설정이 extras 로 집행",
  REFERENCE_MD_LANE.buildExtras(
    laneCtx({ rawTypeSettings: { stemLanguage: "en" } }),
  ).some((block) => block.includes("질문 언어")),
);
{
  const ctxEn = laneCtx({ rawTypeSettings: { stemLanguage: "en" } });
  const parsedLane = REFERENCE_MD_LANE.parseAndGate(GOOD, ctxEn);
  const adapted = REFERENCE_MD_LANE.adapt(parsedLane, ctxEn);
  const direction = String((adapted.aiQuestion ?? {}).direction ?? "");
  check(
    "레인: en 설정이면 발문만 영어로 교체",
    adapted.ok === true && direction.startsWith("What does the underlined"),
    direction,
  );
  check(
    "레인: en 설정에서도 선지는 한국어 구조 유지",
    ((adapted.aiQuestion ?? {}).options as Array<Record<string, unknown>>)[0].text ===
      "훗날 계획을 참고한 다른 도시들",
  );
  check(
    "레인: qualityArgs 가 언어 실값을 싣는다",
    REFERENCE_MD_LANE.qualityArgs(ctxEn).stemLanguage === "en" &&
      REFERENCE_MD_LANE.qualityArgs(ctxEn).optionLanguage === "ko",
    JSON.stringify(REFERENCE_MD_LANE.qualityArgs(ctxEn)),
  );
}
check(
  "레인: mdFormat 포렌식 메타",
  REFERENCE_MD_LANE.mdFormat(laneCtx()).optionCount === 5,
  JSON.stringify(REFERENCE_MD_LANE.mdFormat(laneCtx())),
);

// ───────────────────────────────────────────────────────────────────────────
// 8. 프롬프트 계약 — 난이도 3분기 · 형식 리터럴 · 기제 분류학
// ───────────────────────────────────────────────────────────────────────────
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdReferencePrompt(PASSAGE, "full", d);
  check(
    `프롬프트 ${d}: 표적 설계 분기 + 출력형식 + 지문 포함`,
    p.includes("## 표적 설계") &&
      p.includes("밑줄문장: <표적 대명사가 든 지문 문장") &&
      p.includes("## 지문") &&
      p.includes(PASSAGE.slice(0, 40)),
  );
}
{
  const basic = buildMdReferencePrompt(PASSAGE, "full", "BASIC");
  const inter = buildMdReferencePrompt(PASSAGE, "full", "INTERMEDIATE");
  const killer = buildMdReferencePrompt(PASSAGE, "full", "KILLER");
  check(
    "프롬프트: 난이도별 문구가 서로 다르다",
    basic.includes("(기본 난이도)") &&
      inter.includes("(중급 난이도)") &&
      !killer.includes("(기본 난이도)") &&
      !killer.includes("(중급 난이도)"),
  );
  check(
    "프롬프트: few-shot 은 BASIC 에서 생략(정본 어법 빌더 선례)",
    !basic.includes("모범 설계 해부") &&
      inter.includes("모범 설계 해부") &&
      killer.includes("모범 설계 해부"),
  );
  check(
    "프롬프트: 오답 기제 4종 전부 명시",
    ["최근접 명사 함정", "역할 전도", "범위 이동", "다른 마디의 주역"].every((m) =>
      killer.includes(m),
    ),
  );
  check(
    "프롬프트: 마커 계약 리터럴이 파서와 일치",
    killer.includes("[[them]]") && killer.includes("마커는 정확히 **1개**"),
  );
  check(
    "프롬프트: 허사·한정사 금지 절 존재",
    killer.includes("허사 it 금지") && killer.includes("한정사 용법 금지"),
  );
  check(
    "프롬프트: 정답 인용 자기검산(게이트와 같은 계약)",
    killer.includes("해설 첫 문장에 정답 선지의 문구를 작은따옴표로 그대로 인용"),
  );
  check(
    "프롬프트: 선지 서식·괄호 지칭 금지 절 존재",
    killer.includes("지칭 판정을 함께 적지 마라") && killer.includes("서식은 서버가 넣는다"),
  );
  check(
    "프롬프트: 소재 구속(지문 실재 명사구) 절 존재",
    killer.includes("지문에 실제로 등장하는 서로 다른 명사구"),
  );
  const answerOnly = buildMdReferencePrompt(PASSAGE, "answer-only", "KILLER");
  check(
    "프롬프트: answer-only 모드는 오답 블록을 요구하지 않음",
    !answerOnly.includes("오답:\n① <기제이름") && killer.includes("오답:\n① <기제이름"),
  );
}

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
