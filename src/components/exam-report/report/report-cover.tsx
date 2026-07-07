"use client";

// ============================================================================
// 학생 시험 리포트 — 커버 (템플릿 3종 = 3컨셉, 점수 노출 금지)
//
//   gradient-band : 테마 primary 딥 그라디언트 밴드 — 신뢰의 표지.
//                   상단 폴리오(라틴 킥커+날짜) → 대형 타이틀 → 백지 메타 그리드.
//   minimal-line  : 여백이 주인공 — 수직 헤어라인의 낙차 + 센터 정렬 + 인라인 메타.
//   photo-frame   : "잉크 에디토리얼"로 재정의(id 불변) — 두꺼운 잉크 룰 + 페이지
//                   번호 감각 + 좌하단 정렬 대형 타이포. 사진 슬롯 폐기.
//
// 타이포 위계: 킥커(트래킹 0.3em) < 부제 < 타이틀(-0.02em, 대형) / 메타는
// 라틴 마이크로 라벨 + 값(학생명이 항상 최상위 위계). 색은 --rpt-* 변수만
// (밴드 위 전경색만 white/black 키워드 — on-primary 변수가 없는 구조적 예외).
// .rpt-cover 클래스 = 인쇄 break-after 계약, 불변.
// ============================================================================

import type { ReportCover } from "@/lib/exam-report/report-schema";
import { EditableText } from "./editable-text";
import type { ReportRenderMode } from "./sections/section-shell";

interface ReportCoverViewProps {
  cover: ReportCover;
  mode: ReportRenderMode;
  onFieldChange?: (patch: Partial<ReportCover>) => void;
}

/** 전 템플릿 공용 킥커 — 문서의 라틴 아이덴티티 라인 */
const KICKER = "EXAM ANALYSIS REPORT";

interface MetaItem {
  label: string;
  value: string;
}

/** 라틴 마이크로 라벨 + 값. 첫 항목(보통 학생명)이 최상위 위계. */
function metaItems(cover: ReportCover): MetaItem[] {
  return [
    { label: "STUDENT", value: cover.studentName },
    { label: "EXAM", value: cover.examLabel },
    { label: "ACADEMY", value: cover.academyName },
    { label: "ISSUED", value: cover.dateLabel },
  ].filter((it) => it.value.trim().length > 0);
}

