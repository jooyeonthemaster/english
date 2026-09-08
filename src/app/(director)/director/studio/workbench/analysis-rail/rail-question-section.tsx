"use client";

// ============================================================================
// 레일 S4 「문항」 — 문항 1장 = 원문 + 분석(26-09-03 통합).
//
// 26-09-02 까지는 [문항](perQuestion 분석)과 [전문](INTERNAL 원문)이 별개 탭이라,
// 같은 번호의 아코디언 목록이 두 벌 떠서 "중복 아니냐"는 실사용 지적을 받았다.
// 실제로는 상보 관계(원문 vs 그 원문에 대한 AI 분석)였을 뿐이므로 **탭을 합치고
// 카드 안에서 위아래로 잇는다** — 문제를 보려고 탭을 오가는 순례를 없앤다.
// 비INTERNAL(사진 업로드)은 원문 DB 가 없어 [원본] 탭(사진)이 그대로 남는다.
//
// QuestionAnalysisCard(허브)는 편집·검수·재분석 콜백 5개가 필수 계약이라 그대로
// 이식하지 않는다(적대검수 R3 §2 — 읽기전용 레일에 과잉). 별·매력도 점은
// 원본이 모듈 프라이빗(export 없음 — V1-m1)이라 12px 레일 스케일로 축소 사본.
//
// 45문항 규모 방어(적대검수 V2-M3): 난이도 버킷 필터 칩(전체/쉬움≤2/보통3/
// 어려움4/킬러5 + 정답 확인 필요) — 접힘 헤더만으로 ~2,600px 가 되는 스크롤
// 순례를 필터로 자른다. 카드 아코디언은 로컬 상태(참조성 UI — 인스턴스별
// 갈림 무해, 페치 없음이라 2중 마운트 안전).
//
// 원문 지연 페치는 셸 훅 소유(ensureReviewQuestions — 분석당 1회 dedup, 실패 시
// 자동 재시도 금지). 여기선 deps 에 안정 콜백 1개만 건다(무한 GET 루프 차단,
// U5-correctness-1 이 원본 rail-source-section 에서 실측했던 함정).
//
// trapDesign 은 표 금지(296px 플로어에서 "이유" 셀 세로 폭주) — 선지별 2줄
// 스택(칩+매력도 / 이유 문단)으로 재조판.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, CircleAlert, Loader2, RotateCw, Star } from "lucide-react";
import type {
  ExamMapEntry,
  QuestionAnalysis,
} from "@/lib/exam-report/types";
import type { ExamReviewQuestion } from "@/components/exam-report/ui-contracts";
import { cn } from "@/lib/utils";
import type { AnalysisConsoleApi } from "./use-analysis-console";

