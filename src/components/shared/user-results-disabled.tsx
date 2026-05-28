import Link from "next/link";
import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserResultsDisabledProps {
  homeHref?: string;
  className?: string;
}

export function UserResultsDisabled({
  homeHref,
  className,
}: UserResultsDisabledProps) {
  return (
    <div
      className={cn(
        "flex min-h-[55vh] flex-col items-center justify-center px-6 py-14 text-center",
        className,
      )}
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <EyeOff className="size-7" strokeWidth={1.8} />
      </div>
      <h1 className="mt-5 text-lg font-bold text-slate-900">
        결과 화면은 잠시 점검 중입니다
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
        학습 기록과 제출 데이터는 정상 저장되고 있습니다. 결과 확인 기능은 곧 다시 열릴 예정입니다.
      </p>
      {homeHref && (
        <Link
          href={homeHref}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition-colors hover:bg-slate-800"
        >
          홈으로 가기
        </Link>
      )}
    </div>
  );
}
