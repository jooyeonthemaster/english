"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  difficultyBadgeClass,
  koSourceLabel,
} from "@/lib/korean-exam-passages/format";
import { subGenreBadgeClass } from "@/lib/suneung-wanseong/format";
import type { KoPassage } from "@/lib/korean-exam-passages/types";

/** 연계된 기출 지문 원문 + 분석 모달. */
export function ExamPassageModal({
  examId,
  fetchExam,
  onClose,
}: {
  examId: string;
  fetchExam: (id: string) => Promise<KoPassage | null>;
  onClose: () => void;
}) {
  const [passage, setPassage] = useState<KoPassage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    let cancelled = false;
    fetchExam(examId)
      .then((p) => {
        if (cancelled) return;
        setPassage(p);
        setError(p ? null : "기출 지문을 불러오지 못했습니다.");
      })
      .catch(() => {
        if (!cancelled) {
          setPassage(null);
          setError("기출 지문을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, fetchExam, requestVersion]);

  const retry = () => {
    setPassage(null);
    setError(null);
    setLoading(true);
    setRequestVersion((version) => version + 1);
  };

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab" && dialogRef.current) {
        trapFocus(dialogRef.current, e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  const a = passage?.analysis;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          연계 기출 지문 원문 및 분석
        </h2>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
              기출
            </span>
            {passage ? (
              <>
                <span className="truncate text-[13px] font-bold text-slate-800">
                  {koSourceLabel(passage.board)} {passage.year} {passage.siheng}{" "}
                  국어 [{passage.qFrom}~{passage.qTo}]
                </span>
                {passage.subGenre ? (
                  <span
                    className={
                      "inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-bold " +
                      subGenreBadgeClass(passage.subGenre)
                    }
                  >
                    {passage.subGenre}
                  </span>
                ) : null}
                {passage.difficulty ? (
                  <span
                    className={
                      "inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-bold " +
                      difficultyBadgeClass(passage.difficulty)
                    }
                  >
                    {passage.difficulty}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-slate-400">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : !passage ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p role="alert" className="text-[13px] text-slate-500">
                {error ?? "기출 지문을 불러오지 못했습니다."}
              </p>
              <button
                type="button"
                onClick={retry}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <>
              {a ? (
                <section className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                  <p className="text-[12.5px] font-bold text-slate-800">
                    {a["핵심주제"]}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
                    {a["요약"]}
                  </p>
                </section>
              ) : null}
              <section>
                <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  기출 지문 원문
                </h3>
                <p className="whitespace-pre-wrap text-[13px] leading-[1.85] text-slate-700">
                  {passage.passageText}
                </p>
              </section>
              {a?.["핵심개념"]?.length ? (
                <section>
                  <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    핵심 개념
                  </h3>
                  <ul className="space-y-1">
                    {a["핵심개념"].map((c, i) => (
                      <li key={i} className="text-[12px] text-slate-700">
                        <span className="font-semibold">{c["용어"]}</span> —{" "}
                        {c["정의"]}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function trapFocus(container: HTMLElement, event: KeyboardEvent) {
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden") && element.offsetParent !== null);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
