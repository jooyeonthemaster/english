// 적대검수 3기(장식 단일화) 회귀 픽스처 — `_test-md-grammar-correction.ts` 가 호출한다.
//
// 왜 이 파일이 필요한가: 1·2기 수리는 유형마다 **자체** 장식 처리기를 손보는 방식이었고,
// 그래서 늘 부분집합만 처리됐다(`**` 만 알고 `_`·백틱 누락 · 머리표만 관용하고 값은 그대로 ·
// 콜론 앞만 관용). 3기에서 파서를 공유 유틸 `src/lib/md-qgen/decoration.ts` 로 단일화했으므로,
// **파서가 인식하는 키워드 줄 전부**에 감독 픽스처(_test-md-decoration.ts)와 같은 장식
// 매트릭스를 곱해 관용 폭이 라벨마다 갈라지지 않았음을 고정한다.
//
// 이 유형의 키워드 줄: 밑줄지문 · 고침(값줄/섹션헤더) · 허용답(값줄/섹션헤더) · 해설 ·
// (경계로만 인식) 정답 · 오답.
import { parseMdGrammarCorrection } from "../src/lib/md-qgen/parser-grammar-correction";
import { autoSnapCorrectionSegments } from "../src/lib/md-qgen/snap-grammar-correction";
import { gateMdGrammarCorrection } from "../src/lib/md-qgen/gate-grammar-correction";
import { adaptMdGrammarCorrectionToAiQuestion } from "../src/lib/md-qgen/adapter-grammar-correction";
import { postProcessQuestion } from "../src/lib/question-postprocess";

export interface DecorationEnv {
  PASSAGE: string;
  /** 정상 md 한 벌(밑줄 2곳 · 허용답(A) · 해설) */
  GOOD: string;
  /** [[A:…]] [[B:…]] 로 마킹된 지문 */
  MARKED: string;
  /** 밑줄 (A) 의 원 문장 */
  S1: string;
  check: (name: string, ok: boolean, detail?: string) => void;
}

/** 감독 픽스처와 같은 장식 매트릭스 — 키워드(+라벨) 머리표 17형태. */
function decorated(keyword: string, label = ""): [string, string][] {
  const k = `${keyword}${label}`;
  return [
    ["평문", `${k}:`],
    ["굵게 콜론 안", `**${k}:**`],
    ["굵게 콜론 밖", `**${k}**:`],
    ["언더스코어 2겹", `__${k}:__`],
    ["언더스코어 1겹", `_${k}:_`],
    ["백틱 콜론 안", `\`${k}:\``],
    ["백틱 콜론 밖", `\`${k}\`:`],
    ["헤딩 ##", `## ${k}:`],
    ["헤딩 ###", `### ${k}:`],
    ["인용 >", `> ${k}:`],
    ["불릿 -", `- ${k}:`],
    ["불릿 *", `* ${k}:`],
    ["전각 콜론", `${k}：`],
    ["꼬리 공백", `${k}: `],
    ["꼬리 공백 2칸", `${k}:  `],
    ["표 파이프", `| ${k}:`],
    ["삼중 강조", `***${k}:***`],
    ["취소선", `~~${k}:~~`],
  ];
}

