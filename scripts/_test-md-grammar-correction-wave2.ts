// 적대검수 2기 회귀 픽스처 — `_test-md-grammar-correction.ts` 가 호출한다.
// (본 파일이 이미 870줄이라 2기분은 여기로 분리했다. 실행 진입점은 하나 그대로다.)
//
// 지배 계통은 전부 **silent-drop** 이다: 파서가 키워드 줄의 장식을 못 먹으면 필드가
// 통째로 사라지고 게이트가 사실과 다른 원인을 지목한다 — 그 문구가 그대로
// [반려 재생성] 피드백이 되어 모델을 엉뚱한 방향으로 몬다. 아래는 전부
// "수정 전 실제로 재현되던" 형태다. 하나라도 깨지면 그 사고가 되살아난 것.
import { parseMdGrammarCorrection } from "../src/lib/md-qgen/parser-grammar-correction";
import { autoSnapCorrectionSegments } from "../src/lib/md-qgen/snap-grammar-correction";
import { gateMdGrammarCorrection } from "../src/lib/md-qgen/gate-grammar-correction";
import { adaptMdGrammarCorrectionToAiQuestion } from "../src/lib/md-qgen/adapter-grammar-correction";
import { postProcessQuestion } from "../src/lib/question-postprocess";

export interface Wave2Env {
  PASSAGE: string;
  /** 정상 md 한 벌(밑줄 2곳 · 허용답(A) · 해설) */
  GOOD: string;
  /** [[A:…]] [[B:…]] 로 마킹된 지문 */
  MARKED: string;
  check: (name: string, ok: boolean, detail?: string) => void;
}

