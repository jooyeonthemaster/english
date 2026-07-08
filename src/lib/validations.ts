import { z } from "zod";

// Auth
export const adminLoginSchema = z.object({
  email: z.string().email("유효한 이메일을 입력하세요"),
  password: z.string().min(4, "비밀번호는 4자 이상이어야 합니다"),
});

export const studentLoginSchema = z.object({
  schoolSlug: z.string().min(1, "학교를 선택하세요"),
  studentCode: z.string().min(1, "학생 코드를 입력하세요").max(20),
});

// Passage
export const passageSchema = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(200),
  content: z.string().min(1, "본문을 입력하세요"),
  source: z.string().optional(),
  grade: z.coerce.number().int().min(1).max(3),
  semester: z.enum(["FIRST", "SECOND"]),
  unit: z.string().optional(),
  order: z.coerce.number().int().default(0),
});

export const passageNoteSchema = z.object({
  content: z.string().min(1, "내용을 입력하세요"),
  noteType: z.enum(["EMPHASIS", "GRAMMAR", "VOCAB", "TIP"]),
  highlightStart: z.coerce.number().int().optional(),
  highlightEnd: z.coerce.number().int().optional(),
  order: z.coerce.number().int().default(0),
});

// Vocabulary
export const vocabListSchema = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(200),
  grade: z.coerce.number().int().min(1).max(3),
  semester: z.enum(["FIRST", "SECOND"]),
  unit: z.string().optional(),
});

export const vocabItemSchema = z.object({
  english: z.string().min(1, "영단어를 입력하세요"),
  korean: z.string().min(1, "뜻을 입력하세요"),
  partOfSpeech: z.string().optional(),
  exampleEn: z.string().optional(),
  exampleKr: z.string().optional(),
  phonetic: z.string().optional(),
  order: z.coerce.number().int().default(0),
});

// Exam
export const examSchema = z.object({
  grade: z.coerce.number().int().min(1).max(3),
  semester: z.enum(["FIRST", "SECOND"]),
  examType: z.enum(["MIDTERM", "FINAL", "MOCK"]),
  year: z.coerce.number().int().min(2020).max(2030),
  title: z.string().min(1, "제목을 입력하세요").max(200),
});

export const examQuestionSchema = z.object({
  questionNumber: z.coerce.number().int().min(1),
  questionText: z.string().min(1, "문제를 입력하세요"),
  correctAnswer: z.string().min(1, "정답을 입력하세요"),
  points: z.coerce.number().int().min(1).default(1),
  passageId: z.string().optional(),
});

export const questionExplanationSchema = z.object({
  content: z.string().min(1, "해설을 입력하세요"),
  keyPoints: z.string().optional(), // JSON string array
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

// Teacher Prompt
export const teacherPromptSchema = z.object({
  content: z.string().min(1, "프롬프트를 입력하세요"),
  promptType: z.enum(["GENERAL", "GRAMMAR", "VOCAB", "EXAM_FOCUS"]),
  passageId: z.string().optional(),
  isActive: z.boolean().default(true),
});

// Student (basic)
export const studentSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요").max(50),
  studentCode: z.string().min(1, "학생 코드를 입력하세요").max(20),
  grade: z.coerce.number().int().min(1).max(3),
  phone: z.string().optional(),
});

// Student Form (comprehensive — for create/edit dialog)
export const studentFormSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요").max(50, "이름은 50자 이내로 입력하세요"),
  birthDate: z.string().optional(), // ISO date string
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  phone: z.string().optional(),
  schoolId: z.string().optional(),
  grade: z.coerce.number().int().min(1, "학년을 선택하세요").max(3, "학년을 선택하세요"),
  memo: z.string().optional(),
  parentName: z.string().optional(),
  parentPhone: z.string().optional(),
  parentRelation: z.enum(["MOTHER", "FATHER", "GUARDIAN", "OTHER"]).optional(),
  emergencyContact: z.string().optional(),
});

export type StudentFormInput = z.infer<typeof studentFormSchema>;

// AI Chat
export const aiChatMessageSchema = z.object({
  questionId: z.string().min(1),
  message: z.string().min(1, "메시지를 입력하세요").max(2000),
});

// Calendar Event
export const calendarEventSchema = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(200),
  description: z.string().optional(),
  startDate: z.string().min(1, "시작일을 선택하세요"),
  endDate: z.string().optional(),
  allDay: z.boolean().default(false),
  type: z.enum(["EXAM", "EVENT", "HOLIDAY", "MEETING", "OTHER"]),
  color: z.string().optional(),
});

// Message
export const messageSchema = z.object({
  content: z.string().min(1, "메시지를 입력하세요").max(5000),
  receiverId: z.string().min(1),
  receiverType: z.enum(["STAFF", "PARENT"]),
});

// Consultation
export const consultationSchema = z.object({
  type: z.enum(["NEW_INQUIRY", "STUDENT", "PARENT", "LEVEL_TEST"]),
  studentId: z.string().optional(),
  staffId: z.string().optional(),
  date: z.string().min(1, "날짜를 선택하세요"),
  channel: z.enum(["PHONE", "VISIT", "ONLINE", "KAKAO"]).optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "FOLLOW_UP"]).default("SCHEDULED"),
  content: z.string().optional(),
  category: z.enum(["GRADE", "ATTITUDE", "CAREER", "PARENT_REQUEST", "OTHER"]).optional(),
  followUpDate: z.string().optional(),
  followUpNote: z.string().optional(),
});

