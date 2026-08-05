"use client";

import { createContext, useContext } from "react";

// ============================================================================
// 워크스페이스 본문 높이 확장 컨텍스트 — 지문 행이 "비교가 필요한 상태"(AI 변형/
// 앞문단/문장변형 미리보기가 열림)가 되면 본문(--ws-body-h)을 부드럽게 아래로
// 늘려, 새로 생성된 지문과 원문이 동시에 잘 보이게 한다. 미리보기를 닫으면 원래
// 높이로 되돌아간다. Provider 는 WorkspaceShell 이 제공하고, 소비는 지문 행이 한다.
// Provider 밖(예: 학습지 스택)에서는 no-op — 어디서 써도 안전하다.
// ============================================================================

export interface WorkspaceBodyExpansion {
  /** id 로 확장을 요청한다(멱등). 하나라도 요청 중이면 본문이 늘어난다. */
  requestExpand: (id: string) => void;
  /** id 의 확장 요청을 해제한다. */
  releaseExpand: (id: string) => void;
}

const NOOP: WorkspaceBodyExpansion = {
  requestExpand: () => {},
  releaseExpand: () => {},
};

export const WorkspaceBodyContext =
  createContext<WorkspaceBodyExpansion>(NOOP);

export function useWorkspaceBodyExpansion(): WorkspaceBodyExpansion {
  return useContext(WorkspaceBodyContext);
}
