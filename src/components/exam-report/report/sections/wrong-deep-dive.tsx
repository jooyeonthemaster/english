"use client";

// ============================================================================
// 오답 심층 분석 섹션 — 문항별 임상 기록 카드 + 초과분 교정 요약 다이제스트
//
// 카드 문법(모든 카드가 같은 리듬을 반복한다 = 임상 기록):
//   헤더(번호 칩 + 유형 라벨 + 개념 태그 칩, 태그는 4개 캡 + "외 N") →
//   "무엇이 일어났나"(관찰, neutral 라벨) →
//   "이렇게 고친다"(처방, 테마 primary 좌보더) — mt-auto 로 카드 하단에 앵커.
//   그리드 짝 카드끼리 높이가 달라도 처방 블록이 행 바닥선에 정렬되어
//   남는 공간이 "관찰↔처방 사이 호흡"으로 읽힌다(하단 죽은 여백 제거).
// 밀도 강령: 동형 카드 상한 8 — 오답이 9문항 이상이면 앞 6문항만 풀 카드,
//   나머지는 [번호+유형+교정 포인트] 콤팩트 행 다이제스트(.rpt-scroll 보조,
//   인쇄 시 자동 전량 확장)로 접는다. 집계·캡은 전부 렌더에서(스키마 불변).
// AI 본문은 renderNarrative(** 강조 지원), 수치는 formatReportNumber.
// ============================================================================

import type { CSSProperties } from "react";
import type { WrongDeepDiveSection } from "@/lib/exam-report/report-schema";
import { formatReportNumber } from "../report-format";
import { renderNarrative } from "../report-narrative";
import { SectionShell, type ReportRenderMode } from "./section-shell";

interface Props {
  section: WrongDeepDiveSection;
  mode: ReportRenderMode;
  onChange?: (next: WrongDeepDiveSection) => void;
}

/** 동형 카드 반복 상한(밀도 강령 §1) — 이하면 전량 풀 카드 */
const CARD_ONLY_MAX = 8;
/** 상한 초과 시 풀 카드로 남길 문항 수(2컬럼 × 3행) */
const FULL_CARD_CAP = 6;
/** 카드당 개념 태그 표시 캡 */
const TAG_CAP = 4;

/** 카드 리빌 스태거 — 최대 5단(모션 규약) */
const revealDelay = (i: number): CSSProperties =>
  ({ "--reveal-delay": `${Math.min(i, 4) * 70}ms` }) as CSSProperties;

