"use client";

import { motion } from "framer-motion";
import { BookOpen, GraduationCap } from "lucide-react";

interface StudyModeToggleProps {
  mode: "read" | "study";
  onModeChange: (mode: "read" | "study") => void;
  isLoading?: boolean;
}

const modes = [
  { key: "read" as const, label: "읽기", icon: BookOpen },
  { key: "study" as const, label: "학습", icon: GraduationCap },
];

export function StudyModeToggle({
  mode,
  onModeChange,
  isLoading,
}: StudyModeToggleProps) {
  return (
    <div className="relative flex rounded-xl bg-[#F3F4F0] p-1">
      {modes.map((m) => {
        const Icon = m.icon;
        const isActive = mode === m.key;

        return (
          <button
            key={m.key}
            onClick={() => onModeChange(m.key)}
            disabled={isLoading && m.key === "study"}
            className="relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold tracking-[-0.025em] transition-colors duration-200"
            style={{
              color: isActive ? "#1A1F16" : "#9CA396",
            }}
          >
            {isActive && (
              <motion.div
                layoutId="study-mode-indicator"
                className="absolute inset-0 rounded-lg bg-white shadow-card"
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <Icon className="size-3.5" />
              {m.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
