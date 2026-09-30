// 워크벤치 서버 액션(지문 분석·마킹·폴더·문제 편집)의 학원 범위 + _sourcePassage 보존 — 실제 액션 코드를
// 가짜 Prisma 위에서 돌린다. 모든 시나리오는 세션 학원 A, 공격 대상은 학원 B 의 id 다.
// 각 거부 검사에는 같은 액션의 자기 학원 성공 검사(양성 대조)를 짝지어 「그냥 다 실패」를 초록으로 보지 않는다.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const kit = require("./kit.cjs");
const { A, B, checkAsync, report, fresh, snapshotB, leaks } = kit;

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const annotations: Any = require("@/actions/workbench/annotations");
const colP: Any = require("@/actions/workbench/collections-passage");
const colQ: Any = require("@/actions/workbench/collections-question");
const colD: Any = require("@/actions/workbench/collections-draft");
const questions: Any = require("@/actions/workbench/questions");
const aiEdit: Any = require("@/actions/workbench/question-ai-edit");
const stats: Any = require("@/actions/workbench/stats");

const sp = (db: Any, id: string) => {
  const sd = db.tables.question.find((q: Any) => q.id === id)?.structuredData;
  const rec = typeof sd === "string" ? JSON.parse(sd) : sd;
  return rec?._sourcePassage ?? null;
};

// ── annotations.ts ─────────────────────────────────────────────────────────
await checkAsync("getPassageAnnotations: 남의 학원 지문 → 빈 목록", async () => {
  fresh();
  const r = await annotations.getPassageAnnotations("pB");
  return Array.isArray(r) && r.length === 0 && !leaks(r);
});
await checkAsync("getPassageAnnotations: 자기 학원 지문 → 마킹 1개(양성 대조)", async () => {
  fresh();
  const r = await annotations.getPassageAnnotations("pA");
  return r.length === 1 && r[0].text === "a-note";
});
await checkAsync("updatePassageAnalysis: 남의 학원 분석은 덮어쓰지 않는다", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const r = await annotations.updatePassageAnalysis("pB", '{"hacked":true}');
  return r.success === false && snapshotB(db) === before;
});
await checkAsync("updatePassageAnalysis: 자기 학원 분석은 저장된다(양성 대조)", async () => {
  const db = fresh();
  const r = await annotations.updatePassageAnalysis("pA", '{"edited":true}');
  return r.success === true && db.tables.passageAnalysis.find((x: Any) => x.id === "anA").analysisData === '{"edited":true}';
});

