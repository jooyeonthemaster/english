"use client";

// ============================================================================
// /g/vocab — 학생 누적 취약 단어장 (지문 무관, 계속 쌓이는 나만의 오답 노트)
//
// 데이터 페치 없음 — page.tsx(서버)가 조립한 props 만 렌더한다. 정렬·필터는
// 클라 상태(useMemo)로만. 차트 라이브러리 금지, 기존 gd-* 클래스 + 인라인
// var(--gd-*) 만. 학생 노출 문구 전부 합니다체, 이모지 금지, lucide 아이콘만.
// reduced-motion 은 gd.css 가 존중한다(gd 애니메이션 클래스만 사용).
// ============================================================================

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";

export interface WeakWordHistoryRow {
  worksheetTitle: string;
  at: string; // ISO
  correct: boolean;
  response: string | null;
  attempt: number;
}

export interface WeakWordEntry {
  word: string;
  meaning: string | null;
  wrongCount: number;
  totalCount: number;
  lastWrongAt: string; // ISO
  recovered: boolean;
  /** 최근순 ≤20 */
  history: WeakWordHistoryRow[];
}

export interface StudentVocabData {
  /** wrongCount>0, 서버가 최근 오답순으로 정렬해 전달 */
  entries: WeakWordEntry[];
  totalWrongWords: number;
  /** 최근 7일(서울)에 '처음' 틀린 단어 수 */
  newThisWeek: number;
  recoveredCount: number;
}

type SortMode = "recent" | "frequent";

// ── 서울(KST, UTC+9 고정) 상대·절대 시각 헬퍼 ────────────────────────────────

const KST_OFFSET = 9 * 3_600_000;

/** 서울 자정 기준 일 인덱스 */
function seoulDayIndex(ms: number): number {
  return Math.floor((ms + KST_OFFSET) / 86_400_000);
}

/** "오늘"/"어제"/"N일 전"/"N주 전" — 서울 달력일 기준 */
function relativeDay(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = seoulDayIndex(Date.now()) - seoulDayIndex(then);
  if (diff <= 0) return "오늘";
  if (diff === 1) return "어제";
  if (diff < 7) return `${diff}일 전`;
  if (diff < 14) return "지난주";
  return `${Math.floor(diff / 7)}주 전`;
}

