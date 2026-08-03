"use client";

// ============================================================================
// 과제 컴포저 — 통합 배포 위저드 (와이드 모달, 좁은 모달 금지 계약)
//
// 모든 배포 진입점(학생 상세 과제 탭·과제 관리·시험지 상세·학습지 카드·
// 문제 뱅크·취약점 CTA)이 이 컴포넌트 하나를 쓴다. 좌측 = ① 누구에게(대상),
// 가운데 = ② 무엇을 · 언제까지(ComposerConfigForm), 우측 = ③ 실물 확인
// (v3 design §D3-1 3스텝 번호제 — 미충족 패널 rose 도트, 푸터는 문장형 §D3-3).
// 취약점 CTA 진입(preset.analysisSeed)은 헤더 아래 전폭 분석 컨텍스트 스트립
// (composer-context-strip, §D2-3)을 렌더하고 관련 과제 상세 모달을 리프트한다.
// 제출은 createStudyAssignment 서버액션 — 반 전개·브리지 생성은 전부 서버
// 소관. 작성 중 닫힘은 requestClose(확인 카드) 가드를 거친다.
// ============================================================================

import { useEffect, useMemo, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { ModalCloseGuardCard, WideModal } from "@/components/layout/wide-modal";
import {
  PANEL_HANDLE_WIDTH,
  PanelHandle,
  useResizablePanels,
} from "@/components/layout/resizable-panels";
import {
  createStudyAssignment,
  getAssignTargets,
  type AssignTargetsData,
} from "@/actions/study-assignments";
import type {
  AnalysisSeed,
  GrammarAssignmentPayload,
  StudyAssignmentKind,
  StudyTargetInput,
  VocabAssignmentPayload,
} from "@/lib/study-assignments/types";
import { STUDY_KIND_META } from "@/lib/study-assignments/types";
import { dDayLabel } from "@/lib/study-assignments/status";
import {
  COMPOSER_COPY,
  CTA_LABELS,
} from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";
import {
  ComposerTargetPicker,
  selectionCount,
  type TargetSelection,
} from "./composer-target-picker";
import type { PickedContent } from "./composer-content-picker";
import {
  ComposerConfigForm,
  formatYmdShort,
  readComposerPrefs,
  saveComposerPrefs,
  seoulTodayYmd,
  ymdDayDiffFromToday,
  ymdWeekdayKo,
  type ComposerFormState,
} from "./composer-config-form";
import { ComposerGrammarPanel, type WeakConceptPreset } from "./composer-grammar-spec";
import { ComposerVocabPanel } from "./composer-vocab-spec";
import {
  AssignContentPreview,
  type AssignPreviewTarget,
} from "./assign-content-preview";
import { AssignmentDetailModal } from "./assignment-detail-modal";
import { ComposerContextStrip } from "./composer-context-strip";

export interface ComposerPreset {
  kind: StudyAssignmentKind;
  /** EXAM/WORKSHEET: 콘텐츠 고정(변경 불가) */
  content?: PickedContent;
  /** QUESTIONS: 문제 스냅샷(문제 뱅크에서 선택해 진입 — 피커 없이 고정 잠금) */
  questionIds?: string[];
  /** GRAMMAR: 초기 스펙·취약 프리셋 */
  grammarSpec?: Partial<GrammarAssignmentPayload>;
  weakConcepts?: WeakConceptPreset[];
  /** VOCAB: 초기 스펙(덱/조건 프리필) */
  vocabSpec?: Partial<VocabAssignmentPayload>;
  /** EXAM 기본 응시 모드 */
  examMode?: "TABLET" | "OMR";
  /**
   * 취약점 CTA 진입 시드(v3 design §D2-3, additive) — 있으면 컨텍스트 스트립
   * 렌더 + QUESTIONS deploy 의 subTypes 를 문제 피커 프리필터로 전달.
   * 없으면 기존 진입과 완전히 동일(무회귀).
   */
  analysisSeed?: AnalysisSeed;
}

/** 3스텝 패널 캡션(D3-1) — 미충족 시 rose 도트(필요 입력이 남았다는 표시) */
function StepCaption({ label, met }: { label: string; met: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-100 bg-slate-50/60 px-4 py-2">
      <span className="text-[12px] font-bold tracking-tight text-slate-600">{label}</span>
      {!met ? (
        <span
          title={COMPOSER_COPY.STEP_UNMET_HINT}
          aria-label={COMPOSER_COPY.STEP_UNMET_HINT}
          className="size-1.5 rounded-full bg-rose-500"
        />
      ) : null}
    </div>
  );
}

// 마감 시각은 서울(UTC+9) 고정 오프셋으로 해석 — 브라우저 TZ에 흔들리지 않는다.
function toLocalIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

export function AssignmentComposer({
  open,
  onClose,
  preset,
  defaultStudentIds,
  defaultDue,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** 진입점이 콘텐츠/종류를 고정할 때 — 없으면 종류 선택부터 */
  preset?: ComposerPreset | null;
  /** 학생 상세에서 열면 그 학생 프리셀렉트 */
  defaultStudentIds?: string[];
  /** 마감일 초기값(YYYY-MM-DD) — 캘린더 퀵 생성용. 오늘 이전이면 무시 */
  defaultDue?: string;
  onCreated?: (assignmentId: string) => void;
}) {
  const [kind, setKind] = useState<StudyAssignmentKind | null>(preset?.kind ?? null);
  const [content, setContent] = useState<PickedContent | null>(preset?.content ?? null);
  const [questionIds, setQuestionIds] = useState<string[]>(preset?.questionIds ?? []);
  const [grammarSpec, setGrammarSpec] = useState<GrammarAssignmentPayload>({
    count: 20,
    ...preset?.grammarSpec,
  });
  const [vocabSpec, setVocabSpec] = useState<VocabAssignmentPayload>({
    count: 20,
    ...preset?.vocabSpec,
  });
  const [targets, setTargets] = useState<AssignTargetsData | null>(null);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [selection, setSelection] = useState<TargetSelection>({
    classIds: new Set(),
    studentIds: new Set(defaultStudentIds ?? []),
  });
  const [form, setForm] = useState<ComposerFormState>({
    title: "",
    instructions: "",
    dueDate: "",
    dueTime: "23:59",
    startEnabled: false,
    startDate: "",
    startTime: "08:00",
    examMode: preset?.examMode ?? "TABLET",
    examDurationMin: "",
    studyMode: "standard",
    studyRequired: true,
  });
  const [confirmClose, setConfirmClose] = useState(false);
  const [submitting, startSubmit] = useTransition();
  // 컨텍스트 스트립의 관련 과제 상세 리프트(D2-3) — 컴포저 위에 겹쳐 뜬다
  const [contextTaskId, setContextTaskId] = useState<string | null>(null);
  const [contextReloadTick, setContextReloadTick] = useState(0);

  const patchForm = (patch: Partial<ComposerFormState>) =>
    setForm((f) => ({ ...f, ...patch }));

  // ── 분석 시드(D2-3) — 있을 때만 스트립·프리필터가 산다(무회귀) ─────────────
  const seed = preset?.analysisSeed ?? null;
  const seedStudentId = defaultStudentIds?.[0] ?? null;
  // QUESTIONS deploy 의 subTypes 합집합 → 문제 피커 프리필터(마운트 1회 적용 —
  // WideModal 이 닫히면 children 을 언마운트하므로 오픈마다 자연 초기화된다)
  const seedSubTypes = useMemo(() => {
    if (!seed) return undefined;
    const set = new Set<string>();
    for (const spot of seed.spots) {
      if (spot.deploy?.kind !== "QUESTIONS") continue;
      for (const subType of spot.deploy.questionFilter.subTypes) set.add(subType);
    }
    return set.size > 0 ? [...set] : undefined;
  }, [seed]);

  // 패널 폭 — 시험지 빌더식 드래그 핸들(폭 조절+접기). lg 미만은 세로 스택.
  const { containerRef, widths, collapsed, startResize, toggleCollapsed, expand } =
    useResizablePanels({
      panels: [
        { key: "targets", min: 240, max: 560, defaultWidth: 340, sign: 1 },
        { key: "config", min: 320, max: 680, defaultWidth: 416, sign: 1 },
      ],
      minCenter: 480,
      storageKey: "smoat.assignmentComposer.panels.v1",
    });

  // defaultDue 는 오늘(서울) 이전이면 무시 — 지난 날짜 마감 프리필 방지
  const guardedDefaultDue =
    defaultDue && defaultDue >= seoulTodayYmd() ? defaultDue : "";

  // 열릴 때 초기화 + 대상 로드
  useEffect(() => {
    if (!open) return;
    const prefs = readComposerPrefs();
    setKind(preset?.kind ?? null);
    setContent(preset?.content ?? null);
    setQuestionIds(preset?.questionIds ?? []);
    setGrammarSpec({ count: 20, ...preset?.grammarSpec });
    setVocabSpec({ count: 20, ...preset?.vocabSpec });
    setSelection({ classIds: new Set(), studentIds: new Set(defaultStudentIds ?? []) });
    setForm({
      title: "",
      instructions: "",
      dueDate: guardedDefaultDue,
      dueTime: prefs.dueTime ?? "23:59",
      startEnabled: false,
      startDate: "",
      startTime: "08:00",
      examMode: preset?.examMode ?? prefs.examMode ?? "TABLET",
      examDurationMin: "",
      studyMode: "standard",
      studyRequired: true,
    });
    setConfirmClose(false);
    setContextTaskId(null);
    setTargetsLoading(true);
    getAssignTargets()
      .then((res) => setTargets(res.success ? (res.data ?? null) : null))
      .finally(() => setTargetsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const totalSelected = useMemo(
    () => selectionCount(targets, selection),
    [targets, selection],
  );
  // 로스터가 작으면(5명 미만) 모달을 콘텐츠 높이에 맞춰 수축시킨다.
  const rosterCount = targets?.students.length ?? 0;

  // 시드 학생 이름 — 대상 로스터에서 해석(스트립 문장 「김민준 · …」)
  const seedStudentName = useMemo(
    () =>
      seedStudentId
        ? (targets?.students.find((s) => s.id === seedStudentId)?.name ?? null)
        : null,
    [targets, seedStudentId],
  );

  // ── 푸터 문장의 대상구(D3-3) — 「김민준 외 2명」·「고2 심화 외 1명」 ────────
  const targetPhrase = useMemo(() => {
    const classNames =
      targets?.classes.filter((c) => selection.classIds.has(c.id)).map((c) => c.name) ??
      [];
    const studentNames =
      targets?.students
        .filter((s) => selection.studentIds.has(s.id))
        .map((s) => s.name) ?? [];
    if (classNames.length > 0) {
      return (
        classNames.join(" · ") +
        (studentNames.length > 0 ? ` 외 ${studentNames.length}명` : "")
      );
    }
    if (studentNames.length === 1) return studentNames[0];
    if (studentNames.length > 1) {
      return `${studentNames[0]} 외 ${studentNames.length - 1}명`;
    }
    // 로스터 미로딩 폴백 — 수치라도 정직하게
    return `${totalSelected}명`;
  }, [targets, selection, totalSelected]);

  const effectiveTitle =
    form.title.trim() ||
    (kind === "QUESTIONS"
      ? `문제 세트 ${questionIds.length}문항`
      : kind === "GRAMMAR"
        ? `어법 훈련 ${grammarSpec.count}문항`
        : kind === "VOCAB"
          ? `단어 훈련 ${vocabSpec.count}문항`
          : (content?.title ?? ""));

  // 푸터 요약의 "내용물" — effectiveTitle 우선, 없으면 kind 라벨(+문항수)
  const summaryLabel =
    effectiveTitle ||
    (kind
      ? kind === "GRAMMAR"
        ? `${STUDY_KIND_META.GRAMMAR.label} ${grammarSpec.count}문항`
        : kind === "VOCAB"
          ? `${STUDY_KIND_META.VOCAB.label} ${vocabSpec.count}문항`
          : kind === "QUESTIONS"
            ? `${STUDY_KIND_META.QUESTIONS.label} ${questionIds.length}문항`
            : STUDY_KIND_META[kind].label
      : "");

  const canSubmit =
    !!kind &&
    totalSelected > 0 &&
    (kind === "GRAMMAR" ||
      kind === "VOCAB" ||
      (kind === "QUESTIONS" && questionIds.length > 0) ||
      ((kind === "EXAM" || kind === "WORKSHEET") && !!content));

  // ── 3스텝 충족 상태(D3-1) — 패널 캡션 rose 도트·푸터 첫 사유 가이드 공용 ──
  const step1Met = totalSelected > 0;
  const step2Met =
    !!kind &&
    (kind === "GRAMMAR" ||
      kind === "VOCAB" ||
      (kind === "QUESTIONS" ? questionIds.length > 0 : !!content));
  // ③은 확인 단계 — GRAMMAR/VOCAB 은 패널 자체가 범위 구성이라 항상 충족으로 본다
  const step3Met = kind === "GRAMMAR" || kind === "VOCAB" ? true : step2Met;

  // 미충족 첫 사유(D3-3) — 패널 번호 순서(① 대상 → ② 종류 → ② 내용물)
  const firstGuide = !step1Met
    ? COMPOSER_COPY.GUIDE_TARGET
    : !kind
      ? COMPOSER_COPY.GUIDE_KIND
      : kind === "QUESTIONS" && questionIds.length === 0
        ? COMPOSER_COPY.GUIDE_QUESTIONS
        : (kind === "EXAM" || kind === "WORKSHEET") && !content
          ? COMPOSER_COPY.GUIDE_CONTENT
          : null;

  // ── 작성 중 닫힘 가드 — 초기 상태에서 벗어난 입력이 하나라도 있으면 확인 ──
  const dirty =
    (!preset && kind !== null) ||
    selection.classIds.size > 0 ||
    selection.studentIds.size !== (defaultStudentIds?.length ?? 0) ||
    form.title.trim() !== "" ||
    form.instructions.trim() !== "" ||
    form.dueDate !== guardedDefaultDue ||
    form.startEnabled ||
    (!preset?.content && content !== null) ||
    // 시드 진입(스냅샷 없는 QUESTIONS preset)의 피커 선택도 작성 중으로 본다
    questionIds.length !== (preset?.questionIds?.length ?? 0) ||
    (kind === "GRAMMAR" &&
      JSON.stringify(grammarSpec) !== JSON.stringify({ count: 20, ...preset?.grammarSpec })) ||
    (kind === "VOCAB" &&
      JSON.stringify(vocabSpec) !== JSON.stringify({ count: 20, ...preset?.vocabSpec }));

  const requestClose = () => {
    if (submitting) return;
    // 관련 과제 상세가 위에 떠 있는 동안의 ESC 는 상세만 닫는다 — WideModal 이
    // document 리스너를 각자 등록하므로 여기서 무시해 이중 닫힘을 막는다.
    if (contextTaskId) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  const submit = () => {
    if (!kind || !canSubmit) return;
    const dueAtIso = form.dueDate
      ? toLocalIso(form.dueDate, form.dueTime || "23:59")
      : null;
    const availableFromIso =
      form.startEnabled && form.startDate
        ? toLocalIso(form.startDate, form.startTime || "00:00")
        : undefined;
    // 예약 배포보다 이른 마감은 서버도 거부하지만, 그 자리에서 먼저 막는다.
    if (
      dueAtIso &&
      availableFromIso &&
      new Date(dueAtIso).getTime() < new Date(availableFromIso).getTime()
    ) {
      toast.error("마감일은 시작일 이후여야 합니다.");
      return;
    }
    const durationRaw = form.examDurationMin.trim();
    const durationMin =
      durationRaw === "" || !Number.isFinite(Number(durationRaw))
        ? undefined
        : Math.max(1, Math.min(600, Math.round(Number(durationRaw))));
    const targetInputs: StudyTargetInput[] = [
      ...[...selection.classIds].map((id) => ({ type: "CLASS" as const, id })),
      ...[...selection.studentIds].map((id) => ({ type: "STUDENT" as const, id })),
    ];
    startSubmit(async () => {
      const res = await createStudyAssignment({
        kind,
        title: effectiveTitle || undefined,
        instructions: form.instructions.trim() || undefined,
        availableFrom: availableFromIso,
        dueAt: dueAtIso,
        targets: targetInputs,
        exam:
          kind === "EXAM" && content
            ? { examId: content.refId, mode: form.examMode, durationMin }
            : undefined,
        worksheet:
          kind === "WORKSHEET" && content
            ? {
                passageReportId: content.refId,
                study: { mode: form.studyMode, required: form.studyRequired },
              }
            : undefined,
        questions: kind === "QUESTIONS" ? { questionIds } : undefined,
        grammar: kind === "GRAMMAR" ? grammarSpec : undefined,
        vocab: kind === "VOCAB" ? vocabSpec : undefined,
      });
      if (res.success && res.data) {
        saveComposerPrefs({ dueTime: form.dueTime, examMode: form.examMode });
        const skipped =
          res.data.skippedCount > 0
            ? COMPOSER_COPY.SENT_SKIPPED_SUFFIX(res.data.skippedCount)
            : "";
        toast.success(`${COMPOSER_COPY.SENT_TOAST(res.data.taskCount)}${skipped}`, {
          // 서버가 조건을 보고 문항 수를 줄였으면 그 사실을 반드시 알린다
          // (조용한 클램프는 배포자가 의도와 다른 과제를 보냈는지 모르게 만든다).
          description: res.data.notice,
        });
        onCreated?.(res.data.assignmentId);
        onClose();
      } else {
        toast.error(res.error ?? COMPOSER_COPY.SEND_FAILED);
      }
    });
  };

  // 미리보기 대상 — 실물 확인 없이는 배포 결정을 내리게 하지 않는다(전수검사 계약)
  const previewTarget: AssignPreviewTarget | null =
    kind === "EXAM" && content
      ? { kind: "EXAM", refId: content.refId }
      : kind === "WORKSHEET" && content
        ? { kind: "WORKSHEET", refId: content.refId }
        : kind === "QUESTIONS" && questionIds.length > 0
          ? { kind: "QUESTIONS", questionIds }
          : null;

  // 푸터 마감 요약 — "마감 7/18(금) 23:59 · D-7", D-0/지남은 rose 경고
  const dueDayDiff = form.dueDate ? ymdDayDiffFromToday(form.dueDate) : null;
  const dueDDay = dDayLabel(dueDayDiff);

  return (
    <WideModal
      open={open}
      onClose={requestClose}
      icon={ClipboardList}
      title={COMPOSER_COPY.TITLE}
      description={COMPOSER_COPY.DESCRIPTION}
      maxWidthClassName="max-w-[min(1840px,calc(100vw-2rem))]"
      bodyClassName="p-0 lg:overflow-hidden"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 문장형 확인 바(D3-3) — 「{대상}에게 · {내용} · {마감} 마감」,
              미충족 시 첫 번째 사유 가이드만 노출 */}
          <p aria-live="polite" className="min-w-0 text-[12.5px] text-slate-500">
            {firstGuide ? (
              <span className="font-medium text-rose-500">{firstGuide}</span>
            ) : (
              <>
                <span className="font-semibold text-slate-700">{targetPhrase}</span>
                에게
                {summaryLabel ? (
                  <>
                    <span className="text-slate-400"> · </span>
                    <span
                      title={summaryLabel}
                      className="inline-block max-w-[280px] truncate align-bottom font-semibold text-slate-700"
                    >
                      {summaryLabel}
                    </span>
                  </>
                ) : null}
                {form.dueDate ? (
                  <span
                    className={cn(
                      "tabular-nums",
                      dueDayDiff !== null && dueDayDiff <= 0
                        ? "font-semibold text-rose-600"
                        : "text-slate-500",
                    )}
                  >
                    {" "}· {formatYmdShort(form.dueDate)}({ymdWeekdayKo(form.dueDate)}){" "}
                    {form.dueTime} 마감
                    {dueDDay ? ` · ${dueDDay}` : ""}
                  </span>
                ) : (
                  <span className="text-slate-400"> · {COMPOSER_COPY.NO_DUE_HINT}</span>
                )}
                {form.startEnabled && form.startDate ? (
                  <span className="font-medium tabular-nums text-violet-600">
                    {" "}· {formatYmdShort(form.startDate)}({ymdWeekdayKo(form.startDate)}){" "}
                    {form.startTime} 시작
                  </span>
                ) : null}
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="h-9 rounded-md border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={!canSubmit || submitting}
              onClick={submit}
              className="h-9 rounded-md bg-blue-600 px-5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? COMPOSER_COPY.SENDING : CTA_LABELS.SEND_TASK}
            </button>
          </div>
        </div>
      }
    >
      {/* 스트립(시드 진입 한정) + 3패널을 한 높이 안에서 배분 — 스트립이 펼쳐져도
          모달 높이는 불변, 패널 내부 스크롤이 흡수한다. */}
      <div className="flex flex-col lg:h-[min(880px,calc(100dvh-12rem))]">
        {/* ── 분석 컨텍스트 스트립(D2-3) — analysisSeed 있을 때만(무회귀) ── */}
        {seed ? (
          <ComposerContextStrip
            seed={seed}
            studentId={seedStudentId}
            studentName={seedStudentName}
            reloadTick={contextReloadTick}
            onOpenTask={setContextTaskId}
          />
        ) : null}

        {/* 3패널 — ① 누구에게 | ② 무엇을 · 언제까지 | ③ 실물 확인(flex-1, 가장
            넓게). lg+ 에선 패널별 독립 스크롤+드래그 핸들, 모바일은 세로 스택. */}
        <div
          ref={containerRef}
          style={
            {
              "--comp-cols": `${widths.targets}px ${PANEL_HANDLE_WIDTH}px ${widths.config}px ${PANEL_HANDLE_WIDTH}px minmax(0,1fr)`,
            } as CSSProperties
          }
          className={cn(
            "grid lg:min-h-0 lg:flex-1 lg:[grid-template-columns:var(--comp-cols)]",
            rosterCount >= 5 && "max-lg:min-h-[480px]",
          )}
        >
          {/* ── ① 누구에게 ── */}
          <div
            className={cn(
              "flex min-h-0 flex-col bg-white",
              collapsed.targets && "lg:overflow-hidden",
            )}
          >
            <StepCaption label={COMPOSER_COPY.STEP_TARGET} met={step1Met} />
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col",
                collapsed.targets ? "lg:overflow-hidden" : "lg:overflow-y-auto",
              )}
            >
              <ComposerTargetPicker
                data={targets}
                loading={targetsLoading}
                selection={selection}
                onChange={setSelection}
              />
            </div>
          </div>

          <PanelHandle
            label={
              totalSelected > 0
                ? `${COMPOSER_COPY.STEP_TARGET} · ${totalSelected}명`
                : COMPOSER_COPY.STEP_TARGET
            }
            panelKey="targets"
            collapsed={Boolean(collapsed.targets)}
            side="left"
            startResize={startResize}
            toggleCollapsed={toggleCollapsed}
            expand={expand}
            className="hidden lg:flex"
          />

          {/* ── ② 무엇을 · 언제까지 ── */}
          <div
            className={cn(
              "flex min-h-0 flex-col border-t border-slate-100 bg-white lg:border-t-0",
              collapsed.config && "lg:overflow-hidden",
            )}
          >
            <StepCaption label={COMPOSER_COPY.STEP_CONFIG} met={step2Met} />
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5",
                collapsed.config ? "lg:overflow-hidden" : "lg:overflow-y-auto",
              )}
            >
              <ComposerConfigForm
                preset={preset}
                kind={kind}
                onKindSelect={(k) => {
                  setKind(k);
                  setContent(null);
                }}
                content={content}
                onPickContent={setContent}
                questionIds={questionIds}
                onQuestionIdsChange={setQuestionIds}
                form={form}
                onPatch={patchForm}
                titlePlaceholder={effectiveTitle || "과제 제목"}
                initialSubTypes={seedSubTypes}
              />
            </div>
          </div>

          <PanelHandle
            label={COMPOSER_COPY.STEP_CONFIG}
            panelKey="config"
            collapsed={Boolean(collapsed.config)}
            side="left"
            startResize={startResize}
            toggleCollapsed={toggleCollapsed}
            expand={expand}
            className="hidden lg:flex"
          />

          {/* ── ③ 실물 확인 — 실물 미리보기(EXAM/WORKSHEET/QUESTIONS) 또는
                 출제 범위 구성(GRAMMAR/VOCAB — 어법은 B-3 소유 현행 유지)이 가장
                 넓게. 캡션은 kind 정직 분기(M-8) — 범위 구성 kind 는 「③ 출제 범위」 ── */}
          <div className="flex min-h-0 flex-col border-t border-slate-100 max-lg:min-h-[360px] lg:border-t-0">
            <StepCaption
              label={
                kind === "GRAMMAR" || kind === "VOCAB"
                  ? COMPOSER_COPY.STEP_SCOPE
                  : COMPOSER_COPY.STEP_CONFIRM
              }
              met={step3Met}
            />
            {kind === "GRAMMAR" ? (
              <ComposerGrammarPanel
                spec={grammarSpec}
                onChange={setGrammarSpec}
                weakConcepts={preset?.weakConcepts}
              />
            ) : kind === "VOCAB" ? (
              <ComposerVocabPanel spec={vocabSpec} onChange={setVocabSpec} />
            ) : (
              <AssignContentPreview
                target={previewTarget}
                className="min-h-0 flex-1"
                emptyHint={
                  kind
                    ? "가운데 목록에서 배포할 콘텐츠를 선택하면 문항·지면 실물이 여기에 표시됩니다."
                    : "과제 종류를 선택하면 배포할 콘텐츠의 실물을 여기에서 확인할 수 있습니다."
                }
              />
            )}
          </div>
        </div>
      </div>

      {/* 작성 중 닫힘 확인 — ESC/백드롭/취소/X 전부 requestClose 를 거친다 */}
      <ModalCloseGuardCard
        open={open && confirmClose}
        message="닫으면 입력한 내용이 사라집니다."
        onStay={() => setConfirmClose(false)}
        onDiscard={() => {
          setConfirmClose(false);
          onClose();
        }}
      />

      {/* 컨텍스트 스트립의 관련 과제 상세 — 컴포저 위에 리프트(D2-3). 변경
          (마감 편집 등) 시 스트립 컨텍스트를 재조회한다. */}
      {seed ? (
        <AssignmentDetailModal
          assignmentId={contextTaskId}
          onClose={() => setContextTaskId(null)}
          onChanged={() => setContextReloadTick((t) => t + 1)}
        />
      ) : null}
    </WideModal>
  );
}
