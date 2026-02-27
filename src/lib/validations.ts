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

// Student
export const studentSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요").max(50),
  studentCode: z.string().min(1, "학생 코드를 입력하세요").max(20),
  grade: z.coerce.number().int().min(1).max(3),
  phone: z.string().optional(),
});

// AI Chat
export const aiChatMessageSchema = z.object({
  questionId: z.string().min(1),
  message: z.string().min(1, "메시지를 입력하세요").max(2000),
});

// Export types
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
