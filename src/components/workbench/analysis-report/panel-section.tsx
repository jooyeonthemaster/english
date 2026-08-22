import {
  ChevronDown,
  ChevronUp,
  GripVertical,
} from "lucide-react";
import {
  Children,
  cloneElement,
  type DragEvent,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";

import { cn } from "@/lib/utils";
import {
  isPanelSectionId,
  normalizePanelSectionOrder,
  readStoredCollapsedPanelSections,
  readStoredPanelSectionOrder,
  writeStoredCollapsedPanelSections,
  writeStoredPanelSectionOrder,
  type PanelSectionId,
} from "./editor-storage";

type PanelSectionProps = {
  sectionId?: PanelSectionId;
  title: string;
  /** 스크롤 타겟용 DOM id (선택 시 이 카드로 자동 스크롤). */
  anchorId?: string;
  /** 헤더에 보조 표시할 현재 상태 요약(로컬 vocab/worksheet 패널에서 사용). */
  summary?: ReactNode;
  children: ReactNode;
  collapsed?: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onToggle?: (id: PanelSectionId) => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>, id: PanelSectionId) => void;
  onDragOver?: (event: DragEvent<HTMLElement>, id: PanelSectionId) => void;
  onDrop?: (event: DragEvent<HTMLElement>, id: PanelSectionId) => void;
  onDragEnd?: () => void;
};

