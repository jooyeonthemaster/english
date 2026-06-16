"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  WEBTOON_FONT_LIST,
  injectAllFontCss,
  type WebtoonFont,
} from "@/lib/webtoon-text/fonts";

interface WebtoonFontPickerProps {
  /** Currently selected catalog family name (e.g. "Nanum Pen Script"). */
  value: string;
  onChange: (family: string) => void;
}

type Tab = "ko" | "latin";

const SAMPLE_KO = "가나다라 ABC 7";
const SAMPLE_LATIN = "Almost Aa Bb 7";

function langOf(family: string): Tab {
  const f = WEBTOON_FONT_LIST.find((x) => x.family === family);
  return f?.lang === "latin" ? "latin" : "ko";
}

export function WebtoonFontPicker({ value, onChange }: WebtoonFontPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("ko");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // load every catalog font's CSS once the picker is opened so previews render in-face
  useEffect(() => {
    if (open) injectAllFontCss();
  }, [open]);

  // open → jump to the tab matching the current font's language and clear the search
  const togglePicker = () => {
    setOpen((o) => {
      if (!o) {
        setTab(langOf(value));
        setQuery("");
      }
      return !o;
    });
  };

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (f: WebtoonFont) =>
      !q || f.family.toLowerCase().includes(q) || f.vibe.toLowerCase().includes(q);
    const inTab = WEBTOON_FONT_LIST.filter((f) => f.lang === tab && match(f));
    const local = inTab.filter((f) => f.local);
    const rest = inTab.filter((f) => !f.local);
    return { local, rest };
  }, [query, tab]);

  const renderItem = (f: WebtoonFont) => {
    const selected = f.family === value;
    return (
      <button
        key={f.family}
        type="button"
        onClick={() => {
          onChange(f.family);
          setOpen(false);
        }}
        className={`flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left transition ${
          selected ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-slate-100"
        }`}
      >
        <span
          className="text-[15px] leading-tight text-slate-800"
          style={{ fontFamily: `"${f.family}", "Pretendard", sans-serif` }}
        >
          {f.lang === "ko" ? SAMPLE_KO : SAMPLE_LATIN}
        </span>
        <span className="text-[10px] text-slate-400">
          {f.family} · {f.vibe}
        </span>
      </button>
    );
  };

  const empty = groups.local.length === 0 && groups.rest.length === 0;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={togglePicker}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left hover:border-slate-300"
      >
        <span
          className="truncate text-[14px] text-slate-800"
          style={{ fontFamily: `"${value}", "Pretendard", sans-serif` }}
        >
          {value}
        </span>
        <ChevronDown className="size-4 shrink-0 text-slate-400" />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-[400px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {/* 한글 / 영문 완전 분리 탭 */}
          <div className="flex gap-1 border-b border-slate-100 p-1.5">
            <TabButton active={tab === "ko"} onClick={() => setTab("ko")}>
              한글
            </TabButton>
            <TabButton active={tab === "latin"} onClick={() => setTab("latin")}>
              영문
            </TabButton>
          </div>

          <div className="flex items-center gap-1.5 border-b border-slate-100 px-2.5 py-2">
            <Search className="size-3.5 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "ko" ? "한글 폰트 검색 (이름/느낌)" : "영문 폰트 검색 (이름/느낌)"}
              className="w-full bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto p-1.5">
            {groups.local.length > 0 ? (
              <>
                <Header>내 폰트</Header>
                {groups.local.map(renderItem)}
                {groups.rest.length > 0 ? <div className="my-1 h-px bg-slate-100" /> : null}
              </>
            ) : null}
            {groups.rest.length > 0 ? (
              <>
                <Header>{tab === "ko" ? "한글" : "영문"}</Header>
                {groups.rest.map(renderItem)}
              </>
            ) : null}
            {empty ? (
              <p className="px-2.5 py-3 text-[12px] text-slate-400">검색 결과가 없습니다.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
        active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </div>
  );
}
