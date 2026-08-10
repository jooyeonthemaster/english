// 문장 삽입(SENTENCE_INSERT) 적대검수 **2차 라운드** 회귀 픽스처.
// _test-md-sentence-insert.ts 가 import 해서 같은 카운터로 돌린다(파일 500줄 규약).
// 각 항목은 2차 지적서의 수리 전 실측 실패를 그대로 재현한다.
//
//  R2-1 [silent-drop 잔존] `정답:` 줄만 머리표 장식과 값 장식을 **동시에** 쓰면 값 토큰에
//       관용이 하나도 남지 않아 정답이 통째로 사라졌다(`**정답:** **②**` → answer='' →
//       게이트 '정답 누락'). 같은 파일의 `삽입문장:`·`해설:` 은 값이 `(.+)$` + 강조 제거라
//       같은 복합형을 전부 흡수하고 있었다 — 파일 내부 관용 **비대칭**이 1차 수리 후에도
//       그대로 남은 자리다. 장식 전수 감사에서 언더스코어(`__정답:__`)가 **전 키워드 줄**을
//       뚫고, 헤딩 오답 줄(`### ① …`)·따옴표 값(`정답: "②"`)도 같은 계통으로 드러났다.
//  R2-2 [1차 수리가 낳은 신규 거짓 반려] 마커 공백 주입 가드가 '양옆 모두 낱말 문자'만
//       예외로 둬서, 낱말 뒤 + 구두점 앞 마커(`…establish[[3]].`)에 유령 공백이 생기고
//       재구성이 깨져 '지문 재구성 불일치'(= 지문을 고쳐 썼다는 거짓 원인)로 하드 반려됐다.
//       수리 전에는 클린이었거나 '문장 경계가 아님'이라는 참 진단이 나오던 자리다.
import {
  autoSnapInsertGiven,
  parseMdSentenceInsert,
  stripInsertMarks,
} from "../src/lib/md-qgen/parser-sentence-insert";
import { gateMdSentenceInsert } from "../src/lib/md-qgen/gate-sentence-insert";

const S = [
  "Urban planners once treated street trees as ornament, a pleasant afterthought bolted onto finished road designs.",
  "Field measurements have since shown that a mature canopy holds pavement temperatures several degrees below an open street.",
  "But this cooling comes at a cost that few municipal budgets ever name.",
  "That expense surfaces in pruning contracts, sidewalk repairs, and the slow work of replacing roots that lift concrete.",
  "Cities that ignore those bills end up removing the very canopy they paid to establish.",
  "Planting programs therefore succeed only when a city's maintenance money is committed for decades, not seasons.",
  "The lesson is that shade is infrastructure, and infrastructure has to be maintained.",
  "Some cities now fund canopy care through stormwater fees, treating leaves as drainage equipment.",
  "Others fold the same costs into transportation budgets, where pavement life is already tracked.",
  "Either route works, provided the money outlasts the mayor who announced it.",
];
const PASSAGE = S.join(" ");
const GIVEN = S[2];
const DISPLAY = S.filter((_, i) => i !== 2);
const NUMBERED = DISPLAY.map((sentence, i) => {
  const slot = [0, 1, 3, 5, 7].indexOf(i);
  return slot >= 0 ? `${sentence} [[${slot + 1}]]` : sentence;
}).join(" ");
const EXPL =
  "앞 문장이 그늘의 냉각 효과를 처음 진술하므로 그 뒤에서만 되받는 지시어가 해소됩니다. 바로 뒤 문장이 가리키는 비용도 이 문장이 도입한 대가를 받습니다.";
const WRONG = ["①", "③", "④", "⑤"]
  .map((l) => `${l} 이 자리는 앞 문장이 아직 냉각 효과를 말하지 않아 되받을 대상이 없습니다.`)
  .join("\n");
const GOOD = [
  `삽입문장: ${GIVEN}`,
  "번호지문:",
  NUMBERED,
  "",
  "정답: ②",
  `해설: ${EXPL}`,
  "오답:",
  WRONG,
].join("\n");

const gateOf = (text: string, passage = PASSAGE): string[] =>
  gateMdSentenceInsert(
    autoSnapInsertGiven(parseMdSentenceInsert(text), passage).question,
    passage,
    { slotCount: 5 },
  );
/** `.replace` 오타로 픽스처가 **무변경 원본**이 되어 시험이 헛도는 사고를 막는다. */
const mutated = (before: string, after: string): string => {
  if (before === after) throw new Error("픽스처 치환 실패 — 대상 문자열이 바뀌지 않았다");
  return after;
};

