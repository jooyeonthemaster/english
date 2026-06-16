import { Loader2 } from "lucide-react";

export default function PassageVariantLoading() {
  return (
    <div className="-m-6 flex min-h-[calc(100vh-56px)] items-center justify-center bg-[#F4F6F9]">
      <div className="flex flex-col items-center gap-2">
        <Loader2
          className="h-5 w-5 animate-spin text-violet-500"
          aria-hidden="true"
        />
        <p className="text-[12px] font-medium text-slate-400">
          지문 변형을 불러오는 중…
        </p>
      </div>
    </div>
  );
}