// 원본 question-analysis-card.tsx 의 프라이빗 렌더 축소 사본(12px 스케일).
function DifficultyStars({ level }: { level: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-px"
      title={`난이도 ${level}/5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "size-3",
            i <= level ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200",
          )}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function AttractivenessDots({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5"
      title={`매력도 ${level}/3`}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full",
            i <= level ? "bg-rose-400" : "bg-slate-200",
          )}
        />
      ))}
    </span>
  );
}

type BucketKey = "all" | "easy" | "medium" | "hard" | "killer" | "check";

const BUCKETS: { key: BucketKey; label: string; active: string }[] = [
  { key: "all", label: "전체", active: "border-slate-900 bg-slate-900 text-white" },
  { key: "easy", label: "쉬움", active: "border-emerald-600 bg-emerald-600 text-white" },
  { key: "medium", label: "보통", active: "border-blue-600 bg-blue-600 text-white" },
  { key: "hard", label: "어려움", active: "border-amber-600 bg-amber-600 text-white" },
  { key: "killer", label: "킬러", active: "border-rose-600 bg-rose-600 text-white" },
  { key: "check", label: "확인 필요", active: "border-amber-500 bg-amber-500 text-white" },
];

/** 목록 1행 — 분석·원문·지도 항목의 번호 조인 결과(셋 다 옵셔널일 수 있다). */
interface QuestionRow {
  number: string;
  analysis: QuestionAnalysis | null;
  entry: ExamMapEntry | null;
  review: ExamReviewQuestion | null;
}

/** 「정답 확인 필요」 버킷 술어 — 미분석(FAILED) 또는 정답 확신도 LOW. */
function needsCheck(r: QuestionRow): boolean {
  return (
    r.analysis?.analysisStatus === "FAILED" ||
    !!(r.entry?.correctAnswer && r.entry.answerConfidence === "LOW")
  );
}

function bucketOf(a: QuestionAnalysis): Exclude<BucketKey, "all" | "check"> {
  if (a.difficulty <= 2) return "easy";
  if (a.difficulty === 3) return "medium";
  if (a.difficulty === 4) return "hard";
  return "killer";
}

/** 라벨 붙은 서술 블록 — 값이 비면 통째 생략. */
function TextBlock({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="whitespace-pre-wrap break-keep text-[12px] leading-relaxed text-slate-600">
        {value}
      </p>
    </div>
  );
}

/** ExamReviewQuestion.options 는 JSON 문자열 — 깨진 값은 조용히 빈 배열. */
function parseOptions(raw: string | null): { label: string; text: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (o): o is { label: string; text: string } =>
          !!o && typeof o === "object" && "label" in o && "text" in o,
      )
      .map((o) => ({ label: String(o.label), text: String(o.text) }));
  } catch {
    return [];
  }
}

/** 문항 원문(INTERNAL 전용) — 구 [전문] 탭의 본문을 카드 안으로 옮긴 것.
 *  분석보다 위에 둔다(문제를 먼저 읽고 해설을 읽는 순서). 지문은 길어서
 *  접어 시작 — 카드 하나가 레일 스크롤을 삼키지 않게. */
function QuestionSourceBlock({ review }: { review: ExamReviewQuestion }) {
  const [showPassage, setShowPassage] = useState(false);
  const options = useMemo(() => parseOptions(review.options), [review.options]);
  return (
    <div className="min-w-0 space-y-2 rounded-md border border-slate-200 bg-white px-2.5 py-2">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
        문항 원문
      </p>
      <p className="whitespace-pre-wrap break-keep text-[12px] leading-relaxed text-slate-700">
        {review.questionText}
      </p>
      {options.length > 0 ? (
        <ol className="space-y-1">
          {options.map((o) => (
            <li
              key={o.label}
              className="flex min-w-0 items-start gap-1.5 text-[12px] leading-relaxed text-slate-600"
            >
              <span className="shrink-0 font-semibold text-slate-400">
                {o.label}
              </span>
              <span className="min-w-0 break-keep">{o.text}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {review.passage ? (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setShowPassage((v) => !v)}
            className="cursor-pointer text-[11px] font-medium text-blue-600 underline-offset-2 transition-colors hover:text-blue-700 hover:underline"
          >
            {showPassage ? "지문 접기" : "지문 보기"}
          </button>
          {showPassage ? (
            <p className="mt-1.5 max-h-64 overflow-y-auto overscroll-contain whitespace-pre-wrap break-keep rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-[12px] leading-relaxed text-slate-600">
              {review.passage.content}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** 문항 카드 — analysis 는 옵셔널이다(원문은 있는데 분석이 아직 없는 문항도
 *  같은 골격으로 뜬다. 구 [전문] 탭이 담당하던 상태 — 탭을 합치며 흡수). */
function QuestionCard({
  number,
  entry,
  analysis,
  review,
}: {
  number: string;
  entry: ExamMapEntry | null;
  analysis: QuestionAnalysis | null;
  review: ExamReviewQuestion | null;
}) {
  const [open, setOpen] = useState(false);
  const failed = analysis?.analysisStatus === "FAILED";
  const lowAnswer = entry?.correctAnswer && entry.answerConfidence === "LOW";
  const summary =
    entry?.brief || analysis?.typeLabel || review?.questionText || `${number}번`;
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex w-full min-w-0 cursor-pointer items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-slate-50",
          open && "bg-slate-50",
        )}
      >
        <span
          className="min-w-7 max-w-[4.5rem] shrink-0 truncate rounded bg-slate-100 px-1 py-0.5 text-center text-[11px] font-semibold tabular-nums text-slate-600"
          title={`${number}번`}
        >
          {number}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[12px] text-slate-600"
          title={summary}
        >
          {summary}
        </span>
        {failed ? (
          <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200/60">
            미분석
          </span>
        ) : analysis ? (
          <DifficultyStars level={analysis.difficulty} />
        ) : null}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-slate-400 transition-transform group-hover:text-slate-600",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-slate-100 px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-1">
            {analysis ? (
              <span className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-px text-[10.5px] font-medium text-slate-600">
                {analysis.typeLabel}
              </span>
            ) : null}
            {review?.setLabel ? (
              <span className="max-w-full truncate whitespace-nowrap rounded bg-slate-100 px-1.5 py-px text-[10.5px] font-medium text-slate-500">
                {review.setLabel}
              </span>
            ) : null}
            {entry?.points != null ? (
              <span className="whitespace-nowrap rounded bg-amber-50 px-1.5 py-px text-[10.5px] font-semibold tabular-nums text-amber-700">
                {entry.points}점
              </span>
            ) : null}
            {entry?.correctAnswer ? (
              <span
                className={cn(
                  "min-w-0 max-w-full truncate whitespace-nowrap rounded px-1.5 py-px text-[10.5px] font-semibold tabular-nums",
                  lowAnswer
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700",
                )}
                title={`정답 ${entry.correctAnswer}${lowAnswer ? " (확신도 낮음 — 확인 필요)" : ""}`}
              >
                정답 {entry.correctAnswer}
                {lowAnswer ? " · 확인 필요" : ""}
              </span>
            ) : null}
          </div>
          {review ? <QuestionSourceBlock review={review} /> : null}
          {failed ? (
            <p className="flex items-start gap-1.5 break-keep rounded-md bg-rose-50 px-2.5 py-2 text-[12px] leading-relaxed text-rose-600">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              이 문항은 분석에 실패했어요. 전체 워크스페이스에서 무료로 재분석할
              수 있습니다.
            </p>
          ) : analysis ? (
            <>
              <TextBlock label="해설" value={analysis.explanation} />
              {analysis.intent?.trim() ||
              analysis.examPoint?.trim() ||
              analysis.solvingStrategy?.trim() ? (
                <div className="min-w-0 space-y-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2">
                  <TextBlock label="출제 의도" value={analysis.intent} />
                  <TextBlock label="출제 포인트" value={analysis.examPoint} />
                  <TextBlock label="접근 전략" value={analysis.solvingStrategy} />
                </div>
              ) : null}
              {analysis.keyConcepts.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {analysis.keyConcepts.map((c) => (
                    <span
                      key={c}
                      className="whitespace-nowrap rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : null}
              {analysis.trapDesign && analysis.trapDesign.length > 0 ? (
                <div className="min-w-0">
                  <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                    오답 함정 설계
                  </p>
                  <div className="divide-y divide-slate-100 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1">
                    {analysis.trapDesign.map((t) => (
                      <div key={t.choice} className="min-w-0 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 rounded bg-white px-1.5 py-px text-[10.5px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200">
                            {t.choice}번
                          </span>
                          <AttractivenessDots level={t.attractiveness} />
                        </div>
                        <p className="mt-1 break-keep text-[12px] leading-relaxed text-slate-600">
                          {t.why}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RailQuestionSection({
  perQuestion,
  mapEntries,
  isInternal,
  console: api,
}: {
  perQuestion: QuestionAnalysis[];
  mapEntries: ExamMapEntry[];
  /** INTERNAL 만 원문 DB 재사용 가능(비INTERNAL 은 사진 → [원본] 탭 소관). */
  isInternal: boolean;
  console: AnalysisConsoleApi;
}) {
  const [bucket, setBucket] = useState<BucketKey>("all");
  const entryByNumber = useMemo(
    () => new Map(mapEntries.map((e) => [e.number, e])),
    [mapEntries],
  );

  // 원문 지연 페치 — 셸 훅이 분석당 1회 dedup(aside·드로어 2중 마운트 안전).
  // deps 는 안정 콜백 하나만: api 객체 전체를 걸면 렌더마다 재실행되고 실패
  // 전이가 곧 재페치가 되어 무한 GET 루프가 된다(U5-correctness-1).
  const { ensureReviewQuestions } = api;
  useEffect(() => {
    if (isInternal) ensureReviewQuestions();
  }, [isInternal, ensureReviewQuestions]);

  // number(=String(orderNum))는 examMap·perQuestion·원문 페이로드가 공유하는
  // 조인 키다(internal-analysis.ts / review-questions.ts 동일 산출).
  const reviewByNumber = useMemo(() => {
    if (!isInternal) return null;
    const items = api.reviewQuestions?.items;
    return items ?? null;
  }, [isInternal, api.reviewQuestions]);

  // ── 행 스파인 ───────────────────────────────────────────────────────────
  // 분석(perQuestion)을 기준으로 잡되, INTERNAL 에서 아직 분석이 없는 문항은
  // 원문만으로 행을 세운다(구 [전문] 탭이 담당하던 상태 — 탭 통합으로 흡수).
  // 정렬은 examMap.order → 없으면 번호 수치.
  const rows = useMemo<QuestionRow[]>(() => {
    const byNumber = new Map<string, QuestionAnalysis>();
    for (const a of perQuestion) byNumber.set(a.number, a);
    const numbers = new Set<string>(byNumber.keys());
    if (reviewByNumber) for (const n of Object.keys(reviewByNumber)) numbers.add(n);
    return [...numbers]
      .map((number) => ({
        number,
        analysis: byNumber.get(number) ?? null,
        entry: entryByNumber.get(number) ?? null,
        review: reviewByNumber?.[number] ?? null,
      }))
      .sort((a, b) => {
        const ao = a.entry?.order ?? Number(a.number);
        const bo = b.entry?.order ?? Number(b.number);
        if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo)
          return ao - bo;
        return a.number.localeCompare(b.number, "ko");
      });
  }, [perQuestion, entryByNumber, reviewByNumber]);

  const counts = useMemo(() => {
    const c: Record<BucketKey, number> = {
      all: rows.length,
      easy: 0,
      medium: 0,
      hard: 0,
      killer: 0,
      check: 0,
    };
    for (const r of rows) {
      if (r.analysis) c[bucketOf(r.analysis)] += 1;
      if (needsCheck(r)) c.check += 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    if (bucket === "all") return rows;
    if (bucket === "check") return rows.filter(needsCheck);
    return rows.filter((r) => r.analysis && bucketOf(r.analysis) === bucket);
  }, [rows, bucket]);

  if (rows.length === 0) {
    return (
      <p className="break-keep rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[12px] leading-relaxed text-slate-400">
        {isInternal && api.reviewPhase === "loading"
          ? "문항을 불러오는 중입니다"
          : "문항 분석 대기 중입니다"}
      </p>
    );
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap gap-1">
        {BUCKETS.map((b) =>
          counts[b.key] > 0 || b.key === "all" ? (
            <button
              key={b.key}
              type="button"
              onClick={() => setBucket(b.key)}
              className={cn(
                "h-6 cursor-pointer whitespace-nowrap rounded-full border px-2 text-[11px] font-medium tabular-nums transition-colors",
                bucket === b.key
                  ? b.active
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
              )}
            >
              {b.label} {counts[b.key]}
            </button>
          ) : null,
        )}
      </div>
      {isInternal && api.reviewPhase === "loading" ? (
        <div className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-400">
          <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
          문항 원문을 불러오는 중...
        </div>
      ) : isInternal && api.reviewPhase === "error" ? (
        <button
          type="button"
          onClick={() => api.ensureReviewQuestions(true)}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          <RotateCw className="size-3 shrink-0" aria-hidden="true" />
          원문을 불러오지 못했어요 — 다시 시도
        </button>
      ) : null}
      <div className="space-y-2">
        {filtered.map((r) => (
          <QuestionCard
            key={r.number}
            number={r.number}
            entry={r.entry}
            analysis={r.analysis}
            review={r.review}
          />
        ))}
      </div>
    </div>
  );
}
