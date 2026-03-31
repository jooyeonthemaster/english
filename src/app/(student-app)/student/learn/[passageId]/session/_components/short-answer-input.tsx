"use client";

import { useState } from "react";

interface ShortAnswerInputProps {
  onSubmit: (answer: string) => void;
  disabled: boolean;
}

export default function ShortAnswerInput({ onSubmit, disabled }: ShortAnswerInputProps) {
  const [value, setValue] = useState("");

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onSubmit(value.trim());
        }}
        disabled={disabled}
        placeholder="답을 입력하세요"
        className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-400 focus:outline-none transition-colors"
      />
      <button
        onClick={() => value.trim() && onSubmit(value.trim())}
        disabled={disabled || !value.trim()}
        className="w-full py-3 rounded-xl bg-blue-500 text-white font-bold text-sm disabled:opacity-40 active:bg-blue-600"
      >
        확인
      </button>
    </div>
  );
}
