"use client";

// ============================================================================
// 도시에 인라인 배포 실행대 (docs/class-studio-spec.md §3.10.5·§3.10.9 — B3)
//
// 「학습지 보내기」「문제 보내기」의 모달(DeployDialog·AssignmentComposer) 경유를
// 대체하는 카드 내 인라인 폼. 대상은 좌측 레일이 정한 StudioDeployTarget 을
// 읽기 전용으로 소비하고(다시 묻지 않는다 — E4), 여기서는 구성·마감만 정해
// [바로 배포] 한 번으로 끝낸다.
//
// 제출 계약(§3.10.9): ① addPassagesToStudioClass 멱등 선등록(실패해도 진행 —
// 서버 링크 게이트가 최종 판정) ② deployStudioModules(title 생략 — 서버 자동)
// 또는 deployStudioQuestions ③ 성공 토스트 정본 → onDeployed(passageId) 업링크.
// 미리보기 구독은 350ms 디바운스 + modules.join(",") 문자열 키(함정 2 —
// deploy-dialog.tsx:207-230 정본). 접힘 애니메이션(grid-rows 0fr↔1fr)·펼침
// 배타·성공 시 접기는 호스트(passage-dossier-pane) 소유 — 이 파일은 폼 내용만
// 그린다(도시에 카드 폭 360px 전제, §3.9 Sec 계열 px-3 컴팩트 리듬).
// ============================================================================

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Check, Clock, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  deployStudioModules,
  deployStudioQuestions,
  previewStudioDeployment,
  type StudioDeployPreview,
} from "@/actions/studio/deploy";
import { addPassagesToStudioClass } from "@/actions/studio/passages";
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
import type { PassageDossier } from "@/lib/studio/dossier-types";
import {
  STUDIO_INTENSITY,
  STUDIO_MODULES,
  STUDIO_MODULE_BY_ID,
  type StudioIntensityMode,
  type StudioModuleId,
} from "@/lib/studio/modules";
import type { StudioDeployTarget } from "./deploy-target";

// ── 컴팩트 스타일 토큰 (카드 360px — 도시에 칩 문법과 정렬) ──────────────────

const FIELD_LABEL = "mb-1 block text-[10.5px] font-semibold text-slate-500";
// 선택 ON = 채움형(Check 아이콘 동반) — 아래 「학습 모듈」 미리보기의 테두리형
// 파란 칩과 문법을 분리해 토글/표시를 한눈에 구분한다(§3.10 적대 검수).
const MODULE_CHIP_ON =
  "inline-flex items-center gap-1 rounded-full border border-blue-600 bg-blue-600 px-2 py-0.5 text-[10.5px] font-semibold text-white transition-colors hover:border-blue-700 hover:bg-blue-700";
const MODULE_CHIP_OFF =
  "inline-flex items-center rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10.5px] font-medium text-slate-500 transition-colors hover:border-blue-300 hover:text-blue-600";
const DUE_CHIP_ON =
  "rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white";
const DUE_CHIP_OFF =
  "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-600";
// 배포 버튼 — aria-disabled 관용구(§3.9v2 정본): 비활에서도 title 사유가 뜨게
// native disabled 를 쓰지 않는다.
const DEPLOY_BASE =
  "flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold transition-colors";
const DEPLOY_ON = `${DEPLOY_BASE} bg-blue-600 text-white hover:bg-blue-700`;
const DEPLOY_DISABLED = `${DEPLOY_BASE} cursor-not-allowed bg-slate-100 text-slate-400`;