/** "7. 20. 14:32" — 서울 기준 절대 시각 */
function absoluteTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t + KST_OFFSET);
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mo}. ${day}. ${hh}:${mm}`;
}

// ── 소부품 ──────────────────────────────────────────────────────────────────

function StatCell({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "ink" | "bad" | "good";
}) {
  const color =
    tone === "bad" ? "var(--gd-bad)" : tone === "good" ? "var(--gd-good)" : "var(--gd-ink)";
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 text-center">
      <span className="gd-mono text-2xl font-bold leading-none tracking-tight" style={{ color }}>
        {value}
      </span>
      <span className="gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
        {label}
      </span>
    </div>
  );
}

const RECOVERED_BADGE: CSSProperties = {
  background: "var(--gd-good-soft)",
  color: "var(--gd-good)",
};

// ── 본체 ────────────────────────────────────────────────────────────────────

export function StudentVocabClient({ data }: { data: StudentVocabData }) {
  const router = useRouter();
  const [sort, setSort] = useState<SortMode>("recent");
  const [hideRecovered, setHideRecovered] = useState(false);
  const [open, setOpen] = useState<WeakWordEntry | null>(null);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/g/home");
  };

  const list = useMemo(() => {
    let rows = data.entries;
    if (hideRecovered) rows = rows.filter((e) => !e.recovered);
    if (sort === "frequent") {
      rows = [...rows].sort(
        (a, b) =>
          b.wrongCount - a.wrongCount ||
          new Date(b.lastWrongAt).getTime() - new Date(a.lastWrongAt).getTime(),
      );
    }
    // "recent" 는 서버 정렬(최근 오답순)을 그대로 사용
    return rows;
  }, [data.entries, hideRecovered, sort]);

  return (
    <div className="gd-page flex min-h-dvh flex-col gap-4 px-5 pb-10 pt-4">
      {/* ── 헤더 ── */}
      <header className="flex items-center gap-1">
        <button
          type="button"
          onClick={goBack}
          aria-label="뒤로 가기"
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ color: "var(--gd-ink-2)" }}
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
        <div className="min-w-0">
          <p className="gd-label">나의 단어장</p>
          <h1 className="gd-t-xl font-bold tracking-tight">취약 단어장</h1>
        </div>
      </header>

      {/* ── 히어로 스탯 카드 ── */}
      <section className="gd-card px-4 py-4">
        <div className="flex items-stretch">
          <StatCell value={data.totalWrongWords} label="누적 오답 단어" tone="ink" />
          <span className="w-px shrink-0" style={{ background: "var(--gd-line)" }} aria-hidden />
          <StatCell
            value={data.newThisWeek}
            label="이번 주 새로 틀림"
            tone={data.newThisWeek > 0 ? "bad" : "ink"}
          />
          <span className="w-px shrink-0" style={{ background: "var(--gd-line)" }} aria-hidden />
          <StatCell value={data.recoveredCount} label="극복" tone="good" />
        </div>
        <p className="gd-t-xs mt-3 text-center" style={{ color: "var(--gd-ink-2)" }}>
          모든 학습지에서 틀린 단어가 자동으로 모입니다
        </p>
      </section>

      {/* ── 빈 상태 ── */}
      {data.entries.length === 0 ? (
        <section className="gd-card flex flex-col items-center gap-3 px-5 py-12 text-center">
          <CheckCircle2 className="h-12 w-12" strokeWidth={1.5} style={{ color: "var(--gd-good)" }} aria-hidden />
          <p className="gd-t-md font-bold">아직 틀린 단어가 없습니다</p>
          <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
            학습을 진행하면 틀린 단어가 여기에 자동으로 모입니다
          </p>
        </section>
      ) : (
        <>
          {/* ── 컨트롤 행 ── */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="gd-btn-chip"
              style={{ minHeight: "2.75rem" }}
              data-active={sort === "recent" ? "true" : undefined}
              onClick={() => setSort("recent")}
            >
              최근 틀린 순
            </button>
            <button
              type="button"
              className="gd-btn-chip"
              style={{ minHeight: "2.75rem" }}
              data-active={sort === "frequent" ? "true" : undefined}
              onClick={() => setSort("frequent")}
            >
              많이 틀린 순
            </button>
            <span className="flex-1" aria-hidden />
            <button
              type="button"
              className="gd-btn-chip"
              style={{ minHeight: "2.75rem" }}
              data-active={hideRecovered ? "true" : undefined}
              aria-pressed={hideRecovered}
              onClick={() => setHideRecovered((v) => !v)}
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              극복 단어 숨기기
            </button>
          </div>

          {/* ── 단어 리스트 ── */}
          {list.length === 0 ? (
            <p className="gd-t-sm py-8 text-center" style={{ color: "var(--gd-ink-3)" }}>
              표시할 단어가 없습니다. 필터를 해제해 보세요.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((entry) => (
                <button
                  key={entry.word}
                  type="button"
                  onClick={() => setOpen(entry)}
                  aria-label={`${entry.word} 학습 이력 보기`}
                  className="gd-card flex items-center gap-3 px-4 py-3 text-left"
                  style={entry.recovered ? { background: "var(--gd-paper)" } : undefined}
                >
                  <div className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="gd-en gd-t-lg font-bold" style={{ color: "var(--gd-ink)" }}>
                        {entry.word}
                      </span>
                      {entry.recovered ? (
                        <span
                          className="gd-t-3xs inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold"
                          style={RECOVERED_BADGE}
                        >
                          <RotateCcw className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                          다시 맞힘
                        </span>
                      ) : null}
                    </span>
                    {entry.meaning ? (
                      <p className="gd-t-sm mt-0.5" style={{ color: "var(--gd-ink-2)" }}>
                        {entry.meaning}
                      </p>
                    ) : (
                      <p className="gd-t-xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
                        뜻 정보가 없는 기록입니다
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span
                      className="gd-t-2xs rounded-full px-2 py-0.5 font-bold"
                      style={
                        entry.recovered
                          ? { background: "var(--gd-paper)", color: "var(--gd-ink-3)", border: "1px solid var(--gd-line)" }
                          : { background: "var(--gd-bad-soft)", color: "var(--gd-bad)" }
                      }
                    >
                      오답 {entry.wrongCount}회
                    </span>
                    <span className="gd-t-3xs" style={{ color: "var(--gd-ink-3)" }}>
                      {relativeDay(entry.lastWrongAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── 단어 이력 시트 ── */}
      {open ? (
        <>
          <button type="button" aria-label="닫기" className="gd-sheet-backdrop" onClick={() => setOpen(null)} />
          <div className="gd-sheet" role="dialog" aria-modal="true" aria-label={`${open.word} 학습 이력`}>
            <div className="gd-sheet-grip" />
            <div className="flex shrink-0 items-start justify-between gap-2 px-5 pb-1 pt-3">
              <div className="min-w-0">
                <p className="gd-en gd-t-xl font-bold" style={{ color: "var(--gd-ink)" }}>
                  {open.word}
                </p>
                {open.meaning ? (
                  <p className="gd-t-sm mt-0.5" style={{ color: "var(--gd-ink-2)" }}>
                    {open.meaning}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{ color: "var(--gd-ink-3)" }}
                aria-label="닫기"
              >
                <X size={18} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-2 px-5 pb-2">
              <span
                className="gd-t-2xs rounded-full px-2 py-0.5 font-bold"
                style={{ background: "var(--gd-bad-soft)", color: "var(--gd-bad)" }}
              >
                오답 {open.wrongCount} / 시도 {open.totalCount}
              </span>
              {open.recovered ? (
                <span
                  className="gd-t-2xs rounded-full px-2 py-0.5 font-bold"
                  style={RECOVERED_BADGE}
                >
                  최근 다시 맞힘
                </span>
              ) : null}
            </div>
            <div className="gd-scroll min-h-0 flex-1 px-5 pb-2">
              <p className="gd-label mb-2">학습 이력</p>
              <ul className="flex flex-col gap-2">
                {open.history.map((h, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
                    style={{ border: "1px solid var(--gd-line)" }}
                  >
                    {h.correct ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--gd-good)" }} aria-hidden />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--gd-bad)" }} aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="gd-t-sm min-w-0 truncate font-semibold" style={{ color: "var(--gd-ink)" }}>
                          {h.worksheetTitle}
                        </span>
                        {h.attempt >= 2 ? (
                          <span
                            className="gd-t-3xs rounded px-1 py-0.5 font-bold"
                            style={{ background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }}
                          >
                            재도전
                          </span>
                        ) : null}
                      </span>
                      <p className="gd-t-2xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
                        {absoluteTime(h.at)}
                      </p>
                      {h.response ? (
                        <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-2)" }}>
                          내 답: <span className="gd-en">{h.response}</span>
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="gd-safe-b shrink-0 px-5 pt-2">
              <button type="button" className="gd-btn gd-btn-ghost w-full" onClick={() => setOpen(null)}>
                닫기
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
