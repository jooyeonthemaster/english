"use client";

// ============================================================================
// 과제 컴포저 — ② 구성 패널 (assignment-composer 500줄 계약으로 분리)
//
// 블록 순서(v3 design §D3-2): 종류 선택(세로 라디오 행)/프리셋 헤더 → 핵심
// 카드(제목+마감일 — 요일 프리셋·시간 퀵칩, 파란 좌측 보더) → 콘텐츠/문제
// 피커 → ▸ 자세한 설정 접이(예약 배포·안내문·EXAM 응시·WORKSHEET 학습 모드,
// 접힘 시 요약 칩·기본과 다르면 자동 펼침·세션 내 열림 유지). 상태는 전부
// 부모(assignment-composer)가 소유 — 여기는 표시 + onPatch 패치만.
// 날짜 헬퍼는 서울(UTC+9) 고정 해석 계약(로컬 TZ new Date(ymd) 금지).
// ============================================================================

import { useId, useMemo, useState } from "react";
import {
  BookA,
  BookOpenCheck,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  FileText,
  ListChecks,
  SpellCheck,
  TriangleAlert,
} from "lucide-react";
import type {
  StudyAssignmentKind,
  StudyKindTone,
} from "@/lib/study-assignments/types";
import { STUDY_KIND_META } from "@/lib/study-assignments/types";
import { DUE_QUICK_CHIP_LABELS } from "@/lib/wording/director-glossary";
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
  VOCAB: BookA,
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
  "VOCAB",
];

const KIND_DESC: Record<StudyAssignmentKind, string> = {
  EXAM: "학생 앱/OMR 응시 · 자동 채점",
  WORKSHEET: "A4 학습지 지면을 앱에서 열람",
  QUESTIONS: "문제은행에서 문항을 선택해 보내기 · 서버 채점",
  GRAMMAR: "보충 필요 개념 우선 자동 편성 · 즉시 채점",
  VOCAB: "기출 코퍼스 단어장에서 자동 편성 · 즉시 채점",
};

const DUE_TIME_QUICK = ["18:00", "21:00", "23:59"] as const;

// ── D3-2 신규 노출 문구 — 워딩 사전(director-glossary D6) 승격 대기 상수 ──────

/** 핵심 카드 — 마감 미설정 결과 안내(슬레이트 톤 고정) */
const DUE_UNSET_NOTICE = "마감일을 정하지 않으면 학생 화면에 기한이 표시되지 않아요";

/** 접이 섹션 라벨 */
const ADVANCED_LABEL = "자세한 설정";

// ── 자세한 설정 접이 상태 — 세션 내 유지(sessionStorage) ─────────────────────

const ADVANCED_OPEN_KEY = "smoat.assignmentComposer.advancedOpen.v1";

