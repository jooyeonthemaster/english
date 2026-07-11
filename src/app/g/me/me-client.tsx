"use client";

// 내 기록 — 숙달 히트맵(12유닛×개념) · 유형/난이도 정답률 · 14일 활동 계기판.
// GShell(내 기록 탭 활성) 안에서 렌더 — 뒤로가기 대신 하단 탭바로 이동한다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface MePayload {
  studentName: string;
  grid: {
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
  }[];
  byType: Record<string, { total: number; correct: number }>;
  byDifficulty: Record<string, { total: number; correct: number }>;
  days: { day: string; solved: number; correct: number }[];
  totals: { solved: number; correct: number; hintRate: number; avgTimeMs: number };
}

const TYPE_LABEL: Record<string, string> = {
  CHOICE: "괄호 택일",
  OX: "밑줄 OX",
  MULTI_UNDERLINE: "미니 29번",
  PASSAGE: "지문 실전",
  WRITE_FORM: "서술형 변형",
  WRITE_CORRECT: "서술형 수정",
};

function heat(score: number, attempts: number): string {
  if (attempts === 0) return "var(--gd-paper)";
  if (score >= 85) return "#065f46";
  if (score >= 70) return "#059669";
  if (score >= 50) return "#6ee7b7";
  if (score >= 30) return "#fda4af";
  return "#e11d48";
}

export function MeClient() {
  const router = useRouter();
  const [me, setMe] = useState<MePayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/grammar-drill/me")
      .then((r) => {
        if (r.status === 401) {
          router.replace("/g");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        if (d.ok) setMe(d.me);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [router]);

  if (failed) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
          기록을 불러오지 못했습니다.
        </p>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <p className="gd-t-sm" style={{ color: "var(--gd-ink-3)" }}>
          불러오는 중…
        </p>
      </div>
    );
  }

  const acc = me.totals.solved
    ? Math.round((me.totals.correct / me.totals.solved) * 100)
    : 0;
  const maxDay = Math.max(1, ...me.days.map((d) => d.solved));

  return (
    <div className="mx-auto max-w-md px-5 pb-6 pt-5">
      <header>
        <h1 className="gd-t-xl font-bold tracking-tight">내 기록</h1>
        <p className="gd-t-2xs mt-1" style={{ color: "var(--gd-ink-3)" }}>
          누적 풀이와 개념 숙달 현황을 확인합니다
        </p>
      </header>

      {/* ── 총괄 계기판 ── */}
      <div className="gd-card mt-4 grid grid-cols-4 divide-x p-0" style={{ borderColor: "var(--gd-line)" }}>
        <Cell label="누적 풀이" value={me.totals.solved.toLocaleString()} />
        <Cell label="정답률" value={`${acc}%`} />
        <Cell label="힌트 의존" value={`${Math.round(me.totals.hintRate * 100)}%`} />
        <Cell label="평균 풀이" value={`${Math.round(me.totals.avgTimeMs / 1000)}초`} />
      </div>

      {/* ── 14일 활동 ── */}
      <section className="mt-6">
        <p className="gd-label mb-2">최근 14일</p>
        <div className="gd-card flex items-end gap-1 px-3.5 pb-2 pt-4" style={{ height: "5.5rem" }}>
          {me.days.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-sm"
                style={{
                  height: `${Math.max(2, (d.solved / maxDay) * 44)}px`,
                  background: d.solved === 0 ? "var(--gd-line)" : "var(--gd-blue)",
                  opacity: d.solved === 0 ? 0.6 : 0.4 + 0.6 * (d.solved / maxDay),
                }}
                title={`${d.day} · ${d.solved}문항`}
              />
              <span className="gd-t-3xs" style={{ color: "var(--gd-ink-3)", fontSize: "0.5rem" }}>
                {d.day.slice(3)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 숙달 히트맵 ── */}
      <section className="mt-6">
        <p className="gd-label mb-2">개념 숙달 지도</p>
        <div className="gd-card p-3.5">
          <div className="flex flex-col gap-1.5">
            {me.grid.map((u) => (
              <div key={u.unitId} className="flex items-center gap-2">
                <span className="gd-mono gd-t-3xs w-7 shrink-0 font-bold" style={{ color: "var(--gd-ink-2)" }}>
                  U{parseInt(u.unitId.slice(1), 10)}
                </span>
                <div className="flex flex-1 gap-1">
                  {u.concepts.map((c) => (
                    <Link
                      key={c.conceptId}
                      href={`/g/drill?mode=drill&unitId=${u.unitId}&conceptId=${c.conceptId}`}
                      className="flex h-7 flex-1 items-center justify-center rounded-md"
                      style={{
                        background: heat(c.score, c.attempts),
                        border: "1px solid var(--gd-line)",
                      }}
                      title={`${c.title} — 숙달 ${c.score} (${c.attempts}회)`}
                    >
                      {c.attempts > 0 && (
                        <span
                          className="gd-mono gd-t-3xs font-bold"
                          style={{ color: c.score >= 50 && c.score < 70 ? "#065f46" : "#fff" }}
                        >
                          {c.score}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="gd-hairline-t mt-3 flex items-center justify-end gap-2 pt-2.5">
            <span className="gd-t-3xs" style={{ color: "var(--gd-ink-3)" }}>
              취약
            </span>
            {["#e11d48", "#fda4af", "#6ee7b7", "#059669", "#065f46"].map((c) => (
              <span key={c} className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
            ))}
            <span className="gd-t-3xs" style={{ color: "var(--gd-ink-3)" }}>
              숙달
            </span>
          </div>
        </div>
      </section>

      {/* ── 유형별 정답률 ── */}
      <section className="mt-6">
        <p className="gd-label mb-2">유형별 정답률</p>
        <div className="gd-card flex flex-col gap-2.5 p-3.5">
          {Object.entries(TYPE_LABEL).map(([type, label]) => {
            const s = me.byType[type];
            const pct = s?.total ? Math.round((s.correct / s.total) * 100) : null;
            return (
              <div key={type} className="flex items-center gap-2.5">
                <span className="gd-t-2xs w-20 shrink-0 font-medium" style={{ color: "var(--gd-ink-2)" }}>
                  {label}
                </span>
                <div className="gd-meter flex-1" data-tone={pct !== null && pct >= 70 ? "good" : undefined}>
                  <span style={{ width: `${pct ?? 0}%` }} />
                </div>
                <span className="gd-mono gd-t-2xs w-14 shrink-0 text-right" style={{ color: "var(--gd-ink-2)" }}>
                  {pct === null ? "—" : `${pct}%`}
                  {s?.total ? <span style={{ color: "var(--gd-ink-3)" }}> {s.total}</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 난이도별 ── */}
      <section className="mt-6">
        <p className="gd-label mb-2">난이도별 정답률</p>
        <div className="gd-card grid grid-cols-4 divide-x p-0" style={{ borderColor: "var(--gd-line)" }}>
          {(["1", "2", "3", "4"] as const).map((d) => {
            const s = me.byDifficulty[d];
            const pct = s?.total ? Math.round((s.correct / s.total) * 100) : null;
            return (
              <Cell
                key={d}
                label={["기초", "표준", "심화", "킬러"][Number(d) - 1]}
                value={pct === null ? "—" : `${pct}%`}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center py-3" style={{ borderColor: "var(--gd-line)" }}>
      <p className="gd-mono gd-t-md font-bold">{value}</p>
      <p className="gd-t-3xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
        {label}
      </p>
    </div>
  );
}
