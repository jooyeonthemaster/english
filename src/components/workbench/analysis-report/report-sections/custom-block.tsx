import { type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { type ActivityBlock, type CustomBlock, type ImageBlock } from "@/lib/passage-report/analysis-report/schema";
import { type ActivityAction, ActivityPagePartNode, type ActivityTextRenderer } from "../custom-activity-renders";
import { PAGE_BODY_MM } from "../report-pages/constants";
import type { CustomEdit, FlowItem } from "./types";
import { Field } from "./editable-field";

// ─── 커스텀 블록 (여백 / 자유 텍스트) ────────────────────────────────────────
function CustomTextNode({
  cb,
  editable,
  onText,
  onEnterNewBlock,
}: {
  cb: Extract<CustomBlock, { kind: "text" }>;
  editable: boolean;
  onText: (v: string) => void;
  onEnterNewBlock?: () => void;
}) {
  return (
    <div className="par-customtext">
      <Field as="div" className="par-customtext-b" editable={editable} value={cb.text} placeholder="자유 텍스트를 입력하세요" onCommit={onText} onEnterNewBlock={onEnterNewBlock} />
    </div>
  );
}

/**
 * 페이지 본문 최대 높이(mm) — 세로로 긴 웹툰이 한 페이지를 넘지 않게 폭 상한을 잡는다.
 * 옛 하드코딩 248 은 실제 가용(로고 있는 헤더 기준 244.9mm)을 넘어 이미지 블록이
 * 확정적으로 러닝 푸터를 뚫었다 → 페이지 예산 상수를 그대로 쓴다(단일 진실원).
 */
const IMG_MAX_HEIGHT_MM = PAGE_BODY_MM;
/** 본문 폭(mm) — A4 210 - 좌우 여백 13×2(compact-spec §0 I3, .par-measure 폭과 동기). */
const IMG_CONTENT_WIDTH_MM = 184;

const IMG_HANDLE_CORNERS = ["nw", "ne", "sw", "se"] as const;
type ImgCorner = (typeof IMG_HANDLE_CORNERS)[number];

/**
 * 지문 웹툰(이미지) 블록 렌더 — 본문 폭 대비 %·정렬·캡션. 편집 모드에서는 네 모서리
 * 핸들을 드래그해 가로세로 비율을 유지한 채 크기를 조절한다(widthPct 커밋).
 * 인쇄 색상은 전역 print-color-adjust. 리사이즈는 ResizeHandle 과 동일하게 드래그 중에는
 * DOM 인라인 스타일만 바꾸고(React state 없음 → SSR/뷰 렌더 안전), 손을 떼면 commit 한다.
 */
function WebtoonImageNode({
  cb,
  editable,
  onWidth,
}: {
  cb: ImageBlock;
  editable?: boolean;
  onWidth?: (pct: number) => void;
}) {
  const ratio = cb.ratio && cb.ratio > 0 ? cb.ratio : 16 / 9; // height/width (세로형 기본)
  const widthPct = cb.widthPct ?? 70;
  const maxWmm = IMG_MAX_HEIGHT_MM / ratio; // 페이지 높이를 넘지 않는 최대 폭
  // 폭 상한(%) — 페이지 높이를 넘지 않는 maxWmm 를 본문 폭 대비 비율로 환산.
  const maxPct = Math.min(100, (maxWmm / IMG_CONTENT_WIDTH_MM) * 100);
  const textAlign: CSSProperties["textAlign"] =
    cb.align === "left" ? "left" : cb.align === "right" ? "right" : "center";

  const onHandleDown = (
    e: ReactPointerEvent<HTMLButtonElement>,
    corner: ImgCorner,
  ) => {
    if (!editable || !onWidth || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    const box = handle.closest<HTMLElement>(".par-img-box");
    const figure = box?.parentElement as HTMLElement | null;
    if (!box || !figure) return;
    handle.setPointerCapture(e.pointerId);

    const containerPx = figure.clientWidth || 1; // 본문 폭(레이아웃 px)
    const sheet = box.closest(".par-sheet") as HTMLElement | null;
    const zoom = sheet ? parseFloat(getComputedStyle(sheet).zoom) || 1 : 1;
    const startX = e.clientX;
    const startPct = widthPct;
    const signX = corner === "ne" || corner === "se" ? 1 : -1; // 동쪽=오른쪽으로 끌면 확대

    let raf = 0;
    let lastX = startX;
    let committed = startPct;
    let moved = false; // 실제 드래그 이동 여부 — 단순 클릭으로는 commit 하지 않는다.
    document.body.classList.add("par-img-resizing");
    box.classList.add("is-resizing");

    const apply = () => {
      raf = 0;
      const dxLayout = ((lastX - startX) / zoom) * signX;
      let pct = startPct + (dxLayout / containerPx) * 100;
      pct = Math.max(20, Math.min(maxPct, Math.round(pct)));
      committed = pct;
      box.style.width = `${pct}%`;
    };
    const move = (ev: PointerEvent) => {
      moved = true;
      lastX = ev.clientX;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel);
      document.body.classList.remove("par-img-resizing");
      box.classList.remove("is-resizing");
    };
    const up = () => {
      cleanup();
      // 드래그 이동이 없었으면(클릭만) 아무것도 커밋하지 않는다 — startPct 가 maxPct 를
      // 벗어난 세로 긴 웹툰에서 클릭만으로 widthPct 가 바뀌는 버그 방지.
      if (!moved) {
        box.style.width = `${startPct}%`;
        return;
      }
      apply();
      if (Math.abs(committed - startPct) >= 0.5) onWidth(committed);
      else box.style.width = `${startPct}%`; // 변화 없으면 React 소유 값으로 복원
    };
    const cancel = () => {
      cleanup();
      box.style.width = `${startPct}%`;
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
    handle.addEventListener("pointercancel", cancel, { once: true });
  };

  return (
    <figure
      className="par-img-figure"
      style={{ margin: 0, textAlign, breakInside: "avoid" }}
    >
      {/* aspectRatio(=가로/세로)를 박스에 박아 이미지 픽셀 로드 전에도 정확한 높이를
          예약한다 → 페이지네이터(offsetHeight 측정)가 0mm 로 재서 다른 블록과 겹쳐
          페이지를 넘기는 클리핑을 막는다. (원격 Supabase URL 은 측정 시점에 미디코드) */}
      <span
        className="par-img-box"
        style={{
          position: "relative",
          display: "inline-block",
          width: `${widthPct}%`,
          maxWidth: `${maxWmm}mm`,
          verticalAlign: "top",
        }}
      >
        {/* 인쇄용 A4(mm) 레이아웃 이미지 — next/image 부적합(고정 mm 폭·인쇄 색상). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="par-img"
          src={cb.imageUrl}
          alt={cb.caption || "지문 웹툰"}
          style={{
            display: "block",
            width: "100%",
            aspectRatio: 1 / ratio,
            height: "auto",
            borderRadius: "2mm",
          }}
        />
        {editable
          ? IMG_HANDLE_CORNERS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label="웹툰 크기 조절"
                title="모서리를 드래그해 크기 조절"
                onPointerDown={(e) => onHandleDown(e, c)}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className={`par-img-handle par-img-handle-${c} par-edit-chrome`}
              />
            ))
          : null}
      </span>
      {cb.caption ? (
        <figcaption
          className="par-img-cap"
          style={{
            marginTop: "1.5mm",
            fontSize: "9pt",
            lineHeight: 1.4,
            color: "#64748b",
            textAlign,
          }}
        >
          {cb.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function customBlockFlowItems(
  cb: CustomBlock,
  setCustom?: CustomEdit,
  insertTextAfter?: (anchorId: string) => void,
  onActivity?: (id: string, action: ActivityAction) => void,
  blockMeta?: Record<string, { breakBefore?: boolean } | undefined>,
): FlowItem[] {
  if (cb.kind === "spacer") {
    return [{
      id: cb.id,
      sectionIndex: -1,
      kind: "custom",
      no: 0,
      wrap: "spacer",
      node: <div className="par-spacer-fill" style={{ height: `${cb.heightMm}mm` }} aria-hidden />,
    }];
  }
  if (cb.kind === "image") {
    return [{
      id: cb.id,
      sectionIndex: -1,
      kind: "custom",
      no: 0,
      wrap: "image",
      // 세로(minHeight) 리사이즈 핸들은 끄고, 노드 안의 모서리 핸들이 비율 유지 폭 조절을 담당한다.
      resizable: false,
      node: (
        <WebtoonImageNode
          cb={cb}
          editable={!!setCustom}
          onWidth={
            setCustom ? (pct) => setCustom(cb.id, { widthPct: pct }) : undefined
          }
        />
      ),
    }];
  }
  if (cb.kind === "activity") {
    const editable = !!setCustom;
    const patchActivityItem = (index: number, patch: Partial<ActivityBlock["payload"]["items"][number]>) => {
      if (!setCustom || !cb.payload.items[index]) return;
      const items = cb.payload.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      );
      setCustom(cb.id, { payload: { ...cb.payload, items } } as Partial<CustomBlock>);
    };
    const renderActivityText: ActivityTextRenderer = ({
      as,
      className,
      value,
      placeholder,
      onCommit,
      dataAttrs,
    }) => (
      <Field
        as={as}
        className={className}
        editable={editable}
        value={value}
        placeholder={placeholder}
        onCommit={editable ? onCommit : () => {}}
        dataAttrs={dataAttrs}
      />
    );
    const base = {
      sectionIndex: -1,
      kind: "custom" as const,
      no: 0,
      wrap: "activity" as const,
      orderId: cb.id,
      editId: cb.id,
      resizable: false,
    };
    // 학습 활동은 기본값으로 새 페이지에서 시작(블록의 첫 항목만). meta.breakBefore===false 로 끌 수 있다.
    const firstBreak = blockMeta?.[cb.id]?.breakBefore ?? true;
    const items = cb.payload.items;
    const out: FlowItem[] =
      items.length === 0
        ? [{
            ...base,
            id: `${cb.id}::empty`,
            showGrip: true,
            breakBefore: firstBreak,
            node: (
              <ActivityPagePartNode
                block={cb}
                onActivity={onActivity}
                part={{ type: "empty", showHeader: true }}
                renderText={renderActivityText}
                onItemPatch={editable ? patchActivityItem : undefined}
              />
            ),
          }]
        : items.map((_, index) => ({
            ...base,
            id: `${cb.id}::item-${index}`,
            showGrip: index === 0,
            breakBefore: index === 0 ? firstBreak : undefined,
            node: (
              <ActivityPagePartNode
                block={cb}
                onActivity={onActivity}
                part={{ type: "item", index, showHeader: index === 0 }}
                renderText={renderActivityText}
                onItemPatch={editable ? patchActivityItem : undefined}
              />
            ),
          }));

    if (cb.payload.wordBank && cb.payload.wordBank.length > 0) {
      out.push({
        ...base,
        id: `${cb.id}::word-bank`,
        showGrip: items.length === 0,
        node: (
          <ActivityPagePartNode
            block={cb}
            onActivity={onActivity}
            part={{ type: "wordBank" }}
            renderText={renderActivityText}
            onItemPatch={editable ? patchActivityItem : undefined}
          />
        ),
      });
    }
    return out;
  }
  return [{
    id: cb.id,
    sectionIndex: -1,
    kind: "custom",
    no: 0,
    wrap: "custom-text",
    node: (
      <CustomTextNode
        cb={cb}
        editable={!!setCustom}
        onText={(v) => setCustom?.(cb.id, { text: v })}
        onEnterNewBlock={insertTextAfter ? () => insertTextAfter(cb.id) : undefined}
      />
    ),
  }];
}

export function customBlockFlowItem(
  cb: CustomBlock,
  setCustom?: CustomEdit,
  insertTextAfter?: (anchorId: string) => void,
  onActivity?: (id: string, action: ActivityAction) => void,
  blockMeta?: Record<string, { breakBefore?: boolean } | undefined>,
): FlowItem {
  return customBlockFlowItems(cb, setCustom, insertTextAfter, onActivity, blockMeta)[0];
}
