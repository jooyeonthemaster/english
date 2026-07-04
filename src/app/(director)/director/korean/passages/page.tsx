import type { Metadata } from "next";
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

export const metadata: Metadata = { title: "국어 지문 관리" };

// C1/C2 공유 계약 prop — C2 가 클라이언트 측 subjectScope 를 구현한다. 스프레드로
// 넘겨 C2 착륙 전에도 컴파일이 깨지지 않게 한다(런타임 전달은 동일).
const KOREAN_SCOPE = { subjectScope: "KOREAN" } as const;

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

/**
 * 국어 지문 관리 — 영어 workbench/passages 페이지의 국어 대칭 라우트.
 * 동일 클라이언트(PassageListClient)를 재사용하되:
 *  - 서버 페치는 subject: "KOREAN" 으로 좁힌다(영어 지문 완전 배제).
 *  - 영어 페이지의 hasReport(학습지 완성본만) 게이트는 걸지 않는다 — 국어 지문은
 *    PRIME 학습지 파이프라인을 타지 않으므로 걸면 전부 탈락한다.
 *  - 클라이언트에는 계약 prop subjectScope="KOREAN" 만 넘긴다.
 */
export default async function KoreanPassagesPage({ searchParams }: PageProps) {
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
    // 국어 스코프 — Passage.subject === "KOREAN" 만. (영어 페이지의 hasReport
    // 게이트는 국어에 해당 없음 — 위 doc comment 참고)
    subject: "KOREAN" as const,
  };

  const [passagesData, schools, collections, membershipRaw] = await Promise.all([
    getWorkbenchPassages(staff.academyId, effectiveFilters),
    getAcademySchools(staff.academyId),
    // 폴더 배지·멤버십은 영어 페이지와 동일 기준(담긴 지문 전체)으로 가져오되,
    // 폴더 자체는 국어 스코프(subject='KOREAN' 폴더만) — 영어 폴더와 완전 분리.
    getPassageCollections(staff.academyId, {
      onlyWithReport: false,
      subject: "KOREAN",
    }),
    getAcademyPassageCollectionMembership(staff.academyId, {
      onlyWithReport: false,
    }),
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
      academyId={staff.academyId}
      {...KOREAN_SCOPE}
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
