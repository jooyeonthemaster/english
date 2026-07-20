"use client";

// ============================================================================
// 과제 컴포저 — 통합 배포 위저드 (와이드 모달, 좁은 모달 금지 계약)
//
// 모든 배포 진입점(학생 상세 과제 탭·과제 관리·시험지 상세·학습지 카드·
// 문제 뱅크)이 이 컴포넌트 하나를 쓴다. 좌측 = 대상 선택(반 원클릭+학생),
// 가운데 = 과제 구성(ComposerConfigForm 으로 분리), 우측 = 콘텐츠 실물.
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
  GrammarAssignmentPayload,
  StudyAssignmentKind,
  StudyTargetInput,
} from "@/lib/study-assignments/types";
import { STUDY_KIND_META } from "@/lib/study-assignments/types";
import { dDayLabel } from "@/lib/study-assignments/status";
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
import {
  AssignContentPreview,
  type AssignPreviewTarget,
} from "./assign-content-preview";

export interface ComposerPreset {
  kind: StudyAssignmentKind;
  /** EXAM/WORKSHEET: 콘텐츠 고정(변경 불가) */
  content?: PickedContent;
  /** QUESTIONS: 문제 스냅샷(문제 뱅크에서 선택해 진입 — 피커 없이 고정 잠금) */
  questionIds?: string[];
  /** GRAMMAR: 초기 스펙·취약 프리셋 */
  grammarSpec?: Partial<GrammarAssignmentPayload>;
  weakConcepts?: WeakConceptPreset[];
  /** EXAM 기본 응시 모드 */
  examMode?: "TABLET" | "OMR";
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

  const patchForm = (patch: Partial<ComposerFormState>) =>
    setForm((f) => ({ ...f, ...patch }));

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

  const effectiveTitle =
    form.title.trim() ||
    (kind === "QUESTIONS"
      ? `문제 세트 ${questionIds.length}문항`
      : kind === "GRAMMAR"
        ? `어법 훈련 ${grammarSpec.count}문항`
        : (content?.title ?? ""));

  // 푸터 요약의 "내용물" — effectiveTitle 우선, 없으면 kind 라벨(+문항수)
  const summaryLabel =
    effectiveTitle ||
    (kind
      ? kind === "GRAMMAR"
        ? `${STUDY_KIND_META.GRAMMAR.label} ${grammarSpec.count}문항`
        : kind === "QUESTIONS"
          ? `${STUDY_KIND_META.QUESTIONS.label} ${questionIds.length}문항`
          : STUDY_KIND_META[kind].label
      : "");

  const canSubmit =
    !!kind &&
    totalSelected > 0 &&
    (kind === "GRAMMAR" ||
      (kind === "QUESTIONS" && questionIds.length > 0) ||
      ((kind === "EXAM" || kind === "WORKSHEET") && !!content));

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
    (!preset && questionIds.length > 0) ||
    (kind === "GRAMMAR" &&
      JSON.stringify(grammarSpec) !== JSON.stringify({ count: 20, ...preset?.grammarSpec }));

