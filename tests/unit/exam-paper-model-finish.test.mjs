// MODEL-FINISH (26-09-30) — 공용 시험지 모델 마무리 3건의 계약.
//  1) 비세트 지문 묶음(passage:·pattern:…:passage:)에서 지문은 한 번만 — 앞 멤버가 문항 안에 지문을 그렸으면 뒤 멤버가 켠
//     그룹 박스를 buildGroups 가 끈다. 웹 조판(paginateGroups)·내보내기 계약(toPaperExportItems.printInlinePassage)·감사가
//     같은 결과를 본다. 판정은 그룹 id 와 지문의 빈/안 빈만 본다(감사 탐침이 문항마다 다른 토큰을 붙여도 같다).
//  2) makePaperItem(빌더에 새로 담은 문항)도 EXAM-PAPER-MODEL §3 순서(DB → structuredData._sourcePassage)로 지문을 읽는다 — 저장본 경로와 같다.
//  3) 「원문 지문 없음」 단일 판정: 지문이 있었다면 찍었을 문항만(강제 · 저장 true · 저장값 없음의 기본값 · 영어/KO 세트 공유 지문).
//     시험지 밖(백필의 원문 보관 대상)은 문맥 없는 호출 = 종전 판정(source 흐름 ∧ 내장 지문 없음).
// 기대값은 구현을 부르지 않는 손 계산이다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import * as savedMod from "@/components/exams/paper-builder/saved-paper-items";
import * as modelMod from "@/components/exams/paper-builder/paper-item-model";
import * as groupsMod from "@/components/exams/paper-builder/paper-item-groups";
import * as exportMod from "@/components/exams/paper-builder/paper-export-items";
import * as policyMod from "@/components/exams/paper-builder/passage-policy";
import * as paginationMod from "@/components/exams/paper-builder/pagination";

const pick = (m) => m.default ?? m["module.exports"] ?? m;
const saved = pick(savedMod);
const model = pick(modelMod);
const { buildGroups } = pick(groupsMod);
const { toPaperExportItems } = pick(exportMod);
const policy = pick(policyMod);
const { paginateGroups } = pick(paginationMod);

const P = "Digital spaces promised a democratic forum where every voice could be heard equally. In practice, the loudest and best funded voices dominate attention, and algorithms reward outrage over reflection, so the promise of equal participation remains unfulfilled for most users.";
const SPX = "Detached passage text preserved when the original passage was deleted by the academy.";
const FIVE = JSON.stringify([1, 2, 3, 4, 5].map((n) => ({ label: String(n), text: "choice " + n })));
const FIX = {
  TITLE: ["다음 글의 제목으로 가장 적절한 것은?", FIVE, {}],
  VOCAB_CHOICE: ["밑줄 친 (a)~(e) 중에서 문맥상 낱말의 쓰임이 적절하지 않은 것은?", FIVE, {}],
  WORD_ORDER: ["다음 글을 참고하여 주어진 단어를 바르게 배열하시오.\n\n[배열 단어] memory / is / an / archive", null, {}],
  CONDITIONAL_WRITING: ["[영작할 우리말] 기억은 두 가지 방법에 의존한다.\n\n[조건] 1. 주어진 단어를 활용할 것", null, {}],
  SUMMARY_COMPLETE: ["다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸에 알맞은 말을 쓰시오.\n\n[요약문] Memory relies on (A) ______ and (B) ______.", null, {}],
  SUMMARY_COMPLETE_MC: ["다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?", FIVE, {}],
  BLANK_INFERENCE: ["다음 빈칸에 들어갈 말로 가장 적절한 것은?\n\nThe brain stores data in a vast ________ that we access in two ways, recall and recognition, and each one works differently for learners who study.", FIVE, { passageWithBlank: "The brain stores data in a vast ________ archive." }],
};
function q(id, subType, o = {}) {
  const [questionText, options, sd] = FIX[subType];
  const structuredData = { ...sd, ...(o.sd ?? {}) };
  if (o.detached) structuredData._sourcePassage = o.detached;
  return {
    id, type: options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER", subType, questionText, structuredData, options,
    correctAnswer: "3", points: 2, difficulty: "MEDIUM", tags: null, aiGenerated: true, approved: true, starred: false,
    createdAt: "2026-09-01T00:00:00.000Z", setId: o.setId ?? null,
    passage: o.db === undefined ? null : { id: o.pid ?? "p-P", title: "Title", content: o.db, grade: null, semester: null, publisher: null, school: null },
    explanation: null, collectionItems: [], _count: { examLinks: 1 },
  };
}
const eq = (question, n) => ({ id: "eq-" + question.id, orderNum: n, points: 3, question });
const qBlock = (question, groupId, inc) => ({ localId: "L-" + question.id, blockType: "question", questionId: question.id, points: 3, groupId, includePassage: inc });
const v2 = (blocks) => ({ source: "exam-paper-builder-v2", version: 2, blocks });
const EXAM_FONT = { paperSize: "A4", columns: 2, density: "comfortable", passageStyle: "boxed", showAnswerSpace: true, showPassageTitle: true, showQuestionMeta: false, template: "clean", textMetrics: "exam-font" };

