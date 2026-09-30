// CORE-MODEL 수리 (26-09-30) — CM-R1 · CM-R2.
//  CM-R1: 기출 장문 세트 지문 토글이 「편집 → 실제 저장기 → 다시 열기」 왕복에서 살아남는가.
//         저장기는 손으로 흉내 내지 않는다. save-draft.ts 원본을 그대로 불러오고, 바깥 의존(sonner·서버 액션)만
//         바꾼 사본을 쓴다. 원본의 모양이 바뀌면 치환 단언이 먼저 실패한다.
//  CM-R2: 내보내기의 「문항 안 지문」(inlineSourcePassageForItem / PaperExportItem.printInlinePassage)이
//         웹 조판(pagination-metrics.buildStructLineBlocks)이 실제로 그리는 passage 행과 같은가
//         (세트 멤버는 억제 — structuredSegments 기준 계측의 거짓 양성).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");

// ── 실제 저장기(save-draft.ts)의 테스트 사본 ────────────────────────────────────
function saveDraftUnderTest() {
  let src = read("src/components/exams/exam-paper-builder-client-parts/save-draft.ts");
  const swap = (from, to) => {
    assert.ok(src.includes(from), `save-draft.ts 모양이 바뀌었다 — 치환 대상 없음: ${from}`);
    src = src.split(from).join(to);
  };
  swap('"use client";', "");
  swap('import { toast } from "sonner";', "const toast = { error: (..._a: unknown[]) => undefined, success: (..._a: unknown[]) => undefined };");
  swap(
    'import { saveExamPaperDraft } from "@/actions/exam-paper-builder";',
    // 서버 액션은 items·blocks 를 includePassage·groupId·passageContent 그대로 settings 에 싣는다
    // (src/actions/exam-paper-builder.ts saveExamPaperDraft — 정규화는 순번·배점·서식만).
    "export const __captured: { payload: any } = { payload: null };\n" +
      "const saveExamPaperDraft = async (_academyId: string, payload: any) => { __captured.payload = payload; return { success: true, id: \"exam-under-test\", error: undefined as string | undefined }; };",
  );
  swap('from "../paper-builder/', 'from "@/components/exams/paper-builder/');
  return src;
}

