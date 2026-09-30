// DOCX · HWPX 정답포함 해설이 웹 「PDF 해설」 과 같은 마크다운 규칙으로 찍히는지(26-09-30 EXPORT-FINISH).
//   · `**굵게**` → 굵은 런(기호 없음), 짝 없는 ** 제거, 백틱 제거, 보이지 않는 끊김 문자 제거
//   · 해설 본문 줄머리 「- 」「* 」「• 」 → 글머리(•) 문단 — 핵심 포인트의 「- 」 는 글자 그대로(웹과 같음)
//   · 웹 정본(buildExplanationRows + parseExplanationInline)의 행마다 같은 글자의 문단이 DOCX · HWPX 에 있다
// 라우트와 같은 순수 진입점(buildExamDocxDocument · buildExamHwpxDocument)과 단일 문항 빌더 경로를 부른다(DB 무접촉).
// 계기 음성테스트: EF_MUTANT="<원본 절대경로>=><사본 절대경로>[;…]" 이면 원본 대신 사본을 로드한다.
import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const MUTANTS = (process.env.EF_MUTANT ?? "")
  .split(";")
  .filter(Boolean)
  .map((pair) => pair.split("=>").map((p) => path.normalize(p)));
if (MUTANTS.length > 0) {
  const M = Module as Any;
  const orig = M._resolveFilename;
  M._resolveFilename = function resolveMutant(request: string, parent: unknown, ...rest: unknown[]) {
    const resolved = orig.call(this, request, parent, ...rest);
    const hit = MUTANTS.find(([from]) => from === path.normalize(resolved));
    return hit ? hit[1] : resolved;
  };
}

const require = createRequire(import.meta.url);
const JSZip = require("jszip");
const { Packer } = require("docx");
const { buildExamDocxDocument, buildBuilderExamDocument } = require("@/app/api/exams/[examId]/export-docx/_lib/build-builder-document/assemble");
const { buildExamHwpxDocument } = require("@/app/api/exams/[examId]/export-hwpx/_lib/exam-document");
const { buildBuilderHwpxDocument } = require("@/app/api/exams/[examId]/export-hwpx/_lib/builder");
const { packageHwpx } = require("@/app/api/exams/[examId]/export-hwpx/_lib/package");
const single = require("@/app/api/questions/[questionId]/_lib/load-single-question-export");
const { buildPaperItemsFromExam } = require("@/components/exams/paper-builder/saved-paper-items");
const { buildExplanationRows } = require("@/components/exams/paper-builder/explanation-content");
const layout = require("@/components/exams/paper-builder/explanation-layout");
const markdown = require("@/components/exams/paper-builder/explanation-markdown");

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) passed += 1;
  else failures.push(extra === undefined ? name : `${name} :: ${JSON.stringify(extra).slice(0, 400)}`);
}

// ── 픽스처 ────────────────────────────────────────────────────────────────
const EXPLANATION = {
  content: [
    "정답은 4번입니다.",
    "**핵심 단서:** 첫 문장의 `however` 가 전환을 알린다.",
    "- **첫째 근거** 앞 문장과 이어진다.",
    "* 둘째 글머리",
    "•  셋째 글머리",
    "짝 없는 굵게 ** 표시",
    "소프트­하이픈과 폭​없는 공백",
    "**",
    "",
    "-붙은 대시는 글머리가 아니다",
  ].join("\n"),
  keyPoints: JSON.stringify(["**요지** 파악", "- 대시로 시작하는 포인트", "   "]),
  wrongOptionExplanations: JSON.stringify({ "1": "**전환어**를 놓쳤다.", "2": "평범한 설명" }),
};
const EMPTY_KEYPOINTS = { content: "본문만 있다.", keyPoints: JSON.stringify(["  "]), wrongOptionExplanations: null };
// 문자열이 아닌 핵심 포인트(숫자 · null · 객체) — 웹은 거른다. 수정 전 DOCX · HWPX 는 (kp || "").trim() 에서 던져 내보내기 전체가 실패했다.
const NON_STRING_KEYPOINTS = { content: "본문.", keyPoints: JSON.stringify([3, null, { a: 1 }]), wrongOptionExplanations: null };

