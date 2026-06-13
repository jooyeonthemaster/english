/* eslint-disable no-console */
// ============================================================================
// 지문 복원 그라운드트루스 코퍼스 (개발용 — 배포와 무관)
//
// gemini-3.1-flash-lite 가 passage-restoration 단계에서 3.5-flash 를 대체할 수
// 있는지 측정하기 위한 12종 문제형 지문. 핵심 설계:
//
//   원문(original)을 먼저 확정하고, 문제형(rawText)은 코드로 변형해 만든다.
//   mut() 는 치환 대상이 없거나 중복이면 throw — 원문↔문제형 정합을 기계 보장.
//
// 케이스 분류:
//   - 기계적 작업: 마커 제거, 발문/배점 제거, 각주 보존 (lite 가 쉽게 통과해야 함)
//   - 증거 적용: 정답키([ANSWER_MARK])를 본문에 반영 (빈칸/어법/어휘/삽입/순서)
//   - 추론 필요: 정답키 없는 빈칸 — 모델이 직접 풀어야 함 (lite 최약 지점)
// ============================================================================

import type { RestorationQuestionInput } from "../src/lib/extraction/_shared/types";

/** 기대하는 changes 항목 — 검수 UI에 노출되는 복원 근거의 품질 게이트. */
export interface ExpectedChange {
  /** 기대 evidenceType (생략 시 무엇이든 허용). */
  evidenceType?: string;
  /** change.after 에 포함돼야 하는 문구 (정규화 비교). */
  afterIncludes?: string;
  /** change.before 에 포함돼야 하는 문구. */
  beforeIncludes?: string;
}

export interface RestorationCase {
  id: string;
  category:
    | "blank"
    | "blank-unsolved"
    | "grammar"
    | "vocab"
    | "ordering"
    | "insertion"
    | "irrelevant"
    | "wordbox"
    | "noise"
    | "footnote"
    | "summary"
    | "mixed"
    | "honesty";
  /** 복원 목표 (그라운드트루스). */
  original: string;
  /** 문제형 원시 텍스트 (Document AI 추출 결과 모사). */
  rawText: string;
  questions: RestorationQuestionInput[];
  /** 복원문에 반드시 포함 (정규화 비교, 한글 포함 시 원문 비교). */
  mustContain: string[];
  /** 복원문에 반드시 미포함. */
  mustNotContain: string[];
  /** 이 순서대로 등장해야 하는 앵커 (순서/삽입 검증). */
  orderedAnchors?: string[];
  /** 단어 LCS 유사도 하한 (기본 0.93). */
  minWordSim?: number;
  /** 검수 UI 근거 게이트 — 이 항목들이 changes 배열에서 발견돼야 PASS. */
  expectedChanges?: ExpectedChange[];
  /**
   * 복원 불가 케이스 — 빈칸이 보존되고 finalStatus 가 RESTORED 가 아니어야
   * PASS (모델의 과장 보고 검출).
   */
  expectUnresolved?: boolean;
}

/** 치환 대상이 정확히 1회 존재해야 하는 안전 치환. */
function mut(text: string, target: string, replacement: string): string {
  const first = text.indexOf(target);
  if (first < 0) throw new Error(`mut: target not found: "${target}"`);
  if (text.indexOf(target, first + 1) >= 0)
    throw new Error(`mut: target ambiguous (2+ hits): "${target}"`);
  return text.slice(0, first) + replacement + text.slice(first + target.length);
}

const q = (
  questionNumber: number | null,
  stem: string,
  choices: Array<[string, string, boolean]>,
  explanation: string | null = null,
): RestorationQuestionInput => ({
  questionNumber,
  stem,
  choices: choices.map(([label, content, isAnswer]) => ({
    label,
    content,
    isAnswer,
  })),
  explanation,
});

// ─── 1. 빈칸 추론 (정답키 있음 — 증거 적용) ────────────────────────────────

const P1_ORIGINAL = `Our capacity for self-control develops long before we understand its value. In a famous series of experiments, young children were offered one marshmallow immediately or two if they could wait alone for several minutes. The children who managed to wait did not simply possess stronger willpower; they used clever strategies, such as covering their eyes or singing to themselves, to direct attention away from the temptation. Follow-up studies suggested that the ability to delay immediate rewards was linked to better academic performance and healthier relationships decades later. What looked like a simple test of patience turned out to be an early window into a skill that shapes the entire course of a life.`;

const CASE_BLANK: RestorationCase = {
  id: "blank-answered",
  category: "blank",
  original: P1_ORIGINAL,
  rawText: [
    "21. 다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오. [3점]",
    "",
    mut(P1_ORIGINAL, "delay immediate rewards", "________________"),
    "",
    "① resist any form of social pressure",
    "② delay immediate rewards",
    "③ memorize complex instructions",
    "④ imitate the behavior of adults",
    "⑤ predict future consequences",
  ].join("\n"),
  questions: [
    q(21, "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.", [
      ["①", "resist any form of social pressure", false],
      ["②", "delay immediate rewards", true],
      ["③", "memorize complex instructions", false],
      ["④", "imitate the behavior of adults", false],
      ["⑤", "predict future consequences", false],
    ]),
  ],
  mustContain: ["the ability to delay immediate rewards was linked"],
  mustNotContain: ["________", "들어갈 말로", "3점", "resist any form"],
};

// ─── 2. 빈칸 추론 (정답키 없음 — 모델이 직접 풀어야 함) ────────────────────

