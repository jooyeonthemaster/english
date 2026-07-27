// ============================================================================
// 배열 영작(WORD_ORDER) — 키워드 줄 × 장식 **전수** 매트릭스 + 장식 회귀 픽스처.
// _test-md-word-order.ts 가 호출한다(실행은 그쪽 한 파일로 통일 · 파일 500줄 규약).
//
// ⚠ 이 웨이브의 지배 계통은 silent-drop 이다 — 파서가 키워드 줄의 장식을 흡수하지
//   못하면 그 필드가 **통째로 사라지고** 게이트가 **사실과 다른 원인**을 지목한다
//   (실측: `_해설_:` → explanation="" → GATE="해설 누락" · `*미끼*:` → GATE="미끼 0개").
//   그 문구가 그대로 [반려 재생성] 피드백이 되어 모델을 엉뚱한 방향으로 몬다.
//
// ⚠ 매트릭스를 **구·신 양 형식에 똑같이** 돌리는 것이 이 파일의 존재 이유다.
//   1차 수리 뒤에도 결함이 남은 이유가 정확히 이것이었다 — 키워드 매트릭스가
//   구형(`칩:` 줄) 픽스처 위에만 서 있어서, 신형식(`모범답안:` 줄의 ` / ` 청크)
//   경로의 장식 처리를 **한 번도** 통과시키지 않았다. 같은 결함이 다른 입구로
//   그대로 들어왔다(§1-B 철칙3 — 반쪽 관용이 무관용보다 나쁘다).
// ============================================================================

import { parseMdWordOrder } from "../src/lib/md-qgen/parser-word-order";
import { autoSnapWordOrderChips, gateMdWordOrder } from "../src/lib/md-qgen/gate-word-order";
import { adaptMdWordOrderToAiQuestion } from "../src/lib/md-qgen/adapter-word-order";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { buildAnswerSpec } from "../src/lib/exam-scoring/answer-spec";
import { gradeAnswer } from "../src/lib/exam-scoring/grade";

export type CheckFn = (name: string, ok: boolean, detail?: string) => void;

export interface DecorationMatrixInput {
  check: CheckFn;
  /** 지문 — 게이트 #9(verbatim) 판정에 그대로 쓰인다 */
  passage: string;
  /** 완성 문장(청크 마커 제거본) */
  answer: string;
  /** 구형 출력 픽스처(`칩:` 줄 있음) */
  legacyGood: string;
  /** 신형식 출력 픽스처(`모범답안:` 줄의 ` / ` 청크가 곧 칩) */
  newGood: string;
}

