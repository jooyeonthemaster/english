"use client";

// ============================================================================
// 클래스 스튜디오 워크벤치 — 실전 문제 생성 모달 호스트 (docs/class-studio-spec.md §3.8.8)
//
// PassageGenerateModal(껍데기 — 무수정 재사용) + GenerationConfigPanel(전체
// props, hideGenerateButtons — 생성 CTA 는 모달 푸터 소유) 합성. 상태·배선은
// 전부 useStudioQuestionGen(api)이 소유하고 이 컴포넌트는 조건 렌더 게이트만
// 담당한다 — genModalOpen && modalProps(=activeRow 존재)일 때만 마운트해,
// 껍데기의 언마운트 리셋 계약(showFull 등)을 문제 생성 페이지의
// `genModalOpen && activeRow ? <PassageGenerateModal open …/> : null`
// (generate-page-client.tsx:1718-1720)과 동일하게 유지한다.
//
// configOnly 미사용(§3.8.8 — 스튜디오는 데스크톱 우선, 모바일도 즉시 생성 —
// 생성 페이지 원본과의 유일한 의도적 차이, §3.9v2.7 스펙 명시).
// 포인트 짚어주기(D8)는 배선 완료 — modalProps 에 pickerOpen/onPickerClose/
// picker/appliedPointCount/onPointChipClick/pointCountMissing 6종, panelProps
// 에 onOpenPointPicker/teacherPointCounts 2종이 실려 spread 로 통과한다
// (배선 전부 use-studio-question-gen 소유 — 이 컴포넌트는 JSX 무변경).
// 장문 세트 탭 노출은 패널 내부의 FEATURE_FLAGS.ENABLE_LONG_PASSAGE_SETS
// 게이트 그대로(재호스팅 무접촉).
// ============================================================================

import { GenerationConfigPanel } from "@/app/(director)/director/workbench/generate/generation-config-panel";
import { PassageGenerateModal } from "@/app/(director)/director/workbench/generate/workspace/passage-generate-modal";
import type { StudioQuestionGenApi } from "./use-studio-question-gen";

export interface StudioQuestionGenModalProps {
  api: StudioQuestionGenApi;
}

export function StudioQuestionGenModal({ api }: StudioQuestionGenModalProps) {
  // 닫힘·대상 행 부재 시 완전 언마운트 — 열 때마다 껍데기 내부 상태가 초기화된다.
  if (!api.genModalOpen || !api.modalProps) return null;
  return (
    // headerLabel·sheetOnMobile = 실전 모달 정체성·sm 미만 전면 시트(A6 검수 —
    // 생성 페이지는 두 prop 미전달이라 기존 규격 그대로).
    <PassageGenerateModal
      {...api.modalProps}
      headerLabel="실전 문제 생성"
      sheetOnMobile
    >
      <GenerationConfigPanel {...api.panelProps} />
    </PassageGenerateModal>
  );
}
