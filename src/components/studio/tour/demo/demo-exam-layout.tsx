"use client";

// ============================================================================
// 시험지 레이아웃 데모 (U6 — .tmp-studio-tour/spec.md §3)
// 3모드: layout(1/2단·A4/B4·밀도 실토글) · settings(배점·표시·표지) · export(출력).
// 순수 목업이다: 서버 액션 0 · 스토어 쓰기 0 · 로컬 useState 만. 이모지 금지(§10).
// 실 화면 자구 미러 원장:
// - src/components/exams/paper-builder/components/template-settings-panel.tsx —
//   「용지 크기」(:300)·「단 구성」(:326)·「밀도」(:374)·「배점 설정」(:398)·배점 안내 자구(:437)
//   ·「학원 로고」(:508)·「표시 옵션」(:580)·「지문 제목」·「문항 메타」(:583-584)·「표지 페이지」(:620)
// - src/components/exams/exam-paper-builder-client-parts/preview-toolbar.tsx(:306-380) —
//   「저장·인쇄·다운로드」·「PDF(미리보기 그대로)·PDF 해설·DOCX·DOCX 해설·HWPX(beta)·HWPX 해설(beta)」
// ============================================================================

import { useEffect, useState } from "react";
import { ChevronDown, Download, ImagePlus, Printer, Save } from "lucide-react";
import { DemoFrame, DemoPaper, DemoToggle } from "./demo-stage";
import { DEMO_PASSAGE_TITLE, DEMO_QUESTIONS, type DemoQuestion } from "./demo-data";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** 세그먼트 토글 1묶음 — 실 설정 패널의 「라벨 + 2버튼」 관용구 미러. */
function ToggleGroup({ label, options, value, onChange }: {
  label: string;
  options: readonly { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[10.5px] font-bold tracking-wider text-slate-400">
        {label}
      </span>
      {options.map((opt) => (
        <DemoToggle
          key={opt.v}
          active={value === opt.v}
          label={opt.label}
          onClick={() => onChange(opt.v)}
        />
      ))}
    </div>
  );
}

/** 스위치형 토글 행 — 실 설정 패널 ToggleSwitch 관용구 미러. */
function ToggleRow({ on, label, onToggle, reduced }: {
  on: boolean;
  label: string;
  onToggle: () => void;
  reduced: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`flex h-8 w-full items-center justify-between rounded-lg border px-2.5 text-[12px] font-semibold transition-colors ${
        on ? "border-blue-200 bg-blue-50/50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
      }`}
    >
      {label}
      <span
        className={`flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${on ? "bg-blue-500" : "bg-slate-300"}`}
      >
        <span
          className={`h-3 w-3 rounded-full bg-white shadow-sm ${reduced ? "" : "transition-transform"} ${on ? "translate-x-3" : ""}`}
        />
      </span>
    </button>
  );
}

/** 미니 시험지 헤더 밴드 — 제목 줄 + 반/이름/점수 칸. */
function ExamHeaderBand({ tight = false }: { tight?: boolean }) {
  return (
    <div className={`shrink-0 border-b-2 border-slate-700 px-2 ${tight ? "py-1" : "py-1.5"}`}>
      <p className="text-center text-[9px] font-black tracking-tight text-slate-800">
        2026학년도 2학기 중간고사
      </p>
      <div className="mt-1 flex items-center justify-center gap-1.5">
        {["반", "이름", "점수"].map((k) => (
          <span key={k} className="flex items-center gap-0.5 text-[6.5px] font-semibold text-slate-500">
            {k}
            <span className="inline-block h-2.5 w-6 rounded-sm border border-slate-300 bg-slate-50" />
          </span>
        ))}
      </div>
    </div>
  );
}

// ── mode="layout" ───────────────────────────────────────────────────────────

function LayoutQuestion({ q, no, tight, trans }: {
  q: DemoQuestion;
  no: number;
  tight: boolean;
  trans: string;
}) {
  return (
    <div className={`min-w-0 ${tight ? "space-y-0.5" : "space-y-1"} ${trans}`}>
      <p className={`font-semibold text-slate-700 ${tight ? "text-[7px] leading-snug" : "text-[8px] leading-relaxed"}`}>
        <span className="font-black text-slate-900">{no}.</span> {q.stem}
      </p>
      <p className={`line-clamp-2 text-slate-400 ${tight ? "text-[6px] leading-snug" : "text-[6.5px] leading-relaxed"}`}>
        {q.choices.join("  ")}
      </p>
    </div>
  );
}

