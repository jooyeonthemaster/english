"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { QuestionSample } from "../shared/mock-data";
import { CIRCLED, type GenerationState } from "./types";

export function ShapeBody({
  sample,
  generation,
  reduced,
}: {
  sample: QuestionSample;
  generation: GenerationState;
  reduced: boolean;
}) {
  switch (sample.shape) {
    case "mcq":
      return <McqBody sample={sample} generation={generation} reduced={reduced} />;
    case "insert":
      return <InsertBody sample={sample} generation={generation} reduced={reduced} />;
    case "ordering":
      return <OrderingBody sample={sample} generation={generation} reduced={reduced} />;
    case "write":
      return <WriteBody sample={sample} generation={generation} reduced={reduced} />;
    case "blanks":
      return <BlanksBody sample={sample} generation={generation} reduced={reduced} />;
    case "arrange":
      return <ArrangeBody sample={sample} generation={generation} reduced={reduced} />;
    case "correct":
      return <CorrectBody sample={sample} generation={generation} reduced={reduced} />;
    default:
      return null;
  }
}

function GivenBox({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="px-5 py-3.5 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-[15px] text-blue-900 leading-[1.7] font-medium relative">
      {label && (
        <span className="absolute -top-2 left-4 text-[10px] uppercase tracking-[0.18em] font-extrabold text-blue-500 bg-white px-1.5">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

function McqBody({
  sample,
  generation,
  reduced,
}: {
  sample: QuestionSample;
  generation: GenerationState;
  reduced: boolean;
}) {
  const opts = sample.options ?? [];
  const showGiven = generation.phase !== "stem" && (sample.given?.length ?? 0) > 0;
  const showOptions =
    generation.phase === "options" ||
    generation.phase === "answer" ||
    generation.phase === "done";

  return (
    <div className="space-y-4">
      {sample.given && (
        <AnimatePresence>
          {showGiven && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <GivenBox label="원문 인용">
                {generation.given}
                {generation.phase === "given" && !reduced && (
                  <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-blue-700 ml-[2px] animate-[blink_0.7s_step-end_infinite]" />
                )}
              </GivenBox>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {showOptions && (
        <ul className="space-y-2">
          {opts.map((opt, i) => {
            const visibleText = generation.options[i] ?? "";
            const isVisible =
              visibleText.length > 0 ||
              generation.phase === "done" ||
              generation.phase === "answer";
            const isTyping = generation.activeOptionIndex === i;
            const isCorrect =
              generation.answerVisible && CIRCLED.indexOf(sample.answer) === i;
            return (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: isVisible ? 1 : 0.2, x: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex items-start gap-3 px-4 py-2.5 rounded-xl border transition-all ${
                  isCorrect
                    ? "bg-blue-50 border-[#3B82F6] shadow-[0_4px_14px_rgba(59,130,246,0.18)]"
                    : isTyping
                    ? "bg-[#F8FAFC] border-blue-200"
                    : "bg-white border-blue-50"
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-[24px] h-[24px] rounded-full text-[12px] font-bold flex-shrink-0 ${
                    isCorrect ? "bg-[#3B82F6] text-white" : "bg-blue-50 text-blue-600"
                  }`}
                >
                  {CIRCLED[i] ?? `${i + 1}.`}
                </span>
                <span
                  className={`text-[15px] font-medium leading-[1.5] ${
                    isCorrect ? "text-blue-900 font-bold" : "text-gray-800"
                  }`}
                >
                  {visibleText || (reduced ? opt : "")}
                  {isTyping && !reduced && (
                    <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-[#3B82F6] ml-[1px] animate-[blink_0.7s_step-end_infinite]" />
                  )}
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function InsertBody({
  sample,
  generation,
  reduced,
}: {
  sample: QuestionSample;
  generation: GenerationState;
  reduced: boolean;
}) {
  const showGiven = generation.phase !== "stem";
  const showSlots =
    generation.phase === "options" ||
    generation.phase === "answer" ||
    generation.phase === "done";
  const correctIdx = CIRCLED.indexOf(sample.answer);

  return (
    <div className="space-y-4">
      {showGiven && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="px-5 py-3.5 rounded-xl bg-blue-50 border-l-4 border-[#3B82F6] text-[15px] text-blue-900 italic leading-[1.7] font-semibold relative">
            <span className="absolute -top-2 left-4 text-[10px] uppercase tracking-[0.18em] font-extrabold text-blue-500 bg-white px-1.5 not-italic">
              삽입 문장
            </span>
            <span className="text-blue-400 mr-2">«</span>
            {generation.given}
            <span className="text-blue-400 ml-2">»</span>
            {generation.phase === "given" && !reduced && (
              <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-blue-700 ml-[2px] animate-[blink_0.7s_step-end_infinite]" />
            )}
          </div>
        </motion.div>
      )}

      {showSlots && (
        <div className="rounded-xl bg-[#F8FAFC] border border-blue-100 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] font-extrabold text-blue-500 mb-2">
            삽입 위치 후보
          </div>
          <p className="text-[13px] text-gray-700 leading-[1.9] font-serif">
            Attention has become the most valuable currency.
            {[1, 2, 3, 4, 5].map((n, idx) => {
              const isCorrect = idx === correctIdx;
              return (
                <span key={n}>
                  {" "}
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: idx * 0.08, duration: 0.25 }}
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-extrabold border-2 ${
                      isCorrect && generation.answerVisible
                        ? "bg-[#3B82F6] text-white border-[#3B82F6] shadow-[0_0_0_4px_rgba(59,130,246,0.2)]"
                        : "bg-white text-blue-600 border-blue-200"
                    }`}
                  >
                    {CIRCLED[idx]}
                  </motion.span>{" "}
                  <span className="text-gray-500 text-[12px]">
                    {n === 1 && "Apps compete for it."}
                    {n === 2 && "Notifications fragment focus."}
                    {n === 3 && "Yet abundance arrived."}
                    {n === 4 && "Habits silently re-form."}
                    {n === 5 && "We must protect it."}
                  </span>
                </span>
              );
            })}
          </p>
        </div>
      )}
    </div>
  );
}

function OrderingBody({
  sample,
  generation,
  reduced,
}: {
  sample: QuestionSample;
  generation: GenerationState;
  reduced: boolean;
}) {
  const showGiven = generation.phase !== "stem";
  const showParas = generation.phase !== "stem";
  const showOptions =
    generation.phase === "options" ||
    generation.phase === "answer" ||
    generation.phase === "done";
  const opts = sample.options ?? [];
  const correctIdx = CIRCLED.indexOf(sample.answer);

  return (
    <div className="space-y-3">
      {showGiven && sample.given && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <GivenBox label="주어진 글">{generation.given}</GivenBox>
        </motion.div>
      )}
      {showParas && sample.paragraphs && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {sample.paragraphs.map((p, i) => (
            <motion.div
              key={p.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.12, duration: 0.3 }}
              className="rounded-lg border border-blue-100 bg-white p-3"
            >
              <div className="text-[11px] uppercase font-extrabold text-blue-500 tracking-[0.18em] mb-1">
                ({p.label})
              </div>
              <div className="text-[12px] text-gray-700 leading-[1.55]">{p.body}</div>
            </motion.div>
          ))}
        </div>
      )}
      {showOptions && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5 pt-1">
          {opts.map((opt, i) => {
            const visibleText = generation.options[i] ?? "";
            const isCorrect = generation.answerVisible && i === correctIdx;
            return (
              <div
                key={i}
                className={`text-center px-2 py-2 rounded-lg border text-[12px] font-mono font-bold ${
                  isCorrect
                    ? "bg-[#3B82F6] text-white border-[#3B82F6] shadow-[0_4px_14px_rgba(59,130,246,0.25)]"
                    : "bg-white text-gray-700 border-blue-100"
                }`}
              >
                <span className="block text-[10px] text-blue-400 mb-0.5">{CIRCLED[i]}</span>
                {visibleText || (reduced ? opt : "")}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WriteBody({
  sample,
  generation,
  reduced,
}: {
  sample: QuestionSample;
  generation: GenerationState;
  reduced: boolean;
}) {
  const showPrompt = generation.phase !== "stem";
  const showAnswer = generation.answerVisible;

  return (
    <div className="space-y-3">
      {showPrompt && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <GivenBox label="제시문">
            {generation.given}
            {generation.phase === "given" && !reduced && (
              <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-blue-700 ml-[2px] animate-[blink_0.7s_step-end_infinite]" />
            )}
          </GivenBox>
        </motion.div>
      )}
      <div className="rounded-xl border-2 border-dashed border-blue-200 bg-white p-4 min-h-[80px] flex items-center">
        {showAnswer ? (
          <AnimatedAnswer text={sample.answer} reduced={reduced} />
        ) : (
          <span className="text-[13px] font-mono text-blue-300">
            {generation.phase === "options" ? "▎ 답안 작성 중..." : "정답 작성란"}
          </span>
        )}
      </div>
    </div>
  );
}

function BlanksBody({
  sample,
  generation,
  reduced,
}: {
  sample: QuestionSample;
  generation: GenerationState;
  reduced: boolean;
}) {
  const showPrompt = generation.phase !== "stem";
  const showAnswer = generation.answerVisible;
  const blanks = sample.blanks ?? [];

  return (
    <div className="space-y-4">
      {showPrompt && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <GivenBox label="요약문">
            {generation.given}
            {generation.phase === "given" && !reduced && (
              <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-blue-700 ml-[2px] animate-[blink_0.7s_step-end_infinite]" />
            )}
          </GivenBox>
        </motion.div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {blanks.map((b, i) => (
          <motion.div
            key={b.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: showAnswer ? 1 : 0.5, scale: 1 }}
            transition={{ delay: i * 0.18, duration: 0.3 }}
            className={`rounded-xl border p-4 ${
              showAnswer ? "bg-blue-50 border-[#3B82F6]" : "bg-[#F8FAFC] border-blue-100"
            }`}
          >
            <div className="text-[11px] uppercase font-extrabold text-blue-500 tracking-[0.18em] mb-1">
              ({b.label})
            </div>
            <div className="text-[18px] font-bold text-blue-900 font-mono">
              {showAnswer ? b.value : "______"}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ArrangeBody({
  sample,
  generation,
  reduced,
}: {
  sample: QuestionSample;
  generation: GenerationState;
  reduced: boolean;
}) {
  const showChips = generation.phase !== "stem";
  const showAnswer = generation.answerVisible;
  const chips = sample.chips ?? [];

  return (
    <div className="space-y-4">
      {showChips && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <motion.span
              key={`${c}-${i}`}
              initial={{ opacity: 0, y: 8, rotate: -3 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.3 }}
              className="px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-[13px] font-mono font-bold text-blue-700 shadow-sm"
            >
              {c}
            </motion.span>
          ))}
        </div>
      )}
      <div className="rounded-xl bg-[#F8FAFC] border-2 border-dashed border-blue-200 p-4 min-h-[60px] flex items-center">
        {showAnswer ? (
          <AnimatedAnswer text={sample.answer} reduced={reduced} />
        ) : (
          <span className="text-[13px] font-mono text-blue-300">▎ 정렬 중...</span>
        )}
      </div>
    </div>
  );
}

function CorrectBody({
  sample,
  generation,
  reduced,
}: {
  sample: QuestionSample;
  generation: GenerationState;
  reduced: boolean;
}) {
  const showPrompt = generation.phase !== "stem";
  const showAnswer = generation.answerVisible;

  return (
    <div className="space-y-3">
      {showPrompt && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="px-5 py-3.5 rounded-xl bg-[#F8FAFC] border border-blue-100 text-[15px] text-gray-600 leading-[1.7] font-medium relative">
            <span className="absolute -top-2 left-4 text-[10px] uppercase tracking-[0.18em] font-extrabold text-blue-500 bg-white px-1.5">
              원문
            </span>
            <span className={showAnswer ? "line-through opacity-60" : ""}>
              {generation.given}
            </span>
            {generation.phase === "given" && !reduced && (
              <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-blue-700 ml-[2px] animate-[blink_0.7s_step-end_infinite]" />
            )}
          </div>
        </motion.div>
      )}
      <div
        className={`rounded-xl border-2 p-4 min-h-[60px] flex items-center ${
          showAnswer ? "bg-blue-50 border-[#3B82F6]" : "border-dashed border-blue-200 bg-white"
        }`}
      >
        {showAnswer ? (
          <AnimatedAnswer text={sample.answer} reduced={reduced} />
        ) : (
          <span className="text-[13px] font-mono text-blue-300">
            {generation.phase === "options" ? "▎ 교정 중..." : "교정 결과"}
          </span>
        )}
      </div>
    </div>
  );
}

function AnimatedAnswer({ text, reduced }: { text: string; reduced: boolean }) {
  const [shown, setShown] = useState(reduced ? text : "");
  useEffect(() => {
    if (reduced) {
      setShown(text);
      return;
    }
    setShown("");
    let i = 0;
    const tick = () => {
      i += 1;
      setShown(text.slice(0, i));
      if (i < text.length) {
        timer = setTimeout(tick, 22);
      }
    };
    let timer = setTimeout(tick, 100);
    return () => clearTimeout(timer);
  }, [text, reduced]);
  return (
    <div className="text-[15px] font-bold text-blue-900 leading-[1.5] font-mono">
      {shown}
      {!reduced && shown.length < text.length && (
        <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-[#3B82F6] ml-[1px] animate-[blink_0.7s_step-end_infinite]" />
      )}
    </div>
  );
}