type Check = (name: string, ok: boolean, detail?: string) => void;

export function runWave2Round2Fixtures(check: Check): void {
  // ── 8-6 (R2-1) 키워드 줄 장식 — 파싱 성공 + 게이트 클린이어야 한다 ──────────
  const underscoreAll = mutated(
    GOOD,
    GOOD.replace("삽입문장:", "__삽입문장:__")
      .replace("번호지문:", "__번호지문:__")
      .replace("정답: ②", "__정답:__ __②__")
      .replace("해설:", "__해설:__")
      .replace("오답:", "__오답:__"),
  );
  const boldAll = mutated(
    GOOD,
    GOOD.replace(`삽입문장: ${GIVEN}`, `**삽입문장:** **${GIVEN}**`)
      .replace("번호지문:", "**번호지문:**")
      .replace("정답: ②", "**정답:** **②**")
      .replace(`해설: ${EXPL}`, `**해설:** **${EXPL}**`)
      .replace("오답:", "**오답:**")
      .replace(/^(①|③|④|⑤) (.+)$/gm, "**$1** **$2**"),
  );
  const explFirst = mutated(
    GOOD,
    GOOD.replace(`정답: ②\n해설: ${EXPL}`, `**해설:** ${EXPL}\n**정답:** **②**`),
  );
  const R2_DRIFTS: [string, string][] = [
    ["정답 머리표+값 동시 굵게 `**정답:** **②**`", GOOD.replace("정답: ②", "**정답:** **②**")],
    ["정답 머리표+값 굵게 + 전각콜론", GOOD.replace("정답: ②", "**정답：** **②**")],
    ["정답 불릿 + 머리표·값 동시 굵게", GOOD.replace("정답: ②", "- **정답:** **②**")],
    ["정답 3중 쌍장식 `***정답:*** ***②***`", GOOD.replace("정답: ②", "***정답:*** ***②***")],
    ["정답 머리표 굵게 + 값 기울임 `**정답:** *②*`", GOOD.replace("정답: ②", "**정답:** *②*")],
    ["정답 콜론 **앞** 장식 `**정답**: ②`", GOOD.replace("정답: ②", "**정답**: ②")],
    ["정답 값 따옴표 `정답: \"②\"`", GOOD.replace("정답: ②", '정답: "②"')],
    ["정답 헤딩 + 머리표·값 굵게", GOOD.replace("정답: ②", "## **정답:** **②**")],
    ["정답 인용 + 머리표·값 굵게", GOOD.replace("정답: ②", "> **정답:** **②**")],
    ["언더스코어 `__정답:__`(1줄)", GOOD.replace("정답: ②", "__정답:__ ②")],
    ["언더스코어 1겹 `_정답:_`(1줄)", GOOD.replace("정답: ②", "_정답:_ ②")],
    ["언더스코어 머리표 — 전 키워드 줄", underscoreAll],
    ["머리표·값 동시 굵게 — 전 키워드 줄(오답 항목 포함)", boldAll],
    ["섹션 순서 드리프트: 해설이 정답보다 먼저 + 전면 굵게", explFirst],
    ["오답 라벨 언더스코어 `__①__`", GOOD.replace("\n① 이 자리는", "\n__①__ 이 자리는")],
    ["오답 라벨 언더스코어 1겹 `_③_`", GOOD.replace("\n③ 이 자리는", "\n_③_ 이 자리는")],
    ["오답 라벨 인용 `> ④`", GOOD.replace("\n④ 이 자리는", "\n> ④ 이 자리는")],
    ["오답 라벨 헤딩 `### ⑤`", GOOD.replace("\n⑤ 이 자리는", "\n### ⑤ 이 자리는")],
    ["오답 라벨 인용+불릿+굵게 `> - **①**`", GOOD.replace("\n① 이 자리는", "\n> - **①** 이 자리는")],
    ["삽입문장 값 언더스코어 `__값__`", GOOD.replace(`삽입문장: ${GIVEN}`, `삽입문장: __${GIVEN}__`)],
  ];
  for (const [name, drifted] of R2_DRIFTS) {
    const q = parseMdSentenceInsert(mutated(GOOD, drifted));
    const issues = gateOf(drifted);
    check(
      `★ 회귀(R2-1) 장식 관용: ${name}`,
      q.answer === "②" && q.wrong.length === 4 && issues.length === 0,
      `정답='${q.answer}' 오답 ${q.wrong.length}개 · ${issues.join(" / ") || "(클린)"}`,
    );
  }
  // 과잉 관용 방지 — 넓힌 머리표가 산문 줄을 오답으로 삼키면 안 된다.
  check(
    "회귀(R2-1) 과잉 관용 방지: 라벨 없는 헤딩·인용 산문 줄은 오답이 아니다",
    parseMdSentenceInsert(GOOD.replace("오답:\n", "오답:\n### 각 자리 분석\n> 아래 참고\n")).wrong
      .length === 4,
  );
  check(
    "회귀(R2-1) 과잉 관용 방지: 지문 무단 편집은 여전히 반려(장식 관용이 방어를 뚫지 않는다)",
    gateOf(boldAll.replace("pruning contracts", "pruning deals")).some((i) =>
      i.includes("지문 재구성 불일치"),
    ),
  );

  // ── 8-7 (R2-2) 마커 공백 주입 가드 — 1차 수리가 낳은 거짓 반려 ──────────────
  const beforeDot = mutated(GOOD, GOOD.replace("establish. [[3]]", "establish[[3]]."));
  const allBeforeDot = mutated(GOOD, GOOD.replace(/\. \[\[(\d)\]\]/g, "[[$1]]."));
  // 다른 마커는 ` [[n]] ` 형태라 제거하면 연속 공백이 남는다 — 판정축은 정본과 같은
  // 공백 정규화 후 비교다. 유령 공백(`establish .`)은 정규화로 접히지 않으므로 잡힌다.
  const cleaned = stripInsertMarks(parseMdSentenceInsert(beforeDot).numberedPassage)
    .replace(/\s+/g, " ")
    .trim();
  check(
    "★ 회귀(R2-2): 낱말 뒤 + 마침표 앞 마커(`establish[[3]].`)에 유령 공백을 넣지 않는다",
    cleaned === DISPLAY.join(" "),
    cleaned.slice(380, 450),
  );
  check(
    "★ 회귀(R2-2): 같은 형상이 게이트 클린(수리 후 '지문 재구성 불일치' 거짓 반려였다)",
    gateOf(beforeDot).length === 0,
    gateOf(beforeDot).join(" / "),
  );
  check(
    "★ 회귀(R2-2): 전 마커를 마침표 앞으로 붙여도 클린",
    gateOf(allBeforeDot).length === 0,
    gateOf(allBeforeDot).join(" / "),
  );
  // 문장 한복판(낱말 뒤 + 쉼표·아포스트로피 앞)은 **참 진단**인 '문장 경계가 아님'이
  // 나와야 한다 — 1차 수리 후에는 이것마저 '지문 재구성 불일치' 오진으로 바뀌었다.
  for (const [name, numbered] of [
    ["쉼표 앞 `contracts[[3]],`", NUMBERED.replace(" [[3]]", "").replace("pruning contracts,", "pruning contracts[[3]],")],
    ["아포스트로피 앞 `city[[3]]'s`", NUMBERED.replace(" [[3]]", "").replace("a city's", "a city[[3]]'s")],
  ] as [string, string][]) {
    const issues = gateOf(mutated(GOOD, GOOD.replace(NUMBERED, numbered)));
    check(
      `★ 회귀(R2-2): 문장 한복판 마커는 참 진단('문장 경계가 아님') — ${name}`,
      issues.some((i) => i.includes("문장 경계가 아님")) &&
        !issues.some((i) => i.includes("지문 재구성 불일치")),
      issues.join(" / ") || "(클린)",
    );
  }
  // 1차 수리가 지켰던 축(문장 경계에 붙여 쓴 마커)은 그대로 유지된다.
  check(
    "회귀(R2-2): 문장 경계 글루(`designs.[[1]]Field`)는 계속 흡수",
    gateOf(mutated(GOOD, GOOD.replace(" [[1]] ", "[[1]]"))).length === 0,
    gateOf(GOOD.replace(" [[1]] ", "[[1]]")).join(" / "),
  );
  check(
    "회귀(R2-2): 단어 한복판 마커는 여전히 '문장 경계가 아님'(과잉 관용 방지)",
    gateOf(
      mutated(GOOD, GOOD.replace(NUMBERED, NUMBERED.replace(" [[3]] ", " ").replace("pruning", "prun[[3]]ing"))),
    ).some((i) => i.includes("문장 경계가 아님")),
  );
}
