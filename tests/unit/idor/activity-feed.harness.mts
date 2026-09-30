// 관리자 활동 피드(app_events) 분류·metadata 정리 + _sourcePassage 보존 순수 함수.
// fetchActivityUnion 은 가짜 Prisma 위에서 실제 코드로 돈다(운영 DB 무접촉).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const kit = require("./kit.cjs");
const { A, state, check, checkAsync, report, fresh } = kit;

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const feed: Any = require("@/actions/admin-activity/_app-event-activity");
const sources: Any = require("@/actions/admin-activity/_sources");
const preserve: Any = require("@/actions/workbench/_lib/source-passage-preserve");

const BIG = "지문 원문 ".repeat(2000); // 약 12,000자 — 운영 최장 지문(13,352자)에 가깝다
const t = (s: string) => new Date(s);

// ── describeAppEvent ──────────────────────────────────────────────────────
{
  const v = feed.describeAppEvent("PASSAGE_DELETE", {
    via: "bulkDeleteWorkbenchPassages", title: "Day 6", mode: "detached",
    liveQuestionCount: 2, trashedQuestionCount: 1, examIds: ["e1", "e2"],
    detachedQuestionIds: ["q1", "q2", "q3"],
    sourcePassage: { title: "Day 6", content: BIG },
    fallbackSourcePassage: { title: "Day 6", content: BIG },
  });
  const json = JSON.stringify(v);
  check("PASSAGE_DELETE → 콘텐츠 「지문 삭제 — 제목」", v.category === "CONTENT" && v.title === "지문 삭제 — Day 6", v);
  check("PASSAGE_DELETE 상세: 원문 보관 · 문제 3개(휴지통 1) · 시험지 2개",
    v.detail === "원문 보관 · 문제 3개(휴지통 1) · 시험지 2개", v.detail);
  check("PASSAGE_DELETE metadata: 지문 원문을 싣지 않는다(글자 수만)",
    !json.includes("지문 원문 지문 원문") && v.metadata.sourcePassage.contentChars === BIG.length
      && v.metadata.fallbackSourcePassage.contentChars === BIG.length && json.length < 2000, json.length);
  check("PASSAGE_DELETE metadata: id 목록·집계는 남긴다",
    v.metadata.detachedQuestionIds.length === 3 && v.metadata.liveQuestionCount === 2);
  const relinked = feed.describeAppEvent("PASSAGE_DELETE", { title: "T", mode: "relinked", liveQuestionCount: 1, trashedQuestionCount: 0, examIds: [] });
  check("PASSAGE_DELETE relinked 상세", relinked.detail === "동일 지문으로 옮겨 연결 · 문제 1개", relinked.detail);
  const unpromote = feed.describeAppEvent("PASSAGE_DELETE", { via: "m1-unpromote", title: "T", mode: "plain", liveQuestionCount: 0, trashedQuestionCount: 0 });
  check("PASSAGE_DELETE 검수 취소 상세", unpromote.detail === "검수 취소 · 연결 문제 없음", unpromote.detail);
}
{
  const base = { format: "print", title: "중간고사", entry: "detail", mode: "plain", pages: 30, mountedPages: 30, prepareMs: 800, fonts: "loaded", guard: "settled" };
  const printed = feed.describeAppEvent("EXAM_EXPORT", { ...base, outcome: "printed" });
  check("인쇄 성공 → 「시험지 내보내기 (PRINT)」 INFO", printed.title === "시험지 내보내기 (PRINT)" && printed.status === "INFO" && printed.category === "EXPORT", printed);
  const blocked = feed.describeAppEvent("EXAM_EXPORT", { ...base, outcome: "blocked", mountedPages: 0, blockReason: "unmounted-pages" });
  check("인쇄 차단 → 「시험지 인쇄 실패 (PRINT)」 FAILED(성공한 내보내기로 보이지 않는다)",
    blocked.title === "시험지 인쇄 실패 (PRINT)" && blocked.status === "FAILED" && /차단: 그려지지 않은 쪽/.test(blocked.detail), blocked);
  const future = feed.describeAppEvent("EXAM_EXPORT", { ...base, outcome: "cancelled" });
  check("모르는 outcome → 성공으로 보이지 않는다(FAILED)", future.status === "FAILED" && future.title !== "시험지 내보내기 (PRINT)", future);
  const blank = feed.describeAppEvent("EXAM_EXPORT", { ...base, outcome: "printed", mountedPages: 28 });
  check("백지 쪽이 있는 인쇄 → FAILED", blank.status === "FAILED" && /백지 쪽 2/.test(blank.detail), blank);
  const stuck = feed.describeAppEvent("EXAM_EXPORT", { ...base, outcome: "printed", guard: "stuck", overflowColumns: 2, fonts: "error" });
  check("넘친 칸·글꼴 거부 경고를 상세에 싣는다", /넘친 칸 2/.test(stuck.detail) && /글꼴 거부/.test(stuck.detail), stuck.detail);
  const hwpx = feed.describeAppEvent("EXAM_EXPORT", { format: "hwpx", title: "기말", includeAnswers: false });
  check("HWPX 내보내기 제목·상세는 종전 그대로", hwpx.title === "시험지 내보내기 (HWPX)" && hwpx.detail === "기말" && hwpx.status === "INFO");
  const q = feed.describeAppEvent("QUESTION_EXPORT", { format: "docx", includeAnswers: true });
  check("문항 내보내기는 「문항 내보내기」", q.title === "문항 내보내기 (DOCX)" && q.detail === "정답 포함" && q.category === "EXPORT", q);
  const pv = feed.describeAppEvent("PAGE_VIEW", { path: "/director/exams" });
  check("PAGE_VIEW 는 종전 그대로", pv.category === "PAGE_VIEW" && pv.detail === "/director/exams");
  const unknown = feed.describeAppEvent("SOMETHING_NEW", { a: 1 });
  check("모르는 이벤트형은 「시험지 내보내기 (?)」로 보이지 않는다", unknown.title === "SOMETHING_NEW" && unknown.category !== "EXPORT");
}
check("분류 필터: CONTENT → PASSAGE_DELETE, EXPORT → 시험지·문항 내보내기, EXTRACTION → 조회 안 함",
  JSON.stringify(feed.appEventTypeWhere("CONTENT")) === '{"eventType":{"in":["PASSAGE_DELETE"]}}'
    && JSON.stringify(feed.appEventTypeWhere("EXPORT")) === '{"eventType":{"in":["EXAM_EXPORT","QUESTION_EXPORT"]}}'
    && feed.appEventTypeWhere("EXTRACTION") === null && JSON.stringify(feed.appEventTypeWhere("all")) === "{}");

