"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { QuestionSample } from "../shared/mock-data";
import { CIRCLED, type GenerationState } from "./types";

type ShapeBodyProps = {
  sample: QuestionSample;
  generation: GenerationState;
  reduced: boolean;
  compact?: boolean;
};

export function ShapeBody({
  sample,
  generation,
  reduced,
  compact = false,
}: ShapeBodyProps) {
  switch (sample.shape) {
    case "mcq":
      return <McqBody sample={sample} generation={generation} reduced={reduced} compact={compact} />;
    case "insert":
      return <InsertBody sample={sample} generation={generation} reduced={reduced} compact={compact} />;
    case "ordering":
      return <OrderingBody sample={sample} generation={generation} reduced={reduced} compact={compact} />;
    case "write":
      return <WriteBody sample={sample} generation={generation} reduced={reduced} compact={compact} />;
    case "blanks":
      return <BlanksBody sample={sample} generation={generation} reduced={reduced} compact={compact} />;
    case "arrange":
      return <ArrangeBody sample={sample} generation={generation} reduced={reduced} compact={compact} />;
    case "correct":
      return <CorrectBody sample={sample} generation={generation} reduced={reduced} compact={compact} />;
    default:
      return null;
  }
}

function GivenBox({
  children,
  label,
  compact = false,
}: {
  children: React.ReactNode;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "relative rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-[12px] font-semibold leading-[1.35] text-blue-900"
          : "relative rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-5 py-3.5 text-[15px] font-medium leading-[1.7] text-blue-900"
      }
    >
      {label && (
        <span
          className={
            compact
              ? "absolute -top-2 left-3 bg-white px-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-blue-500"
              : "absolute -top-2 left-4 bg-white px-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-500"
          }
        >
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
  compact = false,
}: ShapeBodyProps) {
  const opts = sample.options ?? [];
  const showGiven = generation.phase !== "stem" && (sample.given?.length ?? 0) > 0;
  const showOptions =
    generation.phase === "options" ||
    generation.phase === "answer" ||
    generation.phase === "done";

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {sample.given && (
        <AnimatePresence>
          {showGiven && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <GivenBox label="원문 인용" compact={compact}>
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
        <ul className={compact ? "grid grid-cols-2 gap-1.5" : "space-y-2"}>
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
                className={`flex items-start rounded-xl border transition-all ${
                  compact ? "gap-2 px-2.5 py-1.5" : "gap-3 px-4 py-2.5"
                } ${
                  isCorrect
                    ? "bg-blue-50 border-[#3B82F6] shadow-[0_4px_14px_rgba(59,130,246,0.18)]"
                    : isTyping
                    ? "bg-[#F8FAFC] border-blue-200"
                    : "bg-white border-blue-50"
                }`}
              >
                <span
                  className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${
                    compact ? "h-5 w-5 text-[10px]" : "h-[24px] w-[24px] text-[12px]"
                  } ${
                    isCorrect ? "bg-[#3B82F6] text-white" : "bg-blue-50 text-blue-600"
                  }`}
                >
                  {CIRCLED[i] ?? `${i + 1}.`}
                </span>
                <span
                  className={`min-w-0 break-words font-medium ${
                    compact ? "text-[12.5px] leading-[1.25]" : "text-[15px] leading-[1.5]"
                  } ${
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
  compact = false,
}: ShapeBodyProps) {
  const showGiven = generation.phase !== "stem";
  const showSlots =
    generation.phase === "options" ||
    generation.phase === "answer" ||
    generation.phase === "done";
  const correctIdx = CIRCLED.indexOf(sample.answer);

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {showGiven && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div
            className={`relative rounded-xl border-l-4 border-[#3B82F6] bg-blue-50 font-semibold italic text-blue-900 ${
              compact
                ? "px-3 py-2 text-[12px] leading-[1.35]"
                : "px-5 py-3.5 text-[15px] leading-[1.7]"
            }`}
          >
            <span
              className={`absolute -top-2 bg-white font-extrabold uppercase text-blue-500 not-italic ${
                compact
                  ? "left-3 px-1 text-[9px] tracking-[0.12em]"
                  : "left-4 px-1.5 text-[10px] tracking-[0.18em]"
              }`}
            >
              삽입 문장
            </span>
            <span className="mr-1 text-blue-400 sm:mr-2">«</span>
            {generation.given}
            <span className="ml-1 text-blue-400 sm:ml-2">»</span>
            {generation.phase === "given" && !reduced && (
              <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-blue-700 ml-[2px] animate-[blink_0.7s_step-end_infinite]" />
            )}
          </div>
        </motion.div>
      )}

      {showSlots && (
        <div
          className={`rounded-xl border border-blue-100 bg-[#F8FAFC] ${
            compact ? "p-2.5" : "p-4"
          }`}
        >
          <div
            className={`font-extrabold uppercase text-blue-500 ${
              compact ? "mb-1 text-[9px] tracking-[0.12em]" : "mb-2 text-[10px] tracking-[0.18em]"
            }`}
          >
            삽입 위치 후보
          </div>
          <p
            className={`font-serif text-gray-700 ${
              compact ? "text-[11.5px] leading-[1.55]" : "text-[13px] leading-[1.9]"
            }`}
          >
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
                    className={`inline-flex items-center justify-center rounded-full border-2 font-extrabold ${
                      compact ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[12px]"
                    } ${
                      isCorrect && generation.answerVisible
                        ? "bg-[#3B82F6] text-white border-[#3B82F6] shadow-[0_0_0_4px_rgba(59,130,246,0.2)]"
                        : "bg-white text-blue-600 border-blue-200"
                    }`}
                  >
                    {CIRCLED[idx]}
                  </motion.span>{" "}
                  <span className={compact ? "text-[10.5px] text-gray-500" : "text-[12px] text-gray-500"}>
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
  compact = false,
}: ShapeBodyProps) {
  const showGiven = generation.phase !== "stem";
  const showParas = generation.phase !== "stem";
  const showOptions =
    generation.phase === "options" ||
    generation.phase === "answer" ||
    generation.phase === "done";
  const opts = sample.options ?? [];
  const correctIdx = CIRCLED.indexOf(sample.answer);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {showGiven && sample.given && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <GivenBox label="주어진 글" compact={compact}>{generation.given}</GivenBox>
        </motion.div>
      )}
      {showParas && sample.paragraphs && (
        <div className={compact ? "grid grid-cols-3 gap-1.5" : "grid grid-cols-1 gap-2 sm:grid-cols-3"}>
          {sample.paragraphs.map((p, i) => (
            <motion.div
              key={p.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.12, duration: 0.3 }}
              className={compact ? "rounded-lg border border-blue-100 bg-white p-2" : "rounded-lg border border-blue-100 bg-white p-3"}
            >
              <div
                className={
                  compact
                    ? "mb-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-blue-500"
                    : "mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-500"
                }
              >
                ({p.label})
              </div>
              <div className={compact ? "text-[10.5px] leading-[1.3] text-gray-700" : "text-[12px] leading-[1.55] text-gray-700"}>{p.body}</div>
            </motion.div>
          ))}
        </div>
      )}
      {showOptions && (
        <div className={compact ? "grid grid-cols-3 gap-1 pt-0.5" : "grid grid-cols-2 gap-1.5 pt-1 sm:grid-cols-5"}>
          {opts.map((opt, i) => {
            const visibleText = generation.options[i] ?? "";
            const isCorrect = generation.answerVisible && i === correctIdx;
            return (
              <div
                key={i}
                className={`rounded-lg border text-center font-mono font-bold ${
                  compact ? "px-1.5 py-1 text-[10.5px]" : "px-2 py-2 text-[12px]"
                } ${
                  isCorrect
                    ? "bg-[#3B82F6] text-white border-[#3B82F6] shadow-[0_4px_14px_rgba(59,130,246,0.25)]"
                    : "bg-white text-gray-700 border-blue-100"
                }`}
              >
                <span className={compact ? "mb-0.5 block text-[9px] text-blue-400" : "mb-0.5 block text-[10px] text-blue-400"}>{CIRCLED[i]}</span>
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
  compact = false,
}: ShapeBodyProps) {
  const showPrompt = generation.phase !== "stem";
  const showAnswer = generation.answerVisible;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {showPrompt && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <GivenBox label="제시문" compact={compact}>
            {generation.given}
            {generation.phase === "given" && !reduced && (
              <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-blue-700 ml-[2px] animate-[blink_0.7s_step-end_infinite]" />
            )}
          </GivenBox>
        </motion.div>
      )}
      <div
        className={`flex items-center rounded-xl border-2 border-dashed border-blue-200 bg-white ${
          compact ? "min-h-[50px] p-2.5" : "min-h-[80px] p-4"
        }`}
      >
        {showAnswer ? (
          <AnimatedAnswer text={sample.answer} reduced={reduced} compact={compact} />
        ) : (
          <span className={compact ? "font-mono text-[11.5px] text-blue-300" : "font-mono text-[13px] text-blue-300"}>
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
  compact = false,
}: ShapeBodyProps) {
  const showPrompt = generation.phase !== "stem";
  const showAnswer = generation.answerVisible;
  const blanks = sample.blanks ?? [];

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {showPrompt && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <GivenBox label="요약문" compact={compact}>
            {generation.given}
            {generation.phase === "given" && !reduced && (
              <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-blue-700 ml-[2px] animate-[blink_0.7s_step-end_infinite]" />
            )}
          </GivenBox>
        </motion.div>
      )}
      <div className={compact ? "grid grid-cols-2 gap-1.5" : "grid grid-cols-2 gap-3"}>
        {blanks.map((b, i) => (
          <motion.div
            key={b.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: showAnswer ? 1 : 0.5, scale: 1 }}
            transition={{ delay: i * 0.18, duration: 0.3 }}
            className={`rounded-xl border ${
              compact ? "p-2.5" : "p-4"
            } ${
              showAnswer ? "bg-blue-50 border-[#3B82F6]" : "bg-[#F8FAFC] border-blue-100"
            }`}
          >
            <div
              className={
                compact
                  ? "mb-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-blue-500"
                  : "mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-500"
              }
            >
              ({b.label})
            </div>
            <div className={compact ? "font-mono text-[14px] font-bold text-blue-900" : "font-mono text-[18px] font-bold text-blue-900"}>
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
  compact = false,
}: ShapeBodyProps) {
  const showChips = generation.phase !== "stem";
  const showAnswer = generation.answerVisible;
  const chips = sample.chips ?? [];

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {showChips && (
        <div className={compact ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-2"}>
          {chips.map((c, i) => (
            <motion.span
              key={`${c}-${i}`}
              initial={{ opacity: 0, y: 8, rotate: -3 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.3 }}
              className={
                compact
                  ? "rounded-lg border border-blue-200 bg-white px-2 py-1 font-mono text-[11px] font-bold text-blue-700 shadow-sm"
                  : "rounded-lg border border-blue-200 bg-white px-3 py-1.5 font-mono text-[13px] font-bold text-blue-700 shadow-sm"
              }
            >
              {c}
            </motion.span>
          ))}
        </div>
      )}
      <div
        className={`flex items-center rounded-xl border-2 border-dashed border-blue-200 bg-[#F8FAFC] ${
          compact ? "min-h-[46px] p-2.5" : "min-h-[60px] p-4"
        }`}
      >
        {showAnswer ? (
          <AnimatedAnswer text={sample.answer} reduced={reduced} compact={compact} />
        ) : (
          <span className={compact ? "font-mono text-[11.5px] text-blue-300" : "font-mono text-[13px] text-blue-300"}>▎ 정렬 중...</span>
        )}
      </div>
    </div>
  );
}

function CorrectBody({
  sample,
  generation,
  reduced,
  compact = false,
}: ShapeBodyProps) {
  const showPrompt = generation.phase !== "stem";
  const showAnswer = generation.answerVisible;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {showPrompt && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div
            className={`relative rounded-xl border border-blue-100 bg-[#F8FAFC] font-medium text-gray-600 ${
              compact
                ? "px-3 py-2 text-[12px] leading-[1.35]"
                : "px-5 py-3.5 text-[15px] leading-[1.7]"
            }`}
          >
            <span
              className={`absolute -top-2 bg-white font-extrabold uppercase text-blue-500 ${
                compact
                  ? "left-3 px-1 text-[9px] tracking-[0.12em]"
                  : "left-4 px-1.5 text-[10px] tracking-[0.18em]"
              }`}
            >
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
        className={`flex items-center rounded-xl border-2 ${
          compact ? "min-h-[46px] p-2.5" : "min-h-[60px] p-4"
        } ${
          showAnswer ? "bg-blue-50 border-[#3B82F6]" : "border-dashed border-blue-200 bg-white"
        }`}
      >
        {showAnswer ? (
          <AnimatedAnswer text={sample.answer} reduced={reduced} compact={compact} />
        ) : (
          <span className={compact ? "font-mono text-[11.5px] text-blue-300" : "font-mono text-[13px] text-blue-300"}>
            {generation.phase === "options" ? "▎ 교정 중..." : "교정 결과"}
          </span>
        )}
      </div>
    </div>
  );
}

function AnimatedAnswer({
  text,
  reduced,
  compact = false,
}: {
  text: string;
  reduced: boolean;
  compact?: boolean;
}) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (reduced) return;
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

  const displayed = reduced ? text : shown;

  return (
    <div className={compact ? "font-mono text-[12.5px] font-bold leading-[1.35] text-blue-900" : "font-mono text-[15px] font-bold leading-[1.5] text-blue-900"}>
      {displayed}
      {!reduced && displayed.length < text.length && (
        <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-[#3B82F6] ml-[1px] animate-[blink_0.7s_step-end_infinite]" />
      )}
    </div>
  );
}
