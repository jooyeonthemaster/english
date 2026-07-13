"use client";

// 개념 학습 — 개념 카드 페이저(1카드=1개념) → 마지막에 개념 체크 진입.
// 카드 본문은 드릴의 개념 시트와 동일 컴포넌트(ConceptCardBody) 재사용.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronLeft, MessageCircleQuestion } from "lucide-react";
import type { GrammarConcept } from "@/lib/grammar-drill/types";
import { ConceptCardBody, ChatSheet } from "@/components/grammar-drill/sheets";

export function LearnClient({
  unit,
  concepts,
}: {
  unit: { id: string; title: string; subtitle: string };
  concepts: GrammarConcept[];
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  if (concepts.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
          이 유닛의 개념 카드가 아직 준비되지 않았습니다.
        </p>
        <button
          type="button"
          onClick={() => router.push(`/g/unit/${unit.id}`)}
          className="gd-btn gd-btn-ghost"
        >
          유닛으로
        </button>
      </div>
    );
  }

  const concept = concepts[idx];
  const last = idx === concepts.length - 1;

  function go(delta: number) {
    const next = idx + delta;
    if (next < 0 || next >= concepts.length) return;
    setIdx(next);
    mainRef.current?.scrollTo({ top: 0 });
  }

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex h-10 items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/g/unit/${unit.id}`)}
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full"
            style={{ color: "var(--gd-ink-2)" }}
            aria-label="유닛으로"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} />
          </button>
          <p className="gd-t-sm min-w-0 flex-1 truncate font-semibold">
            {unit.title} — 개념 학습
          </p>
          <p className="gd-mono gd-t-xs shrink-0 font-semibold" style={{ color: "var(--gd-ink-2)" }}>
            {idx + 1}
            <span style={{ color: "var(--gd-ink-3)" }}>/{concepts.length}</span>
          </p>
        </div>
        {/* 개념 페이저 도트 */}
        <div className="flex gap-1.5 pb-1 pt-1">
          {concepts.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setIdx(i);
                mainRef.current?.scrollTo({ top: 0 });
              }}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{
                background: i <= idx ? "var(--gd-blue)" : "var(--gd-line)",
              }}
              aria-label={`개념 ${i + 1}`}
            />
          ))}
        </div>
      </header>

      <main ref={mainRef} className="gd-scroll flex-1 px-5 pb-6 pt-3">
        <ConceptCardBody concept={concept} />
      </main>

      <footer className="gd-hairline-t gd-safe-b shrink-0 bg-white px-4 pt-2.5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="gd-t-2xs flex h-11 items-center gap-1.5 rounded-xl border px-3 font-semibold"
            style={{ borderColor: "var(--gd-line)", color: "var(--gd-ink-2)" }}
          >
            <MessageCircleQuestion className="h-4 w-4" strokeWidth={1.75} />
            질문
          </button>
          {idx > 0 && (
            <button type="button" onClick={() => go(-1)} className="gd-btn gd-btn-ghost">
              이전
            </button>
          )}
          {last ? (
            <button
              type="button"
              onClick={() =>
                router.push(`/g/drill?mode=concept_check&unitId=${unit.id}`)
              }
              className="gd-btn gd-btn-primary flex-1"
            >
              개념 체크 {Math.min(concepts.length, 4)}문항 풀기
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </button>
          ) : (
            <button type="button" onClick={() => go(1)} className="gd-btn gd-btn-primary flex-1">
              다음 개념
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </button>
          )}
        </div>
      </footer>

      {chatOpen && (
        <ChatSheet
          conceptId={concept.id}
          revealAllowed={true}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
