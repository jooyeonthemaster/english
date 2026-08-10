"use client";

// ============================================================================
// 반 편성 뷰 — 워크벤치 폴더 스택 이식 (v3 design §D4-3, C-3 · FolderSection 9호)
//
// 반 = 폴더(평면·중첩 없음), 학생 = 카드. 드롭 기본 동작은 **담기**(추가 —
// ClassEnrollment 다대다라 여러 반에 함께 편성 가능) + 확정 토스트
// 「{반}에 N명을 편성했습니다」+실행 취소 8초. 반 안에서 다른 반으로 끌면
// 기존 DragDropModePopover(복사/이동 2선택)가 그대로 뜬다(폴더 스택 상속).
//
// 드롭 커밋·토스트는 훅(handleDragToFolder)을 쓰지 않고 자체 구현한다 —
// 훅의 범용 토스트(「N개 …이(가) 복사되었습니다」)가 아니라 D4-3 정본 문구
// (편성/빼기 + 정원 초과 등 서버 에러 문자열 노출)가 계약이기 때문.
// 폴더 CRUD·내비·카운트는 use-folder-manager 를 그대로 소비한다.
//
// 서버 액션이 revalidatePath 를 걸므로 액션 후 RSC 새 props 가 내려온다 —
// sync effect 가 서버 진실로 재동기화한다(셸 「+ 새 반」 생성분 반영 경로).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderKanban, UsersRound } from "lucide-react";
import { FolderSection } from "@/components/workbench/shared/folder-section";
import type { CollectionItem } from "@/components/workbench/shared/types";
import { useFolderManager } from "@/hooks/use-folder-manager";
import { CardEmpty, TabEmpty } from "@/components/students/hub/analytics/kit";
import {
  CLASS_FOLDER_COPY,
  EMPTY_STATES,
  MANAGE_VIEW_LABELS,
} from "@/lib/wording/director-glossary";
import {
  addStudentsToClass,
  createClassFolder,
  deleteClassFolder,
  removeStudentsFromClass,
  renameClassFolder,
  type ClassRosterStudent,
} from "@/actions/students/class-folders";
import { StudentDragCard } from "./student-drag-card";

const UNDO_TOAST_DURATION = 8000;

function toMembershipSets(
  source: Record<string, string[]>,
): Record<string, Set<string>> {
  const next: Record<string, Set<string>> = {};
  for (const [classId, ids] of Object.entries(source)) {
    next[classId] = new Set(ids);
  }
  return next;
}

function cloneMembership(
  source: Record<string, Set<string>>,
): Record<string, Set<string>> {
  const next: Record<string, Set<string>> = {};
  for (const [classId, ids] of Object.entries(source)) {
    next[classId] = new Set(ids);
  }
  return next;
}

interface ClassFolderViewProps {
  initialCollections: CollectionItem[];
  /** classId → 재원생 studentId 배열(서버 직렬화 — Set 은 클라에서 변환) */
  initialMembership: Record<string, string[]>;
  students: ClassRosterStudent[];
}