// ── fetchActivityUnion(실제 _sources.ts) ─────────────────────────────────
function seedEvents(db: Any) {
  db.tables.appEvent = [
    { id: "ev1", academyId: A, actorType: "STAFF", actorId: "staffA", eventType: "PASSAGE_DELETE", resourceType: "PASSAGE", resourceId: "p1",
      metadata: { title: "지운 지문", mode: "detached", liveQuestionCount: 1, trashedQuestionCount: 0, examIds: [], sourcePassage: { title: "지운 지문", content: BIG } }, createdAt: t("2026-09-30T01:00:00Z") },
    { id: "ev2", academyId: A, actorType: "STAFF", actorId: "staffA", eventType: "EXAM_EXPORT", resourceType: "EXAM", resourceId: "eA",
      metadata: { format: "print", title: "A 시험", entry: "card-dialog", mode: "plain", pages: 3, mountedPages: 0, prepareMs: 10, fonts: "loaded", guard: "settled", outcome: "blocked", blockReason: "no-root" }, createdAt: t("2026-09-30T02:00:00Z") },
    { id: "ev3", academyId: A, actorType: "STAFF", actorId: "staffA", eventType: "PAGE_VIEW", metadata: { path: "/director" }, createdAt: t("2026-09-30T03:00:00Z") },
  ];
}
await checkAsync("피드 CONTENT 필터에 지문 삭제가 나오고 원문은 클라이언트로 가지 않는다", async () => {
  const db = fresh();
  seedEvents(db);
  const r = await sources.fetchActivityUnion({ academyId: A, limit: 20, category: "CONTENT" });
  const del = r.items.find((i: Any) => i.id === "event:ev1");
  const json = JSON.stringify(r.items);
  return !!del && del.title === "지문 삭제 — 지운 지문" && del.categoryLabel === "콘텐츠 생성"
    && !json.includes("지문 원문 지문 원문") && !r.items.some((i: Any) => i.id === "event:ev3");
});
await checkAsync("피드 EXPORT 필터: 막힌 인쇄는 FAILED 「시험지 인쇄 실패」", async () => {
  const db = fresh();
  seedEvents(db);
  const r = await sources.fetchActivityUnion({ academyId: A, limit: 20, category: "EXPORT" });
  const p = r.items.find((i: Any) => i.id === "event:ev2");
  return r.items.length === 1 && p.status === "FAILED" && p.title === "시험지 인쇄 실패 (PRINT)";
});
await checkAsync("피드 전체: app_events 의 where 는 학원 범위를 유지한다", async () => {
  const db = fresh();
  seedEvents(db);
  db.tables.appEvent.push({ id: "evB", academyId: "acB", eventType: "PASSAGE_DELETE", metadata: { title: "B" }, createdAt: t("2026-09-30T04:00:00Z") });
  const r = await sources.fetchActivityUnion({ academyId: A, limit: 50, category: "all" });
  return !r.items.some((i: Any) => i.id === "event:evB") && r.items.some((i: Any) => i.id === "event:ev3");
});

