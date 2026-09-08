"use client";

// 기출 문항 미리보기 팝오버(👁) — 정본 §11.2 「👁 = 전문 미리보기 팝오버(텍스트만, 조판기 렌더 금지)」.
//
// 순수 토큰화·모델(tokenizeInline / buildPreviewModel / answerIndexOf)은 ./bank-preview-model.ts 에 있다
// (500줄 규칙으로 분리 — 이 파일은 fetch·팝오버·렌더만). index.ts 재export 는 모델 파일을 가리킨다.
//
// 데이터: 팝오버가 **열릴 때** 내용 컴포넌트가 마운트되며 스스로 받는다 — 행 props 에 미리보기 상태를 싣지
// 않아 행 memo 가 깨지지 않는다(§11.1 팬아웃 처방). 단건 GET /api/exam-passages/questions/[id] → { item };
// 지문 박스 유형은 passageContentOverride 우선, 없으면 GET /api/exam-passages?ids=<passageId> 본문.
// 2단계(지문 본문)가 실패해도 문항은 버리지 않는다 — passageText=null 로 진행해 모델이
// sourcePassageMissing 안내를 그린다(문항 발문·선지는 이미 손에 있는데 전체를 오류로 바꾸는 건 손해).
// 받은 항목은 모듈 캐시(상한 80)에 남겨 같은 행을 다시 열 때 왕복을 아낀다 — 캐시는 상태가 아니다(필터 상태의
// 모듈 스코프 금지와 무관). 지문 실패분은 캐시하지 않는다(다시 열면 재시도).
//
// 키보드
// - 트리거(👁)는 tabIndex=-1 — 40행 × 👁 이 전부 탭 정지점이면 Tab 으로 목록을 지나가는 데 80번이 든다.
//   키보드는 행 체크박스에서 Shift+Enter 로 연다(패널 handleListKeyDown 이 같은 행 트리거를 click 한다).
// - PopoverContent 는 body 포털이지만 React 합성 이벤트는 React 트리를 타고 ul 의 onKeyDown 까지 올라간다.
//   ↑↓/Home/End 가 목록 roving 핸들러에 잡히지 않도록 여기서 stopPropagation(패널 쪽 DOM contains 가드와 2중).
// - 닫힐 때 포커스는 트리거(tabIndex -1)가 아니라 같은 행 체크박스로 — roving tabindex 정지점이 유지된다.
//
// ⚠ 호버로 여는 코드 금지(§11.1 「틱틱」 원인) — 명시적 클릭만. ⚠ 미리보기는 「근사」 — 조판은 템플릿 설정을 탄다.

import { AlertCircle, Eye, EyeOff, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ExamBankItem, ExamBankSet } from "@/lib/exam-passages/question-bank-types";
import { bankSetToBuilderRender } from "@/lib/exam-passages/question-bank-grouping";
import { buildQuestionSetMergedPassage } from "@/lib/question-sets/render";
import type { ExamPassageListResponse } from "@/lib/exam-passages/types";
import { buildPreviewModel, PASSAGE_BOX_SUBTYPES, tokenizeInline } from "./bank-preview-model";

// ── 데이터(팝오버 열릴 때만) ───────────────────────────────────────────

type PreviewData = { item: ExamBankItem; passageText: string | null; set?: ExamBankSet; members?: ExamBankItem[] };
type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | ({ status: "ready" } & PreviewData);

const PREVIEW_CACHE_MAX = 80;
/** 패널 handleListKeyDown 이 반응하는 키 — 팝오버 안에서는 목록으로 올리지 않는다. */
const LIST_NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End", "Enter"]);
const previewCache = new Map<string, PreviewData>();

