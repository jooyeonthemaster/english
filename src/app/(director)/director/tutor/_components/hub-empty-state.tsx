"use client";

import { GraduationCap, KeyRound, Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Full onboarding card shown when the academy has zero students yet. */
export function HubEmptyState({ onAddStudent }: { onAddStudent: () => void }) {
  const steps = [
    { icon: UserPlus, title: "학생 등록", desc: "이름과 학년만 입력하면 학생 코드가 자동 발급돼요." },
    { icon: GraduationCap, title: "클래스 배정", desc: "학생을 반에 배정해 한눈에 관리해요." },
    { icon: KeyRound, title: "코드 공유", desc: "학생이 코드로 앱에 로그인하면 학습이 시작돼요." },
  ];

  return (
    <div className="rounded-xl border border-dashed border-[#DDE2E7] bg-white px-6 py-12 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <UserPlus className="size-7" />
      </div>
      <h2 className="mt-4 text-lg font-black text-[#191F28]">첫 학생을 등록해 보세요</h2>
      <p className="mt-1 text-sm font-medium text-[#6B7684]">
        학생을 등록하면 반 배정·학생 코드·원비까지 이 화면에서 바로 관리할 수 있어요.
      </p>

      <div className="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={i} className="rounded-xl border border-[#F2F4F6] bg-[#F7F8FA] p-4 text-left">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-white text-[#3182F6]">
                <s.icon className="size-4" />
              </span>
              <span className="text-[10px] font-black text-[#AEB5BC]">STEP {i + 1}</span>
            </div>
            <p className="mt-2 text-sm font-bold text-[#191F28]">{s.title}</p>
            <p className="mt-0.5 text-xs font-medium leading-5 text-[#8B95A1]">{s.desc}</p>
          </div>
        ))}
      </div>

      <Button
        onClick={onAddStudent}
        className="mt-8 h-10 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700"
      >
        <Plus className="size-4" />
        학생 등록하기
      </Button>
    </div>
  );
}
