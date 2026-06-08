"use client";

import { useState, useCallback } from "react";
import { notifyCreditsChanged } from "@/lib/credits-client";
import type { PassageAnalysisData } from "@/types/passage-analysis";

interface UsePassageAnalysisOptions {
  passageId: string;
  initialAnalysis?: PassageAnalysisData | null;
}

interface UsePassageAnalysisReturn {
  analysis: PassageAnalysisData | null;
  isLoading: boolean;
  error: string | null;
  generate: () => Promise<void>;
}

export function usePassageAnalysis({
  passageId,
  initialAnalysis = null,
}: UsePassageAnalysisOptions): UsePassageAnalysisReturn {
  const [analysis, setAnalysis] = useState<PassageAnalysisData | null>(
    initialAnalysis
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (analysis) return; // Already have analysis
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/ai/passage-analysis/${passageId}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || "학습지 생성 중 오류가 발생했습니다."
        );
      }

      const result = await response.json();
      setAnalysis(result.data);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "알 수 없는 오류가 발생했습니다.";
      setError(message);
    } finally {
      setIsLoading(false);
      notifyCreditsChanged(); // 차감/실패환급 즉시 사이드바 반영
    }
  }, [passageId, analysis, isLoading]);

  return { analysis, isLoading, error, generate };
}