export function WrongDeepDiveSectionView({ section, mode, onChange }: Props) {
  // whatHappened·fixPoint 가 모두 비면 해설 없는 빈 껍데기 → 카드 미표시(껍데기 방지).
  const items = section.data.items.filter(
    (it) => it.whatHappened.trim().length > 0 || it.fixPoint.trim().length > 0,
  );
  // 캡: 8문항 이하 전량 카드 / 9문항+ 는 6카드 + 나머지 다이제스트.
  const cardItems = items.length > CARD_ONLY_MAX ? items.slice(0, FULL_CARD_CAP) : items;
  const digestItems = items.length > CARD_ONLY_MAX ? items.slice(FULL_CARD_CAP) : [];
  const twoColumns = cardItems.length >= 4;

  return (
    <SectionShell
      heading={section.heading}
      narrative={section.narrative}
      hidden={section.hidden}
      mode={mode}
      kicker="WRONG ANSWER DEEP DIVE"
      onPatch={(patch) => onChange?.({ ...section, ...patch })}
    >
      {items.length > 0 ? (
        <div className="flex flex-col gap-3">
          {/* 메타 라인 — 분석 규모를 수치로 먼저 선언(컨설팅 문서의 표본 명시) */}
          <p className="text-xs tabular-nums text-slate-400" data-reveal>
            {digestItems.length > 0
              ? `오답·부분점수 ${formatReportNumber(items.length)}문항 — 핵심 ${formatReportNumber(cardItems.length)}문항 심층 카드 + ${formatReportNumber(digestItems.length)}문항 교정 요약`
              : `오답·부분점수 ${formatReportNumber(items.length)}문항 심층 분석`}
          </p>
          <ul
            className={
              twoColumns
                ? "grid grid-cols-1 gap-3 @min-[44rem]:grid-cols-2"
                : "flex flex-col gap-3"
            }
          >
            {cardItems.map((item, i) => {
              const hasWhat = item.whatHappened.trim().length > 0;
              const hasFix = item.fixPoint.trim().length > 0;
              const visibleTags = item.conceptTags.slice(0, TAG_CAP);
              const hiddenTagCount = item.conceptTags.length - visibleTags.length;
              return (
                <li
                  key={`${item.number}-${i}`}
                  className="rpt-card flex flex-col rounded-xl border p-4"
                  style={{ borderColor: "var(--rpt-line)", ...revealDelay(i) }}
                  data-reveal
                >
                  {/* ── 헤더: 번호 + 유형 + 개념 태그(4개 캡) ─────────────────── */}
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <span
                      className="inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold tabular-nums text-white"
                      style={{ background: "var(--rpt-primary)" }}
                    >
                      {item.number}
                    </span>
                    <span
                      className="text-sm font-bold text-slate-800"
                      style={{ fontFamily: "var(--rpt-heading-font)" }}
                    >
                      {item.typeLabel}
                    </span>
                    {visibleTags.length > 0 && (
                      <span className="flex flex-wrap gap-1 @min-[640px]:ml-auto">
                        {visibleTags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-slate-500"
                            style={{
                              borderColor: "var(--rpt-line)",
                              background: "var(--rpt-tint)",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                        {hiddenTagCount > 0 && (
                          <span
                            className="rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium text-slate-400"
                            style={{ borderColor: "var(--rpt-line)" }}
                          >
                            외 {formatReportNumber(hiddenTagCount)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  {/* ── 본문 2단: 관찰 → 처방(카드 바닥 앵커) ───────────────────
                      처방 블록에 mt-auto — 그리드 짝 카드보다 본문이 짧아도
                      처방이 행 바닥선에 붙어 카드 하단 죽은 여백이 생기지 않는다.
                      pb-3 은 카드가 행의 최장 카드일 때의 최소 호흡. */}
                  <div className="mt-3 flex grow flex-col">
                    {hasWhat && (
                      <div className="pb-3">
                        <p className="text-[11px] font-bold tracking-[0.08em] text-slate-400">
                          무엇이 일어났나
                        </p>
                        <div className="mt-1 flex flex-col gap-1.5 text-sm leading-[1.8] text-slate-600">
                          {renderNarrative(item.whatHappened)}
                        </div>
                      </div>
                    )}
                    {hasFix && (
                      <div
                        className={`border-l-2 pl-3${hasWhat ? " mt-auto" : ""}`}
                        style={{ borderColor: "var(--rpt-primary)" }}
                      >
                        <p
                          className="text-[11px] font-bold tracking-[0.08em]"
                          style={{ color: "var(--rpt-primary)" }}
                        >
                          이렇게 고친다
                        </p>
                        <div className="mt-1 flex flex-col gap-1.5 text-sm leading-[1.8] text-slate-700">
                          {renderNarrative(item.fixPoint)}
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* ── 초과분 다이제스트 — 나머지 문항의 교정 포인트만 콤팩트 행으로.
              집계(카드→행 강등) 후 .rpt-scroll 보조. 인쇄 시 전량 확장. ── */}
          {digestItems.length > 0 && (
            <div
              className="rpt-card overflow-hidden rounded-xl border"
              style={{ borderColor: "var(--rpt-line)", ...revealDelay(4) }}
              data-reveal
            >
              <p
                className="border-b px-4 py-2.5 text-[11px] font-bold tracking-[0.08em] text-slate-400"
                style={{ borderColor: "var(--rpt-line)", background: "var(--rpt-tint)" }}
              >
                나머지 {formatReportNumber(digestItems.length)}문항 — 교정 포인트 요약
              </p>
              <ul
                className="rpt-scroll"
                style={{ "--rpt-scroll-max": "360px" } as CSSProperties}
              >
                {digestItems.map((item, i) => (
                  <li
                    key={`${item.number}-digest-${i}`}
                    className="flex items-start gap-2.5 border-t px-4 py-2.5 first:border-t-0"
                    style={{ borderColor: "var(--rpt-line)" }}
                  >
                    <span
                      className="mt-px inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded border px-1 text-[11px] font-bold tabular-nums text-slate-500"
                      style={{ borderColor: "var(--rpt-line)" }}
                    >
                      {item.number}
                    </span>
                    <div className="min-w-0">
                      <p
                        className="text-[13px] font-bold text-slate-700"
                        style={{ fontFamily: "var(--rpt-heading-font)" }}
                      >
                        {item.typeLabel}
                      </p>
                      <div className="mt-0.5 flex flex-col gap-1 text-[13px] leading-[1.7] text-slate-600">
                        {renderNarrative(
                          item.fixPoint.trim().length > 0 ? item.fixPoint : item.whatHappened,
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p
          className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-slate-400"
          style={{ borderColor: "var(--rpt-line)" }}
          data-reveal
        >
          이번 시험에는 심층 분석이 필요한 오답이 없습니다.
        </p>
      )}
    </SectionShell>
  );
}
