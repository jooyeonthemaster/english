// 학원 범위 하네스 공용 도구 — 판정 기록 · 시드(두 학원) · 결과 출력. 운영 DB 무접촉.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS 테스트 스텁(require 경로 가로채기용) */
"use strict";

const { install, state } = require("./fake-env.cjs");
const { createFakeDb } = require("./fake-db.cjs");

install();

const A = "acA";
const B = "acB";
const STAFF_A = { id: "staffA", email: "a@x", name: "A원장", role: "DIRECTOR", academyId: A };
const STUDENT_A = { studentId: "stA", academyId: A, name: "학생A", grade: 2, xp: 0, level: 1 };
const SECRET = "SECRET-B";

const failures = [];
let passed = 0;
function check(name, cond, extra) {
  if (cond) passed += 1;
  else failures.push(extra === undefined ? name : `${name} :: ${JSON.stringify(extra).slice(0, 300)}`);
}
async function checkAsync(name, fn) {
  try {
    const r = await fn();
    check(name, r === true, r === true ? undefined : r);
  } catch (e) {
    failures.push(`${name} threw ${(e && e.stack) || e}`);
  }
}
function report() {
  process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
}

const at = (s) => new Date(s);

/** 두 학원(A=세션, B=남의 학원) 시드. B 쪽 본문에는 SECRET 문자열을 넣어 새어 나오면 잡는다. */
function seed() {
  return {
    passage: [
      { id: "pA", academyId: A, title: "A 지문", content: "Alpha text.", schoolId: "sA", createdAt: at("2026-09-01") },
      { id: "pA2", academyId: A, title: "A 지문2", content: "Alpha two.", schoolId: null, createdAt: at("2026-09-02") },
      { id: "pA3", academyId: A, title: "A 승격 지문", content: "Promoted.", schoolId: null, createdAt: at("2026-09-03") },
      { id: "pA4", academyId: A, title: "A 경합 지문", content: "Raced.", schoolId: null, createdAt: at("2026-09-04") },
      { id: "pB", academyId: B, title: "B 지문", content: `${SECRET} passage body.`, schoolId: "sB", createdAt: at("2026-09-01") },
    ],
    passageAnalysis: [
      { id: "anA", passageId: "pA", analysisData: '{"a":1}', contentHash: "h" },
      { id: "anB", passageId: "pB", analysisData: `{"secret":"${SECRET}"}`, contentHash: "h" },
    ],
    passageNote: [
      { id: "nA", passageId: "pA", annotationId: "x1", content: "a-note", memo: "", noteType: "vocab", order: 0 },
      { id: "nB", passageId: "pB", annotationId: "x2", content: `${SECRET} note`, memo: "", noteType: "vocab", order: 0 },
    ],
    passageCollection: [
      { id: "cA", academyId: A, name: "A폴더", parentId: null, description: null, color: null },
      { id: "cA2", academyId: A, name: "A폴더2", parentId: null, description: null, color: null },
      { id: "cB", academyId: B, name: "B폴더", parentId: null, description: null, color: null },
    ],
    passageCollectionItem: [
      { id: "ciA", collectionId: "cA", passageId: "pA", orderNum: 0 },
      { id: "ciB", collectionId: "cB", passageId: "pB", orderNum: 0 },
    ],
    question: [
      { id: "qA", academyId: A, passageId: "pA", type: "MULTIPLE_CHOICE", subType: null, questionText: "A 문제", structuredData: null, options: null, correctAnswer: "1", tags: null, starred: false, deletedAt: null, setId: null, approved: false, points: 1, difficulty: "INTERMEDIATE", createdAt: at("2026-09-01") },
      { id: "qB", academyId: B, passageId: "pB", type: "MULTIPLE_CHOICE", subType: null, questionText: `${SECRET} 문제`, structuredData: null, options: null, correctAnswer: "2", tags: null, starred: false, deletedAt: null, setId: null, approved: false, points: 1, difficulty: "INTERMEDIATE", createdAt: at("2026-09-01") },
      {
        id: "qDet", academyId: A, passageId: null, type: "MULTIPLE_CHOICE", subType: null, questionText: "떼어 낸 문제",
        structuredData: { questionText: "떼어 낸 문제", _sourcePassage: { passageId: "pGone", title: "지운 지문", content: "Kept original.", detachedAt: "2026-09-29T00:00:00.000Z" } },
        options: null, correctAnswer: "1", tags: null, starred: false, deletedAt: null, setId: null, approved: false, points: 1, difficulty: "INTERMEDIATE", createdAt: at("2026-09-01"),
      },
      {
        id: "qDetStr", academyId: A, passageId: null, type: "MULTIPLE_CHOICE", subType: null, questionText: "문자열 저장 문제",
        structuredData: JSON.stringify({ questionText: "문자열 저장 문제", _sourcePassage: { passageId: "pGone2", title: "지운 지문2", content: "String kept.", detachedAt: "2026-09-29T00:00:00.000Z" } }),
        options: null, correctAnswer: "1", tags: null, starred: false, deletedAt: null, setId: null, approved: false, points: 1, difficulty: "INTERMEDIATE", createdAt: at("2026-09-01"),
      },
    ],
    questionExplanation: [
      { id: "exB", questionId: "qB", content: `${SECRET} 해설` },
    ],
    questionCollection: [
      { id: "qcA", academyId: A, name: "A문제폴더", parentId: null },
      { id: "qcB", academyId: B, name: "B문제폴더", parentId: null },
    ],
    questionCollectionItem: [
      { id: "qciA", collectionId: "qcA", questionId: "qA", orderNum: 0 },
      { id: "qciB", collectionId: "qcB", questionId: "qB", orderNum: 0 },
    ],
    m1PassageDraftCollection: [
      { id: "dcA", academyId: A, name: "A초안폴더", parentId: null },
      { id: "dcB", academyId: B, name: "B초안폴더", parentId: null },
    ],
    exam: [
      { id: "eA", academyId: A, title: "A 시험", classId: "clA", status: "PUBLISHED", type: "MIDTERM", totalPoints: 100, duration: 50, shuffleQuestions: false, shuffleOptions: false, examDate: at("2026-09-20"), createdAt: at("2026-09-01") },
      { id: "eB", academyId: B, title: `${SECRET} 시험`, classId: "clB", status: "PUBLISHED", type: "MIDTERM", totalPoints: 100, duration: 50, shuffleQuestions: false, shuffleOptions: false, examDate: at("2026-09-20"), createdAt: at("2026-09-01") },
    ],
    examQuestion: [
      { id: "eqA", examId: "eA", questionId: "qA", orderNum: 1, points: 1 },
      { id: "eqB", examId: "eB", questionId: "qB", orderNum: 1, points: 1 },
    ],
    student: [
      { id: "stA", academyId: A, name: "학생A" },
      { id: "stB", academyId: B, name: "학생B" },
    ],
    examSubmission: [
      { id: "subA", examId: "eA", studentId: "stA", answers: "{}", status: "IN_PROGRESS", startedAt: at("2026-09-20") },
      { id: "subB", examId: "eB", studentId: "stB", answers: "{}", status: "IN_PROGRESS", startedAt: at("2026-09-20") },
    ],
    school: [
      { id: "sA", academyId: A, name: "A학교", slug: "school-a", type: "HIGH" },
      { id: "sB", academyId: B, name: "B학교", slug: "school-b", type: "HIGH" },
    ],
    class: [
      { id: "clA", academyId: A, teacherId: "staffA", isActive: true, name: "A반" },
      { id: "clB", academyId: B, teacherId: "staffB", isActive: true, name: "B반" },
    ],
    classEnrollment: [],
    naeshinQuestion: [
      { id: "nqB", academyId: B, passageId: "pB", learningCategory: "VOCAB", type: "MC", subType: null, questionText: `${SECRET}`, correctAnswer: "x", sentenceIndex: null },
    ],
    prebuiltSession: [
      { id: "psB", passageId: "pB", category: "VOCAB", sessionSeq: 1, questionIds: '["nqB"]', questionCount: 1 },
    ],
    extractionJob: [
      { id: "jA", academyId: A, deletedAt: null, displayName: "A잡", originalFileName: "a.pdf", createdAt: at("2026-09-01") },
      { id: "jB", academyId: B, deletedAt: null, displayName: "B잡", originalFileName: "b.pdf", createdAt: at("2026-09-01") },
    ],
    extractionM1PassageDraft: [
      { id: "drA", jobId: "jA", deletedAt: null, passageOrder: 1, title: "초안A", savedPassageId: "pA3", reviewStatus: "PROMOTED" },
      { id: "drA4", jobId: "jA", deletedAt: null, passageOrder: 2, title: "초안A4", savedPassageId: "pA4", reviewStatus: "PROMOTED" },
      { id: "drForged", jobId: "jA", deletedAt: null, passageOrder: 3, title: "위조", savedPassageId: "pB", reviewStatus: "PROMOTED" },
      { id: "drB", jobId: "jB", deletedAt: null, passageOrder: 1, title: "초안B", savedPassageId: "pB", reviewStatus: "PROMOTED" },
    ],
    // 학생 AI 채팅 대화(학생·문항당 1행). convA2 는 같은 학생의 다른 문항 대화, convB 는 남의 학원 학생 대화.
    aIConversation: [
      { id: "convA", studentId: "stA", questionId: "qA", messages: JSON.stringify([{ role: "user", content: "A-own-history" }, { role: "assistant", content: "A-own-answer" }]) },
      { id: "convA2", studentId: "stA", questionId: "qDet", messages: JSON.stringify([{ role: "user", content: "A-other-question-history" }]) },
      { id: "convB", studentId: "stB", questionId: "qB", messages: JSON.stringify([{ role: "user", content: `${SECRET} private chat` }]) },
    ],
    teacherPrompt: [],
    extractionAuditLog: [],
    appEvent: [],
  };
}

