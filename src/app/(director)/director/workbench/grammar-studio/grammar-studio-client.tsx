"use client";

// ============================================================================
// 어법 훈련소 셸 — 헤더 + StatStrip 4타일 + 파트→유닛 폴더 그리드 (§D5-2 A 와이어)
//
// - 폴더 그리드는 FolderSection 읽기 전용 소비: CRUD·드래그 콜백은 전부 no-op,
//   추가 버튼·칩 메뉴는 래퍼에서 봉인한다(커리큘럼 불변 계약 — 파트/유닛은
//   curriculum.ts 정본에서 파생한 가상 폴더, DB 0회).
// - 루트=「전체 유닛」(treatRootAsFolder) → 파트 4폴더(기초 골격·판별 1~3부)
//   → 유닛 19 카드(배지=문항 수, 0이면 rose ⚠ 「문항 없음」).
// - 유닛 클릭 → unit-detail(칩 필터 + 문항 전수 테이블 + GrammarItemModal).
// - [이 유닛으로 AI 생성](D-2 협의 배선): unit-detail 의 onGenerate 시드를 여기서
//   받아 GenerateStudioPanel 을 리프트 렌더한다(뒤로 가기 시 시드 폐기).
// - 노출 문구는 director-glossary 경유(SURFACE_ONELINERS·GRAMMAR_STUDIO_COPY).
// ============================================================================

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { GrammarStudioIcon } from "@/components/icons/workflow-icons";
import {
  SectionCard,
  StatStrip,
  StatTile,
} from "@/components/layout/page-frame";
import { FolderSection } from "@/components/workbench/shared/folder-section";
import type { CollectionItem } from "@/components/workbench/shared/types";
import {
  BASIC_UNIT_IDS,
  GRAMMAR_PARTS,
  GRAMMAR_UNITS,
  JUDGE_UNIT_IDS,
  unitLabel,
} from "@/lib/grammar-drill/curriculum";
import type { GrammarUnit } from "@/lib/grammar-drill/types";
import {
  GRAMMAR_STUDIO_COPY,
  GRAMMAR_SURFACE_NAMES,
  SURFACE_ONELINERS,
} from "@/lib/wording/director-glossary";
import { GenerateStudioPanel } from "./generate-panel";
import { UnitDetail, type GrammarStudioGenerateSeed } from "./unit-detail";

/** 파트 가상 폴더 id — "part-0" ~ "part-3" (커리큘럼 part 축) */
const PART_FOLDER_PREFIX = "part-";
const partFolderId = (part: number) => `${PART_FOLDER_PREFIX}${part}`;

const noop = () => {
  /* 읽기 전용 폴더 그리드 — CRUD·드래그 봉인(§D5-2) */
};

