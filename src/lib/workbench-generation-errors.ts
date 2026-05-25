export function getFriendlyQuestionGenerationError(
  message: string | undefined,
  questionType?: string | null,
): string {
  const raw = (message || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return "문제 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (lower.includes("insufficient credits")) {
    return "크레딧이 부족해서 문제를 생성하지 못했습니다. 충전 후 다시 시도해 주세요.";
  }

  if (lower.includes("authentication") || lower.includes("unauthorized")) {
    return "로그인이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.";
  }

  if (lower.includes("passage not found")) {
    return "선택한 지문을 찾을 수 없습니다. 지문 목록을 새로고침한 뒤 다시 시도해 주세요.";
  }

  if (lower.includes("transaction not found") || lower.includes("timeout")) {
    return "저장 처리 시간이 길어져 실패했습니다. 잠시 후 다시 생성해 주세요.";
  }

  if (
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("429")
  ) {
    return "AI 요청이 잠시 몰려 생성하지 못했습니다. 조금 뒤 다시 시도해 주세요.";
  }

  if (lower.includes("no questions generated")) {
    if (questionType === "IRRELEVANT") {
      if (
        lower.includes("irrelevant-too-unrelated") ||
        lower.includes("irrelevant-weak-local-trap")
      ) {
        return "새로 넣은 무관한 문장이 지문과 너무 동떨어져 보여서 폐기했습니다. 같은 주제의 표현을 더 섞어 다시 생성해 주세요.";
      }
      if (
        lower.includes("irrelevant-source-not-verbatim") ||
        lower.includes("irrelevant-source-window") ||
        lower.includes("irrelevant-source-first-sentence")
      ) {
        return "원문 문장을 그대로 보존하지 못한 후보를 폐기했습니다. 다시 생성하면 원문 첫 문장은 본문으로 두고, 두 번째 문장부터 선지로 재시도합니다.";
      }
      if (
        lower.includes("irrelevant-index-edge") ||
        lower.includes("postprocess")
      ) {
        return "무관한 문장 위치가 첫/마지막 선지 쪽으로 잡혀 후보를 폐기했습니다. 다시 생성해 주세요.";
      }
      if (lower.includes("model")) {
        return "AI 응답 형식이 맞지 않아 문제로 저장하지 못했습니다. 다시 생성해 주세요.";
      }
      return "무관한 문장 후보가 품질 기준을 통과하지 못했습니다. 다시 생성하면 실패 사유를 더 정확히 기록합니다.";
    }

    return "생성된 문제가 품질 기준을 통과하지 못했습니다. 다시 생성하거나 난이도/조건을 조금 낮춰 보세요.";
  }

  if (lower.includes("irrelevant_slot_count_too_high")) {
    return "무관한 문장 선택지 수가 지문 길이에 비해 많습니다. 선택지 수를 줄여 주세요.";
  }

  return "문제 생성 중 오류가 발생했습니다. 조건을 조금 조정한 뒤 다시 시도해 주세요.";
}