const P2_ORIGINAL = `A map is useful precisely because it leaves things out. If a map recorded every tree, every stone, and every footprint, it would be as complicated as the territory itself and therefore useless for navigation. The mapmaker's skill lies in choosing which details matter for the traveler's purpose and discarding the rest. The same principle applies to scientific models. A good model does not attempt to reproduce reality in full; instead, it deliberately simplifies the world in order to make a specific problem easier to solve. Critics who complain that a model is unrealistic often miss this point, for the power of a model comes from its selective ignorance.`;

const CASE_BLANK_UNSOLVED: RestorationCase = {
  id: "blank-unsolved",
  category: "blank-unsolved",
  original: P2_ORIGINAL,
  rawText: [
    "31. 다음 빈칸에 들어갈 말로 가장 적절한 것은?",
    "",
    mut(P2_ORIGINAL, "deliberately simplifies the world", "________________"),
    "",
    "① faithfully copies every visible detail",
    "② deliberately simplifies the world",
    "③ rejects all forms of indirect evidence",
    "④ exaggerates minor regional differences",
    "⑤ ignores the traveler's stated purpose",
  ].join("\n"),
  questions: [
    q(31, "다음 빈칸에 들어갈 말로 가장 적절한 것은?", [
      ["①", "faithfully copies every visible detail", false],
      ["②", "deliberately simplifies the world", false],
      ["③", "rejects all forms of indirect evidence", false],
      ["④", "exaggerates minor regional differences", false],
      ["⑤", "ignores the traveler's stated purpose", false],
    ]),
  ],
  mustContain: ["it deliberately simplifies the world in order to make"],
  mustNotContain: ["________", "가장 적절한", "faithfully copies"],
};

// ─── 3. 어법 (밑줄 ①~⑤, 정답키 있음) ──────────────────────────────────────

const P3_ORIGINAL = `The number of people who work remotely has grown rapidly over the past decade. Companies that once required employees to sit at desks from nine to five now allow them to organize their own schedules. This shift has brought unexpected benefits: workers report higher satisfaction, and firms spend less on office space. Yet remote work also demands a new kind of discipline. Without the structure of a shared workplace, employees must learn to separate their professional duties from their private lives, a boundary that is easily blurred when the office is the kitchen table.`;

const CASE_GRAMMAR: RestorationCase = {
  id: "grammar-answered",
  category: "grammar",
  original: P3_ORIGINAL,
  rawText: [
    "29. 다음 글의 밑줄 친 부분 중, 어법상 틀린 것은? [3점]",
    "",
    [
      (t: string) => mut(t, "has grown", "① have grown"),
      (t: string) => mut(t, "that once required", "② that once required"),
      (t: string) => mut(t, "allow them to organize", "allow ③ them to organize"),
      (t: string) => mut(t, "spend less on", "spend ④ less on"),
      (t: string) => mut(t, "is easily blurred", "is easily ⑤ blurred"),
    ].reduce((acc, fn) => fn(acc), P3_ORIGINAL),
  ].join("\n"),
  questions: [
    q(
      29,
      "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
      [
        ["①", "have grown", true],
        ["②", "that once required", false],
        ["③", "them", false],
        ["④", "less", false],
        ["⑤", "blurred", false],
      ],
      "주어가 The number of people(단수)이므로 ① have grown은 has grown으로 고쳐야 한다.",
    ),
  ],
  mustContain: ["The number of people who work remotely has grown rapidly"],
  mustNotContain: ["have grown", "어법상", "3점"],
};

// ─── 4. 어휘 (a)~(e) (정답키 있음) ─────────────────────────────────────────

const P4_ORIGINAL = `Wild animals living near cities have learned to exploit human routines. Crows in Japan, for example, drop walnuts onto crosswalks and wait for cars to crack them open, collecting the kernels when the traffic lights halt the vehicles. Raccoons remember the weekly schedule of garbage collection and appear only on the relevant evenings. Such behavior shows that urban wildlife does not merely tolerate human activity; it actively monitors the patterns we create and turns them into opportunities. For these species, the city is not a wasteland but a predictable source of food.`;

const CASE_VOCAB: RestorationCase = {
  id: "vocab-answered",
  category: "vocab",
  original: P4_ORIGINAL,
  rawText: [
    "42. 밑줄 친 (a)~(e) 중 문맥상 낱말의 쓰임이 적절하지 않은 것은?",
    "",
    [
      (t: string) => mut(t, "learned to exploit", "learned to (a) exploit"),
      (t: string) => mut(t, "lights halt the", "lights (b) halt the"),
      (t: string) => mut(t, "on the relevant evenings", "on the (c) relevant evenings"),
      (t: string) => mut(t, "actively monitors the patterns", "actively (d) ignores the patterns"),
      (t: string) => mut(t, "but a predictable source", "but a (e) predictable source"),
    ].reduce((acc, fn) => fn(acc), P4_ORIGINAL),
    "",
    "① (a)   ② (b)   ③ (c)   ④ (d)   ⑤ (e)",
  ].join("\n"),
  questions: [
    q(
      42,
      "밑줄 친 (a)~(e) 중 문맥상 낱말의 쓰임이 적절하지 않은 것은?",
      [
        ["①", "(a) exploit", false],
        ["②", "(b) halt", false],
        ["③", "(c) relevant", false],
        ["④", "(d) ignores", true],
        ["⑤", "(e) predictable", false],
      ],
      "④ 도시 야생동물은 인간의 패턴을 무시하는 것이 아니라 관찰하여 활용하므로 ignores를 monitors로 고쳐야 한다.",
    ),
  ],
  mustContain: ["it actively monitors the patterns we create"],
  mustNotContain: ["ignores", "(a)", "(d)", "쓰임이"],
};

// ─── 5. 글의 순서 (A)(B)(C) ────────────────────────────────────────────────

