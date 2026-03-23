// ============================================================================
// NARA ERP — Constants & Enums
// ============================================================================

// Staff Roles
export const STAFF_ROLES = [
  { value: "DIRECTOR", label: "원장" },
  { value: "TEACHER", label: "강사" },
] as const;

// Student Status
export const STUDENT_STATUSES = [
  { value: "ACTIVE", label: "재원", color: "bg-emerald-100 text-emerald-700" },
  { value: "PAUSED", label: "휴원", color: "bg-amber-100 text-amber-700" },
  { value: "WITHDRAWN", label: "퇴원", color: "bg-gray-100 text-gray-500" },
  { value: "WAITING", label: "대기", color: "bg-blue-100 text-blue-700" },
] as const;

// School Types
export type SchoolType = "MIDDLE" | "HIGH" | "ELEMENTARY";
export const SCHOOL_TYPES = [
  { value: "ELEMENTARY", label: "초등학교" },
  { value: "MIDDLE", label: "중학교" },
  { value: "HIGH", label: "고등학교" },
] as const;

// Default school seed data for "다른 영어 학원"
export interface SchoolData {
  name: string;
  slug: string;
  type: SchoolType;
  grades: number[];
}

export const DEFAULT_SCHOOLS: SchoolData[] = [
  // 중학교 (19개)
  { name: "강동중", slug: "gangdong-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "강명중", slug: "gangmyeong-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "강빛중", slug: "gangbit-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "강일중", slug: "gangil-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "고덕중", slug: "godeok-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "동북중", slug: "dongbuk-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "동신중", slug: "dongsin-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "둔촌중", slug: "dunchon-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "명일중", slug: "myeongil-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "배재중", slug: "baejae-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "상일중", slug: "sangil-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "성내중", slug: "seongnae-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "성덕여중", slug: "seongdeok-gms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "신명중", slug: "sinmyeong-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "신암중", slug: "sinam-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "천일중", slug: "cheonil-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "천호중", slug: "cheonho-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "한산중", slug: "hansan-ms", type: "MIDDLE", grades: [1, 2, 3] },
  { name: "한영중", slug: "hanyeong-ms", type: "MIDDLE", grades: [1, 2, 3] },
  // 고등학교 (14개)
  { name: "강동고", slug: "gangdong-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "강일고", slug: "gangil-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "광문고", slug: "gwangmun-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "동북고", slug: "dongbuk-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "둔촌고", slug: "dunchon-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "명일여고", slug: "myeongil-ghs", type: "HIGH", grades: [1, 2, 3] },
  { name: "선사고", slug: "seonsa-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "성덕고", slug: "seongdeok-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "상일여고", slug: "sangil-ghs", type: "HIGH", grades: [1, 2, 3] },
  { name: "한영고", slug: "hanyeong-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "한영외고", slug: "hanyeong-flhs", type: "HIGH", grades: [1, 2, 3] },
  { name: "배재고", slug: "baejae-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "서울컨벤션고", slug: "convention-hs", type: "HIGH", grades: [1, 2, 3] },
  { name: "상일미디어고", slug: "sangil-media-hs", type: "HIGH", grades: [1, 2, 3] },
];

// Backward-compatible aliases for old (admin) routes
export const SCHOOLS = DEFAULT_SCHOOLS;
export const MIDDLE_SCHOOLS = DEFAULT_SCHOOLS.filter((s) => s.type === "MIDDLE");
export const HIGH_SCHOOLS = DEFAULT_SCHOOLS.filter((s) => s.type === "HIGH");

export const SEMESTERS = [
  { value: "FIRST", label: "1학기" },
  { value: "SECOND", label: "2학기" },
] as const;

export const EXAM_TYPES = [
  { value: "MIDTERM", label: "중간고사" },
  { value: "FINAL", label: "기말고사" },
  { value: "QUIZ", label: "쪽지시험" },
  { value: "MOCK", label: "모의고사" },
] as const;

export const GRADES = [
  { value: 1, label: "1학년" },
  { value: 2, label: "2학년" },
  { value: 3, label: "3학년" },
] as const;

export const VOCAB_TEST_TYPES = [
  { value: "EN_TO_KR", label: "영→한" },
  { value: "KR_TO_EN", label: "한→영" },
  { value: "SPELLING", label: "스펠링" },
] as const;

// Question Types
export const QUESTION_TYPES = [
  { value: "MULTIPLE_CHOICE", label: "객관식" },
  { value: "SHORT_ANSWER", label: "단답형" },
  { value: "ESSAY", label: "서술형" },
  { value: "FILL_BLANK", label: "빈칸 채우기" },
  { value: "ORDERING", label: "순서 배열" },
  { value: "VOCAB", label: "어휘" },
] as const;

// Question Sub-types (for AI generation)
export const QUESTION_SUBTYPES = {
  MULTIPLE_CHOICE: [
    { value: "BLANK_INFERENCE", label: "빈칸 추론" },
    { value: "GRAMMAR_ERROR", label: "어법 오류 선택" },
    { value: "VOCAB_CHOICE", label: "어휘 선택" },
    { value: "SENTENCE_ORDER", label: "글의 순서" },
    { value: "SENTENCE_INSERT", label: "문장 삽입" },
    { value: "TOPIC_MAIN_IDEA", label: "주제/요지" },
    { value: "REFERENCE", label: "지칭 추론" },
    { value: "CONTENT_MATCH", label: "내용 일치/불일치" },
    { value: "TITLE", label: "제목 선택" },
  ],
  SHORT_ANSWER: [
    { value: "CONDITIONAL_WRITING", label: "조건부 영작" },
    { value: "SENTENCE_TRANSFORM", label: "문장 전환" },
    { value: "FILL_BLANK_KEY", label: "핵심 표현 빈칸" },
    { value: "SUMMARY_COMPLETE", label: "요약문 완성" },
    { value: "WORD_ORDER", label: "배열 영작" },
    { value: "GRAMMAR_CORRECTION", label: "문법 오류 수정" },
  ],
  VOCAB: [
    { value: "EN_TO_KR", label: "영→한" },
    { value: "KR_TO_EN", label: "한→영" },
    { value: "SYNONYM", label: "동의어" },
    { value: "ANTONYM", label: "반의어" },
    { value: "CONTEXT_MEANING", label: "문맥 속 의미" },
  ],
} as const;

// Difficulty Levels
export const DIFFICULTY_LEVELS = [
  { value: "BASIC", label: "기본", color: "bg-green-100 text-green-700" },
  { value: "INTERMEDIATE", label: "중급", color: "bg-blue-100 text-blue-700" },
  { value: "KILLER", label: "킬러", color: "bg-red-100 text-red-700" },
] as const;

// Attendance Status
export const ATTENDANCE_STATUSES = [
  { value: "PRESENT", label: "출석", color: "bg-emerald-100 text-emerald-700", icon: "check-circle" },
  { value: "ABSENT", label: "결석", color: "bg-red-100 text-red-700", icon: "x-circle" },
  { value: "LATE", label: "지각", color: "bg-amber-100 text-amber-700", icon: "clock" },
  { value: "EARLY_LEAVE", label: "조퇴", color: "bg-orange-100 text-orange-700", icon: "log-out" },
  { value: "MAKEUP", label: "보강", color: "bg-purple-100 text-purple-700", icon: "refresh-cw" },
] as const;

// Invoice Status
export const INVOICE_STATUSES = [
  { value: "PENDING", label: "미납", color: "bg-amber-100 text-amber-700" },
  { value: "PAID", label: "완납", color: "bg-emerald-100 text-emerald-700" },
  { value: "OVERDUE", label: "연체", color: "bg-red-100 text-red-700" },
  { value: "PARTIAL", label: "부분납", color: "bg-blue-100 text-blue-700" },
  { value: "REFUNDED", label: "환불", color: "bg-gray-100 text-gray-500" },
  { value: "CANCELLED", label: "취소", color: "bg-gray-100 text-gray-400" },
] as const;

// Payment Methods
export const PAYMENT_METHODS = [
  { value: "CARD", label: "카드" },
  { value: "TRANSFER", label: "계좌이체" },
  { value: "CASH", label: "현금" },
  { value: "KAKAO_PAY", label: "카카오페이" },
  { value: "NAVER_PAY", label: "네이버페이" },
  { value: "TOSS", label: "토스" },
] as const;

// Expense Categories
export const EXPENSE_CATEGORIES = [
  { value: "RENT", label: "임대료" },
  { value: "SALARY", label: "인건비" },
  { value: "MATERIALS", label: "교재비" },
  { value: "MARKETING", label: "마케팅" },
  { value: "UTILITIES", label: "공과금" },
  { value: "MAINTENANCE", label: "시설관리" },
  { value: "OTHER", label: "기타" },
] as const;

// Consultation Types
export const CONSULTATION_TYPES = [
  { value: "NEW_INQUIRY", label: "신규 문의" },
  { value: "STUDENT", label: "학생 상담" },
  { value: "PARENT", label: "학부모 상담" },
  { value: "LEVEL_TEST", label: "레벨테스트" },
] as const;

// Consultation Channels
export const CONSULTATION_CHANNELS = [
  { value: "PHONE", label: "전화" },
  { value: "VISIT", label: "방문" },
  { value: "ONLINE", label: "온라인" },
  { value: "KAKAO", label: "카카오" },
] as const;

// Consultation Statuses
export const CONSULTATION_STATUSES = [
  { value: "SCHEDULED", label: "예정", color: "bg-blue-100 text-blue-700" },
  { value: "COMPLETED", label: "완료", color: "bg-emerald-100 text-emerald-700" },
  { value: "CANCELLED", label: "취소", color: "bg-gray-100 text-gray-500" },
  { value: "FOLLOW_UP", label: "후속 필요", color: "bg-amber-100 text-amber-700" },
] as const;

// Consultation Categories
export const CONSULTATION_CATEGORIES = [
  { value: "GRADE", label: "성적" },
  { value: "ATTITUDE", label: "태도" },
  { value: "CAREER", label: "진로" },
  { value: "PARENT_REQUEST", label: "학부모 요청" },
  { value: "OTHER", label: "기타" },
] as const;

// Notice Target Types
export const NOTICE_TARGET_TYPES = [
  { value: "ALL", label: "학원 전체" },
  { value: "CLASS", label: "반별" },
  { value: "INDIVIDUAL", label: "개인별" },
  { value: "PARENTS", label: "학부모" },
] as const;

// Calendar Event Types
export const CALENDAR_EVENT_TYPES = [
  { value: "EXAM", label: "시험", color: "bg-blue-500", textColor: "text-blue-700", dotColor: "bg-blue-500" },
  { value: "EVENT", label: "행사", color: "bg-purple-500", textColor: "text-purple-700", dotColor: "bg-purple-500" },
  { value: "HOLIDAY", label: "휴원일", color: "bg-red-500", textColor: "text-red-700", dotColor: "bg-red-500" },
  { value: "MEETING", label: "회의", color: "bg-amber-500", textColor: "text-amber-700", dotColor: "bg-amber-500" },
  { value: "OTHER", label: "기타", color: "bg-gray-500", textColor: "text-gray-700", dotColor: "bg-gray-500" },
] as const;

// Student Level System (Gamification)
export const LEVEL_THRESHOLDS = [
  { level: 1, minXp: 0, title: "Beginner" },
  { level: 5, minXp: 500, title: "Novice" },
  { level: 10, minXp: 1500, title: "Learner" },
  { level: 15, minXp: 3500, title: "Intermediate" },
  { level: 20, minXp: 6500, title: "Advanced" },
  { level: 25, minXp: 10000, title: "Expert" },
  { level: 30, minXp: 15000, title: "Scholar" },
  { level: 40, minXp: 25000, title: "Champion" },
  { level: 50, minXp: 40000, title: "Master" },
] as const;

// XP Rewards
export const XP_REWARDS = {
  ATTENDANCE: 10,
  VOCAB_TEST_COMPLETE: 20,
  VOCAB_TEST_PERFECT: 50,
  EXAM_COMPLETE: 30,
  ASSIGNMENT_COMPLETE: 15,
  STREAK_7: 100,
  STREAK_30: 500,
} as const;

// Publisher list
export const PUBLISHERS = [
  { value: "능률", label: "능률" },
  { value: "비상", label: "비상" },
  { value: "YBM", label: "YBM" },
  { value: "천재", label: "천재" },
  { value: "지학사", label: "지학사" },
  { value: "금성", label: "금성" },
  { value: "동아", label: "동아" },
] as const;

// Days of week for schedule
export const DAYS_OF_WEEK = [
  { value: "MON", label: "월" },
  { value: "TUE", label: "화" },
  { value: "WED", label: "수" },
  { value: "THU", label: "목" },
  { value: "FRI", label: "금" },
  { value: "SAT", label: "토" },
  { value: "SUN", label: "일" },
] as const;