// 한 시험지의 지문 출력 수: 모델(buildGroups 박스 + 문항 안 지문) · 내보내기 계약 · 웹 조판(쪽 조각).
function emissions(questions, settings) {
  const items = saved.buildPaperItemsFromExam(questions.map((x, i) => eq(x, i + 1)), settings);
  const groups = buildGroups(items);
  const exp = toPaperExportItems(items);
  const modelCount = groups.filter((g) => g.includePassage && g.passageContent.trim()).length + exp.filter((e) => e.printInlinePassage).length;
  let boxStarts = 0;
  let inlineStarts = 0;
  for (const page of paginateGroups(groups, EXAM_FONT).pages) for (const col of page) for (const frag of col) {
    if (frag.includePassage && frag.passageRenderedLines.length > 0 && frag.passageStartLineIndex === 0) boxStarts += 1;
    for (const part of frag.parts) inlineStarts += part.structRows.filter((r) => r.style === "passage" && r.isSegStart).length;
  }
  return { model: modelCount, web: boxStarts + inlineStarts, box: boxStarts, inline: inlineStarts, groupBoxes: groups.map((g) => g.includePassage) };
}

const R = { bundle: {}, mpui3: {}, predicate: {}, backfill: {}, printSafe: {} };
{
  const t = q("t", "TITLE", { db: P });
  const v = q("v", "VOCAB_CHOICE", { db: P });
  const G = "passage:p-P";
  R.bundle.titleThenVocab = emissions([t, v], v2([qBlock(t, G, true), qBlock(v, G, true)]));
  // 감사 탐침처럼 문항마다 지문 끝 글자가 다르다(지문 행 id 도 문항마다 다르다 — 서버 라우트 모양).
  const tp = q("tp", "TITLE", { db: P + " qzxvaaaa", pid: "saved:tp" });
  const vp = q("vp", "VOCAB_CHOICE", { db: P + " qzxvaaab", pid: "saved:vp" });
  R.bundle.probeVariant = emissions([tp, vp], v2([qBlock(tp, G, true), qBlock(vp, G, true)]));
  R.bundle.similarId = emissions([t, v], v2([qBlock(t, "pattern:g1:passage:p-P", true), qBlock(v, "pattern:g1:passage:p-P", true)]));
  R.bundle.split = emissions([t, v], v2([qBlock(t, G, true), { localId: "B1", blockType: "text", blockText: "머리말" }, qBlock(v, G, true)]));
  R.bundle.vocabThenTitle = emissions([v, t], v2([qBlock(v, G, true), qBlock(t, G, true)]));
  R.bundle.customGroup = emissions([t, v], v2([qBlock(t, "custom:x", true), qBlock(v, "custom:x", true)]));
  R.bundle.vocabOff = emissions([t, v], v2([qBlock(t, G, true), qBlock(v, G, false)]));
  const ts = q("ts", "TITLE", { db: P, setId: "S1" });
  const vs = q("vs", "VOCAB_CHOICE", { db: P, setId: "S1" });
  R.bundle.englishSet = emissions([ts, vs], v2([qBlock(ts, "set:S1", true), qBlock(vs, "set:S1", true)]));
}

// 2) makePaperItem 이 보관본을 읽는다 — 저장본 경로(settings NULL = examQuestionToPaperItem)와 같은 값.
{
  const DET = { passageId: "p-gone", title: "보관 제목", content: SPX, detachedAt: "2026-09-29T00:00:00.000Z" };
  for (const sub of ["TITLE", "WORD_ORDER", "CONDITIONAL_WRITING", "SUMMARY_COMPLETE_MC"]) {
    const question = q("d-" + sub, sub, { detached: DET });
    const fresh = model.makePaperItem(question, 1, []);
    const reopen = saved.buildPaperItemsFromExam([eq(question, 1)], null)[0];
    const pick2 = (it) => ({ content: it.passageContent, title: it.passageTitle, id: it.sourceQuestion.passage?.id ?? null, inc: it.includePassage, missing: saved.isPaperItemSourcePassageMissing(it) });
    R.mpui3[sub] = { fresh: pick2(fresh), reopen: pick2(reopen) };
  }
  // DB 지문이 있으면 보관본은 쓰지 않는다(EXAM-PAPER-MODEL §3).
  const both = model.makePaperItem(q("both", "TITLE", { db: P, detached: DET }), 1, []);
  R.mpui3.dbWins = { content: both.passageContent, id: both.sourceQuestion.passage?.id };
}