function LayoutMode({ reduced }: { reduced: boolean }) {
  const [paper, setPaper] = useState<"A4" | "B4">("A4");
  const [cols, setCols] = useState<"1" | "2">("2");
  const [density, setDensity] = useState<"표준" | "압축">("표준");
  const tight = density === "압축";
  const trans = reduced ? "" : "transition-all duration-300";
  const chunks =
    cols === "2" ? [DEMO_QUESTIONS.slice(0, 2), DEMO_QUESTIONS.slice(2)] : [DEMO_QUESTIONS];

  return (
    <DemoFrame caption="예시 화면 — 눌러 보면 배치가 그 자리에서 다시 계산됩니다">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ToggleGroup
            label="용지 크기"
            options={[{ v: "A4", label: "A4" }, { v: "B4", label: "B4" }]}
            value={paper}
            onChange={(v) => setPaper(v as "A4" | "B4")}
          />
          <ToggleGroup
            label="단 구성"
            options={[{ v: "1", label: "1단" }, { v: "2", label: "2단" }]}
            value={cols}
            onChange={(v) => setCols(v as "1" | "2")}
          />
          <ToggleGroup
            label="밀도"
            options={[{ v: "표준", label: "표준" }, { v: "압축", label: "압축" }]}
            value={density}
            onChange={(v) => setDensity(v as "표준" | "압축")}
          />
        </div>

        <DemoPaper size={paper} className={`${paper === "A4" ? "w-[236px]" : "w-[288px]"} ${trans}`}>
          <ExamHeaderBand tight={tight} />
          <div
            data-demo-exam-cols={cols}
            className={`grid min-h-0 flex-1 ${cols === "2" ? "grid-cols-2" : "grid-cols-1"} px-2 ${tight ? "py-1" : "py-1.5"}`}
          >
            {chunks.map((chunk, ci) => (
              <div
                key={ci}
                className={`min-w-0 ${tight ? "space-y-1.5" : "space-y-2.5"} ${
                  cols === "2" ? (ci === 0 ? "pr-1.5" : "border-l border-slate-200 pl-1.5") : ""
                }`}
              >
                {chunk.map((q, qi) => (
                  <LayoutQuestion
                    key={q.type}
                    q={q}
                    no={(ci === 0 ? 0 : chunks[0].length) + qi + 1}
                    tight={tight}
                    trans={trans}
                  />
                ))}
              </div>
            ))}
          </div>
        </DemoPaper>

        <p className="text-center text-[11px] font-semibold tabular-nums text-slate-500">
          {paper} · {cols}단 · {density} · 4문항
        </p>
      </div>
    </DemoFrame>
  );
}

// ── mode="settings" ─────────────────────────────────────────────────────────

