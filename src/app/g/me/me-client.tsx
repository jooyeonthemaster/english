"use client";

// 내 기록 — 개념 숙달 지도(4파트×19유닛: 기초 7 + 판별 12) · 유형/난이도 정답률 · 14일 활동.
// 개념 행에는 레슨(개념 학습) 진행과 드릴 숙달도가 함께 실린다.
// GShell(내 기록 탭 활성) 안에서 렌더 — 뒤로가기 대신 하단 탭바로 이동한다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MasteryMap, type MasteryGridUnit } from "./mastery-map";

interface MePayload {
  studentName: string;
  grid: MasteryGridUnit[];
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

export function MeClient() {
  const router = useRouter();
  const [me, setMe] = useState<MePayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

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
  }, [router, reload]);

  if (failed) {
    return (
      <div className="gd-page flex min-h-[60dvh] flex-col items-center justify-center px-5">
        <p className="gd-prose-2 text-center">기록을 불러오지 못했습니다.</p>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setReload((n) => n + 1);
          }}
          className="gd-btn gd-btn-primary mt-4 w-full"
        >
          다시 불러오기
        </button>
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
    <div className="gd-page px-5 pb-6 pt-5">
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

      {/* ── 개념 숙달 지도 ── */}
      <MasteryMap grid={me.grid} />

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
