"use client";

// 어법 훈련소 학생 상세 — 숙달 히트맵 · 유형/난이도/힌트 분석 · 시도 타임라인 ·
// 질문 로그 · 추가 학습 배정. (탭 구성: 분석 / 시도 기록 / 질문 로그 / 배정)

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ChevronLeft,
  Lightbulb,
  MessageCircleQuestion,
  X,
} from "lucide-react";
import type { GrammarLabStudentDetail } from "@/actions/grammar-drill-admin";
import { AssignmentPanel } from "./assignment-panel";

const TYPE_LABEL: Record<string, string> = {
  CHOICE: "괄호 택일",
  OX: "밑줄 OX",
  MULTI_UNDERLINE: "미니 29번",
  PASSAGE: "지문 실전",
  WRITE_FORM: "서술형 변형",
  WRITE_CORRECT: "서술형 수정",
};
const SOURCE_LABEL: Record<string, string> = {
  DRILL: "드릴",
  CONCEPT_CHECK: "개념 체크",
  READING: "실전 독해",
  WRITTEN: "서술형",
  UNIT_TEST: "유닛 테스트",
  MIXED: "복합 세트",
  REVIEW: "복습",
  ASSIGNMENT: "배정 학습",
};
const STAGE_LABEL: Record<string, string> = {
  CONCEPT: "개념",
  DRILL: "드릴",
  READING: "실전",
  WRITTEN: "서술형",
  TEST: "테스트",
  MASTERED: "마스터",
};

function heat(score: number, attempts: number): string {
  if (attempts === 0) return "#f8fafc";
  if (score >= 85) return "#065f46";
  if (score >= 70) return "#10b981";
  if (score >= 50) return "#a7f3d0";
  if (score >= 30) return "#fecdd3";
  return "#e11d48";
}

type Tab = "analysis" | "attempts" | "chat" | "assign";

