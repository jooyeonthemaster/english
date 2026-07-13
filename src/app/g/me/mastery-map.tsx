"use client";

// ── 개념 숙달 지도 ─────────────────────────────────────────────────────────
// 이름 없는 12×N 색칠 행렬을 폐기하고 커리큘럼 서사(3파트 → 12유닛 → 47개념)를
// 그대로 세운다. 유닛·개념은 항상 텍스트 이름으로 노출하고, 색은 아이콘 형태·
// 숙달 숫자와 함께 보조 채널로만 쓴다(색 단독 의존 회피). 상세 설명은 표면에
// 흘리지 않고 온탭 아코디언·'읽는 법' 시트로 계층화한다.

import { type CSSProperties, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  HelpCircle,
  X,
} from "lucide-react";
import {
  CONCEPT_SKELETON_BY_ID,
  GRAMMAR_PARTS,
  GRAMMAR_UNITS,
  unitNumber,
} from "@/lib/grammar-drill/curriculum";

export interface MasteryGridUnit {
  unitId: string;
  title: string;
  part: number;
  concepts: {
    conceptId: string;
    title: string;
    score: number;
    attempts: number;
    correct: number;
    box: number;
  }[];
}

type MKey = "mastered" | "learning" | "weak" | "new";

const M: Record<MKey, { label: string; color: string; Icon: typeof Circle }> = {
  mastered: { label: "완성", color: "var(--gd-good)", Icon: CheckCircle2 },
  learning: { label: "숙달", color: "var(--gd-blue)", Icon: CircleDot },
  weak: { label: "취약", color: "var(--gd-bad)", Icon: AlertTriangle },
  new: { label: "미시작", color: "var(--gd-ink-3)", Icon: Circle },
};

// 숙달 4단계 — heat() 광역밴드·data-tone=good(≥70) 관례와 정합(임계 50/85).
const mkey = (score: number, attempts: number): MKey =>
  attempts === 0 ? "new" : score < 50 ? "weak" : score < 85 ? "learning" : "mastered";

