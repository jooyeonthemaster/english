"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Download, Layers3, Maximize2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TutorArtifact = {
  id: string;
  title: string;
  svg: string;
  question: string;
  createdAt: number;
};

const SVG_OPEN_FENCE = /```\s*svg\s*\n?/i;
const SVG_CODE_FENCE_CLOSE = /\n?```/;

export function extractSvgBlock(content: string): {
  svg: string | null;
  isPartial: boolean;
  before: string;
  after: string;
} {
  if (!content) return { svg: null, isPartial: false, before: "", after: "" };
  const fenceMatch = content.match(SVG_OPEN_FENCE);
  const openIdx = fenceMatch?.index;
  const svgStartTagIdx = content.indexOf("<svg");
  if (openIdx === undefined && svgStartTagIdx < 0) {
    return { svg: null, isPartial: false, before: content, after: "" };
  }
  const startSearchFrom = openIdx !== undefined ? openIdx + (fenceMatch?.[0]?.length ?? 0) : 0;
  const actualSvgStart = content.indexOf("<svg", startSearchFrom);
  if (actualSvgStart < 0) {
    const beforeText = openIdx !== undefined ? content.slice(0, openIdx) : content;
    return { svg: null, isPartial: true, before: beforeText.trim(), after: "" };
  }
  const closeTagIdx = content.indexOf("</svg>", actualSvgStart);
  if (closeTagIdx < 0) {
    const beforeText = (openIdx !== undefined ? content.slice(0, openIdx) : content.slice(0, actualSvgStart)).trim();
    return { svg: null, isPartial: true, before: beforeText, after: "" };
  }
  const svgEnd = closeTagIdx + "</svg>".length;
  const svg = content.slice(actualSvgStart, svgEnd);
  const before = (openIdx !== undefined ? content.slice(0, openIdx) : content.slice(0, actualSvgStart)).trim();
  let afterRaw = content.slice(svgEnd);
  const closeFence = afterRaw.match(SVG_CODE_FENCE_CLOSE);
  if (closeFence?.index !== undefined && closeFence.index < 12) {
    afterRaw = afterRaw.slice(closeFence.index + closeFence[0].length);
  }
  return { svg, isPartial: false, before, after: afterRaw.trim() };
}

export function sanitizeSvg(svg: string): string {
  if (typeof window === "undefined") return "";
  const cleaned = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: false },
    FORBID_TAGS: ["script", "foreignObject"],
    FORBID_ATTR: ["onload", "onclick", "onmouseover", "onmouseenter", "onfocus", "onerror"],
    ADD_ATTR: ["viewBox", "preserveAspectRatio"],
    KEEP_CONTENT: false,
  });
  return typeof cleaned === "string" ? cleaned : "";
}

export function deriveSvgTitle(svg: string, fallback: string): string {
  const match = svg.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleRaw = match?.[1]?.trim();
  if (titleRaw && titleRaw.length > 0) return titleRaw.slice(0, 80);
  return fallback.slice(0, 80) || "시각 자료";
}

export function ArtifactInlineCard({
  artifact,
  onOpen,
}: {
  artifact: TutorArtifact;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="mt-1 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm ring-1 ring-blue-50">
      <button
        type="button"
        onClick={() => onOpen(artifact.id)}
        className="group block w-full text-left"
        aria-label={`${artifact.title} — 도식 모음에서 크게 보기`}
      >
        <div className="relative aspect-[11/7] w-full overflow-hidden bg-slate-50">
          <div
            className="absolute inset-0 flex items-center justify-center p-3 [&_svg]:h-full [&_svg]:w-full"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: artifact.svg }}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-white/95 via-white/70 to-transparent px-3 pb-2 pt-6">
            <span className="line-clamp-1 text-[11px] font-black uppercase tracking-wider text-blue-700">
              시각 자료
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-600 opacity-0 ring-1 ring-slate-200 transition group-hover:opacity-100">
              <Maximize2 className="size-3" />
              크게 보기
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
          <p className="line-clamp-1 text-xs font-black text-slate-900">{artifact.title}</p>
          <span className="shrink-0 text-[10px] font-bold text-slate-400">
            {formatRelative(artifact.createdAt)}
          </span>
        </div>
      </button>
    </div>
  );
}

