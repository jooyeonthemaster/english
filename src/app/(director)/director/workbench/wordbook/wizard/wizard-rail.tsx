"use client";

// 위저드 좌측 스텝 레일 — 셸(wordbook-wizard.tsx)의 500줄 규약 분리체.
// 표시 전용이다(상태는 셸이 소유). 지나온 스텝만 클릭으로 되돌아갈 수 있고,
// 생성이 끝난 뒤에는 전부 완료 표시로 잠긴다.

import { BookMarked, Check } from "lucide-react";
import type { WizardStep } from "./wizard-types";

export const WIZARD_STEP_META: { n: WizardStep; title: string; hint: string }[] = [
  { n: 1, title: "커리큘럼 고르기", hint: "추천에서 고르거나 직접 설계" },
  { n: 2, title: "범위와 수준", hint: "몇 단어를, 어떤 수준으로" },
  { n: 3, title: "구성 방식", hint: "단계를 어떻게 나눌지" },
  { n: 4, title: "학습 주기", hint: "하루 양과 기간" },
  { n: 5, title: "확인하고 만들기", hint: "이름 짓고 완성" },
];

export function WizardRail({
  step,
  done,
  onGoto,
}: {
  step: WizardStep;
  /** 생성 완료 — 전 스텝을 완료로 잠근다 */
  done: boolean;
  onGoto: (n: WizardStep) => void;
}) {
  return (
    <aside className="hidden w-[236px] shrink-0 flex-col border-r border-slate-100 bg-slate-50/70 px-5 py-6 sm:flex">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
          <BookMarked size={17} />
        </span>
        <div>
          <p className="text-[14px] font-bold leading-tight text-slate-800">
            단어장 만들기
          </p>
          <p className="text-[10.5px] text-slate-400">5단계면 교재가 완성돼요</p>
        </div>
      </div>
      <ol className="space-y-1">
        {WIZARD_STEP_META.map((m) => {
          const isDone = done ? true : m.n < step;
          const isCurrent = !done && m.n === step;
          const clickable = !done && m.n < step;
          return (
            <li key={m.n}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onGoto(m.n)}
                aria-current={isCurrent ? "step" : undefined}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                  isCurrent
                    ? "bg-white shadow-sm ring-1 ring-slate-200"
                    : clickable
                      ? "hover:bg-white/70"
                      : ""
                }`}
              >
                <span
                  style={{ width: 22, height: 22 }}
                  className={`mt-0.5 flex shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold tabular-nums ${
                    isDone
                      ? "bg-emerald-500 text-white"
                      : isCurrent
                        ? "bg-blue-600 text-white"
                        : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {isDone ? <Check size={12} strokeWidth={3} /> : m.n}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-[12.5px] font-semibold break-keep ${
                      isCurrent ? "text-slate-800" : "text-slate-500"
                    }`}
                  >
                    {m.title}
                  </span>
                  <span className="block text-[10.5px] text-slate-400 break-keep">
                    {m.hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-auto rounded-lg border border-slate-200 bg-white px-3 py-2.5">
        <p className="text-[10.5px] leading-relaxed text-slate-400 break-keep">
          만든 교재는 <b className="text-slate-500">보낸 단어장</b> 탭에서 언제든
          다시 보내거나 보관할 수 있어요.
        </p>
      </div>
    </aside>
  );
}
