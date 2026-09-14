"use client";

// ============================================================================
// 학습지 조판 — 글꼴 피커
//
// 웹툰 폰트 피커(webtoon-font-picker) / 시험 리포트 폰트 피커(report-font-picker)와
// 같은 패턴: 트리거는 현재 글꼴을 **그 글꼴로** 렌더하고, 드롭다운이 열리는 순간에만
// 카탈로그 CSS 를 일괄 주입해 in-face 미리보기를 성립시킨다.
//
// 이 피커만의 책임 2개:
//  ① **「기본」이 1급 항목**이다. 세 축(문서·블록·선택 구간)이 겹쳐 있으므로
//     "이 축을 비운다"가 언제나 한 번에 가능해야 상속이 설명 가능해진다.
//  ② **한글/영문 탭**. 조판 CSS 자체가 두 축(`--font-ko`/`--font-en`)이라, 축을 섞어
//     보여주면 "영어 지문만 안 바뀐다"는 오해가 그대로 발생한다.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  WORKSHEET_FONTS,
  WORKSHEET_GROUP_LABELS,
  injectWorksheetFontPreviewCss,
  worksheetFontLabel,
  worksheetFontStack,
  type WorksheetFont,
  type WorksheetFontGroup,
  type WorksheetFontLang,
} from "./worksheet-fonts";

const SAMPLE_KO = "가나다라 한글 Aa 7";
const SAMPLE_LATIN = "The quick brown Aa 7";

const GROUP_ORDER: WorksheetFontGroup[] = ["sans", "serif", "hand", "display", "mono"];

export interface WorksheetFontPickerProps {
  /** 현재 선택된 family. undefined/"" = 기본(상속). */
  value?: string;
  onChange: (family: string | undefined) => void;
  /** "ko" | "latin" 고정, 또는 "both"(탭 노출 — 선택 구간용). */
  lang: WorksheetFontLang | "both";
  /** 트리거 왼쪽 고정 라벨(예: "한글", "영문"). */
  slotLabel?: string;
  /** 기본값일 때 트리거에 붙는 칩 문구. */
  inheritLabel?: string;
  disabled?: boolean;
  /** 드롭다운을 위로 펼친다(툴바처럼 화면 아래쪽에 붙는 호스트용). */
  dropUp?: boolean;
  className?: string;
  /** 트리거 높이 축소(떠다니는 툴바용). */
  compact?: boolean;
}

export function WorksheetFontPicker({
  value,
  onChange,
  lang,
  slotLabel,
  inheritLabel = "기본",
  disabled,
  dropUp,
  className,
  compact,
}: WorksheetFontPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<WorksheetFontLang>(lang === "both" ? "ko" : lang);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // 열릴 때만 카탈로그 CSS 주입 — 문서 렌더 경로에서는 절대 호출하지 않는다.
  useEffect(() => {
    if (open) injectWorksheetFontPreviewCss();
  }, [open]);

  // 열 때: 현재 글꼴이 속한 탭으로 점프 + 검색어 초기화(웹툰 피커와 동일 관용구).
  const toggle = () => {
    if (disabled) return;
    setOpen((o) => {
      if (!o) {
        if (lang === "both") {
          const cur = WORKSHEET_FONTS.find((f) => f.family === value);
          setTab(cur?.lang ?? "ko");
        }
        setQuery("");
      }
      return !o;
    });
  };

  // 바깥 클릭 / Escape 로 닫기.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const activeLang: WorksheetFontLang = lang === "both" ? tab : lang;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (f: WorksheetFont) =>
      !q ||
      f.family.toLowerCase().includes(q) ||
      f.label.toLowerCase().includes(q) ||
      f.vibe.toLowerCase().includes(q);
    const inTab = WORKSHEET_FONTS.filter((f) => f.lang === activeLang && match(f));
    const local = inTab.filter((f) => f.local);
    const rest = GROUP_ORDER.map((g) => ({
      group: g,
      fonts: inTab.filter((f) => !f.local && f.group === g),
    })).filter((x) => x.fonts.length > 0);
    return { local, rest, empty: inTab.length === 0 };
  }, [query, activeLang]);

  const sample = activeLang === "ko" ? SAMPLE_KO : SAMPLE_LATIN;
  const triggerStack = worksheetFontStack(value, lang === "both" ? "ko" : lang);

  const renderItem = (f: WorksheetFont) => {
    const selected = f.family === value;
    return (
      <button
        key={f.family}
        type="button"
        aria-pressed={selected}
        onClick={() => {
          onChange(f.family);
          setOpen(false);
        }}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition",
          selected ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-slate-100",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <span
            className="w-full truncate text-[15px] leading-tight text-slate-800"
            style={{ fontFamily: worksheetFontStack(f.family, f.lang) }}
          >
            {f.lang === "ko" ? SAMPLE_KO : SAMPLE_LATIN}
          </span>
          <span className="w-full truncate text-[10px] text-slate-400">
            {f.label} · {f.vibe}
          </span>
        </span>
        {selected ? <Check className="size-3.5 shrink-0 text-blue-600" /> : null}
      </button>
    );
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white text-left transition-colors hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60",
          compact ? "px-2 py-1" : "px-2.5 py-2",
        )}
      >
        {slotLabel ? (
          <span className="w-7 shrink-0 text-[11px] font-medium text-slate-400">{slotLabel}</span>
        ) : null}
        <span
          className={cn("min-w-0 flex-1 truncate text-slate-800", compact ? "text-[12px]" : "text-[13px]")}
          style={{ fontFamily: triggerStack }}
        >
          {worksheetFontLabel(value)}
        </span>
        {!value ? (
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
            {inheritLabel}
          </span>
        ) : null}
        <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
      </button>

      {open ? (
        <div
          className={cn(
            "absolute left-0 right-0 z-[90] min-w-[248px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {lang === "both" ? (
            <div className="flex gap-1 border-b border-slate-100 p-1.5">
              <TabButton active={tab === "ko"} onClick={() => setTab("ko")}>
                한글
              </TabButton>
              <TabButton active={tab === "latin"} onClick={() => setTab("latin")}>
                영문
              </TabButton>
            </div>
          ) : null}

          <div className="flex items-center gap-1.5 border-b border-slate-100 px-2.5 py-2">
            <Search className="size-3.5 shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="글꼴 검색 (이름/느낌)"
              className="w-full bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto p-1.5">
            {/* 「기본」은 1급 항목 — 이 축을 비워 상위(블록→문서→CSS 기본)로 되돌린다. */}
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition",
                !value ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-slate-100",
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span
                  className="w-full truncate text-[15px] leading-tight text-slate-800"
                  style={{ fontFamily: worksheetFontStack(undefined, activeLang) }}
                >
                  {sample}
                </span>
                <span className="w-full truncate text-[10px] text-slate-400">
                  기본 · 상위 설정을 따른다
                </span>
              </span>
              {!value ? <Check className="size-3.5 shrink-0 text-blue-600" /> : null}
            </button>

            {groups.local.length > 0 ? (
              <>
                <Header>내 폰트</Header>
                {groups.local.map(renderItem)}
              </>
            ) : null}
            {groups.rest.map(({ group, fonts }) => (
              <div key={group}>
                <Header>{WORKSHEET_GROUP_LABELS[group]}</Header>
                {fonts.map(renderItem)}
              </div>
            ))}
            {groups.empty ? (
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
      className={cn(
        "flex-1 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition",
        active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100",
      )}
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
