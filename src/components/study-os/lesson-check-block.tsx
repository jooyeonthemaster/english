"use client";

// ============================================================================
// 레슨의 확인 문항(CHECK · RECAP) — **서버 채점**.
//
// 이 문항들은 드릴 문항 뱅크와 동일 자산이므로 정답이 클라이언트에 없다.
// 기존 채점 경로(POST /api/grammar-drill/submit)를 그대로 재사용한다 →
// 레슨에서 푼 문항도 숙달도(EWMA·라이트너)와 단계 게이트에 그대로 반영된다.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ItemView } from "@/components/grammar-drill/item-views";
import { VerdictPanel } from "@/components/grammar-drill/verdict-panel";
import type { ClientItem, SubmitVerdict } from "@/lib/grammar-drill/payload";
import { BlockShell } from "./lesson-blocks";

export function CheckBlockView({
  blockType,
  title,
  items,
  onResult,
}: {
  blockType: "CHECK" | "RECAP";
  title?: string;
  items: ClientItem[];
  /** 문항 1개 채점될 때마다 호출 — 레슨 진행 저장에 누적된다 */
  onResult: (correct: boolean) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<SubmitVerdict | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 렌더 중 Date.now() 는 순수성 위반 — 마운트 후 채운다.
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, [idx]);

  const item = items[idx];
  const last = idx + 1 >= items.length;
  const finished = last && verdict !== null;

  async function submit() {
    if (draft === null || draft.trim() === "" || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/grammar-drill/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          answer: draft,
          timeMs: startedAt.current ? Date.now() - startedAt.current : 0,
          hintUsed: 0,
          conceptPeeked: false,
          source: "CONCEPT_CHECK",
        }),
      });
      const data = (await res.json()) as { ok: boolean; verdict?: SubmitVerdict };
      if (data.ok && data.verdict) {
        setVerdict(data.verdict);
        onResult(data.verdict.correct);
      }
    } catch {
      // 네트워크 실패 시 판정을 만들지 않는다(거짓 정답 금지)
    }
    setSubmitting(false);
  }

  function next() {
    if (last) return;
    setIdx((i) => i + 1);
    setDraft(null);
    setVerdict(null);
  }

  return (
    <BlockShell type={blockType} title={title}>
      {items.length > 1 && (
        <div className="gd-seg mb-3">
          {items.map((_, i) => (
            <i key={i} data-on={i < idx ? "done" : i === idx ? "true" : undefined} />
          ))}
        </div>
      )}

      <ItemView item={item} draft={draft} setDraft={setDraft} verdict={verdict} />

      {verdict && <VerdictPanel verdict={verdict} />}

      <div className="mt-4">
        {verdict ? (
          !finished ? (
            <button type="button" onClick={next} className="gd-btn gd-btn-primary w-full">
              다음 문항 ({idx + 2}/{items.length})
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </button>
          ) : (
            <p className="gd-t-xs text-center" style={{ color: "var(--gd-ink-3)" }}>
              확인 문항을 마쳤습니다. 아래에서 계속 진행하십시오.
            </p>
          )
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={draft === null || draft.trim() === "" || submitting}
            className="gd-btn gd-btn-primary w-full"
          >
            {submitting ? "채점 중…" : "제출하기"}
          </button>
        )}
      </div>
    </BlockShell>
  );
}
