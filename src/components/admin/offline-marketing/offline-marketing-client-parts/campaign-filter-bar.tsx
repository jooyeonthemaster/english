"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip, SearchInput } from "@/components/admin/kit";

/**
 * 오프라인 홍보 필터 줄 — 검색 + 분류 칩(칩 위 X 로 분류 삭제) + "분류 추가" 인라인 입력.
 * 분류 추가/삭제는 상위(서버 액션)로 위임하고, 여기서는 입력 상태만 갖는다.
 */
export function CampaignFilterBar({
  searchInput,
  onSearch,
  categories,
  activeCategory,
  onCategory,
  onAddCategory,
  onRemoveCategory,
  busy,
  right,
}: {
  searchInput: string;
  onSearch: (value: string) => void;
  /** "전체" + 관리 분류 ∪ 사용 중 분류 */
  categories: string[];
  activeCategory: string;
  onCategory: (category: string) => void;
  onAddCategory: (value: string) => Promise<boolean>;
  onRemoveCategory: (category: string) => void;
  busy: boolean;
  right?: React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  async function commit() {
    const value = draft.trim();
    if (!value) {
      setAdding(false);
      return;
    }
    if (await onAddCategory(value)) {
      setDraft("");
      setAdding(false);
    }
  }

  return (
    <FilterBar right={right}>
      <SearchInput
        value={searchInput}
        onChange={onSearch}
        placeholder="홍보·파일 이름 검색"
        ariaLabel="홍보 검색"
      />

      <div role="group" aria-label="분류" className="flex flex-wrap items-center gap-1.5">
        {categories.map((cat) => (
          <span key={cat} className="group relative inline-flex">
            <FilterChip
              active={activeCategory === cat}
              onClick={() => onCategory(cat)}
              label={cat}
            />
            {/* 마우스를 올리면 오른쪽 위에 삭제 버튼(사용 중인 분류는 서버가 차단) */}
            {cat !== "전체" && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemoveCategory(cat)}
                disabled={busy}
                aria-label={`${cat} 분류 삭제`}
                title="분류 삭제"
                className="absolute -right-1 -top-1 hidden size-4 rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm hover:bg-rose-50 hover:text-rose-600 group-hover:inline-flex"
              >
                <X className="size-2.5" />
              </Button>
            )}
          </span>
        ))}

        {adding ? (
          <span className="inline-flex items-center gap-1">
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commit();
                } else if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              placeholder="새 분류"
              aria-label="새 분류 이름"
              disabled={busy}
              maxLength={60}
              className="h-8 w-28 rounded-full text-[12px]"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void commit()}
              disabled={busy || !draft.trim()}
              aria-label="분류 추가"
              title="추가"
              className="text-blue-600 hover:bg-blue-50"
            >
              <Check className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              disabled={busy}
              aria-label="분류 추가 취소"
              title="취소"
              className="text-gray-400 hover:text-gray-700"
            >
              <X className="size-4" />
            </Button>
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
            className="rounded-full border-dashed text-[12px] text-gray-500"
          >
            <Plus className="size-3.5" />
            분류 추가
          </Button>
        )}
      </div>
    </FilterBar>
  );
}
