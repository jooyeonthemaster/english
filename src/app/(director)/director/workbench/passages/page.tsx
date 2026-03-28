import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getWorkbenchPassages, getAcademySchools, getPassageCollections } from "@/actions/workbench";
import { prisma } from "@/lib/prisma";
import { PassageListClient } from "@/components/workbench/passage-list-client";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    schoolId?: string;
    grade?: string;
    semester?: string;
    publisher?: string;
    search?: string;
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
  };

  const [passagesData, schools, collections, collectionItems] = await Promise.all([
    getWorkbenchPassages(staff.academyId, filters),
    getAcademySchools(staff.academyId),
    getPassageCollections(staff.academyId),
    prisma.passageCollectionItem.findMany({
      where: { collection: { academyId: staff.academyId } },
      select: { collectionId: true, passageId: true },
    }),
  ]);

  // Build membership map: { collectionId: Set<passageId> }
  const membershipRaw: Record<string, string[]> = {};
  for (const item of collectionItems) {
    if (!membershipRaw[item.collectionId]) membershipRaw[item.collectionId] = [];
    membershipRaw[item.collectionId].push(item.passageId);
  }

  return (
    <PassageListClient
      passagesData={passagesData}
      schools={schools}
      filters={filters}
      collections={collections as any}
      collectionMembership={Object.fromEntries(
        Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)])
      )}
    />
  );
}
