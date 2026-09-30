// API 라우트·학생/레거시 서버 액션의 학원 범위 — 실제 핸들러 코드를 가짜 Prisma·세션·크레딧 위에서 돌린다.
// 세션 학원 A, 공격 대상 학원 B. AI 모듈은 부르면 예외가 나는 가짜라 「AI 호출 전에 막혔는지」도 함께 본다.
import { createRequire } from "node:module";

// 학생 결과 화면 플래그(모듈 로드 때 읽힌다) — getExamResult 양성 대조가 돌도록 켠다. 꺼진 경우는
// export-finish-scope 하네스가 따로 본다.
process.env.NEXT_PUBLIC_SHOW_USER_RESULTS = "true";

const require = createRequire(import.meta.url);
const kit = require("./kit.cjs");
const { A, B, STUDENT_A, state, check, checkAsync, report, fresh, snapshotB, leaks } = kit;
const { NextRequest } = require("next/server");
const { hashContent } = require("@/lib/passage-utils");

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const analysisRoute: Any = require("@/app/api/ai/passage-analysis/[passageId]/route");
const chatRoute: Any = require("@/app/api/ai/chat/route");
const explRoute: Any = require("@/app/api/ai/generate-explanation/route");
const modifyRoute: Any = require("@/app/api/ai/modify-question/route");
const schoolRoute: Any = require("@/app/api/schools/[schoolSlug]/passages/route");
const unpromoteRoute: Any = require("@/app/api/extraction/m1-passages/[draftId]/unpromote/route");
const examQ: Any = require("@/actions/exam-questions");
const taking: Any = require("@/actions/exam-taking");
const teacher: Any = require("@/actions/dashboard/teacher");
const builder: Any = require("@/actions/learning-session-builder");
const session: Any = require("@/actions/learning-session/session");
const resources: Any = require("@/actions/student-app-resources");
const wrong: Any = require("@/actions/student-wrong-answers");

const req = (url: string, init?: Any) => new NextRequest(`http://localhost${url}`, init);
const post = (url: string, body: unknown) =>
  req(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const deducted = () => state.credits.filter((c: Any) => c.kind === "deduct").length;
const refunded = () => state.credits.filter((c: Any) => c.kind === "refund").length;

// ── /api/ai/passage-analysis/[passageId] ─────────────────────────────────
await checkAsync("passage-analysis GET: 남의 학원 지문 → 404 · 크레딧 차감 0 · 분석 누출 없음", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const res = await analysisRoute.GET(req("/api/ai/passage-analysis/pB"), ctx({ passageId: "pB" }));
  const body = await res.json();
  return res.status === 404 && deducted() === 0 && !leaks(body) && snapshotB(db) === before;
});
await checkAsync("passage-analysis GET: 자기 지문의 캐시 분석은 200(양성 대조)", async () => {
  const db = fresh();
  const pA = db.tables.passage.find((p: Any) => p.id === "pA");
  db.tables.passageAnalysis.find((x: Any) => x.id === "anA").contentHash = hashContent(pA.content);
  const res = await analysisRoute.GET(req("/api/ai/passage-analysis/pA"), ctx({ passageId: "pA" }));
  const body = await res.json();
  return res.status === 200 && body.cached === true && body.data?.a === 1 && deducted() === 0;
});
await checkAsync("passage-analysis POST: 남의 학원 지문 → 404 · 차감·upsert 없음", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const res = await analysisRoute.POST(post("/api/ai/passage-analysis/pB", { action: "retranslate", english: "x" }), ctx({ passageId: "pB" }));
  return res.status === 404 && deducted() === 0 && snapshotB(db) === before;
});

// ── /api/ai/chat (학생) · generate-explanation · modify-question ─────────
await checkAsync("ai/chat: 남의 학원 문항 → 404 + 환불(해설·지문 누출 없음)", async () => {
  fresh({ staff: null, student: STUDENT_A });
  const res = await chatRoute.POST(post("/api/ai/chat", { questionId: "qB", message: "hi" }));
  const body = await res.json();
  return res.status === 404 && refunded() === 1 && !leaks(body);
});
// conversationId 는 클라이언트 입력이다. 남의 학생 대화를 AI 문맥으로 끌어오면 onFinish upsert 가 그 내역을
// 공격자 본인 (studentId, questionId) 행에 복사하고, 공격자는 GET /api/ai/conversation/[questionId] 로 되읽는다.
// streamText 는 가로채서 실린 문맥만 보고(네트워크 무접촉), onFinish 를 직접 불러 저장 경로까지 확인한다.
const chatWith = async (body: Any) => {
  let captured: Any = null;
  state.onStreamText = (args: Any) => {
    captured = args;
    return { toTextStreamResponse: () => new Response("ok") };
  };
  const res = await chatRoute.POST(post("/api/ai/chat", body));
  if (captured?.onFinish) await captured.onFinish({ text: "answer", finishReason: "stop", usage: {}, providerMetadata: {} });
  return { res, captured, context: JSON.stringify(captured?.messages ?? null) };
};
const conversationOf = (db: Any, studentId: string, questionId: string) =>
  db.tables.aIConversation.filter((c: Any) => c.studentId === studentId && c.questionId === questionId);
