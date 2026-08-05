import { type ReactNode, type PointerEvent as ReactPointerEvent, useRef } from "react";
import { type AnalysisSection, NUMBERED_SECTION_LABELS, SECTION_LABELS_EN } from "@/lib/passage-report/analysis-report/schema";
import {
  isKoAnalysisSectionKind,
  KO_NUMBERED_SECTION_LABELS,
  KO_SECTION_LABELS_EN,
  type KoAnalysisSectionKind,
} from "@/lib/passage-report/analysis-report/ko-schema";
import { Field } from "./editable-field";
import type { TableColResize, WrapKind } from "./types";

/** 표 종류별 열 키(순서) */
export const TABLE_COLUMNS: Record<"grammar" | "exam" | "vocab", { key: string; label: string }[]> = {
  grammar: [
    { key: "sentenceNo", label: "문장" },
    { key: "point", label: "핵심 문법" },
    { key: "explanation", label: "해설 & 출제 포인트" },
  ],
  exam: [
    { key: "type", label: "유형" },
    { key: "asks", label: "무엇을 묻는가" },
    { key: "strategy", label: "대비 전략 & 예시" },
  ],
  vocab: [
    { key: "headword", label: "표제어" },
    { key: "pronunciation", label: "발음" },
    { key: "meaning", label: "뜻 (본문 의미)" },
    { key: "synonyms", label: "동의어" },
    { key: "antonyms", label: "반의어" },
  ],
};

/** table 로 렌더되는 wrap (연속 item → 하나의 표 + thead 반복). */
export const TABLE_WRAPS: ReadonlySet<WrapKind> = new Set<WrapKind>(["grammar", "vocab", "exam"]);
/** par-box + ol 로 렌더되는 wrap. */
export const BOX_LIST_WRAPS: ReadonlySet<WrapKind> = new Set<WrapKind>(["passage", "summary"]);

export function Arrow() {
  return (
    <div className="par-arrow">
      <div className="par-arrow-line" />
      <div className="par-arrow-head" />
    </div>
  );
}

/**
 * 섹션 헤더(par-sec-head). 번호(par-sec-no)는 자동 생성이라 고정. 한글 제목(ko)·영문 라벨(en)은
 * editable + onCommit 이 주어지면 인라인 편집 필드로 렌더(편집 핸들러 없으면 정적 텍스트 — 무회귀).
 */
export function SectionHead({
  no,
  kind,
  labelKo,
  labelEn,
  editable,
  onCommitKo,
  onCommitEn,
}: {
  no: number;
  kind: AnalysisSection["kind"] | KoAnalysisSectionKind;
  labelKo?: string;
  labelEn?: string;
  editable?: boolean;
  onCommitKo?: (v: string) => void;
  onCommitEn?: (v: string) => void;
}) {
  // PRIME_KO 폴백 — 영어 kind 는 기존 맵 그대로(무회귀), KO kind 만 KO 라벨 맵 사용.
  const ko = labelKo ?? (isKoAnalysisSectionKind(kind) ? KO_NUMBERED_SECTION_LABELS[kind] : NUMBERED_SECTION_LABELS[kind]);
  const en = labelEn ?? (isKoAnalysisSectionKind(kind) ? KO_SECTION_LABELS_EN[kind] : SECTION_LABELS_EN[kind]);
  return (
    <div className="par-sec-head">
      <span className="par-sec-no">{String(no).padStart(2, "0")}</span>
      {editable && onCommitKo ? (
        <Field as="span" className="par-sec-ko par-no-fontrun" editable value={ko} onCommit={onCommitKo} placeholder="섹션 제목" />
      ) : (
        <span className="par-sec-ko">{ko}</span>
      )}
      {editable && onCommitEn ? (
        <Field as="span" className="par-sec-en par-no-fontrun" editable value={en} onCommit={onCommitEn} placeholder="English" />
      ) : (
        <span className="par-sec-en">{en}</span>
      )}
    </div>
  );
}

// ─── 표 헤더 (run 렌더러가 사용) ──────────────────────────────────────────────
// 표 종류별 '기본' 열 비율(보이는 열 합 ~100). 사용자가 세로 구분선을 드래그하면
// report.tableColWidths[group] 에 열키→퍼센트로 저장되어 이 기본값을 대체한다.
const DEFAULT_TABLE_COL_PCT: Record<string, Record<string, number>> = {
  grammar: { sentenceNo: 8, point: 27, explanation: 65 },
  exam: { type: 16, asks: 24, strategy: 60 },
  vocab: { headword: 22, pronunciation: 16, meaning: 34, synonyms: 14, antonyms: 14 },
};
const EDIT_HANDLE_COLUMN_WIDTH = "6mm";
const EDIT_HANDLE_COLUMN_PERCENT = 3.448276;

/**
 * 보이는 열들의 너비(%)를 해석 — override(저장값) 우선, 없으면 기본 비율. 편집 모드는 핸들열 폭만큼 축소.
 * 보이는 열 '전부'가 항상 퍼센트 폭을 받는다는 점이 `.par-table { table-layout: fixed }`
 * (report-styles.ts)의 전제다 — 열 폭이 콘텐츠가 아니라 이 값으로만 정해져야 측정 클론(전 행)과
 * 실제 페이지(그 페이지 몫 행)의 열 폭이 같아진다.
 */
