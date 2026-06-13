"use client";

import { Check, GraduationCap, KeyRound, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HubStats, UpdateParams } from "./types";
import { UNASSIGNED_CLASS_ID } from "./types";

interface Step {
  key: string;
  label: string;
  hint: string;
  icon: typeof UserPlus;
  done: boolean;
  onClick?: () => void;
}

/**
 * 단계별 온보딩 안내. 세 단계가 모두 끝나면 자동으로 사라진다(베테랑 노이즈 제거).
 */
export function OnboardingStepper({
  onboarding,
  onAddStudent,
  updateParams,
}: {
  onboarding: HubStats["onboarding"];
  onAddStudent: () => void;
  updateParams: UpdateParams;
}) {
  const { hasStudents, hasAssignment, hasLoggedIn } = onboarding;
  if (hasStudents && hasAssignment && hasLoggedIn) return null;

  const steps: Step[] = [
    {
      key: "register",
      label: "학생 등록",
      hint: "원생을 추가하고 학생 코드를 발급해요.",
      icon: UserPlus,
      done: hasStudents,
      onClick: onAddStudent,
    },
    {
      key: "assign",
      label: "클래스 배정",
      hint: "등록한 학생을 반에 배정해요.",
      icon: GraduationCap,
      done: hasAssignment,
      onClick: () => updateParams({ classId: UNASSIGNED_CLASS_ID, page: undefined }),
    },
    {
      key: "code",
      label: "코드 발급·공유",
      hint: "학생이 앱에 로그인하면 완료돼요.",
      icon: KeyRound,
      done: hasLoggedIn,
    },
  ];

  // The first not-yet-done step is the "active" one to nudge.
  const activeIndex = steps.findIndex((s) => !s.done);

  return (
    <div className="rounded-xl border border-[#E5E8EB] bg-white p-2 sm:p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {steps.map((step, i) => {
          const isActive = i === activeIndex;
          const Icon = step.done ? Check : step.icon;
          return (
            <button
              key={step.key}
              type="button"
              onClick={step.done ? undefined : step.onClick}
              disabled={step.done || !step.onClick}
              className={cn(
                "group flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition",
                step.done && "cursor-default bg-[#F7F8FA]",
                isActive && "bg-blue-50 ring-1 ring-inset ring-blue-200",
                !step.done && !isActive && "bg-[#F7F8FA]",
                !step.done && step.onClick && "hover:bg-[#F2F4F6]",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-black",
                  step.done
                    ? "bg-emerald-50 text-emerald-600"
                    : isActive
                      ? "bg-blue-600 text-white"
                      : "bg-white text-[#8B95A1]",
                )}
              >
                {step.done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black text-[#AEB5BC]">
                    {`STEP ${i + 1}`}
                  </span>
                  {step.done && (
                    <span className="text-[10px] font-bold text-emerald-600">완료</span>
                  )}
                </span>
                <span
                  className={cn(
                    "block truncate text-sm font-bold",
                    step.done ? "text-[#6B7684]" : "text-[#191F28]",
                  )}
                >
                  {step.label}
                </span>
                {isActive && (
                  <span className="block truncate text-[11px] font-medium text-[#6B7684]">
                    {step.hint}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