/** 새 가짜 DB 를 깔고 세션을 정한다. */
function fresh({ staff = STAFF_A, student = null } = {}) {
  state.db = createFakeDb(seed());
  state.staff = staff;
  state.student = student;
  state.events = [];
  state.credits = [];
  state.onStreamText = null;
  return state.db;
}

/** B 학원 쪽 행 스냅숏 — 전후가 같으면 남의 학원 데이터는 바뀌지 않았다. */
function snapshotB(db) {
  const t = db.tables;
  const pick = (name, pred) => JSON.stringify((t[name] ?? []).filter(pred));
  return [
    pick("passage", (r) => r.academyId === B),
    pick("passageAnalysis", (r) => r.passageId === "pB"),
    pick("passageNote", (r) => r.passageId === "pB"),
    pick("passageCollection", (r) => r.academyId === B),
    pick("passageCollectionItem", (r) => r.collectionId === "cB" || r.passageId === "pB"),
    pick("question", (r) => r.academyId === B),
    pick("questionExplanation", (r) => r.questionId === "qB"),
    pick("questionCollection", (r) => r.academyId === B),
    pick("questionCollectionItem", (r) => r.collectionId === "qcB" || r.questionId === "qB"),
    pick("m1PassageDraftCollection", (r) => r.academyId === B),
    pick("exam", (r) => r.academyId === B),
    pick("examQuestion", (r) => r.examId === "eB"),
    pick("examSubmission", (r) => r.examId === "eB"),
    pick("prebuiltSession", (r) => r.passageId === "pB"),
    pick("aIConversation", (r) => r.studentId === "stB"),
  ].join("\n");
}

const leaks = (value) => JSON.stringify(value ?? null).includes(SECRET);

module.exports = { A, B, STAFF_A, STUDENT_A, SECRET, state, check, checkAsync, report, fresh, snapshotB, leaks };
