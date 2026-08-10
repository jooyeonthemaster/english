"use client";

// ============================================================================
// 학생 시험 리포트 — 스텝 3: 분석 (AI 0콜 학습 분석 허브)
//
// 채점(정오표)과 완전히 분리된 읽기 전용 분석 화면. 이미 수집된 데이터만으로
// (1) 응시 메타(언제 봤고·언제까지였고·기한 준수) + 점수 히어로
// (2) 문항별 결과 그리드(강박적 필터 + 원본 문항 상세보기)
// (3) 취약 하이라이트(가장 취약한 유형·지문·개념)
// (4) 다차원 취약점 분해(유형/난이도/지문/개념 × 정렬)
// (5) AI 상담 리포트 게이트웨이(5크레딧 명시 — 생성 자체는 AI 리포트 스텝)
// 를 그린다. LLM 호출 0회 — 전부 저장/재조회 데이터의 순수 변환.
//
// 순서 계약(spec §9.1): 요약(히어로) 바로 아래가 「문항별 결과」다. 사용자는
// 점수를 본 직후 "어느 문항을 틀렸나"를 찾는데, 집계 카드(하이라이트·분해)가
// 그 사이를 가로막고 있었다. 집계는 문항 목록 뒤에서 "왜 틀렸나"를 설명한다.
// ============================================================================

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { computeScoreSummary } from "@/lib/exam-report/grading";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { scoreText } from "@/components/students/hub/analytics/kit";
import {
  buildVariantGenerateHref,
  filterVariantQuestions,
  parseChoiceOptions,
  resolveChoiceDisplay,
  saveVariantSeed,
  type VariantSeedQuestion,
} from "@/lib/question-variant";
import { VARIANT_DISABLED_REASONS } from "@/lib/wording/director-glossary";
import type { StudentResponse } from "@/lib/exam-report/types";
import type {
  ExamAnalysisDetail,
  ExamReviewPayload,
  ExamStudentDetail,
} from "../ui-contracts";
import { choiceToCircled, numberKey, orderedQuestions } from "./grading-shared";
import { HeroCard, pctText } from "./analysis-hero";
import {
  buildAnalysisRowMetas,
  computeWeaknessBreakdown,
  parseTags,
  type WeaknessBucket,
} from "./grading-weakness";
import { AnalysisBreakdown, type BucketQuestionInfo } from "./analysis-breakdown";
import { AnalysisQuestionGrid } from "./analysis-question-grid";
import { QuestionDetailView } from "./question-detail-view";

/**
 * 변형 CTA 가 원본 재조회를 기다리는 동안의 사유 문구.
 * 문항 상세(question-detail-view)와 같은 문장을 쓴다 — 같은 상태를 두 표면이
 * 다른 말로 설명하면 사용자는 다른 원인이라고 읽는다.
 */
const REVIEW_LOADING_TEXT = "원본 문항을 불러오는 중…";

interface AnalysisStepProps {
  detail: ExamAnalysisDetail;
  student: ExamStudentDetail;
  /** 로컬 편집 반영 응답(useVerdictState) — 채점 직후 분석이 즉시 갱신된다. */
  responses: StudentResponse[];
  gradingConfirmed: boolean;
  reviewPayload: ExamReviewPayload | null;
  reviewLoading: boolean;
  reviewError: boolean;
  onRetryReview?: () => void;
  onGoVerdict: () => void;
  onGoReport: () => void;
}