export function PanelSection({
  sectionId,
  title,
  anchorId,
  summary,
  children,
  collapsed = false,
  dragging = false,
  dragOver = false,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: PanelSectionProps) {
  return (
    <section
      id={anchorId}
      onDragOver={(event) => sectionId && onDragOver?.(event, sectionId)}
      onDrop={(event) => sectionId && onDrop?.(event, sectionId)}
      className={cn(
        "mb-2.5 overflow-hidden rounded-lg border bg-white shadow-sm transition-all last:mb-0",
        dragOver ? "border-blue-300 shadow-[0_0_0_2px_rgba(59,130,246,0.12)]" : "border-slate-200",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-2 py-1.5">
        {sectionId ? (
          <button
            type="button"
            draggable
            onDragStart={(event) => onDragStart?.(event, sectionId)}
            onDragEnd={onDragEnd}
            className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-700 active:cursor-grabbing"
            title={`${title} 섹션 드래그`}
            aria-label={`${title} 섹션 드래그`}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => sectionId && onToggle?.(sectionId)}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white"
          title={`${title} ${collapsed ? "펼치기" : "접기"}`}
        >
          <h4 className="w-full truncate text-[10.5px] font-black uppercase tracking-wide text-slate-500">{title}</h4>
          {summary ? (
            <span className="w-full truncate text-[10px] font-medium text-slate-400">{summary}</span>
          ) : null}
        </button>
        {sectionId ? (
          <button
            type="button"
            onClick={() => onToggle?.(sectionId)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
            title={`${title} ${collapsed ? "펼치기" : "접기"}`}
            aria-label={`${title} ${collapsed ? "펼치기" : "접기"}`}
          >
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>
      {!collapsed ? <div className="px-3 py-3">{children}</div> : null}
    </section>
  );
}

export function SortablePanelStack({
  children,
  blockSelected = false,
  activityActive = false,
  activityActivateNonce = 0,
  onActivateActivity,
  vocabTestActive = false,
  vocabTestActivateNonce = 0,
  ns,
}: {
  children: ReactNode;
  blockSelected?: boolean;
  activityActive?: boolean;
  /** 팔레트에서 (재)활성화할 때마다 증가 — 이미 활성이어도 접힌 섹션을 다시 펼친다. */
  activityActivateNonce?: number;
  onActivateActivity?: () => void;
  vocabTestActive?: boolean;
  /** '단어 시험지' 카드를 누를 때마다 증가 — 이미 활성이어도 접힌 섹션을 다시 펼친다. */
  vocabTestActivateNonce?: number;
  /**
   * [E21-3] localStorage 네임스페이스. 미전달(undefined)이면 `reportEditorPanelSectionKeys`
   * (editor-storage.ts:155-167)가 현행 상수 키를 그대로 반환하므로 독립 라우트는 **바이트 동일**.
   * 조판 임베드(sheet-compose-surface.tsx 의 `storageNamespace`)에서만 키가 갈라진다.
   */
  ns?: string;
}) {
  // activity-edit / vocab-test-edit 접힘은 영속(localStorage)하지 않고 전용 상태로 — 활성화될 때마다 항상 펼침으로 시작.
  const [activityEditCollapsed, setActivityEditCollapsed] = useState(false);
  useEffect(() => {
    if (activityActive) setActivityEditCollapsed(false);
  }, [activityActive, activityActivateNonce]);
  const [vocabTestEditCollapsed, setVocabTestEditCollapsed] = useState(false);
  useEffect(() => {
    if (vocabTestActive) setVocabTestEditCollapsed(false);
  }, [vocabTestActive, vocabTestActivateNonce]);
  // [E21-3] ns 를 lazy initializer 로 **직접** 넘기면 React 가 인자 없이 호출해 ns 가 유실된다
  // (editor-storage.ts:169-171 주석과 동일한 함정) → 반드시 화살표로 감싸 인자를 명시한다.
  const [sectionOrder, setSectionOrder] = useState<PanelSectionId[]>(() =>
    readStoredPanelSectionOrder(ns),
  );
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<PanelSectionId[]>(() =>
    readStoredCollapsedPanelSections(ns),
  );
  const [draggingSectionId, setDraggingSectionId] = useState<PanelSectionId | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<PanelSectionId | null>(null);

  // [E21-3] 인라인 setItem(ns-무관 상수 키) → ns 접근자로 교체. 이 두 줄이 미배선이라
  // 조판 임베드에서 접은 카드(예: 표지·디자인 템플릿)가 전역 키를 덮어써 독립 라우트까지
  // 접힌 채로 떴다(실측 `.tmp-worksheet-compose/_audit-l4-ls-leak2.mjs`:
  // T0 collapsed=["logo"] → 임베드 셸 내부 헤더만 클릭 → T2 ["logo","cover","theme"],
  // 같은 시점 sheetCompose 섹션 ns 키는 0개).
  useEffect(() => {
    writeStoredPanelSectionOrder(sectionOrder, ns);
  }, [sectionOrder, ns]);

  useEffect(() => {
    writeStoredCollapsedPanelSections(collapsedSectionIds, ns);
  }, [collapsedSectionIds, ns]);

  const togglePanelSection = useCallback(
    (id: PanelSectionId) => {
      // 블록 편집 중에는 다른 카드들이 강제로 접혀 있으므로(아래 collapsed 계산), 저장된 토글 선호값을
      // 건드리지 않도록 'block-edit'·'activity-edit' 외의 토글은 무시한다 → 선택 해제 시 원래 상태 복구.
      if (blockSelected && id !== "block-edit" && id !== "activity-edit" && id !== "vocab-test-edit") return;
      if (id === "activity-edit") {
        // 비활성(다른 블록을 보는 중)일 때 헤더를 누르면 → 그 활동을 다시 선택해 펼친다(죽은 토글 방지).
        // 활성 상태면 전용 상태로 접고/펴기(영속 안 함 — 재활성 시 항상 펼침).
        if (!activityActive) onActivateActivity?.();
        else setActivityEditCollapsed((v) => !v);
        return;
      }
      if (id === "vocab-test-edit") {
        if (vocabTestActive) setVocabTestEditCollapsed((v) => !v);
        return;
      }
      setCollapsedSectionIds((current) =>
        current.includes(id) ? current.filter((sectionId) => sectionId !== id) : [...current, id],
      );
    },
    [blockSelected, activityActive, vocabTestActive, onActivateActivity],
  );

  const reorderPanelSection = useCallback((sourceId: PanelSectionId, targetId: PanelSectionId) => {
    if (sourceId === targetId) return;
    setSectionOrder((current) => {
      const normalized = normalizePanelSectionOrder(current);
      const withoutSource = normalized.filter((sectionId) => sectionId !== sourceId);
      const targetIndex = withoutSource.indexOf(targetId);
      if (targetIndex < 0) return current;
      const next = [...withoutSource];
      next.splice(targetIndex, 0, sourceId);
      return next;
    });
  }, []);

  const handlePanelSectionDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>, id: PanelSectionId) => {
      setDraggingSectionId(id);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
    },
    [],
  );

  const handlePanelSectionDragOver = useCallback(
    (event: DragEvent<HTMLElement>, id: PanelSectionId) => {
      const sourceId = draggingSectionId;
      if (!sourceId || sourceId === id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOverSectionId(id);
    },
    [draggingSectionId],
  );

  const handlePanelSectionDrop = useCallback(
    (event: DragEvent<HTMLElement>, id: PanelSectionId) => {
      event.preventDefault();
      const data = event.dataTransfer.getData("text/plain");
      const sourceId = isPanelSectionId(data) ? data : draggingSectionId;
      if (sourceId) reorderPanelSection(sourceId, id);
      setDraggingSectionId(null);
      setDragOverSectionId(null);
    },
    [draggingSectionId, reorderPanelSection],
  );

  const handlePanelSectionDragEnd = useCallback(() => {
    setDraggingSectionId(null);
    setDragOverSectionId(null);
  }, []);

  const collectPanels = (node: ReactNode): ReactElement<PanelSectionProps>[] => {
    const out: ReactElement<PanelSectionProps>[] = [];
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return;
      const props = child.props as Partial<PanelSectionProps> & { children?: ReactNode };
      if (props.sectionId) out.push(child as ReactElement<PanelSectionProps>);
      else if (props.children) out.push(...collectPanels(props.children));
    });
    return out;
  };

  const panels = collectPanels(children);
  const panelById = new Map<PanelSectionId, ReactElement<PanelSectionProps>>();
  for (const panel of panels) {
    const id = panel.props.sectionId;
    if (id) panelById.set(id, panel);
  }

  const orderedIds = normalizePanelSectionOrder(sectionOrder).filter((id) => panelById.has(id));
  const collapsedSections = new Set(collapsedSectionIds);

  return (
    <div>
      {orderedIds.map((id) => {
        const panel = panelById.get(id);
        if (!panel) return null;
        // 블록 선택 중에는 '블록 편집' 카드만 자기 토글 상태를 따르고, 나머지는 모두 접는다.
        // activity-edit 는 그 활동이 '현재 선택'이면 자기 토글(기본 펼침)을 따르고, 아니면 접힌 채 유지(사라지지 않음).
        // (저장된 collapsedSectionIds 는 그대로 두므로 선택 해제 시 원상 복구됨)
        const collapsed =
          id === "activity-edit"
            ? activityActive
              ? activityEditCollapsed
              : true
            : id === "vocab-test-edit"
              ? vocabTestActive
                ? vocabTestEditCollapsed
                : true
              : blockSelected && id !== "block-edit"
                ? true
                : collapsedSections.has(id);
        return cloneElement(panel, {
          key: id,
          collapsed,
          dragging: draggingSectionId === id,
          dragOver: dragOverSectionId === id,
          onToggle: togglePanelSection,
          onDragStart: handlePanelSectionDragStart,
          onDragOver: handlePanelSectionDragOver,
          onDrop: handlePanelSectionDrop,
          onDragEnd: handlePanelSectionDragEnd,
        });
      })}
    </div>
  );
}
