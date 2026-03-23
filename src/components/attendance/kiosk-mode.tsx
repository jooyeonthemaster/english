"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Delete, ArrowRightLeft, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { checkIn, checkOut } from "@/actions/attendance";
import { formatTime, getInitials } from "@/lib/utils";

interface KioskModeProps {
  academyId: string;
}

type KioskAction = "checkin" | "checkout";

interface FeedbackState {
  type: "success" | "error";
  action: KioskAction;
  studentName?: string;
  studentAvatar?: string | null;
  time?: string;
  message?: string;
}

export function KioskMode({ academyId }: KioskModeProps) {
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<KioskAction>("checkin");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Clear feedback after delay
  useEffect(() => {
    if (feedback) {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => {
        setFeedback(null);
      }, 3000);
    }
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, [feedback]);

  const handleNumberPress = useCallback((num: string) => {
    setCode((prev) => {
      if (prev.length >= 10) return prev;
      return prev + num;
    });
  }, []);

  const handleDelete = useCallback(() => {
    setCode((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setCode("");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!code.trim() || processing) return;

    setProcessing(true);
    try {
      const result =
        mode === "checkin"
          ? await checkIn(academyId, code.trim())
          : await checkOut(academyId, code.trim());

      if (result.success && result.data) {
        setFeedback({
          type: "success",
          action: mode,
          studentName: result.data.studentName as string,
          studentAvatar: result.data.studentAvatar as string | null,
          time: formatTime(
            new Date(
              (result.data.checkInTime || result.data.checkOutTime) as string
            )
          ),
        });
      } else {
        setFeedback({
          type: "error",
          action: mode,
          message: result.error || "처리에 실패했습니다.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        action: mode,
        message: "네트워크 오류가 발생했습니다.",
      });
    } finally {
      setCode("");
      setProcessing(false);
    }
  }, [code, mode, academyId, processing]);

  // Keyboard input support
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        handleNumberPress(e.key);
      } else if (e.key === "Backspace") {
        handleDelete();
      } else if (e.key === "Enter") {
        handleSubmit();
      } else if (e.key === "Escape") {
        handleClear();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNumberPress, handleDelete, handleSubmit, handleClear]);

  const isCheckin = mode === "checkin";

  return (
    <div className="flex flex-col items-center">
      {/* Main kiosk container */}
      <div className="w-full max-w-[480px] mx-auto space-y-6">
        {/* Time + Mode toggle */}
        <div className="text-center space-y-3">
          <p className="text-5xl font-bold text-gray-900 tabular-nums tracking-tight">
            {currentTime.toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })}
          </p>
          <p className="text-sm text-gray-500">
            {currentTime.toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </p>

          {/* Mode toggle */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant={isCheckin ? "default" : "outline"}
              onClick={() => setMode("checkin")}
              className={`h-12 px-6 text-base font-semibold gap-2 transition-all duration-300 ${
                isCheckin
                  ? "bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-200"
                  : ""
              }`}
            >
              <LogIn className="h-5 w-5" />
              등원
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMode((m) => (m === "checkin" ? "checkout" : "checkin"))}
              className="h-10 w-10 text-gray-400"
              aria-label="모드 전환"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={!isCheckin ? "default" : "outline"}
              onClick={() => setMode("checkout")}
              className={`h-12 px-6 text-base font-semibold gap-2 transition-all duration-300 ${
                !isCheckin
                  ? "bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-200"
                  : ""
              }`}
            >
              <LogOut className="h-5 w-5" />
              하원
            </Button>
          </div>
        </div>

        {/* Feedback area */}
        <div className="min-h-[120px] flex items-center justify-center">
          {feedback ? (
            <div
              className={`w-full rounded-2xl p-5 text-center animate-scale-in transition-all duration-300 ${
                feedback.type === "success" && feedback.action === "checkin"
                  ? "bg-emerald-50 border-2 border-emerald-200"
                  : feedback.type === "success" && feedback.action === "checkout"
                  ? "bg-blue-50 border-2 border-blue-200"
                  : "bg-red-50 border-2 border-red-200"
              }`}
            >
              {feedback.type === "success" ? (
                <div className="flex flex-col items-center gap-2">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback
                      className={`text-lg font-bold ${
                        feedback.action === "checkin"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {feedback.studentName
                        ? getInitials(feedback.studentName)
                        : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-xl font-bold text-gray-900">
                    {feedback.studentName}
                  </p>
                  <p
                    className={`text-sm font-semibold ${
                      feedback.action === "checkin"
                        ? "text-emerald-600"
                        : "text-blue-600"
                    }`}
                  >
                    {feedback.action === "checkin" ? "등원 완료" : "하원 완료"}{" "}
                    &middot; {feedback.time}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                    <span className="text-xl">!</span>
                  </div>
                  <p className="text-base font-semibold text-red-700">
                    {feedback.message}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full rounded-2xl border-2 border-dashed border-gray-200 p-5 text-center">
              <p className="text-gray-400 text-sm">
                학생 코드를 입력하세요
              </p>
            </div>
          )}
        </div>

        {/* Code display */}
        <div className="flex items-center justify-center">
          <div className="h-16 px-6 rounded-2xl bg-gray-50 border-2 border-gray-200 flex items-center justify-center min-w-[280px] transition-all duration-200">
            {code ? (
              <span className="text-3xl font-bold text-gray-900 tracking-[0.3em] tabular-nums">
                {code}
              </span>
            ) : (
              <span className="text-lg text-gray-300">&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;</span>
            )}
          </div>
        </div>

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberPress(num)}
              className="h-[80px] rounded-2xl bg-white border-2 border-gray-200 text-2xl font-bold text-gray-900 transition-all duration-150 hover:bg-gray-50 hover:border-gray-300 active:scale-95 active:bg-gray-100 shadow-sm"
              aria-label={num}
            >
              {num}
            </button>
          ))}

          {/* Bottom row: clear, 0, delete */}
          <button
            onClick={handleClear}
            className="h-[80px] rounded-2xl bg-gray-100 border-2 border-gray-200 text-sm font-semibold text-gray-500 transition-all duration-150 hover:bg-gray-200 active:scale-95"
            aria-label="전체 삭제"
          >
            초기화
          </button>
          <button
            onClick={() => handleNumberPress("0")}
            className="h-[80px] rounded-2xl bg-white border-2 border-gray-200 text-2xl font-bold text-gray-900 transition-all duration-150 hover:bg-gray-50 hover:border-gray-300 active:scale-95 active:bg-gray-100 shadow-sm"
            aria-label="0"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="h-[80px] rounded-2xl bg-gray-100 border-2 border-gray-200 flex items-center justify-center transition-all duration-150 hover:bg-gray-200 active:scale-95"
            aria-label="삭제"
          >
            <Delete className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        {/* Submit button */}
        <Button
          onClick={handleSubmit}
          disabled={!code.trim() || processing}
          className={`w-full h-14 text-lg font-bold rounded-2xl transition-all duration-300 shadow-lg ${
            isCheckin
              ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200 disabled:bg-emerald-300"
              : "bg-blue-500 hover:bg-blue-600 shadow-blue-200 disabled:bg-blue-300"
          }`}
        >
          {processing
            ? "처리 중..."
            : isCheckin
            ? "등원 확인"
            : "하원 확인"}
        </Button>

        {/* Letter input support note */}
        <p className="text-center text-xs text-gray-400">
          키보드 숫자키 입력 또는 Enter로 확인할 수 있습니다
        </p>
      </div>
    </div>
  );
}
