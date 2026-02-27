"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-5">
      <div className="flex size-16 items-center justify-center rounded-full bg-[#FFF0F0]">
        <AlertCircle className="size-8 text-[#F04452]" />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-[16px] font-semibold text-[#191F28]">
          문제가 발생했습니다
        </h2>
        <p className="text-[14px] text-[#8B95A1]">
          잠시 후 다시 시도해주세요
        </p>
      </div>
      <button
        onClick={reset}
        className="flex h-10 items-center gap-2 rounded-xl bg-[#7CB342] px-5 text-[14px] font-medium text-white transition-colors active:bg-[#689F38]"
      >
        <RefreshCw className="size-4" />
        다시 시도
      </button>
    </div>
  );
}
