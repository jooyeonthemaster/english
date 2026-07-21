// ============================================================================
// 디렉터면 워딩 글로서리 — v3 대개편 사전 정본 (docs/director-console-v3-design.md §D6)
//
// 디렉터면(관제 콘솔)에 노출되는 어휘·한 문장·빈 상태·CTA 라벨의 단일 소스.
// 신규/개편 표면은 **이 사전 밖 신규 노출 어휘 금지** — 문구 리터럴 직접 표기 대신
// 여기서 임포트한다. 배포 동사는 「과제 보내기」 단일 — 「배포」·「만들기」 계열 금지.
//
// grep 게이트(spec §8 증보 — 디렉터 표면 잔존 시 critical):
//   「취약 개념 프리셋」 · 「배포하기」 · 「응시 이력」
//   시험 탭의 「첫 시도 정답률」(학습지 전용 지표 오용) · 토스 hex
// ============================================================================

// ── CTA 라벨 (D6-1·D6-3) ─────────────────────────────────────────────────────

export const CTA_LABELS = {
  /** 배포 행위 단일 동사 — 모든 CTA·컴포저 제목·확정 버튼 */
  SEND_TASK: "과제 보내기",
  /** 취약 컨텍스트 배포 — WeakPointCta card형 고정 */
  SEND_TASK_SCOPED: "이 범위로 과제 보내기",
  /** 동일 콘텐츠 재배포 — 범용 */
  RESEND: "다시 보내기",
  /** 학습지 취약 단어·문장 → 같은 학습지 재배포(D2-2) */
  RESEND_WORKSHEET: "이 학습지 다시 보내기",
  /** 과제 상세 모달 원클릭 재배포(D2-5) — 마감일 확인 팝오버 내장 전제 */
  RESEND_INCOMPLETE: "미완료 학생에게 다시 보내기",
  /** 시험 탭 빈 상태 배포 CTA(D6-3) */
  SEND_EXAM_TASK: "시험 과제 보내기",
  /** 어법 탭 빈 상태 배포 CTA(D6-3) */
  SEND_GRAMMAR_TASK: "어법 과제 보내기",
  /** 반 뷰 빈 상태(D6-3) */
  NEW_CLASS: "+ 새 반",
  /** 유형 프리필터 0건 폴백(D2-2·D6-3) */
  GO_QUESTION_GENERATE: "문제 생성으로 이동",
  /** 학생 관리 헤더(D4-1) */
  REGISTER_STUDENT: "+ 학생 등록",
  /** 학생 관리 헤더 — 대량 등록 다이얼로그(D4-1, C-2 셸) */
  REGISTER_STUDENT_BULK: "대량 등록",
  /** 어법 현황 헤더 — 학생 앱(/g) 새 탭 열기(D4-1, C-2 셸) */
  OPEN_STUDENT_APP: "학생 앱 열기",
  /** 어법 숙달도 셀 팝오버 → 시도 기록 세그먼트(D1-3) */
  VIEW_ATTEMPTS: "시도 기록 보기",
  /** 컴포저 어법 패널 — 유닛 실물 브라우징 진입(D3-4) */
  VIEW_UNIT_ITEMS: "문항 보기",
  /** 어법 훈련소 유닛 상세 우상단(D5-2) */
  GENERATE_FROM_UNIT: "이 유닛으로 AI 생성",
  /** 과제 상세 원클릭 재배포(D2-5) — 마감 확인 팝오버를 여는 1콜 경로 버튼 */
  RESEND_QUICK: "빠르게 다시 보내기",
  /** 과제 상세 재배포(D2-5) — 컴포저 재오픈 경로. '컴포저'는 내부어 금지(N-5) */
  RESEND_EDIT_IN_COMPOSER: "보내기 화면에서 편집",
  /** 새 과제 생성 진입 — 명사 단독 허용 판정(M-6). 동사 결합형(「~ 만들기」)은 금지 */
  NEW_TASK: "새 과제",
  /** 어법 탭 취약(보충 필요) 프리셋 배포 — 「~ 만들기」 대체(M-6) */
  SEND_WEAK_TASK: "보충 과제 보내기",
  /** 어법 개념 학습 뷰 — 특정 개념 스코프 배포(「이 개념으로 과제 만들기」 대체) */
  SEND_TASK_CONCEPT: "이 개념으로 과제 보내기",
  /** 어법 탭 복습 대상 프리셋 배포 — 「~ 만들기」 대체(M-6) */
  SEND_REVIEW_TASK: "복습 과제 보내기",
} as const;

export type CtaLabelKey = keyof typeof CTA_LABELS;

// ── CTA 비활성 사유 툴팁 (D2-1 — deploy=null·조건 미충족은 사유 툴팁만) ───────