// Export types
export type CalendarEventInput = z.infer<typeof calendarEventSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type ConsultationInput = z.infer<typeof consultationSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type StudentLoginInput = z.infer<typeof studentLoginSchema>;
export type PassageInput = z.infer<typeof passageSchema>;
export type PassageNoteInput = z.infer<typeof passageNoteSchema>;
export type VocabListInput = z.infer<typeof vocabListSchema>;
export type VocabItemInput = z.infer<typeof vocabItemSchema>;
export type ExamInput = z.infer<typeof examSchema>;
export type ExamQuestionInput = z.infer<typeof examQuestionSchema>;
export type QuestionExplanationInput = z.infer<typeof questionExplanationSchema>;
export type TeacherPromptInput = z.infer<typeof teacherPromptSchema>;
export type StudentInput = z.infer<typeof studentSchema>;
export type AiChatMessageInput = z.infer<typeof aiChatMessageSchema>;

// ============================================================================
// Help Center — 피드백/고객지원 게시판 + 1:1 세미나 신청
// ============================================================================

export const helpPostSchema = z.object({
  board: z.enum(["FEEDBACK", "SUPPORT"]),
  category: z.string().min(1, "분류를 선택하세요"),
  title: z.string().min(1, "제목을 입력하세요").max(200),
  content: z.string().min(1, "내용을 입력하세요"),
  isPrivate: z.boolean().default(false),
  // 비밀글일 때만 사용.
  password: z.string().max(100).optional(),
});

export const helpAttachmentSchema = z.object({
  name: z.string(),
  url: z.string(),
  size: z.number().optional(),
  type: z.string().optional(),
});

export const helpReplySchema = z.object({
  postId: z.string().min(1),
  // 이미지만 첨부한 댓글도 허용하므로 min(1) 대신 액션에서 내용·첨부 중 하나를 요구.
  content: z.string().max(5000).default(""),
  attachments: z.array(helpAttachmentSchema).max(3).optional(),
});

export const seminarRequestSchema = z.object({
  applicantName: z.string().min(1, "이름을 입력하세요").max(50),
  phone: z.string().min(1, "연락처를 입력하세요").max(30),
  email: z.string().email("올바른 이메일을 입력하세요").optional().or(z.literal("")),
  academyName: z.string().max(100).optional(),
  preferredChannel: z.enum(["PHONE", "KAKAO", "EITHER"]).default("PHONE"),
  preferredTimes: z.string().max(300).optional(),
  topic: z.string().max(300).optional(),
  message: z.string().max(2000).optional(),
});

// 단체 세미나 클래스 — 운영자 개설/수정
export const groupSeminarSchema = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(120),
  summary: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  host: z.string().max(80).optional(),
  target: z.string().max(120).optional(),
  location: z.string().max(200).optional(),
  mapUrl: z.string().max(500).optional(),
  meetingUrl: z.string().max(500).optional(),
  scheduledAt: z.string().optional().nullable(),
  sessionDates: z.array(z.string()).max(20).optional(),
  durationMin: z.number().int().min(0).max(24 * 60).optional().nullable(),
  capacity: z.number().int().min(0).max(100000).optional().nullable(),
  registerCloseDays: z.number().int().min(0).max(365).optional().nullable(),
  depositAmount: z.number().int().min(0).max(10_000_000).optional().nullable(),
  coverImageUrl: z.string().max(1000).optional(),
  status: z.enum(["DRAFT", "OPEN", "CLOSED", "ENDED", "CANCELED"]).optional(),
});

// 단체 세미나 신청 — 원장
export const groupSeminarRegistrationSchema = z.object({
  applicantName: z.string().min(1, "이름을 입력하세요").max(50),
  phone: z.string().min(1, "연락처를 입력하세요").max(30),
  email: z.string().email("올바른 이메일을 입력하세요").optional().or(z.literal("")),
  academyName: z.string().max(100).optional(),
  headCount: z.number().int().min(1, "참석 인원은 1명 이상이어야 합니다").max(50).default(1),
  selectedDate: z.string().optional().nullable(),
  message: z.string().max(1000).optional(),
  // 참가 보증금(계좌이체)이 있는 세미나에서만 요구
  depositorName: z.string().max(60).optional(),
  refundBankName: z.string().max(40).optional(),
  refundAccountNumber: z.string().max(40).optional(),
  refundAccountHolder: z.string().max(40).optional(),
});

export type HelpPostInput = z.infer<typeof helpPostSchema>;
export type HelpReplyInput = z.infer<typeof helpReplySchema>;
export type SeminarRequestInput = z.infer<typeof seminarRequestSchema>;
export type GroupSeminarInput = z.infer<typeof groupSeminarSchema>;
export type GroupSeminarRegistrationInput = z.infer<typeof groupSeminarRegistrationSchema>;
