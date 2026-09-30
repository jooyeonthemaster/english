import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 단일 문항 DOCX 의 지문 계약(26-09-30 DC-R1 회귀 방지).
//
// 단일 문항 라우트(api/questions/[questionId]/export-docx)는 로더의 buildSingleResolvedItem 결과
// {…toPaperExportItem(paperItem), paperItem} 을 호환 경로(resolvedItems)로 넘긴다. 예전 호환 경로는
// toPaperExportItem 의 sourceQuestion(setId 없음)으로 문항을 다시 만들어 세트 판정을 잃었다.
//  - 기출 세트 멤버(TITLE·CONTENT_MATCH 등): 지문 0회(운영 81문항 중 32문항)
//  - 영어 세트 멤버: 「[n] 다음 글을 읽고…」 안내문 없이 문항 안 지문
// 계약: 라우트와 같은 호출 모양으로 만든 문서 본문 == 공용 정본(paperItems) 경로 본문, 세트 멤버 지문은 정확히 1회.
const harnessSource = `
import JSZip from "jszip";
import { Packer } from "docx";
import * as assembleModule from "../src/app/api/exams/[examId]/export-docx/_lib/build-builder-document/assemble";
import * as loaderModule from "../src/app/api/questions/[questionId]/_lib/load-single-question-export";
import * as utilModule from "../src/app/api/exams/[examId]/export-docx/_lib/build-builder-document/util";
import { isDeepStrictEqual } from "node:util";

const unwrap = (m: any) => m.default ?? m["module.exports"] ?? m;
const { buildBuilderExamDocument } = unwrap(assembleModule);
const { buildSingleResolvedItem, SINGLE_QUESTION_BUILDER_SETTINGS } = unwrap(loaderModule);
const { paperItemsFromResolvedItems } = unwrap(utilModule);

const EN =
  "Scientists once believed that memory worked like a video recorder, storing events exactly as they happened. " +
  "Research over the past decades has shown something very different. Each time we recall an event, we rebuild it.";
const KO =
  "인간의 존엄성은 근대 헌법의 토대가 되는 개념이다. 그러나 계약 자유의 원칙은 시장의 힘 앞에서 개인을 보호하지 못했다. " +
  "이에 국가는 노동법을 통해 계약 내용에 직접 개입하기 시작했다.";
const OPTS = ["Memory is rebuilt", "Recorders fail", "Witnesses lie", "Scenes change", "Details vanish"].map((text, i) => ({ label: String(i + 1), text }));
const KO_OPTS = ["가", "나", "다", "라", "마"].map((text, i) => ({ label: String(i + 1), text }));
const GICHUL = (qNum: number) => ({ _gichul: { set: { key: "k", label: "41~42", qNums: [41, 42] }, qNum } });

function eq(id: string, subType: string, questionText: string, extra: any = {}, passage = EN, options: any = OPTS) {
  return {
    orderNum: 1,
    points: 2,
    question: {
      id, type: "MULTIPLE_CHOICE", subType, questionText, structuredData: null,
      options: JSON.stringify(options), correctAnswer: "1", difficulty: "INTERMEDIATE",
      passage: { title: "Memory", content: passage },
      explanation: { content: "Because memory is rebuilt.", keyPoints: null, wrongOptionExplanations: null },
      setId: null, ...extra,
    },
  };
}

const cases = [
  ["gichul-title", eq("g-title", "TITLE", "윗글의 제목으로 가장 적절한 것은?", { setId: "s-g", structuredData: GICHUL(41) })],
  ["gichul-content-match", eq("g-cm", "CONTENT_MATCH", "윗글의 내용과 일치하는 것은?", { setId: "s-g", structuredData: GICHUL(42) })],
  ["english-set-title", eq("en-title", "TITLE", "What is the best title of the passage?", { setId: "s-en" })],
  ["english-set-content-match", eq("en-cm", "CONTENT_MATCH", "Which matches the passage?", { setId: "s-en" })],
  ["ko-set-member", eq("ko1", "KO_RD_FACT", "윗글의 내용과 일치하는 것은?", {
    setId: "s-ko", structuredData: { markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "계약 자유의 원칙" }] },
  }, KO, KO_OPTS)],
  ["standalone-topic", eq("topic", "TOPIC", "What is the passage mainly about?")],
  // 지문이 삭제돼 structuredData._sourcePassage 보관본만 남은 문항(EXAM-PAPER-MODEL §3) — 재해석하면 passage.id 가 바뀐다.
  ["standalone-detached-topic", eq("detached", "TOPIC", "What is the passage mainly about?", {
    passage: null,
    structuredData: { _sourcePassage: { title: "Memory", content: EN, detachedAt: "2026-09-30T00:00:00.000Z", passageId: "p-gone" } },
  })],
] as const;

async function bodyText(doc: any): Promise<string> {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml
    .split("</w:p>")
    .map((p) => [...p.matchAll(/<w:t(?:\\s[^>]*)?>([^<]*)<\\/w:t>/g)].map((m) => m[1]).join(""))
    .filter((s) => s.trim())
    .join("\\n");
}

async function main() {
  const out: Record<string, any> = {};
  const passThrough: Record<string, boolean> = {};
  for (const [name, input] of cases) {
    const resolved = buildSingleResolvedItem(input);
    // 동봉된 공용 PaperItem 은 재해석 없이 그대로 나와야 한다(번호만 1..n).
    passThrough[name] = isDeepStrictEqual(paperItemsFromResolvedItems([resolved], undefined), [resolved.paperItem]);
    for (const includeAnswers of [false, true]) {
      // 라우트와 같은 호출 모양(api/questions/[questionId]/export-docx/route.ts).
      const route = await bodyText(buildBuilderExamDocument({
        title: "T", settings: SINGLE_QUESTION_BUILDER_SETTINGS, resolvedItems: [resolved], includeAnswers, fullExamQuestions: [],
      }));
      // 공용 정본 경로(정답표는 싣지 않는 쪽과 비교하려고 잘라 낸다).
      const canonicalFull = await bodyText(buildBuilderExamDocument({
        title: "T", settings: SINGLE_QUESTION_BUILDER_SETTINGS, paperItems: [resolved.paperItem], includeAnswers,
      }));
      const cut = canonicalFull.indexOf("정 답 표");
      out[name + (includeAnswers ? ":answers" : "")] = {
        route,
        canonical: (cut >= 0 ? canonicalFull.slice(0, cut) : canonicalFull).trimEnd(),
        stem: input.question.questionText,
      };
    }
    // paperItem 없이 toPaperExportItem 결과만 넘기는 호출부 — setId 는 \`set:<setId>\` 그룹 키에서 되읽어야 한다.
    const { paperItem, ...bare } = resolved;
    const bareRoute = await bodyText(buildBuilderExamDocument({
      title: "T", settings: SINGLE_QUESTION_BUILDER_SETTINGS, resolvedItems: [bare], includeAnswers: true, fullExamQuestions: [],
    }));
    out[name + ":bare"] = { route: bareRoute, canonical: out[name + ":answers"].canonical, stem: input.question.questionText };
  }
  process.stdout.write(JSON.stringify({ docs: out, passThrough }));
}

void main();
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".docx-single-question-passage-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      /* ignore */
    }
  }
}

const { docs, passThrough } = runHarness();
const PASSAGE_TAIL = /rebuild it\.|개입하기 시작했다/g;
const count = (text, re) => (text.match(re) || []).length;

test("single-question DOCX: harness mirrors the route call shape", () => {
  const route = readFileSync(
    path.join(repoRoot, "src/app/api/questions/[questionId]/export-docx/route.ts"),
    "utf8",
  );
  assert.match(route, /buildSingleResolvedItem\(/);
  assert.match(route, /resolvedItems:\s*\[resolvedItem\]/);
  assert.match(route, /fullExamQuestions:\s*\[\]/);
});

test("single-question DOCX: the bundled canonical PaperItem passes through unchanged", () => {
  assert.ok(Object.keys(passThrough).length > 0);
  for (const [name, same] of Object.entries(passThrough)) {
    assert.equal(same, true, `${name}: paperItemsFromResolvedItems re-interpreted the loader's paperItem`);
  }
});

