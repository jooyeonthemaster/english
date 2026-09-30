// ============================================================================
// export-parity / hwpx-adapter — HWPX 내보내기 파이프라인을 파일 없이 돌려 문항별 면을 뽑는다.
//
//  1) 진입점: export-hwpx/route.ts 가 부르는 buildExamHwpxDocument(_lib/exam-document.ts — DB·권한·기록을 뺀
//     조립 전부)를 **그대로** 부른다. 라우트가 같은 인자로 그 함수를 부르는지는 시작할 때 소스 앵커로 확인한다
//     (라우트가 다른 조립을 하기 시작하면 즉시 실패 — 조용한 드리프트 금지). packageHwpx(zip)는 부르지 않는다.
//  2) 계측: IR 본문을 순서대로 걸으며 문항 머리(keepRole questionHead)·탐침 토큰·배지·답란 표를 사건으로 뽑고,
//     정답표 구역에서 번호→정답을 읽는다.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { buildExamHwpxDocument } from "@/app/api/exams/[examId]/export-hwpx/_lib/exam-document";
import type { BlockNode, HwpxDocument, ParagraphNode, TableNode } from "@/app/api/exams/[examId]/export-hwpx/_lib/types";
import type { SavedPaperExamQuestion } from "@/components/exams/paper-builder/saved-paper-items";
import { findSentinels } from "./probe";
import type { StreamEvent } from "./compare";
import { META_BADGE_RE, assertRouteGlue, type ExportProbe, type GlueCheck } from "./export-common";

const ROUTE_FILE = "src/app/api/exams/[examId]/export-hwpx/route.ts";

/** 라우트가 문서를 만드는 호출(공백 무시). 이 식이 그대로 있어야 감사가 라우트와 같은 조립을 돈다. */
export const HWPX_GLUE_ANCHORS = [
  "const { doc } = await buildExamHwpxDocument({ title: exam.title, settings: exam.settings, questions: exam.questions, includeAnswers,",
  "passage: { select: { title: true, content: true } },",
  "where: { question: { deletedAt: null } },",
];

export function checkHwpxGlue(repoRoot: string): GlueCheck {
  const src = fs.readFileSync(path.join(repoRoot, ROUTE_FILE), "utf8");
  return assertRouteGlue(ROUTE_FILE, src, HWPX_GLUE_ANCHORS, "buildExamHwpxDocument");
}

export type HwpxBuilt = {
  doc: HwpxDocument;
  /** 본문 머리·정답표 번호 → 문항 id 를 잇는 목록(파이프라인 자신의 PaperItem 번호) */
  items: Array<{ orderNum: number; questionId: string }>;
};

/** 라우트 GET 의 문서 빌드와 같은 호출(정답 미포함 인쇄본). 시험일 칸은 계측 대상이 아니라 비운다. */
export async function buildHwpxLikeRoute(
  title: string,
  settingsRaw: string | null,
  questions: readonly SavedPaperExamQuestion[],
): Promise<HwpxBuilt> {
  const { doc, paperItems } = await buildExamHwpxDocument({
    title,
    settings: settingsRaw,
    questions,
    includeAnswers: false,
    examDateLabel: "",
  });
  return {
    doc,
    items: paperItems
      .filter((it) => it.blockType === "question")
      .map((it) => ({ orderNum: it.orderNum, questionId: it.questionId })),
  };
}

// ─── IR 계측 ────────────────────────────────────────────────────────────────

function paraText(p: ParagraphNode): string {
  return p.runs.map((r) => (r.kind === "text" ? r.text : r.kind === "br" ? "\n" : "")).join("");
}

function tableText(t: TableNode): string {
  return t.rows
    .flatMap((row) => row.cells.flatMap((cell) => cell.blocks.map((b) => blockText(b))))
    .join("");
}

function blockText(b: BlockNode): string {
  if (b.kind === "p") return paraText(b);
  if (b.kind === "tbl") return tableText(b);
  return "";
}

