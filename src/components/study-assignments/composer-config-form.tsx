"use client";

// ============================================================================
// 과제 컴포저 — ② 구성 패널 (assignment-composer 500줄 계약으로 분리)
//
// 종류 선택(세로 라디오 행)·프리셋 헤더·콘텐츠/문제 피커·제목·마감일(요일
// 프리셋+시간 퀵칩)·예약 배포·안내문·EXAM 응시 설정을 렌더한다. 상태는
// 전부 부모(assignment-composer)가 소유 — 여기는 표시 + onPatch 패치만.
// 날짜 헬퍼는 서울(UTC+9) 고정 해석 계약(로컬 TZ new Date(ymd) 금지).
// ============================================================================

import { useMemo } from "react";
import {
  BookOpenCheck,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  FileText,
  ListChecks,
  SpellCheck,
} from "lucide-react";
import type {
  StudyAssignmentKind,
  StudyKindTone,
} from "@/lib/study-assignments/types";
import { STUDY_KIND_META } from "@/lib/study-assignments/types";
import { cn } from "@/lib/utils";
import type { ComposerPreset } from "./assignment-composer";
import { ComposerContentPicker, type PickedContent } from "./composer-content-picker";
import { ComposerExamConfig } from "./composer-exam-config";
import { ComposerQuestionPicker } from "./composer-question-picker";

// ── 서울 고정 날짜 헬퍼 (푸터 요약을 위해 부모도 공유) ───────────────────────

