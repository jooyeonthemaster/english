import { ShieldCheck } from "lucide-react";

// 결제 검증 체계 안내 띠 — 지표 카드 아래 한 줄. 데이터 없이 고정 문구.

const ITEMS = [
  { label: "서버 검증", value: "금액·상점 대조" },
  { label: "웹훅", value: "수신 이력 보존" },
  { label: "재조회", value: "누락 복구" },
  { label: "환불", value: "API 취소·크레딧 회수" },
];

export function ReviewReadinessStrip() {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
      {ITEMS.map((item) => (
        <div
          key={item.label}
          className="flex h-12 items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-white text-emerald-700">
            <ShieldCheck className="size-3.5" strokeWidth={2} />
          </span>
          <div>
            <div className="text-[12px] font-semibold text-emerald-800">{item.label}</div>
            <div className="text-[11px] text-emerald-600">{item.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
