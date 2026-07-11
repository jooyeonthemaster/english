"use client";

// ============================================================================
// /g/train — 훈련 탭: 유닛맵(1·2·3부) + 누적 복합 세트.
//
// home-client 에서 유닛맵·복합세트 섹션을 이관한 화면(홈은 V5 가 재구성).
// 데이터는 기존 홈 페이로드(buildHomePayload)를 그대로 재사용한다.
// ============================================================================

import Link from "next/link";
import { CheckCircle2, ChevronRight, Lock } from "lucide-react";
import type { HomePayload } from "@/lib/grammar-drill/payload";
import { stageLabel } from "@/components/grammar-drill/verdict-panel";

const PART_META: Record<number, { name: string; tagline: string }> = {
  1: { name: "1부 · 골격기", tagline: "문장의 뼈대 판별 — 선지의 60%" },
  2: { name: "2부 · 연결기", tagline: "절과 절의 관계 — 누적 85%" },
  3: { name: "3부 · 정밀기", tagline: "형태·호응의 미세 판단" },
};

export function TrainClient({ home }: { home: HomePayload }) {
  return (
    <div className="mx-auto max-w-md px-5 pb-6 pt-5">
      {/* ── 페이지 타이틀 ── */}
      <header>
        <h1 className="gd-t-xl font-bold tracking-tight">훈련</h1>
        <p className="gd-t-2xs mt-1" style={{ color: "var(--gd-ink-3)" }}>
          유닛별 개념 훈련과 누적 복합 세트를 진행합니다
        </p>
      </header>

      {/* ── 유닛맵 ── */}
      {[1, 2, 3].map((part) => (
        <section key={part} className="mt-6">
          <p className="gd-t-sm font-bold">{PART_META[part].name}</p>
          <p className="gd-t-2xs mb-2.5 mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
            {PART_META[part].tagline}
          </p>
          <div className="flex flex-col gap-2">
            {home.units
              .filter((u) => u.part === part)
              .map((u) => (
                <UnitRow key={u.unitId} unit={u} />
              ))}
          </div>
        </section>
      ))}

      {/* ── 복합 세트 ── */}
      <section className="mt-7">
        <p className="gd-t-sm font-bold">누적 복합 세트</p>
        <p className="gd-t-2xs mb-2.5 mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
          여러 유닛이 한 지문에 섞이는 실전 29번 체제입니다
        </p>
        <div className="flex flex-col gap-2">
          {home.mixedSets.map((s) => (
            <MixedRow key={s.setId} set={s} />
          ))}
        </div>
      </section>
    </div>
  );
}

function UnitRow({ unit }: { unit: HomePayload["units"][number] }) {
  const locked = unit.stage === "LOCKED";
  const mastered = unit.stage === "MASTERED";
  const num = `U${parseInt(unit.unitId.slice(1), 10)}`;

  const inner = (
    <div
      className="gd-card flex items-center gap-3 px-3.5 py-3"
      style={locked ? { opacity: 0.55 } : undefined}
    >
      <span
        className="gd-mono gd-t-xs flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold"
        style={
          mastered
            ? { background: "var(--gd-good-soft)", color: "var(--gd-good)" }
            : {
                background: "var(--gd-paper)",
                color: "var(--gd-ink-2)",
                border: "1px solid var(--gd-line)",
              }
        }
      >
        {mastered ? <CheckCircle2 className="h-4.5 w-4.5" strokeWidth={2} /> : num}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="gd-t-sm truncate font-semibold">{unit.title}</p>
          <span className="gd-t-3xs shrink-0" style={{ color: "var(--gd-ink-3)" }}>
            {"★".repeat(unit.frequency)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="gd-meter flex-1" data-tone={unit.masteryAvg >= 70 ? "good" : undefined}>
            <span style={{ width: `${unit.masteryAvg}%` }} />
          </div>
          <span
            className="gd-t-3xs shrink-0 rounded px-1 py-0.5 font-semibold"
            style={
              mastered
                ? { background: "var(--gd-good-soft)", color: "var(--gd-good)" }
                : { background: "var(--gd-paper)", color: "var(--gd-ink-2)" }
            }
          >
            {locked ? "잠김" : stageLabel(unit.stage)}
          </span>
        </div>
      </div>
      {locked ? (
        <Lock className="h-4 w-4 shrink-0" style={{ color: "var(--gd-ink-3)" }} strokeWidth={1.75} />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--gd-ink-3)" }} />
      )}
    </div>
  );

  if (locked) return inner;
  return <Link href={`/g/unit/${unit.unitId}`}>{inner}</Link>;
}

function MixedRow({ set }: { set: HomePayload["mixedSets"][number] }) {
  const inner = (
    <div
      className="gd-card flex items-center gap-3 px-3.5 py-3"
      style={!set.unlocked ? { opacity: 0.55 } : undefined}
    >
      <div className="min-w-0 flex-1">
        <p className="gd-t-sm truncate font-semibold">{set.title}</p>
        <p className="gd-t-2xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
          {set.unlocked
            ? set.solved > 0
              ? `${set.solved}문항 풀이함`
              : "도전 가능"
            : "해당 유닛의 드릴 단계를 마치면 열립니다"}
        </p>
      </div>
      {set.unlocked ? (
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--gd-ink-3)" }} />
      ) : (
        <Lock className="h-4 w-4 shrink-0" style={{ color: "var(--gd-ink-3)" }} strokeWidth={1.75} />
      )}
    </div>
  );
  if (!set.unlocked) return inner;
  return <Link href={`/g/drill?mode=mixed&setId=${set.setId}`}>{inner}</Link>;
}
