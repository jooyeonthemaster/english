"use client";

import { useEffect } from "react";

/**
 * 루트 글로벌 에러 바운더리. 루트 레이아웃 자체가 렌더에 실패한 경우에만
 * 표시되며, 이때는 globals.css / 폰트가 적용되지 않으므로 스타일을 인라인으로
 * 둔다. 정상 동작 화면에는 절대 나타나지 않는다.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "0 20px",
          fontFamily:
            "'Apple SD Gothic Neo', -apple-system, BlinkMacSystemFont, sans-serif",
          background: "#fff",
          color: "#191F28",
        }}
      >
        <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
          문제가 발생했습니다
        </h2>
        <p style={{ fontSize: "14px", color: "#8B95A1", margin: 0, textAlign: "center" }}>
          잠시 후 다시 시도해 주세요. 계속되면 고객센터로 문의해 주세요.
        </p>
        {error.digest ? (
          <p style={{ fontSize: "11px", color: "#C4C9D0", margin: 0 }}>
            오류 코드: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            height: "40px",
            padding: "0 20px",
            borderRadius: "12px",
            border: "none",
            background: "#7CB342",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