export const CTA_DISABLED_TITLES = {
  /** 학습지 탭 「이 학습지 다시 보내기」 — 전체 스코프(학습지 미선택) */
  RESEND_WORKSHEET_NEEDS_SCOPE: "학습지를 선택하면 다시 보낼 수 있어요",
  /** 원본 학습지(PassageReport) 참조 미확보 — 서버 refId 부재·원본 삭제 */
  RESEND_WORKSHEET_UNAVAILABLE: "원본 학습지 정보를 불러올 수 없어 다시 보낼 수 없어요",
  /** 선택 학습지에 첫 시도 오답 기록 없음 — 재학습 근거 없음(R10 정직성) */
  RESEND_WORKSHEET_NO_WEAKNESS: "이 학습지에는 다시 보낼 취약 기록이 없어요",
  /** 어법 포인트 코드 → 드릴 개념·유닛 매핑 부재(grammar-code-map 밖 코드) */
  GRAMMAR_CODE_UNMAPPED: "연결된 어법 훈련 개념이 없어 바로 보낼 수 없어요",
} as const;

export type CtaDisabledTitleKey = keyof typeof CTA_DISABLED_TITLES;

// ── 분석 CTA 재배포 콘텐츠 meta 표기 (D2-2 WORKSHEET — 피커 표시 캐시) ────────

export const PICKED_CONTENT_META = {
  /** 학습지 탭 「이 학습지 다시 보내기」 경유 — 컴포저 피커 meta 행 */
  RESEND_FROM_STUDY: "학습 분석에서 다시 보내기",
} as const;

// ── 지표 라벨 (D6-1 핵심 용어) ───────────────────────────────────────────────

export const METRIC_LABELS = {
  /** grammarDrillMastery.masteryScore(EWMA) — 항상 「숙달도 N점」+근거 병기(scoreExplain) */
  MASTERY: "숙달도",
  /** "취약"의 강사 노출 대체어 — StatusPill rose. 코드 식별자 weak 유지 */
  WEAK: "보충 필요",
  /** 학습지 전용(힌트·재시도 없는 첫 풀이) — 시험·어법에 사용 금지 */
  FIRST_TRY_RATE: "첫 시도 정답률",
  /** 학습지 「영역별 숙달도」 카드의 개칭(동음이의 해소) */
  FIRST_TRY_RATE_BY_AXIS: "영역별 첫 시도 정답률",
  /** 시험 유형 지표 — 재시도 개념 없는 단순 정오 비율(trend.ts 실측 정직 명명) */
  ACCURACY_BY_TYPE: "유형별 정답률",
  /** 숙달 후 STALE_DAYS(21일) 초과 — 어법 랭킹 보조 */
  REVIEW_DUE: "복습 대상",
  /** 과제 지표 — 「미완료 배정」 대체(M-7). 어법 현황 KPI·테이블·CSV 공용 */
  INCOMPLETE_TASKS: "미완료 과제",
} as const;

export type MetricLabelKey = keyof typeof METRIC_LABELS;

// ── 지표 툴팁 (D6-1 표기 규칙 — MetricHelpTip ⓘ 문구) ───────────────────────

export const METRIC_HELP = {
  /** 숙달도 첫 노출 ⓘ — D6-1 원문 그대로. 컴포저 어법 패널 헤더 ⓘ(D3-4)와 공용 */
  MASTERY: "숙달도는 최근 풀이에 가중치를 둔 점수예요. 60점 미만이면 보충을 권장해요",
  /** D6-1 「보충 필요」 정의의 문장화 */
  WEAK: "보충 필요는 3회 이상 시도했는데 숙달도가 60점 미만이거나, 오답률이 높은 항목이에요",
  /** D6-1 「첫 시도 정답률」 정의의 문장화 — 학습지 전용 명시 */
  FIRST_TRY_RATE: "첫 시도 정답률은 힌트나 재시도 없이 처음 푼 결과만 집계해요. 학습지에만 쓰는 지표예요",
  /** D6-1 「정답률」 정의의 문장화 */
  ACCURACY: "정답률은 맞고 틀림만 세는 단순 비율이에요",
  /** D6-1 「복습 대상」 정의의 문장화 */
  REVIEW_DUE: "복습 대상은 숙달한 뒤 21일이 지나 다시 확인이 필요한 개념이에요",
} as const;

export type MetricHelpKey = keyof typeof METRIC_HELP;

// ── 고정 명칭 (D6-1) — 어법 3분법 + 과제 달력 ────────────────────────────────

/** 만드는 곳(워크벤치 생성 허브) / 보는 곳(관제 뷰) / 학생 허브 탭(key 불변) — D5-1 3분법 */
export const GRAMMAR_SURFACE_NAMES = {
  STUDIO: "어법 훈련소",
  STATUS: "어법 현황",
  HUB_TAB: "어법 훈련",
} as const;

/** 구 「과제 관리」 뷰의 개칭 — nav·뷰 스위처 공용(D4-1) */
export const ASSIGNMENT_CALENDAR_LABEL = "과제 달력";

/**
 * 시험 탭 [B] 스코프 칩·응시 테이블 구분 배지 — 두 모집단(TrendSitting.source)
 * 의 정직 노출(D1-3 시험 와이어). 구 「자체/외부」 표기의 후계.
 */
export const EXAM_SCOPE_LABELS = {
  ALL: "전체",
  INTERNAL: "배포 시험",
  EXTERNAL: "내신 분석",
} as const;

export type ExamScopeLabelKey = keyof typeof EXAM_SCOPE_LABELS;

