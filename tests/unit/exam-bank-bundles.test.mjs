import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from "node:fs";
import path from "node:path";

test("bank lists, filters, prefetch, persistence and paper rendering preserve whole long-passage bundles", () => {
  const dir = mkdtempSync(path.join(process.cwd(), ".tmp-bank-bundles-"));
  const file = path.join(dir, "check.ts");
  writeFileSync(file, `
import assert from "node:assert/strict";
import { queryExamBank, getExamBankItemsByIds } from "@/lib/exam-passages/question-bank";
import { getAllExamBankSets } from "@/lib/exam-passages/question-bank-sets";
import { primeBankSets, primeBankItems, bankItemToBuilderQuestion } from "@/lib/exam-passages/question-bank-client-builder";
import { buildGroups, makePaperItem } from "@/components/exams/paper-builder/paper-item-utils";
import { structuredSegments, questionStemAndBody } from "@/components/exams/paper-builder/question-body-layout";
import { persistExamBankSets } from "@/lib/exam-passages/question-bank-set-persistence";
import { buildPaperItemsFromExam } from "@/components/exams/exam-paper-builder-existing";
import { tokenizeInline } from "@/components/workbench/exam-question-bank/inline/bank-preview-model";
import { parseExamBankQNums } from "@/lib/exam-passages/question-bank-number-filter";

async function main() {
  const key = "2027_09_20270901-q43-44-45";
  const filtered = queryExamBank({yearFrom:2027, exams:["9월"], qNums:["43~45"], pageSize:1});
  assert.equal(filtered.total, 1);
  assert.equal(filtered.items[0].id, key);
  assert.equal(filtered.items[0].setLabel, "43~45");
  assert.equal(filtered.items[0].typeGroup, "장문");
  assert.deepEqual(parseExamBankQNums("20,41~42,43~45,43~45,44~41,0,1.5,nope"), [20,"41~42","43~45"]);
  assert.equal(parseExamBankQNums("0,4~4,invalid"), undefined);
  assert.equal(queryExamBank({yearFrom:2027, exams:["9월"], qNums:[43,44,45]}).total, 0);
  assert.ok(filtered.facets.qNums.includes("43~45"));
  assert.ok(!filtered.facets.qNums.includes(43) && !filtered.facets.qNums.includes(44) && !filtered.facets.qNums.includes(45));
  assert.equal(filtered.facets.counts.qNum["43~45"], 1);
  const juneSets = queryExamBank({yearFrom:2027, exams:["6월"], qNums:["41~42","43~45"]});
  assert.equal(juneSets.total, 2);
  assert.deepEqual(juneSets.items.map(row => row.setLabel), ["41~42","43~45"]);
  const allFacets = queryExamBank({}).facets;
  for (const numberKey of allFacets.qNums) {
    const byNumber = queryExamBank({qNums:[numberKey]});
    assert.equal(byNumber.total, allFacets.counts.qNum[String(numberKey)], String(numberKey));
    if (typeof numberKey === "string") assert.ok(byNumber.items.every(row => row.setLabel === numberKey));
    else assert.ok(byNumber.items.every(row => !row.setKey && row.qNum === numberKey));
  }
  assert.equal(queryExamBank({yearFrom:2027, exams:["9월"], q:"Gathering his courage"}).items[0].id, key);
  assert.deepEqual(tokenizeInline("(a) __your__", "SENTENCE_ORDER").filter(t => t.kind === "marker"), []);
  assert.deepEqual(filtered.items[0].memberIds, [43,44,45].map(n => key + "#" + n));
  assert.deepEqual(queryExamBank({ids:[key+"#44", key+"#43"]}).allIds, [key]);
  assert.equal(queryExamBank({typeGroups:["장문"]}).total, getAllExamBankSets().length);
  const page1 = queryExamBank({pageSize:1});
  const page2 = queryExamBank({pageSize:1,page:2});
  assert.notEqual(page1.items[0].id, page2.items[0].id);
  assert.deepEqual(page1.allIds.slice(0,2), [page1.items[0].id, page2.items[0].id]);
  let checked = 0;
  for (const set of getAllExamBankSets()) {
    const response = queryExamBank({ids:[set.key]}, {full:true});
    const members = response.fullItems!;
    assert.equal(response.items.length, 1);
    assert.equal(members.length, set.memberIds.length);
    primeBankItems(members);
    primeBankSets(response.sets);
    const questions = members.map(m => bankItemToBuilderQuestion(m, null));
    const items = questions.map((q,i) => makePaperItem(q,i+1,[]));
    const groups = buildGroups(items);
    assert.equal(groups.length, 1, set.key);
    assert.equal(groups[0].includePassage, true, set.key);
    assert.equal(groups[0].items.length, set.memberIds.length);
    assert.ok(groups[0].passageContent.length > 100);
    for (let i=0;i<items.length;i++) {
      assert.equal(items[i].includePassage, true);
      assert.equal(items[i].options.length, 5);
      assert.equal(questions[i].correctAnswer, members[i].correctAnswer);
      assert.equal(items[i].points, members[i].points);
      assert.deepEqual(structuredSegments(items[i]), []);
      assert.equal(questionStemAndBody(items[i]).body, "");
    }
    assert.equal(buildGroups(items.map(item => ({...item, includePassage:false})))[0].includePassage, false);
    const exam = {questions:questions.map(q => ({question:{...q, setId:"stored:"+set.key, passage:{...q.passage,content:set.canonicalPassage}}}))};
    const reopen = (blocks) => buildPaperItemsFromExam(exam as never, {source:"exam-paper-builder-v2",blocks} as never);
    const reopened = reopen(JSON.parse(JSON.stringify(items)));
    assert.equal(buildGroups(reopened).length,1);
    assert.equal(buildGroups(reopened)[0].passageContent, groups[0].passageContent, set.key);
    const hidden = reopen(items.map(item => ({...item,includePassage:false})));
    assert.equal(buildGroups(hidden)[0].includePassage,false);
    if (set.layout.type === "SENTENCE_ORDER") {
      for (const block of set.layout.blocks ?? []) assert.ok(groups[0].passageContent.includes(block.label), set.key);
    }
    checked++;
  }
  const members = getExamBankItemsByIds([key]);
  const qids = new Map(members.map(m => [m.id, "db:"+m.id]));
  const storedSets = new Map(); const storedMembers = new Map(); const storedQuestions = new Map();
  const tx = {
    questionSet:{upsert:async ({where,create,update}) => storedSets.set(where.id, storedSets.has(where.id) ? update : create)},
    questionSetItem:{upsert:async ({where,create,update}) => storedMembers.set(where.questionId, storedMembers.has(where.questionId) ? update : create)},
    question:{update:async ({where,data}) => storedQuestions.set(where.id,data)}
  };
  await persistExamBankSets(tx as never,"academy",members,qids,new Map([[key,"passage"]]));
  await persistExamBankSets(tx as never,"academy",members,qids,new Map([[key,"passage"]]));
  assert.equal(storedSets.size,1); assert.equal(storedMembers.size,3); assert.equal(storedQuestions.size,3);
  assert.equal(new Set([...storedQuestions.values()].map(q=>q.setId)).size,1);
  assert.ok(JSON.parse([...storedSets.values()][0].displayedPassageLayout).fullPassage.startsWith("(A)"));
  process.stdout.write(JSON.stringify({checked}));
}
main();
`, "utf8");
  try {
    const output = execFileSync(process.execPath, ["--conditions=react-server", "--import=tsx", file], {
      cwd: process.cwd(), encoding: "utf8", timeout: 120000,
    });
    assert.ok(JSON.parse(output).checked >= 480);
  } finally {
    rmSync(file, { force: true });
    // Only this test-created empty directory is removed.
    rmdirSync(dir);
  }
});