export function ArtifactPendingCard() {
  return (
    <div className="mt-1 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
      <div className="relative aspect-[11/7] w-full overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-50">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(37,99,235,0.08),transparent_60%),radial-gradient(circle_at_70%_75%,rgba(96,165,250,0.10),transparent_60%)]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-white/90 px-3 py-1 shadow-sm">
            <span className="block size-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.32s]" />
            <span className="block size-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.16s]" />
            <span className="block size-1.5 rounded-full bg-blue-500 animate-bounce" />
          </div>
          <p className="text-[11px] font-black uppercase tracking-wider text-blue-700">도식을 그리는 중</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-10 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

export function ArtifactsPanel({
  open,
  onClose,
  artifacts,
  selectedId,
  onSelect,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  artifacts: TutorArtifact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const selected = useMemo(
    () => artifacts.find((item) => item.id === selectedId) ?? artifacts[artifacts.length - 1] ?? null,
    [artifacts, selectedId],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function downloadSvg() {
    if (!selected) return;
    const blob = new Blob([selected.svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(selected.title)}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-label="시각 자료 모음"
        className={cn(
          "fixed right-0 top-0 z-50 flex h-[100dvh] w-full max-w-[520px] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Layers3 className="size-4" />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Artifacts</p>
              <h2 className="text-sm font-black text-slate-950">시각 자료 모음 · {artifacts.length}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <X className="size-4" />
          </button>
        </header>

        {artifacts.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Layers3 className="size-5" />
            </div>
            <p className="text-sm font-black text-slate-900">아직 만든 시각 자료가 없어요</p>
            <p className="text-xs font-semibold leading-5 text-slate-500">
              질문 끝에 <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">시각화 해줘</span>를 붙이면
              <br />
              학습지 생성을 SVG 도식으로 정리해 드려요.
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <section className="border-b border-slate-100 px-5 py-4">
              {selected ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">현재 도식</p>
                      <h3 className="line-clamp-2 text-base font-black leading-6 text-slate-950">
                        {selected.title}
                      </h3>
                      {selected.question && (
                        <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 text-slate-500">
                          “{selected.question}”
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={downloadSvg}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="size-3.5" />
                        SVG
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                    <div
                      className="aspect-[11/7] w-full [&_svg]:h-full [&_svg]:w-full"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: selected.svg }}
                    />
                  </div>
                </>
              ) : null}
            </section>

            <section className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <p className="px-2 pb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                전체 ({artifacts.length})
              </p>
              <ul className="space-y-1.5">
                {[...artifacts].reverse().map((item) => {
                  const isActive = item.id === selected?.id;
                  return (
                    <li key={item.id}>
                      <div
                        className={cn(
                          "group flex items-center gap-3 rounded-xl border px-2 py-2 transition",
                          isActive
                            ? "border-blue-200 bg-blue-50/60"
                            : "border-transparent hover:bg-slate-50",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(item.id)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <div
                              className="h-full w-full [&_svg]:h-full [&_svg]:w-full"
                              // eslint-disable-next-line react/no-danger
                              dangerouslySetInnerHTML={{ __html: item.svg }}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-xs font-black text-slate-900">{item.title}</p>
                            <p className="line-clamp-1 text-[10px] font-semibold text-slate-500">
                              {formatRelative(item.createdAt)}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(item.id)}
                          aria-label="삭제"
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </aside>
    </>
  );
}

export function useArtifactStore() {
  const [artifacts, setArtifacts] = useState<TutorArtifact[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  function upsertArtifact(next: TutorArtifact) {
    if (seenIdsRef.current.has(next.id)) {
      setArtifacts((current) => current.map((item) => (item.id === next.id ? next : item)));
      return;
    }
    seenIdsRef.current.add(next.id);
    setArtifacts((current) => [...current, next]);
    setSelectedId(next.id);
  }

  function deleteArtifact(id: string) {
    setArtifacts((current) => current.filter((item) => item.id !== id));
    seenIdsRef.current.delete(id);
    setSelectedId((current) => (current === id ? null : current));
  }

  function openWith(id: string) {
    setSelectedId(id);
    setOpen(true);
  }

  function resetAll() {
    setArtifacts([]);
    setSelectedId(null);
    setOpen(false);
    seenIdsRef.current.clear();
  }

  return {
    artifacts,
    open,
    setOpen,
    selectedId,
    setSelectedId,
    upsertArtifact,
    deleteArtifact,
    openWith,
    resetAll,
  };
}

function formatRelative(timestamp: number) {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return new Date(timestamp).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function slugify(text: string) {
  return (
    text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 40) || "tutor-artifact"
  );
}
