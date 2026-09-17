"use client";

// ============================================================================
// 「다음 단계」 CTA 동작 배선 — kind → 레일 인라인 동작(v4, 26-09-02).
// 정본: docs/exam-analysis-v4-spec.md §3 U5-4 · §2.5(U5 행) · §1-7·§1-8
//
// 판정(kind·대상 수)은 deriveExamNextStep 이 끝냈다. 여기는 그 kind 에 **무엇을
// 누르면 무엇이 일어나는가**만 잇는다 — 전부 레일 안(탭 전환·패널 펼침·콘솔
// 일괄 액션·클립보드). 유일한 밖은 INTERNAL 학생 0명의 시험지 배포 화면(§1-8,
// escapeHref — 블록이 data-rail-escape-allowed 로 그린다).
//
// · fire-and-forget(심층 분석·다시/이어서 분석)은 발사 뒤 「요청됨」 잠금
//   (useRequestedLock — 후보 화면과 공용). 해제 3경로: 폴이 RUNNING/ANALYZING 을
//   보이면 파생값으로 즉시 · 헬퍼 결과 !ok(402/403/409/5xx/네트워크)면 즉시 · 그도
//   아니면 REQUESTED_RESET_MS 뒤. 결과 토스트는 헬퍼(board-shared) 가 전담한다 —
//   여기서 성공 토스트를 겹쳐 쌓지 않는다(적대검수 U5-correctness-4).
// · 일괄 액션은 busy 1개로 직렬화(같은 블록에서 두 번 못 누른다) — 판정은
//   busyRef(동기)로, 렌더 클로저의 stale busy 로 2중 발사되지 않는다. 결과
//   토스트는 부분 성공을 숫자로 말한다(무음 실패 금지 — fireAnalyzeRequest 402 교훈).
// · 채점 확정 일괄은 만들지 않는다(§1-7) — confirm-grading 은 이동만.
// · 대상 id 선별은 classifyFunnelStudent(next-step.ts) **한 술어**로만 한다 —
//   summarizeFunnelStudents 와 같은 함수라 블록의 수와 실제 대상 id 가 갈릴 수
//   없다(술어를 여기 복제하지 마라 — U5-spec-3).
// · detail 미도착(로딩) 동안 학생 대상 kind 는 비활성 스피너 CTA 로 자리를 지킨다
//   (버튼이 1초 뒤 튀어나오는 팝인 방지).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ExamReportSummaryRow } from "@/hooks/use-exam-report-activity";
import type {
  ExamAnalysisDetail,
  ExamAnalysisStudentRow,
} from "@/components/exam-report/ui-contracts";
import {
  classifyFunnelStudent,
  type ExamNextStep,
  type ExamNextStepKind,
} from "@/lib/exam-report/next-step";
import {
  fireAnalyzeRequest,
  fireBoostRequest,
  type FireRequestOutcome,
} from "@/components/exam-report/hub/board-shared";
import type { RailNextStepSecondary } from "./rail-next-step";
import {
  answerLinkUrl,
  buildLinkTable,
  copyToClipboard,
  type LinkTableRow,
} from "./use-analysis-bulk";
import type { AnalysisConsoleApi } from "./use-analysis-console";

/** 발사 직후 안내(후보·행 공용 자구). */
export const REQUESTED_NOTE = "요청됨 — 잠시 후 카드에 진행률이 표시됩니다";
const REQUESTED_RESET_MS = 8_000;

/** 「분석 시작」 CTA 가 레일을 떠났다는 안내(26-09-03) — 레일을 막다른 길로
 *  두지 않는다. 자구의 [ ] 안은 도크 버튼 라벨과 같은 어휘를 쓴다. */
export const ANALYZE_MOVED_NOTE =
  "왼쪽 목록 아래 파란 버튼으로 분석을 시작합니다";

/**
 * 「분석 시작」 실행자 — **레일과 중앙 도크의 단일 소스**(26-09-03).
 * 판정(next-step.ts)과 실행이 각각 두 벌이 되는 순간 「카드는 되는데 레일은
 * 안 된다」류 모순이 생긴다. 잠금(useRequestedLock)·토스트는 호출부 소관이고
 * 여기는 **무엇을 쏘는가**만 안다. analyze 계열이 아니면 null.
 */