// 3) 단일 판정 — 세트 · 강제 · 저장값.
{
  const one = (question, settings) => saved.buildPaperItemsFromExam([eq(question, 1)], settings)[0];
  const miss = (it) => saved.isPaperItemSourcePassageMissing(it);
  const gichul = { _gichul: { set: { key: "2025-11-41" } } };
  // 끌 수 있는 유형이라 세트 규칙이 없으면 저장 false 로 경고가 사라진다(강제 유형으로는 세트 규칙을 검증할 수 없다).
  const en = q("en", "WORD_ORDER", { setId: "S2" });
  R.predicate.englishSetSavedFalse = miss(one(en, v2([qBlock(en, "set:S2", false)])));
  const gi = q("gi", "TITLE", { sd: gichul });
  R.predicate.gichulSavedFalse = miss(one(gi, v2([qBlock(gi, "single:gi", false)])));
  R.predicate.gichulSavedTrue = miss(one(gi, v2([qBlock(gi, "single:gi", true)])));
  R.predicate.gichulNull = miss(one(gi, null));
  const sc = q("sc", "SUMMARY_COMPLETE");
  R.predicate.summaryCompleteSavedFalse = miss(one(sc, v2([qBlock(sc, "single:sc", false)])));
  const cw = q("cw", "CONDITIONAL_WRITING");
  R.predicate.cwNull = miss(one(cw, null));
  R.predicate.cwSavedTrue = miss(one(cw, v2([qBlock(cw, "single:cw", true)])));
  const wo = q("wo", "WORD_ORDER");
  R.predicate.woSavedFalse = miss(one(wo, v2([qBlock(wo, "single:wo", false)])));
  R.predicate.woNull = miss(one(wo, null));
  const bi = q("bi", "BLANK_INFERENCE");
  R.predicate.blankNull = miss(one(bi, null));
  // 빌더에서 지문 글을 다 지웠지만 DB 지문이 있다 → buildGroups 가 폴백해 찍으므로 경고 없음.
  const ed = one(q("ed", "TITLE", { db: P }), null);
  R.predicate.clearedSnapshot = miss({ ...ed, passageContent: "" });
}

// 백필(시험지 밖 — 문맥 없는 호출)은 종전 판정 그대로: source 흐름 ∧ 내장 지문 없음.
for (const sub of ["TITLE", "WORD_ORDER", "CONDITIONAL_WRITING", "SUMMARY_COMPLETE", "BLANK_INFERENCE", "VOCAB_CHOICE"]) {
  const [questionText, , sd] = FIX[sub];
  R.backfill[sub] = policy.isSourcePassageMissing({ subType: sub, questionText, structuredData: sd, passage: null });
}

// 지문 없는 문항의 includePassage 기본값(의도 기록)이 켜져도 아무것도 찍히지 않는다.
{
  const wo = q("pw", "WORD_ORDER");
  const t = q("pt", "TITLE");
  const r = emissions([wo, t], null);
  const items = saved.buildPaperItemsFromExam([eq(wo, 1), eq(t, 2)], null);
  R.printSafe = { ...r, inc: items.map((i) => i.includePassage) };
}

process.stdout.write(JSON.stringify(R));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-paper-model-finish-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
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

const R = runHarness();

test("지문 묶음: 앞 멤버(제목)가 문항 안에 지문을 그리면 뒤 멤버(어휘)가 켠 그룹 박스는 꺼진다 — 모델·조판·내보내기 1회", () => {
  const r = R.bundle.titleThenVocab;
  assert.deepEqual(r.groupBoxes, [false]);
  assert.equal(r.model, 1);
  assert.equal(r.web, 1, JSON.stringify(r));
  assert.equal(r.inline, 1);
  assert.equal(r.box, 0);
  // 유사 시험지 그룹 id(pattern:…:passage:)도 같은 규칙.
  assert.equal(R.bundle.similarId.web, 1);
  assert.equal(R.bundle.similarId.model, 1);
});

test("판정은 지문 글자·지문 행 id 에 기대지 않는다(감사 탐침 · 서버 라우트 모양에서도 같은 결과)", () => {
  assert.deepEqual(R.bundle.probeVariant.groupBoxes, [false]);
  assert.equal(R.bundle.probeVariant.model, 1);
  assert.equal(R.bundle.probeVariant.web, 1);
});

