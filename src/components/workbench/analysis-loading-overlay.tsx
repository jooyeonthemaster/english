"use client";

import { useState, useEffect } from "react";

const ANALYSIS_STEPS = [
  { label: "지문 텍스트 분석 중", duration: 3000 },
  { label: "핵심 어휘 추출 중", duration: 4000 },
  { label: "문법 포인트 식별 중", duration: 5000 },
  { label: "문장 구조 분석 중", duration: 4000 },
  { label: "출제 포인트 도출 중", duration: 3000 },
  { label: "분석 결과 정리 중", duration: 2000 },
];

export function AnalysisLoadingOverlay() {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [dots, setDots] = useState("");

  // Animate dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Progress through steps
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return 95;
        return prev + Math.random() * 2 + 0.5;
      });
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Step progression
  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) =>
        prev < ANALYSIS_STEPS.length - 1 ? prev + 1 : prev
      );
    }, 3500);
    return () => clearInterval(stepInterval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F4F6F9]/95 backdrop-blur-sm">
      <div className="flex flex-col items-center max-w-md mx-auto px-8">
        {/* AI Orb Animation */}
        <div className="relative w-28 h-28 mb-8">
          {/* Outer ring - slow rotation */}
          <div
            className="absolute inset-0 rounded-full border-2 border-blue-200/40"
            style={{
              animation: "spin 8s linear infinite",
            }}
          />
          {/* Middle ring - medium rotation */}
          <div
            className="absolute inset-2 rounded-full border-2 border-blue-300/50"
            style={{
              animation: "spin 5s linear infinite reverse",
            }}
          />
          {/* Inner ring - fast rotation */}
          <div
            className="absolute inset-4 rounded-full border-2 border-blue-400/60"
            style={{
              animation: "spin 3s linear infinite",
            }}
          />
          {/* Core glow */}
          <div className="absolute inset-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30">
            <div
              className="absolute inset-0 rounded-full bg-blue-400/30"
              style={{
                animation: "pulse 2s ease-in-out infinite",
              }}
            />
          </div>
          {/* Orbiting dots */}
          <div
            className="absolute inset-0"
            style={{ animation: "spin 4s linear infinite" }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2 h-2 rounded-full bg-blue-400 shadow-sm shadow-blue-400/50" />
          </div>
          <div
            className="absolute inset-0"
            style={{ animation: "spin 6s linear infinite reverse" }}
          >
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-1.5 h-1.5 rounded-full bg-blue-300 shadow-sm shadow-blue-300/50" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-[18px] font-bold text-slate-800 mb-2">
          AI 분석 진행 중
        </h2>

        {/* Current step */}
        <p className="text-[14px] text-slate-500 mb-6 h-5">
          {ANALYSIS_STEPS[currentStep].label}{dots}
        </p>

        {/* Progress bar */}
        <div className="w-72 h-1.5 bg-slate-200 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1.5 mt-4">
          {ANALYSIS_STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
                i <= currentStep
                  ? "bg-blue-500"
                  : "bg-slate-300"
              }`}
            />
          ))}
        </div>

        <p className="text-[11px] text-slate-400 mt-6">
          어휘, 문법, 구조, 출제 포인트를 종합 분석하고 있습니다
        </p>
      </div>
    </div>
  );
}
