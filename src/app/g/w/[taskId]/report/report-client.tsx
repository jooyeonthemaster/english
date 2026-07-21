"use client";

// ============================================================================
// 학습지 스터디 모드 — 학생 결과·취약점 리포트 (docs/worksheet-study-spec.md §8.4)
//
// 데이터 페치 없음 — report/page.tsx(서버)가 조립한 props 를 그대로 렌더한다.
// 차트 라이브러리 금지: 스킬축·어법 정답률 바는 순수 CSS
// (트랙 var(--gd-line), 필 var(--gd-blue), 60% 미만 var(--gd-bad)).
// 태블릿(768px+) 확장은 gd.css 가 담당 — 별도 미디어쿼리 금지.
// 학생 노출 문구는 전부 합니다체.
// ============================================================================

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { STUDY_SKILL_LABELS } from "@/lib/worksheet-study/types";

export interface ReportStageRow {
  id: string;
  title: string;
  graded: boolean;
  status: "todo" | "in-progress" | "done";
  score?: number;
  timeMs?: number;
}

export interface ReportSentence {
  n: number;
  en: string;
  ko: string;
}

export interface WorksheetStudyReportProps {
  taskId: string;
  title: string;
  masteryPct: number | null;
  totalTimeMs: number;
  stages: ReportStageRow[];
  weakness: {
    skills: Partial<Record<string, { correct: number; total: number }>>;
    sentences: Record<string, { correct: number; total: number }>;
    words: { word: string; wrong: number; total: number }[];
    grammar: Record<string, { correct: number; total: number }>;
  } | null;
  /** 히트맵 탭 시트용 원문 */
  sentences: ReportSentence[];
  /** 취약 단어 → 뜻 */
  wordMeanings: Record<string, string>;
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

/** 원문자 ①…㊿ — 범위 밖은 평문 숫자 폴백 (전부 BMP라 인덱싱 안전) */
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿";
function circled(n: number): string {
  return n >= 1 && n <= 50 ? CIRCLED[n - 1] : String(n);
}

/** ms → 분 (기록이 있으면 최소 1분으로 올림 표기) */
function toMin(ms: number): number {
  if (ms <= 0) return 0;
  return Math.max(1, Math.round(ms / 60000));
}

type Stat = { correct: number; total: number };

function pctOf(stat: Stat): number {
  return stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
}

/** 문장 히트맵 3단 톤 — 무데이터/0% 기본, 1~49% blue, 50%+ bad */
type HeatTone = "none" | "mid" | "bad";
function heatToneOf(stat: Stat | undefined): HeatTone {
  if (!stat || stat.total === 0) return "none";
  const wrongRate = (stat.total - stat.correct) / stat.total;
  if (wrongRate <= 0) return "none";
  return wrongRate >= 0.5 ? "bad" : "mid";
}
const HEAT_STYLE: Record<HeatTone, CSSProperties> = {
  none: { background: "var(--gd-card)", border: "1.5px solid var(--gd-line)", color: "var(--gd-ink-2)" },
  mid: { background: "var(--gd-blue-soft)", border: "1.5px solid var(--gd-blue-line)", color: "var(--gd-blue)" },
  bad: { background: "var(--gd-bad-soft)", border: "1.5px solid var(--gd-bad)", color: "var(--gd-bad)" },
};

// ── 소부품 ──────────────────────────────────────────────────────────────────

/** 순수 CSS 정답률 바 — 트랙 gd-line, 필 gd-blue(60% 미만 gd-bad) */
function AccuracyBar({ label, stat }: { label: string; stat: Stat }) {
  const p = pctOf(stat);
  const fill = p < 60 ? "var(--gd-bad)" : "var(--gd-blue)";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="gd-t-xs font-semibold" style={{ color: "var(--gd-ink-2)" }}>
          {label}
        </span>
        <span className="gd-mono gd-t-xs font-bold" style={{ color: fill }}>
          {p}%
        </span>
      </div>
      <div
        className="mt-1 overflow-hidden rounded-full"
        style={{ height: "0.375rem", background: "var(--gd-line)" }}
        role="img"
        aria-label={`${label} 정답률 ${p}%`}
      >
        <span className="block h-full rounded-full" style={{ width: `${p}%`, background: fill }} />
      </div>
    </div>
  );
}

function LegendDot({ tone, label }: { tone: HeatTone; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-3 w-3 rounded" style={HEAT_STYLE[tone]} aria-hidden />
      <span className="gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
        {label}
      </span>
    </span>
  );
}

