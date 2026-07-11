// ============================================================================
// 통합 학습 과제 — 학생 앱 카드 매퍼 (서버 전용)
//
// UnifiedTaskRecord → StudentTaskCard(/api/g/tasks 페이로드). 학생 노출
// 텍스트는 합니다체. 점수는 공개 조건(EXAM: exam.showResults, QUESTIONS: 항상)
// 충족 시에만 내보낸다 — 정답성 데이터는 어떤 경로로도 미포함.
// ============================================================================

import "server-only";
import type { StudentTaskCard } from "./types";
import { STUDY_KIND_META } from "./types";
import { isTaskLocked, isTaskOverdue, seoulDayDiff } from "./status";
import type { UnifiedTaskRecord } from "./task-union";

export function toStudentTaskCard(r: UnifiedTaskRecord, now: Date): StudentTaskCard {
  // CLOSED 과제라도 이미 완료한 학습지는 읽기 전용 재열람을 허용한다
  // (/g/w 잠금 가드의 taskStatus DONE 예외와 동일 규칙 — 소급 차단 해제).
  const closedLocked =
    r.assignmentStatus === "CLOSED" && !(r.kind === "WORKSHEET" && r.status === "DONE");
  const locked = isTaskLocked(r.availableFrom, now) || closedLocked;
  const overdue = isTaskOverdue(r.dueAt, r.status, now);
  const dDay = r.dueAt ? seoulDayDiff(now, r.dueAt) : null;

  let actionHref: string | null = null;
  if (!locked) {
    if (r.kind === "EXAM") {
      if (r.status === "DONE" && r.examGraded && r.examShowResults) {
        // 채점 확정 + 결과 공개 — 학생 결과 화면(/g/x). DIRECT 는 taskId 가
        // "sub:{submissionId}" 합성 id 그대로이며 라우트가 직접 해석한다.
        actionHref = `/g/x/${r.taskId}`;
      } else {
        // ASSIGNMENT 출처는 ?return=g 를 붙여 /t 응시면의 "저장 후 나가기"가
        // /g/tasks 복귀 버튼을 점등하게 한다(U10 소비). DIRECT(구 배포 모달
        // 경로)는 강사 공유 링크와 동일 형태 유지.
        const suffix = r.source === "ASSIGNMENT" ? "?return=g" : "";
        actionHref =
          r.examAccessEnabled && r.examAccessToken
            ? `/t/${r.examAccessToken}${suffix}`
            : null;
      }
    } else if (r.kind === "QUESTIONS") {
      actionHref = r.source === "ASSIGNMENT" ? `/g/q/${r.taskId}` : null;
    } else if (r.kind === "WORKSHEET") {
      actionHref = r.source === "ASSIGNMENT" ? `/g/w/${r.taskId}` : null;
    } else if (r.kind === "GRAMMAR") {
      actionHref =
        r.status !== "DONE" && r.grammarAssignmentId
          ? `/g/drill?mode=assignment&assignmentId=${r.grammarAssignmentId}`
          : null;
    }
  }

  let scoreText: string | null = null;
  if (r.score && r.status === "DONE") {
    const showScore = r.kind === "EXAM" ? r.examShowResults : true;
    if (showScore) {
      if (r.score.earned !== null && r.score.max !== null) {
        scoreText = `${r.score.earned} / ${r.score.max}점`;
      } else if (r.score.total > 0) {
        scoreText = `${r.score.correct} / ${r.score.total} 정답`;
      }
    }
  }

  let progressText: string | null = null;
  if (r.kind === "EXAM") {
    // 시험 메타 — "N문항 · 제한 M분 · 태블릿/OMR" (없는 항목은 생략)
    const parts: string[] = [];
    if (r.examQuestionCount) parts.push(`${r.examQuestionCount}문항`);
    if (r.examDuration) parts.push(`제한 ${r.examDuration}분`);
    if (r.examMode) parts.push(r.examMode === "OMR" ? "OMR" : "태블릿");
    if (parts.length > 0) progressText = parts.join(" · ");
  } else if (r.progress && r.progress.total > 0 && r.status !== "DONE") {
    // QUESTIONS 는 진행 카운트를 서버가 추적하지 않아 done 이 항상 0 으로
    // 조립된다(task-union) — "0/12 문항" 대신 총 문항 수만 표기.
    progressText =
      r.kind === "QUESTIONS" && r.progress.done === 0
        ? `${r.progress.total}문항`
        : `${r.progress.done}/${r.progress.total} 문항`;
  } else if (r.kind === "GRAMMAR" && r.progress && r.status === "DONE") {
    progressText = `${r.progress.total}문항 완료`;
  }

  return {
    taskId: r.taskId,
    source: r.source,
    kind: r.kind,
    kindLabel: STUDY_KIND_META[r.kind].label,
    title: r.title,
    instructions: r.instructions,
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    dDay,
    overdue,
    locked,
    availableFrom: r.availableFrom ? r.availableFrom.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    status: r.status,
    progressText,
    scoreText,
    actionHref,
    assignedAt: r.assignedAt.toISOString(),
  };
}
