/** 먼 미래 VOCAB 잠금 카드 접기 — 순수 로직 음성테스트(DB 무접촉) */
type Rec = { kind: string; status: string; availableFrom: Date | null; taskId: string };
const HORIZON = 7 * 24 * 60 * 60 * 1000;
function fold(records: Rec[], now = Date.now()): Rec[] {
  const horizon = now + HORIZON;
  return records.filter(
    (r) =>
      !(
        r.kind === "VOCAB" &&
        r.status !== "DONE" &&
        r.availableFrom instanceof Date &&
        r.availableFrom.getTime() > horizon
      ),
  );
}
let fails = 0;
const check = (n: string, ok: boolean, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
  if (!ok) fails++;
};
const now = Date.UTC(2026, 7, 10);
const day = (n: number) => new Date(now + n * 86400000);
// 24단계 교재(하루 1단계) + 다른 종류 과제들
const recs: Rec[] = [];
for (let i = 0; i < 24; i++) recs.push({ kind: "VOCAB", status: "ASSIGNED", availableFrom: day(i), taskId: `v${i}` });
recs.push({ kind: "EXAM", status: "ASSIGNED", availableFrom: day(20), taskId: "exam-far" });
recs.push({ kind: "WORKSHEET", status: "ASSIGNED", availableFrom: day(30), taskId: "ws-far" });
recs.push({ kind: "VOCAB", status: "DONE", availableFrom: day(25), taskId: "vocab-done-far" });
recs.push({ kind: "VOCAB", status: "ASSIGNED", availableFrom: null, taskId: "vocab-now" });

const out = fold(recs, now);
const vocabLeft = out.filter((r) => r.kind === "VOCAB" && r.status !== "DONE" && r.availableFrom).length;
check("24단계 중 8개 이내만 노출(0~7일)", vocabLeft === 8, `${vocabLeft}`);
check("다른 종류(EXAM/WORKSHEET) 먼 미래는 유지", out.some((r) => r.taskId === "exam-far") && out.some((r) => r.taskId === "ws-far"));
check("완료된 VOCAB 은 감추지 않음", out.some((r) => r.taskId === "vocab-done-far"));
check("availableFrom 없는 VOCAB 은 유지", out.some((r) => r.taskId === "vocab-now"));
// 음성테스트 — 필터가 실제로 무언가를 자르는가(0건 초록이 탐지실패가 아님을 보인다)
check("[음성] 필터가 실제로 잘랐다", out.length < recs.length, `${recs.length} → ${out.length}`);
// 경계 — 정확히 7일째는 노출
check("[경계] 7일째 노출 / 8일째 숨김",
  fold([{ kind: "VOCAB", status: "ASSIGNED", availableFrom: day(7), taskId: "b7" }], now).length === 1 &&
  fold([{ kind: "VOCAB", status: "ASSIGNED", availableFrom: day(8), taskId: "b8" }], now).length === 0);
console.log(fails ? `\n${fails}건 실패` : "\n전건 통과");
process.exit(fails ? 1 : 0);
