// ============================================================================
// 문맥 속 의미 — **장식 전수 회귀 픽스처**(웨이브2 R2 · silent-drop 계통).
// 본편 _test-md-context-meaning.ts 가 import 해서 실행한다(400/500줄 규칙 분할).
//
// 왜 전수인가: 1차 수리가 `**`·`__` 만 관용하고 값 쪽 장식·기울임(1개)·백틱을
// 남겨서, `**정답:** **③**` 이 `**③` 으로 확정 → leadingRun 실패 → answers=[] →
// 게이트가 "정답 누락" 이라는 **사실과 다른 원인**을 뱉었다. 그 문구가 그대로
// [반려 재생성] 피드백이 되어 2차도 같은 자리에서 반려된다(생성 실패 + 환불).
// 그래서 **키워드 줄 4종 × 장식 전 형태**를 곱셈으로 고정한다 — 한 칸이라도
// 비면 같은 사고가 그 칸으로 다시 들어온다.
// ============================================================================
import {
  autoSnapContextMeaningTarget,
  parseMdContextMeaning,
} from "../src/lib/md-qgen/parser-context-meaning";
import { gateMdContextMeaning } from "../src/lib/md-qgen/gate-context-meaning";

type Check = (name: string, ok: boolean, detail?: string) => void;
export interface DecorationFixtureDeps {
  check: Check;
  PASSAGE: string;
  GOOD: string;
  MULTI: string;
  UL: string;
  TARGET: string;
  ANSWER_TEXT: string;
}

/** `라벨: 값` 한 줄을 장식하는 생성기 — 8종 계통을 전부 덮는다. */
type Deco = (label: string, value: string) => string;
const VALUE_DECOS: Array<[string, Deco]> = [
  ["평문(기준)", (l, v) => `${l}: ${v}`],
  ["굵게 머리", (l, v) => `**${l}:** ${v}`],
  ["굵게 값", (l, v) => `${l}: **${v}**`],
  ["콜론 앞 굵게", (l, v) => `**${l}**: ${v}`],
  ["언더스코어 머리(__)", (l, v) => `__${l}:__ ${v}`],
  ["언더스코어 머리(_)", (l, v) => `_${l}:_ ${v}`],
  ["언더스코어 값(__)", (l, v) => `${l}: __${v}__`],
  ["언더스코어 값(_)", (l, v) => `${l}: _${v}_`],
  ["언더스코어 콜론앞", (l, v) => `__${l}__: ${v}`],
  ["기울임 머리(*)", (l, v) => `*${l}:* ${v}`],
  ["기울임 값(*)", (l, v) => `${l}: *${v}*`],
  ["쌍장식(**)", (l, v) => `**${l}:** **${v}**`],
  ["쌍장식(__)", (l, v) => `__${l}:__ __${v}__`],
  ["쌍장식(_)", (l, v) => `_${l}:_ _${v}_`],
  ["쌍장식(콜론앞+값)", (l, v) => `**${l}**: **${v}**`],
  ["쌍장식+전각콜론", (l, v) => `**${l}：** **${v}**`],
  ["쌍장식+불릿", (l, v) => `- **${l}:** **${v}**`],
  ["쌍장식+헤딩", (l, v) => `### **${l}:** **${v}**`],
  ["쌍장식+인용", (l, v) => `> **${l}:** **${v}**`],
  ["쌍장식 짝깨짐(여는것만)", (l, v) => `**${l}:** **${v}`],
  ["쌍장식 값 백틱", (l, v) => `**${l}:** \`${v}\``],
  ["강조 3개(***)", (l, v) => `***${l}:*** ***${v}***`],
  ["헤딩", (l, v) => `## ${l}: ${v}`],
  ["인용", (l, v) => `> ${l}: ${v}`],
  ["불릿(-)", (l, v) => `- ${l}: ${v}`],
  ["불릿(*)", (l, v) => `* ${l}: ${v}`],
  ["불릿(+)", (l, v) => `+ ${l}: ${v}`],
  ["전각 콜론", (l, v) => `${l}： ${v}`],
  ["전각 콜론+굵게 머리", (l, v) => `**${l}：** ${v}`],
  ["꼬리 공백", (l, v) => `${l}: ${v}   `],
  ["굵게 머리+꼬리 공백", (l, v) => `**${l}:** ${v}   `],
  ["콜론 뒤 공백 없음", (l, v) => `${l}:${v}`],
  ["굵게 머리+콜론 뒤 공백 없음", (l, v) => `**${l}:**${v}`],
  ["줄 전체 굵게", (l, v) => `**${l}: ${v}**`],
  ["줄 전체 __", (l, v) => `__${l}: ${v}__`],
  ["줄 전체 _", (l, v) => `_${l}: ${v}_`],
];

