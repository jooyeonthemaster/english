/** 7/17 프로덕션 배치 → 블라인드/풀 평가 패킷 생성 (build-eval-packets.py 형식 준수).
 *  blind/<pid>.md: 렌더지문+발문+선지만. full/<pid>.md: 정답·해설·요청난이도 포함.
 *  key.json: pid→잡·원가·경고 메타(평가자 비공개). */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = join(process.cwd(), "experiments/question-quality-20260715/runs/campaign-20260716");
const batch = JSON.parse(readFileSync(join(BASE, "private/prod-jul17-batch.private.json"), "utf8")) as Array<{
  job: Record<string, unknown>;
  passage: { id: string; title: string; content: string } | null;
  questions: Array<Record<string, unknown>>;
}>;

const OUT = join(BASE, "eval-jul17-prod");
mkdirSync(join(OUT, "blind"), { recursive: true });
mkdirSync(join(OUT, "full"), { recursive: true });
mkdirSync(join(OUT, "reviews"), { recursive: true });

const RENDER_FIELDS = ["passageWithMarkers", "passageWithBlank", "passageWithUnderline", "passageWithNumbers", "passage"];

type Row = {
  jobId: string; plan: string; type: string; difficulty: string;
  costKrw: number; calls: number; questionId: string;
  passageTitle: string; passageText: string;
  q: Record<string, unknown>; sd: Record<string, unknown>;
};

const rows: Row[] = [];
for (const entry of batch) {
  if (entry.job.status !== "COMPLETED") continue;
  for (const q of entry.questions) {
    const sd = typeof q.structuredData === "string" ? JSON.parse(q.structuredData as string) : (q.structuredData as Record<string, unknown>) ?? {};
    rows.push({
      jobId: String(entry.job.id), plan: String(entry.job.plan), type: String(entry.job.type),
      difficulty: String(entry.job.difficulty), costKrw: Number(entry.job.costKrw), calls: Number(entry.job.calls),
      questionId: String(q.id), passageTitle: entry.passage?.title ?? "?", passageText: entry.passage?.content ?? "",
      q, sd,
    });
  }
}

// 결정형 셔플 (seed 고정 LCG) — pid 에서 plan/type 추측 불가하게.
let seed = 20260717;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (let i = rows.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [rows[i], rows[j]] = [rows[j]!, rows[i]!];
}

const renderedPassage = (sd: Record<string, unknown>): string | null => {
  for (const f of RENDER_FIELDS) {
    const v = sd[f];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
};
const fmtOptions = (q: Record<string, unknown>, sd: Record<string, unknown>): string => {
  let opts: unknown = sd.options ?? q.options;
  if (typeof opts === "string") { try { opts = JSON.parse(opts); } catch { /* keep */ } }
  if (!Array.isArray(opts)) return "(선지 없음)";
  return opts.map((o) => (typeof o === "object" && o !== null ? `${(o as { label?: string }).label ?? ""} ${(o as { text?: string }).text ?? ""}` : String(o))).join("\n");
};
const j = (v: unknown) => (v == null ? "(없음)" : JSON.stringify(v, null, 1));

const key: Record<string, unknown> = {};
rows.forEach((r, i) => {
  const pid = `J${String(i + 1).padStart(3, "0")}`;
  const rp = renderedPassage(r.sd) ?? r.passageText;
  const direction = (r.sd.direction as string) ?? (typeof r.q.questionText === "string" ? (r.q.questionText as string).split("\n")[0] : "(발문 없음)");
  writeFileSync(join(OUT, "blind", `${pid}.md`), `# 문항 ${pid}

## 지문
${rp}

## 발문
${direction}

## 선택지
${fmtOptions(r.q, r.sd)}
`, "utf8");
  writeFileSync(join(OUT, "full", `${pid}.md`), `# 문항 ${pid} — 전체 정보 (validity/craft 감사용)

## 요청 난이도
${r.difficulty}

## 유형
${r.type}

## 원지문 (변형 전)
${r.passageText}

## 렌더된 지문 (학생에게 보이는 형태)
${rp}

## 발문
${direction}

## 선택지
${fmtOptions(r.q, r.sd)}

## 선언된 정답
${String(r.sd.correctAnswer ?? r.q.correctAnswer)}

## 해설
${String(r.sd.explanation ?? r.q.explanation ?? "(없음)")}

## 오답 해설
${j(r.sd.wrongOptionExplanations)}

## keyPoints
${j(r.sd.keyPoints)}

## markedExpressions / 구조 필드
${j(r.sd.markedExpressions)}
`, "utf8");
  key[pid] = {
    jobId: r.jobId, questionId: r.questionId, plan: r.plan, subType: r.type,
    difficulty: r.difficulty, costKrw: r.costKrw, calls: r.calls,
    passageTitle: r.passageTitle,
    correctAnswer: r.sd.correctAnswer ?? r.q.correctAnswer,
    qualityWarnings: r.sd._qualityWarnings ?? null,
    explanationRepaired: r.sd._explanationRepaired ?? null,
    reviewRecommended: r.sd._reviewRecommended ?? null,
  };
});
writeFileSync(join(OUT, "key.json"), JSON.stringify(key, null, 1), "utf8");
console.log(`packets: ${rows.length} → ${OUT}`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(key).map(([pid, v]) => [pid, `${(v as Record<string, unknown>).plan}/${(v as Record<string, unknown>).subType} ${(v as Record<string, unknown>).costKrw}원`])), null, 1));
