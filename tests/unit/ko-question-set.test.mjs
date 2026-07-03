import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 국어 지문 세트(A1) 결정론 스위트 — 실LLM 0:
//   (1) 프리셋 갈래→슬롯 해석(독서/문학 운문·산문/내신) + 패밀리 독점 배정
//   (2) KO 세트 누수스캔: 패밀리 충돌·정답 verbatim 노출(run≥6 어절)·같은 문장 경고
//   (3) 시험지 그룹화: KO 세트 멤버 groupId `set:<setId>` + 지문 미동봉,
//       buildGroups 공유지문 1박스(지시문 [n~m] + 병합 마커)
//   (4) 영어 세트/솔로 경로 무회귀(솔로 single: 그룹·자기완결 밑줄 주입 유지)
// TS + "@/..." 앨리어스 → tsx 하니스(question-set-leakage 미러).
const harnessSource = `
import presets from "@/lib/korean/sets/presets";
import leakage from "@/lib/korean/sets/leakage";
import setPaper from "@/lib/korean/sets/paper";
import paperUtils from "@/components/exams/paper-builder/paper-item-utils";

const {
  KO_SET_PRESETS,
  resolveKoSetPreset,
  resolveKoSetSlots,
  passageMeetsKoSetPreset,
  availableKoSetPresetsForPassage,
} = presets;
const { scanKoSetForLeakage } = leakage;
const {
  buildKoSetDirective,
  buildKoSetSharedPassage,
  readKoMarkersFromStructuredData,
  koSetGroupId,
  isKoSetGroupId,
} = setPaper;
const { makePaperItem, buildGroups } = paperUtils;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed += 1;
  else failures.push(detail ? name + " :: " + detail : name);
}

const passage =
  "인간의 존엄성은 근대 헌법의 토대가 되는 개념이다. " +
  "그러나 계약 자유의 원칙은 시장의 힘 앞에서 개인을 보호하지 못했다. " +
  "이에 국가는 노동법을 통해 계약 내용에 직접 개입하기 시작했다. " +
  "결국 사회적 기본권은 자유권과 상호 보완적인 관계를 형성하게 되었다.";

// ── (1) 프리셋 해석 ─────────────────────────────────────────────────────────
{
  check("preset registry has 3 presets", KO_SET_PRESETS.length === 3);
  const reading = resolveKoSetPreset("ko-suneung-reading")!;
  const r = resolveKoSetSlots(reading, "READING_SOC");
  check("reading resolves ok", r.ok === true);
  if (r.ok) {
    check(
      "reading slot order FACT→INFER→APPLY→VOCAB",
      JSON.stringify(r.members.map((m: any) => m.typeId)) ===
        JSON.stringify(["KO_RD_FACT", "KO_RD_INFER", "KO_RD_APPLY", "KO_RD_VOCAB"]),
      JSON.stringify(r.members.map((m: any) => m.typeId)),
    );
    check(
      "reading points 2/2/3/2 (APPLY=3점 슬롯)",
      JSON.stringify(r.members.map((m: any) => m.points)) === JSON.stringify([2, 2, 3, 2]),
    );
    check(
      "INFER claims KOR_CIRCLED",
      JSON.stringify(r.members[1].allowedFamilies) === JSON.stringify(["KOR_CIRCLED"]),
    );
    check(
      "VOCAB claims LATIN_CIRCLED",
      JSON.stringify(r.members[3].allowedFamilies) === JSON.stringify(["LATIN_CIRCLED"]),
    );
  }
  const badKind = resolveKoSetSlots(reading, "LIT_MODERN_POEM");
  check("reading preset rejects poem kind", badKind.ok === false);

  const lit = resolveKoSetPreset("ko-suneung-literature")!;
  const poem = resolveKoSetSlots(lit, "LIT_MODERN_POEM");
  check("lit(poem) resolves ok", poem.ok === true);
  if (poem.ok) {
    check(
      "lit(poem) slots EXPR→PHRASE→MOTIF→BOGI",
      JSON.stringify(poem.members.map((m: any) => m.typeId)) ===
        JSON.stringify(["KO_LIT_EXPR", "KO_LIT_PHRASE", "KO_LIT_MOTIF", "KO_LIT_BOGI"]),
      JSON.stringify(poem.members.map((m: any) => m.typeId)),
    );
    check(
      "PHRASE claims KOR / MOTIF claims LATIN",
      JSON.stringify(poem.members[1].allowedFamilies) === JSON.stringify(["KOR_CIRCLED"]) &&
        JSON.stringify(poem.members[2].allowedFamilies) === JSON.stringify(["LATIN_CIRCLED"]),
    );
    check(
      "BOGI degrades to no-marking (both families claimed)",
      poem.members[3].allowedFamilies.length === 0 &&
        poem.members[3].forbiddenFamilies.includes("KOR_CIRCLED") &&
        poem.members[3].forbiddenFamilies.includes("LATIN_CIRCLED"),
    );
  }
  const novel = resolveKoSetSlots(lit, "LIT_MODERN_NOVEL");
  check("lit(novel) resolves ok", novel.ok === true);
  if (novel.ok) {
    check(
      "lit(novel) slots NARR→FACT→MOTIF→BOGI",
      JSON.stringify(novel.members.map((m: any) => m.typeId)) ===
        JSON.stringify(["KO_LIT_NARR", "KO_LIT_FACT", "KO_LIT_MOTIF", "KO_LIT_BOGI"]),
      JSON.stringify(novel.members.map((m: any) => m.typeId)),
    );
    check(
      "lit(novel) BOGI keeps KOR family",
      JSON.stringify(novel.members[3].allowedFamilies) === JSON.stringify(["KOR_CIRCLED"]),
    );
  }

  const naesin = resolveKoSetPreset("ko-naesin-mixed")!;
  const mixed = resolveKoSetSlots(naesin, "READING_SCI");
  check("naesin(reading) resolves ok", mixed.ok === true);
  if (mixed.ok) {
    check(
      "naesin last slot is 서답형(COND) with no-marking",
      mixed.members[3].typeId === "KO_NS_COND" && mixed.members[3].allowedFamilies.length === 0,
      JSON.stringify(mixed.members[3]),
    );
    check(
      "naesin answer formats MC5×3 + ESSAY",
      JSON.stringify(mixed.members.map((m: any) => m.answerFormat)) ===
        JSON.stringify(["MC5", "MC5", "MC5", "ESSAY"]),
    );
  }

  // 분량 게이트 + 메뉴 필터
  check("short passage fails feasibility", passageMeetsKoSetPreset(passage, reading).ok === false);
  const longPassage = Array(8).fill(passage).join(" ");
  check("long passage meets feasibility", passageMeetsKoSetPreset(longPassage, reading).ok === true);
  const menu = availableKoSetPresetsForPassage(longPassage, "READING_SOC");
  check(
    "menu filter: reading kind exposes reading+naesin only",
    menu.some((p: any) => p.id === "ko-suneung-reading") &&
      menu.every((p: any) => p.id !== "ko-suneung-literature"),
    JSON.stringify(menu.map((p: any) => p.id)),
  );
}

// ── (2) 누수스캔 ────────────────────────────────────────────────────────────
{
  const base = {
    answerTexts: [],
    exposedTexts: [],
  };
  // 패밀리 충돌: 두 멤버가 KOR_CIRCLED 를 함께 사용
  const familyConflict = scanKoSetForLeakage(
    [
      { index: 0, typeId: "KO_RD_CONCEPT", markers: [
          { family: "KOR_CIRCLED", label: "㉠", spanText: "계약 자유의 원칙" },
        ], ...base },
      { index: 1, typeId: "KO_RD_INFER", markers: [
          { family: "KOR_CIRCLED", label: "㉡", spanText: "사회적 기본권" },
        ], ...base },
    ] as any,
    passage,
  );
  check(
    "family conflict blocks (regenerate later member)",
    familyConflict.status === "CONFLICT" &&
      familyConflict.conflicts.some(
        (c: any) => c.code === "ko-set-family-conflict" && c.severity === "ERROR" && c.regenerateIndex === 1,
      ),
    JSON.stringify(familyConflict),
  );

  // 예약 위반: allowedFamilies=[] 인데 마킹
  const forbidden = scanKoSetForLeakage(
    [
      { index: 0, typeId: "KO_LIT_BOGI", allowedFamilies: [], markers: [
          { family: "KOR_CIRCLED", label: "㉠", spanText: "계약 자유의 원칙" },
        ], ...base },
    ] as any,
    passage,
  );
  check(
    "forbidden family blocks (self regenerate)",
    forbidden.status === "CONFLICT" &&
      forbidden.conflicts.some((c: any) => c.code === "ko-set-family-forbidden" && c.regenerateIndex === 0),
  );

  // 정답 verbatim 노출: #0 노출면이 #1 정답을 연속 6어절+ 그대로 담음
  const leak = scanKoSetForLeakage(
    [
      { index: 0, typeId: "KO_RD_FACT", markers: [], answerTexts: [],
        exposedTexts: ["글쓴이는 국가는 노동법을 통해 계약 내용에 직접 개입하기 시작했다고 본다."] },
      { index: 1, typeId: "KO_NS_EXTRACT", markers: [],
        answerTexts: ["국가는 노동법을 통해 계약 내용에 직접 개입하기 시작했다"], exposedTexts: [] },
    ] as any,
    passage,
  );
  check(
    "answer leak blocks (regenerate exposer #0)",
    leak.status === "CONFLICT" &&
      leak.conflicts.some(
        (c: any) => c.code === "ko-set-answer-leak" && c.regenerateIndex === 0 && c.a === 0 && c.b === 1,
      ),
    JSON.stringify(leak),
  );

  // 정상 세트: 다른 패밀리·다른 문장·비인용 → 통과
  const clean = scanKoSetForLeakage(
    [
      { index: 0, typeId: "KO_RD_CONCEPT", markers: [
          { family: "KOR_CIRCLED", label: "㉠", spanText: "계약 자유의 원칙" },
        ], answerTexts: ["개인 보호의 한계"], exposedTexts: ["㉠에 대한 이해로 가장 적절한 것은?"] },
      { index: 1, typeId: "KO_RD_VOCAB", markers: [
          { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "형성" },
        ], answerTexts: ["②"], exposedTexts: ["문맥상 ⓐ와 바꿔 쓰기에 가장 적절한 것은?"] },
    ] as any,
    passage,
  );
  check("clean set passes", clean.status === "OK", JSON.stringify(clean.conflicts));

  // 같은 문장 마킹 → 경고(차단 아님)
  const sameSentence = scanKoSetForLeakage(
    [
      { index: 0, typeId: "KO_RD_CONCEPT", markers: [
          { family: "KOR_CIRCLED", label: "㉠", spanText: "계약 자유의 원칙" },
        ], ...base },
      { index: 1, typeId: "KO_RD_VOCAB", markers: [
          { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "시장의 힘" },
        ], ...base },
    ] as any,
    passage,
  );
  check(
    "same-sentence marks warn without blocking",
    sameSentence.status === "OK" &&
      sameSentence.conflicts.some((c: any) => c.code === "ko-set-same-sentence" && c.severity === "WARN"),
    JSON.stringify(sameSentence),
  );
}

// ── (3) 시험지 그룹화: KO 세트 공유지문 1박스 ───────────────────────────────
const mc5 = (answer: string) => [
  { label: "①", text: "첫 번째 진술이다." },
  { label: "②", text: "두 번째 진술이다." },
  { label: "③", text: "세 번째 진술이다." },
  { label: "④", text: "네 번째 진술이다." },
  { label: "⑤", text: "다섯 번째 진술이다." },
];
const koPassageRef = {
  id: "p-ko-1",
  title: "현대 사회와 법",
  content: passage,
  grade: null, semester: null, publisher: null, school: null,
};
function koMember(id: string, subType: string, direction: string, markers: any[]) {
  return {
    id,
    type: "MULTIPLE_CHOICE",
    subType,
    questionText: direction,
    structuredData: {
      _typeId: subType,
      direction,
      options: mc5("①"),
      correctAnswer: "①",
      markers,
    },
    options: JSON.stringify(mc5("①")),
    correctAnswer: "①",
    points: 2,
    difficulty: "INTERMEDIATE",
    tags: null,
    aiGenerated: true,
    approved: false,
    starred: false,
    createdAt: new Date().toISOString(),
    passage: koPassageRef,
    explanation: null,
    collectionItems: [],
    examLinks: [],
    _count: { examLinks: 0 },
    setId: "koset1",
    inSet: true,
  } as any;
}

{
  check("koSetGroupId/isKoSetGroupId roundtrip", isKoSetGroupId(koSetGroupId("koset1")));
  check("directive single", buildKoSetDirective([3]) === "[3] 다음 글을 읽고 물음에 답하시오.");
  check("directive range", buildKoSetDirective([2, 5, 3]) === "[2~5] 다음 글을 읽고 물음에 답하시오.");
  check(
    "readKoMarkersFromStructuredData parses JSON string",
    readKoMarkersFromStructuredData(
      JSON.stringify({ markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "x" }] }),
    ).length === 1,
  );

  const m1 = koMember("k1", "KO_RD_CONCEPT", "㉠에 대한 이해로 가장 적절한 것은?", [
    { family: "KOR_CIRCLED", label: "㉠", spanText: "계약 자유의 원칙" },
  ]);
  const m2 = koMember("k2", "KO_RD_VOCAB", "문맥상 ⓐ와 바꿔 쓰기에 가장 적절한 것은?", [
    { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "노동법" },
  ]);
  const item1 = makePaperItem(m1, 1, []);
  const item2 = makePaperItem(m2, 2, []);
  check("KO set member grouped by set:<setId>", item1.groupId === "set:koset1", String(item1.groupId));
  check("KO set member passage suppressed", item1.includePassage === false);
  check(
    "KO set member questionText has no injected passage",
    !item1.questionText.includes("인간의 존엄성은"),
    item1.questionText,
  );

  const groups = buildGroups([item1, item2]);
  check("KO set → single group", groups.length === 1, String(groups.length));
  const g = groups[0];
  check("KO set group renders shared passage", g.includePassage === true);
  check(
    "shared passage starts with [1~2] directive",
    g.passageContent.startsWith("[1~2] 다음 글을 읽고 물음에 답하시오."),
    g.passageContent.slice(0, 60),
  );
  check(
    "shared passage merges both members' markers",
    g.passageContent.includes("㉠__계약 자유의 원칙__") && g.passageContent.includes("ⓐ__노동법__"),
    g.passageContent,
  );
  check(
    "buildKoSetSharedPassage direct merge parity",
    buildKoSetSharedPassage(passage, [m1.structuredData, m2.structuredData]).includes(
      "㉠__계약 자유의 원칙__",
    ),
  );

  // KO 솔로(세트 아님): 기존 동작 유지 — single: 그룹 + 지문 동봉 기본 ON
  const solo = koMember("k3", "KO_RD_FACT", "윗글의 내용과 일치하지 않는 것은?", []);
  delete (solo as any).setId;
  delete (solo as any).inSet;
  const soloItem = makePaperItem(solo, 3, []);
  check("KO solo stays single: group", String(soloItem.groupId).startsWith("single:"));
  check("KO solo keeps inline passage default ON", soloItem.includePassage === true);
}

// ── (4) 영어 세트/솔로 무회귀 ───────────────────────────────────────────────
{
  const enBase =
    "Reliable sources confirm the news. The committee will review it carefully. They decided to delay the project because of concerns.";
  const enSetMember = {
    id: "e1",
    type: "MULTIPLE_CHOICE",
    subType: "REFERENCE",
    questionText: "다음 글의 밑줄 친 They가 가리키는 것은?",
    structuredData: {
      _typeId: "REFERENCE",
      _setMember: true,
      _isStructural: false,
      _spans: [
        {
          kind: "UNDERLINE",
          spanText: "They",
          surroundingText: "They decided to delay the project",
          findStrategy: "wordStrict",
        },
      ],
      underlinedPronoun: "They",
    },
    options: JSON.stringify([
      { label: "①", text: "the sources" },
      { label: "②", text: "the committee" },
    ]),
    correctAnswer: "②",
    points: 1,
    difficulty: "INTERMEDIATE",
    tags: null,
    aiGenerated: true,
    approved: false,
    starred: false,
    createdAt: new Date().toISOString(),
    passage: { id: "p-en", title: "EN", content: enBase, grade: null, semester: null, publisher: null, school: null },
    explanation: null,
    collectionItems: [],
    examLinks: [],
    _count: { examLinks: 0 },
    setId: "enset1",
    inSet: true,
  } as any;

  const enItem = makePaperItem(enSetMember, 1, []);
  check(
    "EN set member stays solo single: group (자기완결 렌더)",
    String(enItem.groupId).startsWith("single:"),
    String(enItem.groupId),
  );
  check(
    "EN set member keeps materialized __They__ underline in body",
    enItem.questionText.includes("__They__"),
    enItem.questionText,
  );
  const enGroups = buildGroups([enItem]);
  check("EN set member group renders no separate passage box", enGroups[0].includePassage === false);

  // 영어 솔로 CONTENT_MATCH: 그룹/지문 동작 무회귀
  const enSolo = { ...enSetMember, id: "e2", subType: "CONTENT_MATCH", structuredData: null, setId: undefined, inSet: false,
    questionText: "다음 글의 내용과 일치하는 것은?" };
  const enSoloItem = makePaperItem(enSolo, 2, []);
  check("EN solo stays single: group", String(enSoloItem.groupId).startsWith("single:"));
  check("EN solo CONTENT_MATCH keeps passage ON", enSoloItem.includePassage === true);
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-question-set-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const summary = runHarness();

test("ko question set: presets/leakage/paper grouping + EN regression", () => {
  assert.equal(
    summary.failed,
    0,
    `ko-question-set failures: ${JSON.stringify(summary.failures, null, 2)}`,
  );
  assert.ok(summary.passed >= 30, `expected ≥30 checks, got ${summary.passed}`);
});
