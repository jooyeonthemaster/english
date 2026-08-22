"use client";

// ============================================================================
// 클래스 스튜디오 — 모듈 미리보기 시트 (docs/class-studio-spec.md §3.4 B)
//
// getStudioModulePreview(실서빙과 동일 조립)의 첫 문항들을 디렉터용 읽기 전용으로
// 렌더한다 — 정답 노출 OK(파랑 강조). StudyItem 유니온을 유형별로 안전 분기하고,
// 모르는 유형은 JSON 을 노출하지 않고 "미리보기를 지원하지 않는 유형"으로 표기.
// ============================================================================

import { useEffect, useState } from "react";
import { Check, Eye, Loader2 } from "lucide-react";
import { getStudioModulePreview } from "@/actions/studio/deploy";
import { WideModal } from "@/components/layout/wide-modal";
import { STUDIO_MODULE_BY_ID, type StudioModuleId } from "@/lib/studio/modules";
import type { StudyItem } from "@/lib/worksheet-study/types";

// ── StudyItem 안전 분기 ──────────────────────────────────────────────────────

const KNOWN_TYPES = new Set<string>([
  "read",
  "flash",
  "mc",
  "match",
  "order",
  "sentence-order",
  "cloze",
  "ox",
  "inline-choice",
  "self-grade",
  "typing",
]);

/** unknown → StudyItem — type 판별자만 검증하고 유형별 렌더러가 옵셔널 접근한다. */
function asStudyItem(raw: unknown): StudyItem | null {
  if (!raw || typeof raw !== "object") return null;
  const t = (raw as { type?: unknown }).type;
  if (typeof t !== "string" || !KNOWN_TYPES.has(t)) return null;
  return raw as StudyItem;
}

const TYPE_LABELS: Record<StudyItem["type"], string> = {
  read: "통독",
  flash: "어휘 카드",
  mc: "선택형",
  match: "짝맞추기",
  order: "어순 배열",
  "sentence-order": "문장 순서",
  cloze: "빈칸",
  ox: "OX",
  "inline-choice": "택일",
  "self-grade": "해석 쓰기",
  typing: "쓰기",
};

// ── 공용 소품 ────────────────────────────────────────────────────────────────

function AnswerLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1 text-xs font-semibold text-blue-600 break-keep">
      <Check className="h-3.5 w-3.5 shrink-0" />
      정답 · {children}
    </p>
  );
}