export function AnalysisStep({
  detail,
  student,
  responses,
  gradingConfirmed,
  reviewPayload,
  reviewLoading,
  reviewError,
  onRetryReview,
  onGoVerdict,
  onGoReport,
}: AnalysisStepProps) {
  const router = useRouter();
  const [detailNumber, setDetailNumber] = useState<string | null>(null);

  const examMap = detail.examMap!; // 부모(Workspace)가 examMapReady 로 게이트
  const perQuestion = detail.analysis?.perQuestion ?? null;
  const reviewItems = reviewPayload?.items ?? null;
  const detailAvailable = reviewPayload?.detailAvailable ?? false;

  const ordered = useMemo(() => orderedQuestions(examMap), [examMap]);
  const summary = useMemo(
    () => computeScoreSummary(examMap, responses),
    [examMap, responses],
  );
  const weakness = useMemo(
    () =>
      computeWeaknessBreakdown({
        examMap,
        responses,
        perQuestion,
        reviewItems,
      }),
    [examMap, responses, perQuestion, reviewItems],
  );
  const metas = useMemo(
    () =>
      buildAnalysisRowMetas({
        orderedEntries: ordered,
        responses,
        perQuestion,
        reviewItems,
      }),
    [ordered, responses, perQuestion, reviewItems],
  );
  const statusByNumber = useMemo(
    () => new Map(metas.map((m) => [m.number, m.status])),
    [metas],
  );
  const responseByNumber = useMemo(
    () => new Map(responses.map((r) => [r.number, r])),
    [responses],
  );
  const perQuestionByNumber = useMemo(
    () => new Map((perQuestion ?? []).map((p) => [numberKey(p.number), p])),
    [perQuestion],
  );

  // 분해 버킷 펼침 행 재료 — 문항별 학생답→정답·획득점(전부 이미 로드된 데이터).
  const questionInfoByNumber = useMemo(() => {
    const map = new Map<string, BucketQuestionInfo>();
    for (const entry of ordered) {
      const r = responseByNumber.get(entry.number);
      const status = r?.status ?? "UNKNOWN";
      const choice = r?.chosenChoice ?? r?.aiRead?.chosenChoice ?? null;
      const written = r?.studentAnswer ?? r?.aiRead?.writtenAnswer ?? null;
      const studentText =
        entry.kind === "MC"
          ? choice
            ? choiceToCircled(choice)
            : null
          : written || null;
      const correctText =
        entry.correctAnswer == null || entry.correctAnswer === ""
          ? "—"
          : entry.kind === "MC"
            ? choiceToCircled(entry.correctAnswer)
            : entry.correctAnswer;
      const earnedPoints =
        status === "CORRECT"
          ? entry.points
          : status === "PARTIAL"
            ? r?.earnedPoints ?? 0
            : status === "WRONG"
              ? 0
              : null;
      map.set(entry.number, {
        number: entry.number,
        typeLabel: entry.typeLabel || "기타",
        kind: entry.kind,
        points: entry.points,
        status,
        studentText,
        correctText,
        earnedPoints,
      });
    }
    return map;
  }, [ordered, responseByNumber]);

  // 지문별 버킷 펼침 시 발췌 노출용 — passageId → 지문 전문(첫 항목 승자).
  const passageExcerptById = useMemo(() => {
    const map = new Map<string, string>();
    if (reviewItems) {
      for (const item of Object.values(reviewItems)) {
        const pid = item.passageId ?? item.passage?.id ?? null;
        if (pid && item.passage?.content && !map.has(pid)) {
          map.set(pid, item.passage.content);
        }
      }
    }
    return map;
  }, [reviewItems]);

  const graded = weakness.overall.graded;

  // ── (spec §8.3) 오답 일괄 변형 — 이 표면이 R8 진입점 4개 중 하나다 ──────────
  // 오답+부분점수 문항을 「같은 지문·같은 유형의 새 문항」 생성으로 통째로 넘긴다.
  // 시드 조립 규칙은 응시 상세 모달(submission-detail-modal)의 bulkVariant 와 동일하게
  // 맞춘다 — 두 진입점이 같은 모양의 시드를 만들어야 생성 페이지 수신부가 한 벌로 끝난다.
  const wrongVariantSeeds = useMemo<VariantSeedQuestion[]>(() => {
    const briefByNumber = new Map(ordered.map((e) => [e.number, e.brief]));
    return metas
      .filter((m) => m.status === "WRONG" || m.status === "PARTIAL")
      .map((m) => {
        const review = reviewItems?.[m.number] ?? null;
        const info = questionInfoByNumber.get(m.number) ?? null;
        // 선지 표기 통일 — 리포트 채점축("3")·문항 원본축("(C)")·화면 렌더축(③)이
        // 서로 다르다. 원본 선지 목록으로 위치를 확정해 「③ which」 형태로 굳혀야
        // 컨텍스트 스트립·원본 모달·생성 프롬프트가 한 언어를 쓴다(2026-07-26 실측).
        const choices = parseChoiceOptions(review?.options);
        return {
          questionId: review?.questionId ?? `entry-${m.number}`,
          orderLabel: `${m.number}번`,
          // 카탈로그 밖 유형(원본 미조회 포함)은 빈 문자열 → UNSUPPORTED_TYPE 판정
          subType: m.subType ?? "",
          typeLabel: m.typeLabel,
          difficulty: review?.difficulty ?? m.difficultyKey ?? null,
          // 세트 문항은 passageId 가 null 이고 공유지문이 passage 에 실려 온다
          passageId: m.passageId ?? "",
          passageTitle: m.passageLabel,
          questionText: review?.questionText ?? briefByNumber.get(m.number) ?? null,
          correctText:
            resolveChoiceDisplay(review?.correctAnswer ?? info?.correctText, choices) ?? null,
          studentText: resolveChoiceDisplay(info?.studentText, choices) ?? null,
          keyPoints: parseTags(review?.explanation?.keyPoints),
        };
      });
  }, [metas, ordered, reviewItems, questionInfoByNumber]);

  const bulkVariant = useMemo(
    () => filterVariantQuestions(wrongVariantSeeds),
    [wrongVariantSeeds],
  );

  // 로스터 귀속 학생 id — 생성 후 「과제 보내기」 프리셀렉트 축(?student=).
  // 구 자유입력 데이터는 null 이고, 그때는 딥링크에 student 가 빠진다.
  const rosterStudentId =
    detail.students.find((s) => s.id === student.id)?.studentId ?? null;

  const openBulkVariant = useCallback(() => {
    if (bulkVariant.reason || bulkVariant.usable.length === 0) {
      toast.error(VARIANT_DISABLED_REASONS[bulkVariant.reason ?? "NO_QUESTIONS"]);
      return;
    }
    // 리치 시드는 sessionStorage, 지문·유형·난이도는 URL — 이중화라 시드가 유실돼도
    // 생성 페이지 프리필은 살아남는다(§8.2).
    const seedId = saveVariantSeed({
      origin: "exam-report",
      studentId: rosterStudentId,
      studentName: student.studentName,
      examTitle: detail.title,
      createdAt: new Date().toISOString(),
      questions: bulkVariant.usable,
    });
    const from =
      typeof window === "undefined"
        ? undefined
        : window.location.pathname + window.location.search;
    router.push(
      buildVariantGenerateHref({
        seedId,
        questions: bulkVariant.usable,
        studentId: rosterStudentId,
        from,
      }),
    );
  }, [bulkVariant, rosterStudentId, student.studentName, detail.title, router]);

  // 원본 재조회가 아직 안 끝났으면 passageId·subType 이 비어 「원본 지문 없음」으로
  // 판정된다 — 그건 사실이 아니라 타이밍이다. 로딩을 먼저 말한다(거짓 사유 금지).
  const bulkVariantBlockedText = reviewLoading
    ? REVIEW_LOADING_TEXT
    : bulkVariant.reason
      ? VARIANT_DISABLED_REASONS[bulkVariant.reason]
      : null;

  // ── 상세보기 모달 해소(전 문항 축 네비) ──
  const detailIndex = detailNumber
    ? ordered.findIndex((e) => e.number === detailNumber)
    : -1;
  const detailEntry = detailIndex >= 0 ? ordered[detailIndex] : null;
  const detailResponse: StudentResponse | null = detailEntry
    ? responseByNumber.get(detailEntry.number) ??
      ({
        number: detailEntry.number,
        status: "UNKNOWN",
        source: "MANUAL",
        reviewed: false,
      } as StudentResponse)
    : null;

  // ── 취약 하이라이트(채점 2문항 이상 버킷 중 정답률 최저) ──
  const pickWeakest = (buckets: WeaknessBucket[]) =>
    buckets.find((b) => b.graded >= 2 && (b.accuracy ?? 1) < 1) ?? null;
  const weakestType = pickWeakest(weakness.byType);
  const weakestPassage = detailAvailable ? pickWeakest(weakness.byPassage) : null;
  const weakestConcept = pickWeakest(weakness.byConcept);
  const highlights = [
    weakestType && { title: "가장 취약한 유형", bucket: weakestType },
    weakestPassage && { title: "가장 취약한 지문", bucket: weakestPassage },
    weakestConcept && { title: "보강할 개념", bucket: weakestConcept },
  ].filter(Boolean) as { title: string; bucket: WeaknessBucket }[];

  return (
    <div className="flex flex-col gap-4">
      {/* ── (1) 응시 메타 + 점수 히어로 ── */}
      <HeroCard
        student={student}
        isInternal={(detail.sourceType as string) === "INTERNAL"}
        summary={summary}
        graded={graded}
        totalQuestions={weakness.overall.total}
        gradingConfirmed={gradingConfirmed}
        onGoVerdict={onGoVerdict}
      />

      {graded === 0 ? (
        /* 채점 전 — 분석 재료가 없다. 채점으로 안내(빈 차트 나열 금지).
           이 분기에서는 아래 (5) 리포트 게이트웨이도 함께 감춘다: 게이트웨이의
           미확정 상태 CTA 도 목적지가 「채점」이라, 같은 곳으로 가는 버튼 두 개가
           세로로 겹쳐 나오고 있었다(spec §9.2). */
        <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
          <PenLine className="size-7 text-slate-300" aria-hidden />
          <div>
            <p className="text-[13.5px] font-semibold text-slate-600 break-keep">
              아직 채점된 문항이 없습니다.
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-400 break-keep">
              채점을 진행하면 유형·지문·개념별 취약점이 이 화면에 집계됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoVerdict}
            className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            채점하러 가기
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      ) : (
        <>
          {/* ── (2) 문항별 결과 그리드 — 요약 바로 아래(spec §9.1) ── */}
          <AnalysisQuestionGrid
            metas={metas}
            detailAvailable={detailAvailable}
            reviewLoading={reviewLoading}
            reviewError={reviewError}
            onRetryReview={onRetryReview}
            onSelectQuestion={setDetailNumber}
            onBulkVariant={openBulkVariant}
            bulkVariantCount={bulkVariant.usable.length}
            bulkVariantDisabledReason={bulkVariantBlockedText}
          />

          {/* ── (3) 취약 하이라이트 ── */}
          {highlights.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {highlights.map(({ title, bucket }) => (
                <HighlightCard
                  key={title}
                  title={title}
                  bucket={bucket}
                  onSelectQuestion={setDetailNumber}
                />
              ))}
            </div>
          )}

          {/* ── (4) 다차원 분해 ── */}
          <AnalysisBreakdown
            breakdown={weakness}
            statusByNumber={statusByNumber}
            questionInfo={questionInfoByNumber}
            passageExcerptById={passageExcerptById}
            detailAvailable={detailAvailable}
            reviewLoading={reviewLoading}
            reviewError={reviewError}
            onRetryReview={onRetryReview}
            onSelectQuestion={setDetailNumber}
          />

          {/* ── (5) AI 상담 리포트 게이트웨이 — 채점분이 있을 때만(§9.2) ── */}
          <ReportGatewayCard
            student={student}
            gradingConfirmed={gradingConfirmed}
            onGoVerdict={onGoVerdict}
            onGoReport={onGoReport}
          />
        </>
      )}

      {/* 문항 상세보기 모달(원본 문항 + 학생답 + 해설) */}
      {detailEntry && detailResponse && (
        <QuestionDetailView
          entry={detailEntry}
          response={detailResponse}
          analysis={perQuestionByNumber.get(numberKey(detailEntry.number)) ?? null}
          review={reviewItems?.[detailEntry.number] ?? null}
          reviewLoading={reviewLoading && reviewItems == null}
          reviewSource={reviewPayload?.source ?? null}
          reviewError={reviewError}
          onRetry={onRetryReview}
          position={{ index: detailIndex, total: ordered.length }}
          hasPrev={detailIndex > 0}
          hasNext={detailIndex >= 0 && detailIndex < ordered.length - 1}
          onPrev={() =>
            detailIndex > 0 && setDetailNumber(ordered[detailIndex - 1].number)
          }
          onNext={() =>
            detailIndex >= 0 &&
            detailIndex < ordered.length - 1 &&
            setDetailNumber(ordered[detailIndex + 1].number)
          }
          onClose={() => setDetailNumber(null)}
          // 변형 딥링크에 ?student= 를 싣고 시드에 학생·시험 이름을 넣는다.
          // 안 넘기면 「생성한 문항을 바로 과제로 보낼 수 있습니다」 안내가 거짓이 된다.
          studentId={rosterStudentId}
          studentName={student.studentName}
          examTitle={detail.title}
        />
      )}
    </div>
  );
}

