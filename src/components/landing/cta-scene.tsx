"use client";

import Link from "next/link";

export function CtaScene() {
  return (
    <footer className="w-full bg-white border-t border-gray-200/60 py-12">
      <div className="max-w-[1440px] mx-auto px-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
            <span className="text-gray-900 font-black text-base tracking-widest uppercase">
              SMOAT
            </span>
            <span className="text-gray-400 text-xs sm:text-sm font-bold">
              Intelligent English Authoring
            </span>
          </div>
          <div className="text-gray-400 text-xs flex flex-wrap items-center justify-center sm:justify-start gap-y-2.5 gap-x-4 md:gap-x-6 font-medium">
            <span className="whitespace-nowrap">© 2026 SMOAT</span>
            <span aria-hidden className="hidden sm:inline text-gray-200">·</span>
            <a href="mailto:support@smoat.ai" className="hover:text-gray-900 transition whitespace-nowrap">
              support@smoat.ai
            </a>
            <span aria-hidden className="hidden sm:inline text-gray-200">·</span>
            <Link href="/terms" className="hover:text-gray-900 transition whitespace-nowrap">
              이용약관
            </Link>
            <span aria-hidden className="hidden sm:inline text-gray-200">·</span>
            <Link href="/privacy" className="hover:text-gray-900 transition whitespace-nowrap">
              개인정보처리방침
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
