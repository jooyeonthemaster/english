// ============================================================================
// export-parity / docx-adapter — DOCX 내보내기 파이프라인을 파일 없이 돌려 문항별 면을 뽑는다.
//
//  1) 진입점: export-docx/route.ts 가 부르는 buildExamDocxDocument(build-builder-document/assemble.ts — DB·파일·
//     이미지 변환 없는 순수 조립)를 그대로 부른다. 라우트가 parseSavedPaperSettings 결과를 같은 인자로 넘기는지는
//     소스 앵커로 확인한다. Packer(zip)는 부르지 않는다. 이미지 PNG 변환은 계측 면(지문·답란·배지·정답표)과
//     무관해 생략한다.
//  2) 계측: 문서 본문(w:body)을 순서대로 걸으며 문항 머리(첫 런이 굵은 「N. 」)·탐침·배지·답란을 사건으로 뽑고,
//     「정 답 표」 뒤에서 번호→정답을 읽는다. (레거시 렌더러 쓰기 칸 인식은 baseline 파이프라인용으로 남긴다.)
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import type { Document } from "docx";
import { buildExamDocxDocument } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document/assemble";
import {
  buildPaperItemsFromExam,
  parseSavedPaperSettings,
  type SavedPaperExamQuestion,
} from "@/components/exams/paper-builder/saved-paper-items";
import { findSentinels } from "./probe";
import type { StreamEvent } from "./compare";
import { META_BADGE_RE, assertRouteGlue, type ExportProbe, type GlueCheck } from "./export-common";

const ROUTE_FILE = "src/app/api/exams/[examId]/export-docx/route.ts";

export const DOCX_GLUE_ANCHORS = [
  "const settings = parseSavedPaperSettings(exam.settings);",
  "const doc = buildExamDocxDocument({ title: exam.title, examQuestions: exam.questions, settings, includeAnswers, });",
  "passage: { select: { title: true, content: true } },",
  "where: { question: { deletedAt: null } },",
];

export function checkDocxGlue(repoRoot: string): GlueCheck {
  const src = fs.readFileSync(path.join(repoRoot, ROUTE_FILE), "utf8");
  return assertRouteGlue(ROUTE_FILE, src, DOCX_GLUE_ANCHORS, "buildExamDocxDocument");
}

export type DocxBuilt = {
  doc: Document;
  path: "builder" | "legacy";
  items: Array<{ orderNum: number; questionId: string }>;
};

/** 라우트 GET 의 문서 빌드와 같은 호출(정답 미포함). 번호 대응은 같은 입력의 공용 PaperItem 에서 읽는다. */
export function buildDocxLikeRoute(
  title: string,
  settingsRaw: string | null,
  examQuestions: readonly SavedPaperExamQuestion[],
): DocxBuilt {
  const settings = parseSavedPaperSettings(settingsRaw);
  const doc = buildExamDocxDocument({ title, examQuestions, settings, includeAnswers: false });
  const items = buildPaperItemsFromExam(examQuestions, parseSavedPaperSettings(settingsRaw))
    .filter((it) => it.blockType === "question")
    .map((it) => ({ orderNum: it.orderNum, questionId: it.questionId }));
  return { doc, path: "builder", items };
}

// ─── docx.js 객체 트리 계측 (docx 9.x: {rootKey, root:[...]} ) ─────────────────────────────

type XNode = { rootKey?: string; root?: unknown };

function kids(node: unknown): unknown[] {
  const r = (node as XNode | null)?.root;
  return Array.isArray(r) ? r : [];
}

function keyOf(node: unknown): string | undefined {
  return (node as XNode | null)?.rootKey;
}

function childrenByKey(node: unknown, key: string): XNode[] {
  return kids(node).filter((c) => keyOf(c) === key) as XNode[];
}

function runText(run: unknown): string {
  let out = "";
  for (const c of kids(run)) {
    if (keyOf(c) === "w:t") out += kids(c).filter((s): s is string => typeof s === "string").join("");
    else if (keyOf(c) === "w:br") out += "\n";
    else if (keyOf(c) === "w:tab") out += "\t";
  }
  return out;
}

function runIsBold(run: unknown): boolean {
  return childrenByKey(run, "w:rPr").some((p) => childrenByKey(p, "w:b").length > 0);
}

function paraRuns(p: unknown): XNode[] {
  return childrenByKey(p, "w:r");
}

function paraText(p: unknown): string {
  return paraRuns(p).map(runText).join("");
}

function attrOf(node: unknown): Record<string, { value?: unknown }> {
  const a = kids(node).find((c) => keyOf(c) === "_attr") as XNode | undefined;
  return (a?.root ?? {}) as Record<string, { value?: unknown }>;
}