export function DossierDeployInline({
  mode,
  dossier,
  target,
  onDeployed,
}: {
  mode: "worksheet" | "questions";
  dossier: PassageDossier;
  target: StudioDeployTarget | null;
  onDeployed: (passageId: string) => void;
}) {
  const passageId = dossier.passage.id;

  // ── 모듈 선택(worksheet) — 기본 = ready 전체 + 실전(hasExam), 최소 1 유지 ──
  // STUDIO_MODULES 순서를 정본으로 필터해 칩 순서·미리보기 키가 흔들리지 않게.
  const availableModules = useMemo(() => {
    const ready = new Set<string>(dossier.analysis.readyModules);
    return STUDIO_MODULES.filter((m) =>
      m.id === "exam" ? dossier.analysis.hasExam : ready.has(m.id),
    ).map((m) => m.id);
  }, [dossier.analysis.readyModules, dossier.analysis.hasExam]);
  const availableKey = availableModules.join(",");

  const [selected, setSelected] = useState<ReadonlySet<StudioModuleId>>(
    () => new Set(availableModules),
  );
  // 조용한 재조회로 사용 가능 모듈 집합이 실제로 바뀐 경우에만 기본값(전체
  // 선택)으로 되돌린다 — 단순 참조 변경에는 사용자의 제외 선택을 보존한다.
  useEffect(() => {
    setSelected(new Set(availableModules));
    // availableModules 는 매 렌더 새 참조일 수 있어 내용 키로 구독한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableKey]);

  const toggleModule = useCallback((id: StudioModuleId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev; // 최소 1개 — 마지막 칩 해제는 무시
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectedList = useMemo(
    () => availableModules.filter((id) => selected.has(id)),
    [availableModules, selected],
  );
  const modulesKey = selectedList.join(",");

  // ── 강도(worksheet) ──────────────────────────────────────────────────────
  const [intensity, setIntensity] = useState<StudioIntensityMode>("standard");

  // ── 마감 프리셋(공통) — dates 헬퍼 재사용(서울 달력 고정·23:59) ──────────
  const [duePreset, setDuePreset] = useState<DuePreset>("tomorrow");
  const [customYmd, setCustomYmd] = useState(() => seoulTodayYmd(1));
  const dueYmd = resolveDueYmd(duePreset, customYmd);
  const dueIso = dueYmdToIso(dueYmd);

  // ── 라이브 미리보기(worksheet) — 350ms 디바운스 + 문자열 키 구독(함정 2) ──
  const [preview, setPreview] = useState<StudioDeployPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "worksheet" || selectedList.length === 0) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      const res = await previewStudioDeployment({
        passageId,
        modules: selectedList,
        mode: intensity,
      });
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
    // selectedList 배열은 매 렌더 새 참조일 수 있어 내용 키로 구독한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, passageId, modulesKey, intensity]);

  const emptyModuleLabels = (preview?.emptyModules ?? [])
    .map((m) => STUDIO_MODULE_BY_ID.get(m)?.label)
    .filter(Boolean)
    .join("·");

  // ── 문항 재료(questions) — rows 는 최신 50 절단본(서버 정본) 전량 ────────
  const questionIds = useMemo(
    () => dossier.questions.rows.map((r) => r.id),
    [dossier.questions.rows],
  );

  // ── 배포 가능 판정 — 비활성 사유 3분기(§3.10.5) ──────────────────────────
  const [pending, startTransition] = useTransition();
  const targetReason =
    target === null
      ? "①에서 클래스를 먼저 선택하세요"
      : !target.loading && target.total === 0
        ? "클래스에 학생이 없습니다 — 레일에서 학생을 추가하세요"
        : !target.loading && target.count === 0
          ? "대상 학생을 선택하세요"
          : null;

  const canDeploy =
    !pending &&
    target !== null &&
    !target.loading &&
    target.count > 0 &&
    dueIso !== null &&
    (mode === "worksheet"
      ? selectedList.length > 0 && !previewLoading && preview?.viable === true
      : questionIds.length > 0);

  const disabledTitle = canDeploy
    ? undefined
    : (targetReason ??
      (target?.loading
        ? "학생 목록을 불러오는 중입니다"
        : mode === "worksheet" && selectedList.length === 0
          ? "모듈을 선택해 주세요"
          : mode === "worksheet" && previewLoading
            ? "학습 구성을 계산하고 있습니다"
            : mode === "worksheet" && preview?.viable !== true
              ? "이 구성으로는 배포할 수 없습니다"
              : mode === "questions" && questionIds.length === 0
                ? "배포할 문제가 없습니다"
                : dueIso === null
                  ? "마감 날짜를 선택해 주세요"
                  : undefined));

  // ── 제출 — 멱등 선등록 → 배포 → 토스트 정본 → onDeployed 업링크 ─────────
  const submit = useCallback(() => {
    if (!canDeploy || target === null || dueIso === null) return;
    startTransition(async () => {
      try {
        // 멱등 선등록(§3.10.9 함정 3) — 실패해도 배포 시도는 진행한다.
        // deployStudioModules 의 링크 게이트가 최종 판정자다.
        await addPassagesToStudioClass({
          classId: target.classId,
          passageIds: [passageId],
        });
      } catch {
        // 무시 — 위 주석 참조
      }
      const res =
        mode === "worksheet"
          ? await deployStudioModules({
              classId: target.classId,
              passageId,
              modules: selectedList,
              mode: intensity,
              studentIds: target.studentIds,
              dueAt: dueIso,
              // title 생략 — 서버가 "[지문제목] 모듈 학습" 정본으로 자동 조립
              required: true,
            })
          : await deployStudioQuestions({
              classId: target.classId,
              passageId,
              questionIds,
              studentIds: target.studentIds,
              dueAt: dueIso,
              title: `[${dossier.passage.title}] 문제 ${questionIds.length}문항`,
            });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "배포에 실패했습니다.");
        return;
      }
      toast.success(
        `${res.data.taskCount}명에게 배포했습니다 — 결과 탭에서 확인할 수 있습니다`,
      );
      onDeployed(passageId);
    });
  }, [
    canDeploy,
    target,
    dueIso,
    mode,
    passageId,
    selectedList,
    intensity,
    questionIds,
    dossier.passage.title,
    onDeployed,
  ]);

  const duePresetChips: { key: DuePreset; label: string }[] = [
    { key: "today", label: `오늘(${ymdWeekdayKo(seoulTodayYmd(0))})` },
    { key: "tomorrow", label: `내일(${ymdWeekdayKo(seoulTodayYmd(1))})` },
    { key: "week", label: `이번 주(${ymdWeekdayKo(thisSundayYmd())})` },
    { key: "custom", label: "직접" },
  ];

  return (
    <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/50 px-3 pb-3 pt-2.5">
      {/* 대상 요약 — 좌측 레일 읽기 전용(E4: 다시 묻지 않는다) */}
      <div>
        {target !== null ? (
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[11.5px] font-bold tabular-nums text-slate-800">
              → {target.className} ·{" "}
              {target.partial
                ? `${target.count}/${target.total}명`
                : `${target.count}명`}
            </span>
            {target.loading ? (
              <Loader2
                className="size-3 shrink-0 animate-spin text-slate-400"
                aria-label="학생 목록을 불러오는 중"
              />
            ) : null}
          </div>
        ) : null}
        <p className="mt-0.5 text-[10.5px] text-slate-400">
          대상은 왼쪽 레일에서 바꿉니다
        </p>
        {targetReason ? (
          <p className="mt-1 text-[10.5px] font-medium text-amber-600 break-keep">
            {targetReason}
          </p>
        ) : null}
      </div>

      {mode === "worksheet" ? (
        <>
          {/* 모듈 칩 — 기본 전체 선택, 탭하여 제외(최소 1개) */}
          <div>
            <span className={FIELD_LABEL}>모듈</span>
            <div className="flex flex-wrap gap-1">
              {availableModules.map((id) => {
                const on = selected.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleModule(id)}
                    className={on ? MODULE_CHIP_ON : MODULE_CHIP_OFF}
                  >
                    {on ? (
                      <Check className="size-3 shrink-0" aria-hidden="true" />
                    ) : null}
                    {STUDIO_MODULE_BY_ID.get(id)?.label ?? id}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 강도 세그먼트 — STUDIO_INTENSITY 정본(기본 표준) */}
          <div>
            <span className={FIELD_LABEL}>강도</span>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-0.5">
              {STUDIO_INTENSITY.map((seg) => (
                <button
                  key={seg.mode}
                  type="button"
                  onClick={() => setIntensity(seg.mode)}
                  className={
                    intensity === seg.mode
                      ? "rounded-md bg-white py-1 text-[11px] font-semibold text-blue-600 shadow-sm"
                      : "rounded-md py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
                  }
                >
                  {seg.label}
                </button>
              ))}
            </div>
          </div>

          {/* 라이브 미리보기 1줄 — 실서빙 동일 조립의 총량 */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
            <Clock className="size-3.5 shrink-0 text-blue-600" aria-hidden="true" />
            {previewLoading ? (
              <span className="text-[11px] text-slate-400">
                학습 구성을 계산하고 있습니다…
              </span>
            ) : preview ? (
              <span className="text-[11.5px] font-bold tabular-nums text-slate-900">
                총 {preview.totalItems}문항 · 약 {preview.totalEstMin}분
              </span>
            ) : (
              <span className="min-w-0 text-[11px] text-slate-400 break-keep">
                {previewError ?? "학습 구성을 불러오지 못했습니다."}
              </span>
            )}
          </div>
          {preview && emptyModuleLabels ? (
            <p className="text-[10.5px] leading-relaxed text-slate-500 break-keep">
              선택한 {emptyModuleLabels} 모듈은 이 강도에서는 포함되지 않습니다
            </p>
          ) : null}
          {preview && !preview.viable ? (
            <p className="text-[10.5px] font-medium leading-relaxed text-rose-600 break-keep">
              이 구성으로는 채점할 수 있는 학습이 만들어지지 않아 배포할 수
              없습니다 — 모듈이나 강도를 바꿔 보세요.
            </p>
          ) : null}
        </>
      ) : (
        /* 문항 요약 — 추가 선택 UI 없음(E4 "복잡하게 선택할 필요 없이") */
        <div>
          <p className="text-[11.5px] font-bold tabular-nums text-slate-800">
            전체 {dossier.questions.total}문항
          </p>
          {dossier.questions.byType.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {dossier.questions.byType.map((t) => (
                <span
                  key={t.label}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500"
                >
                  {t.label} {t.count}
                </span>
              ))}
            </div>
          ) : null}
          {dossier.questions.total > 50 ? (
            <p className="mt-1 text-[10.5px] text-slate-400">
              최신 50문항을 보냅니다
            </p>
          ) : null}
        </div>
      )}

      {/* 마감 프리셋 4칩 — 서울 달력 고정, 해당일 23:59(DeployDialog 이관) */}
      <div>
        <span className={FIELD_LABEL}>마감</span>
        <div className="flex flex-wrap items-center gap-1">
          {duePresetChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setDuePreset(chip.key)}
              className={duePreset === chip.key ? DUE_CHIP_ON : DUE_CHIP_OFF}
            >
              {chip.label}
            </button>
          ))}
          {duePreset === "custom" ? (
            <input
              type="date"
              value={customYmd}
              min={seoulTodayYmd(0)}
              onChange={(e) => setCustomYmd(e.target.value)}
              aria-label="마감 날짜 직접 선택"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          ) : null}
        </div>
        <p className="mt-1 text-[10.5px] tabular-nums text-slate-400">
          {dueYmd ? `${dueLabelKo(dueYmd)} 23:59 마감` : "마감 날짜를 선택해 주세요"}
        </p>
      </div>

      {/* 바로 배포 — aria-disabled + onClick 초입 return(native disabled 금지) */}
      <button
        type="button"
        aria-disabled={!canDeploy}
        title={disabledTitle}
        onClick={() => {
          if (!canDeploy) return;
          submit();
        }}
        className={canDeploy ? DEPLOY_ON : DEPLOY_DISABLED}
      >
        {pending ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        {pending ? "배포 중…" : "바로 배포"}
      </button>
    </div>
  );
}
