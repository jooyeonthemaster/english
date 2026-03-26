"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
  Trash2,
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
import { toast } from "sonner";
import { createWorkbenchPassage } from "@/actions/workbench";
import {
  getCustomPrompts,
  createCustomPrompt,
  deleteCustomPrompt,
} from "@/actions/custom-prompts";
import { PassageImportDialog } from "@/components/workbench/passage-import-dialog";
import { PassageAnnotationEditor, type Annotation } from "@/components/workbench/editor";

interface PassageCreateProps {
  schools: Array<{
    id: string;
    name: string;
    type: string;
    publisher: string | null;
  }>;
}

const PUBLISHERS = [
  "능률(김)", "능률(양)", "비상(홍)", "비상(김)",
  "지학사(민)", "지학사(양)", "천재(이)", "천재(정)",
  "금성", "동아(윤)", "동아(이)", "YBM(박)", "YBM(한)",
];

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

interface SavedPrompt {
  id: string;
  name: string;
  content: string;
}

export function PassageCreateClient({ schools }: PassageCreateProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Core fields
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Annotations (teacher's markings on the passage)
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // Image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Metadata
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

  const wordCount = content
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  const hasContent = content.trim().length > 0 || imageFile !== null;
  const effectivePublisher = publisher === "__CUSTOM__" ? publisherCustom : publisher;

  // Load saved prompts
  useEffect(() => {
    getCustomPrompts("PASSAGE_ANALYSIS").then((prompts) => {
      setSavedPrompts(prompts as SavedPrompt[]);
    });
  }, []);

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
        toast.success("지문이 등록되었습니다.");
        if (runAnalysis) {
          const params = new URLSearchParams();
          params.set("autoAnalyze", "true");
          // Build combined prompt: teacher's text prompt + annotations
          const combinedPrompt = buildAnalysisPrompt(analysisPrompt, annotations);
          console.log("[DEBUG] annotations count:", annotations.length, "prompt length:", combinedPrompt.length);
          console.log("[DEBUG] prompt preview:", combinedPrompt.slice(0, 300));
          if (combinedPrompt) params.set("prompt", combinedPrompt);
          router.push(`/director/workbench/passages/${result.id}?${params.toString()}`);
        } else {
          router.push("/director/workbench/passages");
        }
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
    <div className="p-6 mx-auto flex flex-col gap-5 min-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
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
              텍스트를 붙여넣거나 이미지를 Ctrl+V로 업로드하세요
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-9 text-[13px] gap-1.5">
          <Upload className="w-3.5 h-3.5" />
          일괄 등록 (CSV/JSON)
        </Button>
      </div>

      {/* ─── Main 2-column layout ─── */}
      <div className="flex-1 grid grid-cols-[1fr_1fr] gap-5 min-h-0">
        {/* LEFT: Title + Content */}
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 pt-5 pb-3 shrink-0">
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

          <div className="px-6 pb-5 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1.5 shrink-0">
              <Label className="text-sm font-medium text-slate-700">
                지문 내용 {!imageFile && <span className="text-red-500">*</span>}
              </Label>
              <div className="flex items-center gap-3">
                {wordCount > 0 && <span className="text-xs text-slate-500">{wordCount} words</span>}
                {annotations.length > 0 && (
                  <span className="text-[11px] text-blue-600 font-medium">마킹 {annotations.length}개</span>
                )}
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFileSelect} />
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 transition-colors">
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
            <div className="flex-1 min-h-0 border border-slate-200 rounded-lg overflow-hidden">
              <PassageAnnotationEditor
                content={content}
                onContentChange={setContent}
                annotations={annotations}
                onAnnotationsChange={setAnnotations}
                placeholder="영어 지문을 붙여넣으세요...&#10;&#10;텍스트를 드래그하여 핵심 단어, 주요 문법, 중요 문장을 마킹할 수 있습니다."
              />
            </div>

            {!content && annotations.length === 0 && (
              <p className="text-[11px] text-slate-400 mt-2 shrink-0">
                텍스트를 입력한 후, 드래그로 선택하면 핵심 단어 · 주요 문법 · 중요 문장을 마킹할 수 있습니다
              </p>
            )}
          </div>
        </div>

        {/* RIGHT: Metadata + Analysis prompt */}
        <div className="flex flex-col gap-5 min-h-0">
          {/* 지문 정보 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shrink-0">
            <h3 className="text-[15px] font-semibold text-slate-700 mb-4">지문 정보</h3>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              {/* 학교 — full width */}
              <div className="col-span-2">
                <Label className="text-[12px] text-slate-500 mb-1 block">학교</Label>
                <Select value={schoolId} onValueChange={setSchoolId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="학교 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">선택 안함</SelectItem>
                    {schools.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[12px] text-slate-500 mb-1 block">학년</Label>
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="학년" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1학년</SelectItem>
                    <SelectItem value="2">2학년</SelectItem>
                    <SelectItem value="3">3학년</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[12px] text-slate-500 mb-1 block">학기</Label>
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="학기" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIRST">1학기</SelectItem>
                    <SelectItem value="SECOND">2학기</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[12px] text-slate-500 mb-1 block">단원</Label>
                <Input placeholder="Lesson 3" value={unit} onChange={(e) => setUnit(e.target.value)} />
              </div>
              <div>
                <Label className="text-[12px] text-slate-500 mb-1 block">출처</Label>
                <Input placeholder="2025 기말" value={source} onChange={(e) => setSource(e.target.value)} />
              </div>

              <div>
                <Label className="text-[12px] text-slate-500 mb-1 block">출판사</Label>
                <Select value={publisher} onValueChange={setPublisher}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="출판사" /></SelectTrigger>
                  <SelectContent>
                    {PUBLISHERS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                    <SelectItem value="__CUSTOM__">직접 입력</SelectItem>
                  </SelectContent>
                </Select>
                {publisher === "__CUSTOM__" && (
                  <Input placeholder="출판사명 입력" value={publisherCustom} onChange={(e) => setPublisherCustom(e.target.value)} className="mt-1.5" />
                )}
              </div>
              <div>
                <Label className="text-[12px] text-slate-500 mb-1 block">태그</Label>
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
                <div className="col-span-2 flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[11px] pr-1 flex items-center gap-0.5">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-red-500"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 선생님의 노하우 */}
          <div className="rounded-xl border border-blue-200/60 p-5 flex-1 flex flex-col min-h-0" style={{ background: "linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%)" }}>
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h3 className="text-[15px] font-bold text-slate-800">
                선생님의 노하우
                <span className="ml-1.5 text-[11px] font-medium text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded">AI 반영</span>
              </h3>
              <div className="relative">
                <button
                  onClick={() => setShowSavedPrompts(!showSavedPrompts)}
                  className="flex items-center gap-1.5 text-[12px] text-blue-600 hover:text-blue-700 font-semibold px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  저장된 노트
                  {savedPrompts.length > 0 && (
                    <span className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-none">
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

            <p className="text-[12px] text-slate-400 leading-relaxed mb-3 shrink-0">
              수업에서 강조하는 <span className="text-slate-600 font-medium">핵심 단어, 주요 문법, 중요 문장</span>을 적어주시면
              선생님만의 관점이 반영된 분석이 만들어집니다.
            </p>

            <Textarea
              placeholder={"예시:\n• 핵심 단어: contribute, responsible, perception\n• 문법 포인트: 관계대명사 who/which, to부정사 부사적 용법\n• 주요 문장: 3번째 문장 구문 분석 집중\n• 기타: 빈칸 출제 가능성 높은 연결사 위주로 분석"}
              value={analysisPrompt}
              onChange={(e) => setAnalysisPrompt(e.target.value)}
              className="flex-1 text-[13px] leading-relaxed bg-white border-blue-200/60 placeholder:text-slate-300 resize-none focus:border-blue-300"
              spellCheck={false}
            />

            {/* Save prompt */}
            {analysisPrompt.trim() && (
              <div className="flex items-center gap-2 mt-3 shrink-0">
                <Input
                  placeholder="노트 이름 (예: 강동고 2학년 기본)"
                  value={newPromptName}
                  onChange={(e) => setNewPromptName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSavePrompt(); } }}
                  className="flex-1 h-8 text-[12px]"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSavePrompt}
                  disabled={savingPrompt || !newPromptName.trim()}
                  className="h-8 text-[11px] shrink-0"
                >
                  {savingPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                  저장
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Action buttons ─── */}
      <div className="flex items-center justify-between shrink-0 pt-1">
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
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving || !hasContent} className="h-9">
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            저장만 하기
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 h-9" onClick={() => handleSave(true)} disabled={saving || !hasContent}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1.5" />}
            등록 + AI 분석 실행
          </Button>
        </div>
      </div>

      <PassageImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
