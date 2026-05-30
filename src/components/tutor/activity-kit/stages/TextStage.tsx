"use client";

import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { TextStageProps } from "../types";

const LONG_VARIANTS = new Set(["translate", "transform", "conditional", "first_letter"]);

export function TextStage({ payload, disabled, onResponse }: TextStageProps) {
  const [answer, setAnswer] = useState("");
  useEffect(() => {
    onResponse(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(value: string) {
    setAnswer(value);
    onResponse({ answer: value }, value.trim().length > 0);
  }

  const isLong = payload.inputMode === "long" || LONG_VARIANTS.has(payload.variant);
  const isSpell = payload.variant === "spell" || payload.variant === "derive";

  return (
    <div className="space-y-3">
      {/* 구문 전환/조건 영작: 원문 + 조건 체크리스트(핵심 버그 해결: 조건이 화면에 보임) */}
      {(payload.variant === "transform" || payload.variant === "conditional") && (
        <div className="space-y-2">
          <div className="border-l-2 border-slate-300 pl-3">
            <p className="mb-1 text-[10px] font-bold text-slate-500">원문</p>
            <p className="font-mono text-[13px] font-medium leading-6 text-slate-800">{payload.prompt}</p>
          </div>
          {payload.transformType && (
            <p className="text-[11px] font-bold text-blue-700">전환 방식: {payload.transformType}</p>
          )}
          {payload.conditions?.length ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
              <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-blue-700">
                <ListChecks className="size-3.5" />
                조건
              </p>
              <ul className="space-y-1">
                {payload.conditions.map((cond, index) => (
                  <li key={index} className="flex gap-1.5 text-[12px] font-medium leading-5 text-slate-700">
                    <span className="text-blue-500">{index + 1}.</span>
                    <span>{cond}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {/* 그 외 변형은 prompt를 직접 노출 (cloze 빈칸/첫글자 마스킹/오류문장 등) */}
      {payload.variant !== "transform" && payload.variant !== "conditional" && !isSpell && (
        <p className="break-words whitespace-pre-wrap border-l-2 border-slate-200 pl-3 font-mono text-[13.5px] font-bold leading-7 text-slate-900">
          {payload.prompt}
        </p>
      )}

      {/* 철자/파생어: 뜻 + 첫글자·길이 힌트 (핵심 버그 해결: 힌트가 화면에 보임) */}
      {isSpell ? (
        <div className="space-y-2">
          <p className="border-l-2 border-slate-200 pl-3 text-[14px] font-bold leading-6 text-slate-900">{payload.prompt}</p>
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
            {payload.firstLetter && (
              <span className="rounded-md bg-blue-50 px-2 py-1 font-mono text-blue-700">
                첫 글자 {payload.firstLetter.toUpperCase()}
              </span>
            )}
            {payload.length && <span className="rounded-md bg-slate-100 px-2 py-1">{payload.length}글자</span>}
          </div>
          <Input
            value={answer}
            onChange={(event) => update(event.target.value)}
            placeholder={payload.firstLetter ? `${payload.firstLetter}...` : "철자 입력"}
            maxLength={payload.length ? payload.length + 2 : undefined}
            className="h-11 rounded-xl border-slate-200 font-mono text-[14px]"
            disabled={disabled}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>
      ) : payload.scaffold ? (
        <>
          <p className="text-[11px] font-medium text-slate-500">{payload.scaffold}</p>
          <TextInput isLong={isLong} answer={answer} onChange={update} disabled={disabled} />
        </>
      ) : (
        <TextInput isLong={isLong} answer={answer} onChange={update} disabled={disabled} />
      )}
    </div>
  );
}

function TextInput({
  isLong,
  answer,
  onChange,
  disabled,
}: {
  isLong: boolean;
  answer: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  if (isLong) {
    return (
      <Textarea
        value={answer}
        onChange={(event) => onChange(event.target.value)}
        placeholder="답을 입력하세요."
        className="min-h-24 rounded-xl border-slate-200 bg-white text-[13.5px] leading-6"
        disabled={disabled}
      />
    );
  }
  return (
    <Input
      value={answer}
      onChange={(event) => onChange(event.target.value)}
      placeholder="답 입력"
      className="h-11 rounded-xl border-slate-200 text-[13.5px]"
      disabled={disabled}
    />
  );
}
