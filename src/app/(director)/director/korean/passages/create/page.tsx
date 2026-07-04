import type { Metadata } from "next";
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
// 컨텍스트(진행중 발행/구독)와 하단 목록 래퍼는 영어 create 라우트의 모듈을 그대로
// 재사용한다 — Provider/consumer 가 반드시 "같은" 모듈 인스턴스여야 React Context 가
// 연결되기 때문이다(PassageRegistrationClient 가 그 모듈의 publisher 를 import 한다).
import { LearningGenerationProvider } from "../../../workbench/passages/create/learning-generation-context";
import { LearningListWithQueue } from "../../../workbench/passages/create/learning-list-with-queue";

export const metadata: Metadata = { title: "국어 학습지 생성" };

// 국어 학습지 생성 라우트의 basePath — 하단 목록의 필터/페이지 이동이 영어 화면으로
// 튕기지 않고 이 국어 라우트에 머물게 한다.
const PASSAGE_MANAGER_BASE_PATH = "/director/korean/passages/create";

// C1/C2 공유 계약 prop — 클라이언트 측 subjectScope 를 실어 국어 라우트로 분기시킨다.
const KOREAN_SCOPE = { subjectScope: "KOREAN" } as const;

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

/**
 * 국어 학습지 생성 — 영어 workbench/passages/create 페이지의 국어 대칭 라우트.
 * 페이지 골격(상단 워크스페이스 + 하단 학습지 목록)을 1:1 미러하되:
 *  - 모든 지문/폴더 서버 페치를 subject:"KOREAN" 으로 좁힌다(영어 데이터 완전 배제).
 *  - 상단 클라이언트(PassageRegistrationClient)에 subjectScope="KOREAN" 을 넘겨
 *    변형 지문 생성이 Passage.subject="KOREAN" 으로 적재되게 한다.
 *  - 하단 목록(LearningListWithQueue → PassageListClient)에 국어 basePath 와
 *    subjectScope 를 넘겨 필터/폴더 생성·이동이 전부 국어 라우트에 머물게 한다.
 *  - 추출 드래프트 폴더(M1)는 과목 컬럼이 없는 인테이크 공용 자산이라 그대로 로드한다.
 */
export default async function KoreanPassageRegistrationPage({
  searchParams,
}: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;
  const initialDraftIds = parseIdList(params.draftIds);
  const initialPassageIds = parseIdList(params.passageIds);

  // ── 하단 '지문 목록' 패널 필터 (영어 create 페이지와 동일 규칙) ──
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
    // 모은다(영어와 동일). hasReport 단독이 충분한 기준.
    hasReport: true,
    // 국어 스코프 — Passage.subject === "KOREAN" 만.
    subject: "KOREAN" as const,
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
      subject: "KOREAN",
    }),
    getPassageCollections(staff.academyId, {
      onlyWithReport: true,
      subject: "KOREAN",
    }),
    // 추출 드래프트 폴더는 과목 컬럼이 없는 인테이크 공용 자산 — 영어와 동일 로드.
    getM1DraftCollections(staff.academyId),
    getAcademyM1DraftCollectionMembership(staff.academyId),
    getWorkbenchPassages(staff.academyId, effectiveListFilters),
    // 멤버십은 국어 폴더 id 만 하단 목록에서 참조되므로 academy 스코프 그대로 사용.
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
    // 둘을 같은 컨텍스트로 감싼다 — 영어 create 라우트의 Provider 를 그대로 재사용한다.
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
          {...KOREAN_SCOPE}
        />

        {/* ─── 학습지 목록 — 국어 스코프로 로드된 별도 블록 ─── */}
        <section className="flex flex-col gap-2">
          <LearningListWithQueue
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
            embedded
            {...KOREAN_SCOPE}
          />
        </section>
      </div>
    </LearningGenerationProvider>
  );
}