function Explanation({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="mt-1.5 text-xs leading-relaxed text-slate-400 break-keep">{text}</p>;
}

// ── 유형별 읽기 전용 렌더 ────────────────────────────────────────────────────

function ItemBody({ item }: { item: StudyItem }) {
  switch (item.type) {
    case "read":
      return (
        <div>
          <p className="text-[13px] leading-relaxed text-slate-800">{item.en}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{item.ko}</p>
        </div>
      );
    case "flash":
      return (
        <div>
          <p className="text-[13px] font-semibold text-slate-800">{item.front}</p>
          <AnswerLine>{item.back}</AnswerLine>
          {item.sub && <p className="mt-1 text-xs text-slate-400">{item.sub}</p>}
        </div>
      );
    case "mc":
      return (
        <div>
          <p className="text-[13px] leading-relaxed text-slate-800 break-keep">
            {item.prompt}
          </p>
          <ul className="mt-2 space-y-1">
            {item.choices.map((c) => {
              const isAnswer = c.label === item.answerLabel;
              return (
                <li
                  key={c.label}
                  className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[13px] ${
                    isAnswer
                      ? "bg-blue-50 font-semibold text-blue-700"
                      : "text-slate-600"
                  }`}
                >
                  <span className="shrink-0">{c.label}.</span>
                  <span className="min-w-0 break-keep">{c.text}</span>
                  {isAnswer && (
                    <Check className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                  )}
                </li>
              );
            })}
          </ul>
          <Explanation text={item.explanation} />
        </div>
      );
    case "match":
      return (
        <div>
          <p className="text-xs font-medium text-slate-400">
            {item.leftHead} ↔ {item.rightHead}
          </p>
          <ul className="mt-1.5 space-y-1">
            {item.left.map((l, i) => (
              <li key={`${l}-${i}`} className="text-[13px] text-slate-700">
                {l}
                <span className="mx-1.5 text-slate-300">→</span>
                <span className="font-semibold text-blue-600">
                  {item.right[item.answer[i] ?? -1] ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "order":
      return (
        <div>
          {item.ko && <p className="text-xs text-slate-500 break-keep">{item.ko}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {item.tiles.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
              >
                {t}
              </span>
            ))}
          </div>
          <AnswerLine>{item.answer}</AnswerLine>
        </div>
      );
    case "sentence-order":
      return (
        <div>
          {item.given && (
            <p className="text-[13px] leading-relaxed text-slate-700">{item.given.en}</p>
          )}
          <ul className="mt-1.5 space-y-1">
            {item.cards.map((c) => (
              <li key={c.label} className="text-[13px] text-slate-600">
                <span className="font-semibold text-slate-800">{c.label}.</span> {c.en}
              </li>
            ))}
          </ul>
          <AnswerLine>{item.answer}</AnswerLine>
        </div>
      );
    case "cloze":
      return (
        <div>
          {item.cue && <p className="text-xs text-slate-500 break-keep">{item.cue}</p>}
          <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
            {item.segments.map((seg, i) =>
              "t" in seg ? (
                <span key={i}>{seg.t}</span>
              ) : (
                <span
                  key={i}
                  className="mx-0.5 inline-block min-w-[2.5rem] border-b-2 border-blue-300 text-center"
                >
                  ____
                </span>
              ),
            )}
          </p>
          <AnswerLine>{item.answerKey.join(", ")}</AnswerLine>
        </div>
      );
    case "ox":
      return (
        <div>
          <p className="text-[13px] leading-relaxed text-slate-700">{item.statement}</p>
          <AnswerLine>
            {item.wrong ? "X" : "O"}
            {item.wrong && item.fixFrom && item.fixTo && (
              <span className="font-medium text-slate-500">
                ({item.fixFrom} → {item.fixTo})
              </span>
            )}
          </AnswerLine>
          <Explanation text={item.explanation} />
        </div>
      );
    case "inline-choice":
      return (
        <div>
          <p className="text-[13px] leading-relaxed text-slate-700">
            {item.before}{" "}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
              {item.options.join(" / ")}
            </span>{" "}
            {item.after}
          </p>
          <AnswerLine>{item.answer}</AnswerLine>
          <Explanation text={item.explanation} />
        </div>
      );
    case "self-grade":
      return (
        <div>
          <p className="text-[13px] leading-relaxed text-slate-800">{item.en}</p>
          <AnswerLine>{item.modelKo}</AnswerLine>
        </div>
      );
    case "typing":
      return (
        <div>
          <p className="text-[13px] leading-relaxed text-slate-700 break-keep">
            {item.promptKo}
          </p>
          <AnswerLine>{item.answer}</AnswerLine>
        </div>
      );
  }
}

// ── 시트 본체 ────────────────────────────────────────────────────────────────

interface PreviewResult {
  /** 어느 모듈의 응답인지 — 현재 열린 모듈과 다르면 무시(이전 응답 잔상 차단) */
  moduleId: StudioModuleId;
  error: string | null;
  stageTitle: string | null;
  items: unknown[];
}

export function ModulePreviewSheet({
  passageId,
  moduleId,
  onClose,
}: {
  passageId: string;
  /** null = 닫힘 */
  moduleId: StudioModuleId | null;
  onClose: () => void;
}) {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const moduleLabel = moduleId ? (STUDIO_MODULE_BY_ID.get(moduleId)?.label ?? "") : "";

  useEffect(() => {
    if (!moduleId) return;
    let cancelled = false;
    void getStudioModulePreview({ passageId, moduleId }).then((res) => {
      if (cancelled) return;
      if (!res.success || !res.data) {
        setResult({
          moduleId,
          error: res.error ?? "미리보기에 실패했습니다.",
          stageTitle: null,
          items: [],
        });
        return;
      }
      setResult({
        moduleId,
        error: null,
        stageTitle: res.data.stageTitle,
        items: res.data.items,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [moduleId, passageId]);

  const state = result && result.moduleId === moduleId ? result : null;
  const loading = moduleId !== null && state === null;

  return (
    <WideModal
      open={moduleId !== null}
      onClose={onClose}
      icon={Eye}
      title={`${moduleLabel} 미리보기`}
      description="학생이 보는 것과 동일한 문항입니다 — 정답이 함께 표시됩니다"
      maxWidthClassName="max-w-[720px]"
    >
      <div className="p-4 md:p-5">
        {loading || !state ? (
          <div className="flex flex-col items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <p className="mt-3 text-xs text-slate-400">문항을 불러오고 있습니다</p>
          </div>
        ) : state.error ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 break-keep">
            {state.error}
          </p>
        ) : (
          <div className="space-y-3">
            {state.stageTitle && (
              <p className="text-xs font-semibold text-slate-400">{state.stageTitle}</p>
            )}
            {state.items.map((raw, idx) => {
              const item = asStudyItem(raw);
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-300">{idx + 1}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      {item ? TYPE_LABELS[item.type] : "기타"}
                    </span>
                  </div>
                  {item ? (
                    <ItemBody item={item} />
                  ) : (
                    <p className="text-xs text-slate-400">
                      미리보기를 지원하지 않는 유형입니다
                    </p>
                  )}
                </div>
              );
            })}
            {state.items.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
                표시할 문항이 없습니다
              </p>
            )}
          </div>
        )}
      </div>
    </WideModal>
  );
}