function ReportHeader({ taskId, title }: { taskId: string; title: string }) {
  return (
    <header className="flex items-center gap-1">
      <Link
        href={`/g/w/${taskId}`}
        aria-label="학습 홈으로 돌아가기"
        className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ color: "var(--gd-ink-2)" }}
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
      </Link>
      <div className="min-w-0">
        <p className="gd-label">결과 리포트</p>
        <h1 className="gd-t-lg truncate font-bold tracking-tight">{title}</h1>
      </div>
    </header>
  );
}

// ── 본체 ────────────────────────────────────────────────────────────────────

export function WorksheetStudyReport(props: WorksheetStudyReportProps) {
  const { taskId, title, masteryPct, totalTimeMs, stages, weakness, sentences, wordMeanings } = props;
  const [sheet, setSheet] = useState<ReportSentence | null>(null);

  // ── 빈 상태 — 학습 기록이 전혀 없음 ──
  if (!weakness) {
    return (
      <div className="gd-page flex flex-col gap-4 px-5 pb-8 pt-4">
        <ReportHeader taskId={taskId} title={title} />
        <section className="gd-card px-5 py-10 text-center">
          <p className="gd-t-md font-bold">아직 학습 기록이 없습니다</p>
          <p className="gd-t-sm mt-1" style={{ color: "var(--gd-ink-2)" }}>
            학습을 시작해 보세요
          </p>
          <Link href={`/g/w/${taskId}`} className="gd-btn gd-btn-primary mt-5 w-full">
            학습 홈으로
          </Link>
        </section>
      </div>
    );
  }

  const doneCount = stages.filter((s) => s.status === "done").length;

  // 스킬축 — STUDY_SKILL_LABELS 정의 순서로 순회, total 0 축은 생략
  const skillRows = Object.entries(STUDY_SKILL_LABELS)
    .map(([skill, label]) => ({ skill, label, stat: weakness.skills[skill] }))
    .filter((r): r is { skill: string; label: string; stat: Stat } => !!r.stat && r.stat.total > 0);

  const topWords = weakness.words.slice(0, 10);

  const grammarRows = Object.entries(weakness.grammar)
    .filter(([, stat]) => stat.total > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  const gradedStages = stages.filter((s) => s.graded);

  const sheetStat = sheet ? weakness.sentences[String(sheet.n)] : undefined;

  return (
    <div className="gd-page flex flex-col gap-4 px-5 pb-8 pt-4">
      <ReportHeader taskId={taskId} title={title} />

      {/* ── 종합 카드 ── */}
      <section className="gd-card px-5 py-6 text-center">
        {masteryPct !== null ? (
          <>
            <p className="gd-label">숙달도</p>
            <p className="gd-mono mt-1 text-5xl font-bold tracking-tight" style={{ color: "var(--gd-ink)" }}>
              {masteryPct}
              <span className="gd-t-xl" style={{ color: "var(--gd-ink-3)" }}>
                %
              </span>
            </p>
          </>
        ) : (
          <p className="gd-t-sm font-semibold" style={{ color: "var(--gd-ink-2)" }}>
            채점 단계를 완료하면 숙달도가 계산됩니다
          </p>
        )}
        <p className="gd-t-xs mt-3" style={{ color: "var(--gd-ink-2)" }}>
          총 학습 시간 {toMin(totalTimeMs)}분 · {doneCount}/{stages.length} 단계 완료
        </p>
      </section>

      {/* ── 스킬축 정답률 바 ── */}
      {skillRows.length > 0 ? (
        <section className="gd-card px-4 py-4">
          <p className="gd-label mb-3">영역별 정답률</p>
          <div className="flex flex-col gap-3">
            {skillRows.map((r) => (
              <AccuracyBar key={r.skill} label={r.label} stat={r.stat} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── 취약 문장 히트맵 ── */}
      {sentences.length > 0 ? (
        <section className="gd-card px-4 py-4">
          <p className="gd-label">취약 문장 지도</p>
          <p className="gd-t-2xs mb-3 mt-1" style={{ color: "var(--gd-ink-3)" }}>
            문장을 탭하면 원문과 해석을 확인할 수 있습니다
          </p>
          <div className="flex flex-wrap gap-2">
            {sentences.map((s) => {
              const tone = heatToneOf(weakness.sentences[String(s.n)]);
              return (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => setSheet(s)}
                  aria-label={`${s.n}번 문장 확인`}
                  className="gd-t-lg flex items-center justify-center rounded-xl"
                  style={{ width: "2.75rem", height: "2.75rem", ...HEAT_STYLE[tone] }}
                >
                  {circled(s.n)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <LegendDot tone="none" label="오답 없음" />
            <LegendDot tone="mid" label="오답 있음" />
            <LegendDot tone="bad" label="절반 이상 오답" />
          </div>
        </section>
      ) : null}

      {/* ── 취약 단어장 ── */}
      <section className="gd-card px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="gd-label">이 지문의 취약 단어</p>
          <Link
            href="/g/vocab"
            className="gd-t-2xs inline-flex items-center gap-0.5 font-semibold"
            style={{ color: "var(--gd-blue)" }}
          >
            내 단어장 전체 보기
            <ChevronRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          </Link>
        </div>
        {topWords.length === 0 ? (
          <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
            취약 단어가 없습니다. 훌륭합니다!
          </p>
        ) : (
          <div className="gd-grid-2 flex flex-col gap-2.5">
            {topWords.map((w) => (
              <div
                key={w.word}
                className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
                style={{ borderColor: "var(--gd-line)" }}
              >
                <div className="min-w-0">
                  <p className="gd-en gd-t-md font-bold" style={{ color: "var(--gd-ink)" }}>
                    {w.word}
                  </p>
                  {wordMeanings[w.word] ? (
                    <p className="gd-t-xs mt-0.5" style={{ color: "var(--gd-ink-2)" }}>
                      {wordMeanings[w.word]}
                    </p>
                  ) : null}
                </div>
                <span className="gd-t-2xs shrink-0 font-bold" style={{ color: "var(--gd-bad)" }}>
                  오답 {w.wrong}회
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 어법 취약 포인트 ── */}
      {grammarRows.length > 0 ? (
        <section className="gd-card px-4 py-4">
          <p className="gd-label mb-3">어법 취약 포인트</p>
          <div className="flex flex-col gap-3">
            {grammarRows.map(([code, stat]) => (
              <AccuracyBar key={code} label={`포인트 (${code})`} stat={stat} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── 단계별 점수 표 ── */}
      {gradedStages.length > 0 ? (
        <section className="gd-card overflow-hidden pb-1">
          <p className="gd-label px-4 pb-2 pt-4">단계별 점수</p>
          {gradedStages.map((st) => (
            <div key={st.id} className="gd-hairline-t flex items-center gap-3 px-4 py-3">
              <p className="gd-t-sm min-w-0 flex-1 truncate font-semibold">{st.title}</p>
              {st.timeMs != null && st.timeMs > 0 ? (
                <span className="gd-t-2xs shrink-0" style={{ color: "var(--gd-ink-3)" }}>
                  {toMin(st.timeMs)}분
                </span>
              ) : null}
              {st.score != null ? (
                <span
                  className="gd-mono gd-t-sm shrink-0 font-bold"
                  style={{ color: st.score < 60 ? "var(--gd-bad)" : "var(--gd-ink)" }}
                >
                  {st.score}점
                </span>
              ) : (
                <span className="gd-t-2xs shrink-0 font-semibold" style={{ color: "var(--gd-ink-3)" }}>
                  미완료
                </span>
              )}
            </div>
          ))}
        </section>
      ) : null}

      {/* ── 하단 CTA ── */}
      <Link href={`/g/w/${taskId}`} className="gd-btn gd-btn-ghost w-full">
        학습 홈으로
      </Link>

      {/* ── 문장 상세 시트 ── */}
      {sheet ? (
        <>
          <button type="button" aria-label="닫기" className="gd-sheet-backdrop" onClick={() => setSheet(null)} />
          <div className="gd-sheet" role="dialog" aria-modal="true" aria-label={`${sheet.n}번 문장`}>
            <div className="gd-sheet-grip" />
            <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-3">
              <p className="gd-label">문장 {circled(sheet.n)}</p>
              <button
                type="button"
                onClick={() => setSheet(null)}
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full"
                style={{ color: "var(--gd-ink-3)" }}
                aria-label="닫기"
              >
                <X size={18} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="gd-scroll min-h-0 flex-1 px-5 pb-2">
              <p className="gd-en gd-t-md" style={{ color: "var(--gd-ink)" }}>
                {sheet.en}
              </p>
              <p className="gd-t-sm mt-2" style={{ color: "var(--gd-ink-2)" }}>
                {sheet.ko}
              </p>
              {sheetStat && sheetStat.total > 0 ? (
                <p
                  className="gd-t-xs mt-3 font-bold"
                  style={{
                    color: sheetStat.total - sheetStat.correct > 0 ? "var(--gd-bad)" : "var(--gd-good)",
                  }}
                >
                  오답 {sheetStat.total - sheetStat.correct} / 시도 {sheetStat.total}
                </p>
              ) : (
                <p className="gd-t-xs mt-3 font-semibold" style={{ color: "var(--gd-ink-3)" }}>
                  아직 이 문장의 풀이 기록이 없습니다
                </p>
              )}
            </div>
            <div className="gd-safe-b shrink-0 px-5 pt-2">
              <button type="button" className="gd-btn gd-btn-ghost w-full" onClick={() => setSheet(null)}>
                닫기
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
