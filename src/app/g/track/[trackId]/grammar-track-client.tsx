"use client";

// 어법 트랙 허브 — 유닛맵이 주인공이다.
// PART 0(기초 골격 b01~b07) 과 PART 1~3(수능 판별 u01~u12) 은 해금이 독립이며,
// 학생은 이 화면 최상단에서 언제나 "다음 한 수"를 본다(docs/study-os-spec.md §4).

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronRight,
  Lock,
  Ruler,
  Trophy,
} from "lucide-react";
import { BackBar } from "@/components/grammar-drill/back-bar";
import { stageLabel } from "@/components/grammar-drill/verdict-panel";

export interface TrackUnitRow {
  id: string;
  title: string;
  subtitle: string;
  part: 0 | 1 | 2 | 3;
  group: "BASIC" | "JUDGE";
  frequency: number | null;
  frequencyNote: string;
  stage: string;
  stageSet: "FULL" | "BASIC";
  locked: boolean;
  lessonsDone: number;
  lessonsTotal: number;
  mastery: number;
  bestTestScore: number | null;
  touchedAt: number;
}

export interface TrackPartMeta {
  part: 0 | 1 | 2 | 3;
  name: string;
  tagline: string;
}

export interface NextMove {
  label: string;
  sub: string;
  why: string;
  href: string;
}

export function GrammarTrackClient({
  trackName,
  tagline,
  units,
  parts,
  next,
}: {
  trackName: string;
  tagline: string;
  units: TrackUnitRow[];
  parts: TrackPartMeta[];
  next: NextMove;
}) {
  const router = useRouter();

  const basic = units.filter((u) => u.group === "BASIC");
  const judge = units.filter((u) => u.group === "JUDGE");
  const basicMastered = basic.filter((u) => u.stage === "MASTERED").length;
  const judgeMastered = judge.filter((u) => u.stage === "MASTERED").length;
  const partOf = (p: 0 | 1 | 2 | 3) => parts.find((x) => x.part === p);
  const judgeParts = parts.filter((p) => p.part > 0);

  return (
    <div className="gd-page mx-auto min-h-dvh px-5 pb-14">
      <header className="pt-[max(1rem,env(safe-area-inset-top))]">
        <BackBar onBack={() => router.push("/g/home")} ariaLabel="홈으로" label="학습 트랙" />
      </header>

      <h1 className="gd-t-xl mt-2 font-bold tracking-tight">{trackName}</h1>
      <p className="gd-prose-2 mt-1">{tagline}</p>
      <p className="gd-t-xs mt-1.5" style={{ color: "var(--gd-ink-3)" }}>
        수능 판별{" "}
        <strong className="gd-mono" style={{ color: "var(--gd-ink-2)" }}>
          {judgeMastered}/{judge.length}
        </strong>{" "}
        · 기초 골격{" "}
        <strong className="gd-mono" style={{ color: "var(--gd-ink-2)" }}>
          {basicMastered}/{basic.length}
        </strong>{" "}
        유닛 마스터
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

      {/* ── PART 0 · 기초 골격 ── */}
      <UnitSection
        eyebrow="PART 0"
        name={partOf(0)?.name ?? "기초 골격"}
        tagline={partOf(0)?.tagline ?? ""}
        units={basic}
      />

      {/* ── PART 1~3 · 수능 판별 ── */}
      <section className="mt-8">
        <div className="gd-hairline-b pb-2">
          <p className="gd-label" style={{ color: "var(--gd-blue)" }}>
            PART 1~3 · 수능 판별
          </p>
          <p className="gd-prose-2 mt-1">
            선지를 가르는 12개의 판별 유닛입니다. 순서대로 열립니다.
          </p>
        </div>
        {judgeParts.map((p) => (
          <UnitSection
            key={p.part}
            eyebrow={`PART ${p.part}`}
            name={p.name}
            tagline={p.tagline}
            units={judge.filter((u) => u.part === p.part)}
            nested
          />
        ))}
      </section>

      {/* ── 판별 5도구 ── */}
      <Link
        href="/g/tools"
        className="gd-card mt-8 flex items-center gap-3 px-3.5 py-3.5"
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }}
        >
          <Ruler className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="gd-t-md font-semibold">판별 5도구</p>
          <p className="gd-t-xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
            절의 완전성 · 동사 자리 카운팅 등 — 문제 앞에서 꺼내 쓰는 절차입니다
          </p>
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0"
          style={{ color: "var(--gd-ink-3)" }}
        />
      </Link>
    </div>
  );
}

// ── 파트 섹션 ────────────────────────────────────────────────────────────────