  const requestClose = () => {
    if (submitting) return;
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
      });
      if (res.success && res.data) {
        saveComposerPrefs({ dueTime: form.dueTime, examMode: form.examMode });
        const skipped =
          res.data.skippedCount > 0
            ? ` (이미 제출한 ${res.data.skippedCount}명은 기존 기록 유지)`
            : "";
        toast.success(`${res.data.taskCount}명에게 과제를 배포했습니다.${skipped}`);
        onCreated?.(res.data.assignmentId);
        onClose();
      } else {
        toast.error(res.error ?? "과제 배포에 실패했습니다.");
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
      title="과제 배포"
      description="시험지·학습지·문제·어법 훈련을 학생의 모바일 학습 앱으로 보냅니다."
      maxWidthClassName="max-w-[min(1840px,calc(100vw-2rem))]"
      bodyClassName="p-0 lg:overflow-hidden"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="min-w-0 text-[12.5px] text-slate-500">
            {totalSelected > 0 ? (
              <>
                {summaryLabel ? (
                  <>
                    <span
                      title={summaryLabel}
                      className="inline-block max-w-[280px] truncate align-bottom font-semibold text-slate-700"
                    >
                      {summaryLabel}
                    </span>
                    <span className="text-slate-400"> → </span>
                  </>
                ) : null}
                <span className="font-bold text-blue-600 tabular-nums">{totalSelected}명</span>
                에게 배포합니다
                {form.dueDate ? (
                  <span
                    className={cn(
                      "tabular-nums",
                      dueDayDiff !== null && dueDayDiff <= 0
                        ? "font-semibold text-rose-600"
                        : "text-slate-400",
                    )}
                  >
                    {" "}· 마감 {formatYmdShort(form.dueDate)}({ymdWeekdayKo(form.dueDate)}){" "}
                    {form.dueTime}
                    {dueDDay ? ` · ${dueDDay}` : ""}
                  </span>
                ) : (
                  <span className="text-slate-400"> · 마감 없음</span>
                )}
                {form.startEnabled && form.startDate ? (
                  <span className="font-medium tabular-nums text-violet-600">
                    {" "}· {formatYmdShort(form.startDate)}({ymdWeekdayKo(form.startDate)}){" "}
                    {form.startTime} 시작
                  </span>
                ) : null}
              </>
            ) : (
              "배포할 대상을 선택해 주세요"
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
              {submitting ? "배포 중…" : "과제 배포"}
            </button>
          </div>
        </div>
      }
    >
      {/* 3패널 — 대상 | 구성 폼 | 콘텐츠 실물(flex-1, 가장 넓게). lg+ 에선
          패널별 독립 스크롤(고정 높이)+드래그 핸들로 폭 조절, 모바일은 세로 스택. */}
      <div
        ref={containerRef}
        style={
          {
            "--comp-cols": `${widths.targets}px ${PANEL_HANDLE_WIDTH}px ${widths.config}px ${PANEL_HANDLE_WIDTH}px minmax(0,1fr)`,
          } as CSSProperties
        }
        className={cn(
          "grid lg:h-[min(880px,calc(100dvh-12rem))] lg:[grid-template-columns:var(--comp-cols)]",
          rosterCount >= 5 && "max-lg:min-h-[480px]",
        )}
      >
        {/* ── ① 대상 선택 ── */}
        <div
          className={cn(
            "flex min-h-0 flex-col bg-white",
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

        <PanelHandle
          label={totalSelected > 0 ? `대상 선택 · ${totalSelected}명` : "대상 선택"}
          panelKey="targets"
          collapsed={Boolean(collapsed.targets)}
          side="left"
          startResize={startResize}
          toggleCollapsed={toggleCollapsed}
          expand={expand}
          className="hidden lg:flex"
        />

        {/* ── ② 과제 구성 ── */}
        <div
          className={cn(
            "flex min-h-0 flex-col gap-4 border-t border-slate-100 bg-white p-4 sm:p-5 lg:border-t-0",
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
          />
        </div>

        <PanelHandle
          label="과제 구성"
          panelKey="config"
          collapsed={Boolean(collapsed.config)}
          side="left"
          startResize={startResize}
          toggleCollapsed={toggleCollapsed}
          expand={expand}
          className="hidden lg:flex"
        />

        {/* ── ③ 콘텐츠 — 실물 미리보기(EXAM/WORKSHEET/QUESTIONS) 또는
               어법 출제 범위 구성(GRAMMAR)이 가장 넓은 영역을 쓴다 ── */}
        <div className="flex min-h-0 flex-col border-t border-slate-100 max-lg:min-h-[360px] lg:border-t-0">
          {kind === "GRAMMAR" ? (
            <ComposerGrammarPanel
              spec={grammarSpec}
              onChange={setGrammarSpec}
              weakConcepts={preset?.weakConcepts}
            />
          ) : (
            <AssignContentPreview
              target={previewTarget}
              className="flex-1"
              emptyHint={
                kind
                  ? "가운데 목록에서 배포할 콘텐츠를 선택하면 문항·지면 실물이 여기에 표시됩니다."
                  : "과제 종류를 선택하면 배포할 콘텐츠의 실물을 여기에서 확인할 수 있습니다."
              }
            />
          )}
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
    </WideModal>
  );
}