// ── 배포 불가 사유 (D2-1 deploy=null 사유 툴팁 — 워딩 단일 소스) ─────────────

export const DEPLOY_DISABLED_REASONS = {
  /** 시험 히트맵 셀 — 유형 라벨→subType 역매핑 부재(QUESTIONS 프리필터 불가, D2-2) */
  EXAM_TYPE_UNMAPPED: "이 유형은 문제은행 유형 매핑이 없습니다",
} as const;

/** 학생 관리 통합 셸 제목(D4-1) — (manage) 4뷰 공통 헤더 */
export const STUDENTS_MANAGE_TITLE = "학생 관리";

/** 학생 관리 4뷰 스위처 라벨(D4-1) — (manage) 셸·nav children 개편(C-4) 공용 */
export const MANAGE_VIEW_LABELS = {
  // N-4 판정 확정(v3 design D4-1 표기 채택): 부모 「학생 관리」와의 어휘 중복·
  // 1음절 「반」 변별 실패를 피해 명사구로 — nav children 과 셸 스위처 단일 소스.
  roster: "학생 목록",
  classes: "반 편성",
  assignments: ASSIGNMENT_CALENDAR_LABEL,
  grammar: GRAMMAR_SURFACE_NAMES.STATUS,
} as const;

export type ManageViewKey = keyof typeof MANAGE_VIEW_LABELS;

// ── 학생 허브 탭 한 문장 (구 TAB_DESCRIPTIONS 흡수) ─────────────────────────
// key 는 HubTabKey(student-hub-client.tsx) 동형 문자열 — 탭 key 불변 원칙.
// study·exams·grammar 는 D6-2 개정본 채택, 나머지는 기존 문구 그대로 이관.

export const HUB_TAB_ONELINERS = {
  overview: "전 영역 요약",
  study: "배포한 학습지에서 이 학생이 어디를 어려워하는지 봅니다 — 부족한 곳에서 바로 과제를 보내세요",
  exams: "시험 점수 흐름과 약한 유형을 봅니다 — 약한 유형에서 바로 과제를 보내세요",
  grammar: "어법 개념별 숙달도를 봅니다 — 보충이 필요한 개념에서 바로 과제를 보내세요",
  tasks: "배포된 모든 과제의 수행 상태",
  // reports 는 시험 탭 내부 세그먼트 — 세그먼트 활성 시 설명 스트립에 사용
  reports: "시험 분석·상담 리포트 문서 관리(채점·공유·인쇄)",
  attendance: "출결 기록·통계",
  billing: "수강료 청구·수납 관리",
  consult: "상담 기록 관리",
  parent: "학부모 연락처·연동 관리",
} as const;

export type HubTabOnelinerKey = keyof typeof HUB_TAB_ONELINERS;

// ── 화면별 한 문장 (D6-2 전량) — key 는 표면 식별자 ──────────────────────────

export const SURFACE_ONELINERS = {
  // 학생 관리 4뷰(D4)
  "students-home": "학생을 찾고, 반을 꾸리고, 과제를 한 곳에서 관리합니다",
  // 반 행위 동사는 「편성」 단일(N-6 — D4-3 정본 토스트와 통일)
  "students-classes": "학생을 골라 반에 편성하거나, 카드를 반 폴더로 끌어다 놓으세요",
  "students-assignments": "나간 과제의 진행과 마감을 한눈에 봅니다",
  "students-grammar": "우리 학원 학생들의 어법 훈련 상태를 봅니다",
  // 학생 허브 탭 — HUB_TAB_ONELINERS 참조(단일 소스)
  "hub-overview": HUB_TAB_ONELINERS.overview,
  "hub-study": HUB_TAB_ONELINERS.study,
  "hub-exams": HUB_TAB_ONELINERS.exams,
  "hub-grammar": HUB_TAB_ONELINERS.grammar,
  "hub-tasks": HUB_TAB_ONELINERS.tasks,
  "hub-reports": HUB_TAB_ONELINERS.reports,
  "hub-attendance": HUB_TAB_ONELINERS.attendance,
  "hub-billing": HUB_TAB_ONELINERS.billing,
  "hub-consult": HUB_TAB_ONELINERS.consult,
  "hub-parent": HUB_TAB_ONELINERS.parent,
  // 제작·배포 표면
  "grammar-studio": "유닛을 고르면 실제 문항을 보고, 부족한 유닛은 AI로 만들어 채웁니다",
  "composer": "누구에게, 무엇을, 언제까지 — 세 가지만 정하면 됩니다",
} as const;

export type SurfaceOnelinerKey = keyof typeof SURFACE_ONELINERS;

// ── 빈 상태 (D6-3 전량) — 문구 + CTA 라벨 구조체 ─────────────────────────────

export interface EmptyStateCopy {
  message: string;
  /** null = CTA 없는 인라인 안내(TabEmpty 아님 — R9 배포 CTA 의무는 TabEmpty 한정) */
  ctaLabel: string | null;
}

