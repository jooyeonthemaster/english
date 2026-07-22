import {
  type ClipboardEvent,
  type CSSProperties,
  type ElementType,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
} from "react";

import { cn } from "@/lib/utils";
import { getReportTheme, REPORT_LAYOUT, difficultyStars } from "@/lib/passage-report/analysis-report/design-tokens";
import type { AnalysisReport, CoverTemplateId, ReportCover } from "@/lib/passage-report/analysis-report/schema";
import { normalizeEditableText } from "@/components/exams/paper-builder/components/editable-text";

export interface CoverEdit {
  commit: (next: ReportCover) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─── 인라인 편집 필드 ─────────────────────────────────────────────────────────
function CF({
  editable,
  value,
  onCommit,
  as,
  className,
  placeholder,
}: {
  editable: boolean;
  value: string;
  onCommit: (v: string) => void;
  as?: ElementType;
  className?: string;
  placeholder?: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag = (as ?? "div") as any;
  const ref = useRef<HTMLElement | null>(null);
  const focusedRef = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || focusedRef.current) return;
    if (el.innerText !== value) el.textContent = value;
  }, [value]);

  if (!editable) {
    if (!value) return null;
    return <Tag className={className}>{value}</Tag>;
  }
  const empty = !value.trim();
  return (
    <Tag
      ref={ref}
      className={cn(className, "par-edit-field", empty && "par-edit-empty")}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-ph={placeholder ?? "—"}
      dangerouslySetInnerHTML={{ __html: editableTextHtml(value) }}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={(e: FocusEvent<HTMLElement>) => {
        focusedRef.current = false;
        const next = normalizeEditableText(readEditablePlainText(e.currentTarget));
        if (next !== value) onCommit(next);
      }}
      onPaste={(e: ClipboardEvent<HTMLElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
    />
  );
}

function editableTextHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

function readEditablePlainText(root: HTMLElement): string {
  let out = "";
  const addNewline = () => {
    if (out && !out.endsWith("\n")) out += "\n";
  };
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      if (el.tagName === "BR") {
        out += "\n";
        return;
      }
      const isBlock = el.tagName === "DIV" || el.tagName === "P" || el.tagName === "LI";
      if (isBlock) addNewline();
      walk(el);
      if (isBlock) addNewline();
    });
  };
  walk(root);
  return out;
}

interface CoverData {
  eyebrow: string;
  brand: string; // 학원 이름 — 표지 히어로
  tagline: string;
  title: string; // 자료명/시리즈 (선택)
  docNo: string;
  logo?: string;
  logoAlign: "left" | "center" | "right";
  logoHeightMm: number;
  logoX?: number;
  logoY?: number;
  showMeta: boolean;
  meta: AnalysisReport["meta"];
}

export function resolveCoverData(report: AnalysisReport): CoverData {
  const c = report.cover ?? ({} as ReportCover);
  return {
    eyebrow: c.eyebrow ?? "PRIME ANALYSIS",
    brand: c.brand ?? report.brand,
    tagline: c.tagline ?? "영어 지문 심층 분석 자료",
    title: c.title ?? "",
    docNo: c.docNo ?? report.docNo ?? "",
    logo: c.showLogo === false ? undefined : c.logoDataUrl,
    logoAlign: c.logoAlign ?? "center",
    logoHeightMm: c.logoHeightMm ?? 14,
    logoX: c.logoX,
    logoY: c.logoY,
    showMeta: c.showMeta ?? false,
    meta: report.meta,
  };
}

