// ============================================================================
// export-parity / load — 읽기 전용 Prisma 로더. 쓰기 연산은 확장 훅에서 즉시 예외(운영 DB 쓰기 0건 보장).
// 문항 include 는 웹 getExam(지문 id·제목·본문)과 HWPX/DOCX 라우트(지문 제목·본문, 해설 3필드)의 합집합이다.
// ============================================================================
import { PrismaClient } from "@prisma/client";

const READ_OPS = new Set(["findMany", "findFirst", "findUnique", "findFirstOrThrow", "findUniqueOrThrow", "count", "aggregate", "groupBy"]);

export function createReadOnlyPrisma() {
  const base = new PrismaClient();
  const client = base.$extends({
    query: {
      $allOperations({ operation, args, query }) {
        if (operation === "$queryRawUnsafe" || operation === "$queryRaw") {
          const sql = String(Array.isArray(args) ? args[0] : (args as { strings?: string[] })?.strings?.join("?") ?? args);
          if (!/^\s*(select|with)\b/i.test(sql)) throw new Error(`read-only guard: non-SELECT raw query refused`);
          return query(args);
        }
        if (!READ_OPS.has(operation)) throw new Error(`read-only guard: ${operation} refused`);
        return query(args);
      },
    },
  });
  return { client, disconnect: () => base.$disconnect() };
}

export type ReadOnlyPrisma = ReturnType<typeof createReadOnlyPrisma>["client"];

export type LoadedExamQuestion = {
  orderNum: number;
  points: number;
  question: {
    id: string;
    type: string;
    subType: string | null;
    questionText: string;
    structuredData: unknown;
    options: string | null;
    correctAnswer: string;
    difficulty: string;
    points: number | null;
    setId: string | null;
    passage: { id: string; title: string; content: string } | null;
    explanation: { content: string; keyPoints: string | null; wrongOptionExplanations: string | null } | null;
  };
};

export type LoadedExam = {
  id: string;
  title: string;
  academyId: string;
  settings: string | null;
  printCount: number;
  questions: LoadedExamQuestion[];
};

export async function listExamIds(
  db: ReadOnlyPrisma,
  filter: { academyId?: string; examIds?: string[]; limit?: number },
): Promise<string[]> {
  const rows = await db.exam.findMany({
    where: {
      ...(filter.academyId ? { academyId: filter.academyId } : {}),
      ...(filter.examIds?.length ? { id: { in: filter.examIds } } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    ...(filter.limit ? { take: filter.limit } : {}),
  });
  return rows.map((r) => r.id);
}

export async function loadExams(db: ReadOnlyPrisma, ids: string[]): Promise<LoadedExam[]> {
  const rows = await db.exam.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      academyId: true,
      settings: true,
      printCount: true,
      questions: {
        where: { question: { deletedAt: null } },
        orderBy: { orderNum: "asc" },
        select: {
          orderNum: true,
          points: true,
          question: {
            select: {
              id: true,
              type: true,
              subType: true,
              questionText: true,
              structuredData: true,
              options: true,
              correctAnswer: true,
              difficulty: true,
              points: true,
              setId: true,
              passage: { select: { id: true, title: true, content: true } },
              explanation: { select: { content: true, keyPoints: true, wrongOptionExplanations: true } },
            },
          },
        },
      },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r as unknown as LoadedExam]));
  return ids.map((id) => byId.get(id)).filter((e): e is LoadedExam => Boolean(e));
}

/** 시험지별 내보내기 이력(EXAM_EXPORT 이벤트 수, 형식별). */
export async function loadExportCounts(db: ReadOnlyPrisma): Promise<Map<string, Record<string, number>>> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT "resourceId" AS id, metadata->>'format' AS fmt, count(*)::int AS n FROM app_events WHERE "eventType"='EXAM_EXPORT' GROUP BY 1,2`,
  )) as Array<{ id: string; fmt: string | null; n: number }>;
  const out = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const m = out.get(r.id) ?? {};
    m[r.fmt ?? "?"] = r.n;
    out.set(r.id, m);
  }
  return out;
}

export function settingsKind(raw: string | null): "null" | "builder-v2" | "builder-v1" | "similar-v1" | "other" {
  if (!raw) return "null";
  let parsed: Record<string, unknown> | null = null;
  try {
    const v = JSON.parse(raw);
    parsed = v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return "other";
  }
  if (!parsed) return "other";
  if (parsed.source === "exam-paper-builder-v1" && parsed.similarExam) return "similar-v1";
  if (parsed.source === "exam-paper-builder-v2") return "builder-v2";
  if (parsed.source === "exam-paper-builder-v1") return "builder-v1";
  return "other";
}
