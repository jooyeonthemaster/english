"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, LogIn } from "lucide-react";
import { LoginModal } from "./login-modal";

const NAV_ITEMS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "#section-annotation", label: "필기 기반 분석" },
  { href: "#section-question", label: "출제 기반 생성" },
  { href: "#section-exam", label: "Word 시험지" },
  { href: "#section-folder", label: "파일 아카이브" },
];

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <motion.header
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-white/72 backdrop-blur-2xl shadow-[0_1px_0_rgba(15,23,42,0.06)]"
            : "bg-transparent"
        }`}
      >
        <div
          className={`mx-auto flex max-w-[1240px] items-center justify-between gap-4 transition-[padding,height] duration-300 ${
            scrolled ? "h-16 px-4 sm:px-6" : "h-20 px-4 sm:px-6 lg:px-8"
          }`}
        >
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-2xl bg-slate-950 text-[13px] font-black text-white shadow-[0_16px_32px_-22px_rgba(15,23,42,0.8)] transition group-hover:bg-blue-600">
              영
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[18px] font-black tracking-normal text-slate-950 transition-colors group-hover:text-blue-600">
                영신ai
              </span>
              <span className="hidden text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 sm:block">
                English AI Workbench
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-white/80 bg-white/68 p-1 text-[12px] font-black text-slate-500 shadow-[0_18px_52px_-38px_rgba(15,23,42,0.7)] backdrop-blur-2xl md:flex">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-2 transition-colors hover:bg-blue-50 hover:text-blue-700"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-transparent px-3 text-[13px] font-black text-slate-700 transition hover:border-slate-200 hover:bg-white/80 hover:text-slate-950 sm:px-4"
            >
              <LogIn className="size-4" />
              <span className="hidden sm:inline">로그인</span>
            </button>
            <Link
              href="/register"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-slate-950 px-4 text-[13px] font-black text-white shadow-[0_16px_40px_-24px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:bg-blue-600"
            >
              <span className="hidden sm:inline">학원 가입 신청</span>
              <span className="sm:hidden">신청</span>
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </motion.header>

      <LoginModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
