"use client";

import NextImage from "next/image";
import { cn } from "@/lib/utils";

import { PAPER_SIZE_SPECS } from "../constants";
import type { HeaderPatch, PaperCover, PaperSize } from "../types";
import { EditableText } from "./editable-text";

export interface ExamCoverPageProps {
  paperSize: PaperSize;
  cover: PaperCover;
  title: string;
  subtitle: string;
  academyLogoDataUrl: string | null;
  schoolName: string;
  className: string;
  examDate: string;
  onHeaderChange: (patch: HeaderPatch) => void;
  onCoverChange: (patch: Partial<PaperCover>) => void;
  readOnly?: boolean;
}

// 학교/반/이름/시험일 정보 박스 — 본문 첫 페이지 헤더와 같은 항목을 표지용으로 정리.
function CoverInfo({
  schoolName,
  className,
  examDate,
  tone = "light",
}: {
  schoolName: string;
  className: string;
  examDate: string;
  tone?: "light" | "dark";
}) {
  const rows: [string, string][] = [
    ["학교", schoolName || ""],
    ["반", className || ""],
    ["이름", ""],
    ["시험일", examDate || ""],
  ];
  const lineClass =
    tone === "dark" ? "border-white/30 text-white/90" : "border-slate-300 text-slate-600";
  return (
    <dl className="mx-auto w-[260px] space-y-1.5 text-[11px]">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className={cn("flex items-baseline justify-between gap-3 border-b pb-1", lineClass)}
        >
          <dt className="font-semibold tracking-wide">{label}</dt>
          <dd className="min-w-[120px] flex-1 text-right font-semibold">{value || " "}</dd>
        </div>
      ))}
    </dl>
  );
}

function CoverLogo({
  academyLogoDataUrl,
  size = 64,
}: {
  academyLogoDataUrl: string | null;
  size?: number;
}) {
  if (!academyLogoDataUrl) return null;
  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{ height: size }}
    >
      <NextImage
        src={academyLogoDataUrl}
        alt="학원 로고"
        width={size * 3}
        height={size}
        unoptimized
        className="h-full w-auto object-contain"
      />
    </div>
  );
}

/**
 * 시험지 표지(첫 장). `.exam-a4-page` 박스 구조를 본문 페이지(A4PaperPage)와
 * 동일하게 맞춰 인쇄(window.print) 시 같은 배율로 용지를 채우도록 한다. 제목·부제는
 * 본문 헤더와 값을 공유하며(onHeaderChange), 라벨·하단 문구는 표지 전용(onCoverChange).
 */