async function fetchJson<T>(url: string, signal: AbortSignal, fallback: string): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", signal });
  if (!res.ok) {
    let message = fallback;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* 본문 없음 */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

/** 지문 본문(2단계) — 실패는 null 로 삼킨다. abort 는 호출부가 signal 로 판정한다. */
async function fetchPassageText(item: ExamBankItem, signal: AbortSignal): Promise<{ text: string | null; failed: boolean }> {
  if (!PASSAGE_BOX_SUBTYPES.has(item.subType)) return { text: null, failed: false };
  // 반입 시 Passage 본문이 되는 값과 같은 우선순위: 복원본(override) → 코퍼스 본문.
  const override = item.passageContentOverride?.trim();
  if (override) return { text: override, failed: false };
  try {
    const res = await fetchJson<ExamPassageListResponse>(
      `/api/exam-passages?ids=${encodeURIComponent(item.passageId)}`,
      signal,
      "지문 본문을 불러오지 못했습니다.",
    );
    return { text: res.items[0]?.text ?? null, failed: false };
  } catch {
    return { text: null, failed: true };
  }
}

function useBankPreviewItem(id: string, retryNonce: number): PreviewState {
  const cached = previewCache.get(id);
  const [state, setState] = useState<PreviewState>(cached ? { status: "ready", ...cached } : { status: "loading" });

  useEffect(() => {
    const hit = previewCache.get(id);
    if (hit) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "ready", ...hit });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchJson<{ item: ExamBankItem; set?: ExamBankSet; members?: ExamBankItem[] }>(
      `/api/exam-passages/questions/${encodeURIComponent(id)}`,
      controller.signal,
      "문항 본문을 불러오지 못했습니다.",
    )
      .then(async ({ item, set, members }) => {
        const passage = set
          ? { text: buildQuestionSetMergedPassage(bankSetToBuilderRender(set, members ?? [], (id) => id)), failed: false }
          : await fetchPassageText(item, controller.signal);
        if (controller.signal.aborted) return;
        if (!passage.failed) {
          if (previewCache.size >= PREVIEW_CACHE_MAX) {
            const oldest = previewCache.keys().next().value;
            if (oldest !== undefined) previewCache.delete(oldest);
          }
          previewCache.set(id, { item, passageText: passage.text, set, members });
        }
        setState({ status: "ready", item, passageText: passage.text, set, members });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: err instanceof Error ? err.message : "문항 본문을 불러오지 못했습니다." });
      });
    return () => controller.abort();
  }, [id, retryNonce]);

  return state;
}

// ── 렌더 ────────────────────────────────────────────────────────────────

const HIT = "rounded bg-blue-100 px-0.5 ring-1 ring-blue-300";

function InlineTokens({ text, subType, showAnswer, answerIndex }: { text: string; subType: string; showAnswer: boolean; answerIndex: number | null }) {
  const tokens = useMemo(() => tokenizeInline(text, subType), [text, subType]);
  const hit = (index: number | null) => showAnswer && index !== null && index === answerIndex;
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === "text") return <span key={i}>{t.text}</span>;
        if (t.kind === "blank") {
          return (
            <span key={i} className="mx-1 inline-flex items-baseline gap-1 align-baseline">
              {t.label ? <span className="font-bold text-slate-800">{t.label}</span> : null}
              <span className="inline-block min-w-[4.5em] border-b border-slate-500" aria-hidden="true">&nbsp;</span>
            </span>
          );
        }
        if (t.kind === "marker") {
          return (
            <span key={i} className={`mx-0.5 font-bold ${subType === "SENTENCE_ORDER" ? "text-slate-900" : "text-blue-700"} ${hit(t.index) ? HIT : ""}`}>
              {t.text}
            </span>
          );
        }
        return (
          <span key={i} className={hit(t.index) ? HIT : ""}>
            {t.marker ? <span className="font-bold text-blue-700">{t.marker} </span> : null}
            <span className="font-semibold underline decoration-blue-500 underline-offset-4">{t.text}</span>
          </span>
        );
      })}
    </>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-2 p-4" aria-hidden="true">
      <div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-200" />
      <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
      <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
      <div className="h-3 w-11/12 animate-pulse rounded bg-slate-100" />
      <div className="h-3 w-4/5 animate-pulse rounded bg-slate-100" />
    </div>
  );
}

