"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Rocket, Zap } from "lucide-react";

export interface ComingSoonOverlayProps {
  feature: string;
  label: string;
  children: React.ReactNode;
}

type Burst = { id: number; x: number; y: number };

export function ComingSoonOverlay({ feature, label, children }: ComingSoonOverlayProps) {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const burstIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/feature-pressure?feature=${encodeURIComponent(feature)}`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        setCount(typeof json?.count === "number" ? json.count : 0);
      })
      .catch(() => {
        if (cancelled) return;
        setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [feature]);

  async function handlePress(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = (burstIdRef.current += 1);
    setBursts((prev) => [...prev, { id, x, y }]);
    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, 900);

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feature-pressure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature }),
      });
      const json = await res.json();
      if (!res.ok || typeof json?.count !== "number") {
        setError("처리 중 오류가 발생했습니다.");
      } else {
        setCount(json.count);
      }
    } catch {
      setError("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-140px)]">
      {/* Real page content with light blur — fully visible */}
      <div
        aria-hidden
        className="pointer-events-none select-none"
        style={{
          filter: "blur(3px)",
        }}
      >
        {children}
      </div>

      {/* Centered card on top — no dark overlay, page content visible behind */}
      <div className="absolute inset-0 z-20 flex items-start justify-center px-6 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-[480px] rounded-3xl border border-white/60 bg-white/85 px-8 py-9 text-center shadow-[0_30px_80px_-20px_rgba(15,23,42,0.25),0_0_0_1px_rgba(56,189,248,0.1)] backdrop-blur-2xl"
        >
          {/* Soft glow ring around card */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-3xl"
            style={{
              background:
                "linear-gradient(135deg, rgba(56,189,248,0.18), rgba(34,211,238,0.12), rgba(96,165,250,0.14))",
              filter: "blur(20px)",
              zIndex: -1,
            }}
          />

          {/* Glowing icon */}
          <div className="relative mx-auto mb-5 flex size-16 items-center justify-center">
            <div
              aria-hidden
              className="absolute inset-0 rounded-2xl blur-xl"
              style={{
                background:
                  "linear-gradient(135deg, rgba(56, 189, 248, 0.55), rgba(34, 211, 238, 0.45))",
              }}
            />
            <div
              className="relative flex size-16 items-center justify-center rounded-2xl"
              style={{
                background:
                  "linear-gradient(135deg, #38BDF8 0%, #22D3EE 100%)",
                boxShadow:
                  "0 14px 40px -10px rgba(56, 189, 248, 0.55), inset 0 1px 0 rgba(255,255,255,0.3)",
              }}
            >
              <Rocket className="size-7 text-white" strokeWidth={2.2} />
            </div>
          </div>

          {/* Pre-title pill */}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.2em] text-sky-700">
            <span
              className="size-1.5 rounded-full bg-sky-500"
              style={{ animation: "nara-pulse 1.6s ease-in-out infinite" }}
            />
            Coming Soon
          </div>

          {/* Title */}
          <h2 className="mt-4 text-[34px] font-black leading-[1.1] tracking-tight text-slate-900">
            {label}
          </h2>

          {/* Subtitle */}
          <p className="mx-auto mt-3 max-w-[380px] text-[13.5px] leading-relaxed text-slate-500">
            아직 준비 중인 기능이에요. 빨리 받아보고 싶으시면 아래를{" "}
            <span className="font-bold text-slate-800">세게, 여러 번</span> 눌러주세요.
            압박이 강할수록 우선순위가 올라갑니다.
          </p>

          {/* Big button */}
          <div className="relative mx-auto mt-7">
            <button
              type="button"
              onClick={handlePress}
              disabled={busy}
              className="group relative inline-flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl px-6 text-[15px] font-extrabold text-white transition-transform duration-150 active:scale-[0.985] disabled:cursor-wait"
              style={{
                background:
                  "linear-gradient(135deg, #38BDF8 0%, #22D3EE 50%, #3B82F6 100%)",
                boxShadow:
                  "0 16px 40px -12px rgba(56, 189, 248, 0.55), inset 0 1px 0 rgba(255,255,255,0.25)",
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
              />
              {busy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Zap className="size-5 fill-white" />
                  <span className="tracking-tight">이 기능 출시 압박하기!!</span>
                </>
              )}
              <AnimatePresence>
                {bursts.map((b) => (
                  <motion.span
                    key={b.id}
                    initial={{ opacity: 1, y: 0, scale: 1 }}
                    animate={{ opacity: 0, y: -70, scale: 1.6 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.85, ease: "easeOut" }}
                    className="pointer-events-none absolute text-[18px] font-black text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
                    style={{
                      left: b.x,
                      top: b.y,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    +1
                  </motion.span>
                ))}
              </AnimatePresence>
            </button>
          </div>

          {/* Counter */}
          <div className="mt-6 inline-flex flex-col items-center gap-0.5 rounded-2xl border border-slate-100 bg-white px-7 py-3.5 shadow-[0_4px_14px_-4px_rgba(15,23,42,0.08)]">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
              현재 압박 수
            </span>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={count ?? "loading"}
                initial={{ y: -8, opacity: 0, scale: 0.92 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 8, opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="text-[34px] font-black leading-tight tracking-tight tabular-nums"
                style={{
                  background:
                    "linear-gradient(135deg, #0EA5E9 0%, #06B6D4 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {count === null ? "—" : count.toLocaleString()}
              </motion.span>
            </AnimatePresence>
          </div>

          {error && (
            <p className="mt-3 text-[12px] font-semibold text-rose-500">{error}</p>
          )}

          <p className="mt-4 text-[11.5px] text-slate-400">
            여러 번 누를수록 더 강한 신호가 전달됩니다.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