const harnessSource = String.raw`
import assert from "node:assert/strict";
import { queryExamBank } from "@/lib/exam-passages/question-bank";
import { getAllExamBankSets } from "@/lib/exam-passages/question-bank-sets";
import { primeBankSets, primeBankItems, bankItemToBuilderQuestion } from "@/lib/exam-passages/question-bank-client-builder";
import { makePaperItem, isSourcePassageForcedForItem } from "@/components/exams/paper-builder/paper-item-model";
import { buildGroups } from "@/components/exams/paper-builder/paper-item-groups";
import { buildPaperItemsFromExam, parseSavedPaperSettings } from "@/components/exams/paper-builder/saved-paper-items";
import { shouldForceSourcePassage } from "@/components/exams/paper-builder/passage-policy";
import { isFlowStructuredSubtype, isGichulSetMemberData, isGichulSetMemberItem, structuredSegments } from "@/components/exams/paper-builder/question-body-layout";
import { inlineSourcePassageForItem, toPaperExportItems } from "@/components/exams/paper-builder/paper-export-items";
import { buildStructLineBlocks } from "@/components/exams/paper-builder/pagination-metrics";
import { saveExamPaperDraftFromBuilder, __captured } from "./save-draft-under-test";

const BASE_INPUT = {
  academyId: "academy", savedExamId: null, title: "왕복", classId: "", schoolId: "", grade: "", semester: "",
  examType: "", examDate: "", totalPoints: 0, autoPointTotal: null, template: "clean", paperSize: "A4", columns: 2,
  density: "comfortable", forceTwoPerPage: false, showAnswerSpace: true, showPassageTitle: false, showQuestionMeta: false,
  passageStyle: "boxed", subtitle: "", studentNameLabel: "이름", instructions: "", academyLogoDataUrl: null,
  cover: { enabled: false, template: "classic", eyebrow: "", footnote: "", showLogo: true, showInfo: true },
  classes: [], schools: [],
};

async function save(paperItems) {
  __captured.payload = null;
  const result = await saveExamPaperDraftFromBuilder({ ...BASE_INPUT, paperItems });
  assert.equal(result.success, true);
  const p = __captured.payload;
  return JSON.stringify({ source: "exam-paper-builder-v2", version: 2, template: p.template, layout: p.layout, header: p.header,
    items: p.items.map((it, i) => ({ ...it, blockType: "question", orderNum: i + 1 })), blocks: p.blocks });
}

// use-paper-items.updateItem 과 같은 토글(기출 세트 멤버면 같은 groupId 의 잠기지 않은 멤버 전체에 공유).
function toggle(items, localId, value) {
  const target = items.find((i) => i.localId === localId);
  assert.equal(isSourcePassageForcedForItem(target), false, "기출 세트 토글이 잠겨 있다");
  const shared = isGichulSetMemberItem(target);
  return items.map((item) =>
    (shared && item.groupId === target.groupId && !item.locked) || item.localId === localId
      ? { ...item, includePassage: value }
      : item,
  );
}
const shown = (items) => buildGroups(items).map((g) => g.includePassage && Boolean(g.passageContent.trim()));
const incl = (items) => items.map((i) => i.includePassage);

// 기출 예외를 뺀 옛 강제 판정 — 「이 세트는 예전 저장기가 지문을 true 로 덮어쓰던 멤버를 가졌나」를 세는 데만 쓴다.
const legacyForced = (item) => {
  const raw = item.sourceQuestion.structuredData;
  const sd = typeof raw === "string" ? JSON.parse(raw) : { ...(raw ?? {}) };
  delete sd._gichul;
  return shouldForceSourcePassage({ ...item.sourceQuestion, structuredData: sd,
    passage: { content: item.passageContent || item.sourceQuestion.passage?.content || "" } });
};

async function main() {
  const out = { sets: 0, withForcedMember: 0, overwritten: 0, fail: [], inline: [], bankInlineNonEmpty: 0 };
  // ── CM-R1: 은행 기출 장문 세트 전부 ──────────────────────────────────────────
  for (const set of getAllExamBankSets()) {
    const response = queryExamBank({ ids: [set.key] }, { full: true });
    primeBankItems(response.fullItems);
    primeBankSets(response.sets);
    const questions = response.fullItems.map((m) => bankItemToBuilderQuestion(m, null));
    const exam = questions.map((q, i) => ({ orderNum: i + 1, points: q.points, question: q }));
    const reopen = async (items) => buildPaperItemsFromExam(exam, parseSavedPaperSettings(await save(items)));
    const items0 = questions.map((q, i) => makePaperItem(q, i + 1, []));
    out.sets += 1;
    if (items0.some(legacyForced)) out.withForcedMember += 1;
    for (const it of items0) out.bankInlineNonEmpty += inlineSourcePassageForItem(it) ? 1 : 0;
    const check = (label, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) out.fail.push({ set: set.key, label, a, b }); };

    const same = await reopen(items0);
    check("open→save→reopen shown", shown(same), shown(items0));
    check("open→save→reopen include", incl(same), incl(items0));

    const off = toggle(items0, items0[0].localId, false);
    check("preview off hidden", shown(off), [false]);
    const savedOff = JSON.parse(await save(off));
    if (savedOff.blocks.some((b) => b.includePassage === true)) out.overwritten += 1;
    const reopenedOff = buildPaperItemsFromExam(exam, parseSavedPaperSettings(JSON.stringify(savedOff)));
    check("off→save→reopen = preview", shown(reopenedOff), shown(off));
    check("off→save→reopen include", incl(reopenedOff), incl(off));
    const againOff = await reopen(reopenedOff);
    check("off second save stable", shown(againOff), [false]);

    const on = toggle(reopenedOff, reopenedOff[0].localId, true);
    const reopenedOn = await reopen(on);
    check("on→save→reopen = preview", shown(reopenedOn), shown(on));
    check("on shown", shown(on), [true]);
  }

  // ── 강제 판정의 기출 예외 — 모양(객체·JSON 문자열·중첩 문자열)별로 isGichulSetMemberData 와 같은가 ────
  const gd = { _gichul: { set: { key: "fx-41-45", label: "43~45", qNums: [43, 44, 45] } } };
  const P = "The passage body that every member shares for this long reading set in the fixture.";
  const q = (id, subType, sd = gd, setId = "S") => ({ id, type: "MULTIPLE_CHOICE", subType, questionText: "문항 " + id,
    structuredData: sd, options: JSON.stringify([1, 2, 3, 4, 5].map((n) => ({ label: String(n), text: "c" + n }))),
    correctAnswer: "1", points: 2, difficulty: "MEDIUM", tags: null, aiGenerated: false, approved: true, starred: false,
    createdAt: "", setId, passage: { id: "p", title: "T", content: P, grade: null, semester: null, publisher: null, school: null },
    explanation: null, collectionItems: [], examLinks: [], _count: { examLinks: 0 } });
  const shapes = [gd, JSON.stringify(gd), { _gichul: JSON.stringify(gd._gichul) }, { _gichul: { set: JSON.stringify(gd._gichul.set) } },
    { _gichul: { set: { key: "" } } }, { _gichul: { footnotes: ["x"] } }, {}, null, "not json", { _gichul: "nope" }];
  out.rule = shapes.map((sd) => ({ member: isGichulSetMemberData(sd),
    forced: shouldForceSourcePassage({ subType: "TITLE", questionText: "제목으로 가장 적절한 것은?", structuredData: sd, passage: { content: P } }) }));

  // ── CM-R2: 문항 안 지문 = 웹 조판 passage 행 ────────────────────────────────
  const SUBS = ["TITLE", "MAIN_IDEA", "TOPIC", "CONTENT_MATCH", "SUMMARY_COMPLETE", "SUMMARY_COMPLETE_MC", "SUMMARY_WRITING",
    "TOPIC_SENTENCE_WRITING", "WORD_ORDER", "CONDITIONAL_WRITING", "SENTENCE_TRANSFORM", "SYNONYM", "BLANK_INFERENCE",
    "SENTENCE_ORDER", "SENTENCE_INSERT", "GRAMMAR_ERROR", "UNLISTED_TYPE"]; // UNLISTED = 흐름 규칙 없음(비구조화)
  const settings = { paperSize: "A4", columns: 2, density: "comfortable", passageStyle: "boxed", showAnswerSpace: true,
    showPassageTitle: false, showQuestionMeta: false, template: "clean" };
  for (const sub of SUBS) for (const kind of ["single", "english-set", "gichul-set"]) for (const inc of [true, false]) {
    const question = q(sub + kind, sub, kind === "gichul-set" ? gd : {}, kind === "single" ? null : "S-" + kind);
    const item = { ...makePaperItem(question, 1, []), includePassage: inc };
    const group = buildGroups([item])[0];
    // pagination.ts 와 같은 호출 조건(구조화 유형만 구조화 본문 행을 만든다 — 아래 소스 앵커 테스트가 잠근다).
    const web = (isFlowStructuredSubtype(sub) ? buildStructLineBlocks(item, group, settings) : [])
      .filter((b) => b.kind === "struct-line" && b.style === "passage").map((b) => b.line).join("");
    const segBox = structuredSegments(item).some((s) => s.kind === "box" && s.boxStyle === "passage");
    const inline = inlineSourcePassageForItem(item);
    const exported = toPaperExportItems([item])[0];
    // 저장값 false 로 다시 열었을 때의 판정값(강제 유형이면 true) — 소비처가 includePassage 로 재해석하면 이중 출력.
    const resolved = buildPaperItemsFromExam([{ orderNum: 1, points: 2, question }], { source: "exam-paper-builder-v2", blocks: [
      { localId: "L1", blockType: "question", questionId: question.id, orderNum: 1, groupId: question.setId ? "set:" + question.setId : "single:L1", includePassage: false },
    ] })[0];
    out.inline.push({ sub, kind, inc, web: web.replace(/\s+/g, ""), inline: inline.replace(/\s+/g, ""), segBox,
      exported: exported.printInlinePassage === inline, savedFalseInclude: resolved.includePassage,
      savedFalseInline: inlineSourcePassageForItem(resolved), groupBox: group.includePassage });
  }
  process.stdout.write(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exit(1); });
`;

