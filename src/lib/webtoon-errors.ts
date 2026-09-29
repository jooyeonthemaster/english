// ============================================================================
// Teacher-facing failure messages for webtoon generation.
// ----------------------------------------------------------------------------
// The raw provider error stays in server logs; the Webtoon row stores a short
// Korean explanation that tells the teacher what happened and what to try.
// Credits are always refunded on failure (processor / reaper).
// ============================================================================

export function friendlyWebtoonError(raw: string): string {
  const message = raw || "";
  if (/safety|moderation|content[_ -]?policy|rejected by|blocked/i.test(message)) {
    return "이미지 안전 정책에 걸려 그리지 못했어요. 추가 지시사항이나 지문의 자극적인 표현을 바꿔 다시 시도해 주세요. (크레딧은 환불됐어요)";
  }
  if (/timed? ?out|timeout|aborted/i.test(message)) {
    return "이미지 생성이 너무 오래 걸려 중단됐어요. 잠시 후 다시 시도해 주세요. (크레딧은 환불됐어요)";
  }
  if (/\b(402|429)\b|insufficient|rate limit|credits/i.test(message)) {
    return "이미지 생성 서버가 일시적으로 혼잡해요. 잠시 후 다시 시도해 주세요. (크레딧은 환불됐어요)";
  }
  if (/stale|중단|interrupted/i.test(message)) {
    return "생성 작업이 중간에 멈춰 정리했어요. 다시 시도해 주세요. (크레딧은 환불됐어요)";
  }
  return "웹툰 생성에 실패했어요. 다시 시도해 주세요. (크레딧은 환불됐어요)";
}
