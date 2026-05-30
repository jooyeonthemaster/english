/**
 * Phase 1 스모크 테스트.
 *
 * adapter + schema + 템플릿이 정상 동작하는지 DB 안 건드리고 확인.
 *
 * 실행: pnpm tsx scripts/smoke-test-passage-report.ts
 */

import { buildReportFromAnalysis, computeReportContentHash } from "../src/lib/passage-report/adapter";
import { reportDocumentSchema } from "../src/lib/passage-report/schema";
import { listTemplates } from "../src/lib/passage-report/templates";
import type { PassageAnalysisData } from "../src/types/passage-analysis";

const dummyAnalysis: PassageAnalysisData = {
  sentences: [
    { index: 0, english: "The sun rose slowly over the hills.", korean: "해가 언덕 위로 천천히 떠올랐다." },
    { index: 1, english: "Birds began to sing in the trees.", korean: "새들이 나무에서 노래하기 시작했다." },
    { index: 2, english: "It was a beautiful spring morning.", korean: "아름다운 봄 아침이었다." },
  ],
  vocabulary: [
    { word: "rose", meaning: "떠오르다", partOfSpeech: "verb", pronunciation: "/roʊz/", sentenceIndex: 0, difficulty: "basic" },
    { word: "slowly", meaning: "천천히", partOfSpeech: "adverb", pronunciation: "/ˈsloʊli/", sentenceIndex: 0, difficulty: "basic" },
    { word: "hills", meaning: "언덕", partOfSpeech: "noun", pronunciation: "/hɪlz/", sentenceIndex: 0, difficulty: "basic" },
    { word: "began", meaning: "시작하다", partOfSpeech: "verb", pronunciation: "/bɪˈɡæn/", sentenceIndex: 1, difficulty: "intermediate" },
    { word: "beautiful", meaning: "아름다운", partOfSpeech: "adjective", pronunciation: "/ˈbjuːtɪfʊl/", sentenceIndex: 2, difficulty: "basic" },
    { word: "spring", meaning: "봄", partOfSpeech: "noun", pronunciation: "/sprɪŋ/", sentenceIndex: 2, difficulty: "basic" },
    { word: "morning", meaning: "아침", partOfSpeech: "noun", pronunciation: "/ˈmɔːrnɪŋ/", sentenceIndex: 2, difficulty: "basic" },
    { word: "trees", meaning: "나무", partOfSpeech: "noun", pronunciation: "/triːz/", sentenceIndex: 1, difficulty: "basic" },
    { word: "sing", meaning: "노래하다", partOfSpeech: "verb", pronunciation: "/sɪŋ/", sentenceIndex: 1, difficulty: "basic" },
    { word: "hills", meaning: "언덕", partOfSpeech: "noun", pronunciation: "/hɪlz/", sentenceIndex: 0, difficulty: "basic" },
  ],
  grammarPoints: [
    { id: "g1", pattern: "past tense", explanation: "동사의 과거형 사용", textFragment: "rose, began", sentenceIndex: 0, examples: ["She walked home.", "They played soccer."], level: "basic" },
    { id: "g2", pattern: "to-infinitive", explanation: "to + 동사원형", textFragment: "to sing", sentenceIndex: 1, examples: ["I want to learn.", "She tried to help."], level: "intermediate" },
  ],
  structure: {
    mainIdea: "아침 풍경을 묘사",
    purpose: "묘사",
    textType: "narrative",
    paragraphSummaries: [{ paragraphIndex: 0, summary: "봄 아침의 풍경", role: "본문" }],
    keyPoints: ["자연 풍경", "감각적 묘사", "시간적 배경"],
    logicFlow: [
      { role: "주장", sentenceIndices: [0], summary: "해가 뜸" },
      { role: "예시", sentenceIndices: [1], summary: "새가 노래함" },
      { role: "결론", sentenceIndices: [2], summary: "아름다운 봄 아침" },
    ],
  },
  syntaxAnalysis: [
    {
      sentenceIndex: 0,
      structure: "S + V + 부사 + 전치사구",
      chunkReading: "The sun / rose slowly / over the hills",
      complexity: "simple",
      keyPhrase: "The sun rose slowly over the hills.",
      plainExplanation: "주어와 동사가 단순한 구조의 문장",
      readingTip: "전치사구는 문장 끝에서 부사적으로 해석",
    },
  ],
  examDesign: {
    paraphrasableSegments: [
      {
        original: "It was a beautiful spring morning.",
        alternatives: ["The morning was a beautiful one in spring.", "Spring morning was beautiful."],
        sentenceIndex: 2,
        reason: "It ~ that 구문 변환",
        questionExample: "다음 중 의미가 같은 것은?",
        difficulty: "intermediate",
      },
    ],
    structureTransformPoints: [],
    summaryKeyPoints: ["봄 아침의 자연 풍경"],
    descriptiveConditions: ["과거 시제 사용", "감각적 표현"],
  },
};

