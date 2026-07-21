"use client";

// ============================================================================
// 학습 문항 원형 뷰 — 디렉터 "학습 분석" 문항 상세 팝업 (읽기 전용)
//
// getStudyItemPreview 로 복원한 StudyItem 을 학생이 본 그대로 렌더하되,
// 정답과 학생 답을 표시로 겹쳐 보여준다(선지 순서·디코이는 컴파일러가 동일하게
// 복원). 학생면 렌더러(gd-*)는 재사용하지 않는다 — 디렉터면은 shadcn/slate 관례.
// 계약: docs/director-console-spec.md §4.2.2.
// ============================================================================

import { useState } from "react";
import { ChevronDown, CircleCheck, CircleX, Lightbulb } from "lucide-react";
import type { StudyItem } from "@/lib/worksheet-study/types";
import { cn } from "@/lib/utils";

// ── 공통 조각 ───────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[12px] font-semibold text-slate-500">{children}</p>;
}

/**
 * 학생 화면 상단 지시문 — 학생면 렌더러(ItemInstruction)의 문구를 그대로 옮긴다.
 * 문구가 어긋나면 "원형 그대로"가 깨지므로 학생면 수정 시 함께 고쳐야 한다.
 */
function Instruction({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12.5px] font-medium text-slate-400">{children}</p>
  );
}

/** 정답 / 학생 답 뱃지 */
function Tag({ tone, children }: { tone: "correct" | "wrong" | "neutral"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
        tone === "correct"
          ? "bg-emerald-100 text-emerald-700"
          : tone === "wrong"
            ? "bg-rose-100 text-rose-700"
            : "bg-slate-100 text-slate-500",
      )}
    >
      {children}
    </span>
  );
}

function En({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-serif", className)}>{children}</span>;
}

/** 접이식 지문 — 학생 화면과 동일하게 기본 접힘 */
function PassageBox({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] font-semibold text-slate-600"
      >
        지문 보기
        <ChevronDown className={cn("size-4 text-slate-400 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <p className="border-t border-slate-200 px-3 py-2.5 font-serif text-[14px] leading-[1.75] text-slate-700">
          {text}
        </p>
      ) : null}
    </div>
  );
}

function Explanation({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
      <p className="text-[13px] leading-relaxed text-amber-900">{text}</p>
    </div>
  );
}

/** 정답 표시 줄 — 타입별 공통 하단 */
function AnswerLine({ label = "정답", children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
      <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
      <p className="text-[13px] leading-relaxed text-emerald-900">
        <span className="font-semibold">{label} </span>
        {children}
      </p>
    </div>
  );
}

// ── 타입별 렌더 ─────────────────────────────────────────────────────────────