// ─── 로고 (자유 드래그 이동) ──────────────────────────────────────────────────
function startLogoDrag(e: ReactPointerEvent<HTMLDivElement>, patch: (p: Partial<ReportCover>) => void) {
  e.preventDefault();
  e.stopPropagation();
  const wrap = e.currentTarget;
  const cover = wrap.closest(".par-cover") as HTMLElement | null;
  if (!cover) return;
  const cRect = cover.getBoundingClientRect();
  const pxPerMm = cRect.width / 210; // 스케일/줌 무관
  const wRect = wrap.getBoundingClientRect();
  const wmm = wRect.width / pxPerMm;
  const hmm = wRect.height / pxPerMm;
  const baseL = (wRect.left - cRect.left) / pxPerMm;
  const baseT = (wRect.top - cRect.top) / pxPerMm;
  const sx = e.clientX;
  const sy = e.clientY;
  // 즉시 절대배치로 전환(현재 위치 유지). width 를 못박아 이동 중 shrink-to-fit
  // 재계산으로 로고가 접히는 흔들림을 차단한다.
  wrap.style.position = "absolute";
  wrap.style.left = `${baseL}mm`;
  wrap.style.top = `${baseT}mm`;
  wrap.style.width = `${wmm}mm`;
  wrap.style.zIndex = "5";
  wrap.style.justifyContent = "flex-start";
  // pointer capture — 빠른 드래그로 포인터가 래퍼를 벗어나도 이벤트를 놓치지 않는다
  // (리사이즈 핸들과 동일 계약). 실패해도 window 리스너가 폴백.
  try {
    wrap.setPointerCapture(e.pointerId);
  } catch {
    /* noop */
  }
  let raf = 0;
  let curL = baseL;
  let curT = baseT;
  const move = (ev: PointerEvent) => {
    curL = clamp(baseL + (ev.clientX - sx) / pxPerMm, 0, 210 - wmm);
    curT = clamp(baseT + (ev.clientY - sy) / pxPerMm, 0, 297 - hmm);
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      wrap.style.left = `${curL}mm`;
      wrap.style.top = `${curT}mm`;
    });
  };
  const finish = () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    // 드래그 중 박은 고정 폭/zIndex 를 React 가정 상태(width:max-content, zIndex 4)로
    // 복원 — patch 재렌더 시 style prop 값이 이전과 같아 react-dom 이 DOM 을 다시
    // 안 쓰므로, 여기서 안 되돌리면 고정 폭이 잔존해 이후 리사이즈에서 maxWidth
    // 100%(=동결 폭) 레터박스가 재발한다(적대 리뷰 실측).
    wrap.style.width = "max-content";
    wrap.style.zIndex = "4";
    patch({ logoX: Math.round(curL * 10) / 10, logoY: Math.round(curT * 10) / 10 });
  };
  window.addEventListener("pointermove", move);
  // pointercancel 에도 커밋 — 기존엔 move 리스너가 남고 위치 커밋이 유실됐다.
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
}

function startLogoResize(
  e: ReactPointerEvent<HTMLButtonElement>,
  patch: (p: Partial<ReportCover>) => void,
  currentHeightMm: number,
) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget;
  const wrap = handle.closest(".par-cov-logo") as HTMLElement | null;
  const cover = handle.closest(".par-cover") as HTMLElement | null;
  const img = wrap?.querySelector("img");
  if (!wrap || !cover || !img) return;
  handle.setPointerCapture(e.pointerId);
  const cRect = cover.getBoundingClientRect();
  const pxPerMm = cRect.width / 210;
  const sx = e.clientX;
  const sy = e.clientY;
  const base = currentHeightMm;
  // 비율 인지 상한 — 로고가 실제로 놓일 수 있는 가로 폭(자유배치: 종이 우측 여백,
  // 정렬 슬롯: 존 폭)을 넘는 높이는 어차피 maxWidth 안전핀에 잘려 여백만 늘어난다.
  // 그 지점 전에 드래그를 멈춰 "커지는 만큼만 커지는" 손맛을 보장한다.
  const ratio = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 0;
  const wrapLeftMm = (wrap.getBoundingClientRect().left - cRect.left) / pxPerMm;
  // 정렬 슬롯 모드의 가용 폭은 래퍼가 아니라 부모 존 기준 — classic/framed/index
  // 템플릿은 래퍼가 shrink-to-fit flex 아이템이라 래퍼 폭=현재 로고 폭이 되어
  // 상한이 시작값에 붙어 확대가 죽는다(적대 리뷰 실측). 래퍼·부모 중 큰 쪽을 쓴다.
  const slotWidthPx = Math.max(
    wrap.getBoundingClientRect().width,
    wrap.parentElement?.getBoundingClientRect().width ?? 0,
  );
  const availWidthMm = wrap.classList.contains("par-cov-logo-free")
    ? Math.max(10, 210 - wrapLeftMm - 2)
    : Math.max(10, slotWidthPx / pxPerMm);
  const maxHeightMm = ratio > 0 && Number.isFinite(ratio) ? Math.min(60, availWidthMm / ratio) : 60;
  let raf = 0;
  let next = base;
  const move = (ev: PointerEvent) => {
    // 지배 축 1:1 — 평균((dx+dy)/2)은 한 축 제스처에서 절반으로 둔해지고,
    // max(dx,dy)는 한 축만 음수일 때 축소가 무반응이 된다(적대 리뷰). 절대값이
    // 큰 축을 그대로 쓴다.
    const dx = ev.clientX - sx;
    const dy = ev.clientY - sy;
    const deltaMm = (Math.abs(dx) >= Math.abs(dy) ? dx : dy) / pxPerMm;
    next = clamp(base + deltaMm, 6, Math.max(6, maxHeightMm));
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      img.style.height = `${next}mm`;
    });
  };
  const finish = () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    patch({ logoHeightMm: Math.round(next * 10) / 10 });
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
}

