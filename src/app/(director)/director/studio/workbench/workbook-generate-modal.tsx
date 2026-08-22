"use client";

// ============================================================================
// 클래스 스튜디오 워크벤치 — 「학습지 만들기」 모달
// (docs/class-studio-spec.md §3.10.19 E19-3 — 이 절이 정본)
//
// §3.8.7 / §3.9v2.6(D7) 의 본문 계약(role="checkbox" 7모듈 그리드 ·
// data-workbook-module · selectionCost/PriceBadge 섹션 종량제 · 실전 문제(exam)
// 상호배타 특례 · CTA 「지문 N개 생성 시작」)은 E19-0 무효화 조항으로 **전량
// 폐기**됐다. 생성 단위는 이제 **학습지 3상품 라디오**(기본 / 실전 학습지 포함 /
// 파이널 원페이지)이고, 정본은 lib/studio/sheet-products.ts 한 곳뿐이다
// (라벨·부제·단가를 여기서 다시 적으면 학습지 생성 페이지와 갈려 같은 상품이
// 다른 물건으로 보인다 — 임의 숫자·임의 문구 금지).
//
// **셸 규격은 그대로 승계**한다(무효화 조항이 명시): fixed inset-0 z-50 +
// slate-900/40 backdrop-blur-[2px] + max-w-[1200px] 카드 + sm 미만 전면 시트화 +
// 헤더 지문 팝오버(다지문 목록 아코디언 / 1지문 전문) + aria-disabled CTA 관용구.
// 파일 경로·export 이름·props 8개 시그니처도 불변이다(오케스트레이터 배선 무접촉).
//
// 로직 계약(§3.10.19 E19-2 — **표기 가격과 실제 청구의 일치가 계약**):
//   · 오픈(마운트) 1회 getStudioSheetStates 배치 조회 — passages 는 열림 동안
//     불변(오케스트레이터 계약 — 인라인 배열 전달 금지, §3.8.11 함정 2).
//   · 발사 대상 = !analyzing && (상품이 국어를 허용 || !korean).
//     국어 지문 + practice/final 은 fast 라우트가 400 으로 막는다 — 표기에서부터
//     제외해야 "돈은 냈는데 기본만 나왔다"가 생기지 않는다.
//   · 단가 = basic 은 basicCached 지문에서 0(라우트 캐시 단락 술어의 미러),
//     practice/final 은 **항상** 과금(라우트가 캐시 단락을 건너뛴다 — 보유 중이라고
//     0으로 적으면 거짓 견적).
// 발사: queueApi.launchSheets(targets, variant, classId) 단일 경로
// (targetSections 는 큐 엔진이 싣지 않는다 — E19-1). 성공 시 onLaunched().
// CTA 라벨 정본(E19-3): 학습지 생성 / 지문 N개 바로 준비하기 / {상품명} · 지문 N개 생성.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { StudioClassRow } from "@/actions/studio/classes";
import {
  getStudioSheetStates,
  type StudioSheetState,
} from "@/actions/studio/worksheets";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import {
  LearningSheetPreviewModal,
  type LearningSheetVariant,
} from "@/components/workbench/passage-registration/learning-sheet-preview-modal";
import { triggerHintGlowWithin } from "@/lib/hint-glow";
import {
  STUDIO_SHEET_PRODUCTS,
  STUDIO_SHEET_PRODUCT_BY_ID,
  type StudioSheetProduct,
  type StudioSheetVariant,
} from "@/lib/studio/sheet-products";
import type { StudioQueueApi } from "./use-studio-queue";

export interface WorkbookModalPassage {
  id: string;
  title: string;
  content: string;
}

