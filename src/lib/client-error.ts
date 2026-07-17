/**
 * toClientError — 예외를 클라이언트에 안전하게 노출할 메시지로 정규화한다.
 *
 * 목적: Prisma/DB 내부 에러(테이블·컬럼·제약조건명, 영문 스택)가 그대로
 * 사용자/응답으로 새는 것을 막는다. 단, 이 코드베이스의 서버 액션은 의도적으로
 * `throw new Error("크레딧이 부족합니다.")` 처럼 **한글 사용자 메시지**를 던지는
 * 관례가 있어, 이를 일반 문구로 바꾸면 정상적인 에러 UX 가 바뀐다.
 *
 * 그래서 "안전해 보이는" 메시지(짧고, 한글을 포함하며, 기술적 시그니처가 없는)는
 * 그대로 통과시키고(=기존 사용자 경험 보존), 그 외의 내부 에러만 generic 문구로
 * 대체한다. 확실히 사용자용인 메시지는 ClientError 로 감싸면 무조건 통과된다.
 */

const GENERIC_MESSAGE = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 명시적으로 "이 메시지는 사용자에게 보여도 된다"고 표시하는 마커 에러. */
export class ClientError extends Error {
  readonly isClientError = true;
  constructor(message: string) {
    super(message);
    this.name = "ClientError";
  }
}

// 내부/기술 에러로 판단하는 시그니처(있으면 generic 처리).
const TECHNICAL_SIGNATURES = [
  "prisma",
  "PrismaClient",
  "invalid `",
  "invocation",
  "\n",
  " at ",
  "Error:",
  "select ",
  "where ",
  "postgres",
  "column",
  "constraint",
  "ECONN",
  "ETIMEDOUT",
  "fetch failed",
  "undefined is not",
  "cannot read",
  "is not a function",
];

const HANGUL = /[가-힣]/;

function isSafeUserMessage(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return false;
  if (!HANGUL.test(trimmed)) return false; // 사용자 메시지는 한글을 포함한다는 전제
  const lower = trimmed.toLowerCase();
  return !TECHNICAL_SIGNATURES.some((sig) => lower.includes(sig.toLowerCase()));
}

/**
 * 클라이언트에 노출할 안전한 에러 메시지를 반환한다.
 * @param fallback 통과 조건을 만족하지 못할 때 쓸 문구(기본 generic).
 */
export function toClientErrorMessage(error: unknown, fallback = GENERIC_MESSAGE): string {
  if (error instanceof ClientError) return error.message;
  if (error instanceof Error && isSafeUserMessage(error.message)) {
    return error.message;
  }
  return fallback;
}