export function ExamCoverPage({
  paperSize,
  cover,
  title,
  subtitle,
  academyLogoDataUrl,
  schoolName,
  className,
  examDate,
  onHeaderChange,
  onCoverChange,
  readOnly = false,
}: ExamCoverPageProps) {
  const paperSpec = PAPER_SIZE_SPECS[paperSize];
  const logo = cover.showLogo ? academyLogoDataUrl : null;

  const eyebrowField = (extraClass?: string) => (
    <EditableText
      value={cover.eyebrow}
      onCommit={(next) => onCoverChange({ eyebrow: next })}
      placeholder="학원·시리즈명"
      className={cn("text-[11px] font-bold uppercase tracking-[0.32em]", extraClass)}
      readOnly={readOnly}
    >
      {cover.eyebrow}
    </EditableText>
  );

  const titleField = (extraClass?: string) => (
    <EditableText
      value={title}
      onCommit={(next) => onHeaderChange({ title: next })}
      placeholder="시험지 제목"
      className={cn("block break-keep font-black leading-tight tracking-tight", extraClass)}
      readOnly={readOnly}
    >
      {title}
    </EditableText>
  );

  const subtitleField = (extraClass?: string) => (
    <EditableText
      value={subtitle}
      onCommit={(next) => onHeaderChange({ subtitle: next })}
      placeholder="부제 · 한 줄 설명"
      className={cn("block font-semibold", extraClass)}
      readOnly={readOnly}
    >
      {subtitle}
    </EditableText>
  );

  const footnoteField = (extraClass?: string) => (
    <EditableText
      value={cover.footnote}
      onCommit={(next) => onCoverChange({ footnote: next })}
      placeholder="문서번호 · 문구"
      className={cn("text-[10px] font-semibold tracking-wide", extraClass)}
      readOnly={readOnly}
    >
      {cover.footnote}
    </EditableText>
  );

  return (
    <div
      className="exam-a4-page exam-cover-page relative w-full overflow-hidden bg-white shadow-xl ring-1 ring-slate-200"
      style={{
        aspectRatio: `${paperSpec.widthMm} / ${paperSpec.heightMm}`,
        fontFamily: '"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif',
      }}
      data-paper-size={paperSize}
      data-exam-cover="true"
    >
      {cover.template === "classic" && (
        <div className="relative flex h-full flex-col items-center px-[56px] py-[64px] text-center">
          <div className="flex flex-1 flex-col items-center justify-center">
            {logo && (
              <div className="mb-7">
                <CoverLogo academyLogoDataUrl={logo} size={68} />
              </div>
            )}
            {(cover.eyebrow || !readOnly) && (
              <div className="mb-4 text-slate-400">{eyebrowField()}</div>
            )}
            {titleField("text-[40px] text-slate-900")}
            <div className="my-6 h-px w-16 bg-slate-300" />
            {(subtitle || !readOnly) && subtitleField("text-[15px] text-slate-500")}
            {cover.showInfo && (
              <div className="mt-12">
                <CoverInfo
                  schoolName={schoolName}
                  className={className}
                  examDate={examDate}
                />
              </div>
            )}
          </div>
          {(cover.footnote || !readOnly) && (
            <div className="shrink-0 text-slate-400">{footnoteField()}</div>
          )}
        </div>
      )}

      {cover.template === "band" && (
        <div className="relative flex h-full flex-col">
          <div className="flex min-h-[44%] flex-col justify-center bg-slate-900 px-[56px] py-[52px] text-white">
            {logo && (
              <div className="mb-6 flex">
                <div className="rounded-md bg-white/95 px-3 py-2">
                  <CoverLogo academyLogoDataUrl={logo} size={52} />
                </div>
              </div>
            )}
            {(cover.eyebrow || !readOnly) && (
              <div className="mb-3 text-amber-300">{eyebrowField()}</div>
            )}
            {titleField("text-[38px] text-white")}
            {(subtitle || !readOnly) &&
              subtitleField("mt-4 text-[15px] font-semibold text-white/70")}
          </div>
          <div className="flex flex-1 flex-col justify-between px-[56px] py-[44px]">
            {cover.showInfo ? (
              <CoverInfo
                schoolName={schoolName}
                className={className}
                examDate={examDate}
              />
            ) : (
              <div />
            )}
            {(cover.footnote || !readOnly) && (
              <div className="text-right text-slate-400">{footnoteField()}</div>
            )}
          </div>
        </div>
      )}

      {cover.template === "minimal" && (
        <div className="relative flex h-full flex-col px-[60px] py-[64px]">
          <div className="flex items-center justify-between">
            {logo ? (
              <CoverLogo academyLogoDataUrl={logo} size={44} />
            ) : (
              <span className="text-slate-300">{eyebrowField()}</span>
            )}
            {logo && (cover.eyebrow || !readOnly) && (
              <span className="text-slate-400">{eyebrowField()}</span>
            )}
          </div>
          <div className="flex flex-1 flex-col justify-center">
            <div className="mb-4 h-1 w-12 bg-slate-900" />
            {titleField("text-[44px] text-slate-900")}
            {(subtitle || !readOnly) &&
              subtitleField("mt-5 text-[16px] text-slate-500")}
          </div>
          <div className="flex shrink-0 items-end justify-between gap-6 border-t border-slate-200 pt-6">
            {cover.showInfo ? (
              <div className="text-left">
                <CoverInfo
                  schoolName={schoolName}
                  className={className}
                  examDate={examDate}
                />
              </div>
            ) : (
              <div />
            )}
            {(cover.footnote || !readOnly) && (
              <div className="text-slate-400">{footnoteField()}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