/** 값·칩 어디에도 남아서는 안 되는 장식 문자. */
const DECORATION_CHARS = /[*_`|[\]"“”~]/;

interface Decoration {
  name: string;
  /** 값을 감싸는 장식 — 값이 빈 라벨(`허용답:`)에서는 동어반복이라 건너뛴다 */
  needsValue?: true;
  apply: (label: string, rest: string) => string;
}

/**
 * 장식 8종 전수 — 굵게 머리 / 굵게 값 / 콜론 뒤 / 언더스코어 / 쌍 장식 /
 * 헤딩 / 인용·불릿 / 전각 콜론 (+ 꼬리 공백 · 표 파이프 · 복합).
 * ⚠ `**` 만 받는 것이 1차 수리의 대표적 미흡 패턴이었다. 마크다운의 강조는
 *   `*이탤릭*` · `_이탤릭_` · `__굵게__` · `***굵은이탤릭***` 이 모두 정규 문법이다.
 */
const DECORATIONS: Decoration[] = [
  { name: "굵게머리 **L**:", apply: (l, r) => `**${l}**:${r}` },
  { name: "굵게머리(콜론뒤) **L:**", apply: (l, r) => `**${l}:**${r}` },
  { name: "언더스코어2 __L__:", apply: (l, r) => `__${l}__:${r}` },
  { name: "언더스코어2(콜론뒤) __L:__", apply: (l, r) => `__${l}:__${r}` },
  { name: "언더스코어1 _L_:", apply: (l, r) => `_${l}_:${r}` },
  { name: "언더스코어1(콜론뒤) _L:_", apply: (l, r) => `_${l}:_${r}` },
  { name: "별표1 *L*:", apply: (l, r) => `*${l}*:${r}` },
  { name: "별표1(콜론뒤) *L:*", apply: (l, r) => `*${l}:*${r}` },
  { name: "삼중강조 ***L***:", apply: (l, r) => `***${l}***:${r}` },
  { name: "굵게값 **v**", needsValue: true, apply: (l, r) => `${l}: **${r.trim()}**` },
  { name: "언더스코어2값 __v__", needsValue: true, apply: (l, r) => `${l}: __${r.trim()}__` },
  { name: "언더스코어1값 _v_", needsValue: true, apply: (l, r) => `${l}: _${r.trim()}_` },
  { name: "별표1값 *v*", needsValue: true, apply: (l, r) => `${l}: *${r.trim()}*` },
  { name: "백틱값 `v`", needsValue: true, apply: (l, r) => `${l}: \`${r.trim()}\`` },
  { name: '쌍장식값 "v"', needsValue: true, apply: (l, r) => `${l}: "${r.trim()}"` },
  { name: "쌍장식값 “v”", needsValue: true, apply: (l, r) => `${l}: “${r.trim()}”` },
  { name: "쌍장식값 'v'", needsValue: true, apply: (l, r) => `${l}: '${r.trim()}'` },
  { name: "쌍장식값 [v]", needsValue: true, apply: (l, r) => `${l}: [${r.trim()}]` },
  { name: "헤딩 ## L:", apply: (l, r) => `## ${l}:${r}` },
  { name: "헤딩 ###### L:", apply: (l, r) => `###### ${l}:${r}` },
  { name: "인용 > L:", apply: (l, r) => `> ${l}:${r}` },
  { name: "하이픈 불릿 - L:", apply: (l, r) => `- ${l}:${r}` },
  { name: "별표 불릿 * L:", apply: (l, r) => `* ${l}:${r}` },
  { name: "중점 불릿 • L:", apply: (l, r) => `• ${l}:${r}` },
  { name: "번호 불릿 1. L:", apply: (l, r) => `1. ${l}:${r}` },
  { name: "전각 콜론 L：", apply: (l, r) => `${l}：${r}` },
  { name: "꼬리 공백", apply: (l, r) => `${l}:${r}   ` },
  { name: "앞 공백", apply: (l, r) => `   ${l}:${r}` },
  { name: "콜론 앞 공백 L :", apply: (l, r) => `${l} :${r}` },
  { name: "표 행 파이프 | L: | v |", apply: (l, r) => `| ${l}: |${r} |` },
  { name: '복합 > **L:** "v"', needsValue: true, apply: (l, r) => `> **${l}:** "${r.trim()}"` },
  { name: "복합 ## __L__： **v**", needsValue: true, apply: (l, r) => `## __${l}__： **${r.trim()}**` },
  { name: "복합 - _L_: `v`", needsValue: true, apply: (l, r) => `- _${l}_: \`${r.trim()}\`` },
];

