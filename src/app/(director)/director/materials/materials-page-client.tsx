"use client";

import { useState, useRef } from "react";
import {
  Upload,
  Trash2,
  FileText,
  Image,
  FileVideo,
  File,
  Download,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  uploadMaterial,
  deleteMaterial,
  type MaterialItem,
} from "@/actions/materials";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Props {
  materials: MaterialItem[];
  classes: { id: string; name: string }[];
  academyId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function FileIcon({ type, size = 20 }: { type: string; size?: number }) {
  switch (type) {
    case "pdf":
      return <FileText size={size} className="text-red-500" />;
    case "image":
      return <Image size={size} className="text-blue-500" />;
    case "video":
      return <FileVideo size={size} className="text-purple-500" />;
    case "docx":
    case "hwp":
      return <FileText size={size} className="text-sky-500" />;
    default:
      return <File size={size} className="text-gray-400" />;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function MaterialsPageClient({ materials, classes, academyId }: Props) {
  const router = useRouter();
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!selectedFile || !title.trim()) {
      toast.error("제목과 파일을 입력해주세요.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("title", title.trim());
      fd.append("description", description.trim());
      fd.append("classId", classId);
      fd.append("academyId", academyId);

      const result = await uploadMaterial(fd);
      if (result.success) {
        toast.success("자료가 업로드되었습니다.");
        resetForm();
        router.refresh();
      } else {
        toast.error(result.error ?? "업로드 실패");
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 자료를 삭제하시겠습니까?")) return;
    setDeleting(id);
    try {
      const result = await deleteMaterial(id);
      if (result.success) {
        toast.success("자료가 삭제되었습니다.");
        router.refresh();
      } else {
        toast.error(result.error ?? "삭제 실패");
      }
    } finally {
      setDeleting(null);
    }
  }

  function resetForm() {
    setShowUpload(false);
    setTitle("");
    setDescription("");
    setClassId("");
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">수업 자료</h1>
          <p className="text-sm text-gray-500 mt-1">
            학생에게 공유할 수업 자료를 관리합니다
          </p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
        >
          {showUpload ? <X size={16} /> : <Plus size={16} />}
          {showUpload ? "취소" : "자료 업로드"}
        </button>
      </div>

      {/* 업로드 폼 */}
      {showUpload && (
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                제목 *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="자료 제목"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                대상 반
              </label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체 (모든 학생)</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              설명
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="자료에 대한 간단한 설명 (선택)"
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              파일 * (최대 50MB)
            </label>
            <input
              ref={fileRef}
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
            />
            {selectedFile && (
              <p className="text-xs text-gray-400 mt-1">
                {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </p>
            )}
          </div>

          <button
            onClick={handleUpload}
            disabled={uploading || !selectedFile || !title.trim()}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            <Upload size={16} />
            {uploading ? "업로드 중..." : "업로드"}
          </button>
        </div>
      )}

      {/* 자료 목록 */}
      {materials.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Upload size={32} className="mx-auto mb-2" />
          <p>등록된 자료가 없습니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {materials.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                <FileIcon type={m.fileType} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {m.title}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>{m.className ?? "전체"}</span>
                  <span>·</span>
                  <span>{formatFileSize(m.fileSize)}</span>
                  <span>·</span>
                  <span>{m.uploaderName}</span>
                  <span>·</span>
                  <span>
                    {new Date(m.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={m.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <Download size={16} />
                </a>
                <button
                  onClick={() => handleDelete(m.id)}
                  disabled={deleting === m.id}
                  className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