// ── preserveSourcePassage(순수) ──────────────────────────────────────────
{
  const snap = { passageId: "p9", title: "T", content: "C", detachedAt: "2026-09-29T00:00:00.000Z" };
  const prev = { questionText: "old", _sourcePassage: snap };
  const next = { questionText: "new" };
  const out = preserve.preserveSourcePassage(next, prev);
  check("객체: 이전 _sourcePassage 를 잇는다", out._sourcePassage?.content === "C" && out.questionText === "new");
  check("입력 불변", !("_sourcePassage" in next));
  const forged = preserve.preserveSourcePassage({ q: 1, _sourcePassage: { content: "FORGED" } }, prev);
  check("클라이언트가 보낸 값은 DB 값으로 바뀐다", forged._sourcePassage.content === "C");
  const stripped = preserve.preserveSourcePassage({ q: 1, _sourcePassage: { content: "FORGED" } }, { q: 0 });
  check("이전 값이 없으면 클라이언트 값은 떼어 낸다", !("_sourcePassage" in stripped) && stripped.q === 1);
  const str = preserve.preserveSourcePassage(JSON.stringify({ q: 2 }), JSON.stringify(prev));
  check("JSON 문자열: 문자열 안 객체에 넣고 문자열로 돌려준다", typeof str === "string" && JSON.parse(str)._sourcePassage.title === "T");
  check("undefined·null 은 그대로(DB 값 유지)", preserve.preserveSourcePassage(undefined, prev) === undefined && preserve.preserveSourcePassage(null, prev) === null);
  const arr = [1, 2];
  check("배열은 그대로(키를 넣을 자리 없음)", preserve.preserveSourcePassage(arr, prev) === arr);
  check("스냅숏이 객체가 아니면 없는 것으로 본다", preserve.readSourcePassageSnapshot({ _sourcePassage: "x" }) === null);
  const same = { q: 3 };
  check("양쪽에 없으면 같은 객체를 돌려준다", preserve.preserveSourcePassage(same, { q: 0 }) === same);
}

check("state 연결", state !== undefined);
report();
