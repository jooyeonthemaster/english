"use client";

// 유닛 허브 — 단계 스테퍼(개념→드릴→실전→서술형→테스트→마스터) + 개념 리스트.

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  FileText,
  GraduationCap,
  PenLine,
} from "lucide-react";
import { stageLabel } from "@/components/grammar-drill/verdict-panel";

const STAGES = ["CONCEPT", "DRILL", "READING", "WRITTEN", "TEST", "MASTERED"];

interface ConceptRow {
  id: string;
  title: string;
  oneLiner: string;
  mastery: { attempts: number; score: number; streak: number; box: number };
}

interface UnitInfo {
  id: string;
  title: string;
  subtitle: string;
  partName: string;
  frequency: number;
  frequencyNote: string;
  stage: string;
  bestTestScore: number | null;
}

export function UnitHubClient({
  unit,
  concepts,
}: {
  unit: UnitInfo;
  concepts: ConceptRow[];
}) {
  const router = useRouter();
  const stageIdx = Math.max(0, STAGES.indexOf(unit.stage));
  const mastered = unit.stage === "MASTERED";

  const modes: {
    key: string;
    label: string;
    desc: string;
    href: string;
    icon: React.ReactNode;
    enabled: boolean;
    done: boolean;
  }[] = [
    {
      key: "CONCEPT",
      label: "개념 학습",
      desc: "판단 알고리즘 · 규칙 · 함정 카드",
      href: `/g/unit/${unit.id}/learn`,
      icon: <BookOpen className="h-4.5 w-4.5" strokeWidth={1.75} />,
      enabled: true,
      done: stageIdx > 0,
    },
    {
      key: "DRILL",
      label: "드릴",
      desc: "택일·OX 무한 훈련 — 개념 숙달도 70 도달",
      href: `/g/drill?mode=drill&unitId=${unit.id}`,
      icon: <Dumbbell className="h-4.5 w-4.5" strokeWidth={1.75} />,
      enabled: stageIdx >= 1,
      done: stageIdx > 1,
    },
    {
      key: "READING",
      label: "실전 독해",
      desc: "미니 29번 · 수능 29번 지문",
      href: `/g/drill?mode=reading&unitId=${unit.id}`,
      icon: <FileText className="h-4.5 w-4.5" strokeWidth={1.75} />,
      enabled: stageIdx >= 2,
      done: stageIdx > 2,
    },
    {
      key: "WRITTEN",
      label: "서술형",
      desc: "어형 변형 · 오류 수정 직접 쓰기",
      href: `/g/drill?mode=written&unitId=${unit.id}`,
      icon: <PenLine className="h-4.5 w-4.5" strokeWidth={1.75} />,
      enabled: stageIdx >= 3,
      done: stageIdx > 3,
    },
    {
      key: "TEST",
      label: "유닛 테스트",
      desc: "10문항 종합 — 70점 이상 마스터",
      href: `/g/drill?mode=test&unitId=${unit.id}`,
      icon: <GraduationCap className="h-4.5 w-4.5" strokeWidth={1.75} />,
      enabled: stageIdx >= 4,
      done: mastered,
    },
  ];

  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 pb-10">
      <header className="flex items-center gap-1 pt-4">
        <button
          type="button"
          onClick={() => router.push("/g/home")}
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full"
          style={{ color: "var(--gd-ink-2)" }}
          aria-label="홈으로"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <p className="gd-label">{unit.partName}</p>
      </header>

      <h1 className="gd-t-xl mt-2 font-bold tracking-tight">{unit.title}</h1>
      <p className="gd-t-sm mt-1" style={{ color: "var(--gd-ink-2)" }}>
        {unit.subtitle}
      </p>
      <p className="gd-t-2xs mt-1.5" style={{ color: "var(--gd-ink-3)" }}>
        {"★".repeat(unit.frequency)}
        {"☆".repeat(5 - unit.frequency)} · {unit.frequencyNote}
      </p>

      {/* ── 단계 스테퍼 ── */}
      <div className="gd-card mt-5 px-4 py-3.5">
        <div className="flex items-center">
          {STAGES.slice(0, 5).map((s, i) => (
            <div key={s} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px]"
                  style={
                    i < stageIdx || mastered
                      ? { background: "var(--gd-good)", borderColor: "var(--gd-good)", color: "#fff" }
                      : i === stageIdx
                        ? { borderColor: "var(--gd-blue)", color: "var(--gd-blue)" }
                        : { borderColor: "var(--gd-line-strong)", color: "var(--gd-ink-3)" }
                  }
                >
                  {i < stageIdx || mastered ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : (
                    <span className="gd-t-3xs font-bold">{i + 1}</span>
                  )}
                </span>
                <span
                  className="gd-t-3xs font-medium"
                  style={{ color: i === stageIdx && !mastered ? "var(--gd-blue)" : "var(--gd-ink-3)" }}
                >
                  {stageLabel(s)}
                </span>
              </div>
              {i < 4 && (
                <div
                  className="mx-1 mb-4 h-px flex-1"
                  style={{ background: i < stageIdx ? "var(--gd-good)" : "var(--gd-line)" }}
                />
              )}
            </div>
          ))}
        </div>
        {unit.bestTestScore !== null && (
          <p className="gd-hairline-t gd-t-2xs mt-3 pt-2.5" style={{ color: "var(--gd-ink-2)" }}>
            유닛 테스트 최고점{" "}
            <strong className="gd-mono" style={{ color: mastered ? "var(--gd-good)" : "var(--gd-ink)" }}>
              {unit.bestTestScore}점
            </strong>
            {mastered && " — 마스터 달성"}
          </p>
        )}
      </div>

      {/* ── 학습 모드 ── */}
      <section className="mt-5 flex flex-col gap-2">
        {modes.map((m) => {
          const inner = (
            <div
              className="gd-card flex items-center gap-3 px-3.5 py-3.5"
              style={!m.enabled ? { opacity: 0.5 } : undefined}
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={
                  m.done
                    ? { background: "var(--gd-good-soft)", color: "var(--gd-good)" }
                    : m.enabled
                      ? { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
                      : { background: "var(--gd-paper)", color: "var(--gd-ink-3)" }
                }
              >
                {m.done ? <Check className="h-5 w-5" strokeWidth={2.25} /> : m.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="gd-t-sm font-semibold">{m.label}</p>
                <p className="gd-t-2xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
                  {m.enabled ? m.desc : "이전 단계를 마치면 열립니다"}
                </p>
              </div>
              {m.enabled && (
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--gd-ink-3)" }} />
              )}
            </div>
          );
          return m.enabled ? (
            <Link key={m.key} href={m.href}>
              {inner}
            </Link>
          ) : (
            <div key={m.key}>{inner}</div>
          );
        })}
      </section>

      {/* ── 개념별 숙달도 ── */}
      <section className="mt-7">
        <p className="gd-label mb-2">개념별 숙달도</p>
        <div className="flex flex-col gap-2">
          {concepts.map((c, i) => (
            <Link
              key={c.id}
              href={`/g/drill?mode=drill&unitId=${unit.id}&conceptId=${c.id}`}
              className="gd-card flex items-center gap-3 px-3.5 py-3"
            >
              <span
                className="gd-mono gd-t-2xs flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-bold"
                style={{ background: "var(--gd-paper)", color: "var(--gd-ink-2)", border: "1px solid var(--gd-line)" }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="gd-t-sm truncate font-semibold">{c.title}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div
                    className="gd-meter flex-1"
                    data-tone={c.mastery.score >= 70 ? "good" : undefined}
                  >
                    <span style={{ width: `${c.mastery.score}%` }} />
                  </div>
                  <span className="gd-mono gd-t-3xs shrink-0" style={{ color: "var(--gd-ink-3)" }}>
                    {c.mastery.score} · {c.mastery.attempts}회
                  </span>
                </div>
              </div>
              <span className="gd-t-2xs shrink-0 font-semibold" style={{ color: "var(--gd-blue)" }}>
                드릴
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