function SettingsMode({ reduced }: { reduced: boolean }) {
  const [totalStr, setTotalStr] = useState("100");
  const [showTitle, setShowTitle] = useState(true);
  const [showMeta, setShowMeta] = useState(true);
  const [cover, setCover] = useState(false);
  const parsed = Number.parseFloat(totalStr);
  const total = Number.isFinite(parsed) && parsed > 0 ? Math.min(999, parsed) : 0;
  const per = (total / DEMO_QUESTIONS.length).toFixed(1);

  return (
    <DemoFrame caption="예시 화면 — 설정을 바꾸면 미리보기가 바로 따라옵니다">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="space-y-2 sm:w-[228px] sm:shrink-0">
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">배점 설정</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="shrink-0 text-[11px] font-bold text-slate-500">총점</span>
              <input
                type="number"
                min={1}
                max={999}
                value={totalStr}
                onChange={(e) => setTotalStr(e.target.value)}
                aria-label="총점"
                className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-black text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
              <span className="text-[11px] font-semibold text-slate-400">점</span>
            </div>
            <p className="mt-1.5 text-[11px] font-semibold tabular-nums text-slate-600">
              현재 총점 {total}점 · 4문항
            </p>
            {/* 자구 출처: template-settings-panel.tsx:437 */}
            <p className="mt-1 text-[10px] font-semibold leading-snug text-slate-400 break-keep">
              총점을 입력하면 문항 수가 바뀔 때마다 배점을 다시 나눕니다.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">표시 옵션</p>
            <div className="space-y-1.5">
              {/* 자구 출처: template-settings-panel.tsx:583-584 */}
              <ToggleRow on={showTitle} label="지문 제목" onToggle={() => setShowTitle((v) => !v)} reduced={reduced} />
              <ToggleRow on={showMeta} label="문항 메타" onToggle={() => setShowMeta((v) => !v)} reduced={reduced} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            {/* 자구 출처: template-settings-panel.tsx:620 */}
            <ToggleRow on={cover} label="표지 페이지" onToggle={() => setCover((v) => !v)} reduced={reduced} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            {/* 자구 출처: template-settings-panel.tsx:508 — 드롭존은 목업(동작 없음) */}
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">학원 로고</p>
            <div className="mt-1.5 flex h-10 items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 text-center text-[10px] font-semibold leading-snug text-slate-400 break-keep">
              <ImagePlus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              로고를 올리면 표지와 머리글에 함께 들어갑니다
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-start justify-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          {cover ? (
            <div className="shrink-0 space-y-1">
              <DemoPaper size="A4" className="w-[112px]">
                <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-2 text-center">
                  <div className="h-4 w-4 rounded-full border border-slate-300 bg-slate-100" />
                  <p className="text-[7px] font-black leading-tight text-slate-800">
                    2026학년도 2학기 중간고사
                  </p>
                  <p className="text-[6px] font-semibold text-slate-400">영어 · 4문항</p>
                  <div className="mt-1 w-full space-y-1 px-2">
                    <div className="h-2.5 rounded-sm border border-slate-200 bg-slate-50" />
                    <div className="h-2.5 rounded-sm border border-slate-200 bg-slate-50" />
                  </div>
                </div>
              </DemoPaper>
              <p className="text-center text-[10px] font-semibold text-slate-400">표지</p>
            </div>
          ) : null}
          <div className="shrink-0 space-y-1">
            <DemoPaper size="A4" className="w-[190px]">
              <ExamHeaderBand />
              <div className="min-h-0 flex-1 space-y-2 px-2 py-1.5">
                {showTitle ? (
                  <p className="truncate text-[7px] font-bold text-slate-500">{DEMO_PASSAGE_TITLE}</p>
                ) : null}
                {DEMO_QUESTIONS.map((q, i) => (
                  <div key={q.type} className="space-y-0.5">
                    <div className="flex items-center gap-1">
                      <p className="min-w-0 flex-1 truncate text-[7.5px] font-semibold text-slate-700">
                        <span className="font-black text-slate-900">{i + 1}.</span> {q.stem}
                      </p>
                      <span className="shrink-0 rounded border border-blue-200 bg-blue-50 px-1 text-[7px] font-bold tabular-nums text-blue-700">
                        {per}점
                      </span>
                    </div>
                    {showMeta ? (
                      <p className="truncate text-[6.5px] text-slate-400">
                        {q.type} · {q.difficulty}
                      </p>
                    ) : null}
                    <p className="truncate text-[6.5px] leading-relaxed text-slate-400">
                      {q.choices.join("  ")}
                    </p>
                  </div>
                ))}
              </div>
            </DemoPaper>
            <p className="text-center text-[10px] font-semibold text-slate-400">문제 페이지</p>
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}

// ── mode="export" ───────────────────────────────────────────────────────────

/** 메뉴 자구·배지·순서 출처: preview-toolbar.tsx(:306-380). 항목 클릭은 무동작. */
const EXPORT_ITEMS: readonly {
  chip: string;
  color: string;
  label: string;
  badge?: { text: string; cls: string };
}[] = [
  { chip: "PDF", color: "bg-rose-500", label: "PDF", badge: { text: "미리보기 그대로", cls: "bg-rose-50 text-rose-600" } },
  { chip: "PDF", color: "bg-rose-500", label: "PDF 해설" },
  { chip: "DOCX", color: "bg-blue-500", label: "DOCX" },
  { chip: "DOCX", color: "bg-blue-500", label: "DOCX 해설" },
  { chip: "HWPX", color: "bg-indigo-500", label: "HWPX", badge: { text: "beta", cls: "bg-indigo-50 uppercase text-indigo-600" } },
  { chip: "HWPX", color: "bg-indigo-500", label: "HWPX 해설", badge: { text: "beta", cls: "bg-violet-50 uppercase text-violet-600" } },
];

function ExportMode() {
  // 기본 펼침(적대검수 확정 major): 닫힌 채면 스텝 본문이 약속한
  // 「PDF·워드·한글」 항목이 하나도 안 보이고 스테이지의 80%가 빈 회색이었다.
  const [open, setOpen] = useState(true);
  const btn =
    "flex h-8 items-center justify-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50";

  return (
    <DemoFrame caption="예시 화면 — 실제 파일은 만들지 않습니다">
      <div className="min-h-[300px] space-y-2">
        <div className="flex items-center justify-end gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
          <button type="button" className={btn}>
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            저장
          </button>
          <button type="button" className={btn}>
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            인쇄
          </button>
          <div className="relative">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={btn}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              다운로드
              <ChevronDown className="h-3 w-3 text-slate-400" aria-hidden="true" />
            </button>
            {open ? (
              <div
                data-demo-export-menu
                className="absolute right-0 top-[calc(100%+6px)] z-10 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/70"
              >
                {EXPORT_ITEMS.map((item, i) => (
                  <div key={item.label}>
                    {i === 2 ? <div className="my-1 h-px bg-slate-100" /> : null}
                    <button
                      type="button"
                      className="flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <span
                        className={`inline-flex h-4 w-10 shrink-0 items-center justify-center rounded-sm text-[8px] font-black text-white ${item.color}`}
                      >
                        {item.chip}
                      </span>
                      {item.label}
                      {item.badge ? (
                        <span className={`ml-auto rounded-sm px-1 py-px text-[9px] font-bold leading-none ${item.badge.cls}`}>
                          {item.badge.text}
                        </span>
                      ) : null}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <p className="px-1 text-[11px] leading-relaxed text-slate-500 break-keep">
          문제지만이 아니라 해설지도 같은 메뉴에서 바로 내려받습니다.
        </p>
      </div>
    </DemoFrame>
  );
}

export function DemoExamLayout({ mode }: { mode: "layout" | "settings" | "export" }) {
  const reduced = usePrefersReducedMotion();
  if (mode === "layout") return <LayoutMode reduced={reduced} />;
  if (mode === "settings") return <SettingsMode reduced={reduced} />;
  return <ExportMode />;
}