export const EMPTY_STATES = {
  /** 시험 탭 TabEmpty */
  EXAM_TAB: {
    message: "아직 응시 기록이 없습니다. 시험지를 보내면 점수 흐름이 여기에 쌓입니다",
    ctaLabel: CTA_LABELS.SEND_EXAM_TASK,
  },
  /** 어법 탭 TabEmpty */
  GRAMMAR_TAB: {
    message: "아직 훈련 기록이 없습니다. 어법 과제를 보내면 개념별 숙달도가 여기에 쌓입니다",
    ctaLabel: CTA_LABELS.SEND_GRAMMAR_TASK,
  },
  /** 반 뷰 TabEmpty */
  CLASSES_VIEW: {
    message: "아직 반이 없습니다. 새 반을 만들고 학생을 배정해 보세요",
    ctaLabel: CTA_LABELS.NEW_CLASS,
  },
  /** 컴포저 QUESTIONS 유형 프리필터 0건(D2-2) */
  QUESTION_PREFILTER_EMPTY: {
    message: "이 유형의 문제가 문제은행에 없습니다",
    ctaLabel: CTA_LABELS.GO_QUESTION_GENERATE,
  },
  /** 컴포저 컨텍스트 스트립 — 같은 범위 기존 과제 0건(D2-3) */
  CONTEXT_NO_RELATED_TASK: {
    message: "이 개념으로 나간 과제는 아직 없습니다 — 첫 보충 과제예요",
    ctaLabel: null,
  },
  /** 보충 필요 카드 — 시도 수 미달(MIN_ATTEMPTS 3 미만) */
  WEAK_CARD_INSUFFICIENT: {
    message: "기록이 3회 이상 쌓이면 보충이 필요한 항목이 여기에 나타납니다",
    ctaLabel: null,
  },
  /** 학습지 탭 TabEmpty(C-1 수리 — 「배포하기」 게이트 워드 소거) */
  STUDY_TAB: {
    message:
      "아직 학습지 학습 기록이 없습니다. 학습지 과제를 보내면 단계별 기록이 여기에 실시간으로 쌓입니다",
    ctaLabel: "과제 탭에서 과제 보내기",
  },
} as const satisfies Record<string, EmptyStateCopy>;

export type EmptyStateKey = keyof typeof EMPTY_STATES;

// ── 원클릭 재배포 (D2-5) — 마감 확인 팝오버·토스트 문구 ──────────────────────
// 무확인 배포 금지: 마감 퀵칩 선택 + 확정 버튼을 거쳐야 전송된다.
// 날짜 산출(서울 TZ)은 소비처(assignment-detail-footer) 소관 — 여기는 라벨만.

/** 마감일 퀵칩 라벨 — 소비처가 「내일(화)」·「금요일(7/25)」 식으로 날짜를 병기 */
export const RESEND_DUE_CHIPS = {
  TOMORROW: "내일",
  FRIDAY: "금요일",
  SUNDAY: "일요일",
  NO_DUE: "마감 없음",
} as const;

/** 재배포 확인 팝오버 고정 문구 */
export const RESEND_INCOMPLETE_COPY = {
  /** 팝오버 제목 — CTA 정본 재사용 */
  TITLE: CTA_LABELS.RESEND_INCOMPLETE,
  /** 마감 미선택 상태 안내(확정 버튼 비활성 사유) */
  PICK_DUE: "마감일을 골라 주세요",
  /** 「마감 없음」 선택 시 미리보기 */
  NO_DUE_NOTE: "마감 없이 보냅니다",
  /** 확정 버튼 — 배포 동사 단일 원칙(D6-1) */
  CONFIRM: CTA_LABELS.SEND_TASK,
  CANCEL: "취소",
  SENDING: "보내는 중…",
  /** 실패 토스트 폴백 — 서버 에러 문구가 없을 때만 */
  FAIL: "다시 보내기에 실패했습니다.",
} as const;

/** 팝오버 본문 — 「같은 내용으로 새 과제를 만들어 미완료 N명에게 보냅니다」 */
export function resendIncompleteBody(count: number): string {
  return `같은 내용으로 새 과제를 만들어 미완료 ${count}명에게 보냅니다`;
}

/** 마감 미리보기 — 「7/25(금) 23:59 마감」 (dateLabel 은 소비처가 조립) */
export function resendDuePreview(dateLabel: string): string {
  return `${dateLabel} 23:59 마감`;
}

/** 성공 토스트 — 「N명에게 다시 보냈습니다」 (D2-5 계약 문구) */
export function resendSuccessToast(count: number): string {
  return `${count}명에게 다시 보냈습니다`;
}

// ── 컴포저 어법 패널 — 보충 개념 자동 추천 리스트 (D3-4 ①) ──────────────────
// 구 「취약 개념 프리셋」 칩 영역의 후계 워딩 — 개별 체크 토글 행 리스트.

export const WEAK_CONCEPTS_PANEL = {
  HEADER: "보충이 필요한 개념 (자동 추천)",
  /** 추천 개념 전체를 spec.conceptIds 에 원클릭 반영 */
  APPLY_ALL: "모두 적용",
} as const;

// ── 유닛 실물 브라우저 (D3-4 ③ · D5 훈련소 공유) 고정 문구 ───────────────────