const P5_INTRO = `In 1815, Mount Tambora in Indonesia erupted with a force never recorded before in modern history.`;
const P5_A = `Those clouds eventually circled the globe, blocking sunlight and lowering temperatures across Europe and North America for more than a year.`;
const P5_B = `The explosion itself killed tens of thousands of people on the island and threw enormous clouds of ash high into the atmosphere.`;
const P5_C = `The resulting 'year without a summer' destroyed harvests on two continents, and the famine that followed pushed thousands of families to migrate.`;

const CASE_ORDERING: RestorationCase = {
  id: "ordering-answered",
  category: "ordering",
  original: [P5_INTRO, P5_B, P5_A, P5_C].join(" "),
  rawText: [
    "36. 주어진 글 다음에 이어질 글의 순서로 가장 적절한 것을 고르시오.",
    "",
    P5_INTRO,
    "",
    `(A) ${P5_A}`,
    "",
    `(B) ${P5_B}`,
    "",
    `(C) ${P5_C}`,
    "",
    "① (A)-(C)-(B)  ② (B)-(A)-(C)  ③ (B)-(C)-(A)  ④ (C)-(A)-(B)  ⑤ (C)-(B)-(A)",
  ].join("\n"),
  questions: [
    q(36, "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것을 고르시오.", [
      ["①", "(A)-(C)-(B)", false],
      ["②", "(B)-(A)-(C)", true],
      ["③", "(B)-(C)-(A)", false],
      ["④", "(C)-(A)-(B)", false],
      ["⑤", "(C)-(B)-(A)", false],
    ]),
  ],
  mustContain: [],
  mustNotContain: ["(A)", "(B)", "(C)", "이어질"],
  orderedAnchors: [
    "erupted with a force never recorded",
    "The explosion itself killed tens of thousands",
    "Those clouds eventually circled the globe",
    "The resulting 'year without a summer' destroyed",
  ],
};

// ─── 6. 문장 삽입 ( ① )~( ⑤ ) ─────────────────────────────────────────────

const P6_INSERT = `This habit, however, came at a hidden cost.`;
const P6_S1 = `Early factories measured productivity by the hour, so workers were paid simply for being present.`;
const P6_S2 = `Managers soon noticed that presence did not guarantee effort, and they began to monitor output instead.`;
const P6_S3 = `Workers responded by focusing only on what was counted, neglecting tasks that resisted measurement.`;
const P6_S4 = `Machines were maintained carelessly, apprentices were left untrained, and quality slipped in ways no spreadsheet captured.`;
const P6_S5 = `In time, factory owners learned that what gets measured gets managed, but what gets measured badly gets managed badly.`;

const CASE_INSERTION: RestorationCase = {
  id: "insertion-answered",
  category: "insertion",
  original: [P6_S1, P6_S2, P6_S3, P6_INSERT, P6_S4, P6_S5].join(" "),
  rawText: [
    "38. 글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오. [3점]",
    "",
    `<보기> ${P6_INSERT}`,
    "",
    `${P6_S1} ( ① ) ${P6_S2} ( ② ) ${P6_S3} ( ③ ) ${P6_S4} ( ④ ) ${P6_S5} ( ⑤ )`,
  ].join("\n"),
  questions: [
    q(38, "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오.", [
      ["①", "①", false],
      ["②", "②", false],
      ["③", "③", true],
      ["④", "④", false],
      ["⑤", "⑤", false],
    ]),
  ],
  mustContain: [],
  mustNotContain: ["보기", "흐름으로", "3점"],
  orderedAnchors: [
    "neglecting tasks that resisted measurement",
    "This habit, however, came at a hidden cost",
    "Machines were maintained carelessly",
  ],
};

// ─── 7. 무관한 문장 ─────────────────────────────────────────────────────────

const P7_S1 = `Honeybees communicate the location of food through an elaborate dance performed inside the hive.`;
const P7_S2 = `The angle of the dance relative to gravity encodes the direction of the flowers with respect to the sun.`;
const P7_S3 = `The duration of each waggle run tells other bees how far they must fly.`;
const P7_IRRELEVANT = `Honey has been prized by humans for thousands of years as both food and medicine.`;
const P7_S4 = `Remarkably, the dancing bee adjusts her angle over time to compensate for the sun's movement across the sky.`;
const P7_S5 = `Through this system, a single scout can direct dozens of foragers to a patch of flowers kilometers away.`;

const CASE_IRRELEVANT: RestorationCase = {
  id: "irrelevant-answered",
  category: "irrelevant",
  original: [P7_S1, P7_S2, P7_S3, P7_S4, P7_S5].join(" "),
  rawText: [
    "35. 다음 글에서 전체 흐름과 관계 없는 문장은?",
    "",
    `${P7_S1} ① ${P7_S2} ② ${P7_S3} ③ ${P7_IRRELEVANT} ④ ${P7_S4} ⑤ ${P7_S5}`,
  ].join("\n"),
  questions: [
    q(35, "다음 글에서 전체 흐름과 관계 없는 문장은?", [
      ["①", P7_S2, false],
      ["②", P7_S3, false],
      ["③", P7_IRRELEVANT, true],
      ["④", P7_S4, false],
      ["⑤", P7_S5, false],
    ]),
  ],
  mustContain: ["how far they must fly. Remarkably, the dancing bee"],
  mustNotContain: ["prized by humans", "관계 없는"],
};

// ─── 8. Word Box 다중 빈칸 (서답형) ────────────────────────────────────────

const P8_ORIGINAL = `Desert plants offer a master class in survival. Because water is scarce for most of the year, species such as the saguaro cactus store moisture in their thick stems. Their roots spread wide rather than deep, allowing them to adapt to sudden, brief rainstorms within hours. This combination of storage and speed gives desert ecosystems a surprising resilience, enabling them to recover quickly from droughts that would devastate a greener landscape.`;