/** 시트(ModuleSelectSheetProps)와 동일 시그니처 — 통합자가 그대로 배선한다. */
export interface WorkbookGenerateModalProps {
  open: boolean;
  onClose: () => void;
  passages: WorkbookModalPassage[];
  /** 클래스 목록 — selectedClassId → 표시명 해석 전용(헤더 읽기 전용 칩) */
  classes: StudioClassRow[];
  /** 스텝 1에서 확정된 대상 클래스 — 발사 스탬프에 실린다 */
  selectedClassId: string | null;
  /**
   * @deprecated §3.10.19 E19-10 — 모달의 클래스 셀렉트가 폐기되면서 **호출되지
   * 않는다**. 오케스트레이터 배선(studio-home-client.tsx)을 건드리지 않으려고
   * 시그니처만 남긴다. 되살리지 말 것: 이 콜백은 selectClass 라서 모달 안에서
   * 부르면 뒤에서 지문 목록·로스터가 다시 로드돼 방금 고른 선택이 갈린다.
   */
  onSelectClass: (classId: string | null) => void;
  queueApi: StudioQueueApi;
  /** 발사 성공 — 오케스트레이터가 모달을 닫고 도크를 펼친다 */
  onLaunched: () => void;
}

export function WorkbookGenerateModal(props: WorkbookGenerateModalProps) {
  // 닫힘 = 본체 언마운트 — 열릴 때마다 선택·조회 상태가 새로 시작되므로
  // 직전 발사의 상품이 남아 오발사되는 일도, 이펙트 내 동기 리셋도 없다.
  // (훅 규칙 회피 2단 구조 — 시트 정본 계승, §3.8.7)
  if (!props.open) return null;
  return <WorkbookModalBody {...props} />;
}

/**
 * 상품별 발사 견적(§3.10.19 E19-2) — 카드 캡션·요약 스트립·CTA 가 **같은 한 벌**을
 * 읽는다. 카드가 「국어 K개 제외」라고 적었는데 총액은 전 지문분이면 그 순간
 * 표기와 청구가 갈린다 — 계산을 한 곳에 모으는 것이 그 방지책이다.
 */
interface SheetPlan {
  product: StudioSheetProduct;
  /** 실제로 발사할 지문(= 과금 대상) */
  targets: WorkbookModalPassage[];
  totalCredits: number;
  /** basic 전용 — 저장본 단락으로 무과금이 되는 지문 수 */
  cachedCount: number;
  /** practice/final 전용 — 상품 미지원으로 빠지는 국어 지문 수 */
  koreanExcluded: number;
  /** 전 지문이 국어 = 이 상품으로 만들 수 있는 지문이 하나도 없다 */
  disabled: boolean;
}