function eq(id: string, orderNum: number, explanation: Any) {
  return {
    orderNum,
    points: 2,
    question: {
      id,
      type: "MULTIPLE_CHOICE",
      subType: "TOPIC",
      questionText: "다음 글의 주제로 가장 적절한 것은?",
      structuredData: null,
      setId: null,
      options: JSON.stringify(["first", "second", "third", "fourth", "fifth"].map((text, i) => ({ label: String(i + 1), text }))),
      correctAnswer: "4",
      difficulty: "INTERMEDIATE",
      passage: { id: `p-${id}`, title: "Walkable Cities", content: "Cities grow when people find new ways to share space." },
      explanation,
    },
  };
}
const QUESTIONS = [eq("q1", 1, EXPLANATION), eq("q2", 2, EMPTY_KEYPOINTS)];

// ── 추출 ──────────────────────────────────────────────────────────────────
type Para = { text: string; runs: Array<{ text: string; bold: boolean }> };
const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function docxParas(xml: string): Para[] {
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) => {
    const runs = (p.match(/<w:r>[\s\S]*?<\/w:r>|<w:r [\s\S]*?<\/w:r>/g) ?? []).map((r) => ({
      text: (r.match(/<w:t(?: [^>]*)?>[\s\S]*?<\/w:t>/g) ?? []).map((t) => unescapeXml(t.replace(/<[^>]+>/g, ""))).join(""),
      bold: /<w:b\/>|<w:b w:val="(?:true|1|on)"\/>/.test(r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? ""),
    }));
    return { text: runs.map((r) => r.text).join(""), runs };
  });
}

function irParas(doc: Any): Para[] {
  const out: Para[] = [];
  const walk = (blocks: Any[]) => {
    for (const b of blocks ?? []) {
      if (b.kind === "p") {
        const runs = (b.runs ?? []).filter((r: Any) => r.kind === "text").map((r: Any) => ({ text: r.text, bold: Boolean(r.style?.bold) }));
        out.push({ text: runs.map((r: Any) => r.text).join(""), runs });
      } else if (b.kind === "tbl") {
        for (const row of b.rows ?? []) for (const cell of row.cells ?? []) walk(cell.blocks);
      }
    }
  };
  for (const s of doc.sections ?? []) walk(s.blocks);
  return out;
}

async function hwpxXmlTexts(doc: Any): Promise<string[]> {
  const zip = await JSZip.loadAsync(await packageHwpx(doc));
  const texts: string[] = [];
  for (const name of Object.keys(zip.files).filter((n) => /^Contents\/section\d+\.xml$/.test(n))) {
    const xml: string = await zip.file(name).async("string");
    for (const t of xml.match(/<hp:t>[\s\S]*?<\/hp:t>/g) ?? []) texts.push(unescapeXml(t.replace(/<[^>]+>/g, "")));
  }
  return texts;
}

/** 웹 정본 — 문항별 해설 행(문단 · 글머리 · 오답)의 글자와 굵은 조각. */
function webRows(items: Any[]) {
  const rows: Array<{ kind: string; text: string; bold: string[] }> = [];
  for (const item of items) {
    for (const row of buildExplanationRows(item)) {
      if (row.type !== "text" && row.type !== "bullet" && row.type !== "wrong") continue;
      const segs = row.type === "wrong"
        ? [{ text: `${row.label} `, bold: true }, ...markdown.parseExplanationInline(row.text)]
        : markdown.parseExplanationInline(row.text);
      if (!markdown.hasVisibleExplanationText(segs)) continue;
      rows.push({ kind: row.type, text: segs.map((s: Any) => s.text).join(""), bold: segs.filter((s: Any) => s.bold).map((s: Any) => s.text.trim()) });
    }
  }
  return rows;
}

