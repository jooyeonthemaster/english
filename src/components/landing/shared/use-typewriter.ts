"use client";

import { useEffect, useRef, useState } from "react";

export function useTypewriter(
  text: string,
  {
    speed = 22,
    start = true,
    startDelay = 0,
  }: { speed?: number; start?: boolean; startDelay?: number } = {},
) {
  const [output, setOutput] = useState("");
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!start) return;
    setOutput("");
    setDone(false);
    let i = 0;
    const tick = () => {
      i += 1;
      setOutput(text.slice(0, i));
      if (i >= text.length) {
        setDone(true);
        return;
      }
      timer.current = setTimeout(tick, speed);
    };
    const startTimer = setTimeout(tick, startDelay);
    return () => {
      clearTimeout(startTimer);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, speed, start, startDelay]);

  return { output, done };
}

export function useReducedMotionPref() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}
