"use client";

import { useRef } from "react";
import {
  ChevronRight,
  Cloud,
  FileText,
  Folder,
  FolderOpen,
  ListFilter,
  MoreHorizontal,
} from "lucide-react";
import { Reveal } from "./shared/reveal";

// 실제 워크벤치 보관함(FolderSection/FolderCard)의 시각 언어를 그대로 옮긴 목업 데이터.
const SUB_FOLDERS = [
  { name: "중간고사", count: 25, selected: true },
  { name: "기말고사", count: 18, selected: false },
];

const FILES = [
  { name: "빈칸추론_세트A", meta: "15문항 · 시험지", chip: "객관식" },
  { name: "어법판단_세트B", meta: "10문항 · 시험지", chip: "객관식" },
  { name: "중간대비_심층분석", meta: "22쪽 · 학습지", chip: "분석" },
];

export function FolderScene() {
  const ref = useRef<HTMLElement>(null);

  return (
    <section ref={ref} id="folder" className="relative w-full bg-white py-16 border-t border-blue-100 lg:flex lg:min-h-[100svh] lg:items-center lg:pt-28 lg:pb-10">
      <div className="w-full px-6 lg:px-16 max-w-[1480px] mx-auto">
        <div className="mb-6 max-w-[900px] text-center mx-auto">
          <Reveal className="text-[12px] uppercase tracking-[0.2em] text-[#3B82F6] font-bold mb-4 sm:text-[13px] sm:tracking-[0.25em] justify-center flex items-center gap-3" y={16}>
            <span className="h-[2px] w-7 bg-[#3B82F6] sm:w-8" />
            Feature · 아카이브와 학원 운영
            <span className="h-[2px] w-7 bg-[#3B82F6] sm:w-8" />
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="font-extrabold text-gray-900 leading-[1.2] break-keep" style={{ fontSize: "clamp(24px, 2.8vw, 38px)", letterSpacing: "-0.02em", wordBreak: "keep-all" }}>
              이 모든 것들을 철저하게
              <br />
              <span className="text-[#3B82F6] underline decoration-[#3B82F6] decoration-4 underline-offset-[3px] sm:underline-offset-[5px] lg:underline-offset-[7px]">파일 시스템 기반으로 관리</span>합니다.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-4 text-[15px] text-gray-600 leading-[1.7] font-medium max-w-2xl mx-auto break-keep">
              모든 결과물이 <strong className="text-gray-900 font-bold">학교·학년·연도 트리</strong>에 쌓여,
              <br className="lg:hidden" /> 내년에 그대로 꺼내 씁니다.
            </p>
          </Reveal>
        </div>

        {/* 실제 보관함 UI를 옮긴 파일 관리창 목업 */}
        <Reveal delay={0.12} className="mx-auto w-full max-w-3xl">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_70px_-32px_rgba(15,23,42,0.3)]">
            {/* 상단: 아이콘 타일 + 브레드크럼 + 현재 폴더 배지 + 정렬 */}
            <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <FolderOpen className="h-3.5 w-3.5" />
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="shrink-0 text-[13px] font-medium text-slate-500">시험지 보관함</span>
                <ChevronRight className="size-3 shrink-0 text-slate-300" aria-hidden="true" />
                <span className="shrink-0 text-[13px] font-medium text-slate-500">OO고등학교</span>
                <ChevronRight className="hidden size-3 shrink-0 text-slate-300 sm:inline" aria-hidden="true" />
                <span className="hidden shrink-0 text-[13px] font-medium text-slate-500 sm:inline">2026학년도 1학기</span>
                <ChevronRight className="size-3 shrink-0 text-slate-300" aria-hidden="true" />
                <span className="truncate text-[13px] font-bold text-slate-900">3학년</span>
                <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">현재 폴더</span>
                <span className="hidden shrink-0 text-[10.5px] font-medium text-slate-400 sm:inline">· 하위 폴더 2개</span>
              </div>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500">
                <ListFilter className="size-3.5" />
              </span>
            </div>

            {/* 본문: 폴더 카드 + 파일 행 */}
            <div className="space-y-3 bg-slate-50/60 p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {SUB_FOLDERS.map((f) => (
                  <div
                    key={f.name}
                    className={`group flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-3 transition-all hover:shadow-sm ${
                      f.selected
                        ? "border-blue-400 ring-2 ring-blue-300/30"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                      {f.selected ? (
                        <FolderOpen className="h-5 w-5 text-blue-600" />
                      ) : (
                        <Folder className="h-5 w-5 text-slate-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-slate-800">{f.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{f.count}개 문항</p>
                    </div>
                    <MoreHorizontal className="size-4 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {FILES.map((file, i) => (
                  <div
                    key={file.name}
                    className={`group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 transition-all hover:border-slate-300 hover:shadow-sm${
                      i === 2 ? " lg:[@media(max-height:820px)]:hidden" : ""
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50/60">
                      <FileText className="size-4 text-blue-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-slate-800">{file.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{file.meta}</p>
                    </div>
                    <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                      {file.chip}
                    </span>
                    <MoreHorizontal className="size-4 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                ))}
              </div>
            </div>

            {/* 하단: 클라우드 보관 안내 */}
            <div className="flex items-center justify-center gap-1.5 border-t border-slate-100 bg-white px-4 py-2.5 text-[11.5px] font-semibold text-slate-400">
              <Cloud className="size-3.5 text-blue-400" />
              생성된 모든 분석·시험지 파일은 클라우드에 안전하게 보관됩니다
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
