"use client";

// ============================================================================
// StructuredEditor — right-column tabbed editor (passage/question/explanation/
// meta). Extracted from review-step.tsx during mechanical split.
// ============================================================================

import type { BlockType } from "@/lib/extraction/block-types";
import { getModeConfig } from "@/lib/extraction/modes";
import type {
  ExtractionItemSnapshot,
  SourceMaterialSnapshot,
} from "@/lib/extraction/types";
import type {
  EditorTab,
  M2PassageDraftSnapshot,
  SourceMaterialDraft,
} from "../types";
import { ExplanationTab } from "./explanation-tab";
import { MetaTab } from "./meta-tab";
import { PassageTab } from "./passage-tab";
import { QuestionTab } from "./question-tab";

interface StructuredEditorProps {
  mode: ReturnType<typeof getModeConfig>["id"];
  activeTab: EditorTab;
  setActiveTab: (tab: EditorTab) => void;
  availableTabs: readonly EditorTab[];
  items: ExtractionItemSnapshot[];
  selectedItem: ExtractionItemSnapshot | null;
  onChangeContent: (id: string, content: string) => void;
  onChangeTitle: (id: string, title: string) => void;
  onChangeType: (id: string, type: BlockType) => void;
  onSplit: (id: string, caret: number) => void;
  onMergeWithNext: (id: string) => void;
  onSkipToggle: (id: string) => void;
  sourceDraft: SourceMaterialDraft;
  setSourceDraft: (draft: SourceMaterialDraft) => void;
  sourceMaterial: SourceMaterialSnapshot | null;
  m2PassageDrafts?: M2PassageDraftSnapshot[];
}

export function StructuredEditor(props: StructuredEditorProps) {
  const {
    activeTab,
    setActiveTab,
    availableTabs,
    items,
    selectedItem,
    onChangeContent,
    onChangeTitle,
    onChangeType,
    onSplit,
    onMergeWithNext,
    onSkipToggle,
    sourceDraft,
    setSourceDraft,
    m2PassageDrafts = [],
  } = props;

  const passageItem = pickForTab(items, selectedItem, "PASSAGE_BODY");
  const m2Draft = findM2DraftForItem(m2PassageDrafts, passageItem);
  const sourceMatches = m2PassageDrafts.flatMap((draft) => draft.sourceMatches);

  const tabLabels: Record<EditorTab, string> = {
    passage: "지문",
    question: "문제",
    explanation: "해설",
    meta: "메타",
  };

  return (
    <aside
      className="flex w-[520px] shrink-0 flex-col border-l border-slate-200 bg-white"
      aria-label="구조화 에디터"
    >
      <div
        className="flex border-b border-slate-200"
        role="tablist"
        aria-label="에디터 탭"
      >
        {availableTabs.map((tab) => {
          const active = tab === activeTab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab)}
              className={
                "relative flex-1 px-3 py-2.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 " +
                (active
                  ? "text-sky-700"
                  : "text-slate-500 hover:text-slate-700")
              }
            >
              {tabLabels[tab]}
              {active ? (
                <span className="absolute inset-x-3 bottom-0 h-[2px] bg-sky-500" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === "passage" ? (
          <PassageTab
            item={passageItem}
            m2Draft={m2Draft}
            onChangeContent={onChangeContent}
            onChangeTitle={onChangeTitle}
            onChangeType={onChangeType}
            onSplit={onSplit}
            onMergeWithNext={onMergeWithNext}
            onSkipToggle={onSkipToggle}
          />
        ) : null}

        {activeTab === "question" ? (
          <QuestionTab
            items={items}
            selectedItem={selectedItem}
            onChangeContent={onChangeContent}
            onChangeType={onChangeType}
          />
        ) : null}

        {activeTab === "explanation" ? (
          <ExplanationTab
            item={pickForTab(items, selectedItem, "EXPLANATION")}
            onChangeContent={onChangeContent}
            onChangeTitle={onChangeTitle}
            onChangeType={onChangeType}
          />
        ) : null}

        {activeTab === "meta" ? (
          <MetaTab
            draft={sourceDraft}
            setDraft={setSourceDraft}
            sourceMatches={sourceMatches}
          />
        ) : null}
      </div>
    </aside>
  );
}

function pickForTab(
  items: ExtractionItemSnapshot[],
  selectedItem: ExtractionItemSnapshot | null,
  preferType: BlockType,
): ExtractionItemSnapshot | null {
  if (selectedItem?.blockType === preferType) return selectedItem;
  if (selectedItem) {
    // Walk parent chain if the selection is a child of the preferred type
    if (preferType === "PASSAGE_BODY") {
      // Try to find the nearest PASSAGE in the same group
      const group = items.filter((it) => it.groupId === selectedItem.groupId);
      const passage = group.find((g) => g.blockType === "PASSAGE_BODY");
      if (passage) return passage;
    }
    if (preferType === "EXPLANATION") {
      const exp = items.find(
        (it) =>
          it.blockType === "EXPLANATION" && it.parentItemId === selectedItem.id,
      );
      if (exp) return exp;
    }
  }
  return items.find((it) => it.blockType === preferType) ?? null;
}

function findM2DraftForItem(
  drafts: M2PassageDraftSnapshot[],
  item: ExtractionItemSnapshot | null,
): M2PassageDraftSnapshot | null {
  if (!item) return drafts[0] ?? null;
  const byItemId = drafts.find((draft) => {
    const metadata = draft.metadata as Record<string, unknown> | null;
    return metadata?.passageItemId === item.id;
  });
  if (byItemId) return byItemId;
  return drafts[0] ?? null;
}