const CASE_WORDBOX: RestorationCase = {
  id: "wordbox-answered",
  category: "wordbox",
  original: P8_ORIGINAL,
  rawText: [
    "[서답형1] 윗글의 빈칸에 들어갈 말을 <보기>에서 골라 알맞은 형태로 쓰시오.",
    "",
    "< 보기 >  adapt / scarce / abundant / resilience / fragile / imitate",
    "",
    [
      (t: string) => mut(t, "water is scarce for", "water is ________ for"),
      (t: string) => mut(t, "them to adapt to", "them to ________ to"),
      (t: string) => mut(t, "a surprising resilience,", "a surprising ________,"),
    ].reduce((acc, fn) => fn(acc), P8_ORIGINAL),
  ].join("\n"),
  questions: [
    q(
      null,
      "[서답형1] 윗글의 빈칸에 들어갈 말을 <보기>에서 골라 알맞은 형태로 쓰시오.",
      [],
      "(1) scarce (2) adapt (3) resilience",
    ),
  ],
  mustContain: [],
  mustNotContain: ["________", "보기", "서답형", "abundant"],
  orderedAnchors: [
    "water is scarce for most of the year",
    "allowing them to adapt to sudden",
    "a surprising resilience, enabling them",
  ],
};

// ─── 9. OCR 노이즈 (문항 없음 — 발문·배점·쪽번호만 제거) ───────────────────

const P9_ORIGINAL = `Sound travels faster in water than in air, a fact that whales exploit to communicate across entire ocean basins. The low-frequency calls of blue whales can journey hundreds of kilometers before fading, carried by deep channels in the sea where sound waves bend and stay trapped. Before engine noise filled the oceans, a whale in the North Atlantic could in principle be heard by another near the equator. Today, shipping lanes have shrunk this acoustic world dramatically, and researchers worry that the whales' ancient network of long-distance communication is breaking apart.`;

const CASE_NOISE: RestorationCase = {
  id: "ocr-noise",
  category: "noise",
  original: P9_ORIGINAL,
  rawText: [
    "다음 글을 읽고 물음에 답하시오. [4점]",
    "",
    P9_ORIGINAL.replace(/ (?=carried by deep)/, "\n")
      .replace(/ (?=a whale in the North)/, "\n")
      .replace(/ (?=and researchers worry)/, "\n"),
    "",
    "- 7 -",
  ].join("\n"),
  questions: [],
  mustContain: ["Sound travels faster in water than in air"],
  mustNotContain: ["물음에", "4점", "- 7 -"],
  minWordSim: 0.97,
};

// ─── 10. 각주 보존 + 빈칸 (정답키 있음) ────────────────────────────────────

const P10_PASSAGE = `When a harvest failed in a medieval village, suspicion rarely fell on the weather alone. Communities under stress often searched for a scapegoat, an individual who could be blamed so that everyone else felt cleansed of responsibility. Historians note that the accused were usually outsiders — widows, wanderers, or newcomers — people whose isolation made them safe to attack. The pattern reveals an uncomfortable truth: collective anxiety seeks a target, and the choice of target follows the lines of social weakness rather than the lines of evidence.`;
const P10_FOOTNOTES = `*scapegoat 희생양  **collective 집단의`;
const P10_ORIGINAL = `${P10_PASSAGE}\n${P10_FOOTNOTES}`;

const CASE_FOOTNOTE: RestorationCase = {
  id: "footnote-blank",
  category: "footnote",
  original: P10_ORIGINAL,
  rawText: [
    "33. 다음 빈칸에 들어갈 말로 가장 적절한 것은? [3점]",
    "",
    mut(P10_PASSAGE, "seeks a target, and", "________________, and"),
    P10_FOOTNOTES,
    "",
    "① avoids open confrontation",
    "② seeks a target",
    "③ strengthens social bonds",
    "④ questions old beliefs",
    "⑤ rewards honest evidence",
  ].join("\n"),
  questions: [
    q(33, "다음 빈칸에 들어갈 말로 가장 적절한 것은?", [
      ["①", "avoids open confrontation", false],
      ["②", "seeks a target", true],
      ["③", "strengthens social bonds", false],
      ["④", "questions old beliefs", false],
      ["⑤", "rewards honest evidence", false],
    ]),
  ],
  mustContain: [
    "collective anxiety seeks a target",
    "*scapegoat 희생양",
    "**collective 집단의",
  ],
  mustNotContain: ["________", "들어갈"],
};

// ─── 11. 요약문 완성 (요약 박스는 문제 재료 — 본문만 남긴다) ───────────────

const P11_ORIGINAL = `Generalists and specialists succeed in different environments. In stable, predictable settings, specialists thrive because deep expertise in a narrow domain pays off repeatedly. When conditions change rapidly, however, the breadth of a generalist becomes more valuable than the depth of a specialist, since skills from one field can be recombined to meet unfamiliar problems. Career advice that praises only focus therefore tells half the story; the wiser strategy is to match the shape of one's knowledge to the volatility of one's world.`;

const CASE_SUMMARY: RestorationCase = {
  id: "summary-box",
  category: "summary",
  original: P11_ORIGINAL,
  rawText: [
    "40. 다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
    "",
    P11_ORIGINAL,
    "",
    "→ In (A) ________ environments, specialists prevail, while (B) ________ conditions favor generalists.",
    "",
    "① stable ······ changing",
    "② stable ······ familiar",
    "③ harsh ······ changing",
    "④ harsh ······ stable",
    "⑤ novel ······ familiar",
  ].join("\n"),
  questions: [
    q(
      40,
      "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
      [
        ["①", "stable ······ changing", true],
        ["②", "stable ······ familiar", false],
        ["③", "harsh ······ changing", false],
        ["④", "harsh ······ stable", false],
        ["⑤", "novel ······ familiar", false],
      ],
    ),
  ],
  mustContain: ["match the shape of one's knowledge"],
  mustNotContain: ["________", "specialists prevail", "요약"],
  minWordSim: 0.96,
};

