"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ImageOff, SlidersHorizontal } from "lucide-react";

import {
  BOX_KIND_LABELS,
  CHOICE_ITEM_PATTERN_LABELS,
  CHOICE_LAYOUT_LABELS,
  MARKER_STYLE_LABELS,
} from "@/lib/custom-question-types/format-spec";
import type { CustomTypeSourcePayload } from "@/lib/custom-question-types/source-payload";
import type { CompiledCustomType } from "@/lib/custom-question-types/types";
import { cn } from "@/lib/utils";

import {
  ANNOTATION_CATEGORY_LABELS,
  ANNOTATION_CATEGORY_ORDER,
  ANSWER_SHAPE_KO,
  orderAnnotations,
  readSourceOptions,
  type NumberedAnnotation,
} from "./lab-types";

// 해부 분석 뷰 — 좌: 원본 크롭 이미지 + 영역 오버레이 / 우: 어노테이션·선지 해부·형식 요약 카드.
// 카드 hover ↔ 이미지 영역 하이라이트가 같은 번호로 동기화된다(읽기 전용, 편집은 스튜디오).

export function AnatomyView({
  source,
  spec,
  onGoStudio,
}: {
  source: CustomTypeSourcePayload;
  spec: CompiledCustomType;
  onGoStudio: () => void;
}) {
  const numbered = useMemo(() => orderAnnotations(source.annotations), [source.annotations]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const activeIdx = hoveredIdx ?? selectedIdx;
  const cardRefs = useRef(new Map<number, HTMLDivElement>());

  // 이미지 영역 클릭 → 해당 카드 선택 + 스크롤 동기화.
  const selectFromImage = useCallback((index: number) => {
    setSelectedIdx((prev) => (prev === index ? null : index));
    cardRefs.current.get(index)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const groups = useMemo(
    () =>
      ANNOTATION_CATEGORY_ORDER.map((category) => ({
        category,
        items: numbered.filter((n) => n.annotation.category === category),
      })).filter((g) => g.items.length > 0),
    [numbered],
  );

  const options = useMemo(() => readSourceOptions(source.analysis), [source.analysis]);
  const pinned = useMemo(() => numbered.filter((n) => n.annotation.region), [numbered]);

  return (
    <div className="flex h-full min-h-0">
      {/* ── 좌(55%): 원본 이미지 + 영역 오버레이 ── */}
      <div className="flex w-[55%] min-w-0 flex-col border-r border-slate-200 bg-slate-100/70">
        <div className="min-h-0 flex-1 overflow-auto p-6">
          {source.analysisJobId ? (
            <div className="relative mx-auto w-fit">
              {/* 인증 쿠키 기반 잡 이미지 — next/image 최적화 대상이 아니다. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/custom-question-types/analysis-jobs/${source.analysisJobId}/image`}
                alt="원본 문항 캡처"
                className="max-w-full rounded-md bg-white ring-1 ring-slate-200"
              />
              {pinned.map((n) => {
                const r = n.annotation.region;
                if (!r) return null;
                const active = activeIdx === n.index;
                return (
                  <button
                    key={n.index}
                    type="button"
                    onMouseEnter={() => setHoveredIdx(n.index)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => selectFromImage(n.index)}
                    title={n.annotation.title}
                    className={cn(
                      "absolute rounded-sm border-2 transition-colors",
                      active
                        ? "border-blue-600 bg-blue-500/10"
                        : "border-blue-500/60 hover:bg-blue-500/10",
                    )}
                    style={{
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.width * 100}%`,
                      height: `${r.height * 100}%`,
                    }}
                  >
                    <span
                      className={cn(
                        "absolute -left-2.5 -top-2.5 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow",
                        active ? "bg-blue-700" : "bg-blue-600",
                      )}
                    >
                      {n.index}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 text-slate-400">
              <ImageOff className="size-6" />
              <p className="text-[12.5px] font-semibold">원본 이미지 없음</p>
              <p className="text-[11px]">구버전 유형은 캡처 이미지가 저장되지 않았습니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── 우(45%): 어노테이션 카드 + 선지 해부 + 형식 요약 ── */}
      <div className="flex w-[45%] min-w-0 flex-col overflow-y-auto bg-white">
        <div className="space-y-6 p-4">
          {groups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-[12px] text-slate-400">
              해부 어노테이션이 없습니다. (v1 유형) 스튜디오에서 형식 스펙을 직접 조정하세요.
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.category}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {ANNOTATION_CATEGORY_LABELS[g.category]}
                </p>
                <div className="space-y-1.5">
                  {g.items.map((n) => (
                    <AnnotationCard
                      key={n.index}
                      item={n}
                      active={activeIdx === n.index}
                      onHover={setHoveredIdx}
                      onSelect={(i) => setSelectedIdx((prev) => (prev === i ? null : i))}
                      registerRef={(i, el) => {
                        if (el) cardRefs.current.set(i, el);
                        else cardRefs.current.delete(i);
                      }}
                    />
                  ))}
                </div>
              </section>
            ))
          )}

          {/* 선지 해부 */}
          {options.length > 0 ? (
            <section>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">선지 해부</p>
              <div className="space-y-1.5">
                {options.map((o, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-lg border p-2.5",
                      o.isCorrect ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">
                        {o.label || `#${i + 1}`}
                      </span>
                      <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-slate-800">{o.text}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold",
                          o.isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                        )}
                      >
                        {o.isCorrect ? "정답" : "오답"}
                      </span>
                    </div>
                    {o.rationale ? (
                      <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11px] leading-relaxed text-slate-500">
                        {o.rationale}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* 형식 요약 — workingSpec.format 을 사람이 읽는 카드로 */}
          <FormatSummary spec={spec} onGoStudio={onGoStudio} />
        </div>
      </div>
    </div>
  );
}

function AnnotationCard({
  item,
  active,
  onHover,
  onSelect,
  registerRef,
}: {
  item: NumberedAnnotation;
  active: boolean;
  onHover: (index: number | null) => void;
  onSelect: (index: number) => void;
  registerRef: (index: number, el: HTMLDivElement | null) => void;
}) {
  const hasRegion = !!item.annotation.region;
  return (
    <div
      ref={(el) => registerRef(item.index, el)}
      onMouseEnter={() => onHover(item.index)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(item.index)}
      className={cn(
        "cursor-pointer rounded-lg border p-2.5 transition-colors",
        active ? "border-blue-400 bg-blue-50/60" : "border-slate-200 bg-white hover:border-blue-200",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
            hasRegion ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500",
          )}
        >
          {item.index}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-800">
          {item.annotation.title || "(제목 없음)"}
        </span>
        {!hasRegion ? <span className="shrink-0 text-[10px] text-slate-300">영역 없음</span> : null}
      </div>
      {item.annotation.detail ? (
        <p className="mt-1 pl-7 text-[11.5px] leading-relaxed text-slate-600">{item.annotation.detail}</p>
      ) : null}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span className="shrink-0 text-[11px] font-bold text-slate-500">{label}</span>
      <span className="min-w-0 text-right text-[11.5px] leading-relaxed text-slate-800">{value}</span>
    </div>
  );
}

function FormatSummary({ spec, onGoStudio }: { spec: CompiledCustomType; onGoStudio: () => void }) {
  const f = spec.format;
  if (!f) return null;
  const choiceSummary = f.choices.present
    ? `${f.choices.count}개 · ${MARKER_STYLE_LABELS[f.choices.markerStyle]} · ${CHOICE_LAYOUT_LABELS[f.choices.layout]}${
        f.choices.itemPattern !== "TEXT" ? ` · ${CHOICE_ITEM_PATTERN_LABELS[f.choices.itemPattern]}` : ""
      }`
    : "없음";
  const subjective =
    f.answer.shape !== "MULTIPLE_CHOICE"
      ? [
          f.answer.subjective.answerLineCount > 0 ? `답란 ${f.answer.subjective.answerLineCount}줄` : "",
          f.answer.subjective.answerBlankCount > 0 ? `답 슬롯 ${f.answer.subjective.answerBlankCount}개` : "",
          f.answer.subjective.conditionsCount > 0 ? `조건 ${f.answer.subjective.conditionsCount}개` : "",
          f.answer.subjective.answerFormat,
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">형식 요약</p>
        <button
          type="button"
          onClick={onGoStudio}
          className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-100"
        >
          <SlidersHorizontal className="size-3" />
          스튜디오에서 조정
        </button>
      </div>
      <div className="space-y-1.5">
        <SummaryRow label="선지" value={choiceSummary} />
        <SummaryRow
          label="정답"
          value={`${ANSWER_SHAPE_KO[f.answer.shape] ?? f.answer.shape} · 정답 ${f.answer.correctCount}개${
            f.answer.multipleAnswers ? " · 복수 정답" : ""
          }`}
        />
        <SummaryRow
          label="빈칸 / 밑줄"
          value={`빈칸 ${f.stimulus.blanks.count}개 · 밑줄 ${f.stimulus.underlineMarks.count}개${
            f.stimulus.underlineMarks.target ? ` (${f.stimulus.underlineMarks.target})` : ""
          }`}
        />
        <SummaryRow
          label="박스"
          value={
            f.boxes.length > 0
              ? f.boxes
                  .map((b) => `${BOX_KIND_LABELS[b.kind]}${b.label.trim() ? `(${b.label.trim()})` : ""}`)
                  .join(", ")
              : "없음"
          }
        />
        {subjective ? <SummaryRow label="서술형 답란" value={subjective} /> : null}
        {f.layoutNotes.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="mb-1 text-[11px] font-bold text-slate-500">형식 디테일 노트</p>
            <ul className="space-y-0.5">
              {f.layoutNotes.map((note, i) => (
                <li key={i} className="text-[11.5px] leading-relaxed text-slate-700">
                  • {note}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