// ── collections-passage.ts ─────────────────────────────────────────────────
await checkAsync("getPassageCollections: 인자 academyId 를 믿지 않는다(B 를 넘겨도 A 폴더만)", async () => {
  fresh();
  const r = await colP.getPassageCollections(B);
  const ids = r.map((c: Any) => c.id).sort();
  return JSON.stringify(ids) === JSON.stringify(["cA", "cA2"]);
});
await checkAsync("getPassageCollectionItems: 남의 학원 폴더 → 빈 목록(본문 누출 없음)", async () => {
  fresh();
  const r = await colP.getPassageCollectionItems("cB");
  return r.length === 0 && !leaks(r);
});
await checkAsync("getPassageCollectionItems: 자기 폴더 → 지문(양성 대조)", async () => {
  fresh();
  const r = await colP.getPassageCollectionItems("cA");
  return r.length === 1 && r[0].id === "pA";
});
await checkAsync("updatePassageCollection: 남의 학원 폴더는 거부 · 변경 없음", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const r = await colP.updatePassageCollection("cB", { name: "hacked" });
  return r.success === false && snapshotB(db) === before;
});
await checkAsync("updatePassageCollection: 허용 필드만(academyId·parentId 대량 할당 무시)", async () => {
  const db = fresh();
  const r = await colP.updatePassageCollection("cA", { name: "새 이름", academyId: B, parentId: "cB", subject: "KOREAN" });
  const row = db.tables.passageCollection.find((c: Any) => c.id === "cA");
  return r.success === true && row.name === "새 이름" && row.academyId === A && row.parentId === null && row.subject === undefined;
});
await checkAsync("deletePassageCollection: 남의 학원 폴더는 지워지지 않는다", async () => {
  const db = fresh();
  const r = await colP.deletePassageCollection("cB");
  return r.success === false && db.tables.passageCollection.some((c: Any) => c.id === "cB");
});
await checkAsync("deletePassageCollection: 자기 폴더는 지워진다(양성 대조)", async () => {
  const db = fresh();
  const r = await colP.deletePassageCollection("cA2");
  return r.success === true && !db.tables.passageCollection.some((c: Any) => c.id === "cA2");
});
await checkAsync("addPassagesToCollection: 남의 학원 지문은 담기지 않는다", async () => {
  const db = fresh();
  const r = await colP.addPassagesToCollection("cA", ["pB", "pA2", "pA2"]);
  const items = db.tables.passageCollectionItem.filter((i: Any) => i.collectionId === "cA").map((i: Any) => i.passageId).sort();
  return r.success === true && JSON.stringify(r.addedIds) === '["pA2"]' && JSON.stringify(items) === '["pA","pA2"]';
});
await checkAsync("addPassagesToCollection: 남의 학원 폴더에는 담지 못한다", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const r = await colP.addPassagesToCollection("cB", ["pA"]);
  return r.success === false && snapshotB(db) === before;
});
await checkAsync("removePassagesFromCollection: 남의 학원 폴더에서 빼지 못한다", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const r = await colP.removePassagesFromCollection("cB", ["pB"]);
  return r.success === false && snapshotB(db) === before;
});
await checkAsync("removePassagesFromCollection: 자기 폴더에서는 빠진다(양성 대조)", async () => {
  const db = fresh();
  const r = await colP.removePassagesFromCollection("cA", ["pA"]);
  return r.success === true && JSON.stringify(r.removedIds) === '["pA"]' && !db.tables.passageCollectionItem.some((i: Any) => i.id === "ciA");
});
await checkAsync("createPassageCollection: 남의 학원 폴더 아래로 만들지 못한다", async () => {
  const db = fresh();
  const n = db.tables.passageCollection.length;
  const bad = await colP.createPassageCollection({ name: "x", parentId: "cB" });
  const ok = await colP.createPassageCollection({ name: "y", parentId: "cA" });
  return bad.success === false && ok.success === true && db.tables.passageCollection.length === n + 1;
});

// ── collections-question.ts ────────────────────────────────────────────────
await checkAsync("getQuestionCollections: 인자 academyId 를 믿지 않는다", async () => {
  fresh();
  const r = await colQ.getQuestionCollections(B);
  return r.length === 1 && r[0].id === "qcA";
});
await checkAsync("update/deleteQuestionCollection: 남의 학원 폴더 거부 · 변경 없음", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const u = await colQ.updateQuestionCollection("qcB", { name: "hacked" });
  const d = await colQ.deleteQuestionCollection("qcB");
  const own = await colQ.updateQuestionCollection("qcA", { name: "새", academyId: B });
  const row = db.tables.questionCollection.find((c: Any) => c.id === "qcA");
  return u.success === false && d.success === false && snapshotB(db) === before && own.success === true && row.name === "새" && row.academyId === A;
});
await checkAsync("add/removeQuestionsFromCollection: 남의 학원 문제·폴더 차단", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const add = await colQ.addQuestionsToCollection("qcA", ["qB", "qDet"]);
  const addForeign = await colQ.addQuestionsToCollection("qcB", ["qA"]);
  const rm = await colQ.removeQuestionsFromCollection("qcB", ["qB"]);
  const inA = db.tables.questionCollectionItem.filter((i: Any) => i.collectionId === "qcA").map((i: Any) => i.questionId).sort();
  return JSON.stringify(add.addedIds) === '["qDet"]' && addForeign.success === false && rm.success === false
    && JSON.stringify(inA) === '["qA","qDet"]' && snapshotB(db) === before;
});
await checkAsync("createQuestionCollection: 남의 학원 상위 폴더 거부", async () => {
  fresh();
  const r = await colQ.createQuestionCollection({ name: "x", parentId: "qcB" });
  return r.success === false;
});