/** 서울 달력 오늘(+offsetDays) ymd — epoch+9h 를 UTC 게터로 읽는다(로컬 TZ 무관) */
export function seoulTodayYmd(offsetDays = 0): string {
  const d = new Date(Date.now() + 9 * 3_600_000 + offsetDays * 86_400_000);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${dd}`;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "YYYY-MM-DD" → 요일 한 글자 — +09:00 고정 해석 후 9h 시프트로 서울 요일 산출 */
export function ymdWeekdayKo(ymd: string): string {
  const t = new Date(`${ymd}T00:00:00+09:00`).getTime();
  if (Number.isNaN(t)) return "";
  return WEEKDAY_KO[new Date(t + 9 * 3_600_000).getUTCDay()] ?? "";
}

/** 서울 달력일 기준 오늘로부터의 일수 차 — 오늘이면 0, 파손 ymd 는 null */
export function ymdDayDiffFromToday(ymd: string): number | null {
  const target = new Date(`${ymd}T00:00:00+09:00`).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date(`${seoulTodayYmd()}T00:00:00+09:00`).getTime();
  return Math.round((target - today) / 86_400_000);
}

/** "2026-07-18" → "7/18" */
export function formatYmdShort(ymd: string): string {
  const [, m, d] = ymd.split("-");
  if (!m || !d) return ymd;
  return `${Number(m)}/${Number(d)}`;
}

/** 이번 주(0)/다음 주(1) 일요일 ymd — 오늘이 일요일이면 "이번 주"는 오늘 */
function upcomingSundayYmd(weeksAhead: 0 | 1): string {
  const t = new Date(`${seoulTodayYmd()}T00:00:00+09:00`).getTime();
  const weekday = new Date(t + 9 * 3_600_000).getUTCDay();
  return seoulTodayYmd(((7 - weekday) % 7) + weeksAhead * 7);
}

// ── 컴포저 개인 설정(마지막 마감 시각·응시 모드) — 기기 로컬 복원 ────────────

const PREFS_KEY = "smoat.assignmentComposer.prefs.v1";

export interface ComposerPrefs {
  dueTime?: string;
  examMode?: "TABLET" | "OMR";
}

export function readComposerPrefs(): ComposerPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as ComposerPrefs;
    return {
      dueTime:
        typeof p.dueTime === "string" && /^\d{2}:\d{2}$/.test(p.dueTime)
          ? p.dueTime
          : undefined,
      examMode: p.examMode === "TABLET" || p.examMode === "OMR" ? p.examMode : undefined,
    };
  } catch {
    return {};
  }
}

export function saveComposerPrefs(prefs: ComposerPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 저장 실패는 무해 — 다음 오픈에서 기본값 사용
  }
}

// ── 폼 상태 계약 (부모 소유 단일 객체) ──────────────────────────────────────

export interface ComposerFormState {
  title: string;
  instructions: string;
  dueDate: string;
  dueTime: string;
  /** 예약 배포 — 켜면 availableFrom 을 startDate/startTime 으로 전달 */
  startEnabled: boolean;
  startDate: string;
  startTime: string;
  examMode: "TABLET" | "OMR";
  /** 제한시간 입력 원문 — 빈 문자열 = 오버라이드 없음(제출 시 클램프) */
  examDurationMin: string;
  /** WORKSHEET 모바일 학습 모드 — off=원본 뷰어만 (docs/worksheet-study-spec.md §9) */
  studyMode: "off" | "light" | "standard" | "intense";
  /** 학습 단계 완료를 과제 완료 조건으로 (studyMode off 면 무시) */
  studyRequired: boolean;
}

// ── kind 표시 상수 ───────────────────────────────────────────────────────────

const KIND_ICON: Record<StudyAssignmentKind, typeof FileText> = {
  EXAM: FileText,
  WORKSHEET: BookOpenCheck,
  QUESTIONS: ListChecks,
  GRAMMAR: SpellCheck,
};

/** 아이콘 타일 — kind 톤(STUDY_KIND_META tone) 조건부, 완성 문자열만 */
const KIND_TILE_TONES: Record<StudyKindTone, string> = {
  blue: "bg-blue-50 text-blue-600 ring-blue-100",
  teal: "bg-teal-50 text-teal-600 ring-teal-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
};

const SELECTABLE_KINDS: StudyAssignmentKind[] = [
  "EXAM",
  "WORKSHEET",
  "QUESTIONS",
  "GRAMMAR",
];

const KIND_DESC: Record<StudyAssignmentKind, string> = {
  EXAM: "학생 앱/OMR 응시 · 자동 채점",
  WORKSHEET: "A4 학습지 지면을 앱에서 열람",
  QUESTIONS: "문제 뱅크에서 문항을 선택해 배포 · 서버 채점",
  GRAMMAR: "취약 개념 우선 자동 편성 · 즉시 채점",
};

const DUE_TIME_QUICK = ["18:00", "21:00", "23:59"] as const;

/** 학습 모드 도움말 — docs/worksheet-study-spec.md §9 요약 문구 */
const STUDY_MODE_HELP: Record<ComposerFormState["studyMode"], string> = {
  off: "학생은 A4 학습지 지면만 열람하고 '다 확인했습니다'로 완료합니다.",
  light: "지문 통독 · 어휘 카드/시험 · 직독직해 · 빈칸 복원 · 실전 문제 — 핵심만 가볍게.",
  standard: "어휘·직독직해·어법·빈칸·어순·해석 쓰기·실전 문제 — 표준 코스.",
  intense: "표준 코스 + 백지 영작 · 고밀도 빈칸 — 통암기 최대 훈련.",
};

function dueChipClass(active: boolean): string {
  return cn(
    "rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
    active
      ? "border-blue-600 bg-blue-50/60 text-blue-700"
      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
  );
}

export function ComposerConfigForm({
  preset,
  kind,
  onKindSelect,
  content,
  onPickContent,
  questionIds,
  onQuestionIdsChange,
  form,
  onPatch,
  titlePlaceholder,
}: {
  preset?: ComposerPreset | null;
  kind: StudyAssignmentKind | null;
  onKindSelect: (kind: StudyAssignmentKind) => void;
  content: PickedContent | null;
  onPickContent: (content: PickedContent) => void;
  questionIds: string[];
  onQuestionIdsChange: (ids: string[]) => void;
  form: ComposerFormState;
  onPatch: (patch: Partial<ComposerFormState>) => void;
  titlePlaceholder: string;
}) {
  const contentLocked = Boolean(preset?.content);
  const questionsLocked = preset?.kind === "QUESTIONS";

  // 마감 프리셋 칩 — 상대일 4종(요일 병기) + 일요일 앵커 2종. 오픈 세션 동안
  // 날짜가 넘어가는 극단은 무시(마운트 1회 계산).
  const dueChips = useMemo(() => {
    const rel = (
      [
        ["오늘", 0],
        ["내일", 1],
        ["3일 후", 3],
        ["일주일 후", 7],
      ] as const
    ).map(([label, days]) => {
      const ymd = seoulTodayYmd(days);
      return { label: `${label}(${ymdWeekdayKo(ymd)})`, ymd };
    });
    return [
      ...rel,
      { label: "이번 주 일요일", ymd: upcomingSundayYmd(0) },
      { label: "다음 주 일요일", ymd: upcomingSundayYmd(1) },
    ];
  }, []);

  return (
    <>
      {/* 종류 선택(프리셋 없을 때) — 전폭 세로 라디오 행 */}
      {!preset ? (
        <div role="radiogroup" aria-label="과제 종류">
          <p className="mb-1.5 text-[12px] font-semibold text-slate-500">과제 종류</p>
          <div className="flex flex-col gap-1.5">
            {SELECTABLE_KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onKindSelect(k)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
                    active
                      ? "border-blue-600 bg-blue-50/60 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-md ring-1",
                      KIND_TILE_TONES[STUDY_KIND_META[k].tone],
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[13px] font-semibold",
                        active ? "text-blue-700" : "text-slate-700",
                      )}
                    >
                      {STUDY_KIND_META[k].label}
                    </span>
                    <span className="block truncate text-[11px] text-slate-400">
                      {KIND_DESC[k]}
                    </span>
                  </span>
                  <CheckCircle2
                    className={cn("size-4 shrink-0", active ? "text-blue-600" : "text-slate-200")}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-md ring-1",
              KIND_TILE_TONES[STUDY_KIND_META[preset.kind].tone],
            )}
          >
            {(() => {
              const Icon = KIND_ICON[preset.kind];
              return <Icon className="size-4" aria-hidden />;
            })()}
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-500">
              {STUDY_KIND_META[preset.kind].label} 배포
            </p>
            {preset.content ? (
              <p className="truncate text-[13px] font-medium text-slate-800">
                {preset.content.title}
                <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                  {preset.content.meta}
                </span>
              </p>
            ) : preset.kind === "QUESTIONS" ? (
              <p className="text-[13px] font-medium text-slate-800">
                선택한 문제 {questionIds.length}문항
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* 콘텐츠 선택(피커) — EXAM/WORKSHEET 는 목록, QUESTIONS 는 문제 피커 */}
      {kind && (kind === "EXAM" || kind === "WORKSHEET") && !contentLocked ? (
        <ComposerContentPicker kind={kind} picked={content} onPick={onPickContent} />
      ) : null}
      {kind === "QUESTIONS" && !questionsLocked ? (
        <ComposerQuestionPicker
          selectedIds={questionIds}
          onChange={onQuestionIdsChange}
        />
      ) : null}

      {kind ? (
        <>
          {/* 핵심 메타(제목·마감일·안내문)는 항상 상단 고정 — 스펙 빌더가 아래에서 스크롤을 먹는다 */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-slate-500">
              과제 제목
            </label>
            <input
              value={form.title}
              onChange={(e) => onPatch({ title: e.target.value })}
              placeholder={titlePlaceholder}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none placeholder:text-slate-300 focus:border-blue-400"
            />
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
              <CalendarClock className="size-3.5" aria-hidden /> 마감일
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {dueChips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  aria-pressed={form.dueDate === chip.ymd}
                  onClick={() => onPatch({ dueDate: chip.ymd })}
                  className={dueChipClass(form.dueDate === chip.ymd)}
                >
                  {chip.label}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={!form.dueDate}
                onClick={() => onPatch({ dueDate: "" })}
                className={dueChipClass(!form.dueDate)}
              >
                마감 없음
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => onPatch({ dueDate: e.target.value })}
                className="h-9 appearance-none rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 outline-none focus:border-blue-400 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
                aria-label="마감 날짜"
              />
              <input
                type="time"
                value={form.dueTime}
                disabled={!form.dueDate}
                onChange={(e) => onPatch({ dueTime: e.target.value })}
                className="h-9 appearance-none rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 outline-none focus:border-blue-400 disabled:opacity-40 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
                aria-label="마감 시각"
              />
              {/* 시간 퀵칩 — 학원 마감 관례 3종 */}
              <div className="flex items-center gap-1">
                {DUE_TIME_QUICK.map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={!form.dueDate}
                    aria-pressed={form.dueTime === t}
                    onClick={() => onPatch({ dueTime: t })}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-40",
                      form.dueDate && form.dueTime === t
                        ? "border-blue-600 bg-blue-50/40 text-blue-700"
                        : "border-slate-200 bg-white text-slate-400 hover:text-slate-600",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 예약 배포 — 서버(availableFrom)는 기수용, 여기서 켜고 시각만 고른다 */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
                <CalendarPlus className="size-3.5" aria-hidden /> 예약 배포
                <span className="font-normal text-slate-400">
                  — 설정한 시각부터 학생 앱에 열립니다
                </span>
              </p>
              <button
                type="button"
                role="switch"
                aria-checked={form.startEnabled}
                aria-label="예약 배포 사용"
                onClick={() =>
                  onPatch(
                    form.startEnabled
                      ? { startEnabled: false }
                      : {
                          startEnabled: true,
                          startDate: form.startDate || seoulTodayYmd(1),
                          startTime: form.startTime || "08:00",
                        },
                  )
                }
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
                  form.startEnabled ? "bg-violet-500" : "bg-slate-200",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]",
                    form.startEnabled ? "left-[18px]" : "left-0.5",
                  )}
                  aria-hidden
                />
              </button>
            </div>
            {form.startEnabled ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => onPatch({ startDate: e.target.value })}
                  className="h-9 appearance-none rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 outline-none focus:border-violet-400 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
                  aria-label="배포 시작 날짜"
                />
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => onPatch({ startTime: e.target.value })}
                  className="h-9 appearance-none rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 outline-none focus:border-violet-400 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
                  aria-label="배포 시작 시각"
                />
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-slate-500">
              학생에게 보이는 안내문 <span className="font-normal text-slate-400">(선택)</span>
            </label>
            <textarea
              value={form.instructions}
              onChange={(e) => onPatch({ instructions: e.target.value })}
              rows={2}
              placeholder="예) 이번 주 수업 범위입니다. 끝까지 풀기 바랍니다."
              className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-300 focus:border-blue-400"
            />
          </div>

          {/* EXAM 응시 설정 — 모드 + 제한시간 오버라이드 */}
          {kind === "EXAM" ? (
            <ComposerExamConfig
              examId={content?.refId ?? null}
              examMode={form.examMode}
              onExamModeChange={(mode) => onPatch({ examMode: mode })}
              durationMin={form.examDurationMin}
              onDurationMinChange={(value) => onPatch({ examDurationMin: value })}
            />
          ) : null}

          {/* WORKSHEET 모바일 학습 모드 — 단계별 인터랙티브 코스 설정 */}
          {kind === "WORKSHEET" ? (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
                <BookOpenCheck className="size-3.5" aria-hidden /> 모바일 학습 모드
                <span className="font-normal text-slate-400">
                  — 어휘·빈칸·영작 등 단계별 학습 코스로 배포됩니다
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="학습 모드">
                {(
                  [
                    ["off", "원본만"],
                    ["light", "가볍게"],
                    ["standard", "표준"],
                    ["intense", "최대"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={form.studyMode === value}
                    onClick={() => onPatch({ studyMode: value })}
                    className={dueChipClass(form.studyMode === value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                {STUDY_MODE_HELP[form.studyMode]}
              </p>
              {form.studyMode !== "off" ? (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.studyRequired}
                    onChange={(e) => onPatch({ studyRequired: e.target.checked })}
                    className="size-3.5 accent-blue-600"
                  />
                  학습 단계를 모두 완료해야 과제가 완료 처리됩니다
                </label>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center text-[12.5px] text-slate-400">
          과제 종류를 먼저 선택해 주세요.
        </p>
      )}
    </>
  );
}
