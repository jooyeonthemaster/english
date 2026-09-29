"use client";

import {
  AlertCircle,
  Clapperboard,
  Copy,
  Film,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type {
  PersistedWebtoonStoryboard,
  StoryboardPanel,
} from "@/lib/webtoon-storyboard/types";
import type { StoryboardLoadState } from "./use-webtoon-storyboard";
import {
  bubbleKindLabel,
  buildStoryboardScript,
  copyToClipboard,
  lookup,
  panelBubbles,
  panelDirectionLabels,
  safeText,
  speakerLabel,
  storyboardPanels,
} from "./storyboard-script";

// ============================================================================
// 연출 노트 — 상세 미리보기 옆(모바일은 아래)에 붙는 컷별 콘티 패널.
// 스토리보드가 설계한 컷마다 비트·숏·앵글·크기와 실제로 그려진 글자(내레이션·
// 대사), 핵심 표현, 각색한 원문 구절을 보여줘 교사가 "연출"을 읽을 수 있게 한다.
// ============================================================================

// 이야기 단계별 배지 색 — 한 장 안의 기승전결 흐름이 눈으로 읽히게.
const BEAT_TONE: Record<string, string> = {
  hook: "bg-sky-50 text-sky-700 ring-sky-200",
  setup: "bg-slate-100 text-slate-600 ring-slate-200",
  development: "bg-blue-50 text-blue-700 ring-blue-200",
  turn: "bg-orange-50 text-orange-700 ring-orange-200",
  climax: "bg-rose-50 text-rose-700 ring-rose-200",
  resolution: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};
const NEUTRAL_TONE = "bg-white text-slate-600 ring-slate-200";

function DirectionBadge({
  label,
  hint,
  tone = NEUTRAL_TONE,
}: {
  label: string;
  hint: string;
  tone?: string;
}) {
  if (!label) return null;
  return (
    <span
      title={hint}
      className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ring-1 ring-inset ${tone}`}
    >
      <span className="sr-only">{hint}: </span>
      {label}
    </span>
  );
}

/** 섹션 라벨 — 생성 옵션 모달(webtoon-generate-fields)의 SectionLabel 과 같은 토큰. */
function SectionLabel({
  icon: Icon,
  children,
  hint,
}: {
  icon: typeof Film;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <Icon className="size-3.5 text-slate-400" aria-hidden="true" />
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {children}
      </span>
      {hint ? (
        <span className="ml-auto text-[10.5px] font-medium text-slate-400">{hint}</span>
      ) : null}
    </div>
  );
}

function FieldTag({ children }: { children: ReactNode }) {
  return (
    <span className="mr-1.5 text-[10px] font-bold text-slate-500">{children}</span>
  );
}

function PanelRow({ panel, index }: { panel: StoryboardPanel; index: number }) {
  const d = panelDirectionLabels(panel);
  const caption = safeText(panel.caption);
  const bubbles = panelBubbles(panel);
  const sfx = safeText(panel.sfx);
  const keyPhrase = safeText(panel.keyPhrase);
  const excerpt = safeText(panel.sourceExcerpt);
  const hasBody = !!(caption || bubbles.length || sfx || keyPhrase || excerpt);

  return (
    <li className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-slate-800 text-[11px] font-bold tabular-nums text-white">
          <span className="sr-only">컷 </span>
          {index + 1}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 pt-0.5">
          <DirectionBadge
            label={d.beat}
            hint="이야기 단계"
            tone={lookup(BEAT_TONE, panel.beat) ?? NEUTRAL_TONE}
          />
          <DirectionBadge label={d.shot} hint="숏 크기" />
          <DirectionBadge label={d.angle} hint="카메라 앵글" />
          <DirectionBadge label={d.size} hint="컷 크기" />
        </div>
      </div>

      {hasBody ? (
        <div className="mt-2 space-y-1.5 pl-8">
          {caption ? (
            <p className="break-keep rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] leading-snug text-slate-700">
              <FieldTag>내레이션</FieldTag>
              {caption}
            </p>
          ) : null}

          {bubbles.length ? (
            <ul className="space-y-1">
              {bubbles.map((b, j) => {
                const kind = bubbleKindLabel(b.kind);
                const translation = safeText(b.translation);
                return (
                  <li key={j} className="break-keep text-[12px] leading-snug">
                    <span className="font-bold text-slate-800">
                      {speakerLabel(b.speaker) || "대사"}
                    </span>
                    {kind ? (
                      <span className="ml-1 rounded bg-slate-100 px-1 py-px text-[10px] font-semibold text-slate-500">
                        {kind}
                      </span>
                    ) : null}
                    <span className="text-slate-400">: </span>
                    <span className="text-slate-700">{safeText(b.text)}</span>
                    {translation ? (
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        ↳ {translation}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {sfx ? (
            <p className="text-[11.5px] text-slate-600">
              <FieldTag>효과음</FieldTag>
              {sfx}
            </p>
          ) : null}

          {keyPhrase ? (
            <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-800">
                핵심 표현
              </span>
              <mark
                lang="en"
                className="rounded-sm bg-amber-50 px-0.5 text-[12px] font-semibold text-amber-900"
              >
                {keyPhrase}
              </mark>
            </p>
          ) : null}

          {excerpt ? (
            <blockquote
              lang="en"
              title="각색한 지문 원문"
              className="border-l-2 border-slate-200 pl-2 text-[11.5px] italic leading-relaxed text-slate-500"
            >
              {excerpt}
            </blockquote>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function StoryboardContent({ storyboard }: { storyboard: PersistedWebtoonStoryboard }) {
  const title = safeText(storyboard.title);
  const logline = safeText(storyboard.loglineKo);
  const keyMessage = safeText(storyboard.keyMessageKo);
  const cast = (Array.isArray(storyboard.cast) ? storyboard.cast : []).filter(
    (c) => safeText(c?.name),
  );
  const panels = storyboardPanels(storyboard);

  return (
    <div className="space-y-4">
      {/* 각색 요약 — 제목 · 한 줄 요약 · 핵심 메시지 */}
      <section>
        {title ? (
          <h4 className="break-keep text-[14px] font-bold leading-snug text-slate-900">
            {title}
          </h4>
        ) : null}
        {logline ? (
          <p className="mt-1 break-keep text-[12px] leading-relaxed text-slate-600">
            {logline}
          </p>
        ) : null}
        {keyMessage ? (
          <div className="mt-2.5 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
              핵심 메시지
            </p>
            <p className="mt-0.5 break-keep text-[12.5px] font-semibold leading-snug text-blue-900">
              {keyMessage}
            </p>
          </div>
        ) : null}
      </section>

      {cast.length ? (
        <section>
          <SectionLabel icon={Users}>등장인물</SectionLabel>
          <ul className="flex flex-wrap gap-1.5">
            {cast.map((c, i) => (
              <li
                key={`${c.name}-${i}`}
                title={safeText(c.appearance) || undefined}
                className="inline-flex max-w-full items-baseline gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11.5px] leading-snug"
              >
                <span className="shrink-0 font-bold text-slate-800">{safeText(c.name)}</span>
                {safeText(c.role) ? (
                  <span className="min-w-0 break-keep text-slate-500">{safeText(c.role)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {panels.length ? (
        <section>
          <SectionLabel icon={Film} hint={`${panels.length}컷`}>
            컷별 연출
          </SectionLabel>
          <ol className="space-y-2">
            {panels.map((panel, i) => (
              <PanelRow key={i} panel={panel} index={i} />
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function LegacyNote() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Clapperboard className="size-5" aria-hidden="true" />
      </span>
      <p className="break-keep text-[12.5px] font-semibold leading-relaxed text-slate-600">
        이 웹툰은 이전 방식으로 만들어져 연출 노트가 없어요.
      </p>
    </div>
  );
}

function LoadingNote() {
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
        <Loader2 className="size-3.5 animate-spin text-blue-500" aria-hidden="true" />
        연출 노트를 불러오는 중…
      </p>
      <div className="h-14 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-20 rounded-lg border border-slate-100 bg-slate-50 motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}

function ErrorNote({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <AlertCircle className="size-6 text-rose-500" aria-hidden="true" />
      <p className="break-keep text-[12.5px] font-semibold text-slate-700">
        연출 노트를 불러오지 못했어요.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 flex items-center gap-1.5 rounded-md bg-rose-100 px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-200"
      >
        <RefreshCw className="h-3 w-3" aria-hidden="true" />
        다시 시도
      </button>
    </div>
  );
}

interface StoryboardNotesProps {
  id?: string;
  state: StoryboardLoadState;
  onRetry: () => void;
  className?: string;
}

export function StoryboardNotes({ id, state, onRetry, className = "" }: StoryboardNotesProps) {
  const storyboard = state.status === "ready" ? state.storyboard : null;
  const panelCount = storyboard ? storyboardPanels(storyboard).length : 0;

  const handleCopy = async () => {
    if (!storyboard) return;
    const ok = await copyToClipboard(buildStoryboardScript(storyboard));
    if (ok) toast.success("대본을 클립보드에 복사했어요.");
    else toast.error("대본을 복사하지 못했어요. 브라우저의 클립보드 권한을 확인해 주세요.");
  };

  return (
    <aside
      id={id}
      aria-label="연출 노트"
      className={`flex min-h-0 flex-col bg-white ${className}`}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-200 px-4">
        <Clapperboard className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="text-[12px] font-bold text-slate-700">연출 노트</span>
        {panelCount ? (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {panelCount}컷
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={!storyboard}
          title="컷별 대본을 텍스트로 복사"
          className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Copy className="h-3 w-3" aria-hidden="true" />
          대본 복사
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {state.status === "loading" ? (
          <LoadingNote />
        ) : state.status === "error" ? (
          <ErrorNote onRetry={onRetry} />
        ) : storyboard ? (
          <StoryboardContent storyboard={storyboard} />
        ) : (
          <LegacyNote />
        )}
      </div>
    </aside>
  );
}
