"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Minus,
  Plus,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";

import { cn } from "@/lib/utils";

import {
  builtinLabel,
  type CustomTypeListItem,
  type CustomTypeOverride,
} from "./custom-type-utils";

export type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

const DIFFICULTY_TONES = [
  {
    value: "BASIC",
    label: "기본",
    selected: "border-slate-300 bg-white text-slate-800 shadow-sm",
    idle: "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-700",
  },
  {
    value: "INTERMEDIATE",
    label: "중급",
    selected: "border-slate-300 bg-white text-slate-800 shadow-sm",
    idle: "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-700",
  },
  {
    value: "KILLER",
    label: "킬러",
    selected: "border-slate-300 bg-white text-slate-800 shadow-sm",
    idle: "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-700",
  },
] as const;

// ─────────────────────────── 우측 생성 설정 패널 (기본 유형지정 모드와 동일 구성) ───────────────────────────
export function GenerationConfigPanel({
  types,
  typeCounts,
  setTypeCount,
  typeOverrides,
  setTypeOverride,
  resetTypeOverride,
  expandedTypeId,
  setExpandedTypeId,
  difficulty,
  setDifficulty,
  selectedCount,
  totalQuestions,
  onResetCounts,
  submitting,
  onRun,
  onEdit,
}: {
  types: CustomTypeListItem[];
  typeCounts: Record<string, number>;
  setTypeCount: (id: string, count: number) => void;
  typeOverrides: Record<string, CustomTypeOverride>;
  setTypeOverride: (id: string, ov: CustomTypeOverride) => void;
  resetTypeOverride: (id: string) => void;
  expandedTypeId: string | null;
  setExpandedTypeId: (id: string | null) => void;
  difficulty: Difficulty;
  setDifficulty: (v: Difficulty) => void;
  selectedCount: number;
  totalQuestions: number;
  onResetCounts: () => void;
  submitting: boolean;
  onRun: () => void;
  onEdit: (id: string, name: string) => void;
}) {
  const canRun = selectedCount > 0 && totalQuestions > 0;
  const activeTypeCount = Object.values(typeCounts).filter((c) => c > 0).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* 난이도 (상단) */}
        <div className="flex gap-2">
          {DIFFICULTY_TONES.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDifficulty(d.value)}
              className={cn(
                "h-8 flex-1 rounded-lg border text-[12px] font-semibold transition-all",
                difficulty === d.value ? d.selected : d.idle,
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* 커스텀 유형 + 개수 (+ 유형별 상세 토글) */}
        {types.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-[12.5px] text-slate-500">
            저장된 커스텀 유형이 없습니다. ‘유형 만들기’ 탭에서 먼저 유형을
            만드세요.
          </p>
        ) : (
          <div className="space-y-1.5">
            {types.map((t) => (
              <CustomTypeBlock
                key={t.id}
                type={t}
                count={typeCounts[t.id] || 0}
                override={typeOverrides[t.id]}
                expanded={expandedTypeId === t.id}
                onToggleExpand={() =>
                  setExpandedTypeId(expandedTypeId === t.id ? null : t.id)
                }
                onSetCount={(c) => setTypeCount(t.id, c)}
                onSetOverride={(ov) => setTypeOverride(t.id, ov)}
                onResetOverride={() => resetTypeOverride(t.id)}
                onEdit={() => onEdit(t.id, t.name)}
              />
            ))}

            {totalQuestions > 0 ? (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2">
                <div className="flex items-center gap-2">
                  <Target className="size-3.5 text-slate-500" />
                  <span className="text-[12px] font-semibold text-slate-700">
                    총{" "}
                    <strong className="text-slate-900">{totalQuestions}</strong>
                    문제
                    <span className="ml-1 font-medium text-slate-500">
                      ({activeTypeCount}개 유형)
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onResetCounts}
                  className="text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-700"
                >
                  초기화
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* 실행 (하단 고정) */}
      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
        <button
          type="button"
          onClick={onRun}
          disabled={submitting || !canRun}
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-[13.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {submitting
            ? "등록 중…"
            : selectedCount === 0
              ? "지문을 선택하세요"
              : totalQuestions === 0
                ? "유형을 선택하세요"
                : `지문 ${selectedCount}개 × ${totalQuestions}문제 생성`}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── 커스텀 유형 블록 (개수 + 상세 토글) ───────────────────────────
function CustomTypeBlock({
  type,
  count,
  override,
  expanded,
  onToggleExpand,
  onSetCount,
  onSetOverride,
  onResetOverride,
  onEdit,
}: {
  type: CustomTypeListItem;
  count: number;
  override: CustomTypeOverride | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
  onSetCount: (count: number) => void;
  onSetOverride: (ov: CustomTypeOverride) => void;
  onResetOverride: () => void;
  onEdit: () => void;
}) {
  const active = count > 0;
  const ov = override ?? {};
  const optionCount = ov.optionCount ?? type.optionCount;
  const correctAnswerCount = ov.correctAnswerCount ?? type.correctAnswerCount;
  const stemLanguage = ov.stemLanguage === "en" ? "en" : "ko";
  const optionLanguage = ov.optionLanguage === "en" ? "en" : "ko";
  // 답형·지문기반은 유형의 본질(동형성) → 여기서 바꾸지 않는다. 객관식 선지 수치 + 유형 고유 파라미터만 조절.
  // '복수 정답'은 정답 수와 동치(정답 수≥2면 자동 복수)라 별도 컨트롤을 두지 않는다.
  const isMc = type.answerShape === "MULTIPLE_CHOICE";
  const canExpand = true;
  const overridden = !!override;

  const patch = (next: CustomTypeOverride) => onSetOverride({ ...ov, ...next });
  const setParam = (key: string, v: number) =>
    onSetOverride({ ...ov, params: { ...ov.params, [key]: v } });

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-white transition-all",
        active ? "border-slate-300 shadow-sm" : "border-slate-200 shadow-sm",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1 border-b px-2.5 py-1.5",
          active
            ? "border-slate-200 bg-slate-50"
            : "border-slate-100 bg-slate-50/70",
        )}
      >
        <button
          type="button"
          onClick={() => onSetCount(count + 1)}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-white"
        >
          <span
            className={cn(
              "w-full truncate text-[12.5px] font-bold",
              active ? "text-slate-900" : "text-slate-700",
            )}
          >
            {type.name}
          </span>
          <span className="text-[10px] text-slate-400">
            {builtinLabel(type.nearestBuiltin)} · 생성 {type.generatedCount}개
            {overridden ? " · 설정 변경됨" : ""}
          </span>
        </button>

        {active ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-slate-500" />
        ) : null}

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onSetCount(Math.max(0, count - 1))}
            disabled={!active}
            className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-200"
            aria-label={`${type.name} 개수 줄이기`}
          >
            <Minus className="size-3.5" />
          </button>
          <span
            className={cn(
              "w-5 text-center text-[12px] font-bold tabular-nums",
              active ? "text-slate-800" : "text-slate-300",
            )}
          >
            {count}
          </span>
          <button
            type="button"
            onClick={() => onSetCount(count + 1)}
            className="flex size-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white hover:text-blue-700"
            aria-label={`${type.name} 개수 늘리기`}
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        {canExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex size-7 items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200 transition-colors hover:bg-blue-50 hover:text-blue-700"
            title={expanded ? "상세 설정 접기" : "상세 설정 펼치기"}
            aria-label={expanded ? "상세 설정 접기" : "상세 설정 펼치기"}
          >
            {expanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onEdit}
          title="자연어로 유형 수정(영구)"
          className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600"
          aria-label={`${type.name} 유형 수정`}
        >
          <Wand2 className="size-3.5" />
        </button>
      </div>

      {expanded && canExpand ? (
        <div className="space-y-2.5 px-3 py-2.5">
          <p className="text-[10.5px] leading-snug text-slate-400">
            이 생성 배치에만 적용되는 임시 설정입니다. 유형 정의를 영구히
            바꾸려면 ✦ 수정을 쓰세요.
          </p>
          {isMc ? (
            <>
              <NumberStepper
                label="보기 수"
                value={optionCount}
                min={2}
                max={20}
                onChange={(v) => patch({ optionCount: v })}
              />
              <NumberStepper
                label="정답 수"
                value={correctAnswerCount}
                min={1}
                max={Math.max(1, optionCount)}
                onChange={(v) => patch({ correctAnswerCount: v })}
              />
              {correctAnswerCount >= 2 ? (
                <p className="text-[10.5px] leading-snug text-slate-500">
                  정답 {correctAnswerCount}개 — 복수 정답으로 ‘모두 고르시오’
                  형식으로 출제됩니다.
                </p>
              ) : null}
            </>
          ) : null}

          {/* 유형 고유 수치 파라미터 — 분석에서 추출(요약문 빈칸 수 등). value=정의 기본값. */}
          <LanguageToggle
            label="문항 언어"
            value={stemLanguage}
            onChange={(value) => patch({ stemLanguage: value })}
          />
          {isMc ? (
            <LanguageToggle
              label="보기 언어"
              value={optionLanguage}
              onChange={(value) => patch({ optionLanguage: value })}
            />
          ) : null}

          {type.tunableParams.map((p) => (
            <NumberStepper
              key={p.key}
              label={p.label}
              value={ov.params?.[p.key] ?? p.value}
              min={p.min}
              max={Math.max(p.min, p.max)}
              onChange={(v) => setParam(p.key, v)}
            />
          ))}

          {overridden ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onResetOverride}
                className="text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-600"
              >
                유형 정의 기본값으로
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11.5px] text-slate-600">
      {label}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:text-slate-200 disabled:hover:bg-transparent"
          aria-label={`${label} 줄이기`}
        >
          <Minus className="size-3" />
        </button>
        <span className="w-6 text-center text-[12px] font-bold tabular-nums text-slate-800">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex size-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:text-slate-200 disabled:hover:bg-transparent"
          aria-label={`${label} 늘리기`}
        >
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
}

function LanguageToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "ko" | "en";
  onChange: (value: "ko" | "en") => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11.5px] text-slate-600">
      <span>{label}</span>
      <div className="flex shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0.5">
        {[
          { value: "ko" as const, label: "Korean" },
          { value: "en" as const, label: "English" },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              "rounded px-2 py-1 text-[10px] font-bold transition-colors",
              value === item.value
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-400 hover:text-slate-600",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