function readAdvancedOpen(): boolean {
  try {
    return sessionStorage.getItem(ADVANCED_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function saveAdvancedOpen(open: boolean) {
  try {
    sessionStorage.setItem(ADVANCED_OPEN_KEY, open ? "1" : "0");
  } catch {
    // 저장 실패는 무해 — 이번 세션은 기본 접힘으로 시작
  }
}

/** 학습 모드 라디오 옵션 — 라디오 렌더·접힘 요약 칩이 공유 */
const STUDY_MODE_OPTIONS = [
  ["off", "원본만"],
  ["light", "가볍게"],
  ["standard", "표준"],
  ["intense", "최대"],
] as const;

/** 접힘 요약 칩 — 실제 상태 반영("예약 없음 · 안내문 없음 · 태블릿 응시") */
function advancedSummaryChips(
  kind: StudyAssignmentKind,
  form: ComposerFormState,
): { label: string; changed: boolean }[] {
  const chips: { label: string; changed: boolean }[] = [
    form.startEnabled
      ? {
          label: form.startDate
            ? `예약 ${formatYmdShort(form.startDate)} ${form.startTime}`
            : "예약 사용",
          changed: true,
        }
      : { label: "예약 없음", changed: false },
    form.instructions.trim()
      ? { label: "안내문 있음", changed: true }
      : { label: "안내문 없음", changed: false },
  ];
  if (kind === "EXAM") {
    chips.push({
      label: form.examMode === "OMR" ? "OMR 응시" : "태블릿 응시",
      changed: form.examMode !== "TABLET",
    });
    if (form.examDurationMin.trim() !== "") {
      chips.push({ label: `제한시간 ${form.examDurationMin.trim()}분`, changed: true });
    }
  }
  if (kind === "WORKSHEET") {
    const modeLabel =
      STUDY_MODE_OPTIONS.find(([value]) => value === form.studyMode)?.[1] ?? form.studyMode;
    chips.push({ label: `학습 모드 ${modeLabel}`, changed: form.studyMode !== "standard" });
    if (form.studyMode !== "off" && !form.studyRequired) {
      chips.push({ label: "완료 조건 없음", changed: true });
    }
  }
  return chips;
}

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
  initialSubTypes,
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
  /** QUESTIONS 유형 프리필터 시드(D2-2, analysisSeed 경유) — 피커 마운트 1회 적용 */
  initialSubTypes?: string[];
}) {
  const contentLocked = Boolean(preset?.content);
  // QUESTIONS 잠금은 "문항 스냅샷을 들고 들어온" 진입(문제 뱅크·복제)만 —
  // 시드 진입(analysisSeed: 프리필터만 있고 스냅샷 없음)은 피커를 열어 고른다.
  const questionsLocked =
    preset?.kind === "QUESTIONS" && (preset.questionIds?.length ?? 0) > 0;

  // 마감 프리셋 칩 — 상대일 4종(요일 병기) + 일요일 앵커 2종. 오픈 세션 동안
  // 날짜가 넘어가는 극단은 무시(마운트 1회 계산). 베이스 라벨은 글로서리
  // DUE_QUICK_CHIP_LABELS 정본(N-7 — 재배포 팝오버와 공용), 날짜 병기는 여기 소관.
  const dueChips = useMemo(() => {
    const rel = (
      [
        [DUE_QUICK_CHIP_LABELS.TODAY, 0],
        [DUE_QUICK_CHIP_LABELS.TOMORROW, 1],
        [DUE_QUICK_CHIP_LABELS.IN_3_DAYS, 3],
        [DUE_QUICK_CHIP_LABELS.IN_1_WEEK, 7],
      ] as const
    ).map(([label, days]) => {
      const ymd = seoulTodayYmd(days);
      return { label: `${label}(${ymdWeekdayKo(ymd)})`, ymd };
    });
    return [
      ...rel,
      { label: DUE_QUICK_CHIP_LABELS.THIS_SUNDAY, ymd: upcomingSundayYmd(0) },
      { label: DUE_QUICK_CHIP_LABELS.NEXT_SUNDAY, ymd: upcomingSundayYmd(1) },
    ];
  }, []);

  // ── 자세한 설정 접이 — 접힘 시 요약 칩, 기본과 다르면 자동 펼침(D3-2) ──────
  // WideModal 은 닫히면 children 을 언마운트하므로(open 게이트) 오픈마다 재마운트
  // — 세션 복원은 lazy 초기값으로 충분(SSR 은 WideModal 이 문서 부재 시 null).
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(() => readAdvancedOpen());
  const advancedPanelId = useId();
  // 프리셋/prefs 복원 포함 "기본값과 다른 값" 감지 — kind 조건 렌더와 동형
  const advancedChanged =
    form.startEnabled ||
    form.instructions.trim() !== "" ||
    (kind === "EXAM" &&
      (form.examMode !== "TABLET" || form.examDurationMin.trim() !== "")) ||
    (kind === "WORKSHEET" && (form.studyMode !== "standard" || !form.studyRequired));

  // 자동 펼침은 여는 방향만(닫기는 사용자 조작으로만) — 이전 렌더 값 비교로
  // 렌더 중 상태 조정(react.dev "You Might Not Need an Effect" 규약)
  const [prevChanged, setPrevChanged] = useState(false);
  if (advancedChanged !== prevChanged) {
    setPrevChanged(advancedChanged);
    if (advancedChanged && !advancedOpen) setAdvancedOpen(true);
  }

  const toggleAdvanced = () => {
    const next = !advancedOpen;
    setAdvancedOpen(next);
    saveAdvancedOpen(next);
  };

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
              {STUDY_KIND_META[preset.kind].label} 보내기
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

      {/* 핵심 카드 — 제목·마감일은 항상 피커 위 고정(파란 좌측 보더, D3-2).
          스펙 빌더가 아래에서 스크롤을 먹으므로 마감 시인성을 구조로 보증한다. */}
      {kind ? (
        <div className="flex flex-col gap-3.5 rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-white p-3.5">
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
                {DUE_QUICK_CHIP_LABELS.NO_DUE}
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
            <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-slate-400">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
              {DUE_UNSET_NOTICE}
            </p>
          </div>
        </div>
      ) : null}

      {/* 콘텐츠 선택(피커) — 핵심 카드 아래로 순서만 이동(호출부 계약 무변경).
          EXAM/WORKSHEET 는 목록, QUESTIONS 는 문제 피커 */}
      {kind && (kind === "EXAM" || kind === "WORKSHEET") && !contentLocked ? (
        <ComposerContentPicker kind={kind} picked={content} onPick={onPickContent} />
      ) : null}
      {kind === "QUESTIONS" && !questionsLocked ? (
        <ComposerQuestionPicker
          selectedIds={questionIds}
          onChange={onQuestionIdsChange}
          initialSubTypes={initialSubTypes}
        />
      ) : null}

      {kind ? (
        <div className="border-t border-slate-100 pt-3">
          {/* ▸ 자세한 설정 — 예약 배포·안내문·응시 설정·학습 모드 접이(D3-2) */}
          <button
            type="button"
            aria-expanded={advancedOpen}
            aria-controls={advancedOpen ? advancedPanelId : undefined}
            onClick={toggleAdvanced}
            className="flex w-full items-center gap-2 rounded-md py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 text-slate-400 transition-transform",
                advancedOpen && "rotate-90",
              )}
              aria-hidden
            />
            <span className="shrink-0 text-[12px] font-semibold text-slate-500">
              {ADVANCED_LABEL}
            </span>
            {/* 접힘 시 요약 칩 상시 표기 — 실제 상태 반영 */}
            {!advancedOpen ? (
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {advancedSummaryChips(kind, form).map((chip) => (
                  <span
                    key={chip.label}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      chip.changed
                        ? "bg-blue-50 text-blue-600"
                        : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {chip.label}
                  </span>
                ))}
              </span>
            ) : null}
          </button>

          {advancedOpen ? (
            <div id={advancedPanelId} className="mt-3 flex flex-col gap-4">
              {/* 예약 배포 — 서버(availableFrom)는 기수용, 여기서 켜고 시각만 고른다 */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  {/* min-w-0·flex-wrap — 좁은 패널에서 설명 문구 찌부 방지 */}
                  <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] font-semibold text-slate-500">
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
                  <p className="mb-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] font-semibold text-slate-500">
                    <BookOpenCheck className="size-3.5" aria-hidden /> 모바일 학습 모드
                    <span className="font-normal text-slate-400">
                      — 어휘·빈칸·영작 등 단계별 학습 코스로 배포됩니다
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="학습 모드">
                    {STUDY_MODE_OPTIONS.map(([value, label]) => (
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
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center text-[12.5px] text-slate-400">
          과제 종류를 먼저 선택해 주세요.
        </p>
      )}
    </>
  );
}
