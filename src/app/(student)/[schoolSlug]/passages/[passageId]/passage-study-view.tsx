"use client";

import { useState, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { usePassageAnalysis } from "@/hooks/use-passage-analysis";
import { StudyModeToggle } from "@/components/passage/study-mode-toggle";
import { SentenceBlock } from "@/components/passage/sentence-block";
import { DetailDrawer } from "@/components/passage/detail-drawer";
import { StructureCard } from "@/components/passage/structure-card";
import { VocabListPanel } from "@/components/passage/vocab-list-panel";
import { AnalysisSkeleton } from "@/components/passage/analysis-skeleton";
import type {
  PassageAnalysisData,
  DetailInfo,
} from "@/types/passage-analysis";

interface PassageStudyViewProps {
  passageId: string;
  content: string;
  initialAnalysis: PassageAnalysisData | null;
}

export function PassageStudyView({
  passageId,
  content,
  initialAnalysis,
}: PassageStudyViewProps) {
  const [mode, setMode] = useState<"read" | "study">("read");
  const [activeDetail, setActiveDetail] = useState<DetailInfo | null>(null);

  const { analysis, isLoading, error, generate } = usePassageAnalysis({
    passageId,
    initialAnalysis,
  });

  const handleModeChange = useCallback(
    (newMode: "read" | "study") => {
      setMode(newMode);
      if (newMode === "study" && !analysis && !isLoading) {
        generate();
      }
    },
    [analysis, isLoading, generate]
  );

  const handleDetailOpen = useCallback((info: DetailInfo) => {
    setActiveDetail(info);
  }, []);

  const handleDetailClose = useCallback(() => {
    setActiveDetail(null);
  }, []);

  // Pre-compute vocab/grammar per sentence for study mode
  const sentenceData = useMemo(() => {
    if (!analysis) return null;
    return analysis.sentences.map((sentence) => ({
      sentence,
      vocab: analysis.vocabulary.filter(
        (v) => v.sentenceIndex === sentence.index
      ),
      grammar: analysis.grammarPoints.filter(
        (g) => g.sentenceIndex === sentence.index
      ),
    }));
  }, [analysis]);

  return (
    <>
      {/* Mode toggle */}
      <div
        className="animate-float-up mx-5"
        style={{ animationDelay: "0.04s" }}
      >
        <StudyModeToggle
          mode={mode}
          onModeChange={handleModeChange}
          isLoading={isLoading}
        />
      </div>

      {/* Content area */}
      <AnimatePresence mode="wait">
        {mode === "read" ? (
          /* ── Reading Mode ── */
          <motion.div
            key="read"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="animate-float-up mx-5 rounded-2xl bg-[#FAFBF8] p-5 shadow-card"
            style={{ animationDelay: "0.06s" }}
          >
            <p className="text-[15px] leading-[1.9] tracking-[-0.01em] text-[#252B20] whitespace-pre-wrap selection:bg-[#7CB342]/15">
              {content}
            </p>
          </motion.div>
        ) : (
          /* ── Study Mode ── */
          <motion.div
            key="study"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-3 px-5"
          >
            {isLoading && <AnalysisSkeleton />}

            {error && (
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-[#FFEBEE] p-6">
                <p className="text-[13px] text-[#EF5350] font-medium">
                  {error}
                </p>
                <button
                  onClick={() => generate()}
                  className="flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-[#EF5350] shadow-card transition-all hover:shadow-card-hover active:scale-95"
                >
                  <RotateCcw className="size-3.5" />
                  다시 시도
                </button>
              </div>
            )}

            {analysis && sentenceData && (
              <>
                {/* Structure analysis card */}
                <StructureCard structure={analysis.structure} />

                {/* Sentence blocks */}
                <div className="flex flex-col gap-2">
                  {sentenceData.map((sd) => (
                    <SentenceBlock
                      key={sd.sentence.index}
                      sentence={sd.sentence}
                      vocabItems={sd.vocab}
                      grammarPoints={sd.grammar}
                      onDetailOpen={handleDetailOpen}
                    />
                  ))}
                </div>

                {/* Vocabulary list panel */}
                <VocabListPanel
                  vocabulary={analysis.vocabulary}
                  onDetailOpen={handleDetailOpen}
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail drawer */}
      <DetailDrawer detail={activeDetail} onClose={handleDetailClose} />
    </>
  );
}