export function ClassFolderView({
  initialCollections,
  initialMembership,
  students,
}: ClassFolderViewProps) {
  // FolderActions 5종 주입 — 삭제 거부(재원생 존재)는 훅이 조용히 삼키므로
  // 여기서 에러 문자열을 토스트로 노출한다.
  const actions = useMemo(
    () => ({
      createCollection: (data: { name: string; parentId?: string }) =>
        createClassFolder(data),
      updateCollection: (id: string, data: { name: string }) =>
        renameClassFolder(id, data),
      deleteCollection: async (id: string) => {
        const res = await deleteClassFolder(id);
        if (!res.success && res.error) toast.error(res.error);
        return res;
      },
      addToCollection: (collectionId: string, itemIds: string[]) =>
        addStudentsToClass(collectionId, itemIds),
      removeFromCollection: (collectionId: string, itemIds: string[]) =>
        removeStudentsFromClass(collectionId, itemIds),
    }),
    [],
  );

  const initialMembershipSets = useMemo(
    () => toMembershipSets(initialMembership),
    [initialMembership],
  );

  const folders = useFolderManager({
    initialCollections,
    initialMembership: initialMembershipSets,
    actions,
    itemLabel: CLASS_FOLDER_COPY.ITEM_LABEL,
    // N-10 — 「폴더」 어휘 대신 반 문맥 문구(기본값은 워크벤치 8소비처 무회귀)
    deleteConfirmMessage: CLASS_FOLDER_COPY.DELETE_CONFIRM,
    deleteSuccessMessage: CLASS_FOLDER_COPY.DELETED_TOAST,
  });
  const { setCollections, setMembership } = folders;
  const { membership, collections, activeFolder } = folders;

  // 서버 진실 재동기화 — revalidatePath 후 새 RSC props(액션 커밋 반영분)와
  // 셸 「+ 새 반」 router.refresh 생성분을 훅 상태에 반영한다.
  useEffect(() => {
    setCollections(initialCollections);
    setMembership(toMembershipSets(initialMembership));
  }, [initialCollections, initialMembership, setCollections, setMembership]);

  // ── 선택(다중 드래그 묶음) — 반 이동 시 혼선 방지 위해 내비 때 비운다 ──────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const getDragStudentIds = useCallback(
    (studentId: string) =>
      selectedIds.has(studentId) ? [...selectedIds] : [studentId],
    [selectedIds],
  );

  const handleNavigateToFolder = useCallback(
    (id: string) => {
      folders.navigateToFolder(id);
      setSelectedIds(new Set());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folders.navigateToFolder],
  );
  const handleNavigateToRoot = useCallback(
    () => {
      folders.navigateToFolder(null);
      setSelectedIds(new Set());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folders.navigateToFolder],
  );

  // ── 낙관 스냅샷 적용 — membership + 폴더 배지 카운트 동기(훅 내부 관용 미러) ──
  const applyMembershipSnapshot = useCallback(
    (next: Record<string, Set<string>>) => {
      setMembership(next);
      setCollections((prev) =>
        prev.map((c) => ({
          ...c,
          _count: { ...c._count, items: next[c.id]?.size ?? 0 },
        })),
      );
    },
    [setCollections, setMembership],
  );

  /** 드래그된 id(들) 해석 — 선택에 포함된 카드를 끌면 선택 전체가 함께 간다. */
  const resolveDragIds = useCallback(
    (itemId: string | string[]) => {
      const dragged = Array.isArray(itemId) ? itemId : [itemId];
      const useSelection = dragged.some((id) => selectedIds.has(id));
      return useSelection ? [...selectedIds] : [...new Set(dragged)];
    },
    [selectedIds],
  );

  // ── 드롭 → 반에 담기(copy) / 현재 반에서 빼고 옮기기(move) ─────────────────
  const handleDropToClass = useCallback(
    async (itemId: string | string[], classId: string, copy: boolean) => {
      const ids = resolveDragIds(itemId);
      if (ids.length === 0) return;
      const className =
        collections.find((c) => c.id === classId)?.name ??
        MANAGE_VIEW_LABELS.classes;
      // 이동(2선택 팝오버의 「이동」)은 지금 보고 있는 반에서만 뺀다 —
      // 다른 반의 편성은 건드리지 않는다(폴더 스택 이동 의미론 동형).
      const sourceClassId =
        !copy && activeFolder && activeFolder !== classId ? activeFolder : null;
      const before = cloneMembership(membership);
      try {
        const addRes = await addStudentsToClass(classId, ids);
        if (!addRes.success) {
          toast.error(addRes.error ?? CLASS_FOLDER_COPY.ACTION_FAILED);
          return;
        }
        const addedIds = addRes.addedIds ?? [];
        let removedIds: string[] = [];
        if (sourceClassId) {
          const rmRes = await removeStudentsFromClass(sourceClassId, ids);
          if (!rmRes.success) {
            toast.error(rmRes.error ?? CLASS_FOLDER_COPY.ACTION_FAILED);
          } else {
            removedIds = rmRes.removedIds ?? [];
          }
        }
        if (addedIds.length === 0 && removedIds.length === 0) {
          toast.info(CLASS_FOLDER_COPY.ALREADY_ENROLLED);
          return;
        }

        const next = cloneMembership(before);
        const target = new Set(next[classId] ?? []);
        for (const id of addedIds) target.add(id);
        next[classId] = target;
        if (sourceClassId) {
          const src = new Set(next[sourceClassId] ?? []);
          for (const id of removedIds) src.delete(id);
          next[sourceClassId] = src;
        }
        applyMembershipSnapshot(next);

        const changedCount = new Set([...addedIds, ...removedIds]).size;
        const undo = async () => {
          try {
            const tasks: Promise<{ success: boolean }>[] = [];
            if (addedIds.length > 0) {
              tasks.push(removeStudentsFromClass(classId, addedIds));
            }
            if (sourceClassId && removedIds.length > 0) {
              tasks.push(addStudentsToClass(sourceClassId, removedIds));
            }
            const results = await Promise.all(tasks);
            if (results.some((r) => !r.success)) {
              toast.error(CLASS_FOLDER_COPY.UNDO_FAILED);
              return;
            }
            applyMembershipSnapshot(before);
            toast.success(CLASS_FOLDER_COPY.UNDO_DONE);
          } catch {
            toast.error(CLASS_FOLDER_COPY.UNDO_FAILED);
          }
        };
        toast.success(CLASS_FOLDER_COPY.ENROLLED_TOAST(className, changedCount), {
          duration: UNDO_TOAST_DURATION,
          action: { label: CLASS_FOLDER_COPY.UNDO, onClick: () => void undo() },
        });
      } catch {
        toast.error(CLASS_FOLDER_COPY.ACTION_FAILED);
      }
    },
    [
      resolveDragIds,
      collections,
      activeFolder,
      membership,
      applyMembershipSnapshot,
    ],
  );

  // ── 루트(전체 학생)로 드롭 = 지금 보고 있는 반에서 빼기 ────────────────────
  const handleDragToRoot = useCallback(
    async (itemId: string | string[]) => {
      if (!activeFolder) return;
      const ids = resolveDragIds(itemId);
      if (ids.length === 0) return;
      const classId = activeFolder;
      const className =
        collections.find((c) => c.id === classId)?.name ??
        MANAGE_VIEW_LABELS.classes;
      const before = cloneMembership(membership);
      try {
        const res = await removeStudentsFromClass(classId, ids);
        if (!res.success) {
          toast.error(res.error ?? CLASS_FOLDER_COPY.ACTION_FAILED);
          return;
        }
        const removedIds = res.removedIds ?? [];
        if (removedIds.length === 0) return;

        const next = cloneMembership(before);
        const src = new Set(next[classId] ?? []);
        for (const id of removedIds) src.delete(id);
        next[classId] = src;
        applyMembershipSnapshot(next);

        const undo = async () => {
          try {
            const re = await addStudentsToClass(classId, removedIds);
            if (!re.success) {
              toast.error(re.error ?? CLASS_FOLDER_COPY.UNDO_FAILED);
              return;
            }
            applyMembershipSnapshot(before);
            toast.success(CLASS_FOLDER_COPY.UNDO_DONE);
          } catch {
            toast.error(CLASS_FOLDER_COPY.UNDO_FAILED);
          }
        };
        toast.success(
          CLASS_FOLDER_COPY.REMOVED_TOAST(className, removedIds.length),
          {
            duration: UNDO_TOAST_DURATION,
            action: { label: CLASS_FOLDER_COPY.UNDO, onClick: () => void undo() },
          },
        );
      } catch {
        toast.error(CLASS_FOLDER_COPY.ACTION_FAILED);
      }
    },
    [
      activeFolder,
      resolveDragIds,
      collections,
      membership,
      applyMembershipSnapshot,
    ],
  );

  /** 이동 팝오버의 「다른 폴더 사본 유지」 안내용 — 학생이 속한 반 목록. */
  const getItemFolders = useCallback(
    (itemId: string) =>
      collections
        .filter((c) => membership[c.id]?.has(itemId))
        .map((c) => ({ id: c.id, name: c.name })),
    [collections, membership],
  );

  // ── 그리드 파생 ────────────────────────────────────────────────────────────
  const visibleStudents = folders.filterByActiveFolder(students);

  const classNamesByStudent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of collections) {
      const members = membership[c.id];
      if (!members) continue;
      for (const id of members) {
        const list = map.get(id);
        if (list) list.push(c.name);
        else map.set(id, [c.name]);
      }
    }
    return map;
  }, [collections, membership]);

  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* 폴더(반) 바 — question-bank-client 관용의 embedded 스티키 소비 */}
      <div className="sticky top-0 z-30 shrink-0 overflow-hidden rounded-t-2xl bg-white">
        <FolderSection
          embedded
          childFolders={folders.childFolders}
          activeFolder={folders.activeFolder}
          dragItemType="student"
          dragItemIdKey="studentId"
          itemCountLabel={CLASS_FOLDER_COPY.ITEM_LABEL}
          showNewFolder={folders.showNewFolder}
          newFolderName={folders.newFolderName}
          onNewFolderNameChange={folders.setNewFolderName}
          onShowNewFolder={folders.setShowNewFolder}
          onCreateFolder={() => void folders.handleCreateFolder()}
          onNavigateToFolder={handleNavigateToFolder}
          onRenameFolder={folders.handleRenameFolder}
          onDeleteFolder={folders.handleDeleteFolder}
          onDragToFolder={(itemId, folderId, copy) =>
            void handleDropToClass(itemId, folderId, copy)
          }
          onDragToRoot={(itemId) => void handleDragToRoot(itemId)}
          getItemFolders={getItemFolders}
          breadcrumbPath={folders.breadcrumbPath}
          onNavigateToRoot={handleNavigateToRoot}
          rootLabel={CLASS_FOLDER_COPY.ROOT_LABEL}
          enableFolderControls
          allFolders={folders.collections}
          storageKey="class-folders"
          treatRootAsFolder
          pageHeader={{
            icon: <UsersRound className="h-3.5 w-3.5" />,
            parentLabel: MANAGE_VIEW_LABELS.classes,
            title: CLASS_FOLDER_COPY.ROOT_LABEL,
            totalCount: students.length,
            itemLabel: CLASS_FOLDER_COPY.ITEM_LABEL,
            itemUnit: "명",
          }}
        />
      </div>

      <div className="min-w-0 px-4 pb-4 pt-3 sm:px-5">
        {collections.length === 0 ? (
          <TabEmpty
            icon={FolderKanban}
            title={EMPTY_STATES.CLASSES_VIEW.message}
            cta={
              <button
                type="button"
                onClick={() => folders.setShowNewFolder(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
              >
                {EMPTY_STATES.CLASSES_VIEW.ctaLabel}
              </button>
            }
            className="mb-4 py-12"
          />
        ) : (
          <p className="mb-2.5 text-[11.5px] font-medium text-slate-400">
            {CLASS_FOLDER_COPY.GRID_HINT}
          </p>
        )}

        {selectedIds.size > 0 ? (
          <div className="mb-2.5 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[12px] font-bold text-blue-700 tabular-nums">
              {CLASS_FOLDER_COPY.SELECTED_COUNT(selectedIds.size)}
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-[12px] font-semibold text-slate-400 transition-colors hover:text-slate-600"
            >
              {CLASS_FOLDER_COPY.CLEAR_SELECTION}
            </button>
          </div>
        ) : null}

        {students.length === 0 ? (
          <CardEmpty text={CLASS_FOLDER_COPY.ROSTER_EMPTY} />
        ) : visibleStudents.length === 0 ? (
          <CardEmpty text={CLASS_FOLDER_COPY.CLASS_EMPTY} />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleStudents.map((s) => (
              <StudentDragCard
                key={s.id}
                student={s}
                classNames={classNamesByStudent.get(s.id) ?? []}
                selected={selectedIds.has(s.id)}
                onToggle={() => toggleSelect(s.id)}
                getDragStudentIds={getDragStudentIds}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