// ── (3) 하이라이트 카드 ──────────────────────────────────────────────────────

function HighlightCard({
  title,
  bucket,
  onSelectQuestion,
}: {
  title: string;
  bucket: WeaknessBucket;
  onSelectQuestion: (number: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* 제목·오답 카운트는 칩이 아니라 읽어야 하는 평문 — 스펙 §1.1 하한(11px 이상). */}
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {title}
      </span>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="truncate text-[15px] font-bold text-slate-900"
          title={bucket.label}
        >
          {bucket.label}
        </span>
        <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-slate-400">
          정답률{" "}
          {/* 값 무관 rose 고정이었다 — 같은 50% 가 이 카드에서만 붉게 보였다.
              점수 톤은 불변 계약(§1.1)이라 값 기반(scoreText)으로 되돌린다.
              '취약'이라는 신호는 상단 라벨과 아래 스택바가 이미 담당한다. */}
          <span
            className={cn(
              "text-[13px] font-extrabold tabular-nums",
              bucket.accuracy == null
                ? "text-slate-400"
                : scoreText(bucket.accuracy * 100),
            )}
          >
            {pctText(bucket.accuracy)}
          </span>
        </span>
      </div>
      {/* 스택바 — 숫자(정답률)와 동일 분모(graded): 정답 emerald / 부분 blue / 오답 rose. */}
      <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100">
        {bucket.graded > 0 && (
          <>
            <div
              className="bg-emerald-500"
              style={{ width: `${(bucket.correct / bucket.graded) * 100}%` }}
            />
            <div
              className="bg-blue-500"
              style={{ width: `${(bucket.partial / bucket.graded) * 100}%` }}
            />
            <div
              className="bg-rose-500"
              style={{ width: `${(bucket.wrong / bucket.graded) * 100}%` }}
            />
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] font-semibold tabular-nums text-slate-400">
          오답 {bucket.wrong}/{bucket.graded}
        </span>
        {bucket.wrongNumbers.slice(0, 6).map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onSelectQuestion(num)}
            className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded border border-rose-200 bg-white px-1 text-[10.5px] font-bold tabular-nums text-rose-600 transition-colors hover:bg-rose-50"
          >
            {num}
          </button>
        ))}
        {bucket.wrongNumbers.length > 6 && (
          <span className="text-[10.5px] font-semibold text-slate-400">
            +{bucket.wrongNumbers.length - 6}
          </span>
        )}
      </div>
    </section>
  );
}

