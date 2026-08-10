// 함축 의미 추론(IMPLIED_MEANING) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → processImpliedMeaning 왕복 → 셔플 → 품질검증 →
// 레인 계약(과금·적격성·설정 집행·난이도 3분기)까지.
// 실행: npx tsx scripts/_test-md-implied.ts
//
// 형식 계약(규범 §4-7): `밑줄:` 한 줄 + 원문자 선지 N줄 + `정답:` + `해설:` + `오답:`.
// 지문을 재출력시키지 않으므로 지문 재구성 게이트가 없고, 대신 지문 결속점이
// `밑줄:` 한 줄뿐이라 그 줄의 축자·자리 유일성이 이 유형의 최강 게이트다.
import {
  autoSnapImpliedTarget,
  locateImpliedTarget,
  parseMdImplied,
} from "../src/lib/md-qgen/parser-implied";
import { gateMdImplied } from "../src/lib/md-qgen/gate-implied";
import {
  adaptMdImpliedToAiQuestion,
  IMPLIED_MD_DIRECTION,
  IMPLIED_MD_DIRECTION_MULTI,
} from "../src/lib/md-qgen/adapter-implied";
import { IMPLIED_MEANING_MD_LANE } from "../src/lib/md-qgen/lane-implied";
import {
  buildMdImpliedCandidateBlock,
  buildMdImpliedPrompt,
  clampImpliedMdAnswerCount,
  clampImpliedMdOptionCount,
  IMPLIED_MD_TARGET_MAX_CHARS,
  IMPLIED_MD_TARGET_MAX_WORDS,
} from "../src/lib/md-qgen/prompts-implied";
import {
  countImpliedMeaningLexicalUnits,
  countWordsForQuality,
} from "../src/lib/question-quality/core";
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

// ───────────────────────────────────────────────────────────────────────────
// 지문 · 정상 md
// ───────────────────────────────────────────────────────────────────────────
const PASSAGE =
  "Cities often replace their oldest pavements with cheap modern slabs, and the change is defended as ordinary maintenance. " +
  "Yet the worn stones hold the marks of generations who crossed them, and those marks vanish the moment the surface is lifted. " +
  "Planners who measure only cost and durability rarely count what disappears with the ground itself. " +
  "A neighbourhood that loses its worn paving loses one of the few records it kept without ever meaning to. " +
  "In the end, the city was rewriting a page it had never read.";

const TARGET = "a page it had never read";

const GOOD = `밑줄: ${TARGET}
① The city produced a brand-new written record.
② Careful restoration preserved the older layers of memory.
③ The city destroyed a history it never understood.
④ Every modern paving project should be stopped now.
⑤ Residents demanded the cheaper slabs for their streets.
정답: ③
해설: 이 글은 낡은 포장이 사라질 때 세대의 흔적도 함께 사라진다고 말합니다. 마지막 문장의 밑줄은 도시가 무엇을 지우는지 이해하지 못한 채 손댔다는 필자의 판단을 함축하므로, 이해하지 못한 역사를 없앴다는 진술이 정답입니다.
오답:
① 표면직역 — 밑줄을 글자 그대로만 읽어 기록을 새로 만들었다는 뜻으로 옮겼을 뿐, 필자의 판단이 빠져 있습니다.
② 방향반대 — 지문의 핵심어인 흔적을 앞세웠지만 필자는 보존이 아니라 소실을 말하고 있어 평가 방향이 정반대입니다.
④ 범위확대 — 지문은 어떤 처방도 제시하지 않았는데 사업 중단이라는 지시로 범위를 넓혔습니다.
⑤ 근거없음 — 주민의 선호는 지문에 근거가 전혀 없는 서술입니다.`;