export function analyzeRequestFor(
  step: ExamNextStep,
  target: {
    row: ExamReportSummaryRow | null;
    candidate?: { examId: string } | null;
  },
): (() => Promise<FireRequestOutcome>) | null {
  switch (step.kind) {
    case "candidate-analyze": {
      const examId = target.candidate?.examId;
      return examId ? () => fireBoostRequest(examId) : null;
    }
    case "internal-deepen": {
      const examId = target.row?.sourceExamId;
      if (!examId) return null;
      const synthOnly = step.synthOnly === true;
      return () =>
        fireBoostRequest(examId, synthOnly ? { synthOnly: true } : undefined);
    }
    case "retry-failed":
    case "resume-draft": {
      const id = target.row?.id;
      return id ? () => fireAnalyzeRequest(id) : null;
    }
    default:
      return null;
  }
}

/** detail 없이는 대상 id 를 못 뽑는 kind — 로딩 중엔 비활성 스피너 CTA. */
const DETAIL_GATED_KINDS: ReadonlySet<ExamNextStepKind> = new Set<ExamNextStepKind>([
  "review-gate",
  "issue-answer-links",
  "generate-reports",
  "share-reports",
]);

/**
 * fire-and-forget 「요청됨」 잠금 — 후보 화면(rail-candidate)과 행 블록 공용.
 * key 가 바뀌면(다른 행·다른 kind) 잠금은 자동으로 무효. running(폴이 진행을
 * 보임)이면 파생값으로 즉시 풀린다 — effect 로 상태를 지우면 1렌더 지연 +
 * 캐스케이드(react-hooks/set-state-in-effect).
 */
export function useRequestedLock(
  key: string,
  running = false,
): {
  requested: boolean;
  /** 잠금 + REQUESTED_RESET_MS 자동 해제 타이머 */
  mark: () => void;
  /** 즉시 해제(헬퍼 !ok) */
  release: () => void;
} {
  const [requestedKey, setRequestedKey] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );
  const mark = useCallback(() => {
    setRequestedKey(key);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => setRequestedKey(null),
      REQUESTED_RESET_MS,
    );
  }, [key]);
  const release = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setRequestedKey(null);
  }, []);
  return { requested: requestedKey === key && !running, mark, release };
}

/** 헬퍼 결과가 !ok 면 잠금 해제 — 토스트는 헬퍼가 이미 띄웠다. */
export function releaseOnFailure(
  outcome: Promise<FireRequestOutcome>,
  release: () => void,
): void {
  void outcome.then(
    (r) => {
      if (!r.ok) release();
    },
    () => release(),
  );
}

export interface NextStepAction {
  /** null = CTA 미표시(레일이 해결 못 하는 kind) */
  run: (() => void) | null;
  busy: boolean;
  disabled: boolean;
  /** ⚠ 26-09-04 이후 도크는 **CTA 가 없는 kind 에서만** note 를 그린다
   *  (「버튼만 남겨」) — CTA 가 있는 단계의 안내는 제자리(학생 아코디언·탭 캡션)로 갔다. */
  note: string | null;
  escapeHref: string | null;
  /** ⚠ 현재 도크는 그리지 않는다(26-09-04) — 계약만 유지. */
  secondary: RailNextStepSecondary | null;
}

interface Partition {
  needLink: string[];
  awaiting: ExamAnalysisStudentRow[];
  needGrading: string[];
  needReport: string[];
  needShare: string[];
}

/** classifyFunnelStudent 결과로만 버킷을 나눈다(술어 복제 금지). */
function partitionStudents(
  students: ReadonlyArray<ExamAnalysisStudentRow>,
): Partition {
  const out: Partition = {
    needLink: [],
    awaiting: [],
    needGrading: [],
    needReport: [],
    needShare: [],
  };
  for (const s of students) {
    switch (classifyFunnelStudent(s)) {
      case "needLink":
        out.needLink.push(s.id);
        break;
      case "awaitingAnswer":
        out.awaiting.push(s);
        break;
      case "needGrading":
        out.needGrading.push(s.id);
        break;
      case "needReport":
        out.needReport.push(s.id);
        break;
      case "needShare":
        out.needShare.push(s.id);
        break;
      case "generating":
      case "shared":
      case "done":
        break;
    }
  }
  return out;
}

function nameMap(
  students: ReadonlyArray<ExamAnalysisStudentRow>,
): ReadonlyMap<string, string> {
  return new Map(students.map((s) => [s.id, s.studentName]));
}


/** 이름이 빠진 행이 있으면 토스트 자구에 덧붙인다(빈 칸으로 복사됨을 알린다). */
function missingSuffix(missing: number): string {
  return missing > 0 ? " (이름 없이 복사됨)" : "";
}

