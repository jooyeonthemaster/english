import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  ForecastPassage,
  ForecastQBody,
  ForecastQType,
  ForecastQuestion,
  ForecastSet,
  ForecastSetItem,
} from "./types";

// exam-forecast 서버 조회. 테이블은 관계 없음(packId 느슨한 참조) — 팩 하나 단위로 읽는다.

export interface ForecastPackView {
  id: string;
  slug: string;
  schoolName: string;
  title: string;
  subtitle: string | null;
  examMeta: Record<string, unknown>;
  analysis: Record<string, unknown>;
  rangeInfo: Record<string, unknown>;
  status: string;
  updatedAt: string;
}

/** 목록·필터용 문항 요약(본문 제외) */
export interface ForecastQuestionSummary {
  id: string;
  code: string;
  passageId: string;
  role: "reference" | "forecast";
  qtype: ForecastQType;
  kind: "MC" | "ESSAY";
  difficulty: number;
  points: number | null;
  sortOrder: number;
  tags: string[];
  /** 발문 평문 */
  stem: string;
  /** 정답(선택형 ①..⑤ / 서술형은 앞 40자) */
  answerShort: string;
  /** 이 문항을 쓰는 봉투 회차 */
  setNos: number[];
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function asArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * 열람 권한 — examMeta.access.academyIds 가 있으면 그 학원 스태프만. 없으면 원장 전원.
 * (학교 시험지 원본·교재 지문이 들어 있어 기본은 잠가 둔다. 넓히려면 DB 의 examMeta.access 만 고친다.)
 */
export function canAccessForecastPack(pack: Pick<ForecastPackView, "examMeta">, staff: { academyId: string }): boolean {
  const access = asObj(pack.examMeta.access);
  const ids = asArr<string>(access.academyIds);
  return ids.length === 0 || ids.includes(staff.academyId);
}

export async function getForecastPack(slug: string): Promise<ForecastPackView | null> {
  const p = await prisma.examForecastPack.findUnique({ where: { slug } });
  if (!p) return null;
  return {
    id: p.id,
    slug: p.slug,
    schoolName: p.schoolName,
    title: p.title,
    subtitle: p.subtitle,
    examMeta: asObj(p.examMeta),
    analysis: asObj(p.analysis),
    rangeInfo: asObj(p.rangeInfo),
    status: p.status,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function listForecastPacks(academyId: string) {
  const rows = await prisma.examForecastPack.findMany({
    select: { slug: true, schoolName: true, title: true, subtitle: true, status: true, updatedAt: true, examMeta: true },
    orderBy: { updatedAt: "desc" },
  });
  return rows
    .filter((r) => canAccessForecastPack({ examMeta: asObj(r.examMeta) }, { academyId }))
    .map((r) => ({ slug: r.slug, schoolName: r.schoolName, title: r.title, subtitle: r.subtitle, status: r.status, updatedAt: r.updatedAt }));
}

export async function getForecastPassages(packId: string): Promise<ForecastPassage[]> {
  const rows = await prisma.examForecastPassage.findMany({ where: { packId }, orderBy: { sortOrder: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    sourceGroup: r.sourceGroup,
    sourceLabel: r.sourceLabel,
    sortOrder: r.sortOrder,
    titleKo: r.titleKo,
    titleEn: r.titleEn,
    text: r.text,
    sentences: asArr<string>(r.sentences),
    footnotes: asArr<string>(r.footnotes),
    analysis: asObj(r.analysis),
    prediction: asObj(r.prediction),
  }));
}

export async function getForecastSets(packId: string): Promise<ForecastSet[]> {
  const rows = await prisma.examForecastSet.findMany({ where: { packId }, orderBy: { no: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    no: r.no,
    title: r.title,
    tier: r.tier,
    description: r.description,
    items: asArr<ForecastSetItem>(r.items),
    pdfPaths: asObj(r.pdfPaths) as ForecastSet["pdfPaths"],
  }));
}

function stemPlain(body: ForecastQBody): string {
  return (body.stem || body.groupStem || "").replace(/<\/?[ubi]>/g, "").trim();
}

export async function getForecastQuestionSummaries(packId: string, sets: ForecastSet[]): Promise<ForecastQuestionSummary[]> {
  const rows = await prisma.examForecastQuestion.findMany({
    where: { packId },
    select: {
      id: true,
      code: true,
      passageId: true,
      role: true,
      qtype: true,
      kind: true,
      difficulty: true,
      points: true,
      sortOrder: true,
      tags: true,
      body: true,
      answer: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  const setMap = new Map<string, number[]>();
  for (const s of sets) for (const it of s.items) setMap.set(it.questionId, [...(setMap.get(it.questionId) ?? []), s.no]);
  return rows.map((r) => {
    const body = asObj(r.body) as unknown as ForecastQBody;
    return {
      id: r.id,
      code: r.code,
      passageId: r.passageId,
      role: r.role === "reference" ? "reference" : "forecast",
      qtype: r.qtype as ForecastQType,
      kind: r.kind === "ESSAY" ? "ESSAY" : "MC",
      difficulty: r.difficulty,
      points: r.points,
      sortOrder: r.sortOrder,
      tags: asArr<string>(r.tags),
      stem: stemPlain(body),
      answerShort: r.answer.length > 40 ? `${r.answer.slice(0, 40)}…` : r.answer,
      setNos: setMap.get(r.id) ?? [],
    };
  });
}

function toQuestion(r: {
  id: string;
  code: string;
  passageId: string;
  role: string;
  qtype: string;
  kind: string;
  difficulty: number;
  points: number | null;
  body: unknown;
  answer: string;
  explanation: string;
  rationale: string;
  transform: unknown;
  tags: unknown;
  sortOrder: number;
}, passageCode: string): ForecastQuestion {
  return {
    id: r.id,
    code: r.code,
    passageCode,
    role: r.role === "reference" ? "reference" : "forecast",
    qtype: r.qtype as ForecastQType,
    kind: r.kind === "ESSAY" ? "ESSAY" : "MC",
    difficulty: r.difficulty,
    points: r.points,
    body: asObj(r.body) as unknown as ForecastQBody,
    answer: r.answer,
    explanation: r.explanation,
    rationale: r.rationale,
    transform: asObj(r.transform) as unknown as ForecastQuestion["transform"],
    tags: asArr<string>(r.tags),
    sortOrder: r.sortOrder,
  };
}

/** 본문 포함 문항 — id 목록 순서 보존 */
export async function getForecastQuestionsByIds(packId: string, ids: string[]): Promise<ForecastQuestion[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.examForecastQuestion.findMany({ where: { packId, id: { in: ids } } });
  const passages = await prisma.examForecastPassage.findMany({
    where: { packId, id: { in: Array.from(new Set(rows.map((r) => r.passageId))) } },
    select: { id: true, code: true },
  });
  const pcode = new Map(passages.map((p) => [p.id, p.code]));
  const byId = new Map(rows.map((r) => [r.id, toQuestion(r, pcode.get(r.passageId) ?? "")]));
  return ids.map((id) => byId.get(id)).filter((q): q is ForecastQuestion => Boolean(q));
}

/** sortOrder 번호 목록 → 문항(인쇄 URL 이 짧도록 번호로 주고받는다) */
export async function getForecastQuestionsByOrders(packId: string, orders: number[]): Promise<ForecastQuestion[]> {
  if (orders.length === 0) return [];
  const rows = await prisma.examForecastQuestion.findMany({ where: { packId, sortOrder: { in: orders } }, select: { id: true, sortOrder: true } });
  const idByOrder = new Map(rows.map((r) => [r.sortOrder, r.id]));
  return getForecastQuestionsByIds(
    packId,
    orders.map((o) => idByOrder.get(o)).filter((x): x is string => Boolean(x)),
  );
}

export async function getForecastQuestionsByPassage(packId: string, passageId: string): Promise<ForecastQuestion[]> {
  const rows = await prisma.examForecastQuestion.findMany({ where: { packId, passageId }, orderBy: { sortOrder: "asc" } });
  const p = await prisma.examForecastPassage.findFirst({ where: { id: passageId }, select: { code: true } });
  return rows.map((r) => toQuestion(r, p?.code ?? ""));
}

/** 문제집 — 예측 문항 전부(지문 순). sourceGroup 을 주면 그 출처만 */
export async function getForecastWorkbookQuestions(packId: string, sourceGroup?: string): Promise<ForecastQuestion[]> {
  const passages = await prisma.examForecastPassage.findMany({
    where: { packId, ...(sourceGroup ? { sourceGroup } : { sourceGroup: { not: "기출" } }) },
    select: { id: true, code: true },
  });
  const pcode = new Map(passages.map((p) => [p.id, p.code]));
  const rows = await prisma.examForecastQuestion.findMany({
    where: { packId, role: "forecast", passageId: { in: passages.map((p) => p.id) } },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((r) => toQuestion(r, pcode.get(r.passageId) ?? ""));
}

export { decodeOrderList, encodeOrderList } from "./order-list";
