import { notFound, redirect } from "next/navigation";

import type { ExamDetail, ExamQuestion } from "@/components/exams/exam-detail-client-parts/types";
import { getStaffSession } from "@/lib/auth";
import {
  buildGichulRenderExam,
  selectExamBankItemsForRender,
  selectExamBankSetsForRender,
} from "@/lib/exam-passages/question-bank-render";
import { prisma } from "@/lib/prisma";
import { PaperOverflowClient } from "./client";

// 시험지 조판 세로 넘침 전수 검증 페이지(개발 전용, 스태프 세션 필요, DB 읽기 전용).
//   /director/dev/paper-overflow?qids=a,b[&bank=x,y][&setKeys=k][&recent=40&skip=0&sub=BLANK_INFERENCE]
//                               [&cols=1|2][&density=compact][&passage=boxed|underlined][&answer=0][&seed=7]
// 학원 소속 문항(qids·recent)과 기출 은행 항목(bank·setKeys)을 섞어 실제 조판기(ExamDetailPaperPreview)로
// 모든 페이지를 즉시 마운트해 그린다 — 하네스가 칸마다 실측 높이와 가용 높이를 비교해 넘침을 잡는다.
// 프로덕션에서는 GICHUL_RENDER_DEV=1 이 없으면 404.

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

function list(v: string | string[] | undefined): string[] {
  return one(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const QUESTION_INCLUDE = {
  passage: {
    select: {
      id: true,
      title: true,
      content: true,
      grade: true,
      semester: true,
      publisher: true,
      school: { select: { id: true, name: true } },
    },
  },
  explanation: true,
  collectionItems: { select: { collectionId: true } },
  _count: { select: { examLinks: true } },
} as const;

// 결정론 셔플(시드 고정) — 같은 URL 은 같은 순서를 그린다.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default async function PaperOverflowPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (process.env.NODE_ENV === "production" && process.env.GICHUL_RENDER_DEV !== "1") notFound();
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const qids = list(sp.qids);
  const recent = Math.min(200, Math.max(0, Number(one(sp.recent) || 0)));
  const skip = Math.max(0, Number(one(sp.skip) || 0));
  const subTypes = list(sp.sub);

  const dbRows = [] as Awaited<ReturnType<typeof loadRows>>;
  async function loadRows(where: Record<string, unknown>, take?: number, skipN?: number) {
    return prisma.question.findMany({
      where: { academyId: session!.academyId, deletedAt: null, ...where },
      include: QUESTION_INCLUDE,
      orderBy: { createdAt: "desc" },
      ...(take ? { take } : {}),
      ...(skipN ? { skip: skipN } : {}),
    });
  }
  if (qids.length > 0) {
    const rows = await loadRows({ id: { in: qids } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of qids) {
      const row = byId.get(id);
      if (row) dbRows.push(row);
    }
  }
  if (recent > 0) {
    dbRows.push(
      ...(await loadRows(subTypes.length ? { subType: { in: subTypes } } : {}, recent, skip)),
    );
  }

  const dbQuestions: ExamQuestion[] = dbRows.map((row, index) => ({
    id: `eq-${row.id}`,
    orderNum: index + 1,
    points: row.points,
    question: {
      ...row,
      createdAt: row.createdAt.toISOString(),
      explanation: row.explanation
        ? {
            id: row.explanation.id,
            content: row.explanation.content,
            keyPoints: row.explanation.keyPoints,
            wrongOptionExplanations: row.explanation.wrongOptionExplanations,
          }
        : null,
    },
  }));

  const bankIds = list(sp.bank);
  const setKeys = list(sp.setKeys);
  let bankQuestions: ExamQuestion[] = [];
  if (bankIds.length > 0 || setKeys.length > 0) {
    const singles = bankIds.length ? selectExamBankItemsForRender({ offset: 0, limit: 200, ids: bankIds }).items : [];
    const picked = setKeys.length ? selectExamBankSetsForRender({ offset: 0, limit: 60, setKeys }) : null;
    const exam = buildGichulRenderExam([...singles, ...(picked?.items ?? [])], "bank", { sets: picked?.sets ?? [] });
    bankQuestions = exam.questions;
  }

  const seed = Number(one(sp.seed) || 0);
  const ordered = seed ? seededShuffle([...dbQuestions, ...bankQuestions], seed) : [...dbQuestions, ...bankQuestions];
  // 세트 멤버는 같은 setId 끼리 이웃해야 한 그룹이 된다 — 셔플 뒤 첫 등장 위치로 모은다.
  const bySet = new Map<string, ExamQuestion[]>();
  const sequence: (ExamQuestion | string)[] = [];
  for (const q of ordered) {
    const setId = q.question.setId;
    if (!setId) {
      sequence.push(q);
      continue;
    }
    if (!bySet.has(setId)) {
      bySet.set(setId, []);
      sequence.push(setId);
    }
    bySet.get(setId)!.push(q);
  }
  const questions = sequence
    .flatMap((entry) => (typeof entry === "string" ? bySet.get(entry)! : [entry]))
    .map((q, index) => ({ ...q, orderNum: index + 1 }));

  const cols = one(sp.cols) === "1" ? 1 : 2;
  const density = one(sp.density) === "compact" ? "compact" : "comfortable";
  const passage = one(sp.passage);
  const exam: ExamDetail = {
    id: "paper-overflow",
    title: `넘침 검증 ${questions.length}문항`,
    type: "PRACTICE",
    status: "DRAFT",
    subject: "ENGLISH",
    examDate: null,
    duration: null,
    totalPoints: questions.reduce((n, q) => n + q.points, 0),
    grade: null,
    semester: null,
    examType: null,
    shuffleQuestions: false,
    shuffleOptions: false,
    showResults: false,
    settings: JSON.stringify({
      layout: {
        columns: cols,
        density,
        ...(passage === "boxed" || passage === "underlined" ? { passageStyle: passage } : {}),
        showAnswerSpace: one(sp.answer) !== "0",
        ...(one(sp.meta) === "1" ? { showQuestionMeta: true } : {}),
      },
      ...(one(sp.template) ? { template: one(sp.template) } : {}),
    }),
    class: null,
    school: null,
    questions,
    submissions: [],
  };
  const manifest = questions.map((q) => ({ id: q.question.id, subType: q.question.subType, setId: q.question.setId ?? null }));
  return <PaperOverflowClient exam={exam} manifest={manifest} />;
}
