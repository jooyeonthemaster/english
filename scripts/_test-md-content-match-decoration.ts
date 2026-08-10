// ============================================================================
// 내용 일치 — **웨이브2 R2 회귀 픽스처**(silent-drop 계통 전수).
// 본편 _test-md-content-match.ts 가 import 해서 실행한다(500줄 규칙 분할).
//
// 왜 전수 곱셈인가: 1차 수리가 머리표의 `**`·`__` 만 관용하고 (a) 값 쪽 기울임
// 1글자(`*`·`_`)·따옴표, (b) **라벨별** 장식(`정답: **③**, **⑤**`), (c) 콜론 없는
// 마크다운 헤딩(`## 근거`)을 남겼다. 그 결과 `정답: **③**, **⑤**` 가 ③ 하나로만
// 확정돼 게이트가 "정답 1개(2개 필요)" 라는 **사실과 다른 개수 진단**과 "⑤ 오답해설
// 누락"(진짜 정답에 오답해설을 쓰라는 **유해한 지시**)을 함께 냈다 — 그 문구가 그대로
// [반려 재생성] 피드백에 실려 1회뿐인 재생성을 오지시로 태운다(§1-B 철칙 3·5).
// 한 칸이라도 비면 같은 사고가 그 칸으로 다시 들어온다.
// ============================================================================
import {
  autoSnapContentMatchEvidence,
  parseContentMatchAnswerRun,
  parseMdContentMatch,
  splitPassageSentences,
} from "../src/lib/md-qgen/parser-content-match";
import {
  gateMdContentMatch,
  type ContentMatchGateOptions,
} from "../src/lib/md-qgen/gate-content-match";
import { adaptMdContentMatchToAiQuestion } from "../src/lib/md-qgen/adapter-content-match";
import { postProcessQuestion } from "../src/lib/question-postprocess";

export interface ContentMatchDecorationDeps {
  check: (name: string, ok: boolean, detail?: string) => void;
  PASSAGE: string;
  S: readonly string[];
  GOOD: string;
  GOOD6: string;
  OPTIONS5: readonly string[];
  EVIDENCE5: readonly string[];
  WRONG5: readonly [string, string][];
  BASE_GATE: ContentMatchGateOptions;
  GATE6: ContentMatchGateOptions;
  buildMd: (input: {
    options: string[];
    evidence: string[];
    answer: string;
    explanation?: string;
    wrong: [string, string][];
  }) => string;
}

/** `키워드: 값` 한 줄을 장식하는 생성기 — 8종 계통을 전부 덮는다. */
type Deco = [string, (kw: string, value: string) => string];

const VALUE_DECOS: Deco[] = [
  ["굵게 머리", (k, v) => `**${k}:** ${v}`],
  ["굵게 값", (k, v) => `${k}: **${v}**`],
  ["콜론 뒤(라벨만 굵게)", (k, v) => `**${k}**: ${v}`],
  ["언더스코어2 머리", (k, v) => `__${k}:__ ${v}`],
  ["언더스코어1 머리", (k, v) => `_${k}:_ ${v}`],
  ["언더스코어1 값", (k, v) => `${k}: _${v}_`],
  ["언더스코어2 값", (k, v) => `${k}: __${v}__`],
  ["별표1 머리", (k, v) => `*${k}:* ${v}`],
  ["별표1 값", (k, v) => `${k}: *${v}*`],
  ["백틱 머리", (k, v) => `\`${k}:\` ${v}`],
  ["백틱 값", (k, v) => `${k}: \`${v}\``],
  ["헤딩", (k, v) => `## ${k}: ${v}`],
  ["헤딩+굵게", (k, v) => `### **${k}:** ${v}`],
  ["인용", (k, v) => `> ${k}: ${v}`],
  ["인용+굵게", (k, v) => `> **${k}:** ${v}`],
  ["불릿", (k, v) => `- ${k}: ${v}`],
  ["전각 콜론", (k, v) => `${k}： ${v}`],
  ["꼬리 공백", (k, v) => `${k}: ${v}   `],
  ["쌍장식 따옴표", (k, v) => `${k}: "${v}"`],
  ["쌍장식 곱슬따옴표", (k, v) => `${k}: “${v}”`],
  ["줄 전체 굵게", (k, v) => `**${k}: ${v}**`],
  ["줄 전체 언더스코어1", (k, v) => `_${k}: ${v}_`],
];