export const UNIT_BROWSER_COPY = {
  /** 모달 제목 — 진입 CTA(VIEW_UNIT_ITEMS)와 동일 어휘 유지 */
  TITLE: CTA_LABELS.VIEW_UNIT_ITEMS,
  /** 스코프 무지정(유닛·개념 모두 빈 스펙) 표기 */
  SCOPE_ALL: "전체 유닛",
  /** listGrammarPoolItems truncated 플래그 — 무필터 전수 렌더 방어 안내 */
  TRUNCATED: "문항이 많아 상위 200개만 표시합니다 — 유닛이나 개념을 골라 범위를 좁혀 주세요",
  EMPTY: "조건과 일치하는 문항이 없습니다 — 필터를 넓혀 주세요",
  LOADING: "문항을 불러오는 중…",
  LOAD_FAILED: "문항 목록을 불러오지 못했습니다",
  RETRY: "다시 시도",
  /** studentId 컨텍스트 — 보충 필요 개념 우선 정렬 안내(D3-4) */
  WEAK_FIRST: "보충이 필요한 개념의 문항을 위로 정렬했습니다",
} as const;

// ── 점수 설명 헬퍼 — R10 「점수 단독 노출 금지」 집행 ─────────────────────────

export interface ScoreExplainInput {
  /** 숙달도(0~100, grammarDrillMastery.masteryScore EWMA) */
  score: number;
  attempts: number;
  wrong: number;
}

/**
 * 「숙달도 27점 · 12회 시도 중 8회 오답」 포맷 단일 소스.
 * 시도 0회면 점수 주장 없이 「기록 없음」 — 근거 없는 점수 노출 방지(R10).
 */
export function scoreExplain({ score, attempts, wrong }: ScoreExplainInput): string {
  const tries = Number.isFinite(attempts) ? Math.max(0, Math.round(attempts)) : 0;
  if (tries === 0) return "기록 없음";
  const point = Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 0;
  const misses = Number.isFinite(wrong) ? Math.min(tries, Math.max(0, Math.round(wrong))) : 0;
  return `${METRIC_LABELS.MASTERY} ${point}점 · ${tries}회 시도 중 ${misses}회 오답`;
}

/**
 * 지표 종별 취약점 문장화 — WeakSpot(metric+evidence) 설명의 단일 소스.
 * mastery 는 scoreExplain 위임(「숙달도 27점 · …」), 정답률 계열은 지표 이름을
 * 정직하게 병기한다(D6: 「첫 시도 정답률」 학습지 전용 · 시험은 「정답률」).
 */
export function weakSpotExplain(input: {
  kind: "mastery" | "first-try" | "accuracy";
  value: number;
  attempts: number;
  wrong: number;
}): string {
  const tries = Number.isFinite(input.attempts) ? Math.max(0, Math.round(input.attempts)) : 0;
  if (tries === 0) return "기록 없음";
  if (input.kind === "mastery") {
    return scoreExplain({ score: input.value, attempts: input.attempts, wrong: input.wrong });
  }
  const pct = Number.isFinite(input.value)
    ? Math.min(100, Math.max(0, Math.round(input.value)))
    : 0;
  const misses = Number.isFinite(input.wrong)
    ? Math.min(tries, Math.max(0, Math.round(input.wrong)))
    : 0;
  const name = input.kind === "first-try" ? METRIC_LABELS.FIRST_TRY_RATE : "정답률";
  const unit = input.kind === "accuracy" ? "문항" : "회";
  return `${name} ${pct}% · ${tries}${unit} 중 ${misses}${unit} 오답`;
}

// ── 반 편성 뷰 (D4-3, C-3) — 폴더 스택 이식 표면의 노출 문구 단일 소스 ────────
// 드롭 확정 토스트는 「{반}에 N명을 편성했습니다」+실행 취소 8초(D4-3 계약).

export const CLASS_FOLDER_COPY = {
  /** FolderSection rootLabel — 가상 루트 폴더(전 재원생) */
  ROOT_LABEL: "전체 학생",
  /** 폴더 스택 itemCountLabel·DragDropModePopover itemLabel */
  ITEM_LABEL: "학생",
  /** 그리드 상단 상시 힌트 — DnD 발견성(컴퓨터 초보 강사 기준) */
  GRID_HINT: "카드를 끌어 반 폴더에 놓으면 그 반에 편성됩니다 — 여러 반에 함께 편성할 수 있어요",
  /** 반 내부 빈 상태 */
  CLASS_EMPTY: "이 반에 편성된 학생이 없습니다 — 전체 학생에서 카드를 끌어다 놓으세요",
  /** 반 삭제 확인(N-10) — use-folder-manager deleteConfirmMessage 주입용 */
  DELETE_CONFIRM: "이 반을 삭제하시겠습니까? (학생 정보는 삭제되지 않습니다)",
  /** 반 삭제 완료 토스트(N-10) */
  DELETED_TOAST: "반을 삭제했습니다.",
  /** 재원생 0명 — 학생 등록은 학생 뷰 소관 */
  ROSTER_EMPTY: "아직 등록된 재원생이 없습니다 — 학생 뷰에서 먼저 등록해 주세요",
  SELECTED_COUNT: (n: number) => `선택 ${n}명`,
  CLEAR_SELECTION: "선택 해제",
  /** 드롭·배정 확정 토스트(D4-3 정본 문구) */
  ENROLLED_TOAST: (className: string, n: number) => `${className}에 ${n}명을 편성했습니다`,
  /** 루트(전체 학생)로 끌어내 반에서 뺄 때 */
  REMOVED_TOAST: (className: string, n: number) => `${className}에서 ${n}명을 뺐습니다`,
  ALREADY_ENROLLED: "이미 이 반에 편성된 학생입니다",
  ACTION_FAILED: "반 편성 작업에 실패했습니다",
  UNDO: "실행 취소",
  UNDO_DONE: "반 편성을 실행 취소했습니다",
  UNDO_FAILED: "실행 취소하지 못했습니다",
  /** 셸 「+ 새 반」 팝오버(C-3 task 7) */
  NEW_CLASS_TITLE: "새 반 만들기",
  NEW_CLASS_PLACEHOLDER: "반 이름 (예: 고2 심화)",
  NEW_CLASS_SUBMIT: "생성",
  CREATED_TOAST: (name: string) => `「${name}」 반을 만들었습니다`,
  CREATE_FAILED: "반 생성에 실패했습니다",
} as const;

