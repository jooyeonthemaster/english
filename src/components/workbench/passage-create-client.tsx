"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  FileText,
  X,
  Plus,
  Loader2,
  Upload,
  Check,
  Wand2,
  ImageIcon,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Trash2,
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  FolderPlus,
  FolderOpen,
  CheckSquare,
  Square,
  MinusSquare,
  Tag,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  createWorkbenchPassage,
  getPassageCollections,
  createPassageCollection,
  updatePassageCollection,
  deletePassageCollection,
  addPassagesToCollection,
  removePassagesFromCollection,
} from "@/actions/workbench";
import {
  getCustomPrompts,
  createCustomPrompt,
  deleteCustomPrompt,
} from "@/actions/custom-prompts";
import { PassageImportDialog } from "@/components/workbench/passage-import-dialog";
import { PassageAnnotationEditor, type Annotation } from "@/components/workbench/editor";
import { PassageQueueCard } from "@/components/workbench/passage-queue-card";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import { usePassageQueue } from "@/hooks/use-passage-queue";

interface RecentPassage {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  source: string | null;
  createdAt: Date;
  school: { id: string; name: string; type: string } | null;
  analysis: { id: string; updatedAt: Date; analysisData: string } | null;
  _count: { questions: number; notes: number };
}

interface PassageCollection {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  _count: { items: number };
}

interface PassageCreateProps {
  schools: Array<{
    id: string;
    name: string;
    type: string;
    publisher: string | null;
  }>;
  recentPassages?: RecentPassage[];
  initialCollections?: PassageCollection[];
}

const PUBLISHERS = [
  "능률(김)", "능률(양)", "비상(홍)", "비상(김)",
  "지학사(민)", "지학사(양)", "천재(이)", "천재(정)",
  "금성", "동아(윤)", "동아(이)", "YBM(박)", "YBM(한)",
];

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const TEST_PASSAGES = [
  {
    title: "The Science of Sleep",
    content: `Sleep is one of the most important activities for human health. During sleep, the brain processes memories and removes waste products that build up during the day. Scientists have discovered that people who consistently get less than seven hours of sleep are more likely to develop serious health problems. The stages of sleep, including REM and deep sleep, each serve different functions. REM sleep is essential for emotional regulation, while deep sleep helps repair muscles and strengthen the immune system. Despite its importance, many people sacrifice sleep for work or entertainment, unaware of the long-term consequences.`,
  },
  {
    title: "Urban Farming Revolution",
    content: `In cities around the world, a quiet revolution is taking place on rooftops and in abandoned buildings. Urban farming has grown rapidly as people seek fresh, locally grown food. Unlike traditional agriculture, urban farms use innovative techniques such as vertical farming and hydroponics to grow crops in limited spaces. These methods use significantly less water and no soil at all. Beyond providing food, urban farms create green spaces that reduce air pollution and lower temperatures in crowded neighborhoods. Community gardens also bring people together, fostering social connections in areas where neighbors rarely interact.`,
  },
  {
    title: "The Digital Divide",
    content: `Access to the internet has become essential for education, employment, and social participation. However, millions of people worldwide still lack reliable internet connections. This gap, known as the digital divide, disproportionately affects rural communities and low-income households. Students without internet access struggle to complete homework assignments and miss opportunities for online learning. Governments and nonprofit organizations are working to bridge this divide by expanding broadband infrastructure and providing affordable devices. Closing the digital divide is not just a matter of technology — it is a matter of equality and opportunity for future generations.`,
  },
];

interface SavedPrompt {
  id: string;
  name: string;
  content: string;
}