function CoverLogo({
  d,
  editable,
  patch,
  fixedAlign,
}: {
  d: CoverData;
  editable: boolean;
  patch: (p: Partial<ReportCover>) => void;
  fixedAlign?: "left" | "center" | "right";
}) {
  if (!d.logo) return null;
  const positioned = typeof d.logoX === "number" && typeof d.logoY === "number";
  const align = fixedAlign ?? d.logoAlign;
  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const img = (
    // 26-07-22 리사이즈 결함 수정: maxWidth 70% 캡이 높이(박스)만 키우고 비트맵을
    // 레터박스로 동결시키던 원인. width:auto 로 비율을 브라우저가 유지해 박스=로고가
    // 되고(점선·핸들 밀착, 여백 소멸), maxWidth 100% + objectFit contain 은 레거시
    // 극단값(페이지 폭 초과)에서만 발동하는 안전핀으로 남긴다 — 정상 범위 성장은
    // startLogoResize 의 비율 인지 클램프가 실제 한계까지 보장한다.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={d.logo} alt="" style={{ height: `${d.logoHeightMm}mm`, width: "auto", maxWidth: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }} />
  );
  const resizeHandle = editable ? (
    <button
      type="button"
      className="par-cov-logo-resize par-edit-chrome"
      title="모서리를 드래그해 로고 크기 조절"
      onPointerDown={(e) => startLogoResize(e, patch, d.logoHeightMm)}
      aria-label="로고 크기 조절"
    />
  ) : null;
  const onDown = editable ? (e: ReactPointerEvent<HTMLDivElement>) => startLogoDrag(e, patch) : undefined;
  if (positioned) {
    return (
      <div
        className={cn("par-cov-logo par-cov-logo-free", editable && "par-cov-logo-draggable")}
        // width:max-content — 자유배치 래퍼가 shrink-to-fit 계산에서 %max-width 와
        // 얽혀 로고를 명목 크기 이하로 접던 결함 차단(박스=로고 크기 고정).
        style={{ position: "absolute", left: `${d.logoX}mm`, top: `${d.logoY}mm`, zIndex: 4, justifyContent: "flex-start", width: "max-content", maxWidth: `${210 - (d.logoX ?? 0)}mm` }}
        onPointerDown={onDown}
      >
        {img}
        {resizeHandle}
      </div>
    );
  }
  return (
    <div className={cn("par-cov-logo", editable && "par-cov-logo-draggable")} style={{ justifyContent: justify }} onPointerDown={onDown}>
      {img}
      {resizeHandle}
    </div>
  );
}

function MetaLine({ d }: { d: CoverData }) {
  if (!d.showMeta) return null;
  return (
    <div className="par-cov-metaline">
      <span>{d.meta.category}</span>
      <span className="par-cov-dot">·</span>
      <span>{d.meta.examTypes}</span>
      <span className="par-cov-dot">·</span>
      <span className="par-cov-stars">{difficultyStars(d.meta.difficulty)}</span>
    </div>
  );
}

interface TplArgs {
  d: CoverData;
  editable: boolean;
  patch: (p: Partial<ReportCover>) => void;
}

