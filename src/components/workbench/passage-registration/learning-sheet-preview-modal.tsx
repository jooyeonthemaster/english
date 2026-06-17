"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenCheck, CheckCircle2, Loader2, X } from "lucide-react";

import {
  ReportPages,
  REPORT_A4_WIDTH_PX,
} from "@/components/workbench/analysis-report/report-pages";
import { PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST } from "@/lib/passage-analysis-credit-costs";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import {
  ACTIVITY_CATALOG,
  activityPreviewLine,
} from "@/lib/passage-report/analysis-report/study-activities";
import { stripWorksheetContentFields } from "@/lib/passage-report/analysis-report/worksheet-core-gate";

export type LearningSheetVariant = "basic" | "practice";

/** 모달 내부 뷰 — 생성 구성 2종 + 생성 후 무료로 추가하는 학습 활동 카탈로그. */
type PreviewView = LearningSheetVariant | "activities";

const ACTIVITY_CATEGORY_ORDER = ["빈칸/복원", "직독직해", "어순/배열", "어휘"] as const;

const SECTION_LABELS: Record<string, string> = {
  passage: "원문 + 필기 캔버스",
  summary: "요약 정리",
  grammar: "어법 포인트",
  "exam-focus": "출제 포인트",
  vocabulary: "어휘 정리",
  parsing: "구문 분석 (직독직해)",
  "self-check": "셀프 체크",
  "learning-worksheet": "문장별 논리 구조 표",
};

/** 실전 학습지(06)에 추가되는 콘텐츠 — 워크시트 섹션의 실제 필드 존재 여부로 표시. */
const WORKSHEET_ITEMS: { key: string; label: string }[] = [
  { key: "workbookSet", label: "어법 선택 워크북" },
  { key: "cloze", label: "핵심어구 빈칸 + 한국어 해석" },
  { key: "practice", label: "배열 영작 연습" },
  { key: "drills", label: "변형 드릴" },
  { key: "inferenceSet", label: "수능형 추론 문항 5개" },
];

/**
 * ReportPages 는 A4 실폭(794px)으로 렌더·측정하므로, 시각 배율만 transform 으로
 * 줄이고 래퍼 높이를 측정값×배율로 잡아 스크롤 공간이 어긋나지 않게 한다.
 */
