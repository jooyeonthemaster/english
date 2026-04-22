import type { CommitJobRequestV2 } from "@/lib/extraction/zod-schemas";
import type { CommitSummary, JobLike } from "./types";
import { CommitNotImplementedError } from "./types";
import { commitPassageOnly } from "./commit-passage-only";
import { commitQuestionSet } from "./commit-question-set";
import { commitFullExam } from "./commit-full-exam";

// ============================================================================
// V2 commit — mode-aware
// ============================================================================

export async function handleV2Commit(args: {
  jobId: string;
  academyId: string;
  createdById: string;
  job: JobLike;
  payload: CommitJobRequestV2;
}): Promise<CommitSummary> {
  const { payload } = args;
  switch (payload.mode) {
    case "PASSAGE_ONLY":
      return commitPassageOnly({ ...args, payload });
    case "QUESTION_SET":
      return commitQuestionSet({ ...args, payload });
    case "FULL_EXAM":
      return commitFullExam({ ...args, payload });
    case "EXPLANATION":
      // M3 (해설 첨부) — Zod 는 이제 payload 를 받아주지만 서버 측 구현이
      // 아직 없으므로 501 로 명시적으로 반환한다. silent 404/500 방지.
      throw new CommitNotImplementedError(
        "EXPLANATION_COMMIT_NOT_IMPLEMENTED",
        "해설 첨부(M3) 커밋은 아직 지원되지 않습니다.",
      );
    default: {
      // `never` — exhaustiveness guard.
      const _unreachable: never = payload;
      void _unreachable;
      throw new Error("지원하지 않는 모드입니다.");
    }
  }
}
