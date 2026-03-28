"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 유형별 지시문
// ---------------------------------------------------------------------------

const QUESTION_INSTRUCTIONS: Record<string, string> = {
  WORD_MEANING: "다음 영어 단어의 뜻을 고르세요.",
  WORD_MEANING_REVERSE: "다음 한국어 뜻에 해당하는 영어 단어를 고르세요.",
  WORD_FILL: "빈칸에 알맞은 단어를 고르세요.",
  WORD_MATCH: "영어 단어와 한국어 뜻을 연결하세요.",
  WORD_SPELL: "한국어 뜻에 해당하는 영어 단어를 입력하세요.",
  VOCAB_SYNONYM: "유의어 또는 반의어를 고르세요.",
  VOCAB_DEFINITION: "영어 정의에 해당하는 단어를 고르세요.",
  VOCAB_COLLOCATION: "빈칸에 알맞은 단어를 고르세요.",
  VOCAB_CONFUSABLE: "문맥에 맞는 단어를 고르세요.",
  SENTENCE_INTERPRET: "다음 영어 문장의 올바른 해석을 고르세요.",
  SENTENCE_COMPLETE: "다음 한국어 해석에 해당하는 영어 문장을 고르세요.",
  WORD_ARRANGE: "단어/구를 올바른 순서로 배열하세요.",
  KEY_EXPRESSION: "빈칸에 알맞은 표현을 고르세요.",
  SENT_CHUNK_ORDER: "끊어읽기 청크를 올바른 순서로 배열하세요.",
  GRAMMAR_SELECT: "빈칸에 알맞은 문법 형태를 고르세요.",
  ERROR_FIND: "문법 오류가 있는 단어를 찾으세요.",
  ERROR_CORRECT: "밑줄 친 부분을 올바르게 고치세요.",
  GRAM_TRANSFORM: "지시에 따라 문장을 바꿔 쓰세요.",
  GRAM_BINARY: "이 문장의 문법이 맞으면 O, 틀리면 X",
  TRUE_FALSE: "지문 내용과 일치하면 O, 일치하지 않으면 X",
  CONTENT_QUESTION: "다음 질문에 알맞은 답을 고르세요.",
  PASSAGE_FILL: "빈칸에 알맞은 표현을 고르세요.",
  CONNECTOR_FILL: "빈칸에 알맞은 연결어를 고르세요.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryParse(raw: string): Record<string, any> | null {
  try { return JSON.parse(raw); } catch { return null; }
}

type Option = { label: string; text: string };

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

interface Props {
  subType: string | null;
  questionText: string;
  correctAnswer: string;
  explanation: string | null;
}

