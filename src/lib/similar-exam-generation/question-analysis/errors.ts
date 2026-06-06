import { NoObjectGeneratedError } from "ai";

const SINGLE_QUESTION_FOLLOW_UP_ERROR = "Single-question follow-up analysis";

export function isSingleQuestionFollowUpError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith(SINGLE_QUESTION_FOLLOW_UP_ERROR)
  );
}

export function analysisErrorDetail(error: unknown): string {
  let detail = error instanceof Error ? error.message : String(error);
  if (NoObjectGeneratedError.isInstance(error)) {
    const rawHead = (error.text ?? "").slice(0, 1000);
    const causeMsg =
      error.cause instanceof Error ? error.cause.message : String(error.cause ?? "");
    detail = `${error.message} | finishReason=${error.finishReason ?? "?"} | cause=${causeMsg} | rawHead=${rawHead}`;
  }
  return detail;
}
