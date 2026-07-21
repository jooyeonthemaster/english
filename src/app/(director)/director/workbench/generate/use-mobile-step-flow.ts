"use client";

// 모바일 스텝 플로우(<lg 전용) 클러스터 — generate-page-client.tsx 에서 추출
// (스펙 §Phase A U9). mobileStep 상태, URL(?step=) 동기화(pushState/popstate),
// 인테이크 상태와의 단방향 동기 이펙트, 하단 이전/다음 바 모델
// (mobilePrev/mobileNext/mobileNextHint/boardFixedFooterActive)을 담당한다.
// 코드는 바이트 동일 이동(무회귀) — 캡처만 파라미터 객체로 받는다.

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useIsMobileViewport } from "@/components/workbench/mobile-step-flow";
import { triggerHintGlowWithin } from "@/lib/hint-glow";
import { type MobileStep } from "./generate-page-client-lib";
import {
  isOverrideEmpty,
  overrideHasTypeCounts,
} from "./workspace/workspace-types";
import { type WorkspaceRowsApi } from "./workspace/use-workspace-rows";
import {
  type IntakeTab,
  type IntakeView,
} from "./intake/intake-surface";

interface UseMobileStepFlowParams {
  initialMobileStepRef: MutableRefObject<MobileStep | null>;
  initialPassageIdsRef: MutableRefObject<string[]>;
  setWorkspaceOpen: Dispatch<SetStateAction<boolean>>;
  setIntakeView: Dispatch<SetStateAction<IntakeView>>;
  workspaceVisible: boolean;
  workspaceActive: boolean;
  intakeView: IntakeView;
  intakeTab: IntakeTab;
  pasteBoard: { count: number; busy: boolean };
  pasteStartRef: MutableRefObject<(() => void) | null>;
  selectedIds: Set<string>;
  handleLoadSelectedToWorkspace: () => Promise<void>;
  workspaceApi: WorkspaceRowsApi;
  workspaceRowStats: Map<string, { questions: number; creditCost: number }>;
  handleWorkspaceGenerate: (targetLocalId?: string) => Promise<void>;
  queueCounts: { generating: number; done: number; error: number };
}