// ── 태스크 상태 라벨 — 과제 상세·컴포저 컨텍스트 스트립 공용 노출 어휘 ────────

export const TASK_STATUS_LABELS = {
  ASSIGNED: "대기",
  IN_PROGRESS: "진행 중",
  DONE: "완료",
  /** overdue 플래그 우선 표기(라이브 상태와 별개 축) */
  OVERDUE: "기한 지남",
} as const;

// ── 컴포저 (D3-1 3스텝 번호제 · D3-3 문장형 푸터) ────────────────────────────

export const COMPOSER_COPY = {
  /** 모달 제목 — 배포 동사 단일 원칙(「과제 배포」 계열 금지) */
  TITLE: CTA_LABELS.SEND_TASK,
  /** 모달 부제 — D6-2 컴포저 한 문장 */
  DESCRIPTION: SURFACE_ONELINERS.composer,
  /** 3스텝 패널 라벨(D3-1) — PanelHandle 세로 라벨·패널 상단 캡션 공용 */
  STEP_TARGET: "① 누구에게",
  STEP_CONFIG: "② 무엇을 · 언제까지",
  STEP_CONFIRM: "③ 실물 확인",
  /** GRAMMAR 전용 ③ 캡션(M-8) — 어법은 실물이 아니라 범위 스펙(spec §3.1 라벨 정직) */
  STEP_SCOPE: "③ 출제 범위",
  /** 미충족 패널 rose 도트의 접근성 문구 */
  STEP_UNMET_HINT: "필요한 입력이 남았습니다",
  /** 푸터 미충족 가이드(첫 사유만, D3-3) — 번호는 해당 패널 번호를 따른다 */
  GUIDE_TARGET: "① 왼쪽에서 받을 학생을 선택해 주세요",
  GUIDE_KIND: "② 과제 종류를 선택해 주세요",
  GUIDE_CONTENT: "② 배포할 콘텐츠를 선택해 주세요",
  GUIDE_QUESTIONS: "② 보낼 문제를 선택해 주세요",
  /** 마감 없음 배포 안내 — 버튼은 활성 유지(D3-3) */
  NO_DUE_HINT: "마감일이 없어요 — 마감 없이 보내려면 그대로 누르세요",
  SENDING: "보내는 중…",
  SENT_TOAST: (count: number) => `${count}명에게 과제를 보냈습니다.`,
  SENT_SKIPPED_SUFFIX: (skipped: number) =>
    ` (이미 제출한 ${skipped}명은 기존 기록 유지)`,
  SEND_FAILED: "과제를 보내지 못했습니다.",
} as const;

// ── 컴포저 컨텍스트 스트립 (D2-3) — analysisSeed 진입 시 헤더 아래 전폭 1행 ──

export const COMPOSER_CONTEXT_COPY = {
  LOADING: "분석 기록을 불러오는 중…",
  LOAD_ERROR: "분석 기록을 불러오지 못했습니다",
  RELATED_TASKS: (n: number) => `이미 나간 관련 과제 ${n}건`,
  /** 고아 배포(assignmentId 없음) 칩 — 과제 상세 모달 진입 불가 사유 */
  DIRECT_TASK_HINT: "과제 상세가 없는 개별 배포예요",
  NO_DUE: "마감 없음",
  DUE_SUFFIX: "마감",
  DETAIL_OPEN: "자세히",
  DETAIL_CLOSE: "접기",
  MASTERY_TABLE: "개념별 점수",
  MASTERY_EMPTY: "이 범위의 훈련 기록이 아직 없습니다",
  RECENT_WRONG: "최근 오답 3건",
  RECENT_WRONG_EMPTY: "최근 오답 기록이 없습니다",
  /** 「최근 오답 7/19」 접두 */
  LAST_WRONG_PREFIX: "최근 오답",
  MORE_SPOTS: (n: number) => `외 ${n}개`,
  /** 오답 답안 인용 접두 — 「답 “…”」 */
  ANSWER_PREFIX: "답",
} as const;

