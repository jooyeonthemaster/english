"use client";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  BookOpen,
  Languages,
  Volume2,
  Tag,
  ListOrdered,
  GraduationCap,
} from "lucide-react";
import type { DetailInfo, VocabItem, GrammarPoint } from "@/types/passage-analysis";

interface DetailDrawerProps {
  detail: DetailInfo | null;
  onClose: () => void;
}

const DIFFICULTY_CONFIG = {
  basic: { label: "기본", color: "#7CB342", bg: "#F1F8E9" },
  intermediate: { label: "심화", color: "#F59E0B", bg: "#FEF3C7" },
  advanced: { label: "고난도", color: "#EF5350", bg: "#FFEBEE" },
};

export function DetailDrawer({ detail, onClose }: DetailDrawerProps) {
  return (
    <Drawer open={!!detail} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[#E5E7E0]" />

        {detail?.type === "vocab" && (
          <VocabDetail data={detail.data} />
        )}

        {detail?.type === "grammar" && (
          <GrammarDetail data={detail.data} />
        )}

        {detail?.type === "sentence" && (
          <SentenceDetail
            sentence={detail.data}
            vocab={detail.vocab}
            grammar={detail.grammar}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function VocabDetail({ data }: { data: VocabItem }) {
  const diffConfig = DIFFICULTY_CONFIG[data.difficulty];

  return (
    <div className="px-5 pb-8 pt-4">
      <DrawerHeader className="p-0 text-left">
        {/* Badges */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold"
            style={{ color: diffConfig.color, backgroundColor: diffConfig.bg }}
          >
            {diffConfig.label}
          </span>
          <span className="rounded-full bg-[#F3F4F0] px-2.5 py-[3px] text-[11px] font-medium text-[#6B7265]">
            {data.partOfSpeech}
          </span>
        </div>

        {/* Word */}
        <DrawerTitle className="text-[22px] font-bold tracking-[-0.03em] text-[#1A1F16]">
          {data.word}
        </DrawerTitle>

        {/* Pronunciation */}
        <DrawerDescription className="mt-1 flex items-center gap-1.5 text-[13px] text-[#9CA396]">
          <Volume2 className="size-3.5" />
          {data.pronunciation}
        </DrawerDescription>
      </DrawerHeader>

      {/* Divider */}
      <div className="my-4 h-px bg-[#E5E7E0]" />

      {/* Meaning */}
      <div className="flex items-start gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#FEF3C7]">
          <Languages className="size-3.5 text-[#F59E0B]" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#9CA396] mb-1">뜻</p>
          <p className="text-[15px] font-medium leading-relaxed text-[#252B20]">
            {data.meaning}
          </p>
        </div>
      </div>
    </div>
  );
}

function GrammarDetail({ data }: { data: GrammarPoint }) {
  return (
    <div className="px-5 pb-8 pt-4">
      <DrawerHeader className="p-0 text-left">
        {/* Level badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className="rounded-full bg-[#F1F8E9] px-2.5 py-[3px] text-[11px] font-semibold text-[#7CB342]">
            {data.level}
          </span>
        </div>

        {/* Pattern name */}
        <DrawerTitle className="text-[20px] font-bold tracking-[-0.03em] text-[#1A1F16]">
          {data.pattern}
        </DrawerTitle>

        <DrawerDescription className="sr-only">
          문법 패턴 상세 설명
        </DrawerDescription>
      </DrawerHeader>

      {/* Divider */}
      <div className="my-4 h-px bg-[#E5E7E0]" />

      {/* Explanation */}
      <div className="flex items-start gap-2.5 mb-5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#F1F8E9]">
          <BookOpen className="size-3.5 text-[#7CB342]" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#9CA396] mb-1">설명</p>
          <p className="text-[14px] leading-[1.7] text-[#343B2E]">
            {data.explanation}
          </p>
        </div>
      </div>

      {/* Text from passage */}
      <div className="flex items-start gap-2.5 mb-5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#F3F4F0]">
          <Tag className="size-3.5 text-[#6B7265]" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#9CA396] mb-1">
            지문 속 예시
          </p>
          <p className="text-[14px] leading-[1.7] text-[#252B20] italic">
            &ldquo;{data.textFragment}&rdquo;
          </p>
        </div>
      </div>

      {/* Additional examples */}
      <div className="flex items-start gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#F3F4F0]">
          <ListOrdered className="size-3.5 text-[#6B7265]" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#9CA396] mb-1.5">
            추가 예문
          </p>
          <ul className="space-y-1.5">
            {data.examples.map((ex, i) => (
              <li
                key={i}
                className="text-[13px] leading-[1.6] text-[#4A5043] pl-3 relative before:absolute before:left-0 before:top-[0.6em] before:size-1 before:rounded-full before:bg-[#C8CCC2]"
              >
                {ex}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SentenceDetail({
  sentence,
  vocab,
  grammar,
}: {
  sentence: { english: string; korean: string; index: number };
  vocab: VocabItem[];
  grammar: GrammarPoint[];
}) {
  return (
    <div className="px-5 pb-8 pt-4">
      <DrawerHeader className="p-0 text-left">
        <div className="flex items-center gap-2 mb-3">
          <span className="rounded-full bg-[#F3F4F0] px-2.5 py-[3px] text-[11px] font-semibold text-[#6B7265]">
            문장 {sentence.index + 1}
          </span>
        </div>
        <DrawerTitle className="text-[15px] font-semibold leading-[1.7] tracking-[-0.01em] text-[#1A1F16]">
          {sentence.english}
        </DrawerTitle>
        <DrawerDescription className="sr-only">문장 상세 분석</DrawerDescription>
      </DrawerHeader>

      <div className="my-3 rounded-lg bg-[#F1F8E9]/60 px-3 py-2.5 border border-[#C5E1A5]/30">
        <p className="text-[13px] leading-[1.7] text-[#4A5043]">
          {sentence.korean}
        </p>
      </div>

      {vocab.length > 0 && (
        <>
          <div className="my-3 h-px bg-[#E5E7E0]" />
          <div className="flex items-center gap-1.5 mb-2">
            <Languages className="size-3.5 text-[#F59E0B]" />
            <p className="text-[12px] font-semibold text-[#6B7265]">
              핵심 어휘
            </p>
          </div>
          <div className="space-y-2">
            {vocab.map((v) => (
              <div
                key={v.word}
                className="flex items-center justify-between rounded-lg bg-[#FAFBF8] px-3 py-2"
              >
                <div>
                  <span className="text-[13px] font-semibold text-[#252B20]">
                    {v.word}
                  </span>
                  <span className="ml-2 text-[12px] text-[#9CA396]">
                    {v.partOfSpeech}
                  </span>
                </div>
                <span className="text-[13px] text-[#4A5043]">
                  {v.meaning}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {grammar.length > 0 && (
        <>
          <div className="my-3 h-px bg-[#E5E7E0]" />
          <div className="flex items-center gap-1.5 mb-2">
            <GraduationCap className="size-3.5 text-[#7CB342]" />
            <p className="text-[12px] font-semibold text-[#6B7265]">
              문법 포인트
            </p>
          </div>
          <div className="space-y-2">
            {grammar.map((g) => (
              <div
                key={g.id}
                className="rounded-lg bg-[#FAFBF8] px-3 py-2"
              >
                <p className="text-[13px] font-semibold text-[#7CB342] mb-0.5">
                  {g.pattern}
                </p>
                <p className="text-[12px] leading-[1.6] text-[#4A5043]">
                  {g.explanation}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
