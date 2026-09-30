// ============================================================================
// orphan-passage / load — 백필 계획에 필요한 운영 데이터(SELECT 전용). 쓰기는 이 모듈에 없다.
// 고아 = 살아 있는(deletedAt NULL) 문항 중 passageId 가 NULL 인 것. 지워진 원 지문 id 는 생성 잡의
// result.passageId(+ result.questionIds 로 문항 대응)에서 읽는다 — 지문 삭제는 FK SET NULL 이라 흔적이 잡에만 남는다.
// ============================================================================
import type { ReadOnlyPrisma } from "../../exam-pagination/export-parity/load";

export type OrphanQuestion = {
  id: string;
  academyId: string;
  subType: string | null;
  questionText: string;
  structuredData: unknown;
  options: string | null;
  correctAnswer: string;
  setId: string | null;
  createdAt: Date;
  /** md5(structuredData::text) — 적용 시 낙관적 동시성 가드 */
  sdMd5: string;
};

export type JobLink = {
  questionId: string;
  jobId: string;
  academyId: string;
  title: string;
  jobPassageId: string | null;
  resultPassageId: string | null;
  createdAt: Date;
  /** 그 잡이 낸 문항 수(result.questionIds 길이) — 1 이면 이 문항 하나만 낸 잡 */
  jobQuestionCount: number;
  /** config.clientTempId — 빠른 생성 경로는 `fast:<지문 id>:<유형>:…` 로 지문 id 를 담는다 */
  clientTempId: string | null;
};

export type LivePassage = { id: string; academyId: string; title: string; content: string; createdAt: Date };

export type SnapshotRow = {
  examId: string;
  academyId: string;
  examTitle: string;
  updatedAt: Date;
  src: "items" | "blocks";
  questionId: string;
  passageContent: string;
  passageTitle: string | null;
};

export type ExamUse = { questionId: string; examId: string; title: string; printCount: number; academyId: string };

export type RelinkableJob = { id: string; academyId: string; domain: string; rp: string };

export type BackfillData = {
  orphans: OrphanQuestion[];
  jobLinks: JobLink[];
  existingPassageIds: Set<string>;
  livePassages: LivePassage[];
  snapshots: SnapshotRow[];
  examUses: ExamUse[];
  relinkableJobs: RelinkableJob[];
};

async function q<T>(db: ReadOnlyPrisma, sql: string, ...params: unknown[]): Promise<T[]> {
  return (await db.$queryRawUnsafe(sql, ...params)) as T[];
}

export async function loadBackfillData(db: ReadOnlyPrisma, academyId: string | null): Promise<BackfillData> {
  const orphans = await q<OrphanQuestion>(
    db,
    `SELECT q.id, q."academyId", q."subType", q."questionText", q."structuredData", q.options, q."correctAnswer",
            q."setId", q."createdAt", md5(coalesce(q."structuredData"::text, '')) AS "sdMd5"
       FROM questions q
      WHERE q."passageId" IS NULL AND q."deletedAt" IS NULL AND ($1::text IS NULL OR q."academyId" = $1::text)
      ORDER BY q."academyId", q."createdAt", q.id`,
    academyId,
  );
  const ids = orphans.map((o) => o.id);
  const jobLinks = await q<JobLink>(
    db,
    `SELECT x.qid AS "questionId", j.id AS "jobId", j."academyId", j.title, j."passageId" AS "jobPassageId",
            j.result->>'passageId' AS "resultPassageId", j."createdAt",
            jsonb_array_length(j.result->'questionIds')::int AS "jobQuestionCount",
            CASE WHEN jsonb_typeof(j.config) = 'object' THEN j.config->>'clientTempId' END AS "clientTempId"
       FROM workbench_ai_jobs j
       CROSS JOIN LATERAL jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(j.result->'questionIds') = 'array' THEN j.result->'questionIds' ELSE '[]'::jsonb END
       ) AS x(qid)
      WHERE j.domain = 'QUESTION_GENERATION' AND x.qid = ANY($1::text[])`,
    ids,
  );
  const rps = [...new Set(jobLinks.map((j) => j.resultPassageId).filter((v): v is string => Boolean(v)))];
  const existing = await q<{ id: string }>(db, `SELECT id FROM passages WHERE id = ANY($1::text[])`, rps);
  const academies = [...new Set(orphans.map((o) => o.academyId))];
  const livePassages = await q<LivePassage>(
    db,
    `SELECT id, "academyId", title, content, "createdAt" FROM passages WHERE "academyId" = ANY($1::text[])`,
    academies,
  );
  const snapshots = await q<SnapshotRow>(
    db,
    `SELECT e.id AS "examId", e."academyId", e.title AS "examTitle", e."updatedAt", x.src,
            x.it->>'questionId' AS "questionId", x.it->>'passageContent' AS "passageContent",
            x.it->>'passageTitle' AS "passageTitle"
       FROM exams e
       CROSS JOIN LATERAL (
         SELECT 'items' AS src, it FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(e.settings::jsonb->'items') = 'array' THEN e.settings::jsonb->'items' ELSE '[]'::jsonb END) it
         UNION ALL
         SELECT 'blocks' AS src, it FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(e.settings::jsonb->'blocks') = 'array' THEN e.settings::jsonb->'blocks' ELSE '[]'::jsonb END) it
       ) x
      WHERE e.settings ~ '^\\s*\\{' AND x.it->>'questionId' = ANY($1::text[])
        AND length(btrim(coalesce(x.it->>'passageContent', ''))) > 0`,
    ids,
  );
  const examUses = await q<ExamUse>(
    db,
    `SELECT eq."questionId", eq."examId", e.title, e."printCount", e."academyId"
       FROM exam_questions eq JOIN exams e ON e.id = eq."examId"
      WHERE eq."questionId" = ANY($1::text[])`,
    ids,
  );
  const relinkableJobs = await q<RelinkableJob>(
    db,
    `SELECT id, "academyId", domain, result->>'passageId' AS rp
       FROM workbench_ai_jobs WHERE "passageId" IS NULL AND result->>'passageId' = ANY($1::text[])`,
    rps,
  );
  return {
    orphans,
    jobLinks,
    existingPassageIds: new Set(existing.map((r) => r.id)),
    livePassages,
    snapshots,
    examUses,
    relinkableJobs,
  };
}
