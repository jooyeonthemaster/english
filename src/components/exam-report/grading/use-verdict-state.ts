"use client";

// ============================================================================
// 학생 시험 리포트 v3 — 정오표(verdict) 상태 훅
//
// 로컬 불변 응답 상태 + 디바운스 1.5s 서버 저장(version CAS 직렬화) + 정오 토글
// 핸들러 + 점수 확정 + 리포트 생성(5cr).
// UI(테이블·다이얼로그·JSX)는 read-step/verdict-board/report-step 이 담당한다.
// 저장 락은 try/finally 로 반드시 해제한다(v2 runSave 교훈).
// 플로우 개편(26-07-08): E2 답안 판독(runRead) UI 배선 폐기 — 호출처 0.
// runRead 본체는 롤백 안전을 위해 데드코드로 유지한다(/read 라우트와 함께 은퇴).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";

import { updateStudentGrading } from "@/actions/exam-report";
import {
  carryStudentAnswers,
  computeDataLevel,
  computeScoreSummary,
  mergeReadIntoResponses,
  normalizeResponses,
} from "@/lib/exam-report/grading";
import type {
  ExamMap,
  ResponseDataLevel,
  ResponseStatus,
  ScoreSummary,
  StudentResponse,
} from "@/lib/exam-report/types";
import { EXAM_READ_MAX_RUNS } from "@/lib/exam-report/types";
import type { ExamAnalysisDetail, ExamStudentDetail } from "../ui-contracts";
import {
  autoUnreviewedCountOf,
  examReportBasePrefix,
  markChoice as applyChoice,
  markMany as applyMany,
  markPartial as applyPartial,
  markStatus as applyStatus,
  resetResponse,
  unknownCountOf,
} from "./grading-shared";

const SAVE_DEBOUNCE_MS = 1500;

interface VerdictStateArgs {
  analysis: ExamAnalysisDetail;
  student: ExamStudentDetail;
  onStudentChange: (next: ExamStudentDetail) => void;
}

export interface VState {
  responses: StudentResponse[];
  classAverage: number | null;
  gradeBand: string | null;
  gradingConfirmed: boolean;
}

export type SaveState = "idle" | "saving" | "saved";

function initState(student: ExamStudentDetail, structure: ExamMap | null): VState {
  const responses = structure
    ? normalizeResponses(structure, student.responses)
    : student.responses;
  return {
    responses,
    classAverage: student.scoreSummary?.classAverage ?? null,
    gradeBand: student.scoreSummary?.gradeBand ?? null,
    gradingConfirmed: student.gradingConfirmed,
  };
}

