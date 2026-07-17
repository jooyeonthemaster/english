"use client";

// 유닛 허브 — 개념 레슨 리스트가 주인공이고, 훈련 모드는 그 다음이다.
// 학생은 이 화면에서 언제나 "다음 한 수"를 본다(docs/study-os-spec.md §4).

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Dumbbell,
  FileText,
  GraduationCap,
  PenLine,
  PlayCircle,
} from "lucide-react";
import { stageLabel } from "@/components/grammar-drill/verdict-panel";

const STAGES_FULL = ["CONCEPT", "DRILL", "READING", "WRITTEN", "TEST", "MASTERED"];
const STAGES_BASIC = ["CONCEPT", "DRILL", "MASTERED"];

interface ConceptRow {
  id: string;
  title: string;
  oneLiner: string;
  lesson: {
    blocks: number;
    minutes: number;
    seen: number;
    completed: boolean;
    confidence: number | null;
  } | null;
  mastery: { attempts: number; score: number; streak: number; box: number };
}

interface UnitInfo {
  id: string;
  title: string;
  subtitle: string;
  partName: string;
  frequency: number | null;
  frequencyNote: string;
  stageSet: "FULL" | "BASIC";
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
  const stages = unit.stageSet === "BASIC" ? STAGES_BASIC : STAGES_FULL;
  const stageIdx = Math.max(0, stages.indexOf(unit.stage));
  const mastered = unit.stage === "MASTERED";
  const conceptStageIdx = STAGES_FULL.indexOf(unit.stage);

  // ── 다음 한 수 ──
  const nextLesson =
    concepts.find((c) => c.lesson && !c.lesson.completed && c.lesson.seen > 0) ??
    concepts.find((c) => c.lesson && !c.lesson.completed);
  const lessonsDone = concepts.filter((c) => c.lesson?.completed).length;
  const lessonsTotal = concepts.filter((c) => c.lesson).length;

  const next = nextLesson
    ? {
        label: nextLesson.lesson!.seen > 0 ? "개념 학습 이어서 하기" : "개념 학습 시작하기",
        sub: nextLesson.title,
        why:
          nextLesson.lesson!.seen > 0
            ? `${nextLesson.lesson!.seen + 1}번째 블록부터 이어집니다`
            : `${nextLesson.lesson!.blocks}개 블록 · 약 ${nextLesson.lesson!.minutes}분`,
        href: `/g/unit/${unit.id}/lesson/${nextLesson.id}`,
      }
    : mastered
      ? {
          label: "복습 드릴 풀기",
          sub: "마스터한 유닛입니다",
          why: "가장 오래 안 본 문항부터 다시 나옵니다",
          href: `/g/drill?mode=drill&unitId=${unit.id}`,
        }
      : {
          label: MODE_LABEL[stages[stageIdx]] ?? "드릴 풀기",
          sub: MODE_DESC[stages[stageIdx]] ?? "",
          why: "개념 학습을 모두 마쳤습니다",
          href: MODE_HREF(unit.id, stages[stageIdx]),
        };

  const modes = [
    {
      key: "DRILL",
      label: "드릴",
      desc: "택일·OX 무한 훈련 — 개념 숙달도 70 도달",
      href: `/g/drill?mode=drill&unitId=${unit.id}`,
      icon: <Dumbbell className="h-4.5 w-4.5" strokeWidth={1.75} />,
      enabled: conceptStageIdx >= 1,
      done: conceptStageIdx > 1 || mastered,
      show: true,
    },
    {
      key: "READING",
      label: "실전 독해",
      desc: "미니 29번 · 수능 29번 지문",
      href: `/g/drill?mode=reading&unitId=${unit.id}`,
      icon: <FileText className="h-4.5 w-4.5" strokeWidth={1.75} />,
      enabled: conceptStageIdx >= 2,
      done: conceptStageIdx > 2,
      show: unit.stageSet === "FULL",
    },
    {
      key: "WRITTEN",
      label: "서술형",
      desc: "어형 변형 · 오류 수정 직접 쓰기",
      href: `/g/drill?mode=written&unitId=${unit.id}`,
      icon: <PenLine className="h-4.5 w-4.5" strokeWidth={1.75} />,
      enabled: conceptStageIdx >= 3,
      done: conceptStageIdx > 3,
      show: unit.stageSet === "FULL",
    },
    {
      key: "TEST",
      label: "유닛 테스트",
      desc: "10문항 종합 — 70점 이상 마스터",
      href: `/g/drill?mode=test&unitId=${unit.id}`,
      icon: <GraduationCap className="h-4.5 w-4.5" strokeWidth={1.75} />,
      enabled: conceptStageIdx >= 4,
      done: mastered,
      show: unit.stageSet === "FULL",
    },
  ].filter((m) => m.show);

