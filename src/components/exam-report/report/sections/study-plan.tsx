"use client";

// ============================================================================
// 학생 시험 리포트 — 학습 계획 섹션 (주차 레일 타임라인)
//
// 좌측 레일(시간 축) + 주차 번호 배지 + focus 헤드라인 + 체크박스 태스크.
// 체크박스는 장식이 아니라 실사용 도구다 — 인쇄 후 학생이 연필로 체크할 수 있는
// 크기(15px)·대비(1.5px 보더)로 그린다. 마지막 주는 "마무리 재점검" 태그 +
// 배지 링 + 레일 종지부(◆)로 계획의 마감 감각을 준다.
// 주차 카드는 .rpt-card — 인쇄 시 주 단위로 잘리지 않는 원자 블록.
// 밀도 강령: 배지 거터는 모바일 36px/sm↑ 44px 반응형, 태스크 문장은 break-keep
// (한국어 단어 절단 금지), 주 9개 초과 시 .rpt-scroll 캡, 태스크 5개↑ 2컬럼.
// ============================================================================

import type { CSSProperties } from "react";
import type { StudyPlanSection } from "@/lib/exam-report/report-schema";
import { SectionShell, type ReportRenderMode } from "./section-shell";

interface Props {
  section: StudyPlanSection;
  mode: ReportRenderMode;
  onChange?: (next: StudyPlanSection) => void;
}

type PlanWeek = StudyPlanSection["data"]["weeks"][number];

const revealDelay = (ms: number): CSSProperties =>
  ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;

function WeekItem({
  week,
  index,
  isLast,
}: {
  week: PlanWeek;
  index: number;
  isLast: boolean;
}) {
  // focus 가 헤드라인, label(1주차 …)은 메타 라인 — focus 부재 시 label 이 승격.
  const focus = week.focus.trim();
  const headline = focus || week.label.trim() || `${index + 1}주차`;
  const meta = focus ? week.label : "";
  // 태스크 5개 이상이면 sm↑ 2컬럼 그리드 — 한 주가 세로 벽이 되는 것을 막는다.
  const denseTasks = week.tasks.length >= 5;
  return (
    <li
      className="rpt-card relative print:mb-5"
      data-reveal
      style={revealDelay(Math.min(index, 4) * 80 + 120)}
    >
      {/* 주차 번호 배지 — 레일 위의 정거장. 마지막 주만 링으로 무게를 더한다.
          모바일(<sm)은 배지·거터를 한 단계 줄여 390px 본문 폭을 돌려준다 */}
      <span
        className="absolute -left-9 top-0 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold tabular-nums text-white @min-[640px]:-left-11 @min-[640px]:h-8 @min-[640px]:w-8 @min-[640px]:text-xs"
        style={{
          background: "var(--rpt-primary)",
          boxShadow: isLast
            ? "0 0 0 3px color-mix(in srgb, var(--rpt-primary) 22%, transparent)"
            : undefined,
        }}
        aria-hidden
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div
        className="rounded-xl border p-4"
        style={{
          borderColor: "var(--rpt-line)",
          background: isLast
            ? "color-mix(in srgb, var(--rpt-accent-soft) 45%, var(--rpt-surface))"
            : "var(--rpt-surface)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            {meta && (
              <p
                className="text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{ color: "var(--rpt-primary)" }}
              >
                {meta}
              </p>
            )}
            <p
              className={`break-keep break-words text-[15px] font-bold leading-snug text-slate-900 ${meta ? "mt-1" : ""}`}
            >
              {headline}
            </p>
          </div>
          {isLast && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{
                color: "var(--rpt-primary)",
                background: "color-mix(in srgb, var(--rpt-primary) 10%, transparent)",
              }}
            >
              마무리 재점검
            </span>
          )}
        </div>
        {week.tasks.length > 0 && (
          <ul
            className={`mt-3 flex flex-col gap-2 ${
              denseTasks ? "@min-[640px]:grid @min-[640px]:grid-cols-2 @min-[640px]:gap-x-6" : ""
            }`}
          >
            {week.tasks.map((task, ti) => (
              <li key={ti} className="flex items-start gap-2.5 text-sm leading-6 text-slate-700">
                {/* 인쇄 실사용 체크박스 — 손 체크가 들어갈 15px 빈 칸 */}
                <span
                  className="mt-[4.5px] h-[15px] w-[15px] shrink-0 rounded-[4px] border-[1.5px]"
                  style={{ borderColor: "var(--rpt-neutral)" }}
                  aria-hidden
                />
                {/* break-keep — 한국어 단어 중간 절단("체크리/스트") 방지,
                    break-words 가 극단 장단어의 가로 오버플로를 막는 안전핀 */}
                <span className="min-w-0 break-keep break-words">{task}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function StudyPlanSectionView({ section, mode, onChange }: Props) {
  const weeks = section.data.weeks;
  // 동형 카드 반복 상한(8) — 주차는 순차 계획이라 집계·칩 압축이 불가능한
  // 데이터이므로, 초과분은 계약이 허용한 보조 수단(.rpt-scroll)로 캡한다.
  // 인쇄는 .rpt-scroll 이 자동 전량 확장 + .rpt-card 원자 보호로 잘리지 않는다.
  const needsScroll = weeks.length > 8;
  return (
    <SectionShell
      heading={section.heading}
      narrative={section.narrative}
      hidden={section.hidden}
      mode={mode}
      kicker="STUDY PLAN"
      onPatch={(patch) => onChange?.({ ...section, ...patch })}
    >
      {weeks.length === 0 ? (
        <p className="text-sm text-slate-400">학습 계획이 아직 없습니다.</p>
      ) : (
        <div
          className={needsScroll ? "rpt-scroll" : undefined}
          style={
            needsScroll
              ? ({ "--rpt-scroll-max": "560px" } as CSSProperties)
              : undefined
          }
        >
          {/* pb-3 + 종지부 bottom-0 — 장식이 ol 박스 안에 머물러 스크롤 클립에 안전 */}
          <ol className="relative flex flex-col gap-5 pb-3 pl-9 @min-[640px]:pl-11 print:block">
            {/* 인쇄는 블록 플로우(조각화 안정) — 리듬은 li 의 print:mb-5 가 재현한다 */}
            {/* 레일 — 주차를 관통하는 시간 축. 배지 중심(모바일 14px/sm 16px)을 따라간다 */}
            <span
              className="absolute bottom-2 left-[13px] top-4 w-[2px] @min-[640px]:left-[15px]"
              style={{ background: "var(--rpt-line)" }}
              aria-hidden
            />
            {/* 종지부 — 계획의 끝을 찍는 마침표(◆) */}
            <span
              className="absolute bottom-0 left-[10.5px] h-[7px] w-[7px] rotate-45 @min-[640px]:left-[12.5px]"
              style={{ background: "var(--rpt-primary)" }}
              aria-hidden
            />
            {weeks.map((week, i) => (
              <WeekItem
                key={`${week.label}-${i}`}
                week={week}
                index={i}
                isLast={i === weeks.length - 1}
              />
            ))}
          </ol>
        </div>
      )}
    </SectionShell>
  );
}