function ScaledReportPages({
  report,
  scale,
}: {
  report: AnalysisReport;
  scale: number;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [innerHeight, setInnerHeight] = useState(0);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const sync = () => setInnerHeight(el.offsetHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [report]);

  return (
    <div
      className="mx-auto"
      style={{
        width: REPORT_A4_WIDTH_PX * scale,
        height: innerHeight ? innerHeight * scale : undefined,
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: REPORT_A4_WIDTH_PX,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <ReportPages report={report} />
      </div>
    </div>
  );
}

interface LearningSheetPreviewModalProps {
  open: boolean;
  initialVariant: LearningSheetVariant;
  /** 기본 학습지 1매 가격. 실전 포함은 학습지 추가분만 더한다. */
  basicUnitCost: number;
  onClose: () => void;
  /** "이 구성으로 생성하기" — 선택을 부모(구성 선택 카드)에 반영하고 닫는다. */
  onApplyVariant: (variant: LearningSheetVariant) => void;
}

/**
 * 학습지 미리보기 — 실제 AI 가 생성한 학습지 원본 데이터(번들 샘플)를 실제 렌더러
 * (ReportPages)로 그대로 보여준다. "기본 학습지" 뷰는 서버 생성 게이트와 같은
 * stripWorksheetContentFields 를 통과시키므로 두 탭의 차이 = 실제 생성 결과의
 * 차이와 구조적으로 동일하다.
 */
export function LearningSheetPreviewModal({
  open,
  initialVariant,
  basicUnitCost,
  onClose,
  onApplyVariant,
}: LearningSheetPreviewModalProps) {
  const [view, setView] = useState<PreviewView>(initialVariant);
  const [sample, setSample] = useState<AnalysisReport | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (open) setView(initialVariant);
  }, [open, initialVariant]);

  // 70KB 샘플 JSON 은 모달이 처음 열릴 때만 동적 로드한다 (페이지 번들 비오염).
  useEffect(() => {
    if (!open || sample || loadError) return;
    let cancelled = false;
    Promise.all([
      import("@/lib/passage-report/analysis-report/_samples/prime-practice-sample.json"),
      import("@/lib/passage-report/analysis-report/schema"),
    ])
      .then(([json, schema]) => {
        if (cancelled) return;
        const parsed = schema.analysisReportSchema.safeParse(json.default ?? json);
        if (parsed.success) setSample(parsed.data);
        else setLoadError(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sample, loadError]);

  // 현 생성기는 structure-map 을 만들지 않는다 — 구형 섹션은 걸러 현재 산출물 기준으로 보여준다.
  const practiceReport = useMemo<AnalysisReport | null>(() => {
    if (!sample) return null;
    return {
      ...sample,
      sections: sample.sections.filter((s) => s.kind !== "structure-map"),
    } as AnalysisReport;
  }, [sample]);

  const basicReport = useMemo<AnalysisReport | null>(() => {
    if (!practiceReport) return null;
    return {
      ...practiceReport,
      sections: stripWorksheetContentFields(practiceReport.sections),
    } as AnalysisReport;
  }, [practiceReport]);

  const activeReport = view === "practice" ? practiceReport : basicReport;

  const worksheetSection = useMemo(() => {
    const section = practiceReport?.sections.find(
      (s) => s.kind === "learning-worksheet",
    );
    return (section ?? null) as Record<string, unknown> | null;
  }, [practiceReport]);

  // ── 학습 활동 카탈로그 — 샘플 지문으로 만든 라이브 미리보기 (팔레트와 동일 빌더) ──
  const activityGroups = useMemo(() => {
    if (!practiceReport) return [];
    return ACTIVITY_CATEGORY_ORDER.map((cat) => ({
      cat,
      entries: ACTIVITY_CATALOG.filter((e) => e.category === cat).map((entry) => ({
        ...entry,
        preview: entry.enabled
          ? activityPreviewLine(practiceReport, entry.kind)
          : null,
      })),
    })).filter((g) => g.entries.length > 0);
  }, [practiceReport]);
  const enabledActivityCount = ACTIVITY_CATALOG.filter((e) => e.enabled).length;

  const practiceUnitCost =
    basicUnitCost + PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST;
  const activeUnitCost = view === "practice" ? practiceUnitCost : basicUnitCost;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-4 my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* ─── Header ─── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <BookOpenCheck className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-slate-900">학습지 미리보기</h2>
            <p className="truncate text-[12px] font-medium text-slate-400">
              실제 AI가 생성한 학습지 원본입니다 — 이 모습 그대로 만들어져요
            </p>
          </div>
          {/* 탭 — 가격이 곧 구성 차이임을 탭에서 바로 보여준다. 학습 활동은 생성 후 무료 추가. */}
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: "basic" as const, label: "기본 학습지", chip: `◈${basicUnitCost}` },
                { id: "practice" as const, label: "실전 학습지 포함", chip: `◈${practiceUnitCost}` },
                { id: "activities" as const, label: `학습 활동 ${enabledActivityCount}종`, chip: "무료" },
              ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id)}
                className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-bold transition-colors ${
                  view === tab.id
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.label}
                <span
                  className={`rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums ${
                    view === tab.id
                      ? "bg-blue-50 text-blue-600"
                      : "bg-slate-200/70 text-slate-500"
                  }`}
                >
                  {tab.chip}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ─── Body ─── */}
        {view === "activities" ? (
          /* 학습 활동 카탈로그 — 생성 후 편집기에서 무료로 추가하는 유형 군단.
             미리보기는 팔레트와 동일한 빌더로 샘플 지문에서 실제 생성한 문장이다. */
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-5 py-4">
            <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3.5 py-2.5">
              <p className="text-[12.5px] font-bold text-blue-800">
                학습지 생성 후, 편집기에서 카드를 눌러 원하는 만큼 추가하는 학습 활동입니다.
              </p>
              <p className="mt-0.5 text-[11.5px] font-medium text-blue-600/80">
                추출된 지문 데이터로 즉석 생성 · AI 호출 없음 · 추가 비용 없음 · 무제한 다시 섞기
              </p>
            </div>
            {!practiceReport ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-slate-400">
                {loadError ? (
                  <p className="text-[13px] font-medium">미리보기를 불러오지 못했습니다.</p>
                ) : (
                  <>
                    <Loader2 className="size-5 animate-spin" />
                    <p className="text-[12.5px] font-medium">실제 학습지 데이터를 불러오는 중…</p>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {activityGroups.map((group) => (
                  <section
                    key={group.cat}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-3 py-2">
                      <span className="h-3.5 w-1 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
                      <h4 className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-wider text-slate-600">
                        {group.cat}
                      </h4>
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums text-slate-400">
                        {group.entries.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 p-2 lg:grid-cols-2">
                      {group.entries.map((entry) => (
                        <div
                          key={entry.kind}
                          className={`flex flex-col gap-1.5 rounded-xl border p-3 ${
                            entry.enabled
                              ? "border-slate-200 bg-white"
                              : "border-dashed border-slate-200 bg-slate-50/60 opacity-70"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12.5px] font-bold text-slate-800">
                              {entry.labelKo}
                            </span>
                            <span
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                entry.enabled
                                  ? "bg-blue-50 text-blue-600 ring-1 ring-blue-100"
                                  : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {entry.enabled ? "무료" : "준비 중"}
                            </span>
                          </div>
                          <p className="text-[11px] leading-snug text-slate-500">
                            {entry.description}
                          </p>
                          {entry.preview ? (
                            <div className="mt-0.5 rounded-md border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                              <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                                미리보기
                              </span>
                              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-700">
                                {entry.preview}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        ) : (
        /* 좌 구성 목차 / 우 실물 페이지 */
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[252px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-slate-100 bg-slate-50/60 px-4 py-4 md:flex">
            <span className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
              학습지 구성
            </span>
            {(activeReport?.sections ?? []).map((section, i) => {
              const isWorksheet = section.kind === "learning-worksheet";
              const label =
                isWorksheet && view === "practice"
                  ? "실전 학습지"
                  : SECTION_LABELS[section.kind] ?? section.kind;
              return (
                <div key={`${section.kind}-${i}`}>
                  <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
                    <span className="w-5 shrink-0 text-[11px] font-bold tabular-nums text-slate-400">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[12.5px] font-semibold text-slate-700">
                      {label}
                    </span>
                  </div>
                  {/* 실전 탭: 워크시트에 실제로 추가되는 콘텐츠를 펼쳐 보여준다 */}
                  {isWorksheet && view === "practice" && worksheetSection ? (
                    <div className="mb-1 ml-7 flex flex-col gap-1">
                      {WORKSHEET_ITEMS.filter((item) => !!worksheetSection[item.key]).map(
                        (item) => (
                          <div key={item.key} className="flex items-center gap-1.5">
                            <CheckCircle2 className="size-3 shrink-0 text-blue-500" />
                            <span className="text-[11.5px] font-medium text-blue-700">
                              {item.label}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {/* 기본 탭: 실전 학습지에서 무엇이 더 생기는지 흐리게 보여주고 탭 전환 유도 */}
            {view === "basic" ? (
              <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-2.5">
                <p className="text-[11px] font-bold text-slate-400">
                  실전 학습지 포함 시 추가 (+◈{PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST})
                </p>
                <div className="mt-1.5 flex flex-col gap-1">
                  {WORKSHEET_ITEMS.map((item) => (
                    <span key={item.key} className="text-[11.5px] font-medium text-slate-400">
                      · {item.label}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setView("practice")}
                  className="mt-2 text-[11.5px] font-bold text-blue-600 hover:text-blue-700 hover:underline"
                >
                  실전 포함 버전 보기 →
                </button>
              </div>
            ) : null}

            {/* 생성 후 무료로 더하는 학습 활동 군단 — 카탈로그 탭으로 안내 */}
            <button
              type="button"
              onClick={() => setView("activities")}
              className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2.5 text-left transition-colors hover:border-blue-200 hover:bg-blue-50"
            >
              <span className="min-w-0">
                <span className="block text-[11.5px] font-bold text-blue-700">
                  + 학습 활동 {enabledActivityCount}종
                </span>
                <span className="block text-[10.5px] font-medium text-blue-500/90">
                  생성 후 무료 추가 · AI 없음
                </span>
              </span>
              <span className="shrink-0 text-[12px] font-bold text-blue-400">→</span>
            </button>
          </aside>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-200/60 px-4 py-5">
            {activeReport ? (
              <ScaledReportPages report={activeReport} scale={0.78} />
            ) : (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-slate-400">
                {loadError ? (
                  <p className="text-[13px] font-medium">미리보기를 불러오지 못했습니다.</p>
                ) : (
                  <>
                    <Loader2 className="size-5 animate-spin" />
                    <p className="text-[12.5px] font-medium">실제 학습지 데이터를 불러오는 중…</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* ─── Footer ─── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3">
          {view === "activities" ? (
            <>
              <p className="text-[12px] font-medium text-slate-500">
                위 활동은 학습지 생성 후 편집기에서 카드를 눌러 추가합니다 —{" "}
                <span className="font-bold text-slate-700">크레딧 소모 없음 · 무제한</span>
              </p>
              <button
                type="button"
                onClick={() => setView(initialVariant)}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-[12.5px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
              >
                구성 선택으로 돌아가기
              </button>
            </>
          ) : (
            <>
              <p className="text-[12px] font-medium text-slate-500">
                {view === "practice"
                  ? "기본 구성에 어법 워크북·빈칸·배열 영작과 수능형 추론 문항까지 더한 구성입니다."
                  : "원문 필기 캔버스부터 구문 분석까지, 수업에 바로 쓰는 기본 구성입니다."}
                <span className="ml-1.5 font-bold tabular-nums text-slate-700">
                  지문당 ◈{activeUnitCost}
                </span>
              </p>
              <button
                type="button"
                onClick={() => onApplyVariant(view)}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[12.5px] font-bold text-white transition-colors hover:bg-blue-700"
              >
                <CheckCircle2 className="size-4" />
                이 구성으로 생성하기
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