// ── (5) AI 리포트 게이트웨이 ─────────────────────────────────────────────────

function ReportGatewayCard({
  student,
  gradingConfirmed,
  onGoVerdict,
  onGoReport,
}: {
  student: ExamStudentDetail;
  gradingConfirmed: boolean;
  onGoVerdict: () => void;
  onGoReport: () => void;
}) {
  const status = student.reportStatus;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-5">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-[14.5px] font-bold text-slate-900">AI 상담 리포트</h2>
              {status === "GENERATED" && (
                <span className="inline-flex items-center whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
                  리포트 완성
                </span>
              )}
              {status === "GENERATED" && student.shareEnabled && (
                <span className="inline-flex items-center whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10.5px] font-bold text-blue-700">
                  공유 중
                </span>
              )}
              {status === "FAILED" && (
                <span className="inline-flex items-center whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10.5px] font-bold text-rose-600">
                  직전 생성 실패 · 크레딧 자동 환불
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400 break-keep">
              이 분석 데이터를 바탕으로 학부모 공유용 상담 리포트를 생성합니다.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {status === "GENERATING" ? (
            <button
              type="button"
              onClick={onGoReport}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-[13px] font-bold text-blue-700 transition-colors hover:bg-blue-100"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              생성 진행 중 — 보기
            </button>
          ) : status === "GENERATED" ? (
            <button
              type="button"
              onClick={onGoReport}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              리포트 열기
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : gradingConfirmed ? (
            <button
              type="button"
              onClick={onGoReport}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              {status === "FAILED" ? "리포트 다시 만들기" : "AI 리포트 만들기"}
              {/* 과금 표기 — 생성 CTA 공통 CreditCostChip(bg-white/20 pill) */}
              <CreditCostChip
                amount={CREDIT_COSTS.EXAM_STUDENT_REPORT}
                className="ml-1 shrink-0 gap-1 rounded-lg bg-white/20 px-2 py-1 text-[11px] text-white"
              />
            </button>
          ) : (
            <>
              <span className="text-[12px] font-medium text-slate-400 break-keep">
                채점을 확정하면 생성할 수 있습니다.
              </span>
              <button
                type="button"
                onClick={onGoVerdict}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <PenLine className="h-3.5 w-3.5" />
                채점으로
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
