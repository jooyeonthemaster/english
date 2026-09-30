// ============================================================================
// PassageDeleteStore 의 Prisma 구현 — passage-delete-guard.ts 의 DB 포트.
//
// 인자로 받은 클라이언트(트랜잭션 tx 또는 읽기 전용 경로의 prisma)에 묶인다.
// 모든 지문 조회는 academyId 조건을 포함하고, 삭제도 {id, academyId} 로만 한다.
// 참조 테이블 목록은 pg_constraint 실측(26-09-29) 기준이다:
//   SET NULL — questions, workbench_ai_jobs, question_sets.basePassageId,
//              teacher_prompts, tutor_ai_logs  → relinkRefs 가 옮긴다
//   RESTRICT — tutor_lessons, season_passages, lesson_progress, session_records,
//              naeshin_questions, learning_sets → countRestrictRefs 가 미리 센다
//   CASCADE  — passage_analyses, passage_notes, passage_reports, webtoons,
//              tutor_conversations → 확인창에 알린다(나머지 3종은 types 주석)
// 동일 지문 후보 조회는 잘라 내지 않는다(LIMIT 금지 — 확인창·실행 불일치, 26-09-30).
// ============================================================================

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAppEvents } from "@/lib/app-events";
import {
  PASSAGE_DELETE_TX_OPTIONS,
  buildPassageDeleteAuditEvents,
  planPassageDeletion,
  runChunkedPassageDeletion,
  type ChunkedPassageDeletionResult,
  type PassageCascadeCounts,
  type PassageDeleteStore,
  type PassageRow,
  type RestrictRelation,
} from "./passage-delete-guard";
import {
  buildPassageDeletionConfirm,
  toPassageDeletionImpact,
  type PassageDeleteNoun,
  type PassageDeletionConfirm,
  type PassageDeletionImpact,
} from "./passage-delete-message";

// 오류 문구는 순수 모듈(guard)에 있다 — 서버 액션은 여기서 가져다 쓴다.
export { describePassageDeleteError } from "./passage-delete-guard";

type Db = Prisma.TransactionClient;

// ─── 서버 진입점(passages.ts 서버 액션이 부른다) ──────────────────────────────

/** 읽기 전용 — 잠금 없이 계획만 세워 확인창 문구를 만든다. */
export async function loadPassageDeletionImpact(
  academyId: string,
  ids: unknown,
  noun?: PassageDeleteNoun,
): Promise<{ impact: PassageDeletionImpact; confirm: PassageDeletionConfirm }> {
  const plan = await planPassageDeletion(
    createPrismaPassageDeleteStore(prisma),
    academyId,
    ids,
    { lock: false },
  );
  const impact = toPassageDeletionImpact(plan);
  return { impact, confirm: buildPassageDeletionConfirm(impact, { noun }) };
}

/** 가드를 거친 삭제 + 커밋된 지문마다 PASSAGE_DELETE 감사 이벤트. */
export async function deletePassagesGuarded(input: {
  academyId: string;
  actorId: string | null;
  ids: unknown;
  via: string;
}): Promise<ChunkedPassageDeletionResult> {
  const result = await runChunkedPassageDeletion(
    (fn) =>
      prisma.$transaction(
        (tx) => fn(createPrismaPassageDeleteStore(tx)),
        PASSAGE_DELETE_TX_OPTIONS,
      ),
    input.academyId,
    input.ids,
  );
  if (result.error) console.error("[passage-delete] chunk failed", result.error);
  // logAppEvents 는 throw 하지 않는다 — 기록 실패가 삭제 응답을 깨지 않는다.
  await logAppEvents(
    buildPassageDeleteAuditEvents(result, {
      academyId: input.academyId,
      actorId: input.actorId,
      via: input.via,
    }),
  );
  return result;
}

/**
 * 동일 지문 사전 필터: 영숫자·한글 음절만 남긴 전문이 같은 것.
 * 공백 정규화(\s+ → " ")는 이 글자 집합을 건드리지 않으므로, 정규화 전문이 같은
 * 지문은 반드시 이 필터를 통과한다(거짓 음성 없음). 최종 판정은 JS 가 한다.
 */
const SIGNATURE_STRIP = "[^A-Za-z0-9가-힣]+";

/**
 * 짝(지울 지문 → 후보 id). LIMIT 을 두지 않는다 — 잘리면 확인창(선택 전체를 한 번에
 * 조회)과 실행(20편 청크)이 다른 대상을 고른다(26-09-30 적대 검수 재현, 후보 535행).
 * 대신 원문이 바이트까지 같은 후보 묶음마다 가장 오래된 1행만 남긴다. 동일 판정은 후보
 * 원문만의 함수이므로 묶음의 대표(createdAt·id 최솟값)만 봐도 chooseRelinkTarget 결과는
 * 후보 전체를 본 것과 같다. 순서는 결정적이다.
 */