function blockTexts(blocks: readonly BlockNode[] | undefined): string {
  return (blocks ?? []).map(blockText).join("").trim();
}

/** 답란 한 줄 = 1×1 표, 아랫변만 실선, 글자 없음(render/question.ts ANSWER_LINE 표). 구분선 블록은 윗변 실선이라 제외. */
export function isHwpxAnswerLineTable(t: TableNode): boolean {
  if (t.rows.length !== 1 || t.rows[0].cells.length !== 1) return false;
  const b = t.borders;
  if (!b || b.bottom?.type !== "SOLID") return false;
  if (b.top && b.top.type && b.top.type !== "NONE") return false;
  return tableText(t).trim() === "";
}

const HEAD_NUM_RE = /^\s*(\d+)\.\s/;

function isAnswerKeySection(blocks: readonly BlockNode[]): boolean {
  const first = blocks.find((b) => b.kind === "p" && paraText(b).trim());
  return Boolean(first && first.kind === "p" && paraText(first).replace(/\s+/g, "") === "정답표");
}

export function hwpxProbe(
  doc: HwpxDocument,
  headQuestionIds: (orderNum: number) => string | null,
  ownerByToken: ReadonlyMap<string, string>,
): ExportProbe {
  const events: StreamEvent[] = [];
  const answerEntries: Array<{ orderNum: number; answer: string }> = [];
  let unit = 0;
  const walk = (blocks: readonly BlockNode[]) => {
    for (const b of blocks) {
      if (b.kind === "tbl") {
        if (isHwpxAnswerLineTable(b)) {
          events.push({ kind: "answerLine", unit: unit++ });
          continue;
        }
        for (const row of b.rows) for (const cell of row.cells) walk(cell.blocks);
        continue;
      }
      if (b.kind !== "p") continue;
      const u = unit++;
      const text = paraText(b);
      if (b.keepRole === "questionHead") {
        const m = HEAD_NUM_RE.exec(text);
        if (m) {
          const n = Number(m[1]);
          events.push({ kind: "head", questionId: headQuestionIds(n), orderNum: n, unit: u });
        }
      }
      if (b.runs.some((r) => r.kind === "text" && META_BADGE_RE.test(r.text.trim()))) {
        events.push({ kind: "meta", unit: u });
      }
      for (const token of findSentinels(text)) {
        const owner = ownerByToken.get(token);
        if (owner) events.push({ kind: "passage", owner, unit: u });
      }
    }
  };
  const readAnswerKey = (blocks: readonly BlockNode[]) => {
    for (const b of blocks) {
      if (b.kind === "tbl" && b.rows.length === 2) {
        const [nums, answers] = b.rows;
        if (blockTexts(nums.cells[0]?.blocks) !== "문항" || blockTexts(answers.cells[0]?.blocks) !== "정답") continue;
        nums.cells.slice(1).forEach((cell, i) => {
          const n = Number(blockTexts(cell.blocks));
          if (Number.isFinite(n) && n > 0) {
            answerEntries.push({ orderNum: n, answer: blockTexts(answers.cells[i + 1]?.blocks ?? []) });
          }
        });
      } else if (b.kind === "p") {
        const first = b.runs[0];
        const m = first && first.kind === "text" ? /^(\d+)\.\s*$/.exec(first.text) : null;
        if (m) {
          const rest = b.runs.slice(1).map((r) => (r.kind === "text" ? r.text : "")).join("");
          answerEntries.push({ orderNum: Number(m[1]), answer: rest.trim() });
        }
      }
    }
  };
  let answerKeyFound = false;
  for (const s of doc.sections) {
    if (isAnswerKeySection(s.blocks)) {
      answerKeyFound = true;
      readAnswerKey(s.blocks);
    } else {
      walk(s.blocks);
    }
  }
  return { events, answerEntries, answerKeyFound };
}
