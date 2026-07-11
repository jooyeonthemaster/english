"use client";

// 학습 배정 탭 — 유닛/개념/유형/난이도/문항수 스펙으로 추가 학습을 배정하고,
// 진행 중·완료 배정을 관리한다. 배정은 학생 홈 최상단 카드로 노출된다.

import { useMemo, useState, useTransition } from "react";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  cancelGrammarAssignment,
  createGrammarAssignment,
  type GrammarLabStudentDetail,
} from "@/actions/grammar-drill-admin";
import {
  GRAMMAR_UNITS,
  GRAMMAR_CONCEPT_SKELETONS,
} from "@/lib/grammar-drill/curriculum";

const TYPE_OPTIONS = [
  ["CHOICE", "괄호 택일"],
  ["OX", "밑줄 OX"],
  ["MULTI_UNDERLINE", "미니 29번"],
  ["PASSAGE", "지문 실전"],
  ["WRITE_FORM", "서술형 변형"],
  ["WRITE_CORRECT", "서술형 수정"],
] as const;

export function AssignmentPanel({ detail }: { detail: GrammarLabStudentDetail }) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [conceptIds, setConceptIds] = useState<string[]>([]);
  const [itemTypes, setItemTypes] = useState<string[]>([]);
  const [difficulties, setDifficulties] = useState<number[]>([]);
  const [count, setCount] = useState(20);

  const conceptChoices = useMemo(
    () =>
      GRAMMAR_CONCEPT_SKELETONS.filter(
        (c) => unitIds.length === 0 || unitIds.includes(c.unitId),
      ),
    [unitIds],
  );

  // 취약 개념 프리셋 — 숙달도 낮은 순 3개
  const weakest = useMemo(
    () =>
      detail.grid
        .flatMap((u) => u.concepts)
        .filter((c) => c.attempts >= 3)
        .sort((a, b) => a.score - b.score)
        .slice(0, 3),
    [detail.grid],
  );

  function toggle<T>(arr: T[], v: T, set: (next: T[]) => void) {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  function applyWeakPreset() {
    if (weakest.length === 0) {
      toast.error("취약 개념 데이터가 아직 없습니다.");
      return;
    }
    setTitle(`취약 개념 집중 훈련 (${weakest.map((w) => w.title).join(" · ")})`);
    setConceptIds(weakest.map((w) => w.conceptId));
    setUnitIds([]);
    setItemTypes(["CHOICE", "OX"]);
    setDifficulties([]);
    setCount(30);
  }

  function submit() {
    if (!title.trim()) {
      toast.error("배정 제목을 입력해 주십시오.");
      return;
    }
    startTransition(async () => {
      const res = await createGrammarAssignment({
        studentId: detail.student.id,
        title,
        note,
        spec: { unitIds, conceptIds, itemTypes, difficulties, count },
      });
      if (res.success) {
        toast.success("배정을 생성했습니다. 학생 홈에 즉시 노출됩니다.");
        setTitle("");
        setNote("");
        setUnitIds([]);
        setConceptIds([]);
        setItemTypes([]);
        setDifficulties([]);
        setCount(20);
      } else {
        toast.error(res.error ?? "배정 생성에 실패했습니다.");
      }
    });
  }

  function cancel(id: string) {
    startTransition(async () => {
      const res = await cancelGrammarAssignment(id);
      if (res.success) toast.success("배정을 취소했습니다.");
      else toast.error(res.error ?? "취소에 실패했습니다.");
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      {/* ── 새 배정 ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">새 학습 배정</h2>
          <button
            type="button"
            onClick={applyWeakPreset}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            취약 개념 프리셋
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">제목 (학생에게 노출)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 수일치 집중 훈련 30문항"
          className="mb-3 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
        />

        <label className="mb-1 block text-xs font-medium text-slate-500">메모 (선택 · 합니다체 권장)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예: 이번 주 안에 완료해 주십시오."
          className="mb-4 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
        />

        <p className="mb-1.5 text-xs font-medium text-slate-500">유닛 범위 (미선택 = 전체)</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {GRAMMAR_UNITS.map((u) => (
            <Chip
              key={u.id}
              active={unitIds.includes(u.id)}
              onClick={() => toggle(unitIds, u.id, setUnitIds)}
              label={`U${parseInt(u.id.slice(1), 10)} ${u.title.split(" — ")[0].split(" · ")[0]}`}
            />
          ))}
        </div>

        <p className="mb-1.5 text-xs font-medium text-slate-500">
          개념 지정 (미선택 = 유닛 전체 · 유닛 선택 시 해당 유닛 개념만 표시)
        </p>
        <div className="mb-4 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-slate-100 p-2">
          {conceptChoices.map((c) => (
            <Chip
              key={c.id}
              active={conceptIds.includes(c.id)}
              onClick={() => toggle(conceptIds, c.id, setConceptIds)}
              label={c.title}
            />
          ))}
        </div>

        <p className="mb-1.5 text-xs font-medium text-slate-500">문항 유형 (미선택 = 전체)</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TYPE_OPTIONS.map(([key, label]) => (
            <Chip
              key={key}
              active={itemTypes.includes(key)}
              onClick={() => toggle(itemTypes, key, setItemTypes)}
              label={label}
            />
          ))}
        </div>

        <div className="mb-5 flex flex-wrap items-end gap-6">
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500">난이도 (미선택 = 전체)</p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((d) => (
                <Chip
                  key={d}
                  active={difficulties.includes(d)}
                  onClick={() => toggle(difficulties, d, setDifficulties)}
                  label={["기초", "표준", "심화", "킬러"][d - 1]}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500">문항 수</p>
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="h-9 w-24 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          배정 생성
        </button>
      </div>

      {/* ── 배정 이력 ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-slate-800">배정 이력</h2>
        {detail.assignments.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">배정 이력이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {detail.assignments.map((a) => {
              const result = a.resultSummary as {
                total?: number;
                correct?: number;
              } | null;
              return (
                <div key={a.id} className="rounded-lg border border-slate-100 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                        {a.note && <p className="mt-0.5 text-xs text-slate-500">{a.note}</p>}
                        <p className="mt-1 text-[11px] text-slate-400">
                          {new Date(a.createdAt).toLocaleDateString("ko-KR")} 배정
                          {a.completedAt &&
                            ` · ${new Date(a.completedAt).toLocaleDateString("ko-KR")} 완료`}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                          a.status === "DONE"
                            ? "bg-emerald-50 text-emerald-700"
                            : a.status === "IN_PROGRESS"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {a.status === "DONE"
                          ? result
                            ? `완료 ${result.correct}/${result.total}`
                            : "완료"
                          : a.status === "IN_PROGRESS"
                            ? "진행 중"
                            : "대기"}
                      </span>
                      {a.status !== "DONE" && (
                        <button
                          type="button"
                          onClick={() => cancel(a.id)}
                          disabled={pending}
                          className="rounded-md p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                          aria-label="배정 취소"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}