export function StudyItemPreviewView({
  item,
  response,
  correct,
}: {
  item: StudyItem;
  /** 학생이 제출한 값 — 형식은 문항 타입별(mc=선지 라벨, order=조립 문장 등) */
  response: string | null;
  correct: boolean | null;
}) {
  switch (item.type) {
    // ── 객관식 ──
    case "mc": {
      return (
        <div className="flex flex-col gap-3">
          <Instruction>알맞은 것을 고르세요</Instruction>
          {item.passage ? <PassageBox text={item.passage} /> : null}
          <p
            className={cn(
              "text-[15px] font-semibold leading-relaxed text-slate-900",
              item.promptEn && "font-serif",
            )}
          >
            {item.prompt}
          </p>
          <ul className="flex flex-col gap-1.5">
            {item.choices.map((c) => {
              const isAnswer = c.label === item.answerLabel;
              const isPicked = response != null && response === c.label;
              return (
                <li
                  key={c.label}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
                    isAnswer
                      ? "border-emerald-300 bg-emerald-50/60"
                      : isPicked
                        ? "border-rose-300 bg-rose-50/60"
                        : "border-slate-200 bg-white",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 text-[13px] font-bold tabular-nums",
                      isAnswer ? "text-emerald-700" : isPicked ? "text-rose-600" : "text-slate-400",
                    )}
                  >
                    {c.label}
                  </span>
                  <span className="min-w-0 flex-1 text-[14px] leading-relaxed text-slate-700">
                    {c.text}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {isAnswer ? <Tag tone="correct">정답</Tag> : null}
                    {isPicked ? (
                      <Tag tone={isAnswer ? "correct" : "wrong"}>학생 답</Tag>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          <Explanation text={item.explanation} />
        </div>
      );
    }

    // ── 어법 O/X ──
    case "ox": {
      const answer = item.wrong ? "X" : "O";
      return (
        <div className="flex flex-col gap-3">
          <Instruction>이 문장이 어법상 맞는지 판단하세요</Instruction>
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-3 font-serif text-[15px] leading-[1.8] text-slate-800">
            {item.statement}
          </p>
          <div className="flex gap-2">
            {(["O", "X"] as const).map((v) => {
              const isAnswer = v === answer;
              const isPicked = response === v;
              return (
                <span
                  key={v}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-lg border py-2.5 text-[15px] font-bold",
                    isAnswer
                      ? "border-emerald-300 bg-emerald-50/60 text-emerald-700"
                      : isPicked
                        ? "border-rose-300 bg-rose-50/60 text-rose-600"
                        : "border-slate-200 bg-white text-slate-400",
                  )}
                >
                  {v}
                  {isAnswer ? <Tag tone="correct">정답</Tag> : null}
                  {isPicked && !isAnswer ? <Tag tone="wrong">학생 답</Tag> : null}
                </span>
              );
            })}
          </div>
          {item.fixFrom || item.fixTo ? (
            <AnswerLine label="수정">
              <En className="text-rose-700 line-through">{item.fixFrom}</En>
              {" → "}
              <En className="font-semibold">{item.fixTo}</En>
            </AnswerLine>
          ) : null}
          <Explanation text={item.explanation} />
        </div>
      );
    }

    // ── 인라인 택일 ──
    case "inline-choice": {
      return (
        <div className="flex flex-col gap-3">
          <Instruction>어법상 알맞은 표현을 고르세요</Instruction>
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-3 font-serif text-[15px] leading-[1.8] text-slate-800">
            {item.before}
            <span className="mx-1 inline-flex items-center gap-1 align-middle">
              {item.options.map((o) => {
                const isAnswer = o === item.answer;
                const isPicked = response === o;
                return (
                  <span
                    key={o}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[13.5px] font-semibold",
                      isAnswer
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : isPicked
                          ? "border-rose-300 bg-rose-50 text-rose-600"
                          : "border-slate-200 bg-slate-50 text-slate-500",
                    )}
                  >
                    {o}
                  </span>
                );
              })}
            </span>
            {item.after}
          </p>
          <AnswerLine>
            <En className="font-semibold">{item.answer}</En>
          </AnswerLine>
          <Explanation text={item.explanation} />
        </div>
      );
    }

    // ── 빈칸 채우기 ──
    case "cloze": {
      return (
        <div className="flex flex-col gap-3">
          <Instruction>빈칸에 알맞은 단어를 채우세요</Instruction>
          {item.cue ? <Label>단서 · {item.cue}</Label> : null}
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-3 font-serif text-[15px] leading-[2] text-slate-800">
            {item.segments.map((seg, i) =>
              "t" in seg ? (
                <span key={i}>{seg.t}</span>
              ) : (
                <span
                  key={i}
                  className="mx-0.5 inline-block rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[14px] font-semibold text-emerald-700"
                >
                  {item.answerKey[seg.blank] ?? "____"}
                </span>
              ),
            )}
          </p>
          <div>
            <Label>학생에게 제시된 단어 은행</Label>
            <div className="flex flex-wrap gap-1.5">
              {item.bank.map((w, i) => (
                <span
                  key={`${w}-${i}`}
                  className={cn(
                    "rounded-full border px-2.5 py-1 font-serif text-[13px]",
                    item.answerKey.includes(w)
                      ? "border-emerald-200 bg-emerald-50/60 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-500",
                  )}
                >
                  {w}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] text-slate-400">
              초록색이 정답 단어입니다. 나머지는 오답 유도용입니다.
            </p>
          </div>
          {response ? (
            <div
              className={cn(
                "rounded-lg border px-3 py-2.5",
                correct === false ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-slate-50",
              )}
            >
              <p className="text-[12px] font-semibold text-slate-500">학생이 채운 순서</p>
              <p
                className={cn(
                  "mt-0.5 font-serif text-[14px]",
                  correct === false ? "text-rose-700" : "text-slate-800",
                )}
              >
                {response}
              </p>
            </div>
          ) : null}
        </div>
      );
    }

    // ── 배열(어순) ──
    case "order": {
      return (
        <div className="flex flex-col gap-3">
          <Instruction>조각을 순서대로 탭해 문장을 완성하세요</Instruction>
          {item.ko ? <Label>{item.ko}</Label> : null}
          <div>
            <Label>학생에게 제시된 타일(섞인 순서)</Label>
            <div className="flex flex-wrap gap-1.5">
              {item.tiles.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-serif text-[13.5px] text-slate-700"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <AnswerLine>
            <En>{item.answer}</En>
          </AnswerLine>
          {response ? (
            <div
              className={cn(
                "rounded-lg border px-3 py-2.5",
                correct === false ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-slate-50",
              )}
            >
              <p className="text-[12px] font-semibold text-slate-500">학생이 배열한 문장</p>
              <p
                className={cn(
                  "mt-0.5 font-serif text-[14px]",
                  correct === false ? "text-rose-700" : "text-slate-800",
                )}
              >
                {response}
              </p>
            </div>
          ) : null}
        </div>
      );
    }

    // ── 문장 순서 ──
    case "sentence-order": {
      return (
        <div className="flex flex-col gap-3">
          <Instruction>글의 흐름에 맞는 순서로 카드를 탭하세요</Instruction>
          {item.given ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              <p className="font-serif text-[14px] leading-relaxed text-slate-800">{item.given.en}</p>
              {item.given.ko ? (
                <p className="mt-1 text-[12.5px] text-slate-500">{item.given.ko}</p>
              ) : null}
            </div>
          ) : null}
          <ul className="flex flex-col gap-1.5">
            {item.cards.map((c) => (
              <li key={c.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <p className="text-[13px] font-bold text-slate-400">({c.label})</p>
                <p className="mt-0.5 font-serif text-[14px] leading-relaxed text-slate-800">{c.en}</p>
                {c.ko ? <p className="mt-0.5 text-[12.5px] text-slate-500">{c.ko}</p> : null}
              </li>
            ))}
          </ul>
          <AnswerLine>{item.answer}</AnswerLine>
        </div>
      );
    }

    // ── 동의어·반의어 매칭 ──
    case "match": {
      const miss = response?.startsWith("miss:") ? Number(response.slice(5)) : null;
      return (
        <div className="flex flex-col gap-3">
          <Instruction>짝이 되는 것끼리 연결하세요</Instruction>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-1.5">
            <p className="text-[12px] font-semibold text-slate-500">{item.leftHead}</p>
            <span />
            <p className="text-[12px] font-semibold text-slate-500">{item.rightHead}</p>
            {item.left.map((l, i) => (
              <div key={l} className="contents">
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center font-serif text-[13.5px] text-slate-700">
                  {l}
                </span>
                <span className="text-[13px] text-slate-300">→</span>
                <span className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-center font-serif text-[13.5px] text-emerald-700">
                  {item.right[item.answer[i]]}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-slate-400">
            우측이 정답 짝입니다. 학생 화면에서는 순서가 섞여 제시됩니다.
          </p>
          {miss != null ? (
            <div
              className={cn(
                "rounded-lg border px-3 py-2.5 text-[13px]",
                miss > 0
                  ? "border-rose-200 bg-rose-50/60 text-rose-700"
                  : "border-emerald-200 bg-emerald-50/60 text-emerald-700",
              )}
            >
              {miss > 0 ? `연결 실패 ${miss}회` : "한 번도 틀리지 않고 전부 연결했습니다"}
            </div>
          ) : null}
        </div>
      );
    }

    // ── 영작(타이핑) ──
    case "typing": {
      return (
        <div className="flex flex-col gap-3">
          <Instruction>우리말을 보고 영어 문장을 완성하세요</Instruction>
          <p className="text-[15px] font-semibold leading-relaxed text-slate-900">{item.promptKo}</p>
          {item.hint ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[12px] font-semibold text-slate-500">
                제시된 힌트 ({item.scaffold === "wordSlots" ? "글자 수" : "첫 글자"})
              </p>
              <p className="mt-0.5 font-mono text-[13.5px] tracking-wide text-slate-600">{item.hint}</p>
            </div>
          ) : null}
          <AnswerLine label="모범 답안">
            <En>{item.answer}</En>
          </AnswerLine>
          {response ? (
            <div
              className={cn(
                "rounded-lg border px-3 py-2.5",
                correct === false ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-slate-50",
              )}
            >
              <p className="text-[12px] font-semibold text-slate-500">학생이 쓴 문장</p>
              <p
                className={cn(
                  "mt-0.5 font-serif text-[14px] leading-relaxed",
                  correct === false ? "text-rose-700" : "text-slate-800",
                )}
              >
                {response}
              </p>
            </div>
          ) : null}
        </div>
      );
    }

    // ── 자기채점 해석 ──
    case "self-grade": {
      return (
        <div className="flex flex-col gap-3">
          <Instruction>우리말로 해석해 보세요 · 학생이 스스로 채점하는 문항입니다</Instruction>
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-3 font-serif text-[15px] leading-[1.8] text-slate-800">
            {item.en}
          </p>
          <AnswerLine label="모범 해석">{item.modelKo}</AnswerLine>
          {response ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-[12px] font-semibold text-slate-500">학생이 쓴 해석</p>
              <p className="mt-0.5 text-[14px] leading-relaxed text-slate-800">{response}</p>
            </div>
          ) : null}
        </div>
      );
    }

    // ── 통독 카드 ──
    case "read": {
      return (
        <div className="flex flex-col gap-3">
          <Label>{item.n === 0 ? "구조·요약 카드" : `본문 ${item.n}번 문장`}</Label>
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-3 font-serif text-[15px] leading-[1.8] text-slate-800">
            {item.en}
          </p>
          <p className="text-[13.5px] leading-relaxed text-slate-600">{item.ko}</p>
          {item.chunks && item.chunks.length > 0 ? (
            <div>
              <Label>직독직해 청크</Label>
              <ul className="flex flex-col gap-1">
                {item.chunks.map((c, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-baseline gap-x-2 rounded-md border border-slate-100 bg-slate-50/70 px-2.5 py-1.5"
                  >
                    <En className="text-[13.5px] text-slate-800">{c.text}</En>
                    {c.gloss ? <span className="text-[12.5px] text-slate-500">{c.gloss}</span> : null}
                    {c.role ? (
                      <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 ring-1 ring-slate-200">
                        {c.role}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      );
    }

    // ── 어휘 카드 ──
    case "flash": {
      return (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-center">
            <p className="font-serif text-[20px] font-semibold text-slate-900">{item.front}</p>
            {item.sub ? <p className="mt-1 text-[12.5px] text-slate-400">{item.sub}</p> : null}
            <p className="mt-2 text-[14px] text-slate-600">{item.back}</p>
          </div>
          {item.extra?.synonyms ? (
            <p className="text-[13px] text-slate-600">
              <span className="font-semibold text-slate-500">동의어 </span>
              {item.extra.synonyms}
            </p>
          ) : null}
          {item.extra?.antonyms ? (
            <p className="text-[13px] text-slate-600">
              <span className="font-semibold text-slate-500">반의어 </span>
              {item.extra.antonyms}
            </p>
          ) : null}
        </div>
      );
    }

    default:
      return null;
  }
}

/** 문항 복원 실패 안내 — 학습지 편집으로 문항이 사라진 경우 */
export function StudyItemPreviewFallback({ reason }: { reason: "missing" | "error" }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
      <CircleX className="size-7 text-slate-300" strokeWidth={1.5} aria-hidden />
      <p className="text-[13px] font-medium text-slate-500">
        {reason === "missing"
          ? "이 문항은 더 이상 학습지에 없습니다."
          : "문항을 불러오지 못했습니다."}
      </p>
      <p className="text-[12.5px] text-slate-400">
        {reason === "missing"
          ? "학습지를 수정하면 문항 구성이 바뀝니다. 기록은 그대로 보존됩니다."
          : "잠시 후 다시 시도해 주세요."}
      </p>
    </div>
  );
}
