"use client";

// ============================================================================
// 스튜디오 공용 배포 다이얼로그 (docs/class-studio-spec.md §3.4 C · §3.7.3 — 이중 구현 금지)
//
// 사용처: ① 지문 스튜디오(passage-studio-client) ② 워크벤치 하단 생성 도크의
// 「바로 배포」(§3.7.3). 두 곳 모두 이 파일 하나만 import 한다.
//
// [사용 계약 — 도크 결선용]
// 필수 props:
//   open: boolean            — 열림 상태
//   onClose: () => void      — 닫기(취소 버튼·백드롭)
//   classId: string | null   — 배포 대상 클래스.
//                              · string: 기존 지문 스튜디오 경로 그대로(선택 단계 미렌더).
//                              · null: 다이얼로그 서두에 「배포할 클래스 선택」 단계가
//                                렌더된다(§3.7.3 — 전체 자료에서 발사해 클래스 스탬프가
//                                없는 큐 항목). 1개 선택 → 기존 플로우 진입.
//   passageId: string        — 대상 지문(단일)
//   passageTitle: string     — 다이얼로그 부제·자동 과제명에 사용
//   modules: StudioModuleId[] — 배포 모듈 프리셋(도크: 큐 스탬프 modules ∩ 사용 가능 모듈)
//   onDeployed: () => void   — 배포 성공 후 콜백. 성공 토스트("N명에게 배포했습니다 — …")는
//                              이 컴포넌트가 §3.4 정본 문구로 띄우므로 호출부는 닫기·리프레시만.
// 옵셔널 props:
//   classes?: StudioDeployClassOption[] — classId=null 일 때 선택 단계에 표시할 클래스 목록.
//                              `StudioClassRow[]`(actions/studio/classes) 가 그대로 대입 가능.
//                              classId 가 string 이면 무시된다. classId=null 인데 미전달이면
//                              빈 목록 안내가 떠 배포로 진행할 수 없다.
//
// 동작(§3.4 C 정본 — 기존 지문 스튜디오 동작 보존):
// ① 대상(클래스 학생 전원 기본 체크) ② 마감(오늘/내일/이번 주/직접 — 서울 달력 고정,
// 해당일 23:59) ③ 강도(가볍게/표준/집중) ④ 과제명(자동 — 수정 가능). 모듈·강도가
// 정해지면 previewStudioDeployment 로 실서빙과 동일 조립의 "총 N문항 · 약 M분"을
// 실시간 표시하고, viable=false 면 배포를 막는다. 배포 = deployStudioModules.
// 날짜는 composer-config-form 의 seoulTodayYmd(서울 고정 해석) 재사용.
// ============================================================================

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  CalendarDays,
  Clock,
  Gauge,
  PenLine,
  Send,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  deployStudioModules,
  previewStudioDeployment,
  type StudioDeployPreview,
} from "@/actions/studio/deploy";
import {
  listStudioClassStudents,
  type StudioStudentRow,
} from "@/actions/studio/students";
import { WideModal } from "@/components/layout/wide-modal";
import {
  DeployClassStep,
  type StudioDeployClassOption,
} from "@/components/studio/deploy-dialog-class-step";
import {
  dueLabelKo,
  dueYmdToIso,
  resolveDueYmd,
  thisSundayYmd,
  type DuePreset,
} from "@/components/studio/deploy-dialog-dates";
import {
  seoulTodayYmd,
  ymdWeekdayKo,
} from "@/components/study-assignments/composer-config-form";
import {
  STUDIO_INTENSITY,
  STUDIO_MODULE_BY_ID,
  type StudioIntensityMode,
  type StudioModuleId,
} from "@/lib/studio/modules";

export type { StudioDeployClassOption };

// ── 섹션 헤더 (①~④ 번호 배지) ───────────────────────────────────────────────

function SectionHead({
  no,
  icon: Icon,
  label,
  aside,
}: {
  no: number;
  icon: typeof Users;
  label: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
          {no}
        </span>
        <Icon className="h-4 w-4 text-slate-400" />
        <span className="text-[13px] font-bold text-slate-900">{label}</span>
      </div>
      {aside}
    </div>
  );
}

// ── 배포 다이얼로그 ──────────────────────────────────────────────────────────

