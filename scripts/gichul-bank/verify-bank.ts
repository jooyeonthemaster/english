// 은행 렌더 왕복 게이트(G8) — 시험지 빌더의 **실제 파서**로 questions.json 전 항목을 통과시킨다.
// 세그먼트 수·마커 수·선지 수가 유형별 기대와 다르면 FAIL. 실행: npx tsx scripts/gichul-bank/verify-bank.ts
import { readFileSync, writeFileSync } from "node:fs";
import { questionStemAndBody, structuredSegments } from "../../src/components/exams/paper-builder/question-body-layout";
import { shouldRenderOptionListForSubtype } from "../../src/components/exams/paper-builder/option-display";
import { questionHasEmbeddedPassage, shouldIncludeSourcePassageByDefault } from "../../src/components/exams/paper-builder/passage-policy";
import type { PaperItem } from "../../src/components/exams/paper-builder/types";

type Bank = {
  id: string; subType: string; questionText: string; options: { label: string; text: string }[]; correctAnswer: string;
  structuredData: Record<string, unknown>; typeGroup: string; passageTitle: string; setKey?: string;
};

// 장문 세트 멤버(§12.1-4)는 **본문에 지문·단락·마커가 없는 것이 계약**이라 이 게이트의 단일 문항 기대치
// (지문 박스·마커 5·(A)~(C) 단락)가 통째로 성립하지 않는다. 게다가 paperItem() 은 코퍼스를 `b.id` 로 찾는데
// 멤버 id 는 `<setKey>#<qNum>` 이라 지문이 "" 로 들어간다 — 하네스 자체가 세트용이 아니다.
// 멤버 전용 게이트는 verify-sets.ts(G8 세트판, 실제 그룹 병합 경로)다. 여기서는 세어서 제외한다.
// (실측 26-09-08: 제외 전 4,153건 중 fail 840 = 세트 멤버 840/840 · 단일 문항 fail 0.)
const allItems = JSON.parse(readFileSync("src/data/exam-passages/questions.json", "utf8")) as Bank[];
const setMembers = allItems.filter((b) => typeof b.setKey === "string" && b.setKey.length > 0);
const items = allItems.filter((b) => !(typeof b.setKey === "string" && b.setKey.length > 0));
const passages = JSON.parse(readFileSync("src/data/exam-passages/passages.json", "utf8")) as { id: string; text: string }[];
const corpus = new Map(passages.map((p) => [p.id, p.text]));

function paperItem(b: Bank): PaperItem {
  const content = corpus.get(b.id) ?? "";
  const source = {
    id: b.id, type: "MULTIPLE_CHOICE", subType: b.subType, questionText: b.questionText, structuredData: b.structuredData,
    options: JSON.stringify(b.options), correctAnswer: b.correctAnswer, points: 1, difficulty: "INTERMEDIATE", tags: null,
    aiGenerated: false, approved: true, starred: false, createdAt: new Date(0),
    passage: { id: "p", title: b.passageTitle, content, grade: null, semester: null, publisher: null, school: null },
    explanation: null, collectionItems: [], examLinks: [], _count: { examLinks: 0 },
  };
  return {
    localId: "l", questionId: b.id, sourceQuestion: source as never, orderNum: 1, points: 1, groupId: null,
    includePassage: shouldIncludeSourcePassageByDefault(source as never), passageTitle: b.passageTitle, passageContent: content,
    questionText: b.questionText, options: b.options, correctAnswer: b.correctAnswer, answerSpaceLines: 0, objectiveAnswerSlots: 0,
    objectiveAnswerTexts: [], sectionTitle: "", teacherNote: "", breakBefore: "auto", keepWithPrev: false, blockType: "question",
    locked: false, blockTitle: "", blockText: "", blockAlign: "left", blockFontSize: "md", blockBold: false, blockItalic: false,
    blockFontPt: null, blockAccentColor: "", dividerStyle: "solid", dividerThickness: 1, spacerHeight: 0, imageDataUrl: null,
    imageAlt: "", imageWidth: 0,
  } as PaperItem;
}