/** 값이 없는 섹션 헤더(`오답:`) 전용 장식. */
const HEAD_DECOS: Array<[string, (l: string) => string]> = [
  ["평문(기준)", (l) => `${l}:`],
  ["굵게 머리", (l) => `**${l}:**`],
  ["콜론 앞 굵게", (l) => `**${l}**:`],
  ["언더스코어(__)", (l) => `__${l}:__`],
  ["언더스코어(_)", (l) => `_${l}:_`],
  ["기울임(*)", (l) => `*${l}:*`],
  ["헤딩", (l) => `## ${l}:`],
  ["헤딩+굵게", (l) => `### **${l}:**`],
  ["인용", (l) => `> ${l}:`],
  ["불릿(-)", (l) => `- ${l}:`],
  ["불릿(*)+굵게", (l) => `* **${l}:**`],
  ["전각 콜론", (l) => `${l}：`],
  ["전각 콜론+굵게", (l) => `**${l}：**`],
  ["꼬리 공백", (l) => `${l}:   `],
  ["강조 3개(***)", (l) => `***${l}:***`],
];

const MD_RESIDUE = /[*`_]/;

export function runContextMeaningDecorationFixtures(
  deps: DecorationFixtureDeps,
): void {
  const { check, PASSAGE, GOOD, MULTI, UL, TARGET, ANSWER_TEXT } = deps;
  const run = (
    md: string,
    opt: { optionCount: number; answerCount: number } = {
      optionCount: 5,
      answerCount: 1,
    },
  ) => {
    const q = autoSnapContextMeaningTarget(
      parseMdContextMeaning(md),
      PASSAGE,
    ).question;
    return { q, issues: gateMdContextMeaning(q, PASSAGE, opt) };
  };

  // ── A. 키워드 줄 4종 × 장식 전수 ────────────────────────────────────────
  // 값 있는 줄 3종: 밑줄 · 정답 · 해설. 각 칸에서 (1) 필드 생존 (2) 장식 0 잔존
  // (3) 게이트 클린 을 동시에 요구한다 — 셋 중 하나만 빠져도 사고 형태가 다를 뿐 같다.
  const VALUE_LINES: Array<
    [string, string, string, (r: ReturnType<typeof run>) => boolean, (r: ReturnType<typeof run>) => string]
  > = [
    [
      "밑줄",
      "밑줄",
      TARGET,
      (r) => r.q.word === TARGET && r.issues.length === 0,
      (r) => `word=${JSON.stringify(r.q.word)} · ${r.issues.join(" / ")}`,
    ],
    [
      "정답",
      "정답",
      "③",
      (r) => r.q.answers.join(",") === "③" && r.issues.length === 0,
      (r) => `answers=${JSON.stringify(r.q.answers)} · ${r.issues.join(" / ")}`,
    ],
    [
      "밑줄 단어(라벨 확장)",
      "밑줄 단어",
      TARGET,
      (r) => r.q.word === TARGET && r.issues.length === 0,
      (r) => `word=${JSON.stringify(r.q.word)} · ${r.issues.join(" / ")}`,
    ],
  ];
  for (const [name, label, value, ok, detail] of VALUE_LINES) {
    const plain = label.startsWith("밑줄") ? UL : "정답: ③";
    for (const [dname, deco] of VALUE_DECOS) {
      const r = run(GOOD.replace(plain, deco(label, value)));
      check(`장식 전수 [${name}] ${dname}`, ok(r), detail(r));
    }
  }
  // 해설은 값이 문장이라 별도 — 장식이 **값 선두/말미에 남지 않는지**까지 본다.
  const EXPL_HEAD = "이 글은";
  for (const [dname, deco] of VALUE_DECOS) {
    const md = GOOD.replace(/^해설: (.*)$/m, (_m, v) =>
      deco("해설", String(v)),
    );
    const r = run(md);
    const ok =
      r.q.explanation.startsWith(EXPL_HEAD) &&
      !MD_RESIDUE.test(r.q.explanation.slice(0, 3)) &&
      !MD_RESIDUE.test(r.q.explanation.slice(-3)) &&
      r.issues.length === 0;
    check(
      `장식 전수 [해설] ${dname}`,
      ok,
      `expl=${JSON.stringify(r.q.explanation.slice(0, 20))}…${JSON.stringify(r.q.explanation.slice(-6))} · ${r.issues.join(" / ")}`,
    );
  }
  for (const [label, tag] of [
    ["오답", "오답"],
    ["오답 해설", "오답 해설(라벨 확장)"],
  ]) {
    for (const [dname, deco] of HEAD_DECOS) {
      const r = run(GOOD.replace("오답:", deco(label)));
      check(
        `장식 전수 [${tag}] ${dname}`,
        r.q.wrong.length === 4 && r.issues.length === 0,
        `wrong=${r.q.wrong.length} · ${r.issues.join(" / ")}`,
      );
    }
  }

  // ── B. 라벨 줄(선지·오답해설) 장식 ──────────────────────────────────────
  // 키워드 줄만 고치고 라벨 줄을 놓치면 같은 결함이 옆문으로 들어온다.
  const OPTION_DECOS: Array<[string, string]> = [
    ["라벨 _", `_③_ ${ANSWER_TEXT}`],
    ["라벨 *", `*③* ${ANSWER_TEXT}`],
    ["라벨 __", `__③__ ${ANSWER_TEXT}`],
    ["줄 전체 _", `_③ ${ANSWER_TEXT}_`],
    ["줄 전체 *", `*③ ${ANSWER_TEXT}*`],
    ["줄 전체 __", `__③ ${ANSWER_TEXT}__`],
    ["값만 _", `③ _${ANSWER_TEXT}_`],
    ["값 앞 _ 만(짝 깨짐)", `③ _${ANSWER_TEXT}`],
    ["값 뒤 _ 만(짝 깨짐)", `③ ${ANSWER_TEXT}_`],
    ["라벨·값 각각 __", `__③__ __${ANSWER_TEXT}__`],
    ["헤딩 선지", `### ③ ${ANSWER_TEXT}`],
    ["강조 3개", `***③ ${ANSWER_TEXT}***`],
  ];
  for (const [dname, line] of OPTION_DECOS) {
    const r = run(GOOD.replace(`③ ${ANSWER_TEXT}`, line));
    check(
      `장식 전수 [선지 줄] ${dname}`,
      r.q.options.length === 5 &&
        r.q.options[2]?.text === ANSWER_TEXT &&
        r.issues.length === 0,
      `opts=${r.q.options.length} t=${JSON.stringify(r.q.options[2]?.text)} · ${r.issues.join(" / ")}`,
    );
  }
  for (const [dname, line] of [
    ["라벨 _", "_①_ 대표뜻 —"],
    ["줄 전체 _", "_① 대표뜻 —"],
    ["헤딩", "#### ① 대표뜻 —"],
  ] as Array<[string, string]>) {
    const r = run(GOOD.replace("① 대표뜻 —", line));
    check(
      `장식 전수 [오답해설 줄] ${dname}`,
      r.q.wrong.length === 4 && r.issues.length === 0,
      `wrong=${r.q.wrong.length} · ${r.issues.join(" / ")}`,
    );
  }

  // ── C. 복수 정답 — 라벨별 장식이 뒤 라벨을 삼키는가 ──────────────────────
  // 실측: `정답: **②**, **④**` 는 종전에 ② 만 읽혀 "정답 1개(2개 필요)" 라는
  // 거짓 원인이 나갔다(값 안쪽 장식이 뒤 라벨을 통째로 먹는다).
  for (const [dname, line] of [
    ["값 전체 **", "정답: **②, ④**"],
    ["각 라벨 **", "정답: **②**, **④**"],
    ["각 라벨 __", "정답: __②__, __④__"],
    ["각 라벨 _", "정답: _②_, _④_"],
    ["헤더+값 **", "**정답:** **②, ④**"],
    ["헤더+각 라벨 **", "**정답:** **②**, **④**"],
    ["헤더+각 라벨 __", "__정답:__ __②__, __④__"],
    ["값 전체 _", "정답: _②, ④_"],
    ["전각콜론+각 라벨", "**정답：** **②**, **④**"],
  ] as Array<[string, string]>) {
    const r = run(MULTI.replace("정답: ②, ④", line), {
      optionCount: 6,
      answerCount: 2,
    });
    check(
      `장식 전수 [복수정답] ${dname}`,
      r.q.answers.join(",") === "②,④" && r.issues.length === 0,
      `answers=${JSON.stringify(r.q.answers)} · ${r.issues.join(" / ")}`,
    );
  }

  // ── D. 섹션 분할 lookahead — 종료선이 일부 키워드만 알면 블록이 붕괴한다 ──
  // 해설 뒤에 `정답:`·`밑줄:` 이 오는 순서 드리프트에서 그 줄이 해설 본문에
  // 삼켜져 학생 표면에 형식 원문이 노출됐다(게이트는 클린이라 아무도 못 잡는다).
  {
    const lines = GOOD.split("\n");
    const [ans] = lines.splice(lines.indexOf("정답: ③"), 1);
    lines.splice(lines.findIndex((l) => l.startsWith("해설:")) + 1, 0, ans);
    const r = run(lines.join("\n"));
    check(
      "섹션 종료선: 해설 뒤 `정답:` 줄이 해설에 삼켜지지 않는다",
      r.q.answers.join(",") === "③" &&
        !r.q.explanation.includes("정답:") &&
        r.issues.length === 0,
      `expl말미=${JSON.stringify(r.q.explanation.slice(-16))} · ${r.issues.join(" / ")}`,
    );
  }
  {
    const md = GOOD.replace(`${UL}\n`, "").replace("오답:", `${UL}\n오답:`);
    const r = run(md);
    check(
      "섹션 종료선: 해설 뒤 `밑줄:` 줄이 해설에 삼켜지지 않는다",
      r.q.word === TARGET &&
        !r.q.explanation.includes("밑줄:") &&
        r.issues.length === 0,
      `expl말미=${JSON.stringify(r.q.explanation.slice(-16))} · ${r.issues.join(" / ")}`,
    );
  }
  {
    // 오답 섹션이 없는 answer-only 형상에서도 해설이 끝까지 살아야 한다(폴백 경로).
    const md = GOOD.split("\n오답:")[0];
    const r = run(md);
    check(
      "섹션 종료선: 오답 섹션이 없으면 해설이 문서 끝까지(폴백 유지)",
      r.q.explanation.endsWith("쓰였습니다.") && r.q.answers.join(",") === "③",
      `expl말미=${JSON.stringify(r.q.explanation.slice(-16))}`,
    );
  }

  // ── E. 다단어 표적의 **가운데** 장식 ────────────────────────────────────
  // 양끝만 보는 절단은 구 표적에서 새 나간다 — `**set out** to change` 가
  // `set out** to change` 로 확정돼 "지문에 축자로 없음" 거짓 원인이 나갔다.
  const PHRASE = "set out to change";
  for (const [dname, v] of [
    ["앞 두 단어만 굵게", `**set out** to change`],
    ["가운데 한 단어 기울임", `set _out_ to change`],
    ["앞 두 단어 백틱", `\`set out\` to change`],
    ["구 전체 __", `__${PHRASE}__`],
    ["구 전체 ***", `***${PHRASE}***`],
  ] as Array<[string, string]>) {
    const r = run(GOOD.replace(UL, `밑줄: ${v}`));
    check(
      `장식 전수 [다단어 표적] ${dname}`,
      r.q.word === PHRASE && r.issues.length === 0,
      `word=${JSON.stringify(r.q.word)} · ${r.issues.join(" / ")}`,
    );
  }

  // ── F. 여러 줄 해설(헤더만 있는 줄 + 다음 줄부터 본문) ──────────────────
  for (const [dname, head] of [
    ["평문", "해설:"],
    ["굵게 머리", "**해설:**"],
    ["헤딩+굵게", "## **해설:**"],
    ["언더스코어(_)", "_해설:_"],
  ] as Array<[string, string]>) {
    const r = run(GOOD.replace("해설: 이 글은", `${head}\n이 글은`));
    check(
      `장식 전수 [여러 줄 해설] ${dname}`,
      r.q.explanation.startsWith("이 글은") &&
        !MD_RESIDUE.test(r.q.explanation) &&
        r.issues.length === 0,
      `expl=${JSON.stringify(r.q.explanation.slice(0, 20))} · ${r.issues.join(" / ")}`,
    );
  }

  // ── G. CRLF — 섹션 경계가 `\r` 과 `\n` 사이에 떨어지는 실측 함정 ─────────
  // JS 정규식 `m` 플래그의 `^` 는 `\r` 뒤에서도 성립한다. 그래서 구역 마지막 줄에
  // `\r` 이 남고 `(.+)$` 가 그 줄을 못 읽어 **`정답:` 바로 앞 선지 한 줄만** 사라진다
  // → "선지 4개 (5개 필요)" 라는 사실과 다른 원인(모델은 5개를 다 썼다).
  {
    const r = run(GOOD.replace(/\n/g, "\r\n"));
    check(
      "CRLF: 전 필드 생존(선지 5 · 정답 · 해설 · 오답 4)",
      r.q.options.length === 5 &&
        r.q.answers.join(",") === "③" &&
        r.q.wrong.length === 4 &&
        r.q.word === TARGET &&
        r.issues.length === 0,
      `opts=${r.q.options.length} ans=${r.q.answers} wrong=${r.q.wrong.length} · ${r.issues.join(" / ")}`,
    );
    const r2 = run(
      GOOD.replace(/\n/g, "\r\n")
        .replace("정답: ③", "**정답:** **③**")
        .replace("해설: 이 글은", "**해설:** **이 글은"),
    );
    check(
      "CRLF + 쌍장식 동시(두 계통 교차)",
      r2.q.options.length === 5 &&
        r2.q.answers.join(",") === "③" &&
        r2.q.explanation.startsWith("이 글은") &&
        r2.issues.length === 0,
      `opts=${r2.q.options.length} ans=${JSON.stringify(r2.q.answers)} · ${r2.issues.join(" / ")}`,
    );
  }

  // ── H. 해설 본문의 짝 맞는 강조는 학생 표면에 남지 않는다 ────────────────
  for (const [dname, s] of [
    ["**단어**", "해설: 이 글에서 **cheap** 은 값이 아니라"],
    ["`단어`", "해설: 이 글에서 `cheap` 은 값이 아니라"],
    ["__단어__", "해설: 이 글에서 __cheap__ 은 값이 아니라"],
  ] as Array<[string, string]>) {
    const r = run(GOOD.replace("해설: 이 글은", `${s} 이 글은`));
    check(
      `해설 본문 강조 제거: ${dname}`,
      !MD_RESIDUE.test(r.q.explanation),
      `expl=${JSON.stringify(r.q.explanation.slice(0, 36))}`,
    );
  }

  // ── I. 게이트 이중 방어 — 파서가 벗길 수 없는 **본문 한가운데** 잔재 ──────
  for (const [dname, line] of [
    ["별표 한 개", "① low in * price"],
    ["언더스코어 한 개", "① low in _ price"],
    ["백틱 한 개", "① low in ` price"],
  ] as Array<[string, string]>) {
    check(
      `게이트 이중 방어(선지 장식 잔재): ${dname}`,
      run(GOOD.replace("① low in price", line)).issues.some((i) =>
        i.includes("마크다운 장식이 남음"),
      ),
      run(GOOD.replace("① low in price", line)).issues.join(" / "),
    );
  }
  // ── I-2. 문서 **전체 도배** — 모델은 한 줄만 꾸미지 않는다 ────────────────
  // 실사용 습관은 "굵게 쓰기로 했으면 네 키워드 줄과 라벨 줄을 전부 굵게" 다.
  // 한 줄씩만 통과시키는 관용은 이 교차에서 무너진다 — 곱셈으로 고정한다.
  const KEY_STYLES: Array<[string, (s: string) => string]> = [
    ["전 키워드 **머리+값**", (s) => s.replace(/^(밑줄|정답|해설|오답)(:.*)?$/gm, (_m, k: string, rest: string) => (rest ? `**${k}:** **${rest.slice(2)}**` : `**${k}:**`))],
    ["전 키워드 __", (s) => s.replace(/^(밑줄|정답|해설|오답)(:.*)?$/gm, (_m, k: string, rest: string) => (rest ? `__${k}:__ __${rest.slice(2)}__` : `__${k}:__`))],
    ["전 키워드 _", (s) => s.replace(/^(밑줄|정답|해설|오답)(:.*)?$/gm, (_m, k: string, rest: string) => (rest ? `_${k}:_ _${rest.slice(2)}_` : `_${k}:_`))],
    ["전 키워드 헤딩+굵게+전각", (s) => s.replace(/^(밑줄|정답|해설|오답)(:.*)?$/gm, (_m, k: string, rest: string) => (rest ? `## **${k}：** ${rest.slice(2)}` : `## **${k}：**`))],
  ];
  const LABEL_STYLES: Array<[string, (s: string) => string]> = [
    ["전 라벨줄 굵게", (s) => s.replace(/^([①-⑤]) (.+)$/gm, "**$1** **$2**")],
    ["전 라벨줄 _", (s) => s.replace(/^([①-⑤]) (.+)$/gm, "_$1_ _$2_")],
    ["전 라벨줄 불릿+굵게", (s) => s.replace(/^([①-⑤]) (.+)$/gm, "- **$1 $2**")],
  ];
  const wholeOk = (r: ReturnType<typeof run>) =>
    r.q.word === TARGET &&
    r.q.options.length === 5 &&
    r.q.options[2].text === ANSWER_TEXT &&
    r.q.answers.join(",") === "③" &&
    r.q.explanation.length > 20 &&
    !MD_RESIDUE.test(r.q.explanation) &&
    r.q.wrong.length === 4 &&
    r.issues.length === 0;
  const wholeDetail = (r: ReturnType<typeof run>) =>
    `w=${JSON.stringify(r.q.word)} o=${r.q.options.length} a=${r.q.answers} wr=${r.q.wrong.length} · ${r.issues.join(" / ")}`;
  for (const [kn, kf] of KEY_STYLES) {
    const r = run(kf(GOOD));
    check(`문서 도배: ${kn}`, wholeOk(r), wholeDetail(r));
    for (const [ln, lf] of LABEL_STYLES) {
      const rx = run(lf(kf(GOOD)));
      check(`문서 도배 교차: ${kn} × ${ln}`, wholeOk(rx), wholeDetail(rx));
    }
  }
  for (const [ln, lf] of LABEL_STYLES) {
    const r = run(lf(GOOD));
    check(`문서 도배: ${ln}`, wholeOk(r), wholeDetail(r));
  }

  // ── J. 과잉 차단 감시 — 정상 문항을 반려시키는 게이트는 결함보다 나쁘다 ───
  // 장식 관용을 넓히고 게이트 잔재 검사를 `_` 까지 늘렸으므로, 정상 표기가 물리지
  // 않는지 반대 방향으로 못을 박는다.
  for (const [dname, md] of [
    ["정상 문항", GOOD],
    ["하이픈 포함 선지", GOOD.replace("① low in price", "① low-cost and easy")],
    ["아포스트로피 선지", GOOD.replace("② poorly made", "② the buyer's sense")],
    ["쉼표 포함 해설", GOOD.replace("해설: 이 글은", "해설: 이 글은, 특히")],
    ["해설의 원문자 지칭", GOOD.replace("① 대표뜻 —", "① 대표뜻 ③과 견주면 —")],
    ["해설 안 영어 인용", GOOD.replace("해설: 이 글은", "해설: cheap 은 이 글은")],
    ["표적이 다단어 구", GOOD.replace(UL, `밑줄: ${PHRASE}`)],
  ] as Array<[string, string]>) {
    const r = run(md);
    check(`오반려 방지: ${dname}`, r.issues.length === 0, r.issues.join(" / "));
  }
}
