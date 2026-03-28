"use client";

import { useState, useEffect } from "react";
import { Search, Loader2, FileText, ChevronRight, Plus } from "lucide-react";
import { getSuneungPassages, createSuneungPassage } from "@/actions/learning-questions";
import { toast } from "sonner";
import { GRADE_LEVELS } from "@/lib/learning-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PassageItem {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester?: string | null;
  school?: { id: string; name: string } | null;
}

interface SuneungPassageItem {
  id: string;
  title: string;
  content: string;
  grade: number;
  source: string | null;
  analysis: { id: string } | null;
  _count: { questions: number };
}

interface Props {
  mode: "NAESHIN" | "SUNEUNG";
  academyId: string;
  onSelect: (passage: PassageItem) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PassageSelector({ mode, academyId, onSelect }: Props) {
  if (mode === "NAESHIN") {
    return <NaeshinPassageList academyId={academyId} onSelect={onSelect} />;
  }
  return <SuneungPassageList onSelect={onSelect} />;
}

// ---------------------------------------------------------------------------
// 내신링고 — 기존 학원 지문 목록
// ---------------------------------------------------------------------------

function NaeshinPassageList({ academyId, onSelect }: { academyId: string; onSelect: (p: PassageItem) => void }) {
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterGrade, setFilterGrade] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/passages/list?academyId=${academyId}`)
      .then((r) => r.json())
      .then((data) => setPassages(data.passages || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [academyId]);

  const filtered = passages.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.title.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q)) return false;
    }
    if (filterGrade && p.grade !== Number(filterGrade)) return false;
    return true;
  });

  return (
    <div className="bg-white rounded-2xl border p-6 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
        <input
          placeholder="지문 제목 또는 내용으로 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-11 pl-10 pr-4 text-[13px] rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300"
          autoFocus
        />
      </div>

      <div className="flex items-center gap-2">
        <select
          value={filterGrade}
          onChange={(e) => setFilterGrade(e.target.value)}
          className={`h-8 px-3 pr-7 rounded-full text-[12px] font-medium border appearance-none cursor-pointer transition-all ${
            filterGrade ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-white text-slate-500 border-slate-200"
          }`}
        >
          <option value="">학년 전체</option>
          {GRADE_LEVELS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
        <span className="text-[11px] text-slate-400 ml-auto">{filtered.length}개 지문</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-slate-400">
          분석 완료된 지문이 없습니다. 먼저 지문을 등록해주세요.
        </div>
      ) : (
        <PassageList passages={filtered} onSelect={onSelect} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 수능링고 — 공용 지문 목록 + 새 등록
// ---------------------------------------------------------------------------

function SuneungPassageList({ onSelect }: { onSelect: (p: PassageItem) => void }) {
  const [passages, setPassages] = useState<SuneungPassageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const loadPassages = () => {
    setLoading(true);
    getSuneungPassages({
      grade: filterGrade ? Number(filterGrade) : undefined,
      search: search || undefined,
    })
      .then((data) => setPassages(data as SuneungPassageItem[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPassages(); }, [filterGrade]);

  const filtered = passages.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.title.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Add new passage form */}
      {showAddForm && (
        <SuneungPassageForm
          onClose={() => setShowAddForm(false)}
          onCreated={() => { setShowAddForm(false); loadPassages(); }}
        />
      )}

      <div className="bg-white rounded-2xl border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input
              placeholder="수능 지문 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 text-[13px] rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10 placeholder:text-slate-300"
            />
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="h-11 px-4 text-[13px] font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            지문 추가
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterGrade}
            onChange={(e) => setFilterGrade(e.target.value)}
            className={`h-8 px-3 pr-7 rounded-full text-[12px] font-medium border appearance-none cursor-pointer transition-all ${
              filterGrade ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-white text-slate-500 border-slate-200"
            }`}
          >
            <option value="">학년 전체</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
          <span className="text-[11px] text-slate-400 ml-auto">{filtered.length}개 지문</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-slate-400">
            수능링고 지문이 없습니다. 위에서 지문을 추가해주세요.
          </div>
        ) : (
          <PassageList
            passages={filtered.map((p) => ({
              id: p.id,
              title: p.title,
              content: p.content,
              grade: p.grade,
            }))}
            onSelect={onSelect}
            color="emerald"
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 수능 지문 추가 폼
// ---------------------------------------------------------------------------

function SuneungPassageForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [grade, setGrade] = useState("10");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("제목과 내용을 입력해주세요.");
      return;
    }
    setSaving(true);
    const result = await createSuneungPassage({
      title: title.trim(),
      content: content.trim(),
      grade: Number(grade),
      source: source.trim() || undefined,
    });
    setSaving(false);
    if (result.success) {
      toast.success("수능 지문이 등록되었습니다.");
      onCreated();
    } else {
      toast.error(result.error || "등록 실패");
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-emerald-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">수능링고 지문 추가</h3>
        <button onClick={onClose} className="text-[11px] text-slate-400 hover:text-slate-600">닫기</button>
      </div>

      <input
        placeholder="지문 제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full h-10 px-3 text-[13px] rounded-lg border border-slate-200 outline-none focus:border-emerald-400"
      />

      <div className="flex gap-3">
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="h-10 px-3 pr-7 text-[13px] rounded-lg border border-slate-200 appearance-none"
        >
          {GRADE_LEVELS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
        <input
          placeholder="출처 (예: 2025 수능)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="flex-1 h-10 px-3 text-[13px] rounded-lg border border-slate-200 outline-none focus:border-emerald-400"
        />
      </div>

      <textarea
        placeholder="영어 지문 내용을 붙여넣으세요..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full min-h-[160px] px-3 py-2 text-[13px] leading-relaxed rounded-lg border border-slate-200 bg-slate-50/60 outline-none focus:border-emerald-400 resize-none font-mono"
      />

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !title.trim() || !content.trim()}
          className="h-10 px-5 text-[13px] font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          등록
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 공용 지문 리스트
// ---------------------------------------------------------------------------

function PassageList({
  passages,
  onSelect,
  color = "blue",
}: {
  passages: PassageItem[];
  onSelect: (p: PassageItem) => void;
  color?: "blue" | "emerald";
}) {
  return (
    <div className="space-y-1.5">
      {passages.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p)}
          className={`w-full text-left px-4 py-3 rounded-xl border border-transparent hover:border-${color}-200 hover:bg-${color}-50/40 transition-all group`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-300 shrink-0" />
            <span className={`text-[13px] font-semibold text-slate-800 group-hover:text-${color}-700 transition-colors flex-1 truncate`}>
              {p.title}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {p.grade && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                  {p.grade}학년
                </span>
              )}
              {p.school && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                  {p.school.name}
                </span>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-slate-400 shrink-0" />
          </div>
          <p className="text-[11px] text-slate-400 mt-1 ml-6 line-clamp-1">
            {p.content.slice(0, 200)}
          </p>
        </button>
      ))}
    </div>
  );
}