export function GrammarStudioClient({
  totalItems,
  conceptCount,
  itemCountByUnit,
}: {
  /** 번들 전체 문항 수(getGrammarBundle().stats.items) */
  totalItems: number;
  /** 번들 개념 카드 수(stats.concepts) */
  conceptCount: number;
  /** 유닛별 문항 수 — 19유닛 전 키 보장(0 포함) */
  itemCountByUnit: Record<string, number>;
}) {
  const [activePartId, setActivePartId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  // AI 생성 시드 — unit-detail 의 현재 칩 선택 그대로(null = 패널 닫힘)
  const [generateSeed, setGenerateSeed] = useState<GrammarStudioGenerateSeed | null>(
    null,
  );

  // 파트 → CollectionItem 매핑(커리큘럼 정본 파생 — DB 0)
  const partFolders = useMemo<CollectionItem[]>(
    () =>
      GRAMMAR_PARTS.map((p) => ({
        id: partFolderId(p.part),
        parentId: null,
        name: p.name,
        description: p.tagline,
        color: null,
        _count: {
          items: p.unitIds.reduce(
            (sum, uid) => sum + (itemCountByUnit[uid] ?? 0),
            0,
          ),
          children: 0,
        },
      })),
    [itemCountByUnit],
  );

  const activePart = activePartId
    ? (partFolders.find((f) => f.id === activePartId) ?? null)
    : null;

  const emptyUnitIds = useMemo(
    () => GRAMMAR_UNITS.filter((u) => (itemCountByUnit[u.id] ?? 0) === 0).map((u) => u.id),
    [itemCountByUnit],
  );
  const emptyBasicCount = useMemo(
    () => emptyUnitIds.filter((id) => BASIC_UNIT_IDS.includes(id)).length,
    [emptyUnitIds],
  );

  const visibleParts = activePartId
    ? GRAMMAR_PARTS.filter((p) => partFolderId(p.part) === activePartId)
    : GRAMMAR_PARTS;

  // ── 유닛 상세 — 브라우징을 통째로 대체(뒤로 가기로 복귀) ──────────────────
  if (selectedUnitId) {
    return (
      <>
        <UnitDetail
          unitId={selectedUnitId}
          onBack={() => {
            setGenerateSeed(null);
            setSelectedUnitId(null);
          }}
          onGenerate={setGenerateSeed}
        />
        {generateSeed ? (
          <GenerateStudioPanel
            seed={generateSeed}
            onClose={() => setGenerateSeed(null)}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      {/* ── 헤더 + KPI 스트립 ── */}
      <SectionCard
        icon={GrammarStudioIcon}
        title={GRAMMAR_SURFACE_NAMES.STUDIO}
        description={SURFACE_ONELINERS["grammar-studio"]}
      >
        <StatStrip className="sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
          <StatTile
            label={GRAMMAR_STUDIO_COPY.STAT_TOTAL_ITEMS}
            value={totalItems.toLocaleString()}
            sub="유닛 드릴 뱅크 기준"
          />
          <StatTile
            label={GRAMMAR_STUDIO_COPY.STAT_UNITS}
            value={`${GRAMMAR_UNITS.length}개`}
            sub={`기초 ${BASIC_UNIT_IDS.length} · 판별 ${JUDGE_UNIT_IDS.length}`}
          />
          <StatTile
            label={GRAMMAR_STUDIO_COPY.STAT_CONCEPTS}
            value={`${conceptCount}개`}
          />
          <StatTile
            label={GRAMMAR_STUDIO_COPY.STAT_EMPTY_UNITS}
            value={`${emptyUnitIds.length}개`}
            sub={emptyBasicCount > 0 ? `기초 ${emptyBasicCount}개 포함` : undefined}
            tone={emptyUnitIds.length > 0 ? "rose" : "slate"}
          />
        </StatStrip>
      </SectionCard>

      {/* ── 파트 폴더 그리드 — FolderSection 읽기 전용 소비 ──
          래퍼가 CRUD 진입로를 봉인한다: 추가(dashed)·칩 메뉴(absolute dots)
          버튼은 CSS 로 숨기고, 더블클릭 이름변경·우클릭 메뉴는 캡처 단계에서
          전파를 끊는다(커리큘럼 폴더는 이름·구조 불변). */}
      <div
        className="[&_button.border-dashed]:hidden [&_div.group_button.absolute]:hidden"
        onDoubleClickCapture={(e) => e.stopPropagation()}
        onContextMenuCapture={(e) => e.stopPropagation()}
      >
        <FolderSection
          childFolders={activePartId ? [] : partFolders}
          activeFolder={activePartId}
          dragItemType="question"
          dragItemIdKey="questionId"
          itemCountLabel="문항"
          showNewFolder={false}
          newFolderName=""
          onNewFolderNameChange={noop}
          onShowNewFolder={noop}
          onCreateFolder={noop}
          onNavigateToFolder={(id) => setActivePartId(id)}
          onRenameFolder={noop}
          onDeleteFolder={noop}
          onDragToFolder={noop}
          breadcrumbPath={activePart ? [activePart] : []}
          onNavigateToRoot={() => setActivePartId(null)}
          treatRootAsFolder
          hideHeader
          rootLabel={GRAMMAR_STUDIO_COPY.ROOT_FOLDER}
          storageKey="grammar-studio"
          pageHeader={{
            icon: <GrammarStudioIcon className="size-4" />,
            title: GRAMMAR_SURFACE_NAMES.STUDIO,
            totalCount: GRAMMAR_UNITS.length,
            itemLabel: "유닛",
            itemUnit: "유닛",
          }}
        />
      </div>

      {/* ── 유닛 카드 그리드 — 파트별 그룹(활성 파트만 또는 전체) ── */}
      {visibleParts.map((part) => {
        const units = GRAMMAR_UNITS.filter((u) => u.part === part.part);
        return (
          <section key={part.part} className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-baseline gap-2 px-0.5">
              <h3 className="shrink-0 text-[13px] font-bold text-slate-700">
                {part.name}
              </h3>
              <p className="truncate text-[12px] text-slate-400">{part.tagline}</p>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {units.map((unit) => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  itemCount={itemCountByUnit[unit.id] ?? 0}
                  onSelect={() => setSelectedUnitId(unit.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

/** 유닛 카드 — 배지=문항 수(0이면 rose ⚠ 「문항 없음」), 클릭=유닛 상세 진입 */
function UnitCard({
  unit,
  itemCount,
  onSelect,
}: {
  unit: GrammarUnit;
  itemCount: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
    >
      <span className="flex w-full items-center gap-1.5">
        <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-500">
          {unitLabel(unit.id)}
        </span>
        <span className="min-w-0 flex-1" />
        {itemCount === 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-bold text-rose-600">
            <TriangleAlert className="size-3" aria-hidden />
            {GRAMMAR_STUDIO_COPY.NO_ITEMS_BADGE}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-blue-600">
            {itemCount.toLocaleString()}문항
          </span>
        )}
      </span>
      <span className="w-full truncate text-[13.5px] font-bold text-slate-900">
        {unit.title}
      </span>
      <span className="w-full truncate text-[12px] text-slate-500">{unit.subtitle}</span>
      <span className="w-full truncate text-[11px] text-slate-400">
        개념 {unit.conceptIds.length}개 · {unit.frequencyNote}
      </span>
    </button>
  );
}
