"use client";

import { useState } from "react";

interface ShortAnswerInputProps {
  onSubmit: (answer: string) => void;
  disabled: boolean;
}

export default function ShortAnswerInput({ onSubmit, disabled }: ShortAnswerInputProps) {
  const [value, setValue] = useState("");

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onSubmit(value.trim());
        }}
        disabled={disabled}
        placeholder="답을 입력하세요"
        className="w-full border-0 border-b-2 border-gray-300 rounded-none px-2 py-3 text-lg font-medium text-black bg-transparent focus:outline-none transition-colors"
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--key-color)"; }}
        onBlur={(e) => { if (!value) e.currentTarget.style.borderColor = ""; }}
      />
      <button
        onClick={() => value.trim() && onSubmit(value.trim())}
        disabled={disabled || !value.trim()}
        className="btn-3d w-full py-3.5 rounded-2xl text-white font-bold text-base disabled:opacity-40 disabled:border-b-2"
        style={{ backgroundColor: value.trim() ? "var(--key-color)" : "#E5E5E5", color: value.trim() ? "white" : "#AFAFAF" }}
      >
        확인
      </button>
    </div>
  );
}