export function useMobileStepFlow({
  initialMobileStepRef,
  initialPassageIdsRef,
  setWorkspaceOpen,
  setIntakeView,
  workspaceVisible,
  workspaceActive,
  intakeView,
  intakeTab,
  pasteBoard,
  pasteStartRef,
  selectedIds,
  handleLoadSelectedToWorkspace,
  workspaceApi,
  workspaceRowStats,
  handleWorkspaceGenerate,
  queueCounts,
}: UseMobileStepFlowParams) {
  // 모바일(<lg) 현재 스텝 — PC 렌더링에는 관여하지 않는다.
  const [mobileStep, setMobileStep] = useState<MobileStep>(
    initialMobileStepRef.current ??
      (initialPassageIdsRef.current.length > 0 ? "library" : "input"),
  );

  // ── 모바일 스텝 플로우: 전환 + URL(?step=) 동기화 ──
  const isMobileViewport = useIsMobileViewport();

  // 스텝이 가리키는 인테이크 상태를 함께 맞춘다. results 는 하단 결과
  // 섹션만 보여주므로 인테이크 상태를 건드리지 않는다(뒤로가면 그대로 복귀).
  const applyMobileStep = useCallback((step: MobileStep) => {
    setMobileStep(step);
    if (step === "input") {
      setWorkspaceOpen(false);
      setIntakeView("intake");
    } else if (step === "library") {
      setWorkspaceOpen(false);
      setIntakeView("library");
    } else if (step === "workspace") {
      setWorkspaceOpen(true);
    }
  }, []);

  const pushMobileStepUrl = useCallback((step: MobileStep) => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("step") === step) return;
    url.searchParams.set("step", step);
    // router.push 대신 네이티브 pushState — 서버 리페치 없이 히스토리만
    // 쌓아 브라우저 뒤로가기가 '이전 단계'로 동작하게 한다.
    window.history.pushState(null, "", url.toString());
  }, []);

  const goToMobileStep = useCallback(
    (step: MobileStep) => {
      applyMobileStep(step);
      pushMobileStepUrl(step);
      window.scrollTo({ top: 0 });
    },
    [applyMobileStep, pushMobileStepUrl],
  );

  // 브라우저 뒤로/앞으로 — URL 의 step 을 그대로 적용.
  useEffect(() => {
    if (!isMobileViewport) return;
    const onPop = () => {
      const raw = new URLSearchParams(window.location.search).get("step");
      const step: MobileStep =
        raw === "library" || raw === "workspace" || raw === "results"
          ? raw
          : "input";
      applyMobileStep(step);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isMobileViewport, applyMobileStep]);

  // 기존 UI 동작('다음으로' CTA, 워크스페이스 자동 열림/닫힘 등)이
  // intakeView/workspaceOpen 을 바꾸면 스텝을 뒤따라 맞춘다 — 스텝을 모르는
  // 기존 핸들러를 하나도 고치지 않기 위한 단방향 동기화. results 에서는
  // 인테이크 상태가 화면 밖(숨김)이므로 동기화하지 않는다.
  useEffect(() => {
    if (!isMobileViewport) return;
    if (mobileStep === "results") return;
    const derived: MobileStep = workspaceVisible
      ? "workspace"
      : intakeView === "library"
        ? "library"
        : "input";
    if (derived !== mobileStep) {
      setMobileStep(derived);
      pushMobileStepUrl(derived);
      window.scrollTo({ top: 0 });
    }
  }, [
    isMobileViewport,
    workspaceVisible,
    intakeView,
    mobileStep,
    pushMobileStepUrl,
  ]);

  // ── 모바일 하단 이전/다음 바 구성 ──
  const mobilePrev =
    mobileStep === "input"
      ? null
      : {
          label: "이전",
          onClick: () =>
            goToMobileStep(
              mobileStep === "library"
                ? "input"
                : mobileStep === "workspace"
                  ? "library"
                  : workspaceActive
                    ? "workspace"
                    : "library",
            ),
        };
  // 워크스페이스 스텝: 이번 세션에 생성(중/완료/오류)된 문제가 하나라도 있어야
  // '문제 확인'이 의미 있다. 없으면 하단 CTA 를 비활성으로 눌러 '다음으로(유형선택)'
  // 으로 먼저 생성하도록 유도한다(결과로의 이동 자체는 상단 스텝 헤더 4번 탭으로
  // 언제든 가능 — 자유 이동은 막지 않는다).
  const hasSessionQuestions =
    queueCounts.done > 0 ||
    queueCounts.generating > 0 ||
    queueCounts.error > 0;
  // 담긴 지문 중 '유형이 설정된'(=생성 대기) 지문 수·문제 수 — 모바일 '문제 확인'
  // 버튼이 담긴 전 지문을 일괄 생성할지, 결과만 볼지 판단하는 데 쓴다.
  const workspacePending = (() => {
    let rows = 0;
    let questions = 0;
    for (const row of workspaceApi.rows) {
      const st = workspaceRowStats.get(row.localId);
      if (st && st.questions > 0) {
        rows += 1;
        questions += st.questions;
      }
    }
    return { rows, questions };
  })();
  const mobileNext = (() => {
    if (mobileStep === "input") {
      // 직접 입력 탭에 등록할 지문이 쌓여 있으면 '다음' = 등록하고 내 지문함
      // (콘텐츠 안의 '다음으로 (내 지문함)' 버튼을 하단 바로 옮긴 것 — 등록
      // 성공 시 intakeView 가 library 로 바뀌며 스텝이 자동으로 넘어간다).
      if (intakeTab === "paste" && intakeView === "intake" && pasteBoard.count > 0)
        return {
          label: pasteBoard.busy
            ? "등록 중…"
            : `다음으로 (내 지문함) · 지문 ${pasteBoard.count}개`,
          onClick: () => pasteStartRef.current?.(),
          disabled: pasteBoard.busy,
        };
      return {
        label: "내 지문함으로",
        onClick: () => goToMobileStep("library"),
      };
    }
    if (mobileStep === "library") {
      // 선택한 지문이 있으면 '다음'이 곧 워크스페이스 담기 — PC 의
      // '편집(워크스페이스로)' 버튼과 같은 핸들러를 쓴다. 담기 성공 시
      // workspaceOpen 이 켜지고 동기화 효과가 스텝을 넘긴다.
      if (selectedIds.size > 0)
        return {
          label: `선택 ${selectedIds.size}개 워크스페이스로`,
          onClick: () => void handleLoadSelectedToWorkspace(),
        };
      if (workspaceActive)
        return {
          label: "워크스페이스로",
          onClick: () => goToMobileStep("workspace"),
        };
      // 비활 사유 = 선택 0개 → 눌러도 막지 말고 지문 카드들을 글로우해 선택을 유도.
      return {
        label: "워크스페이스로",
        disabled: true,
        onDisabledHint: () =>
          triggerHintGlowWithin(document.body, "[data-drag-item-id]", {
            max: 24,
            // 대상이 화면 밖일 수 있으니 하단 고정 바에 가리지 않게 가운데로 스크롤.
            scrollBlock: "center",
          }),
      };
    }
    if (mobileStep === "workspace") {
      const totalWorkspaceRows = workspaceApi.rows.length;
      // ① 담긴 지문 중 하나라도 유형이 있으면 → 생성 준비 단계. 단 '모든' 담긴
      //    지문이 각각 유형을 담아야 활성(사용자 요청). 활성 시 담긴 전 지문을 한 번에
      //    일괄 생성한 뒤 각 typeCounts 를 비우고(재생성 방지) 결과 스텝으로 이동한다.
      if (workspacePending.rows > 0) {
        if (workspacePending.rows === totalWorkspaceRows)
          return {
            label: `${workspacePending.rows}개 지문 문제 생성 (${workspacePending.questions}문제)`,
            onClick: () => {
              void handleWorkspaceGenerate();
              workspaceApi.rows.forEach((row) => {
                if (row.override && overrideHasTypeCounts(row.override)) {
                  const next = { ...row.override, typeCounts: {} };
                  workspaceApi.setOverride(
                    row.localId,
                    isOverrideEmpty(next) ? null : next,
                  );
                }
              });
              goToMobileStep("results");
            },
          };
        // 일부 지문만 유형을 담음 → 비활성. 눌러도 막지 말고 지문 행들을 글로우해
        // 남은 지문에도 유형을 담도록 유도한다.
        const remaining = totalWorkspaceRows - workspacePending.rows;
        return {
          label: `${remaining}개 지문에 유형을 더 담아주세요`,
          disabled: true,
          onDisabledHint: () =>
            triggerHintGlowWithin(
              document.body,
              '[data-generate-tour="row-generate-button"]',
              { scrollBlock: "center" },
            ),
        };
      }
      // ② 담긴 유형은 없지만 이미 생성물이 있으면 → 결과 보기.
      if (hasSessionQuestions)
        return {
          label: queueCounts.generating > 0 ? "문제 확인 (생성 중)" : "문제 확인",
          onClick: () => goToMobileStep("results"),
        };
      // ③ 아무 지문도 유형 설정이 안 됐고 생성물도 없음 → 비활성. 눌러도 막지 말고
      //    지문별 '유형선택하고 지문 담기' 버튼들을 글로우해 유형 담기를 유도한다.
      return {
        label: "문제 확인",
        disabled: true,
        onDisabledHint: () =>
          triggerHintGlowWithin(
            document.body,
            '[data-generate-tour="row-generate-button"]',
            // 생성 버튼이 긴 지문 아래·고정 바 뒤에 가려질 수 있으니 가운데로 스크롤.
            { scrollBlock: "center" },
          ),
      };
    }
    return null;
  })();
  const mobileNextHint =
    mobileStep === "library" && selectedIds.size === 0 && !workspaceActive
      ? "지문 카드를 선택하면 워크스페이스로 보낼 수 있어요"
      : // 워크스페이스 안내는 하단 '담긴 유형' 장바구니 바가 대신하므로 힌트 생략.
        undefined;

  // 파일업로드·직접입력·기출 탭(지문 입력 스텝)에서는 각 보드가 자체 하단 고정
  // 액션 바(담긴 지문 + 추출/등록/담기 버튼)를 렌더하므로, 중복되는 공용 스텝 네비를
  // 숨기고 그 높이만큼 아래 여백을 예약한다(고정 바에 콘텐츠가 가리지 않게).
  const boardFixedFooterActive =
    mobileStep === "input" &&
    intakeView === "intake" &&
    (intakeTab === "upload" || intakeTab === "paste" || intakeTab === "exam");

  return {
    isMobileViewport,
    mobileStep,
    goToMobileStep,
    mobilePrev,
    mobileNext,
    mobileNextHint,
    boardFixedFooterActive,
    workspacePending,
  };
}
