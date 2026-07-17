"use client";

// 레슨 완료 화면 — 자기평가(이해도) → 저장 → 성장 리포트(스탯 상승) → 다음 한 수.
// "완료 = 영구 습득"이라는 거짓말을 하지 않는다: 복습 예고를 함께 보여 준다.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Award,
  ChevronUp,
  CircleCheck,
  CircleHelp,
  CircleSlash,
  Shield,
} from "lucide-react";
import type { SafeLesson } from "@/lib/study-os/lesson-payload";
import type { GrowthReport } from "@/lib/study-os/stats";
import { JUDGE_LENSES } from "@/lib/study-os/lenses";

const LENS_NAME = new Map(JUDGE_LENSES.map((l) => [l.id as string, l.name]));

const CONFIDENCE = [
  {
    v: 1,
    label: "아직 자신 없습니다",
    desc: "선생님께 이 개념이 표시됩니다",
    icon: CircleSlash,
    tone: "var(--gd-bad)",
  },
  {
    v: 2,
    label: "대체로 알겠습니다",
    desc: "드릴에서 더 확인합니다",
    icon: CircleHelp,
    tone: "var(--gd-blue)",
  },
  {
    v: 3,
    label: "설명할 수 있습니다",
    desc: "다음 개념으로 넘어갑니다",
    icon: CircleCheck,
    tone: "var(--gd-good)",
  },
] as const;

export function LessonDoneScreen({
  lesson,
  nextConceptId,
  growth,
  onOpenStatus,
  onConfidence,
  onExit,
}: {
  lesson: SafeLesson;
  nextConceptId: string | null;
  /** 완주 저장이 돌려준 성장 리포트 — 저장 완료 후 비동기로 채워진다 */
  growth: GrowthReport | null;
  onOpenStatus: () => void;
  onConfidence: (c: number) => Promise<void>;
  onExit: () => void;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function pick(v: number) {
    if (saving) return;
    setPicked(v);
    setSaving(true);
    await onConfidence(v);
    setSaving(false);
  }

  const nextHref = nextConceptId
    ? `/g/unit/${lesson.unitId}/lesson/${nextConceptId}`
    : `/g/drill?mode=drill&unitId=${lesson.unitId}`;
  const nextLabel = nextConceptId ? "다음 개념 학습하기" : "이 유닛 드릴 시작하기";
  const nextWhy = nextConceptId
    ? "같은 유닛의 다음 개념입니다."
    : "유닛의 개념을 모두 마쳤습니다. 이제 문항으로 굳힙니다.";

  return (
    <div className="gd-scroll flex h-dvh flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="gd-page mx-auto w-full">
        <p className="gd-label">{lesson.unitTitle}</p>
        <h1 className="gd-t-xl mt-1 font-bold tracking-tight">{lesson.title}</h1>
        <p className="gd-prose-2 mt-1.5">{lesson.oneLiner}</p>

        <div className="gd-block mt-5" data-tone="accent">
          <p className="gd-prose font-bold">이 개념을 지금 얼마나 알겠습니까?</p>
          <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-2)" }}>
            솔직하게 고르십시오. 선생님이 이 답을 보고 도와줍니다.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {CONFIDENCE.map((c) => {
              const Icon = c.icon;
              const on = picked === c.v;
              return (
                <button
                  key={c.v}
                  type="button"
                  className="gd-option"
                  data-state={on ? "selected" : picked !== null ? "dim" : undefined}
                  disabled={saving}
                  onClick={() => void pick(c.v)}
                >
                  <Icon className="h-5 w-5 shrink-0" style={{ color: c.tone }} strokeWidth={2} />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="gd-t-base block font-semibold">{c.label}</span>
                    <span className="gd-t-2xs block" style={{ color: "var(--gd-ink-3)" }}>
                      {c.desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 성장 리포트 — 상태창 문법의 스탯 상승 연출 ── */}
        {picked !== null && growth && growth.xpGained > 0 && (
          <div
            className="gd-statup mt-5 rounded-2xl p-4"
            style={{
              background: "linear-gradient(168deg, #101d31 0%, #0b1523 100%)",
              border: "1px solid #2c4a77",
              color: "#dbe7f7",
            }}
          >
            <p
              className="gd-t-2xs font-bold"
              style={{ letterSpacing: "0.14em", color: "#6f87ab" }}
            >
              GROWTH REPORT
            </p>
            <div className="gd-statup mt-2.5 flex items-baseline gap-2" data-d="1">
              <span className="gd-mono gd-t-2xl font-bold" style={{ color: "#7fb2ff" }}>
                +{growth.xpGained}
              </span>
              <span className="gd-t-sm font-semibold">XP</span>
              {growth.levelAfter > growth.levelBefore && (
                <span
                  className="gd-t-xs ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold"
                  style={{ background: "rgba(59,130,246,0.22)", color: "#fff" }}
                >
                  <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Lv.{growth.levelBefore} → Lv.{growth.levelAfter}
                </span>
              )}
            </div>
            {Object.keys(growth.lensGained).length > 0 && (
              <div className="gd-statup mt-2 flex flex-wrap gap-1.5" data-d="2">
                {Object.entries(growth.lensGained).map(([lens, v]) =>
                  v ? (
                    <span
                      key={lens}
                      className="gd-t-2xs rounded-md px-1.5 py-0.5 font-semibold"
                      style={{ background: "rgba(127,178,255,0.1)", color: "#a9c6ec" }}
                    >
                      {LENS_NAME.get(lens) ?? lens} +{v}
                    </span>
                  ) : null,
                )}
              </div>
            )}
            {growth.newTitles.length > 0 && (
              <div
                className="gd-statup mt-3 rounded-xl p-2.5"
                data-d="3"
                style={{ border: "1px dashed rgba(127,178,255,0.35)" }}
              >
                <p className="gd-t-2xs font-bold" style={{ color: "#6f87ab" }}>
                  새 칭호 획득
                </p>
                {growth.newTitles.map((t) => (
                  <p key={t.key} className="gd-t-sm mt-1 flex items-center gap-1.5 font-bold">
                    <Award className="h-4 w-4 shrink-0" style={{ color: "#7fb2ff" }} strokeWidth={1.75} />
                    {t.name}
                  </p>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onOpenStatus}
              className="gd-t-xs mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg px-3 font-bold"
              style={{ border: "1px solid rgba(127,178,255,0.35)", color: "#cfe0f6" }}
            >
              <Shield className="h-3.5 w-3.5" strokeWidth={1.75} />
              상태창 열기
            </button>
          </div>
        )}

        {picked !== null && (
          <div className="gd-pop mt-5">
            <div className="gd-block">
              <p className="gd-label mb-1.5">다음 한 수</p>
              <p className="gd-prose font-bold">{nextLabel}</p>
              <p className="gd-prose-2 mt-1">{nextWhy}</p>
              <button
                type="button"
                onClick={() => router.push(nextHref)}
                className="gd-btn gd-btn-primary mt-3 w-full"
              >
                {nextLabel}
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <p className="gd-t-xs mt-3 text-center leading-relaxed" style={{ color: "var(--gd-ink-3)" }}>
              배운 개념은 며칠 뒤 복습 큐에 다시 나타납니다.
              <br />한 번 봤다고 끝이 아니라, 다시 꺼내 쓸 때 남습니다.
            </p>

            <button type="button" onClick={onExit} className="gd-btn gd-btn-quiet mt-2 w-full">
              유닛으로 돌아가기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
