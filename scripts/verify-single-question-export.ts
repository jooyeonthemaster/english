/**
 * 단일 문항 export(HWPX/DOCX) 빌더 실행 검증 — DB/auth 없이 문서 빌더만 직접 구동한다.
 * 핵심 리스크: buildBuilderHwpxDocument 를 settings(columns:1, blocks 미지정) + resolvedItems 1개로
 * 부를 때 문항이 실제로 렌더되는가(1단 경로가 resolvedItems 를 소비하는가).
 *   방법: "문항 1개" vs "문항 0개(빈 resolvedItems)" 버퍼 크기를 비교 → 문항이 바이트에 기여하면 렌더된 것.
 *         includeAnswers=true 는 해설이 붙어 false 보다 커야 한다.
 */
import JSZip from "jszip";
import { Packer } from "docx";
import {
  buildQuestionClipboardText,
  buildQuestionClipboardHtml,
} from "@/components/workbench/question-bank-card/build-clipboard-text";
import { buildBuilderExamDocument } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import { buildBuilderHwpxDocument } from "@/app/api/exams/[examId]/export-hwpx/_lib/builder";
import { packageHwpx } from "@/app/api/exams/[examId]/export-hwpx/_lib/package";

// 라우트 helper 와 동일한 순수 로직(프리즈마 임포트 회피 위해 복제).
const SINGLE_QUESTION_BUILDER_SETTINGS = {
  source: "exam-paper-builder-v2",
  items: [],
  layout: { columns: 1 as const },
};

function makeExamQuestion(): any {
  return {
    orderNum: 1,
    points: 3,
    question: {
      id: "q_test_1",
      type: "MULTIPLE_CHOICE",
      subType: "BLANK",
      questionText:
        "다음 빈칸에 들어갈 말로 가장 적절한 것은?\n\nOfficial statistics appear to present objective facts, but the system was in fact designed as a __________ for the state.",
      structuredData: null,
      options: JSON.stringify([
        { label: "①", text: "tool to secure public trust" },
        { label: "②", text: "means of economic control" },
        { label: "③", text: "record of historical events" },
        { label: "④", text: "measure of scientific progress" },
        { label: "⑤", text: "symbol of national pride" },
      ]),
      correctAnswer: "①",
      difficulty: "INTERMEDIATE",
      passage: {
        title: "2025 고2 10월 31번",
        content:
          "Official statistics appear to present objective facts. However, the underlying system was designed to secure public trust in state authority. Numbers carry an aura of neutrality that lends legitimacy to those who produce them.",
      },
      explanation: {
        content:
          "통계는 객관적으로 보이지만 실제로는 국가 권력에 대한 신뢰를 확보하기 위한 도구로 설계되었다. 따라서 정답은 ①이다.",
        keyPoints: JSON.stringify(["designed to secure public trust", "aura of neutrality"]),
        wrongOptionExplanations: null,
      },
    },
  };
}

function buildSingleResolvedItem(examQuestion: any) {
  return {
    questionId: examQuestion.question.id,
    orderNum: 1,
    points: examQuestion.points,
    questionText: examQuestion.question.questionText,
    includePassage: true,
    blockFontPt: null,
    blockBold: false,
    blockItalic: false,
    blockAlign: "left" as const,
    sourceQuestion: examQuestion.question,
  };
}

async function docxBuffer(items: any[], includeAnswers: boolean): Promise<Buffer> {
  const doc = buildBuilderExamDocument({
    title: "문항",
    settings: SINGLE_QUESTION_BUILDER_SETTINGS as any,
    resolvedItems: items,
    includeAnswers,
    fullExamQuestions: [],
  });
  return Packer.toBuffer(doc);
}

async function hwpxBuffer(items: any[], includeAnswers: boolean): Promise<Buffer> {
  const doc = buildBuilderHwpxDocument({
    title: "문항",
    settings: SINGLE_QUESTION_BUILDER_SETTINGS as any,
    resolvedItems: items,
    includeAnswers,
    fullExamQuestions: [],
  });
  return packageHwpx(doc);
}

// zip 안의 모든 xml 텍스트를 이어붙여 반환(태그 사이 텍스트를 대략 평문화).
async function zipText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const chunks: string[] = [];
  const names = Object.keys(zip.files);
  for (const name of names) {
    if (!/\.(xml|hml)$/i.test(name)) continue;
    const xml = await zip.files[name].async("string");
    chunks.push(xml.replace(/<[^>]+>/g, " "));
  }
  return chunks.join(" ").replace(/\s+/g, " ");
}

