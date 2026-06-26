import { type CSSProperties } from "react";
import { type ActivityBlock, type CustomBlock, type ImageBlock } from "@/lib/passage-report/analysis-report/schema";
import { type ActivityAction, ActivityPagePartNode, type ActivityTextRenderer } from "../custom-activity-renders";
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

/** 페이지 본문 최대 높이(mm) — 세로로 긴 웹툰이 한 페이지를 넘지 않게 폭 상한을 잡는다. */
const IMG_MAX_HEIGHT_MM = 248;

/** 지문 웹툰(이미지) 블록 렌더 — 본문 폭 대비 %·정렬·캡션. 인쇄 색상은 전역 print-color-adjust. */
function WebtoonImageNode({ cb }: { cb: ImageBlock }) {
  const ratio = cb.ratio && cb.ratio > 0 ? cb.ratio : 16 / 9; // height/width (세로형 기본)
  const widthPct = cb.widthPct ?? 70;
  const maxWmm = IMG_MAX_HEIGHT_MM / ratio; // 페이지 높이를 넘지 않는 최대 폭
  const textAlign: CSSProperties["textAlign"] =
    cb.align === "left" ? "left" : cb.align === "right" ? "right" : "center";
  return (
    <figure
      className="par-img-figure"
      style={{ margin: 0, textAlign, breakInside: "avoid" }}
    >
      <img
        className="par-img"
        src={cb.imageUrl}
        alt={cb.caption || "지문 웹툰"}
        // aspectRatio(=가로/세로)를 박스에 박아 이미지 픽셀 로드 전에도 정확한 높이를
        // 예약한다 → 페이지네이터(offsetHeight 측정)가 0mm 로 재서 다른 블록과 겹쳐
        // 페이지를 넘기는 클리핑을 막는다. (원격 Supabase URL 은 측정 시점에 미디코드)
        style={{
          display: "inline-block",
          width: `${widthPct}%`,
          maxWidth: `${maxWmm}mm`,
          aspectRatio: 1 / ratio,
          height: "auto",
          verticalAlign: "top",
          borderRadius: "2mm",
        }}
      />
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
      node: <WebtoonImageNode cb={cb} />,
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
