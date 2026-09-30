// EXPORT-FINISH(26-09-30) 학원 범위 · 분류 수리 — 실제 코드를 가짜 Prisma · 세션 위에서 돌린다(운영 DB 무접촉).
//   L  단일 문항 내보내기 로더: academyId 를 where 에 건다(방어 심화)
//   A  관리자 분석 app_events 분류: 지문 삭제 · 끝나지 않은 인쇄는 내보내기가 아니다(피드와 같은 규칙)
//   R4 getExamResult: 제출 전(ASSIGNED · IN_PROGRESS) 응시는 정답 · 해설을 주지 않는다 + SHOW_USER_RESULTS
//   R5 updateExamCollection: 이름 · 설명 · 색만 바꾼다(대량 할당 차단), 과목은 "KOREAN" 만
//   R6 검수 취소(unpromote): RESTRICT 자식(내신 문항 등)이면 409, 외래키 위반 · 경합도 500 이 아니다
// SHOW_USER_RESULTS 는 모듈 로드 때 읽히므로 러너가 켠 채/끈 채 두 번 돌린다(EF_FLAG_RUN=on|off).
import { createRequire } from "node:module";

const FLAG_RUN = process.env.EF_FLAG_RUN === "off" ? "off" : "on";
process.env.NEXT_PUBLIC_SHOW_USER_RESULTS = FLAG_RUN === "on" ? "true" : "false";

const require = createRequire(import.meta.url);
const kit = require("./kit.cjs");
const { A, B, STAFF_A, STUDENT_A, state, check, checkAsync, report, fresh, snapshotB, leaks } = kit;
const { NextRequest } = require("next/server");

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const taking: Any = require("@/actions/exam-taking");