// ── collections-draft.ts ───────────────────────────────────────────────────
await checkAsync("M1 초안 폴더: 목록·수정·삭제·상위 폴더가 학원 범위", async () => {
  const db = fresh();
  const list = await colD.getM1DraftCollections(B);
  const u = await colD.updateM1DraftCollection("dcB", { name: "hacked" });
  const d = await colD.deleteM1DraftCollection("dcB");
  const c = await colD.createM1DraftCollection({ name: "x", parentId: "dcB" });
  const own = await colD.updateM1DraftCollection("dcA", { name: "새", academyId: B });
  const rowB = db.tables.m1PassageDraftCollection.find((r: Any) => r.id === "dcB");
  const rowA = db.tables.m1PassageDraftCollection.find((r: Any) => r.id === "dcA");
  return list.length === 1 && list[0].id === "dcA" && u.success === false && d.success === false && c.success === false
    && rowB.name === "B초안폴더" && own.success === true && rowA.name === "새" && rowA.academyId === A;
});

// ── questions.ts ───────────────────────────────────────────────────────────
await checkAsync("getWorkbenchQuestion: 남의 학원 문제 → null(본문·해설 누출 없음)", async () => {
  fresh();
  const r = await questions.getWorkbenchQuestion("qB");
  const own = await questions.getWorkbenchQuestion("qA");
  return r === null && own?.id === "qA";
});
await checkAsync("updateWorkbenchQuestion: 남의 학원 문제는 바뀌지 않는다", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const r = await questions.updateWorkbenchQuestion("qB", { questionText: "hacked", explanation: "hacked" });
  return r.success === false && snapshotB(db) === before;
});
await checkAsync("toggleQuestionStar: 남의 학원 문제 거부 · 자기 문제 반영", async () => {
  const db = fresh();
  const bad = await questions.toggleQuestionStar("qB");
  const ok = await questions.toggleQuestionStar("qA");
  return bad.success === false && db.tables.question.find((q: Any) => q.id === "qB").starred === false
    && ok.success === true && db.tables.question.find((q: Any) => q.id === "qA").starred === true;
});
await checkAsync("getWorkbenchQuestionsGroupedByPassage: 인자 academyId 를 믿지 않는다", async () => {
  fresh();
  const r = await questions.getWorkbenchQuestionsGroupedByPassage(B, {});
  return !leaks(r) && JSON.stringify(r).includes("A 지문");
});
await checkAsync("getWorkbenchStats: 인자 academyId 를 믿지 않는다(A 의 지문 수)", async () => {
  fresh();
  const r = await stats.getWorkbenchStats(B);
  return r.totalPassages === 4;
});

