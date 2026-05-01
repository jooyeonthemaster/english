"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ArrowRight,
  School as SchoolIcon,
  LogIn,
  Sparkles,
  Menu,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface School {
  id: string;
  name: string;
  slug: string;
  type: string;
  hasAnalysis: boolean;
}

interface SchoolSelectionClientProps {
  schools: School[];
}

export function SchoolSelectionClient({ schools }: SchoolSelectionClientProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = search
      ? schools.filter((s) =>
          s.name.toLowerCase().includes(search.toLowerCase())
        )
      : schools;

    // Sort: analyzed schools first
    return [...list].sort((a, b) => {
      if (a.hasAnalysis && !b.hasAnalysis) return -1;
      if (!a.hasAnalysis && b.hasAnalysis) return 1;
      return 0;
    });
  }, [schools, search]);

  const analyzedCount = schools.filter((s) => s.hasAnalysis).length;

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[#FAFBF8]">
      {/* Soft gradient background */}
      <div className="pointer-events-none absolute inset-0 gradient-mesh" />
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-[320px] gradient-hero opacity-70" />

      {/* Top App Bar (Sticky) */}
      <header className="sticky top-0 z-50 flex h-16 w-full max-w-[480px] mx-auto items-center justify-between px-5 bg-[#FAFBF8]/85 backdrop-blur-xl border-b border-transparent transition-all sm:border-[#E5E7E0]/40 supports-[backdrop-filter]:bg-[#FAFBF8]/60">
        <button className="flex size-[42px] z-10 items-center justify-center rounded-[14px] bg-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06)] border border-[#E5E7E0]/60 active:scale-95 transition-transform text-[#1C1C1E] hover:bg-[#F3F4F0]">
          <Menu className="size-[22px]" />
        </button>
        <span className="absolute left-1/2 -translate-x-1/2 text-[14px] font-extrabold tracking-[0.12em] text-[#9CA396] select-none">
          다른 영어학원
        </span>
        <div className="size-[42px] shrink-0" />
      </header>

      <div className="relative z-10 flex flex-1 flex-col px-5 pb-8 pt-6 w-full max-w-[480px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.05 }}
          className="mb-8 flex items-center justify-between"
        >
          <h1 className="text-[32px] font-bold tracking-tight text-[#1C1C1E] leading-[1.25]">
            어떤 학교를<br />
            다니고 있나요?
          </h1>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22, delay: 0.1 }}
            className="relative flex size-[56px] shrink-0 items-center justify-center rounded-full overflow-hidden border border-[#E5E7E0]/60 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] bg-white"
          >
            <img
              src="https://api.dicebear.com/7.x/notionists/svg?seed=YshinStudent&backgroundColor=f2f2f7"
              alt="Profile"
              className="size-full object-cover"
            />
          </motion.div>
        </motion.div>

        {/* Search Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.1 }}
          className="relative mb-8 overflow-hidden rounded-[32px] bg-gradient-to-br from-[#7CB342] to-[#689F38] p-6 shadow-xl shadow-[#7CB342]/15 sm:p-7 sm:pb-8"
        >
          <div className="absolute -right-8 -top-8 size-32 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute -left-8 -bottom-8 size-32 rounded-full bg-[#558B2F]/40 blur-2xl" />

          <div className="relative z-10 flex flex-col h-full">
            <h2 className="text-[22px] font-extrabold text-white mb-1.5 drop-shadow-sm">
              학교 찾기
            </h2>
            <p className="text-white/90 font-medium text-[15px] mb-6">
              맞춤형 내신 자료를 위해 학교를 검색해주세요
            </p>

            <div className="relative group mt-auto">
              <Search className="absolute left-4 top-1/2 size-[22px] -translate-y-1/2 text-[#7CB342] transition-transform duration-300 group-focus-within:scale-110" />
              <Input
                placeholder="학교 이름 검색 (예: 배재고)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-[56px] rounded-[20px] border-0 bg-white pl-[46px] pr-5 text-[16px] text-[#1A1F16] placeholder:text-[#9CA396] focus-visible:ring-4 focus-visible:ring-white/30 transition-all font-bold placeholder:font-medium shadow-inner"
              />
            </div>
          </div>
        </motion.div>

        {/* Section header */}
        <div className="sticky top-16 z-40 -mx-5 px-5 pt-3 pb-5 mb-2 bg-[#FAFBF8]/95 backdrop-blur-xl border-b border-[#E5E7E0]/40 supports-[backdrop-filter]:bg-[#FAFBF8]/70 transition-colors duration-300">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[19px] font-bold tracking-tight text-[#1A1F16]">
              고등학교
            </h3>
            <div className="flex items-center gap-2">
              {analyzedCount > 0 && (
                <div className="flex items-center gap-1 rounded-full bg-[#F1F8E9] px-2.5 py-1">
                  <Sparkles className="size-3 text-[#7CB342]" />
                  <span className="text-[11px] font-bold text-[#7CB342]">
                    AI 분석 {analyzedCount}
                  </span>
                </div>
              )}
              <div className="flex items-center rounded-full bg-[#F1F8E9] px-3 py-1">
                <span className="text-[13px] font-extrabold text-[#7CB342]">전체 {filtered.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* School list */}
        <div className="flex-1">
          <SchoolList schools={filtered} />
        </div>

        {/* Login link card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.3 }}
          className="mt-8 pb-6"
        >
          <Link
            href="/login"
            className="group flex items-center gap-4 rounded-[24px] bg-white p-4 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] border border-[#E5E7E0]/40 transition-all duration-300 hover:shadow-md hover:border-[#7CB342]/20 active:scale-[0.98]"
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-[#F1F8E9]">
              <LogIn className="size-[20px] text-[#7CB342] transition-transform duration-300 group-hover:scale-110" strokeWidth={2.2} />
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-extrabold text-[#1A1F16]">
                이미 학생 계정이 있나요?
              </p>
              <p className="text-[13px] font-medium text-[#6B7265] mt-0.5">
                로그인하여 학습을 계속하세요
              </p>
            </div>
            <ArrowRight className="size-5 text-[#9CA396] transition-transform duration-300 group-hover:translate-x-1" strokeWidth={2.2} />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

function SchoolList({ schools }: { schools: School[] }) {
  if (schools.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-20 text-center"
      >
        <div className="size-14 rounded-2xl bg-white shadow-card flex items-center justify-center mb-4">
          <Search className="size-6 text-[#9CA396]" />
        </div>
        <p className="text-[15px] font-bold text-[#343B2E] mb-1">
          검색 결과가 없어요
        </p>
        <p className="text-[13px] font-medium text-[#9CA396]">
          다른 검색어로 다시 시도해보세요
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
      }}
      className="flex flex-col gap-3"
    >
      <AnimatePresence mode="popLayout">
        {schools.map((school) => (
          <motion.div
            key={school.id}
            variants={{
              hidden: { opacity: 0, y: 10, scale: 0.97 },
              show: {
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { type: "spring", stiffness: 380, damping: 28 },
              },
            }}
            layout
          >
            <Link
              href={`/${school.slug}`}
              className={cn(
                "group relative flex items-center gap-4 py-4 px-4 overflow-hidden rounded-[24px] bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] border transition-all duration-300 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.08)] active:scale-[0.97] press-scale",
                school.hasAnalysis
                  ? "border-[#7CB342]/25 hover:border-[#7CB342]/40"
                  : "border-[#E5E7E0]/40 hover:border-[#7CB342]/20"
              )}
            >
              {/* Hover gradient overlay */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#F1F8E9]/0 to-[#F1F8E9]/0 group-hover:from-[#F1F8E9]/60 group-hover:to-transparent transition-all duration-500" />

              <div className={cn(
                "relative flex size-[52px] shrink-0 items-center justify-center rounded-[16px] transition-all duration-300",
                school.hasAnalysis
                  ? "bg-[#F1F8E9] group-hover:bg-[#E8F5E9]"
                  : "bg-[#F7F8F5] group-hover:bg-[#F1F8E9]"
              )}>
                <SchoolIcon className={cn(
                  "size-[22px] transition-all duration-300 group-hover:scale-110",
                  school.hasAnalysis
                    ? "text-[#7CB342]"
                    : "text-[#9CA396] group-hover:text-[#7CB342]"
                )} strokeWidth={2} />
              </div>

              <div className="relative flex-1 min-w-0">
                <span className="block text-[17px] font-extrabold tracking-tight text-[#1A1F16]">
                  {school.name}
                </span>
                {school.hasAnalysis && (
                  <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-[#F1F8E9] px-2 py-0.5">
                    <Sparkles className="size-2.5 text-[#7CB342]" />
                    <span className="text-[10px] font-bold text-[#7CB342]">
                      AI 지문 분석 완료
                    </span>
                  </span>
                )}
              </div>

              <div className="relative flex size-8 items-center justify-center rounded-full bg-white">
                <ArrowRight className="size-[18px] text-[#C8CCC2] group-hover:text-[#7CB342] transition-all duration-300 group-hover:translate-x-1" strokeWidth={2.5} />
              </div>
            </Link>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
