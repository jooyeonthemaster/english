"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getCustomPrompts } from "@/actions/custom-prompts";
import { PassageImportDialog } from "@/components/workbench/passage-import-dialog";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import { usePassageQueue } from "@/hooks/use-passage-queue";
import type { PassageCreateProps, SavedPrompt } from "./passage-create/types";
import { mapRecentPassagesToQueueItems } from "./passage-create/utils";
import { usePassageFormState } from "./passage-create/use-passage-form-state";
import { useFilterState } from "./passage-create/use-filter-state";
import { useCollectionsState } from "./passage-create/use-collections-state";
import { Header } from "./passage-create/sections/header";
import { FormSectionContainer } from "./passage-create/sections/form-section-container";
import { QueueSectionContainer } from "./passage-create/sections/queue-section-container";

export type { PassageCreateProps } from "./passage-create/types";

export function PassageCreateClient({ schools, recentPassages, initialCollections }: PassageCreateProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form collapse state
  const [formCollapsed, setFormCollapsed] = useState(false);

  // Core fields + annotations + image + metadata + analysis prompt — grouped into one custom hook
  // to preserve the original contiguous hook order (19 consecutive useStates).
  const {
    title, setTitle,
    content, setContent,
    annotations, setAnnotations,
    imageFile, setImageFile,
    imagePreview, setImagePreview,
    schoolId, setSchoolId,
    grade, setGrade,
    semester, setSemester,
    unit, setUnit,
    publisher, setPublisher,
    publisherCustom, setPublisherCustom,
    source, setSource,
    tagInput, setTagInput,
    tags, setTags,
    analysisPrompt, setAnalysisPrompt,
    savedPrompts, setSavedPrompts,
    showSavedPrompts, setShowSavedPrompts,
    newPromptName, setNewPromptName,
    savingPrompt, setSavingPrompt,
  } = usePassageFormState();

  // Convert server-loaded passages to queue items
  const initialQueueItems = useMemo(() => {
    return mapRecentPassagesToQueueItems(recentPassages);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only compute once on mount — server data doesn't change

  // Queue system
  const { queue, activeCount, hasActiveAnalysis, addToQueue, retryAnalysis, removeFromQueue, updateAnalysisData, updateQuestions } = usePassageQueue(initialQueueItems);

  // Modal state
  const [modalPassageId, setModalPassageId] = useState<string | null>(null);
  const modalPassage = queue.find((p) => p.id === modalPassageId) || null;

  // ─── Filtering ─── grouped 7 contiguous useStates into one custom hook.
  const {
    filterSearch, setFilterSearch,
    filterSchool, setFilterSchool,
    filterGrade, setFilterGrade,
    filterSemester, setFilterSemester,
    filterPublisher, setFilterPublisher,
    filterCollection, setFilterCollection,
    showFilters, setShowFilters,
  } = useFilterState();

  // ─── Selection ───
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // ─── Collections (folders) ─── grouped useStates + effects in one custom hook to preserve the original contiguous hook order.
  const {
    collections, setCollections,
    showNewFolder, setShowNewFolder,
    newFolderName, setNewFolderName,
    editingFolderId, setEditingFolderId,
    editingFolderName, setEditingFolderName,
    showAddToFolder, setShowAddToFolder,
    addingToFolder, setAddingToFolder,
    collectionPassageIds, setCollectionPassageIds,
    loadingCollection,
  } = useCollectionsState({ initialCollections, filterCollection });

  // ─── Filtered queue ───
  const filteredQueue = useMemo(() => {
    let items = queue;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      items = items.filter((p) => p.title.toLowerCase().includes(q) || p.contentPreview.toLowerCase().includes(q));
    }
    if (filterSchool) items = items.filter((p) => p.schoolName === filterSchool);
    if (filterGrade) items = items.filter((p) => p.grade === parseInt(filterGrade));
    if (filterSemester) items = items.filter((p) => p.semester === filterSemester);
    if (filterPublisher) items = items.filter((p) => p.publisher === filterPublisher);
    if (filterCollection) {
      const ids = collectionPassageIds.get(filterCollection);
      if (ids) items = items.filter((p) => ids.has(p.id));
      else items = []; // still loading
    }
    return items;
  }, [queue, filterSearch, filterSchool, filterGrade, filterSemester, filterPublisher, filterCollection, collectionPassageIds]);

  // ─── Unique filter options from queue ───
  const filterOptions = useMemo(() => {
    const schoolNames = [...new Set(queue.filter((p) => p.schoolName).map((p) => p.schoolName!))];
    const grades = [...new Set(queue.filter((p) => p.grade).map((p) => p.grade!))].sort();
    const publishers = [...new Set(queue.filter((p) => p.publisher).map((p) => p.publisher!))];
    return { schoolNames, grades, publishers };
  }, [queue]);

  const hasActiveFilters = !!(filterSearch || filterSchool || filterGrade || filterSemester || filterPublisher);

  // ─── Selection handlers ───
  const toggleSelect = useCallback((id: string, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedId) {
        // Shift-click: select range
        const ids = filteredQueue.map((p) => p.id);
        const startIdx = ids.indexOf(lastSelectedId);
        const endIdx = ids.indexOf(id);
        if (startIdx !== -1 && endIdx !== -1) {
          const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    setLastSelectedId(id);
  }, [lastSelectedId, filteredQueue]);

  const selectAll = useCallback(() => {
    if (selectedIds.size === filteredQueue.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredQueue.map((p) => p.id)));
    }
  }, [selectedIds, filteredQueue]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const wordCount = content
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  const hasContent = content.trim().length > 0 || imageFile !== null;
  const effectivePublisher = publisher === "__CUSTOM__" ? publisherCustom : publisher;

  // Counts
  const doneCount = queue.filter((p) => p.status === "done").length;
  const errorCount = queue.filter((p) => p.status === "error").length;
  const pendingCount = queue.filter((p) => p.status === "pending" || p.status === "analyzing").length;

  // Load saved prompts
  useEffect(() => {
    getCustomPrompts("PASSAGE_ANALYSIS").then((prompts) => {
      setSavedPrompts(prompts as SavedPrompt[]);
    });
  }, []);

  // beforeunload warning
  useEffect(() => {
    if (!hasActiveAnalysis) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasActiveAnalysis]);

  const addTag = useCallback(() => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags((prev) => [...prev, tag]);
      setTagInput("");
    }
  }, [tagInput, tags]);

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-[calc(100vh-64px)]">
        {/* ─── Header ─── */}
        <Header
          queueLength={queue.length} pendingCount={pendingCount} doneCount={doneCount}
          errorCount={errorCount} onOpenImport={() => setImportOpen(true)}
        />

        {/* ─── Main Content Area ─── */}
        <div className="flex-1 overflow-y-auto bg-[#F4F6F9]">
          {/* ─── Collapsible Form Section ─── */}
          <FormSectionContainer
            formCollapsed={formCollapsed} setFormCollapsed={setFormCollapsed}
            hasContent={hasContent} wordCount={wordCount}
            saving={saving} setSaving={setSaving}
            title={title} setTitle={setTitle}
            content={content} setContent={setContent}
            annotations={annotations} setAnnotations={setAnnotations}
            imageFile={imageFile} setImageFile={setImageFile}
            imagePreview={imagePreview} setImagePreview={setImagePreview}
            fileInputRef={fileInputRef}
            schools={schools}
            schoolId={schoolId} setSchoolId={setSchoolId}
            grade={grade} setGrade={setGrade}
            semester={semester} setSemester={setSemester}
            unit={unit} setUnit={setUnit}
            source={source} setSource={setSource}
            publisher={publisher} setPublisher={setPublisher}
            publisherCustom={publisherCustom} setPublisherCustom={setPublisherCustom}
            effectivePublisher={effectivePublisher}
            tagInput={tagInput} setTagInput={setTagInput}
            tags={tags} setTags={setTags}
            addTag={addTag} removeTag={removeTag}
            analysisPrompt={analysisPrompt} setAnalysisPrompt={setAnalysisPrompt}
            savedPrompts={savedPrompts} setSavedPrompts={setSavedPrompts}
            showSavedPrompts={showSavedPrompts} setShowSavedPrompts={setShowSavedPrompts}
            newPromptName={newPromptName} setNewPromptName={setNewPromptName}
            savingPrompt={savingPrompt} setSavingPrompt={setSavingPrompt}
            addToQueue={addToQueue}
          />

          {/* ─── Toolbar + Card Grid ─── */}
          <QueueSectionContainer
            queue={queue} filteredQueue={filteredQueue} activeCount={activeCount}
            filterSearch={filterSearch} setFilterSearch={setFilterSearch}
            filterSchool={filterSchool} setFilterSchool={setFilterSchool}
            filterGrade={filterGrade} setFilterGrade={setFilterGrade}
            filterSemester={filterSemester} setFilterSemester={setFilterSemester}
            filterPublisher={filterPublisher} setFilterPublisher={setFilterPublisher}
            showFilters={showFilters} setShowFilters={setShowFilters}
            filterOptions={filterOptions} hasActiveFilters={hasActiveFilters}
            collections={collections} setCollections={setCollections}
            filterCollection={filterCollection} setFilterCollection={setFilterCollection}
            editingFolderId={editingFolderId} setEditingFolderId={setEditingFolderId}
            editingFolderName={editingFolderName} setEditingFolderName={setEditingFolderName}
            showNewFolder={showNewFolder} setShowNewFolder={setShowNewFolder}
            newFolderName={newFolderName} setNewFolderName={setNewFolderName}
            showAddToFolder={showAddToFolder} setShowAddToFolder={setShowAddToFolder}
            addingToFolder={addingToFolder} setAddingToFolder={setAddingToFolder}
            setCollectionPassageIds={setCollectionPassageIds}
            selectedIds={selectedIds} toggleSelect={toggleSelect}
            selectAll={selectAll} clearSelection={clearSelection}
            setModalPassageId={setModalPassageId}
            retryAnalysis={retryAnalysis} removeFromQueue={removeFromQueue}
          />
        </div>

        {/* ─── Analysis Modal ─── */}
        {modalPassage && (
          <PassageAnalysisModal
            open={!!modalPassageId}
            onClose={() => setModalPassageId(null)}
            passage={modalPassage.passageData}
            initialAnalysis={modalPassage.analysisData}
            initialPromptConfig={modalPassage.promptConfig}
            onAnalysisUpdate={(data) => {
              updateAnalysisData(modalPassage.id, data);
            }}
            onQuestionsUpdate={(questions) => {
              updateQuestions(modalPassage.id, questions);
            }}
            onDelete={(passageId) => {
              removeFromQueue(passageId);
              setModalPassageId(null);
            }}
          />
        )}

        <PassageImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </div>
    </TooltipProvider>
  );
}
