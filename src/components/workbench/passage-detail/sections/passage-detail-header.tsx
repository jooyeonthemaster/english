"use client";

import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Trash2,
  Save,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PassageDetailProps } from "../types";

interface PassageDetailHeaderProps {
  passage: PassageDetailProps["passage"];
  tags: string[];
  hasUnsavedChanges: boolean;
  saving: boolean;
  deleting: boolean;
  onSave: () => void;
  onDelete: () => void;
}

export function PassageDetailHeader({
  passage,
  tags,
  hasUnsavedChanges,
  saving,
  deleting,
  onSave,
  onDelete,
}: PassageDetailHeaderProps) {
  return (
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
            {passage.title}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {passage.school && (
              <Badge variant="outline" className="text-xs">
                {passage.school.name}
              </Badge>
            )}
            {passage.grade && (
              <Badge variant="secondary" className="text-xs">
                {passage.grade}학년
              </Badge>
            )}
            {passage.semester && (
              <Badge variant="secondary" className="text-xs">
                {passage.semester === "FIRST" ? "1학기" : "2학기"}
              </Badge>
            )}
            {passage.unit && (
              <Badge variant="secondary" className="text-xs">
                {passage.unit}
              </Badge>
            )}
            {tags.map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="text-xs text-slate-500"
              >
                {t}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {hasUnsavedChanges && (
          <Button
            variant="outline"
            size="sm"
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            분석 저장
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={onDelete}
          disabled={deleting}
        >
          <Trash2 className="w-4 h-4 mr-1" />
          삭제
        </Button>
        <Button
          className="bg-blue-600 hover:bg-blue-700"
          size="sm"
          onClick={() => {
            // Scroll to exam points section and click the tab
            const pointsTab = document.querySelector('[data-state][id*="trigger-points"]') as HTMLButtonElement;
            if (pointsTab) {
              pointsTab.click();
              pointsTab.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }}
        >
          <Layers className="w-4 h-4 mr-1.5" />
          문제 생성
        </Button>
      </div>
    </div>
  );
}