export function useNextStepAction({
  step,
  row,
  detail,
  detailLoading = false,
  api,
  onOpenStudentsView,
}: {
  step: ExamNextStep;
  row: ExamReportSummaryRow;
  detail: ExamAnalysisDetail | null;
  /** 상세 첫 로드 중(detail null) — 학생 대상 kind 의 CTA 를 스피너로 자리 유지. */
  detailLoading?: boolean;
  api: AnalysisConsoleApi;
  onOpenStudentsView?: () => void;
}): NextStepAction {
  const [busy, setBusy] = useState(false);
  // 동기 진실 — 렌더 클로저의 stale busy 로 같은 일괄이 2번 발사되지 않는다.
  const busyRef = useRef(false);

  // 「요청됨」 잠금은 26-09-03 에 **도크로 이사**했다(analysis-dock) — 이 훅이
  // fire-and-forget 을 쏘던 kind(analyze 계열)가 전부 도크 소관이 됐기 때문이다.
  // 여기 남겨 두면 영원히 false 인 상태가 disabled 를 흉내 내는 죽은 코드가 된다.
  const withBusy = useCallback((fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    void fn().finally(() => {
      busyRef.current = false;
      setBusy(false);
    });
  }, []);

  const isInternal = row.sourceType === "INTERNAL";
  const students = detail?.students ?? [];
  const parts = partitionStudents(students);
  const detailPending =
    !detail && detailLoading && DETAIL_GATED_KINDS.has(step.kind);

  let run: (() => void) | null = null;
  // §16 이후 escapeHref 를 쓰는 kind 는 없다(자체 시험지 배포 링크는 로스터 섹션으로
  // 이사). 블록 계약은 유지 — 되살릴 여지를 남긴다.
  const escapeHref: string | null = null;
  let secondary: RailNextStepSecondary | null = null;
  let note: string | null = null;
  // 26-09-05: 대상(학생)을 체크해야 행동이 성립하는 단계는 **비활성 + 안내**로
  // 자리만 지킨다. 실제 실행은 체크가 띄우는 픽바(rail-student-pick-bar) 소관.
  let selectionGated = false;

  switch (step.kind) {
    // 【26-09-03 사용자 지시】 「분석을 시작하는 버튼」은 레일에서 뺀다 —
    //   원문: "미분석 시험에 대해서 분석을 하는 이 버튼은 위치가 저 우측 탭이
    //   아니라 … 좌측 탭에 고정이 된 상태로 있어야지."
    //   internal-deepen·retry-failed·resume-draft(+후보 화면의 candidate-analyze)는
    //   중앙 판 하단 도크(analysis-pane StudioAnalysisDock)가 든다. 그쪽 실행
    //   함수는 여기서 export 하는 buildAnalyzeRun 하나를 공유한다 —
    //   **판정도 실행도 두 벌을 만들지 않는다**(next-step.ts 단일 소스 규약).
    //   레일은 안내만 남기고(블록 note 가 어디를 누르라고 말한다) CTA 는 안 그린다.
    case "internal-deepen":
    case "retry-failed":
    case "resume-draft":
      note = ANALYZE_MOVED_NOTE;
      break;
    case "review-gate":
      if (detail) {
        run = () => {
          api.setActiveTab("synthesis");
          api.setReviewOpen(true);
        };
      }
      break;
    case "add-students":
      if (isInternal) {
        // §16: 자체 시험지도 [학생] 탭 로스터에서 링크를 보낸다(OMR 메인 — §15.2).
        // 배포 화면 탈출구는 로스터 섹션 아래로 이사했다: 도크는 CTA 하나만 그리므로
        // (§11) 여기 두면 메인 동선이 배포로 밀린다.
        run = () => api.setActiveTab("students");
      } else {
        run = api.openStudentAdd;
        if (onOpenStudentsView)
          secondary = { label: "학생 관리", onClick: onOpenStudentsView };
      }
      break;
    case "issue-answer-links":
      if (parts.needLink.length > 0) {
        const ids = parts.needLink;
        const names = nameMap(students);
        run = () =>
          withBusy(async () => {
            const r = await api.issueAnswerLinksBulk(ids, names);
            if (r.issued.length === 0) {
              toast.error("답안 링크 발급에 실패했습니다.");
              return;
            }
            const copied = await copyToClipboard(r.table);
            toast.success(
              copied
                ? `답안 링크 ${r.issued.length}명 발급 · 이름·링크 표를 복사했습니다.${missingSuffix(r.missingNames)}`
                : `답안 링크 ${r.issued.length}명을 발급했습니다. 표 복사에는 실패했습니다.`,
            );
            if (r.failed.length > 0)
              toast.error(`${r.failed.length}명은 발급에 실패했습니다.`);
          });
      }
      break;
    case "await-answers": {
      const lines: LinkTableRow[] = [];
      for (const s of parts.awaiting) {
        if (s.answerToken)
          lines.push({ name: s.studentName, url: answerLinkUrl(s.answerToken) });
      }
      if (lines.length > 0) {
        run = () =>
          withBusy(async () => {
            const copied = await copyToClipboard(buildLinkTable(lines));
            if (copied)
              toast.success(`답안 링크 표 ${lines.length}명분을 복사했습니다.`);
            else toast.error("표 복사에 실패했습니다.");
          });
      }
      break;
    }
    case "confirm-grading": {
      // 【26-09-05 사용자 지시】 "학생을 선택해야 이게 활성화가 되도록 해달라고."
      //   도크 버튼은 **지금 단계의 이름**일 뿐, 대상이 정해지기 전엔 아무 일도
      //   하지 않는다. 학생을 체크하면 이 자리는 픽바로 바뀌고 거기 [채점하기]가
      //   실제 행동을 든다(analysis-detail-rail 도크 분기 — 선택이 관점보다 우선).
      //   그래서 여기는 항상 disabled 이고, run 은 두지 않는다.
      selectionGated = true;
      note = "아래 목록에서 학생을 선택하세요";
      break;
    }
    case "generate-reports":
      // 26-09-05: confirm-grading 과 같은 규칙 — 대상(학생)이 체크되기 전에는
      //   비활성이고, 실행·과금은 체크가 띄우는 픽바가 전담한다. 종전엔 이 자리에서
      //   needReport **전원**에게 곧바로 5cr×N 을 태웠다(대상은 화면에 없었다).
      selectionGated = true;
      note = "아래 목록에서 리포트를 만들 학생을 선택하세요";
      break;
    case "share-reports":
      if (parts.needShare.length > 0) {
        const ids = parts.needShare;
        const names = nameMap(students);
        run = () =>
          withBusy(async () => {
            const r = await api.enableSharesBulk(ids, names);
            if (r.enabled.length === 0) {
              toast.error("공유 링크 발급에 실패했습니다.");
              return;
            }
            const copied = await copyToClipboard(r.table);
            toast.success(
              copied
                ? `공유 링크 ${r.enabled.length}명 발급 · 이름·링크 표를 복사했습니다.${missingSuffix(r.missingNames)}`
                : `공유 링크 ${r.enabled.length}명을 발급했습니다. 표 복사에는 실패했습니다.`,
            );
            if (r.failed.length > 0)
              toast.error(`${r.failed.length}명은 발급에 실패했습니다.`);
          });
      }
      break;
    case "all-done": {
      const rows = detail?.students;
      run = () =>
        withBusy(async () => {
          const r = await api.copyShareTable(rows);
          if (!r.table) {
            toast.error("복사할 공유 링크가 없습니다.");
            return;
          }
          if (!r.copied) {
            toast.error("표 복사에 실패했습니다.");
            return;
          }
          const n = r.table.split("\n").length - 1;
          toast.success(`공유 링크 표 ${n}명분을 복사했습니다.`);
        });
      break;
    }
    default:
      // candidate-analyze(후보 화면 소관)·analyzing·boost-running·
      // reports-generating(진행률만)·resume-upload(허브 등록 흐름 소관) — CTA 없음.
      break;
  }

  if (detailPending) {
    // 로딩 중 자리 유지 — 비활성 스피너(클릭 무동작). detail 도착 시 실제 run 으로 교체.
    return {
      run: () => {},
      busy: true,
      disabled: true,
      note: null,
      escapeHref: null,
      secondary: null,
    };
  }

  // selectionGated 단계는 CTA 를 **비활성 자리표시**로 남긴다 — run 을 null 로 두면
  // 블록이 CTA 자체를 안 그려(계약) 도크가 제목만 있는 상자가 되고, 「지금 무슨
  // 단계인가」가 버튼에서 사라진다. 클릭은 무동작(() => {}).
  if (selectionGated) {
    return {
      run: () => {},
      busy: false,
      disabled: true,
      note,
      escapeHref,
      secondary: null,
    };
  }

  return {
    run,
    busy,
    disabled: false,
    note,
    escapeHref,
    secondary,
  };
}
