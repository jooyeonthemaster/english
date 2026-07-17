"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * 라우트 세그먼트 에러 바운더리 공용 UI.
 *
 * App Router 의 error.tsx 는 클라이언트 컴포넌트여야 하며 { error, reset } 을
 * 받는다. 렌더/서버컴포넌트에서 잡히지 않은 예외가 났을 때만 표시되므로 정상
 * 화면 경험에는 영향이 없다. 사용자에게는 내부 오류 메시지를 노출하지 않고,
 * 디버깅용 digest 만 작게 표기한다.
 */
export default function RouteError({
  error,
  reset,
  homeHref = "/",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref?: string;
}) {
  useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-5">
      <div className="flex size-16 items-center justify-center rounded-full bg-[#F2F3F6]">
        <AlertTriangle className="size-8 text-[#8B95A1]" />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-[18px] font-semibold text-[#191F28]">
          문제가 발생했습니다
        </h2>
        <p className="text-[14px] text-[#8B95A1]">
          잠시 후 다시 시도해 주세요. 계속되면 고객센터로 문의해 주세요.
        </p>
        {error.digest ? (
          <p className="mt-1 text-[11px] text-[#C4C9D0]">오류 코드: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="flex h-10 items-center rounded-xl bg-[#7CB342] px-5 text-[14px] font-medium text-white transition-colors active:bg-[#689F38]"
        >
          다시 시도
        </button>
        <Link
          href={homeHref}
          className="flex h-10 items-center rounded-xl bg-[#F2F3F6] px-5 text-[14px] font-medium text-[#4E5968] transition-colors active:bg-[#E5E8EB]"
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