await checkAsync("ai/chat: 남의 학생(다른 학원) conversationId → 그 대화가 AI 문맥·내 대화 행에 실리지 않는다", async () => {
  const db = fresh({ staff: null, student: STUDENT_A });
  const before = snapshotB(db);
  const { res, captured, context } = await chatWith({ questionId: "qA", message: "hi", conversationId: "convB" });
  const mine = conversationOf(db, "stA", "qA");
  return res.status === 200 && captured !== null && !leaks(captured.messages) && !leaks(mine)
    && mine.length === 1 && snapshotB(db) === before
    ? true
    : { status: res.status, context, mine };
});
await checkAsync("ai/chat: 내 대화는 conversationId 유무와 관계없이 이 문항 것만 이어진다(양성 대조)", async () => {
  const db = fresh({ staff: null, student: STUDENT_A });
  const plain = await chatWith({ questionId: "qA", message: "first" });
  const withOwnId = await chatWith({ questionId: "qA", message: "second", conversationId: "convA" });
  const otherQuestionId = await chatWith({ questionId: "qA", message: "third", conversationId: "convA2" });
  const mine = conversationOf(db, "stA", "qA");
  const saved = mine.length === 1 ? JSON.parse(mine[0].messages).map((m: Any) => m.content) : [];
  const ok = [plain, withOwnId, otherQuestionId].every((r) => r.res.status === 200 && r.context.includes("A-own-history"))
    && !otherQuestionId.context.includes("A-other-question-history")
    && JSON.stringify(saved) === JSON.stringify(["A-own-history", "A-own-answer", "first", "answer", "second", "answer", "third", "answer"]);
  return ok ? true : { contexts: [plain.context, withOwnId.context, otherQuestionId.context], saved };
});
await checkAsync("generate-explanation: 남의 학원 문제 → 404 + 환불 · 해설 무변경", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const res = await explRoute.POST(post("/api/ai/generate-explanation", { questionId: "qB" }));
  return res.status === 404 && refunded() === 1 && snapshotB(db) === before;
});
await checkAsync("modify-question: 남의 학원 문제 → 404 · 크레딧 차감 0", async () => {
  fresh();
  const res = await modifyRoute.POST(post("/api/ai/modify-question", { questionId: "qB", instruction: "x", currentState: {} }));
  const body = await res.json();
  return res.status === 404 && deducted() === 0 && !leaks(body);
});

// ── /api/schools/[schoolSlug]/passages ───────────────────────────────────
await checkAsync("schools/[slug]/passages: 남의 학원 학교 → 404, 자기 학교 → 지문 목록", async () => {
  fresh();
  const bad = await schoolRoute.GET(req("/api/schools/school-b/passages"), ctx({ schoolSlug: "school-b" }));
  const ok = await schoolRoute.GET(req("/api/schools/school-a/passages"), ctx({ schoolSlug: "school-a" }));
  const list = await ok.json();
  return bad.status === 404 && ok.status === 200 && list.length === 1 && list[0].id === "pA";
});

// ── /api/extraction/m1-passages/[draftId]/unpromote ──────────────────────
await checkAsync("unpromote: 남의 학원 초안 → 404 · B 지문 그대로", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const res = await unpromoteRoute.POST(post("/x", {}), ctx({ draftId: "drB" }));
  return res.status === 404 && snapshotB(db) === before;
});
await checkAsync("unpromote: 내 초안이 남의 학원 지문을 가리켜도 지우지 않는다(포인터만 해제)", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const res = await unpromoteRoute.POST(post("/x", {}), ctx({ draftId: "drForged" }));
  const draft = db.tables.extractionM1PassageDraft.find((d: Any) => d.id === "drForged");
  return res.status === 200 && draft.savedPassageId === null && snapshotB(db) === before;
});
await checkAsync("unpromote: 자기 지문은 잠금 뒤 학원 범위로 지우고 PASSAGE_DELETE 를 남긴다", async () => {
  const db = fresh();
  const res = await unpromoteRoute.POST(post("/x", {}), ctx({ draftId: "drA" }));
  const lock = db.raw.find((q: Any) => /FOR UPDATE/.test(q.sql));
  const ev = state.events.find((e: Any) => e.eventType === "PASSAGE_DELETE");
  return res.status === 200 && !db.tables.passage.some((p: Any) => p.id === "pA3")
    && lock && lock.values[0] === "pA3" && lock.values[1] === A
    && ev?.resourceId === "pA3" && ev?.metadata?.via === "m1-unpromote" && ev?.academyId === A;
});
await checkAsync("unpromote: 잠금 사이에 붙은 문제가 있으면 409 · 지문 보존(TOCTOU)", async () => {
  const db = fresh();
  db.onQueryRaw = (sql: string, _v: unknown[], d: Any) => {
    if (/FOR UPDATE/.test(sql)) {
      d.tables.question.push({ id: "qLate", academyId: A, passageId: "pA4", deletedAt: null });
    }
    return undefined;
  };
  const res = await unpromoteRoute.POST(post("/x", {}), ctx({ draftId: "drA4" }));
  const body = await res.json();
  return res.status === 409 && body?.error?.code === "PASSAGE_IN_USE" && db.tables.passage.some((p: Any) => p.id === "pA4")
    && !state.events.some((e: Any) => e.eventType === "PASSAGE_DELETE");
});

