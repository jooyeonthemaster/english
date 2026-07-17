"use client";

// ── 개념 숙달 지도 ─────────────────────────────────────────────────────────
// 이름 없는 색칠 행렬을 폐기하고 커리큘럼 서사(4파트 → 19유닛 → 개념)를 그대로
// 세운다. 유닛·개념은 항상 텍스트 이름으로 노출하고, 색은 아이콘 형태·숙달 숫자와
// 함께 보조 채널로만 쓴다(색 단독 의존 회피). 상세 설명은 표면에 흘리지 않고
// 온탭 아코디언·'읽는 법' 시트로 계층화한다.
//
// 개념 행은 두 채널을 함께 읽는다:
//   ① 레슨(개념 학습) 상태 배지 — 미시작 / 학습 중(n/m) / 완료 · 자신 없음
//   ② 드릴 숙달 4티어 아이콘 + 0~100 숫자
// 학습이 훈련보다 앞서므로, 레슨이 남아 있으면 행도 히어로도 레슨을 가리킨다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, ChevronRight, HelpCircle, Lock } from "lucide-react";
import {
  CONCEPT_SKELETON_BY_ID,
  GRAMMAR_PARTS,
  GRAMMAR_UNITS,
  unitLabel,
} from "@/lib/grammar-drill/curriculum";
import { MasteryLegendSheet } from "./mastery-legend";
import {
  CLAMP2,
  LessonBadge,
  LowConfidenceBadge,
  M,
  type LessonState,
  type MKey,
  isLowConfidence,
  mkey,
} from "./mastery-tiers";

export interface MasteryGridUnit {
  unitId: string;
  title: string;
  part: number;
  locked: boolean;
  concepts: {
    conceptId: string;
    title: string;
    score: number;
    attempts: number;
    correct: number;
    box: number;
    lesson: LessonState | null;
  }[];
}

const UNIT_FREQ = new Map(GRAMMAR_UNITS.map((u) => [u.id, u.frequency]));
const BUCKETS: MKey[] = ["mastered", "learning", "weak", "new"];
// 진행 바는 완성/숙달/취약만 채우고, 남은 트랙이 곧 '미시작'이다.
const BAR_TIERS: MKey[] = ["mastered", "learning", "weak"];
const CLOSED = -1; // 아코디언 '전부 닫힘' 표식 — 0 은 기초 골격 파트라 쓸 수 없다.

/** 0부는 번호를 붙이지 않는다 — "0부 기초 골격"은 읽히지 않는다. */
const partLabel = (part: number, name: string) =>
  part === 0 ? name : `${part}부 ${name}`;

const lessonHref = (unitId: string, conceptId: string) =>
  `/g/unit/${unitId}/lesson/${conceptId}`;
const drillHref = (unitId: string, conceptId: string) =>
  `/g/drill?mode=drill&unitId=${unitId}&conceptId=${conceptId}`;