export function PassageCreateClient({ schools, recentPassages, initialCollections }: PassageCreateProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form collapse state
  const [formCollapsed, setFormCollapsed] = useState(false);

  // Core fields
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Annotations (teacher's markings on the passage)
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // Image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Metadata — school/grade/semester persist between saves for batch entry
  const [schoolId, setSchoolId] = useState("");
  const [grade, setGrade] = useState("");
  const [semester, setSemester] = useState("");
  const [unit, setUnit] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publisherCustom, setPublisherCustom] = useState("");
  const [source, setSource] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // Analysis prompt
  const [analysisPrompt, setAnalysisPrompt] = useState("");
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [showSavedPrompts, setShowSavedPrompts] = useState(false);
  const [newPromptName, setNewPromptName] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  // Convert server-loaded passages to queue items
  const initialQueueItems = useMemo(() => {
    if (!recentPassages?.length) return undefined;
    return recentPassages.map((p): import("@/hooks/use-passage-queue").QueuedPassage => {
      const words = p.content.trim().split(/\s+/).filter((w) => w.length > 0).length;
      let analysisData = null;
      try {
        if (p.analysis?.analysisData) analysisData = JSON.parse(p.analysis.analysisData);
      } catch { /* ignore */ }
      return {
        id: p.id,
        title: p.title,
        contentPreview: p.content.length > 120 ? p.content.slice(0, 120) + "..." : p.content,
        wordCount: words,
        status: "done" as const, // Server-loaded items are always shown as completed (no auto-analysis)
        analysisData,
        error: null,
        promptConfig: { customPrompt: "", focusAreas: [], targetLevel: "" },
        createdAt: new Date(p.createdAt),
        schoolName: p.school?.name,
        grade: p.grade ?? undefined,
        semester: p.semester ?? undefined,
        unit: p.unit ?? undefined,
        publisher: p.publisher ?? undefined,
        tags: p.tags ? (() => { try { return JSON.parse(p.tags!); } catch { return undefined; } })() : undefined,
        passageData: {
          id: p.id,
          title: p.title,
          content: p.content,
          grade: p.grade,
          semester: p.semester,
          unit: p.unit,
          publisher: p.publisher,
          difficulty: p.difficulty,
          tags: p.tags,
          source: p.source,
          createdAt: new Date(p.createdAt),
          school: p.school,
          analysis: p.analysis ? {
            id: p.analysis.id,
            analysisData: p.analysis.analysisData,
            contentHash: "",
            updatedAt: new Date(p.analysis.updatedAt),
          } : null,
          notes: [],
          questions: [],
        },
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only compute once on mount — server data doesn't change

  // Queue system
  const {
    queue,
    activeCount,
    hasActiveAnalysis,
    addToQueue,
    retryAnalysis,
    removeFromQueue,
    updateAnalysisData,
    updateQuestions,
  } = usePassageQueue(initialQueueItems);

  // Modal state
  const [modalPassageId, setModalPassageId] = useState<string | null>(null);
  const modalPassage = queue.find((p) => p.id === modalPassageId) || null;

  // ─── Filtering ───
  const [filterSearch, setFilterSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [filterPublisher, setFilterPublisher] = useState("");
  const [filterCollection, setFilterCollection] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // ─── Selection ───
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // ─── Collections (folders) ───
  const [collections, setCollections] = useState<PassageCollection[]>(initialCollections || []);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [showAddToFolder, setShowAddToFolder] = useState(false);
  const [addingToFolder, setAddingToFolder] = useState(false);
  // Cache of passageIds per collection for client-side filtering
  const [collectionPassageIds, setCollectionPassageIds] = useState<Map<string, Set<string>>>(new Map());
  const [loadingCollection, setLoadingCollection] = useState(false);

  // Load collections on mount if not provided
  useEffect(() => {
    if (!initialCollections) {
      getPassageCollections("").then((c) => setCollections(c as PassageCollection[])).catch(() => {});
    }
  }, [initialCollections]);

  // Fetch collection's passage IDs when a folder is selected
  useEffect(() => {
    if (!filterCollection) return;
    if (collectionPassageIds.has(filterCollection)) return; // already cached
    setLoadingCollection(true);
    import("@/actions/workbench").then(({ getPassageCollectionItems }) =>
      getPassageCollectionItems(filterCollection).then((passages) => {
        const ids = new Set(passages.map((p: { id: string }) => p.id));
        setCollectionPassageIds((prev) => new Map(prev).set(filterCollection, ids));
        setLoadingCollection(false);
      })
    ).catch(() => setLoadingCollection(false));
  }, [filterCollection, collectionPassageIds]);

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

  // ─── Collection actions ───
  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const result = await createPassageCollection({ name: newFolderName.trim() });
    if (result.success) {
      setCollections((prev) => [{ id: result.id!, name: newFolderName.trim(), description: null, color: null, _count: { items: 0 } }, ...prev]);
      setNewFolderName("");
      setShowNewFolder(false);
      toast.success("폴더가 생성되었습니다.");
    } else {
      toast.error(result.error || "폴더 생성 실패");
    }
  }

  async function handleRenameFolder(id: string) {
    if (!editingFolderName.trim()) return;
    const result = await updatePassageCollection(id, { name: editingFolderName.trim() });
    if (result.success) {
      setCollections((prev) => prev.map((c) => c.id === id ? { ...c, name: editingFolderName.trim() } : c));
      setEditingFolderId(null);
      toast.success("폴더 이름이 변경되었습니다.");
    }
  }

  async function handleDeleteFolder(id: string) {
    if (!confirm("이 폴더를 삭제하시겠습니까? (지문은 삭제되지 않습니다)")) return;
    const result = await deletePassageCollection(id);
    if (result.success) {
      setCollections((prev) => prev.filter((c) => c.id !== id));
      if (filterCollection === id) setFilterCollection("");
      toast.success("폴더가 삭제되었습니다.");
    }
  }

  async function handleAddToFolder(collectionId: string) {
    if (selectedIds.size === 0) return;
    setAddingToFolder(true);
    const result = await addPassagesToCollection(collectionId, [...selectedIds]);
    if (result.success) {
      setCollections((prev) => prev.map((c) =>
        c.id === collectionId ? { ...c, _count: { items: c._count.items + selectedIds.size } } : c
      ));
      // Invalidate cached IDs for this collection so next filter refetches
      setCollectionPassageIds((prev) => { const next = new Map(prev); next.delete(collectionId); return next; });
      toast.success(`${selectedIds.size}개 지문이 폴더에 추가되었습니다.`);
      clearSelection();
      setShowAddToFolder(false);
    } else {
      toast.error(result.error || "추가 실패");
    }
    setAddingToFolder(false);
  }

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

  // ─── Image handling ───
  function attachImage(file: File) {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("PNG, JPG, WebP, GIF 이미지만 지원합니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("10MB 이하 이미지만 업로드할 수 있습니다.");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) attachImage(file);
        return;
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) attachImage(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) attachImage(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ─── Saved prompts ───
  async function handleSavePrompt() {
    if (!newPromptName.trim() || !analysisPrompt.trim()) {
      toast.error("프롬프트 이름과 내용을 모두 입력해주세요.");
      return;
    }
    setSavingPrompt(true);
    try {
      const result = await createCustomPrompt({
        name: newPromptName.trim(),
        content: analysisPrompt.trim(),
        promptType: "PASSAGE_ANALYSIS",
      });
      if (result.success) {
        toast.success("프롬프트가 저장되었습니다.");
        setNewPromptName("");
        const prompts = await getCustomPrompts("PASSAGE_ANALYSIS");
        setSavedPrompts(prompts as SavedPrompt[]);
      }
    } catch {
      toast.error("저장에 실패했습니다.");
    } finally {
      setSavingPrompt(false);
    }
  }

  async function handleDeletePrompt(id: string) {
    await deleteCustomPrompt(id);
    setSavedPrompts((prev) => prev.filter((p) => p.id !== id));
    toast.success("삭제되었습니다.");
  }

  // ─── Extract text from image ───
  async function extractTextFromImage(): Promise<string | null> {
    if (!imageFile) return null;
    const formData = new FormData();
    formData.append("image", imageFile);
    const res = await fetch("/api/ai/extract-text", { method: "POST", body: formData });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "이미지 텍스트 추출 실패");
    }
    const data = await res.json();
    return data.text || null;
  }

  // Build combined prompt from teacher's text + 5-layer annotations
  function buildAnalysisPrompt(textPrompt: string, anns: Annotation[]): string {
    const parts: string[] = [];

    if (textPrompt.trim()) {
      parts.push(`[선생님 지시사항]\n${textPrompt.trim()}`);
    }

    const groups: Record<string, { header: string; anns: Annotation[] }> = {
      vocab: {
        header: "[선생님이 표시한 핵심 어휘 — 이 단어들을 vocabulary에 각각 1번씩만 포함하고 상세히 분석하세요. 절대 같은 단어를 중복 생성하지 마세요]",
        anns: anns.filter((a) => a.type === "vocab"),
      },
      grammar: {
        header: "[선생님이 표시한 문법/어법 포인트 — 이 부분의 문법을 grammarPoints에서 반드시 집중 분석하고, 출제 유형/오답 함정/변형 방향을 상세히 다루세요]",
        anns: anns.filter((a) => a.type === "grammar"),
      },
      syntax: {
        header: "[선생님이 표시한 구문 분석 대상 — syntaxAnalysis에서 이 문장들의 S/V/O/C 구조, 끊어읽기, 핵심 구문 패턴을 반드시 다루세요]",
        anns: anns.filter((a) => a.type === "syntax"),
      },
      sentence: {
        header: "[선생님이 표시한 핵심 문장 — structure 분석에서 이 문장들의 논리적 역할, 빈칸/순서 출제 적합성을 반드시 다루세요]",
        anns: anns.filter((a) => a.type === "sentence"),
      },
      examPoint: {
        header: "[선생님이 표시한 출제 포인트 — examDesign에서 이 부분의 패러프레이징, 구조 변형, 서술형 조건 설정을 반드시 다루세요]",
        anns: anns.filter((a) => a.type === "examPoint"),
      },
    };

    for (const g of Object.values(groups)) {
      if (g.anns.length > 0) {
        const lines = g.anns.map((a) => `- "${a.text}"${a.memo ? ` → ${a.memo}` : ""}`);
        parts.push(`${g.header}\n${lines.join("\n")}`);
      }
    }

    return parts.join("\n\n");
  }

  // Reset form (keep school/grade/semester for batch entry)
  function resetForm() {
    setTitle("");
    setContent("");
    setAnnotations([]);
    setImageFile(null);
    setImagePreview(null);
    setUnit("");
    setSource("");
    setTagInput("");
    setTags([]);
    // Keep: schoolId, grade, semester, publisher, analysisPrompt
  }

  async function handleSave(runAnalysis: boolean = false) {
    if (!content.trim() && !imageFile) {
      toast.error("지문 내용을 입력하거나 이미지를 업로드해주세요.");
      return;
    }

    setSaving(true);
    try {
      let finalContent = content.trim();
      if (imageFile && !finalContent) {
        const extracted = await extractTextFromImage();
        if (!extracted) {
          toast.error("이미지에서 텍스트를 추출하지 못했습니다.");
          setSaving(false);
          return;
        }
        finalContent = extracted;
      }

      const finalTitle = title.trim() || finalContent.split(/[.\n]/)[0].slice(0, 60) || "제목 없음";

      const result = await createWorkbenchPassage({
        title: finalTitle,
        content: finalContent,
        schoolId: schoolId || undefined,
        grade: grade ? parseInt(grade) : undefined,
        semester: semester || undefined,
        unit: unit.trim() || undefined,
        publisher: effectivePublisher || undefined,
        source: source.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      if (result.success && result.id) {
        // Build prompt config
        const combinedPrompt = buildAnalysisPrompt(analysisPrompt, annotations);
        const schoolName = schools.find((s) => s.id === schoolId)?.name;

        // Add to queue
        addToQueue(
          {
            id: result.id,
            title: finalTitle,
            content: finalContent,
            schoolId: schoolId || undefined,
            schoolName,
            grade: grade ? parseInt(grade) : undefined,
            semester: semester || undefined,
            unit: unit.trim() || undefined,
            publisher: effectivePublisher || undefined,
            tags: tags.length > 0 ? tags : undefined,
            source: source.trim() || undefined,
          },
          {
            customPrompt: combinedPrompt,
            focusAreas: [],
            targetLevel: "",
          },
          runAnalysis
        );

        toast.success(
          runAnalysis
            ? "지문이 등록되었습니다. 백그라운드에서 AI 분석을 시작합니다."
            : "지문이 등록되었습니다."
        );

        // Reset form for next entry
        resetForm();

        // Form stays open for continuous entry — no auto-collapse
      } else {
        toast.error(result.error || "오류가 발생했습니다.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-[calc(100vh-64px)]">
        {/* ─── Header ─── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/director/workbench/passages">
              <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <ArrowLeft className="w-4 h-4 text-slate-500" />
              </button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                지문 등록
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                지문을 연속으로 등록하고, 백그라운드에서 AI 분석을 실행합니다
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Queue status badges */}
            {queue.length > 0 && (
              <div className="flex items-center gap-2 mr-2">
                {pendingCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-200">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    분석 중 {pendingCount}
                  </span>
                )}
                {doneCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" />
                    완료 {doneCount}
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-200">
                    <AlertTriangle className="w-3 h-3" />
                    오류 {errorCount}
                  </span>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              className="h-9 text-[13px] gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              일괄 등록 (CSV/JSON)
            </Button>
          </div>
        </div>

        {/* ─── Main Content Area ─── */}
        <div className="flex-1 overflow-y-auto bg-[#F4F6F9]">
          {/* ─── Collapsible Form Section ─── */}
          <div className="border-b border-slate-200 bg-white">
            {/* Collapse toggle */}
            <button
              onClick={() => setFormCollapsed(!formCollapsed)}
              className="w-full flex items-center justify-between px-6 py-3 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-slate-700">
                  {formCollapsed ? "새 지문 등록하기" : "지문 입력"}
                </span>
                {hasContent && !formCollapsed && (
                  <span className="text-[11px] text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded">
                    {wordCount} words
                  </span>
                )}
              </div>
              {formCollapsed ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {!formCollapsed && (
              <div className="px-6 pb-5">
                {/* ─── 3-Column Layout: Editor | Metadata | Prompt ─── */}
                <div className="grid grid-cols-[1fr_320px_320px] gap-5 h-[520px]">
                  {/* Column 1: Title + Content Editor */}
                  <div className="flex flex-col min-h-0">
                    <div className="mb-2">
                      <Label htmlFor="title" className="text-sm font-medium text-slate-700 mb-1.5 block">
                        제목 <span className="text-[11px] text-slate-400 font-normal">(비워두면 자동 생성)</span>
                      </Label>
                      <Input
                        id="title"
                        placeholder="예: Lesson 3 - The Power of Music"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="text-base border-slate-200"
                      />
                    </div>

                    {/* 테스트 지문 불러오기 */}
                    <div className="mb-2">
                      <Select
                        value=""
                        onValueChange={(val) => {
                          const tp = TEST_PASSAGES[Number(val)];
                          if (tp) {
                            setTitle(tp.title);
                            setContent(tp.content);
                            setAnnotations([]);
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 w-[220px] text-[11px] text-slate-400 border-dashed border-slate-300 bg-transparent hover:bg-slate-50">
                          <SelectValue placeholder="테스트 지문 불러오기..." />
                        </SelectTrigger>
                        <SelectContent>
                          {TEST_PASSAGES.map((tp, idx) => (
                            <SelectItem key={idx} value={String(idx)} className="text-[12px]">
                              {tp.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between mb-1.5 shrink-0">
                        <Label className="text-sm font-medium text-slate-700">
                          지문 내용 {!imageFile && <span className="text-red-500">*</span>}
                        </Label>
                        <div className="flex items-center gap-3">
                          {wordCount > 0 && <span className="text-xs text-slate-500">{wordCount} words</span>}
                          {annotations.length > 0 && (
                            <span className="text-[11px] text-blue-600 font-medium">마킹 {annotations.length}개</span>
                          )}
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={handleFileSelect}
                          />
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            이미지
                          </button>
                        </div>
                      </div>

                      {imagePreview && (
                        <div className="flex items-center gap-3 px-3 py-2 mb-2 bg-slate-50 border border-slate-200 rounded-lg shrink-0">
                          <img src={imagePreview} alt="원본" className="h-10 rounded object-contain" />
                          <p className="text-[12px] text-slate-500 flex-1">이미지 첨부됨 · 등록 시 AI가 텍스트를 자동 추출합니다</p>
                          <button onClick={removeImage} className="p-1 rounded hover:bg-slate-200 transition-colors">
                            <X className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        </div>
                      )}

                      {/* Annotation-enabled passage editor */}
                      <div
                        className="flex-1 min-h-0 border border-slate-200 rounded-lg overflow-hidden"
                        onPaste={handlePaste}
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                      >
                        <PassageAnnotationEditor
                          content={content}
                          onContentChange={setContent}
                          annotations={annotations}
                          onAnnotationsChange={setAnnotations}
                          placeholder={"영어 지문을 붙여넣으세요...\n\n텍스트를 드래그하여 핵심 단어, 주요 문법, 중요 문장을 마킹할 수 있습니다."}
                        />
                      </div>

                      {!content && annotations.length === 0 && (
                        <p className="text-[11px] text-slate-400 mt-2 shrink-0">
                          텍스트를 입력한 후, 드래그로 선택하면 핵심 단어 · 주요 문법 · 중요 문장을 마킹할 수 있습니다
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Column 2: Metadata */}
                  <div className="bg-slate-50/70 rounded-xl border border-slate-200 p-5 flex flex-col min-h-0 overflow-y-auto">
                    <h3 className="text-[14px] font-semibold text-slate-700 mb-3 shrink-0">지문 정보</h3>

                    <div className="space-y-3 flex-1">
                      {/* 학교 */}
                      <div>
                        <Label className="text-[11px] text-slate-500 mb-1 block">학교</Label>
                        <Select value={schoolId} onValueChange={setSchoolId}>
                          <SelectTrigger className="w-full h-9"><SelectValue placeholder="학교 선택" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">선택 안함</SelectItem>
                            {schools.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[11px] text-slate-500 mb-1 block">학년</Label>
                          <Select value={grade} onValueChange={setGrade}>
                            <SelectTrigger className="w-full h-9"><SelectValue placeholder="학년" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1학년</SelectItem>
                              <SelectItem value="2">2학년</SelectItem>
                              <SelectItem value="3">3학년</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500 mb-1 block">학기</Label>
                          <Select value={semester} onValueChange={setSemester}>
                            <SelectTrigger className="w-full h-9"><SelectValue placeholder="학기" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="FIRST">1학기</SelectItem>
                              <SelectItem value="SECOND">2학기</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[11px] text-slate-500 mb-1 block">단원</Label>
                          <Input placeholder="Lesson 3" value={unit} onChange={(e) => setUnit(e.target.value)} className="h-9" />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500 mb-1 block">출처</Label>
                          <Input placeholder="2025 기말" value={source} onChange={(e) => setSource(e.target.value)} className="h-9" />
                        </div>
                      </div>

                      <div>
                        <Label className="text-[11px] text-slate-500 mb-1 block">출판사</Label>
                        <Select value={publisher} onValueChange={setPublisher}>
                          <SelectTrigger className="w-full h-9"><SelectValue placeholder="출판사" /></SelectTrigger>
                          <SelectContent>
                            {PUBLISHERS.map((p) => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                            <SelectItem value="__CUSTOM__">직접 입력</SelectItem>
                          </SelectContent>
                        </Select>
                        {publisher === "__CUSTOM__" && (
                          <Input placeholder="출판사명 입력" value={publisherCustom} onChange={(e) => setPublisherCustom(e.target.value)} className="mt-1.5 h-9" />
                        )}
                      </div>

                      <div>
                        <Label className="text-[11px] text-slate-500 mb-1 block">태그</Label>
                        <div className="flex gap-1.5">
                          <Input
                            placeholder="입력 후 Enter"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                            className="flex-1 h-9"
                          />
                          <Button variant="outline" size="icon" onClick={addTag} className="shrink-0 h-9 w-9">
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[11px] pr-1 flex items-center gap-0.5">
                              {tag}
                              <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-red-500">
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Column 3: Teacher's Prompt */}
                  <div
                    className="rounded-xl border border-blue-200/60 p-5 flex flex-col min-h-0 overflow-y-auto"
                    style={{ background: "linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%)" }}
                  >
                    <div className="flex items-center justify-between mb-2 shrink-0">
                      <h3 className="text-[14px] font-bold text-slate-800">
                        선생님의 노하우
                        <span className="ml-1.5 text-[10px] font-medium text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded">
                          AI 반영
                        </span>
                      </h3>
                      <div className="relative">
                        <button
                          onClick={() => setShowSavedPrompts(!showSavedPrompts)}
                          className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-700 font-semibold px-2 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
                        >
                          <Bookmark className="w-3 h-3" />
                          저장된 노트
                          {savedPrompts.length > 0 && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold leading-none">
                              {savedPrompts.length}
                            </span>
                          )}
                          <ChevronDown className={`w-3 h-3 transition-transform ${showSavedPrompts ? "rotate-180" : ""}`} />
                        </button>

                        {showSavedPrompts && savedPrompts.length > 0 && (
                          <div className="absolute right-0 top-7 z-20 w-64 bg-white rounded-lg border border-slate-200 shadow-lg py-1 max-h-48 overflow-y-auto">
                            {savedPrompts.map((p) => (
                              <div key={p.id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 group">
                                <button
                                  onClick={() => { setAnalysisPrompt(p.content); setShowSavedPrompts(false); }}
                                  className="text-[12px] text-slate-700 font-medium truncate flex-1 text-left"
                                >
                                  {p.name}
                                </button>
                                <button
                                  onClick={() => handleDeletePrompt(p.id)}
                                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
                                >
                                  <Trash2 className="w-3 h-3 text-slate-300 hover:text-red-500" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed mb-2 shrink-0">
                      수업에서 강조하는 <span className="text-slate-600 font-medium">핵심 단어, 주요 문법, 중요 문장</span>을
                      적어주시면 선생님만의 관점이 반영된 분석이 만들어집니다.
                    </p>

                    <Textarea
                      placeholder={"예시:\n• 핵심 단어: contribute, responsible\n• 문법 포인트: 관계대명사, to부정사\n• 주요 문장: 3번째 문장 구문 분석 집중"}
                      value={analysisPrompt}
                      onChange={(e) => setAnalysisPrompt(e.target.value)}
                      className="flex-1 text-[12px] leading-relaxed bg-white border-blue-200/60 placeholder:text-slate-300 resize-none focus:border-blue-300"
                      spellCheck={false}
                    />

                    {/* Save prompt */}
                    {analysisPrompt.trim() && (
                      <div className="flex items-center gap-2 mt-2 shrink-0">
                        <Input
                          placeholder="노트 이름"
                          value={newPromptName}
                          onChange={(e) => setNewPromptName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSavePrompt(); } }}
                          className="flex-1 h-8 text-[11px]"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSavePrompt}
                          disabled={savingPrompt || !newPromptName.trim()}
                          className="h-8 text-[10px] shrink-0"
                        >
                          {savingPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                          저장
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* ─── Action buttons ─── */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                  <p className="text-[12px] text-slate-400">
                    {hasContent ? (
                      <>
                        <Check className="w-3 h-3 inline text-green-500 mr-0.5" />
                        {imageFile && !content.trim()
                          ? "이미지 첨부됨 · 등록 시 텍스트 자동 추출"
                          : `지문 입력 완료 · ${wordCount} words`}
                      </>
                    ) : (
                      "지문 내용을 입력하거나 이미지를 붙여넣으세요"
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleSave(false)}
                      disabled={saving || !hasContent}
                      className="h-9"
                    >
                      {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                      저장만 하기
                    </Button>
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 h-9"
                      onClick={() => handleSave(true)}
                      disabled={saving || !hasContent}
                    >
                      {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1.5" />}
                      등록 + AI 분석 실행
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold bg-white/20 px-1.5 py-0.5 rounded">5 크레딧</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── Toolbar + Card Grid ─── */}
          <div className="px-6 py-5">
            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <Layers className="w-6 h-6 text-slate-400" />
                </div>
                <h3 className="text-[14px] font-semibold text-slate-600 mb-1">
                  등록된 지문이 없습니다
                </h3>
                <p className="text-[12px] text-slate-400 max-w-sm">
                  위에서 지문을 등록하면 여기에 카드로 표시됩니다.
                  AI 분석은 백그라운드에서 자동으로 진행됩니다.
                </p>
              </div>
            ) : (
              <>
                {/* ─── Search + Filter bar ─── */}
                <div className="flex items-center gap-3 mb-3">
                  {/* Search */}
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      placeholder="지문 검색..."
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      className="w-full h-9 pl-9 pr-3 text-[13px] rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300"
                    />
                    {filterSearch && (
                      <button onClick={() => setFilterSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                        <X className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    )}
                  </div>

                  {/* Filter toggle */}
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`h-9 px-3 flex items-center gap-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
                      hasActiveFilters ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    필터
                    {hasActiveFilters && (
                      <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center font-bold">
                        {[filterSchool, filterGrade, filterSemester, filterPublisher].filter(Boolean).length}
                      </span>
                    )}
                  </button>

                  {/* Folder management */}
                  <div className="flex items-center gap-1">
                    {collections.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setFilterCollection(filterCollection === c.id ? "" : c.id)}
                        onDoubleClick={() => { setEditingFolderId(c.id); setEditingFolderName(c.name); }}
                        className={`h-9 px-3 flex items-center gap-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
                          filterCollection === c.id
                            ? "bg-blue-50 border-blue-200 text-blue-600"
                            : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}
                        title={`${c.name} (${c._count.items}개) — 더블클릭으로 이름 변경`}
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        {editingFolderId === c.id ? (
                          <input
                            autoFocus
                            value={editingFolderName}
                            onChange={(e) => setEditingFolderName(e.target.value)}
                            onBlur={() => handleRenameFolder(c.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameFolder(c.id);
                              if (e.key === "Escape") setEditingFolderId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-20 bg-transparent outline-none border-b border-blue-400 text-[12px]"
                          />
                        ) : (
                          <>
                            {c.name}
                            <span className="text-[10px] text-slate-400">{c._count.items}</span>
                          </>
                        )}
                        {filterCollection === c.id && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); handleDeleteFolder(c.id); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleDeleteFolder(c.id); } }}
                            className="ml-0.5 p-0.5 rounded hover:bg-red-50 cursor-pointer"
                            title="폴더 삭제"
                          >
                            <X className="w-3 h-3 text-slate-400 hover:text-red-500" />
                          </span>
                        )}
                      </button>
                    ))}

                    {showNewFolder ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          placeholder="폴더 이름"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateFolder();
                            if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); }
                          }}
                          className="h-9 w-32 px-3 text-[12px] rounded-lg border border-blue-300 outline-none focus:ring-2 focus:ring-blue-500/10"
                        />
                        <button onClick={handleCreateFolder} className="h-9 px-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); }} className="h-9 px-2 rounded-lg border border-slate-200 hover:bg-slate-50">
                          <X className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowNewFolder(true)}
                        className="h-9 px-3 flex items-center gap-1.5 text-[12px] font-medium rounded-lg border border-dashed border-slate-300 text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-colors"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        새 폴더
                      </button>
                    )}
                  </div>

                  <div className="flex-1" />

                  {/* Info */}
                  <span className="text-[12px] text-slate-400">
                    {filteredQueue.length !== queue.length
                      ? `${filteredQueue.length} / ${queue.length}개`
                      : `${queue.length}개`}
                  </span>
                  {activeCount > 0 && (
                    <span className="text-[11px] text-blue-600 font-medium">
                      <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                      {activeCount}개 분석 중
                    </span>
                  )}
                </div>

                {/* ─── Expanded filter row ─── */}
                {showFilters && (
                  <div className="flex items-center gap-3 mb-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <Select value={filterSchool} onValueChange={(v) => setFilterSchool(v === "ALL" ? "" : v)}>
                      <SelectTrigger className="w-36 h-8 text-[12px] bg-white"><SelectValue placeholder="학교" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">전체 학교</SelectItem>
                        {filterOptions.schoolNames.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={filterGrade} onValueChange={(v) => setFilterGrade(v === "ALL" ? "" : v)}>
                      <SelectTrigger className="w-28 h-8 text-[12px] bg-white"><SelectValue placeholder="학년" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">전체 학년</SelectItem>
                        {filterOptions.grades.map((g) => <SelectItem key={g} value={String(g)}>{g}학년</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={filterSemester} onValueChange={(v) => setFilterSemester(v === "ALL" ? "" : v)}>
                      <SelectTrigger className="w-28 h-8 text-[12px] bg-white"><SelectValue placeholder="학기" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">전체 학기</SelectItem>
                        <SelectItem value="FIRST">1학기</SelectItem>
                        <SelectItem value="SECOND">2학기</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={filterPublisher} onValueChange={(v) => setFilterPublisher(v === "ALL" ? "" : v)}>
                      <SelectTrigger className="w-32 h-8 text-[12px] bg-white"><SelectValue placeholder="출판사" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">전체 출판사</SelectItem>
                        {filterOptions.publishers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {hasActiveFilters && (
                      <button
                        onClick={() => { setFilterSearch(""); setFilterSchool(""); setFilterGrade(""); setFilterSemester(""); setFilterPublisher(""); }}
                        className="text-[11px] text-blue-600 font-medium hover:text-blue-700"
                      >
                        필터 초기화
                      </button>
                    )}
                  </div>
                )}

                {/* ─── Selection toolbar ─── */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200">
                    <button onClick={selectAll} className="flex items-center gap-1.5 text-[12px] font-medium text-blue-700">
                      {selectedIds.size === filteredQueue.length ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <MinusSquare className="w-4 h-4" />
                      )}
                      {selectedIds.size}개 선택
                    </button>
                    <span className="text-slate-300">|</span>
                    <button onClick={selectAll} className="text-[11px] text-blue-600 font-medium hover:text-blue-700">
                      {selectedIds.size === filteredQueue.length ? "선택 해제" : "전체 선택"}
                    </button>
                    <span className="text-slate-300">|</span>

                    {/* Add to folder */}
                    <div className="relative">
                      <button
                        onClick={() => setShowAddToFolder(!showAddToFolder)}
                        className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        폴더에 추가
                      </button>
                      {showAddToFolder && (
                        <div className="absolute left-0 top-8 z-20 w-56 bg-white rounded-lg border border-slate-200 shadow-lg py-1">
                          {collections.length === 0 ? (
                            <p className="px-3 py-2 text-[12px] text-slate-400">폴더가 없습니다. 먼저 폴더를 만들어주세요.</p>
                          ) : (
                            collections.map((c) => (
                              <button
                                key={c.id}
                                onClick={() => handleAddToFolder(c.id)}
                                disabled={addingToFolder}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-slate-700 hover:bg-blue-50 transition-colors text-left"
                              >
                                <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                                {c.name}
                                <span className="ml-auto text-[10px] text-slate-400">{c._count.items}개</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex-1" />
                    <button onClick={clearSelection} className="text-[11px] text-slate-500 hover:text-slate-700">
                      선택 취소
                    </button>
                  </div>
                )}

                {/* ─── Card grid ─── */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                  {filteredQueue.map((passage) => (
                    <PassageQueueCard
                      key={passage.id}
                      passage={passage}
                      selected={selectedIds.has(passage.id)}
                      onToggleSelect={toggleSelect}
                      onViewDetail={setModalPassageId}
                      onRetry={retryAnalysis}
                      onRemove={removeFromQueue}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
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
