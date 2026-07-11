// ============================================================================
// 어법 드릴 — 표시 상수·헬퍼 정본 (플레인 모듈, 클라이언트 공유 가능)
//
// 유형/모드 라벨과 숙달도 히트 색상이 디렉터·학생 화면에 중복 정의돼 있던 것을
// 이 파일로 일원화한다. 신규 화면은 반드시 여기서 임포트한다.
// ============================================================================

/** 문항 유형 라벨 — 학생·강사 공통 표기 */
export const GRAMMAR_TYPE_LABEL: Record<string, string> = {
  CHOICE: "괄호 택일",
  OX: "밑줄 OX",
  MULTI_UNDERLINE: "미니 29번",
  PASSAGE: "지문 실전",
  WRITE_FORM: "서술형 변형",
  WRITE_CORRECT: "서술형 수정",
};

/** 학습 모드(Attempt.source) 라벨 */
export const GRAMMAR_SOURCE_LABEL: Record<string, string> = {
  DRILL: "드릴",
  CONCEPT_CHECK: "개념 체크",
  READING: "실전 독해",
  WRITTEN: "서술형",
  UNIT_TEST: "유닛 테스트",
  MIXED: "복합 세트",
  REVIEW: "복습",
  ASSIGNMENT: "배정 학습",
};

/**
 * 난이도(1~4) 라벨 — byDifficulty 축·필터 공통 표기.
 * (composer-grammar-spec 의 로컬 상수는 파일 소유권상 현행 유지 — 표기 동일)
 */
export const DIFFICULTY_LABEL: Record<string, string> = {
  1: "D1 기초",
  2: "D2 표준",
  3: "D3 심화",
  4: "D4 킬러",
};

/** 유닛 단계 라벨 */
export const GRAMMAR_STAGE_LABEL: Record<string, string> = {
  CONCEPT: "개념",
  DRILL: "드릴",
  READING: "실전",
  WRITTEN: "서술형",
  TEST: "테스트",
  MASTERED: "마스터",
};

/**
 * masteryHeatClass 5단 스케일의 범례 스와치 — 히트맵 설명용.
 * 아래 함수의 구간·색과 반드시 동기 유지한다.
 */
export const MASTERY_HEAT_LEGEND: { swatch: string; label: string }[] = [
  { swatch: "bg-blue-600", label: "80+" },
  { swatch: "bg-blue-400", label: "60+" },
  { swatch: "bg-blue-200", label: "40+" },
  { swatch: "bg-rose-200", label: "20+" },
  { swatch: "bg-rose-400", label: "0~19" },
];

/**
 * 숙달도(0~100) → 히트맵 셀 클래스. 시도 없음은 슬레이트.
 * 주황/앰버 금지 계약 — 저숙달은 rose 계열로 표현한다.
 */
export function masteryHeatClass(score: number, attempts: number): string {
  if (attempts <= 0) return "bg-slate-100 text-slate-400";
  if (score >= 80) return "bg-blue-600 text-white";
  if (score >= 60) return "bg-blue-400 text-white";
  if (score >= 40) return "bg-blue-200 text-blue-900";
  if (score >= 20) return "bg-rose-200 text-rose-900";
  return "bg-rose-400 text-white";
}

/** ms → "1분 31초" | "31초" */
export function formatDurationMs(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest > 0 ? `${min}분 ${rest}초` : `${min}분`;
}