  return (
    <div className="gd-page mx-auto min-h-dvh px-5 pb-12">
      <header className="flex items-center gap-1 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.push("/g/track/grammar")}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full"
          style={{ color: "var(--gd-ink-2)" }}
          aria-label="어법 트랙으로"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <p className="gd-label">{unit.partName}</p>
      </header>

      <h1 className="gd-t-xl mt-2 font-bold tracking-tight">{unit.title}</h1>
      <p className="gd-prose-2 mt-1">{unit.subtitle}</p>
      <p className="gd-t-2xs mt-1.5" style={{ color: "var(--gd-ink-3)" }}>
        {unit.frequency !== null && (
          <>
            {"★".repeat(unit.frequency)}
            {"☆".repeat(5 - unit.frequency)} ·{" "}
          </>
        )}
        {unit.frequencyNote}
      </p>

      {/* ── 다음 한 수 ── */}
      <section className="gd-block mt-5" data-tone="accent">
        <p className="gd-label mb-1.5" style={{ color: "var(--gd-blue)" }}>
          다음 한 수
        </p>
        <p className="gd-prose font-bold">{next.label}</p>
        <p className="gd-prose-2 mt-0.5">{next.sub}</p>
        <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-3)" }}>
          {next.why}
        </p>
        <Link href={next.href} className="gd-btn gd-btn-primary mt-3 w-full">
          바로 시작
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </section>

      {/* ── 단계 스테퍼 ── */}
      <div className="gd-card mt-4 px-4 py-3.5">
        <div className="flex items-center">
          {stages.slice(0, -1).map((s, i) => (
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
                  className="gd-t-3xs whitespace-nowrap font-medium"
                  style={{ color: i === stageIdx && !mastered ? "var(--gd-blue)" : "var(--gd-ink-3)" }}
                >
                  {stageLabel(s)}
                </span>
              </div>
              {i < stages.length - 2 && (
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

      {/* ── 개념 레슨 ── */}
      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="gd-label">개념 학습</p>
          <p className="gd-mono gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
            {lessonsDone}/{lessonsTotal} 완료
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {concepts.map((c, i) => (
            <ConceptLessonRow key={c.id} unitId={unit.id} index={i} concept={c} />
          ))}
        </div>
      </section>

      {/* ── 훈련 모드 ── */}
      <section className="mt-6">
        <p className="gd-label mb-2">훈련</p>
        <div className="flex flex-col gap-2">
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
                  <p className="gd-t-base font-semibold">{m.label}</p>
                  <p className="gd-t-2xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
                    {m.enabled ? m.desc : "개념 학습을 모두 마치면 열립니다"}
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
        </div>
      </section>
    </div>
  );
}

// ── 개념 행 ─────────────────────────────────────────────────────────────────

function ConceptLessonRow({
  unitId,
  index,
  concept,
}: {
  unitId: string;
  index: number;
  concept: ConceptRow;
}) {
  const l = concept.lesson;
  const href = l
    ? `/g/unit/${unitId}/lesson/${concept.id}`
    : `/g/drill?mode=drill&unitId=${unitId}&conceptId=${concept.id}`;
  const pct = l ? Math.round(((l.completed ? l.blocks : l.seen) / l.blocks) * 100) : 0;

  return (
    <Link href={href} className="gd-card flex items-center gap-3 px-3.5 py-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={
          l?.completed
            ? { background: "var(--gd-good-soft)", color: "var(--gd-good)" }
            : l && l.seen > 0
              ? { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
              : { background: "var(--gd-paper)", color: "var(--gd-ink-3)", border: "1px solid var(--gd-line)" }
        }
      >
        {l?.completed ? (
          <Check className="h-4.5 w-4.5" strokeWidth={2.5} />
        ) : l && l.seen > 0 ? (
          <PlayCircle className="h-4.5 w-4.5" strokeWidth={2} />
        ) : l ? (
          <BookOpen className="h-4.5 w-4.5" strokeWidth={1.75} />
        ) : (
          <CircleSlash className="h-4.5 w-4.5" strokeWidth={1.75} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="gd-t-base font-semibold">
          <span className="gd-mono gd-t-2xs mr-1.5" style={{ color: "var(--gd-ink-3)" }}>
            {index + 1}
          </span>
          {concept.title}
        </p>
        <p
          className="gd-t-xs mt-0.5 leading-snug"
          style={{
            color: "var(--gd-ink-3)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {concept.oneLiner}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="gd-meter flex-1" data-tone={l?.completed ? "good" : undefined}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="gd-mono gd-t-3xs shrink-0" style={{ color: "var(--gd-ink-3)" }}>
            {l
              ? l.completed
                ? `숙달 ${concept.mastery.score}`
                : l.seen > 0
                  ? `${l.seen}/${l.blocks}`
                  : `${l.minutes}분`
              : "준비 중"}
          </span>
        </div>
      </div>

      <span className="gd-t-2xs shrink-0 font-semibold" style={{ color: "var(--gd-blue)" }}>
        {l?.completed ? "복습" : l && l.seen > 0 ? "이어서" : "학습"}
      </span>
    </Link>
  );
}

const MODE_LABEL: Record<string, string> = {
  DRILL: "드릴 풀기",
  READING: "실전 독해 풀기",
  WRITTEN: "서술형 풀기",
  TEST: "유닛 테스트 보기",
};
const MODE_DESC: Record<string, string> = {
  DRILL: "택일·OX 무한 훈련",
  READING: "미니 29번 · 수능 29번 지문",
  WRITTEN: "직접 고쳐 쓰기",
  TEST: "10문항 종합 — 70점 이상이면 마스터",
};
function MODE_HREF(unitId: string, stage: string): string {
  const mode =
    stage === "READING"
      ? "reading"
      : stage === "WRITTEN"
        ? "written"
        : stage === "TEST"
          ? "test"
          : "drill";
  return `/g/drill?mode=${mode}&unitId=${unitId}`;
}
