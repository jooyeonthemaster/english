"use client";

// ============================================================================
// 학생 시험 리포트 — 인테이크 빈 상태 히어로(intake-upload-parts 에서 분리)
// ============================================================================

import {
  ClipboardList,
  Database,
  FileText,
  FileUp,
  ImageIcon,
  Loader2,
  PlayCircle,
  UploadCloud,
} from "lucide-react";
import { UploadMetaChip } from "@/components/workbench/shared/upload-meta-chip";
import { cn } from "@/lib/utils";

// ── 빈 상태 히어로 — 단일 컬럼 드롭존 + 사용 순서 3단(26-09-03 개편) ──────────
// 26-09-02 까지는 빈 상태도 2컬럼(드롭존 | 레일 가이드+비활 CTA)이라 스튜디오
// 중앙 열(패널 666px)에서 드롭존이 266×750 세로 막대로, 1280 뷰포트에선 150px
// 로 찌그러졌다(실측 — "가로로 찌그러져서 이상해"). 빈 상태의 레일엔 담을 정보가
// 없다(메타 폼은 페이지가 있어야 의미·CTA 는 비활) — 그래서 빈 상태는 히어로
// 1장으로 접고, 2컬럼은 페이지가 생긴 뒤에만 편다. 카드 전체가 드롭 타깃이자
// 클릭 타깃(내부 프라이머리 버튼이 접근성 컨트롤 — 버블 차단으로 2중 열림 방지).
// 단 그리드는 뷰포트가 아니라 **컨테이너** 폭으로 접는다(스튜디오 중앙 열은
// 1280 뷰포트에서 434px — sm: 같은 뷰포트 변형은 오판).
export function IntakeEmptyHero({
  dragging,
  busy,
  ingesting,
  errorMsg,
  maxPages,
  pdfMaxMb,
  onPick,
}: {
  dragging: boolean;
  busy: boolean;
  ingesting: boolean;
  errorMsg: string | null;
  maxPages: number;
  pdfMaxMb: number;
  onPick: () => void;
}) {
  const steps = [
    { icon: FileUp, label: "파일 추가", hint: "사진 여러 장 또는 PDF 1개" },
    {
      icon: ClipboardList,
      label: "시험 정보 입력",
      hint: "제목·학년·시험 종류",
    },
    {
      icon: PlayCircle,
      label: "등록하고 분석 시작",
      hint: "문항별 분석이 자동 진행",
    },
  ];
  return (
    <div
      data-intake-hero
      onClick={busy ? undefined : onPick}
      className={cn(
        "@container flex min-h-0 flex-1 flex-col items-center justify-center gap-7 overflow-y-auto rounded-lg border-2 border-dashed px-6 py-8 transition-colors",
        busy ? "cursor-wait" : "cursor-pointer",
        dragging
          ? "border-blue-400 bg-blue-50/70"
          : "border-slate-200 bg-slate-50/60 hover:border-blue-300 hover:bg-blue-50/30",
      )}
    >
      <div className="flex w-full max-w-[560px] flex-col items-center gap-3 text-center">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-8 ring-blue-50/60">
          {ingesting ? (
            <Loader2 className="size-7 animate-spin" aria-hidden="true" />
          ) : (
            <UploadCloud className="size-7" aria-hidden="true" />
          )}
        </span>
        <h3 className="break-keep text-[17px] font-extrabold leading-snug text-slate-950">
          시험지 사진을 올리면 문항 분석이 시작돼요
        </h3>
        {/* 필기 허용 안심 카피 — 분석은 인쇄된 문항 기준이라 학생 필기·채점 흔적이
            있어도 무방(마킹 실물 사진 실측으로 검증됨). "깨끗한 원본" 오해 방지. */}
        <p className="break-keep text-[12.5px] leading-relaxed text-slate-500">
          학생 필기나 채점 표시가 있는 시험지도 괜찮습니다 — 인쇄된 문항을
          기준으로 분석합니다.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onPick();
          }}
          className="mt-1 inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 text-[14px] font-bold text-white shadow-md shadow-blue-200/50 transition-all hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {ingesting ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <UploadCloud className="size-5" aria-hidden="true" />
          )}
          {ingesting
            ? "페이지 불러오는 중…"
            : "파일을 끌어놓거나 클릭해서 추가"}
        </button>
        <span className="flex flex-wrap items-center justify-center gap-2">
          <UploadMetaChip
            icon={<ImageIcon className="size-3.5" aria-hidden="true" />}
          >
            PNG·JPG·WEBP / PDF
          </UploadMetaChip>
          <UploadMetaChip
            icon={<FileText className="size-3.5" aria-hidden="true" />}
          >
            최대 {maxPages}페이지
          </UploadMetaChip>
          <UploadMetaChip
            icon={<Database className="size-3.5" aria-hidden="true" />}
          >
            PDF {pdfMaxMb}MB
          </UploadMetaChip>
        </span>
        {/* 파일 거부(페이지 초과·용량 등)는 빈 상태에서도 난다 — 레일 푸터가 없으니
            히어로가 직접 보여준다. */}
        {errorMsg ? (
          <p className="break-keep text-[11.5px] font-bold text-rose-600">
            {errorMsg}
          </p>
        ) : null}
      </div>

      <ol className="grid w-full max-w-[640px] grid-cols-1 gap-2 @[520px]:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.label}
            className="flex min-w-0 items-center gap-2.5 rounded-lg bg-white px-3 py-2.5 text-left ring-1 ring-slate-200 @[520px]:flex-col @[520px]:items-start @[520px]:gap-2 @[520px]:py-3"
          >
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-blue-600 text-[10.5px] font-extrabold text-white">
                {index + 1}
              </span>
              <step.icon className="size-4 text-blue-600" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-bold text-slate-800">
                {step.label}
              </span>
              <span className="block truncate text-[11px] text-slate-400">
                {step.hint}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