function PreviewBody({ id, heading }: { id: string; heading: string }) {
  const [retryNonce, setRetryNonce] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const state = useBankPreviewItem(id, retryNonce);
  // 모델은 항목·본문이 바뀔 때만(§11.1 「매 렌더 재계산」 처방).
  const model = useMemo(
    () => (state.status === "ready" ? buildPreviewModel(state.item, state.passageText) : null),
    [state],
  );

  return (
    <div className="flex max-h-[min(70dvh,560px)] flex-col" data-exam-bank-preview-body={id}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-semibold text-slate-800 tabular-nums">{heading}</p>
          <p className="text-[10.5px] text-slate-400">시험지 원형 근사 — 각주·배점 표기는 조판 설정을 따릅니다</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAnswer((v) => !v)}
          aria-pressed={showAnswer}
          data-exam-bank-answer-toggle
          className={
            "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold transition " +
            (showAnswer ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
          }
        >
          {showAnswer ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          정답
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto">
        {state.status === "loading" ? <PreviewSkeleton /> : null}
        {state.status === "error" ? (
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <AlertCircle className="size-5 text-slate-400" />
            <p className="text-[12px] text-slate-600">{state.message}</p>
            <button
              type="button"
              onClick={() => setRetryNonce((n) => n + 1)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RotateCw className="size-3" /> 다시 시도
            </button>
          </div>
        ) : null}
        {state.status === "ready" && state.set ? (
          <article className="space-y-3 p-3 text-[12.5px] leading-[1.7] text-slate-800">
            <p className="font-semibold">[{state.set.label}] 다음 글을 읽고, 물음에 답하시오.</p>
            <div className="whitespace-pre-line rounded border border-slate-300 px-2.5 py-1.5">
              <InlineTokens text={state.passageText ?? ""} subType="SENTENCE_ORDER" showAnswer={false} answerIndex={null} />
              {state.set.footnotes.length > 0 ? <p className="mt-2 text-[11px] text-slate-500">{state.set.footnotes.join("  ")}</p> : null}
            </div>
            {(state.members ?? []).map((member) => {
              const answer = buildPreviewModel(member, null);
              return <section key={member.id} data-exam-bank-set-member={member.qNum}>
                <p className="font-semibold">{member.qNum}. {member.direction}{member.points === 3 ? " [3점]" : ""}</p>
                <ol className="mt-1 space-y-0.5">
                  {member.options.map((option, index) => <li key={option.label} className={showAnswer && index === answer.answerIndex ? "rounded bg-blue-50 text-blue-700" : ""}>
                    {String.fromCharCode(0x2460 + index)} {option.text}
                  </li>)}
                </ol>
                {showAnswer ? <p className="mt-1 font-semibold text-blue-700">정답 {answer.answerLabel}</p> : null}
              </section>;
            })}
          </article>
        ) : null}
        {model && state.status === "ready" && !state.set ? (
          <article className="p-3 text-[12.5px] leading-[1.7] text-slate-800">
            <p className="font-semibold text-slate-900">
              <span className="mr-1 tabular-nums">{state.item.qNum}.</span>
              {model.stem}
              {state.item.points === 3 ? <span className="ml-1 font-bold">[3점]</span> : null}
            </p>
            {model.given ? (
              <div className="mt-2 rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5">
                <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wider text-slate-500">주어진 문장</div>
                <InlineTokens text={model.given} subType={model.subType} showAnswer={showAnswer} answerIndex={model.answerIndex} />
              </div>
            ) : null}
            {model.passage ? (
              <div className={PASSAGE_BOX_SUBTYPES.has(model.subType) ? "mt-2 whitespace-pre-line rounded border border-slate-300 px-2.5 py-1.5" : "mt-2 whitespace-pre-line"}>
                <InlineTokens text={model.passage} subType={model.subType} showAnswer={showAnswer} answerIndex={model.answerIndex} />
              </div>
            ) : null}
            {model.sourcePassageMissing ? (
              <p className="mt-2 rounded border border-dashed border-slate-300 px-2.5 py-1.5 text-[11px] text-slate-500">
                지문 본문을 불러오지 못했습니다 — 시험지에 넣은 뒤 조판에서 확인할 수 있습니다.
              </p>
            ) : null}
            {model.paragraphs.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {model.paragraphs.map((p) => (
                  <p key={p.label} className="rounded border border-slate-200 px-2.5 py-1.5">
                    <span className="mr-1.5 font-bold text-slate-900">{p.label}</span>
                    <InlineTokens text={p.text} subType={model.subType} showAnswer={showAnswer} answerIndex={model.answerIndex} />
                  </p>
                ))}
              </div>
            ) : null}
            {model.summary ? (
              <>
                <div className="my-1 text-center text-base leading-none text-slate-500" aria-hidden="true">↓</div>
                <div className="rounded border border-slate-300 px-2.5 py-1.5">
                  <InlineTokens text={model.summary} subType={model.subType} showAnswer={showAnswer} answerIndex={model.answerIndex} />
                </div>
              </>
            ) : null}
            {model.footnotes.length > 0 ? (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{model.footnotes.join("  ")}</p>
            ) : null}
            {model.options ? (
              <ol className="mt-2.5 space-y-0.5">
                {model.options.map((o, i) => {
                  const isAnswer = showAnswer && i === model.answerIndex;
                  return (
                    <li key={o.label} className={`flex gap-1.5 rounded px-1 ${isAnswer ? "bg-blue-50 ring-1 ring-blue-200" : ""}`}>
                      <span className="shrink-0 font-bold text-blue-700">{o.label}</span>
                      <span className="min-w-0 break-words">{o.text}</span>
                    </li>
                  );
                })}
              </ol>
            ) : null}
            {showAnswer ? (
              <p className="mt-2.5 border-t border-slate-100 pt-2 text-[12px] font-semibold text-blue-700">정답 {model.answerLabel}</p>
            ) : null}
          </article>
        ) : null}
      </div>
    </div>
  );
}

export interface BankPreviewPopoverProps {
  id: string;
  /** 팝오버 머리글 — 「2027 6월 · 21번 · 빈칸추론」 */
  heading: string;
}

/**
 * 👁 트리거 + 팝오버. 비제어(uncontrolled) — 열림 상태가 행·패널 state 를 타지 않아 행 memo 가 유지된다.
 * 내용은 열릴 때만 마운트되어 그때 받는다(Radix 는 닫힌 콘텐츠를 마운트하지 않는다).
 */
export function BankPreviewPopover({ id, heading }: BankPreviewPopoverProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          tabIndex={-1}
          aria-label={`${heading} 미리보기`}
          data-exam-bank-preview={id}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 data-[state=open]:bg-blue-50 data-[state=open]:text-blue-600"
        >
          <Eye className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        aria-label={heading}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // 목록 roving 키만 막는다. Tab 까지 막으면 Radix FocusScope(loop, 부모 래퍼의 onKeyDown 에 버블로 도착)
          // 가 못 받아 포털 끝에서 포커스가 브라우저 크롬으로 빠진다. Escape 는 document 캡처 리스너라 무관.
          if (LIST_NAV_KEYS.has(e.key)) e.stopPropagation();
        }}
        onCloseAutoFocus={(e) => {
          // 트리거는 tabIndex -1 — 거기로 돌아가면 다음 Tab 이 목록 밖으로 튄다. 같은 행 체크박스(roving 정지점)로.
          const box = triggerRef.current?.closest("[data-exam-bank-row]")?.querySelector<HTMLElement>('button[role="checkbox"]');
          if (!box) return;
          e.preventDefault();
          box.focus();
        }}
        className="w-[380px] max-w-[calc(100vw-1.5rem)] overflow-hidden border-slate-200 bg-white p-0 text-slate-800 shadow-lg"
      >
        <PreviewBody id={id} heading={heading} />
      </PopoverContent>
    </Popover>
  );
}
