"use client";

// ============================================================================
// 학생 시험 리포트 — 섹션 공용 셸 (에디토리얼 헤더 문법)
//
// 헤더 문법: 섹션 번호 카운터(01, 02 … — CSS counter, DOM 순서가 곧 번호) +
// kicker(작은 대문자 라벨) → 헤딩(테마 heading-font) → 헤어라인(선두 primary 세그먼트).
// 좌측 보더·흰 카드·lucide 아이콘 문법은 폐기 — 섹션은 지면 위의 장(章)이다.
//
// 모션: 헤더/본문/내러티브 3단 data-reveal 스태거(ReportMotionRoot 가 구동).
// view: renderNarrative(** 강조 파싱) / edit: EditableText raw + 숨김 토글 유지.
// hidden 섹션의 view 스킵은 report-document 몫. .rpt-section/.rpt-no-print/
// .rpt-sec-head 클래스는 인쇄·목차 인덱스 계약이므로 불변.
// ============================================================================

import type { LucideIcon } from "lucide-react";
import { Eye, EyeOff } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { EditableText } from "../editable-text";
import { renderNarrative } from "../report-narrative";

export type ReportRenderMode = "view" | "edit";

export interface SectionCommonPatch {
  heading?: string;
  narrative?: string;
  hidden?: boolean;
}

interface SectionShellProps {
  heading: string;
  narrative: string;
  hidden?: boolean;
  mode: ReportRenderMode;
  /** 헤딩 위 작은 라틴 라벨(예: "SCORE OVERVIEW") — 없으면 번호만 */
  kicker?: string;
  /** @deprecated v1 아이콘 문법 — 수용만 하고 렌더하지 않는다(신 헤더 문법) */
  icon?: LucideIcon;
  onPatch?: (patch: SectionCommonPatch) => void;
  children: ReactNode;
}

const revealDelay = (ms: number): CSSProperties =>
  ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;

const HEADING_CLASS =
  "text-[21px] font-bold leading-tight tracking-[-0.01em] text-slate-900 @min-[640px]:text-2xl";
const HEADING_STYLE: CSSProperties = { fontFamily: "var(--rpt-heading-font)" };

export function SectionShell({
  heading,
  narrative,
  hidden,
  mode,
  kicker,
  onPatch,
  children,
}: SectionShellProps) {
  const isEdit = mode === "edit";
  const isHidden = Boolean(hidden) && isEdit;
  return (
    <section
      className={`rpt-section relative scroll-mt-24 ${
        isHidden ? "rounded-xl border border-dashed border-slate-300 p-4 @min-[640px]:p-5" : ""
      }`}
    >
      {isHidden && (
        <span className="rpt-no-print pointer-events-none absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-dashed border-slate-300 bg-white px-3 py-0.5 text-[11px] font-medium text-slate-500">
          공개 페이지에서 제외됨
        </span>
      )}
      <div className={isHidden ? "opacity-50" : ""}>
        <header className="rpt-sec-head" data-reveal>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              {/* 번호 + kicker — 강박적 트래킹의 메타 라인 */}
              <p
                className="flex items-baseline gap-2 text-[11px] font-bold leading-none"
                style={{ color: "var(--rpt-primary)" }}
              >
                <span className="rpt-sec-num tabular-nums tracking-[0.14em]" aria-hidden />
                {kicker && (
                  <>
                    <span aria-hidden className="font-normal" style={{ color: "var(--rpt-line)" }}>
                      /
                    </span>
                    <span className="uppercase tracking-[0.24em]" style={{ color: "var(--rpt-neutral)" }}>
                      {kicker}
                    </span>
                  </>
                )}
              </p>
              {isEdit ? (
                <EditableText
                  as="h3"
                  value={heading}
                  onCommit={(v) => onPatch?.({ heading: v })}
                  ariaLabel="섹션 제목"
                  className={`mt-2 ${HEADING_CLASS}`}
                  style={HEADING_STYLE}
                />
              ) : (
                <h3 className={`mt-2 ${HEADING_CLASS}`} style={HEADING_STYLE}>
                  {heading}
                </h3>
              )}
            </div>
            {isEdit && (
              <button
                type="button"
                onClick={() => onPatch?.({ hidden: !hidden })}
                className="rpt-no-print inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {hidden ? "숨김" : "표시"}
              </button>
            )}
          </div>
          {/* 헤어라인 — 선두 32px 만 primary 2px 로 리듬을 준다 */}
          <div className="relative mt-3 h-px" style={{ background: "var(--rpt-line)" }} aria-hidden>
            <span
              className="absolute -top-[1px] left-0 h-[2px] w-8"
              style={{ background: "var(--rpt-primary)" }}
            />
          </div>
        </header>

        <div className="mt-6" data-reveal style={revealDelay(90)}>
          {children}
        </div>

        <div data-reveal style={revealDelay(180)}>
          {isEdit ? (
            <EditableText
              value={narrative}
              onCommit={(v) => onPatch?.({ narrative: v })}
              ariaLabel="섹션 내러티브"
              className="mt-5 min-h-[3rem] whitespace-pre-wrap p-1 text-[15px] leading-[1.85] text-slate-700"
            />
          ) : (
            <NarrativeView narrative={narrative} />
          )}
        </div>
      </div>
    </section>
  );
}

function NarrativeView({ narrative }: { narrative: string }) {
  const nodes = renderNarrative(narrative);
  if (nodes == null) return null;
  return (
    <div className="rpt-narrative mt-5 flex flex-col gap-3 text-[15px] leading-[1.85] text-slate-700">
      {nodes}
    </div>
  );
}
