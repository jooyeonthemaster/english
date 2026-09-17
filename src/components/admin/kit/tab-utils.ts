// 탭 유틸 — 서버 컴포넌트(page.tsx)에서도 부를 수 있도록 "use client" 없는 별도 모듈로 둔다.
// (AdminTabs·useUrlTab 은 클라이언트 전용이라 admin-tabs.tsx 에 있다.)

/** searchParams 값이 허용 목록에 있으면 그 값, 아니면 기본값. */
export function resolveTab<K extends string>(
  raw: string | undefined,
  keys: readonly K[],
  fallback: K,
): K {
  return raw && (keys as readonly string[]).includes(raw) ? (raw as K) : fallback;
}