// ─── 12. 복합 [1~2]: 빈칸 + 어법 한 지문 ───────────────────────────────────

const P12_ORIGINAL = `Reading aloud to children does more than entertain them. When a parent pauses to ask what might happen next, the child practices predicting events before they occur, a skill that later supports scientific thinking. Listening to stories also stretches attention: a five-year-old who follows a twenty-minute tale is training the same patience that classrooms will soon demand. Researchers who tracked families for years found that children who were read to daily entered school with vocabularies nearly twice the size of their peers', and the gap, far from closing, widened as schoolwork grew harder.`;

const CASE_MIXED: RestorationCase = {
  id: "mixed-blank-grammar",
  category: "mixed",
  original: P12_ORIGINAL,
  rawText: [
    "[1~2] 다음 글을 읽고, 물음에 답하시오.",
    "",
    [
      (t: string) => mut(t, "practices predicting events", "practices ________ events"),
      (t: string) => mut(t, "does more than", "① does more than"),
      (t: string) => mut(t, "what might happen", "② what might happen"),
      (t: string) => mut(t, "Listening to stories", "③ Listening to stories"),
      (t: string) => mut(t, "that classrooms will soon demand", "④ that classrooms will soon demand"),
      (t: string) => mut(t, "widened as schoolwork", "⑤ widening as schoolwork"),
    ].reduce((acc, fn) => fn(acc), P12_ORIGINAL),
    "",
    "1. 윗글의 빈칸에 들어갈 말로 가장 적절한 것은?",
    "① forgetting  ② describing  ③ predicting  ④ avoiding  ⑤ recording",
    "",
    "2. 윗글의 밑줄 친 부분 중, 어법상 틀린 것은?",
  ].join("\n"),
  questions: [
    q(1, "윗글의 빈칸에 들어갈 말로 가장 적절한 것은?", [
      ["①", "forgetting", false],
      ["②", "describing", false],
      ["③", "predicting", true],
      ["④", "avoiding", false],
      ["⑤", "recording", false],
    ]),
    q(
      2,
      "윗글의 밑줄 친 부분 중, 어법상 틀린 것은?",
      [
        ["①", "does", false],
        ["②", "what might happen", false],
        ["③", "Listening", false],
        ["④", "that classrooms will soon demand", false],
        ["⑤", "widening", true],
      ],
      "⑤ and the gap ... 뒤에 본동사가 필요하므로 widening을 widened로 고쳐야 한다.",
    ),
  ],
  mustContain: [
    "practices predicting events before they occur",
    "widened as schoolwork grew harder",
  ],
  mustNotContain: ["________", "widening", "물음에", "forgetting"],
};

// ════════════════════════════════════════════════════════════════════════
// 적대적 케이스 (라운드 2) — 라운드 1을 전원 통과한 모델을 무너뜨리기 위한 것
// ════════════════════════════════════════════════════════════════════════

// ─── 13. 어법 — 교정형 없음 (모델이 what→that을 스스로 알아야 함) ──────────

const P13_ORIGINAL = `Trust is built less by grand gestures than by small, repeated acts of reliability. Psychologists who study friendship point to the belief that honesty builds trust over time, even when the truth is momentarily uncomfortable. A colleague who admits a minor mistake signals that larger claims can be believed. Over months, these tiny deposits accumulate into a reserve of credibility that no single charming performance could ever buy. When that reserve exists, disagreements become survivable; without it, even compliments are inspected for hidden motives.`;

const CASE_GRAMMAR_NOEXP: RestorationCase = {
  id: "grammar-no-explanation",
  category: "grammar",
  original: P13_ORIGINAL,
  rawText: [
    "28. 다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
    "",
    [
      (t: string) => mut(t, "is built less by", "is ① built less by"),
      (t: string) => mut(t, "who study friendship", "② who study friendship"),
      (t: string) => mut(t, "the belief that honesty", "the belief ③ what honesty"),
      (t: string) => mut(t, "can be believed", "can be ④ believed"),
      (t: string) => mut(t, "become survivable", "become ⑤ survivable"),
    ].reduce((acc, fn) => fn(acc), P13_ORIGINAL),
  ].join("\n"),
  questions: [
    q(28, "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?", [
      ["①", "built", false],
      ["②", "who", false],
      ["③", "what", true],
      ["④", "believed", false],
      ["⑤", "survivable", false],
    ]),
  ],
  mustContain: ["the belief that honesty builds trust"],
  mustNotContain: ["belief what", "어법상"],
};

// ─── 14. 한글 해석 병기 학습지 (영어만 남겨야 함) ──────────────────────────

const P14_S = [
  "The brain treats unfamiliar accents as a mild threat.",
  "Listeners must spend extra effort decoding sounds that deviate from what they expect.",
  "This effort, however, fades quickly with exposure.",
  "After only a few minutes of conversation, comprehension improves and the sense of distance shrinks.",
  "What feels like prejudice is often just processing cost, and processing cost is negotiable.",
];
const P14_KR = [
  "뇌는 낯선 억양을 가벼운 위협으로 처리한다.",
  "청자는 기대에서 벗어나는 소리를 해독하는 데 추가적인 노력을 들여야 한다.",
  "그러나 이 노력은 노출과 함께 빠르게 사라진다.",
  "단 몇 분의 대화 후에 이해도는 향상되고 거리감은 줄어든다.",
  "편견처럼 느껴지는 것은 종종 처리 비용일 뿐이며, 처리 비용은 협상 가능하다.",
];

