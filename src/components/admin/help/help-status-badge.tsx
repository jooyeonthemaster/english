import { StatusBadge } from "@/components/admin/kit";
import type { StatusMeta, Tone } from "@/lib/admin-labels/tone";
import { statusOf, type StatusOption } from "@/lib/help-center";

// 헬프센터 상태(src/lib/help-center.ts 가 원본, 원장 화면과 공유)는 Tailwind className 을
// 들고 있다. 관리자 화면에서는 그 className 을 색조(tone)로 옮겨 공용 StatusBadge 로 그린다.
// 원본의 slate 중성색은 관리자 규약대로 gray 가 된다.
const CLASS_TONE: ReadonlyArray<[string, Tone]> = [
  ["emerald", "emerald"],
  ["amber", "amber"],
  ["rose", "rose"],
  ["violet", "violet"],
  ["blue", "blue"],
];

export function helpStatusMeta(option: StatusOption): StatusMeta {
  const tone = CLASS_TONE.find(([key]) => option.className.includes(key))?.[1] ?? "gray";
  return { label: option.label, tone };
}

/** 헬프센터 상태 뱃지 — `options` 에서 `value` 를 찾아 관리자 공용 뱃지로 표시. */
export function HelpStatusBadge({
  options,
  value,
  variant,
  className,
}: {
  options: readonly StatusOption[];
  value: string;
  variant?: "soft" | "dot";
  className?: string;
}) {
  return (
    <StatusBadge status={helpStatusMeta(statusOf(options, value))} variant={variant} className={className} />
  );
}
