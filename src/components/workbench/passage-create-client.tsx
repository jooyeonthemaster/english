"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Sparkles,
  FileText,
  X,
  Plus,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import { createWorkbenchPassage } from "@/actions/workbench";

interface PassageCreateProps {
  schools: Array<{
    id: string;
    name: string;
    type: string;
    publisher: string | null;
  }>;
}

const PUBLISHERS = [
  "능률(김)",
  "능률(양)",
  "비상(홍)",
  "비상(김)",
  "지학사(민)",
  "지학사(양)",
  "천재(이)",
  "천재(정)",
  "금성",
  "동아(윤)",
  "동아(이)",
  "YBM(박)",
  "YBM(한)",
];

const DIFFICULTIES = [
  { value: "BEGINNER", label: "초급 (Beginner)" },
  { value: "ELEMENTARY", label: "기초 (Elementary)" },
  { value: "INTERMEDIATE", label: "중급 (Intermediate)" },
  { value: "UPPER_INTERMEDIATE", label: "중상 (Upper-Intermediate)" },
  { value: "ADVANCED", label: "고급 (Advanced)" },
  { value: "EXPERT", label: "최상급 (Expert)" },
];

export function PassageCreateClient({ schools }: PassageCreateProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [grade, setGrade] = useState("");
  const [semester, setSemester] = useState("");
  const [unit, setUnit] = useState("");
  const [publisher, setPublisher] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [source, setSource] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // Analysis prompt config
  const [analysisPrompt, setAnalysisPrompt] = useState("");
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [targetLevel, setTargetLevel] = useState("");

  const wordCount = content
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  const addTag = useCallback(() => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags((prev) => [...prev, tag]);
      setTagInput("");
    }
  }, [tagInput, tags]);

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  async function handleSave(runAnalysis: boolean = false) {
    if (!title.trim()) {
      toast.error("제목을 입력해주세요.");
      return;
    }
    if (!content.trim()) {
      toast.error("지문 내용을 입력해주세요.");
      return;
    }

    setSaving(true);
    try {
      const result = await createWorkbenchPassage({
        title: title.trim(),
        content: content.trim(),
        schoolId: schoolId || undefined,
        grade: grade ? parseInt(grade) : undefined,
        semester: semester || undefined,
        unit: unit.trim() || undefined,
        publisher: publisher || undefined,
        difficulty: difficulty || undefined,
        source: source.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      if (result.success && result.id) {
        toast.success("지문이 등록되었습니다.");
        if (runAnalysis) {
          // Pass analysis prompt config as query params for auto-analysis on detail page
          const params = new URLSearchParams();
          params.set("autoAnalyze", "true");
          if (analysisPrompt) params.set("prompt", analysisPrompt);
          if (focusAreas.length > 0) params.set("focus", focusAreas.join(","));
          if (targetLevel) params.set("level", targetLevel);
          router.push(`/director/workbench/passages/${result.id}?${params.toString()}`);
        } else {
          router.push("/director/workbench/passages");
        }
      } else {
        toast.error(result.error || "오류가 발생했습니다.");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/director/workbench/passages">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              지문 등록
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              영어 지문을 등록하고 AI 분석을 실행하세요
            </p>
          </div>
        </div>
      </div>

      {/* Main form — 2 columns: content left, metadata right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: Title + Content */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div>
              <Label htmlFor="title" className="text-sm font-medium text-slate-900 mb-1.5 block">
                제목 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                placeholder="예: Lesson 3 - The Power of Music"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-base"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="content" className="text-sm font-medium text-slate-900">
                  지문 내용 <span className="text-red-500">*</span>
                </Label>
                <span className="text-xs text-slate-400">{wordCount} words</span>
              </div>
              <Textarea
                id="content"
                placeholder="영어 지문을 입력하세요..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[400px] font-mono text-sm leading-relaxed resize-y"
              />
            </div>
          </CardContent>
        </Card>

        {/* Right: Metadata + Tags in one card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700">지문 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">학교</Label>
              <Select value={schoolId} onValueChange={setSchoolId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="학교 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">선택 안함</SelectItem>
                  {schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">학년</Label>
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
                <Label className="text-xs text-slate-500 mb-1 block">학기</Label>
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="학기" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIRST">1학기</SelectItem>
                    <SelectItem value="SECOND">2학기</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">단원</Label>
                <Input placeholder="Lesson 3" value={unit} onChange={(e) => setUnit(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">출처</Label>
                <Input placeholder="2025 기말" value={source} onChange={(e) => setSource(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">출판사</Label>
                <Select value={publisher} onValueChange={setPublisher}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="출판사" /></SelectTrigger>
                  <SelectContent>
                    {PUBLISHERS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">난이도</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="자동 감지" /></SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tags inline */}
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">태그</Label>
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
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
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
          </CardContent>
        </Card>
      </div>

      {/* AI Analysis Settings — FULL WIDTH horizontal bar */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-6">
            {/* Left: chips */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-slate-900">AI 분석 설정</span>
                <span className="text-[11px] text-slate-400">저장 + AI 분석 시 적용</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-400 w-[52px] shrink-0">집중 영역</span>
                {[
                  { id: "grammar", label: "문법" },
                  { id: "vocabulary", label: "어휘" },
                  { id: "structure", label: "구조" },
                  { id: "examPoints", label: "출제 포인트" },
                  { id: "grammarLevel", label: "난이도 분류" },
                ].map((area) => {
                  const active = focusAreas.includes(area.id);
                  return (
                    <button key={area.id} type="button"
                      onClick={() => setFocusAreas((prev) => active ? prev.filter((a) => a !== area.id) : [...prev, area.id])}
                      className={`h-7 px-2.5 rounded-full text-[11px] font-medium border transition-all duration-150 ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600"}`}
                    >{area.label}</button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-400 w-[52px] shrink-0">대상 수준</span>
                {[
                  { value: "middle-basic", label: "중학 기초" },
                  { value: "middle-advanced", label: "중학 심화" },
                  { value: "high-basic", label: "고등 기초" },
                  { value: "high-advanced", label: "고등 심화" },
                  { value: "csat", label: "수능" },
                ].map((level) => {
                  const active = targetLevel === level.value;
                  return (
                    <button key={level.value} type="button"
                      onClick={() => setTargetLevel(active ? "" : level.value)}
                      className={`h-7 px-2.5 rounded-full text-[11px] font-medium border transition-all duration-150 ${active ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-800"}`}
                    >{level.label}</button>
                  );
                })}
              </div>
            </div>

            {/* Right: prompt textarea */}
            <div className="w-[380px] shrink-0">
              <Label className="text-[11px] font-medium text-slate-400 mb-1.5 block">추가 지시사항</Label>
              <Textarea
                placeholder="예: 관계대명사 who/which 구분 위주, to부정사 용법 집중..."
                value={analysisPrompt}
                onChange={(e) => setAnalysisPrompt(e.target.value)}
                className="min-h-[76px] text-[13px] leading-relaxed bg-slate-50/60 border-slate-200 placeholder:text-slate-300 resize-none"
                spellCheck={false}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => handleSave(false)}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-1.5" />
          )}
          저장
        </Button>
        <Button
          className="bg-blue-600 hover:bg-blue-700"
          onClick={() => handleSave(true)}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-1.5" />
          )}
          저장 + AI 분석 실행
        </Button>
      </div>
    </div>
  );
}
