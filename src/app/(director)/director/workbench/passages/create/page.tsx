import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getAcademySchools,
  getWorkbenchPassages,
  getPassageCollections,
  getM1DraftCollections,
  getAcademyM1DraftCollectionMembership,
} from "@/actions/workbench";
import { PassageRegistrationClient } from "@/components/workbench/passage-registration-client";
import type { PassageRegistrationProps } from "@/components/workbench/passage-registration-client";

interface PageProps {
  searchParams: Promise<{
    draftIds?: string;
    passageIds?: string;
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

  const [schools, recentData, collections, draftCollections, draftMembership] =
    await Promise.all([
      getAcademySchools(staff.academyId),
      getWorkbenchPassages(staff.academyId, {
        limit: 20,
        page: 1,
        analyzedOnly: true,
      }),
      getPassageCollections(staff.academyId),
      getM1DraftCollections(staff.academyId),
      getAcademyM1DraftCollectionMembership(staff.academyId),
    ]);

  return (
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
  );
}
