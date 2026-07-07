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
import { LearningGenerationProvider } from "./learning-generation-context";
import { LearningListWithQueue } from "./learning-list-with-queue";

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
    // 하단 "학습지 목록"은 생성이 완료된 학습지(PRIME 분석 보고서가 있는 지문)만
    // 모으는 별도 관리(파일)창이다. 위쪽 "내 지문 선택 → 워크스페이스" 흐름에서
    // 학습지가 생성되면 이 목록에 쌓인다. hasReport 단독이 충분한 기준 —
    // analyzedOnly 를 함께 걸면 보고서는 있으나 PassageAnalysis 행이 없는(분석이
    // 보고서 JSON 안에만 있는) 학습지가 잘못 숨겨지므로 쓰지 않는다.
    hasReport: true,
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
    getPassageCollections(staff.academyId, { onlyWithReport: true }),
    getM1DraftCollections(staff.academyId),
    getAcademyM1DraftCollectionMembership(staff.academyId),
    getWorkbenchPassages(staff.academyId, effectiveListFilters),
    getAcademyPassageCollectionMembership(staff.academyId, {
      onlyWithReport: true,
    }),
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
    // 상단 워크스페이스(생성 큐 엔진)와 하단 학습지 목록이 진행중 항목을 공유하도록
    // 둘을 같은 컨텍스트로 감싼다 — 생성 시 하단 목록 상단에 로딩 큐가 뜬다.
    <LearningGenerationProvider>
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
          // ─── 학습지 목록 — /director/workbench/passages 페이지를 그대로 이식한
          //     별도 블록. 클라이언트가 PC 에서는 폼 아래에 그대로 쌓고, 모바일
          //     에서는 '학습지 확인' 스텝에서만 노출한다(문제 생성과 동일 구조). ───
          resultsSlot={
            <LearningListWithQueue
              academyId={staff.academyId}
              passagesData={listData}
              schools={schools}
              filters={effectiveListFilters}
              collections={collections as any}
              collectionMembership={Object.fromEntries(
                Object.entries(listMembershipRaw).map(([k, v]) => [
                  k,
                  new Set(v),
                ]),
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
              embedded
            />
          }
        />
      </div>
    </LearningGenerationProvider>
  );
}
