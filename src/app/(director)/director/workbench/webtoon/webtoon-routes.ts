// 웹툰 라우트 베이스 — 영어(workbench)/국어(korean) 대칭 경로의 단일 소스.
// subjectScope 미전달(undefined) = 영어(기존 /director/workbench/webtoon/* 불변),
// "KOREAN" = 국어(/director/korean/webtoon/*). 클라이언트 내부 네비게이션이
// 이 헬퍼만 통과하면 국어 화면이 영어 경로로 착륙하는 일이 없다.

export type WebtoonSubjectScope = "KOREAN" | undefined;

export function webtoonRoutes(subjectScope: WebtoonSubjectScope) {
  const base =
    subjectScope === "KOREAN"
      ? "/director/korean/webtoon"
      : "/director/workbench/webtoon";
  return {
    /** 새 웹툰 생성(=웹툰 생성 페이지) */
    generate: base,
    /** 웹툰 관리(보관함) */
    library: `${base}/library`,
  } as const;
}

// 자주 쓰는 정적 참조 — 컴포넌트에서 webtoonRoutes(scope) 를 직접 호출해도 되지만
// 하드코딩 문자열을 한곳으로 모으기 위한 별칭.
export const WEBTOON_ROUTES = webtoonRoutes;
