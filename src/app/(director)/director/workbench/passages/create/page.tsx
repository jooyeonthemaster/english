import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getAcademySchools,
  getWorkbenchPassages,
  getPassageCollections,
  getM1DraftCollections,
  getAcademyM1DraftCollectionMembership,
  getSourceMaterialSummary,
  getPassageCollectionSummary,
  getAcademyPassageCollectionMembership,
} from "@/actions/workbench";
import { PassageRegistrationClient } from "@/components/workbench/passage-registration-client";
import type { PassageRegistrationProps } from "@/components/workbench/passage-registration-client";
import { PassageListClient } from "@/components/workbench/passage-list-client";

const PASSAGE_MANAGER_BASE_PATH = "/director/workbench/passages/create";

interface PageProps {
  searchParams: Promise<{
    draftIds?: string;
    passageIds?: string;
    // ── 하단 '지문 목록' 패널(PassageListClient) URL 필터 ──
    page?: string;
    schoolId?: string;
    grade?: string;
    semester?: string;
    publisher?: string;
    search?: string;
    sourceMaterialId?: string;
    collectionId?: string;
  }>;
}

function parseIdList(raw?: string | null): string[] {
  if (!raw) return [];
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of decoded.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 50) break;
  }
  return ids;
}

export default async function PassageRegistrationPage({
  searchParams,
}: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;
  const initialDraftIds = parseIdList(params.draftIds);
  const initialPassageIds = parseIdList(params.passageIds);

  // ── 하단 '지문 목록' 패널 필터 (standalone /passages 페이지와 동일 규칙) ──
  const listFilters = {
    page: params.page ? parseInt(params.page) : 1,
    schoolId: params.schoolId || undefined,
    grade: params.grade ? parseInt(params.grade) : undefined,
    semester: params.semester || undefined,
    publisher: params.publisher || undefined,
    search: params.search || undefined,
    sourceMaterialId: params.sourceMaterialId || undefined,
    collectionId: params.collectionId || undefined,
  };

  // Academy-scoped existence checks for both deep-link filters. Cross-tenant
  // ids silently fall through to `null` so they can't steer the filter query.
  const [sourceMaterial, collectionSummary] = await Promise.all([
    listFilters.sourceMaterialId
      ? getSourceMaterialSummary(listFilters.sourceMaterialId)
      : Promise.resolve(null),
    listFilters.collectionId
      ? getPassageCollectionSummary(listFilters.collectionId)
      : Promise.resolve(null),
  ]);

  const effectiveListFilters = {
    ...listFilters,
    sourceMaterialId: sourceMaterial ? listFilters.sourceMaterialId : undefined,
    collectionId: collectionSummary ? listFilters.collectionId : undefined,
    // Mirror the standalone 지문 관리 페이지: 분석 완료(+직접 입력) 지문만 보여준다.
    analyzedOnly: true,
    includeDirectInput: true,
  };

  const [
    schools,
    recentData,
    collections,
    draftCollections,
    draftMembership,
    listData,
    listMembershipRaw,
  ] = await Promise.all([
    getAcademySchools(staff.academyId),
    getWorkbenchPassages(staff.academyId, {
      limit: 20,
      page: 1,
      analyzedOnly: true,
    }),
    getPassageCollections(staff.academyId),
    getM1DraftCollections(staff.academyId),
    getAcademyM1DraftCollectionMembership(staff.academyId),
    getWorkbenchPassages(staff.academyId, effectiveListFilters),
    getAcademyPassageCollectionMembership(staff.academyId),
  ]);

  const sourceMaterialLabel = sourceMaterial
    ? [
        sourceMaterial.year ? `${sourceMaterial.year}` : null,
        sourceMaterial.round || null,
        sourceMaterial.examType || sourceMaterial.type,
        sourceMaterial.title,
      ]
        .filter(Boolean)
        .join("-")
    : null;

  const activeCollection = effectiveListFilters.collectionId
    ? collections.find((c) => c.id === effectiveListFilters.collectionId) ??
      null
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PassageRegistrationClient
        academyId={staff.academyId}
        schools={schools}
        recentPassages={recentData.passages}
        initialCollections={
          collections as PassageRegistrationProps["initialCollections"]
        }
        draftCollections={
          draftCollections as PassageRegistrationProps["draftCollections"]
        }
        draftMembership={draftMembership}
        initialDraftIds={initialDraftIds}
        initialPassageIds={initialPassageIds}
      />

      {/* ─── 지문 목록 — /director/workbench/passages 페이지를 그대로 이식한 별도 블록 ─── */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-700">지문 목록</h2>
        <PassageListClient
          academyId={staff.academyId}
          passagesData={listData}
          schools={schools}
          filters={effectiveListFilters}
          collections={collections as any}
          collectionMembership={Object.fromEntries(
            Object.entries(listMembershipRaw).map(([k, v]) => [k, new Set(v)]),
          )}
          sourceMaterialBadge={
            sourceMaterial && sourceMaterialLabel
              ? { id: sourceMaterial.id, label: sourceMaterialLabel }
              : null
          }
          collectionBadge={
            activeCollection
              ? { id: activeCollection.id, label: activeCollection.name }
              : null
          }
          basePath={PASSAGE_MANAGER_BASE_PATH}
        />
      </section>
    </div>
  );
}