// _sourcePassage 보존 — 명시 structuredData(위조 값 포함) · JSON 문자열 저장본 · AI 적용 · 새 문항으로 저장
await checkAsync("updateWorkbenchQuestion: 명시 structuredData 가 와도 _sourcePassage 를 잇고 위조 값은 버린다", async () => {
  const db = fresh();
  const r = await questions.updateWorkbenchQuestion("qDet", {
    structuredData: { questionText: "편집됨", _sourcePassage: { content: "FORGED" } },
  });
  const s = sp(db, "qDet");
  return r.success === true && s?.content === "Kept original." && s?.passageId === "pGone";
});
await checkAsync("updateWorkbenchQuestion: JSON 문자열 저장본도 문자열 안에서 보존", async () => {
  const db = fresh();
  const r = await questions.updateWorkbenchQuestion("qDetStr", {
    structuredData: JSON.stringify({ questionText: "편집됨" }),
  });
  const raw = db.tables.question.find((q: Any) => q.id === "qDetStr").structuredData;
  return r.success === true && typeof raw === "string" && sp(db, "qDetStr")?.content === "String kept.";
});
// structuredData 를 보내지 않는 직접 수정(구조화 문제 _typeId) — 두 분기가 각자 structuredData 를 새로 만든다.
// 분기마다 따로 보는 이유: 순수 함수(preserveSourcePassage)만 무력화하는 변이로는 호출 지점 누락이 가려진다.
const TYPED_SNAPSHOT = { passageId: "pGoneT", title: "지운 지문T", content: "Typed kept.", detachedAt: "2026-09-29T00:00:00.000Z" };
function addTypedDetached(db: Any, id: string) {
  db.tables.question.push({
    id, academyId: A, passageId: null, type: "MULTIPLE_CHOICE", subType: "BLANK_INFERENCE",
    questionText: "Choose.\n\nThe ___ is here.",
    structuredData: {
      _typeId: "BLANK_INFERENCE", direction: "Choose.", passageWithBlank: "The ___ is here.",
      options: [{ label: "1", text: "a" }, { label: "2", text: "b" }], correctAnswer: "1",
      _sourcePassage: TYPED_SNAPSHOT,
    },
    options: null, correctAnswer: "1", tags: null, starred: false, deletedAt: null, setId: null,
    approved: false, points: 1, difficulty: "INTERMEDIATE", createdAt: new Date("2026-09-01"),
  });
}
await checkAsync("updateWorkbenchQuestion: 발문 자유 편집(_manualEditedFlat 분기)에도 _sourcePassage 보존", async () => {
  const db = fresh();
  addTypedDetached(db, "qTyped");
  const r = await questions.updateWorkbenchQuestion("qTyped", { questionText: "완전히 새로 쓴 발문" });
  const row = db.tables.question.find((q: Any) => q.id === "qTyped");
  const s = sp(db, "qTyped");
  return r.success === true && row.structuredData?._manualEditedFlat === true && row.questionText === "완전히 새로 쓴 발문"
    && s?.content === "Typed kept." && s?.passageId === "pGoneT"
    ? true
    : { r, structuredData: row.structuredData };
});
await checkAsync("updateWorkbenchQuestion: 선지만 편집(병합 분기)에도 _sourcePassage 보존", async () => {
  const db = fresh();
  addTypedDetached(db, "qTyped2");
  const r = await questions.updateWorkbenchQuestion("qTyped2", { options: [{ label: "1", text: "x" }, { label: "2", text: "y" }] as Any });
  const row = db.tables.question.find((q: Any) => q.id === "qTyped2");
  return r.success === true && row.structuredData?._typeId === "BLANK_INFERENCE" && row.structuredData?.options?.[0]?.text === "x"
    && sp(db, "qTyped2")?.content === "Typed kept."
    ? true
    : { r, structuredData: row.structuredData };
});
await checkAsync("applyAiEditToQuestion: 덮어쓰기에도 _sourcePassage 보존", async () => {
  const db = fresh();
  const r = await aiEdit.applyAiEditToQuestion("qDet", { edited: { questionText: "AI 수정", options: [] } });
  return r.success === true && sp(db, "qDet")?.content === "Kept original.";
});
await checkAsync("saveAiEditedAsNew: 새 문항이 원본의 보관 원문을 승계", async () => {
  const db = fresh();
  const r = await aiEdit.saveAiEditedAsNew("qDet", { edited: { questionText: "AI 사본", _sourcePassage: { content: "FORGED" } } });
  return r.success === true && sp(db, r.questionId)?.content === "Kept original." && sp(db, "qDet")?.content === "Kept original.";
});
await checkAsync("applyAiEditToQuestion: 남의 학원 문제 거부", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const r = await aiEdit.applyAiEditToQuestion("qB", { edited: { questionText: "hacked" } });
  return r.success === false && snapshotB(db) === before;
});

report();