function queryDuplicatePairs(
  db: Db,
  academyId: string,
  ids: string[],
  excludeIds: string[],
): Promise<Array<{ forId: string; candidateId: string }>> {
  return db.$queryRaw<Array<{ forId: string; candidateId: string }>>`
    SELECT DISTINCT ON (d.id, c.content COLLATE "C")
           d.id AS "forId", c.id AS "candidateId"
    FROM passages d
    JOIN passages c
      ON c."academyId" = d."academyId"
     AND c.id <> d.id
     AND NOT (c.id = ANY(${excludeIds}::text[]))
     AND regexp_replace(c.content, ${SIGNATURE_STRIP}, '', 'g')
       = regexp_replace(d.content, ${SIGNATURE_STRIP}, '', 'g')
    WHERE d.id = ANY(${ids}::text[])
      AND d."academyId" = ${academyId}
      AND length(regexp_replace(d.content, ${SIGNATURE_STRIP}, '', 'g')) > 0
    ORDER BY d.id, c.content COLLATE "C", c."createdAt", c.id`;
}

/**
 * 후보 행은 한 번씩만 읽는다(같은 묶음의 지문 여럿이 같은 후보를 가리킨다).
 * 실행 경로(lock)에서는 FOR KEY SHARE — 옮겨 연결할 대상이 커밋 전까지 지워지지 않게
 * 한다(대상이 사라져 relink 가 P2003 으로 깨지는 경합 차단). 이미 지워진 후보는 빠진다.
 */
async function loadCandidateRows(
  db: Db,
  academyId: string,
  candidateIds: string[],
  lock: boolean,
): Promise<PassageRow[]> {
  if (lock) {
    return db.$queryRaw<PassageRow[]>`
      SELECT id, "academyId", title, content, "createdAt"
      FROM passages
      WHERE id = ANY(${candidateIds}::text[]) AND "academyId" = ${academyId}
      ORDER BY id
      FOR KEY SHARE`;
  }
  return db.passage.findMany({
    where: { id: { in: candidateIds }, academyId },
    select: { id: true, academyId: true, title: true, content: true, createdAt: true },
  });
}