const passage = {
  id: "test-passage-1",
  title: "A Spring Morning",
  content: dummyAnalysis.sentences.map((s) => s.english).join(" "),
  publisher: "Test Publisher",
  grade: 2,
  semester: "FIRST",
  unit: "Unit 1. Nature",
};

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, info?: string) {
  if (ok) {
    console.log(`  ✓ ${name}${info ? ` — ${info}` : ""}`);
    pass++;
  } else {
    console.log(`  ✗ ${name}${info ? ` — ${info}` : ""}`);
    fail++;
  }
}

console.log("\n=== Phase 1 Smoke Test ===\n");

for (const template of listTemplates()) {
  console.log(`▶ Template: ${template.id} (${template.label})`);

  try {
    const doc = buildReportFromAnalysis({
      passage,
      analysis: dummyAnalysis,
      templateId: template.id,
    });

    check("doc has id", typeof doc.id === "string" && doc.id.length > 0);
    check("doc has title", typeof doc.title === "string");
    check("doc has theme", typeof doc.theme === "object");
    check("doc has pages", Array.isArray(doc.pages), `${doc.pages.length} pages`);

    // Schema validation
    const parsed = reportDocumentSchema.safeParse(doc);
    check("schema validation passes", parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error.flatten()));

    if (parsed.success) {
      const totalBlocks = doc.pages.reduce((sum, p) => sum + p.blocks.length, 0);
      check("has blocks", totalBlocks > 0, `${totalBlocks} blocks total`);

      const blockKinds = new Set(doc.pages.flatMap((p) => p.blocks.map((b) => b.kind)));
      check("has multiple block kinds", blockKinds.size >= 3, `kinds: ${Array.from(blockKinds).join(", ")}`);

      // 좌표 검증
      const allInBounds = doc.pages.every((p) =>
        p.blocks.every((b) => b.x >= -50 && b.x <= 260 && b.y >= -50 && b.y <= 360),
      );
      check("all blocks within coordinate bounds", allInBounds);

      // contentHash 생성
      const hash = computeReportContentHash(parsed.data);
      check("content hash generated", hash.length === 40 /* sha1 hex */);
    }
  } catch (err) {
    check("buildReportFromAnalysis threw", false, String(err));
  }
  console.log("");
}

// Empty analysis도 작동하는지 (EMPTY 모드 시나리오)
console.log("▶ Empty analysis (EMPTY 모드)");
try {
  const emptyDoc = buildReportFromAnalysis({
    passage,
    analysis: {
      sentences: [],
      vocabulary: [],
      grammarPoints: [],
      structure: { mainIdea: "", purpose: "", textType: "", paragraphSummaries: [], keyPoints: [] },
    },
    templateId: "modern",
  });
  const parsed = reportDocumentSchema.safeParse(emptyDoc);
  check("empty analysis produces valid doc", parsed.success);
  if (parsed.success) {
    const blocks = parsed.data.pages.flatMap((p) => p.blocks);
    check("empty doc still has structural blocks", blocks.length > 0, `${blocks.length} blocks (헤더/구분선 등)`);
  }
} catch (err) {
  check("empty analysis threw", false, String(err));
}

console.log(`\n=== Result: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail === 0 ? 0 : 1);