function assertFormat(tag: string, paras: Para[], rawTexts: string[], items: Any[]) {
  const all = rawTexts.join("\n");
  check(`${tag}: 문서 어디에도 ** 가 없다`, !all.includes("**"), all.match(/.{0,20}\*\*.{0,20}/)?.[0]);
  check(`${tag}: 백틱이 없다`, !all.includes("`"));
  check(`${tag}: 소프트 하이픈 · 폭 없는 공백이 없다`, !/[­​]/.test(all));
  const find = (needle: string) => paras.find((p) => squash(p.text).includes(needle));
  const lead = find("핵심 단서:");
  check(`${tag}: 「**핵심 단서:**」 는 굵은 런 「핵심 단서:」`, Boolean(lead?.runs.some((r) => r.bold && r.text.trim() === "핵심 단서:")), lead);
  check(`${tag}: 같은 문단의 나머지는 굵지 않다`, Boolean(lead?.runs.some((r) => !r.bold && r.text.includes("가 전환을 알린다"))), lead);
  for (const [needle, bold] of [["첫째 근거 앞 문장과 이어진다.", "첫째 근거"], ["둘째 글머리", null], ["셋째 글머리", null]] as const) {
    const p = find(needle);
    check(`${tag}: 「${needle}」 는 • 글머리 문단`, Boolean(p && /^•\s/.test(p.text)), p);
    if (bold) check(`${tag}: 글머리 문단 안 「${bold}」 는 굵다`, Boolean(p?.runs.some((r) => r.bold && r.text.trim() === bold)), p);
  }
  check(`${tag}: 「- 」「* 」 로 시작하는 해설 본문 문단이 없다`, !paras.some((p) => /^\s*[-*]\s+(첫째|둘째)/.test(p.text)));
  check(`${tag}: 짝 없는 ** 는 지운다`, Boolean(find("짝 없는 굵게 표시")));
  check(`${tag}: 붙은 대시(「-붙은」)는 글머리가 아니다`, Boolean(paras.find((p) => squash(p.text) === "-붙은 대시는 글머리가 아니다")));
  const kp = find("요지 파악");
  check(`${tag}: 핵심 포인트의 ** 도 굵게`, Boolean(kp && /^•\s/.test(kp.text) && kp.runs.some((r) => r.bold && r.text.trim() === "요지")), kp);
  check(`${tag}: 핵심 포인트의 「- 」 는 글자 그대로(웹과 같음)`, Boolean(find("• - 대시로 시작하는 포인트")));
  const wrong = find("전환어를 놓쳤다.");
  check(`${tag}: 오답 분석의 ** 도 굵게`, Boolean(wrong?.runs.some((r) => r.bold && r.text.trim() === "전환어")), wrong);
  const labels = paras.filter((p) => squash(p.text) === "핵심 포인트").length;
  check(`${tag}: 그릴 핵심 포인트가 없는 문항엔 「핵심 포인트」 라벨이 없다(웹과 같음)`, labels === 1, { labels });

  // 웹 정본 대조 — 행마다 같은 글자의 문단, 글머리 여부 일치, 굵은 조각은 굵은 런에 있다.
  const pool = paras.map((p) => ({ ...p, key: squash(p.text.replace(/^•\s*/, "")), used: false }));
  const expected = webRows(items);
  let matched = 0;
  const misses: string[] = [];
  for (const row of expected) {
    const p = pool.find((x) => !x.used && x.key === squash(row.text));
    if (!p) { misses.push(`missing ${row.kind}: ${row.text}`); continue; }
    p.used = true;
    if ((row.kind === "bullet") !== /^•\s/.test(p.text)) misses.push(`bullet ${row.kind}: ${p.text}`);
    const boldText = p.runs.filter((r) => r.bold).map((r) => r.text).join("");
    for (const b of row.bold) if (b && !boldText.includes(b)) misses.push(`bold '${b}' not bold in: ${p.text}`);
    matched += 1;
  }
  check(`${tag}: 웹 해설 행 ${expected.length}개가 모두 같은 글자 · 글머리 · 굵게로 있다`, misses.length === 0 && matched === expected.length && expected.length >= 12, { matched, expected: expected.length, misses });
}

// ── 공용 규칙 · 웹 배선 ──────────────────────────────────────────────────
check("웹 조판(explanation-layout)은 공용 parseExplanationInline 을 그대로 쓴다", layout.parseExplanationInline === markdown.parseExplanationInline);
check(
  "parseExplanationInline: 굵게 · 짝 없는 ** · 백틱",
  JSON.stringify(markdown.parseExplanationInline("a **b** `c` d **")) === JSON.stringify([{ text: "a ", bold: false }, { text: "b", bold: true }, { text: " c d ", bold: false }]),
  markdown.parseExplanationInline("a **b** `c` d **"),
);
check(
  "explanationContentLines: 「- 」「* 」「• 」 만 글머리, 빈 줄 · 붙은 대시 제외",
  JSON.stringify(markdown.explanationContentLines("- a\n\n* b\n•  c\n-d\n  e  ")) ===
    JSON.stringify([{ bullet: true, text: "a" }, { bullet: true, text: "b" }, { bullet: true, text: "c" }, { bullet: false, text: "-d" }, { bullet: false, text: "e" }]),
);

