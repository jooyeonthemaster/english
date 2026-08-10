// 네모 어법(GRAMMAR_CHOICE_COMBO) — **fast 검증기 error 승격 이식분** 전용 픽스처.
// _test-md-combo.ts 에서 분리했다 — 보문 that 오라벨 픽스처를 더하자 그 파일이
// 587줄이 되어 스펙의 "파일 500줄 초과 금지"를 넘겼다(gate-combo.ts 를
// parser-combo.ts 에서 떼어낸 것과 같은 근거). 실행 진입점은 여전히
// `npx tsx scripts/_test-md-combo.ts` 하나이며, 그쪽이 runComboFastParityChecks()
// 를 호출해 전건을 그대로 돌린다 — 통과 건수는 분리 전후로 동일하다.
//
// 왜 이 묶음이 따로 설 자격이 있나: md 레인은 validateQuestionQuality 의 error 를
// **차단하지 않는다**(md-stream/route.ts:1073-1092 → :1147-1149 — 잡 result 에
// 기록만 한다). 그래서 fast 가 error 로 막던 항목은 전량 gate-combo.ts 로 승격
// 이식해야 하고, 그 이식이 실제로 살아 있는지를 검사하는 것이 이 파일이다.
import {
  autoSnapComboSlots,
  parseMdCombo,
  type MdComboQuestion,
} from "../src/lib/md-qgen/parser-combo";
import { gateMdCombo } from "../src/lib/md-qgen/gate-combo";
import { adaptMdComboToAiQuestion } from "../src/lib/md-qgen/adapter-combo";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";

type Check = (name: string, ok: boolean, detail?: string) => void;
type Has = (issues: string[], needle: string) => boolean;

const OPT = { slotCount: 3, optionCount: 5 } as const;

// ───────────────────────────────────────────────────────────────────────────
// 보문 that 오라벨 픽스처 — 해설만 갈아 끼워 오라벨 유무를 대조한다.
// (A) 는 인지·단언 동사 acknowledge 뒤 **명사절 보문소** that 이다. 이 자리를
// "목적격 관계대명사"라 부르거나 "목적어가 빠졌다"고 쓰면 사실관계 오류이고,
// 그 설명을 믿은 학생은 what 도 된다고 배운다(fast jul15 Q012 실사고).
// 다른 축은 전부 클린으로 맞춰 두었다 — 누설 없음(that/what 평행구 없음),
// 포인트코드 l·c·i 로 서로 다름, near-miss ①⑤, 틀린 후보 전건 사용.
// ───────────────────────────────────────────────────────────────────────────
const THAT_PASSAGE =
  "Ecologists acknowledge that a mature canopy lowers street temperatures, yet shade alone cannot rescue a starved root system. " +
  "Soil compacted by heavy machinery holds almost no water, so young trees fail within one dry season. " +
  "Crews who grasp this widen the trenches, add structural soil, and protect the root zone before planting begins.";
const THAT_MARKED =
  "Ecologists acknowledge [[A:that|what]] a mature canopy lowers street temperatures, yet shade alone cannot rescue a starved root system. " +
  "Soil [[B:compacted|compacting]] by heavy machinery holds almost no water, so young trees fail within one dry season. " +
  "Crews who grasp this widen the trenches, add structural soil, and [[C:protect|protecting]] the root zone before planting begins.";
const thatMd = (explanation: string) => `네모지문:
${THAT_MARKED}

원형·포인트:
(A) that | what | l
(B) compacted | compacting | c
(C) protect | protecting | i

선지:
① what …… compacted …… protect
② that …… compacting …… protecting
③ that …… compacted …… protect
④ what …… compacting …… protect
⑤ that …… compacted …… protecting
정답: ③
해설: ${explanation}
오답:
① (A)의 what 은 뒤 절이 완전해 잉여 명사구를 만듭니다.
② (B)의 compacting 은 능동이라 by 행위자구와 충돌하고, (C)의 protecting 은 등위 짝을 깨뜨립니다.
④ (A)의 what 이 절 구조를 깨고, (B)의 compacting 이 태를 뒤집습니다.
⑤ (C)의 protecting 은 widen, add 와 병렬을 이루지 못합니다.`;
const THAT_OK_EXPL =
  "(A)는 acknowledge 뒤에 완전한 절이 이어지므로 명사절을 이끄는 접속사 that 이 옳고, (B)는 by 행위자구가 뒤따라 과거분사 compacted 가 옳습니다. (C)는 widen, add 와 등위로 이어지므로 protect 가 옳습니다.";