function UnitSection({
  eyebrow,
  name,
  tagline,
  units,
  nested,
}: {
  eyebrow: string;
  name: string;
  tagline: string;
  units: TrackUnitRow[];
  nested?: boolean;
}) {
  if (units.length === 0) return null;
  const mastered = units.filter((u) => u.stage === "MASTERED").length;

  return (
    <section className={nested ? "mt-5" : "mt-8"}>
      <div className={nested ? "mb-2" : "gd-hairline-b mb-3 pb-2"}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="gd-label" style={{ color: nested ? undefined : "var(--gd-blue)" }}>
            {eyebrow} · {name}
          </p>
          <p
            className="gd-mono gd-t-2xs shrink-0"
            style={{ color: "var(--gd-ink-3)" }}
          >
            {mastered}/{units.length}
          </p>
        </div>
        <p
          className={nested ? "gd-t-xs mt-0.5" : "gd-prose-2 mt-1"}
          style={nested ? { color: "var(--gd-ink-3)" } : undefined}
        >
          {tagline}
        </p>
      </div>
      <div className="gd-grid-2 flex flex-col gap-2.5">
        {units.map((u) => (
          <UnitCard key={u.id} unit={u} />
        ))}
      </div>
    </section>
  );
}

// ── 유닛 카드 ────────────────────────────────────────────────────────────────

function UnitCard({ unit }: { unit: TrackUnitRow }) {
  const mastered = unit.stage === "MASTERED";
  const started = unit.touchedAt > 0 || unit.lessonsDone > 0;

  const card = (
    <div
      className="gd-card flex h-full flex-col px-3.5 py-3.5"
      style={unit.locked ? { opacity: 0.55 } : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          className="gd-mono gd-t-2xs flex h-6 shrink-0 items-center rounded-md px-1.5 font-bold"
          style={
            mastered
              ? { background: "var(--gd-good-soft)", color: "var(--gd-master)" }
              : { background: "var(--gd-paper)", color: "var(--gd-ink-3)" }
          }
        >
          {unit.id.toUpperCase()}
        </span>
        <p
          className="gd-t-md min-w-0 flex-1 truncate font-semibold"
          style={{ wordBreak: "keep-all" }}
        >
          {unit.title}
        </p>
        {unit.locked ? (
          <Lock
            className="h-4 w-4 shrink-0"
            strokeWidth={1.75}
            style={{ color: "var(--gd-ink-3)" }}
            aria-label="잠김"
          />
        ) : mastered ? (
          <Trophy
            className="h-4 w-4 shrink-0"
            strokeWidth={1.75}
            style={{ color: "var(--gd-master)" }}
            aria-label="마스터"
          />
        ) : (
          <ChevronRight
            className="h-4 w-4 shrink-0"
            style={{ color: "var(--gd-ink-3)" }}
          />
        )}
      </div>

      <p
        className="gd-t-xs mt-1.5 leading-snug"
        style={{
          color: "var(--gd-ink-3)",
          wordBreak: "keep-all",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {unit.locked ? "앞 유닛의 드릴을 마치면 열립니다" : unit.frequencyNote}
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        <div
          className="gd-meter flex-1"
          data-tone={mastered ? "good" : undefined}
          role="img"
          aria-label={`숙달도 ${unit.mastery}점`}
        >
          <span style={{ width: `${Math.min(100, unit.mastery)}%` }} />
        </div>
        <span
          className="gd-mono gd-t-3xs shrink-0"
          style={{ color: mastered ? "var(--gd-master)" : "var(--gd-ink-3)" }}
        >
          숙달 {unit.mastery}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        {unit.frequency !== null && (
          <span
            className="gd-t-3xs shrink-0"
            style={{ color: "var(--gd-ink-3)" }}
            aria-label={`출제율 5점 만점에 ${unit.frequency}점`}
          >
            {"★".repeat(unit.frequency)}
            {"☆".repeat(5 - unit.frequency)}
          </span>
        )}
        <span
          className="gd-t-3xs truncate"
          style={{ color: "var(--gd-ink-3)" }}
        >
          {unit.lessonsTotal > 0
            ? `개념 ${unit.lessonsDone}/${unit.lessonsTotal}`
            : "개념 준비 중"}
        </span>
        <span className="ml-auto shrink-0">
          <span
            className="gd-t-3xs font-semibold"
            style={{
              color: unit.locked
                ? "var(--gd-ink-3)"
                : mastered
                  ? "var(--gd-master)"
                  : "var(--gd-blue)",
            }}
          >
            {unit.locked
              ? "잠김"
              : mastered
                ? "마스터"
                : started
                  ? `${stageLabel(unit.stage)} 단계`
                  : "시작하기"}
          </span>
        </span>
      </div>
    </div>
  );

  if (unit.locked) {
    return (
      <div aria-disabled="true" title="앞 유닛의 드릴을 마치면 열립니다">
        {card}
      </div>
    );
  }
  return (
    <Link href={`/g/unit/${unit.id}`} className="block">
      {card}
    </Link>
  );
}