function gateOf(
  text: string,
  passage = PASSAGE,
  options?: Parameters<typeof gateMdImplied>[2],
): string[] {
  const q = autoSnapImpliedTarget(parseMdImplied(text), passage).question;
  return gateMdImplied(q, passage, { optionCount: 5, answerCount: 1, ...options });
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdImplied(GOOD);
check("파싱: 밑줄 표현", parsed.expression === TARGET, parsed.expression);
check("파싱: 선지 5개", parsed.options.length === 5, `실제 ${parsed.options.length}`);
check("파싱: 선지 라벨 ①~⑤", parsed.options.map((o) => o.label).join("") === "①②③④⑤");
check("파싱: 정답 ③ 단일", parsed.answers.join(",") === "③" && parsed.answer === "③");
check("파싱: 해설 존재", parsed.explanation.length > 20);
check("파싱: 오답해설 4개(정답 줄 제외)", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check(
  "파싱: 오답해설에 정답 라벨 없음",
  parsed.wrong.every((w) => w.label !== "③"),
);
check(
  "위치확정: 밑줄이 지문에 정확히 1회",
  locateImpliedTarget(PASSAGE, TARGET)?.count === 1,
  String(locateImpliedTarget(PASSAGE, TARGET)?.count),
);
const snapped = autoSnapImpliedTarget(parsed, PASSAGE);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0);
check(
  "게이트: 정상 입력 클린(KILLER)",
  gateOf(GOOD).length === 0,
  gateOf(GOOD).join(" / "),
);
check(
  "게이트: 정상 입력 클린(BASIC)",
  gateOf(GOOD, PASSAGE, { difficulty: "BASIC" }).length === 0,
  gateOf(GOOD, PASSAGE, { difficulty: "BASIC" }).join(" / "),
);

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 선지·정답·해설 형상
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 선지 4개면 반려",
  gateOf(GOOD.replace("⑤ Residents demanded the cheaper slabs for their streets.\n", "")).some(
    (i) => i.includes("선지 4개"),
  ),
);
check(
  "게이트: 선지 라벨 순서 오류 반려",
  gateOf(GOOD.replace("④ Every modern", "⑥ Every modern")).some((i) =>
    i.includes("선지 라벨"),
  ),
);
check(
  "게이트: 선지 내용 중복 반려",
  gateOf(
    GOOD.replace(
      "⑤ Residents demanded the cheaper slabs for their streets.",
      "⑤ The city produced a brand-new written record.",
    ),
  ).some((i) => i.includes("선지 중복")),
);
check(
  "게이트: 정답 누락 반려",
  gateOf(GOOD.replace("정답: ③\n", "")).some((i) => i.includes("정답 누락")),
);
check(
  "게이트: 정답 라벨이 선지 밖이면 반려",
  gateOf(GOOD.replace("정답: ③", "정답: ⑧")).some((i) => i.includes("정답 라벨")),
);
check(
  "게이트: 정답 개수 불일치 반려(설정 1개인데 2개)",
  gateOf(GOOD.replace("정답: ③", "정답: ③, ④")).some((i) => i.includes("정답 2개")),
);
check(
  "게이트: 해설 누락 반려",
  gateOf(GOOD.replace(/^해설:.*$/m, "")).some((i) => i.includes("해설 누락")),
);
check(
  "게이트: 오답해설 개수 부족 반려",
  gateOf(GOOD.replace(/^⑤ 근거없음.*$/m, "")).some((i) => i.includes("오답해설")),
);
{
  const q = autoSnapImpliedTarget(parseMdImplied(GOOD), PASSAGE).question;
  check(
    "게이트: 오답해설에 정답 라벨 포함 반려",
    gateMdImplied(
      { ...q, wrong: [...q.wrong, { label: "③", text: "정답인데 끼어듦" }] },
      PASSAGE,
      { optionCount: 5, answerCount: 1 },
    ).some((i) => i.includes("정답 라벨(③) 포함")),
  );
  check(
    "게이트: 선지 텍스트 누락 반려",
    gateMdImplied(
      { ...q, options: q.options.map((o, i) => (i === 1 ? { ...o, text: "" } : o)) },
      PASSAGE,
      { optionCount: 5, answerCount: 1 },
    ).some((i) => i.includes("② 선지 텍스트 누락")),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. 게이트 반려 — 선지 언어(설정 집행)
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 영어 보기 설정에서 한글 선지 반려",
  gateOf(
    GOOD.replace(
      "⑤ Residents demanded the cheaper slabs for their streets.",
      "⑤ 주민들이 더 싼 포장재를 요구했다는 뜻입니다.",
    ),
  ).some((i) => i.includes("한글이 섞임")),
);
check(
  "게이트: 영어 보기 설정에서 한두 단어 선지 반려",
  gateOf(
    GOOD.replace(
      "⑤ Residents demanded the cheaper slabs for their streets.",
      "⑤ Cheap slabs",
    ),
  ).some((i) => i.includes("한두 단어 라벨")),
);

// ───────────────────────────────────────────────────────────────────────────
// 4. 게이트 반려 — 밑줄 표적(이 유형의 심장)
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 밑줄 줄 누락 반려",
  gateOf(GOOD.replace(/^밑줄:.*$/m, "")).some((i) => i.includes("밑줄 표현 누락")),
);
check(
  "게이트: 지문에 없는 밑줄 반려",
  gateOf(GOOD.replace(TARGET, "a page nobody ever opened")).some((i) =>
    i.includes("축자로 없음"),
  ),
);
check(
  "게이트: 밑줄 7단어 초과 반려",
  gateOf(GOOD.replace(TARGET, "rewriting a page it had never read")).some((i) =>
    i.includes("너무 김"),
  ),
);
check(
  "게이트: 단일 단어 밑줄 반려",
  gateOf(GOOD.replace(TARGET, "pavements")).some((i) => i.includes("단일 단어")),
);
check(
  "게이트: 후행 기능어 절단 반려",
  gateOf(GOOD.replace(TARGET, "the marks of")).some((i) =>
    i.includes("전치사·접속사로 끝나"),
  ),
);
{
  // 같은 표현이 지문에 2회 — 밑줄 자리가 확정되지 않는다.
  const dupPassage = `${PASSAGE} Those marks vanish the moment the surface is lifted, and the city moves on.`;
  check(
    "게이트: 밑줄이 지문에 2회 등장하면 반려",
    gateOf(GOOD.replace(TARGET, "the surface is lifted"), dupPassage).some((i) =>
      i.includes("2회 등장"),
    ),
    gateOf(GOOD.replace(TARGET, "the surface is lifted"), dupPassage).join(" / "),
  );
}
{
  // 수사의문문 자리 — 자문자답 구조는 답변 쪽에 밑줄을 그어야 한다.
  const qPassage =
    "Why should anyone care about old pavements? The worn stones hold the marks of generations who crossed them, and those marks vanish once the surface is lifted.";
  check(
    "게이트: 수사의문문 자리 반려",
    gateOf(GOOD.replace(TARGET, "care about old pavements"), qPassage).some((i) =>
      i.includes("수사적 질문"),
    ),
    gateOf(GOOD.replace(TARGET, "care about old pavements"), qPassage).join(" / "),
  );
}
{
  // 같은 문장 안 즉시 재진술 — 전 난이도 반려(표면-이면 간극 0).
  const leakPassage =
    "Cities replace their oldest pavements with cheap modern slabs every year. " +
    "In the end, the city was rewriting a page it had never read, that is, it destroyed a history it never understood.";
  const issues = gateOf(GOOD, leakPassage, { difficulty: "BASIC" });
  check(
    "게이트: 같은 문장 즉시 재진술 반려(BASIC 에서도)",
    issues.some((i) => i.includes("같은 문장이 뜻을 그대로 풀어 줌")),
    issues.join(" / "),
  );
}
{
  // 다음 문장 누출 — KILLER 전용(fast 극성과 동기).
  const leakPassage =
    "The old ground was a living archive of the city. This means the city preserved what no document ever held. " +
    "Planners who measure only cost rarely count what disappears with the ground itself.";
  const leakMd = GOOD.replace(TARGET, "a living archive");
  const killer = gateOf(leakMd, leakPassage, { difficulty: "KILLER" });
  const basic = gateOf(leakMd, leakPassage, { difficulty: "BASIC" });
  check(
    "게이트: 다음 문장 누출 KILLER 반려",
    killer.some((i) => i.includes("다음 문장이 밑줄의 답을")),
    killer.join(" / "),
  );
  check(
    "게이트: 다음 문장 누출은 BASIC 에서 통과(fast 극성 동기)",
    basic.length === 0,
    basic.join(" / "),
  );
}
{
  // 지엽 표적 — KILLER 전용.
  const localPassage =
    "In a pilot study, students used yellow cards to mark the worn stones they liked best. " +
    "Cities often replace their oldest pavements with cheap modern slabs every year.";
  const localMd = GOOD.replace(TARGET, "yellow cards");
  const killer = gateOf(localMd, localPassage, { difficulty: "KILLER" });
  const inter = gateOf(localMd, localPassage, { difficulty: "INTERMEDIATE" });
  check(
    "게이트: 지엽(예시·실험) 표적 KILLER 반려",
    killer.some((i) => i.includes("지엽 표현")),
    killer.join(" / "),
  );
  check(
    "게이트: 지엽 표적은 INTERMEDIATE 에서 통과(fast 극성 동기)",
    inter.length === 0,
    inter.join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4-B. 게이트 반려 — 절대표현 미끼 (fast KILLER error 이식, 회귀 고정)
//     implied-meaning-absolute-giveaway-option 은 fast(strict)가 전건 차단하는
//     코드인데 md 는 검증기를 기록만 하므로, 게이트가 없으면 그대로 출하된다.
// ───────────────────────────────────────────────────────────────────────────
{
  const ABSOLUTE_EN = GOOD.replace(
    "④ Every modern paving project should be stopped now.",
    "④ Old pavement always guarantees a stronger civic identity.",
  );
  const killer = gateOf(ABSOLUTE_EN, PASSAGE, { difficulty: "KILLER" });
  const inter = gateOf(ABSOLUTE_EN, PASSAGE, { difficulty: "INTERMEDIATE" });
  check(
    "게이트: 절대표현(always) 오답 KILLER 반려 + 라벨 지목",
    killer.some((i) => i.includes("④ 선지가 절대표현 미끼") && i.includes("always")),
    killer.join(" / "),
  );
  check(
    "게이트: 절대표현 미끼는 INTERMEDIATE 에서 통과(fast 극성 동기)",
    inter.length === 0,
    inter.join(" / "),
  );
}
{
  // 한국어 보기에서 훨씬 잦은 조사 패턴(만이/만을/만으로).
  const ABSOLUTE_KO = `밑줄: ${TARGET}
① 효율만이 공공 시설의 가치를 결정한다는 뜻입니다.
② 세심한 복원이 오래된 기억의 층을 지켜 냈다는 뜻입니다.
③ 도시가 끝내 이해하지 못한 역사를 없앴다는 뜻입니다.
④ 모든 포장 교체 사업을 당장 멈춰야 한다는 뜻입니다.
⑤ 주민들이 더 싼 포장재를 요구했다는 뜻입니다.
정답: ③
해설: 낡은 포장이 사라질 때 세대의 흔적도 함께 사라진다고 말합니다. 밑줄은 도시가 무엇을 지우는지 모른 채 손댔다는 판단을 함축합니다.
오답:
① 표면직역 — 글자 그대로만 읽은 결과입니다.
② 방향반대 — 필자의 평가 방향이 정반대입니다.
④ 범위확대 — 지문에 없는 처방으로 넓혔습니다.
⑤ 근거없음 — 지문에 근거가 없습니다.`;
  const issues = gateOf(ABSOLUTE_KO, PASSAGE, {
    difficulty: "KILLER",
    optionLanguage: "ko",
  });
  check(
    "게이트: 한국어 절대표현(만이) 오답 KILLER 반려",
    issues.some((i) => i.includes("① 선지가 절대표현 미끼")),
    issues.join(" / "),
  );
}
{
  // 오반려 방지 — 지문이 그 절대어를 실제로 쓰고 있으면 미끼가 아니다.
  // (PASSAGE 는 "measure only cost and durability" 로 only 를 쓴다.)
  const passageWord = GOOD.replace(
    "④ Every modern paving project should be stopped now.",
    "④ Only cost and durability guided the replacement of the stones.",
  );
  const issues = gateOf(passageWord, PASSAGE, { difficulty: "KILLER" });
  check(
    "게이트 오반려 방지: 지문이 쓰는 절대어는 미끼로 보지 않는다",
    issues.length === 0,
    issues.join(" / "),
  );
}
{
  // 정답 축을 못 읽었을 때는 침묵한다 — 정답 선지를 미끼로 오인하지 않게.
  const noAnswer = GOOD.replace(
    "③ The city destroyed a history it never understood.",
    "③ The city always destroyed a history it never understood.",
  ).replace("정답: ③\n", "");
  const issues = gateOf(noAnswer, PASSAGE, { difficulty: "KILLER" });
  check(
    "게이트: 정답 미확정이면 절대표현 검사 침묵(정답 누락만 지목)",
    issues.some((i) => i.includes("정답 누락")) &&
      !issues.some((i) => i.includes("절대표현")),
    issues.join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. 드리프트 관용 — 전부 5선지 + 게이트 클린이어야 한다.
//    (파서는 관대하게, 게이트는 엄격하게 — 정본 규약)
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string][] = [
  ["불릿 접두", "③ The city destroyed", "- ③ The city destroyed"],
  ["별표 불릿", "④ Every modern", "* ④ Every modern"],
  ["굵게 라벨", "② Careful restoration", "**②** Careful restoration"],
  ["굵게 전체", "⑤ Residents demanded", "**⑤ Residents demanded"],
  ["숫자 라벨 점", "② Careful restoration", "2. Careful restoration"],
  ["숫자 라벨 괄호", "② Careful restoration", "(2) Careful restoration"],
  ["숫자 라벨 닫는괄호", "② Careful restoration", "2) Careful restoration"],
  ["표 형식 행", "② Careful restoration", "| ② | Careful restoration"],
  ["라벨 뒤 마침표", "② Careful restoration", "②. Careful restoration"],
  ["정답 전각 콜론", "정답: ③", "정답： ③"],
  ["정답 평숫자", "정답: ③", "정답: 3"],
  ["정답 괄호숫자", "정답: ③", "정답: (3)"],
  ["정답 원문자+번", "정답: ③", "정답: ③번"],
  ["정답 뒤 부가설명", "정답: ③", "정답: ③ — ①은 표면 직역입니다"],
  ["밑줄 라벨 변형", `밑줄: ${TARGET}`, `밑줄 표현: ${TARGET}`],
  ["밑줄 따옴표 장식", `밑줄: ${TARGET}`, `밑줄: "${TARGET}"`],
  ["밑줄 굵게 장식", `밑줄: ${TARGET}`, `밑줄: **${TARGET}**`],
  ["밑줄 곱슬따옴표 장식", `밑줄: ${TARGET}`, `밑줄: “${TARGET}”`],
  ["해설 전각 콜론", "해설:", "해설："],
  ["밑줄 마크다운 헤더", `밑줄: ${TARGET}`, `## 밑줄: ${TARGET}`],
  ["정답 마크다운 헤더", "정답: ③", "### 정답: ③"],
  ["해설 마크다운 헤더", "해설:", "## 해설:"],
  ["오답 마크다운 헤더", "오답:", "## 오답:"],
  // ── 회귀 고정(적대검수 critical: silent-drop) ────────────────────────────
  // 키워드 줄을 무관용 정규식(`^#{0,6}\s*`)으로 잡으면 모델이 머리표를 꾸민
  // 순간 정답·해설·오답이 통째로 사라지고, 게이트는 "정답 누락" 이라는 사실과
  // 다른 원인을 지목한다. 그 문구가 그대로 재생성 피드백이 되어 실패로 끝난다.
  ["정답 머리표 굵게", "정답: ③", "**정답:** ③"],
  ["정답 머리표 굵게(콜론 밖)", "정답: ③", "**정답**: ③"],
  ["정답 머리표 굵게(공백 없음)", "정답: ③", "**정답:**③"],
  ["정답 머리표 인용", "정답: ③", "> 정답: ③"],
  ["정답 머리표 표 행", "정답: ③", "| 정답: | ③ |"],
  ["정답 머리표 불릿", "정답: ③", "- 정답: ③"],
  ["정답 머리표 이탤릭", "정답: ③", "*정답:* ③"],
  ["해설 머리표 굵게", "해설: 이 글은", "**해설:** 이 글은"],
  ["해설 머리표 굵게+전각콜론", "해설: 이 글은", "**해설：** 이 글은"],
  ["해설 머리표 밑줄표기", "해설: 이 글은", "__해설:__ 이 글은"],
  ["해설 머리표 인용", "해설: 이 글은", "> 해설: 이 글은"],
  ["오답 머리표 굵게", "오답:", "**오답:**"],
  ["오답 머리표 인용+굵게", "오답:", "> **오답:**"],
  ["밑줄 머리표 굵게", `밑줄: ${TARGET}`, `**밑줄:** ${TARGET}`],
  ["밑줄 머리표 이탤릭", `밑줄: ${TARGET}`, `*밑줄:* ${TARGET}`],
  ["밑줄 머리표 밑줄표기", `밑줄: ${TARGET}`, `__밑줄:__ ${TARGET}`],
  ["밑줄 머리표 표 행", `밑줄: ${TARGET}`, `| 밑줄: | ${TARGET} |`],
  // ── 회귀 고정(적대검수 major: silent-drop) — 선지 본문만 굵게/이탤릭 ──────
  [
    "선지 본문만 굵게(라벨 비굵게)",
    "① The city produced a brand-new written record.",
    "① **The city produced a brand-new written record.**",
  ],
  [
    "선지 본문만 이탤릭",
    "② Careful restoration preserved the older layers of memory.",
    "② *Careful restoration preserved the older layers of memory.*",
  ],
  [
    "선지 여는 별표만(짝 깨짐)",
    "⑤ Residents demanded the cheaper slabs for their streets.",
    "⑤ **Residents demanded the cheaper slabs for their streets.",
  ],
  [
    "오답해설 본문만 굵게",
    "④ 범위확대 — 지문은",
    "④ **범위확대 — 지문은",
  ],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdImplied(drifted);
  const issues = gateOf(drifted);
  check(
    `드리프트 관용: ${name}`,
    q.options.length === 5 && issues.length === 0,
    `선지 ${q.options.length}개 · ${issues.join(" / ")}`,
  );
}
{
  // 회귀 고정(critical): 세 머리표를 한꺼번에 꾸민 실측 최다 스타일 드리프트.
  // 게이트 클린만 보면 원인이 안 보이므로 필드가 **실제로 실렸는지**를 직접 본다.
  const drifted = GOOD.replace("정답: ③", "**정답:** ③")
    .replace("해설: 이 글은", "**해설:** 이 글은")
    .replace("오답:", "**오답:**");
  const q = parseMdImplied(drifted);
  check(
    "회귀(critical): 머리표 3종 동시 굵게에도 정답·해설·오답 전량 생존",
    q.answers.join(",") === "③" && q.explanation.length > 20 && q.wrong.length === 4,
    `정답=[${q.answers.join(",")}] 해설=${q.explanation.length}자 오답=${q.wrong.length}개`,
  );
  check(
    "회귀(critical): 굵게 머리표 게이트 클린(허위 '정답 누락' 없음)",
    gateOf(drifted).length === 0,
    gateOf(drifted).join(" / "),
  );
}
{
  // 과잉 교정 방지: 값 **안쪽**의 정상 강조는 보존한다.
  // 반쪽만 지우면 학생 표면에 리터럴 `*` 가 남아 결함이 오히려 커진다.
  const inline = GOOD.replace(
    "해설: 이 글은",
    "해설: **핵심**은 이 글은",
  ).replace("① 표면직역 —", "① *표면직역* —");
  const q = parseMdImplied(inline);
  check(
    "과잉 교정 방지: 값 안쪽 강조는 짝째로 보존",
    q.explanation.startsWith("**핵심**은") && q.wrong[0].text.startsWith("*표면직역*"),
    `${q.explanation.slice(0, 20)} / ${q.wrong[0].text.slice(0, 20)}`,
  );
}
{
  // 회귀 고정(major): 선지 본문 굵게 → 여는 `**` 만 남아 DB·학생 표면에 노출된
  // 실측 결함. 짝이 깨진 채 저장되면 어느 렌더 경로에서도 리터럴로 보인다.
  const cases: [string, string, string][] = [
    [
      "본문 굵게(라벨 비굵게)",
      "① The city produced a brand-new written record.",
      "① **The city produced a brand-new written record.**",
    ],
    [
      "여는 별표만",
      "① The city produced a brand-new written record.",
      "① **The city produced a brand-new written record.",
    ],
    [
      "닫는 별표만",
      "① The city produced a brand-new written record.",
      "① The city produced a brand-new written record.**",
    ],
    [
      "본문 이탤릭",
      "① The city produced a brand-new written record.",
      "① *The city produced a brand-new written record.*",
    ],
  ];
  for (const [name, from, to] of cases) {
    const q = parseMdImplied(GOOD.replace(from, to));
    check(
      `회귀(major): 선지 ${name} → 별표 잔재 0`,
      q.options[0].text === "The city produced a brand-new written record.",
      JSON.stringify(q.options[0].text),
    );
  }
  const wrongDrift = parseMdImplied(
    GOOD.replace("④ 범위확대 — 지문은", "④ **범위확대 — 지문은"),
  );
  check(
    "회귀(major): 오답해설 본문 굵게도 별표 잔재 0",
    wrongDrift.wrong.every((w) => !w.text.includes("**")),
    wrongDrift.wrong.map((w) => w.text.slice(0, 12)).join(" | "),
  );
}
{
  // 오답 목록에 정답 줄을 끼워 넣는 실측 패턴 — 파서가 걸러낸다.
  const drifted = GOOD.replace(
    "오답:\n",
    "오답:\n③ (정답) 이 선지가 정답입니다.\n",
  );
  const q = parseMdImplied(drifted);
  check(
    "드리프트 관용: 오답 목록의 정답 줄 제거",
    q.wrong.length === 4 && q.wrong.every((w) => w.label !== "③"),
    `오답 ${q.wrong.length}개`,
  );
  check("드리프트 관용: 정답 줄 끼움에도 게이트 클린", gateOf(drifted).length === 0);
}
{
  // 선지를 `정답:`·`해설:` 뒤에 쓴 순서 드리프트 — 엄격 구역이 비었을 때만 넓혀 읽는다.
  const lines = GOOD.split("\n");
  const optionLines = lines.filter((line) => /^[①-⑤] [A-Z]/.test(line));
  const rest = lines.filter((line) => !/^[①-⑤] [A-Z]/.test(line));
  const wrongHeader = rest.indexOf("오답:");
  const reordered = [
    ...rest.slice(0, wrongHeader),
    ...optionLines,
    ...rest.slice(wrongHeader),
  ].join("\n");
  const q = parseMdImplied(reordered);
  check(
    "드리프트 관용: 선지가 정답 줄 뒤에 있어도 구제",
    q.options.length === 5 && q.answers.join(",") === "③",
    `선지 ${q.options.length}개`,
  );
}
{
  // 과잉 관용 방지 — 라벨 없는 산문 줄은 선지로 오인하지 않는다.
  const prose = GOOD.replace(
    `밑줄: ${TARGET}\n`,
    `밑줄: ${TARGET}\nAll five options below share the same abstraction level.\n`,
  );
  check(
    "과잉 관용 방지: 라벨 없는 산문 줄 무시",
    parseMdImplied(prose).options.length === 5,
    `실제 ${parseMdImplied(prose).options.length}`,
  );
}
{
  // 과잉 관용 방지 — 해설 산문 속 번호 목록을 선지로 읽지 않는다(선지 구역 절단).
  const numbered = GOOD.replace(
    "해설: 이 글은",
    "해설: 1. 첫째 근거와 2. 둘째 근거를 잇습니다. 이 글은",
  );
  check(
    "과잉 관용 방지: 해설 속 번호 목록 무시",
    parseMdImplied(numbered).options.length === 5,
    `실제 ${parseMdImplied(numbered).options.length}`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 스냅 보정 (0원)
// ───────────────────────────────────────────────────────────────────────────
{
  const drift = GOOD.replace(TARGET, "A Page It Had Never Read");
  const s = autoSnapImpliedTarget(parseMdImplied(drift), PASSAGE);
  check(
    "스냅: 대소문자 드리프트를 지문 축자로 보정",
    s.corrections.length === 1 && s.question.expression === TARGET,
    `${s.question.expression} / ${s.corrections.join(" ")}`,
  );
  check("스냅 후 게이트 클린", gateOf(drift).length === 0, gateOf(drift).join(" / "));
}
{
  const drift = GOOD.replace(TARGET, "a page  it had   never read");
  const s = autoSnapImpliedTarget(parseMdImplied(drift), PASSAGE);
  check(
    "스냅: 공백 과다를 지문 축자로 보정",
    s.corrections.length === 1 && s.question.expression === TARGET,
    s.question.expression,
  );
}
{
  const drift = GOOD.replace(`밑줄: ${TARGET}`, `밑줄: ${TARGET},`);
  const s = autoSnapImpliedTarget(parseMdImplied(drift), PASSAGE);
  check(
    "스냅: 앞뒤 구두점 정리 후 축자 보정",
    s.corrections.length === 1 && s.question.expression === TARGET,
    s.question.expression,
  );
}
{
  // 사이 단어 누락 — 정본 빈칸 스냅 코어(snapExpressionSpan) 재사용 경로.
  const drift = GOOD.replace(TARGET, "one of few records it kept");
  const s = autoSnapImpliedTarget(parseMdImplied(drift), PASSAGE);
  check(
    "스냅: 사이 단어 누락 구간 스냅",
    s.corrections.length === 1 &&
      s.question.expression === "one of the few records it kept",
    `${s.question.expression} / ${s.corrections.join(" ")}`,
  );
}
{
  // 보수 가드 — 자리가 유일하지 않으면 손대지 않고 게이트가 반려하게 둔다.
  const dupPassage = `${PASSAGE} Those marks vanish the moment the surface is lifted, and the city moves on.`;
  const drift = GOOD.replace(TARGET, "The Surface Is Lifted");
  const s = autoSnapImpliedTarget(parseMdImplied(drift), dupPassage);
  check(
    "스냅 보수 가드: 다중 등장은 무보정(게이트가 반려)",
    s.corrections.length === 0 && s.question.expression === "The Surface Is Lifted",
    s.corrections.join(" "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 어댑터 → processImpliedMeaning 왕복
// ───────────────────────────────────────────────────────────────────────────
const adapted = adaptMdImpliedToAiQuestion(snapped.question, PASSAGE, "KILLER");
check("어댑터: 성공", adapted.ok === true, adapted.error);
{
  const ai = (adapted.aiQuestion ?? {}) as Record<string, unknown>;
  check("어댑터: 한국어 단일 발문", ai.direction === IMPLIED_MD_DIRECTION, String(ai.direction));
  check("어댑터: underlinedExpression 축자", ai.underlinedExpression === TARGET);
  check(
    "어댑터: surroundingText 가 지문 부분문자열",
    typeof ai.surroundingText === "string" &&
      (ai.surroundingText as string).length > 0 &&
      PASSAGE.includes(ai.surroundingText as string),
    String(ai.surroundingText),
  );
  const opts = ai.options as Array<Record<string, unknown>>;
  check(
    "어댑터: 선지 라벨 숫자 축 '1'~'5'",
    opts.length === 5 && opts[0].label === "1" && opts[4].label === "5",
  );
  check("어댑터: correctAnswer '3'", ai.correctAnswer === "3", String(ai.correctAnswer));
  check("어댑터: 단일 정답은 correctAnswers 미생성", !("correctAnswers" in ai));
  const woe = ai.wrongOptionExplanations as Array<Record<string, unknown>>;
  check(
    "어댑터: 오답해설 4개 · 라벨 1,2,4,5",
    woe.length === 4 && woe.map((w) => w.label).join(",") === "1,2,4,5",
    woe.map((w) => w.label).join(","),
  );
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check(
    "어댑터: 지문 필드·빈칸 계열 이물 없음",
    !("passageWithUnderline" in ai) &&
      !("blanks" in ai) &&
      !("passageWithBlank" in ai) &&
      !("originalExpression" in ai),
  );

  const pp = postProcessQuestion("IMPLIED_MEANING", PASSAGE, ai as never);
  check("후처리: 성공", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  const pwu = String(data.passageWithUnderline ?? "");
  check(
    "후처리: passageWithUnderline 에 __밑줄__ 1곳 생성",
    pwu.includes(`__${TARGET}__`) && (pwu.match(/__/g) ?? []).length === 2,
    pwu.slice(-90),
  );
  check("후처리: correctAnswer '3' 유지", data.correctAnswer === "3", String(data.correctAnswer));
  check("후처리: 단일 정답은 correctAnswers 미생성", !("correctAnswers" in data));
  check(
    "후처리: 발문 한국어 표준형",
    String(data.direction).includes("함축"),
    String(data.direction),
  );

  // ── 품질 검증(기록만) — 레인 필터 적용 후 error 0 이어야 한다 ──────────────
  const finalQuestion = {
    ...data,
    _typeId: "IMPLIED_MEANING",
    difficulty: "KILLER",
  } as Record<string, unknown>;
  const issues = validateQuestionQuality({
    typeId: "IMPLIED_MEANING",
    question: finalQuestion,
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    genericOptionCount: 5,
    genericAnswerCount: 1,
    stemLanguage: "ko",
    optionLanguage: "en",
  });
  const errorCodes = issues.filter((i) => i.severity === "error").map((i) => i.code);
  const filtered = IMPLIED_MEANING_MD_LANE.filterQualityIssues
    ? IMPLIED_MEANING_MD_LANE.filterQualityIssues(errorCodes, {} as MdLaneContext)
    : errorCodes;
  check(
    "품질검증: 레인 필터 후 error 0 (KILLER)",
    filtered.length === 0,
    `raw=[${errorCodes.join(",")}] filtered=[${filtered.join(",")}]`,
  );
  check(
    "품질검증: 걸러낸 것은 계약 부재 3종뿐",
    errorCodes.every(
      (code) =>
        filtered.includes(code) ||
        [
          "implied-meaning-missing-surface-meaning",
          "implied-meaning-thin-reasoning-gap",
          "implied-meaning-thin-evidence-chain",
        ].includes(code),
    ),
    errorCodes.join(","),
  );

  // ── 셔플(IMPLIED_MEANING 은 SHUFFLE_OPTION_TYPES 멤버) 정합 ────────────────
  let shuffleOk = true;
  let shuffleDetail = "";
  for (let i = 0; i < 40; i += 1) {
    const shuffled = shuffleQuestionOptionsForDiversity({ ...data }, "IMPLIED_MEANING");
    const sOpts = shuffled.options as Array<Record<string, unknown>>;
    const answerLabel = String(shuffled.correctAnswer);
    const answerText = sOpts.find((o) => String(o.label) === answerLabel)?.text;
    if (answerText !== "The city destroyed a history it never understood.") {
      shuffleOk = false;
      shuffleDetail = `${answerLabel} → ${String(answerText)}`;
      break;
    }
    const woeMap = shuffled.wrongOptionExplanations as Record<string, string>;
    if (woeMap && typeof woeMap === "object" && !Array.isArray(woeMap)) {
      if (Object.keys(woeMap).includes(answerLabel)) {
        shuffleOk = false;
        shuffleDetail = `오답해설에 정답 라벨 ${answerLabel} 잔존`;
        break;
      }
      if (Object.keys(woeMap).length !== 4) {
        shuffleOk = false;
        shuffleDetail = `오답해설 ${Object.keys(woeMap).length}개`;
        break;
      }
    }
  }
  check("셔플: 40회 반복 정답·오답해설 라벨 정합", shuffleOk, shuffleDetail);
}

// ───────────────────────────────────────────────────────────────────────────
// 8. 복수 정답(N=6 · K=2) 경로
// ───────────────────────────────────────────────────────────────────────────
const MULTI = `밑줄: ${TARGET}
① The city produced a brand-new written record.
② The city erased a past it never examined.
③ Careful restoration preserved the older layers of memory.
④ The city discarded evidence it had not yet understood.
⑤ Every modern paving project should be stopped now.
⑥ Residents demanded the cheaper slabs for their streets.
정답: ②, ④
해설: 낡은 포장이 사라지면 세대의 흔적도 함께 사라진다고 말합니다. 밑줄은 도시가 이해하지 못한 과거를 지웠다는 판단을 함축하므로 두 진술이 모두 정답입니다.
오답:
① 표면직역 — 글자 그대로 기록을 새로 만들었다는 뜻으로 옮겼을 뿐입니다.
③ 방향반대 — 필자는 보존이 아니라 소실을 말하고 있어 평가 방향이 정반대입니다.
⑤ 범위확대 — 지문에 없는 처방으로 범위를 넓혔습니다.
⑥ 근거없음 — 주민 선호는 지문에 근거가 없습니다.`;
{
  const q = autoSnapImpliedTarget(parseMdImplied(MULTI), PASSAGE).question;
  check("복수정답 파싱: 선지 6개", q.options.length === 6, `실제 ${q.options.length}`);
  check("복수정답 파싱: 정답 ②,④", q.answers.join(",") === "②,④", q.answers.join(","));
  const issues = gateMdImplied(q, PASSAGE, { optionCount: 6, answerCount: 2 });
  check("복수정답 게이트: 클린", issues.length === 0, issues.join(" / "));
  check(
    "복수정답 게이트: 설정이 1개면 반려",
    gateMdImplied(q, PASSAGE, { optionCount: 6, answerCount: 1 }).some((i) =>
      i.includes("정답 2개"),
    ),
  );
  const ad = adaptMdImpliedToAiQuestion(q, PASSAGE, "INTERMEDIATE");
  const ai = (ad.aiQuestion ?? {}) as Record<string, unknown>;
  check("복수정답 어댑터: correctAnswer '2, 4'", ai.correctAnswer === "2, 4", String(ai.correctAnswer));
  check(
    "복수정답 어댑터: correctAnswers 배열",
    Array.isArray(ai.correctAnswers) && (ai.correctAnswers as string[]).join(",") === "2,4",
  );
  check(
    "복수정답 어댑터: '모두' 발문",
    ai.direction === IMPLIED_MD_DIRECTION_MULTI && String(ai.direction).includes("모두"),
  );
  const woe = ai.wrongOptionExplanations as Array<Record<string, unknown>>;
  check(
    "복수정답 어댑터: 오답해설 4개 · 라벨 1,3,5,6",
    woe.length === 4 && woe.map((w) => w.label).join(",") === "1,3,5,6",
    woe.map((w) => w.label).join(","),
  );
  const pp = postProcessQuestion("IMPLIED_MEANING", PASSAGE, ai as never);
  check("복수정답 후처리: 성공", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  check(
    "복수정답 후처리: correctAnswers 유지 + 모두 고르기 발문",
    Array.isArray(data.correctAnswers) &&
      (data.correctAnswers as string[]).join(",") === "2,4" &&
      String(data.direction).includes("모두"),
    `${String(data.correctAnswer)} / ${String(data.direction)}`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 9. 한국어 보기 설정(optionLanguage=ko) 경로
// ───────────────────────────────────────────────────────────────────────────
const KO_OPTIONS = `밑줄: ${TARGET}
① 도시가 새로운 기록물을 하나 만들어 냈다는 뜻입니다.
② 세심한 복원이 오래된 기억의 층을 지켜 냈다는 뜻입니다.
③ 도시가 끝내 이해하지 못한 역사를 없앴다는 뜻입니다.
④ 모든 포장 교체 사업을 당장 멈춰야 한다는 뜻입니다.
⑤ 주민들이 더 싼 포장재를 요구했다는 뜻입니다.
정답: ③
해설: 낡은 포장이 사라질 때 세대의 흔적도 함께 사라진다고 말합니다. 밑줄은 도시가 무엇을 지우는지 모른 채 손댔다는 판단을 함축합니다.
오답:
① 표면직역 — 글자 그대로만 읽은 결과입니다.
② 방향반대 — 필자의 평가 방향이 정반대입니다.
④ 범위확대 — 지문에 없는 처방으로 넓혔습니다.
⑤ 근거없음 — 지문에 근거가 없습니다.`;
{
  const q = autoSnapImpliedTarget(parseMdImplied(KO_OPTIONS), PASSAGE).question;
  const ko = gateMdImplied(q, PASSAGE, {
    optionCount: 5,
    answerCount: 1,
    optionLanguage: "ko",
  });
  const en = gateMdImplied(q, PASSAGE, {
    optionCount: 5,
    answerCount: 1,
    optionLanguage: "en",
  });
  check("보기 언어 ko: 한국어 선지 통과", ko.length === 0, ko.join(" / "));
  check(
    "보기 언어 en: 한국어 선지 반려(설정 집행)",
    en.some((i) => i.includes("한글이 섞임")),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 10. 레인 계약
// ───────────────────────────────────────────────────────────────────────────
function ctxOf(overrides?: Partial<MdLaneContext>): MdLaneContext {
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

check("레인: subType IMPLIED_MEANING", IMPLIED_MEANING_MD_LANE.subType === "IMPLIED_MEANING");
check(
  "레인: 과금 QUESTION_GEN_SINGLE (2크레딧) — fast VOCAB_TYPES 밖",
  IMPLIED_MEANING_MD_LANE.operationType === "QUESTION_GEN_SINGLE" &&
    CREDIT_COSTS.QUESTION_GEN_SINGLE === 2,
  String(IMPLIED_MEANING_MD_LANE.operationType),
);
check("레인: retryEligible", IMPLIED_MEANING_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 4~8지 · 정답 1~N-1",
  IMPLIED_MEANING_MD_LANE.isEligible({ genericOptionCount: 5, genericAnswerCount: 1 }) &&
    IMPLIED_MEANING_MD_LANE.isEligible({ genericOptionCount: 8, genericAnswerCount: 7 }) &&
    IMPLIED_MEANING_MD_LANE.isEligible({}) &&
    !IMPLIED_MEANING_MD_LANE.isEligible({ genericOptionCount: 9, genericAnswerCount: 1 }) &&
    !IMPLIED_MEANING_MD_LANE.isEligible({ genericOptionCount: 3, genericAnswerCount: 1 }) &&
    !IMPLIED_MEANING_MD_LANE.isEligible({ genericOptionCount: 5, genericAnswerCount: 5 }),
);
check(
  "레인: diversityTargets = underlinedExpression",
  IMPLIED_MEANING_MD_LANE.diversityTargets({ underlinedExpression: TARGET }).join("") ===
    TARGET && IMPLIED_MEANING_MD_LANE.diversityTargets({}).length === 0,
);
check(
  "레인: mdFormat 실값",
  JSON.stringify(IMPLIED_MEANING_MD_LANE.mdFormat(ctxOf())) ===
    JSON.stringify({ optionCount: 5, answerCount: 1, optionLanguage: "en" }),
  JSON.stringify(IMPLIED_MEANING_MD_LANE.mdFormat(ctxOf())),
);
check(
  "레인: qualityArgs 실값(설정 집행)",
  JSON.stringify(
    IMPLIED_MEANING_MD_LANE.qualityArgs(
      ctxOf({ resolved: { genericOptionCount: 6, genericAnswerCount: 2 } }),
    ),
  ) ===
    JSON.stringify({
      genericOptionCount: 6,
      genericAnswerCount: 2,
      stemLanguage: "ko",
      optionLanguage: "en",
    }),
  JSON.stringify(
    IMPLIED_MEANING_MD_LANE.qualityArgs(
      ctxOf({ resolved: { genericOptionCount: 6, genericAnswerCount: 2 } }),
    ),
  ),
);
check(
  "레인: parseAndGate 정상 클린",
  IMPLIED_MEANING_MD_LANE.parseAndGate(GOOD, ctxOf()).gateIssues.length === 0,
  IMPLIED_MEANING_MD_LANE.parseAndGate(GOOD, ctxOf()).gateIssues.join(" / "),
);
check(
  "레인: parseAndGate 가 설정 개수를 집행(6지 설정에 5지 출력이면 반려)",
  IMPLIED_MEANING_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ resolved: { genericOptionCount: 6, genericAnswerCount: 1 } }),
  ).gateIssues.some((i) => i.includes("선지 5개")),
);
check(
  "레인: parseAndGate 가 스냅 기록을 넘긴다",
  IMPLIED_MEANING_MD_LANE.parseAndGate(
    GOOD.replace(TARGET, "A Page It Had Never Read"),
    ctxOf(),
  ).corrections.length === 1,
);
{
  const laneParsed = IMPLIED_MEANING_MD_LANE.parseAndGate(GOOD, ctxOf());
  const ko = IMPLIED_MEANING_MD_LANE.adapt(laneParsed, ctxOf());
  const en = IMPLIED_MEANING_MD_LANE.adapt(
    laneParsed,
    ctxOf({ rawTypeSettings: { stemLanguage: "en" } }),
  );
  check("레인: adapt 기본 한국어 발문", ko.aiQuestion?.direction === IMPLIED_MD_DIRECTION);
  check(
    "레인: stemLanguage=en 이면 영어 발문(설정 집행)",
    typeof en.aiQuestion?.direction === "string" &&
      !/[가-힣]/.test(String(en.aiQuestion?.direction)),
    String(en.aiQuestion?.direction),
  );
}
{
  const extras = IMPLIED_MEANING_MD_LANE.buildExtras(ctxOf());
  check(
    "레인: buildExtras 에 표적 후보 블록 주입",
    extras.some((e) => e.includes("IMPLIED_MEANING target")),
    extras.map((e) => e.slice(0, 40)).join(" | "),
  );
  const enExtras = IMPLIED_MEANING_MD_LANE.buildExtras(
    ctxOf({ rawTypeSettings: { stemLanguage: "en" } }),
  );
  check(
    "레인: stemLanguage=en 이면 질문 언어 블록 추가",
    enExtras.some((e) => e.includes("질문 언어")),
  );
}
check(
  "레인: filterQualityIssues 가 계약 부재 3종만 제거",
  IMPLIED_MEANING_MD_LANE.filterQualityIssues!(
    [
      "implied-meaning-missing-surface-meaning",
      "implied-meaning-thin-reasoning-gap",
      "implied-meaning-thin-evidence-chain",
      "implied-meaning-noncentral-target",
      "option-count",
    ],
    ctxOf(),
  ).join(",") === "implied-meaning-noncentral-target,option-count",
);

// ───────────────────────────────────────────────────────────────────────────
// 11. 프롬프트 계약 (난이도 3분기 · 설정 반영 · 클램프)
// ───────────────────────────────────────────────────────────────────────────
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdImpliedPrompt(PASSAGE, "full", d, { optionCount: 6 });
  check(
    `프롬프트 ${d}: 난이도 분기 + 6지 스캐폴드 + 형식 + 지문`,
    p.includes("## 표적 설계") &&
      p.includes("⑥ <선지>") &&
      p.includes("밑줄: <지문에서 밑줄 칠 표현") &&
      p.includes("## 지문") &&
      p.includes(PASSAGE.slice(0, 40)),
  );
}
check(
  "프롬프트: BASIC 은 few-shot 생략, KILLER 는 포함(견본 선례)",
  !buildMdImpliedPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") &&
    buildMdImpliedPrompt(PASSAGE, "full", "KILLER").includes("모범 설계 해부"),
);
check(
  "프롬프트: 난이도별 표적 설계 문구가 서로 다르다",
  new Set(
    (["BASIC", "INTERMEDIATE", "KILLER"] as const).map(
      (d) => buildMdImpliedPrompt(PASSAGE, "full", d).split("## 표적 설계")[1]?.slice(0, 120),
    ),
  ).size === 3,
);
check(
  "프롬프트: 오답 기제 분류학 6종 명시",
  ["표면직역", "방향반대", "범위확대", "근거없음", "부분해석", "인과역전"].every((k) =>
    buildMdImpliedPrompt(PASSAGE, "full", "KILLER").includes(k),
  ),
);
check(
  "프롬프트: 리트머스 검사(표면-이면 간극) 자기검산 포함",
  buildMdImpliedPrompt(PASSAGE, "full", "KILLER").includes("리트머스 검사"),
);
check(
  "프롬프트: 보기 언어 en/ko 분기",
  buildMdImpliedPrompt(PASSAGE, "full", "KILLER", { optionLanguage: "en" }).includes(
    "전부 영어",
  ) &&
    buildMdImpliedPrompt(PASSAGE, "full", "KILLER", { optionLanguage: "ko" }).includes(
      "전부 한국어 완결 진술문",
    ),
);
check(
  "프롬프트: 복수 정답이면 병기 형식·개수 명시",
  buildMdImpliedPrompt(PASSAGE, "full", "KILLER", {
    optionCount: 6,
    answerCount: 2,
  }).includes("정답이 2개"),
);
check(
  "프롬프트: answer-only 모드는 오답 섹션 미요구",
  !buildMdImpliedPrompt(PASSAGE, "answer-only", "KILLER").includes("\n오답:\n"),
);
check(
  "프롬프트: 선지 줄에 정답 표시 칸을 요구하지 않는다(단순화 계약)",
  !buildMdImpliedPrompt(PASSAGE, "full", "KILLER").includes("O 또는 X"),
);
check(
  "프롬프트: 6단어 상한이 게이트와 같은 숫자",
  buildMdImpliedPrompt(PASSAGE, "full", "KILLER").includes("6단어 이내"),
);
// ── 회귀 고정(major, prompt-quality): 프롬프트가 자기 게이트를 위반하는 표적을
//    모범으로 제시하면, 모델이 그것을 모방해 반려된다. md 는 재생성이 1회뿐이라
//    반려는 곧 실패·환불이다. 게다가 "7단어를 6단어라 부른" 해부는 자기검산
//    ("밑줄 단어 수를 세어라")의 계수 기준 자체를 오염시킨다.
{
  const claims = [
    ...buildMdImpliedPrompt(PASSAGE, "full", "KILLER").matchAll(
      /"([^"]+)"\((\d+)단어\)/g,
    ),
  ];
  check(
    "프롬프트: 단어 수 표기가 실제 계수와 일치(해부 표기 오염 방지)",
    claims.length > 0 &&
      claims.every(([, span, n]) => countWordsForQuality(span) === Number(n)),
    claims
      .map(([, span, n]) => `${span}=${countWordsForQuality(span)}(표기 ${n})`)
      .join(" / "),
  );
  check(
    "프롬프트: 해부가 제시한 표적이 게이트 상한을 스스로 통과",
    claims.length > 0 &&
      claims.every(
        ([, span]) =>
          countWordsForQuality(span) <= IMPLIED_MD_TARGET_MAX_WORDS &&
          countImpliedMeaningLexicalUnits(span) <= IMPLIED_MD_TARGET_MAX_WORDS &&
          span.length <= IMPLIED_MD_TARGET_MAX_CHARS,
      ),
    claims.map(([, span]) => `${span}=${countWordsForQuality(span)}단어`).join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 11-B. 표적 후보 블록 — md 출력 계약과 1:1 이어야 한다 (회귀 고정)
//   fast 공용 블록은 md 에 없는 surroundingText 출력을 요구하고 표적을 JSON
//   필드명으로 지칭하며, 후보 0건 분기가 base 의 보기 언어 설정을 뒤집는다.
// ───────────────────────────────────────────────────────────────────────────
{
  const CANDIDATE_PASSAGE =
    "A city map is not merely a picture of streets but a claim about which journeys matter. " +
    "Planners who redraw it rather than repair it decide, quietly, whose routes will be remembered. " +
    "The old paving served as a small archive of belonging for the people who crossed it daily. " +
    "In the end, the city was rewriting a page it had never read.";
  const withCandidates = buildMdImpliedCandidateBlock(CANDIDATE_PASSAGE, "KILLER");
  const fallback = buildMdImpliedCandidateBlock(PASSAGE, "KILLER");
  check(
    "후보 블록: 후보 검출 분기와 fallback 분기가 모두 재현된다",
    withCandidates.includes("target candidates") && fallback.includes("guardrail"),
    `${withCandidates.slice(0, 40)} / ${fallback.slice(0, 40)}`,
  );
  for (const [name, block] of [
    ["후보", withCandidates],
    ["fallback", fallback],
  ] as const) {
    check(
      `후보 블록(${name}): md 계약에 없는 출력을 요구하지 않는다`,
      !block.includes("surroundingText") && !block.includes("underlinedExpression"),
      block,
    );
    check(
      `후보 블록(${name}): 표적 입력 줄을 \`밑줄:\` 로 지칭`,
      block.includes("밑줄:"),
      block,
    );
    check(
      `후보 블록(${name}): 선지 언어를 한 마디도 하지 않는다(base 단일 진실원)`,
      !/English|영어|한국어/.test(block),
      block,
    );
  }
  check(
    "후보 블록: 추천 후보는 `밑줄:` 줄 형태로 제시",
    /→ `밑줄: .+`/.test(withCandidates),
    withCandidates,
  );
  // 게이트 #2(자리 유일)와 정합 — 2회 등장 표현은 추천하지 않는다.
  const DUP_PASSAGE =
    "A city map is not merely a picture of streets but a claim about which journeys matter. " +
    "The paving served as a small archive of belonging. " +
    "Every neighbourhood kept a small archive of belonging in its worn stones.";
  const dupBlock = buildMdImpliedCandidateBlock(DUP_PASSAGE, "KILLER");
  check(
    "후보 블록: 지문에 2회 등장하는 표현은 후보에서 제외(게이트 #2 정합)",
    !dupBlock.includes("밑줄: a small archive of belonging"),
    dupBlock,
  );
  check(
    "후보 블록: KILLER 에서만 2단서 보정 문구",
    buildMdImpliedCandidateBlock(CANDIDATE_PASSAGE, "KILLER").includes("KILLER 보정") &&
      !buildMdImpliedCandidateBlock(CANDIDATE_PASSAGE, "BASIC").includes("KILLER 보정"),
  );
  check(
    "후보 블록: variantIndex 로테이션으로 후보 1번이 갈린다(다양성)",
    buildMdImpliedCandidateBlock(CANDIDATE_PASSAGE, "KILLER", { variantIndex: 0 }) !==
      buildMdImpliedCandidateBlock(CANDIDATE_PASSAGE, "KILLER", { variantIndex: 1 }),
  );
  // 레인 경유 — 한국어 보기 설정에서 extras 가 base 의 언어 지시를 뒤집지 않는다.
  const koExtras = IMPLIED_MEANING_MD_LANE.buildExtras(
    ctxOf({ rawTypeSettings: { optionLanguage: "ko" } }),
  );
  check(
    "레인: 보기 언어 ko 설정에서 extras 가 '선지는 영어' 로 뒤집지 않는다",
    koExtras.every((e) => !/English|영어/.test(e)),
    koExtras.join(" || ").slice(0, 200),
  );
  check(
    "레인: ko 설정에서도 base 는 한국어 선지를 지시(단일 진실원 유지)",
    IMPLIED_MEANING_MD_LANE.buildBasePrompt(
      ctxOf({ rawTypeSettings: { optionLanguage: "ko" } }),
    ).includes("전부 한국어 완결 진술문"),
  );
}

check(
  "클램프: optionCount 2→4, 99→8",
  clampImpliedMdOptionCount(2) === 4 &&
    clampImpliedMdOptionCount(99) === 8 &&
    clampImpliedMdOptionCount("x") === 5,
);
check(
  "클램프: answerCount 1~N-1",
  clampImpliedMdAnswerCount(99, 5) === 4 &&
    clampImpliedMdAnswerCount(0, 5) === 1 &&
    clampImpliedMdAnswerCount(3, 4) === 3,
);

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
