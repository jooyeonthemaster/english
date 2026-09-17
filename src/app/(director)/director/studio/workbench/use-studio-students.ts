"use client";

// ============================================================================
// 「학생 관리」 뷰 — 로스터 × 시험 리포트 현황 페치 훅 (스튜디오 셸 단독 소유)
// (docs/exam-analysis-v4-spec.md §2.5 U6 · §5 함정 「aside/드로어 2중 마운트」)
//
// **셸에서 정확히 1회 호출**한다 — use-analysis-detail.ts 와 같은 이유: 우측
// 학생 레일은 aside(≥xl)와 드로어(<xl) 두 트리에 같은 엘리먼트로 들어가므로
// 페치를 레일 안에 두면 CSS 숨김 마운트 조합에서 2중 페치가 된다. 중앙 판
// (students-pane)도 같은 데이터를 먹는다 — 셸 → LibraryPane → 판으로 내린다.
//
// **keep-previous**: 같은 classId 의 재조회(refreshKey bump — 변이 성공 후
// 수렴·수동 새로고침)는 이전 rows 를 유지한 채 조용히 갈아끼운다(백지 플래시
// 금지 §5). 클래스 전환은 즉시 비운다 — 청산 effect 가 아니라 **적재 데이터에
// classId 를 새겨 두고 파생으로 걸러 낸다**(setState-in-effect 없이 교차 오염 0:
// 옛 클래스 응답이 늦게 도착해도 노출 산식이 classId 불일치로 버린다).
// active 가 꺼지면 페치를 쉬되 데이터는 남긴다(뷰 복귀 시 즉시 표시 + 재조회로 수렴).
//
// 폴링하지 않는다(§U6-4 「폴링 없음(뷰 진입·변이 후 재조회)」). 재조회 트리거는
// (classId 변경 · active 켜짐 · refreshKey 변경 · reload()) 뿐이다.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listStudioClassStudentExams,
  type StudioStudentExamEntry,
  type StudioStudentExamRow,
} from "@/actions/studio/student-exams";

export interface StudioStudentsState {
  rows: StudioStudentExamRow[];
  /** 초대 링크 조립용 — 첫 응답 전 null */
  academyCode: string | null;
  /** 첫 응답 도착 전(데이터 없음) — 스켈레톤 판정. keep-previous 재조회는 false. */
  loading: boolean;
  /** 데이터 없이 페치가 실패한 상태의 메시지 — 재시도 배너 판정 */
  error: string | null;
  /** 수동 재조회(keep-previous) */
  reload: () => void;
  /** 학생 1명의 시험 행 1건 낙관 패치(공유 토글 등 — 서버 수렴 전 즉시 반영) */
  patchExam: (
    studentId: string,
    reportStudentId: string,
    partial: Partial<StudioStudentExamEntry>,
  ) => void;
  /** 클래스 제외 직후 행 제거(재조회 수렴 전 즉시 반영) */
  removeStudent: (studentId: string) => void;
}

interface LoadedStudents {
  classId: string;
  rows: StudioStudentExamRow[];
  academyCode: string;
}

const EMPTY_ROWS: StudioStudentExamRow[] = [];

export function useStudioStudents(
  classId: string | null,
  active: boolean,
  refreshKey: number,
): StudioStudentsState {
  // 적재분은 classId 를 품는다 — 노출 산식(아래)이 현재 클래스와 대조한다.
  const [loaded, setLoaded] = useState<LoadedStudents | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<{
    classId: string;
    message: string;
  } | null>(null);
  const [nonce, setNonce] = useState(0);
  // 늦게 도착한 응답 폐기용 일련번호(클래스 전환·연속 재조회 경합).
  const seqRef = useRef(0);
  // 마지막으로 성공 적재한 classId — keep-previous 판정(use-analysis-detail 의
  // loadedIdRef 관용구: 성공 경로에서만 기록, 렌더 중 ref 쓰기 없음).
  const loadedClassIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!classId || !active) return;
    const seq = ++seqRef.current;
    const keep = loadedClassIdRef.current === classId;
    // 첫 로드만 스켈레톤 — keep-previous 재조회는 기존 화면을 유지한 채 조용히.
    setLoading(!keep);
    setFailure(null);
    void (async () => {
      const res = await listStudioClassStudentExams(classId);
      if (seq !== seqRef.current) return;
      setLoading(false);
      if (!res.success || !res.data) {
        // keep-previous: 기존 데이터가 있으면 스테일을 유지한다(스테일 > 백지).
        // 단 무음은 금지 — 원장이 「갱신됐다」고 믿고 스테일 화면을 읽지 않도록 토스트.
        if (keep) {
          toast.error(res.error ?? "학생 목록을 새로 고치지 못했습니다.");
        } else {
          setFailure({
            classId,
            message: res.error ?? "학생 목록을 불러오지 못했습니다.",
          });
        }
        return;
      }
      loadedClassIdRef.current = classId;
      setLoaded({
        classId,
        rows: res.data.students,
        academyCode: res.data.academyCode,
      });
    })();
  }, [classId, active, refreshKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const patchExam = useCallback(
    (
      studentId: string,
      reportStudentId: string,
      partial: Partial<StudioStudentExamEntry>,
    ) => {
      setLoaded((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((s) =>
                s.studentId !== studentId
                  ? s
                  : {
                      ...s,
                      exams: s.exams.map((e) =>
                        e.reportStudentId === reportStudentId
                          ? { ...e, ...partial }
                          : e,
                      ),
                    },
              ),
            }
          : prev,
      );
    },
    [],
  );

  const removeStudent = useCallback((studentId: string) => {
    setLoaded((prev) =>
      prev
        ? { ...prev, rows: prev.rows.filter((s) => s.studentId !== studentId) }
        : prev,
    );
  }, []);

  // 노출 산식 — 현재 classId 와 일치하는 적재분만 내보낸다(교차 오염 0).
  const current = loaded && loaded.classId === classId ? loaded : null;
  const currentFailure = failure && failure.classId === classId ? failure : null;
  // loading 은 effect(페인트 후)에서 올라가므로 첫 프레임엔 아직 false 다 — 그 한
  // 프레임에 「학생이 없습니다」 빈 상태 CTA 가 깜빡인다. 페치가 예정돼 있는데
  // (classId·active) 아직 이 클래스의 적재분도 실패분도 없으면 렌더 시점에 바로
  // 스켈레톤으로 판정한다(effect 를 기다리지 않는 파생값).
  const pendingFirstLoad = !!classId && active && !current && !currentFailure;
  return {
    rows: current ? current.rows : EMPTY_ROWS,
    academyCode: current ? current.academyCode : null,
    loading: current ? false : loading || pendingFirstLoad,
    error: currentFailure ? currentFailure.message : null,
    reload,
    patchExam,
    removeStudent,
  };
}
