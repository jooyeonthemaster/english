"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookText,
  Languages,
  FileQuestion,
  User,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TOP_ITEMS = [
  {
    title: "핵심 지문 분석",
    subtitle: "교과서 지문",
    icon: BookText,
    href: "passages",
    gradient: "from-[#F1F8E9] to-[#E8F5E9]",
    iconColor: "#7CB342",
    accentBorder: "border-[#7CB342]/10",
  },
  {
    title: "영단어 학습",
    subtitle: "단어 암기",
    icon: Languages,
    href: "vocab",
    gradient: "from-[#F9FBE7] to-[#F1F8E9]",
    iconColor: "#8BC34A",
    accentBorder: "border-[#8BC34A]/10",
  },
  {
    title: "시험 해설",
    subtitle: "기출 & AI 답변",
    icon: FileQuestion,
    href: "exams",
    gradient: "from-[#FFF3E0] to-[#FFF8E1]",
    iconColor: "#FFA726",
    accentBorder: "border-[#FFA726]/10",
  },
];

const MYPAGE_ITEM = {
  title: "마이페이지",
  description: "학습 현황과 오답 노트를 확인하세요",
  icon: User,
  href: "mypage",
};

function getKoreanDate(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const weekday = weekdays[now.getDay()];
  return `${month}월 ${day}일 ${weekday}요일`;
}

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.03, delayChildren: 0 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.15, ease: "easeOut" as const },
  },
};

export function HomeCards({ schoolSlug }: { schoolSlug: string }) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-5 px-5 py-6"
    >
      {/* Hero greeting */}
      <motion.div variants={itemVariants} className="mb-1">
        <p className="text-[12px] font-bold uppercase tracking-widest text-[#7CB342] mb-1">
          {getKoreanDate()}
        </p>
        <h2 className="text-[24px] font-bold tracking-tight text-[#1A1F16] leading-tight">
          안녕하세요!
        </h2>
        <p className="mt-1 text-[14px] font-medium text-[#6B7265]">
          오늘도 함께 영어 실력을 키워봐요
        </p>
      </motion.div>

      {/* Decorative dots */}
      <motion.div variants={itemVariants} className="flex items-center gap-1.5 mb-0">
        <div className="h-[2px] w-6 rounded-full bg-[#7CB342]/20" />
        <div className="size-1 rounded-full bg-[#7CB342]/30" />
        <div className="size-1 rounded-full bg-[#AED581]/20" />
      </motion.div>

      {/* 2-column grid for top 3 items: first 2 side-by-side, third full-width */}
      <div className="grid grid-cols-2 gap-3">
        {TOP_ITEMS.map((item, index) => (
          <motion.div
            key={item.href}
            variants={itemVariants}
            className={cn(index === 2 && "col-span-2")}
          >
            <Link
              href={`/${schoolSlug}/${item.href}`}
              className={cn(
                "group relative flex overflow-hidden rounded-2xl border bg-gradient-to-br p-5 transition-all duration-300",
                "hover:-translate-y-0.5 hover:shadow-card-hover",
                "active:scale-[0.97] press-scale",
                item.gradient,
                item.accentBorder,
                index === 2 ? "flex-row items-center gap-4" : "flex-col gap-3.5"
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  "flex items-center justify-center rounded-xl bg-white/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
                  index === 2 ? "size-12" : "size-11"
                )}
              >
                <item.icon
                  className={cn(
                    "transition-transform duration-300 group-hover:scale-110",
                    index === 2 ? "size-6" : "size-5"
                  )}
                  style={{ color: item.iconColor }}
                  strokeWidth={2}
                />
              </div>

              {/* Text */}
              <div className={cn("flex-1", index === 2 && "flex flex-col")}>
                <p className="text-[16px] font-bold tracking-tight text-[#1A1F16]">
                  {item.title}
                </p>
                <p className="text-[12px] font-medium text-[#6B7265] mt-0.5">
                  {item.subtitle}
                </p>
              </div>

              {/* Arrow */}
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <ArrowUpRight
                  className="size-4 text-[#9CA396]"
                  strokeWidth={2.2}
                />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* MyPage card - dark variant */}
      <motion.div variants={itemVariants}>
        <Link
          href={`/${schoolSlug}/${MYPAGE_ITEM.href}`}
          className="group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-[#1B2E1B] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(27,46,27,0.25)] active:scale-[0.97] press-scale"
        >
          {/* Subtle gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#2E4A2E]/0 via-[#2E4A2E]/30 to-[#2E4A2E]/0" />

          <div className="relative flex size-12 items-center justify-center rounded-xl bg-white/10">
            <MYPAGE_ITEM.icon
              className="size-6 text-white/80 transition-transform duration-300 group-hover:scale-110"
              strokeWidth={1.8}
            />
          </div>
          <div className="relative flex-1">
            <p className="text-[16px] font-bold tracking-tight text-white">
              {MYPAGE_ITEM.title}
            </p>
            <p className="text-[12px] font-medium text-white/50 mt-0.5">
              {MYPAGE_ITEM.description}
            </p>
          </div>
          <ArrowUpRight className="relative size-4 text-white/30 transition-all duration-200 group-hover:text-white/60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.2} />
        </Link>
      </motion.div>
    </motion.div>
  );
}
