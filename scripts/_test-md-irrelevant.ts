// 무관한 문장(IRRELEVANT) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → processIrrelevant 왕복 → 품질 검증기 → 레인 계약.
// 실행: npx tsx scripts/_test-md-irrelevant.ts
//
// 형식 계약(삽입 모델): 번호지문 = "원 지문 전체(축자) + 무관 문장 1개가 두 원문
// 문장 사이에 끼워진 것". 정답의 유일 진실원은 `정답:` 줄이고, 마커에는 O/X 도
// `원문:` 줄도 두지 않는다(철칙 1·2). 최강 게이트는
// "무관 문장을 들어내고 마커를 걷어낸 재구성본 == 원 지문".
import { existsSync, readFileSync } from "node:fs";
import {
  autoSnapIrrelevantSlots,
  collectIrrelevantMarks,
  normalizeIrrelevantLabel,
  parseMdIrrelevant,
  reconstructIrrelevantPassage,
  stripIrrelevantMarks,
} from "../src/lib/md-qgen/parser-irrelevant";
import { gateMdIrrelevant, irrelevantGateAdvisories, METHODOLOGY_DRIFT_PATTERNS } from "../src/lib/md-qgen/gate-irrelevant";
import { adaptMdIrrelevantToAiQuestion } from "../src/lib/md-qgen/adapter-irrelevant";
import {
  checkIrrelevantMdPassageFeasibility,
  IRRELEVANT_MD_LANE,
} from "../src/lib/md-qgen/lane-irrelevant";
import { buildMdIrrelevantPrompt } from "../src/lib/md-qgen/prompts-irrelevant";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
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
// 픽스처 — 9문장 지문(첫 문장은 도입문이라 번호를 붙이지 않는다).
// 표시 원문 4개는 지문 전체에 분산(인덱스 1·3·4·7), 무관 문장은 인덱스 3 뒤에 삽입.
// ───────────────────────────────────────────────────────────────────────────
const SENTENCES = [
  "Early modern cartographers rarely drew what they could see with their own eyes.",
  "Most of them worked from travelers' reports, merchant ledgers, and older maps that had themselves been copied many times.",
  "A coastline therefore recorded not a survey but a consensus among distant witnesses.",
  "When two accounts disagreed, the mapmaker had to decide which informant carried more authority.",
  "That decision was rarely announced on the finished sheet, so readers inherited a judgment they could not inspect.",
  "Blank interiors were filled with ornament precisely because emptiness invited awkward questions about the limits of the record.",
  "Later surveyors who carried instruments into those interiors often found the inherited outlines badly placed.",
  "Correcting them meant discarding the authority of the very sources that had made the earlier map persuasive.",
  "The history of cartography is thus a history of whose testimony was trusted, not of what the land looked like.",
];
const PASSAGE = SENTENCES.join(" ");

// 무관 문장 — 소재·어휘는 정박(authority · informant · finished sheet · ornament)하되
// 글이 논증하는 측면(누구의 증언을 신뢰했는가)에서 수집가의 세공 평가로 벗어난다.
const INTRUDER =
  "The authority of an informant was often visible in the ornament that surrounded the finished sheet, which collectors prized as a mark of workmanship.";

interface LayoutOptions {
  /** 번호를 붙일 원문 문장 인덱스(오름차순) */
  sources?: number[];
  /** 무관 문장을 어느 원문 문장 뒤에 끼울지 */
  insertAfter?: number;
  /** 번호 시작값 − 1 (라벨 드리프트 재현용) */
  offset?: number;
  intruder?: string;
}

function buildNumbered(opts: LayoutOptions = {}): string {
  const sources = opts.sources ?? [1, 3, 4, 7];
  const insertAfter = opts.insertAfter ?? 3;
  const offset = opts.offset ?? 0;
  const intruder = opts.intruder ?? INTRUDER;
  const out: string[] = [];
  let n = offset;
  for (let i = 0; i < SENTENCES.length; i += 1) {
    if (sources.includes(i)) {
      n += 1;
      out.push(`[[${n}:${SENTENCES[i]}]]`);
    } else {
      out.push(SENTENCES[i]);
    }
    if (i === insertAfter) {
      n += 1;
      out.push(`[[${n}:${intruder}]]`);
    }
  }
  return out.join(" ");
}

const WRONG_TEXT: Record<string, string> = {
  "①": "지도 제작자가 어떤 자료를 바탕으로 작업했는지 밝혀 이후 논의의 전제를 세우는 문장입니다.",
  "②": "증언이 엇갈릴 때 누구의 권위를 택할지 판단해야 했다는 글의 핵심 문제를 도입합니다.",
  "③": "그 판단이 지면에 드러나지 않았다는 결과를 이어받아 앞 문장의 논지를 확장합니다.",
  "④": "그 판단이 지면에 드러나지 않았다는 결과를 이어받아 앞 문장의 논지를 확장합니다.",
  "⑤": "후대의 수정이 기존 권위를 버리는 일이었다는 귀결로 논의를 마무리로 이끕니다.",
};
const EXPLANATION =
  "이 글은 지도의 윤곽선이 누구의 증언을 신뢰했는가의 기록이라는 논지를 일관되게 전개합니다. 장식이 수집가에게 세공의 표시로 평가받았다는 문장은 소재는 같지만 글이 다루는 신뢰와 권위의 논점에서 벗어나 흐름을 끊습니다.";

interface MdOptions extends LayoutOptions {
  numbered?: string;
  head?: string;
  answer?: string;
  answerLine?: string;
  explanation?: string;
  wrongLabels?: string[];
}

function mdOf(opts: MdOptions = {}): string {
  const numbered = opts.numbered ?? buildNumbered(opts);
  const answer = opts.answer ?? "③";
  const wrongLabels =
    opts.wrongLabels ?? ["①", "②", "③", "④", "⑤"].filter((l) => l !== answer);
  const answerLine = opts.answerLine ?? `정답: ${answer}`;
  const wrongBlock = wrongLabels
    .map((label) => `${label} ${WRONG_TEXT[label] ?? "이 문장은 글의 흐름에 필요합니다."}`)
    .join("\n");
  return `${opts.head ?? "번호지문:"}
${numbered}

${answerLine}
해설: ${opts.explanation ?? EXPLANATION}
오답:
${wrongBlock}`;
}

const GOOD = mdOf();

function gateOf(text: string, slotCount = 5, difficulty: "BASIC" | "INTERMEDIATE" | "KILLER" = "KILLER"): string[] {
  const q = autoSnapIrrelevantSlots(parseMdIrrelevant(text), PASSAGE).question;
  return gateMdIrrelevant(q, PASSAGE, { slotCount, difficulty });
}