const HEAD_DECOS: [string, (kw: string) => string][] = [
  ["굵게", (k) => `**${k}:**`],
  ["콜론 뒤", (k) => `**${k}**:`],
  ["언더스코어2", (k) => `__${k}:__`],
  ["언더스코어1", (k) => `_${k}:_`],
  ["별표1", (k) => `*${k}:*`],
  ["백틱", (k) => `\`${k}:\``],
  ["헤딩", (k) => `## ${k}:`],
  ["헤딩+굵게", (k) => `### **${k}:**`],
  ["인용", (k) => `> ${k}:`],
  ["인용+굵게", (k) => `> **${k}:**`],
  ["불릿", (k) => `- ${k}:`],
  ["전각 콜론", (k) => `${k}：`],
  ["꼬리 공백", (k) => `${k}:   `],
  ["콜론 없음(헤딩 관습)", (k) => `## ${k}`],
  ["콜론 없음+굵게", (k) => `**${k}**`],
];

/** 항목 줄(라벨 + 값)의 값 쪽 장식 — 학생·교사 표면으로 그대로 새는 자리다. */
const ITEM_DECOS: [string, (label: string, text: string) => string][] = [
  ["언더스코어1", (l, t) => `${l} _${t}_`],
  ["별표1", (l, t) => `${l} *${t}*`],
  ["따옴표", (l, t) => `${l} "${t}"`],
  ["곱슬따옴표", (l, t) => `${l} “${t}”`],
  ["백틱", (l, t) => `${l} \`${t}\``],
  ["줄 전체 언더스코어2", (l, t) => `__${l} ${t}__`],
  ["헤딩", (l, t) => `### ${l} ${t}`],
  ["인용+불릿", (l, t) => `> - ${l} ${t}`],
];

