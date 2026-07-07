/**
 * 사용자에게 노출하는 스모트 앱 버전의 단일 출처(SSOT).
 * 여러 화면(설정·햄버거 메뉴·공지 하단 등)에서 하드코딩하지 말고 이 값을 참조한다.
 */
export const APP_VERSION = "1.0.0";

export const APP_VERSION_LABEL = `v${APP_VERSION}`;

/**
 * 배포 식별용 짧은 커밋 해시(서버에서만 읽힘 — VERCEL_GIT_COMMIT_SHA).
 * 로컬/미설정 환경에선 null. 클라이언트에 노출하려면 서버 컴포넌트에서 읽어
 * prop 으로 내려준다.
 */
export function getBuildRef(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : null;
}