const CASE_TRANSLATION: RestorationCase = {
  id: "korean-interleaved",
  category: "noise",
  original: P14_S.join(" "),
  rawText: [
    "[직독직해 연습] 다음 글을 읽고 해석을 확인하시오.",
    "",
    ...P14_S.flatMap((s, i) => [s, P14_KR[i], ""]),
  ].join("\n"),
  questions: [],
  mustContain: ["What feels like prejudice is often just processing cost"],
  mustNotContain: ["낯선 억양을", "처리 비용은", "직독직해"],
  minWordSim: 0.97,
};

// ─── 15. 장문 + 어법 복수 정답 (2곳 동시 교정) ─────────────────────────────

const P15_ORIGINAL = `In the early twentieth century, the city of Chicago faced a problem that no committee was prepared to solve. The Chicago River, into which factories and stockyards poured their waste, flowed directly into Lake Michigan, the source of the city's drinking water. Epidemics followed one another with grim regularity, and engineers calculated that filtering alone would never keep pace with the growing population. The solution they proposed was audacious: reverse the river. By digging a canal deeper than the riverbed, they forced the water to flow backward, away from the lake and toward the Mississippi basin. Critics called the plan impossible, and downstream cities were understandably alarmed by the prospect of receiving Chicago's waste. Yet when the canal opened in 1900, the reversal worked exactly as designed. The lake grew cleaner within a decade, and waterborne disease rates fell sharply. The project remains a reminder that infrastructure, at its boldest, does not merely accommodate a city's needs; it rearranges geography itself to meet them.`;

const CASE_LONG_DOUBLE: RestorationCase = {
  id: "long-double-grammar",
  category: "grammar",
  original: P15_ORIGINAL,
  rawText: [
    "[고난도] 윗글의 밑줄 친 부분 중, 어법상 틀린 것을 모두 고르면? (2개) [4점]",
    "",
    [
      (t: string) => mut(t, "into which factories", "① into which factories"),
      (t: string) => mut(t, "was audacious", "② were audacious"),
      (t: string) => mut(t, "they forced the water", "they ③ forced the water"),
      (t: string) => mut(t, "were understandably alarmed", "were understandably ④ alarming"),
      (t: string) => mut(t, "does not merely accommodate", "⑤ does not merely accommodate"),
    ].reduce((acc, fn) => fn(acc), P15_ORIGINAL),
  ].join("\n"),
  questions: [
    q(
      null,
      "윗글의 밑줄 친 부분 중, 어법상 틀린 것을 모두 고르면? (2개)",
      [
        ["①", "into which", false],
        ["②", "were", true],
        ["③", "forced", false],
        ["④", "alarming", true],
        ["⑤", "does", false],
      ],
      "② 주어가 The solution(단수)이므로 were → was. ④ 도시들이 '놀란' 것이므로 alarming → alarmed.",
    ),
  ],
  mustContain: [
    "The solution they proposed was audacious",
    "were understandably alarmed by the prospect",
  ],
  mustNotContain: ["were audacious", "alarming", "고난도", "4점"],
};

// ─── 16. 배열 영작 워드뱅크 ([ w, x, y, z ] → 어순 조립) ───────────────────

const P16_ORIGINAL = `Adaptation is no longer a seasonal exercise for companies. Markets shift weekly, technologies appear overnight, and customer loyalty evaporates at the first sign of friction. Our success depends on how quickly we respond to change, not on how confidently we predict it. Firms that institutionalize rapid response — short feedback loops, small reversible bets, teams empowered to act without permission — consistently outlast rivals that bet everything on a single long-range forecast.`;

const CASE_WORDORDER: RestorationCase = {
  id: "wordorder-box",
  category: "wordbox",
  original: P16_ORIGINAL,
  rawText: [
    "[서답형2] 윗글의 빈칸에 들어갈 말을 괄호 안의 단어를 모두 이용하여 배열하시오.",
    "",
    mut(
      P16_ORIGINAL,
      "depends on how quickly we respond to change",
      "depends on ________ [ quickly, we, how, respond ] to change",
    ),
  ].join("\n"),
  questions: [
    q(
      null,
      "[서답형2] 윗글의 빈칸에 들어갈 말을 괄호 안의 단어를 모두 이용하여 배열하시오.",
      [],
      "정답: how quickly we respond",
    ),
  ],
  mustContain: ["depends on how quickly we respond to change"],
  mustNotContain: ["________", "[ quickly", "배열하시오"],
};

// ─── 17. 무편집 함정 (이미 깨끗한 지문 — 과잉 수정 검출) ───────────────────

const P17_ORIGINAL = `Dr. Evans co-authored the first long-term study of urban well-being, and her conclusions were deliberately modest. Cities, she argued, do not make people happy or unhappy; they amplify the habits people bring to them. A walker finds a walkable city delightful, while a driver finds the same streets hostile. The data — gathered from 40,000 residents across three continents — showed that satisfaction tracked daily routines far more closely than income, weather, or even crime rates. Policy, she concluded, should therefore target routines: the commute, the errand, the evening stroll.`;

const CASE_CLEAN_NOOP: RestorationCase = {
  id: "clean-noop",
  category: "noise",
  original: P17_ORIGINAL,
  rawText: P17_ORIGINAL,
  questions: [],
  mustContain: ["Dr. Evans co-authored", "40,000 residents"],
  mustNotContain: [],
  minWordSim: 0.99,
};

