// ============================================================================
// 관리자 활동 모니터링 — DB/코드 영문 값 → 한글 라벨 (순수 모듈).
// 클라이언트·서버 양쪽에서 import하므로 prisma 등 서버 의존성 금지.
// 모든 함수는 모르는 값이면 원문 그대로 반환한다 — 새 enum이 생겨도 UI가
// 깨지지 않고, 라벨 누락이 화면에서 바로 보여 추가 시점을 알 수 있다.
// ============================================================================

import { MODES, type ExtractionMode } from "@/lib/extraction/modes";

/** 추출 모드: PASSAGE_ONLY → "지문만 (M1)" — 디렉터 UI와 동일 명칭 재사용 */
export function extractionModeLabel(mode: string | null | undefined): string {
  if (!mode) return "—";
  const config = MODES[mode as ExtractionMode];
  return config ? `${config.label} (${config.shortLabel})` : mode;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "대기중",
  PROCESSING: "처리중",
  RUNNING: "처리중",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  SUCCESS: "성공",
  PARTIAL: "부분 완료",
  FAILED: "실패",
  DEAD: "영구 실패",
  CANCELLED: "취소됨",
  CANCELED: "취소됨",
  DRAFT: "초안",
  PUBLISHED: "발행됨",
  ARCHIVED: "보관됨",
};

/** 잡/페이지/문서 상태 공용 라벨 */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status;
}

const WORKBENCH_DOMAIN_LABELS: Record<string, string> = {
  PASSAGE_ANALYSIS: "학습지 생성",
  QUESTION_GENERATION: "문제 생성",
};

export function workbenchDomainLabel(domain: string | null | undefined): string {
  if (!domain) return "—";
  return WORKBENCH_DOMAIN_LABELS[domain] ?? domain;
}

const WORKBENCH_MODE_LABELS: Record<string, string> = {
  FULL: "전체 분석",
  CORE: "핵심 분석",
  WORKSHEET: "워크시트",
};

export function workbenchModeLabel(mode: string | null | undefined): string {
  if (!mode) return "—";
  return WORKBENCH_MODE_LABELS[mode] ?? mode;
}

const GENERATION_PLAN_LABELS: Record<string, string> = {
  STANDARD: "표준",
  PREMIUM: "프리미엄",
};

export function generationPlanLabel(plan: string | null | undefined): string {
  if (!plan) return "—";
  return GENERATION_PLAN_LABELS[plan] ?? plan;
}

const EXAM_TYPE_LABELS: Record<string, string> = {
  OFFLINE: "오프라인 시험",
  ONLINE: "온라인 시험",
  VOCAB: "단어 시험",
  MOCK: "모의고사",
};

export function examTypeLabel(type: string | null | undefined): string {
  if (!type) return "—";
  return EXAM_TYPE_LABELS[type] ?? type;
}

const LOGIN_PROVIDER_LABELS: Record<string, string> = {
  credentials: "이메일·비밀번호",
  kakao: "카카오",
  google: "구글",
  "social-bridge": "소셜 로그인",
};

export function loginProviderLabel(provider: string | null | undefined): string {
  if (!provider) return "—";
  return LOGIN_PROVIDER_LABELS[provider] ?? provider;
}

/** OCR 엔진 표기: persist가 기록한 modelUsed 값을 사람이 읽게 */
export function ocrEngineLabel(modelUsed: string | null | undefined): string {
  if (!modelUsed) return "—";
  if (modelUsed === "document-ai") return "Document AI (OCR 전용)";
  if (modelUsed.startsWith("document-ai+")) {
    return `Document AI + ${modelUsed.slice("document-ai+".length)}`;
  }
  return modelUsed;
}

// ─── 디렉터 페이지 경로 → 한글 페이지명 ─────────────────────────────────────
// nav-config.ts의 공식 메뉴명과 동일하게 유지한다. 동적 세그먼트는 수집 시
// [id]로 정규화되어 들어오므로 키도 [id]를 쓴다. 최장 접두사 매칭.

const PAGE_PATH_LABELS: Array<[string, string]> = [
  ["/director/workbench/passages/import/jobs", "지문 가져오기 · 작업 목록"],
  ["/director/workbench/passages/import", "자료 추출 (지문 가져오기)"],
  ["/director/workbench/passages/create", "학습지 생성"],
  ["/director/workbench/passages/[id]/reports/new", "학습지 보고서 작성"],
  ["/director/workbench/passages/[id]/reports", "학습지 보고서"],
  ["/director/workbench/passages/[id]", "지문 상세"],
  ["/director/workbench/passages", "학습지 관리"],
  ["/director/workbench/questions/generate", "문제 생성"],
  ["/director/workbench/questions/similar", "동형 문제 생성"],
  ["/director/workbench/questions/custom", "커스텀 유형"],
  ["/director/workbench/questions", "문제 관리"],
  ["/director/workbench/exams/create", "시험지 생성"],
  ["/director/workbench/exams/similar", "동형 시험지"],
  ["/director/workbench/exams/[id]/edit", "시험지 편집"],
  ["/director/workbench/exams/[id]", "시험지 상세"],
  ["/director/workbench/exams", "시험지 관리"],
  ["/director/workbench/similar-exams", "동형 시험지 생성"],
  ["/director/workbench/extraction/jobs", "자료 관리"],
  ["/director/workbench/extraction", "자료 추출"],
  ["/director/workbench/webtoon/library", "웹툰 관리"],
  ["/director/workbench/webtoon", "웹툰 생성"],
  ["/director/workbench/generate-learning", "학습 활동 생성"],
  ["/director/workbench/report-preview", "보고서 미리보기"],
  ["/director/workbench", "워크벤치"],
  ["/director/students/[id]", "학생 상세"],
  ["/director/students", "학생·반 관리"],
  ["/director/classes", "반 관리"],
  ["/director/tutor/programs/new", "튜터 프로그램 생성"],
  ["/director/tutor/programs", "튜터 프로그램 관리"],
  ["/director/tutor/distributions", "배포 관리"],
  ["/director/tutor/monitor", "학습 현황"],
  ["/director/tutor", "모바일 학습"],
  ["/director/credits", "크레딧 관리"],
  ["/director/notices", "공지사항"],
  ["/director/settings", "설정"],
  ["/director/exams", "시험 관리"],
  ["/director/questions", "문제 보관함"],
  ["/director/materials", "자료실"],
  ["/director", "홈"],
];

/**
 * 정규화된 경로(/director/...)를 디렉터 메뉴 기준 한글 페이지명으로.
 * 매칭 실패 시 원문 경로 반환 — 새 페이지가 생기면 위 표에 추가한다.
 */
export function pagePathLabel(path: string | null | undefined): string {
  if (!path) return "—";
  for (const [prefix, label] of PAGE_PATH_LABELS) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return label;
  }
  return path;
}
