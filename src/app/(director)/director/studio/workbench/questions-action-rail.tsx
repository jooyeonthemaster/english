"use client";

// ============================================================================
// 클래스 스튜디오 — 생성 문제 탭 우측 실행대 (docs/class-studio-spec.md §3.10.17-b)
//
// 생성 문제 뷰에서 우측 패널은 도시에가 아니라 이 실행대다(사용자: "저 오른쪽
// 섹션이 시험지를 조판하는 영역이 되거나, 선택된 문제들을 모바일에 배포하는
// 영역이 되는 형태"). 두 갈래 CTA([모바일 배포][시험지 조판])는 **선택 0에서도
// 항시 노출**("선택 하기 전부터 계속 있어야 하는 버튼") — 0이면 aria-disabled
// + 유도 안내. 배포 재료·제출 로직은 DossierPickBar(§3.10.13) 정본을 이관:
// 멱등 선등록 → deployStudioQuestions(다지문 1과제·50문항 사전 게이트) →
// 토스트 정본 → onDeployed 업링크. 시험지 조판은 onComposeExam(인-플로우
// 조판 표면 §3.10.17-a — 시드 주입은 오케스트레이터 소관).
// 선택 상태(flatPicked)는 오케스트레이터 소유(§3.10.13 과 동일 근거 — 이
// 패널은 aside(xl+)·슬라이드오버 두 트리 위치에 렌더된다).
//
// §M(26-08-22) 모바일 학습 임시 숨김: SHOW_STUDIO_MOBILE_LEARNING=false(기본)면
// [모바일 배포] 갈래(버튼·인라인 폼·상한 경고·두 갈래 캡션)를 렌더하지 않고
// [시험지 조판]이 전폭(grid-cols-1)을 차지한다. 코드 경로는 전부 존치 —
// 복구는 env 1줄(NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true). 같은 개정으로
// `nudge`(생성 완료 → 조판 유도 펄스, 오케스트레이터 소유) prop 이 추가됐다.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import {
  ClipboardList,
  ListChecks,
  Loader2,
  Send,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { deployStudioQuestions } from "@/actions/studio/deploy";
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
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import type { StudioDeployTarget } from "./deploy-target";
import type { PickedQuestionMeta } from "./dossier-pick-bar";

// §M 모바일 학습 임시 숨김 스위치 — 모듈 상수로만 소비한다(prop 화 금지:
// memo·시그니처 메모 방어선 무접촉). false 가 기본값 = 숨김이 새 정상.
const SHOW_MOBILE = FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING;

// ── 스타일 토큰 — 픽바(§3.10.13)와 동일 문법(동등 위계 2버튼·인라인 폼) ──
const ACTION_BASE =
  "flex h-10 min-w-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg text-[12.5px] font-bold shadow-sm transition-colors";
const ACTION_ON = `${ACTION_BASE} cursor-pointer bg-blue-600 text-white hover:bg-blue-700`;
const ACTION_OPEN = `${ACTION_BASE} cursor-pointer bg-blue-700 text-white ring-2 ring-inset ring-blue-300`;
const ACTION_DISABLED = `${ACTION_BASE} cursor-not-allowed bg-slate-100 text-slate-400 shadow-none`;
const DUE_CHIP_ON =
  "rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white";
const DUE_CHIP_OFF =
  "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-600";
const DEPLOY_BASE =
  "flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold transition-colors";
const DEPLOY_ON = `${DEPLOY_BASE} cursor-pointer bg-blue-600 text-white hover:bg-blue-700`;
const DEPLOY_DISABLED = `${DEPLOY_BASE} cursor-not-allowed bg-slate-200 text-slate-400`;

/** 모바일 배포 1회 상한 — createStudyAssignment(QUESTIONS) 서버 정본 미러(§3.10.13) */
const MOBILE_DEPLOY_MAX = 50;