// ─── 18. 페이지 헤더/문항번호 노이즈 (본문 한가운데 끼어듦) ────────────────

const P18_ORIGINAL = `Glass recycling is often celebrated as the model of a circular economy, yet the reality is more complicated. Glass is heavy, and hauling it long distances can consume more energy than manufacturing new bottles from sand. The environmental case for recycling glass therefore depends on geography: a bottle returned in a city with a nearby processing plant genuinely saves energy, while the same bottle collected in a remote town may cost more carbon than it saves. Honest environmental policy begins by admitting that the answer to 'is this green?' is almost always 'it depends.'`;

const CASE_HEADER_NOISE: RestorationCase = {
  id: "page-header-noise",
  category: "noise",
  original: P18_ORIGINAL,
  rawText: [
    "24. 다음 글의 요지로 가장 적절한 것은? [2점]",
    "",
    mut(
      P18_ORIGINAL,
      "The environmental case for recycling",
      "2026학년도 1학기 중간고사 영어 - 3 -\nThe environmental case for recycling",
    ),
  ].join("\n"),
  questions: [
    q(24, "다음 글의 요지로 가장 적절한 것은?", [
      ["①", "유리 재활용은 항상 친환경적이다.", false],
      ["②", "재활용의 환경적 가치는 지리적 조건에 달려 있다.", true],
      ["③", "유리병 생산은 금지되어야 한다.", false],
      ["④", "운송 기술의 발전이 시급하다.", false],
      ["⑤", "소비자의 인식 개선이 우선이다.", false],
    ]),
  ],
  mustContain: ["The environmental case for recycling glass therefore depends"],
  mustNotContain: ["중간고사", "- 3 -", "요지로"],
  minWordSim: 0.97,
};

// ─── 19. 고난도 추상 빈칸 (정답키 없음 — 진짜 추론) ────────────────────────

const P19_ORIGINAL = `Every technology arrives wrapped in promises of neutrality, yet history keeps a different ledger. The printing press did not invent curiosity, the telephone did not invent gossip, and social media did not invent vanity; each device found an existing appetite and fed it at industrial scale. This is why debates about whether a tool is 'good' or 'bad' so often miss the point. A hammer in a builder's hand and the same hammer in a vandal's hand write two different stories. The honest conclusion is that technology amplifies existing intentions rather than creating new ones, which means the urgent question is never only what a machine can do, but what its users already want.`;

const CASE_BLANK_HARD: RestorationCase = {
  id: "blank-unsolved-hard",
  category: "blank-unsolved",
  original: P19_ORIGINAL,
  rawText: [
    "34. 다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오. [3점]",
    "",
    mut(
      P19_ORIGINAL,
      "technology amplifies existing intentions rather than creating new ones",
      "technology ________________________________",
    ),
    "",
    "① replaces human judgment in every domain",
    "② creates entirely new desires from nothing",
    "③ amplifies existing intentions rather than creating new ones",
    "④ weakens the social bonds it claims to strengthen",
    "⑤ remains morally neutral regardless of its users",
  ].join("\n"),
  questions: [
    q(34, "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.", [
      ["①", "replaces human judgment in every domain", false],
      ["②", "creates entirely new desires from nothing", false],
      ["③", "amplifies existing intentions rather than creating new ones", false],
      ["④", "weakens the social bonds it claims to strengthen", false],
      ["⑤", "remains morally neutral regardless of its users", false],
    ]),
  ],
  mustContain: [
    "technology amplifies existing intentions rather than creating new ones",
  ],
  mustNotContain: ["________", "replaces human judgment", "빈칸에"],
};

// ─── 20. 문장 삽입 — 정답키 없음 (역접 단서로 위치를 직접 찾아야 함) ───────

const P20_INSERT = `Yet this very abundance has begun to work against the channels themselves.`;
const P20_S1 = `Streaming services once competed by offering deeper libraries than their rivals.`;
const P20_S2 = `Catalogues swelled into the tens of thousands of titles, and executives boasted that no viewer could ever run out of choices.`;
const P20_S3 = `Faced with endless options, subscribers report spending more time browsing than watching, and many end the evening having watched nothing at all.`;
const P20_S4 = `Psychologists recognize the pattern as choice overload: beyond a modest number of options, each addition subtracts satisfaction.`;
const P20_S5 = `The lesson for platforms is uncomfortable but clear — curation, not volume, is the scarce resource.`;

const CASE_INSERTION_UNSOLVED: RestorationCase = {
  id: "insertion-unsolved",
  category: "insertion",
  original: [P20_S1, P20_S2, P20_INSERT, P20_S3, P20_S4, P20_S5].join(" "),
  rawText: [
    "39. 글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오.",
    "",
    `<보기> ${P20_INSERT}`,
    "",
    `${P20_S1} ( ① ) ${P20_S2} ( ② ) ${P20_S3} ( ③ ) ${P20_S4} ( ④ ) ${P20_S5} ( ⑤ )`,
  ].join("\n"),
  questions: [
    q(39, "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오.", [
      ["①", "①", false],
      ["②", "②", false],
      ["③", "③", false],
      ["④", "④", false],
      ["⑤", "⑤", false],
    ]),
  ],
  mustContain: [],
  mustNotContain: ["보기", "흐름으로"],
  orderedAnchors: [
    "no viewer could ever run out of choices",
    "Yet this very abundance has begun to work against",
    "Faced with endless options, subscribers report",
  ],
};

// ─── 21. 복원 불가 (정답 증거 전무 — 과장 보고 검출) ───────────────────────

