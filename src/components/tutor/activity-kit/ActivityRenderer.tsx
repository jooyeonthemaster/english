"use client";

import type { StudentPayload } from "@/lib/tutor/student-payload";
import { ChoiceStage } from "./stages/ChoiceStage";
import { ChipStage } from "./stages/ChipStage";
import { MatchStage } from "./stages/MatchStage";
import { SpanStage } from "./stages/SpanStage";
import { TextStage } from "./stages/TextStage";

// form별 스테이지 디스패처. 플레이어·에뮬레이터가 공유한다(포크 제거).
export function ActivityRenderer({
  payload,
  disabled,
  onResponse,
}: {
  payload: StudentPayload;
  disabled: boolean;
  onResponse: (response: unknown, canSubmit: boolean) => void;
}) {
  switch (payload.form) {
    case "CHOICE":
      return <ChoiceStage payload={payload} disabled={disabled} onResponse={onResponse} />;
    case "CHIP":
      return <ChipStage payload={payload} disabled={disabled} onResponse={onResponse} />;
    case "MATCH":
      return <MatchStage payload={payload} disabled={disabled} onResponse={onResponse} />;
    case "SPAN":
      return <SpanStage payload={payload} disabled={disabled} onResponse={onResponse} />;
    case "TEXT":
      return <TextStage payload={payload} disabled={disabled} onResponse={onResponse} />;
    default:
      return (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-[12.5px] font-medium text-slate-500">
          이 활동은 다시 생성이 필요해요.
        </p>
      );
  }
}