export function createPrismaPassageDeleteStore(db: Db): PassageDeleteStore {
  return {
    async loadPassages(academyId, ids, { lock }) {
      if (ids.length === 0) return [];
      if (lock) {
        // id 순서로 잠가 동시 대량 삭제끼리의 교착을 줄인다. 이 잠금은 새 문항이
        // 이 지문을 가리키며 들어오는 것(FK KEY SHARE)도 커밋까지 막는다.
        return db.$queryRaw<PassageRow[]>`
          SELECT id, "academyId", title, content, "createdAt"
          FROM passages
          WHERE id = ANY(${ids}::text[]) AND "academyId" = ${academyId}
          ORDER BY id
          FOR UPDATE`;
      }
      return db.passage.findMany({
        where: { id: { in: ids }, academyId },
        select: { id: true, academyId: true, title: true, content: true, createdAt: true },
      });
    },

    async findDuplicateCandidates(academyId, ids, excludeIds, { lock }) {
      if (ids.length === 0) return [];
      // 실행 경로에서 잠그는 사이 후보가 (가드 밖에서) 지워졌으면 다시 조회한다. READ
      // COMMITTED 라 새 문장은 커밋된 삭제를 보므로 같은 원문의 다음 후보가 대표가 된다.
      for (let attempt = 1; ; attempt += 1) {
        const pairs = await queryDuplicatePairs(db, academyId, ids, excludeIds);
        if (pairs.length === 0) return [];
        const candidateIds = [...new Set(pairs.map((p) => p.candidateId))];
        const rows = await loadCandidateRows(db, academyId, candidateIds, lock);
        if (!lock || rows.length === candidateIds.length || attempt >= 3) {
          const byId = new Map(rows.map((r) => [r.id, r]));
          const out: Array<{ forId: string; candidate: PassageRow }> = [];
          for (const p of pairs) {
            const candidate = byId.get(p.candidateId);
            if (candidate) out.push({ forId: p.forId, candidate });
          }
          return out;
        }
      }
    },

    async countQuestions(ids) {
      if (ids.length === 0) return [];
      return db.$queryRaw<Array<{ passageId: string; live: number; trashed: number }>>`
        SELECT "passageId",
               (count(*) FILTER (WHERE "deletedAt" IS NULL))::int AS live,
               (count(*) FILTER (WHERE "deletedAt" IS NOT NULL))::int AS trashed
        FROM questions
        WHERE "passageId" = ANY(${ids}::text[])
        GROUP BY "passageId"`;
    },

    async findExamUsage(ids) {
      if (ids.length === 0) return [];
      return db.$queryRaw<Array<{ passageId: string; examId: string; examTitle: string }>>`
        SELECT DISTINCT q."passageId", e.id AS "examId", e.title AS "examTitle"
        FROM exam_questions eq
        JOIN questions q ON q.id = eq."questionId"
        JOIN exams e ON e.id = eq."examId"
        WHERE q."passageId" = ANY(${ids}::text[]) AND q."deletedAt" IS NULL`;
    },

    async countRestrictRefs(ids) {
      if (ids.length === 0) return [];
      return db.$queryRaw<
        Array<{ passageId: string; relation: RestrictRelation; count: number }>
      >`
        SELECT "passageId", 'tutor_lessons' AS relation, count(*)::int AS count
          FROM tutor_lessons WHERE "passageId" = ANY(${ids}::text[]) GROUP BY "passageId"
        UNION ALL
        SELECT "passageId", 'season_passages', count(*)::int
          FROM season_passages WHERE "passageId" = ANY(${ids}::text[]) GROUP BY "passageId"
        UNION ALL
        SELECT "passageId", 'lesson_progress', count(*)::int
          FROM lesson_progress WHERE "passageId" = ANY(${ids}::text[]) GROUP BY "passageId"
        UNION ALL
        SELECT "passageId", 'session_records', count(*)::int
          FROM session_records WHERE "passageId" = ANY(${ids}::text[]) GROUP BY "passageId"
        UNION ALL
        SELECT "passageId", 'naeshin_questions', count(*)::int
          FROM naeshin_questions WHERE "passageId" = ANY(${ids}::text[]) GROUP BY "passageId"
        UNION ALL
        SELECT "passageId", 'learning_sets', count(*)::int
          FROM learning_sets WHERE "passageId" = ANY(${ids}::text[]) GROUP BY "passageId"`;
    },

    async countCascadeRefs(ids) {
      if (ids.length === 0) return [];
      return db.$queryRaw<Array<{ passageId: string } & PassageCascadeCounts>>`
        SELECT p.id AS "passageId",
               EXISTS (SELECT 1 FROM passage_analyses a WHERE a."passageId" = p.id) AS "hasAnalysis",
               (SELECT count(*) FROM passage_reports r
                 WHERE r."passageId" = p.id AND r."deletedAt" IS NULL)::int AS reports,
               (SELECT count(*) FROM webtoons w WHERE w."passageId" = p.id)::int AS webtoons,
               (SELECT count(*) FROM passage_notes n WHERE n."passageId" = p.id)::int AS notes,
               (SELECT count(*) FROM tutor_conversations t
                 WHERE t."passageId" = p.id AND t."deletedAt" IS NULL)::int AS "tutorConversations"
        FROM passages p
        WHERE p.id = ANY(${ids}::text[])`;
    },

    async relinkRefs(fromId, toId) {
      const questions = await db.question.updateMany({
        where: { passageId: fromId },
        data: { passageId: toId },
      });
      const workbenchAiJobs = await db.workbenchAiJob.updateMany({
        where: { passageId: fromId },
        data: { passageId: toId },
      });
      const questionSets = await db.questionSet.updateMany({
        where: { basePassageId: fromId },
        data: { basePassageId: toId },
      });
      const teacherPrompts = await db.teacherPrompt.updateMany({
        where: { passageId: fromId },
        data: { passageId: toId },
      });
      const tutorAiLogs = await db.tutorAiLog.updateMany({
        where: { passageId: fromId },
        data: { passageId: toId },
      });
      return {
        questions: questions.count,
        workbenchAiJobs: workbenchAiJobs.count,
        questionSets: questionSets.count,
        teacherPrompts: teacherPrompts.count,
        tutorAiLogs: tutorAiLogs.count,
      };
    },

    async loadLinkedQuestions(passageId) {
      // 행 잠금 — 같은 순간의 문항 편집과 structuredData 읽기-수정-쓰기가 엇갈리지 않게.
      return db.$queryRaw<Array<{ id: string; structuredData: unknown }>>`
        SELECT id, "structuredData"
        FROM questions
        WHERE "passageId" = ${passageId}
        ORDER BY id
        FOR UPDATE`;
    },

    async writeQuestionStructuredData(questionId, value) {
      await db.question.update({
        where: { id: questionId },
        data: { structuredData: value as Prisma.InputJsonValue },
      });
    },

    async deletePassage(academyId, passageId) {
      const r = await db.passage.deleteMany({ where: { id: passageId, academyId } });
      return r.count;
    },
  };
}