const P21_BLANKED = `Negotiation experts agree that the most underused tool at any bargaining table is silence. After making an offer, inexperienced negotiators rush to fill the pause with justifications, discounts, or apologies, each of which quietly ________ their own position. Veterans do the opposite: they state a number and wait. The silence feels endless to the other side, who often responds by negotiating against themselves. What sounds like a trick is really just discipline — the discipline to let an offer stand on its own weight.`;

const CASE_UNRESTORABLE: RestorationCase = {
  id: "unrestorable-blank",
  category: "honesty",
  // 정답 증거가 없으므로 "복원 목표"는 빈칸이 보존된 본문 그 자체다.
  original: P21_BLANKED,
  rawText: [
    "[서답형4] 윗글의 빈칸에 들어갈 단어를 본문에서 찾아 알맞은 형태로 쓰시오.",
    "",
    P21_BLANKED,
  ].join("\n"),
  questions: [
    q(
      null,
      "[서답형4] 윗글의 빈칸에 들어갈 단어를 본문에서 찾아 알맞은 형태로 쓰시오.",
      [],
      null,
    ),
  ],
  mustContain: ["________"],
  mustNotContain: ["서답형"],
  minWordSim: 0.97,
  expectUnresolved: true,
};

// ─── 22. 유명 원문 미끼 (학습된 정전으로의 무단 교정 검출) ─────────────────

const P22_ORIGINAL = `Charles Dickens opened his most famous novel with a sentence that schoolchildren still recite: it was the best of ages, it was the worst of ages, it was the season of light, it was the season of shadow. The line endures not because of its content but because of its architecture — a seesaw of opposites that promises the reader a story large enough to hold both. Modern writers are routinely warned against such symmetry, yet readers keep proving the warning wrong; the patterns we are told are too neat are precisely the ones we remember.`;

const CASE_CANON_BAIT: RestorationCase = {
  id: "canon-bait",
  category: "honesty",
  original: P22_ORIGINAL,
  rawText: P22_ORIGINAL,
  questions: [],
  // RAW 보존 규칙: 모델이 아는 원문("best of times", "season of darkness")으로
  // "교정"하면 실패 — 시험지에 인쇄된 변형 그대로 보존해야 한다.
  mustContain: ["best of ages", "season of shadow"],
  mustNotContain: ["best of times", "season of darkness"],
  minWordSim: 0.99,
};

// ─── 검수 UI 근거(changes) 기대값 — 케이스별 게이트 ────────────────────────

const EXPECTED_CHANGES: Record<string, ExpectedChange[]> = {
  "blank-answered": [
    { evidenceType: "BLANK", afterIncludes: "delay immediate rewards" },
  ],
  "blank-unsolved": [
    { afterIncludes: "deliberately simplifies the world" },
  ],
  "grammar-answered": [
    { evidenceType: "GRAMMAR", beforeIncludes: "have", afterIncludes: "has" },
  ],
  "vocab-answered": [
    { evidenceType: "VOCAB", beforeIncludes: "ignores", afterIncludes: "monitors" },
  ],
  "ordering-answered": [{ evidenceType: "ORDERING" }],
  "insertion-answered": [
    { evidenceType: "INSERTION", afterIncludes: "This habit, however" },
  ],
  "irrelevant-answered": [{ beforeIncludes: "prized by humans" }],
  "wordbox-answered": [
    { evidenceType: "BLANK", afterIncludes: "scarce" },
    { evidenceType: "BLANK", afterIncludes: "adapt" },
    { evidenceType: "BLANK", afterIncludes: "resilience" },
  ],
  "footnote-blank": [
    { evidenceType: "BLANK", afterIncludes: "seeks a target" },
  ],
  "mixed-blank-grammar": [
    { evidenceType: "BLANK", afterIncludes: "predicting" },
    { evidenceType: "GRAMMAR", beforeIncludes: "widening", afterIncludes: "widened" },
  ],
  "grammar-no-explanation": [
    { evidenceType: "GRAMMAR", beforeIncludes: "what", afterIncludes: "that" },
  ],
  "long-double-grammar": [
    { evidenceType: "GRAMMAR", beforeIncludes: "were audacious", afterIncludes: "was" },
    { evidenceType: "GRAMMAR", beforeIncludes: "alarming", afterIncludes: "alarmed" },
  ],
  "wordorder-box": [
    { evidenceType: "WORD_ORDER", afterIncludes: "how quickly we respond" },
  ],
  "blank-unsolved-hard": [
    { afterIncludes: "amplifies existing intentions" },
  ],
  "insertion-unsolved": [
    { evidenceType: "INSERTION", afterIncludes: "Yet this very abundance" },
  ],
};

const BASE_CASES: RestorationCase[] = [
  CASE_BLANK,
  CASE_BLANK_UNSOLVED,
  CASE_GRAMMAR,
  CASE_VOCAB,
  CASE_ORDERING,
  CASE_INSERTION,
  CASE_IRRELEVANT,
  CASE_WORDBOX,
  CASE_NOISE,
  CASE_FOOTNOTE,
  CASE_SUMMARY,
  CASE_MIXED,
  CASE_GRAMMAR_NOEXP,
  CASE_TRANSLATION,
  CASE_LONG_DOUBLE,
  CASE_WORDORDER,
  CASE_CLEAN_NOOP,
  CASE_HEADER_NOISE,
  CASE_BLANK_HARD,
  CASE_INSERTION_UNSOLVED,
  CASE_UNRESTORABLE,
  CASE_CANON_BAIT,
];

export const RESTORATION_CASES: RestorationCase[] = BASE_CASES.map((c) => ({
  ...c,
  expectedChanges: c.expectedChanges ?? EXPECTED_CHANGES[c.id] ?? [],
}));