if (FLAG_RUN === "off") {
  // ── R4: 결과 화면이 꺼져 있으면 서버도 결과를 주지 않는다 ─────────────────
  await checkAsync("R4 플래그 꺼짐: 본인 제출 응시도 결과 null", async () => {
    const db = fresh({ staff: null, student: STUDENT_A });
    db.tables.examSubmission.find((s: Any) => s.id === "subA").status = "GRADED";
    return (await taking.getExamResult("subA")) === null;
  });
  report();
} else {
  const loader: Any = require("@/app/api/questions/[questionId]/_lib/load-single-question-export");
  const query: Any = require("@/actions/admin-activity/analytics/_query");
  const queryExtra: Any = require("@/actions/admin-activity/analytics/_query-extra");
  const feed: Any = require("@/actions/admin-activity/_app-event-activity");
  const collections: Any = require("@/actions/exams/collections");
  const unpromoteRoute: Any = require("@/app/api/extraction/m1-passages/[draftId]/unpromote/route");

  // ── L: 단일 문항 로더 ───────────────────────────────────────────────────
  await checkAsync("L 로더: 세션 학원을 주면 남의 학원 문항은 읽지 않는다(null) · where 에 academyId", async () => {
    const db = fresh();
    const other = await loader.loadSingleQuestionExport("qB", A);
    const call = db.calls.filter((c: Any) => c.model === "question" && c.op === "findFirst").pop();
    return other === null && call?.args?.where?.academyId === A && call?.args?.where?.deletedAt === null
      ? true
      : { other, where: call?.args?.where };
  });
  await checkAsync("L 로더: 자기 학원 문항은 읽는다(양성 대조) · 빈 학원 id 는 닫힌 실패", async () => {
    fresh();
    const mine = await loader.loadSingleQuestionExport("qA", A);
    const empty = await loader.loadSingleQuestionExport("qA", "");
    return mine?.academyId === A && mine?.examQuestion?.question?.id === "qA" && empty === null;
  });

  // ── A: 관리자 분석 분류 ─────────────────────────────────────────────────
  const EVENTS: Array<[string, unknown]> = [
    ["PAGE_VIEW", { path: "/x" }], ["LOGIN", { provider: "google" }],
    ["EXAM_EXPORT", { format: "hwpx" }], ["EXAM_EXPORT", { format: "docx" }], ["EXAM_EXPORT", null], ["EXAM_EXPORT", "print"],
    ["EXAM_EXPORT", { format: "print" }], ["EXAM_EXPORT", { format: "print", outcome: "printed" }],
    ["EXAM_EXPORT", { format: "print", outcome: "printed", pages: 9, mountedPages: 7 }],
    ["EXAM_EXPORT", { format: "print", outcome: "blocked", blockReason: "no-root" }],
    ["EXAM_EXPORT", { format: "print", outcome: "native" }], ["EXAM_EXPORT", { format: "print", outcome: "" }],
    ["EXAM_EXPORT", { format: "print", outcome: 3 }], ["QUESTION_EXPORT", { format: "docx" }],
    ["PASSAGE_DELETE", { title: "t", mode: "detached" }], ["PASSAGE_DELETE", null], ["FOO_EXPORT", {}], ["SOMETHING", {}],
  ];
  {
    const bad: string[] = [];
    for (const [type, meta] of EVENTS) {
      const got = query.appEventAnalyticsCategory(type, meta);
      const view = feed.describeAppEvent(type, meta);
      const m = (typeof meta === "object" && meta !== null ? meta : {}) as Any;
      const unfinished = type === "EXAM_EXPORT" && m.format === "print" && typeof m.outcome === "string" && m.outcome !== "" && m.outcome !== "printed";
      const want = unfinished ? null : view.category;
      if (got !== want) bad.push(`${type} ${JSON.stringify(meta)} got=${got} want=${want}`);
      if (unfinished && view.status !== "FAILED") bad.push(`feed status for unfinished print ${view.status}`);
    }
    check("A 분석 분류 = 피드 분류(끝나지 않은 인쇄는 제외) — 이벤트 18형", bad.length === 0, bad);
    check("A 지문 삭제는 내보내기가 아니다", query.appEventAnalyticsCategory("PASSAGE_DELETE", { title: "x" }) === "CONTENT");
    check("A 막힌 인쇄는 분석에서 빠진다", query.appEventAnalyticsCategory("EXAM_EXPORT", { format: "print", outcome: "blocked" }) === null);
  }
  {
    const caseSql = query.appEventCaseSql((c: string) => c).sql;
    check(
      "A CASE SQL 은 규칙 표에서 나온다(지문 삭제 → CONTENT, *_EXPORT → EXPORT, 그 밖 CONTENT)",
      caseSql === `CASE WHEN "eventType" = 'PAGE_VIEW' THEN 'PAGE_VIEW' WHEN "eventType" = 'LOGIN' THEN 'AUTH' WHEN "eventType" = 'PASSAGE_DELETE' THEN 'CONTENT' WHEN right("eventType", 7) = '_EXPORT' THEN 'EXPORT' ELSE 'CONTENT' END`,
      caseSql,
    );
  }
  await checkAsync("A 모든 분석 쿼리의 app_events 멤버가 새 분류 · 끝나지 않은 인쇄 제외를 쓴다(옛 ELSE 'EXPORT' 없음)", async () => {
    const db = fresh();
    const captured: string[] = [];
    db.$queryRaw = async (q: Any) => { captured.push(typeof q?.sql === "string" ? q.sql : String(q)); return []; };
    const from = new Date("2026-09-01T00:00:00Z");
    await query.fetchDailyMatrix(from);
    await query.fetchAcademyBounds();
    await queryExtra.fetchFeatureDaily(from);
    await queryExtra.fetchFeatureAdoption();
    await queryExtra.fetchFeatureOutcomes(from);
    await queryExtra.fetchHourWeekday(from);
    await queryExtra.fetchAcademyDetail(A, from);
    const unions = captured.filter((s) => s.includes(`FROM "app_events"`));
    const unfinished = query.APP_EVENT_UNFINISHED_PRINT_SQL.sql;
    const problems = unions.flatMap((s) => {
      const out: string[] = [];
      if (!s.includes(`NOT ${unfinished}`)) out.push("no unfinished-print exclusion");
      if (/ELSE 'EXPORT'/.test(s)) out.push("legacy ELSE 'EXPORT'");
      if (!s.includes(`WHEN "eventType" = 'PASSAGE_DELETE' THEN`)) out.push("no PASSAGE_DELETE rule");
      return out;
    });
    const featureOk = unions.filter((s) => s.includes("'PAGEVIEW'")).every((s) => s.includes("THEN 'OTHER_EVENT'") && !s.includes("THEN 'CONTENT'"));
    // 유니온 9개 = 일별 매트릭스 1 · 경계 1 · 기능 일별 1 · 채택 1 · 성공률 1 · 히트맵 1 · 학원 상세 3
    return unions.length === 9 && problems.length === 0 && featureOk ? true : { unions: unions.length, problems, featureOk };
  });

  // ── R4: getExamResult ─────────────────────────────────────────────────────
  const setStatus = (db: Any, id: string, status: string) => {
    db.tables.examSubmission.find((s: Any) => s.id === id).status = status;
  };
  for (const status of ["IN_PROGRESS", "ASSIGNED"]) {
    await checkAsync(`R4 본인 ${status} 응시 → null(정답 · 해설 없음)`, async () => {
      const db = fresh({ staff: null, student: STUDENT_A });
      setStatus(db, "subA", status);
      const r = await taking.getExamResult("subA");
      return r === null;
    });
  }
  for (const status of ["SUBMITTED", "GRADED"]) {
    await checkAsync(`R4 본인 ${status} 응시 → 결과 · 정답(양성 대조)`, async () => {
      const db = fresh({ staff: null, student: STUDENT_A });
      setStatus(db, "subA", status);
      const r = await taking.getExamResult("subA");
      return r?.id === "subA" && r.status === status && r.questions?.[0]?.correctAnswer === "1" ? true : r;
    });
  }
  await checkAsync("R4 남의 학생(다른 학원)의 채점 끝난 응시 → null", async () => {
    const db = fresh({ staff: null, student: STUDENT_A });
    setStatus(db, "subB", "GRADED");
    const r = await taking.getExamResult("subB");
    return r === null && !leaks(r);
  });

  // ── R5: 시험지 폴더 ───────────────────────────────────────────────────────
  const seedFolders = (db: Any) => {
    db.tables.examCollection = [
      { id: "ecA", academyId: A, name: "A폴더", description: null, color: null, parentId: null, subject: null },
      { id: "ecB", academyId: B, name: "B폴더", description: null, color: null, parentId: null, subject: null },
    ];
  };
  await checkAsync("R5 폴더 수정: academyId · parentId · subject · id 는 버리고 이름 · 설명 · 색만 바꾼다", async () => {
    const db = fresh();
    seedFolders(db);
    const res = await collections.updateExamCollection("ecA", {
      name: "새 이름", description: "설명", color: "#123456", academyId: B, parentId: "ecB", subject: "KOREAN", id: "hijack",
    });
    const a = db.tables.examCollection.find((c: Any) => c.id === "ecA");
    const update = db.calls.filter((c: Any) => c.model === "examCollection" && c.op.startsWith("update")).pop();
    return res.success === true && a && a.academyId === A && a.parentId === null && a.subject === null
      && a.name === "새 이름" && a.description === "설명" && a.color === "#123456"
      && update?.op === "updateMany" && update.args.where.academyId === A
      && JSON.stringify(Object.keys(update.args.data).sort()) === JSON.stringify(["color", "description", "name"])
      ? true
      : { res, a, update };
  });
  await checkAsync("R5 남의 학원 폴더는 수정 못 한다 · B 폴더 그대로", async () => {
    const db = fresh();
    seedFolders(db);
    const before = JSON.stringify(db.tables.examCollection.find((c: Any) => c.id === "ecB"));
    const res = await collections.updateExamCollection("ecB", { name: "pwn" });
    return res.success === false && JSON.stringify(db.tables.examCollection.find((c: Any) => c.id === "ecB")) === before;
  });
  await checkAsync("R5 폴더 생성: 과목은 \"KOREAN\" 만(그 밖의 값은 넣지 않는다) · 학원은 세션", async () => {
    const db = fresh();
    seedFolders(db);
    const odd = await collections.createExamCollection({ name: "이상한 과목", subject: "HACK", academyId: B });
    const ko = await collections.createExamCollection({ name: "국어", subject: "KOREAN" });
    const rows = db.tables.examCollection;
    const oddRow = rows.find((c: Any) => c.name === "이상한 과목");
    const koRow = rows.find((c: Any) => c.name === "국어");
    return odd.success && ko.success && oddRow && !("subject" in oddRow) && oddRow.academyId === A && koRow?.subject === "KOREAN"
      ? true
      : { odd, ko, oddRow, koRow };
  });

  // ── R6: 검수 취소(unpromote) ─────────────────────────────────────────────
  const post = () => new NextRequest("http://localhost/x", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  const ctx = (draftId: string) => ({ params: Promise.resolve({ draftId }) });
  const unpromote = async (draftId: string) => {
    const res = await unpromoteRoute.POST(post(), ctx(draftId));
    let body: Any = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  };
  const passageKept = (db: Any, id: string) => db.tables.passage.some((p: Any) => p.id === id);
  const draftOf = (db: Any, id: string) => db.tables.extractionM1PassageDraft.find((d: Any) => d.id === id);
  const deleteEvents = () => state.events.filter((e: Any) => e.eventType === "PASSAGE_DELETE").length;

  for (const [model, label] of [
    ["naeshinQuestion", "내신 문항"], ["learningSet", "학습 세트"], ["seasonPassage", "시즌"], ["sessionRecord", "수업 기록"],
    ["lessonProgress", "수업 진도"], ["tutorLesson", "튜터 레슨"], ["prebuiltSession", "프리빌트 세션"],
  ] as const) {
    await checkAsync(`R6 ${model}(RESTRICT/정책) 가 붙은 자기 지문 → 409 「${label}」 · 지문 · 초안 그대로`, async () => {
      const db = fresh();
      db.tables[model] = [...(db.tables[model] ?? []), { id: `${model}-x`, passageId: "pA3", academyId: A }];
      const r = await unpromote("drA");
      const blockers = r.body?.error?.details ?? [];
      return r.status === 409 && r.body?.error?.code === "PASSAGE_IN_USE"
        && blockers.some((b: Any) => b.label === label && b.count === 1)
        && passageKept(db, "pA3") && draftOf(db, "drA").savedPassageId === "pA3" && deleteEvents() === 0
        ? true
        : { status: r.status, body: r.body };
    });
  }
  await checkAsync("R6 내신 문항은 잠금 사이에 붙어도 잡는다(잠금 뒤 집계)", async () => {
    const db = fresh();
    db.onQueryRaw = (sql: string, _v: unknown[], d: Any) => {
      if (/FOR UPDATE/.test(sql)) (d.tables.naeshinQuestion ??= []).push({ id: "nqLate", passageId: "pA3", academyId: A });
      return undefined;
    };
    const r = await unpromote("drA");
    return r.status === 409 && passageKept(db, "pA3") && deleteEvents() === 0 ? true : r;
  });

  /** 삭제(deleteMany)만 바꿔 끼운 가짜 DB — $transaction 이 넘기는 tx 도 이 래퍼가 되게 __proxy 를 가로챈다. */
  const withPassageDelete = (inner: Any, deleteMany: () => Promise<unknown>) => {
    const wrapper: Any = new Proxy(inner, {
      get(t: Any, key: string | symbol) {
        if (key === "__proxy") return wrapper;
        if (key === "passage") return { ...t.passage, deleteMany };
        return t[key];
      },
    });
    return wrapper;
  };
  await checkAsync("R6 목록 밖 외래키 위반(P2003) → 409 JSON(500 아님) · 지문 · 초안 그대로 · 이벤트 없음", async () => {
    const db = fresh();
    state.db = withPassageDelete(db, async () => {
      throw Object.assign(new Error("Foreign key constraint failed on the field: `x_passageId_fkey`"), { code: "P2003" });
    });
    const r = await unpromote("drA");
    return r.status === 409 && r.body?.error?.code === "PASSAGE_IN_USE" && passageKept(db, "pA3")
      && draftOf(db, "drA").savedPassageId === "pA3" && deleteEvents() === 0
      ? true
      : r;
  });
  await checkAsync("R6 삭제 경합(삭제 행 0) → 409 CONFLICT", async () => {
    const db = fresh();
    state.db = withPassageDelete(db, async () => ({ count: 0 }));
    const r = await unpromote("drA");
    return r.status === 409 && r.body?.error?.code === "CONFLICT" && draftOf(db, "drA").savedPassageId === "pA3" && deleteEvents() === 0 ? true : r;
  });
  await checkAsync("R6 알 수 없는 오류 → 500 JSON(던지지 않는다) · 이벤트 없음", async () => {
    const db = fresh();
    state.db = withPassageDelete(db, async () => { throw new Error("boom"); });
    const r = await unpromote("drA");
    return r.status === 500 && r.body?.error?.code === "UNPROMOTE_FAILED" && deleteEvents() === 0 ? true : r;
  });
  await checkAsync("R6 아무것도 안 붙은 자기 지문은 지운다(양성 대조)", async () => {
    const db = fresh();
    const r = await unpromote("drA");
    return r.status === 200 && !passageKept(db, "pA3") && draftOf(db, "drA").savedPassageId === null && deleteEvents() === 1 ? true : r;
  });
  await checkAsync("R6 남의 학원 초안 → 404 · B 그대로", async () => {
    const db = fresh();
    const before = snapshotB(db);
    const r = await unpromote("drB");
    return r.status === 404 && snapshotB(db) === before;
  });

  check("하네스가 두 학원을 썼다", A === "acA" && B === "acB" && STAFF_A.academyId === A);
  report();
}