// 26-08-22 강등 검증용 — 비차단 권고 채널을 같은 입력으로 읽는다(기출 오반려
// 48.7% 실측으로 차단→권고 강등된 검사들의 신계약 단언에 사용).
function advOf(text: string, slotCount = 5, difficulty: "BASIC" | "INTERMEDIATE" | "KILLER" = "KILLER"): string[] {
  const q = autoSnapIrrelevantSlots(parseMdIrrelevant(text), PASSAGE).question;
  return irrelevantGateAdvisories(q, PASSAGE, { slotCount, difficulty });
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdIrrelevant(GOOD);
check("파싱: 번호 문장 5개", parsed.slots.length === 5, `실제 ${parsed.slots.length}`);
check("파싱: 라벨 1~5", parsed.slots.map((s) => s.label).join(",") === "1,2,3,4,5", parsed.slots.map((s) => s.label).join(","));
check("파싱: 정답 '3' (원문자 → 숫자 축)", parsed.answer === "3", parsed.answer);
check("파싱: 무관 문장이 정답 슬롯에 실림", parsed.slots[2].text === INTRUDER, parsed.slots[2].text.slice(0, 50));
check("파싱: 오답해설 4개", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check("파싱: 오답해설 라벨 1,2,4,5", parsed.wrong.map((w) => w.label).join(",") === "1,2,4,5", parsed.wrong.map((w) => w.label).join(","));
check("파싱: 해설 존재", parsed.explanation.length > 20);
check("마커 수집: 5개 · 등장순", collectIrrelevantMarks(parsed.numberedPassage).map((m) => m.label).join(",") === "1,2,3,4,5");
check(
  "★ 재구성: 무관 문장을 들어내면 원 지문과 완전 일치",
  reconstructIrrelevantPassage(parsed.numberedPassage, "3").replace(/\s+/g, " ").trim() === PASSAGE,
);
check(
  "학생 표면 등가: 마커만 걷으면 '지문 + 무관 문장 1개'",
  stripIrrelevantMarks(parsed.numberedPassage).replace(/\s+/g, " ").trim() ===
    [...SENTENCES.slice(0, 4), INTRUDER, ...SENTENCES.slice(4)].join(" "),
);

const snapped = autoSnapIrrelevantSlots(parsed, PASSAGE);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0, snapped.corrections.join(" / "));
check(
  "게이트: 정상 입력 클린(KILLER)",
  gateMdIrrelevant(snapped.question, PASSAGE, { slotCount: 5, difficulty: "KILLER" }).length === 0,
  gateMdIrrelevant(snapped.question, PASSAGE, { slotCount: 5, difficulty: "KILLER" }).join(" / "),
);
for (const d of ["BASIC", "INTERMEDIATE"] as const) {
  check(
    `게이트: 정상 입력 클린(${d})`,
    gateOf(GOOD, 5, d).length === 0,
    gateOf(GOOD, 5, d).join(" / "),
  );
}
check("라벨 정규화: ③ · 3 · (3) · 3번 · [3] → '3'", ["③", "3", "(3)", "3번", "[3]"].every((v) => normalizeIrrelevantLabel(v) === "3"));
check("라벨 정규화: ⑩ → '10' · 빈 값 → ''", normalizeIrrelevantLabel("⑩") === "10" && normalizeIrrelevantLabel("") === "");

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 전종
// ───────────────────────────────────────────────────────────────────────────
check(
  "게이트: 마커 개수 부족 반려",
  gateOf(GOOD.replace(`[[5:${SENTENCES[7]}]]`, SENTENCES[7])).some((i) => i.includes("번호 마커")),
  gateOf(GOOD.replace(`[[5:${SENTENCES[7]}]]`, SENTENCES[7])).join(" / "),
);
check(
  "게이트: 번호지문 누락 반려",
  gateMdIrrelevant({ ...snapped.question, numberedPassage: "" }, PASSAGE, { slotCount: 5 }).join(" ").includes("번호지문 누락"),
);
check(
  "★ 게이트: 마커 밖 지문 무단 편집 반려",
  gateOf(GOOD.replace("A coastline therefore recorded", "A coastline recorded")).some((i) => i.includes("지문 재구성 불일치")),
);
check(
  "★ 게이트: 표시 문장 변형(마커 안 손댐) 반려",
  gateOf(GOOD.replace("merchant ledgers", "merchant records")).some((i) => i.includes("지문 재구성 불일치")),
);
check(
  "★ 게이트: 원문 문장 삭제 반려",
  gateOf(GOOD.replace(` ${SENTENCES[5]}`, "")).some((i) => i.includes("지문 재구성 불일치")),
);
check(
  "게이트: 정답 누락 반려",
  gateOf(GOOD.replace("정답: ③\n", "")).some((i) => i.includes("정답 누락")),
);
check(
  "게이트: 정답 번호가 슬롯 밖이면 반려",
  gateOf(GOOD.replace("정답: ③", "정답: ⑨")).some((i) => i.includes("정답 번호(9)")),
);
for (const [label, name] of [["①", "첫"], ["⑤", "마지막"]] as const) {
  const shifted = mdOf({ answer: label });
  check(
    `게이트: 정답이 ${name} 번호면 비차단 권고(26-08-22 기출 ①⑤ 실존 각 0.6%로 강등)`,
    advOf(shifted).some((i) => i.includes("첫/마지막 번호")) &&
      !gateOf(shifted).some((i) => i.includes("첫/마지막 번호")),
    [...advOf(shifted), "|차단:", ...gateOf(shifted)].join(" / "),
  );
}
check(
  "게이트: 번호가 등장순 1~5 가 아니면 반려",
  gateMdIrrelevant(
    { ...snapped.question, slots: [...snapped.question.slots].reverse() },
    PASSAGE,
    { slotCount: 5 },
  ).some((i) => i.includes("지문 등장순")),
);
{
  // 지문 첫 문장(도입문)을 번호로 감싸면 반려 — 프로덕션 irrelevant-source-first-sentence.
  const withFirst = mdOf({ sources: [0, 1, 3, 7], insertAfter: 3, answer: "④" });
  check(
    "게이트: 지문 첫 문장 표시 반려",
    gateOf(withFirst).some((i) => i.includes("지문 첫 문장")),
    gateOf(withFirst).join(" / "),
  );
}
{
  // 슬롯 융합 — 두 원문 문장을 한 마커에 이어붙임(재구성은 통과, 형식만 깨짐).
  const fused = GOOD.replace(
    `[[1:${SENTENCES[1]}]] ${SENTENCES[2]}`,
    `[[1:${SENTENCES[1]} ${SENTENCES[2]}]]`,
  );
  check(
    "게이트: 슬롯 융합(두 문장 이어붙임) 반려",
    gateOf(fused).some((i) => i.includes("문장 하나가 아님")),
    gateOf(fused).join(" / "),
  );
}
{
  // 인접 앵커 위반 — 무관 문장 바로 앞 문장에 번호가 없다(후처리가 다른 자리에 끼운다).
  const detached = mdOf({ sources: [1, 3, 4, 7], insertAfter: 5, answer: "④" });
  check(
    "★ 게이트: 무관 문장 앞 문장에 번호가 없으면 반려(설계↔렌더 어긋남 차단)",
    gateOf(detached).some((i) => i.includes("바로 앞 문장에 번호가 없음")),
    gateOf(detached).join(" / "),
  );
}
{
  // 분산 위반 — 표시 문장을 전부 앞쪽에서 고름.
  const front = mdOf({ sources: [1, 2, 3, 4], insertAfter: 3, answer: "④" });
  check(
    "게이트: 표시 문장이 앞쪽에 몰리면 반려",
    gateOf(front).some((i) => i.includes("앞쪽에 몰려")),
    gateOf(front).join(" / "),
  );
}
check(
  "게이트: 오답해설 개수 부족 반려",
  gateOf(mdOf({ wrongLabels: ["①", "②", "④"] })).some((i) => i.includes("오답해설")),
);
check(
  "게이트: 빠진 오답 번호를 지목",
  gateOf(mdOf({ wrongLabels: ["①", "②", "④"] })).some((i) => i.includes("오답해설이 없는 번호: 5")),
  gateOf(mdOf({ wrongLabels: ["①", "②", "④"] })).join(" / "),
);
check(
  "게이트: 오답해설에 정답 번호 포함 반려",
  gateMdIrrelevant(
    { ...snapped.question, wrong: [...snapped.question.wrong, { label: "3", text: "정답인데 끼어듦" }] },
    PASSAGE,
    { slotCount: 5 },
  ).some((i) => i.includes("정답 번호 포함")),
);
check(
  "게이트: 해설 누락 반려",
  gateMdIrrelevant({ ...snapped.question, explanation: "" }, PASSAGE, { slotCount: 5 }).some((i) => i.includes("해설 누락")),
);
check(
  "게이트: 해설이 문장을 번호로 지칭하면 반려(실측 최다 결함)",
  gateOf(mdOf({ explanation: "무관한 문장은 ②번 문장입니다. 앞뒤 흐름과 어긋납니다." })).some((i) => i.includes("번호(①②③)로 지칭")),
);
check(
  "게이트: 오답해설이 번호로 지칭하면 반려",
  gateMdIrrelevant(
    { ...snapped.question, wrong: snapped.question.wrong.map((w, i) => (i === 0 ? { ...w, text: "①번 문장은 도입 역할입니다." } : w)) },
    PASSAGE,
    { slotCount: 5 },
  ).some((i) => i.includes("번호(①②③)로 지칭")),
);
check(
  "게이트: 삽입 문장이 지문 원문이면 반려(신규성)",
  gateOf(mdOf({ intruder: SENTENCES[6] })).some((i) => i.includes("지문에 이미 있는 문장")),
  gateOf(mdOf({ intruder: SENTENCES[6] })).join(" / "),
);
check(
  "게이트: 삽입 문장이 역접어로 시작하면 비차단 권고(26-08-22 기출 3/154 실존으로 강등, 난이도 무관)",
  advOf(mdOf({ intruder: `However, ${INTRUDER.slice(4)}` }), 5, "BASIC").some((i) => i.includes("역접 연결어로 시작")) &&
    !gateOf(mdOf({ intruder: `However, ${INTRUDER.slice(4)}` }), 5, "BASIC").some((i) => i.includes("역접 연결어로 시작")),
);
check(
  "게이트: 삽입 문장이 지문과 내용어를 안 나누면 비차단 권고(26-08-22 기출 관측 최소 0으로 강등)",
  advOf(
    mdOf({ intruder: "Baroque violin makers seasoned their spruce for decades before carving any belly plate." }),
  ).some((i) => i.includes("내용어를 거의 공유하지 않음")) &&
  !gateOf(
    mdOf({ intruder: "Baroque violin makers seasoned their spruce for decades before carving any belly plate." }),
  ).some((i) => i.includes("내용어를 거의 공유하지 않음")),
  gateOf(mdOf({ intruder: "Baroque violin makers seasoned their spruce for decades before carving any belly plate." })).join(" / "),
);
check(
  "게이트: 삽입 문장 길이가 튀면 반려",
  gateOf(mdOf({ intruder: "The informant kept authority." })).some((i) => i.includes("길이가 주변 문장과 어긋남")),
  gateOf(mdOf({ intruder: "The informant kept authority." })).join(" / "),
);

// KILLER 전용 노출 단서 — 프로덕션 검증기와 동일 조건(BASIC 에서는 침묵).
const KILLER_TELLS: [string, string, string][] = [
  [
    "극단어",
    "The authority of an informant always guarantees the ornament that surrounded the finished sheet for collectors.",
    "극단어",
  ],
  [
    "처방·조언 단서",
    "To maximize the authority of an informant, the ornament around a finished sheet had to please collectors.",
    "처방·조언",
  ],
  [
    "방법론 드리프트",
    "To measure the authority of an informant, the procedure requires comparing the ornament on each finished sheet.",
    "방법론·측정·도구",
  ],
  [
    "새 무대 수입",
    "Modern software now records the authority of an informant beside the ornament of each finished sheet for collectors.",
    "새 무대·소재",
  ],
  [
    "조언문 어투",
    "Researchers should weigh the authority of an informant against the ornament that surrounded each finished sheet.",
    "조언문",
  ],
];
for (const [name, intruder, needle] of KILLER_TELLS) {
  const md = mdOf({ intruder });
  check(
    `게이트(KILLER): ${name} 는 비차단 권고(26-08-22 수능 본시험 실존 단서로 강등)`,
    advOf(md, 5, "KILLER").some((i) => i.includes(needle)) &&
      !gateOf(md, 5, "KILLER").some((i) => i.includes(needle)),
    [...advOf(md, 5, "KILLER"), "|차단:", ...gateOf(md, 5, "KILLER")].join(" / "),
  );
  check(
    `게이트(BASIC): ${name} 는 KILLER 전용이라 권고도 침묵(프로덕션 검증기와 동일 조건)`,
    !advOf(md, 5, "BASIC").some((i) => i.includes(needle)),
    advOf(md, 5, "BASIC").join(" / "),
  );
}
{
  // 【임계 완화 26-07-27 · 감독】 종전 임계(표시문장 겹침 2개 · 비율 0.25)는 실사용에서
  // 도달 불가였다 — 모델 산출 0.04·0.13 이 두 번 다 반려돼 문항이 죽었다. 무관 문장은
  // 정의상 주변과 소재만 공유하므로 어휘 겹침이 본질적으로 낮다. 이제 겹침 1개·비율
  // 0.10 만 요구한다. 아래 두 검사가 그 새 경계를 양쪽에서 고정한다.
  const alien =
    "Tidal turbines anchored offshore convert predictable lunar currents into baseload electricity for coastal grids.";
  check(
    "게이트(KILLER): 지문과 어휘가 정말 겹치지 않아도 비차단 권고(26-08-22 기출 ratio min 0.00으로 강등)",
    advOf(mdOf({ intruder: alien }), 5, "KILLER").some(
      (i) => i.includes("새 어휘가 너무 많음") || i.includes("내용어를 거의 공유하지 않음"),
    ) &&
      !gateOf(mdOf({ intruder: alien }), 5, "KILLER").some(
        (i) => i.includes("새 어휘가 너무 많음") || i.includes("내용어를 거의 공유하지 않음"),
      ),
    advOf(mdOf({ intruder: alien }), 5, "KILLER").join(" / "),
  );
  const anchored =
    "The informant carried a rumour about lacquered cabinets, silk banners, porcelain jars, brass hinges and lantern glass.";
  check(
    "게이트(KILLER): 소재를 빌려 온 정상 무관 문장은 과잉 반려하지 않는다",
    !gateOf(mdOf({ intruder: anchored }), 5, "KILLER").some(
      (i) => i.includes("새 어휘가 너무 많음") || i.includes("내용어를 거의 공유하지 않음"),
    ),
    gateOf(mdOf({ intruder: anchored }), 5, "KILLER").join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. 드리프트 관용 — 전부 5슬롯 + 게이트 클린이어야 한다.
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string][] = [
  ["정답 숫자 표기", mdOf({ answerLine: "정답: 3" })],
  ["정답 괄호 표기", mdOf({ answerLine: "정답: (3)" })],
  ["정답 '③번 문장' 표기", mdOf({ answerLine: "정답: ③번 문장" })],
  ["정답 뒤 사족", mdOf({ answerLine: "정답: ③ (수집가 평가로 새는 문장)" })],
  ["전각 콜론 머리표", mdOf({ head: "번호지문：" })],
  ["머리표 뒤 같은 줄 시작", `번호지문: ${buildNumbered()}\n\n정답: ③\n해설: ${EXPLANATION}\n오답:\n① ${WRONG_TEXT["①"]}\n② ${WRONG_TEXT["②"]}\n④ ${WRONG_TEXT["④"]}\n⑤ ${WRONG_TEXT["⑤"]}`],
  ["머리표 통째 누락", `${buildNumbered()}\n\n정답: ③\n해설: ${EXPLANATION}\n오답:\n① ${WRONG_TEXT["①"]}\n② ${WRONG_TEXT["②"]}\n④ ${WRONG_TEXT["④"]}\n⑤ ${WRONG_TEXT["⑤"]}`],
  ["마커 내부 공백", GOOD.replace("[[3:", "[[ 3 : ")],
  ["오답 숫자 라벨", GOOD.replace("① 지도", "1. 지도")],
  ["오답 불릿 접두", GOOD.replace("② 증언", "- ② 증언")],
  ["오답 별표 불릿", GOOD.replace("② 증언", "* ② 증언")],
  ["오답 굵게 라벨", GOOD.replace("④ 그 판단", "**④** 그 판단")],
  ["오답 표 형식 행", GOOD.replace("⑤ 후대", "| ⑤ | 후대")],
  ["오답 괄호 라벨", GOOD.replace("⑤ 후대", "(5) 후대")],
  ["곱슬따옴표 드리프트", GOOD.replace("travelers'", "travelers’")],
  ["엠대시 드리프트", GOOD.replace("not a survey but", "not a survey — but").replace("not a survey — but", "not a survey but")],
  ["번호지문 개행 삽입", GOOD.replace(`]] ${SENTENCES[2]}`, `]]\n${SENTENCES[2]}`)],
  [
    "마커 밖 종결 부호(고아 마침표)",
    GOOD.replace(`[[3:${INTRUDER}]]`, `[[3:${INTRUDER.slice(0, -1)}]].`),
  ],
  // ── 키워드 줄 무관용 회귀(wave2 silent-drop 최대 계통 · 규범 §1-B 철칙 3) ──────
  // 선지·데이터 줄만 관대하게 파싱하고 `정답:` `해설:` `오답:` `번호지문:` 을 무관용
  // 정규식으로 잡으면, 모델이 헤더를 꾸미는 순간 그 필드가 통째로 사라지고 게이트는
  // "정답 누락" 같은 **사실과 다른 원인**을 지목한다(그 문구가 곧 재생성 피드백이다).
  // 실측: `**정답:** **해설:** **오답:**` 한 번에 3필드 소실 → 게이트 3건 오지목.
  [
    "키워드 줄 굵게(**정답:** **해설:** **오답:**)",
    GOOD.replace("정답: ③", "**정답:** ③").replace("해설: ", "**해설:** ").replace("오답:", "**오답:**"),
  ],
  [
    "키워드 줄 굵게 — 콜론이 굵게 안쪽(**정답: ③**)",
    GOOD.replace("정답: ③", "**정답: ③**").replace("해설: ", "**해설**: "),
  ],
  [
    "키워드 줄 전각 콜론(정답： 해설： 오답：)",
    GOOD.replace("정답:", "정답：").replace("해설:", "해설：").replace("오답:", "오답："),
  ],
  [
    "키워드 줄 불릿 접두(- 정답:)",
    GOOD.replace("정답: ③", "- 정답: ③").replace("해설: ", "- 해설: ").replace("오답:", "- 오답:"),
  ],
  [
    "키워드 줄 헤딩 접두(## 정답:)",
    GOOD.replace("정답: ③", "## 정답: ③").replace("해설: ", "## 해설: ").replace("오답:", "## 오답:"),
  ],
  [
    "키워드 줄 인용 접두(> 정답:)",
    GOOD.replace("정답: ③", "> 정답: ③").replace("해설: ", "> 해설: ").replace("오답:", "> 오답:"),
  ],
  [
    "키워드 줄 앞 공백 들여쓰기",
    GOOD.replace("정답: ③", "  정답: ③").replace("해설: ", "   해설: ").replace("오답:", "  오답:"),
  ],
  ["번호지문 머리표 굵게(**번호지문:**)", GOOD.replace("번호지문:", "**번호지문:**")],
  ["번호지문 머리표 불릿 접두", GOOD.replace("번호지문:", "- 번호지문:")],
  ["정답 줄 값이 다음 줄로 내려감", GOOD.replace("정답: ③", "정답:\n③")],
  // ── 마커 본문 회귀(같은 계통 — 마커가 통째로 소실되면 "개수 오류"로만 보인다) ──
  // 실측 형상: PDF·책에서 붙여넣은 지문의 문장 중간 하드 개행을 모델이 지시대로
  // '한 글자도 바꾸지 말고' 옮기면 마커 본문에 개행이 들어간다.
  [
    "마커 본문 하드 개행(PDF 붙여넣기 형상)",
    GOOD.replace("merchant ledgers, and", "merchant ledgers,\nand"),
  ],
  ["마커 구분자 전각 콜론([[3：문장]])", GOOD.replace(/\[\[(\d):/g, "[[$1：")],
];
for (const [name, text] of DRIFTS) {
  const q = parseMdIrrelevant(text);
  const issues = gateOf(text);
  check(
    `드리프트 관용: ${name}`,
    q.slots.length === 5 && issues.length === 0,
    `슬롯 ${q.slots.length}개 · ${issues.join(" / ")}`,
  );
}

// 과잉 관용 방지 — 오답 섹션 밖 산문은 오답으로 오인하지 않는다.
{
  const prose = GOOD.replace("오답:\n", "오답:\n아래는 각 문장의 역할입니다.\n");
  check("과잉 관용 방지: 라벨 없는 산문 줄 무시", parseMdIrrelevant(prose).wrong.length === 4, `실제 ${parseMdIrrelevant(prose).wrong.length}`);
}
// 드리프트 관용: 오답 목록에 정답 줄을 끼워 넣는 실측 패턴 — 파서가 걸러낸다.
{
  const leaked = GOOD.replace("오답:\n", "오답:\n③ 이 문장이 정답입니다.\n");
  const q = parseMdIrrelevant(leaked);
  check("드리프트 관용: 오답 목록의 정답 줄 제거", q.wrong.length === 4 && q.wrong.every((w) => w.label !== "3"));
}

// 스냅 (1) — 번호가 2~6 으로 밀린 드리프트를 1~5 로 재부여하고 정답도 함께 옮긴다.
{
  const shifted = mdOf({
    numbered: buildNumbered({ offset: 1 }),
    answerLine: "정답: ④",
    wrongLabels: ["②", "③", "⑤", "⑥"],
  });
  const s = autoSnapIrrelevantSlots(parseMdIrrelevant(shifted), PASSAGE);
  check(
    "스냅: 번호 재부여(2~6 → 1~5) + 정답·오답 라벨 동반 이동",
    s.corrections.length === 1 &&
      s.question.slots.map((x) => x.label).join(",") === "1,2,3,4,5" &&
      s.question.answer === "3" &&
      s.question.wrong.map((x) => x.label).join(",") === "1,2,4,5",
    `${s.corrections.join(" / ")} · answer=${s.question.answer} · wrong=${s.question.wrong.map((x) => x.label).join(",")}`,
  );
  check(
    "스냅: 번호지문 마커 라벨도 함께 재부여(재구성 기준 축 동기)",
    collectIrrelevantMarks(s.question.numberedPassage).map((m) => m.label).join(",") === "1,2,3,4,5",
    collectIrrelevantMarks(s.question.numberedPassage).map((m) => m.label).join(","),
  );
  check("스냅 후 게이트 클린", gateMdIrrelevant(s.question, PASSAGE, { slotCount: 5 }).length === 0, gateMdIrrelevant(s.question, PASSAGE, { slotCount: 5 }).join(" / "));
}
// 스냅 (2) — 비정답 슬롯의 종결 부호가 마커 밖으로 새면 축자로 되돌린다.
{
  const clipped = GOOD.replace(`[[5:${SENTENCES[7]}]]`, `[[5:${SENTENCES[7].slice(0, -1)}]].`);
  const s = autoSnapIrrelevantSlots(parseMdIrrelevant(clipped), PASSAGE);
  check(
    "스냅: 비정답 슬롯을 지문 축자로 보정",
    s.corrections.some((c) => c.includes("5번")) && s.question.slots[4].text === SENTENCES[7],
    `${s.corrections.join(" / ")} · '${s.question.slots[4].text.slice(-30)}'`,
  );
  check("스냅 후 게이트 클린(종결 부호 드리프트)", gateMdIrrelevant(s.question, PASSAGE, { slotCount: 5 }).length === 0, gateMdIrrelevant(s.question, PASSAGE, { slotCount: 5 }).join(" / "));
}
// 스냅 (3) — 곱슬따옴표 드리프트: 재구성은 통과하지만 저장 sentences[] 는 축자여야 한다.
{
  const curly = GOOD.replace("travelers'", "travelers’");
  const s = autoSnapIrrelevantSlots(parseMdIrrelevant(curly), PASSAGE);
  check(
    "스냅: 곱슬따옴표 슬롯을 지문 축자로 되돌림(저장 형상 축자화)",
    s.corrections.some((c) => c.includes("1번")) && s.question.slots[0].text === SENTENCES[1],
    `${s.corrections.join(" / ")} · '${s.question.slots[0].text.slice(0, 40)}'`,
  );
  check(
    "레인: parseAndGate 가 보정 기록을 실어 보낸다(잡 result.mdCorrections)",
    IRRELEVANT_MD_LANE.parseAndGate(curly, ctxOf()).corrections.length > 0,
  );
}

// 전역 정규식 lastIndex 안전성 — 같은 상수를 반복 소비해도 결과가 흔들리지 않는다.
{
  const np = parsed.numberedPassage;
  const first = collectIrrelevantMarks(np).length;
  stripIrrelevantMarks(np);
  reconstructIrrelevantPassage(np, "3");
  check(
    "전역 정규식 재사용 안전(lastIndex 미오염)",
    collectIrrelevantMarks(np).length === first && first === 5,
    `${first} → ${collectIrrelevantMarks(np).length}`,
  );
}

// 정답 라벨이 없으면 재구성은 아무것도 들어내지 않는다(게이트가 '정답 누락'으로 지목).
check(
  "재구성: 정답 라벨 부재 시 무관 문장을 남긴다(오지목 방지)",
  reconstructIrrelevantPassage(parsed.numberedPassage, "").includes(INTRUDER),
);

// 스냅 (4) — 정답 슬롯은 절대 축자 스냅하지 않는다(삽입문이 지문 문장으로 둔갑 금지).
{
  const s = autoSnapIrrelevantSlots(parseMdIrrelevant(mdOf({ intruder: `${SENTENCES[6].slice(0, -1)}!` })), PASSAGE);
  check(
    "스냅: 정답 슬롯은 스냅 대상 제외(신규성 게이트 보호)",
    s.question.slots[2].text.endsWith("!") && gateMdIrrelevant(s.question, PASSAGE, { slotCount: 5 }).some((i) => i.includes("지문에 이미 있는 문장")),
    s.question.slots[2].text.slice(-20),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. 어댑터 → processIrrelevant 왕복
// ───────────────────────────────────────────────────────────────────────────
{
  const adapt = adaptMdIrrelevantToAiQuestion(snapped.question, PASSAGE, "KILLER");
  check("어댑터: 성공", adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  const sentences = ai.sentences as string[];
  check("어댑터: sentences 5개 · 번호 순서", sentences.length === 5 && sentences[0] === SENTENCES[1] && sentences[4] === SENTENCES[7]);
  check("어댑터: irrelevantIndex 2 (0-based)", ai.irrelevantIndex === 2, String(ai.irrelevantIndex));
  check("어댑터: sentences[irrelevantIndex] == 무관 문장", sentences[2] === INTRUDER);
  check("어댑터: correctAnswer 숫자 문자열 '3'", ai.correctAnswer === "3", String(ai.correctAnswer));
  const woe = ai.wrongOptionExplanations as Array<Record<string, unknown>>;
  check("어댑터: 오답해설 라벨 1,2,4,5 (후처리 조회 축)", woe.map((w) => w.label).join(",") === "1,2,4,5", woe.map((w) => w.label).join(","));
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check("어댑터: options·passageWithNumbers 미생성(후처리 소관)", !("options" in ai) && !("passageWithNumbers" in ai));
  check("어댑터: 빈칸 계열 이물 필드 없음", !("blanks" in ai) && !("passageWithBlank" in ai) && !("originalExpression" in ai));
  check("어댑터: 발문 고정", ai.direction === "다음 글에서 전체 흐름과 관계 없는 문장은?", String(ai.direction));

  const pp = postProcessQuestion("IRRELEVANT", PASSAGE, ai as never);
  check("후처리: 성공", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  check("후처리: 재배치·인트로 제거 경고 없음(설계가 이미 정합)", (pp.warnings ?? []).length === 0, (pp.warnings ?? []).join(" / "));
  check("후처리: irrelevantIndex 유지", data.irrelevantIndex === 2, String(data.irrelevantIndex));
  check("후처리: correctAnswer ③", data.correctAnswer === "③", String(data.correctAnswer));
  const opts = data.options as Array<Record<string, unknown>>;
  check("후처리: 선지 5개 · 라벨=텍스트=원문자", opts.length === 5 && opts[0].label === "①" && opts[4].text === "⑤");
  const pwm = String(data.passageWithNumbers ?? "");
  check("후처리: 마킹 스팬 5개", (pwm.match(/[①-⑳]\s*__/g) ?? []).length === 5, pwm.slice(0, 90));
  check("후처리: 도입문은 마커 없이 그대로", pwm.startsWith(SENTENCES[0]), pwm.slice(0, 60));
  check(
    "★ 설계=표면: 무관 문장이 설계한 자리(앞 표시 문장 바로 뒤)에 렌더됨",
    pwm.includes(`② __${SENTENCES[3]}__ ③ __${INTRUDER}__`),
    pwm.slice(pwm.indexOf("②"), pwm.indexOf("②") + 200),
  );
  check("후처리: 표시되지 않은 원문 문장도 지문에 남는다", pwm.includes(SENTENCES[5]) && pwm.includes(SENTENCES[8]));
  const woeRecord = data.wrongOptionExplanations as Record<string, string>;
  check(
    "후처리: 오답해설이 원문자 키로 재정렬 · 정답 키 없음",
    Object.keys(woeRecord).join(",") === "①,②,④,⑤",
    Object.keys(woeRecord).join(","),
  );
  check("후처리: 오답해설 본문 보존(기본 문구로 덮이지 않음)", woeRecord["①"] === WRONG_TEXT["①"], woeRecord["①"]);

  const issues = validateQuestionQuality({
    typeId: "IRRELEVANT",
    question: { ...data, difficulty: "KILLER" },
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    ...IRRELEVANT_MD_LANE.qualityArgs({ resolved: { irrelevantSlotCount: 5 }, rawTypeSettings: null } as unknown as MdLaneContext),
  });
  const errors = issues.filter((i) => i.severity === "error");
  check("품질 검증기: error 0 (fast 검증기 왕복)", errors.length === 0, errors.map((e) => e.code).join(" / "));
}
check(
  "어댑터: 정답 번호가 슬롯에 없으면 실패",
  adaptMdIrrelevantToAiQuestion({ ...snapped.question, answer: "9" }, PASSAGE, "KILLER").ok === false,
);
check(
  "어댑터: 정답이 첫/마지막이면 실패(후처리 강제 재배치 차단)",
  adaptMdIrrelevantToAiQuestion({ ...snapped.question, answer: "1" }, PASSAGE, "KILLER").ok === false &&
    adaptMdIrrelevantToAiQuestion({ ...snapped.question, answer: "5" }, PASSAGE, "KILLER").ok === false,
);
check(
  "어댑터: 슬롯 4개면 실패(형상 방어)",
  adaptMdIrrelevantToAiQuestion({ ...snapped.question, slots: snapped.question.slots.slice(0, 4) }, PASSAGE, "KILLER").ok === false,
);

// ───────────────────────────────────────────────────────────────────────────
// 5. 슬롯 수 7 — 개수 노브 집행
// ───────────────────────────────────────────────────────────────────────────
{
  // 표시 원문 6개(인덱스 1·2·3·4·6·7) + 무관 문장은 인덱스 4 뒤 → 정답은 5번.
  const md7 = mdOf({
    sources: [1, 2, 3, 4, 6, 7],
    insertAfter: 4,
    answer: "⑤",
    wrongLabels: ["①", "②", "③", "④", "⑥", "⑦"],
  });
  const q7 = autoSnapIrrelevantSlots(parseMdIrrelevant(md7), PASSAGE).question;
  check("슬롯 7: 파싱 7개", q7.slots.length === 7, `실제 ${q7.slots.length}`);
  check("슬롯 7: 게이트 클린", gateMdIrrelevant(q7, PASSAGE, { slotCount: 7 }).length === 0, gateMdIrrelevant(q7, PASSAGE, { slotCount: 7 }).join(" / "));
  check("슬롯 7: 5개 기대 시 개수 반려", gateMdIrrelevant(q7, PASSAGE, { slotCount: 5 }).some((i) => i.includes("번호 마커 7개 (5개 필요)")));
  const adapt7 = adaptMdIrrelevantToAiQuestion(q7, PASSAGE, "INTERMEDIATE");
  check("슬롯 7: 어댑터 성공 · irrelevantIndex 4", adapt7.ok === true && (adapt7.aiQuestion as Record<string, unknown>).irrelevantIndex === 4, adapt7.error);
  const pp7 = postProcessQuestion("IRRELEVANT", PASSAGE, (adapt7.aiQuestion ?? {}) as never);
  check("슬롯 7: 후처리 성공 · 선지 7개", pp7.success === true && ((pp7.data?.options as unknown[]) ?? []).length === 7, pp7.error);
  check("슬롯 7: correctAnswer ⑤", pp7.data?.correctAnswer === "⑤", String(pp7.data?.correctAnswer));
  check(
    "슬롯 7: 품질 검증기 error 0",
    validateQuestionQuality({
      typeId: "IRRELEVANT",
      question: { ...((pp7.data ?? {}) as Record<string, unknown>), difficulty: "INTERMEDIATE" },
      passage: PASSAGE,
      requestedDifficulty: "INTERMEDIATE",
      irrelevantSlotCount: 7,
    }).filter((i) => i.severity === "error").length === 0,
    validateQuestionQuality({
      typeId: "IRRELEVANT",
      question: { ...((pp7.data ?? {}) as Record<string, unknown>), difficulty: "INTERMEDIATE" },
      passage: PASSAGE,
      requestedDifficulty: "INTERMEDIATE",
      irrelevantSlotCount: 7,
    }).filter((i) => i.severity === "error").map((i) => i.code).join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 레인 계약 — 과금 축 · 적격성 · 설정 집행 · 난이도 3분기
// ───────────────────────────────────────────────────────────────────────────
function ctxOf(overrides: Partial<MdLaneContext> = {}): MdLaneContext {
  return {
    passage: PASSAGE,
    difficulty: "KILLER",
    rawDifficulty: "KILLER",
    resolved: { irrelevantSlotCount: 5, irrelevantPointFocus: false },
    rawTypeSettings: null,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
    ...overrides,
  } as MdLaneContext;
}

check("레인: subType IRRELEVANT", IRRELEVANT_MD_LANE.subType === "IRRELEVANT");
check(
  "레인: 과금 QUESTION_GEN_SINGLE (fast getOperationType 동기 — VOCAB_TYPES 밖)",
  IRRELEVANT_MD_LANE.operationType === "QUESTION_GEN_SINGLE" && CREDIT_COSTS.QUESTION_GEN_SINGLE === 2,
  String(IRRELEVANT_MD_LANE.operationType),
);
check("레인: retryEligible", IRRELEVANT_MD_LANE.retryEligible === true);
check(
  "레인: 적격성 5~10 · 범위 밖 거부",
  IRRELEVANT_MD_LANE.isEligible({ irrelevantSlotCount: 5 }) &&
    IRRELEVANT_MD_LANE.isEligible({ irrelevantSlotCount: 10 }) &&
    !IRRELEVANT_MD_LANE.isEligible({ irrelevantSlotCount: 11 }) &&
    !IRRELEVANT_MD_LANE.isEligible({ irrelevantSlotCount: 4 }),
);
check("레인: 설정 미지정이면 기본 5로 적격", IRRELEVANT_MD_LANE.isEligible({}));
check(
  "레인: parseAndGate 통합 클린",
  IRRELEVANT_MD_LANE.parseAndGate(GOOD, ctxOf()).gateIssues.length === 0,
  IRRELEVANT_MD_LANE.parseAndGate(GOOD, ctxOf()).gateIssues.join(" / "),
);
check(
  "레인: parseAndGate 가 slotCount 설정을 집행",
  IRRELEVANT_MD_LANE.parseAndGate(GOOD, ctxOf({ resolved: { irrelevantSlotCount: 7 } })).gateIssues.some((i) => i.includes("7개 필요")),
);
check(
  "레인: adapt 성공",
  IRRELEVANT_MD_LANE.adapt(IRRELEVANT_MD_LANE.parseAndGate(GOOD, ctxOf()), ctxOf()).ok === true,
);
check(
  "레인: 교사 지정 문장이 슬롯에 없으면 반려",
  IRRELEVANT_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ teacherPoints: [{ text: SENTENCES[5], unit: "sentence" }] as MdLaneContext["teacherPoints"] }),
  ).gateIssues.some((i) => i.includes("교사 지정 문장")),
);
check(
  "레인: 교사 지정 문장이 슬롯에 있으면 통과",
  IRRELEVANT_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ teacherPoints: [{ text: SENTENCES[3], unit: "sentence" }] as MdLaneContext["teacherPoints"] }),
  ).gateIssues.length === 0,
);
check(
  "레인: qualityArgs 에 irrelevantSlotCount·언어 실값",
  JSON.stringify(IRRELEVANT_MD_LANE.qualityArgs(ctxOf())) === JSON.stringify({ irrelevantSlotCount: 5, stemLanguage: "ko", optionLanguage: "ko" }),
  JSON.stringify(IRRELEVANT_MD_LANE.qualityArgs(ctxOf())),
);
check(
  "레인: mdFormat 이 삽입 계약을 명시",
  JSON.stringify(IRRELEVANT_MD_LANE.mdFormat(ctxOf())) === JSON.stringify({ slotCount: 5, pointFocus: false, passageMode: "INSERTION" }),
  JSON.stringify(IRRELEVANT_MD_LANE.mdFormat(ctxOf())),
);
check(
  "레인: buildExtras — pointFocus 꺼짐이면 가이드 없음",
  IRRELEVANT_MD_LANE.buildExtras(ctxOf()).length === 0,
);
check(
  "레인: buildExtras — pointFocus 켜지면 무관성 유형 가이드 주입",
  IRRELEVANT_MD_LANE.buildExtras(ctxOf({ resolved: { irrelevantSlotCount: 5, irrelevantPointFocus: true } }))
    .join("\n")
    .includes("무관 문장 출제 포인트 가이드"),
);
check(
  "레인: buildExtras — 발문 영어 설정이면 언어 블록 주입",
  IRRELEVANT_MD_LANE.buildExtras(ctxOf({ rawTypeSettings: { IRRELEVANT: { stemLanguage: "en" } } }))
    .join("\n")
    .includes("질문 언어"),
);
{
  const enCtx = ctxOf({ rawTypeSettings: { IRRELEVANT: { stemLanguage: "en" } } });
  const adapted = IRRELEVANT_MD_LANE.adapt(IRRELEVANT_MD_LANE.parseAndGate(GOOD, enCtx), enCtx);
  check(
    "레인: 발문 영어 설정이 어댑터 direction 까지 집행",
    adapted.ok && /Which sentence/.test(String(adapted.aiQuestion?.direction)),
    String(adapted.aiQuestion?.direction),
  );
}
check(
  "레인: diversityTargets = 이미 쓴 무관 문장 하나뿐(원문 문장 회피 금지)",
  IRRELEVANT_MD_LANE.diversityTargets({ sentences: [SENTENCES[1], SENTENCES[3], INTRUDER, SENTENCES[4], SENTENCES[7]], irrelevantIndex: 2 }).length === 1 &&
    IRRELEVANT_MD_LANE.diversityTargets({ sentences: [SENTENCES[1], INTRUDER], irrelevantIndex: 1 })[0].includes("이미 쓴 무관 문장"),
);
check(
  "레인: diversityTargets — 형상이 다르면 빈 배열(방어)",
  IRRELEVANT_MD_LANE.diversityTargets({}).length === 0 &&
    IRRELEVANT_MD_LANE.diversityTargets({ sentences: [], irrelevantIndex: 0 }).length === 0,
);

// 프롬프트 — 난이도 3분기 · 개수 반영 · 형식 단순화 계약
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdIrrelevantPrompt(PASSAGE, "full", d, { slotCount: 7 });
  check(
    `프롬프트 ${d}: 난이도 분기 + 7슬롯 스캐폴드 + 지문 포함`,
    p.includes("[[7:문장 전체]]") && p.includes("## 지문") && p.includes(PASSAGE.slice(0, 40)) && p.includes("## 출력 형식"),
  );
}
check(
  "프롬프트: 난이도별 표적 설계 문구가 서로 다르다",
  new Set(["BASIC", "INTERMEDIATE", "KILLER"].map((d) => buildMdIrrelevantPrompt(PASSAGE, "full", d as "BASIC").split("## 무관성 기제")[0])).size === 3,
);
check(
  "프롬프트: few-shot 은 BASIC 에서 생략(정본 선례)",
  !buildMdIrrelevantPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") &&
    buildMdIrrelevantPrompt(PASSAGE, "full", "KILLER").includes("모범 설계 해부"),
);
check(
  "프롬프트: 마커에 O/X 칸을 요구하지 않는다(철칙 1 — 정답은 `정답:` 줄만)",
  !buildMdIrrelevantPrompt(PASSAGE, "full", "KILLER").includes("O 또는 X"),
);
check(
  "프롬프트: `원문:` 줄을 요구하지 않는다(삽입 계약 — 교체가 아니다)",
  !buildMdIrrelevantPrompt(PASSAGE, "full", "KILLER").includes("\n원문:"),
);
check(
  "프롬프트: 재구성 자기검산·역접어 금지·첫 문장 금지가 실려 있다",
  ["결과가 원 지문과 한 글자도 다르지 않은지", "역접 연결어", "지문 첫 문장은 감싸지 않는다"].every((s) =>
    buildMdIrrelevantPrompt(PASSAGE, "full", "KILLER").includes(s),
  ),
);
check(
  "프롬프트: slotCount 클램프(3→5, 99→10)",
  buildMdIrrelevantPrompt(PASSAGE, "full", "KILLER", { slotCount: 3 }).includes("[[5:문장 전체]]") &&
    buildMdIrrelevantPrompt(PASSAGE, "full", "KILLER", { slotCount: 99 }).includes("[[10:문장 전체]]"),
);
check(
  "프롬프트: answer-only 모드는 오답 블록을 요구하지 않는다",
  !buildMdIrrelevantPrompt(PASSAGE, "answer-only", "KILLER").includes("\n오답:"),
);

// ───────────────────────────────────────────────────────────────────────────
// 7. wave2 적대검수 회귀 — 지적 6건을 각각 재현·고정한다.
// ───────────────────────────────────────────────────────────────────────────

// ── 7-A 마커 인식 실패 지목 (철칙 5) ────────────────────────────────────────
{
  // 닫는 `]]` 누락 → 뒤 마커까지 하나로 삼켜져 개수가 어긋난다. "번호 마커 4개
  // (5개 필요)" 만 주면 모델은 어디를 고칠지 알 수 없고 재생성이 같은 형상으로 수렴한다.
  const unclosed = GOOD.replace(`[[4:${SENTENCES[4]}]]`, `[[4:${SENTENCES[4]}`);
  const issues = gateOf(unclosed);
  check(
    "회귀(철칙 5): 마커 개수 오류가 인식 실패한 '[[' 자리를 지목한다",
    issues.some((i) => i.includes("'[[' 는 5곳인데 4곳만") && i.includes("]]' 로 닫아야")),
    issues.join(" / "),
  );
}

// ── 7-B 약어 마침표 문장 — 오지목 문구 회귀 (지적 #1) ───────────────────────
{
  // 지문 문장에 약어 마침표(Dr.)가 있으면 splitPassageSentences 가 문장 내부에서
  // 쪼갠다. 이 슬롯은 `passage.includes(slot) === true` 인 완전 축자인데도 기존
  // 게이트는 "두 문장을 이어붙였거나 종결 부호가 빠짐" 이라는 **사실과 다른 원인**
  // 하나만 지목했다 — 모델은 이행할 방법이 없고(쪼개면 재구성 게이트가 깨진다)
  // 재생성 1회를 태운 뒤 실패·환불로 갔다. 반려 자체는 맞다(아래에서 후처리가
  // 실제로 슬롯을 잘라 버리는 것을 실증한다) — 고칠 것은 **문구와 행동 지시**다.
  const ABBR = [...SENTENCES];
  ABBR[3] = "When two accounts disagreed, Dr. Halley had to decide which informant carried more authority.";
  const abbrPassage = ABBR.join(" ");
  const numbered = [...ABBR.slice(0, 4), INTRUDER, ...ABBR.slice(4)]
    .map((s, i) => {
      const marked = [1, 3, 4, 5, 8].indexOf(i);
      return marked >= 0 ? `[[${marked + 1}:${s}]]` : s;
    })
    .join(" ");
  const q = autoSnapIrrelevantSlots(parseMdIrrelevant(mdOf({ numbered })), abbrPassage).question;
  const issues = gateMdIrrelevant(q, abbrPassage, { slotCount: 5, difficulty: "KILLER" });
  check(
    "회귀(지적1): 약어 마침표 문장 슬롯을 축자로 확인한다",
    abbrPassage.includes(ABBR[3]) && q.slots[1].text === ABBR[3],
    q.slots[1]?.text,
  );
  // 26-08-22 스플리터 근원 수리(passage-sentence-utils: 종결부호 뒤 소문자 비경계
  // + 호칭·라틴 약어 목록) 후 신계약 — 약어 문장은 애초에 오분할되지 않으므로
  // 반려 자체가 사라져야 한다. 종전 단언(반려 문구 품질)은 결함 방어의 기록이었고,
  // 지금 단언(무반려)은 근원 수리의 실증이다.
  check(
    "회귀(지적1→수리): 약어 마침표 문장 슬롯이 경계 검사에 걸리지 않는다(스플리터 수리 실증)",
    !issues.some((i) => i.includes("2번") && i.includes("경계")),
    issues.join(" / ") || "클린",
  );
  check(
    "회귀(지적1→수리): e.g./Dr. 를 품은 삽입문이 단일문장 검사를 통과한다(스플리터 수리 실증)",
    !gateOf(mdOf({ intruder: `The ornament, e.g. Dr. Halley's crest, marked the authority of an informant on each finished sheet.` }))
      .some((i) => i.includes("문장 하나가 아님")),
    gateOf(mdOf({ intruder: `The ornament, e.g. Dr. Halley's crest, marked the authority of an informant on each finished sheet.` })).join(" / ") || "클린",
  );
  // 반려가 옳다는 근거 — 통과시켰다면 후처리가 이 슬롯을 "When two accounts
  // disagreed, Dr." 로 잘라 학생 표면에 내보낸다.
  const adapt = adaptMdIrrelevantToAiQuestion(q, abbrPassage, "KILLER");
  const pp = postProcessQuestion("IRRELEVANT", abbrPassage, (adapt.aiQuestion ?? {}) as never);
  check(
    "회귀(지적1→수리): 후처리가 약어 문장 슬롯을 온전히 보존한다(게이트·후처리 동축 수리 실증)",
    ((pp.data?.sentences as string[]) ?? [])[1] === ABBR[3],
    String(((pp.data?.sentences as string[]) ?? [])[1]),
  );
}

// ── 7-C 소수점 문장 — 게이트 CLEAN 인데 표면 파손 (지적 #3) ─────────────────
{
  // splitPassageSentences 는 "3.5" 의 마침표에서 끊겨 이 문장의 앞부분 조각을
  // **아예 만들지 못한다**. 기존 게이트는 양방향 부분문자열 포함 매칭이라 CLEAN 을
  // 냈고, 후처리가 슬롯을 조각으로 잘라 지문에서 앞부분이 통째로 사라진 채 저장됐다
  // ("설계=표면" 단정 반증). 판정 축을 후처리의 문장 풀과 같은 완전 일치로 맞춘다.
  const DEC = [...SENTENCES];
  DEC[4] = "That decision was announced on fewer than 3.5 percent of finished sheets, so readers inherited a judgment they could not inspect.";
  const decPassage = DEC.join(" ");
  const numbered = [...DEC.slice(0, 4), INTRUDER, ...DEC.slice(4)]
    .map((s, i) => {
      const marked = [1, 3, 4, 5, 8].indexOf(i);
      return marked >= 0 ? `[[${marked + 1}:${s}]]` : s;
    })
    .join(" ");
  const q = autoSnapIrrelevantSlots(parseMdIrrelevant(mdOf({ numbered })), decPassage).question;
  const issues = gateMdIrrelevant(q, decPassage, { slotCount: 5, difficulty: "KILLER" });
  check(
    "회귀(지적3→수리): 소수점 문장 슬롯이 경계 검사를 통과한다(스플리터 무손실 재작성 실증)",
    decPassage.includes(DEC[4]) &&
      !issues.some((i) => i.includes("4번") && i.includes("지문 문장 경계와 어긋남")),
    issues.join(" / ") || "클린",
  );
  const adapt = adaptMdIrrelevantToAiQuestion(q, decPassage, "KILLER");
  const pp = postProcessQuestion("IRRELEVANT", decPassage, (adapt.aiQuestion ?? {}) as never);
  check(
    "회귀(지적3→수리): 소수점 문장이 학생 표면에 온전히 실린다(표면 무손상 실증)",
    String(pp.data?.passageWithNumbers ?? "").includes("That decision was announced on fewer than 3"),
    String(pp.data?.passageWithNumbers ?? "").slice(0, 80),
  );
  // 포함 매칭으로 되돌아가는 회귀 방지 — 조각을 '포함'만 해도 통과하면 안 된다.
  check(
    "회귀(지적3): 슬롯이 지문 문장을 '포함'만 해서는 통과하지 못한다",
    gateOf(
      GOOD.replace(`[[1:${SENTENCES[1]}]]`, `[[1:Indeed, ${SENTENCES[1]}]]`),
    ).some((i) => i.includes("1번")),
  );
}

// ── 7-D 방법론 드리프트 9패턴 동기 (지적 #4) ────────────────────────────────
{
  // 이전 판은 5패턴만 복제하면서 복제분 내부까지 좁혀(`system`·`important`·
  // `mechanisms?|tutorials?` 탈락) 프로덕션이 error 로 잡는 삽입문을 통과시켰다.
  // md 레인은 validateQuestionQuality 를 차단하지 않으므로 그대로 출하됐다.
  const SOURCE = "src/lib/question-quality/validators/irrelevant.ts";
  const src = existsSync(SOURCE) ? readFileSync(SOURCE, "utf8") : "";
  const start = src.indexOf("const methodologyDriftPatterns");
  const block = start >= 0 ? src.slice(start, src.indexOf("];", start)) : "";
  const prod = block
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.match(/^\["([^"]+)",\s*(\/[\s\S]*\/[a-z]*)\],?$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => `${m[1]} ${m[2]}`);
  const mine = METHODOLOGY_DRIFT_PATTERNS.map(([label, re]) => `${label} ${String(re)}`);
  check("회귀(지적4): 프로덕션 원본 패턴 9개를 읽어냈다", prod.length === 9, `실제 ${prod.length}`);
  check(
    "회귀(지적4): 복제본이 프로덕션 9패턴과 라벨·정규식 문자열까지 완전 동일",
    mine.length === prod.length && mine.every((p, i) => p === prod[i]),
    mine.filter((p) => !prod.includes(p)).join(" | ") ||
      prod.filter((p) => !mine.includes(p)).join(" | "),
  );
  // 실측 3건 — 전부 '게이트 CLEAN → validator error(irrelevant-methodology-drift)' 였다.
  const DRIFT_TELLS: [string, string, string][] = [
    ["system requires(패턴1 축약분)", "The system requires that the authority of every informant be recorded on the finished sheet alongside its ornament.", "procedure/process requires"],
    ["it is important to(패턴2 축약분)", "It is important to record the authority of each informant on the finished sheet beside its ornament.", "it is essential/necessary to"],
    ["measuring 리드(미복제 패턴)", "Measuring the authority of an informant across the ornament of each finished sheet occupied later collectors.", "methodology gerund lead"],
  ];
  for (const [name, intruder, label] of DRIFT_TELLS) {
    const issues = advOf(mdOf({ intruder }), 5, "KILLER");
    check(
      `회귀(지적4·KILLER): ${name} 를 권고 채널이 잡는다(26-08-22 차단→권고 강등)`,
      issues.some((i) => i.includes("방법론·측정·도구") && i.includes(label)) &&
        !gateOf(mdOf({ intruder }), 5, "KILLER").some((i) => i.includes("방법론·측정·도구")),
      issues.join(" / "),
    );
    check(
      `회귀(지적4·BASIC): ${name} 는 KILLER 전용이라 권고도 침묵(프로덕션 조건 동기)`,
      !advOf(mdOf({ intruder }), 5, "BASIC").some((i) => i.includes("방법론·측정·도구")),
      advOf(mdOf({ intruder }), 5, "BASIC").join(" / "),
    );
  }
}

// ── 7-E 교사 지정 = 지문 첫 문장 (지적 #5) ─────────────────────────────────
{
  // 포인트 피커는 첫 문장을 막지 않는다. 그대로 차단하면 준수 게이트와 게이트 #6
  // (첫 문장 번호 금지)이 상호 배타 조건이 되어 재생성해도 반드시 실패·환불이다.
  const firstPointCtx = ctxOf({
    teacherPoints: [{ text: SENTENCES[0], unit: "sentence" }] as MdLaneContext["teacherPoints"],
  });
  const parsedFirst = IRRELEVANT_MD_LANE.parseAndGate(GOOD, firstPointCtx);
  check(
    "회귀(지적5): 교사 지정이 지문 첫 문장이면 판정 불가로 통과(상호 배타 데드락 해소)",
    parsedFirst.gateIssues.length === 0,
    parsedFirst.gateIssues.join(" / "),
  );
  check(
    "회귀(지적5): 건너뛴 사실을 보정 기록으로 남긴다(result.mdCorrections)",
    parsedFirst.corrections.some((c) => c.includes("첫 문장") && c.includes("건너뜀")),
    parsedFirst.corrections.join(" / "),
  );
  check(
    "회귀(지적5): 첫 문장이 아닌 미준수는 그대로 반려(관용이 새지 않는다)",
    IRRELEVANT_MD_LANE.parseAndGate(
      GOOD,
      ctxOf({ teacherPoints: [{ text: SENTENCES[5], unit: "sentence" }] as MdLaneContext["teacherPoints"] }),
    ).gateIssues.some((i) => i.includes("교사 지정 문장")),
  );
}

// ── 7-F 지문 문장수로 불가능한 슬롯 수 (지적 #6) ───────────────────────────
{
  // 9문장 지문 + 슬롯 10 은 원문 소스가 8개뿐이라 확정 실패다. isEligible 은
  // resolved 만 받아 지문을 못 보므로 크레딧 선차감 후 실패로 간다 — 라우트
  // mdEligible 에 아래 헬퍼를 함께 태워 차감 전 fast 폴백시켜야 한다(감독 배선).
  check(
    "회귀(지적6): 지문 대조 적격성 — 9문장 지문 + 슬롯 10 은 불가",
    !checkIrrelevantMdPassageFeasibility({ irrelevantSlotCount: 10 }, PASSAGE).ok &&
      checkIrrelevantMdPassageFeasibility({ irrelevantSlotCount: 9 }, PASSAGE).ok &&
      checkIrrelevantMdPassageFeasibility({ irrelevantSlotCount: 5 }, PASSAGE).ok,
    JSON.stringify(checkIrrelevantMdPassageFeasibility({ irrelevantSlotCount: 10 }, PASSAGE)),
  );
  check(
    "회귀(지적6): 안내 문구가 fast 와 동일 계약(선택지 수를 줄이거나 긴 지문)",
    (checkIrrelevantMdPassageFeasibility({ irrelevantSlotCount: 10 }, PASSAGE).error ?? "").includes(
      "선택지 수를 9개 이하로 줄이거나",
    ),
    checkIrrelevantMdPassageFeasibility({ irrelevantSlotCount: 10 }, PASSAGE).error,
  );
  const impossible = IRRELEVANT_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ resolved: { irrelevantSlotCount: 10 } }),
  );
  check(
    "회귀(지적6): 배선 전 완충 — 실패 사유가 '마커 개수'가 아니라 진짜 원인이다",
    impossible.gateIssues.length === 1 &&
      impossible.gateIssues[0].includes("이 지문으로 만들 수 없다") &&
      !impossible.gateIssues[0].includes("번호 마커"),
    impossible.gateIssues.join(" / "),
  );
  check(
    "회귀(지적6): 가능한 조합은 완충이 발화하지 않는다",
    !IRRELEVANT_MD_LANE.parseAndGate(GOOD, ctxOf({ resolved: { irrelevantSlotCount: 7 } }))
      .gateIssues.some((i) => i.includes("이 지문으로 만들 수 없다")),
  );
}

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
