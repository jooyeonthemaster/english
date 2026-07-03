import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 국어 지문 세트 — 적대검수 확정결함 수정 회귀 스위트 (F2-sets, 실LLM 0):
//   KOSET-1: cross-member 마커 스팬 겹침 → scanKoSetForLeakage ERROR
//            (ko-set-marker-overlap) + buildKoSetSharedPassage 방어 드롭
//            (앞 멤버 우선, __ 마크업 붕괴 0)
//   KOSET-2: HWPX break-plan 주 경로의 KO 세트 공유지문 개행 보존 —
//            웹(buildGroups)과 byte 동일 산출 + 영어 정규화 무회귀
//   KOSET-3: 빌더 그룹 조작의 세트 파손 방어 — 삽입점 스냅
//            (snapInsertIndexOutOfKoSetRun) + 지문별 재그룹 세트 보존
//            (computeRegroupedByPassage) → 고아 멤버 지문·마커 소실 0
//   KOSET-5: 크레딧 선차감 상한 = 실제 엔진 호출 상한(1 + REGEN_MAX)
// TS + "@/..." 앨리어스 → tsx 하니스(ko-question-set 미러).
const harnessSource = `
import leakage from "@/lib/korean/sets/leakage";
import setPaper from "@/lib/korean/sets/paper";
import presets from "@/lib/korean/sets/presets";
import paperUtils from "@/components/exams/paper-builder/paper-item-utils";
import paperItemsModule from "@/components/exams/exam-paper-builder-client-parts/use-paper-items";
import breakPlan from "@/app/api/exams/[examId]/export-hwpx/_lib/break-plan";
import textNormalization from "@/components/exams/paper-builder/text-normalization";

const { scanKoSetForLeakage } = leakage;
const { buildKoSetSharedPassage, koSetGroupId, isKoSetGroupId } = setPaper;
const { KO_SET_CHARGE_ATTEMPTS, KO_SET_MEMBER_REGEN_MAX } = presets;
const { makePaperItem, buildGroups } = paperUtils;
const { snapInsertIndexOutOfKoSetRun, computeRegroupedByPassage } = paperItemsModule;
const { computePaginatedLayout } = breakPlan;
const { normalizePassageText } = textNormalization;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed += 1;
  else failures.push(detail ? name + " :: " + detail : name);
}

// ── KOSET-1: cross-member 마커 스팬 겹침 ─────────────────────────────────────
const prosePassage =
  "그날 밤 나는 강가에서 어머니의 낡은 반짇고리를 오래도록 바라보았다. " +
  "달빛이 강물 위에 부서지며 낯익은 그림자를 만들었다. " +
  "나는 끝내 아무 말도 하지 못한 채 돌아섰다.";

{
  const base = { answerTexts: [], exposedTexts: [] };
  const overlapping = [
    { index: 0, typeId: "KO_RD_INFER", markers: [
        { family: "KOR_CIRCLED", label: "㉠", spanText: "어머니의 낡은 반짇고리를 오래도록" },
      ], ...base },
    { index: 1, typeId: "KO_RD_VOCAB", markers: [
        { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "반짇고리" },
      ], ...base },
  ] as any;

  const scan = scanKoSetForLeakage(overlapping, prosePassage);
  check(
    "KOSET-1: overlapping cross-member spans block as ERROR",
    scan.status === "CONFLICT" &&
      scan.conflicts.some(
        (c: any) =>
          c.code === "ko-set-marker-overlap" &&
          c.severity === "ERROR" &&
          c.a === 0 &&
          c.b === 1 &&
          c.regenerateIndex === 1,
      ),
    JSON.stringify(scan),
  );

  // 겹침 아님 + 같은 문장 → 종전대로 WARN 만(과차단 무회귀).
  const sameSentenceOnly = scanKoSetForLeakage(
    [
      { index: 0, typeId: "KO_RD_INFER", markers: [
          { family: "KOR_CIRCLED", label: "㉠", spanText: "그날 밤 나는" },
        ], ...base },
      { index: 1, typeId: "KO_RD_VOCAB", markers: [
          { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "반짇고리" },
        ], ...base },
    ] as any,
    prosePassage,
  );
  check(
    "KOSET-1: non-overlapping same-sentence stays WARN-only",
    sameSentenceOnly.status === "OK" &&
      !sameSentenceOnly.conflicts.some((c: any) => c.code === "ko-set-marker-overlap") &&
      sameSentenceOnly.conflicts.some((c: any) => c.code === "ko-set-same-sentence"),
    JSON.stringify(sameSentenceOnly),
  );

  // 다른 문장·비겹침 → 이슈 0 (무회귀).
  const clean = scanKoSetForLeakage(
    [
      { index: 0, typeId: "KO_RD_INFER", markers: [
          { family: "KOR_CIRCLED", label: "㉠", spanText: "낯익은 그림자" },
        ], ...base },
      { index: 1, typeId: "KO_RD_VOCAB", markers: [
          { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "반짇고리" },
        ], ...base },
    ] as any,
    prosePassage,
  );
  check("KOSET-1: disjoint markers stay clean", clean.status === "OK" && clean.conflicts.length === 0, JSON.stringify(clean));

  // 방어 렌더: 겹침 마커는 배열 원순서(앞 멤버) 우선으로 드롭 — __ 붕괴 0.
  const sdA = { markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "어머니의 낡은 반짇고리를 오래도록" }] };
  const sdB = { markers: [{ family: "LATIN_CIRCLED", label: "ⓐ", spanText: "반짇고리" }] };
  const merged = buildKoSetSharedPassage(prosePassage, [sdA, sdB]);
  check(
    "KOSET-1: defensive merge keeps front member marker intact",
    merged.includes("㉠__어머니의 낡은 반짇고리를 오래도록__"),
    merged,
  );
  check("KOSET-1: defensive merge drops overlapping back marker", !merged.includes("ⓐ"), merged);
  check(
    "KOSET-1: merged markup keeps balanced __ pairs",
    merged.split("__").length % 2 === 1,
    merged,
  );

  const mergedReversed = buildKoSetSharedPassage(prosePassage, [sdB, sdA]);
  check(
    "KOSET-1: reversed member order keeps first-in-array marker",
    mergedReversed.includes("ⓐ__반짇고리__") && !mergedReversed.includes("㉠"),
    mergedReversed,
  );

  // 비겹침 병합은 종전과 동일(양쪽 마커 모두 유지).
  const sdC = { markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "낯익은 그림자" }] };
  const mergedClean = buildKoSetSharedPassage(prosePassage, [sdC, sdB]);
  check(
    "KOSET-1: non-overlapping merge unchanged (both markers)",
    mergedClean.includes("㉠__낯익은 그림자__") && mergedClean.includes("ⓐ__반짇고리__"),
    mergedClean,
  );
}

// ── 공용 mock (KO 세트 멤버 + 영어 문항) ─────────────────────────────────────
const versePassage =
  "산에는 꽃 피네\\n꽃이 피네\\n갈 봄 여름 없이\\n꽃이 피네\\n산에\\n산에\\n피는 꽃은\\n저만치 혼자서 피어 있네";
const mc5 = [
  { label: "①", text: "첫 번째 진술이다." },
  { label: "②", text: "두 번째 진술이다." },
  { label: "③", text: "세 번째 진술이다." },
  { label: "④", text: "네 번째 진술이다." },
  { label: "⑤", text: "다섯 번째 진술이다." },
];
function koMember(id: string, subType: string, direction: string, markers: any[], passageContent: string, setId: string) {
  return {
    id,
    type: "MULTIPLE_CHOICE",
    subType,
    questionText: direction,
    structuredData: { _typeId: subType, direction, options: mc5, correctAnswer: "①", markers },
    options: JSON.stringify(mc5),
    correctAnswer: "①",
    points: 2,
    difficulty: "INTERMEDIATE",
    tags: null,
    aiGenerated: true,
    approved: false,
    starred: false,
    createdAt: new Date().toISOString(),
    passage: { id: "p-ko-verse", title: "진달래꽃", content: passageContent, grade: null, semester: null, publisher: null, school: null },
    explanation: null,
    collectionItems: [],
    examLinks: [],
    _count: { examLinks: 0 },
    setId,
    inSet: true,
  } as any;
}
function enQuestion(id: string, passageContent: string) {
  return {
    id,
    type: "MULTIPLE_CHOICE",
    subType: "BLANK_INFERENCE",
    questionText: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
    structuredData: null,
    options: JSON.stringify(mc5),
    correctAnswer: "①",
    points: 1,
    difficulty: "INTERMEDIATE",
    tags: null,
    aiGenerated: true,
    approved: false,
    starred: false,
    createdAt: new Date().toISOString(),
    passage: { id: "p-en-1", title: "EN", content: passageContent, grade: null, semester: null, publisher: null, school: null },
    explanation: null,
    collectionItems: [],
    examLinks: [],
    _count: { examLinks: 0 },
  } as any;
}

const koQ1 = koMember("k1", "KO_LIT_PHRASE", "㉠에 대한 이해로 가장 적절한 것은?", [
  { family: "KOR_CIRCLED", label: "㉠", spanText: "저만치 혼자서" },
], versePassage, "kset2");
const koQ2 = koMember("k2", "KO_LIT_MOTIF", "ⓐ의 기능으로 가장 적절한 것은?", [
  { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "갈 봄 여름" },
], versePassage, "kset2");
const enPassage =
  "Reliable sources confirm the news.\\n\\nThe committee will review it carefully. They decided to delay the project.";

// ── KOSET-2: HWPX break-plan 공유지문 개행 보존 + 웹 동일 산출 ───────────────
{
  // 웹 미리보기 산출(정답 기준) — makePaperItem 은 KO 세트 멤버 지문 정규화를 우회.
  const webItem1 = makePaperItem(koQ1, 1, []);
  const webItem2 = makePaperItem(koQ2, 2, []);
  const webGroup = buildGroups([webItem1, webItem2])[0];
  check("KOSET-2: web shared passage keeps verse line breaks", webGroup.passageContent.includes("\\n꽃이 피네"), webGroup.passageContent);

  const resolvedItems = [
    {
      localId: "L1", questionId: "k1", orderNum: 1, groupId: koSetGroupId("kset2"),
      includePassage: false, passageTitle: "", passageContent: versePassage,
      questionText: "㉠에 대한 이해로 가장 적절한 것은?", options: mc5,
      sourceQuestion: { subType: "KO_LIT_PHRASE", structuredData: koQ1.structuredData, passage: { content: versePassage } },
    },
    {
      localId: "L2", questionId: "k2", orderNum: 2, groupId: koSetGroupId("kset2"),
      includePassage: false, passageTitle: "", passageContent: versePassage,
      questionText: "ⓐ의 기능으로 가장 적절한 것은?", options: mc5,
      sourceQuestion: { subType: "KO_LIT_MOTIF", structuredData: koQ2.structuredData, passage: { content: versePassage } },
    },
  ] as any[];

  const layout = computePaginatedLayout({
    blocks: undefined,
    resolvedItems,
    layout: { paperSize: "A4", columns: 2, density: "comfortable" },
    template: "clean",
  });
  check("KOSET-2: paginated layout computed", !!layout && layout.pages.length > 0);
  if (layout) {
    const fragments = layout.pages.flat(2) as any[];
    const f0 = fragments.find((f) => f && f.includePassage);
    check("KOSET-2: shared passage fragment exists", !!f0);
    if (f0) {
      check(
        "KOSET-2: HWPX fragment passage preserves verse line breaks",
        f0.passageContent.includes("\\n꽃이 피네"),
        JSON.stringify(f0.passageContent.slice(0, 120)),
      );
      check(
        "KOSET-2: HWPX fragment passage byte-equals web preview",
        f0.passageContent === webGroup.passageContent,
        JSON.stringify({ hwpx: f0.passageContent.slice(0, 80), web: webGroup.passageContent.slice(0, 80) }),
      );
      check(
        "KOSET-2: merged markers survive in HWPX fragment",
        f0.passageContent.includes("㉠__저만치 혼자서__") && f0.passageContent.includes("ⓐ__갈 봄 여름__"),
        f0.passageContent,
      );
    }
  }

  // 영어 무회귀: 영어 문항 지문은 종전대로 normalizePassageText 로 접힌다.
  const enResolved = [
    {
      localId: "E1", questionId: "e1", orderNum: 1, groupId: "single:E1",
      includePassage: true, passageTitle: "", passageContent: enPassage,
      questionText: "다음 빈칸에 들어갈 말로 가장 적절한 것은?", options: mc5,
      sourceQuestion: { subType: "BLANK_INFERENCE", structuredData: {}, passage: { content: enPassage } },
    },
  ] as any[];
  const enLayout = computePaginatedLayout({
    blocks: undefined,
    resolvedItems: enResolved,
    layout: { paperSize: "A4", columns: 2, density: "comfortable" },
    template: "clean",
  });
  check("KOSET-2: EN layout computed", !!enLayout && enLayout.pages.length > 0);
  if (enLayout) {
    const enFrag = (enLayout.pages.flat(2) as any[]).find((f) => f && f.includePassage);
    check(
      "KOSET-2: EN passage still folded by normalizePassageText (무회귀)",
      !!enFrag && enFrag.passageContent === normalizePassageText(enPassage) && !enFrag.passageContent.includes("\\n"),
      enFrag ? JSON.stringify(enFrag.passageContent.slice(0, 120)) : "no fragment",
    );
  }
}

// ── KOSET-3: 삽입점 스냅 + 지문별 재그룹 세트 보존 ───────────────────────────
{
  const item1 = makePaperItem(koQ1, 1, []);
  const item2 = makePaperItem(koQ2, 2, []);
  const koQ3 = koMember("k3", "KO_LIT_EXPR", "윗글의 표현상 특징으로 적절한 것은?", [], versePassage, "kset2");
  const koQ4 = koMember("k4", "KO_LIT_BOGI", "<보기>를 참고할 때 적절한 것은?", [], versePassage, "kset2");
  const item3 = makePaperItem(koQ3, 3, []);
  const item4 = makePaperItem(koQ4, 4, []);
  const enItem = makePaperItem(enQuestion("e9", enPassage), 5, []);

  // 세트 내부(1|2 사이) 삽입 → 경계로 스냅(동률이면 세트 뒤 = index 2).
  check(
    "KOSET-3: insert between 2-member set snaps to boundary (after)",
    snapInsertIndexOutOfKoSetRun([item1, item2], 1, [enItem.groupId]) === 2,
    String(snapInsertIndexOutOfKoSetRun([item1, item2], 1, [enItem.groupId])),
  );
  // 4멤버 세트의 앞쪽 내부(index 1) → 가까운 앞 경계(0)로 스냅.
  check(
    "KOSET-3: insert near set head snaps to run start",
    snapInsertIndexOutOfKoSetRun([item1, item2, item3, item4], 1, [enItem.groupId]) === 0,
    String(snapInsertIndexOutOfKoSetRun([item1, item2, item3, item4], 1, [enItem.groupId])),
  );
  // 4멤버 세트의 뒤쪽 내부(index 3) → 가까운 뒤 경계(4)로 스냅.
  check(
    "KOSET-3: insert near set tail snaps to run end",
    snapInsertIndexOutOfKoSetRun([item1, item2, item3, item4], 3, [enItem.groupId]) === 4,
    String(snapInsertIndexOutOfKoSetRun([item1, item2, item3, item4], 3, [enItem.groupId])),
  );
  // 같은 세트 멤버의 세트 내부 재배열은 스냅하지 않는다.
  check(
    "KOSET-3: same-set member reorder is not snapped",
    snapInsertIndexOutOfKoSetRun([item1, item2, item3], 1, [item4.groupId]) === 1,
  );
  // 경계 삽입(세트 앞/뒤)은 그대로.
  check(
    "KOSET-3: boundary insert unchanged",
    snapInsertIndexOutOfKoSetRun([item1, item2], 0, [enItem.groupId]) === 0 &&
      snapInsertIndexOutOfKoSetRun([item1, item2], 2, [enItem.groupId]) === 2,
  );
  // 영어 지문 그룹("passage:") 내부 삽입은 무변경(무회귀).
  const enGrouped1 = { ...enItem, localId: "eg1", groupId: "passage:p-en-1" };
  const enGrouped2 = { ...enItem, localId: "eg2", groupId: "passage:p-en-1" };
  check(
    "KOSET-3: EN passage-group interior insert not snapped (무회귀)",
    snapInsertIndexOutOfKoSetRun([enGrouped1, enGrouped2], 1, [item1.groupId]) === 1,
  );

  // 스냅된 배치는 세트 그룹 1개 + 공유지문 1박스 + 전 멤버 마커(고아 0).
  const snapped = [item1, item2, enItem];
  const groups = buildGroups(snapped);
  const setGroups = groups.filter((g: any) => isKoSetGroupId(g.id));
  check("KOSET-3: snapped arrangement keeps one set group", setGroups.length === 1, String(setGroups.length));
  check(
    "KOSET-3: snapped set group renders shared passage with all markers",
    setGroups[0].includePassage === true &&
      setGroups[0].passageContent.includes("㉠__저만치 혼자서__") &&
      setGroups[0].passageContent.includes("ⓐ__갈 봄 여름__"),
    setGroups[0].passageContent,
  );

  // (재현 하니스 고정) 세트 사이에 끼면 뒤 그룹이 지문 억제(고아) — 스냅이 막는 위험.
  const brokenGroups = buildGroups([item1, enItem, item2]);
  const brokenSetGroups = brokenGroups.filter((g: any) => isKoSetGroupId(g.id));
  check(
    "KOSET-3: interleaved set indeed orphans later group (hazard fixture)",
    brokenSetGroups.length === 2 && brokenSetGroups[1].includePassage === false,
    JSON.stringify(brokenSetGroups.map((g: any) => g.includePassage)),
  );

  // 지문별 재그룹: KO 세트는 groupId·includePassage 보존 + 연속 재배열.
  const regrouped = computeRegroupedByPassage([item1, enItem, item2]);
  const koIndices = regrouped
    .map((it: any, i: number) => (isKoSetGroupId(it.groupId) ? i : -1))
    .filter((i: number) => i >= 0);
  check(
    "KOSET-3: regroup keeps set members contiguous",
    koIndices.length === 2 && koIndices[1] - koIndices[0] === 1,
    JSON.stringify(regrouped.map((it: any) => it.groupId)),
  );
  check(
    "KOSET-3: regroup preserves set groupId + suppressed inline passage",
    regrouped
      .filter((it: any) => isKoSetGroupId(it.groupId))
      .every((it: any) => it.groupId === koSetGroupId("kset2") && it.includePassage === false),
  );
  const regroupedGroups = buildGroups(regrouped);
  const regroupedSet = regroupedGroups.filter((g: any) => isKoSetGroupId(g.id));
  check(
    "KOSET-3: regrouped paper renders shared passage box (고아 0)",
    regroupedSet.length === 1 &&
      regroupedSet[0].includePassage === true &&
      regroupedSet[0].passageContent.includes("㉠__저만치 혼자서__") &&
      regroupedSet[0].passageContent.includes("ⓐ__갈 봄 여름__"),
    JSON.stringify(regroupedSet.map((g: any) => g.includePassage)),
  );
  // 영어 문항은 종전 규칙대로 passage: 그룹으로 재편(무회귀).
  const regroupedEn = regrouped.find((it: any) => it.questionId === "e9") as any;
  check(
    "KOSET-3: EN item still regrouped to passage:<id> (무회귀)",
    !!regroupedEn && regroupedEn.groupId === "passage:p-en-1",
    regroupedEn?.groupId,
  );
}

// ── KOSET-5: 선차감 상한 = 실제 엔진 호출 상한 ───────────────────────────────
{
  check(
    "KOSET-5: charge attempts equal per-member call ceiling (1 + regen max)",
    KO_SET_CHARGE_ATTEMPTS === 1 + KO_SET_MEMBER_REGEN_MAX,
    String(KO_SET_CHARGE_ATTEMPTS),
  );
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-set-fixes-harness.mts");
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

test("ko set fixes: marker overlap gate + HWPX line breaks + builder set guards + charge parity", () => {
  assert.equal(
    summary.failed,
    0,
    `ko-set-fixes failures: ${JSON.stringify(summary.failures, null, 2)}`,
  );
  assert.ok(summary.passed >= 20, `expected ≥20 checks, got ${summary.passed}`);
});
