"use client";

// ============================================================================
// 학생 분석 킷 — 허브 3탭(학습지·시험·어법) 공용 프리미티브 정본
// (docs/director-console-v3-design.md §D1 골격 규칙 R1~R10)
//
// study-analytics-tab 로컬 구현의 승격(값 변경 없이 이동)과 골격 신설분.
// 이 디렉터리(hub/analytics/*)는 도메인 카탈로그(STUDY_STAGE_META·
// GRAMMAR_TYPE_LABEL 등)를 직접 임포트하지 않는다 — 라벨·문구는 전부 props
// 주입(오염 방어). 해석기 계약은 lib/student-analytics/types.ts 참조.
// ============================================================================

import { useId } from "react";
import {
  CheckCircle2,
  Circle,
  Info,
  RefreshCw,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── 시각 포매터 (KST 고정) ──────────────────────────────────────────────────

/** "7/20 14:32" — 서울(UTC+9 고정) 절대 시각 */
const KST_OFFSET = 9 * 3_600_000;
export function fmtAt(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t + KST_OFFSET);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hh}:${mm}`;
}

/** "14:32:05" — 마지막 갱신 시각(KST) */
export function fmtClock(ms: number): string {
  const d = new Date(ms + KST_OFFSET);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** "7/20 14:32:05" — 문항 상세용 초 단위 절대 시각 */
export function fmtAtSec(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t + KST_OFFSET);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hh}:${mm}:${ss}`;
}

/** "14:32" — 압축 그룹의 시간 범위 표기용(같은 날 전제) */
export function fmtHm(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t + KST_OFFSET);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function fmtDuration(ms: number): string {
  if (ms <= 0) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "1분 미만";
  if (min >= 60) return `${Math.floor(min / 60)}시간 ${min % 60}분`;
  return `${min}분`;
}