function WorkbookModalBody({
  onClose,
  passages,
  classes,
  selectedClassId,
  // onSelectClass 는 의도적으로 구조분해하지 않는다(E19-10 — 폐기된 콜백).
  queueApi,
  onLaunched,
}: WorkbookGenerateModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // 초기 선택은 basic 고정(E19-3 마지막 문단) — 학습지 생성 페이지의 localStorage
  // 키(smoat:passages-create:sheet-variant)를 **공유하지 않는다**. 다른 표면의
  // 마지막 선택이 스튜디오의 과금 조작으로 새면 안 된다(표면 간 상태 누출 금지).
  const [variant, setVariant] = useState<StudioSheetVariant>("basic");
  const [states, setStates] = useState<StudioSheetState[] | null>(null);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // 지문 1개일 때 헤더 제목 토글 → 본문 전문 팝오버(passage-generate-modal 관용구).
  // 닫힘 = 본체 언마운트라 별도 리셋 이펙트가 필요 없다.
  const [showFull, setShowFull] = useState(false);
  // 다지문 지문 목록 팝오버(§3.9v2.6) — 1지문 셀렉터 팝오버의 일반화.
  // listOpen = 목록 팝오버, previewId = 목록 안에서 본문을 펼친 지문(아코디언).
  const [listOpen, setListOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  // 「실제 생성 예시 보기」 — 실제 생성 데이터로 만든 학습지 미리보기(z-[70]).
  const [previewOpen, setPreviewOpen] = useState(false);
  // 발사 직후 CTA 를 「생성 중…」으로 잠가 닫힘(언마운트)까지의 짧은 틈에
  // 연타 재발사를 막는다 — 닫힘 = 언마운트라 리셋 불필요.
  const [launching, setLaunching] = useState(false);

  // 오픈(마운트) 시 1회 배치 조회(E19-2) — passages 는 열림 동안 불변
  // (오케스트레이터 계약). reloadKey 는 오류 시 「다시 불러오기」 재시도용.
  useEffect(() => {
    const ids = passages.map((p) => p.id);
    if (ids.length === 0) return;
    let cancelled = false;
    getStudioSheetStates({ passageIds: ids })
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) setStates(res.data);
        else setStatesError(res.error ?? "지문 상태를 불러오지 못했습니다.");
      })
      .catch(() => {
        if (!cancelled)
          setStatesError("네트워크 오류로 지문 상태를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [passages, reloadKey]);

  // 접근성: ESC 3중 사다리(E19-3) — 미리보기(z-[70]) → 헤더 팝오버(다지문 목록·
  // 1지문 전문) → 모달 닫기. 미리보기 모달은 자체 keydown 리스너가 **없어**
  // (learning-sheet-preview-modal.tsx) 이 사다리가 유일한 게이트다: 이게 없으면
  // 미리보기를 닫으려던 Esc 한 번에 모달 전체가 닫혀 선택·조회가 통째로 날아간다.
  // 첫 포커스는 닫기 버튼.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (previewOpen) {
        setPreviewOpen(false);
        return;
      }
      if (listOpen) {
        setListOpen(false);
        return;
      }
      if (showFull) {
        setShowFull(false);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, previewOpen, listOpen, showFull]);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const loaded = states !== null;
  const stateById = useMemo(
    () => new Map((states ?? []).map((s) => [s.passageId, s])),
    [states],
  );

  // analyzing 지문 = 발사 제외 대상 — 안내 스트립으로 고지한다(§3.8.7 승계).
  const analyzingCount = useMemo(
    () => passages.filter((p) => stateById.get(p.id)?.analyzing === true).length,
    [passages, stateById],
  );

  // 3상품 견적 일괄 산출. 상태 미로딩 구간에서는 stateById 가 비어 낙관적으로
  // (전 지문 발사 가능·전액 과금) 계산된다 — 요약 스트립이 「계산 중」을 띄우고
  // CTA 도 !loaded 로 잠기므로 이 값이 화면에 확정처럼 보이지는 않는다.
  const plans = useMemo<SheetPlan[]>(
    () =>
      STUDIO_SHEET_PRODUCTS.map((product) => {
        const targets = passages.filter((p) => {
          const s = stateById.get(p.id);
          if (s?.analyzing === true) return false;
          return product.koreanSupported || s?.korean !== true;
        });
        const koreanExcluded = product.koreanSupported
          ? 0
          : passages.filter((p) => stateById.get(p.id)?.korean === true).length;
        // basic 만 저장본 단락(무과금)이 성립한다. 상태를 못 받은 지문은
        // basicCached=false 취급 = 전액 표기 — 견적이 실청구보다 낮으면 안 된다.
        const cachedCount =
          product.id === "basic"
            ? targets.filter(
                (p) => stateById.get(p.id)?.basicCached === true,
              ).length
            : 0;
        const totalCredits = targets.reduce(
          (sum, p) =>
            product.id === "basic" &&
            stateById.get(p.id)?.basicCached === true
              ? sum
              : sum + product.unitCost,
          0,
        );
        return {
          product,
          targets,
          totalCredits,
          cachedCount,
          koreanExcluded,
          // 상태 로드 전에는 잠그지 않는다 — 미로딩 = korean 미상이라 섣부른
          // 비활은 카드가 켜졌다 꺼지는 깜빡임이 된다.
          //
          // 축은 **국어**뿐이다(§3.10.19 E19-3 — "전 지문이 국어면"). 구 술어
          // targets.length === 0 은 analyzing 까지 빨아들여, 전 지문이 분석 중일
          // 때 실전·파이널이 사유 없이 잠겼다: 그 순간 koreanExcluded === 0 이라
          // 카드 캡션도 안 붙어 화면에 잠긴 이유가 한 마디도 없었다. analyzing
          // 사유는 상단 파란 스트립("분석이 진행 중인 지문 N개는 제외됩니다")과
          // 푸터 rose 문구가 이미 말하므로 카드까지 잠글 이유가 없다.
          disabled:
            loaded &&
            !product.koreanSupported &&
            passages.length > 0 &&
            passages.every((p) => stateById.get(p.id)?.korean === true),
        };
      }),
    [passages, stateById, loaded],
  );
  const planById = useMemo(
    () => new Map(plans.map((pl) => [pl.product.id, pl])),
    [plans],
  );
  // variant 는 3상품 중 하나이고 plans 는 3상품 전량이라 항상 존재한다.
  const active = planById.get(variant)!;
  const targetCount = active.targets.length;
  const totalCredits = active.totalCredits;

  const handleLaunch = useCallback(() => {
    if (!loaded) return;
    const plan = planById.get(variant);
    if (!plan || plan.targets.length === 0) return;
    const { launched, skipped } = queueApi.launchSheets(
      plan.targets.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
      })),
      variant,
      selectedClassId,
    );
    if (skipped.length > 0) {
      toast.info(`분석이 이미 진행 중이라 제외했습니다: ${skipped.join(", ")}`);
    }
    if (launched > 0) {
      // 총액 0 = 전량 basicCached — 서버가 캐시 단락으로 즉시 COMPLETED 해서 큐가
      // 1초도 돌지 않고 도크에도 스쳐가듯 지나간다(라우트 캐시 단락의 미러가
      // basicCached 다). 그러면 사용자에겐 「아무 일도 안 일어났다」로 읽히므로
      // 착지를 토스트로 못박는다. 유료 발사(총액>0)는 큐 스트립이 진행을 계속
      // 말하므로 토스트를 얹지 않는다 — 같은 사실의 이중 고지는 소음이다.
      if (plan.totalCredits === 0) {
        toast.success(`지문 ${launched}개의 학습지를 바로 준비했어요`);
      }
      setLaunching(true);
      onLaunched();
    } else if (skipped.length === 0)
      toast.error("생성을 시작할 지문이 없습니다.");
  }, [loaded, planById, variant, queueApi, selectedClassId, onLaunched]);

  const launchDisabled = !loaded || targetCount === 0;
  // CTA 라벨 정본(E19-3 확정) — 변형 금지.
  const launchLabel =
    !loaded || targetCount === 0
      ? "학습지 생성"
      : totalCredits === 0
        ? `지문 ${targetCount}개 바로 준비하기`
        : `${active.product.label} · 지문 ${targetCount}개 생성`;
  // 선택은 항상 1개라 "모듈 0개" 사유는 사라졌지만, analyzing 전량 제외로 발사분이
  // 0이 되는 경로는 남는다 — 구 푸터 캡션 행의 사유 고지 계약을 이 자리로 승계.
  // (국어 전량 제외는 해당 카드 캡션이 이미 말하므로 중복 고지하지 않는다.)
  const noTargetByAnalyzing = loaded && targetCount === 0 && analyzingCount > 0;

  // 지문 1개면 헤더에 제목 토글(전문 팝오버) — 어떤 지문의 학습지인지 즉시 식별.
  const singlePassage = passages.length === 1 ? passages[0] : null;

  // 대상 클래스 표시명(§3.10.19 E19-10) — 셀렉트를 폐기하고 읽기 전용 칩으로만
  // 확인시킨다. 스텝 게이트상 이 모달은 클래스 선택 이후에만 열리므로 부재는
  // 사실상 도달 불가지만, 도달하면 칩을 렌더하지 않는다(거짓 표기 금지).
  const targetClassName =
    classes.find((c) => c.id === selectedClassId)?.name ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 중앙 카드 — sm 미만은 전면 시트화(mx-0 my-0 rounded-none h-full).
          폭 940(§3.10.19 E19-10): 구 1200 은 7모듈 3열 그리드를 담던 값이라
          3상품 라디오에는 과하게 넓어 "넓고 납작한 바"로 읽혔다. 940/820 실측
          비교로 940 확정 — 820 은 카드 부제가 한 칸 더 접혀 어절이 쪼개진다. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="학습지 만들기"
        className="relative z-10 mx-0 my-0 flex h-full w-full max-w-[940px] flex-col overflow-hidden rounded-none border border-slate-200 bg-white shadow-2xl transition-[max-width] duration-300 ease-out sm:mx-4 sm:my-4 sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl"
      >
        {/* ── 헤더: 아이콘 + 제목 + 대상 클래스 칩 + 지문 칩(다지문 = 목록
            팝오버) + 닫기. 클래스 칩은 **읽기 전용**(E19-10) — 바꾸는 자리는
            스텝 1(대상)뿐이다. ── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3.5">
          <FileText
            className="size-4 shrink-0 text-blue-600"
            aria-hidden="true"
          />
          <h2 className="shrink-0 text-[14px] font-bold text-slate-900">
            학습지 만들기
          </h2>
          {targetClassName ? (
            <span
              title="스텝 1에서 고른 대상 클래스입니다"
              className="inline-flex h-[18px] max-w-[160px] shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 text-[10.5px] font-semibold text-slate-600"
            >
              <Users className="size-2.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{targetClassName}</span>
            </span>
          ) : null}
          {singlePassage ? (
            <span className="inline-flex h-[18px] shrink-0 items-center rounded-full border border-blue-100 bg-blue-50 px-2 text-[10.5px] font-semibold text-blue-700 tabular-nums">
              지문 1개
            </span>
          ) : (
            // 다지문: 칩 자체가 목록 팝오버 트리거(§3.9v2.6 — 1지문 셀렉터의
            // 일반화). 행 클릭 = 해당 지문 본문 아코디언 펼침.
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setListOpen((v) => !v)}
                aria-expanded={listOpen}
                title="클릭하면 지문 목록을 볼 수 있어요"
                className="inline-flex h-[18px] cursor-pointer items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 text-[10.5px] font-semibold text-blue-700 tabular-nums transition-colors hover:bg-blue-100"
              >
                지문 {passages.length}개
                <ChevronDown
                  className={`size-3 shrink-0 transition-transform ${
                    listOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
              {listOpen ? (
                <>
                  {/* 팝오버 밖 클릭 = 팝오버만 닫힘 — 투명 백드롭(팝오버 z-20
                      아래 z-10, exam-paper-builder 바깥 탭 닫힘 관용구). */}
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    onClick={() => setListOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute left-0 top-full z-20 mt-2 max-h-[50vh] w-[min(560px,calc(100vw-3rem))] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                    <ul className="divide-y divide-slate-100">
                      {passages.map((p) => {
                        const openRow = previewId === p.id;
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewId((v) => (v === p.id ? null : p.id))
                              }
                              aria-expanded={openRow}
                              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                            >
                              <FileText
                                className="size-3.5 shrink-0 text-blue-500"
                                aria-hidden="true"
                              />
                              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-800">
                                {p.title}
                              </span>
                              <ChevronDown
                                className={`size-3.5 shrink-0 text-slate-400 transition-transform ${
                                  openRow ? "rotate-180" : ""
                                }`}
                                aria-hidden="true"
                              />
                            </button>
                            {openRow ? (
                              <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-2.5">
                                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
                                  {p.content}
                                </p>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>
          )}
          {singlePassage && (
            <div className="relative min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setShowFull((v) => !v)}
                aria-expanded={showFull}
                title="클릭하면 지문 전문을 볼 수 있어요"
                className="inline-flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 transition-colors hover:bg-slate-100"
              >
                <FileText
                  className="h-4 w-4 shrink-0 text-blue-500"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-left text-[14.5px] font-semibold text-slate-900">
                  {singlePassage.title}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                    showFull ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
              {showFull ? (
                <>
                  {/* 팝오버 밖 클릭 = 팝오버만 닫힘 — 목록 팝오버와 동형 백드롭 */}
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    onClick={() => setShowFull(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
                      {singlePassage.content}
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1 ml-auto flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── 본문: 생성 설정 패널 리듬(§3.9v2.6) — 상단 스트립부 + 본체부 ── */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">
          {/* 상단부: 상태 안내 + 요약 스트립 (px-4 pt-4 pb-3) */}
          <div className="space-y-2.5 px-4 pt-4 pb-3">
            {statesError !== null && (
              <div className="rounded-md border border-rose-100 bg-rose-50/60 px-2.5 py-2">
                <p className="break-keep text-[11px] leading-4 text-rose-600">
                  {statesError}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStatesError(null);
                    setReloadKey((k) => k + 1);
                  }}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                >
                  <RefreshCw className="size-3" />
                  다시 불러오기
                </button>
              </div>
            )}
            {loaded && analyzingCount > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-2.5 py-2">
                <Loader2
                  className="mt-0.5 size-3.5 shrink-0 animate-spin text-blue-600"
                  aria-hidden
                />
                <p className="break-keep text-[11px] leading-4 text-blue-700">
                  분석이 진행 중인 지문 {analyzingCount}개는 이번 생성에서
                  제외됩니다.
                </p>
              </div>
            )}

            {/* 요약 스트립 — 생성 패널 「총 N문제」 스트립 문법(§3.9v2.6).
                선택이 항상 1개라 「초기화」는 폐기(끌 수 있는 상태가 없다).
                우측은 「실제 생성 예시 보기」 — 무엇이 나오는지 실물로 보고 고른다. */}
            <div className="flex h-9 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 pl-3 pr-1.5">
              <span className="min-w-0 truncate text-[12px] font-semibold text-slate-700">
                {active.product.label}
                <span className="ml-1 font-medium text-slate-500 tabular-nums">
                  · 지문 {targetCount}개
                </span>
                {/* 3분기 — 발사 대상 0(전부 제외)과 「무과금으로 만든다」는 총액이
                    똑같이 0이라, 2분기 시절엔 만들 게 하나도 없는 상태를 「추가
                    비용 없음」이라는 혜택 문구로 말했다(국어 전량 + 파이널 선택이
                    그 경로다). 대상 0은 값이 아니라 대상의 문제이므로 분리한다.
                    사유(국어 제외·분석 중)는 카드 캡션과 아래 rose 문구가 말하니
                    여기서 되풀이하지 않고 톤도 slate-500 을 유지한다. */}
                <span className="ml-1 font-medium text-slate-500 tabular-nums">
                  {!loaded
                    ? "· 계산 중"
                    : targetCount === 0
                      ? "· 생성할 지문 없음"
                      : totalCredits > 0
                        ? `· 총 ${totalCredits}크레딧`
                        : "· 추가 비용 없음"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
              >
                <Eye className="size-3.5" aria-hidden="true" />
                실제 생성 예시 보기
              </button>
            </div>
            {noTargetByAnalyzing && (
              <p className="break-keep px-0.5 text-[11px] text-rose-600">
                분석 중인 지문을 제외하면 생성할 지문이 없습니다
              </p>
            )}
          </div>

          {/* 본체부: 학습지 구성 그룹 카드 (px-4 py-3 space-y-3)
              ⚠ 「대상 클래스」 셀렉트는 §3.10.19 E19-10 으로 **폐기**됐다(26-08-15
              사용자 지시: "애초에 클래스를 선택한 것이 선행되는데 여기에서 클래스
              선택을 왜 또 하지?"). 두 가지 이유로 셀렉트는 도움이 아니라 함정이었다:
                ① 스텝 게이트상 클래스 선택 없이는 자료 단계에 못 오므로 항상 중복.
                ② onSelectClass = 오케스트레이터 selectClass 라서 모달 안에서 값을
                   바꾸면 뒤에서 loadChildren·loadStudents 가 돌아 **방금 고른 지문
                   목록이 발밑에서 갈린다**(studio-home-client.tsx:370-382).
              대상 클래스는 헤더의 읽기 전용 칩으로만 확인시킨다. */}
          <div className="space-y-3 px-4 py-3">
            {/* 학습지 구성 그룹 카드 — 생성 패널 그룹 카드 문법(§3.9v2.6):
                h-10 슬레이트 헤더 + p-2 그리드. 라디오 카드 토큰은 학습지 생성
                페이지 정본(passage-input-stack.tsx:478-534) 자구 이식 —
                두 표면의 같은 상품이 다르게 보이면 안 된다(§3.10.19 E19-3). */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex h-10 items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-3">
                <span className="text-[12px] font-bold text-slate-700">
                  학습지 구성
                </span>
              </div>
              <div className="p-2">
                <div
                  role="radiogroup"
                  aria-label="학습지 구성 선택"
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                >
                  {plans.map((plan) => {
                    const { product, disabled } = plan;
                    const selected = variant === product.id;
                    // 캡션은 상태 로드 후에만 — 미로딩 구간의 0/전량 값은 사실이
                    // 아니라 추정이고, 가격 문구는 추정으로 적으면 안 된다.
                    const caption = !loaded
                      ? null
                      : product.id === "basic"
                        ? plan.cachedCount > 0
                          ? `${plan.cachedCount}개는 저장본을 불러와 추가 비용 없음`
                          : null
                        : plan.koreanExcluded > 0
                          ? `국어 지문 ${plan.koreanExcluded}개는 이 상품을 지원하지 않아 제외됩니다`
                          : null;
                    // 보유 학습지 덮어쓰기 경고 — **전체 분석 경로는 PRIME pages 를
                    // 통째로 갈아끼운다**(fast/route.ts:1298 `pages: primeReport`,
                    // 파이널은 748행 update). 3중 보존 병합(mergeReportPreservingExtras,
                    // 1113행)은 `plan` 이 있는 **부분 요청에서만** 돈다 — 이 모달의
                    // 발사는 전체 분석이라 그 보존을 타지 않는다. 즉 기존 학습지의
                    // 편집분은 되돌릴 UI 없이 사라진다(E19 가 새로 들여온 파괴 경로).
                    // 값을 내는 일이 아니어서 크레딧 캡션에 섞으면 묻히므로 amber 로
                    // 따로 세운다. 축: basic/practice = hasBasic, final = hasFinal.
                    const overwriteCount = !loaded
                      ? 0
                      : plan.targets.filter((p) =>
                          product.id === "final"
                            ? stateById.get(p.id)?.hasFinal === true
                            : stateById.get(p.id)?.hasBasic === true,
                        ).length;
                    const pick = () => {
                      if (disabled || launching) return;
                      setVariant(product.id);
                    };
                    return (
                      <div
                        key={product.id}
                        role="radio"
                        aria-checked={selected}
                        aria-disabled={disabled || undefined}
                        tabIndex={0}
                        // 글로우·행동 게이트 훅(E19-3) — CTA 비활 클릭 시
                        // triggerHintGlowWithin 이 이 선택자로 카드를 잡는다.
                        data-sheet-variant={product.id}
                        onClick={pick}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            pick();
                          }
                        }}
                        className={`group flex flex-col gap-1 rounded-xl border px-3 py-2.5 transition-all ${
                          disabled
                            ? "cursor-not-allowed border-slate-200 bg-slate-50/50 opacity-70"
                            : selected
                              ? "cursor-pointer border-blue-400 bg-blue-50/60 ring-1 ring-blue-200"
                              : "cursor-pointer border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                        }${
                          // 파이널 카드는 설명이 길어 2열 그리드에서 전폭을 쓴다.
                          product.id === "final" ? " sm:col-span-2" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className={`flex size-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                              selected
                                ? "border-blue-500 bg-blue-500"
                                : disabled
                                  ? "border-dashed border-slate-300 bg-white"
                                  : "border-slate-300 bg-white group-hover:border-slate-400"
                            }`}
                          >
                            {selected ? (
                              <span className="size-1.5 rounded-full bg-white" />
                            ) : null}
                          </span>
                          <span
                            className={`min-w-0 flex-1 truncate text-[12.5px] font-bold ${
                              selected ? "text-blue-800" : "text-slate-700"
                            }`}
                          >
                            {product.label}
                          </span>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                              selected
                                ? "bg-blue-100 text-blue-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            지문당 ◈{product.unitCost}
                          </span>
                        </div>
                        {/* break-keep 필수 — 없으면 940 폭에서 「구문 분/석」
                            처럼 어절 중간이 쪼개진다(실측). */}
                        <p className="break-keep pl-5 text-[11px] leading-snug text-slate-500">
                          {product.subtitle}
                        </p>
                        {caption ? (
                          <p className="break-keep pl-5 text-[10.5px] leading-4 text-slate-400">
                            {caption}
                          </p>
                        ) : null}
                        {/* 회색 캡션과 **함께** 보일 수 있다 — 둘 다 사실이다
                            (저장본 무과금 + 그 저장본을 새로 만들어 덮어씀).
                            순서는 값 얘기(회색) → 잃는 것 얘기(amber). */}
                        {overwriteCount > 0 ? (
                          <p className="break-keep pl-5 text-[10.5px] leading-4 text-amber-600">
                            {overwriteCount}개는 기존 학습지를 새로 만들어
                            덮어씁니다(편집분 소실)
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* ── 푸터: CTA 3부 구성(FileText + 라벨 + CreditCostChip — §3.9v2.6).
            합계는 요약 스트립·CTA 칩이 담당(구 크레딧 캡션 행은 폐지 상태 유지). ── */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-3.5">
          <button
            type="button"
            // aria-disabled 관용구 — 비활처럼 보이되 클릭은 살려, 발사 대상이 0인
            // 상태로 누르면 [data-sheet-variant] 카드들을 글로우해 "다른 구성을
            // 골라 보라"를 유도한다(구 모듈 글로우 계승 — 훅만 교체).
            aria-disabled={launchDisabled || launching}
            onClick={() => {
              if (launching || !loaded) return;
              if (launchDisabled) {
                triggerHintGlowWithin(bodyRef.current, "[data-sheet-variant]");
                return;
              }
              handleLaunch();
            }}
            className={
              "flex h-10 w-full items-center justify-center gap-1.5 rounded-xl px-4 text-[12px] font-bold transition-all duration-200 lg:h-12 lg:gap-2 lg:text-[14.5px] " +
              (launching
                ? "bg-blue-600 text-white shadow-md shadow-blue-200/50"
                : !launchDisabled
                  ? "bg-blue-600 text-white shadow-md shadow-blue-200/50 hover:bg-blue-700 hover:shadow-lg"
                  : "cursor-not-allowed bg-slate-100 text-slate-400")
            }
          >
            {launching ? (
              <>
                <Loader2
                  className="size-3.5 animate-spin lg:size-5"
                  aria-hidden="true"
                />
                <span>생성 중…</span>
              </>
            ) : (
              <>
                <FileText className="size-3.5 lg:size-5" aria-hidden="true" />
                <span>{launchLabel}</span>
                {/* 칩은 활성 + 유료일 때만 — 무료는 라벨(바로 준비하기)이 이미
                    말한다(passage-generate-modal 칩 노출 문법 동일). */}
                {!launchDisabled && totalCredits > 0 ? (
                  <CreditCostChip
                    amount={totalCredits}
                    className="ml-0.5 shrink-0 gap-1 rounded-lg bg-white/20 px-2 py-1 text-[11px] text-white"
                  />
                ) : null}
              </>
            )}
          </button>
        </div>
      </div>

      {/* 실제 학습지 미리보기(z-[70]) — 학습지 생성 페이지와 **같은 컴포넌트**라
          두 표면이 같은 실물을 보여준다. 「이 구성으로 생성하기」는 라디오 선택을
          그대로 갈아끼운다. basicUnitCost 는 정본 단가만 넘긴다(임의 숫자 금지 —
          실전 포함분은 모달이 내부에서 추가분을 더한다). */}
      <LearningSheetPreviewModal
        open={previewOpen}
        initialVariant={variant}
        basicUnitCost={STUDIO_SHEET_PRODUCT_BY_ID.get("basic")!.unitCost}
        onClose={() => setPreviewOpen(false)}
        onApplyVariant={(v: LearningSheetVariant) => {
          // LearningSheetVariant 와 StudioSheetVariant 는 같은 3값의 별개 별칭이라
          // 구조적으로 대입 가능하다(캐스팅 없음 — 한쪽이 늘면 여기서 컴파일 실패).
          //
          // 카드 클릭(pick)과 **같은 게이트**를 건다: 카드는 `if (disabled ||
          // launching) return;` 으로 막는데 이 경로만 무게이트면, 미리보기에서
          // 「이 구성으로 생성하기」로 잠긴 상품을 선택해 CTA 까지 잠긴 막다른
          // 상태에 갇힌다(빠져나올 조작이 화면에 없다). 잠긴 상품이면 선택만
          // 버리고 미리보기는 그대로 닫는다 — 닫기 자체는 사용자가 누른 것이다.
          if (!planById.get(v)?.disabled) setVariant(v);
          setPreviewOpen(false);
        }}
      />
    </div>
  );
}