/** 컬럼형 메타 그리드 — sm↑ 헤어라인 세로 분할, 첫 값 강조. */
function MetaGrid({ cover }: { cover: ReportCover }) {
  const items = metaItems(cover);
  if (items.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-y-4">
      {items.map((it, i) => (
        <div
          key={it.label}
          className={`flex min-w-[120px] flex-col gap-1 pr-6 ${i > 0 ? "@min-[640px]:border-l @min-[640px]:pl-6" : ""}`}
          style={i > 0 ? { borderColor: "var(--rpt-line)" } : undefined}
        >
          <dt className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
            {it.label}
          </dt>
          <dd
            className={
              i === 0
                ? "text-[17px] font-bold leading-snug text-slate-900"
                : "text-[15px] font-semibold leading-snug text-slate-700"
            }
          >
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 센터 인라인 메타(minimal-line 전용) — 학생명 단독 위계 + 점 구분 한 줄. */
function MetaLineCentered({ cover }: { cover: ReportCover }) {
  const items = metaItems(cover);
  if (items.length === 0) return null;
  const [first, ...rest] = items;
  return (
    <div className="flex flex-col items-center gap-2.5">
      <p className="text-lg font-bold tracking-[0.02em] text-slate-900">{first.value}</p>
      {rest.length > 0 && (
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] font-medium text-slate-500">
          {rest.map((it, i) => (
            <span key={it.label} className="flex items-center gap-3">
              {i > 0 && (
                <span aria-hidden className="text-[11px]" style={{ color: "var(--rpt-neutral)" }}>
                  ·
                </span>
              )}
              {it.value}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function EditableTitle({
  cover,
  mode,
  onFieldChange,
  className,
  color,
}: ReportCoverViewProps & { className: string; color?: string }) {
  if (mode === "edit") {
    return (
      <EditableText
        value={cover.title}
        onCommit={(v) => onFieldChange?.({ title: v })}
        ariaLabel="리포트 제목"
        className={className}
        style={{ fontFamily: "var(--rpt-heading-font)", color }}
      />
    );
  }
  return (
    <h1 className={className} style={{ fontFamily: "var(--rpt-heading-font)", color }}>
      {cover.title}
    </h1>
  );
}

function EditableSubtitle({
  cover,
  mode,
  onFieldChange,
  className,
  color,
}: ReportCoverViewProps & { className: string; color?: string }) {
  if (mode === "edit") {
    return (
      <EditableText
        value={cover.subtitle}
        onCommit={(v) => onFieldChange?.({ subtitle: v })}
        ariaLabel="리포트 부제"
        className={className}
        style={{ color }}
      />
    );
  }
  if (!cover.subtitle) return null;
  return (
    <p className={className} style={{ color }}>
      {cover.subtitle}
    </p>
  );
}

export function ReportCoverView({ cover, mode, onFieldChange }: ReportCoverViewProps) {
  const shared = { cover, mode, onFieldChange };

  // ── minimal-line — 여백·헤어라인·센터 정렬 ─────────────────────────────────
  if (cover.templateId === "minimal-line") {
    return (
      <header className="rpt-cover flex flex-col items-center px-6 py-16 text-center @min-[640px]:py-24">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.34em]"
          style={{ color: "var(--rpt-primary)" }}
        >
          {KICKER}
        </p>
        {/* 수직 헤어라인 — 킥커에서 타이틀로 떨어지는 낙차 */}
        <span aria-hidden className="mt-6 h-10 w-px" style={{ background: "var(--rpt-primary)" }} />
        <EditableTitle
          {...shared}
          className="mt-7 text-[32px] font-bold leading-[1.18] tracking-[-0.015em] text-slate-900 @min-[640px]:text-[44px]"
        />
        <EditableSubtitle {...shared} className="mt-3 text-[15px] leading-relaxed text-slate-500" />
        <span aria-hidden className="mt-11 h-px w-16" style={{ background: "var(--rpt-line)" }} />
        <div className="mt-8">
          <MetaLineCentered cover={cover} />
        </div>
      </header>
    );
  }

  // ── photo-frame(id 불변) → 잉크 에디토리얼 — 좌하단 대형 타이포 + 폴리오 ────
  if (cover.templateId === "photo-frame") {
    return (
      <header
        className="rpt-cover overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--rpt-line)", background: "var(--rpt-surface)" }}
      >
        {/* 두꺼운 잉크 룰 — 매거진 폴리오의 인장 */}
        <div aria-hidden className="h-1" style={{ background: "var(--rpt-primary)" }} />
        <div className="flex min-h-[380px] flex-col px-7 pb-8 pt-6 @min-[640px]:min-h-[460px] @min-[640px]:px-11 @min-[640px]:pb-10 @min-[640px]:pt-7">
          <div className="flex items-baseline justify-between gap-4">
            <p
              className="text-[11px] font-bold uppercase tracking-[0.3em]"
              style={{ color: "var(--rpt-primary)" }}
            >
              {KICKER}
            </p>
            <p
              className="shrink-0 text-[11px] font-semibold tabular-nums tracking-[0.24em]"
              style={{ color: "var(--rpt-neutral)" }}
            >
              — 01
            </p>
          </div>
          {/* mt-auto = 좌하단 정렬. 여백이 타이틀의 무게를 만든다 */}
          <div className="mt-auto pt-20 @min-[640px]:pt-28">
            <EditableSubtitle
              {...shared}
              className="text-[13px] font-semibold tracking-[0.14em]"
              color="var(--rpt-neutral)"
            />
            <EditableTitle
              {...shared}
              className="mt-3 text-[38px] font-extrabold leading-[1.06] tracking-[-0.025em] @min-[640px]:text-[58px]"
              color="var(--rpt-primary)"
            />
          </div>
          <div className="mt-10 border-t pt-6" style={{ borderColor: "var(--rpt-line)" }}>
            <MetaGrid cover={cover} />
          </div>
        </div>
      </header>
    );
  }

  // ── gradient-band(기본) — 딥 컬러 밴드 + 백지 메타 그리드 ─────────────────
  return (
    <header
      className="rpt-cover overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--rpt-line)" }}
    >
      <div
        className="px-7 py-11 @min-[640px]:px-12 @min-[640px]:py-14"
        style={{
          background:
            "linear-gradient(150deg, var(--rpt-primary), color-mix(in srgb, var(--rpt-primary) 58%, black))",
        }}
      >
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-white/70">
            {KICKER}
          </p>
          {cover.dateLabel && (
            <p className="shrink-0 text-[11px] font-medium tabular-nums tracking-[0.18em] text-white/55">
              {cover.dateLabel}
            </p>
          )}
        </div>
        <div className="mt-10 @min-[640px]:mt-14">
          <EditableSubtitle
            {...shared}
            className="text-sm font-medium tracking-[0.04em]"
            color="rgba(255,255,255,0.78)"
          />
          <EditableTitle
            {...shared}
            className="mt-2 text-[34px] font-extrabold leading-[1.12] tracking-[-0.02em] @min-[640px]:text-[52px]"
            color="white"
          />
        </div>
      </div>
      <div className="bg-white px-7 py-6 @min-[640px]:px-12 @min-[640px]:py-7">
        <MetaGrid cover={cover} />
      </div>
    </header>
  );
}