test("비문항 블록으로 끊긴 같은 묶음: 앞 조각의 문항 안 지문이 한 번 — 뒤 조각 박스도 꺼진다", () => {
  assert.deepEqual(R.bundle.split.groupBoxes, [false, false, false]);
  assert.equal(R.bundle.split.model, 1);
  assert.equal(R.bundle.split.web, 1);
});

test("바뀌지 않는 경우: 세트 · 박스를 원하는 멤버가 없음 · 지문 묶음이 아닌 그룹 · 박스 멤버가 앞(보고된 잔여)", () => {
  assert.deepEqual(R.bundle.englishSet.groupBoxes, [true]);
  assert.equal(R.bundle.englishSet.web, 1, "세트: 공유 박스 1 · 멤버 문항 안 지문 0");
  assert.equal(R.bundle.englishSet.inline, 0);
  assert.deepEqual(R.bundle.vocabOff.groupBoxes, [false]);
  assert.equal(R.bundle.vocabOff.web, 1);
  assert.deepEqual(R.bundle.customGroup.groupBoxes, [true], "그룹 id 로 같은 지문을 보장할 수 없으면 건드리지 않는다");
  assert.equal(R.bundle.customGroup.web, 2);
  assert.deepEqual(R.bundle.vocabThenTitle.groupBoxes, [true], "박스를 끄면 앞 멤버가 지문 없이 읽힌다 — 운영 0건, 보고");
  assert.equal(R.bundle.vocabThenTitle.web, 2);
  // 모든 경우 모델(내보내기 계약)과 웹 조판이 같은 수를 본다.
  for (const [name, r] of Object.entries(R.bundle)) assert.equal(r.model, r.web, name);
});

test("MPUI-3: 새로 담은 문항이 보관본을 지문으로 쓴다 — 저장본 경로와 지문·제목·id·기본값·판정이 같다", () => {
  for (const [sub, { fresh, reopen }] of Object.entries(R.mpui3).filter(([k]) => k !== "dbWins")) {
    assert.equal(fresh.content, "Detached passage text preserved when the original passage was deleted by the academy.", sub);
    assert.equal(fresh.title, "보관 제목", sub);
    assert.equal(fresh.id, "detached:p-gone", sub);
    assert.equal(fresh.missing, false, sub);
    assert.deepEqual(fresh, reopen, sub);
  }
  assert.equal(R.mpui3.TITLE.fresh.inc, true);
  assert.equal(R.mpui3.WORD_ORDER.fresh.inc, true);
  assert.equal(R.mpui3.CONDITIONAL_WRITING.fresh.inc, false);
  assert.equal(R.mpui3.dbWins.id, "p-P");
  assert.match(R.mpui3.dbWins.content, /^Digital spaces promised/);
});

test("「원문 지문 없음」 단일 판정: 지문이 있었다면 찍었을 문항만", () => {
  const p = R.predicate;
  assert.equal(p.englishSetSavedFalse, true, "영어 세트 공유 지문은 멤버 토글과 무관하게 찍힌다");
  assert.equal(p.gichulSavedFalse, false, "기출 세트 토글을 끈 것은 선생님 선택");
  assert.equal(p.gichulSavedTrue, true);
  assert.equal(p.gichulNull, true);
  assert.equal(p.summaryCompleteSavedFalse, true, "요약문 완성은 웹이 토글과 무관하게 지문을 그린다(강제)");
  assert.equal(p.cwNull, false, "정답 노출형 기본값은 꺼짐");
  assert.equal(p.cwSavedTrue, true);
  assert.equal(p.woSavedFalse, false, "끌 수 있는 유형의 저장 false 는 선생님 선택");
  assert.equal(p.woNull, true, "저장값 없음은 기본값(켬)");
  assert.equal(p.blankNull, false, "내장 지문 유형은 해당 없음");
  assert.equal(p.clearedSnapshot, false, "지운 스냅숏은 DB 지문으로 폴백해 찍힌다");
});

test("백필(시험지 밖 문맥 없는 호출)은 종전 판정 그대로 — 원문 보관 대상이 줄지 않는다", () => {
  assert.deepEqual(R.backfill, {
    TITLE: true, WORD_ORDER: true, CONDITIONAL_WRITING: true, SUMMARY_COMPLETE: true, BLANK_INFERENCE: false, VOCAB_CHOICE: false,
  });
});

test("지문 없는 문항의 기본값(의도 기록)이 켜져도 인쇄는 그대로 — 박스·문항 안 지문 0", () => {
  assert.deepEqual(R.printSafe.inc, [true, true]);
  assert.equal(R.printSafe.model, 0);
  assert.equal(R.printSafe.web, 0);
});
