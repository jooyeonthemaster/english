"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({
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
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <div className="flex size-16 items-center justify-center rounded-full bg-[#FFF0F0]">
        <AlertCircle className="size-8 text-[#F04452]" />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-[18px] font-semibold text-[#191F28]">
          오류가 발생했습니다
        </h2>
        <p className="text-[14px] text-[#8B95A1]">
          페이지를 불러오는 중 문제가 발생했습니다
        </p>
      </div>
      <Button onClick={reset} className="gap-2">
        <RefreshCw className="size-4" />
        다시 시도
      </Button>
    </div>
  );
}
