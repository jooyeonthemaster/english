import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getM1DraftCollections,
  getAcademyM1DraftCollectionMembership,
} from "@/actions/workbench";
import type { DraftCollectionItem } from "@/components/workbench/passage-registration/types";
import { WebtoonPageClient } from "./webtoon-page-client";

export default async function WebtoonPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [draftCollections, draftMembership] = await Promise.all([
    getM1DraftCollections(staff.academyId),
    getAcademyM1DraftCollectionMembership(staff.academyId),
  ]);

  return (
    <WebtoonPageClient
      academyId={staff.academyId}
      draftCollections={draftCollections as DraftCollectionItem[]}
      draftMembership={draftMembership}
    />
  );
}