export function runWave2Fixtures({ PASSAGE, GOOD, MARKED, check }: Wave2Env): void {
  const parse = (t: string) => autoSnapCorrectionSegments(parseMdGrammarCorrection(t)).question;
  const gateOf = (t: string, errorCount = 2) =>
    gateMdGrammarCorrection(parse(t), PASSAGE, {
      errorCount,
      requestedDifficulty: "KILLER",
    });
  /** 2구간 · (A)='reduces→reduce' · 게이트 클린이어야 통과. */
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
  const sectionMd = (fixHead: string, acceptedHead = "허용답:") =>
    `밑줄지문:\n${MARKED}\n\n${fixHead}\n- (A) reduces → reduce\n- (B) were → was\n\n${acceptedHead}\n- (A) reduce | do reduce\n${EXPL}`;

  // ── W1(major) 섹션 헤더 장식 ────────────────────────────────────────────
  // FIX/ACCEPTED_LINE_HEAD 를 SECTION_HEAD 보다 먼저 시험하던 탓에, 헤더의 닫는
  // `**` 나 꼬리 공백 한 칸이 값으로 잡혀 값 줄로 오인 → section 이 null 로 리셋 →
  // 뒤따르는 `- (A) …` 항목이 한 건도 수집되지 않았다. 게이트에는 "(A)/(B) 고침 줄
  // 없음(받은 값: '' · '')" 만 보였고 — 모델은 두 줄 다 정확히 썼다.
  for (const [name, head] of [
    ["평문", "고침:"],
    ["굵게 콜론안 **고침:**", "**고침:**"],
    ["굵게 콜론밖 **고침**:", "**고침**:"],
    ["전각+굵게 **고침：**", "**고침：**"],
    ["꼬리 공백 1칸", "고침: "],
    ["꼬리 공백 2칸(md 강제 개행)", "고침:  "],
    ["언더스코어 __고침:__", "__고침:__"],
    ["언더스코어 _고침:_", "_고침:_"],
    ["헤딩 ## 고침:", "## 고침:"],
    ["인용 > 고침:", "> 고침:"],
    ["불릿 - 고침:", "- 고침:"],
    ["백틱 `고침`:", "`고침`:"],
  ] as [string, string][]) {
    intact(`W1 고침 섹션 헤더 장식: ${name}`, sectionMd(head));
  }

  // ── W2(major) 허용답 섹션 헤더 → 채점 집합 오염 ─────────────────────────
  // `**허용답:**` 는 게이트를 통과하면서 acceptedAnswers 에 쓰레기 '**' 를 저장했고
  // (진짜 허용답은 유실), 꼬리 공백·언더스코어·헤딩 형태는 허용답이 통째로 조용히
  // 사라졌다. exam-scoring answer-spec 이 소비하는 집합이라 채점이 직접 망가진다.
  for (const [name, head] of [
    ["평문", "허용답:"],
    ["굵게 콜론안", "**허용답:**"],
    ["전각+굵게", "**허용답：**"],
    ["꼬리 공백", "허용답: "],
    ["언더스코어", "__허용답:__"],
    ["헤딩", "## 허용답:"],
    ["인용", "> 허용답:"],
  ] as [string, string][]) {
    const md = sectionMd("고침:", head);
    const q = parse(md);
    const acc = q.segments[0].acceptedAnswers;
    check(
      `W2 허용답 섹션 헤더 장식: ${name} — 채점 집합 정상`,
      acc.join("|") === "reduce|do reduce" && gateOf(md).length === 0,
      `acc=[${acc.join(",")}] · ${gateOf(md).join(" / ")}`,
    );
  }
  {
    // 종단 확인 — 후처리까지 쓰레기 값이 실리지 않는다.
    const q = parse(sectionMd("고침:", "**허용답:**"));
    const pp = postProcessQuestion(
      "GRAMMAR_CORRECTION",
      PASSAGE,
      (adaptMdGrammarCorrectionToAiQuestion(q, PASSAGE, "KILLER").aiQuestion ?? {}) as never,
    );
    const dump = JSON.stringify(
      ((pp.data ?? {}) as Record<string, unknown>).underlinedSegments as unknown,
    );
    check(
      "W2 종단: 굵게 허용답 섹션도 후처리 채점 집합이 깨끗하다",
      pp.success === true && dump.includes('["reduce","do reduce"]') && !dump.includes('"**"'),
      dump.slice(0, 160),
    );
  }

  // ── W3(major) 밑줄지문 종료 경계 ────────────────────────────────────────
  // 종료 lookahead 가 `고침|허용답|해설` 만 알아서, 그 사이에 오는 어떤 줄이든
  // markedPassage 에 흡수됐다 → 지문을 한 글자도 안 건드린 출력에 거짓 "지문 재구성
  // 불일치" 가 100% 따라붙고, 피드백에 원인이 없어 재생성이 같은 줄을 반복했다.
  for (const [name, extra] of [
    ["정답 줄", "정답: reduce, was"],
    ["굵게 정답 줄", "**정답:** reduce, was"],
    ["전각 정답 줄", "정답： reduce, was"],
    ["오답 줄", "오답: 없음"],
    ["포인트 줄(계약 밖 라벨)", "포인트: (d)수일치"],
    ["출제 의도 줄", "출제 의도: 주어의 핵 추적"],
    ["헤딩 ## 고침", "## 고침"],
    ["구분선 ---", "---"],
    ["구분선 ***", "***"],
  ] as [string, string][]) {
    intact(
      `W3 지문 경계: ${name} 이 지문에 흡수되지 않는다`,
      GOOD.replace("\n\n고침(A):", `\n\n${extra}\n\n고침(A):`),
    );
  }

  // ── W4 값 줄 장식 전수(언더스코어·헤딩·백틱 — 1기가 `**` 만 봤다) ────────
  for (const [name, line] of [
    ["언더스코어 머리 __고침(A):__", "__고침(A):__ reduces → reduce"],
    ["언더스코어 1겹 _고침(A):_", "_고침(A):_ reduces → reduce"],
    ["언더스코어 값", "고침(A): __reduces__ → __reduce__"],
    ["언더스코어 값 1겹", "고침(A): _reduces_ → _reduce_"],
    ["줄 전체 언더스코어", "__고침(A): reduces → reduce__"],
    ["헤딩", "### 고침(A): reduces → reduce"],
    ["백틱 머리", "`고침(A)`: reduces → reduce"],
    ["헤딩+굵게+전각", "## **고침(A)：** reduces → reduce"],
  ] as [string, string][]) {
    intact(`W4 고침 값줄 장식: ${name}`, GOOD.replace("고침(A): reduces → reduce", line));
  }
  for (const [name, line] of [
    ["언더스코어 머리", "__허용답(A):__ reduce | do reduce"],
    ["언더스코어 값", "허용답(A): __reduce__ | __do reduce__"],
    ["줄 전체 언더스코어", "__허용답(A): reduce | do reduce__"],
    ["헤딩", "### 허용답(A): reduce | do reduce"],
    ["백틱 머리", "`허용답(A)`: reduce | do reduce"],
  ] as [string, string][]) {
    const md = GOOD.replace("허용답(A): reduce | do reduce", line);
    const acc = parse(md).segments[0].acceptedAnswers;
    check(
      `W4 허용답 값줄 장식: ${name}`,
      acc.join("|") === "reduce|do reduce" && gateOf(md).length === 0,
      `acc=[${acc.join(",")}] · ${gateOf(md).join(" / ")}`,
    );
  }

  // ── W5 밑줄지문·해설 머리 장식(누락 = 게이트가 "누락" 이라 거짓말한다) ───
  for (const [name, head] of [
    ["언더스코어 __밑줄지문:__", "__밑줄지문:__"],
    ["언더스코어 1겹", "_밑줄지문:_"],
    ["헤딩", "## 밑줄지문:"],
    ["백틱", "`밑줄지문`:"],
    ["헤딩+굵게", "## **밑줄지문:**"],
  ] as [string, string][]) {
    intact(`W5 밑줄지문 머리 장식: ${name}`, GOOD.replace("밑줄지문:", head));
  }
  for (const [name, head] of [
    ["언더스코어 __해설:__", "__해설:__"],
    ["언더스코어 1겹", "_해설:_"],
    ["헤딩", "## 해설:"],
    ["백틱", "`해설`:"],
  ] as [string, string][]) {
    intact(`W5 해설 머리 장식: ${name}`, GOOD.replace("해설:", head));
  }

  // ── W6 섹션 항목 장식 ───────────────────────────────────────────────────
  // `- (A) **reduces** → **reduce**` 는 ITEM_TAIL 의 무조건 `\**` 가 값의 여는
  // `**` 를 빼앗아 errorPart 가 'reduces**' 로 깨졌다(밑줄 안에 없음 거짓 지적).
  for (const [name, itemA] of [
    ["언더스코어 라벨", "- __(A):__ reduces → reduce"],
    ["굵게 라벨", "- **(A):** reduces → reduce"],
    ["헤딩 항목", "### (A) reduces → reduce"],
    ["값 굵게(라벨 콜론 없음)", "- (A) **reduces** → **reduce**"],
    ["값 언더스코어", "- (A) __reduces__ → __reduce__"],
    ["인용 항목", "> - (A) reduces → reduce"],
    ["전각 콜론 항목", "- (A)： reduces → reduce"],
  ] as [string, string][]) {
    intact(
      `W6 섹션 항목 장식: ${name}`,
      `밑줄지문:\n${MARKED}\n\n고침:\n${itemA}\n- (B) were → was\n${EXPL}`,
    );
  }

  // ── W7 마커 경계 장식(모델이 밑줄을 굵게 표시하는 실측 드리프트) ────────
  for (const [name, md] of [
    ["짝 맞는 **[[A:…]]**", GOOD.replace("[[A:", "**[[A:").replace("]] City", "]]** City")],
    ["짝 맞는 __[[B:…]]__", GOOD.replace("[[B:", "__[[B:").replace("]] Cool", "]]__ Cool")],
    ["여는 쪽만 **[[A:", GOOD.replace("[[A:", "**[[A:")],
    ["닫는 쪽만 ]]**", GOOD.replace("]] City", "]]** City")],
  ] as [string, string][]) {
    intact(`W7 마커 경계 장식: ${name}`, md);
    // 저장 경로까지 — sourceText 가 지문 축자여야 좌표·채점이 어긋나지 않는다.
    const adapt = adaptMdGrammarCorrectionToAiQuestion(parse(md), PASSAGE, "KILLER");
    const segs = (adapt.aiQuestion?.underlinedSegments ?? []) as Array<Record<string, unknown>>;
    check(
      `W7 저장 경로: ${name} — sourceText 가 지문 축자`,
      adapt.ok === true &&
        segs.length === 2 &&
        segs.every((s) => PASSAGE.includes(String(s.sourceText))),
      adapt.error ?? JSON.stringify(segs.map((s) => String(s.sourceText).slice(0, 30))),
    );
  }

  // ── W8 껍데기 값 차단(장식만 남은 값이 채점 집합에 저장되면 채점이 무너진다) ─
  {
    const md = GOOD.replace("허용답(A): reduce | do reduce", "허용답(A): reduce | ** | do reduce");
    const acc = parse(md).segments[0].acceptedAnswers;
    check(
      "W8 허용답에 낀 장식 껍데기('**')는 채점 집합에서 배제",
      acc.join("|") === "reduce|do reduce",
      `acc=[${acc.join(",")}]`,
    );
  }
  check(
    "W8 고침 값이 장식뿐이면 짝으로 인정하지 않는다",
    parse(GOOD.replace("고침(A): reduces → reduce", "고침(A): ** → **")).segments[0].errorPart ===
      "",
  );

  // ── W9 과잉 관용 무회귀 — 넓힌 관용이 무엇도 잘못 삼키지 않는다 ──────────
  intact(
    "W9 무회귀: 지문 중간 빈 줄(문단 2개)이 지문을 자르지 않는다",
    GOOD.replace("] City planners", "]\n\nCity planners"),
  );
  for (const [name, expl] of [
    ["'정답은 …' 문장", "해설: (A)는 수일치입니다. 정답은 reduce 이고 was 입니다. 주어를 확인하세요."],
    ["'고침' 단어가 든 둘째 줄", "해설: (A)는 수일치입니다.\n고침이 필요한 이유는 주어가 Trees 이기 때문입니다."],
    ["콜론이 낀 한국어 둘째 줄", "해설: (A)는 수일치입니다.\n포인트: 주어의 핵을 찾는 것이 관건입니다."],
  ] as [string, string][]) {
    const md = GOOD.replace(/해설: [\s\S]*$/, expl);
    const q = parse(md);
    check(
      `W9 무회귀: 해설이 ${name} 에서 잘리지 않는다`,
      q.explanation.length >= expl.length - 12 && gateOf(md).length === 0,
      `해설 ${q.explanation.length}자 · ${gateOf(md).join(" / ")}`,
    );
  }
  intact(
    "W9 무회귀: 섹션 중간에 낀 모르는 한글 줄은 건너뛰고 계속 수집",
    sectionMd("고침:").replace("- (B) were → was", "포인트: 수일치\n- (B) were → was"),
  );
  check(
    "W9 무회귀: 섹션 중간의 진짜 키워드 줄은 여전히 수집을 끝낸다",
    gateOf(sectionMd("고침:").replace("- (B) were → was", "해설: 끝\n- (B) were → was")).some((i) =>
      i.includes("(B) 고침 줄 없음"),
    ),
  );
  for (const [name, md, needle] of [
    [
      "마커 밖 실제 편집",
      GOOD.replace("Residents reported", "Residents later reported"),
      "지문 재구성 불일치",
    ],
    ["마커 안 이중 변형", GOOD.replace("a busy street", "a quiet street"), "지문에 축자로 없음"],
    ["유령 고침 라벨", `${GOOD}\n고침(D): were → was`, "(D) 마커가 없음"],
  ] as [string, string, string][]) {
    check(
      `W9 무회귀: ${name} 은 여전히 반려`,
      gateOf(md).some((i) => i.includes(needle)),
      gateOf(md).join(" / "),
    );
  }

  // ── W10 게이트 메시지 지목력(거짓·무의미한 사유가 피드백이 되면 안 된다) ─
  check(
    "W10 재구성 불일치가 '처음 어긋나는 자리' 를 실어 준다",
    gateOf(GOOD.replace("Residents reported", "Residents later reported")).some(
      (i) => i.includes("처음 어긋나는 자리") && i.includes("later reported"),
    ),
    gateOf(GOOD.replace("Residents reported", "Residents later reported")).join(" / "),
  );
  check(
    "W10 복원 실패 중 마커 밖 편집도 그 조각을 지목한다",
    gateOf(
      GOOD.replace("고침(B): were → was\n", "").replace(
        "Residents reported",
        "Residents later reported",
      ),
    ).some((i) => i.includes("지문 재구성 불일치") && i.includes("Residents later reported")),
  );
  for (const [name, md] of [
    ["전각 괄호 【A:…】", GOOD.replace("[[A:", "【A:").replace("[[B:", "【B:").split("]]").join("】")],
    ["단일 대괄호 [A:…]", GOOD.replace("[[A:", "[A:").replace("[[B:", "[B:").split("]]").join("]")],
  ] as [string, string][]) {
    check(
      `W10 마커 표기가 브래킷 계열로 흔들려도 자리를 지목한다: ${name}`,
      gateOf(md).some((i) => i.includes("마커 표기가 [[A:구간]] 형식이 아님")),
      gateOf(md).join(" / "),
    );
  }
}