const fails: { id: string; subType: string; why: string }[] = [];
const stats: Record<string, { n: number; fail: number }> = {};
for (const b of items) {
  const st = (stats[b.subType] ??= { n: 0, fail: 0 });
  st.n++;
  const it = paperItem(b);
  const why: string[] = [];
  try {
    const { stem, body } = questionStemAndBody(it);
    if (!stem || !/[가-힣]/.test(stem)) why.push("stem-missing");
    const segs = structuredSegments(it);
    const kinds = segs.map((s) => (s.kind === "box" ? `box:${s.boxStyle}` : s.kind));
    const opt = b.options.length;
    switch (b.subType) {
      case "SENTENCE_ORDER": {
        const paras = segs.filter((s) => s.kind === "para").length;
        const given = segs.some((s) => s.kind === "box" && s.boxStyle === "given");
        if (paras !== 3 || !given) why.push(`order-segs:${kinds.join(",")}`);
        if (opt !== 5) why.push("opt!=5");
        break;
      }
      case "SENTENCE_INSERT": {
        const given = segs.find((s) => s.kind === "box" && s.boxStyle === "given");
        const text = segs.find((s) => s.kind === "text");
        const markers = text && text.kind === "text" ? (text.text.match(/[①-⑧]/g) || []).length : 0;
        if (!given || markers !== opt) why.push(`insert-segs:${kinds.join(",")} markers=${markers} opt=${opt}`);
        break;
      }
      case "SUMMARY_COMPLETE_MC": {
        const k = kinds.join(",");
        if (k !== "box:passage,arrow,box:summary") why.push(`summary-segs:${k}`);
        const sum = segs.find((s) => s.kind === "box" && s.boxStyle === "summary");
        if (sum && sum.kind === "box" && !(/\(A\)/.test(sum.text) && /\(B\)/.test(sum.text))) why.push("summary-no-AB");
        if (opt !== 5 || !b.options.every((o) => / …… /.test(o.text))) why.push("summary-opt");
        break;
      }
      case "TOPIC": case "MAIN_IDEA": case "TITLE": case "CONTENT_MATCH": {
        if (!segs.some((s) => s.kind === "box" && s.boxStyle === "passage")) why.push(`source-no-passage-box:${kinds.join(",")}`);
        if (body.trim()) why.push("source-body-nonempty");
        if (opt !== 5) why.push("opt!=5");
        if (questionHasEmbeddedPassage(it.sourceQuestion as never)) why.push("source-embedded-misjudged");
        break;
      }
      case "BLANK_INFERENCE": {
        if (!questionHasEmbeddedPassage(it.sourceQuestion as never)) why.push("blank-not-embedded");
        // 빈칸은 1개가 기본이나 구식 「빈칸 (A), (B)」 2빈칸형(2010 학평 실재)은 발문의 라벨 수만큼 허용
        if ((body.match(/_{3,}/g) || []).length !== (/\(A\).*\(B\)/.test(String(b.direction || "")) ? 2 : 1)) why.push("blank-count");
        if (opt !== 5) why.push("opt!=5");
        break;
      }
      case "GRAMMAR_ERROR": {
        if ((body.match(/__\([A-E]\) [^_]+__/g) || []).length !== 5) why.push("grammar-markers");
        if (shouldRenderOptionListForSubtype(b.subType)) why.push("grammar-optlist-should-hide");
        if (!/^\([A-E]\)$/.test(b.correctAnswer)) why.push("grammar-answer-format");
        break;
      }
      case "VOCAB_CHOICE": {
        if ((body.match(/__\([a-e]\) [^_]+__/g) || []).length !== 5) why.push("vocab-markers");
        if (!/^[1-5]$/.test(b.correctAnswer)) why.push("vocab-answer-format");
        break;
      }
      case "IRRELEVANT": {
        if ((body.match(/[①-⑤] __[^_]+__/g) || []).length !== 5) why.push("irrelevant-markers");
        if (!/^[①-⑤]$/.test(b.correctAnswer)) why.push("irrelevant-answer-format");
        break;
      }
      case "IMPLIED_MEANING": {
        if ((body.match(/__[^_]+__/g) || []).length !== 1) why.push("implied-underline");
        if (opt !== 5) why.push("opt!=5");
        break;
      }
    }
    if (/\[(?:빈칸 정답|정답|모범 답안|해설)\]/.test(b.questionText)) why.push("answer-leak-label");
  } catch (e) {
    why.push(`EXC:${(e as Error).message}`);
  }
  if (why.length) { fails.push({ id: b.id, subType: b.subType, why: why.join(" | ") }); st.fail++; }
}
writeFileSync(".tmp-gichul-bank/verify-g8.json", JSON.stringify({ total: items.length, setMembersSkipped: setMembers.length, fails }, null, 1));
console.log(`G8 render-roundtrip: ${items.length} items · fail ${fails.length}${setMembers.length ? ` · 세트 멤버 ${setMembers.length}건 제외(verify-sets.ts 관할)` : ""}`);
for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(20)} n ${String(v.n).padStart(4)} fail ${v.fail}`);
for (const f of fails.slice(0, 15)) console.log("  -", f.id, f.subType, f.why);
