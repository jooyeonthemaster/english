-- CreateTable
CREATE TABLE "schools" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "studentCode" TEXT NOT NULL,
    "phone" TEXT,
    "grade" INTEGER NOT NULL,
    "schoolId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "students_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'TEACHER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "passages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT,
    "grade" INTEGER NOT NULL,
    "semester" TEXT NOT NULL,
    "unit" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "passages_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "passage_notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "passageId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "highlightStart" INTEGER,
    "highlightEnd" INTEGER,
    "noteType" TEXT NOT NULL DEFAULT 'EMPHASIS',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "passage_notes_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vocabulary_lists" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "semester" TEXT NOT NULL,
    "unit" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vocabulary_lists_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vocabulary_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listId" TEXT NOT NULL,
    "english" TEXT NOT NULL,
    "korean" TEXT NOT NULL,
    "partOfSpeech" TEXT,
    "exampleEn" TEXT,
    "exampleKr" TEXT,
    "phonetic" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vocabulary_items_listId_fkey" FOREIGN KEY ("listId") REFERENCES "vocabulary_lists" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vocab_test_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "percent" REAL NOT NULL,
    "duration" INTEGER,
    "takenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vocab_test_results_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "vocab_test_results_listId_fkey" FOREIGN KEY ("listId") REFERENCES "vocabulary_lists" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "wrong_vocab_answers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "givenAnswer" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastMissedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wrong_vocab_answers_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "wrong_vocab_answers_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "vocabulary_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "semester" TEXT NOT NULL,
    "examType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exams_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "questionImage" TEXT,
    "correctAnswer" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "passageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exam_questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exam_questions_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "question_explanations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keyPoints" TEXT NOT NULL,
    "difficulty" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "question_explanations_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "teacher_prompts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "passageId" TEXT,
    "content" TEXT NOT NULL,
    "promptType" TEXT NOT NULL DEFAULT 'GENERAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "teacher_prompts_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "teacher_prompts_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "messages" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ai_conversations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ai_conversations_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "study_progress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "vocabTests" INTEGER NOT NULL DEFAULT 0,
    "vocabScore" REAL NOT NULL DEFAULT 0,
    "questionsViewed" INTEGER NOT NULL DEFAULT 0,
    "aiQuestionsAsked" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "study_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "schools_slug_key" ON "schools"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "students_studentCode_key" ON "students"("studentCode");

-- CreateIndex
CREATE INDEX "students_schoolId_idx" ON "students"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "passages_schoolId_idx" ON "passages"("schoolId");

-- CreateIndex
CREATE INDEX "passages_schoolId_grade_semester_idx" ON "passages"("schoolId", "grade", "semester");

-- CreateIndex
CREATE INDEX "passage_notes_passageId_idx" ON "passage_notes"("passageId");

-- CreateIndex
CREATE INDEX "vocabulary_lists_schoolId_idx" ON "vocabulary_lists"("schoolId");

-- CreateIndex
CREATE INDEX "vocabulary_lists_schoolId_grade_semester_idx" ON "vocabulary_lists"("schoolId", "grade", "semester");

-- CreateIndex
CREATE INDEX "vocabulary_items_listId_idx" ON "vocabulary_items"("listId");

-- CreateIndex
CREATE INDEX "vocab_test_results_studentId_takenAt_idx" ON "vocab_test_results"("studentId", "takenAt");

-- CreateIndex
CREATE INDEX "vocab_test_results_listId_takenAt_idx" ON "vocab_test_results"("listId", "takenAt");

-- CreateIndex
CREATE INDEX "wrong_vocab_answers_studentId_idx" ON "wrong_vocab_answers"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "wrong_vocab_answers_studentId_itemId_testType_key" ON "wrong_vocab_answers"("studentId", "itemId", "testType");

-- CreateIndex
CREATE INDEX "exams_schoolId_grade_year_idx" ON "exams"("schoolId", "grade", "year");

-- CreateIndex
CREATE INDEX "exam_questions_examId_idx" ON "exam_questions"("examId");

-- CreateIndex
CREATE INDEX "exam_questions_passageId_idx" ON "exam_questions"("passageId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_examId_questionNumber_key" ON "exam_questions"("examId", "questionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "question_explanations_questionId_key" ON "question_explanations"("questionId");

-- CreateIndex
CREATE INDEX "teacher_prompts_schoolId_idx" ON "teacher_prompts"("schoolId");

-- CreateIndex
CREATE INDEX "teacher_prompts_schoolId_passageId_idx" ON "teacher_prompts"("schoolId", "passageId");

-- CreateIndex
CREATE INDEX "ai_conversations_studentId_idx" ON "ai_conversations"("studentId");

-- CreateIndex
CREATE INDEX "ai_conversations_questionId_idx" ON "ai_conversations"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversations_studentId_questionId_key" ON "ai_conversations"("studentId", "questionId");

-- CreateIndex
CREATE INDEX "study_progress_studentId_idx" ON "study_progress"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "study_progress_studentId_date_key" ON "study_progress"("studentId", "date");
