"use client";

// ============================================================================
// 단어 훈련 — 제출 후 판정 패널: 정오 배너 + 정답 공개 + 함정 노트 + 예문 +
// 숙달도 미터 + 라이트너 상자 + 다음 복습 예정. (어법 verdict-panel.tsx 대응)
// ============================================================================

import { Check, X } from "lucide-react";
import { useMinuteNow } from "@/app/g/tasks/task-card";
import type { VocabItemType, VocabSubmitVerdict } from "@/lib/vocab-drill/payload";
import {
  VOCAB_POS_LABELS,
  VOCAB_STAGE_LABELS,
  VOCAB_TRAP_KIND_LABELS,
} from "@/lib/vocab-drill/display";

/** engine.ts MASTERED_SCORE 와 동일 임계 — 표시 전용(서버 정본은 engine). */
const MASTERED_SCORE = 80;

function relativeDue(dueAt: string | null, now: Date | null): string | null {
  if (!dueAt || !now) return null;
  const diffMs = new Date(dueAt).getTime() - now.getTime();
  if (!Number.isFinite(diffMs)) return null;
  if (diffMs <= 60_000) return "지금";
  const min = Math.round(diffMs / 60_000);
  if (min < 60) return `${min}분 후`;
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return `${hours}시간 후`;
  return `${Math.round(diffMs / 86_400_000)}일 후`;
}

