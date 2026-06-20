import type {
  WholePassageTransformMode,
  VariantDirection,
} from "@/lib/passage-transform/schema";

/**
 * 문제생성 워크스페이스와 동일한 지문 변형 API 클라이언트. 학습지 워크스페이스의
 * AI 문장 변형(PARAPHRASE)·앞 맥락 추가(PREPEND)·변형 지문 생성(전체 변형)에서
 * 공통으로 쓴다. (workspace-passage-row 의 requestTransform 과 같은 계약)
 */
export async function requestPassageTransform(body: {
  mode: "PARAPHRASE" | "PREPEND" | WholePassageTransformMode;
  passageText: string;
  selectedText?: string;
  avoidTexts?: string[];
  sentenceCount?: number;
  direction?: VariantDirection;
}): Promise<{ text: string; note: string; title: string; summary: string }> {
  const res = await fetch("/api/workbench/passage-transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || "AI 변형에 실패했습니다.");
  }
  return {
    text: String(data.text || ""),
    note: String(data.note || ""),
    title: String(data.title || ""),
    summary: String(data.summary || ""),
  };
}