export interface WrongExplainInput {
  attempts: number;
  wrong: number;
}

/**
 * 「첫 시도 12회 중 8회 오답」 포맷 단일 소스 — 학습지 첫 시도 오답률 문맥 전용
 * (scoreExplain 은 숙달도 문맥 — 병존). 시도 0회면 「기록 없음」(R10).
 */
export function wrongExplain({ attempts, wrong }: WrongExplainInput): string {
  const tries = Number.isFinite(attempts) ? Math.max(0, Math.round(attempts)) : 0;
  if (tries === 0) return "기록 없음";
  const misses = Number.isFinite(wrong) ? Math.min(tries, Math.max(0, Math.round(wrong))) : 0;
  return `첫 시도 ${tries}회 중 ${misses}회 오답`;
}

// ── 어법 훈련소 브라우징 (D5-2 — D-1 additive) ───────────────────────────────
// 워크벤치 grammar-studio 표면 전용 고정 문구. 한 문장은 SURFACE_ONELINERS
// ["grammar-studio"], 생성 CTA 는 CTA_LABELS.GENERATE_FROM_UNIT (기존 키) 사용.

export const GRAMMAR_STUDIO_COPY = {
  /** b유닛(문항 0) 빈 상태 — D5-3 정직 안내 원문 */
  UNIT_EMPTY:
    "이 유닛에는 아직 드릴 문항이 없습니다. AI로 만든 문항은 문제은행에 저장됩니다",
  /** 문항 0 유닛 카드의 rose ⚠ 배지 */
  NO_ITEMS_BADGE: "문항 없음",
  /** 파트 폴더 그리드 루트 칩(전체 보기) 라벨 */
  ROOT_FOLDER: "전체 유닛",
  /** 유닛 상세 → 유닛 브라우징 복귀 버튼 */
  BACK_TO_UNITS: "유닛 목록",
  /** StatStrip 4타일 라벨 */
  STAT_TOTAL_ITEMS: "전체 문항",
  STAT_UNITS: "유닛",
  STAT_CONCEPTS: "개념",
  STAT_EMPTY_UNITS: "문항 없는 유닛",
} as const;

// ── 어법 훈련소 nav children (D5-1 — C-4 additive) ───────────────────────────
// NavItem 본 라벨은 GRAMMAR_SURFACE_NAMES.STUDIO(기존 키) 사용 — 여기는
// children 라벨만. HISTORY 는 D-2(생성 기록 뷰) 랜딩 후 실경로 확정 시
// nav-config children 에 배선한다(현재 미노출 — 키만 선등재).

export const GRAMMAR_STUDIO_NAV_LABELS = {
  /** 브라우징 홈(/workbench/grammar-studio) */
  BROWSE_UNITS: "유닛 둘러보기",
  /** 생성 기록 — D-2 랜딩 전 nav 미노출 */
  HISTORY: "생성 기록",
} as const;

// ── 어법 훈련소 AI 생성 (D5-3 — D-2 additive) ────────────────────────────────
// 합성지문 생성 패널·grammar-studio 잡 라우트·자동 폴더 귀속의 노출 문구 단일
// 소스. 저장처는 문제은행(Question/QuestionCollection) 단일 — 드릴 뱅크 반입이
// 아님을 정직 고지한다(§D5-3 v3 제외 확정).

export const GRAMMAR_STUDIO_GENERATE_COPY = {
  /** 패널 제목 — 진입 CTA(GENERATE_FROM_UNIT)와 동일 어휘 유지 */
  TITLE: CTA_LABELS.GENERATE_FROM_UNIT,
  DESCRIPTION:
    "선택한 개념으로 합성 지문을 만들고, 어법 문항을 생성해 문제은행에 저장합니다",
  SECTION_SCOPE: "생성 범위",
  SECTION_OPTIONS: "난이도 · 문항 수",
  /** 개념 미선택(빈 배열) — 유닛 전 개념을 순환 시드 */
  CONCEPTS_ALL: "유닛 전체 개념",
  DIFFICULTY_LABEL: "난이도",
  COUNT_LABEL: "문항 수",
  /** b유닛 정직 안내 — 드릴 반입 아님 명시(§D5-3) */
  BANK_NOTE: "AI로 만든 문항은 문제은행에 저장됩니다 — 학생 드릴 뱅크에는 들어가지 않아요",
  START: "생성 시작",
  STARTING: "생성 요청 중…",
  RUNNING_NOTE:
    "생성에는 문항당 1~2분이 걸릴 수 있어요 — 완료까지 이 창을 열어 두면 폴더 정리까지 마쳐 드려요",
  PROGRESS: (done: number, total: number) => `생성 진행 ${done}/${total}`,
  DONE_TITLE: "생성 완료",
  DONE_SUMMARY: (success: number) => `${success}문항을 만들었습니다`,
  /** 실패분 환불 고지 — 실제 환불은 기존 잡 인프라(워커 catch) 소관 */
  PARTIAL_NOTE: (failed: number) =>
    `${failed}건은 생성에 실패해 크레딧이 환불되었습니다`,
  /** 시드(합성 지문) 단계 실패 — 잡 미생성 = 크레딧 미차감 구간 */
  SEED_FAILED_NOTE: (n: number) =>
    `${n}건은 합성 지문 생성에 실패해 요청에서 제외했어요 (크레딧 차감 없음)`,
  SAVED_TO: (folder: string) => `「${folder}」 폴더에 저장했습니다`,
  GO_TO_BANK: "문제은행 폴더로 이동",
  CLOSE: "닫기",
  CANCEL: "취소",
  /** 유닛당 동시 1잡 가드(§D5-3) 409 안내 */
  UNIT_BUSY: "이 유닛의 생성이 이미 진행 중입니다 — 완료 후 다시 시도해 주세요",
  INSUFFICIENT_CREDITS: "크레딧이 부족합니다",
  REQUEST_FAILED: "생성 요청에 실패했습니다",
  ALL_FAILED: "문항을 만들지 못했습니다 — 잠시 후 다시 시도해 주세요",
  POLL_FAILED: "진행 상태를 불러오지 못했습니다 — 잠시 후 자동으로 다시 확인해요",
} as const;