/** 문항 소요 시간 — 초 단위(문항은 대개 수 초~수십 초) */
export function fmtSpent(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return "1초 미만";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}초`;
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

/** "7/11" — 배포일 구분자 */
export function fmtDay(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const d = new Date(t + KST_OFFSET);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// ── 점수 톤 ─────────────────────────────────────────────────────────────────

/** 점수 3단 톤 — <50 취약(rose) / <80 보통(blue) / 이상 안정(emerald) */
export function scoreText(score: number): string {
  if (score < 50) return "text-rose-600";
  if (score < 80) return "text-blue-600";
  return "text-emerald-600";
}

export function scoreBar(score: number): string {
  if (score < 50) return "bg-rose-500";
  if (score < 80) return "bg-blue-600";
  return "bg-emerald-500";
}

/**
 * 정답률·숙달도(0~100) → 히트 셀 톤 5단(80/60/40/20) — 규칙 R4.
 * masteryHeatClass(lib/grammar-drill/display.ts)와 동일 임계, emerald→rose.
 * "낮을수록 붉다"가 3탭 공통 의미. 시도 없음은 슬레이트. 주황/앰버 금지.
 */
export function heatToneByRate(rate: number, attempts = 1): string {
  if (attempts <= 0) return "bg-slate-100 text-slate-400";
  if (rate >= 80) return "bg-emerald-600 text-white";
  if (rate >= 60) return "bg-emerald-400 text-white";
  if (rate >= 40) return "bg-emerald-200 text-emerald-900";
  if (rate >= 20) return "bg-rose-200 text-rose-900";
  return "bg-rose-400 text-white";
}

// ── 정오 아이콘 ─────────────────────────────────────────────────────────────

/** 정오 아이콘 — 무판정(통독·카드)은 회색 원 */
export function VerdictIcon({ correct, className }: { correct: boolean | null; className?: string }) {
  if (correct === true) {
    return (
      <CheckCircle2
        className={cn("shrink-0 text-emerald-500", className)}
        strokeWidth={2}
        aria-label="정답"
      />
    );
  }
  if (correct === false) {
    return (
      <XCircle className={cn("shrink-0 text-rose-500", className)} strokeWidth={2} aria-label="오답" />
    );
  }
  return (
    <Circle
      className={cn("shrink-0 text-slate-300", className)}
      strokeWidth={2}
      aria-label="채점 없음"
    />
  );
}

// ── 카드 셸 (규칙 R2 — 분석 카드는 이 셸만) ─────────────────────────────────

export function AnalyticsCard({
  icon,
  title,
  aside,
  toolbar,
  className,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
  /** 헤더 아래 고정 툴바(필터 등) — 스크롤 영역 밖 */
  toolbar?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
          {icon}
          {title}
        </span>
        {aside}
      </header>
      {toolbar ? (
        <div className="flex shrink-0 items-center justify-end border-b border-slate-100 px-3 py-2">
          {toolbar}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">{children}</div>
    </section>
  );
}

export function CardEmpty({ text }: { text: string }) {
  return <p className="py-8 text-center text-[13px] text-slate-400">{text}</p>;
}

/** 탭 전체 빈 상태 — dashed + 아이콘 + 배포 CTA(규칙 R9: CTA 를 항상 둔다) */
export function TabEmpty({
  icon: Icon,
  title,
  description,
  cta,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** 배포 CTA — 링크·버튼 노드(워딩은 director-glossary 소관) */
  cta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-14",
        className,
      )}
    >
      <Icon className="size-9 text-slate-300" strokeWidth={1.5} aria-hidden />
      <p className="text-[13.5px] font-medium text-slate-500">{title}</p>
      {description ? <p className="text-[13px] text-slate-400">{description}</p> : null}
      {cta ? <div className="mt-2">{cta}</div> : null}
    </div>
  );
}

// ── 스코프 필터 (규칙 [B] — 칩 가로 스크롤 행) ──────────────────────────────

export function FilterChip({
  label,
  title,
  count,
  active,
  onClick,
}: {
  label: string;
  title?: string;
  /** 첫 시도 오답 수 — 0이면 배지 미표시 */
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors",
        active
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      )}
    >
      <span className="max-w-[200px] truncate">{label}</span>
      {count > 0 ? (
        <span
          className={cn(
            "rounded-full px-1.5 text-[11px] font-bold tabular-nums",
            active ? "bg-blue-100 text-blue-700" : "bg-rose-50 text-rose-600",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** 칩 가로 스크롤 행 — 좌측 캡션 + FilterChip 나열(탭 전체 계산 범위 필터) */
export function FilterChipRow({
  icon,
  label,
  ariaLabel,
  children,
  className,
}: {
  icon?: React.ReactNode;
  /** 좌측 고정 캡션("학습지"·"시험 구분" 등) */
  label: string;
  /** 미지정 시 "{label} 필터" */
  ariaLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2",
        className,
      )}
    >
      <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold text-slate-500">
        {icon}
        {label}
      </span>
      <div
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5"
        role="group"
        aria-label={ariaLabel ?? `${label} 필터`}
      >
        {children}
      </div>
    </div>
  );
}

// ── 세그먼트 (규칙 R3 — pill 형 단일 정본) ──────────────────────────────────

export interface SegmentPillOption<V extends string = string> {
  value: V;
  label: string;
  /** 우측 카운트 배지 — 0·null 이면 미표시 */
  count?: number | null;
}

export function SegmentPills<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: readonly SegmentPillOption<V>[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5", className)}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
            value === opt.value
              ? "bg-white text-blue-700 shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          {opt.label}
          {opt.count ? (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                value === opt.value
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-400",
              )}
            >
              {opt.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

// ── 갱신 스트립 (규칙 R6 — 폴링 UI 단일 정본) ──────────────────────────────

/** 마지막 갱신 시각 + 수동 갱신 버튼 + 갱신 실패(stale) 배지 */
export function RefreshStrip({
  fetchedAt,
  error,
  onRefresh,
  className,
}: {
  /** usePollingAction 의 fetchedAt — null 이면 시각 미표기 */
  fetchedAt: number | null;
  /** 갱신 실패 메시지 — 있으면 stale 배지 표기(이전 데이터 유지 전제) */
  error?: string | null;
  onRefresh: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {error ? (
        <span className="text-[12px] text-rose-500">갱신 실패 — 이전 데이터 표시 중</span>
      ) : null}
      {fetchedAt != null ? (
        <span className="text-[12px] tabular-nums text-slate-400">
          마지막 갱신 {fmtClock(fetchedAt)}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRefresh}
        title="지금 갱신"
        className="inline-flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
      >
        <RefreshCw className="size-3.5" aria-hidden />
        <span className="sr-only">지금 갱신</span>
      </button>
    </div>
  );
}

// ── 행 프리미티브 ───────────────────────────────────────────────────────────

/** 랭킹 행 — 취약 단어류 목록의 공통 골격(제목·부제·rose 배지·보조 수치) */
export function RankingRow({
  primary,
  secondary,
  badge,
  aside,
  primaryClassName,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  /** rose 배지(보충 필요 톤 — 규칙 R5) */
  badge?: React.ReactNode;
  aside?: React.ReactNode;
  /** primary 추가 톤(예: 단어는 font-serif) */
  primaryClassName?: string;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[14px] font-semibold text-slate-900", primaryClassName)}>
          {primary}
        </p>
        {secondary != null ? (
          <p className="truncate text-[12px] text-slate-500">{secondary}</p>
        ) : null}
      </div>
      {badge != null ? (
        <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-rose-600">
          {badge}
        </span>
      ) : null}
      {aside != null ? (
        <span className="shrink-0 text-[12px] tabular-nums text-slate-400">{aside}</span>
      ) : null}
    </li>
  );
}

/** 지표 바 행 — 라벨 + 진행 바(scoreBar 톤) + 우측 수치 */
export function MetricBar({
  label,
  value,
  aside,
  labelClassName,
  asideClassName,
}: {
  label: React.ReactNode;
  /** 0~100 — 바 폭·색 공통 스케일(scoreBar/scoreText) */
  value: number;
  /** 우측 수치 영역 — 미지정 시 "{value}%" 단독 */
  aside?: React.ReactNode;
  labelClassName?: string;
  asideClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("w-[72px] shrink-0 text-[13px] text-slate-600", labelClassName)}>
        {label}
      </span>
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span
          className={cn("block h-full rounded-full", scoreBar(value))}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </span>
      <span
        className={cn(
          "w-24 shrink-0 text-right text-[12px] tabular-nums text-slate-500",
          asideClassName,
        )}
      >
        {aside ?? (
          <span className={cn("text-[13px] font-bold", scoreText(value))}>{value}%</span>
        )}
      </span>
    </div>
  );
}

/** 상세 팝업의 라벨-값 행 */
export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="w-[68px] shrink-0 text-[12px] text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-[13px] text-slate-700">{value}</span>
    </div>
  );
}

// ── 히트 셀 (규칙 R4 — heatToneByRate 5단) ─────────────────────────────────

export function HeatCell({
  rate,
  attempts,
  label,
  title,
  onClick,
  className,
}: {
  /** 정답률·숙달도 0~100 */
  rate: number;
  /** 시도 수 — 0 이면 슬레이트(기록 없음) */
  attempts: number;
  /** 셀 내 표기 — 미지정 시 "{rate}%"(기록 없으면 "—") */
  label?: React.ReactNode;
  title?: string;
  /** 지정 시 클릭 가능한 셀(팝오버 트리거 등) */
  onClick?: () => void;
  className?: string;
}) {
  const tone = heatToneByRate(rate, attempts);
  const content = label ?? (attempts > 0 ? `${Math.round(rate)}%` : "—");
  const base =
    "inline-flex h-7 min-w-12 items-center justify-center rounded px-1.5 text-[12px] font-semibold tabular-nums";
  if (onClick) {
    return (
      <button
        type="button"
        title={title}
        onClick={onClick}
        className={cn(base, tone, "transition-opacity hover:opacity-85", className)}
      >
        {content}
      </button>
    );
  }
  return (
    <span title={title} className={cn(base, tone, className)}>
      {content}
    </span>
  );
}

// ── 지표 도움말 (규칙 R10 — 첫 노출 카드의 ⓘ) ─────────────────────────────

/**
 * ⓘ 툴팁 — 호버·포커스 시 설명 노출(외부 라이브러리 없이 자체 렌더).
 *
 * 위쪽으로 펼친다(bottom-full): 이 ⓘ 는 대부분 AnalyticsCard 헤더나 표 헤더에
 * 붙는데, 아래로 펼치면 카드 본문의 `overflow-y-auto`/카드 셸의 `overflow-hidden`
 * 에 잘려 정작 설명이 가장 필요한 화면(행이 한두 개뿐인 신규 학생)에서 읽히지
 * 않았다. 헤더 위는 카드 여백이라 잘리지 않는다.
 *
 * `label` 을 주면 보조기술에도 "무엇의 설명인지"가 전달된다 — 라벨 없이 "지표 설명"
 * 만 읽히면 같은 화면에 ⓘ 가 여럿일 때 구분이 안 된다.
 */
export function MetricHelpTip({
  text,
  label,
  className,
}: {
  text: string;
  /** 이 ⓘ 가 설명하는 지표 이름 — 버튼 접근성 이름에 합쳐진다 */
  label?: string;
  className?: string;
}) {
  const tipId = useId();
  return (
    <span className={cn("group relative inline-flex", className)}>
      <button
        type="button"
        aria-label={label ? `${label} 설명` : "지표 설명"}
        aria-describedby={tipId}
        className="inline-flex items-center text-slate-300 transition-colors hover:text-slate-500 focus-visible:text-slate-500 focus:outline-none"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-56 -translate-x-1/2 rounded-md bg-slate-800 px-2.5 py-1.5 text-left text-[11.5px] font-normal leading-relaxed text-white shadow-lg group-focus-within:block group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}
