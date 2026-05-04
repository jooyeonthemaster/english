"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Image,
  FileVideo,
  File,
  Download,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentMaterials, type MaterialItem } from "@/actions/materials";

// ---------------------------------------------------------------------------
// File icon helper
// ---------------------------------------------------------------------------
function FileIcon({ type }: { type: string }) {
  const size = 20;
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
export function MaterialsTab() {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStudentMaterials()
      .then(setMaterials)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 bg-gray-100 rounded-2xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (materials.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <FolderOpen size={32} className="mb-2" />
        <p className="text-[var(--fs-base)]">등록된 수업 자료가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {materials.map((m, i) => (
        <motion.a
          key={m.id}
          href={m.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="flex items-center gap-3 rounded-3xl bg-white p-4 active:scale-[0.98] transition-transform"
        >
          {/* 파일 아이콘 */}
          <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center shrink-0">
            <FileIcon type={m.fileType} />
          </div>

          {/* 정보 */}
          <div className="flex-1 min-w-0">
            <p className="text-[var(--fs-sm)] font-semibold text-black truncate">
              {m.title}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[var(--fs-caption)] text-gray-400">
                {m.className}
              </span>
              <span className="text-[var(--fs-caption)] text-gray-300">·</span>
              <span className="text-[var(--fs-caption)] text-gray-400">
                {formatFileSize(m.fileSize)}
              </span>
              <span className="text-[var(--fs-caption)] text-gray-300">·</span>
              <span className="text-[var(--fs-caption)] text-gray-400">
                {new Date(m.createdAt).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>

          {/* 다운로드 */}
          <Download size={16} className="text-gray-300 shrink-0" />
        </motion.a>
      ))}
    </div>
  );
}
