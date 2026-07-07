"use client";

// ============================================================================
// 학생 시험 리포트 — 선생님 총평 (서명형 코멘트 카드)
//
// 활자 인용부호(테마 accent-soft, 헤딩 폰트)가 문단을 여는 장식이고,
// 하단 서명행(헤어라인 + FROM + 서명 + 작성일 별행)이 편지의 끝맺음을 만든다.
// 학원명·작성일은 cover 데이터라 섹션 props 계약 밖 — report-document 가 내려준다.
// cover.academyName 이 사람 이름과 겹쳐도 발신 주체가 헷갈리지 않도록
// 서명은 항상 "…담당 선생님"으로 끝나고, 작성일은 서명 아래 저채도 별행.
// view 는 renderNarrative(문단 리듬 + **강조**), edit 는 raw EditableText 불변.
// ============================================================================

import type { TeacherCommentSection } from "@/lib/exam-report/report-schema";
import { EditableText } from "../editable-text";
import { renderNarrative } from "../report-narrative";
import { SectionShell, type ReportRenderMode } from "./section-shell";

interface Props {
  section: TeacherCommentSection;
  mode: ReportRenderMode;
  onChange?: (next: TeacherCommentSection) => void;
  /** [additive] 서명행 표기 — 전달 시 "학원명 · 작성일"로 서명(현재 미배선) */
  academyName?: string;
  dateLabel?: string;
}

export function TeacherCommentSectionView({
  section,
  mode,
  onChange,
  academyName,
  dateLabel,
}: Props) {
  const comment = section.data.comment;
  const isEdit = mode === "edit";
  // 발신 주체 명시 — academyName 이 학생명과 겹치는 데이터가 와도
  // "주연 담당 선생님"으로 읽혀 선생님의 서명임이 구조적으로 보장된다.
  const academy = academyName?.trim();
  const signedBy = academy ? `${academy} 담당 선생님` : "담당 선생님";
  const signedDate = dateLabel?.trim();

  return (
    <SectionShell
      heading={section.heading}
      narrative={section.narrative}
      hidden={section.hidden}
      mode={mode}
      kicker="TEACHER'S NOTE"
      onPatch={(patch) => onChange?.({ ...section, ...patch })}
    >
      <figure
        className="rpt-card rounded-2xl border px-6 py-6 @min-[640px]:px-9 @min-[640px]:py-8"
        style={{ borderColor: "var(--rpt-line)", background: "var(--rpt-surface)" }}
      >
        {/* 오프닝 인용부호 — 색이 아니라 활자로 여는 장식. -ml 은 글리프 좌측
            베어링을 상쇄해 본문 왼쪽 라인에 광학 정렬(행잉 펑추에이션). */}
        <span
          aria-hidden
          className="-ml-1 block select-none text-[64px] font-black leading-[0.55]"
          style={{ color: "var(--rpt-accent-soft)", fontFamily: "var(--rpt-heading-font)" }}
        >
          {"“"}
        </span>
        <div className="mt-4">
          {isEdit ? (
            <EditableText
              value={comment}
              onCommit={(v) => onChange?.({ ...section, data: { comment: v } })}
              ariaLabel="선생님 총평"
              className="min-h-[3rem] whitespace-pre-wrap p-1 text-[15.5px] leading-[1.9] text-slate-700"
            />
          ) : comment ? (
            <blockquote className="flex flex-col gap-3 text-[15.5px] leading-[1.9] text-slate-700">
              {renderNarrative(comment)}
            </blockquote>
          ) : (
            <p className="text-sm text-slate-400">총평이 아직 작성되지 않았습니다.</p>
          )}
        </div>
        {/* 서명행 — 헤어라인이 문장의 끝을 오른쪽 서명으로 흘려보내고,
            작성일은 서명 아래 저채도 별행(편지 끝맺음의 위계: 서명 > 날짜). */}
        <figcaption className="mt-8">
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-px flex-1" style={{ background: "var(--rpt-line)" }} />
            <span
              className="shrink-0 text-[10px] font-bold uppercase tracking-[0.26em]"
              style={{ color: "var(--rpt-neutral)" }}
            >
              From
            </span>
            <span className="min-w-0 text-right text-sm font-bold text-slate-800">{signedBy}</span>
          </div>
          {signedDate && (
            <p className="mt-1.5 text-right text-[11px] font-medium tabular-nums tracking-[0.04em] text-slate-400">
              {signedDate}
            </p>
          )}
        </figcaption>
      </figure>
    </SectionShell>
  );
}