function runHarness() {
  const dir = mkdtempSync(path.join(repoRoot, ".tmp-core-roundtrip-"));
  try {
    writeFileSync(path.join(dir, "save-draft-under-test.ts"), saveDraftUnderTest(), "utf8");
    const file = path.join(dir, "check.ts");
    writeFileSync(file, harnessSource, "utf8");
    const raw = execFileSync(process.execPath, ["--conditions=react-server", "--import=tsx", file], {
      cwd: repoRoot, encoding: "utf8", timeout: 240000, maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(raw);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const R = runHarness();

test("CM-R1: every bank gichul set survives edit → real save-draft serializer → reopen (toggle off/on, twice)", (t) => {
  t.diagnostic(`bank sets ${R.sets}, legacy-forced member sets ${R.withForcedMember}, inline cells ${R.inline.length}`);
  assert.ok(R.sets >= 100, `bank sets ${R.sets}`);
  assert.deepEqual(R.fail.slice(0, 5), [], `${R.fail.length} round-trip mismatches`);
  // 예전 저장기가 덮어쓰던 강제형 멤버(41 TITLE·45 CONTENT_MATCH)를 가진 세트가 대부분이다 — 왕복이 결함 경로를 지난다.
  assert.ok(R.withForcedMember > R.sets / 2, `${R.withForcedMember}/${R.sets}`);
});

test("CM-R1: builder toggle stays shared across the gichul set (use-paper-items anchor)", () => {
  const hook = read("src/components/exams/exam-paper-builder-client-parts/use-paper-items.ts");
  assert.match(hook, /const sharedPassage = target && isGichulSetMemberItem\(target\) && patch\.includePassage !== undefined;/);
  assert.match(hook, /if \(sharedPassage && item\.groupId === target\.groupId && !item\.locked\)/);
});

test("CM-R1: shouldForceSourcePassage exempts exactly the gichul set members (same test as isGichulSetMemberData)", () => {
  assert.deepEqual(R.rule.map((r) => r.member), [true, true, true, true, false, false, false, false, false, false]);
  for (const r of R.rule) assert.equal(r.forced, !r.member);
  // 저장본은 선생님 토글을 그대로 담는다 — 은행 세트를 끄고 저장하면 true 로 남는 멤버가 없다.
  assert.equal(R.overwritten, 0);
});

test("CM-R2: printInlinePassage equals the passage rows the web layout actually draws", () => {
  const bad = R.inline.filter((row) => row.web !== row.inline || !row.exported);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} cells disagree`);
  assert.equal(R.bankInlineNonEmpty, 0);
  // 흐름 규칙 없는 유형: structuredSegments 는 passage 박스를 내지만 웹은 구조화 본문을 그리지 않고 그룹 박스로 찍는다.
  const unlisted = R.inline.find((r) => r.sub === "UNLISTED_TYPE" && r.kind === "single" && r.inc);
  assert.deepEqual([unlisted.segBox, unlisted.inline, unlisted.groupBox], [true, "", true]);
});

test("CM-R2: web layout anchors — only structured subtypes build struct rows, set members drop the passage box", () => {
  const pagination = read("src/components/exams/paper-builder/pagination.ts");
  assert.match(pagination, /const structured = isFlowStructuredSubtype\(subType\);/);
  assert.match(pagination, /const structBlocks = structured \? buildStructLineBlocks\(item, group, settings\) : \[\];/);
  const metrics = read("src/components/exams/paper-builder/pagination-metrics.ts");
  assert.match(metrics, /\(seg\) => !\(isSetMember && seg\.kind === "box" && seg\.boxStyle === "passage"\)/);
  const page = read("src/components/exams/paper-builder/components/a4-paper-page.tsx");
  assert.match(page, /const usesStructuredBody =\s*!isCustomBlock && isFlowStructuredSubtype\(subType\);/);
});

test("CM-R2: set members never carry an in-question passage even when forced (structuredSegments false positive)", () => {
  const eng = R.inline.filter((row) => row.kind === "english-set" && ["TITLE", "MAIN_IDEA", "CONTENT_MATCH", "SUMMARY_COMPLETE_MC"].includes(row.sub));
  assert.equal(eng.length, 8);
  for (const row of eng) {
    assert.equal(row.inline, "", row.sub);
    // 저장값 false 여도 강제 규칙으로 true — includePassage 로 재해석하면 그룹 지문 + 문항 안 지문 이중 출력.
    assert.equal(row.savedFalseInclude, true, row.sub);
    assert.equal(row.savedFalseInline, "", row.sub);
    assert.equal(row.groupBox, true, row.sub);
  }
  assert.ok(eng.some((row) => row.segBox), "structuredSegments 는 세트 멤버에도 passage 박스를 낸다(억제는 조판 단계)");
  for (const row of R.inline.filter((r) => r.kind === "gichul-set")) assert.equal(row.inline, "", row.sub);
});

test("CM-R2: single structured items keep their in-question passage exactly where the web shows it", () => {
  const single = Object.fromEntries(R.inline.filter((r) => r.kind === "single").map((r) => [`${r.sub}:${r.inc}`, r.inline !== ""]));
  for (const sub of ["TITLE", "MAIN_IDEA", "TOPIC", "CONTENT_MATCH", "SUMMARY_COMPLETE", "SUMMARY_COMPLETE_MC", "SUMMARY_WRITING", "TOPIC_SENTENCE_WRITING"]) {
    assert.equal(single[`${sub}:true`], true, sub);
  }
  for (const sub of ["SUMMARY_COMPLETE", "SUMMARY_COMPLETE_MC", "SUMMARY_WRITING", "TOPIC_SENTENCE_WRITING"]) {
    assert.equal(single[`${sub}:false`], true, `${sub} 는 토글과 무관하게 웹이 그린다`);
  }
  assert.equal(single["WORD_ORDER:false"], false);
  for (const sub of ["BLANK_INFERENCE", "SENTENCE_ORDER", "SENTENCE_INSERT", "GRAMMAR_ERROR"]) {
    assert.equal(single[`${sub}:true`], false, sub);
  }
});
