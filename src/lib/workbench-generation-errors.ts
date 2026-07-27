export function getFriendlyQuestionGenerationError(
  message: string | undefined,
  questionType?: string | null,
): string {
  const raw = (message || "").trim();
  const lower = raw.toLowerCase();
  const strippedRaw = raw
    .replace(/^IRRELEVANT_SLOT_COUNT_TOO_HIGH[:\s-]*/i, "")
    .trim();
  const hasKoreanUserMessage =
    /[가-힣]/.test(strippedRaw) &&
    strippedRaw.length <= 300 &&
    !/stack trace|prisma|syntaxerror|typeerror|referenceerror/i.test(strippedRaw);

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

  // AI 모델 응답 지연(aborted due to timeout)은 저장 문제가 아니다 — "no questions
  // generated ... Last: model/... timeout" 꼴이 아래 transaction/timeout 분기에
  // 먼저 걸려 "저장 처리 시간" 오표기가 났다(26-07-04 실측, PREMIUM 지연).
  if (
    lower.includes("no questions generated") &&
    lower.includes("aborted due to timeout")
  ) {
    return "AI 응답이 지연되어 시간 안에 생성을 마치지 못했습니다. 다시 생성해 주세요.";
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

    if (lower.includes("grammar-scarce-passage")) {
      return "이 지문에는 어법 문제로 낼 만한 깨끗한 문법 구조가 부족합니다. 다른 지문으로 생성하거나, 밑줄 개수를 줄이거나, 어휘·제목 등 다른 유형을 시도해 보세요.";
    }
    return "생성된 문제가 품질 기준을 통과하지 못했습니다. 다시 생성하거나 난이도/조건을 조금 낮춰 보세요.";
  }

  if (lower.includes("irrelevant_slot_count_too_high")) {
    if (hasKoreanUserMessage) return strippedRaw;
    return "무관한 문장 선택지 수가 지문 길이에 비해 많습니다. 선택지 수를 줄여 주세요.";
  }

  // 유형별 한국어 진단 passthrough — 서버가 이미 강사에게 그대로 보여줄 만한
  // 한국어 사유를 만들어 둔 경우, 일반 문구로 덮어쓰지 않고 그대로 전달한다.
  // (26-07-26) SENTENCE_ORDER 추가: preflightQuestionFeasibility 가
  // "최소 6문장 이상이 필요합니다. 현재 지문은 4문장입니다" 같은 정확한 진단을
  // 만드는데도 IRRELEVANT 하드 게이팅 때문에 아래 일반 문구로 삼켜져,
  // 사용자에게는 원인 없는 "문제 생성 중 오류"만 보이던 실사용 결함의 봉합.
  const KOREAN_PASSTHROUGH_KEYWORDS: Record<string, readonly string[]> = {
    IRRELEVANT: ["무관한 문장", "첫 문장", "선택지", "지문"],
    SENTENCE_ORDER: ["단락", "문장", "단어", "지문"],
  };
  const passthroughKeywords = questionType
    ? KOREAN_PASSTHROUGH_KEYWORDS[questionType]
    : undefined;
  if (
    passthroughKeywords &&
    hasKoreanUserMessage &&
    passthroughKeywords.some((keyword) => strippedRaw.includes(keyword))
  ) {
    return strippedRaw;
  }

  return "문제 생성 중 오류가 발생했습니다. 조건을 조금 조정한 뒤 다시 시도해 주세요.";
}
