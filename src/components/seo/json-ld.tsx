import type { ReactElement } from "react";

/**
 * JSON-LD 구조화데이터를 서버에서 안전하게 주입하는 컴포넌트.
 *
 * Next.js 공식 권장 패턴: next/script 가 아니라 네이티브
 * <script type="application/ld+json"> + dangerouslySetInnerHTML 을 쓰고,
 * XSS 방지를 위해 직렬화 결과의 '<' 를 유니코드 이스케이프 '<' 로 치환한다.
 * (주의: HTML 엔티티 '&lt;' 로 바꾸면 JSON-LD 페이로드가 손상되어 리치결과가 깨진다.)
 *
 * 반드시 서버 컴포넌트 트리에서 렌더해 SSR HTML 에 정적으로 들어가게 한다
 * (하이드레이션/클라이언트 번들 불필요).
 */
export function JsonLd({
  data,
  id,
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
  id?: string;
}): ReactElement {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      id={id}
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