export function runDecorationFixtures({
  PASSAGE,
  GOOD,
  MARKED,
  S1,
  check,
}: DecorationEnv): void {
  const parse = (t: string) => autoSnapCorrectionSegments(parseMdGrammarCorrection(t)).question;
  const gateOf = (t: string, errorCount = 2) =>
    gateMdGrammarCorrection(parse(t), PASSAGE, { errorCount, requestedDifficulty: "KILLER" });
  /** 2구간 · (A)='reduces→reduce' · (B) 'was' · 해설 살아 있음 · 게이트 클린. */
  const intact = (name: string, text: string) => {
    const q = parse(text);
    const issues = gateOf(text);
    check(
      name,
      q.segments.length === 2 &&
        q.segments[0].errorPart === "reduces" &&
        q.segments[0].correctedPart === "reduce" &&
        q.segments[1].correctedPart === "was" &&
        q.markedPassage.length > 0 &&
        q.explanation.length > 10 &&
        issues.length === 0,
      `구간 ${q.segments.length} · (A)='${q.segments[0]?.errorPart}→${q.segments[0]?.correctedPart}' · 해설 ${q.explanation.length}자 · ${issues.join(" / ")}`,
    );
  };

  const EXPL =
    "해설: (A)의 진짜 주어는 Trees 이므로 복수 동사가 필요합니다. (B)의 주어는 A row 이므로 단수 동사입니다.";

  // ── D1 값줄 머리표 매트릭스 — 고침(A)·허용답(A) ────────────────────────────
  for (const [name, head] of decorated("고침", "(A)")) {
    intact(
      `D1 고침 값줄 머리표: ${name}`,
      GOOD.replace("고침(A):", head),
    );
  }
  for (const [name, head] of decorated("허용답", "(A)")) {
    const md = GOOD.replace("허용답(A):", head);
    const acc = parse(md).segments[0].acceptedAnswers;
    check(
      `D1 허용답 값줄 머리표: ${name} — 채점 집합 정상`,
      acc.join("|") === "reduce|do reduce" && gateOf(md).length === 0,
      `acc=[${acc.join(",")}] · ${gateOf(md).join(" / ")}`,
    );
  }

  // ── D2 섹션 헤더 매트릭스 — 헤더 장식에 항목이 통째로 사라지던 계통 ────────
  const sectionMd = (fixHead: string, acceptedHead = "허용답:") =>
    `밑줄지문:\n${MARKED}\n\n${fixHead}\n- (A) reduces → reduce\n- (B) were → was\n\n${acceptedHead}\n- (A) reduce | do reduce\n${EXPL}`;
  for (const [name, head] of decorated("고침")) {
    intact(`D2 고침 섹션 헤더: ${name}`, sectionMd(head));
  }
  for (const [name, head] of decorated("허용답")) {
    const md = sectionMd("고침:", head);
    const acc = parse(md).segments[0].acceptedAnswers;
    check(
      `D2 허용답 섹션 헤더: ${name} — 채점 집합 정상`,
      acc.join("|") === "reduce|do reduce" && gateOf(md).length === 0,
      `acc=[${acc.join(",")}] · ${gateOf(md).join(" / ")}`,
    );
  }

  // ── D3 밑줄지문·해설 머리표 매트릭스(누락되면 게이트가 "누락" 이라 거짓말한다) ─
  for (const [name, head] of decorated("밑줄지문")) {
    intact(`D3 밑줄지문 머리표: ${name}`, GOOD.replace("밑줄지문:", head));
  }
  for (const [name, head] of decorated("해설")) {
    intact(`D3 해설 머리표: ${name}`, GOOD.replace("해설:", head));
  }

  // ── D4 계약 밖 키워드 줄이 지문에 흡수되지 않는다 ──────────────────────────
  // (거짓 "지문 재구성 불일치" → 모델이 멀쩡한 지문을 고치는 재생성으로 몰린다)
  for (const keyword of ["정답", "오답"]) {
    for (const [name, head] of decorated(keyword)) {
      intact(
        `D4 지문 경계: ${keyword} 줄 ${name}`,
        GOOD.replace("\n\n고침(A):", `\n\n${head} reduce, was\n\n고침(A):`),
      );
    }
  }
  for (const [name, line] of [
    ["콜론 없는 헤딩 ## 고침", "## 고침"],
    ["계약 밖 한글 라벨 줄", "포인트: (d)수일치"],
    ["수평선 ---", "---"],
    ["수평선 ***", "***"],
    ["수평선 ___", "___"],
  ] as [string, string][]) {
    intact(`D4 지문 경계: ${name}`, GOOD.replace("\n\n고침(A):", `\n\n${line}\n\n고침(A):`));
  }

  // ── D4b 표 행(라벨 있는 형태·없는 형태 둘 다) ──────────────────────────────
  intact(
    "D4b 표 행: 라벨 있는 `| 고침(A) | 값 |`",
    GOOD.replace("고침(A): reduces → reduce", "| 고침(A) | reduces → reduce |"),
  );
  {
    // 라벨 없는 구형 줄은 **라벨 줄이 하나도 없을 때만** 첫 밑줄에 귀속된다(기존 계약).
    const md = `밑줄지문:\n${MARKED}\n\n| 고침 | reduces → reduce |\n${EXPL}`;
    check(
      "D4b 표 행: 라벨 없는 `| 고침 | 값 |` 도 값이 유실되지 않는다",
      parseMdGrammarCorrection(md).segments[0].errorPart === "reduces",
      parseMdGrammarCorrection(md).segments[0].errorPart,
    );
  }

  // ── D5 값 쪽 장식 — 머리표만 관용하고 값은 그대로 두던 계통 ────────────────
  for (const [name, line] of [
    ["굵게", "고침(A): **reduces** → **reduce**"],
    ["언더스코어", "고침(A): __reduces__ → __reduce__"],
    ["언더스코어 1겹", "고침(A): _reduces_ → _reduce_"],
    ["백틱", "고침(A): `reduces` → `reduce`"],
    ["따옴표", `고침(A): "reduces" → "reduce"`],
    ["곱슬 따옴표", "고침(A): “reduces” → “reduce”"],
    ["취소선", "고침(A): ~~reduces~~ → ~~reduce~~"],
    ["강조+따옴표 중첩", `고침(A): **"reduces"** → **"reduce"**`],
    ["한쪽만 강조(짝 없음)", "고침(A): **reduces → reduce"],
  ] as [string, string][]) {
    intact(`D5 고침 값 장식: ${name}`, GOOD.replace("고침(A): reduces → reduce", line));
  }
  for (const [name, line] of [
    ["굵게", "허용답(A): **reduce** | **do reduce**"],
    ["백틱", "허용답(A): `reduce` | `do reduce`"],
    ["따옴표", `허용답(A): "reduce" | "do reduce"`],
    ["취소선", "허용답(A): ~~reduce~~ | ~~do reduce~~"],
  ] as [string, string][]) {
    const md = GOOD.replace("허용답(A): reduce | do reduce", line);
    const acc = parse(md).segments[0].acceptedAnswers;
    check(
      `D5 허용답 값 장식: ${name}`,
      acc.join("|") === "reduce|do reduce" && gateOf(md).length === 0,
      `acc=[${acc.join(",")}] · ${gateOf(md).join(" / ")}`,
    );
  }

  // ── D6 마커 **안** 장식 — 학생 표면(PASSTHROUGH)까지 새던 자리 ─────────────
  for (const [name, marked] of [
    ["굵게", GOOD.replace("reduces the surface", "**reduces** the surface")],
    ["백틱", GOOD.replace("reduces the surface", "`reduces` the surface")],
    ["언더스코어", GOOD.replace("reduces the surface", "__reduces__ the surface")],
  ] as [string, string][]) {
    const q = parse(marked);
    const shown = q.segments[0]?.displayedText ?? "";
    intact(`D6 마커 안 장식: ${name}`, marked);
    check(
      `D6 마커 안 장식: ${name} — 학생 표면에 장식이 남지 않는다`,
      !/[*_`~]/.test(shown) && shown.includes("reduces the surface"),
      shown.slice(0, 80),
    );
  }

  // ── D7 종단(저장 경로) — 장식을 전 키워드에 섞어도 저장 값이 깨끗하다 ───────
  {
    const messy = [
      "## **밑줄지문:**",
      MARKED,
      "",
      "__고침(A):__ **reduces** → **reduce**",
      "> 고침(B): `were` → `was`",
      "**허용답(A)**: \"reduce\" | `do reduce`",
      "### 해설: (A)의 진짜 주어는 **Trees** 이므로 복수 동사가 필요합니다. (B)는 A row 가 주어입니다.",
    ].join("\n");
    const q = parse(messy);
    const issues = gateOf(messy);
    check(
      `D7 전 키워드 혼합 장식: 파싱·게이트 클린`,
      q.segments.length === 2 &&
        q.segments[0].acceptedAnswers.join("|") === "reduce|do reduce" &&
        issues.length === 0,
      `${JSON.stringify(q.segments.map((s) => [s.errorPart, s.correctedPart]))} · ${issues.join(" / ")}`,
    );
    const adapt = adaptMdGrammarCorrectionToAiQuestion(q, PASSAGE, "KILLER");
    const pp = postProcessQuestion("GRAMMAR_CORRECTION", PASSAGE, (adapt.aiQuestion ?? {}) as never);
    const data = (pp.data ?? {}) as Record<string, unknown>;
    const segsDump = JSON.stringify(data.underlinedSegments ?? null);
    check(
      "D7 전 키워드 혼합 장식: 후처리 저장 값에 장식이 없다",
      pp.success === true &&
        !/[*`~]/.test(segsDump) &&
        segsDump.includes('["reduce","do reduce"]') &&
        !/[*`]/.test(String(data.explanation ?? "")),
      `${pp.error ?? ""} ${segsDump.slice(0, 160)}`,
    );
  }

  // ── D8 과잉 차단 금지 — 본문 강조·본문 따옴표·한국어 산문은 보존된다 ────────
  {
    const expl =
      "해설: 원문의 were *once* regarded 는 그대로 두고 (A)의 수일치만 봅니다. (B)는 A row 가 주어입니다.";
    const q = parse(GOOD.replace(/해설: [\s\S]*$/, expl));
    check(
      "D8 본문 강조는 표식만 벗기고 텍스트를 보존한다",
      q.explanation.includes("were once regarded"),
      q.explanation.slice(0, 80),
    );
  }
  {
    const expl =
      '해설: "Green" corridors 라는 표현은 인용입니다. (A)는 수일치이고 (B)는 단수 동사입니다.';
    const q = parse(GOOD.replace(/해설: [\s\S]*$/, expl));
    check(
      "D8 본문 따옴표는 보존된다",
      q.explanation.includes('"Green" corridors'),
      q.explanation.slice(0, 80),
    );
  }
  check(
    "D8 해설 선두 라벨 (A) 를 라벨 접두로 오인해 먹지 않는다",
    parse(GOOD).explanation.startsWith("(A)의"),
    parse(GOOD).explanation.slice(0, 40),
  );
  for (const keyword of ["고침", "허용답", "해설", "정답", "오답", "밑줄지문"]) {
    const expl = `해설: (A)는 수일치입니다.\n${keyword}이라는 말이 들어간 한국어 문장도 해설의 일부입니다.`;
    const md = GOOD.replace(/해설: [\s\S]*$/, expl);
    check(
      `D8 해설이 '${keyword}' 로 시작하는 산문 줄에서 잘리지 않는다`,
      parse(md).explanation.includes("한국어 문장도 해설의 일부입니다"),
      parse(md).explanation.slice(0, 90),
    );
  }
  check(
    "D8 값 선두 한 글자(is)를 라벨로 오인해 먹지 않는다",
    parseMdGrammarCorrection(`밑줄지문:\n${MARKED}\n\n고침: is → are\n${EXPL}`).segments[0]
      .errorPart === "is",
    parseMdGrammarCorrection(`밑줄지문:\n${MARKED}\n\n고침: is → are\n${EXPL}`).segments[0].errorPart,
  );
  check(
    "D8 허용답 첫 칸(a)을 라벨로 오인해 먹지 않는다",
    parseMdGrammarCorrection(
      `밑줄지문:\n${MARKED}\n\n고침(A): reduces → reduce\n허용답: a | b\n${EXPL}`,
    ).segments[0].acceptedAnswers.join("|") === "a|b",
    parseMdGrammarCorrection(
      `밑줄지문:\n${MARKED}\n\n고침(A): reduces → reduce\n허용답: a | b\n${EXPL}`,
    ).segments[0].acceptedAnswers.join("|"),
  );
  check(
    "D8 지문 산문(A row of…)은 섹션 항목으로 오인하지 않는다",
    parse(
      `밑줄지문:\n${MARKED}\n\n고침:\n- (A) reduces → reduce\n${S1}\n- (B) were → was\n${EXPL}`,
    ).segments[1].correctedPart === "was",
  );

  // ── D9 무회귀 — 넓힌 관용이 진짜 결함까지 통과시키지 않는다 ────────────────
  for (const [name, md, needle] of [
    [
      "마커 밖 실제 편집",
      GOOD.replace("Residents reported", "Residents later reported"),
      "지문 재구성 불일치",
    ],
    ["마커 안 이중 변형", GOOD.replace("a busy street", "a quiet street"), "지문에 축자로 없음"],
    ["유령 고침 라벨", `${GOOD}\n고침(D): were → was`, "(D) 마커가 없음"],
    ["해설 누락", GOOD.split("해설:")[0], "해설 누락"],
    [
      "허용답에 틀린 표현",
      GOOD.replace("허용답(A): reduce | do reduce", "허용답(A): reduce | reduces"),
      "허용답에 틀린 표현",
    ],
    ["장식만 남은 고침 값", GOOD.replace("고침(A): reduces → reduce", "고침(A): ** → **"), "(A) 고침 줄 없음"],
  ] as [string, string, string][]) {
    check(
      `D9 무회귀: ${name} 은 여전히 반려`,
      gateOf(md).some((i) => i.includes(needle)),
      gateOf(md).join(" / "),
    );
  }
}
