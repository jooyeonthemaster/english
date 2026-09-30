// 가짜 @/lib/auth-student — 학생 세션은 globalThis.__idorEnv.student.
"use strict";
const env = () => globalThis.__idorEnv;
exports.getStudentSession = async () => env().student ?? null;
exports.requireStudentAuth = async () => {
  if (!env().student) throw new Error("로그인이 필요합니다.");
  return env().student;
};