// 공통 텍스트 묶음 (히어로=학원명)
function Eyebrow({ d, editable, patch, className }: TplArgs & { className?: string }) {
  return <CF as="div" className={cn("par-cov-eyebrow", className)} editable={editable} value={d.eyebrow} onCommit={(v) => patch({ eyebrow: v })} placeholder="LABEL" />;
}
function Brand({ d, editable, patch, className }: TplArgs & { className?: string }) {
  return <CF as="h1" className={cn("par-cov-title", className)} editable={editable} value={d.brand} onCommit={(v) => patch({ brand: v })} placeholder="학원 이름" />;
}
function Tagline({ d, editable, patch, className }: TplArgs & { className?: string }) {
  return <CF as="div" className={cn("par-cov-sub", className)} editable={editable} value={d.tagline} onCommit={(v) => patch({ tagline: v })} placeholder="(부제·한 줄 설명)" />;
}
function MaterialName({ d, editable, patch }: TplArgs) {
  if (!d.title && !editable) return null;
  return <CF as="div" className="par-cov-tag" editable={editable} value={d.title} onCommit={(v) => patch({ title: v })} placeholder="(자료명·선택)" />;
}
function DocNo({ d, editable, patch }: TplArgs) {
  return (
    <div className="par-cov-zone-bot">
      <span className="par-cov-foot-l" />
      <CF as="span" editable={editable} value={d.docNo} onCommit={(v) => patch({ docNo: v })} placeholder="DOC.000" />
    </div>
  );
}

// ─── 6개 템플릿 (히어로 = 학원명) ─────────────────────────────────────────────
function ClassicCenter(a: TplArgs) {
  return (
    <div className="par-cover par-cov-classic">
      <div className="par-cov-zone-top">
        <CoverLogo d={a.d} editable={a.editable} patch={a.patch} fixedAlign="center" />
      </div>
      <div className="par-cov-zone-mid">
        <Eyebrow {...a} />
        <Brand {...a} />
        <Tagline {...a} />
        <div className="par-cov-rule" />
        <MaterialName {...a} />
        <MetaLine d={a.d} />
      </div>
      <DocNo {...a} />
    </div>
  );
}

function SpineLeft(a: TplArgs) {
  return (
    <div className="par-cover par-cov-spine">
      <div className="par-cov-spine-bar" />
      <div className="par-cov-spine-body">
        <CoverLogo d={a.d} editable={a.editable} patch={a.patch} fixedAlign="left" />
        <div className="par-cov-spine-mid">
          <Eyebrow {...a} />
          <Brand {...a} className="par-cov-title-l" />
          <Tagline {...a} />
          <MaterialName {...a} />
          <MetaLine d={a.d} />
        </div>
        <DocNo {...a} />
      </div>
    </div>
  );
}

function BandFill(a: TplArgs) {
  return (
    <div className="par-cover par-cov-band">
      <div className="par-cov-band-top">
        <CoverLogo d={a.d} editable={a.editable} patch={a.patch} fixedAlign="left" />
        <Eyebrow {...a} className="par-cov-eyebrow-gold" />
        <Brand {...a} className="par-cov-title-l par-cov-title-white" />
        <Tagline {...a} className="par-cov-sub-white" />
      </div>
      <div className="par-cov-band-bot">
        <MaterialName {...a} />
        <MetaLine d={a.d} />
        <DocNo {...a} />
      </div>
    </div>
  );
}

function NumeralHero(a: TplArgs) {
  const numeral = (a.d.docNo || "").replace(/[^0-9]/g, "").slice(-3) || "01";
  return (
    <div className="par-cover par-cov-numeral">
      <div className="par-cov-numeral-bg" aria-hidden>{numeral}</div>
      <div className="par-cov-numeral-top">
        <CoverLogo d={a.d} editable={a.editable} patch={a.patch} fixedAlign="left" />
      </div>
      <div className="par-cov-numeral-mid">
        <Eyebrow {...a} />
        <Brand {...a} className="par-cov-title-l" />
        <Tagline {...a} />
        <MaterialName {...a} />
      </div>
      <DocNo {...a} />
    </div>
  );
}

