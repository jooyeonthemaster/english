"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { QueuedPassage } from "@/hooks/use-passage-queue";

// ─────────────────────────────────────────────────────────────────────────────
// 학습지 생성 "진행 중" 항목을 상단 워크스페이스 → 하단 학습지 목록으로 전달하는
// 경량 컨텍스트.
//
// 배경: passages/create 는 서버 컴포넌트(page.tsx)가 상단 PassageRegistrationClient
// (워크스페이스 + 분석 큐 엔진)와 하단 PassageListClient(완료된 학습지 목록)를 형제로
// 렌더한다. 둘은 React 상태를 공유하지 않는다. 큐 엔진(usePassageQueue)은 5초 폴링을
// 하므로 같은 cacheKey 로 두 번째 인스턴스를 만들면 그 엔드포인트를 이중 폴링하게 된다
// (과거 egress 폭탄 원인). 그래서 폴러는 상단 한 곳만 두고, 그 큐의 진행중 항목만
// 이 컨텍스트로 발행해 하단이 구독한다 — 이중 폴링 없이 하단 목록에 로딩 큐를 띄운다.
// ─────────────────────────────────────────────────────────────────────────────

interface LearningGenerationContextValue {
  /** 현재 생성(분석) 진행 중(pending|analyzing)인 지문들. */
  generatingItems: QueuedPassage[];
  /** 상단 워크스페이스가 큐의 진행중 항목을 발행한다. */
  publishGeneratingItems: (items: QueuedPassage[]) => void;
}

// Provider 없이 소비해도 안전한 no-op 기본값 — 다른 곳에서 재사용되어도 무회귀.
const LearningGenerationContext = createContext<LearningGenerationContextValue>({
  generatingItems: [],
  publishGeneratingItems: () => {},
});

export function LearningGenerationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [generatingItems, setGeneratingItems] = useState<QueuedPassage[]>([]);
  const publishGeneratingItems = useCallback((items: QueuedPassage[]) => {
    setGeneratingItems(items);
  }, []);
  const value = useMemo(
    () => ({ generatingItems, publishGeneratingItems }),
    [generatingItems, publishGeneratingItems],
  );
  return (
    <LearningGenerationContext.Provider value={value}>
      {children}
    </LearningGenerationContext.Provider>
  );
}

/** 하단 학습지 목록이 진행중 항목을 구독한다. */
export function useLearningGenerationItems(): QueuedPassage[] {
  return useContext(LearningGenerationContext).generatingItems;
}

/** 상단 워크스페이스가 진행중 항목을 발행한다. */
export function useLearningGenerationPublisher() {
  return useContext(LearningGenerationContext).publishGeneratingItems;
}