/** 빌더 답란 한 줄 = 아랫변만 single·색 999999(COLOR.lightGray)인 공백 문단(question.ts 서술형 답란). hrule(CCCCCC)과 다르다. */
export function isDocxBuilderAnswerLine(p: unknown): boolean {
  const pBdr = childrenByKey(p, "w:pPr").flatMap((pp) => childrenByKey(pp, "w:pBdr"))[0];
  if (!pBdr) return false;
  const side = (k: string) => attrOf(childrenByKey(pBdr, k)[0]);
  const bottom = side("w:bottom");
  if (bottom.style?.value !== "single" || String(bottom.color?.value).toUpperCase() !== "999999") return false;
  if (side("w:top").style?.value && side("w:top").style?.value !== "none") return false;
  return paraText(p).trim() === "";
}

function tableCells(tbl: unknown): XNode[] {
  return childrenByKey(tbl, "w:tr").flatMap((tr) => childrenByKey(tr, "w:tc"));
}

function tableText(tbl: unknown): string {
  return tableCells(tbl)
    .flatMap((tc) => kids(tc).map((c) => (keyOf(c) === "w:p" ? paraText(c) : keyOf(c) === "w:tbl" ? tableText(c) : "")))
    .join("");
}

/** 레거시 쓰기 칸 = 글자 없는 1×1 표(helpers.renderWritingSpace 긴 칸) 또는 「정답: ____」 문단. */
function isDocxLegacyWritingBox(node: unknown): boolean {
  if (keyOf(node) === "w:tbl") {
    const rows = childrenByKey(node, "w:tr");
    return rows.length === 1 && tableCells(node).length === 1 && tableText(node).trim() === "";
  }
  if (keyOf(node) === "w:p") return /^정답:\s*_{5,}/.test(paraText(node).trim());
  return false;
}

function findBody(doc: Document): unknown {
  const seen = new Set<unknown>();
  const stack: unknown[] = [(doc as unknown as { documentWrapper?: { document?: unknown } }).documentWrapper?.document];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== "object" || seen.has(n)) continue;
    seen.add(n);
    if (keyOf(n) === "w:body") return n;
    for (const c of kids(n)) stack.push(c);
  }
  throw new Error("docx body not found");
}

const HEAD_RUN_RE = /^(\d+)\.\s$/;

export function docxProbe(
  doc: Document,
  bodyPath: "builder" | "legacy",
  headQuestionIds: (orderNum: number) => string | null,
  ownerByToken: ReadonlyMap<string, string>,
): ExportProbe {
  const events: StreamEvent[] = [];
  const answerEntries: Array<{ orderNum: number; answer: string }> = [];
  let unit = 0;
  let inAnswerKey = false;
  let answerKeyFound = false;
  const visitPara = (p: unknown, topLevel: boolean) => {
    const u = unit++;
    const text = paraText(p);
    if (topLevel && text.replace(/\s+/g, "") === "정답표") {
      inAnswerKey = true;
      answerKeyFound = true;
      return;
    }
    const runs = paraRuns(p);
    const first = runs[0];
    const headMatch = first ? HEAD_RUN_RE.exec(runText(first)) : null;
    if (inAnswerKey) {
      if (headMatch) {
        answerEntries.push({ orderNum: Number(headMatch[1]), answer: runs.slice(1).map(runText).join("").trim() });
      }
      return;
    }
    if (topLevel && headMatch && runIsBold(first)) {
      // DOCX 에는 머리 표지가 없다(keepRole 없음) — 굵은 「N. 」 중 파이프라인 문항 차례와 맞는 것만 머리다.
      // 맞지 않는 것(발문 속 「[조건] 1. …」 목록 등)은 머리가 아니다.
      const n = Number(headMatch[1]);
      const qid = headQuestionIds(n);
      if (qid) events.push({ kind: "head", questionId: qid, orderNum: n, unit: u });
    }
    if (runs.some((r) => META_BADGE_RE.test(runText(r).trim()))) events.push({ kind: "meta", unit: u });
    if (bodyPath === "builder" && topLevel && isDocxBuilderAnswerLine(p)) events.push({ kind: "answerLine", unit: u });
    if (bodyPath === "legacy" && topLevel && isDocxLegacyWritingBox(p)) events.push({ kind: "answerBox", unit: u });
    for (const token of findSentinels(text)) {
      const owner = ownerByToken.get(token);
      if (owner) events.push({ kind: "passage", owner, unit: u });
    }
  };
  const visit = (node: unknown, topLevel: boolean) => {
    const k = keyOf(node);
    if (k === "w:p") return visitPara(node, topLevel);
    if (k === "w:tbl") {
      if (!inAnswerKey && bodyPath === "legacy" && topLevel && isDocxLegacyWritingBox(node)) {
        events.push({ kind: "answerBox", unit: unit++ });
        return;
      }
      for (const tc of tableCells(node)) for (const c of kids(tc)) visit(c, false);
    }
  };
  for (const child of kids(findBody(doc))) visit(child, true);
  return { events, answerEntries, answerKeyFound };
}