export function useVerdictState({ analysis, student, onStudentChange }: VerdictStateArgs) {
  const router = useRouter();
  const pathname = usePathname();
  const structure = analysis.examMap;
  const base = examReportBasePrefix(pathname);

  const [state, setState] = useState<VState>(() => initState(student, structure));
  const [version, setVersion] = useState(student.version);
  const [syncedId, setSyncedId] = useState(student.id);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [generating, setGenerating] = useState(false);
  const [reading, setReading] = useState(false);
  // 확정 진행 상태 — 자동저장(saveState)과 분리해 토글만으로 [점수 확정] 버튼이
  // 스피너/비활성이 되지 않게 한다(A4c).
  const [confirming, setConfirming] = useState(false);

  const stateRef = useRef(state);
  const versionRef = useRef(version);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const lastSaveOkRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 결함 수리(VERSION_CONFLICT blind reset): 마지막 성공 저장 이후 강사가 만진 문항
  // 번호를 추적한다(number → 마지막 mutate tick). 충돌 리로드가 stateRef 를 서버
  // 상태로 통째 교체하면서 충돌 감지~리로드 사이에 입력한 토글까지 소급 폐기하던
  // 문제를, fresh 위에 dirty 행만 재적용하는 병합 리로드로 바꾸기 위한 재료다.
  const dirtyNumbersRef = useRef<Map<string, number>>(new Map());
  const dirtyTickRef = useRef(0);
  // 충돌→병합→재저장이 연속 충돌로 무한 루프가 되지 않게 상한을 둔다(성공 시 리셋).
  const mergeRetryRef = useRef(0);

  // 학생 전환 시 로컬 상태 리셋 — render 중 동기화 패턴.
  if (student.id !== syncedId) {
    setSyncedId(student.id);
    const next = initState(student, structure);
    setState(next);
    setVersion(student.version);
    stateRef.current = next;
    versionRef.current = student.version;
    if (timerRef.current) clearTimeout(timerRef.current);
    savingRef.current = false;
    pendingRef.current = false;
    // 학생 전환 시 dirty 추적/충돌 재시도 카운터도 리셋(타 학생 행 오염 방지).
    dirtyNumbersRef.current = new Map();
    mergeRetryRef.current = 0;
    setSaveState("idle");
  }

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const propagate = useCallback(
    (next: VState, nextVersion: number, summary: ScoreSummary) => {
      onStudentChange({
        ...student,
        responses: next.responses,
        scoreSummary: summary,
        gradingConfirmed: next.gradingConfirmed,
        version: nextVersion,
      });
    },
    [onStudentChange, student],
  );

  const reloadStudent = useCallback(async () => {
    try {
      const res = await fetch(`/api/exam-report/students/${student.id}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { student: ExamStudentDetail };
      const fresh = data.student;
      const next = initState(fresh, structure);
      setState(next);
      setVersion(fresh.version);
      stateRef.current = next;
      versionRef.current = fresh.version;
      onStudentChange(fresh);
    } catch {
      /* noop */
    }
  }, [student.id, structure, onStudentChange]);

  // VERSION_CONFLICT 패자 처리 — blind reloadStudent 는 미저장 토글(충돌 감지 이후
  // 입력분 포함)을 무통보 폐기했다. fresh 를 로드한 뒤 dirtyNumbers 에 해당하는
  // 로컬 행(강사 의도, reviewed:true)을 fresh 위에 재적용하고 true 를 반환한다.
  // 재적용 대상이 없으면 기존처럼 전체 교체(reloadStudent)하고 false 를 반환한다.
  const reloadAndReapplyDirty = useCallback(async (): Promise<boolean> => {
    const dirtyNumbers = new Set(dirtyNumbersRef.current.keys());
    if (dirtyNumbers.size === 0 || !structure) {
      await reloadStudent();
      return false;
    }
    // 리로드로 stateRef 가 교체되기 전에 로컬 행(강사 최신 의도)을 스냅샷.
    const localByNumber = new Map(
      stateRef.current.responses.map((r) => [r.number, r] as const),
    );
    try {
      const res = await fetch(`/api/exam-report/students/${student.id}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        // 병합용 fresh 로드 실패 — 기존 동작(전체 교체 best-effort)으로 폴백.
        await reloadStudent();
        return false;
      }
      const data = (await res.json()) as { student: ExamStudentDetail };
      const fresh = data.student;
      const base = initState(fresh, structure);
      const reapplied = base.responses.map((r) => {
        if (!dirtyNumbers.has(r.number)) return r;
        return localByNumber.get(r.number) ?? r;
      });
      const next: VState = {
        ...base,
        // 재적용한 로컬 행이 fresh 의 studentAnswer(학생이 그 사이 제출한 답 원문)를
        // 갖고 있지 않으면 승계 — 강사 토글이 학생 답 원문을 지우면 안 된다.
        responses: carryStudentAnswers(base.responses, reapplied),
      };
      setState(next);
      setVersion(fresh.version);
      stateRef.current = next;
      versionRef.current = fresh.version;
      onStudentChange(fresh);
      return true;
    } catch {
      await reloadStudent().catch(() => {});
      return false;
    }
  }, [structure, reloadStudent, student.id, onStudentChange]);

  const runSave = useCallback(async (): Promise<boolean> => {
    if (!structure) return false;
    if (savingRef.current) {
      // 이미 저장 중이면 종료 후 재실행 예약 — 확정 성공 여부는 lastSaveOkRef 로 전파.
      pendingRef.current = true;
      return lastSaveOkRef.current;
    }
    savingRef.current = true;
    setSaveState("saving");
    const payload = stateRef.current;
    // 이번 저장 payload 에 포함된 dirty 범위 — 저장 중 재토글분은 tick 이 더 커
    // 성공 청산에서 살아남아 다음 저장/충돌 병합의 재적용 대상으로 유지된다.
    const dirtyTickAtSave = dirtyTickRef.current;
    let ok = false;
    let retryAfterMerge = false;
    try {
      const result = await updateStudentGrading(
        student.id,
        {
          responses: payload.responses,
          classAverage: payload.classAverage,
          gradeBand: payload.gradeBand,
          gradingConfirmed: payload.gradingConfirmed,
        },
        versionRef.current,
      );

      if (result.ok) {
        versionRef.current += 1;
        setVersion(versionRef.current);
        setSaveState("saved");
        const summary = computeScoreSummary(structure, payload.responses, {
          classAverage: payload.classAverage,
          gradeBand: payload.gradeBand,
        });
        propagate(payload, versionRef.current, summary);
        // 이번 payload 에 반영된 dirty 만 청산(tick ≤ 저장 시점) — 저장 중 새 토글은 잔존.
        for (const [n, tick] of dirtyNumbersRef.current) {
          if (tick <= dirtyTickAtSave) dirtyNumbersRef.current.delete(n);
        }
        mergeRetryRef.current = 0;
        ok = true;
      } else if (result.error === "VERSION_CONFLICT") {
        setSaveState("idle");
        // 결함 수리: blind reloadStudent 는 미저장 토글을 소급 폐기했다 — fresh 위에
        // dirty 행을 재적용(병합)한 뒤 재저장한다. 병합할 것이 없거나 연속 충돌
        // 상한(3회) 초과면 기존처럼 전체 교체로 폴백.
        const merged =
          mergeRetryRef.current < 3 ? await reloadAndReapplyDirty() : false;
        if (merged) {
          mergeRetryRef.current += 1;
          toast.info("다른 곳에서 수정되었습니다. 변경 사항과 병합해 다시 저장합니다.");
          retryAfterMerge = true;
        } else {
          toast.error("다른 곳에서 수정되어 최신 상태로 새로고침했습니다.");
          if (mergeRetryRef.current >= 3) void reloadStudent();
        }
      } else if (result.error === "GENERATING") {
        setSaveState("idle");
        toast.info("리포트 생성 중에는 정오표를 저장할 수 없어요. 완료 후 다시 저장해 주세요.");
      } else {
        setSaveState("idle");
        toast.error("시험 정보가 없어 정오표를 저장할 수 없습니다.");
      }
    } catch {
      // 액션 reject(네트워크·서버 예외) — savingRef 영구고착·무음유실 방지.
      setSaveState("idle");
      toast.error("정오표 저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      // finally 에서 반드시 savingRef 복원(reject 여도) → flushSave 무한대기 방지.
      savingRef.current = false;
      lastSaveOkRef.current = ok;
      // pendingRef 는 성공/실패와 무관하게 항상 비운다 — 실패 시에도 남겨두면
      // flushSave 드레인이 최대 12초 공회전한다(A4a). 저장 중 새 변경이 쌓였고
      // 이번 저장이 성공했으면 즉시 재저장 체인으로 최신 상태를 반영한다.
      const hadPending = pendingRef.current;
      pendingRef.current = false;
      if (ok && hadPending) void runSave();
      // 충돌 병합 후 재저장 — savingRef 해제 후에 호출해야 lock 에 막히지 않는다.
      // (flushSave 드레인은 savingRef 를 보므로 이 체인 완료까지 대기한다.)
      else if (retryAfterMerge) void runSave();
    }
    return ok;
  }, [structure, student.id, propagate, reloadStudent, reloadAndReapplyDirty]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveState("saving");
    timerRef.current = setTimeout(() => void runSave(), SAVE_DEBOUNCE_MS);
  }, [runSave]);

  const flushSave = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // runSave 는 내부에서 예외를 흡수하므로 여기서 reject 되지 않는다(네비게이션 보장).
    await runSave();
    // pendingRef 는 runSave finally 에서 항상 비워지고 성공 시 재저장이 savingRef 를
    // 동기적으로 다시 세우므로, 드레인 대기는 savingRef 만 보면 충분하다(공회전 제거).
    let guard = 0;
    while (savingRef.current && guard < 200) {
      await new Promise((r) => setTimeout(r, 60));
      guard += 1;
    }
    // 드레인 완료 후 마지막 저장 성공 여부(재실행 결과 포함)를 반환.
    return lastSaveOkRef.current;
  }, [runSave]);

  const mutate = useCallback(
    // touchedNumbers: 이 mutate 가 강사 의도로 만진 문항 번호 — VERSION_CONFLICT
    // 병합 리로드에서 재적용할 dirty 집합에 기록한다(전역 필드 편집은 미전달).
    (updater: (prev: VState) => VState, touchedNumbers?: string[]) => {
      const next = updater(stateRef.current);
      stateRef.current = next;
      if (touchedNumbers) {
        for (const n of touchedNumbers) {
          dirtyTickRef.current += 1;
          dirtyNumbersRef.current.set(n, dirtyTickRef.current);
        }
      }
      setState(next);
      scheduleSave();
    },
    [scheduleSave],
  );

  // ── 정오 토글 핸들러 ──────────────────────────────────────────────────────
  const onSetStatus = useCallback(
    (number: string, status: ResponseStatus) =>
      mutate(
        (prev) => ({ ...prev, responses: applyStatus(prev.responses, number, status) }),
        [number],
      ),
    [mutate],
  );
  const onSetPartial = useCallback(
    (number: string, pts: number | null) =>
      mutate(
        (prev) => ({ ...prev, responses: applyPartial(prev.responses, number, pts) }),
        [number],
      ),
    [mutate],
  );
  const onReset = useCallback(
    (number: string) =>
      mutate(
        (prev) => ({ ...prev, responses: resetResponse(prev.responses, number) }),
        [number],
      ),
    [mutate],
  );
  // MC 선지 직접 입력(강사) — chosenChoice + 정답 대조 자동 정오(deriveStatusFromChoice).
  // 디바운스 저장 경로(mutate→scheduleSave)를 기존 토글과 공유한다.
  const onSetChoice = useCallback(
    (number: string, choice: string) => {
      if (!structure) return;
      mutate(
        (prev) => ({
          ...prev,
          responses: applyChoice(prev.responses, structure, number, choice),
        }),
        [number],
      );
    },
    [mutate, structure],
  );
  // 일괄 마킹("남은 문항 모두 정답/오답" 툴바) — markMany 재사용.
  const onMarkMany = useCallback(
    (numbers: string[], status: ResponseStatus) => {
      if (numbers.length === 0) return;
      mutate(
        (prev) => ({ ...prev, responses: applyMany(prev.responses, numbers, status) }),
        numbers,
      );
    },
    [mutate],
  );
  const onClassAverage = useCallback(
    (v: number | null) => mutate((prev) => ({ ...prev, classAverage: v })),
    [mutate],
  );
  const onGradeBand = useCallback(
    (v: string | null) => mutate((prev) => ({ ...prev, gradeBand: v })),
    [mutate],
  );

  // ── E2 답안 판독 (은퇴 — 26-07-08 플로우 개편) ────────────────────────────
  // 사진 판독 경로가 UI 에서 폐기되어 호출처가 없다. /read 라우트 은퇴와 짝을
  // 이루는 데드코드 — 롤백 안전을 위해 본체는 삭제하지 않는다.
  const runRead = useCallback(async (): Promise<boolean> => {
    if (reading) return false;
    setReading(true);
    try {
      // 진행 중인 로컬 편집을 먼저 flush 해 서버 병합이 최신 확정분을 보존하게 한다.
      // 결함 수리: flushSave 실패(충돌 병합까지 실패/네트워크)를 무시하고 판독을
      // 진행하면 강사 편집 미반영 베이스로 병합되고 readRuns 캡만 소모된다 —
      // 실패 시 판독 진행 전 중단. (runSave 는 저장할 변경이 없어도 성공을 반환하므로
      // false = 실제 저장 실패로 구분된다.)
      const flushed = await flushSave();
      if (!flushed) {
        toast.error("정오표 저장이 완료되지 않아 판독을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }
      const res = await fetch(`/api/exam-report/students/${student.id}/read`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as
        | { responses?: StudentResponse[]; persisted?: boolean; error?: string }
        | null;
      if (!res.ok) {
        const code = res.status;
        const msg =
          code === 429
            ? `답안 판독 재실행 한도(${EXAM_READ_MAX_RUNS}회)를 초과했습니다.`
            : code === 409
              ? "이미 판독 중이거나 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요."
              : data?.error ?? "답안 판독에 실패했습니다.";
        toast.error(msg);
        // 서버 상태(readState/version)가 바뀌었을 수 있어 리싱크.
        await reloadStudent();
        return false;
      }

      // 서버가 responses/readState/version 을 갱신했으므로 리싱크로 최신화.
      await reloadStudent();
      // persisted:false = 예약 후 병렬 편집 발생 → 서버는 responses 미저장.
      // reloadStudent 로 받은 최신 응답(판독 중 강사 정정 reviewed:true 포함)에
      // 서버의 AUTO 판독분을 다시 병합(확정분 보존) 후 저장한다 — 판독 중 토글 유실
      // 방지(A4b). 서버의 단순 덮어쓰기는 판독 사이 강사 정정을 되돌릴 수 있다.
      if (data && data.persisted === false && Array.isArray(data.responses) && structure) {
        const readResponses = data.responses;
        const remergeAndSave = async (): Promise<boolean> => {
          const latest = stateRef.current.responses;
          // 결함 수리: 판독행은 studentAnswer 를 만들지 않아, 재병합이 학생 링크
          // 제출분(서답형 답 원문)을 지우던 문제 — 병합 직후 latest 에서 승계한다.
          const remerged = carryStudentAnswers(
            latest,
            normalizeResponses(structure, mergeReadIntoResponses(latest, readResponses)),
          );
          mutate((prev) => ({ ...prev, responses: remerged }));
          return flushSave();
        };
        let savedOk = await remergeAndSave();
        if (!savedOk) {
          // 결함 수리: 재병합 저장이 또 충돌하면 판독 결과가 로컬 변수에만 남아
          // 유실되는데 readRuns(3회 캡)는 이미 소모됨 — reload 후 1회 재시도.
          await reloadStudent();
          savedOk = await remergeAndSave();
        }
        if (!savedOk) {
          // 성공 토스트로 오인시키지 않는다 — 정오표에 판독 결과가 저장되지 않았다.
          toast.error("판독 결과 저장에 실패했습니다. 정오표에서 다시 시도해 주세요.");
          return false;
        }
      }
      toast.success("학생 답안을 판독했습니다. 정오표에서 확인하세요.");
      return true;
    } catch {
      toast.error("답안 판독 중 오류가 발생했습니다.");
      return false;
    } finally {
      setReading(false);
    }
  }, [reading, flushSave, student.id, reloadStudent, structure, mutate]);

  // ── 점수 확정(gradingConfirmed) ───────────────────────────────────────────
  // 최종 저장이 실제로 성공했을 때만 true 를 반환한다 — 저장 실패(VERSION_CONFLICT/
  // GENERATING/네트워크)에도 리포트 스텝으로 넘어가 미확정 점수가 학부모에게 나가는
  // 것을 막는다(호출부 verdict-board 는 true 일 때만 onProceed).
  const confirmGrading = useCallback(async (): Promise<boolean> => {
    setConfirming(true);
    try {
      mutate((prev) => ({ ...prev, gradingConfirmed: true }));
      const ok = await flushSave();
      // 저장 실패 시 낙관적 gradingConfirmed:true 를 서버 진실로 되돌린다 —
      // 미확정 점수가 UI 상 '확정'으로 남아 리포트 스텝으로 새는 것을 막는다(A4c).
      // reloadStudent 가 서버 상태로 로컬(state·onStudentChange)을 재동기한다.
      if (!ok) await reloadStudent();
      return ok;
    } finally {
      setConfirming(false);
    }
  }, [mutate, flushSave, reloadStudent]);

  // ── 리포트 생성(5cr) ──────────────────────────────────────────────────────
  const dataLevel: ResponseDataLevel = useMemo(
    () =>
      structure
        ? computeDataLevel(structure, state.responses, { classAverage: state.classAverage })
        : "STATUS_ONLY",
    [structure, state.responses, state.classAverage],
  );

  const generateReport = useCallback(async (): Promise<boolean> => {
    setGenerating(true);
    try {
      await flushSave();
      const res = await fetch(`/api/exam-report/students/${student.id}/generate`, {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 402) {
        toast.error("크레딧이 부족합니다", {
          action: { label: "크레딧 관리", onClick: () => router.push(`${base}/credits`) },
        });
        return false;
      }
      if (!res.ok) {
        toast.error("리포트 생성에 실패했습니다. 다시 시도해 주세요.");
        return false;
      }
      await reloadStudent();
      toast.success("리포트가 생성되었습니다.");
      return true;
    } catch {
      toast.error("리포트 생성 중 오류가 발생했습니다.");
      return false;
    } finally {
      setGenerating(false);
    }
  }, [flushSave, student.id, router, base, reloadStudent]);

  const readRuns = student.readState?.readRuns ?? 0;

  return {
    structure,
    state,
    saveState,
    reading,
    generating,
    confirming,
    dataLevel,
    unknownCount: unknownCountOf(state.responses),
    pendingCount: autoUnreviewedCountOf(state.responses),
    readRuns,
    readRemaining: Math.max(0, EXAM_READ_MAX_RUNS - readRuns),
    handlers: {
      onSetStatus,
      onSetPartial,
      onReset,
      onSetChoice,
      onMarkMany,
      onClassAverage,
      onGradeBand,
    },
    runRead,
    confirmGrading,
    generateReport,
    reloadStudent,
  };
}