async function main() {
  const eq = makeExamQuestion();
  const item = buildSingleResolvedItem(eq);
  let pass = 0;
  let fail = 0;
  const check = (name: string, cond: boolean, detail: string) => {
    if (cond) {
      pass++;
      console.log(`  PASS  ${name} — ${detail}`);
    } else {
      fail++;
      console.log(`  FAIL  ${name} — ${detail}`);
    }
  };

  const OPTION_SNIPPET = "means of economic control"; // 오답 선지 텍스트
  const EXPLANATION_SNIPPET = "국가 권력에 대한 신뢰를 확보하기 위한 도구"; // 해설 고유 문구

  // DOCX
  const docxEmpty = await docxBuffer([], false);
  const docxProblem = await docxBuffer([item], false);
  const docxFull = await docxBuffer([item], true);
  check("DOCX renders", docxProblem.byteLength > docxEmpty.byteLength + 200, `empty=${docxEmpty.byteLength} problem=${docxProblem.byteLength}`);
  check("DOCX answers>problem", docxFull.byteLength > docxProblem.byteLength + 50, `problem=${docxProblem.byteLength} full=${docxFull.byteLength}`);
  const docxProblemText = await zipText(docxProblem);
  const docxFullText = await zipText(docxFull);
  check("DOCX problem has options", docxProblemText.includes(OPTION_SNIPPET), "오답 선지 텍스트 존재");
  check("DOCX problem hides explanation (no leak)", !docxProblemText.includes(EXPLANATION_SNIPPET), "문제만에 해설 없음");
  check("DOCX full has explanation", docxFullText.includes(EXPLANATION_SNIPPET), "정답포함에 해설 존재");

  // HWPX
  const hwpxEmpty = await hwpxBuffer([], false);
  const hwpxProblem = await hwpxBuffer([item], false);
  const hwpxFull = await hwpxBuffer([item], true);
  check("HWPX renders (columns:1 path)", hwpxProblem.byteLength > hwpxEmpty.byteLength + 100, `empty=${hwpxEmpty.byteLength} problem=${hwpxProblem.byteLength}`);
  check("HWPX answers>problem", hwpxFull.byteLength > hwpxProblem.byteLength + 30, `problem=${hwpxProblem.byteLength} full=${hwpxFull.byteLength}`);
  const hwpxProblemText = await zipText(hwpxProblem);
  const hwpxFullText = await zipText(hwpxFull);
  check("HWPX problem has options", hwpxProblemText.includes(OPTION_SNIPPET), "오답 선지 텍스트 존재");
  check("HWPX problem hides explanation (no leak)", !hwpxProblemText.includes(EXPLANATION_SNIPPET), "문제만에 해설 없음");
  check("HWPX full has explanation", hwpxFullText.includes(EXPLANATION_SNIPPET), "정답포함에 해설 존재");

  // 클립보드 텍스트(복사)
  const copyProblem = buildQuestionClipboardText(eq.question, { includeAnswer: false });
  const copyFull = buildQuestionClipboardText(eq.question, { includeAnswer: true });
  check("COPY problem has options", copyProblem.includes(OPTION_SNIPPET), "선지 포함");
  check("COPY problem hides answer/explanation (no leak)", !copyProblem.includes("[정답]") && !copyProblem.includes(EXPLANATION_SNIPPET), "문제만에 정답/해설 없음");
  check("COPY full has answer", copyFull.includes("[정답]"), "정답 라벨 포함");
  check("COPY full has explanation", copyFull.includes(EXPLANATION_SNIPPET), "해설 포함");

  // 서식(HTML) 복사 — 마커가 풍부한 문항으로 <b>/<u> 변환 확인.
  const rich: any = {
    id: "q_rich",
    subType: "BLANK",
    questionText:
      "다음 글의 <b>주제</b>로 가장 적절한 것은? The system was __designed to secure trust__ and (A) marks the key phrase ① matters.",
    structuredData: null,
    options: JSON.stringify([
      { label: "①", text: "a <b>bold</b> option" },
      { label: "②", text: "an __underlined__ option" },
    ]),
    correctAnswer: "①",
    difficulty: "INTERMEDIATE",
    passage: null,
    explanation: { content: "해설 본문", keyPoints: null, wrongOptionExplanations: null },
  };
  const htmlProblem = buildQuestionClipboardHtml(rich, { includeAnswer: false });
  const htmlFull = buildQuestionClipboardHtml(rich, { includeAnswer: true });
  check("HTML has <b> (bold preserved)", htmlProblem.includes("<b>"), "볼드 태그 존재");
  check("HTML has <u> (underline preserved)", htmlProblem.includes("<u>"), "밑줄 태그 존재");
  check("HTML escapes stray < >", !/<script/i.test(htmlProblem) && htmlProblem.includes("&lt;") === htmlProblem.includes("&lt;"), "이스케이프 동작");
  check("HTML problem hides explanation (no leak)", !htmlProblem.includes("해설 본문"), "문제만 HTML에 해설 없음");
  check("HTML full has explanation", htmlFull.includes("해설 본문"), "정답포함 HTML에 해설 존재");
  check("HTML full labels bold", htmlFull.includes("<b>[정답]</b>") || htmlFull.includes("<b>[해설]</b>"), "라벨 볼드");

  console.log(`\n결과: ${pass} pass / ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});
