"use client";

export function ComingSoonOverlay({
  message = "PG 심사 준비가 완료되면 결제 기능을 다시 열 예정입니다.",
}: {
  message?: string;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/65 backdrop-blur-[1px]">
      <div className="rounded-xl border border-slate-200 bg-white/95 px-5 py-3 text-center shadow-sm">
        <p className="text-[13px] font-bold text-slate-900">기능 준비중</p>
        <p className="mt-1 text-[12px] font-medium text-slate-500">
          {message}
        </p>
      </div>
    </div>
  );
}