function IndexGrid(a: TplArgs) {
  const d = a.d;
  const rows: [string, string][] = [
    ["분류", d.meta.category],
    ["소재", d.meta.theme],
    ["난이도", `${difficultyStars(d.meta.difficulty)}${d.meta.difficultyNote ? ` ${d.meta.difficultyNote}` : ""}`],
    ["권장 시간", d.meta.solveTime],
    ["출제유형", d.meta.examTypes],
  ];
  return (
    <div className="par-cover par-cov-index">
      <div className="par-cov-index-head">
        <CoverLogo d={a.d} editable={a.editable} patch={a.patch} fixedAlign="left" />
        <Eyebrow {...a} />
      </div>
      <Brand {...a} className="par-cov-title-l" />
      <Tagline {...a} />
      <div className="par-cov-index-grid">
        {rows.map(([k, v]) => (
          <div className="par-cov-index-row" key={k}>
            <span className="par-cov-index-k">{k}</span>
            <span className="par-cov-index-v">{v}</span>
          </div>
        ))}
      </div>
      <DocNo {...a} />
    </div>
  );
}

function FramedCard(a: TplArgs) {
  return (
    <div className="par-cover par-cov-framed">
      <div className="par-cov-framed-card">
        <div className="par-cov-framed-top">
          <CoverLogo d={a.d} editable={a.editable} patch={a.patch} fixedAlign="center" />
          <Eyebrow {...a} />
        </div>
        <div className="par-cov-framed-mid">
          <Brand {...a} />
          <div className="par-cov-rule" />
          <Tagline {...a} />
          <MaterialName {...a} />
          <MetaLine d={a.d} />
        </div>
        <div className="par-cov-framed-bot">
          <CF as="span" editable={a.editable} value={a.d.docNo} onCommit={(v) => a.patch({ docNo: v })} placeholder="DOC.000" />
        </div>
      </div>
    </div>
  );
}

const TEMPLATES: Record<CoverTemplateId, (a: TplArgs) => ReactNode> = {
  "classic-center": ClassicCenter,
  "spine-left": SpineLeft,
  "band-fill": BandFill,
  "numeral-hero": NumeralHero,
  "index-grid": IndexGrid,
  "framed-card": FramedCard,
};

export function CoverSheet({ report, ced }: { report: AnalysisReport; ced?: CoverEdit }) {
  const cover = report.cover;
  const templateId = (cover?.templateId ?? "classic-center") as CoverTemplateId;
  const d = resolveCoverData(report);
  const editable = !!ced;
  const patch = (p: Partial<ReportCover>) => ced?.commit({ ...(cover ?? {}), ...p } as ReportCover);
  const Tpl = TEMPLATES[templateId] ?? ClassicCenter;
  return <>{Tpl({ d, editable, patch })}</>;
}

/** 패널 썸네일/미리보기 — .par-root 안에서 디자인 템플릿 변수 + 전역 CSS 사용, 축소 렌더. */
export function CoverPreview({
  report,
  templateId,
  coverOverride,
  widthPx = 120,
}: {
  report: AnalysisReport;
  templateId?: CoverTemplateId;
  coverOverride?: ReportCover;
  widthPx?: number;
}) {
  const theme = getReportTheme(report.themeId);
  const A4_W = 793.7;
  const A4_H = 1122.5;
  const scale = widthPx / A4_W;
  const rootStyle = {
    "--ink": theme.ink, "--ink-soft": theme.inkSoft, "--gold": theme.gold, "--gold-soft": theme.goldSoft,
    "--ink-fill": theme.inkFill, "--ink-fill-soft": theme.inkFillSoft,
    "--ink-on-fill": theme.inkOnFill, "--ink-on-fill-muted": theme.inkOnFillMuted,
    "--text": theme.text, "--text-muted": theme.textMuted, "--tint": theme.tint, "--tint-border": theme.tintBorder,
    "--table-head-bg": theme.tableHeadBg, "--table-head-text": theme.tableHeadText,
    "--table-stripe": theme.tableStripe, "--page": theme.page, "--rule": theme.rule, "--font-en": REPORT_LAYOUT.fontEnSerif,
    width: A4_W, height: A4_H,
  } as CSSProperties;
  const previewReport = coverOverride
    ? ({ ...report, cover: coverOverride } as AnalysisReport)
    : templateId
      ? ({ ...report, cover: { ...(report.cover ?? { enabled: true }), templateId } } as AnalysisReport)
      : report;
  return (
    <div style={{ width: widthPx, height: A4_H * scale, overflow: "hidden", borderRadius: 3, border: "1px solid #e2e8f0", background: theme.page }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <div className="par-root par-cover-preview" style={rootStyle}>
          <CoverSheet report={previewReport} />
        </div>
      </div>
    </div>
  );
}