export function DeployDialog({
  open,
  onClose,
  classId,
  passageId,
  passageTitle,
  modules,
  onDeployed,
  classes,
  onClassPicked,
}: {
  open: boolean;
  onClose: () => void;
  classId: string | null;
  passageId: string;
  passageTitle: string;
  modules: StudioModuleId[];
  onDeployed: () => void;
  classes?: StudioDeployClassOption[];
  /** 클래스 선택 스텝에서 클래스가 정해진 직후 1회 호출(additive — 부재 시 무변).
   *  지문 도시에(§3.9v2.4)가 선택 즉시 studioClassPassage 멱등 등록에 쓴다 —
   *  deployStudioModules 의 링크 게이트를 배포 전에 통과시키기 위함. */
  onClassPicked?: (classId: string) => void;
}) {
  // ⓪ 클래스 선택 단계 상태 (classId=null 일 때만 의미 — §3.7.3)
  const [pickedClassId, setPickedClassId] = useState<string | null>(null);
  const effectiveClassId = classId ?? pickedClassId;
  // ① 대상
  const [students, setStudents] = useState<StudioStudentRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // ② 마감
  const [duePreset, setDuePreset] = useState<DuePreset>("tomorrow");
  const [customYmd, setCustomYmd] = useState("");
  // ③ 강도
  const [mode, setMode] = useState<StudioIntensityMode>("standard");
  // ④ 과제명 (null = 자동 제안 사용 중)
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  // 미리보기
  const [preview, setPreview] = useState<StudioDeployPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const openedRef = useRef(false);

  const moduleLabels = useMemo(
    () =>
      modules
        .map((m) => STUDIO_MODULE_BY_ID.get(m)?.label)
        .filter(Boolean)
        .join("·"),
    [modules],
  );
  const autoTitle = `[${passageTitle}] ${moduleLabels} 학습`;
  const title = titleDraft ?? autoTitle;

  // 열릴 때 1회 초기화 (닫히면 클래스 선택 단계도 리셋 — 재열림 시 서두부터)
  useEffect(() => {
    if (!open) {
      openedRef.current = false;
      setPickedClassId(null);
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    setStudents(null);
    setSelected(new Set());
    setDuePreset("tomorrow");
    setCustomYmd(seoulTodayYmd(1));
    setMode("standard");
    setTitleDraft(null);
    setPreview(null);
    setPreviewError(null);
  }, [open]);

  // 로스터 로드(전원 기본 체크) — 고정 classId 는 열릴 때 1회, 선택 단계는 픽 시점
  useEffect(() => {
    if (!open || effectiveClassId === null) return;
    let cancelled = false;
    setStudents(null);
    setSelected(new Set());
    void listStudioClassStudents(effectiveClassId).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setStudents(res.data);
        setSelected(new Set(res.data.map((s) => s.studentId)));
      } else {
        setStudents([]);
        toast.error(res.error ?? "학생 목록을 불러오지 못했습니다.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, effectiveClassId]);

  // 라이브 미리보기 — 모듈·강도가 정해질 때마다 실서빙 동일 조립으로 계산
  // (클래스 선택 단계 중에는 섹션이 렌더되지 않으므로 질의도 보류)
  const modulesKey = modules.join(",");
  useEffect(() => {
    if (!open || modules.length === 0 || effectiveClassId === null) return;
    let cancelled = false;
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      const res = await previewStudioDeployment({ passageId, modules, mode });
      if (cancelled) return;
      setPreviewLoading(false);
      if (res.success && res.data) {
        setPreview(res.data);
        setPreviewError(null);
      } else {
        setPreview(null);
        setPreviewError(res.error ?? "미리보기에 실패했습니다.");
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // modules 배열은 매 렌더 새 참조일 수 있어 내용 키로 구독한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, passageId, modulesKey, mode, effectiveClassId]);

  const noStudents = students !== null && students.length === 0;
  const allSelected = students !== null && students.length > 0 && selected.size === students.length;
  const dueYmd = resolveDueYmd(duePreset, customYmd);
  const dueIso = dueYmdToIso(dueYmd);
  const emptyModuleLabels = (preview?.emptyModules ?? [])
    .map((m) => STUDIO_MODULE_BY_ID.get(m)?.label)
    .filter(Boolean)
    .join("·");

  const canDeploy =
    !pending &&
    !previewLoading &&
    effectiveClassId !== null &&
    modules.length > 0 &&
    selected.size > 0 &&
    !noStudents &&
    preview?.viable === true &&
    dueIso !== null &&
    title.trim().length > 0;

  const toggleStudent = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!students) return;
    setSelected(allSelected ? new Set() : new Set(students.map((s) => s.studentId)));
  };

  const submit = () => {
    if (!canDeploy || !dueIso || effectiveClassId === null) return;
    startTransition(async () => {
      const res = await deployStudioModules({
        classId: effectiveClassId,
        passageId,
        modules,
        mode,
        studentIds: [...selected],
        dueAt: dueIso,
        title: title.trim(),
        required: true,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "배포에 실패했습니다.");
        return;
      }
      toast.success(
        `${res.data.taskCount}명에게 배포했습니다 — 결과 탭에서 확인할 수 있습니다`,
      );
      onDeployed();
    });
  };

  const duePresetChips: { key: DuePreset; label: string }[] = [
    { key: "today", label: `오늘(${ymdWeekdayKo(seoulTodayYmd(0))})` },
    { key: "tomorrow", label: `내일(${ymdWeekdayKo(seoulTodayYmd(1))})` },
    { key: "week", label: `이번 주(${ymdWeekdayKo(thisSundayYmd())})` },
    { key: "custom", label: "직접" },
  ];

  return (
    <WideModal
      open={open}
      onClose={onClose}
      icon={Send}
      title="배포하기"
      description={`${passageTitle} · ${moduleLabels}`}
      maxWidthClassName="max-w-2xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-[12px] text-slate-500">
            {selected.size > 0 ? `학생 ${selected.size}명` : "학생 미선택"}
            {dueYmd ? ` · 마감 ${dueLabelKo(dueYmd)} 23:59` : ""}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canDeploy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {pending ? "배포 중…" : "배포하기"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-4 sm:p-5">
        {/* ⓪ 배포할 클래스 선택 — classId=null(도크·전체 자료 발사)일 때만 서두에 렌더.
            classId 가 주어지면 이 단계는 아예 렌더되지 않는다(기존 경로 무변). */}
        {classId === null && (
          <DeployClassStep
            classes={classes ?? []}
            pickedClassId={pickedClassId}
            onPick={(id) => {
              setPickedClassId(id);
              onClassPicked?.(id);
            }}
            onReset={() => setPickedClassId(null)}
          />
        )}

        {effectiveClassId !== null && (
          <>
            {/* 라이브 미리보기 — 총량·단계 구성 */}
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                {previewLoading ? (
                  <span className="text-[13px] text-slate-400">학습 구성을 계산하고 있습니다…</span>
                ) : preview ? (
                  <span className="text-[13px] font-bold text-slate-900">
                    총 {preview.totalItems}문항 · 약 {preview.totalEstMin}분
                  </span>
                ) : (
                  <span className="text-[13px] text-slate-400">
                    {previewError ?? "학습 구성을 불러오지 못했습니다."}
                  </span>
                )}
              </div>
              {preview && preview.stages.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {preview.stages.map((s) => (
                    <span
                      key={s.stageId}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600"
                    >
                      {s.title}
                      <span className="text-slate-400">{s.itemCount}문항</span>
                    </span>
                  ))}
                </div>
              )}
              {preview && emptyModuleLabels && (
                <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-500 break-keep">
                  선택한 {emptyModuleLabels} 모듈은 이 강도에서는 포함되지 않습니다
                </div>
              )}
              {preview && !preview.viable && (
                <p className="mt-2.5 text-[12px] font-medium text-rose-600 break-keep">
                  이 구성으로는 채점할 수 있는 학습이 만들어지지 않아 배포할 수 없습니다 —
                  모듈이나 강도를 바꿔 보세요.
                </p>
              )}
            </section>

            {/* ① 대상 */}
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHead
                no={1}
                icon={Users}
                label="대상"
                aside={
                  students !== null &&
                  students.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="text-[12px] font-medium text-blue-600 hover:text-blue-700"
                    >
                      {allSelected ? "전체 해제" : "전체 선택"}
                    </button>
                  )
                }
              />
              {students === null ? (
                <p className="mt-3 text-[13px] text-slate-400">학생 목록을 불러오는 중입니다…</p>
              ) : noStudents ? (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-500 break-keep">
                  학생 탭에서 먼저 학생을 등록해 주세요
                </p>
              ) : (
                <>
                  <p className="mt-2 text-[12px] text-slate-400">
                    {students.length}명 중 {selected.size}명 선택
                  </p>
                  <ul className="mt-2 max-h-52 space-y-0.5 overflow-y-auto pr-1">
                    {students.map((s) => {
                      const checked = selected.has(s.studentId);
                      return (
                        <li key={s.studentId}>
                          <label className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleStudent(s.studentId)}
                              className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-300"
                            />
                            <span className="truncate text-[13px] text-slate-800">{s.name}</span>
                            <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-400">
                              {s.studentCode}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>

            {/* ② 마감 */}
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHead no={2} icon={CalendarDays} label="마감" />
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {duePresetChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setDuePreset(chip.key)}
                    className={
                      duePreset === chip.key
                        ? "rounded-full bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white"
                        : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600"
                    }
                  >
                    {chip.label}
                  </button>
                ))}
                {duePreset === "custom" && (
                  <input
                    type="date"
                    value={customYmd}
                    min={seoulTodayYmd(0)}
                    onChange={(e) => setCustomYmd(e.target.value)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                )}
              </div>
              <p className="mt-2 text-[12px] text-slate-400">
                {dueYmd
                  ? `${dueLabelKo(dueYmd)} 23:59 마감`
                  : "마감 날짜를 선택해 주세요"}
              </p>
            </section>

            {/* ③ 강도 */}
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHead no={3} icon={Gauge} label="강도" />
              <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                {STUDIO_INTENSITY.map((seg) => (
                  <button
                    key={seg.mode}
                    type="button"
                    onClick={() => setMode(seg.mode)}
                    className={
                      mode === seg.mode
                        ? "rounded-md bg-white py-1.5 text-[13px] font-semibold text-blue-600 shadow-sm"
                        : "rounded-md py-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-700"
                    }
                  >
                    {seg.label}
                  </button>
                ))}
              </div>
            </section>

            {/* ④ 과제명 */}
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <SectionHead no={4} icon={PenLine} label="과제명" />
              <input
                value={title}
                onChange={(e) => setTitleDraft(e.target.value)}
                maxLength={120}
                className="mt-3 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder={autoTitle}
              />
              <p className="mt-1.5 text-[11px] text-slate-400">
                학생 과제 목록에 이 이름으로 표시됩니다
              </p>
            </section>
          </>
        )}
      </div>
    </WideModal>
  );
}