const THAT_BAD_EXPL =
  "(A)는 뒤에 목적어가 빠진 절이 이어지므로 목적격 관계대명사 that 이 옳고, (B)는 by 행위자구가 뒤따라 과거분사 compacted 가 옳습니다. (C)는 widen, add 와 등위로 이어지므로 protect 가 옳습니다.";

/** md → 어댑터 → 후처리 → 검증기 왕복 후 남은 error 코드(= fast 축의 판정). */
function fastErrorCodes(md: string): string[] {
  const q = autoSnapComboSlots(parseMdCombo(md), THAT_PASSAGE).question;
  const ai = adaptMdComboToAiQuestion(q, THAT_PASSAGE, "KILLER").aiQuestion ?? {};
  const pp = postProcessQuestion("GRAMMAR_CHOICE_COMBO", THAT_PASSAGE, ai as never);
  return validateQuestionQuality({
    typeId: "GRAMMAR_CHOICE_COMBO",
    question: (pp.data ?? {}) as Record<string, unknown>,
    passage: THAT_PASSAGE,
    requestedDifficulty: "KILLER",
    stemLanguage: "ko",
    optionLanguage: "ko",
  })
    .filter((i) => i.severity === "error")
    .map((i) => i.code);
}

/** 1네모 미니 픽스처 — 문맥 의존 게이트만 단독으로 태운다. */
function soloIssues(passage: string, marked: string, correct: string, wrong: string, code = "d") {
  return gateMdCombo(
    {
      kind: "combo", markedPassage: marked,
      slots: [{ label: "(A)", correct, wrong, code }],
      options: [], answer: "①", explanation: "(A) 구조 근거입니다.", wrong: [],
    },
    passage,
    { slotCount: 1, optionCount: 5, requireWrong: false },
  );
}

