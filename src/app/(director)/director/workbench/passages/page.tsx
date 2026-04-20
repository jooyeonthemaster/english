import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getWorkbenchPassages,
  getAcademySchools,
  getPassageCollections,
  getSourceMaterialSummary,
  getPassageCollectionSummary,
  getAcademyPassageCollectionMembership,
} from "@/actions/workbench";
import { PassageListClient } from "@/components/workbench/passage-list-client";

interface PageProps {
  searchParams: Promise<{
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

export default async function PassagesPage({ searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;
  const filters = {
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
    filters.sourceMaterialId
      ? getSourceMaterialSummary(filters.sourceMaterialId)
      : Promise.resolve(null),
    filters.collectionId
      ? getPassageCollectionSummary(filters.collectionId)
      : Promise.resolve(null),
  ]);

  // If either deep-link id points outside this academy, drop it from the
  // query filter so we never push cross-tenant predicates to prisma.
  const effectiveFilters = {
    ...filters,
    sourceMaterialId: sourceMaterial ? filters.sourceMaterialId : undefined,
    collectionId: collectionSummary ? filters.collectionId : undefined,
  };

  const [passagesData, schools, collections, membershipRaw] = await Promise.all([
    getWorkbenchPassages(staff.academyId, effectiveFilters),
    getAcademySchools(staff.academyId),
    getPassageCollections(staff.academyId),
    getAcademyPassageCollectionMembership(staff.academyId),
  ]);

  // Derive a human-readable badge label for the pinned source material
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

  // Pre-select collection badge label — reuse the already-fetched collection
  // list so we don't need a second round-trip for just the label string.
  const activeCollection = effectiveFilters.collectionId
    ? collections.find((c) => c.id === effectiveFilters.collectionId) ?? null
    : null;

  return (
    <PassageListClient
      passagesData={passagesData}
      schools={schools}
      filters={effectiveFilters}
      collections={collections as any}
      collectionMembership={Object.fromEntries(
        Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)])
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
    />
  );
}