export function MasteryMap({ grid }: { grid: MasteryGridUnit[] }) {
  const [openPart, setOpenPart] = useState<number | null>(null); // null = 자동(진행 파트)
  const [legendOpen, setLegendOpen] = useState(false);

  // 시트 열림 중 Esc 로 닫기(aria-modal 선언과 정합 — 키보드 연결 태블릿 대응).
  useEffect(() => {
    if (!legendOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLegendOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [legendOpen]);

  const flat = grid.flatMap((u) =>
    u.concepts.map((c) => ({
      ...c,
      unitId: u.unitId,
      unitTitle: u.title,
      part: u.part,
      locked: u.locked,
    })),
  );
  const counts: Record<MKey, number> = { mastered: 0, learning: 0, weak: 0, new: 0 };
  for (const c of flat) counts[mkey(c.score, c.attempts)]++;

  // ── 다음 행동 ──
  // 잠금 해제된(도달 가능한) 개념에서만 고른다. 잠긴 유닛의 개념을 CTA로 유도하면
  // 순차잠금을 우회하게 되므로 제외한다.
  //  (1) 레슨 미완 개념이 있으면 레슨을 먼저 가리킨다(학습 → 훈련 순서).
  //  (2) 레슨을 다 마쳤으면 가장 약한 개념의 드릴.
  //  (3) 전부 완성이면 최저점 복습.
  const reachable = flat.filter((c) => !c.locked);
  const withLesson = reachable.filter((c) => c.lesson && !c.lesson.completed);
  const nextLesson =
    withLesson.find((c) => c.lesson!.lastBlockIndex > 0) ?? withLesson[0];

  const attempted = reachable.filter((c) => c.attempts > 0);
  const nonMastered = attempted.filter((c) => c.score < 85);
  const firstNew = reachable.find((c) => c.attempts === 0);
  const allMastered = attempted.length > 0 && nonMastered.length === 0 && !firstNew;

  const hero = nextLesson
    ? {
        c: nextLesson,
        label: "다음 개념 학습",
        cta:
          nextLesson.lesson!.lastBlockIndex > 0
            ? "개념 학습 이어서 하기"
            : "개념 학습 시작하기",
        href: lessonHref(nextLesson.unitId, nextLesson.conceptId),
      }
    : allMastered
      ? {
          c: [...attempted].sort((a, b) => a.score - b.score)[0],
          label: "전 과정 완성",
          cta: "복습 이어가기",
          href: "",
        }
      : nonMastered.length
        ? {
            c: [...nonMastered].sort((a, b) => a.score - b.score)[0],
            label: "가장 약한 개념",
            cta: "이 개념부터 훈련하기",
            href: "",
          }
        : {
            c: firstNew ?? reachable[0] ?? flat[0],
            label: attempted.length ? "다음 개념" : "여기서 시작합니다",
            cta: attempted.length ? "다음 개념 훈련하기" : "첫 개념 훈련하기",
            href: "",
          };
  const heroC = hero.c;
  const heroSk = CONCEPT_SKELETON_BY_ID.get(heroC.conceptId);
  const heroHref = hero.href || drillHref(heroC.unitId, heroC.conceptId);
  const heroWhy = nextLesson
    ? heroC.lesson!.lastBlockIndex > 0
      ? `${heroC.lesson!.lastBlockIndex + 1}번째 블록부터 이어집니다`
      : `${heroC.lesson!.blocksTotal}개 블록 · 개념부터 익힙니다`
    : (heroSk?.oneLiner ?? "");

  // 자동 펼침 = 다음 행동(히어로) 개념이 속한 파트 — 학생이 지금 실제로 진행하는 곳.
  const effOpen = openPart ?? heroC.part;

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="gd-label">개념 숙달 지도</p>
        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          className="gd-t-2xs -mr-1 flex min-h-[2.75rem] items-center gap-1 px-1"
          style={{ color: "var(--gd-ink-2)" }}
        >
          <HelpCircle size={14} strokeWidth={2} />
          읽는 법
        </button>
      </div>

      {/* 요약 히어로 — 진행 요약 + 다음 행동 원포인트 CTA */}
      <div className="gd-card p-3.5">
        <div
          className="flex h-2.5 overflow-hidden rounded-full"
          style={{ background: "var(--gd-line)" }}
        >
          {BAR_TIERS.map((k) =>
            counts[k] > 0 ? (
              <span
                key={k}
                style={{
                  width: `${(counts[k] / flat.length) * 100}%`,
                  minWidth: 3,
                  background: M[k].color,
                }}
              />
            ) : null,
          )}
        </div>
        <div className="mt-3 grid grid-cols-4">
          {BUCKETS.map((k) => {
            const Ic = M[k].Icon;
            return (
              <div key={k} className="flex flex-col items-center gap-0.5 py-1">
                <Ic size={13} strokeWidth={2} style={{ color: M[k].color }} />
                <span
                  className="gd-mono gd-t-md font-bold"
                  style={{ color: k === "new" ? "var(--gd-ink-2)" : M[k].color }}
                >
                  {counts[k]}
                </span>
                <span className="gd-t-3xs" style={{ color: "var(--gd-ink-3)" }}>
                  {M[k].label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="gd-hairline-t mt-3 pt-3">
          <p className="gd-label" style={{ color: "var(--gd-blue)" }}>
            {hero.label}
          </p>
          <p
            className="gd-t-sm mt-1.5 font-bold break-keep"
            style={{ color: "var(--gd-ink)", ...CLAMP2 }}
          >
            {heroSk?.title ?? heroC.title}
          </p>
          <p className="gd-t-3xs mt-0.5" style={{ color: "var(--gd-ink-2)" }}>
            {unitLabel(heroC.unitId)} · {heroC.unitTitle}
            {heroC.attempts > 0 && ` · 숙달 ${heroC.score}`}
          </p>
          <p
            className="gd-t-2xs mt-1.5 break-keep"
            style={{ color: "var(--gd-ink-2)", ...CLAMP2 }}
          >
            {heroWhy}
          </p>
          <Link href={heroHref} className="gd-btn gd-btn-primary mt-3 w-full">
            {hero.cta}
            <ChevronRight size={16} strokeWidth={2.4} />
          </Link>
        </div>
      </div>

      {/* 4파트 아코디언(기초 골격 · 골격기 · 연결기 · 정밀기) — 단일 개방 */}
      <div className="mt-3 flex flex-col gap-2">
        {GRAMMAR_PARTS.map((p) => {
          const pUnits = grid.filter((u) => u.part === p.part);
          const pc = pUnits.flatMap((u) => u.concepts);
          const done = pc.filter((c) => mkey(c.score, c.attempts) === "mastered").length;
          const lessonPool = pc.filter((c) => c.lesson);
          const lessonDone = lessonPool.filter((c) => c.lesson!.completed).length;
          const open = effOpen === p.part;
          const panelId = `mm-part-${p.part}`;
          return (
            <div key={p.part} className="gd-card overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenPart(open ? CLOSED : p.part)}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex min-h-[3.25rem] w-full items-center gap-2.5 px-3.5 py-2 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="gd-t-sm font-bold" style={{ color: "var(--gd-ink)" }}>
                      {partLabel(p.part, p.name)}
                    </span>
                    <span className="gd-mono gd-t-2xs" style={{ color: "var(--gd-ink-2)" }}>
                      {done}/{pc.length}
                    </span>
                    {lessonPool.length > 0 && (
                      <span className="gd-t-3xs" style={{ color: "var(--gd-ink-3)" }}>
                        레슨 {lessonDone}/{lessonPool.length}
                      </span>
                    )}
                  </div>
                  <p className="gd-t-3xs mt-0.5 truncate" style={{ color: "var(--gd-ink-3)" }}>
                    {p.tagline}
                  </p>
                  <div
                    className="gd-meter mt-1.5"
                    data-tone={pc.length > 0 && done === pc.length ? "good" : undefined}
                  >
                    <span style={{ width: `${pc.length ? (done / pc.length) * 100 : 0}%` }} />
                  </div>
                </div>
                <ChevronDown
                  size={18}
                  strokeWidth={2}
                  className="gd-chev shrink-0"
                  style={{
                    color: "var(--gd-ink-3)",
                    transform: open ? "rotate(180deg)" : "none",
                  }}
                />
              </button>
              {open && (
                <div id={panelId} role="region" className="gd-hairline-t px-3.5 pb-2.5 pt-1">
                  {pUnits.map((u) => (
                    <UnitRows key={u.unitId} unit={u} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {legendOpen && <MasteryLegendSheet onClose={() => setLegendOpen(false)} />}
    </section>
  );
}

// ── 유닛 한 덩어리(헤더 + 개념 행) ──────────────────────────────────────────

function UnitRows({ unit }: { unit: MasteryGridUnit }) {
  const freq = UNIT_FREQ.get(unit.unitId) ?? null;
  const locked = unit.locked;
  const headInner = (
    <>
      <span
        className="gd-mono gd-t-3xs w-6 shrink-0 font-bold"
        style={{ color: "var(--gd-ink-2)" }}
      >
        {unitLabel(unit.unitId)}
      </span>
      <span
        className="gd-t-sm min-w-0 flex-1 truncate font-semibold"
        style={{ color: locked ? "var(--gd-ink-3)" : "var(--gd-ink)" }}
      >
        {unit.title}
      </span>
      {/* 기초 유닛은 수능 출제 빈도가 없다(frequency null) — 점을 지어내지 않는다. */}
      {freq !== null && (
        <span className="flex shrink-0 items-center gap-0.5" aria-label={`출제 빈도 ${freq}/5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className="h-1 w-1 rounded-full"
              style={{ background: n <= freq ? "var(--gd-ink-2)" : "var(--gd-line)" }}
            />
          ))}
        </span>
      )}
      {locked ? (
        <Lock size={13} strokeWidth={1.75} style={{ color: "var(--gd-ink-3)" }} />
      ) : (
        <BookOpen size={14} strokeWidth={1.75} style={{ color: "var(--gd-ink-3)" }} />
      )}
    </>
  );

  return (
    <div className="mt-2">
      {locked ? (
        <div
          className="flex min-h-[2.75rem] items-center gap-2 py-1"
          aria-label={`${unit.title} — 이전 유닛의 드릴을 마치면 열립니다`}
        >
          {headInner}
        </div>
      ) : (
        <Link
          href={`/g/unit/${unit.unitId}`}
          className="flex min-h-[2.75rem] items-center gap-2 py-1"
        >
          {headInner}
        </Link>
      )}
      <div
        className="ml-2 flex flex-col border-l pl-2.5"
        style={{ borderColor: "var(--gd-line)", opacity: locked ? 0.5 : 1 }}
      >
        {unit.concepts.map((c) => (
          <ConceptRow key={c.conceptId} unitId={unit.unitId} locked={locked} concept={c} />
        ))}
      </div>
    </div>
  );
}

function ConceptRow({
  unitId,
  locked,
  concept: c,
}: {
  unitId: string;
  locked: boolean;
  concept: MasteryGridUnit["concepts"][number];
}) {
  const k = mkey(c.score, c.attempts);
  const Ic = M[k].Icon;
  const sk = CONCEPT_SKELETON_BY_ID.get(c.conceptId);
  const lesson = c.lesson;
  // 레슨이 남아 있으면 행도 레슨을 가리킨다 — 배우기 전에 훈련시키지 않는다.
  const href =
    lesson && !lesson.completed
      ? lessonHref(unitId, c.conceptId)
      : drillHref(unitId, c.conceptId);

  const inner = (
    <>
      <Ic size={15} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: M[k].color }} />
      <div className="min-w-0 flex-1">
        <p className="gd-t-sm font-medium" style={{ color: "var(--gd-ink)", ...CLAMP2 }}>
          {sk?.title ?? c.title}
        </p>
        <p className="gd-t-2xs break-keep" style={{ color: "var(--gd-ink-2)", ...CLAMP2 }}>
          {sk?.oneLiner}
        </p>
        {lesson && (
          <span className="mt-1 flex flex-wrap items-center gap-1">
            <LessonBadge lesson={lesson} />
            {isLowConfidence(lesson) && <LowConfidenceBadge />}
          </span>
        )}
      </div>
      <span
        className="gd-mono gd-t-sm mt-0.5 w-7 shrink-0 text-right font-bold"
        style={{ color: c.attempts ? M[k].color : "var(--gd-ink-3)" }}
      >
        {c.attempts ? c.score : "—"}
      </span>
      {locked ? (
        <Lock
          size={13}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0"
          style={{ color: "var(--gd-ink-3)" }}
        />
      ) : (
        <ChevronRight
          size={15}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0"
          style={{ color: "var(--gd-ink-3)" }}
        />
      )}
    </>
  );

  // 잠긴 유닛의 개념은 링크가 아니라 비활성 행이다(순차잠금 우회 차단).
  return locked ? (
    <div className="flex min-h-[2.75rem] items-start gap-2 py-1.5">{inner}</div>
  ) : (
    <Link href={href} className="flex min-h-[2.75rem] items-start gap-2 py-1.5">
      {inner}
    </Link>
  );
}
