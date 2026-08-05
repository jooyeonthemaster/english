import type { BaseTask, TaskAdapter, TaskStatus } from "../types";

// ============================================================================
// AI 지문 생성(passage-authoring) 작업 큐 어댑터.
//
// workbench-ai-adapter 와 같은 잡 테이블(WorkbenchAiJob)을 보되 domain 만
// PASSAGE_AUTHORING 이다. 별도 파일로 둔 이유: 그 파일의 팩토리는 도메인이
// 늘어날수록 삼항 분기가 겹쳐 읽기 어려워지고, 지문 생성은 문구·통계 라벨
// (요청/완성 · "편")이 두 도메인 중 어느 쪽과도 겹치지 않는다.
//
// 회귀 계약: 이 어댑터는 스칼라 카운트/상태만 그린다. 그래서 반드시
// `view=summary` 투영으로만 요청한다 — result JSON(지문 본문 N편)이 폴링마다
// 실려 오면 Vercel origin transfer 가 그대로 비용이 된다.
// ============================================================================

interface AuthoringJobRow {
  id: string;
  status: string;
  title: string;
  requestedCount: number;
  successCount: number;
  failedCount: number;
  resultCount: number;
  errorMessage: string | null;
  createdAt: string;
}

function mapStatus(raw: string): TaskStatus {
  switch (raw) {
    case "PENDING":
      return "pending";
    case "PROCESSING":
      return "processing";
    case "COMPLETED":
      return "completed";
    case "PARTIAL":
      return "partial";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}

function buildSubtitle(status: TaskStatus): string {
  switch (status) {
    case "completed":
      return "생성 완료";
    case "partial":
      return "일부 완료";
    case "failed":
      return "생성 실패";
    case "cancelled":
      return "생성 취소";
    case "pending":
      return "대기 중";
    default:
      return "지문 생성 중";
  }
}

/**
 * ⚠️ 완료 문구는 "저장되었습니다"라고 말하면 안 된다 — 이 파이프라인은 지문함에
 * 아무것도 저장하지 않는다. 등록은 결과 모달의 '선택한 N편 지문함에 넣기'를
 * 눌러야만 일어난다. 저장 완료를 단언하면 결과를 열지 않은 선생님이 확인할
 * 이유를 잃고, 2N 크레딧으로 만든 지문이 그대로 방치된다.
 */
function buildDescription(job: AuthoringJobRow, status: TaskStatus): string {
  if (job.errorMessage) return job.errorMessage;
  switch (status) {
    case "completed":
      return "'직접 입력 › AI로 지문 생성' 화면에서 결과를 열고, 원하는 편을 골라 지문함에 넣어 주세요.";
    case "partial":
      return "일부 지문만 완성됐습니다. 결과에서 원하는 편을 골라 지문함에 넣어 주세요.";
    case "failed":
      return "지문 생성에 실패했습니다. 자료와 지시문을 확인한 뒤 다시 시도해주세요.";
    case "cancelled":
      return "생성이 취소되었습니다.";
    case "pending":
      return "생성 대기 중입니다.";
    default:
      return "AI가 자료를 바탕으로 지문을 만들고 있습니다.";
  }
}

export const passageAuthoringAdapter: TaskAdapter = {
  domain: "passage-authoring",
  async fetchTasks(signal): Promise<BaseTask[]> {
    const res = await fetch(
      "/api/workbench/ai-jobs?domain=PASSAGE_AUTHORING&limit=50&view=summary",
      { credentials: "include", cache: "no-store", signal },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { jobs?: AuthoringJobRow[] };

    return (data.jobs ?? []).map((job) => {
      const status = mapStatus(job.status);
      return {
        id: job.id,
        domain: "passage-authoring" as const,
        title: job.title,
        subtitle: buildSubtitle(status),
        description: buildDescription(job, status),
        stats: [
          {
            label: "요청",
            value: `${job.requestedCount}편`,
            tone: status === "failed" ? ("red" as const) : ("blue" as const),
          },
          {
            // ⚠️ resultCount 는 run-job 이 "판정이 끝난 편 수(성공+실패)"로 정의해
            // 저장하는 값이다(실패 편도 items 에 남는다). 그걸 '완성'으로 그리면
            // 전편 실패해도 "완성 6편"이 emerald 로 뜬다 → 실제 성공 수인
            // successCount 를 쓴다(요약 응답에 이미 실려 온다).
            label: "완성",
            value: `${job.successCount}편`,
            tone: job.successCount > 0 ? ("emerald" as const) : ("slate" as const),
          },
          ...(job.failedCount > 0
            ? [
                {
                  label: "실패",
                  value: `${job.failedCount}편`,
                  tone: "red" as const,
                },
              ]
            : []),
        ],
        status,
        errorBadge: status === "failed" ? "오류" : undefined,
        createdAt: job.createdAt,
        href: "/director/workbench/questions/generate",
      };
    });
  },
};