/** 크레딧 사전 고지 — 「10문항 생성 = 20크레딧」 포맷 단일 소스(§D5-3) */
export function grammarStudioCreditNotice(count: number, credits: number): string {
  return `${count}문항 생성 = ${credits}크레딧`;
}

/**
 * 훈련소 자동 귀속 폴더 이름 — 루트 「어법 훈련소」(GRAMMAR_SURFACE_NAMES.STUDIO)
 * 아래 유닛 하위 폴더 「U2 수일치」 식. 폴더명은 디렉터 노출 문구이므로 여기서
 * 단일 소스로 조립한다(ensureGrammarStudioCollection 소비).
 */
export function grammarStudioUnitFolderName(unitLabel: string, unitTitle: string): string {
  return `${unitLabel} ${unitTitle}`;
}

/** 훈련소 합성지문 Passage.title — 지문·문항 목록에 노출되는 제목 단일 소스 */
export function grammarStudioPassageTitle(
  unitLabel: string,
  unitTitle: string,
  seedTitle: string,
): string {
  return `${GRAMMAR_SURFACE_NAMES.STUDIO} · ${unitLabel} ${unitTitle} · ${seedTitle}`;
}

export interface AccuracyExplainInput {
  correct: number;
  total: number;
}

/**
 * 「정답률 33% (3/9)」 포맷 단일 소스 — 시험 유형별 정답률 문맥 전용
 * (D1-3 시험 와이어 셀 팝오버 · D6 「정답률」 = 단순 정오 비율).
 * 표본 0이면 점수 주장 없이 「기록 없음」(R10).
 */
export function accuracyExplain({ correct, total }: AccuracyExplainInput): string {
  const n = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
  if (n === 0) return "기록 없음";
  const hit = Number.isFinite(correct) ? Math.min(n, Math.max(0, Math.round(correct))) : 0;
  return `정답률 ${Math.round((hit / n) * 100)}% (${hit}/${n})`;
}

// ── 분석 카드 제목 (M-6 개칭 판정 — 「취약」의 강사 노출 대체) ───────────────

export const ANALYTICS_CARD_TITLES = {
  /** 학습지 탭 — 구 「누적 취약 단어」/「이 학습지 취약 단어」 */
  WEAK_WORDS_ALL: "자주 틀린 단어",
  WEAK_WORDS_SCOPED: "이 학습지에서 자주 틀린 단어",
  /** 학습지 탭 — 구 「취약 문장·어법 포인트」 */
  WEAK_POINTS: "보충 필요 문장·어법 포인트",
  /** WEAK_POINTS 카드 내부 소제목 — 구 「취약 문장」 */
  WEAK_SENTENCES_SUBHEAD: "보충 필요 문장",
} as const;

// ── 마감 퀵칩 정본 어휘 (N-7 — 컴포저·재배포 팝오버 공용 베이스) ─────────────
// 날짜·요일 병기(「내일(수)」·「금요일(7/25)」)는 소비처 소관 — 여기는 베이스 라벨만.
// 재배포 팝오버는 이 중 TOMORROW/FRIDAY/SUNDAY/NO_DUE 부분집합을 쓴다(D2-5).

export const DUE_QUICK_CHIP_LABELS = {
  TODAY: "오늘",
  TOMORROW: "내일",
  IN_3_DAYS: "3일 후",
  IN_1_WEEK: "일주일 후",
  THIS_SUNDAY: "이번 주 일요일",
  NEXT_SUNDAY: "다음 주 일요일",
  FRIDAY: "금요일",
  SUNDAY: "일요일",
  NO_DUE: "마감 없음",
} as const;

// ── 반 편성 토스트 (N-14 — 「[QA]반 반에서」 중복 방지 · 동사 「편성」 단일) ──

/** 반 이름 뒤에 조사 없이 그대로 붙는다 — 「~반」으로 끝나는 이름의 "반 반" 중복 방지 */
export function classEnrolledToast(className: string, count: number): string {
  return `${className}에 ${count}명을 편성했습니다.`;
}

export function classRemovedToast(className: string, count: number): string {
  return `${className}에서 ${count}명을 뺐습니다.`;
}