export function GrammarLabDetailClient({
  detail,
}: {
  detail: GrammarLabStudentDetail;
}) {
  const [tab, setTab] = useState<Tab>("analysis");
  const { student, totals } = detail;
  const acc = totals.solved ? Math.round((totals.correct / totals.solved) * 100) : 0;

  return (
    <div className="p-6">
      <Link
        href="/director/grammar-lab"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ChevronLeft className="h-4 w-4" /> 어법 훈련소
      </Link>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {student.name}
            <span className="ml-2 text-sm font-normal text-slate-400">
              {student.grade}학년 · <span className="font-mono">{student.studentCode}</span>
            </span>
          </h1>
        </div>
        <div className="flex gap-4 rounded-xl border border-slate-200 bg-white px-5 py-2.5">
          <Kpi label="누적 풀이" value={totals.solved.toLocaleString()} />
          <Kpi label="정답률" value={`${acc}%`} tone={acc >= 70 ? "good" : acc >= 50 ? undefined : "bad"} />
          <Kpi label="힌트 의존" value={`${Math.round(totals.hintRate * 100)}%`} tone={totals.hintRate > 0.4 ? "bad" : undefined} />
          <Kpi label="개념 열람" value={`${Math.round(totals.peekRate * 100)}%`} />
          <Kpi label="평균 풀이" value={`${Math.round(totals.avgTimeMs / 1000)}초`} />
        </div>
      </div>

      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {(
          [
            ["analysis", "분석"],
            ["attempts", "시도 기록"],
            ["chat", "질문 로그"],
            ["assign", "학습 배정"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            {key === "chat" && detail.chatMessages.length > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                {detail.chatMessages.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "analysis" && <AnalysisTab detail={detail} />}
      {tab === "attempts" && <AttemptsTab detail={detail} />}
      {tab === "chat" && <ChatTab detail={detail} />}
      {tab === "assign" && <AssignmentPanel detail={detail} />}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="text-center">
      <p
        className={`font-mono text-lg font-bold ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-slate-800"}`}
      >
        {value}
      </p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

// ── 분석 탭 ──────────────────────────────────────────────────────────────────

function AnalysisTab({ detail }: { detail: GrammarLabStudentDetail }) {
  const maxDay = Math.max(1, ...detail.days.map((d) => d.solved));

  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      {/* 히트맵 + 단계 */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-slate-800">개념 숙달 히트맵</h2>
        <p className="mb-4 text-xs text-slate-400">
          셀 = 미세개념 숙달도(0~100) · 회색 = 미학습. 셀에 마우스를 올리면 상세가 보입니다.
        </p>
        <div className="flex flex-col gap-1.5">
          {detail.grid.map((u) => (
            <div key={u.unitId} className="flex items-center gap-2">
              <span className="w-8 shrink-0 font-mono text-xs font-bold text-slate-500">
                U{parseInt(u.unitId.slice(1), 10)}
              </span>
              <span className="w-40 shrink-0 truncate text-xs text-slate-600">{u.title}</span>
              <div className="flex flex-1 gap-1">
                {u.concepts.map((c) => (
                  <div
                    key={c.conceptId}
                    className="flex h-8 flex-1 items-center justify-center rounded-md border border-slate-100"
                    style={{ background: heat(c.score, c.attempts) }}
                    title={`${c.title}\n숙달 ${c.score} · ${c.attempts}회 시도 (정답 ${c.correct})`}
                  >
                    {c.attempts > 0 && (
                      <span
                        className="font-mono text-[10px] font-bold"
                        style={{ color: c.score >= 30 && c.score < 70 ? "#334155" : "#fff" }}
                      >
                        {c.score}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <span
                className={`w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold ${
                  u.stage === "MASTERED"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-50 text-slate-500"
                }`}
              >
                {STAGE_LABEL[u.stage] ?? u.stage}
                {u.bestTestScore !== null && ` ${u.bestTestScore}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* 14일 활동 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-800">최근 14일 활동</h2>
          <div className="flex h-24 items-end gap-1">
            {detail.days.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${d.solved}문항 (정답 ${d.correct})`}>
                <div
                  className="w-full rounded-sm bg-blue-500"
                  style={{
                    height: `${Math.max(2, (d.solved / maxDay) * 72)}px`,
                    opacity: d.solved === 0 ? 0.12 : 0.35 + 0.65 * (d.solved / maxDay),
                  }}
                />
                <span className="text-[9px] text-slate-400">
                  {d.offset === 0 ? "오늘" : `-${d.offset}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 유형별 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-800">유형별 정답률</h2>
          <div className="flex flex-col gap-2">
            {Object.entries(TYPE_LABEL).map(([type, label]) => {
              const s = detail.byType[type];
              const pct = s?.total ? Math.round((s.correct / s.total) * 100) : null;
              return (
                <div key={type} className="flex items-center gap-2.5">
                  <span className="w-20 shrink-0 text-xs text-slate-500">{label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${pct !== null && pct >= 70 ? "bg-emerald-500" : "bg-blue-500"}`}
                      style={{ width: `${pct ?? 0}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right font-mono text-xs text-slate-600">
                    {pct === null ? "—" : `${pct}%`}
                    {s?.total ? <span className="text-slate-300"> {s.total}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 난이도·모드 */}
        <div className="grid grid-cols-2 gap-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-bold text-slate-800">난이도별</h2>
            {["1", "2", "3", "4"].map((d) => {
              const s = detail.byDifficulty[d];
              const pct = s?.total ? Math.round((s.correct / s.total) * 100) : null;
              return (
                <div key={d} className="flex items-center justify-between py-1 text-xs">
                  <span className="text-slate-500">
                    {["기초", "표준", "심화", "킬러"][Number(d) - 1]}
                  </span>
                  <span className="font-mono text-slate-700">
                    {pct === null ? "—" : `${pct}% · ${s.total}문항`}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-bold text-slate-800">모드별</h2>
            {Object.entries(SOURCE_LABEL).map(([src, label]) => {
              const s = detail.bySource[src];
              if (!s?.total) return null;
              const pct = Math.round((s.correct / s.total) * 100);
              return (
                <div key={src} className="flex items-center justify-between py-1 text-xs">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-mono text-slate-700">
                    {pct}% · {s.total}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 시도 기록 탭 ─────────────────────────────────────────────────────────────

function AttemptsTab({ detail }: { detail: GrammarLabStudentDetail }) {
  if (detail.recentAttempts.length === 0) {
    return <Empty text="아직 시도 기록이 없습니다." />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
            <th className="px-4 py-3 font-medium">시각</th>
            <th className="px-4 py-3 font-medium">문항</th>
            <th className="px-4 py-3 font-medium">개념</th>
            <th className="px-4 py-3 font-medium">유형·난이도</th>
            <th className="px-4 py-3 font-medium">모드</th>
            <th className="px-4 py-3 font-medium">판정</th>
            <th className="px-4 py-3 font-medium">보조</th>
            <th className="px-4 py-3 font-medium">시간</th>
          </tr>
        </thead>
        <tbody>
          {detail.recentAttempts.map((a) => (
            <tr key={a.id} className="border-b border-slate-50 last:border-0">
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-400">
                {new Date(a.createdAt).toLocaleString("ko-KR", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="max-w-[280px] px-4 py-2.5">
                <p className="truncate font-serif text-xs text-slate-600">{a.preview}</p>
                <p className="mt-0.5 font-mono text-[10px] text-slate-300">{a.itemId}</p>
              </td>
              <td className="px-4 py-2.5 text-xs text-slate-600">{a.conceptTitle}</td>
              <td className="px-4 py-2.5 text-xs text-slate-500">
                {TYPE_LABEL[a.itemType] ?? a.itemType} · D{a.difficulty}
              </td>
              <td className="px-4 py-2.5 text-xs text-slate-500">
                {SOURCE_LABEL[a.source] ?? a.source}
              </td>
              <td className="px-4 py-2.5">
                {a.correct ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> 정답
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} /> 오답
                    <span className="ml-1 max-w-[80px] truncate font-mono text-[10px] text-slate-400">
                      {a.answer}
                    </span>
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-slate-400">
                  {a.hintUsed > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs" title={`힌트 ${a.hintUsed}단계`}>
                      <Lightbulb className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {a.hintUsed}
                    </span>
                  )}
                  {a.conceptPeeked && (
                    <span title="개념 카드 열람">
                      <BookOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </span>
                  )}
                </span>
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                {Math.round(a.timeMs / 1000)}초
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 질문 로그 탭 ─────────────────────────────────────────────────────────────

function ChatTab({ detail }: { detail: GrammarLabStudentDetail }) {
  if (detail.chatMessages.length === 0) {
    return <Empty text="아직 AI 질문 기록이 없습니다." />;
  }
  return (
    <div className="max-w-3xl rounded-xl border border-slate-200 bg-white p-5">
      <p className="mb-4 flex items-center gap-1.5 text-xs text-slate-400">
        <MessageCircleQuestion className="h-4 w-4" strokeWidth={1.75} />
        학생이 학습 중 AI 튜터에게 질문한 내역입니다 (최근 60건).
      </p>
      <div className="flex flex-col gap-2.5">
        {detail.chatMessages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
              m.role === "user"
                ? "self-end bg-blue-600 text-white"
                : "self-start border border-slate-100 bg-slate-50 text-slate-700"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
            <p
              className={`mt-1 text-[10px] ${m.role === "user" ? "text-blue-200" : "text-slate-400"}`}
            >
              {new Date(m.createdAt).toLocaleString("ko-KR", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {m.contextItemId && ` · ${m.contextItemId}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}
