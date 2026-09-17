"use client";

// ============================================================================
// 레일 S5b 「원본」(INTERNAL) — **스모트에서 조판된 시험지** (26-09-03 사용자 지시)
//
// 지시 원문: "여기 스모트 시험지에서도 이 원본 탭 구현해줘. 원본 탭에서는 그
// 조판된 시험지를 보여주면 되잖아."
// → 26-09-03 오전에 「INTERNAL 은 사진이 없으니 [원본] 탭 자체를 없앤다」로
//   닫았던 판단의 **반전**이다. 전제가 틀렸던 게 아니라(사진은 실제로 없다)
//   원본의 **실체를 잘못 잡았다** — INTERNAL 의 원본은 업로드 사진이 아니라
//   그 분석이 태어난 **조판 결과물**이다.
//
// 렌더러 선택(중요): `ExamFirstPagePreview`(maxPages 확장)를 쓴다.
//   ⛔ `ExamDetailPaperPreview` 이식 금지 — `#exam-paper-print-root` +
//      usePrintPortal 이 **앱 전역 인쇄**를 가로채고(body.exam-print-active 가
//      다른 표면을 display:none 으로 지워 학습지 조판 인쇄를 794x1123 → 0x0 으로
//      백지화시킨 실측 이력), 툴바·줌 컨트롤·전역 PrintStyles 까지 달고 온다.
//   ⛔ zoom 이식 금지 — 상위 가로 스크롤 흡수 방식이라 레일의 「가로 오버플로 0」
//      계약과 정면 충돌한다(rail-source-section 이 같은 이유로 이미 기각).
//   ✅ ExamFirstPagePreview 는 순수 CSS scale 한 겹 + overflow-hidden 이라
//      레일 폭에 맞춰 접히고 가로로 새지 않는다.
//
// 확대 수단은 **레일 자체**다 — aside 는 320~960 리사이저블이라 오른쪽 가장자리를
// 끌면 그대로 커진다(960 에서 zoom≈1.26). 그래서 새 탭 탈출구를 만들지 않았다:
// 레일의 「탈출구 0」 계약(예외 1종)을 사진 확대처럼 늘리지 않는다.
//
// 페치는 **셸 콘솔 1인스턴스**(use-analysis-source ensureExamSheet)가 소유한다 —
// 레일은 aside·드로어 2트리에 동시 마운트되므로 컴포넌트가 직접 부르면 2중 요청이다.
// 계약 셀렉터: `[data-rail-exam-sheet]`(루트) · `[data-rail-exam-sheet-page]`(지면).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { FileX2, Loader2, RotateCw } from "lucide-react";
import { ExamFirstPagePreview } from "@/components/exams/exam-detail-paper-preview";
import type { AnalysisConsoleApi } from "./use-analysis-console";

/** 렌더 상한 — 지면은 IntersectionObserver 지연 마운트라 크게 잡아도 안전하다. */
const MAX_SHEET_PAGES = 40;

export function RailExamSheetSection({
  examId,
  console: api,
}: {
  /** row.sourceExamId — surgical ALTER 열이라 INTERNAL 이어도 null 일 수 있다. */
  examId: string | null;
  console: AnalysisConsoleApi;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // 렌더 폭 실측 — A4 축소율의 기준(레일을 넓히면 그만큼 커진다).
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 지연 페치 — 안정 콜백 1개만 deps 에(api 객체 전체를 걸면 렌더마다 재실행).
  const { ensureExamSheet } = api;
  useEffect(() => {
    if (examId) ensureExamSheet(examId);
  }, [examId, ensureExamSheet]);

  if (!examId) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center">
        <FileX2 className="size-6 text-slate-300" aria-hidden="true" />
        <p className="break-keep text-[11px] leading-relaxed text-slate-400">
          원본 시험지를 찾을 수 없습니다
        </p>
      </div>
    );
  }

  if (api.examSheetPhase === "error") {
    return (
      <button
        type="button"
        onClick={() => ensureExamSheet(examId, true)}
        className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
      >
        <RotateCw className="size-3.5 shrink-0" aria-hidden="true" />
        시험지를 불러오지 못했어요 — 다시 시도
      </button>
    );
  }

  const exam = api.examSheet;
  const ready = api.examSheetPhase === "ready" && exam;
  const empty = ready && exam.questions.length === 0;

  return (
    <div data-rail-exam-sheet className="min-w-0 space-y-2">
      <p className="break-keep text-[11px] leading-relaxed text-slate-400">
        스모트에서 조판한 시험지입니다 · 레일을 넓히면 크게 볼 수 있습니다
      </p>
      <div
        ref={hostRef}
        data-rail-exam-sheet-page
        className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      >
        {!ready ? (
          <div className="flex min-h-[160px] items-center justify-center bg-slate-50 text-slate-400">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          </div>
        ) : empty ? (
          <div className="flex min-h-[120px] items-center justify-center text-[11.5px] text-slate-400">
            조판된 문항이 없는 시험지입니다
          </div>
        ) : width > 0 ? (
          <ExamFirstPagePreview
            exam={exam}
            width={width}
            maxPages={MAX_SHEET_PAGES}
          />
        ) : (
          // 폭 실측 전 1프레임 — 높이 0 붕괴 대신 같은 스켈레톤을 유지한다.
          <div className="min-h-[160px] bg-slate-50" />
        )}
      </div>
    </div>
  );
}