export function QuestionDetail({ subType, questionText, correctAnswer, explanation }: Props) {
  const d = tryParse(questionText);
  if (!d) return <pre className="text-xs text-slate-500 whitespace-pre-wrap">{questionText}</pre>;

  const instruction = QUESTION_INSTRUCTIONS[subType || ""] || "";
  const options: Option[] | null = Array.isArray(d.options) ? d.options : null;

  return (
    <div className="space-y-3">
      {/* ── 학생 뷰 ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {instruction && (
          <div className="bg-gradient-to-r from-slate-50 to-blue-50/30 px-4 py-2.5 border-b border-slate-100">
            <p className="text-[13px] font-semibold text-slate-600">{instruction}</p>
          </div>
        )}
        <div className="px-4 py-4 space-y-3">
          <QuestionContent subType={subType} d={d} />

          {/* 선택지 (정답 표시 없이) */}
          {options && (
            <div className="space-y-1.5 mt-3">
              {options.map((opt) => (
                <div key={opt.label} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] border border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-50 transition-colors">
                  <span className="w-6 h-6 rounded-full border border-slate-300 bg-white flex items-center justify-center text-[11px] font-bold text-slate-400 shrink-0">{opt.label}</span>
                  <span>{opt.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* O/X 버튼 */}
          {(subType === "GRAM_BINARY" || subType === "TRUE_FALSE") && (
            <div className="flex gap-3 mt-3">
              <div className="flex-1 h-12 rounded-xl border-2 border-slate-200 bg-slate-50 flex items-center justify-center text-lg font-bold text-slate-400 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer">O</div>
              <div className="flex-1 h-12 rounded-xl border-2 border-slate-200 bg-slate-50 flex items-center justify-center text-lg font-bold text-slate-400 hover:bg-red-50 hover:border-red-300 transition-colors cursor-pointer">X</div>
            </div>
          )}

          {/* 텍스트 입력 영역 */}
          {(subType === "WORD_SPELL" || subType === "ERROR_CORRECT" || subType === "GRAM_TRANSFORM") && (
            <div className="mt-3">
              <div className="h-11 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex items-center px-4">
                <span className="text-[13px] text-slate-300 italic">학생이 직접 입력</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 정답 & 해설 ── */}
      <div className="rounded-xl border border-emerald-200/70 overflow-hidden">
        <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100">
          <span className="text-[12px] font-bold text-emerald-700">정답 & 해설</span>
        </div>
        <div className="px-4 py-3 space-y-3 bg-emerald-50/30">
          <AnswerDisplay subType={subType} d={d} correctAnswer={correctAnswer} options={options} />
          {explanation && (
            <div className="pt-2 border-t border-emerald-100">
              <span className="text-[10px] font-semibold text-emerald-600 block mb-1">해설</span>
              <p className="text-[12px] text-slate-600 leading-relaxed">{explanation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 학생 뷰 — 유형별 문제 콘텐츠
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function QuestionContent({ subType, d }: { subType: string | null; d: Record<string, any> }) {
  switch (subType) {
    // ── VOCAB: 단어 표시 ──
    case "WORD_MEANING":
      return (
        <>
          <div className="text-center py-3">
            <span className="text-2xl font-bold text-slate-900 tracking-wide">{d.word}</span>
          </div>
          {d.contextSentence && <ContextBox>{d.contextSentence}</ContextBox>}
        </>
      );
    case "WORD_MEANING_REVERSE":
      return (
        <>
          <div className="text-center py-3">
            <span className="text-xl font-bold text-blue-700">{d.koreanMeaning}</span>
          </div>
          {d.contextSentence && <ContextBox>{d.contextSentence}</ContextBox>}
        </>
      );
    case "VOCAB_SYNONYM":
      return (
        <>
          <div className="text-center py-3 space-y-1">
            <span className="text-2xl font-bold text-slate-900">{d.word}</span>
            <div>
              <span className="text-[12px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold">
                {d.targetRelation === "synonym" ? "유의어" : "반의어"}를 고르세요
              </span>
            </div>
          </div>
          {d.contextSentence && <ContextBox>{d.contextSentence}</ContextBox>}
        </>
      );
    case "VOCAB_DEFINITION":
      return (
        <>
          <div className="bg-amber-50 rounded-xl px-5 py-4 text-center">
            <span className="text-[11px] text-amber-500 font-semibold block mb-1">English Definition</span>
            <p className="text-[15px] text-slate-800 italic leading-relaxed">&ldquo;{d.englishDefinition}&rdquo;</p>
          </div>
          {d.contextSentence && <ContextBox>{d.contextSentence}</ContextBox>}
        </>
      );
    case "WORD_SPELL":
      return (
        <>
          <div className="text-center py-3 space-y-2">
            <span className="text-xl font-bold text-blue-700">{d.koreanMeaning}</span>
            {d.hint && (
              <div>
                <span className="text-[14px] text-slate-400">힌트: </span>
                <span className="text-[16px] font-mono font-bold text-slate-700">{d.hint}</span>
                <span className="text-[16px] text-slate-300">____</span>
              </div>
            )}
          </div>
        </>
      );

    // ── 빈칸 채우기 유형 ──
    case "WORD_FILL":
    case "VOCAB_COLLOCATION":
    case "KEY_EXPRESSION":
    case "GRAMMAR_SELECT":
    case "PASSAGE_FILL":
      return (
        <>
          <ContextBox highlight>{d.sentence || d.excerpt || ""}</ContextBox>
          {subType === "VOCAB_COLLOCATION" && d.collocation && (
            <p className="text-[11px] text-slate-400 px-1">연어 표현: <span className="font-medium text-slate-600">{d.collocation}</span></p>
          )}
          {subType === "GRAMMAR_SELECT" && d.grammarPoint && <GrammarTag point={d.grammarPoint} />}
        </>
      );
    case "VOCAB_CONFUSABLE":
      return (
        <>
          <ContextBox highlight>{d.sentence || ""}</ContextBox>
          {d.confusablePair && (
            <div className="flex items-center justify-center gap-4 py-1">
              <span className="text-[13px] font-semibold text-orange-600 bg-orange-50 px-3 py-1 rounded-lg border border-orange-200">{d.confusablePair[0]}</span>
              <span className="text-slate-300 font-bold">vs</span>
              <span className="text-[13px] font-semibold text-orange-600 bg-orange-50 px-3 py-1 rounded-lg border border-orange-200">{d.confusablePair[1]}</span>
            </div>
          )}
        </>
      );

    // ── 문장 해석/완성 ──
    case "SENTENCE_INTERPRET":
      return <ContextBox>{d.englishSentence || ""}</ContextBox>;
    case "SENTENCE_COMPLETE":
      return (
        <div className="bg-amber-50 rounded-xl px-5 py-4">
          <span className="text-[10px] text-amber-500 font-semibold block mb-1">한국어 해석</span>
          <p className="text-[14px] text-slate-800 leading-relaxed">{d.koreanSentence}</p>
        </div>
      );

    // ── 배열 유형 ──
    case "WORD_ARRANGE":
      return (
        <>
          <div className="bg-amber-50 rounded-xl px-5 py-3">
            <span className="text-[10px] text-amber-500 font-semibold block mb-1">한국어 뜻</span>
            <p className="text-[14px] text-slate-800">{d.koreanSentence}</p>
          </div>
          {d.correctOrder && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {[...(d.distractorWords || []) as string[], ...(d.correctOrder as string[])].map((w: string, i: number) => (
                <span key={i} className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-[13px] text-blue-700 font-medium cursor-pointer hover:bg-blue-100 transition-colors">{w}</span>
              ))}
            </div>
          )}
        </>
      );
    case "SENT_CHUNK_ORDER":
      return (
        <>
          {d.koreanHint && (
            <div className="bg-amber-50 rounded-xl px-5 py-3">
              <span className="text-[10px] text-amber-500 font-semibold block mb-1">한국어 해석 힌트</span>
              <p className="text-[13px] text-slate-700">{d.koreanHint}</p>
            </div>
          )}
          {d.chunks && (
            <div className="flex flex-wrap gap-1.5">
              {(d.chunks as string[]).map((chunk: string, i: number) => (
                <span key={i} className="px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-[13px] text-indigo-700 font-medium cursor-pointer hover:bg-indigo-100 transition-colors">{chunk}</span>
              ))}
            </div>
          )}
        </>
      );

    // ── WORD_MATCH ──
    case "WORD_MATCH":
      if (!d.pairs) return null;
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold text-blue-500 px-1">English</span>
            {(d.pairs as { en: string; ko: string }[]).map((p, i) => (
              <div key={i} className="px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[13px] text-blue-800 font-medium">{p.en}</div>
            ))}
          </div>
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold text-amber-500 px-1">한국어</span>
            {[...(d.pairs as { en: string; ko: string }[])].reverse().map((p, i) => (
              <div key={i} className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-800 font-medium">{p.ko}</div>
            ))}
          </div>
        </div>
      );

    // ── 오류 유형 ──
    case "ERROR_FIND":
      return (
        <>
          {d.words ? (
            <div className="flex flex-wrap gap-1.5">
              {(d.words as string[]).map((word: string, i: number) => (
                <span key={i} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-700 cursor-pointer hover:border-red-300 hover:bg-red-50 transition-colors">{word}</span>
              ))}
            </div>
          ) : (
            <ContextBox>{d.sentence || ""}</ContextBox>
          )}
          {d.grammarPoint && <GrammarTag point={d.grammarPoint} />}
        </>
      );
    case "ERROR_CORRECT":
      return (
        <>
          <ContextBox>
            <HighlightedError sentence={d.sentence || ""} errorPart={d.errorPart || ""} />
          </ContextBox>
          {d.grammarPoint && <GrammarTag point={d.grammarPoint} />}
        </>
      );

    // ── GRAM_TRANSFORM ──
    case "GRAM_TRANSFORM":
      return (
        <>
          <ContextBox>{d.originalSentence || ""}</ContextBox>
          <div className="bg-violet-50 rounded-xl px-4 py-3 border border-violet-200">
            <span className="text-[10px] text-violet-500 font-semibold block mb-1">변환 지시</span>
            <p className="text-[14px] text-violet-800 font-medium">{d.instruction}</p>
          </div>
        </>
      );

    // ── O/X 유형 ──
    case "GRAM_BINARY":
      return (
        <>
          <ContextBox>{d.sentence || ""}</ContextBox>
          {d.grammarPoint && <GrammarTag point={d.grammarPoint} />}
        </>
      );
    case "TRUE_FALSE":
      return (
        <>
          {d.contextExcerpt && <ContextBox label="관련 지문">{d.contextExcerpt}</ContextBox>}
          <div className="bg-slate-50 rounded-xl px-5 py-4">
            <p className="text-[14px] text-slate-800 leading-relaxed">{d.statement}</p>
          </div>
        </>
      );

    // ── CONTENT_QUESTION ──
    case "CONTENT_QUESTION":
      return (
        <>
          <p className="text-[14px] font-semibold text-slate-900">{d.question}</p>
          {d.contextExcerpt && <ContextBox label="관련 지문">{d.contextExcerpt}</ContextBox>}
        </>
      );

    // ── CONNECTOR_FILL ──
    case "CONNECTOR_FILL":
      return (
        <div className="bg-slate-50 rounded-xl px-5 py-4 space-y-3">
          <p className="text-[13px] text-slate-800 leading-relaxed">{d.sentenceBefore}</p>
          <div className="flex items-center gap-3 justify-center">
            <span className="w-12 h-0.5 bg-blue-300 rounded" />
            <span className="text-[13px] font-bold text-blue-500 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">_____</span>
            <span className="w-12 h-0.5 bg-blue-300 rounded" />
          </div>
          <p className="text-[13px] text-slate-800 leading-relaxed">{d.sentenceAfter}</p>
        </div>
      );

    default:
      return <ContextBox>{d.sentence || d.contextSentence || d.englishSentence || d.koreanSentence || d.excerpt || JSON.stringify(d)}</ContextBox>;
  }
}

// ---------------------------------------------------------------------------
// 정답 표시
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AnswerDisplay({ subType, d, correctAnswer, options }: {
  subType: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  d: Record<string, any>;
  correctAnswer: string;
  options: Option[] | null;
}) {
  // 선택지형: 정답 옵션 하이라이트
  if (options) {
    const correct = options.find((o) => o.label === correctAnswer || o.text === correctAnswer);
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
        <span className="text-[13px] font-bold text-emerald-700">
          {correct ? `${correct.label}. ${correct.text}` : correctAnswer}
        </span>
      </div>
    );
  }

  // O/X 유형
  if (subType === "GRAM_BINARY" || subType === "TRUE_FALSE") {
    const isTrue = subType === "TRUE_FALSE" ? d.isTrue : d.isCorrect;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-lg font-bold text-emerald-700">{isTrue ? "O (맞음)" : "X (틀림)"}</span>
        </div>
        {subType === "GRAM_BINARY" && !d.isCorrect && d.errorExplanation && (
          <p className="text-[12px] text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">{d.errorExplanation}</p>
        )}
      </div>
    );
  }

  // WORD_MATCH: 정답 매칭
  if (subType === "WORD_MATCH" && d.pairs) {
    return (
      <div className="space-y-1">
        {(d.pairs as { en: string; ko: string }[]).map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px] px-2 py-1">
            <Check className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="font-medium text-slate-800">{p.en}</span>
            <span className="text-emerald-400">→</span>
            <span className="text-slate-600">{p.ko}</span>
          </div>
        ))}
      </div>
    );
  }

  // SENT_CHUNK_ORDER: 올바른 순서
  if (subType === "SENT_CHUNK_ORDER" && d.chunks && d.correctOrder) {
    const ordered = (d.correctOrder as number[]).map((i) => d.chunks[i]);
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-[12px] font-semibold text-emerald-700">올바른 순서</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {ordered.map((chunk: string, i: number) => (
            <span key={i} className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[12px] text-emerald-700 font-medium">
              {i + 1}. {chunk}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // WORD_ARRANGE: 올바른 순서
  if (subType === "WORD_ARRANGE" && d.correctOrder) {
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-[12px] font-semibold text-emerald-700">올바른 순서</span>
        </div>
        <p className="text-[13px] text-emerald-800 font-medium bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200">
          {(d.correctOrder as string[]).join(" ")}
        </p>
        {d.distractorWords?.length > 0 && (
          <p className="text-[11px] text-red-500 mt-1.5 px-1">함정 단어: {d.distractorWords.join(", ")}</p>
        )}
      </div>
    );
  }

  // ERROR_FIND: 오류 단어 + 수정
  if (subType === "ERROR_FIND") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-[13px] text-emerald-700">
            오류: <span className="font-bold line-through text-red-500">{d.errorWord}</span>
            <span className="mx-1.5 text-emerald-400">→</span>
            <span className="font-bold">{d.correction}</span>
          </span>
        </div>
      </div>
    );
  }

  // 기본 텍스트 입력형
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
      <span className="text-[13px] font-bold text-emerald-700">
        {correctAnswer === "true" ? "O" : correctAnswer === "false" ? "X" : correctAnswer}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 공용 UI 조각
// ---------------------------------------------------------------------------

function ContextBox({ children, label, highlight }: { children: React.ReactNode; label?: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl px-4 py-3", highlight ? "bg-blue-50/60 border border-blue-100" : "bg-slate-50")}>
      {label && <span className="text-[10px] text-slate-400 font-semibold block mb-1">{label}</span>}
      <p className="text-[13px] text-slate-800 leading-relaxed">{children}</p>
    </div>
  );
}

function GrammarTag({ point }: { point: string }) {
  return (
    <span className="inline-block text-[11px] px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium border border-violet-200">
      {point}
    </span>
  );
}

function HighlightedError({ sentence, errorPart }: { sentence: string; errorPart: string }) {
  const idx = sentence.indexOf(errorPart);
  if (idx === -1) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, idx)}
      <span className="underline decoration-red-400 decoration-wavy decoration-2 font-semibold text-red-600">{errorPart}</span>
      {sentence.slice(idx + errorPart.length)}
    </>
  );
}