// ── src/actions/exam-questions.ts (옛 복제본) ────────────────────────────
await checkAsync("exam-questions: 남의 학원 시험 연결·문제·문제은행 차단", async () => {
  const db = fresh();
  const before = snapshotB(db);
  const rm = await examQ.removeQuestionFromExam("eB", "eqB");
  const ro = await examQ.reorderExamQuestions("eB", ["eqB"]);
  const del = await examQ.deleteQuestion("qB");
  const bank = await examQ.getQuestionBank(B);
  const cq = await examQ.createQuestion("eA", { questionNumber: 2, questionText: "x", correctAnswer: "1", passageId: "pB" });
  return rm.success === false && ro.success === false && del.success === false && cq.success === false
    && !leaks(bank) && bank.some((q: Any) => q.id === "qA") && snapshotB(db) === before;
});
await checkAsync("exam-questions: 자기 시험 연결은 지워진다(양성 대조)", async () => {
  const db = fresh();
  const rm = await examQ.removeQuestionFromExam("eA", "eqA");
  return rm.success === true && !db.tables.examQuestion.some((x: Any) => x.id === "eqA");
});

// ── src/actions/exam-taking.ts (학생 응시) ───────────────────────────────
await checkAsync("exam-taking: 세션 없으면 목록·응시·결과·답안·제출 전부 거부", async () => {
  const db = fresh({ staff: null, student: null });
  const before = snapshotB(db);
  const list = await taking.getAvailableExams("stB");
  const start = await taking.startExam("eB", "stB");
  const result = await taking.getExamResult("subB");
  const save = await taking.saveAnswer("subB", "qB", "3");
  const submit = await taking.submitExam("subB");
  return list.length === 0 && start.success === false && result === null && save.success === false
    && submit.success === false && snapshotB(db) === before;
});
await checkAsync("exam-taking: 학생 A 는 B 학원 시험·B 학생 응시를 못 본다", async () => {
  const db = fresh({ staff: null, student: STUDENT_A });
  const before = snapshotB(db);
  const start = await taking.startExam("eB", "stA");
  const asOther = await taking.startExam("eA", "stB");
  const result = await taking.getExamResult("subB");
  const save = await taking.saveAnswer("subB", "qB", "3");
  return start.success === false && asOther.success === false && result === null && save.success === false
    && snapshotB(db) === before;
});
await checkAsync("exam-taking: 학생 A 본인 결과·답안 저장은 된다(양성 대조)", async () => {
  const db = fresh({ staff: null, student: STUDENT_A });
  const save = await taking.saveAnswer("subA", "qA", "1");
  // 응시 중(IN_PROGRESS)에는 결과(정답·해설)를 주지 않는다 — 제출 뒤에만(IDOR-R4, export-finish-scope 하네스).
  const during = await taking.getExamResult("subA");
  db.tables.examSubmission.find((s: Any) => s.id === "subA").status = "SUBMITTED";
  const result = await taking.getExamResult("subA");
  return save.success === true && during === null && result?.id === "subA" && db.tables.examSubmission.find((s: Any) => s.id === "subA").answers.includes("qA");
});

// ── 교사 대시보드 · 세션 빌더 · 학생 학습 ───────────────────────────────
await checkAsync("getTeacherRecentExams: 남의 학원 인자 → 빈 목록, 자기 학원 → 시험", async () => {
  fresh();
  const bad = await teacher.getTeacherRecentExams(B, "staffB");
  const ok = await teacher.getTeacherRecentExams(A, "staffA");
  return bad.length === 0 && ok.length === 1 && ok[0].id === "eA" && !leaks(bad);
});
await checkAsync("learning-session-builder: 남의 학원 지문·학원 세션을 지우거나 만들지 않는다", async () => {
  const db = fresh();
  const before = snapshotB(db);
  let threwOne = false;
  let threwAll = false;
  try { await builder.buildPrebuiltSessions("pB"); } catch { threwOne = true; }
  try { await builder.buildAllPrebuiltSessions(B); } catch { threwAll = true; }
  return threwOne && threwAll && snapshotB(db) === before;
});
await checkAsync("학생 학습: 남의 학원 지문 본문·해석·오답을 못 읽는다", async () => {
  fresh({ staff: null, student: STUDENT_A });
  const errs: string[] = [];
  for (const run of [
    () => session.startSession("pB", "VOCAB", 1),
    () => session.startReviewSession("pB", ["nqB"]),
    () => wrong.getPassageWrongDetail("pB"),
  ]) {
    try { const r = await run(); if (leaks(r)) errs.push("leak"); else errs.push("no-throw"); } catch { errs.push("ok"); }
  }
  const tr = await resources.getPassageTranslations("pB");
  return errs.every((e) => e === "ok") && Object.keys(tr).length === 0;
});

check("하네스가 B 학원 id 를 실제로 썼다", B === "acB");
report();