const UNIT_FREQ = new Map(GRAMMAR_UNITS.map((u) => [u.id, u.frequency]));
const BUCKETS: MKey[] = ["mastered", "learning", "weak", "new"];
// 진행 바는 완성/숙달/취약만 채우고, 남은 트랙이 곧 '미시작'이다(별도 회색 세그먼트
// 가 트랙과 안 구분되던 문제 해소). 채워진 만큼이 지금까지의 진척이 된다.
const BAR_TIERS: MKey[] = ["mastered", "learning", "weak"];
const LEGEND_ROWS: [MKey, string][] = [
  ["mastered", "85점 이상 — 완성한 개념입니다"],
  ["learning", "50~84점 — 익히는 중입니다"],
  ["weak", "50점 미만 — 더 훈련해야 합니다"],
  ["new", "아직 풀지 않은 개념입니다"],
];
// 긴 한 줄 설명은 문단으로 흘리지 않고 2줄에서 자른다(못생긴 줄바꿈 방지).
const CLAMP2: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

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
    u.concepts.map((c) => ({ ...c, unitId: u.unitId, unitTitle: u.title })),
  );
  const counts: Record<MKey, number> = { mastered: 0, learning: 0, weak: 0, new: 0 };
  for (const c of flat) counts[mkey(c.score, c.attempts)]++;

  // 다음 행동 대상 선정 — (1) 시도했으나 미완성(취약·학습중)이 있으면 그중 최저점,
  // (2) 없으면 커리큘럼 순서상 다음 미시작 개념, (3) 전부 완성이면 복습(최저점) 유도.
  // 미시작을 후보에 넣지 않아 '완성한 개념을 약한 개념으로 오지목'하던 결함을 제거.
  const attempted = flat.filter((c) => c.attempts > 0);
  const nonMastered = attempted.filter((c) => c.score < 85);
  const firstNew = flat.find((c) => c.attempts === 0);
  const allMastered = attempted.length > 0 && nonMastered.length === 0 && !firstNew;

  const hero = allMastered
    ? { c: [...attempted].sort((a, b) => a.score - b.score)[0], label: "전 과정 완성", cta: "복습 이어가기" }
    : nonMastered.length
      ? { c: [...nonMastered].sort((a, b) => a.score - b.score)[0], label: "가장 약한 개념", cta: "이 개념부터 훈련하기" }
      : {
          c: firstNew ?? flat[0],
          label: attempted.length ? "다음 개념" : "여기서 시작합니다",
          cta: attempted.length ? "다음 개념 시작하기" : "첫 개념 시작하기",
        };
  const heroC = hero.c;
  const heroSk = CONCEPT_SKELETON_BY_ID.get(heroC.conceptId);

  // 자동 펼침 = 아직 완성 안 된 개념이 있는 첫 파트(신규생은 골격기).
  const currentPart =
    GRAMMAR_PARTS.find((p) =>
      grid.some(
        (u) =>
          u.part === p.part &&
          u.concepts.some((c) => mkey(c.score, c.attempts) !== "mastered"),
      ),
    )?.part ?? 1;
  const effOpen = openPart ?? currentPart; // 0 = 전부 닫힘

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
            {unitNumber(heroC.unitId)}강 · {heroC.unitTitle}
            {heroC.attempts > 0 && ` · 숙달 ${heroC.score}`}
          </p>
          <p
            className="gd-t-2xs mt-1.5 break-keep"
            style={{ color: "var(--gd-ink-2)", ...CLAMP2 }}
          >
            {heroSk?.oneLiner}
          </p>
          <Link
            href={`/g/drill?mode=drill&unitId=${heroC.unitId}&conceptId=${heroC.conceptId}`}
            className="gd-btn gd-btn-primary mt-3 w-full"
          >
            {hero.cta}
            <ChevronRight size={16} strokeWidth={2.4} />
          </Link>
        </div>
      </div>

      {/* 3파트 아코디언 — 단일 개방, 진행 파트 자동 펼침 */}
      <div className="mt-3 flex flex-col gap-2">
        {GRAMMAR_PARTS.map((p) => {
          const pUnits = grid.filter((u) => u.part === p.part);
          const pc = pUnits.flatMap((u) => u.concepts);
          const done = pc.filter((c) => mkey(c.score, c.attempts) === "mastered").length;
          const open = effOpen === p.part;
          const panelId = `mm-part-${p.part}`;
          return (
            <div key={p.part} className="gd-card overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenPart(open ? 0 : p.part)}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex min-h-[3.25rem] w-full items-center gap-2.5 px-3.5 py-2 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="gd-t-sm font-bold" style={{ color: "var(--gd-ink)" }}>
                      {p.part}부 {p.name}
                    </span>
                    <span className="gd-mono gd-t-2xs" style={{ color: "var(--gd-ink-2)" }}>
                      {done}/{pc.length}
                    </span>
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
                  {pUnits.map((u) => {
                    const freq = UNIT_FREQ.get(u.unitId) ?? 0;
                    return (
                      <div key={u.unitId} className="mt-2">
                        <Link
                          href={`/g/unit/${u.unitId}`}
                          className="flex min-h-[2.75rem] items-center gap-2 py-1"
                        >
                          <span
                            className="gd-mono gd-t-3xs w-6 shrink-0 font-bold"
                            style={{ color: "var(--gd-ink-2)" }}
                          >
                            U{unitNumber(u.unitId)}
                          </span>
                          <span
                            className="gd-t-sm min-w-0 flex-1 truncate font-semibold"
                            style={{ color: "var(--gd-ink)" }}
                          >
                            {u.title}
                          </span>
                          <span
                            className="flex shrink-0 items-center gap-0.5"
                            aria-label={`출제 빈도 ${freq}/5`}
                          >
                            {[1, 2, 3, 4, 5].map((n) => (
                              <span
                                key={n}
                                className="h-1 w-1 rounded-full"
                                style={{
                                  background:
                                    n <= freq ? "var(--gd-ink-2)" : "var(--gd-line)",
                                }}
                              />
                            ))}
                          </span>
                          <BookOpen
                            size={14}
                            strokeWidth={2}
                            style={{ color: "var(--gd-ink-3)" }}
                          />
                        </Link>
                        <div
                          className="ml-2 flex flex-col border-l pl-2.5"
                          style={{ borderColor: "var(--gd-line)" }}
                        >
                          {u.concepts.map((c) => {
                            const k = mkey(c.score, c.attempts);
                            const Ic = M[k].Icon;
                            const sk = CONCEPT_SKELETON_BY_ID.get(c.conceptId);
                            return (
                              <Link
                                key={c.conceptId}
                                href={`/g/drill?mode=drill&unitId=${u.unitId}&conceptId=${c.conceptId}`}
                                className="flex min-h-[2.75rem] items-start gap-2 py-1.5"
                              >
                                <Ic
                                  size={15}
                                  strokeWidth={2}
                                  className="mt-0.5 shrink-0"
                                  style={{ color: M[k].color }}
                                />
                                <div className="min-w-0 flex-1">
                                  <p
                                    className="gd-t-sm font-medium"
                                    style={{ color: "var(--gd-ink)", ...CLAMP2 }}
                                  >
                                    {sk?.title ?? c.title}
                                  </p>
                                  <p
                                    className="gd-t-2xs break-keep"
                                    style={{ color: "var(--gd-ink-2)", ...CLAMP2 }}
                                  >
                                    {sk?.oneLiner}
                                  </p>
                                </div>
                                <span
                                  className="gd-mono gd-t-sm mt-0.5 w-7 shrink-0 text-right font-bold"
                                  style={{
                                    color: c.attempts ? M[k].color : "var(--gd-ink-3)",
                                  }}
                                >
                                  {c.attempts ? c.score : "—"}
                                </span>
                                <ChevronRight
                                  size={15}
                                  strokeWidth={2}
                                  className="mt-0.5 shrink-0"
                                  style={{ color: "var(--gd-ink-3)" }}
                                />
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 읽는 법 — 온탭 하단 시트(색·숫자·아이콘 사전) */}
      {legendOpen && (
        <>
          <button
            type="button"
            aria-label="닫기"
            className="gd-sheet-backdrop"
            onClick={() => setLegendOpen(false)}
          />
          <div className="gd-sheet gd-app gd-safe-b" role="dialog" aria-modal="true">
            <div className="gd-sheet-grip" />
            <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
              <p className="gd-t-md font-bold">숙달 지도 읽는 법</p>
              <button
                type="button"
                onClick={() => setLegendOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full"
                style={{ color: "var(--gd-ink-3)" }}
                aria-label="닫기"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="gd-scroll min-h-0 flex-1 px-5 pb-6">
              <p className="gd-t-sm break-keep" style={{ color: "var(--gd-ink-2)" }}>
                각 개념의{" "}
                <strong style={{ color: "var(--gd-ink)" }}>숫자는 0~100 숙달도</strong>
                입니다. 색과 아이콘이 아래 네 단계를 함께 나타냅니다.
              </p>
              <div className="mt-3 flex flex-col gap-1">
                {LEGEND_ROWS.map(([k, desc]) => {
                  const Ic = M[k].Icon;
                  return (
                    <div key={k} className="flex items-center gap-3 py-1.5">
                      <Ic
                        size={20}
                        strokeWidth={2}
                        className="shrink-0"
                        style={{ color: M[k].color }}
                      />
                      <span
                        className="gd-t-sm w-12 shrink-0 font-bold"
                        style={{ color: M[k].color }}
                      >
                        {M[k].label}
                      </span>
                      <span className="gd-t-xs break-keep" style={{ color: "var(--gd-ink-2)" }}>
                        {desc}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
