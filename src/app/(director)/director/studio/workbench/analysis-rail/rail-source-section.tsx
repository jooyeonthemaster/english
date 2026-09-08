"use client";

// ============================================================================
// 레일 S5 「원본」 — 업로드된 시험지 사진(26-09-01 정본 §3.10.28,
// 26-09-03 INTERNAL 분기 제거).
//
// sourceFiles 사진 → 셸 콘솔 훅의 서명 URL(첫 펼침 발급 — ensureSourceUrls 가
// 경로키 dedup 이라 aside·드로어 2중 마운트에도 POST 1회).
// 296px 플로어에서 A4 는 판독 불가(실척 ~40%)라 인라인 확대를 두지 않는다 —
// 이미지 클릭 = 서명 URL 새 탭(페이지 유지 — 모달 0·이동 0 계약 무위반,
// 적대검수 V2-M7). zoom 이식 금지: 그쪽 확대는 상위 가로 스크롤 흡수 방식이라
// 레일의 「가로 오버플로 0」 계약과 정면 충돌한다.
//
// INTERNAL(sourceFiles null 실측 — 합성 분석이라 사진 미경유)은 이 탭 자체를
// 렌더하지 않는다. 구 「문항 전문」 강등본은 [문항] 카드 안으로 합쳤다
// (rail-question-section.tsx — 같은 번호 목록이 두 탭에 두 벌 뜨던 중복 해소).
// ============================================================================

import { useEffect, useMemo } from "react";
import { ImageOff, Loader2, RotateCw } from "lucide-react";
import type { ExamSourceFile } from "@/components/exam-report/ui-contracts";
import type { AnalysisConsoleApi } from "./use-analysis-console";

export function RailSourceSection({
  sourceFiles,
  console: api,
}: {
  sourceFiles: ExamSourceFile[] | null;
  console: AnalysisConsoleApi;
}) {
  const files = useMemo(
    () => (sourceFiles ?? []).filter((f) => !!f.path),
    [sourceFiles],
  );

  // 첫 펼침(=이 컴포넌트 마운트) 시 지연 페치 — 셸 훅이 dedup 소유라 2중 안전.
  // deps 는 안정 콜백 1개만(useCallback) — api 객체 전체를 걸면 렌더마다 재실행
  // 되고, 실패 상태 전이가 곧 재페치가 되어 무한 GET 루프(U5-correctness-1).
  const { ensureSourceUrls } = api;
  useEffect(() => {
    if (files.length > 0) ensureSourceUrls(files);
  }, [files, ensureSourceUrls]);

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center">
        <ImageOff className="size-6 text-slate-300" aria-hidden="true" />
        <p className="break-keep text-[11px] leading-relaxed text-slate-400">
          등록된 원본 이미지가 없습니다
        </p>
      </div>
    );
  }

  if (api.sourcePhase === "loading" || api.sourcePhase === "idle") {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-md border border-slate-100 bg-slate-50 text-slate-400">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      </div>
    );
  }
  if (api.sourcePhase === "error") {
    return (
      <button
        type="button"
        onClick={() => api.reissueSourceUrls()}
        className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
      >
        <RotateCw className="size-3.5 shrink-0" aria-hidden="true" />
        원본을 불러오지 못했어요 — 다시 시도
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="break-keep text-[11px] leading-relaxed text-slate-400">
        이미지를 클릭하면 새 탭에서 원본 크기로 열립니다
      </p>
      {api.sourceUrls.map((url, i) => (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="group relative block min-w-0"
          title={`원본 페이지 ${i + 1} — 새 탭에서 크게 보기`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`원본 페이지 ${i + 1}`}
            loading="lazy"
            draggable={false}
            onError={() => api.reissueSourceUrls()}
            className="w-full rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors group-hover:border-slate-300"
          />
          <span className="absolute right-1.5 top-1.5 rounded border border-slate-200 bg-white px-1.5 py-px text-[10px] font-medium tabular-nums text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {i + 1} / {api.sourceUrls.length}
          </span>
        </a>
      ))}
    </div>
  );
}