// ── 시험지 진입점(settings NULL) ─────────────────────────────────────────
async function guarded(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    failures.push(`${name} threw ${(e as Error)?.message ?? e}`);
  }
}
const items = buildPaperItemsFromExam(QUESTIONS, null).filter((it: Any) => it.blockType === "question");
await guarded("DOCX 시험지", async () => {
  const docxBuf = await Packer.toBuffer(buildExamDocxDocument({ title: "해설 규칙", examQuestions: QUESTIONS, settings: null, includeAnswers: true }));
  const docXml: string = await (await JSZip.loadAsync(docxBuf)).file("word/document.xml").async("string");
  const dParas = docxParas(docXml);
  assertFormat("DOCX 시험지", dParas, dParas.map((p) => p.text), items);
});
await guarded("HWPX 시험지", async () => {
  const { doc: hdoc } = await buildExamHwpxDocument({ title: "해설 규칙", settings: null, questions: QUESTIONS, includeAnswers: true, examDateLabel: "" });
  assertFormat("HWPX 시험지", irParas(hdoc), await hwpxXmlTexts(hdoc), items);
});

// ── 문자열이 아닌 핵심 포인트: 던지지 않고 라벨도 없다(웹과 같음) ──────────
const odd = [eq("q3", 1, NON_STRING_KEYPOINTS)];
await guarded("DOCX 비문자열 핵심 포인트", async () => {
  const xml: string = await (await JSZip.loadAsync(await Packer.toBuffer(buildExamDocxDocument({ title: "x", examQuestions: odd, settings: null, includeAnswers: true })))).file("word/document.xml").async("string");
  check("DOCX: 문자열이 아닌 핵심 포인트는 거르고 라벨도 없다", !docxParas(xml).some((p) => squash(p.text) === "핵심 포인트"));
});
await guarded("HWPX 비문자열 핵심 포인트", async () => {
  const { doc } = await buildExamHwpxDocument({ title: "x", settings: null, questions: odd, includeAnswers: true, examDateLabel: "" });
  check("HWPX: 문자열이 아닌 핵심 포인트는 거르고 라벨도 없다", !irParas(doc).some((p) => squash(p.text) === "핵심 포인트"));
});

// ── 단일 문항 내보내기(두 라우트가 쓰는 빌더 경로) ──────────────────────
const resolved = single.buildSingleResolvedItem(QUESTIONS[0]);
check("단일 문항 픽스처가 웹 행을 만든다(대조군)", webRows([resolved.paperItem]).length >= 10);
await guarded("DOCX 단일 문항", async () => {
  const sDocx = buildBuilderExamDocument({ title: "단일", settings: single.SINGLE_QUESTION_BUILDER_SETTINGS, resolvedItems: [resolved], includeAnswers: true, fullExamQuestions: [] });
  const sParas = docxParas(await (await JSZip.loadAsync(await Packer.toBuffer(sDocx))).file("word/document.xml").async("string"));
  const sAll = sParas.map((p) => p.text).join("\n");
  check("DOCX 단일 문항: ** · 백틱 없음, 글머리 있음", !sAll.includes("**") && !sAll.includes("`") && sParas.some((p) => /^•\s/.test(p.text) && p.text.includes("둘째 글머리")));
});
await guarded("HWPX 단일 문항", async () => {
  const sH = buildBuilderHwpxDocument({ title: "단일", settings: single.SINGLE_QUESTION_BUILDER_SETTINGS, resolvedItems: [resolved], includeAnswers: true, fullExamQuestions: [], includeCover: false });
  const sHTexts = (await hwpxXmlTexts(sH)).join("\n");
  check("HWPX 단일 문항: ** · 백틱 없음, 글머리 있음", !sHTexts.includes("**") && !sHTexts.includes("`") && irParas(sH).some((p) => /^•\s/.test(p.text) && p.text.includes("둘째 글머리")));
});

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