function resolveColumnWidths(
  group: string,
  visibleKeys: string[],
  editable: boolean,
  overrides?: Record<string, number>,
): Record<string, string> {
  const base = DEFAULT_TABLE_COL_PCT[group] ?? {};
  const vals = visibleKeys.map((k) => overrides?.[k] ?? base[k] ?? 0);
  const total = vals.reduce((sum, v) => sum + v, 0) || 1;
  const available = editable ? 100 - EDIT_HANDLE_COLUMN_PERCENT : 100;
  const out: Record<string, string> = {};
  visibleKeys.forEach((k, i) => {
    out[k] = `${(vals[i] / total) * available}%`;
  });
  return out;
}

/**
 * 표 머리글 행. `editable` 은 '레이아웃 chrome(6mm 핸들 열) 포함 여부'다 — 측정 클론도
 * 편집 모드에서는 true 를 받아야 열 폭이 실제 페이지와 같아진다(runs.tsx 의 chromeLayout).
 * 열 폭 드래그 핸들(ColResizeHandle)은 별도로 resize 콜백 유무로 게이트되므로 클론에는 안 생긴다.
 */
export function tableHeadRow(
  wrap: WrapKind,
  editable: boolean,
  hiddenCols?: string[],
  resize?: TableColResize,
): ReactNode {
  const group = wrap === "grammar" ? "grammar" : wrap === "exam" ? "exam" : "vocab";
  const hidden = new Set(hiddenCols ?? []);
  const visibleCols = TABLE_COLUMNS[group].filter((c) => !hidden.has(c.key));
  const visibleKeys = visibleCols.map((c) => c.key);
  const widths = resolveColumnWidths(group, visibleKeys, editable, resize?.overrides);
  const canResize = editable && !!resize?.onDraft && !!resize?.onCommit;
  return (
    <tr>
      {editable ? <th className="par-edit-hcell" style={{ width: EDIT_HANDLE_COLUMN_WIDTH }} /> : null}
      {visibleCols.map((c, i) => (
        <th
          key={c.key}
          data-col-key={c.key}
          style={{ width: widths[c.key], position: canResize ? "relative" : undefined }}
        >
          {c.label}
          {canResize && i < visibleCols.length - 1 ? (
            <ColResizeHandle
              leftKey={c.key}
              rightKey={visibleCols[i + 1].key}
              onDraft={resize!.onDraft!}
              onCommit={resize!.onCommit!}
            />
          ) : null}
        </th>
      ))}
    </tr>
  );
}

/**
 * 표 열 사이의 세로 구분선 드래그 핸들. thead th 들의 현재 실제 너비(px)를 읽어
 * 퍼센트로 환산한 뒤, 인접한 두 열만 합을 유지하며 조절한다(나머지 열은 그대로).
 * 드래그 중엔 onDraft 로 미리보기, 놓을 때 onCommit 으로 저장.
 */
function ColResizeHandle({
  leftKey,
  rightKey,
  onDraft,
  onCommit,
}: {
  leftKey: string;
  rightKey: string;
  onDraft: (widths: Record<string, number>) => void;
  onCommit: (widths: Record<string, number>) => void;
}) {
  const dragRef = useRef<{ startX: number; contentPx: number; startPct: Record<string, number>; next: Record<string, number> } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const table = e.currentTarget.closest("table");
    if (!table) return;
    const ths = Array.from(table.querySelectorAll<HTMLElement>("thead th[data-col-key]"));
    const startPct: Record<string, number> = {};
    let contentPx = 0;
    const px: Record<string, number> = {};
    for (const th of ths) {
      const key = th.getAttribute("data-col-key");
      if (!key) continue;
      const w = th.getBoundingClientRect().width;
      px[key] = w;
      contentPx += w;
    }
    if (contentPx <= 0) return;
    for (const k of Object.keys(px)) startPct[k] = (px[k] / contentPx) * 100;
    dragRef.current = { startX: e.clientX, contentPx, startPct, next: startPct };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const s = dragRef.current;
    if (!s) return;
    const MIN = 6;
    let d = ((e.clientX - s.startX) / s.contentPx) * 100;
    d = Math.max(-(s.startPct[leftKey] - MIN), Math.min(s.startPct[rightKey] - MIN, d));
    const next: Record<string, number> = { ...s.startPct };
    next[leftKey] = Math.round((s.startPct[leftKey] + d) * 10) / 10;
    next[rightKey] = Math.round((s.startPct[rightKey] - d) * 10) / 10;
    s.next = next;
    onDraft(next);
  };

  const end = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const s = dragRef.current;
    if (!s) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onCommit(s.next);
  };

  return (
    <span
      className="par-col-resize par-edit-chrome"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onMouseDown={(e) => e.stopPropagation()}
      title="드래그해서 열 너비 조절"
      aria-hidden
    />
  );
}
