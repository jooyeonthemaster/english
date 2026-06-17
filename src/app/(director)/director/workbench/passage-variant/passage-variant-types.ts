import type {
  WholePassageTransformMode,
  VariantDirection,
} from "@/lib/passage-transform/schema";

// ============================================================================
// 지문 변형(passage variant) — 페이지 전용 공유 타입
//
// 서버 page.tsx 가 getWorkbenchPassages 의 두꺼운 Prisma include 결과를 이
// 가벼운 SourcePassage 로 좁혀(narrow) 클라이언트에 넘긴다. 클라이언트를
// Prisma 생성 타입에 직접 묶지 않아 결합도를 낮추고 tsc 안정성을 확보한다.
// ============================================================================

/** 원본 지문 선택기에 필요한 최소 필드만 추린 형태. */
export interface SourcePassage {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  /** "BEGINNER" ~ "EXPERT" — 난이도 변형의 difficultyOverride 승계에 사용. */
  difficulty: string | null;
  source: string | null;
}

/**
 * 한 변형 액션을 식별하는 (mode, direction) 쌍. RELATED_TOPIC / OPPOSITE_TOPIC
 * 은 direction 이 없고, DIFFICULTY / LENGTH 는 direction 이 필수다.
 */
export interface VariantAction {
  key: string;
  mode: WholePassageTransformMode;
  direction?: VariantDirection;
}

/** 생성 성공 후 미리보기/저장에 필요한 결과 묶음. */
export interface VariantResult {
  action: VariantAction;
  /** 새 영어 지문 본문 전체. */
  text: string;
  /** 모델 제안 영어 제목 (없을 수 있음). */
  suggestedTitle: string;
  /** 한국어 한 줄 요약 (서버 폴백이 있어 대개 채워짐). */
  summary: string;
  /** 변형 방식 한 줄 설명 (summary 와 합쳐질 수 있음). */
  note: string;
}