export function runComboFastParityChecks(check: Check, has: Has): void {
  // ── 수량 시비 · 지각동사 보어 토글 · 누설 3분기 ──────────────────────────
  check("게이트 #9b 수량 의미토글(few ↔ a few) 반려 — fast grammar-quantity-meaning-toggle",
    has(soloIssues(
      "City councils fund few pilot projects each year, and the results rarely travel.",
      "City councils fund [[A:few|a few]] pilot projects each year, and the results rarely travel.",
      "few", "a few", "m"), "수량 후보쌍"));
  check("게이트 #9b 수량 논쟁쌍(fewer ↔ less) 반려 — fast grammar-quantity-debatable",
    has(soloIssues(
      "Modern farms need fewer full-time workers than they did a generation ago.",
      "Modern farms need [[A:fewer|less]] full-time workers than they did a generation ago.",
      "fewer", "less", "m"), "수량 후보쌍"));
  check("게이트 #9b 정상 후보쌍은 수량 게이트에 걸리지 않음(과잉차단 방지)",
    soloIssues(
      "Modern farms need seasonal workers who arrive before the harvest begins.",
      "Modern farms need seasonal workers who [[A:arrive|arriving]] before the harvest begins.",
      "arrive", "arriving", "a").every((i) => !i.includes("수량 후보쌍")));
  check("게이트 #9c 지각동사 보어 토글 반려 — fast combo-perception-toggle",
    has(soloIssues(
      "Parents often watch their children struggle with long division for a whole term.",
      "Parents often watch their children [[A:struggle|struggling]] with long division for a whole term.",
      "struggle", "struggling", "a"), "지각·사역동사 보어 자리"));
  check("게이트 #11 연어 누설 — 면제 기능어(that)도 '직전 단어 + 후보'로 잡힌다",
    has(soloIssues(
      "Researchers know that soil moisture drives root growth. Officials also know that budgets shrink.",
      "Researchers know [[A:that|what]] soil moisture drives root growth. Officials also know that budgets shrink.",
      "that", "what", "b"), "연어 'know that'"));
  check("게이트 #11 that·what 패턴 누설 — 동사가 달라도(know vs assume) 반려",
    has(soloIssues(
      "Researchers know that soil moisture drives root growth. Officials assume that budgets shrink.",
      "Researchers know [[A:that|what]] soil moisture drives root growth. Officials assume that budgets shrink.",
      "that", "what", "b"), "패턴 누설"));
  check("게이트 #11 평행구가 없으면 that·what 슬롯도 통과(과잉차단 방지)",
    soloIssues(
      "Researchers know that soil moisture drives root growth in shallow urban beds.",
      "Researchers know [[A:that|what]] soil moisture drives root growth in shallow urban beds.",
      "that", "what", "b").every((i) => !i.includes("누설")));

  // ── 보문 that 오라벨 (fast combo-complementizer-that-mislabel) ───────────
  // 재검증 26-07-26 독립 프로브 지적분: gate-combo.ts 머리 주석이 "fast 가 error
  // 로 잡는 것을 전량 승격했다"고 선언하는데 이 검사만 빠져 있었다.
  const thatGateOf = (expl: string) =>
    gateMdCombo(autoSnapComboSlots(parseMdCombo(thatMd(expl)), THAT_PASSAGE).question, THAT_PASSAGE, OPT);
  check("게이트 #12b 보문 that 오라벨 반려 — fast combo-complementizer-that-mislabel",
    has(thatGateOf(THAT_BAD_EXPL), "명사절 보문소"), thatGateOf(THAT_BAD_EXPL).join(" / "));
  check("게이트 #12b 올바른 해설(접속사로 명명)은 클린 — 과잉차단 방지",
    thatGateOf(THAT_OK_EXPL).length === 0, thatGateOf(THAT_OK_EXPL).join(" / "));
  // 이식의 근거 대조 — 같은 입력을 fast 는 error 로 잡는다. md 게이트가 비어
  // 있으면 그 error 는 기록만 되고 문항은 그대로 저장된다.
  const badCodes = fastErrorCodes(thatMd(THAT_BAD_EXPL));
  check("검증기 대조: fast 는 같은 입력을 combo-complementizer-that-mislabel 로 잡는다",
    badCodes.includes("combo-complementizer-that-mislabel"), badCodes.join(" / ") || "error 0");
  const okCodes = fastErrorCodes(thatMd(THAT_OK_EXPL));
  check("검증기 대조: 올바른 해설본은 fast 도 error 0(게이트 축이 fast 와 동형)",
    okCodes.length === 0, okCodes.join(" / "));
  // 판정 근거는 해설 문구가 아니라 **네모 직전 동사**다(fast :101-104 동형).
  // 선행사 뒤 진짜 목적격 관계대명사 자리를 관계대명사라 부른 정상 해설까지
  // 반려하면 과잉차단이고, 동사 목록 파생이 무너져 정규식이 아무거나 물면
  // 이 check 가 먼저 터진다 — 파생 회귀의 방벽이기도 하다.
  const REL_P = "The report that officials filed last week lists every street tree.";
  const relIssues = gateMdCombo(
    {
      kind: "combo",
      markedPassage: "The report [[A:that|what]] officials filed last week lists every street tree.",
      slots: [{ label: "(A)", correct: "that", wrong: "what", code: "b" }],
      options: [], answer: "①", wrong: [],
      explanation: "(A)는 뒤에 목적어가 빠진 불완전한 절이 이어지므로 목적격 관계대명사 that 이 옳습니다.",
    },
    REL_P,
    { slotCount: 1, optionCount: 5, requireWrong: false },
  );
  check("게이트 #12b 선행사 뒤 진짜 관계대명사 자리는 반려하지 않음 — 과잉차단 방지",
    !has(relIssues, "명사절 보문소"), relIssues.join(" / "));

  // ── 누설 · 주격 관계대명사 직후 준동사(#11 · #12) 미니 픽스처 ─────────────
  const MINI = "A device that measures air quality logs the data. Officials measures nothing without it. Teams share the data widely.";
  const MINI_Q: MdComboQuestion = {
    kind: "combo",
    markedPassage:
      "A device that [[A:measures|measuring]] air quality logs the data. Officials measures nothing without it. Teams [[B:share|sharing]] the data widely.",
    slots: [
      { label: "(A)", correct: "measures", wrong: "measuring", code: "a" },
      { label: "(B)", correct: "share", wrong: "sharing", code: "i" },
    ],
    options: [],
    answer: "①",
    explanation: "(A) 정동사 자리입니다. (B) 등위 자리입니다.",
    wrong: [],
  };
  const miniIssues = gateMdCombo(MINI_Q, MINI, { slotCount: 2, optionCount: 5 });
  check("게이트 #11 후보 누설(네모 밖 재등장) 반려", has(miniIssues, "정답 누설"), miniIssues.join(" / "));
  check("게이트 #12 주격 관계대명사 직후 준동사 후보 반려", has(miniIssues, "즉답 giveaway"), miniIssues.join(" / "));
}
