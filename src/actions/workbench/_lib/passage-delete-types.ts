// ============================================================================
// 지문 삭제 가드의 타입·상수·DB 포트 — passage-delete-guard.ts 에서 분리(500줄 규칙).
// 순수 선언만 둔다. 사용처는 guard 의 재수출을 써도 되고 여기를 직접 써도 된다.
// ============================================================================

export interface PassageRow {
  id: string;
  academyId: string;
  title: string;
  content: string;
  createdAt: Date;
}

/** 삭제를 거부하는(ON DELETE RESTRICT) 참조 — pg_constraint 실측 26-09-29. */
export const RESTRICT_RELATIONS = [
  "tutor_lessons",
  "season_passages",
  "lesson_progress",
  "session_records",
  "naeshin_questions",
  "learning_sets",
] as const;

export type RestrictRelation = (typeof RESTRICT_RELATIONS)[number];

export const RESTRICT_RELATION_LABELS: Record<RestrictRelation, string> = {
  tutor_lessons: "튜터 수업",
  season_passages: "시즌 커리큘럼",
  lesson_progress: "학생 학습 진도",
  session_records: "학생 학습 기록",
  naeshin_questions: "내신 문항",
  learning_sets: "학습 세트",
};

/**
 * 지문과 함께 지워지는(ON DELETE CASCADE) 것 중 확인창에 알릴 만한 것.
 * 알리지 않는 CASCADE: passage_collection_items(폴더 소속), passage_bundles(원본 자료
 * 묶음 연결), prebuilt_sessions(미리 만든 학습 세션) — 지문 자체의 부속이라서.
 */
export interface PassageCascadeCounts {
  hasAnalysis: boolean;
  reports: number;
  webtoons: number;
  /** passage_notes — 지문 마킹(어휘·어법·출제 포인트 메모). */
  notes: number;
  /** tutor_conversations(삭제 안 된 것) — 학생 AI 튜터 대화. */
  tutorConversations: number;
}

/** 동일 지문으로 옮긴 참조 수 — SET NULL 외래키 전부. */
export interface RelinkCounts {
  questions: number;
  workbenchAiJobs: number;
  questionSets: number;
  teacherPrompts: number;
  tutorAiLogs: number;
}

export interface PassageDeleteStore {
  /** 학원 범위 조회. lock=true 면 행 잠금(FOR UPDATE) — 실행 경로 전용. */
  loadPassages(
    academyId: string,
    ids: string[],
    opts: { lock: boolean },
  ): Promise<PassageRow[]>;
  /**
   * 같은 학원에서 ids 와 동일할 수 있는 후보(느슨한 사전 필터, 최종 판정은 JS).
   * 잘라 내지 않는다(LIMIT 금지) — 원문이 바이트까지 같은 후보는 가장 오래된 1행만
   * 돌려줘도 된다. lock=true 면 후보 행을 FOR KEY SHARE 로 잠근다(실행 경로 전용).
   */
  findDuplicateCandidates(
    academyId: string,
    ids: string[],
    excludeIds: string[],
    opts: { lock: boolean },
  ): Promise<Array<{ forId: string; candidate: PassageRow }>>;
  countQuestions(
    ids: string[],
  ): Promise<Array<{ passageId: string; live: number; trashed: number }>>;
  findExamUsage(
    ids: string[],
  ): Promise<Array<{ passageId: string; examId: string; examTitle: string }>>;
  countRestrictRefs(
    ids: string[],
  ): Promise<Array<{ passageId: string; relation: RestrictRelation; count: number }>>;
  countCascadeRefs(
    ids: string[],
  ): Promise<Array<{ passageId: string } & PassageCascadeCounts>>;
  relinkRefs(fromId: string, toId: string): Promise<RelinkCounts>;
  /** 연결 문항 전부(휴지통 포함), 행 잠금. */
  loadLinkedQuestions(
    passageId: string,
  ): Promise<Array<{ id: string; structuredData: unknown }>>;
  writeQuestionStructuredData(questionId: string, value: unknown): Promise<void>;
  /** academyId 조건을 포함한 삭제. 지운 행 수를 돌려준다. */
  deletePassage(academyId: string, passageId: string): Promise<number>;
}

export interface SourcePassageSnapshot {
  passageId: string;
  title: string;
  content: string;
  /** ISO 8601 */
  detachedAt: string;
}

/**
 * object       — 평범한 객체에 키를 더했다(현행 데이터 전부).
 * empty        — NULL/빈 값이라 { _sourcePassage } 객체를 새로 만들었다.
 * json-string  — JSON 객체 문자열이라 파싱→병합→다시 문자열(저장 형태 유지).
 * unsupported  — 배열·숫자·파싱 불가 문자열 — 모양을 바꾸지 않으려고 그대로 둔다.
 */
export type SnapshotMergeMode = "object" | "empty" | "json-string" | "unsupported";

export interface PassageDeletionPlanItem {
  passage: PassageRow;
  liveQuestionCount: number;
  trashedQuestionCount: number;
  exams: Array<{ id: string; title: string }>;
  relinkTarget: PassageRow | null;
  blockedBy: Array<{ relation: RestrictRelation; count: number }>;
  cascade: PassageCascadeCounts;
}

export interface PassageDeletionPlan {
  requestedIds: string[];
  items: PassageDeletionPlanItem[];
  /** 없거나 다른 학원 지문 — 구분하지 않는다(존재 여부 누설 금지). */
  notFoundIds: string[];
}

export interface PassageDeletionOutcome {
  passageId: string;
  title: string;
  /** relinked=동일 지문으로 옮김, detached=원문 보관 후 삭제, plain=연결 문항 없음 */
  mode: "relinked" | "detached" | "plain";
  relinkTarget: { id: string; title: string } | null;
  liveQuestionCount: number;
  trashedQuestionCount: number;
  examIds: string[];
  moved: RelinkCounts | null;
  snapshot: Record<SnapshotMergeMode, number> | null;
  /** structuredData._sourcePassage 를 실제로 쓴 문항. */
  detachedQuestionIds: string[];
  /** 모양 때문에 원문을 싣지 못한 문항 — 원문은 감사 이벤트에만 남는다. */
  unsupportedQuestionIds: string[];
  /** mode=detached 일 때 삭제 시점 원문(감사 이벤트의 복구용 사본). */
  sourceContent: string | null;
}

export interface PassageDeletionBlocked {
  passageId: string;
  title: string;
  blockedBy: Array<{ relation: RestrictRelation; count: number }>;
}

export interface PassageDeletionResult {
  outcomes: PassageDeletionOutcome[];
  blocked: PassageDeletionBlocked[];
  notFoundIds: string[];
}