export function QuestionsActionRail({
  picked,
  deployTarget,
  onClear,
  onDeployed,
  onComposeExam,
  nudge = false,
}: {
  /** 오케스트레이터 소유 선택 상태 — Map 삽입 순서 = 체크 순서 = 조판 순서 */
  picked: ReadonlyMap<string, PickedQuestionMeta>;
  /** 좌측 레일 체크 상태(§3.10.3) — null = 클래스 미선택. 읽기 전용 */
  deployTarget: StudioDeployTarget | null;
  onClear: () => void;
  /** 배포 성공 — 관련 지문 전부(호스트가 선택 비움 + 리프레시 업링크) */
  onDeployed: (passageIds: string[]) => void;
  /** 시험지 조판 — 인-플로우 조판 표면 진입(시드 주입은 호스트 소관) */
  onComposeExam: (questionIds: string[]) => void;
  /**
   * §M 조판 유도 펄스 — 문항 생성 완료를 오케스트레이터가 감지해 true 를 내리면
   * [시험지 조판] 버튼이 펄스 링으로 빤짝인다(count 0 이면 은은판 + 안내 한 줄).
   * 소등(조판 표면 열림)도 오케스트레이터 소관. 원시 boolean — memo 무해.
   */
  nudge?: boolean;
}) {
  const count = picked.size;
  const questionIds = useMemo(() => [...picked.keys()], [picked]);
  const passageIds = useMemo(
    () => [...new Set([...picked.values()].map((m) => m.passageId))],
    [picked],
  );
  const passageTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of picked.values()) {
      if (!map.has(m.passageId)) map.set(m.passageId, m.passageTitle);
    }
    return map;
  }, [picked]);
  // 유형 요약 칩 — 많은 순, 6종 초과 "+N종"(픽바 문법)
  const typeChips = useMemo(() => {
    const byType = new Map<string, number>();
    for (const meta of picked.values())
      byType.set(meta.typeLabel, (byType.get(meta.typeLabel) ?? 0) + 1);
    return [...byType.entries()].sort((a, b) => b[1] - a[1]);
  }, [picked]);
  const shownChips = typeChips.slice(0, 6);
  const hiddenTypeCount = typeChips.length - shownChips.length;

  const [formOpen, setFormOpen] = useState(false);
  // 선택이 비면(성공·해제) 폼도 접는다 — 렌더 중 조건부 setState 공인 패턴.
  if (count === 0 && formOpen) setFormOpen(false);

  // ── 마감 프리셋 — 픽바/인라인 폼과 동일 재료(서울 달력·해당일 23:59) ──
  const [duePreset, setDuePreset] = useState<DuePreset>("tomorrow");
  const [customYmd, setCustomYmd] = useState(() => seoulTodayYmd(1));
  const dueYmd = resolveDueYmd(duePreset, customYmd);
  const dueIso = dueYmdToIso(dueYmd);
  const duePresetChips: { key: DuePreset; label: string }[] = [
    { key: "today", label: `오늘(${ymdWeekdayKo(seoulTodayYmd(0))})` },
    { key: "tomorrow", label: `내일(${ymdWeekdayKo(seoulTodayYmd(1))})` },
    { key: "week", label: `이번 주(${ymdWeekdayKo(thisSundayYmd())})` },
    { key: "custom", label: "직접" },
  ];

  const [pending, startTransition] = useTransition();
  const targetReason =
    deployTarget === null
      ? "①에서 클래스를 먼저 선택하세요"
      : !deployTarget.loading && deployTarget.total === 0
        ? "클래스에 학생이 없습니다 — 레일에서 학생을 추가하세요"
        : !deployTarget.loading && deployTarget.count === 0
          ? "대상 학생을 선택하세요"
          : null;
  const overCap = count > MOBILE_DEPLOY_MAX;
  const canDeploy =
    !pending &&
    deployTarget !== null &&
    !deployTarget.loading &&
    deployTarget.count > 0 &&
    dueIso !== null &&
    count > 0 &&
    !overCap;
  const deployDisabledTitle = canDeploy
    ? undefined
    : (overCap
        ? `모바일 배포는 한 번에 ${MOBILE_DEPLOY_MAX}문항까지입니다 — ${count - MOBILE_DEPLOY_MAX}개를 줄여 주세요`
        : (targetReason ??
          (count === 0
            ? "왼쪽 목록에서 문항을 먼저 체크하세요"
            : deployTarget?.loading
              ? "학생 목록을 불러오는 중입니다"
              : dueIso === null
                ? "마감 날짜를 선택해 주세요"
                : undefined)));

  // ── 제출 — 픽바 정본 이관(멱등 선등록 → 배포 → 토스트 → 업링크).
  // 일반 함수: 파생값(dueIso) 탓에 수동 useCallback 은 컴파일러 메모 보존 위반.
  const submitDeploy = () => {
    if (!canDeploy || deployTarget === null || dueIso === null) return;
    startTransition(async () => {
      try {
        await addPassagesToStudioClass({
          classId: deployTarget.classId,
          passageIds,
        });
      } catch {
        // 멱등 선등록 실패는 무시(§3.10.9 함정 3 — 순수 등록 편의)
      }
      const soleTitle = passageIds[0]
        ? passageTitleById.get(passageIds[0])
        : undefined;
      const res = await deployStudioQuestions({
        classId: deployTarget.classId,
        passageId: passageIds[0] ?? "",
        questionIds,
        studentIds: deployTarget.studentIds,
        dueAt: dueIso,
        title:
          passageIds.length === 1 && soleTitle
            ? `[${soleTitle}] 선택 문제 ${questionIds.length}문항`
            : `선택 문제 ${questionIds.length}문항 (지문 ${passageIds.length}개)`,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "배포에 실패했습니다.");
        return;
      }
      toast.success(
        `${res.data.taskCount}명에게 배포했습니다 — 결과 탭에서 확인할 수 있습니다`,
      );
      onDeployed(passageIds);
    });
  };

  const composeExam = () => {
    if (count === 0) return;
    onComposeExam(questionIds);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-3 py-3">
      {/* ── 선택 요약 — 0에서도 유도 문구로 항시 자리 유지 ── */}
      <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-1.5">
          <ListChecks
            className="size-3.5 shrink-0 text-blue-600"
            aria-hidden="true"
          />
          {count > 0 ? (
            <span className="min-w-0 truncate text-[11.5px] font-bold text-slate-800">
              문항 <span className="tabular-nums text-blue-600">{count}</span>개
              선택됨
              {passageIds.length > 1 ? (
                <span className="font-medium text-slate-400">
                  {" "}
                  · 지문 {passageIds.length}개
                </span>
              ) : null}
            </span>
          ) : (
            <span className="min-w-0 text-[11.5px] font-semibold text-slate-500">
              선택된 문항이 없습니다
            </span>
          )}
          <span className="flex-1" aria-hidden="true" />
          {count > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
            >
              <X className="size-3 shrink-0" aria-hidden="true" />
              선택 해제
            </button>
          ) : null}
        </div>
        {count === 0 ? (
          nudge ? (
            /* §M 생성 완료 넛지 — 아직 체크 전이라 버튼 대신 안내가 유도한다 */
            <p className="mt-1 text-[10.5px] font-semibold leading-relaxed text-blue-600 break-keep">
              방금 생성된 문항이 도착했어요 — 목록에서 체크하면 바로 시험지
              조판으로 이어집니다
            </p>
          ) : (
            <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400 break-keep">
              {SHOW_MOBILE
                ? "왼쪽 목록에서 클릭·드래그로 문항을 체크하면 여기서 바로 배포하거나 시험지로 조판합니다"
                : "왼쪽 목록에서 클릭·드래그로 문항을 체크하면 여기서 시험지로 조판합니다"}
            </p>
          )
        ) : shownChips.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {shownChips.map(([label, n]) => (
              <span
                key={label}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500"
              >
                {label} {n}
              </span>
            ))}
            {hiddenTypeCount > 0 ? (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-400">
                +{hiddenTypeCount}종
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── 실행 버튼 — 항시 노출(§3.10.17-b), 0이면 비활 + 사유 title.
          §M off 면 [시험지 조판] 단독 전폭(grid-cols-1) — 빈 반칸 잔재 금지 ── */}
      <div
        className={`mt-2.5 grid gap-1.5 ${SHOW_MOBILE ? "grid-cols-2" : "grid-cols-1"}`}
      >
        {SHOW_MOBILE ? (
          <button
            type="button"
            aria-expanded={formOpen}
            aria-disabled={count === 0}
            title={
              count === 0 ? "왼쪽 목록에서 문항을 먼저 체크하세요" : undefined
            }
            onClick={() => {
              if (count === 0) return;
              setFormOpen((v) => !v);
            }}
            className={
              count === 0 ? ACTION_DISABLED : formOpen ? ACTION_OPEN : ACTION_ON
            }
          >
            <Smartphone className="size-4 shrink-0" aria-hidden="true" />
            모바일 배포
          </button>
        ) : null}
        <button
          type="button"
          aria-disabled={count === 0}
          title={count === 0 ? "왼쪽 목록에서 문항을 먼저 체크하세요" : undefined}
          onClick={composeExam}
          className={`${count === 0 ? ACTION_DISABLED : ACTION_ON}${
            nudge ? (count === 0 ? " studio-pulse-soft" : " studio-pulse") : ""
          }`}
        >
          <ClipboardList className="size-4 shrink-0" aria-hidden="true" />
          시험지 조판
        </button>
      </div>

      {SHOW_MOBILE && overCap ? (
        <p className="mt-1.5 rounded-md bg-rose-50 px-2 py-1.5 text-[10.5px] font-medium leading-relaxed text-rose-600 break-keep">
          모바일 배포는 한 번에 {MOBILE_DEPLOY_MAX}문항까지 보낼 수 있습니다 —{" "}
          {count - MOBILE_DEPLOY_MAX}개를 줄이거나 시험지 조판을 이용하세요
        </p>
      ) : null}

      {SHOW_MOBILE ? (
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400 break-keep">
          <span className="font-semibold text-slate-500">모바일 배포</span>는
          학생 앱 과제로 바로 보내고,{" "}
          <span className="font-semibold text-slate-500">시험지 조판</span>은 이
          화면에서 A4 시험지를 만듭니다
        </p>
      ) : /* §M off — 버튼 아래 캡션 소거(26-08-22 사용자 지시, 픽바와 동시).
           버튼 라벨·요약 카드가 이미 말하는 동어반복 한 줄이었다. */
      null}

      {/* ── 모바일 배포 인라인 폼(픽바 정본 이관) — inert: 접힘 중 탭 스톱 차단.
          §M off 면 래퍼째 미렌더(접힘 잔재·탭 스톱·검사기 소음 금지) ── */}
      {SHOW_MOBILE ? (
      <div
        inert={!formOpen}
        className={`grid transition-[grid-template-rows] duration-300 ${formOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-2 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2.5">
            <div>
              {deployTarget !== null ? (
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 truncate text-[11.5px] font-bold tabular-nums text-slate-800">
                    → {deployTarget.className} ·{" "}
                    {deployTarget.partial
                      ? `${deployTarget.count}/${deployTarget.total}명`
                      : `${deployTarget.count}명`}
                  </span>
                  {deployTarget.loading ? (
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

            <div>
              <span className="mb-1 block text-[10.5px] font-semibold text-slate-500">
                마감
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {duePresetChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setDuePreset(chip.key)}
                    className={
                      duePreset === chip.key ? DUE_CHIP_ON : DUE_CHIP_OFF
                    }
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
                {dueYmd
                  ? `${dueLabelKo(dueYmd)} 23:59 마감`
                  : "마감 날짜를 선택해 주세요"}
              </p>
            </div>

            <button
              type="button"
              aria-disabled={!canDeploy}
              title={deployDisabledTitle}
              onClick={() => {
                if (!canDeploy) return;
                submitDeploy();
              }}
              className={canDeploy ? DEPLOY_ON : DEPLOY_DISABLED}
            >
              {pending ? (
                <Loader2
                  className="size-3.5 shrink-0 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Send className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              {pending ? "배포 중…" : `선택 ${count}문항 바로 배포`}
            </button>
          </div>
        </div>
      </div>
      ) : null}
    </div>
  );
}