export function runContentMatchDecorationFixtures(deps: ContentMatchDecorationDeps): void {
  const { check, PASSAGE, S, GOOD, GOOD6, OPTIONS5, EVIDENCE5, WRONG5, BASE_GATE, GATE6 } = deps;
  const parseOf = (text: string) =>
    autoSnapContentMatchEvidence(parseMdContentMatch(text), PASSAGE).question;
  const gateOf = (text: string, options: ContentMatchGateOptions = BASE_GATE) =>
    gateMdContentMatch(parseOf(text), PASSAGE, options);

  // ── 1. 라벨별 장식이 뒤 라벨을 삼키는가(R2 주지적) ───────────────────────────
  for (const [name, raw] of [
    ["굵게", "**③**, **⑤**"],
    ["백틱", "`③`, `⑤`"],
    ["언더스코어2", "__③__, __⑤__"],
    ["언더스코어1", "_③_, _⑤_"],
    ["별표1", "*③*, *⑤*"],
    ["따옴표", '"③", "⑤"'],
    ["곱슬따옴표", "“③”, “⑤”"],
    ["값 전체 굵게", "**③, ⑤**"],
    ["중점 구분", "**③** · **⑤**"],
    ["한글 접속(및)", "③ 및 ⑤"],
    ["한글 접속(과)", "③과 ⑤"],
    ["슬래시", "③/⑤"],
    ["숫자+굵게", "**3**, **5**"],
  ] as const) {
    check(
      `정답 런: 라벨별 장식이 뒤 라벨을 삼키지 않음 — ${name}`,
      parseContentMatchAnswerRun(raw).join(",") === "③,⑤",
      `'${raw}' → [${parseContentMatchAnswerRun(raw).join(",")}]`,
    );
  }
  check(
    "정답 런: 사족은 여전히 무시(과잉 관용 방지)",
    parseContentMatchAnswerRun("**③** — ④는 참이다").join(",") === "③" &&
      parseContentMatchAnswerRun("③ 그리고 나머지는 거짓").join(",") === "③",
    parseContentMatchAnswerRun("**③** — ④는 참이다").join(","),
  );

  // 복수 정답 전 구간(파싱 → 게이트 → 어댑터). 라벨별 장식이 실사용 설정이다.
  for (const [name, value] of [
    ["굵게", "**②**, **⑤**"],
    ["백틱", "`②`, `⑤`"],
    ["언더스코어1", "_②_, _⑤_"],
    ["별표1", "*②*, *⑤*"],
    ["따옴표", '"②", "⑤"'],
  ] as const) {
    const q6 = parseOf(GOOD6.replace("정답: ②, ⑤", `정답: ${value}`));
    const issues = gateMdContentMatch(q6, PASSAGE, GATE6);
    const adapt = adaptMdContentMatchToAiQuestion(q6, PASSAGE, "INTERMEDIATE", {
      matchType: "일치",
      answerCount: 2,
      stemLanguage: "ko",
    });
    check(
      `6지2정답 전 구간: 라벨별 장식 ${name}`,
      q6.answers.join(",") === "②,⑤" &&
        issues.length === 0 &&
        adapt.ok === true &&
        (adapt.aiQuestion as Record<string, unknown> | undefined)?.correctAnswer === "2, 5",
      `[${q6.answers.join(",")}] ${issues.join(" / ")} ${adapt.error ?? ""}`,
    );
  }

  // ── 2. 정답 축 미확정 상태에서 **유해한 파생 지시**를 내지 않는다 ─────────────
  {
    const partial = gateMdContentMatch(parseOf(GOOD6.replace("정답: ②, ⑤", "정답: ②")), PASSAGE, GATE6);
    check(
      "게이트: 정답 개수 미달이면 '오답해설 누락' 파생 지시를 내지 않음(⑤는 진짜 정답)",
      partial.some((i) => i.startsWith("정답 1개")) && !partial.some((i) => i.includes("오답해설 누락")),
      partial.join(" / "),
    );
    const stray = gateOf(GOOD.replace("정답: ③", "정답: ⑦"));
    check(
      "게이트: 정답 라벨이 선지 밖이면 파생 지시 없이 그 자리만 지목",
      stray.some((i) => i.includes("정답 라벨(⑦)")) && !stray.some((i) => i.includes("오답해설 누락")),
      stray.join(" / "),
    );
  }

  // ── 3. 키워드 줄 × 장식 전수 ────────────────────────────────────────────────
  for (const [name, deco] of VALUE_DECOS) {
    const text = GOOD.replace("정답: ③", deco("정답", "③"));
    const q = parseMdContentMatch(text);
    const issues = gateOf(text);
    check(
      `키워드 줄 \`정답:\` — ${name}`,
      q.answers.join(",") === "③" && issues.length === 0,
      `[${q.answers.join(",")}] ${issues.join(" / ")}`,
    );
  }
  for (const [name, deco] of VALUE_DECOS) {
    const text = GOOD.replace(/^해설: (.*)$/m, (_m, value: string) => deco("해설", value));
    const q = parseMdContentMatch(text);
    const issues = gateOf(text);
    check(
      `키워드 줄 \`해설:\` — ${name}`,
      q.explanation.length > 20 &&
        !/^[*_`"“'‘]/.test(q.explanation) &&
        !/[*_`"”'’]$/.test(q.explanation) &&
        issues.length === 0,
      `'${q.explanation.slice(0, 16)}…${q.explanation.slice(-10)}' ${issues.join(" / ")}`,
    );
  }
  for (const [keyword, anchor] of [
    ["선지", "선지:\n"],
    ["근거", "\n근거:\n"],
    ["오답", "\n오답:\n"],
  ] as const) {
    for (const [name, deco] of HEAD_DECOS) {
      const text = GOOD.replace(anchor, anchor.replace(`${keyword}:`, deco(keyword)));
      const q = parseMdContentMatch(text);
      const issues = gateOf(text);
      check(
        `머리표 \`${keyword}:\` — ${name}`,
        q.options.length === 5 && q.evidence.length === 5 && q.wrong.length === 4 && issues.length === 0,
        `선지${q.options.length}/근거${q.evidence.length}/오답${q.wrong.length} ${issues.join(" / ")}`,
      );
    }
  }

  // ── 4. 항목 줄 값 장식이 **표면까지** 새지 않는다(PASSTHROUGH — 후처리 무세척) ─
  for (const [name, deco] of ITEM_DECOS) {
    const text = GOOD.replace(`③ ${OPTIONS5[2]}`, deco("③", OPTIONS5[2]))
      .replace(`④ ${S[5]}`, deco("④", S[5]))
      .replace(`① ${WRONG5[0][1]}`, deco("①", WRONG5[0][1]));
    const q = parseMdContentMatch(text);
    const issues = gateOf(text);
    const clean =
      q.options[2]?.text === OPTIONS5[2] &&
      q.evidence[3]?.sentence === EVIDENCE5[3] &&
      q.wrong[0]?.text === WRONG5[0][1];
    check(
      `항목 줄 값 장식 — ${name}`,
      clean && issues.length === 0,
      `'${q.options[2]?.text?.slice(0, 26)}' / '${q.wrong[0]?.text?.slice(0, 18)}' ${issues.join(" / ")}`,
    );
    if (name === "별표1" || name === "따옴표") {
      const adapt = adaptMdContentMatchToAiQuestion(parseOf(text), PASSAGE, "KILLER", {
        matchType: "불일치",
        answerCount: 1,
      });
      const pp = postProcessQuestion("CONTENT_MATCH", PASSAGE, (adapt.aiQuestion ?? {}) as never);
      const saved = ((pp.data ?? {}) as Record<string, unknown>).options as
        | Array<Record<string, unknown>>
        | undefined;
      const woe = ((pp.data ?? {}) as Record<string, unknown>).wrongOptionExplanations as
        | Record<string, string>
        | undefined;
      // 후처리가 한국어 오답해설 앞에 선지 원문을 덧붙인다(정렬) — 그 선지 원문에도
      // 장식이 묻으면 교사 표면이 오염되므로 부분 문자열로 둘 다 확인한다.
      check(
        `표면 무오염(저장 형상까지) — ${name}`,
        adapt.ok === true &&
          saved?.[2]?.text === OPTIONS5[2] &&
          typeof woe?.["1"] === "string" &&
          woe["1"].includes(WRONG5[0][1]) &&
          woe["1"].includes(OPTIONS5[0]) &&
          woe["1"].includes(`(근거: "${EVIDENCE5[0]}")`),
        `${adapt.error ?? ""} '${saved?.[2]?.text}' / '${woe?.["1"]?.slice(0, 40)}'`,
      );
    }
  }

  // 굵게가 **두 줄에 걸친** 접힌 항목 — 닫는 표식이 뒷줄 끝에 있어 조각 단위
  // 정리로는 안 잡히고, 그대로 두면 학생 표면 선지가 `…planting.**` 로 나간다.
  {
    const half = OPTIONS5[2].slice(0, 30);
    const text = GOOD.replace(
      `③ ${OPTIONS5[2]}`,
      `③ **${half}\n${OPTIONS5[2].slice(30)}**`,
    );
    const q = parseMdContentMatch(text);
    check(
      "접힘 + 굵게: 두 줄에 걸친 장식이 표면에 남지 않음",
      q.options.length === 5 && q.options[2].text === OPTIONS5[2] && gateOf(text).length === 0,
      `'${q.options[2]?.text}' ${gateOf(text).join(" / ")}`,
    );
  }

  // ── 5. 값을 머리표 **다음 줄**에 쓰는 드리프트 ──────────────────────────────
  for (const [name, from, to] of [
    ["정답 값 다음 줄", "정답: ③\n", "정답:\n③\n"],
    ["헤딩 정답 + 다음 줄", "정답: ③\n", "## 정답\n③\n"],
    ["굵게 정답 + 다음 줄", "정답: ③\n", "**정답**\n③\n"],
  ] as const) {
    const text = GOOD.replace(from, to);
    const q = parseMdContentMatch(text);
    const issues = gateOf(text);
    check(
      `줄 유실 방지: ${name}`,
      q.answers.join(",") === "③" && issues.length === 0,
      `[${q.answers.join(",")}] ${issues.join(" / ")}`,
    );
  }

  // ── 6. 과잉 관용 방지 — 키워드로 시작하는 **산문 줄**은 머리표가 아니다 ───────
  {
    const prose = GOOD.replace(
      /^해설: (.*)$/m,
      (_m, value: string) => `해설: ${value}\n오답 진술은 지문의 시점 조건을 떼어 낸 것이다.`,
    );
    const q = parseMdContentMatch(prose);
    check(
      "과잉 관용 방지: '오답 진술은 …' 산문 줄을 머리표로 오인하지 않음",
      q.wrong.length === 4 && q.wrong[0].text === WRONG5[0][1],
      `오답${q.wrong.length} '${q.wrong[0]?.text?.slice(0, 20)}'`,
    );
  }
  {
    // 안쪽에 같은 따옴표가 또 있으면 본문의 일부다 — 벗기면 문장이 깨진다.
    const quoted = '"Green" corridors were once "decoration" in city budgets.';
    const text = GOOD.replace(`① ${OPTIONS5[0]}`, `① ${quoted}`);
    check(
      "과잉 관용 방지: 본문 속 따옴표는 벗기지 않음",
      parseMdContentMatch(text).options[0].text === quoted,
      parseMdContentMatch(text).options[0].text,
    );
  }

  // ── 7. 1차 수리가 만든 거짓 반려 — 약어 마침표 지문 ─────────────────────────
  // 게이트 #6-b 가 "근거 = 지문 문장 전체" 를 요구하므로, 문장 분해가 약어에서
  // 잘못 쪼개지면 **정상 문항이 반려된다**(1차 수리 전에는 통과하던 입력).
  for (const [name, head] of [
    ["U.S.", "Urban planners in the U.S. once treated street trees as decoration rather than infrastructure."],
    ["(e.g.", "Urban planners (e.g. in Seoul) once treated street trees as decoration rather than infrastructure."],
    ["p.m.", "Planners met at 3 p.m. and treated street trees as decoration rather than infrastructure."],
    ["U.K.", "Measurements from the U.K. proved that street trees are not decoration but infrastructure."],
  ] as const) {
    const sentences = [head, S[1], S[2], S[3], S[5], S[6]];
    const passage = sentences.join(" ");
    const text = deps.buildMd({
      options: [...OPTIONS5],
      evidence: [sentences[0], sentences[2], sentences[3], sentences[4], sentences[5]],
      answer: "③",
      wrong: WRONG5.map(([label, body]) => [label, body] as [string, string]),
    });
    const q = autoSnapContentMatchEvidence(parseMdContentMatch(text), passage).question;
    const issues = gateMdContentMatch(q, passage, BASE_GATE);
    check(
      `문장 분해: 약어 마침표(${name})가 문장을 쪼개지 않음(거짓 반려 방지)`,
      splitPassageSentences(passage).length === 6 && issues.length === 0,
      `문장 ${splitPassageSentences(passage).length}개 · ${issues.join(" / ")}`,
    );
  }
  for (const [name, sample, expected] of [
    ["기본 종결", "A ends here. B starts now! C too?", 3],
    ["소수점", "It rose 3.5 degrees in total. Then it fell.", 2],
    ["약어 Dr.", "Dr. Han spoke. He left.", 2],
    ["따옴표 종결", 'He said "trees matter." Then he left.', 2],
    ["곱슬따옴표 종결", "He said “trees matter.” Then he left.", 2],
    ["괄호 종결", "Trees cool cities (a lot). Then budgets rose.", 2],
    ["괄호 안 약어", "Cities (e.g. Seoul) act. Others wait.", 2],
    ["마지막 마침표 없음", "Trees cool cities. Budgets rose", 2],
  ] as const) {
    check(
      `문장 분해: 진짜 경계는 그대로 — ${name}`,
      splitPassageSentences(sample).length === expected,
      `${splitPassageSentences(sample).length} (기대 ${expected})`,
    );
  }
  check(
    "문장 분해: 본편 지문 7문장(무회귀)",
    splitPassageSentences(PASSAGE).length === 7,
    String(splitPassageSentences(PASSAGE).length),
  );
  {
    // 본문 **중간**의 강조 — 공유 유틸 계약(decoration 픽스처 `were *once* regarded`
    // → `were once regarded`)대로 **표식만** 흘리고 낱말은 한 글자도 잃지 않는다.
    // 종전 이 유형의 자체 처리는 가장자리만 벗겨 `*once*` 를 그대로 저장했고,
    // CONTENT_MATCH 는 PASSTHROUGH 라 후처리가 씻어 주지 않아 그 별표가 **학생 표면
    // 선지**로 출하됐다. 낱말이 살아 있으므로 진술의 뜻은 바뀌지 않는다(과잉 제거 아님).
    const inline = "Street trees were *once* regarded as ornament instead of civic infrastructure.";
    const cleaned = "Street trees were once regarded as ornament instead of civic infrastructure.";
    const text = GOOD.replace(`① ${OPTIONS5[0]}`, `① ${inline}`);
    const got = parseMdContentMatch(text).options[0].text;
    check(
      "본문 중간 강조: 표식만 흘리고 낱말은 보존(공유 유틸 계약)",
      got === cleaned && got.includes("were once regarded") && !got.includes("*"),
      got,
    );
    // 강조가 낱말을 쪼개도(`infra*struct*ure`) 낱말은 복원돼야 한다 — 조각 소실 금지.
    const split = GOOD.replace(`① ${OPTIONS5[0]}`, `① ${OPTIONS5[0].replace("civic", "ci*vi*c")}`);
    check(
      "본문 중간 강조: 낱말 내부 표식도 낱말을 쪼개지 않음",
      parseMdContentMatch(split).options[0].text === OPTIONS5[0],
      parseMdContentMatch(split).options[0].text,
    );
    // 낱말 내부 언더스코어(식별자)는 살린다 — 공유 유틸의 보존 규칙 무회귀.
    const snake = GOOD.replace(`① ${OPTIONS5[0]}`, "① The field named tree_canopy_index rose in every coastal city.");
    check(
      "본문 중간 강조: 낱말 내부 언더스코어는 보존(식별자 훼손 금지)",
      parseMdContentMatch(snake).options[0].text ===
        "The field named tree_canopy_index rose in every coastal city.",
      parseMdContentMatch(snake).options[0].text,
    );
  }

  // ── 9. 한국어 산문이 머리표로 오인돼 섹션을 자르지 않는다(내용 글자 가드) ────
  // 이 유형의 해설·오답 해설은 전부 한국어라 접힘 줄이 "정답과 …" · "근거 문장이 …"
  // 처럼 키워드로 시작하는 일이 실제로 일어난다. 그 줄을 머리표로 읽으면 거기서
  // 구역이 잘려 **뒤 항목이 통째로 사라지고**, 게이트는 "오답해설 2개(4개 필요)" +
  // "④ 오답해설 누락" 이라는 사실과 다른 원인을 재생성 피드백으로 내보낸다.
  for (const [name, head] of [
    ["정답", "정답과 어긋나지 않으므로"],
    ["오답", "오답 진술로 보이지만"],
    ["근거", "근거 문장이 이를 확정하므로"],
    ["근거 문장", "근거 문장은 시점 조건을 달고 있어"],
    ["해설", "해설에서 짚은 대로"],
    ["선지", "선지 표현이 지문과 멀지만"],
  ] as const) {
    // ② 오답 해설을 두 줄로 접고, 뒷줄을 키워드로 시작하는 한국어 산문으로 만든다.
    const folded = GOOD.replace(
      `② ${WRONG5[1][1]}`,
      `② 최대 삼 도까지 낮아졌다는 측정 결과가\n${head} 이 진술은 참입니다.`,
    );
    const q = parseMdContentMatch(folded);
    const issues = gateOf(folded);
    check(
      `섹션 붕괴 방지: 키워드로 시작하는 한국어 접힘 줄 — ${name}`,
      q.wrong.length === 4 &&
        q.wrong[1].text === `최대 삼 도까지 낮아졌다는 측정 결과가 ${head} 이 진술은 참입니다.` &&
        issues.length === 0,
      `오답${q.wrong.length} '${q.wrong[1]?.text}' ${issues.join(" / ")}`,
    );
  }
  {
    // 반대편 — 진짜 머리표는 여전히 잡힌다(가드가 과잉 차단으로 뒤집히지 않았다).
    const q = parseMdContentMatch(GOOD.replace("\n오답:\n", "\n**오답 해설**\n"));
    check(
      "섹션 붕괴 방지: 가드가 진짜 머리표를 막지 않음(`**오답 해설**` 콜론 없음)",
      q.wrong.length === 4 && q.wrong[0].text === WRONG5[0][1],
      `오답${q.wrong.length} '${q.wrong[0]?.text?.slice(0, 20)}'`,
    );
  }

  // ── 10. 파서를 우회하는 어댑터 직접 호출도 표면을 씻는다 ────────────────────
  // 도구·재시도 경로는 파서를 거치지 않고 어댑터를 직접 부른다. 이 유형은
  // PASSTHROUGH 라 후처리가 씻어 주지 않으므로, 여기서 안 벗기면 `**진술문**` 이
  // 그대로 학생 화면에 출하된다.
  {
    const base = parseOf(GOOD);
    const dirty = {
      ...base,
      options: base.options.map((o, i) => ({ ...o, text: i === 2 ? `**${o.text}**` : `"${o.text}"` })),
      wrong: base.wrong.map((w) => ({ ...w, text: `_${w.text}_` })),
      explanation: `\`${base.explanation}\``,
    };
    const adapt = adaptMdContentMatchToAiQuestion(dirty, PASSAGE, "KILLER", {
      matchType: "불일치",
      answerCount: 1,
    });
    const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
    const opts = (ai.options ?? []) as Array<Record<string, unknown>>;
    const woe = (ai.wrongOptionExplanations ?? []) as Array<Record<string, unknown>>;
    check(
      "어댑터 직접 호출: 선지·오답해설·해설의 장식을 저장 전에 제거",
      adapt.ok === true &&
        opts[2]?.text === OPTIONS5[2] &&
        opts[0]?.text === OPTIONS5[0] &&
        String(woe[0]?.explanation).startsWith(WRONG5[0][1]) &&
        ai.explanation === base.explanation &&
        !/[*_`]/.test(opts.map((o) => String(o.text)).join(" ")),
      `${adapt.error ?? ""} '${opts[2]?.text}' / '${String(woe[0]?.explanation).slice(0, 24)}'`,
    );
    check(
      "어댑터 직접 호출: 근거는 지문 축자 그대로 부착(따옴표 벗기지 않음)",
      String(woe[0]?.explanation).includes(`(근거: "${EVIDENCE5[0]}")`),
      String(woe[0]?.explanation),
    );
  }

  // ── 8. 지문 문장이 통째로 따옴표에 싸인 경우(따옴표 관용의 회귀 위험) ────────
  {
    const quotedSentence = `"${S[2]}"`;
    const sentences = [S[0], S[1], quotedSentence, S[3], S[5], S[6]];
    const passage = sentences.join(" ");
    const text = deps.buildMd({
      options: [...OPTIONS5],
      evidence: [S[0], quotedSentence, S[3], S[5], S[6]],
      answer: "③",
      wrong: WRONG5.map(([label, body]) => [label, body] as [string, string]),
    });
    const q = autoSnapContentMatchEvidence(parseMdContentMatch(text), passage).question;
    const issues = gateMdContentMatch(q, passage, BASE_GATE);
    check(
      "무회귀: 지문 문장이 따옴표에 싸여 있어도 근거가 축자로 복원됨",
      q.evidence[1].sentence === quotedSentence && issues.length === 0,
      `'${q.evidence[1]?.sentence}' ${issues.join(" / ")}`,
    );
  }
}
