"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Palette } from "lucide-react";

const THEME_OPTIONS = [
  { value: "light", label: "라이트", icon: Sun, desc: "밝은 화면" },
  { value: "dark", label: "다크", icon: Moon, desc: "어두운 화면" },
  { value: "system", label: "시스템", icon: Monitor, desc: "기기 설정 따름" },
] as const;

export default function PreferencesTab() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes는 마운트 전 theme가 undefined → hydration mismatch 방지
  useEffect(() => setMounted(true), []);

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <Palette className="size-4 text-muted-foreground" strokeWidth={1.8} />
        <h2 className="text-[14px] font-semibold text-foreground">테마</h2>
      </div>
      <div className="px-6 py-5">
        <p className="text-[13px] text-muted-foreground mb-4">
          화면 테마를 선택하세요. 선택한 테마는 이 브라우저에 저장됩니다.
        </p>
        <div className="grid grid-cols-3 gap-3 max-w-md">
          {THEME_OPTIONS.map(({ value, label, icon: Icon, desc }) => {
            const active = mounted && theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={`flex flex-col items-center gap-2 rounded-xl border px-4 py-5 transition-all ${
                  active
                    ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/20"
                    : "border-border bg-muted hover:border-blue-300"
                }`}
              >
                <Icon
                  className={`size-6 ${active ? "text-blue-600" : "text-muted-foreground"}`}
                  strokeWidth={1.8}
                />
                <span className={`text-[13px] font-bold ${active ? "text-blue-600" : "text-foreground"}`}>
                  {label}
                </span>
                <span className="text-[11px] text-muted-foreground">{desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