export function VocabVerdictPanel({
  verdict,
  itemType,
}: {
  verdict: VocabSubmitVerdict;
  /** 판정 대상 유형 — claimKo(주장한 뜻)는 TRAP_JUDGE 에서만 뜻이 있다. */
  itemType?: VocabItemType;
}) {
  // 현재 시각은 렌더 중에 읽을 수 없다(순수성 규칙) — 학생앱 공용 훅을 쓴다.
  const now = useMinuteNow();
  const dueText = relativeDue(verdict.mastery.dueAt, now);

  const tone = verdict.correct ? "good" : "bad";
  const toneColor = verdict.correct ? "var(--gd-good)" : "var(--gd-bad)";

  return (
    <div className="gd-verdict mt-5 p-4" data-tone={tone}>
      {/* 배너 */}
      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-white"
          style={{ background: toneColor }}
        >
          {verdict.correct ? (
            <Check className="h-4 w-4" strokeWidth={3} />
          ) : (
            <X className="h-4 w-4" strokeWidth={3} />
          )}
        </span>
        <p className="gd-t-md font-bold" style={{ color: toneColor }}>
          {verdict.correct ? "정답입니다" : "오답입니다"}
        </p>
        {verdict.xpGained > 0 && !verdict.duplicate && (
          <p className="gd-mono gd-t-sm ml-auto font-bold" style={{ color: "var(--gd-blue)" }}>
            +{verdict.xpGained} XP
          </p>
        )}
      </div>
      {verdict.duplicate && (
        <p className="gd-t-2xs mt-1.5" style={{ color: "var(--gd-ink-3)" }}>
          이미 기록된 제출입니다 — 숙달도와 XP는 다시 적용되지 않습니다.
        </p>
      )}

      {/* 정답 공개 */}
      <div className="mt-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="gd-en gd-t-lg font-bold">{verdict.lemma}</p>
          <span className="gd-t-2xs font-semibold" style={{ color: "var(--gd-ink-3)" }}>
            {VOCAB_POS_LABELS[verdict.pos] ?? verdict.pos}
          </span>
          <p className="gd-t-sm font-semibold">{verdict.senseKo}</p>
        </div>
        <p className="gd-t-xs mt-0.5" style={{ color: "var(--gd-ink-2)" }}>
          {verdict.senseEn}
        </p>
        {itemType === "TRAP_JUDGE" &&
          verdict.claimKo &&
          verdict.claimKo !== verdict.senseKo && (
            <p className="gd-t-xs mt-1.5">
              <span style={{ color: "var(--gd-ink-2)" }}>주장한 뜻 </span>
              <strong style={{ color: "var(--gd-bad)" }}>{verdict.claimKo}</strong>
              <span style={{ color: "var(--gd-ink-2)" }}> · 실제 뜻 </span>
              <strong style={{ color: "var(--gd-good)" }}>{verdict.senseKo}</strong>
            </p>
          )}
      </div>

      {/* 오답 해설 — 학생이 고른 그 선지가 왜 틀렸는지(문항 팩 whyWrong) */}
      {!verdict.correct && verdict.explanation && (
        <div className="gd-hairline-t mt-3 pt-3">
          <p className="gd-label mb-1">고른 선지가 틀린 이유</p>
          <p className="gd-t-xs leading-relaxed" style={{ color: "var(--gd-ink-2)" }}>
            {verdict.explanation}
          </p>
        </div>
      )}

      {/* 함정 노트 */}
      {verdict.traps.length > 0 && (
        <div className="gd-hairline-t mt-3 pt-3">
          <p className="gd-label mb-1.5">함정 노트</p>
          <ul className="flex flex-col gap-1.5">
            {verdict.traps.map((t, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span
                  className="gd-t-3xs mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 font-bold"
                  style={{ background: "var(--gd-bad-soft)", color: "var(--gd-bad)" }}
                >
                  {VOCAB_TRAP_KIND_LABELS[t.kind] ?? t.kind}
                </span>
                <span className="gd-t-xs leading-relaxed" style={{ color: "var(--gd-ink-2)" }}>
                  {t.note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 대표 예문 */}
      {verdict.example && (
        <div className="gd-hairline-t mt-3 pt-3">
          <p className="gd-label mb-1">예문</p>
          <p className="gd-en gd-t-sm leading-relaxed">{verdict.example.en}</p>
          <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-2)" }}>
            {verdict.example.ko}
          </p>
        </div>
      )}

      {/* 숙달도 + 라이트너 상자 + 다음 복습 */}
      <div className="gd-hairline-t mt-3 pt-3">
        <div className="flex items-center justify-between">
          <p className="gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
            단어 숙달도
          </p>
          <div className="flex items-center gap-2">
            <div
              className="gd-meter w-24"
              data-tone={verdict.mastery.score >= MASTERED_SCORE ? "good" : undefined}
            >
              <span style={{ width: `${Math.min(100, verdict.mastery.score)}%` }} />
            </div>
            <span className="gd-mono gd-t-2xs font-semibold" style={{ color: "var(--gd-ink-2)" }}>
              {Math.round(verdict.mastery.score)}
            </span>
            {verdict.mastery.streak >= 2 && (
              <span className="gd-t-2xs font-semibold" style={{ color: "var(--gd-blue)" }}>
                {verdict.mastery.streak}연속
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
            복습 상자 <span className="gd-mono font-semibold">{verdict.mastery.box}</span>단계
          </p>
          <div className="gd-seg w-24">
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} data-on={i <= verdict.mastery.box ? "true" : undefined} />
            ))}
          </div>
        </div>
        {dueText && (
          <p className="gd-t-2xs mt-2" style={{ color: "var(--gd-ink-3)" }}>
            다음 복습 예정 —{" "}
            <span className="gd-mono font-semibold" style={{ color: "var(--gd-ink-2)" }}>
              {dueText}
            </span>
          </p>
        )}
      </div>

      {/* 덱 단계 전환 통지 */}
      {verdict.stageAdvanced && (
        <div
          className="gd-pop mt-3 rounded-lg px-3 py-2"
          style={{ background: "var(--gd-blue-soft)", border: "1px solid var(--gd-blue-line)" }}
        >
          <p className="gd-t-xs font-semibold" style={{ color: "var(--gd-blue)" }}>
            단계가 열렸습니다 —{" "}
            {VOCAB_STAGE_LABELS[verdict.stageAdvanced.stage] ?? verdict.stageAdvanced.stage}
          </p>
        </div>
      )}
    </div>
  );
}