export function runWordOrderDecorationMatrix(input: DecorationMatrixInput): void {
  const { check, passage, answer, legacyGood, newGood } = input;

  const parsedOf = (text: string) => autoSnapWordOrderChips(parseMdWordOrder(text)).question;
  const gateOf = (text: string, distractorMin = 2) =>
    gateMdWordOrder(parsedOf(text), passage, { distractorMin });

  /** 파싱 결과가 정상 형상인가 — 스냅 **전** 원본으로 본다(스냅이 미끼를 재도출해 준다). */
  function shapeOk(text: string): { ok: boolean; detail: string } {
    const q = parseMdWordOrder(text);
    const issues = gateOf(text);
    const residue = [q.modelAnswer, ...q.chips, ...q.distractors, ...q.acceptedAnswers].filter((s) =>
      DECORATION_CHARS.test(s),
    );
    const ok =
      q.modelAnswer === answer &&
      q.chips.length === 7 &&
      q.distractors.length === 2 &&
      q.contextHint.startsWith("앞 문장의") &&
      q.acceptedAnswers.length === 1 &&
      q.explanation.startsWith("원인절을") &&
      !DECORATION_CHARS.test(q.explanation) &&
      residue.length === 0 &&
      issues.length === 0;
    return {
      ok,
      detail: `답='${q.modelAnswer.slice(0, 24)}' 칩${q.chips.length} 미끼${q.distractors.length} 힌트='${q.contextHint.slice(0, 8)}' 허용답${q.acceptedAnswers.length} 해설='${q.explanation.slice(0, 10)}' 잔재=${JSON.stringify(residue)} :: ${issues.join(" / ")}`,
    };
  }

  function matrix(tag: string, base: string, lines: [string, string][]): void {
    for (const [label, line] of lines) {
      const rest = line.slice(line.indexOf(":") + 1);
      for (const deco of DECORATIONS) {
        if (deco.needsValue && !rest.trim()) continue; // 값이 빈 라벨 — 동어반복
        const drifted = base.replace(line, deco.apply(label, rest));
        const r = shapeOk(drifted);
        // ⚠ 픽스처 공허화 방지 — 치환이 실제로 일어났는지부터 단정한다. 치환이 빗나가면
        //   원문을 검사해 전부 통과해 버려 이 표가 통째로 무의미해진다.
        check(
          `키워드 줄 관용[${tag}]: ${label} × ${deco.name}`,
          drifted !== base && r.ok,
          `치환=${drifted !== base} ${r.detail}`,
        );
      }
    }
  }

  matrix("구형", legacyGood, [
    ["모범답안", `모범답안: ${answer}`],
    [
      "칩",
      "칩: the norms / by regulators / Spreading faster / were shaped / than regulators could respond / shaped / by early adopters",
    ],
    ["미끼", "미끼: by regulators / shaped"],
    ["힌트", "힌트: 앞 문장의 인과 관계를 뒤집어 결과 쪽에 초점을 둔 문장입니다."],
    ["허용답", "허용답:"],
    [
      "해설",
      "해설: 원인절을 분사구문으로 접고 주절을 수동태로 바꾼 문장입니다. 분사구문이 문두에 오고 행위자를 나타내는 전치사구가 뒤에 놓여야 어순이 성립합니다.",
    ],
  ]);

  const chunked = newGood.match(/^모범답안:(.*)$/m)?.[1]?.trim() ?? "";
  check("신형식 매트릭스 전제: 청크 마커가 실재", chunked.includes(" / "), chunked);
  matrix("신형식", newGood, [
    ["모범답안", `모범답안: ${chunked}`],
    ["미끼", "미끼: by regulators / shaped"],
    ["힌트", "힌트: 앞 문장의 인과 관계를 뒤집어 결과 쪽에 초점을 둔 문장입니다."],
    ["허용답", "허용답:"],
    [
      "해설",
      "해설: 원인절을 분사구문으로 접고 주절을 수동태로 바꾼 문장입니다. 분사구문이 문두에 오고 행위자를 나타내는 전치사구가 뒤에 놓여야 어순이 성립합니다.",
    ],
  ]);

  // ── 채점 왕복 헬퍼 — 오염된 correctAnswer 는 여기서만 드러난다 ──────────────
  function gradeRoundTrip(md: string, studentAnswer: string): string {
    const adapted = adaptMdWordOrderToAiQuestion(parsedOf(md), "KILLER");
    if (!adapted.ok || !adapted.aiQuestion) return `ADAPT_FAIL:${adapted.error ?? ""}`;
    const processed = postProcessQuestion("WORD_ORDER", passage, adapted.aiQuestion as never);
    const data = processed.data as Record<string, unknown>;
    return gradeAnswer(
      buildAnswerSpec({
        id: "q-word-order-deco",
        type: "SUBJECTIVE",
        subType: "WORD_ORDER",
        correctAnswer: String(data.correctAnswer ?? ""),
        structuredData: data,
        sourcePassageContent: passage,
        points: 4,
      }),
      { texts: { answer: studentAnswer } },
    ).status;
  }

  // ── [적대검수 round2 critical] 줄 전체를 감싼 쌍 장식 ───────────────────────
  // stripDecoration 의 쌍 규칙은 여는 기호와 닫는 기호가 **같은 조각 안에** 있어야
  // 발화한다. ` / ` 로 청크를 쪼갠 뒤에는 여는 따옴표가 1번 청크·닫는 따옴표가 N번
  // 청크로 흩어져 영영 매칭되지 않았다(파이프·`**`·백틱은 양끝을 독립적으로 트림해
  // 살아남았다 — 1차 수리가 이 계통만 새어 나가게 둔 자리다). 게이트는 토큰화가
  // 이 문자들을 버리므로 끝까지 조용했고, 그 문자열이 그대로 채점 correctAnswer 가
  // 되어 **정답 문장을 정확히 입력한 학생 전원이 WRONG(0점)** 이었다.
  for (const [name, wrap] of [
    ['따옴표 "…"', (s: string) => `"${s}"`],
    ["곡선 따옴표 “…”", (s: string) => `“${s}”`],
    ["작은 따옴표 '…'", (s: string) => `'${s}'`],
    ["대괄호 […]", (s: string) => `[${s}]`],
    ["불균형 여는 따옴표", (s: string) => `"${s}`],
    ["불균형 닫는 따옴표", (s: string) => `${s}"`],
    ["불균형 여는 대괄호", (s: string) => `[${s}`],
    ["쌍 장식 + 청크별 굵게", (s: string) => `"${s.replace("Spreading faster", "**Spreading faster**")}"`],
  ] as [string, (s: string) => string][]) {
    const md = newGood.replace(`모범답안: ${chunked}`, `모범답안: ${wrap(chunked)}`);
    const q = parseMdWordOrder(md);
    check(
      `★ 줄 전체 쌍 장식[신형식]: ${name} — modelAnswer·칩에 잔재 0 · 게이트 클린`,
      md !== newGood &&
        q.modelAnswer === answer &&
        q.chips.length === 7 &&
        q.chips.every((c) => !DECORATION_CHARS.test(c)) &&
        gateOf(md).length === 0,
      `치환=${md !== newGood} ${JSON.stringify(q.modelAnswer)} :: ${q.chips.join(" | ")} :: ${gateOf(md).join(" / ")}`,
    );
    check(
      `★ 줄 전체 쌍 장식[신형식]: ${name} — 채점 왕복 CORRECT (오염 시 전원 오답이었다)`,
      gradeRoundTrip(md, answer) === "CORRECT",
      gradeRoundTrip(md, answer),
    );
  }

  // ── 단일 강조 라벨 머리 — 필드가 사라지면 게이트가 **거짓 원인**을 지목한다 ──
  for (const [name, md, mustNot] of [
    [
      "_모범답안_: (신형식)",
      newGood.replace(`모범답안: ${chunked}`, `_모범답안_: ${chunked}`),
      "모범답안 줄을 인식할 수 없음",
    ],
    ["*미끼*: (신형식)", newGood.replace("미끼: by regulators / shaped", "*미끼*: by regulators / shaped"), "미끼 0개"],
    ["_해설_: (신형식)", newGood.replace("해설: 원인절", "_해설_: 원인절"), "해설 누락"],
    [
      "_칩_: (구형)",
      legacyGood.replace(/^칩:/m, "_칩_:"),
      "모범답안 줄에 청크 경계가 없음",
    ],
  ] as [string, string, string][]) {
    const issues = gateOf(md);
    check(
      `★ 단일 강조 머리: ${name} 에 필드가 사라지지 않는다(거짓 반려 차단)`,
      md !== newGood && md !== legacyGood && shapeOk(md).ok && !issues.some((i) => i.includes(mustNot)),
      `${shapeOk(md).detail}`,
    );
  }

  // ── 청크·미끼 조각별 단일 강조 ──────────────────────────────────────────────
  for (const [name, line] of [
    ["청크마다 *이탤릭*", chunked.split(" / ").map((c) => `*${c}*`).join(" / ")],
    ["청크마다 _이탤릭_", chunked.split(" / ").map((c) => `_${c}_`).join(" / ")],
    ["청크마다 ***강조***", chunked.split(" / ").map((c) => `***${c}***`).join(" / ")],
  ] as [string, string][]) {
    const md = newGood.replace(`모범답안: ${chunked}`, `모범답안: ${line}`);
    const q = parseMdWordOrder(md);
    check(
      `★ 조각별 강조: ${name} — 칩 잔재 0 · 게이트 클린`,
      md !== newGood &&
        q.modelAnswer === answer &&
        q.chips.every((c) => !DECORATION_CHARS.test(c)) &&
        gateOf(md).length === 0,
      `${JSON.stringify(q.modelAnswer)} :: ${q.chips.join(" | ")} :: ${gateOf(md).join(" / ")}`,
    );
  }
  {
    const md = newGood.replace("미끼: by regulators / shaped", "미끼: *by regulators* / _shaped_");
    const q = parseMdWordOrder(md);
    check(
      "★ 조각별 강조: 미끼 조각의 단일 이탤릭도 흡수(선언이 버려져 재도출로 떨어지지 않는다)",
      md !== newGood &&
        q.distractors.length === 2 &&
        q.distractors.every((d) => !DECORATION_CHARS.test(d)) &&
        autoSnapWordOrderChips(q).corrections.length === 0,
      `${q.distractors.join(" / ")} :: ${autoSnapWordOrderChips(q).corrections.join(" / ")}`,
    );
  }

  // ── 값이 장식뿐인 헤더 · 불릿 블록 종결자 ───────────────────────────────────
  {
    const q = parseMdWordOrder(newGood.replace(/^허용답:$/m, "*허용답:*"));
    check(
      "★ 값이 장식뿐인 헤더(`*허용답:*`)가 빈/장식 원소를 채점 집합에 싣지 않는다",
      q.acceptedAnswers.length === 1 && !DECORATION_CHARS.test(q.acceptedAnswers[0] ?? ""),
      JSON.stringify(q.acceptedAnswers),
    );
  }
  {
    // 1차 수리는 **해설만** 이름 모를 라벨에서 끊게 했다. 불릿 블록은 그대로여서
    // 같은 잡음 줄이 허용답(=채점 집합)으로 들어왔다 — 다른 입구, 같은 결함.
    const md = newGood.replace(/^해설:/m, "설계 노트: 미끼는 두 개이며 나머지가 정답 칩입니다.\n해설:");
    const q = parseMdWordOrder(md);
    check(
      "★ 허용답 불릿 블록이 이름 모를 잡음 라벨(`설계 노트:`)에서 끊긴다",
      md !== newGood && q.acceptedAnswers.length === 1 && !q.acceptedAnswers.some((a) => a.includes("설계")),
      JSON.stringify(q.acceptedAnswers),
    );
  }
  {
    // 무회귀 — 불릿 사이 빈 줄과 정상 영문 허용답은 계속 흡수한다
    const md = newGood.replace(/^허용답:$/m, "허용답:\n");
    const q = parseMdWordOrder(md);
    check(
      "허용답: 불릿 앞 빈 줄은 계속 흡수(기존 관용 무회귀)",
      md !== newGood && q.acceptedAnswers.length === 1,
      JSON.stringify(q.acceptedAnswers),
    );
  }

  // ── 공유 유틸이 새로 보장하는 관용 — 값 드리프트 · 콜론 없는 헤딩 ───────────
  // keywordLineRe/readKeywordValue 로 교체하면서 들어온 계통이다. 자체 머리표는
  // 콜론을 **필수**로 요구해 `## 모범답안` 관습에서 필드가 통째로 사라졌고, 값이
  // 다음 줄로 밀린 드리프트도 흡수하지 못했다.
  for (const [name, headLine] of [
    ["값이 다음 줄(`모범답안:` 개행 값)", "모범답안:"],
    ["콜론 없는 헤딩(`## 모범답안`)", "## 모범답안"],
    ["콜론 없는 헤딩 + 강조(`## **모범답안**`)", "## **모범답안**"],
  ] as [string, string][]) {
    const md = newGood.replace(`모범답안: ${chunked}`, `${headLine}\n${chunked}`);
    const r = shapeOk(md);
    check(`★ 공유 유틸 관용: ${name}`, md !== newGood && r.ok, r.detail);
  }
  {
    // 정지 키워드 누락 회귀 — 섹션 lookahead 를 손으로 쓰면 **일부 키워드만 알아서**
    // 블록이 붕괴한다. 순서가 뒤바뀐 출력에서 해설이 다음 섹션을 통째로 삼키면
    // 정답해설 지면이 허용답·채점 기준을 학생에게 그대로 노출한다.
    const reordered = `모범답안: ${chunked}
미끼: by regulators / shaped
힌트: 앞 문장의 인과 관계를 뒤집어 결과 쪽에 초점을 둔 문장입니다.
해설: 원인절을 분사구문으로 접고 주절을 수동태로 바꾼 문장입니다. 분사구문이 문두에 오고 행위자를 나타내는 전치사구가 뒤에 놓여야 어순이 성립합니다.
허용답:
- The norms were shaped by early adopters, spreading faster than regulators could respond.
채점 기준: 어순이 정확히 일치하면 4점입니다.`;
    const q = parseMdWordOrder(reordered);
    check(
      "★ 정지 키워드 전수: 섹션 순서가 뒤바뀌어도 해설이 허용답·채점 기준을 삼키지 않는다",
      !q.explanation.includes("The norms") &&
        !q.explanation.includes("채점") &&
        !q.explanation.includes("허용답") &&
        q.acceptedAnswers.length === 1 &&
        gateOf(reordered).length === 0,
      `해설='${q.explanation}' 허용답=${JSON.stringify(q.acceptedAnswers)} :: ${gateOf(reordered).join(" / ")}`,
    );
  }
  {
    // 어댑터 단독 호출(게이트 반려분 구제 경로) — 저장 직전 값에 장식이 남으면
    // 그 한 글자가 채점 correctAnswer 를 오염시켜 정답자가 구조적으로 0명이 된다.
    const dirty = {
      ...parsedOf(newGood),
      modelAnswer: `**${answer}**`,
      explanation: "`원인절을 분사구문으로 접었습니다.`",
    };
    const adapted = adaptMdWordOrderToAiQuestion(dirty, "KILLER");
    const ai = (adapted.aiQuestion ?? {}) as Record<string, unknown>;
    check(
      "★ 어댑터: 저장 직전 값에 장식이 남지 않는다(correctAnswer·모범답안·해설)",
      adapted.ok === true &&
        ai.correctAnswer === answer &&
        ai.modelAnswer === answer &&
        (ai.acceptedAnswers as string[])[0] === answer &&
        !DECORATION_CHARS.test(String(ai.explanation)),
      `${JSON.stringify(ai.correctAnswer)} :: ${JSON.stringify(ai.explanation)}`,
    );
  }

  // ── 게이트 양성 대조 / 과잉 차단 금지 ───────────────────────────────────────
  {
    // 취소선(`~~`)은 **공유 유틸이 흡수하는 정규 강조**다(decoration.ts EMPHASIS_RUN).
    // 종전에는 파서가 이 표기를 몰라 잔재가 새어 나갔고 게이트가 반려로 막았다 —
    // 이제는 반려가 아니라 **정상 정리**가 정답이다(정상 문항을 반려시키는 게이트는
    // 결함을 놓치는 것보다 나쁘다). 잔재 0 · 게이트 클린 · 채점 CORRECT 를 함께 본다.
    const md = newGood.replace("모범답안: Spreading faster", "모범답안: ~~Spreading faster~~");
    const q = parseMdWordOrder(md);
    check(
      "★ 취소선(`~~`)은 공유 유틸이 흡수 — 잔재 0 · 게이트 클린 · 채점 CORRECT",
      md !== newGood &&
        q.modelAnswer === answer &&
        q.chips.every((c) => !DECORATION_CHARS.test(c)) &&
        gateOf(md).length === 0 &&
        gradeRoundTrip(md, answer) === "CORRECT",
      `${JSON.stringify(q.modelAnswer)} :: ${q.chips.join(" | ")} :: ${gateOf(md).join(" / ")} :: ${gradeRoundTrip(md, answer)}`,
    );
  }
  {
    // 그래도 게이트의 **가장자리 마크업** 검사는 살아 있어야 한다 — 파서를 우회해
    // 조립된 형상(어댑터 단독 호출·후속 유형이 새 표기를 들고 오는 경우)이 조용히
    // 출하되면 그 한 글자가 채점 correctAnswer 를 오염시켜 정답자가 0명이 된다.
    for (const [name, dirty] of [
      ["모범답안", { ...parsedOf(newGood), modelAnswer: `${answer}~` }],
      ["칩", { ...parsedOf(newGood), chips: [...parsedOf(newGood).chips, "|the norms"] }],
    ] as [string, ReturnType<typeof parsedOf>][]) {
      const issues = gateMdWordOrder(dirty, passage, { distractorMin: 2 });
      check(
        `★ 게이트: 파서를 우회한 가장자리 마크업(${name})은 자리를 지목해 반려`,
        issues.some((i) => i.includes("장식 기호가 남음")),
        issues.join(" / "),
      );
    }
  }
  for (const [name, chunkLine, studentAnswer] of [
    [
      "내부 인용(짝 맞음)을 담은 정답",
      "Called / a \"governance lag\" / by researchers, / the interval / keeps widening.",
      'Called a "governance lag" by researchers, the interval keeps widening.',
    ],
    [
      "소유격 아포스트로피를 담은 정답",
      "Spreading faster / than the regulators' reach, / the norms / were shaped / by early adopters.",
      "Spreading faster than the regulators' reach, the norms were shaped by early adopters.",
    ],
    [
      "괄호(짝 맞음)를 담은 정답",
      "The norms / (already hardened) / were shaped / by early adopters / that year.",
      "The norms (already hardened) were shaped by early adopters that year.",
    ],
  ] as [string, string, string][]) {
    const md = newGood.replace(`모범답안: ${chunked}`, `모범답안: ${chunkLine}`);
    const q = parsedOf(md);
    check(
      `★ 과잉 차단 금지: ${name} 은 글자 손실 없이 통과(게이트 클린·무보정)`,
      md !== newGood &&
        q.modelAnswer === studentAnswer &&
        gateOf(md).length === 0 &&
        gradeRoundTrip(md, studentAnswer) === "CORRECT",
      `${JSON.stringify(q.modelAnswer)} :: ${gateOf(md).join(" / ")} :: ${gradeRoundTrip(md, studentAnswer)}`,
    );
  }
}