test("single-question DOCX: route path body == canonical paperItems body (no second interpretation)", () => {
  for (const [name, doc] of Object.entries(docs)) {
    assert.equal(doc.route, doc.canonical, `${name}: route compat path diverges from paperItems path`);
    assert.ok(!doc.route.includes("정 답 표"), `${name}: single question must not carry an answer key`);
  }
});

test("single-question DOCX: every set member prints its passage exactly once, before the stem", () => {
  for (const [name, doc] of Object.entries(docs)) {
    assert.equal(count(doc.route, PASSAGE_TAIL), 1, `${name}: passage occurrences`);
    if (name.startsWith("standalone")) continue;
    const passageAt = doc.route.search(PASSAGE_TAIL);
    const stemAt = doc.route.indexOf(doc.stem);
    assert.ok(stemAt > 0 && passageAt >= 0 && passageAt < stemAt, `${name}: shared passage must precede the stem`);
  }
});

test("single-question DOCX: English/gichul set members keep the set prompt", () => {
  for (const [name, doc] of Object.entries(docs)) {
    if (!name.startsWith("gichul") && !name.startsWith("english")) continue;
    assert.match(doc.route, /\[1\] 다음 글을 읽고, 물음에 답하시오\./, `${name}: set prompt missing`);
  }
});
