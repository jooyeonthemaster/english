// ---------------------------------------------------------------------------
// 시험 배포 모달 — 응시 상태 표시 계약(칩 라벨·색). 플레인 모듈(서버/클라 공용).
//
// 상태 수명주기(설계 §2): ASSIGNED → IN_PROGRESS → SUBMITTED → GRADED.
// 색 계약(유닛 V1): 미응시 slate / 응시중 blue / 제출 완료 emerald / 채점 완료
// blue-600. 주황·앰버 금지(전역 디자인 계약).
// ---------------------------------------------------------------------------

export interface AssignmentStatusMeta {
  label: string;
  /** 상태칩 클래스(pill) */
  chipClass: string;
}

const STATUS_META: Record<string, AssignmentStatusMeta> = {
  ASSIGNED: {
    label: "미응시",
    chipClass: "bg-slate-100 text-slate-600",
  },
  IN_PROGRESS: {
    label: "응시중",
    chipClass: "bg-blue-50 text-[#3182F6]",
  },
  SUBMITTED: {
    label: "제출 완료",
    chipClass: "bg-emerald-50 text-emerald-700",
  },
  GRADED: {
    label: "채점 완료",
    chipClass: "bg-blue-600 text-white",
  },
};

/** 미지의 상태값(레거시 행 등)은 slate 로 강등 — 절대 throw 하지 않는다. */
export function assignmentStatusMeta(status: string | null): AssignmentStatusMeta {
  return (
    (status && STATUS_META[status]) || {
      label: status || "알 수 없음",
      chipClass: "bg-slate-100 text-slate-500",
    }
  );
}

/** 응시 모드 표시 계약 — 세그먼트·테이블 select 가 공유 */
export const MODE_OPTIONS = [
  {
    value: "TABLET",
    label: "태블릿 응시",
    description: "학생이 링크로 접속해 화면에서 문제를 풀고 제출합니다.",
  },
  {
    value: "OMR",
    label: "OMR 답안입력",
    description: "지면으로 응시한 뒤 링크에서 답안만 입력합니다.",
  },
] as const;

export function modeLabelOf(mode: string | null): string {
  const found = MODE_OPTIONS.find((option) => option.value === mode);
  return found ? found.label : "미지정";
}
